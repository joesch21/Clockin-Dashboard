// src/hooks/useClockInEligibility.js
//
// Example wiring for shiftCooldown.js into a clock-in button.
// Adjust the import path / logs source to match wherever your
// actual worker-facing clock-in component lives.

import { useMemo } from 'react';
import { canClockIn, formatRemaining } from '../utils/shiftCooldown';

/**
 * @param {string} wallet - the connected wallet's address
 * @param {Array} logs - flat clockinLogs array
 * @returns {{ allowed: boolean, msRemaining: number, message: string|null }}
 */
export function useClockInEligibility(wallet, logs) {
  return useMemo(() => {
    if (!wallet) return { allowed: false, msRemaining: 0, message: 'Connect a wallet first' };

    const { allowed, msRemaining } = canClockIn(wallet, logs);
    return {
      allowed,
      msRemaining,
      message: allowed ? null : `Next shift available in ${formatRemaining(msRemaining)}`,
    };
  }, [wallet, logs]);
}

// --- Example usage in your clock-in component ---
//
// const { allowed, message } = useClockInEligibility(connectedWallet, logs);
//
// <button
//   disabled={!allowed}
//   onClick={handleClockIn}
//   title={message || 'Clock in for your shift'}
// >
//   {allowed ? 'Clock In' : message}
// </button>
