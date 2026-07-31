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

export { cloudProviders } from "./modules/cloudProviders.js";
export { getClientInfo } from "./modules/getClientInfo.js";
export { getRelativePath } from "./modules/getRelativePath.js";
export { getClockOffset } from "./modules/getClockOffset.js";
export { ObjectId } from "./modules/ObjectId.js";
export { uuid } from "./modules/uuid.js";
export { ulid, ulidDecode } from "./modules/ulid.js";
export { checkValue } from "./modules/checkValue.js";
export { isValidDate } from "./modules/isValidDate.js";
export { objectToSearchParams } from "./modules/objectToSearchParams.js";
export { dotNotationToObject } from "./modules/dotNotationToObject.js";
export { objectToDotNotation } from "./modules/objectToDotNotation.js";
export { getValueFromObject } from "./modules/getValueFromObject.js";
export { createUpdate } from "./modules/createUpdate.js";
export { domParser } from "./modules/domParser.js";
export { parseTextToHtml } from "./modules/parseTextToHtml.js";
export { escapeHtml } from "./modules/escapeHtml.js";
export { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./modules/dataQuery.js";
export { astSync, astAsync } from "./modules/ast/index.js";
export { processOperators, processOperatorsAsync } from "./modules/ast/operators.js";
export { HTMLScanner } from "./modules/html-scanner.js";
export { generateJWT, verifySignature, buildAuthHeaders, generateKeyPair, signVapid } from './modules/security.js';

import { cloudProviders } from "./modules/cloudProviders.js";
import { getClientInfo } from "./modules/getClientInfo.js";
import { getRelativePath } from "./modules/getRelativePath.js";
import { getClockOffset } from "./modules/getClockOffset.js";
import { ObjectId } from "./modules/ObjectId.js";
import { uuid } from "./modules/uuid.js";
import { ulid, ulidDecode } from "./modules/ulid.js";
import { checkValue } from "./modules/checkValue.js";
import { isValidDate } from "./modules/isValidDate.js";
import { objectToSearchParams } from "./modules/objectToSearchParams.js";
import { dotNotationToObject } from "./modules/dotNotationToObject.js";
import { objectToDotNotation } from "./modules/objectToDotNotation.js";
import { getValueFromObject } from "./modules/getValueFromObject.js";
import { createUpdate } from "./modules/createUpdate.js";
import { domParser } from "./modules/domParser.js";
import { parseTextToHtml } from "./modules/parseTextToHtml.js";
import { escapeHtml } from "./modules/escapeHtml.js";
import { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./modules/dataQuery.js";
import { astSync, astAsync } from "./modules/ast/index.js";
import { processOperators, processOperatorsAsync } from "./modules/ast/operators.js";
import { HTMLScanner } from "./modules/html-scanner.js";
import { generateJWT, verifySignature, buildAuthHeaders, generateKeyPair, signVapid } from './modules/security.js';

const utils = {
    cloudProviders,
    getClientInfo,
    getRelativePath,
	getClockOffset,
    ObjectId,
    uuid,
    ulid,
    ulidDecode,
    checkValue,
    isValidDate,
    dotNotationToObject,
    objectToDotNotation,
    getValueFromObject,
    objectToSearchParams,
    domParser,
    parseTextToHtml,
    escapeHtml,
    queryData,
    searchData,
    sortData,
    isEqualArray, 
    isEqualObject,
    createUpdate,
    astSync,
    astAsync,
    processOperators,
    processOperatorsAsync,
    HTMLScanner,
    generateJWT, 
    verifySignature, 
    buildAuthHeaders,
    generateKeyPair, 
    signVapid
};

export default utils;