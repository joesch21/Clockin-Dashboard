// src/utils/fetchLiveEvents.js
//
// Powers a "Refresh Now" button. Calls /api/fetch-clock-events directly
// (bypassing the daily cron schedule) and merges the results into the same
// `clockinLogs` localStorage array your CSV import already writes to, using
// the identical dedup key from schema_drift.md so re-clicking never creates
// duplicates.
//
// This is additive — it does not modify importBscScanCsv.js.

const MANAGER_REFRESH_TOKEN = import.meta.env.VITE_MANAGER_REFRESH_TOKEN;

function dedupKey(log) {
  return `${log.employee.toLowerCase()}-${log.rawTimestamp}-${log.eventName}`;
}

export async function refreshLiveEvents(existingLogs = []) {
  const res = await fetch('/api/fetch-clock-events', {
    headers: {
      'x-manual-refresh': MANAGER_REFRESH_TOKEN || '',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Refresh failed (${res.status})`);
  }

  const { logs: fetchedLogs, imported, skipped, totalRows } = await res.json();

  const existingKeys = new Set(existingLogs.map(dedupKey));
  const newLogs = fetchedLogs.filter((log) => !existingKeys.has(dedupKey(log)));

  const mergedLogs = [...existingLogs, ...newLogs];

  return {
    mergedLogs,
    added: newLogs.length,
    seenFromApi: imported,
    skippedByApi: skipped,
    totalRowsChecked: totalRows,
  };
}
