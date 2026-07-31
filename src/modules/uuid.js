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

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

/**
 * Generates an RFC 4122 compliant UUID Version 4 (Universally Unique Identifier).
 * 
 * By default, this returns a standard 36-character string. If a custom length 
 * less than 36 is provided, it returns a truncated unique identifier (UID).
 *
 * @param {number} [length=36] - The desired length of the returned identifier (maximum 36).
 * @returns {string} A standard UUIDv4 or a truncated custom-length unique identifier.
 * 
 * @example
 * // Returns standard UUIDv4: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6"
 * uuid(); 
 * 
 * @example
 * // Returns truncated unique identifier: "f81d4fae"
 * uuid(8); 
 */
export function uuid(length = 36) {
    const pattern = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    
    // Cap the length to the maximum standard UUID size (36 characters)
    const targetLength = Math.min(length, 36);

    // Cryptographically secure random byte generation across Browser and Node environments
    const randomBytes = new Uint8Array(36);
    const cryptoObj = isBrowser ? (window.crypto || window.msCrypto) : globalThis.crypto;
    
    if (cryptoObj && cryptoObj.getRandomValues) {
        cryptoObj.getRandomValues(randomBytes);
    } else {
        // Fallback if environment crypto API is unavailable
        for (let i = 0; i < 36; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
    }

    let byteIndex = 0;
    const fullUuid = pattern.replace(/[xy]/g, (char) => {
        const randomValue = randomBytes[byteIndex++] % 16;
        const mappedValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
        return mappedValue.toString(16);
    });

    return fullUuid.substring(0, targetLength);
}

export default uuid;