# ClockIn Manager - Manager TimeClock Dashboard

A clean, modern React dashboard for tracking employee attendance using **explorer transaction export CSVs** (BscScan-family: BscScan, opBNBScan, etc).

## Features
- **CSV Import**: Upload a raw transaction export CSV from your chain's explorer. Automatically detects ClockIn (0x687473fb) and ClockOut (0xc0f5c77a) events.
- **Automatic Pairing & Calculations**: Worked minutes are calculated client-side by matching ClockIn → ClockOut pairs (supports multi-day / multi-session). Overtime is intentionally NOT read from the chain — it's cross-referenced against the roster separately, since the contract no longer accepts a self-reported overtime value.
- **Employee Mappings**: Map wallet addresses to friendly names (supports CSV import/export of mappings too).
- **Powerful Logs View**: Date range filters (Today / 7d / 30d / All), event type filter, employee search, sortable table, and CSV export of filtered results.
- **Period Summaries**: See total worked time per employee for any selected date range.
- **Reports**: Search a single employee by name or wallet and pull their full clock-in/out history with a CSV export.
- **Overview Dashboard**: Quick stats (today's clock-ins, recent activity).
- **Privacy**: Optional de-identification mode. All data stored locally in browser (localStorage) — no backend.
- **Re-import Safe**: Importing an updated CSV merges new records without duplicating existing ones.

## How to Use (Typical Workflow)

1. Go to your chain's explorer (e.g. [opBNB Testnet Explorer](https://opbnb-testnet.bscscan.com/)) → paste your contract address → **Transactions** tab → click **Export** (CSV).
2. In ClockIn Manager, click the prominent **Import CSV** button (top right or in Overview).
3. Select the downloaded CSV. New clock events are parsed, deduplicated, and added.
4. Add employee name mappings in the **Employee Mappings** page (or bulk import a `wallet,name` CSV).
5. View beautiful logs + summaries in **Attendance Logs**, or search a single employee in **Reports**. Export filtered reports anytime.
6. Re-import updated CSVs whenever you want — it safely appends only new records.

**Note on Data**:
- From CSV we only get timestamp + employee wallet. `overtimeMinutes` is always `0` from the parser — overtime is reconciled against the roster outside the app, not read from the chain.
- Worked time is computed by pairing events in the browser (very accurate for reporting).
- The contract validates GPS coordinates against a fixed 500m worksite geofence on-chain, but that raw lat/lng isn't currently surfaced in the CSV export pipeline (the explorer's transaction CSV doesn't include event/log data — only the method selector and basic tx fields).

## Getting Started (Development)

```bash
cd clockin-dashboard
npm install
npm run dev
```

Open http://localhost:5173

## Production Build

```bash
npm run build
# Then serve the `dist/` folder with any static host (Vercel, Netlify, Cloudflare Pages, etc.)
```

## Tech Stack
- React 18 + Vite
- Tailwind CSS + lucide-react icons
- React Router v6
- PapaParse (CSV) + file-saver
- date-fns (date handling)
- All state persisted in localStorage

## Contract Details (for reference)
- Chain: **opBNB Testnet** (chain ID 5611)
- Contract: `0x4654675c8C068aC49047e9E607C34BE2492c945e`
- ClockIn selector: `0x687473fb`
- ClockOut selector: `0xc0f5c77a` *(changed from `0x6b92bb2a` — the redeployed contract dropped the `overtimeMinutes` parameter from `clockOut()`, which changes its 4-byte selector)*
- Geofence: fixed worksite at `-33.932101, 151.165226`, 500m radius, enforced on-chain
- Explorer API base: `https://api-opbnb-testnet.bscscan.com/api`

## License
MIT — feel free to adapt for your team.

Built with ❤️ for managers who need simple, auditable attendance tracking.
