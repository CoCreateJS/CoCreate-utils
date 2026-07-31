export function objectToSearchParams(paramsObj) {
	if (
		!paramsObj ||
		typeof paramsObj !== "object" ||
		Array.isArray(paramsObj)
	) {
		return "";
	}

	const filteredObj = {};
	for (const key in paramsObj) {
		if (Object.hasOwn(paramsObj, key)) {
			const value = paramsObj[key];
			if (value !== null && value !== undefined) {
				filteredObj[key] = value;
			}
		}
	}

	if (Object.keys(filteredObj).length === 0) {
		return "";
	}

	const searchParams = new URLSearchParams(filteredObj);
	const queryString = searchParams.toString();

	return queryString ? `?${queryString}` : "";
}
