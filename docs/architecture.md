# ClockIn Manager - Architecture

## Overview
ClockIn Manager is a lightweight, browser-only manager dashboard for tracking employee clock-in and clock-out events using data exported from BscScan.

It is designed to be:
- Simple to run (no backend)
- Reliable with real on-chain data via CSV
- Easy to maintain across long-running development threads

## Core Philosophy
- **Data Source**: Two independent sources feed `clockinLogs`: (1) manual CSV import (BscScan-family export, unchanged), and (2) live on-chain fetch via `/api/fetch-clock-events`, added 2026-07-11.
- **Chain**: Deployed on **opBNB Testnet** (chain ID 5611) as of 2026-07-11, migrated from BSC Testnet for cheaper gas and a compatible free explorer API.
- **Live Fetch (added 2026-07-11)**: `/api/fetch-clock-events` is a Vercel Serverless Function, called by (a) a daily Vercel Cron job (`vercel.json`) and (b) the manager's "Refresh Now" button (`src/utils/fetchLiveEvents.js`). Both merge results into `clockinLogs` via the same dedup key as CSV import, so the two sources never conflict. This function queries the **Etherscan V2 API** (`https://api.etherscan.io/v2/api?chainid=5611`) — the original BscScan-family V1 endpoint this project assumed was deprecated mid-project; see `schema_drift.md` for the full migration note and a hard warning against reusing old opBNB/BscScan-portal API keys, which V2 rejects.
- **Client-side Intelligence**: Pairing logic and worked time calculation happen in the browser. Overtime is NOT read from the chain — `clockOut()` no longer accepts an overtime parameter, so it's always `0` from imports and must be cross-referenced against the roster separately.
- **Local Persistence**: All data lives in `localStorage` so it survives page reloads.

## Tech Stack
| Layer          | Technology                  | Purpose                          |
|----------------|-----------------------------|----------------------------------|
| Framework      | React 18 + Vite             | UI + fast dev server             |
| Routing        | React Router v6              | Overview / Mappings / Logs / Reports |
| Styling        | Tailwind CSS                | Modern, clean manager UI         |
| CSV Parsing    | PapaParse                   | Robust import of BscScan exports |
| File Export    | file-saver                  | Download filtered logs/mappings/reports |
| Dates          | date-fns                    | Date filtering & formatting      |
| Icons          | lucide-react                | Consistent iconography           |
| Storage        | localStorage                | `walletMappings` + `clockinLogs` |

## Key Components

### 1. App.jsx (Root + Context)
- Provides global state via React Context
- Loads mappings + logs from localStorage on mount
- Handles CSV import orchestration
- Manages notifications and de-identification toggle
- Routes: `/` (Overview), `/mappings` (WalletMapping), `/logs` (LogsView), `/reports` (Reports)

### 2. Overview.jsx
- Dashboard with key stats (employees, today's activity, overtime)
- Quick actions + Recent Activity feed
- Entry point for importing BscScan CSV

### 3. LogsView.jsx
- Main working view for managers
- Powerful filtering (date range, event type, employee search)
- Sortable table + CSV export
- **Period Summary** table (most important business logic)

### 4. WalletMapping.jsx
- CRUD for wallet → employee name mappings
- Supports CSV import/export of mappings
- Used by `getDisplayName()` across the app

### 5. Reports.jsx (new)
- Single-employee lookup: search by wallet address or mapped display name
- Optional date range filter (`dateFrom` / `dateTo`)
- For each match, renders a card with:
  - Total worked time and total overtime across the filtered range
  - Current status ("Currently clocked in" vs "Off shift")
  - A session-by-session table of paired ClockIn → ClockOut events with duration, overtime, and status (`Completed` / `Still Clocked In` / `Incomplete` / `Orphan ClockOut`)
  - CSV export of that employee's session history via `file-saver`
- Pairing logic lives in `src/utils/sessionPairing.js` (`buildSessionsByEmployee`), following the same ClockIn→ClockOut contract as the Period Summary in `LogsView.jsx`.
  - **Known duplication**: `LogsView.jsx`'s Period Summary currently has its own inline copy of this pairing logic. A future pass should point both at the shared `sessionPairing.js` util so there's one source of truth for pairing rules.

### 6. api/fetch-clock-events.js (new, 2026-07-11)
- Vercel Serverless Function, not part of the Vite-built frontend bundle
- Two authenticated callers: Vercel Cron (daily, via `vercel.json`, auth via auto-injected `CRON_SECRET`) and the manager's "Refresh Now" button (auth via shared `VITE_MANAGER_REFRESH_TOKEN`)
- Queries Etherscan V2 API (`chainid=5611`), decodes `ClockIn`/`ClockOut` calldata via ethers `Interface`, returns `Log[]` objects directly — no CSV round-trip
- `opBNB_TESTNET_API_KEY` (server-only, no `VITE_` prefix) must be an **etherscan.io**-issued key; opBNB/BscScan-portal keys are rejected — see `schema_drift.md`
- Client merge logic lives in `src/utils/fetchLiveEvents.js`, dedupes against existing `clockinLogs` via the standard key before handing off to `App.jsx`'s `refreshLiveEvents()`, which persists via the existing logs-persistence effect

## Smart Contract (EmployeeClock.sol) — redeployed 2026-07-11
- **Chain**: opBNB Testnet (5611)
- **Address**: `0x4654675c8C068aC49047e9E607C34BE2492c945e`
- **Changes from the original BSC Testnet version**:
  - `clockIn`/`clockOut` now validate GPS against a fixed 500m geofence around `-33.932101, 151.165226`, replacing the old (buggy) `latitude != 0 && longitude != 0` check.
  - `clockOut()` no longer accepts an `overtimeMinutes` parameter — overtime is not tracked on-chain at all anymore. This **changed its function selector** from `0x6b92bb2a` to `0xc0f5c77a`. `importBscScanCsv.js` and `scripts/fetch-daily-csv.js` were updated accordingly.
  - `ClockEvent` struct packed into a single storage slot (`uint40` timestamp, `int32` lat/lng) instead of 3× `uint256`/`int256`, cutting SSTORE cost since workers still pay their own gas.
  - The 9-hour "one shift per rolling window" cooldown is enforced **app-side** (`src/utils/shiftCooldown.js`), not in the contract — a direct contract call can bypass it. This was a deliberate tradeoff, not an oversight.

## Data Flow (CSV Import)

```
Explorer CSV Export (BscScan-family)
        ↓
importBscScanCsv.js (parser)
        ↓
- Filter by contract address
- Detect ClockIn/ClockOut via Method column (0x687473fb / 0x6b92bb2a)
- Filter successful transactions only
- Deduplicate against existing logs
        ↓
Merge into React state + localStorage
        ↓
Re-render Overview + LogsView + Period Summary + Reports
```

## Period Summary Logic (Critical)
Located in `LogsView.jsx` (and duplicated in `src/utils/sessionPairing.js` for `Reports.jsx`):

- Groups all logs by employee wallet across the selected date range
- Sorts logs chronologically per employee
- Walks through events and pairs `ClockIn` → next `ClockOut`
- Calculates:
  - `totalWorkedMinutes`
  - `totalOvertime` (from on-chain field when available)
  - `sessions`
  - Current status ("Still Clocked In" vs "Completed")

This logic runs entirely client-side and works on both demo data and real imported CSV data.

## Storage Keys
- `walletMappings` → Array of `{ wallet, name }`
- `clockinLogs` → Array of log objects

**Warning**: Changing the shape of these objects without updating `schema_drift.md` and migration logic can cause data loss for users.

## Future Considerations
- Ability to calculate session duration on individual rows (currently only in summary)
- Optional "Clear All Data" button
- Support for multiple contracts
- Dark mode / mobile improvements
- De-duplicate pairing logic between `LogsView.jsx` and `sessionPairing.js`

---

*This document should be updated whenever major architectural decisions change.*
