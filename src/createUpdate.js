import { dotNotationToObject } from "./dotNotationToObject.js";
import { objectToDotNotation } from "./objectToDotNotation.js";
import { getValueFromObject } from "./getValueFromObject.js";
import { isEqualArray, isEqualObject } from "./dataQuery.js";

function dotNotationToObjectUpdate(data, object = {}) {
	try {
		for (const key of Object.keys(data)) {
			let newObject = object;
			let keys = key
				.replace(/\[(\d+)\]/g, ".$1")
				.split(".")
				.map((k) => (isNaN(k) ? k : Number(k)));
			let value = data[key];
			let operator;
			if (keys[0].startsWith("$")) operator = keys.shift();

			let length = keys.length - 1;
			for (let i = 0; i < keys.length; i++) {
				if (length == i) {
					if (operator) {
						let operators = [
							"$rename",
							"$inc",
							"$push",
							"$each",
							"$splice",
							"$unset",
							"$delete",
							"$slice",
							"$pop",
							"$shift",
							"$addToSet",
							"$pull"
						];
						if (!operators.includes(operator)) continue;
						if (operator === "$rename") {
							newObject[value] = newObject[keys[i]];
							delete newObject[keys[i]];
						} else if (
							operator === "$delete" ||
							operator === "$unset" ||
							operator === "$slice"
						) {
							if (typeof keys[i] === "number") {
								newObject.splice(keys[i], 1);
							} else {
								delete newObject[keys[i]];
							}
						} else if (operator === "$shift") {
							newObject[keys[i]].shift();
						} else if (operator === "$pop") {
							newObject[keys[i]].pop();
						} else if (operator === "$addToSet") {
							if (!newObject[keys[i]]) newObject[keys[i]] = [];
							let exists;
							if (Array.isArray(value)) {
								exists = newObject[keys[i]].some(
									(item) => Array.isArray(item) && isEqualArray(item, value)
								);
							} else if (
								typeof value === "object" &&
								value !== null
							) {
								exists = newObject[keys[i]].some(
									(item) =>
										typeof item === "object" && isEqualObject(item, value)
								);
							} else {
								exists = newObject[keys[i]].includes(value);
							}
							if (!exists) newObject[keys[i]].push(value);
						} else if (operator === "$pull") {
							if (!newObject[keys[i]]) continue;
							if (Array.isArray(value)) {
								newObject[keys[i]] = newObject[keys[i]].filter(
									(item) => !Array.isArray(item) || !isEqualArray(item, value)
								);
							} else if (
								typeof value === "object" &&
								value !== null
							) {
								newObject[keys[i]] = newObject[keys[i]].filter(
									(item) =>
										typeof item !== "object" || !isEqualObject(item, value)
								);
							} else {
								newObject[keys[i]] = newObject[keys[i]].filter(
									(item) => item !== value
								);
							}
						} else if (operator === "$push" || operator === "$splice") {
							if (
								typeof keys[i] === "number" &&
								newObject.length >= keys[i]
							)
								newObject.splice(keys[i], 0, value);
							else if (newObject[keys[i]]) newObject[keys[i]].push(value);
							else newObject[keys[i]] = [value];
						} else if (operator === "$each") {
							if (!Array.isArray(value)) value = [value];
							if (typeof keys[i] === "number")
								newObject.splice(keys[i], 0, ...value);
							else newObject[keys[i]].push(...value);
						} else if (operator === "$inc") {
							if (
								!newObject[keys[i]] ||
								typeof newObject[keys[i]] !== "number"
							)
								newObject[keys[i]] = value;
							else newObject[keys[i]] += value;
						}
					} else if (value === undefined) {
						if (typeof keys[i] === "number") newObject.splice(keys[i], 1);
						else delete newObject[keys[i]];
					} else if (typeof keys[i] === "number") {
						newObject.splice(keys[i], 0, value);
					} else {
						newObject[keys[i]] = value;
					}
				} else if (
					typeof keys[i + 1] === "number" &&
					!Array.isArray(newObject[keys[i]])
				) {
					newObject[keys[i]] = [];
				} else {
					newObject[keys[i]] = newObject[keys[i]] || {};
				}
				newObject = newObject[keys[i]];
			}
		}
		return object;
	} catch (error) {
		console.log("Error converting dot notation to object", error);
		return false;
	}
}

export function createUpdate(update, data, globalOpertors) {
	let operatorKeys = {};
	if (globalOpertors) operatorKeys = { ...globalOpertors };

	Object.keys(data).forEach((key) => {
		if (key.startsWith("$")) {
			if (!key.includes("."))
				for (let oldkey of Object.keys(data[key]))
					operatorKeys[key + "." + oldkey] = data[key][oldkey];
			else operatorKeys[key] = data[key];
		} else if (
			typeof data[key] === "string" &&
			data[key].startsWith("$")
		) {
			operatorKeys[data[key] + "." + key] = data[key];
		} else if (key.endsWith("]")) {
			const regex = /^(.*(?:\[\d+\].*?)?)\[(.*?)\](?:\[\])?$/;
			const match = key.match(regex);
			if (match[2] === "") operatorKeys["$push." + match[1]] = data[key];
			else {
				let index = parseInt(match[2], 10);
				if (Number.isNaN(index))
					operatorKeys[match[2] + "." + match[1]] = data[key];
				else operatorKeys[key] = data[key];
			}
		} else if (key.includes(".")) {
			operatorKeys[key] = data[key];
		} else if (data[key] === undefined) {
			delete update[key];
		} else update[key] = data[key];
	});

	return dotNotationToObjectUpdate(operatorKeys, update);
}

export { dotNotationToObject, objectToDotNotation, getValueFromObject };
