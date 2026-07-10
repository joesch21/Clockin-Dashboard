# Operator Workflow - How We Maintain This Project

This document explains how we develop, patch, and update the ClockIn Manager application across multiple conversation threads.

## Core Principle
We use a **patch-based + full-zip** workflow so the project remains stable even when context is lost between sessions.

## 1. Making Changes (in this environment)

When a user requests changes:

1. Update the relevant source files inside `/home/workdir/artifacts/clockin-dashboard/`
2. Update documentation:
   - `docs/repo_status.json`
   - `docs/architecture.md` (if architecture changed)
   - `docs/schema_drift.md` (if data shape changed)
3. Rebuild the zip:
   ```bash
   cd /home/workdir/artifacts
   rm -f clockin-manager-dashboard.zip
   zip -r clockin-manager-dashboard.zip clockin-dashboard/ -x "node_modules/**"
   ```

## 2. How Users Apply Updates

### Option A: Full Restart (Recommended for big changes)
```bash
cd ~
rm -rf clockin-manager-dashboard
unzip clockin-manager-dashboard.zip
mv clockin-dashboard clockin-manager-dashboard
cd clockin-manager-dashboard
npm install
npm run dev
```

### Option B: Targeted File Replacement (Faster for small fixes)
User only replaces the changed files:
- `src/utils/importBscScanCsv.js`
- `src/App.jsx`
- Any component that was modified

Then run:
```bash
npm run dev
```

## 3. Common Commands

| Task                        | Command                                      |
|----------------------------|----------------------------------------------|
| Start development          | `npm run dev`                                |
| Rebuild zip after changes  | See section 1 above                          |
| Test CSV import            | Use the **Import BscScan CSV** button        |
| Clear demo data            | (Future) Use "Clear All Logs" button         |
| Export current logs        | Use Export button in LogsView                |

## 4. Testing Checklist After Major Changes

- [ ] App starts without errors (`npm run dev`)
- [ ] Demo data loads on first run
- [ ] Import real BscScan CSV works and shows correct number of records
- [ ] Period Summary correctly calculates worked minutes
- [ ] Filtering + date ranges still work
- [ ] Employee mappings affect display names
- [ ] No duplicate records after re-importing same CSV

## 5. Protecting Against Drift

Because conversations can reset, we maintain these guardrails:

- `repo_status.json` — Single source of truth for current state
- `schema_drift.md` — Prevents accidental breaking changes to data model
- `architecture.md` — Documents why things were built a certain way
- This `operatorworkflow.md` — How to stay consistent

**Never** make changes that contradict these documents without updating them first.

## 6. When to Create a New Zip

Create a new zip whenever:
- Parser logic changes (`importBscScanCsv.js`)
- Major UI or data flow changes
- Documentation is significantly updated
- User explicitly asks to "restart the application"

---

*Follow this workflow to keep the project coherent across long-running development.*