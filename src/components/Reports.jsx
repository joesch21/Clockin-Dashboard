import React, { useState, useMemo } from 'react';
import { Search, Calendar, Download, LogIn, LogOut } from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { useAppContext } from '../App';
import { buildSessionsByEmployee, formatDuration } from '../utils/sessionPairing';

function exportSessionsCsv(displayName, sessions) {
  const rows = sessions.map((s) => ({
    clockIn: s.clockIn ? s.clockIn.timestamp : '',
    clockOut: s.clockOut ? s.clockOut.timestamp : '',
    workedMinutes: s.workedMinutes ?? '',
    overtimeMinutes: s.overtimeMinutes,
    status: s.status,
  }));
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${displayName.replace(/\s+/g, '_')}_report.csv`);
}

function Reports() {
  const { mappings, logs, getDisplayName, showDeidentified } = useAppContext();

  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const sessionsByEmployee = useMemo(() => buildSessionsByEmployee(logs), [logs]);
  const allWallets = Object.keys(sessionsByEmployee);

  const matches = useMemo(() => {
    if (!query.trim()) return allWallets;
    const q = query.trim().toLowerCase();
    return allWallets.filter((w) => {
      const mapping = mappings.find((m) => m.wallet.toLowerCase() === w.toLowerCase());
      const name = mapping ? mapping.name.toLowerCase() : '';
      return w.includes(q) || name.includes(q);
    });
  }, [query, allWallets, mappings]);

  const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
  const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
  const withinRange = (ts) => (!fromTs || ts >= fromTs) && (!toTs || ts <= toTs);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Employee report search</h3>
        <p className="text-sm text-gray-500 mb-4">
          Search by employee name or wallet address to pull a full clock-in / clock-out history.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or wallet address…"
              className="input pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {matches.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          No employees match "{query}".
        </div>
      )}

      {matches.map((wallet) => {
        const sessions = sessionsByEmployee[wallet].filter((s) => {
          const ts = s.clockIn?.rawTimestamp ?? s.clockOut?.rawTimestamp;
          return withinRange(ts);
        });
        const totalWorked = sessions.reduce((sum, s) => sum + (s.workedMinutes || 0), 0);
        const totalOvertime = sessions.reduce((sum, s) => sum + (s.overtimeMinutes || 0), 0);
        const stillIn = sessions.some((s) => s.status === 'Still Clocked In');
        const displayName = getDisplayName(wallet);

        return (
          <div key={wallet} className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{displayName}</div>
                {!showDeidentified && (
                  <div className="text-xs text-gray-400 font-mono">{wallet}</div>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{formatDuration(totalWorked)}</div>
                  <div className="text-xs text-gray-400">worked</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-amber-600">{formatDuration(totalOvertime)}</div>
                  <div className="text-xs text-gray-400">overtime</div>
                </div>
                <span className={`status-pill ${stillIn ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {stillIn ? 'Currently clocked in' : 'Off shift'}
                </span>
                <button
                  onClick={() => exportSessionsCsv(displayName, sessions)}
                  className="btn btn-secondary text-xs px-3 py-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>

            <div className="table-container border-0 rounded-none">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-2.5 text-left">Clock in</th>
                    <th className="px-5 py-2.5 text-left">Clock out</th>
                    <th className="px-5 py-2.5 text-left">Duration</th>
                    <th className="px-5 py-2.5 text-left">Overtime</th>
                    <th className="px-5 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...sessions]
                    .sort((a, b) => (b.clockIn?.rawTimestamp || b.clockOut?.rawTimestamp) - (a.clockIn?.rawTimestamp || a.clockOut?.rawTimestamp))
                    .map((s, i) => (
                      <tr key={i} className="log-row">
                        <td className="px-5 py-3">
                          {s.clockIn ? (
                            <span className="inline-flex items-center gap-1.5">
                              <LogIn className="w-3.5 h-3.5 text-emerald-600" /> {s.clockIn.timestamp}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.clockOut ? (
                            <span className="inline-flex items-center gap-1.5">
                              <LogOut className="w-3.5 h-3.5 text-gray-400" /> {s.clockOut.timestamp}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{formatDuration(s.workedMinutes)}</td>
                        <td className="px-5 py-3 text-gray-500">
                          {s.overtimeMinutes ? (
                            <span className="overtime-badge">{s.overtimeMinutes}m</span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`status-pill ${
                              s.status === 'Completed'
                                ? 'bg-gray-100 text-gray-600'
                                : s.status === 'Still Clocked In'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-gray-400">
                        No sessions in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Reports;
