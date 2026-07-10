# ClockIn Manager - Architecture

## Overview
ClockIn Manager is a lightweight, browser-only manager dashboard for tracking employee clock-in and clock-out events using data exported from BscScan.

It is designed to be:
- Simple to run (no backend)
- Reliable with real on-chain data via CSV
- Easy to maintain across long-running development threads

## Core Philosophy
- **Data Source**: Raw BscScan transaction export CSV is the single source of truth.
- **No Live Blockchain**: We no longer rely on unreliable free BscScan API endpoints.
- **Client-side Intelligence**: Pairing logic, worked time calculation, and summaries happen in the browser.
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

## Data Flow (CSV Import)

```
BscScan CSV Export
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
