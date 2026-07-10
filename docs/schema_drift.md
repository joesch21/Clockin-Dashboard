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
  overtimeMinutes: number;    // 0 for CSV imports, >0 when coming from live events
}
```

**Critical Fields**:
- `rawTimestamp` — used for sorting, filtering, and pairing. Must be milliseconds.
- `eventName` — must be exactly `"ClockIn"` or `"ClockOut"`.
- `employee` — must be lowercase wallet address.

**Dangerous Changes**:
- Changing `rawTimestamp` from ms to seconds
- Renaming `eventName` values
- Removing `overtimeMinutes` field

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

## Period Summary Assumptions
The pairing logic in `LogsView.jsx` assumes:
- Logs are sorted by `rawTimestamp` ascending per employee
- A `ClockIn` is always followed (eventually) by a `ClockOut`
- Multiple sessions per day are summed

## How to Update This Document
After any thread that changes data shape, parser logic, or storage format:
1. Update this file
2. Update `repo_status.json`
3. Update `architecture.md` if needed
4. Rebuild the zip

---

**Rule**: If you are unsure whether a change affects the schema, add it here. Better to over-document than cause silent data corruption for users.