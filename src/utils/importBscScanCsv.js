import Papa from 'papaparse';

const CONTRACT_ADDRESS = "0x4654675c8C068aC49047e9E607C34BE2492c945e".toLowerCase();
const CLOCKIN_SELECTOR = "0x687473fb";
const CLOCKOUT_SELECTOR = "0x6b92bb2a";

/**
 * Robust importer for real BscScan "Export Transactions" CSV files.
 * Handles:
 * - Quoted headers with spaces/parentheses (e.g. "DateTime (UTC)")
 * - CRLF line endings
 * - "To" sometimes empty while "ContractAddress" has the value
 * - Method column containing exact 4-byte selectors (0x687473fb / 0x6b92bb2a)
 * - Success filter via Status / ErrCode columns
 */
export function importBscScanCsv(file, existingLogs = []) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/^"|"$/g, ''), // strip surrounding quotes
      complete: (results) => {
        try {
          const rows = results.data || [];
          const newLogs = [];

          // Build dedup set from existing logs
          const seenKeys = new Set(
            (existingLogs || []).map(l =>
              `${(l.employee || '').toLowerCase()}-${l.rawTimestamp}-${l.eventName}`
            )
          );

          let importedCount = 0;
          let skippedCount = 0;
          const skipReasons = {
            noTxHash: 0,
            notContractInteraction: 0,
            unknownMethod: 0,
            failedTx: 0,
            badTimestamp: 0,
            duplicate: 0,
          };

          for (const row of rows) {
            if (!row || typeof row !== 'object') {
              skippedCount++;
              continue;
            }

            // --- Column access with strong normalization ---
            const get = (names) => {
              for (const name of names) {
                if (row[name] != null && row[name] !== '') {
                  return String(row[name]).trim();
                }
              }
              // Case-insensitive + normalized key lookup
              const normMap = {};
              Object.keys(row).forEach(k => {
                const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                normMap[nk] = row[k];
              });
              for (const name of names) {
                const nk = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normMap[nk] != null && normMap[nk] !== '') {
                  return String(normMap[nk]).trim();
                }
              }
              return '';
            };

            const txHash = get(['Transaction Hash', 'Txhash', 'TxHash', 'hash']);
            const fromAddr = get(['From', 'from']).toLowerCase();
            const toAddr = get(['To', 'to', 'ContractAddress', 'contractAddress']).toLowerCase();
            const unixStr = get(['UnixTimestamp', 'UnixTimeStamp', 'timestamp']);
            const method = get(['Method', 'method', 'Function']).toLowerCase();
            const status = get(['Status', 'status', 'ErrCode']).toLowerCase();

            if (!txHash || !fromAddr) {
              skipReasons.noTxHash++;
              skippedCount++;
              continue;
            }

            // Only successful transactions
            if (status && status !== '0' && status !== '0x1' && status !== '') {
              skipReasons.failedTx++;
              skippedCount++;
              continue;
            }

            // Must be targeting our contract
            const isOurContract = toAddr === CONTRACT_ADDRESS ||
                                  method.includes(CLOCKIN_SELECTOR) ||
                                  method.includes(CLOCKOUT_SELECTOR);

            if (!isOurContract) {
              skipReasons.notContractInteraction++;
              skippedCount++;
              continue;
            }

            // Determine event type from Method column (most reliable in BscScan exports)
            let eventName = null;
            if (method === CLOCKIN_SELECTOR || method.includes('clockin')) {
              eventName = 'ClockIn';
            } else if (method === CLOCKOUT_SELECTOR || method.includes('clockout')) {
              eventName = 'ClockOut';
            } else {
              skipReasons.unknownMethod++;
              skippedCount++;
              continue;
            }

            const unix = parseInt(unixStr, 10);
            if (isNaN(unix) || unix < 1600000000) {
              skipReasons.badTimestamp++;
              skippedCount++;
              continue;
            }

            const rawTimestamp = unix * 1000;
            const key = `${fromAddr}-${rawTimestamp}-${eventName}`;

            if (seenKeys.has(key)) {
              skipReasons.duplicate++;
              skippedCount++;
              continue;
            }
            seenKeys.add(key);

            // Format nice display timestamp (same style as before)
            const date = new Date(rawTimestamp);
            const options = {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            };
            const localTimestamp = new Intl.DateTimeFormat("en-US", options).format(date);

            newLogs.push({
              eventName,
              employee: fromAddr,
              timestamp: localTimestamp,
              rawTimestamp,
              latitude: "0",
              longitude: "0",
              overtimeMinutes: 0,
            });

            importedCount++;
          }

          // Merge + sort (newest first)
          const mergedLogs = [...(existingLogs || []), ...newLogs]
            .sort((a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0));

          resolve({
            logs: mergedLogs,
            imported: importedCount,
            skipped: skippedCount,
            totalRows: rows.length,
            skipBreakdown: skipReasons,
          });
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err)
    });
  });
}
