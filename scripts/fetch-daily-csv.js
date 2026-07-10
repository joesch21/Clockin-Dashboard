#!/usr/bin/env node
/**
 * fetch-daily-csv.js
 *
 * Pulls all transactions for the ClockIn contract from opBNB Testnet's
 * free public explorer API and writes them to a CSV file in the exact
 * column shape that importBscScanCsv.js already expects (i.e. what
 * "Export CSV" on a BscScan-family explorer produces). Run this once
 * a day via cron / Task Scheduler and then import the resulting file
 * the same way you would a manual export.
 *
 * Setup:
 *   1. Get a free API key: https://opbnb-testnet.bscscan.com/register -> "API Keys"
 *   2. npm install node-fetch   (skip if on Node 18+, fetch is built in)
 *   3. Set opBNB_TESTNET_API_KEY as an env var, or paste it below.
 *   4. node fetch-daily-csv.js
 *
 * Schedule it:
 *   macOS/Linux (crontab -e):
 *     0 6 * * * cd /path/to/project && /usr/bin/node scripts/fetch-daily-csv.js >> logs/fetch.log 2>&1
 *
 *   Windows (Task Scheduler):
 *     Program: node.exe
 *     Arguments: C:\path\to\project\scripts\fetch-daily-csv.js
 *     Trigger: Daily at whatever time you like
 */

const fs = require('fs');
const path = require('path');

// ---- Config ----
const CONTRACT_ADDRESS = '0x4654675c8C068aC49047e9E607C34BE2492c945e';
const API_KEY = process.env.opBNB_TESTNET_API_KEY || 'PASTE_YOUR_FREE_API_KEY_HERE';
const API_BASE_URL = 'https://api-opbnb-testnet.bscscan.com/api'; // opBNB Testnet explorer API
const OUTPUT_DIR = path.join(__dirname, '..', 'incoming'); // adjust to wherever you want the file to land
const OUTPUT_FILE = path.join(OUTPUT_DIR, `export-${CONTRACT_ADDRESS}-latest.csv`);

// BscScan's own CSV export column order (matches what importBscScanCsv.js parses)
const CSV_HEADER = [
  'Transaction Hash', 'Blockno', 'UnixTimestamp', 'DateTime (UTC)',
  'From', 'To', 'ContractAddress', 'Value_IN(BNB)', 'Value_OUT(BNB)',
  'CurrentValue', 'TxnFee(BNB)', 'TxnFee(USD)', 'Historical $Price/BNB',
  'Status', 'ErrCode', 'Method',
];

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function toCsvRow(tx) {
  const bnb = (wei) => (Number(wei) / 1e18).toString();
  const txnFeeBnb = (Number(tx.gasUsed) * Number(tx.gasPrice)) / 1e18;
  const isFrom = tx.value !== '0'; // not used for direction, kept for clarity
  const dateTimeUtc = new Date(Number(tx.timeStamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const method = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : '';

  return [
    tx.hash,
    tx.blockNumber,
    tx.timeStamp,
    dateTimeUtc,
    tx.from,
    tx.to,
    '', // ContractAddress column stays blank for normal txns, matching BscScan's own export
    bnb(tx.value),
    '0',
    '-',
    txnFeeBnb.toString(),
    '-',
    '-',
    tx.isError === '1' ? 'Fail' : '',
    tx.txreceipt_status === '0' ? '1' : '',
    method,
  ].map(csvEscape).join(',');
}

async function fetchAllTransactions() {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'txlist');
  url.searchParams.set('address', CONTRACT_ADDRESS);
  url.searchParams.set('startblock', '0');
  url.searchParams.set('endblock', '99999999');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('apikey', API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== '1' && data.message !== 'No transactions found') {
    throw new Error(`BscScan API error: ${data.message} - ${data.result}`);
  }

  return Array.isArray(data.result) ? data.result : [];
}

async function main() {
  if (!API_KEY || API_KEY === 'PASTE_YOUR_FREE_API_KEY_HERE') {
    console.error('Set opBNB_TESTNET_API_KEY (env var) or edit API_KEY in this script before running.');
    process.exit(1);
  }

  console.log(`Fetching transactions for ${CONTRACT_ADDRESS}...`);
  const txs = await fetchAllTransactions();
  console.log(`Fetched ${txs.length} transactions.`);

  const rows = [CSV_HEADER.map(csvEscape).join(','), ...txs.map(toCsvRow)];

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, rows.join('\n'), 'utf8');

  console.log(`Wrote ${txs.length} rows to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('Failed to fetch/write CSV:', err);
  process.exit(1);
});
