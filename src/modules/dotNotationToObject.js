export function dotNotationToObject(data, obj = {}) {
	try {
		let arrayGroup = {};

		for (const key of Object.keys(data)) {
			let value = data[key];
			let newObject = obj;
			let oldObject = new Object(obj);
			let keys = key.split(".");
			let length = keys.length - 1;

			for (let i = 0; i < keys.length; i++) {
				if (keys[i].endsWith("]")) {
					if (keys[i].endsWith("[]")) {
						let baseKey = keys[i].slice(0, -2);

						if (!Array.isArray(newObject[baseKey])) {
							newObject[baseKey] = [];
						}

						if (length == i) {
							if (Array.isArray(value)) {
								newObject[baseKey].push(...value);
							} else {
								newObject[baseKey].push(value);
							}
						}
					} else if (/\[([0-9]+)\]/g.test(keys[i])) {
						let [k, index] = keys[i].split("[");
						index = index.slice(0, -1);

						if (!Array.isArray(newObject[k])) {
							newObject[k] = [];
						}

						if (length == i) {
							if (value === undefined) {
								newObject[k].splice(index, 1);
							} else {
								newObject[k][index] = value;
							}
						} else {
							newObject[k][index] = oldObject[k][index] || {};
							newObject = newObject[k][index];
							oldObject = oldObject[k][index];
						}
					} else if (/\[\w\]/g.test(keys[i])) {
						let [k, group] = keys[i].split("[");
						group = group.slice(0, -1);

						if (!Array.isArray(newObject[k])) {
							newObject[k] = [];
						}

						let index;
						if (arrayGroup[keys.slice(0, i + 1).join(".")]) {
							index = arrayGroup[keys.slice(0, i + 1).join(".")];
						} else {
							index = newObject[k].length;
							arrayGroup[keys.slice(0, i + 1).join(".")] = index;
							newObject[k][index] = {};
						}

						if (length == i) {
							newObject[k][index] = value;
						} else {
							newObject = newObject[k][index];
						}
					}
				} else {
					if (length == i) {
						if (value === undefined) {
							delete newObject[keys[i]];
						} else {
							newObject[keys[i]] = value;
						}
					} else {
						newObject[keys[i]] = oldObject[keys[i]] || {};
						newObject = newObject[keys[i]];
						oldObject = oldObject[keys[i]];
					}
				}
			}
		}
		return obj;
	} catch (error) {
		console.log("Error converting dot notation to object", error);
		return false;
	}
}
