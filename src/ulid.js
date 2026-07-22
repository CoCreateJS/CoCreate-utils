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

import { getClockOffset } from "./getClockOffset.js";

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

function encodeTime(now, len) {
  let str = '';
  for (let i = len; i > 0; i--) {
    str = ENCODING[now % 32] + str;
    now = Math.floor(now / 32);
  }
  return str;
}

function encodeRandom(len) {
  let str = '';
  const bytes = new Uint8Array(len);
  const cryptoObj = isBrowser ? (window.crypto || window.msCrypto) : globalThis.crypto;
  cryptoObj.getRandomValues(bytes);
  
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i] % 32];
  }
  return str;
}

export function ulid() {
  const now = Date.now() + getClockOffset();
  return encodeTime(now, 10) + encodeRandom(16);
}

/**
 * Decodes the timestamp from a ULID string.
 * 
 * @param {string} ulidStr - The 26-character ULID string.
 * @returns {number} The extracted Unix timestamp in milliseconds.
 */
export function ulidDecode(ulidStr) {
    if (ulidStr.length !== 26) throw new Error("Invalid ULID length");

    const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const timeChars = ulidStr.substring(0, 10).toUpperCase();
    
    let time = 0;
    for (let i = 0; i < 10; i++) {
        const charValue = ENCODING.indexOf(timeChars[i]);
        if (charValue === -1) throw new Error("Invalid ULID character");
        time = (time * 32) + charValue;
    }
    
    return time;
}

export default ulid;