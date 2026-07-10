import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Download, Filter, MapPin, Calendar, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { format, parseISO, subDays } from 'date-fns';

function LogsView() {
  const { 
    logs, isLoadingLogs, fetchLogs, getDisplayName, 
    showDeidentified, showNotification, triggerCsvImport 
  } = useAppContext();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd')); // Default: Last 7 days
  const [endDate, setEndDate] = useState(today);
  const [eventFilter, setEventFilter] = useState('All'); // All | ClockIn | ClockOut
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'rawTimestamp', direction: 'desc' });

  // Filter + sort logs
  const filteredAndSortedLogs = useMemo(() => {
    let result = logs.filter(log => {
      // Date range filter (supports weeks/months of historical data)
      if (startDate && endDate && log.rawTimestamp) {
        const logDate = format(new Date(log.rawTimestamp), 'yyyy-MM-dd');
        if (logDate < startDate || logDate > endDate) return false;
      }
      
      // Event type filter
      if (eventFilter !== 'All' && log.eventName !== eventFilter) return false;

      // Employee search
      if (employeeFilter) {
        const display = getDisplayName(log.employee).toLowerCase();
        const wallet = log.employee.toLowerCase();
        if (!display.includes(employeeFilter.toLowerCase()) && !wallet.includes(employeeFilter.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      
      if (sortConfig.key === 'rawTimestamp') {
        valA = valA || 0;
        valB = valB || 0;
      } else if (sortConfig.key === 'overtimeMinutes') {
        valA = valA || 0;
        valB = valB || 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [logs, startDate, endDate, eventFilter, employeeFilter, sortConfig, getDisplayName]);

  // Period Summary: Aggregate worked time + overtime per employee over the selected date range
  const periodSummary = useMemo(() => {
    if (!startDate || !endDate) return [];

    const rangeLogs = logs.filter(log => {
      if (!log.rawTimestamp) return false;
      const logDate = format(new Date(log.rawTimestamp), 'yyyy-MM-dd');
      return logDate >= startDate && logDate <= endDate;
    });

    // Group by employee across the whole period
    const byEmployee = {};
    rangeLogs.forEach(log => {
      const key = log.employee.toLowerCase();
      if (!byEmployee[key]) byEmployee[key] = [];
      byEmployee[key].push(log);
    });

    const summaries = [];

    Object.keys(byEmployee).forEach(wallet => {
      const empLogs = byEmployee[wallet].sort((a, b) => (a.rawTimestamp || 0) - (b.rawTimestamp || 0));
      const displayName = getDisplayName(wallet);

      // Pairing across multiple days/sessions in the period
      let totalWorkedMinutes = 0;
      let totalOvertime = 0;
      let sessions = 0;
      let firstInOverall = null;
      let lastOutOverall = null;

      let currentFirstIn = null;

      for (let i = 0; i < empLogs.length; i++) {
        const log = empLogs[i];
        if (log.eventName === 'ClockIn') {
          currentFirstIn = currentFirstIn || log;
          if (!firstInOverall) firstInOverall = log;
        } else if (log.eventName === 'ClockOut') {
          lastOutOverall = log;
          if (currentFirstIn && currentFirstIn.rawTimestamp && log.rawTimestamp) {
            const worked = Math.round((log.rawTimestamp - currentFirstIn.rawTimestamp) / 60000);
            totalWorkedMinutes += Math.max(0, worked);
            totalOvertime += log.overtimeMinutes || 0;
            sessions++;
            currentFirstIn = null;
          }
        }
      }

      const status = currentFirstIn ? 'Still Clocked In (at end of period)' : (sessions > 0 ? 'Completed' : 'No activity');

      summaries.push({
        employee: wallet,
        displayName,
        firstInTime: firstInOverall ? firstInOverall.timestamp : '—',
        lastOutTime: lastOutOverall ? lastOutOverall.timestamp : '—',
        totalWorkedMinutes,
        totalOvertime,
        sessions,
        status,
        eventCount: empLogs.length,
      });
    });

    return summaries.sort((a, b) => b.totalWorkedMinutes - a.totalWorkedMinutes);
  }, [logs, startDate, endDate, getDisplayName]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const exportFilteredToCSV = () => {
    if (filteredAndSortedLogs.length === 0) {
      showNotification("No logs to export for current filters", "warning");
      return;
    }

    const exportData = filteredAndSortedLogs.map(log => ({
      Date: log.timestamp?.split(',')[0] || '',
      Time: log.timestamp?.split(',')[1]?.trim() || '',
      Employee: getDisplayName(log.employee),
      Event: log.eventName,
      OvertimeMinutes: log.overtimeMinutes || 0,
      Latitude: log.latitude,
      Longitude: log.longitude,
      Wallet: log.employee,
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `attendance_logs_${startDate}_to_${endDate}.csv`);
    showNotification(`Exported ${exportData.length} log entries`, "success");
  };

  const openInMaps = (lat, lng) => {
    // Note: lat/lng may be scaled integers from contract (e.g. * 1e7). 
    // For demo/imported CSV we use 0 or raw values.
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
  };

  const totalOvertimeFiltered = filteredAndSortedLogs
    .filter(l => l.eventName === 'ClockOut')
    .reduce((sum, l) => sum + (Number(l.overtimeMinutes) || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Attendance Logs</h1>
          <p className="text-gray-500">CSV-imported clock in/out records from BscScan • Worked time auto-calculated by pairing In→Out</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={triggerCsvImport} disabled={isLoadingLogs} className="btn btn-primary text-sm">
            <Upload className="w-4 h-4" /> Import More CSV
          </button>
          <button onClick={exportFilteredToCSV} className="btn btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export Filtered CSV
          </button>
        </div>
      </div>

      {/* Filters - Enhanced with historical date range support */}
      <div className="card p-5">
        {/* Quick Range Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button 
            onClick={() => { setStartDate(today); setEndDate(today); }}
            className={`px-4 py-1.5 text-sm rounded-xl transition ${startDate === today && endDate === today ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Today
          </button>
          <button 
            onClick={() => { 
              const lastWeek = format(subDays(new Date(), 6), 'yyyy-MM-dd'); 
              setStartDate(lastWeek); 
              setEndDate(today); 
            }}
            className={`px-4 py-1.5 text-sm rounded-xl transition ${startDate === format(subDays(new Date(), 6), 'yyyy-MM-dd') && endDate === today ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Last 7 Days
          </button>
          <button 
            onClick={() => { 
              const lastMonth = format(subDays(new Date(), 29), 'yyyy-MM-dd'); 
              setStartDate(lastMonth); 
              setEndDate(today); 
            }}
            className={`px-4 py-1.5 text-sm rounded-xl transition ${startDate === format(subDays(new Date(), 29), 'yyyy-MM-dd') && endDate === today ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Last 30 Days
          </button>
          <button 
            onClick={() => { setStartDate('2025-01-01'); setEndDate(today); }}
            className={`px-4 py-1.5 text-sm rounded-xl transition ${startDate === '2025-01-01' && endDate === today ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            All Time (since 2025)
          </button>
          <button 
            onClick={() => { 
              const lastWeek = format(subDays(new Date(), 6), 'yyyy-MM-dd'); 
              setStartDate(lastWeek); 
              setEndDate(today); 
            }}
            className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Reset to Last Week
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> FROM</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="input py-2 text-sm w-44"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> TO</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="input py-2 text-sm w-44"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">EVENT TYPE</label>
            <select 
              value={eventFilter} 
              onChange={(e) => setEventFilter(e.target.value)}
              className="input py-2 text-sm w-44"
            >
              <option value="All">All Events</option>
              <option value="ClockIn">Clock In only</option>
              <option value="ClockOut">Clock Out only</option>
            </select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> SEARCH EMPLOYEE</label>
            <input 
              type="text" 
              placeholder="Name or wallet..." 
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="input py-2 text-sm"
            />
          </div>

          <div className="text-sm text-gray-500 pb-1">
            Showing <span className="font-semibold text-gray-700">{filteredAndSortedLogs.length}</span> records • {totalOvertimeFiltered} min overtime
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b">
          <div className="font-semibold">Event Log {startDate && endDate && `from ${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`}</div>
          {isLoadingLogs && <div className="text-xs text-primary-600 animate-pulse">Processing CSV...</div>}
        </div>

        <div className="table-container">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th onClick={() => handleSort('rawTimestamp')} className="cursor-pointer px-6 py-3.5 text-left hover:bg-gray-100 select-none">Timestamp {sortConfig.key === 'rawTimestamp' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                <th onClick={() => handleSort('employee')} className="cursor-pointer px-6 py-3.5 text-left hover:bg-gray-100 select-none">Employee</th>
                <th onClick={() => handleSort('eventName')} className="cursor-pointer px-6 py-3.5 text-left hover:bg-gray-100 select-none">Event</th>
                <th onClick={() => handleSort('overtimeMinutes')} className="cursor-pointer px-6 py-3.5 text-right hover:bg-gray-100 select-none">Overtime</th>
                <th className="px-6 py-3.5 text-left">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {filteredAndSortedLogs.length > 0 ? (
                filteredAndSortedLogs.map((log, index) => {
                  const isClockIn = log.eventName === 'ClockIn';
                  return (
                    <tr key={index} className="log-row">
                      <td className="px-6 py-4 font-medium whitespace-nowrap">{log.timestamp}</td>
                      <td className="px-6 py-4">
                        <span className="font-medium">{getDisplayName(log.employee)}</span>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{log.employee.substring(0, 10)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={isClockIn ? 'clockin-badge' : 'clockout-badge'}>
                          {isClockIn ? 'CLOCK IN' : 'CLOCK OUT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {log.overtimeMinutes > 0 ? (
                          <span className="overtime-badge">+{log.overtimeMinutes} min</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => openInMaps(log.latitude, log.longitude)}
                          className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700 text-xs font-medium"
                        >
                          <MapPin className="w-3.5 h-3.5" /> View Map
                          <span className="text-[10px] text-gray-400">({log.latitude}, {log.longitude})</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="text-gray-400">No logs found for the selected filters.</div>
                    <button onClick={() => { setEmployeeFilter(''); setEventFilter('All'); }} className="text-primary-600 text-sm mt-2 hover:underline">Clear filters</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Period Summary Section */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="font-semibold text-xl tracking-tight">Employee Summary — {startDate && endDate && `${format(new Date(startDate), 'dd MMM')} to ${format(new Date(endDate), 'dd MMM yyyy')}`}</h2>
          <div className="text-xs px-3 py-1 bg-white border rounded-full text-gray-500">Totals across selected period • Auto-paired In/Out • Imported via CSV</div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3.5">Employee</th>
                <th className="text-left px-6 py-3.5">First Clock In</th>
                <th className="text-left px-6 py-3.5">Last Clock Out</th>
                <th className="text-right px-6 py-3.5">Worked (min)</th>
                <th className="text-right px-6 py-3.5">Overtime</th>
                <th className="text-center px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {periodSummary.length > 0 ? periodSummary.map((summary, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{summary.displayName}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{summary.firstInTime}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{summary.lastOutTime}</td>
                  <td className="px-6 py-4 text-right font-semibold">{summary.totalWorkedMinutes}</td>
                  <td className="px-6 py-4 text-right">
                    {summary.totalOvertime > 0 ? (
                      <span className="overtime-badge">+{summary.totalOvertime} min</span>
                    ) : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`status-pill text-xs ${summary.status.includes('Still Clocked In') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                      {summary.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No attendance data for the selected period. Import a BscScan CSV to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2 px-1">Worked time is calculated by pairing ClockIn → ClockOut events. Multiple sessions per day are summed. Location data is 0 for CSV imports (use live contract for geo data).</p>
      </div>
    </div>
  );
}

export default LogsView;
