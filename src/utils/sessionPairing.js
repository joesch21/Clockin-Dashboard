// src/utils/sessionPairing.js
//
// Shared pairing logic for turning a flat list of clockinLogs into
// per-employee sessions (ClockIn -> ClockOut pairs).
//
// This mirrors the "Period Summary Logic" described in architecture.md
// and respects the schema contract in schema_drift.md:
//   - logs are grouped by `employee` (lowercased wallet)
//   - sorted by `rawTimestamp` ascending per employee
//   - a ClockIn is paired with the next ClockOut for that employee
//   - unmatched ClockIn at the end of the range => "Still Clocked In"
//
// NOTE: LogsView.jsx currently has its own inline copy of this logic for
// the Period Summary table. If you want a single source of truth, it's
// worth pointing LogsView.jsx at this same util in a follow-up pass —
// left untouched here since its current source wasn't available to edit.

/**
 * @param {Array} logs - flat array of Log objects (see schema_drift.md)
 * @returns {Object} map of lowercased wallet -> array of session objects
 */
export function buildSessionsByEmployee(logs) {
  const byEmployee = {};
  logs.forEach((l) => {
    const key = l.employee.toLowerCase();
    if (!byEmployee[key]) byEmployee[key] = [];
    byEmployee[key].push(l);
  });

  const sessionsByEmployee = {};
  Object.entries(byEmployee).forEach(([wallet, empLogs]) => {
    const sorted = [...empLogs].sort((a, b) => a.rawTimestamp - b.rawTimestamp);
    const sessions = [];
    let openIn = null;

    sorted.forEach((log) => {
      if (log.eventName === 'ClockIn') {
        if (openIn) {
          // Two ClockIns in a row with no ClockOut between them
          sessions.push({
            clockIn: openIn,
            clockOut: null,
            workedMinutes: null,
            overtimeMinutes: 0,
            status: 'Incomplete',
          });
        }
        openIn = log;
      } else if (log.eventName === 'ClockOut') {
        if (openIn) {
          const workedMinutes = Math.round((log.rawTimestamp - openIn.rawTimestamp) / 60000);
          sessions.push({
            clockIn: openIn,
            clockOut: log,
            workedMinutes,
            overtimeMinutes: log.overtimeMinutes || 0,
            status: 'Completed',
          });
          openIn = null;
        } else {
          // ClockOut with no preceding ClockIn
          sessions.push({
            clockIn: null,
            clockOut: log,
            workedMinutes: null,
            overtimeMinutes: log.overtimeMinutes || 0,
            status: 'Orphan ClockOut',
          });
        }
      }
    });

    if (openIn) {
      sessions.push({
        clockIn: openIn,
        clockOut: null,
        workedMinutes: null,
        overtimeMinutes: 0,
        status: 'Still Clocked In',
      });
    }

    sessionsByEmployee[wallet] = sessions;
  });

  return sessionsByEmployee;
}

export function formatDuration(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
