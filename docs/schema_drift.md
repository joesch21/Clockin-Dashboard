# Schema Drift Protection

This document protects the project against breaking changes when context resets between long-running threads.

## Log Object Shape (clockinLogs)

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
