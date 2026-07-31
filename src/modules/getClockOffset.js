/********************************************************************************
 * Copyright (C) 2026 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 ********************************************************************************/

let clockOffset = 0;
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Runs EXACTLY ONCE across your entire app load
if (isBrowser) {
  const t0 = Date.now();
  fetch('/api/ping', { method: 'HEAD' })
    .then((res) => {
      const serverDateStr = res.headers.get('date');
      if (serverDateStr) {
        const t1 = Date.now();
        const tServer = new Date(serverDateStr).getTime();
        const latency = Math.floor((t1 - t0) / 2);
        clockOffset = tServer - (t0 + latency);
      }
    })
    .catch(() => {
      clockOffset = 0;
    });
}

/**
 * Returns the cached time offset in milliseconds.
 * Always 0 on the server (NTP-managed) or fallback.
 */
export function getClockOffset() {
  return clockOffset;
}