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

export { getClientInfo } from "./modules/getClientInfo.js";
export { cloudProviders } from "./modules/cloudProviders.js";
export { getRelativePath } from "./modules/getRelativePath.js";
export { getClockOffset } from "./modules/getClockOffset.js";
export { ObjectId } from "./modules/ObjectId.js";
export { uuid } from "./modules/uuid.js";
export { ulid, ulidDecode } from "./modules/ulid.js";
export { checkValue } from "./modules/checkValue.js";
export { isValidDate } from "./modules/isValidDate.js";
export { objectToSearchParams } from "./modules/objectToSearchParams.js";
export { searchParamsToObject } from "./modules/searchParamsToObject.js";
export { dotNotationToObject } from "./modules/dotNotationToObject.js";
export { objectToDotNotation } from "./modules/objectToDotNotation.js";
export { getValueFromObject } from "./modules/getValueFromObject.js";
export { resolveProperty } from "./modules/resolveProperty.js";
export { createUpdate } from "./modules/createUpdate.js";
export { parseTextToHtml } from "./modules/parseTextToHtml.js";
export { escapeHtml } from "./modules/escapeHtml.js";
export { cssPath } from "./modules/cssPath.js";
export { queryElements, checkMediaQueries } from "./modules/queryElements.js";
export { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./modules/dataQuery.js";
export { getAttributes, getAttributeNames, setAttributeNames } from "./modules/attributes.js";
export { astSync, astAsync } from "./modules/ast/index.js";
export { processOperators, processOperatorsAsync } from "./modules/ast/operators.js";
export { hasSelection } from "./modules/selection.js";

import { getClientInfo } from "./modules/getClientInfo.js";
import { cloudProviders } from "./modules/cloudProviders.js";
import { getRelativePath } from "./modules/getRelativePath.js";
import { getClockOffset } from "./modules/getClockOffset.js";
import { ObjectId } from "./modules/ObjectId.js";
import { uuid } from "./modules/uuid.js";
import { ulid, ulidDecode } from "./modules/ulid.js";
import { checkValue } from "./modules/checkValue.js";
import { isValidDate } from "./modules/isValidDate.js";
import { objectToSearchParams } from "./modules/objectToSearchParams.js";
import { searchParamsToObject } from "./modules/searchParamsToObject.js";
import { dotNotationToObject } from "./modules/dotNotationToObject.js";
import { objectToDotNotation } from "./modules/objectToDotNotation.js";
import { getValueFromObject } from "./modules/getValueFromObject.js";
import { resolveProperty } from "./modules/resolveProperty.js";
import { createUpdate } from "./modules/createUpdate.js";
import { parseTextToHtml } from "./modules/parseTextToHtml.js";
import { escapeHtml } from "./modules/escapeHtml.js";
import { cssPath } from "./modules/cssPath.js";
import { queryElements, checkMediaQueries } from "./modules/queryElements.js";
import { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./modules/dataQuery.js";
import { getAttributes, getAttributeNames, setAttributeNames } from "./modules/attributes.js";
import { astSync, astAsync } from "./modules/ast/index.js";
import { processOperators, processOperatorsAsync } from "./modules/ast/operators.js";
import { hasSelection } from "./modules/selection.js";

import * as valueHandlers from "./modules/valueHandler.js";

const utils = {
    ...valueHandlers,
    getClientInfo,
    cloudProviders,
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
    resolveProperty,
    objectToSearchParams,
    searchParamsToObject,
    parseTextToHtml,
    escapeHtml,
    cssPath,
    queryElements,
    checkMediaQueries,
    queryData,
    searchData,
    sortData,
    isEqualArray, 
    isEqualObject,
    createUpdate,
    getAttributes,
    setAttributeNames,
    getAttributeNames,
    astSync,
    astAsync,
    processOperators,
    processOperatorsAsync,
    hasSelection
};

export default utils;

export { getValueAttribute, transformValue, convertValue, caseHandler, regex, encodeValue, decodeValue, parseJson, toBoolean, toArray } from "./modules/valueHandler.js";
