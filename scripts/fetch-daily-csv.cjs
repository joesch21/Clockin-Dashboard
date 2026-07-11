#!/usr/bin/env node
/**
 * fetch-daily-csv.cjs  (v3 — hardened)
 *
 * Reads ClockIn/ClockOut events directly from the chain via eth_getLogs
 * and writes them to a CSV in the shape importBscScanCsv.js expects,
 * with real latitude/longitude/timestamp from the decoded event args.
 *
 * .cjs extension is deliberate: forces CommonJS regardless of whether
 * your package.json has "type": "module" set (Vite projects often do).
 * `require()` below would otherwise crash under ESM.
 *
 * Setup:
 *   1. Get an opBNB TESTNET RPC endpoint (double-check "testnet" in the host):
 *      https://opbnb-testnet.nodereal.io/v1/<your-key>
 *   2. npm install ethers
 *   3. Set OPBNB_TESTNET_RPC_URL as an env var (full URL including your key).
 *   4. node scripts/fetch-daily-csv.cjs
 *
 * Optional env vars:
 *   DEPLOYMENT_BLOCK   - block the contract was deployed at (first-run start point)
 *   BLOCK_CHUNK_SIZE    - eth_getLogs range per call (default 2000)
 *   MAX_RETRIES         - retry attempts per chunk before giving up (default 3)
 *
 * Schedule via cron / Task Scheduler, once a day.
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// ---- Config ----
const CONTRACT_ADDRESS = '0x4654675c8C068aC49047e9E607C34BE2492c945e';
const RPC_URL = process.env.OPBNB_TESTNET_RPC_URL || 'PASTE_YOUR_NODEREAL_TESTNET_URL_HERE';
const OUTPUT_DIR = path.join(__dirname, '..', 'incoming');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `export-${CONTRACT_ADDRESS}-latest.csv`);
const SYNC_STATE_FILE = path.join(__dirname, '.fetch-sync-state.json');

const DEPLOYMENT_BLOCK = Number(process.env.DEPLOYMENT_BLOCK || 0);
const BLOCK_CHUNK_SIZE = Number(process.env.BLOCK_CHUNK_SIZE || 2000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const EXPECTED_CHAIN_ID = 5611; // opBNB Testnet

const CLOCKIN_SELECTOR = '0x687473fb';
const CLOCKOUT_SELECTOR = '0xc0f5c77a';

const ABI = [
  'event ClockIn(address indexed employee, uint256 timestamp, int256 latitude, int256 longitude)',
  'event ClockOut(address indexed employee, uint256 timestamp, int256 latitude, int256 longitude)',
];

const CSV_HEADER = [
  'Transaction Hash', 'Blockno', 'UnixTimestamp', 'DateTime (UTC)',
  'From', 'To', 'ContractAddress', 'Status', 'ErrCode', 'Method',
  'Latitude', 'Longitude',
];

// ---- Small utilities ----

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries an async function with exponential backoff (1s, 2s, 4s, ...). */
async function withRetry(fn, description) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const waitMs = 2 ** (attempt - 1) * 1000;
      console.warn(`  ⚠️  ${description} failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }
  throw new Error(`${description} failed after ${MAX_RETRIES} attempts: ${lastErr.message}`);
}

// ---- Sync state (crash-resilient: saved after every chunk, not just at the end) ----

function loadSyncState() {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
  } catch {
    return { lastSyncedBlock: DEPLOYMENT_BLOCK - 1 };
  }
}

function saveSyncState(lastSyncedBlock) {
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify({ lastSyncedBlock }, null, 2));
}

// ---- CSV output (append-only, incremental) ----

function ensureCsvFileWithHeader() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(OUTPUT_FILE)) {
    fs.writeFileSync(OUTPUT_FILE, CSV_HEADER.map(csvEscape).join(',') + '\n');
  }
}

function appendRowsToCsv(rows) {
  if (rows.length === 0) return;
  fs.appendFileSync(OUTPUT_FILE, rows.join('\n') + '\n');
}

function eventToCsvRow(event) {
  const isClockIn = event.eventName === 'ClockIn';
  const { employee, timestamp, latitude, longitude } = event.args;
  const unix = Number(timestamp);
  const dateTimeUtc = new Date(unix * 1000).toISOString().slice(0, 19).replace('T', ' ');

  return [
    event.transactionHash,
    event.blockNumber,
    unix,
    dateTimeUtc,
    employee.toLowerCase(),
    CONTRACT_ADDRESS.toLowerCase(),
    '',
    '', // Status blank = success (event only exists if the tx succeeded)
    '',
    isClockIn ? CLOCKIN_SELECTOR : CLOCKOUT_SELECTOR,
    latitude.toString(),
    longitude.toString(),
  ].map(csvEscape).join(',');
}

// ---- Chain interaction ----

function validateConfig() {
  if (!RPC_URL || RPC_URL === 'PASTE_YOUR_NODEREAL_TESTNET_URL_HERE') {
    throw new Error('Set OPBNB_TESTNET_RPC_URL (env var) or edit RPC_URL in this script before running.');
  }
  if (RPC_URL.includes('mainnet')) {
    throw new Error('RPC_URL looks like a MAINNET endpoint. This contract is on opBNB Testnet (chain 5611). Double-check the host.');
  }
}

async function connect() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await withRetry(() => provider.getNetwork(), 'getNetwork()');

  if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
    throw new Error(`Connected chain ID is ${network.chainId}, expected ${EXPECTED_CHAIN_ID} (opBNB Testnet).`);
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  return { provider, contract };
}

/**
 * Fetches events chunk-by-chunk, writing CSV rows and saving sync state
 * after EVERY chunk — so a mid-run failure only loses the current
 * in-flight chunk's progress, not the whole run.
 */
async function syncChunked(contract, fromBlock, toBlock) {
  let totalEvents = 0;

  for (let start = fromBlock; start <= toBlock; start += BLOCK_CHUNK_SIZE) {
    const end = Math.min(start + BLOCK_CHUNK_SIZE - 1, toBlock);

    const [clockIns, clockOuts] = await withRetry(
      () => Promise.all([
        contract.queryFilter(contract.filters.ClockIn(), start, end),
        contract.queryFilter(contract.filters.ClockOut(), start, end),
      ]),
      `eth_getLogs for blocks ${start}-${end}`
    );

    const events = [...clockIns, ...clockOuts]
      .map((log) => ({
        eventName: log.fragment.name,
        args: log.args,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      }))
      .sort((a, b) => a.blockNumber - b.blockNumber);

    appendRowsToCsv(events.map(eventToCsvRow));
    saveSyncState(end); // persisted per-chunk, not just at the very end

    totalEvents += events.length;
    console.log(`  blocks ${start}-${end}: ${clockIns.length} ClockIn, ${clockOuts.length} ClockOut (synced ✅)`);
  }

  return totalEvents;
}

// ---- Entry point ----

async function main() {
  validateConfig();
  ensureCsvFileWithHeader();

  const { provider, contract } = await connect();

  const state = loadSyncState();
  const fromBlock = state.lastSyncedBlock + 1;
  const toBlock = await withRetry(() => provider.getBlockNumber(), 'getBlockNumber()');

  if (fromBlock > toBlock) {
    console.log('Already up to date, nothing new to fetch.');
    return;
  }

  console.log(`Fetching ClockIn/ClockOut events from block ${fromBlock} to ${toBlock}...`);
  const totalEvents = await syncChunked(contract, fromBlock, toBlock);

  console.log(`Done. Wrote ${totalEvents} new events. Synced up to block ${toBlock}.`);
}

main().catch((err) => {
  console.error('❌ Fetch failed:', err.message);
  process.exit(1);
});
