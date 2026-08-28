export function objectToSearchParams(paramsObj) {
	if (
		!paramsObj ||
		typeof paramsObj !== "object" ||
		Array.isArray(paramsObj)
	) {
		return "";
	}

	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(paramsObj)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== null && item !== undefined) {
					searchParams.append(key, item);
				}
			}
		} else if (value !== null && value !== undefined) {
			searchParams.append(key, value);
		}
	}

	const queryString = searchParams.toString();

	return queryString ? `?${queryString}` : "";
}
