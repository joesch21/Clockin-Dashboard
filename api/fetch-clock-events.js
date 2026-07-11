// api/fetch-clock-events.js
//
// Vercel Serverless Function. Two callers hit this same endpoint:
//   1. Vercel Cron (daily) — authenticated via the auto-injected CRON_SECRET header
//   2. The manager's "Refresh Now" button in the dashboard — authenticated via
//      a lightweight shared token (MANAGER_REFRESH_TOKEN)
//
// It talks to the opBNB testnet explorer API directly (server-side only, so the
// API key never reaches the browser), decodes ClockIn/ClockOut calldata, and
// returns Log[] objects matching the exact shape in schema_drift.md.
//
// ASSUMPTIONS TO VERIFY AGAINST YOUR ACTUAL EmployeeClock.sol:
//   - clockIn(int256 latitude, int256 longitude)
//   - clockOut(int256 latitude, int256 longitude)   <- selector 0xc0f5c77a
//   - lat/lng are scaled the same way your CSV parser already expects
// If your real signatures differ, decodeFunctionData will throw — check the
// logs and adjust the ABI fragments below before trusting this in production.

import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x4654675c8C068aC49047e9E607C34BE2492c945e';
const EXPLORER_API = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 5611; // opBNB Testnet
const CLOCKIN_SELECTOR = '0x687473fb';
const CLOCKOUT_SELECTOR = '0xc0f5c77a';

const iface = new ethers.Interface([
  'function clockIn(int256 latitude, int256 longitude)',
  'function clockOut(int256 latitude, int256 longitude)',
]);

function toHumanTimestamp(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date).replace(',', ',');
}

export default async function handler(req, res) {
  const cronOk = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const manualOk =
    !!process.env.VITE_MANAGER_REFRESH_TOKEN &&
    req.headers['x-manual-refresh'] === process.env.VITE_MANAGER_REFRESH_TOKEN;

  if (!cronOk && !manualOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.opBNB_TESTNET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'opBNB_TESTNET_API_KEY not configured' });
  }

  try {
    const url = `${EXPLORER_API}?chainid=${CHAIN_ID}&module=account&action=txlist&address=${CONTRACT_ADDRESS}&sort=asc&apikey=${apiKey}`;
    const explorerRes = await fetch(url);
    const data = await explorerRes.json();

    if (data.status !== '1' && data.message !== 'No transactions found') {
      return res.status(502).json({ error: 'Explorer API error', detail: data.message });
    }

    const rows = data.result || [];
    const logs = [];
    let skipped = 0;

    for (const tx of rows) {
      if (tx.isError !== '0') { skipped++; continue; }

      const isClockIn = tx.input.startsWith(CLOCKIN_SELECTOR);
      const isClockOut = tx.input.startsWith(CLOCKOUT_SELECTOR);
      if (!isClockIn && !isClockOut) { skipped++; continue; }

      let latitude = '0';
      let longitude = '0';
      try {
        const fnName = isClockIn ? 'clockIn' : 'clockOut';
        const decoded = iface.decodeFunctionData(fnName, tx.input);
        latitude = decoded.latitude.toString();
        longitude = decoded.longitude.toString();
      } catch (decodeErr) {
        // Selector matched but decode failed — signature mismatch. Keep the
        // log (timestamps/dedup still valid) but flag lat/lng as unknown.
        latitude = 'DECODE_ERROR';
        longitude = 'DECODE_ERROR';
      }

      const rawTimestamp = Number(tx.timeStamp) * 1000;

      logs.push({
        eventName: isClockIn ? 'ClockIn' : 'ClockOut',
        employee: tx.from.toLowerCase(),
        timestamp: toHumanTimestamp(Number(tx.timeStamp)),
        rawTimestamp,
        latitude,
        longitude,
        overtimeMinutes: 0,
      });
    }

    return res.status(200).json({
      logs,
      imported: logs.length,
      skipped,
      totalRows: rows.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
}