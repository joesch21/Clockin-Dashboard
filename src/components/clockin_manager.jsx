import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import {
  Clock, Users, BarChart3, Upload, Search, Download, LogIn, LogOut,
  AlertTriangle, FileText, X, TrendingUp, Calendar, MapPin
} from 'lucide-react';

// ---------- Demo data (mirrors architecture.md / schema_drift.md shape) ----------
const DEMO_MAPPINGS = [
  { wallet: '0x742d35cc6634c0532925a3b844bc454e4438f44e', name: 'Alex Chen' },
  { wallet: '0x8ba1f109551bd432803012645hac136c', name: 'Priya Singh' },
];

const getDemoLogs = () => [
  { eventName: 'ClockIn', employee: '0x742d35cc6634c0532925a3b844bc454e4438f44e', timestamp: '10 Jul 2026, 8:05:12 AM', rawTimestamp: new Date('2026-07-10T08:05:12').getTime(), latitude: '-33758333', longitude: '151206667', overtimeMinutes: 0 },
  { eventName: 'ClockOut', employee: '0x742d35cc6634c0532925a3b844bc454e4438f44e', timestamp: '10 Jul 2026, 5:32:45 PM', rawTimestamp: new Date('2026-07-10T17:32:45').getTime(), latitude: '-33758333', longitude: '151206667', overtimeMinutes: 92 },
  { eventName: 'ClockIn', employee: '0x8ba1f109551bd432803012645hac136c', timestamp: '10 Jul 2026, 8:45:00 AM', rawTimestamp: new Date('2026-07-10T08:45:00').getTime(), latitude: '-33701234', longitude: '151234567', overtimeMinutes: 0 },
  { eventName: 'ClockOut', employee: '0x8ba1f109551bd432803012645hac136c', timestamp: '10 Jul 2026, 4:15:30 PM', rawTimestamp: new Date('2026-07-10T16:15:30').getTime(), latitude: '-33701234', longitude: '151234567', overtimeMinutes: 0 },
  { eventName: 'ClockIn', employee: '0x742d35cc6634c0532925a3b844bc454e4438f44e', timestamp: '09 Jul 2026, 7:58:20 AM', rawTimestamp: new Date('2026-07-09T07:58:20').getTime(), latitude: '-33758333', longitude: '151206667', overtimeMinutes: 0 },
  { eventName: 'ClockOut', employee: '0x742d35cc6634c0532925a3b844bc454e4438f44e', timestamp: '09 Jul 2026, 6:10:05 PM', rawTimestamp: new Date('2026-07-09T18:10:05').getTime(), latitude: '-33758333', longitude: '151206667', overtimeMinutes: 130 },
  { eventName: 'ClockIn', employee: '0x8ba1f109551bd432803012645hac136c', timestamp: '08 Jul 2026, 9:02:11 AM', rawTimestamp: new Date('2026-07-08T09:02:11').getTime(), latitude: '-33701234', longitude: '151234567', overtimeMinutes: 0 },
  { eventName: 'ClockOut', employee: '0x8ba1f109551bd432803012645hac136c', timestamp: '08 Jul 2026, 5:47:52 PM', rawTimestamp: new Date('2026-07-08T17:47:52').getTime(), latitude: '-33701234', longitude: '151234567', overtimeMinutes: 47 },
];

// ---------- Core schema-safe helpers (per schema_drift.md) ----------
const dedupeKey = (log) => `${log.employee.toLowerCase()}-${log.rawTimestamp}-${log.eventName}`;

// Pairs ClockIn -> next ClockOut per employee, chronologically (architecture.md Period Summary logic)
function buildSessions(logs) {
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
          // unmatched clock-in before another clock-in; record as incomplete
          sessions.push({ clockIn: openIn, clockOut: null, workedMinutes: null, overtimeMinutes: 0, status: 'Incomplete' });
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
          sessions.push({ clockIn: null, clockOut: log, workedMinutes: null, overtimeMinutes: log.overtimeMinutes || 0, status: 'Orphan ClockOut' });
        }
      }
    });
    if (openIn) {
      sessions.push({ clockIn: openIn, clockOut: null, workedMinutes: null, overtimeMinutes: 0, status: 'Still Clocked In' });
    }
    sessionsByEmployee[wallet] = sessions;
  });
  return sessionsByEmployee;
}

const fmtHrs = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
};

const shortWallet = (w) => `${w.substring(0, 6)}...${w.substring(w.length - 4)}`;

function downloadCsv(filename, rows) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Import parser (BscScan CSV export contract, per schema_drift.md) ----------
function importBscScanCsv(file, existingLogs) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = (e) => {
      try {
        const parsed = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
        const rows = parsed.data;
        const existingKeys = new Set(existingLogs.map(dedupeKey));
        const skipBreakdown = { notClockEvent: 0, failedTx: 0, duplicate: 0, malformed: 0 };
        const newLogs = [];

        rows.forEach((row) => {
          const method = (row['Method'] || '').trim().toLowerCase();
          const status = (row['Status'] || 'Success').trim();
          const from = (row['From'] || '').trim().toLowerCase();
          const unixTs = row['UnixTimestamp'] || row['Unixtimestamp'] || row['DateTime (UTC)'];

          let eventName = null;
          if (method === '0x687473fb') eventName = 'ClockIn';
          else if (method === '0x6b92bb2a') eventName = 'ClockOut';

          if (!eventName) { skipBreakdown.notClockEvent++; return; }
          if (status && status.toLowerCase().includes('fail')) { skipBreakdown.failedTx++; return; }
          if (!from || !unixTs) { skipBreakdown.malformed++; return; }

          const rawTimestamp = /^\d+$/.test(String(unixTs).trim())
            ? parseInt(unixTs, 10) * 1000
            : new Date(unixTs).getTime();

          if (!rawTimestamp || Number.isNaN(rawTimestamp)) { skipBreakdown.malformed++; return; }

          const log = {
            eventName,
            employee: from,
            timestamp: new Date(rawTimestamp).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
            rawTimestamp,
            latitude: '0',
            longitude: '0',
            overtimeMinutes: 0,
          };

          const key = dedupeKey(log);
          if (existingKeys.has(key)) { skipBreakdown.duplicate++; return; }
          existingKeys.add(key);
          newLogs.push(log);
        });

        resolve({
          logs: [...existingLogs, ...newLogs],
          imported: newLogs.length,
          skipped: rows.length - newLogs.length,
          totalRows: rows.length,
          skipBreakdown,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}

// ---------- UI ----------
function StatCard({ icon: Icon, label, value, sub, accent = 'sky' }) {
  const accents = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-colors ${
        active ? 'bg-sky-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

export default function ClockInManager() {
  const [tab, setTab] = useState('overview');
  const [mappings, setMappings] = useState(DEMO_MAPPINGS);
  const [logs, setLogs] = useState(getDemoLogs());
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [deidentified, setDeidentified] = useState(false);
  const csvInputRef = useRef(null);

  const sessionsByEmployee = useMemo(() => buildSessions(logs), [logs]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const getDisplayName = (wallet) => {
    const m = mappings.find((mp) => mp.wallet.toLowerCase() === wallet.toLowerCase());
    if (m) return deidentified ? 'Anonymous' : m.name;
    return shortWallet(wallet);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await importBscScanCsv(file, logs);
      if (result.imported === 0) {
        showNotification(`No new clock events imported (${result.skipped} rows skipped).`, 'warning');
      } else {
        setLogs(result.logs);
        showNotification(`Imported ${result.imported} new clock events. ${result.skipped} rows skipped. Total: ${result.logs.length}.`, 'success');
      }
    } catch (err) {
      showNotification('Failed to parse CSV. Please use a valid BscScan transaction export.', 'warning');
    } finally {
      setIsImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex text-gray-900" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 hidden md:flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-base tracking-tight leading-tight">ClockIn Manager</div>
              <div className="text-[11px] text-gray-400">Blockchain Attendance</div>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          <NavButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={BarChart3}>Overview</NavButton>
          <NavButton active={tab === 'mappings'} onClick={() => setTab('mappings')} icon={Users}>Employee Mappings</NavButton>
          <NavButton active={tab === 'logs'} onClick={() => setTab('logs')} icon={Clock}>Attendance Logs</NavButton>
          <NavButton active={tab === 'reports'} onClick={() => setTab('reports')} icon={Search}>Reports</NavButton>
        </nav>
        <div className="p-4 border-t border-gray-100 text-[10px] text-gray-400">
          Data from BscScan CSV exports<br />Contract: 0x4ACFE5...f1f2
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
          <div className="text-sm text-gray-500 hidden sm:block">Manager Dashboard</div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
            >
              <Upload className="w-4 h-4" /> {isImporting ? 'Importing…' : 'Import BscScan CSV'}
            </button>
            <button
              onClick={() => setDeidentified(!deidentified)}
              className="text-sm font-medium bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-colors"
            >
              {deidentified ? 'Show Real Names' : 'De-identify Data'}
            </button>
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </header>

        {notification && (
          <div className={`fixed top-16 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm max-w-sm ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
          }`}>
            {notification.type === 'warning' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {notification.message}
          </div>
        )}

        <main className="flex-1 p-6 overflow-auto">
          {tab === 'overview' && <Overview logs={logs} mappings={mappings} sessionsByEmployee={sessionsByEmployee} getDisplayName={getDisplayName} onGoToReports={() => setTab('reports')} />}
          {tab === 'mappings' && <Mappings mappings={mappings} setMappings={setMappings} showNotification={showNotification} />}
          {tab === 'logs' && <Logs logs={logs} getDisplayName={getDisplayName} />}
          {tab === 'reports' && <Reports mappings={mappings} logs={logs} sessionsByEmployee={sessionsByEmployee} getDisplayName={getDisplayName} deidentified={deidentified} />}
        </main>
      </div>
    </div>
  );
}

// ---------- Overview ----------
function Overview({ logs, mappings, sessionsByEmployee, getDisplayName, onGoToReports }) {
  const employees = Object.keys(sessionsByEmployee);
  const todayStr = new Date().toDateString();
  const todaysClockins = logs.filter((l) => l.eventName === 'ClockIn' && new Date(l.rawTimestamp).toDateString() === todayStr).length;
  const totalOvertimeMins = Object.values(sessionsByEmployee).flat().reduce((sum, s) => sum + (s.overtimeMinutes || 0), 0);
  const stillClockedIn = Object.entries(sessionsByEmployee).filter(([, s]) => s.some((x) => x.status === 'Still Clocked In'));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Tracked employees" value={employees.length} accent="sky" />
        <StatCard icon={LogIn} label="Clock-ins today" value={todaysClockins} accent="emerald" />
        <StatCard icon={TrendingUp} label="Total overtime" value={fmtHrs(totalOvertimeMins)} accent="amber" />
        <StatCard icon={Clock} label="Still clocked in" value={stillClockedIn.length} accent="violet" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Recent activity</h3>
          <button onClick={onGoToReports} className="text-sm text-sky-600 font-medium hover:underline">Search full reports →</button>
        </div>
        <div className="divide-y divide-gray-100">
          {[...logs].sort((a, b) => b.rawTimestamp - a.rawTimestamp).slice(0, 6).map((l, i) => (
            <div key={i} className="flex items-center gap-3 py-3 text-sm">
              {l.eventName === 'ClockIn' ? <LogIn className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <LogOut className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="font-medium">{getDisplayName(l.employee)}</span>
              <span className="text-gray-400">{l.eventName === 'ClockIn' ? 'clocked in' : 'clocked out'}</span>
              <span className="text-gray-400 ml-auto flex-shrink-0">{l.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Mappings ----------
function Mappings({ mappings, setMappings, showNotification }) {
  const [wallet, setWallet] = useState('');
  const [name, setName] = useState('');

  const addMapping = () => {
    if (!wallet.trim() || !name.trim()) return;
    const w = wallet.trim().toLowerCase();
    if (mappings.some((m) => m.wallet === w)) {
      showNotification('That wallet is already mapped.', 'warning');
      return;
    }
    setMappings([...mappings, { wallet: w, name: name.trim() }]);
    setWallet(''); setName('');
  };

  const removeMapping = (w) => setMappings(mappings.filter((m) => m.wallet !== w));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Add employee mapping</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet address"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <button onClick={addMapping} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-medium">Add</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr><th className="px-5 py-3 font-medium">Name</th><th className="px-5 py-3 font-medium">Wallet</th><th className="px-5 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.map((m) => (
              <tr key={m.wallet}>
                <td className="px-5 py-3 font-medium">{m.name}</td>
                <td className="px-5 py-3 text-gray-500 font-mono text-xs">{m.wallet}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => removeMapping(m.wallet)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Logs ----------
function Logs({ logs, getDisplayName }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return [...logs]
      .filter((l) => filter === 'all' || l.eventName === filter)
      .filter((l) => !query || getDisplayName(l.employee).toLowerCase().includes(query.toLowerCase()) || l.employee.includes(query.toLowerCase()))
      .sort((a, b) => b.rawTimestamp - a.rawTimestamp);
  }, [logs, filter, query]);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee or wallet…"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
          <option value="all">All events</option>
          <option value="ClockIn">Clock-ins only</option>
          <option value="ClockOut">Clock-outs only</option>
        </select>
        <button
          onClick={() => downloadCsv('attendance_logs.csv', filtered)}
          className="ml-auto flex items-center gap-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Event</th>
              <th className="px-5 py-3 font-medium">Timestamp</th>
              <th className="px-5 py-3 font-medium">Overtime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((l, i) => (
              <tr key={i}>
                <td className="px-5 py-3 font-medium">{getDisplayName(l.employee)}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${l.eventName === 'ClockIn' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {l.eventName === 'ClockIn' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />} {l.eventName}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{l.timestamp}</td>
                <td className="px-5 py-3 text-gray-500">{l.overtimeMinutes ? `${l.overtimeMinutes}m` : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No logs match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Reports (NEW: search by name/wallet -> full log-in/out report) ----------
function Reports({ mappings, logs, sessionsByEmployee, getDisplayName, deidentified }) {
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    <div className="max-w-5xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Employee report search</h3>
        <p className="text-sm text-gray-500 mb-4">Search by employee name or wallet address to pull a full clock-in / clock-out history.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or wallet address…"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {matches.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400">
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
          <div key={wallet} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{displayName}</div>
                {!deidentified && <div className="text-xs text-gray-400 font-mono">{wallet}</div>}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{fmtHrs(totalWorked)}</div>
                  <div className="text-xs text-gray-400">worked</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-amber-600">{fmtHrs(totalOvertime)}</div>
                  <div className="text-xs text-gray-400">overtime</div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stillIn ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {stillIn ? 'Currently clocked in' : 'Off shift'}
                </span>
                <button
                  onClick={() => downloadCsv(`${displayName.replace(/\s+/g, '_')}_report.csv`, sessions.map((s) => ({
                    clockIn: s.clockIn?.timestamp || '—',
                    clockOut: s.clockOut?.timestamp || '—',
                    workedMinutes: s.workedMinutes ?? '—',
                    overtimeMinutes: s.overtimeMinutes,
                    status: s.status,
                  })))}
                  className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Clock in</th>
                  <th className="px-5 py-2.5 font-medium">Clock out</th>
                  <th className="px-5 py-2.5 font-medium">Duration</th>
                  <th className="px-5 py-2.5 font-medium">Overtime</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...sessions].sort((a, b) => (b.clockIn?.rawTimestamp || b.clockOut?.rawTimestamp) - (a.clockIn?.rawTimestamp || a.clockOut?.rawTimestamp)).map((s, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3">{s.clockIn ? s.clockIn.timestamp : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3">{s.clockOut ? s.clockOut.timestamp : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3 text-gray-500">{fmtHrs(s.workedMinutes)}</td>
                    <td className="px-5 py-3 text-gray-500">{s.overtimeMinutes ? `${s.overtimeMinutes}m` : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.status === 'Completed' ? 'bg-gray-100 text-gray-600' :
                        s.status === 'Still Clocked In' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-400">No sessions in this date range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
