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

export { getRelativePath } from "./getRelativePath.js";
export { ObjectId } from "./ObjectId.js";
export { uid } from "./uid.js";
export { checkValue } from "./checkValue.js";
export { isValidDate } from "./isValidDate.js";
export { objectToSearchParams } from "./objectToSearchParams.js";
export { dotNotationToObject } from "./dotNotationToObject.js";
export { objectToDotNotation } from "./objectToDotNotation.js";
export { getValueFromObject } from "./getValueFromObject.js";
export { createUpdate } from "./createUpdate.js";
export { domParser } from "./domParser.js";
export { parseTextToHtml } from "./parseTextToHtml.js";
export { escapeHtml } from "./escapeHtml.js";
export { cssPath } from "./cssPath.js";
export { queryElements, checkMediaQueries } from "./queryElements.js";
export { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./dataQuery.js";
export { getAttributes, getAttributeNames, setAttributeNames } from "./attributes.js";
export { clickedElement } from "./clickedElement.js";
export { processOperators, processOperatorsAsync, customOperators, safeParse } from "./operators.js";

import { getRelativePath } from "./getRelativePath.js";
import { ObjectId } from "./ObjectId.js";
import { uid } from "./uid.js";
import { checkValue } from "./checkValue.js";
import { isValidDate } from "./isValidDate.js";
import { objectToSearchParams } from "./objectToSearchParams.js";
import { dotNotationToObject } from "./dotNotationToObject.js";
import { objectToDotNotation } from "./objectToDotNotation.js";
import { getValueFromObject } from "./getValueFromObject.js";
import { createUpdate } from "./createUpdate.js";
import { domParser } from "./domParser.js";
import { parseTextToHtml } from "./parseTextToHtml.js";
import { escapeHtml } from "./escapeHtml.js";
import { cssPath } from "./cssPath.js";
import { queryElements, checkMediaQueries } from "./queryElements.js";
import { queryData, searchData, sortData, isEqualArray, isEqualObject } from "./dataQuery.js";
import { getAttributes, getAttributeNames, setAttributeNames } from "./attributes.js";
import { clickedElement } from "./clickedElement.js";
import { processOperators, processOperatorsAsync, customOperators, safeParse } from "./operators.js";

const utils = {
	getRelativePath,
	ObjectId,
	uid,
	checkValue,
	isValidDate,
	dotNotationToObject,
	objectToDotNotation,
	getValueFromObject,
	objectToSearchParams,
	domParser,
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
	clickedElement,
	processOperators,
	processOperatorsAsync,
	customOperators,
	safeParse

};

export default utils;
