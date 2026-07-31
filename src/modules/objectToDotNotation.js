export function objectToDotNotation(input) {
	const results = {};

	function traverse(currentValue, path) {
		if (typeof currentValue !== "object" || currentValue === null) {
			if (path !== undefined && path !== null && path !== "") {
				results[path] = currentValue;
			}
			return;
		}

		if (Array.isArray(currentValue)) {
			if (currentValue.length > 0) {
				currentValue.forEach((item, index) => {
					const nextPath = `${path}[${index}]`;
					traverse(item, nextPath);
				});
			} else if (path) {
			}
		} else {
			const keys = Object.keys(currentValue);
			if (keys.length > 0) {
				keys.forEach((key) => {
					const nextPath = path ? `${path}.${key}` : key;
					traverse(currentValue[key], nextPath);
				});
			} else if (path) {
			}
		}
	}

	traverse(input, "");

	return results;
}
