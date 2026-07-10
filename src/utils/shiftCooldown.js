// src/utils/shiftCooldown.js
//
// Enforces "one shift per rolling window" on the APP side only.
// The smart contract does not rate-limit clockIn() beyond requiring
// the wallet isn't already clocked in — a direct contract call bypasses
// this. This is a UX guard, not a security guarantee.

export const SHIFT_COOLDOWN_HOURS = 9;
export const SHIFT_COOLDOWN_MS = SHIFT_COOLDOWN_HOURS * 60 * 60 * 1000;

/**
 * @param {string} wallet - employee wallet address
 * @param {Array} logs - flat clockinLogs array (see schema_drift.md)
 * @returns {number|null} rawTimestamp (ms) of the wallet's most recent
 *          ClockIn, or null if they have none
 */
export function getLastClockInTimestamp(wallet, logs) {
  const walletLower = wallet.toLowerCase();
  const clockIns = logs.filter(
    (l) => l.employee.toLowerCase() === walletLower && l.eventName === 'ClockIn'
  );
  if (clockIns.length === 0) return null;
  return Math.max(...clockIns.map((l) => l.rawTimestamp));
}

/**
 * @param {string} wallet
 * @param {Array} logs
 * @param {number} [now] - defaults to Date.now(), overridable for testing
 * @returns {{ allowed: boolean, msRemaining: number }}
 */
export function canClockIn(wallet, logs, now = Date.now()) {
  const last = getLastClockInTimestamp(wallet, logs);
  if (last === null) return { allowed: true, msRemaining: 0 };

  const msRemaining = SHIFT_COOLDOWN_MS - (now - last);
  return {
    allowed: msRemaining <= 0,
    msRemaining: Math.max(msRemaining, 0),
  };
}

/** Formats milliseconds remaining as "Xh Ym" for display in a button/tooltip. */
export function formatRemaining(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}
