export function isValidDate(value) {
	if (
		typeof value === "string" &&
		value.length >= 20 &&
		value.length <= 24
	) {
		if (
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([-+]\d{2}:\d{2}|Z)?$/i.test(
				value
			)
		) {
			return true;
		}
	}

	return false;
}
