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

export function sortData(data, sort) {
	return data.sort((a, b) => {
		for (let i = 0; i < sort.length; i++) {
			let key = sort[i].key;
			if (a[key] == null && b[key] == null) continue;
			if (a[key] == null) return sort[i].direction === "desc" ? -1 : 1;
			if (b[key] == null) return sort[i].direction === "desc" ? 1 : -1;

			if (typeof a[key] !== typeof b[key]) {
				return typeof a[key] < typeof b[key] ? -1 : 1;
			}

			if (a[key] !== b[key]) {
				if (typeof a[key] === "string") {
					return sort[i].direction === "desc"
						? b[key].localeCompare(a[key])
						: a[key].localeCompare(b[key]);
				} else {
					return sort[i].direction === "desc" ? b[key] - a[key] : a[key] - b[key];
				}
			}
		}
		return 0;
	});
}
