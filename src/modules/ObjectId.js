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

let counter = 0;

export function ObjectId(inputId) {
    if (inputId && /^[0-9a-fA-F]{24}$/.test(inputId)) {
        return {
            timestamp: inputId.substring(0, 8),
            processId: inputId.substring(8, 20),
            counter: inputId.substring(20),
            toString: function () {
                return this.timestamp + this.processId + this.counter;
            }
        };
    } else if (inputId) {
        throw new Error("Invalid ObjectId provided.");
    }

    const now = Date.now() + getClockOffset();
    const timestampHex = Math.floor(now / 1000)
        .toString(16)
        .padStart(8, "0");

    const processIdHex = Math.floor(Math.random() * 0x100000000000)
        .toString(16)
        .padStart(12, "0");

    counter = (counter + 1) % 10000;
    if (counter < 2) {
        counter = Math.floor(Math.random() * (5000 - 100 + 1)) + 100;
    }

    const counterHex = counter.toString(16).padStart(4, "0");

    return {
        timestamp: timestampHex,
        processId: processIdHex,
        counter: counterHex,
        toString: function () {
            return this.timestamp + this.processId + this.counter;
        }
    };
}

export default ObjectId;