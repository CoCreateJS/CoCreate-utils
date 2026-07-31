export function getValueFromObject(object = {}, path = "", throwError = false) {
	try {
		if ((!Array.isArray(object) && !Object.keys(object).length) || !path) {
			if (throwError) throw new Error("Invalid input to getValueFromObject");
			return;
		}

		path = path.replace(/\[(\d+)\]/g, ".$1").replace(/^\./, "");

		let data = object,
			subpath = path.split(".");

		for (let i = 0; i < subpath.length; i++) {
			if (throwError && !(subpath[i] in data))
				throw new Error("Key not found in object: " + subpath[i]);

			data = data[subpath[i]];
			if (!data) break;
		}

		return data;
	} catch (error) {
		if (throwError) throw error;
	}
}
