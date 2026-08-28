export function searchParamsToObject(value) {
	if (!value) return {};

	const searchParams = value instanceof URLSearchParams
		? value
		: new URLSearchParams(
			typeof value === "string" && value.startsWith("?")
				? value.slice(1)
				: value
		);
	const result = Object.create(null);

	for (const [key, item] of searchParams) {
		if (!Object.hasOwn(result, key)) {
			result[key] = item;
		} else if (Array.isArray(result[key])) {
			result[key].push(item);
		} else {
			result[key] = [result[key], item];
		}
	}

	return { ...result };
}
