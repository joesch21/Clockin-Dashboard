# ClockIn Manager - Manager TimeClock Dashboard

A clean, modern React dashboard for tracking employee attendance using **BscScan transaction export CSVs**.

## Features
- **CSV Import from BscScan**: Upload raw transaction export CSV from BscScan. Automatically detects ClockIn (0x687473fb) and ClockOut (0x6b92bb2a) events.
- **Automatic Pairing & Calculations**: Worked minutes and overtime are calculated client-side by matching ClockIn → ClockOut pairs (supports multi-day / multi-session).
- **Employee Mappings**: Map wallet addresses to friendly names (supports CSV import/export of mappings too).
- **Powerful Logs View**: Date range filters (Today / 7d / 30d / All), event type filter, employee search, sortable table, and CSV export of filtered results.
- **Period Summaries**: See total worked time + overtime per employee for any selected date range.
- **Overview Dashboard**: Quick stats (today's clock-ins, overtime, recent activity).
- **Privacy**: Optional de-identification mode. All data stored locally in browser (localStorage) — no backend.
- **Re-import Safe**: Importing an updated CSV merges new records without duplicating existing ones.

## How to Use (Typical Workflow)

1. Go to [BscScan Testnet](https://testnet.bscscan.com/) (or mainnet) → paste your contract address → **Transactions** tab → click **Export** (CSV).
2. In ClockIn Manager, click the prominent **Import BscScan CSV** button (top right or in Overview).
3. Select the downloaded CSV. New clock events are parsed, deduplicated, and added.
4. Add employee name mappings in the **Employee Mappings** page (or bulk import a `wallet,name` CSV).
5. View beautiful logs + summaries in **Attendance Logs**. Export filtered reports anytime.
6. Re-import updated CSVs from BscScan whenever you want — it safely appends only new records.

**Note on Data**: 
- From CSV we only get timestamp + employee wallet. `overtimeMinutes` and location are set to 0.
- Worked time is computed by pairing events in the browser (very accurate for reporting).
- For full on-chain geo + overtime emitted values, you would use a live contract reader (future enhancement).

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
- Contract: `0x4ACFE507138b73393Bc97C8913d30f79892eF1f2` (BSC Testnet)
- ClockIn selector: `0x687473fb`
- ClockOut selector: `0x6b92bb2a`

## License
MIT — feel free to adapt for your team.

Built with ❤️ for managers who need simple, auditable attendance tracking.
