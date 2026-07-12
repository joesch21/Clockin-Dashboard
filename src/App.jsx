import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { 
  Clock, Users, BarChart3, Download, RefreshCw, Calendar, MapPin, 
  LogIn, LogOut, AlertTriangle, Upload, Search, Info
} from 'lucide-react';
import WalletMapping from './components/WalletMapping';
import LogsView from './components/LogsView';
import Overview from './components/Overview';
import Reports from './components/Reports';
import About from './components/About';
import { importBscScanCsv } from './utils/importBscScanCsv';
import { refreshLiveEvents as fetchLiveEventsFromChain } from './utils/fetchLiveEvents';

// Create context for shared state
const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

function App() {
  const [mappings, setMappings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [showDeidentified, setShowDeidentified] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [lastLiveSync, setLastLiveSync] = useState(
    () => localStorage.getItem("lastLiveSync") || null
  );
  const [notification, setNotification] = useState(null);
  const location = useLocation();

  // Hidden file input ref for CSV import
  const csvInputRef = React.useRef(null);

  // Load mappings + logs from localStorage on mount
  useEffect(() => {
    // Mappings
    const savedMappings = localStorage.getItem("walletMappings");
    if (savedMappings) {
      try {
        setMappings(JSON.parse(savedMappings));
      } catch (e) {
        console.error("Error loading mappings", e);
      }
    }

    // Logs (CSV imported data)
    const savedLogs = localStorage.getItem("clockinLogs");
    if (savedLogs !== null) {
      try {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed)) {
          setLogs(parsed);
          if (parsed.length > 0) setLastRefresh(new Date());
          // NOTE: an empty array here is respected as-is (e.g. after
          // "Clear All Data"). We do NOT reseed demo data just because
          // the array is empty — only a genuinely first-ever visit
          // (savedLogs === null) gets the demo seed. See clearAllData().
        } else {
          console.error("Corrupt clockinLogs value, resetting to empty");
          setLogs([]);
        }
      } catch (e) {
        console.error("Error loading logs", e);
        setLogs([]);
      }
    } else {
      // Truly first-ever load (localStorage key has never been set) -> seed demo
      const demo = getDemoLogs();
      setLogs(demo);
      localStorage.setItem("clockinLogs", JSON.stringify(demo));
    }
  }, []);

  // Persist logs whenever they change (including intentionally clearing to [])
  useEffect(() => {
    localStorage.setItem("clockinLogs", JSON.stringify(logs));
  }, [logs]);

  // Persist mappings
  const updateMappings = (newMappings) => {
    setMappings(newMappings);
    localStorage.setItem("walletMappings", JSON.stringify(newMappings));
  };

  // Demo logs for first-time users / testing (Sydney time examples)
  const getDemoLogs = () => [
    {
      eventName: "ClockIn",
      employee: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      timestamp: "10 Jul 2026, 8:05:12 AM",
      rawTimestamp: new Date("2026-07-10T08:05:12").getTime(),
      latitude: "-33758333",
      longitude: "151206667",
      overtimeMinutes: 0,
    },
    {
      eventName: "ClockOut",
      employee: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      timestamp: "10 Jul 2026, 5:32:45 PM",
      rawTimestamp: new Date("2026-07-10T17:32:45").getTime(),
      latitude: "-33758333",
      longitude: "151206667",
      overtimeMinutes: 92,
    },
    {
      eventName: "ClockIn",
      employee: "0x8ba1f109551bD432803012645Hac136c",
      timestamp: "10 Jul 2026, 8:45:00 AM",
      rawTimestamp: new Date("2026-07-10T08:45:00").getTime(),
      latitude: "-33701234",
      longitude: "151234567",
      overtimeMinutes: 0,
    },
    {
      eventName: "ClockOut",
      employee: "0x8ba1f109551bD432803012645Hac136c",
      timestamp: "10 Jul 2026, 4:15:30 PM",
      rawTimestamp: new Date("2026-07-10T16:15:30").getTime(),
      latitude: "-33701234",
      longitude: "151234567",
      overtimeMinutes: 0,
    },
    {
      eventName: "ClockIn",
      employee: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      timestamp: "09 Jul 2026, 7:58:20 AM",
      rawTimestamp: new Date("2026-07-09T07:58:20").getTime(),
      latitude: "-33758333",
      longitude: "151206667",
      overtimeMinutes: 0,
    },
    {
      eventName: "ClockOut",
      employee: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      timestamp: "09 Jul 2026, 6:10:05 PM",
      rawTimestamp: new Date("2026-07-09T18:10:05").getTime(),
      latitude: "-33758333",
      longitude: "151206667",
      overtimeMinutes: 130,
    },
  ];

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const toggleDeidentification = () => {
    setShowDeidentified(!showDeidentified);
  };

  // Get display name helper (used across components)
  const getDisplayName = (wallet) => {
    const mapping = mappings.find((m) => m.wallet.toLowerCase() === wallet.toLowerCase());
    if (mapping) {
      return showDeidentified ? "Anonymous" : mapping.name;
    }
    return wallet.substring(0, 6) + "..." + wallet.substring(wallet.length - 4);
  };

  // === CSV IMPORT HANDLER ===
  const handleImportBscScanCsv = async (file) => {
    if (!file) return;

    setIsLoadingLogs(true);
    try {
      const result = await importBscScanCsv(file, logs);

      if (result.imported === 0) {
        const breakdown = result.skipBreakdown 
          ? Object.entries(result.skipBreakdown).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ')
          : '';
        showNotification(
          `No new clock events imported. ${result.skipped} rows skipped. ${breakdown}`, 
          "warning"
        );
      } else {
        setLogs(result.logs);
        setLastRefresh(new Date());
        const breakdown = result.skipBreakdown 
          ? Object.entries(result.skipBreakdown).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(' • ')
          : '';
        showNotification(
          `✅ Imported ${result.imported} new clock events! ${result.skipped} rows skipped. ${breakdown ? 'Skipped: ' + breakdown : ''} Total now: ${result.logs.length}`, 
          "success"
        );
      }
    } catch (error) {
      console.error("CSV import failed:", error);
      showNotification("Failed to parse CSV. Please use a valid BscScan transaction export file.", "warning");
    } finally {
      setIsLoadingLogs(false);
      // reset file input so same file can be re-selected later
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  // Trigger hidden file input
  const triggerCsvImport = () => {
    if (csvInputRef.current) {
      csvInputRef.current.click();
    }
  };

  // === LIVE CHAIN REFRESH (replaces the old "sync disabled" stub) ===
  // Calls /api/fetch-clock-events, merges any new events into `logs` via the
  // same dedup key used everywhere else, and persists via the existing
  // logs-persistence effect above (no separate localStorage write needed here).
  const refreshLiveEvents = async (showToast = true) => {
    setIsRefreshingLive(true);
    try {
      const { mergedLogs, added } = await fetchLiveEventsFromChain(logs);
      setLogs(mergedLogs);

      const now = new Date().toISOString();
      localStorage.setItem("lastLiveSync", now);
      setLastLiveSync(now);

      if (showToast) {
        showNotification(
          added === 0
            ? "Refreshed from chain — no new events since last sync."
            : `✅ Synced ${added} new clock event${added === 1 ? '' : 's'} from opBNB. Total now: ${mergedLogs.length}`,
          added === 0 ? "warning" : "success"
        );
      }
      return { added };
    } catch (error) {
      console.error("Live refresh failed:", error);
      if (showToast) {
        showNotification(`Live refresh failed: ${error.message}`, "warning");
      }
      throw error;
    } finally {
      setIsRefreshingLive(false);
    }
  };

  // `fetchLogs` kept as the historical name so any existing callers
  // elsewhere in the app (e.g. a "Refresh" button in LogsView/Reports you
  // haven't shown me yet) pick up real live-sync behavior instead of the
  // old "sync disabled" guidance message, with no call-site changes needed.
  const fetchLogs = refreshLiveEvents;

  // Allow components to force reload from localStorage (rarely needed)
  const reloadLogsFromStorage = () => {
    const saved = localStorage.getItem("clockinLogs");
    if (saved) {
      try {
        setLogs(JSON.parse(saved));
      } catch (_) {}
    }
  };

  // Clears all attendance logs (e.g. demo/template data) without
  // reseeding demo data on next load. Does NOT touch employee mappings.
  const clearAllData = () => {
    const confirmed = window.confirm(
      "This will permanently clear all attendance logs (including demo data). " +
      "Employee mappings will be kept. This can't be undone. Continue?"
    );
    if (!confirmed) return;

    setLogs([]);
    localStorage.setItem("clockinLogs", JSON.stringify([]));
    setLastRefresh(null);
    showNotification("All attendance logs cleared. Import a CSV to load real data.", "warning");
  };

  const contextValue = {
    mappings,
    updateMappings,
    logs,
    setLogs,
    isLoadingLogs,
    isRefreshingLive,
    showDeidentified,
    toggleDeidentification,
    getDisplayName,
    fetchLogs,              // now an alias for refreshLiveEvents (see above)
    refreshLiveEvents,
    lastRefresh,
    lastLiveSync,
    showNotification,
    importBscScanCsv: handleImportBscScanCsv,
    triggerCsvImport,
    reloadLogsFromStorage,
    clearAllData,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <div className="w-72 bg-white border-r border-gray-200 flex-shrink-0 hidden lg:flex flex-col">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-primary-600 rounded-2xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold text-xl tracking-tight">ClockIn Manager</div>
                <div className="text-xs text-gray-500 -mt-0.5">Blockchain Attendance</div>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1 flex-1">
            <NavLink 
              to="/" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end
            >
              <BarChart3 className="w-5 h-5" /> Overview
            </NavLink>
            <NavLink 
              to="/mappings" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Users className="w-5 h-5" /> Employee Mappings
            </NavLink>
            <NavLink 
              to="/logs" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Clock className="w-5 h-5" /> Attendance Logs
            </NavLink>
            <NavLink 
              to="/reports" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Search className="w-5 h-5" /> Reports
            </NavLink>
            <NavLink 
              to="/about" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Info className="w-5 h-5" /> About
            </NavLink>
          </nav>

          <div className="p-4 border-t mt-auto">
            <div className="text-[10px] text-gray-400 px-4">
              Data from opBNB Testnet exports<br />
              Contract: 0x465467...c945e
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-4">
              <div className="lg:hidden flex items-center gap-2">
                <div className="w-9 h-9 bg-primary-600 rounded-2xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-lg">ClockIn Manager</span>
              </div>
              <div className="hidden lg:block text-sm text-gray-500">
                Manager Dashboard • {new Date().toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Prominent Import Button */}
              <button 
                onClick={triggerCsvImport}
                disabled={isLoadingLogs}
                className="btn btn-primary text-sm gap-2"
              >
                <Upload className="w-4 h-4" />
                {isLoadingLogs ? "Importing..." : "Import BscScan CSV"}
              </button>

              {/* Was "How to Import" showing a static guidance toast when live
                  sync was disabled — now actually performs the live refresh */}
              <button 
                onClick={() => refreshLiveEvents(true)}
                disabled={isRefreshingLive}
                className="btn btn-secondary text-sm gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingLive ? 'animate-spin' : ''}`} />
                {isRefreshingLive ? "Refreshing..." : "Refresh Now"}
              </button>

              <button 
                onClick={toggleDeidentification}
                className="btn btn-secondary text-sm"
              >
                {showDeidentified ? "Show Real Names" : "De-identify Data"}
              </button>

              <button 
                onClick={clearAllData}
                className="btn btn-secondary text-sm text-rose-600 hover:bg-rose-50 border-rose-200"
                title="Clear all attendance logs, including demo data"
              >
                Clear All Data
              </button>

              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                MG
              </div>
            </div>
          </header>

          {/* Hidden CSV file input */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportBscScanCsv(file);
            }}
          />

          {/* Notification Toast */}
          {notification && (
            <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 text-sm max-w-md ${
              notification.type === 'success' ? 'bg-emerald-600 text-white' : 
              notification.type === 'warning' ? 'bg-amber-500 text-white' : 'bg-gray-800 text-white'
            }`}>
              {notification.type === 'warning' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              {notification.message}
            </div>
          )}

          {/* Page Content */}
          <main className="flex-1 p-6 lg:p-8 overflow-auto">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/mappings" element={<WalletMapping />} />
              <Route path="/logs" element={<LogsView />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </main>

          <footer className="bg-white border-t px-6 py-3 text-xs text-gray-400 flex items-center justify-between">
            <div>© {new Date().getFullYear()} ClockIn Manager • Import from BscScan CSV or refresh live from opBNB</div>
            <div className="flex items-center gap-4">
              <span>Last import: {lastRefresh ? lastRefresh.toLocaleTimeString('en-AU') : 'Never'}</span>
              <span>Last live sync: {lastLiveSync ? new Date(lastLiveSync).toLocaleTimeString('en-AU') : 'Never'}</span>
            </div>
          </footer>
        </div>
      </div>
    </AppContext.Provider>
  );
}

export default App;
