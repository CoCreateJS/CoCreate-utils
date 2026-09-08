import { getValueFromObject } from "./getValueFromObject.js";
import { isValidDate } from "./isValidDate.js";

export function isEqualArray(arr1, arr2) {
	if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
		return false;
	}
	if (arr1.length !== arr2.length) {
		return false;
	}
	for (let i = 0; i < arr1.length; i++) {
		if (!isEqualValue(arr1[i], arr2[i])) {
			return false;
		}
	}
	return true;
}

export function isEqualObject(obj1, obj2) {
	if (Object.is(obj1, obj2)) return true;
	if (!obj1 || !obj2 || typeof obj1 !== "object" || typeof obj2 !== "object") {
		return false;
	}
	if (obj1 instanceof Date || obj2 instanceof Date) {
		return obj1 instanceof Date &&
			obj2 instanceof Date &&
			obj1.getTime() === obj2.getTime();
	}
	if (Array.isArray(obj1) || Array.isArray(obj2)) {
		return isEqualArray(obj1, obj2);
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);

	if (keys1.length !== keys2.length) {
		return false;
	}

	for (const key of keys1) {
		if (!Object.prototype.hasOwnProperty.call(obj2, key) || !isEqualValue(obj1[key], obj2[key])) {
			return false;
		}
	}

	return true;
}

function isEqualValue(value1, value2) {
	if (Object.is(value1, value2)) return true;
	if (Array.isArray(value1) || Array.isArray(value2)) {
		return isEqualArray(value1, value2);
	}
	if (
		value1 &&
		value2 &&
		typeof value1 === "object" &&
		typeof value2 === "object"
	) {
		return isEqualObject(value1, value2);
	}
	return false;
}

function queryMatch(data, query) {
	for (let key of Object.keys(query)) {
		let dataValue;
		try {
			dataValue = getValueFromObject(data, key, true);
		} catch (error) {
			return false;
		}

		if (
			typeof query[key] === "string" ||
			typeof query[key] === "number" ||
			typeof query[key] === "boolean"
		) {
			if (Array.isArray(dataValue)) return dataValue.includes(query[key]);
			else return dataValue === query[key];
		} else if (Array.isArray(query[key])) {
			if (Array.isArray(dataValue)) {
				return isEqualArray(dataValue, query[key]);
			} else {
				return false;
			}
		} else {
			for (let property of Object.keys(query[key])) {
				if (property === "$options") continue;
				if (!property.startsWith("$")) {
					if (typeof dataValue !== "object") {
						return false;
					} else
						return queryMatch(
							{ [property]: getValueFromObject(dataValue, property) },
							{ [property]: query[key][property] }
						);
				} else {
					let queryValue = query[key][property];
					if (isValidDate(queryValue) && isValidDate(dataValue)) {
						queryValue = new Date(queryValue);
						dataValue = new Date(dataValue);
					}
					let queryStatus = false;
					switch (property) {
						case "$eq":
							queryStatus = isEqualValue(dataValue, queryValue);
							break;
						case "$ne":
							queryStatus = !isEqualValue(dataValue, queryValue);
							break;
						case "$not":
							queryStatus = !queryMatch(data, {
								[key]: query[key]["$not"]
							});
							break;
						case "$lt":
							queryStatus = dataValue < queryValue;
							break;
						case "$lte":
							queryStatus = dataValue <= queryValue;
							break;
						case "$gt":
							queryStatus = dataValue > queryValue;
							break;
						case "$gte":
							queryStatus = dataValue >= queryValue;
							break;
						case "$in":
							if (Array.isArray(dataValue)) {
								queryStatus = dataValue.some((element) =>
									queryValue.includes(element)
								);
							} else {
								queryStatus = queryValue.includes(dataValue);
							}
							break;
						case "$nin":
							if (Array.isArray(dataValue)) {
								queryStatus = !dataValue.some((element) =>
									queryValue.includes(element)
								);
							} else {
								queryStatus = !queryValue.includes(dataValue);
							}
							break;
						case "$all":
							if (Array.isArray(dataValue) && Array.isArray(queryValue)) {
								queryStatus = queryValue.every((element) =>
									dataValue.includes(element)
								);
							}
							break;
						case "$elemMatch":
							if (Array.isArray(data[key])) {
								queryStatus = data[key].some((element) =>
									queryMatch(element, query[key][property])
								);
							}
							break;
						case "$size":
							if (Array.isArray(dataValue)) {
								queryStatus = dataValue.length === queryValue;
							}
							break;
						case "$exists":
							queryStatus = queryValue
								? data.hasOwnProperty(key)
								: !data.hasOwnProperty(key);
							break;
						case "$regex":
							if (typeof dataValue === "string") {
								let regexFlag = query[key]["$options"] || "";
								let regex = new RegExp(queryValue, regexFlag);
								queryStatus = regex.test(dataValue);
							}
							break;
						case "$type":
							let dataType = typeof dataValue;
							if (Array.isArray(dataValue)) {
								dataType = "array";
							}
							queryStatus = dataType === queryValue;
							break;
						case "$mod":
							if (
								typeof dataValue === "number" &&
								Array.isArray(queryValue) &&
								queryValue.length === 2
							) {
								const [divisor, remainder] = queryValue;
								queryStatus = dataValue % divisor === remainder;
							}
							break;
						case "$where":
							if (typeof queryValue === "function") {
								try {
								} catch (error) {
									console.error(
										"Error in queryData $where function:",
										error
									);
								}
							}
							break;
						default:
							console.log("unknown operator");
							break;
					}
					if (!queryStatus) return false;
				}
			}
			return true;
		}
	}
}

export function queryData(data, query) {
	if (!query) return true
	if (query.$and) {
		for (let i = 0; i < query.$and.length; i++) {
			if (!queryData(data, query.$and[i])) return false;
		}
	}

	if (query.$nor) {
		for (let i = 0; i < query.$nor.length; i++) {
			if (queryData(data, query.$nor[i])) return false;
		}
	}

	for (let key of Object.keys(query)) {
		if (key === "$and" || key === "$or") continue;
		if (!queryMatch(data, { [key]: query[key] })) return false;
	}

	if (query.$or) {
		for (let i = 0; i < query.$or.length; i++) {
			if (queryData(data, query.$or[i])) return true;
		}
	}

	return true;
}

export function searchData(data, search) {
	if (!search) return true;
	if (!Array.isArray(search)) search = [search];
	for (let i = 0; i < search.length; i++) {
		let searchValue = search[i].value;
		if (!Array.isArray(searchValue)) searchValue = [searchValue];
		for (let key in data) {
			let value = data[key];
			let status = false;
			switch (typeof value) {
				case "number":
					value = value.toString();
					break;
				case "object":
					value = JSON.stringify(value);
					break;
				case "function":
					value = value.toString();
					break;
			}
			if (search[i].caseSensitive != "true" || search[i].caseSensitive != true)
				value = value.toLowerCase();

			for (let i = 0; i < searchValue.length; i++) {
				let searchString = searchValue[i];
				if (
					search[i].caseSensitive != "true" ||
					search[i].caseSensitive != true
				)
					searchString = searchString.toLowerCase();

				if (searchString === "" && search[i].operator === "and") {
					if (value !== "") return false;
				}

				if (value.indexOf(searchString) > -1) status = true;

				if (status) return true;
				else if (search[i].operator == "and") return false;
			}
		}
		if (search[i].value.length && search[i].operator == "or") return false;
	}
	return true;
}

function getMongoTypeOrder(value) {
	if (value?._bsontype === "MinKey") return 0;
	if (value == null) return 1;
	if (typeof value === "number" || typeof value === "bigint") return 2;
	if (typeof value === "string" || typeof value === "symbol") return 3;
	if (Array.isArray(value)) return value.length ? 5 : 0.5;
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) return 6;
	if (value?._bsontype === "ObjectId" || value?.constructor?.name === "ObjectId")
		return 7;
	if (typeof value === "boolean") return 8;
	if (value instanceof Date) return 9;
	if (value?._bsontype === "Timestamp") return 10;
	if (value instanceof RegExp) return 11;
	if (typeof value === "function") return 12;
	if (value?._bsontype === "MaxKey") return 14;
	if (typeof value === "object") return 4;
	return 13;
}

function compareStrings(a, b) {
	const aString = String(a);
	const bString = String(b);
	if (aString === bString) return 0;
	return aString < bString ? -1 : 1;
}

function compareMongoObjects(a, b) {
	const aEntries = Object.entries(a);
	const bEntries = Object.entries(b);
	const length = Math.min(aEntries.length, bEntries.length);
	for (let index = 0; index < length; index++) {
		const [aKey, aValue] = aEntries[index];
		const [bKey, bValue] = bEntries[index];
		const typeComparison = getMongoTypeOrder(aValue) - getMongoTypeOrder(bValue);
		if (typeComparison) return Math.sign(typeComparison);
		const keyComparison = compareStrings(aKey, bKey);
		if (keyComparison) return keyComparison;
		const valueComparison = compareMongoValues(aValue, bValue);
		if (valueComparison) return valueComparison;
	}
	return Math.sign(aEntries.length - bEntries.length);
}

function getArraySortValue(value, direction) {
	if (!value.length) return value;
	const sorted = [...value].sort(compareMongoValues);
	return direction === "desc" ? sorted[sorted.length - 1] : sorted[0];
}

function compareMongoValues(a, b, direction = "asc") {
	if (Array.isArray(a)) a = getArraySortValue(a, direction);
	if (Array.isArray(b)) b = getArraySortValue(b, direction);
	if (Object.is(a, b) || (a == null && b == null)) return 0;

	const typeComparison = getMongoTypeOrder(a) - getMongoTypeOrder(b);
	if (typeComparison) return Math.sign(typeComparison);
	if (a == null || b == null) return a == null ? -1 : 1;

	if (typeof a === "number" || typeof a === "bigint")
		return a < b ? -1 : a > b ? 1 : 0;
	if (typeof a === "string" || typeof a === "symbol")
		return compareStrings(a, b);
	if (typeof a === "boolean") return Number(a) - Number(b);
	if (a instanceof Date) return Math.sign(a.getTime() - b.getTime());
	if (a instanceof RegExp) return compareStrings(a.toString(), b.toString());
	if (typeof a === "object") return compareMongoObjects(a, b);
	return compareStrings(a, b);
}

export function sortData(data, sort) {
	return data.sort((a, b) => {
		for (let i = 0; i < sort.length; i++) {
			const key = sort[i].key;
			const direction = sort[i].direction === "desc" ? "desc" : "asc";
			const aValue = getValueFromObject(a, key);
			const bValue = getValueFromObject(b, key);
			const comparison = compareMongoValues(aValue, bValue, direction);
			if (comparison) return direction === "desc" ? -comparison : comparison;
		}
		return 0;
	});
}
