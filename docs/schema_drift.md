# Schema Drift Protection

This document protects the project against breaking changes when context resets between long-running threads.

## Log Object Shape (clockinLogs)

**Two sources now populate this array (as of 2026-07-11):**
1. `importBscScanCsv(file, existingLogs)` — manual CSV import, `latitude`/`longitude` always `"0"` (explorer CSV export has no decoded calldata)
2. `/api/fetch-clock-events` (Vercel serverless function) — live chain fetch, decodes real `latitude`/`longitude` from calldata via ethers `Interface`. Triggered by daily Vercel Cron or the manager's "Refresh Now" button (`src/utils/fetchLiveEvents.js`). Both sources merge into the same `clockinLogs` array using the identical dedup key below, so importing a CSV and live-fetching the same events is safe and won't duplicate.

```ts
interface Log {
  eventName: 'ClockIn' | 'ClockOut';
  employee: string;           // lowercase wallet address
  timestamp: string;          // Human readable: "10 Jul 2026, 5:32:45 PM"
  rawTimestamp: number;       // Unix timestamp in milliseconds
  latitude: string;
  longitude: string;
  overtimeMinutes: number;    // Always 0 as of the opBNB redeploy (2026-07-11) —
                              // see note below.
}
```

**Critical Fields**:
- `rawTimestamp` — used for sorting, filtering, and pairing. Must be milliseconds.
- `eventName` — must be exactly `"ClockIn"` or `"ClockOut"`.
- `employee` — must be lowercase wallet address.

**overtimeMinutes note (updated 2026-07-11)**: Previously this was `0` for CSV imports only, with the idea that a future "live events" path might populate it from the contract's `overtimeMinutes` param. That param has since been **removed from the contract entirely** — `clockOut()` no longer accepts or emits it. This field is now always `0` from every source, full stop. Overtime is calculated by pairing logic in `LogsView.jsx` / `sessionPairing.js` from worked duration, and any actual overtime approval happens outside this app via roster cross-reference. Don't reintroduce a "trust the chain's overtime value" code path without re-adding it to the contract first.

**Dangerous Changes**:
- Changing `rawTimestamp` from ms to seconds
- Renaming `eventName` values
- Removing `overtimeMinutes` field (even though it's always 0, downstream code still reads it)

## Mapping Object Shape (walletMappings)

```ts
interface Mapping {
  wallet: string;   // lowercase
  name: string;
}
```

## Deduplication Key
```ts
const key = `${employee.toLowerCase()}-${rawTimestamp}-${eventName}`;
```

Any change to how this key is generated will cause duplicate records on re-import.

## localStorage Keys
- `walletMappings`
- `clockinLogs`

**Never** change these keys without providing a migration path.

## Import Parser Contract
The function `importBscScanCsv(file, existingLogs)` must always return:
```ts
{
  logs: Log[],
  imported: number,
  skipped: number,
  totalRows: number,
  skipBreakdown?: Record<string, number>
}
```

**Method selectors (updated 2026-07-11, opBNB redeploy)**:
- `ClockIn`: `0x687473fb` (unchanged — signature `clockIn(int256,int256)` didn't change)
- `ClockOut`: `0xc0f5c77a` (changed from `0x6b92bb2a` — `clockOut()` dropped its `overtimeMinutes` parameter, which changes the 4-byte selector)

If you ever see `ClockOut` events failing to parse after a contract redeploy, recompute the selector — don't assume it stays the same just because the function name didn't change.

## Period Summary Assumptions
The pairing logic in `LogsView.jsx` assumes:
- Logs are sorted by `rawTimestamp` ascending per employee
- A `ClockIn` is always followed (eventually) by a `ClockOut`
- Multiple sessions per day are summed
- `overtimeMinutes` on any individual log is always `0` and is not a signal to sum — worked duration is derived purely from `rawTimestamp` differences between paired events

## Explorer API Migration (critical — updated 2026-07-11)

The BscScan-family V1 explorer API (`api-opbnb-testnet.bscscan.com/api`) that `importBscScanCsv.js`'s CSV export and the original `fetch-daily-csv.js` script were built against **has been fully deprecated** and returns a hard error on every call: `"You are using a deprecated V1 endpoint, switch to Etherscan API V2"`.

`api/fetch-clock-events.js` has been migrated to the replacement:
- **Base URL**: `https://api.etherscan.io/v2/api` (same for every chain — no more per-chain subdomains)
- **Required param**: `chainid=5611` for opBNB Testnet (was previously implicit in the subdomain)
- **API key**: must be generated from an actual **etherscan.io** account (Account → API Keys). Keys generated from the opBNB-specific BscScan portal are **rejected** by V2 with `"Invalid API Key (#err2)"` even though they look like they should work — this cost significant debugging time, don't reintroduce a BscScan-portal-issued key here.
- The manager-facing CSV export/import path is unaffected by this — managers still export CSVs directly from the opBNB block explorer website UI, which is a different code path from this API.

If you're reading this in a future thread and live fetch starts failing with `NOTOK` / 502 errors, check `data.result` (not `data.message`) in the explorer response first — that's where Etherscan puts the actual reason (e.g. `"Missing/Invalid API Key"`), and the code as of 2026-07-11 already surfaces this in the `detail` field of the 502 response.

## Shift Cooldown (app-side, not schema, but related)
`src/utils/shiftCooldown.js` enforces a **9-hour** minimum gap between a wallet's clock-ins, computed from `logs` in memory/localStorage — not from the contract. This is a UX guard only; it doesn't change the Log shape but depends on `rawTimestamp` being accurate and in milliseconds.

## How to Update This Document
After any thread that changes data shape, parser logic, contract selectors, or storage format:
1. Update this file
2. Update `repo_status.json`
3. Update `architecture.md` if needed
4. Rebuild the zip

---

**Rule**: If you are unsure whether a change affects the schema, add it here. Better to over-document than cause silent data corruption for users.
