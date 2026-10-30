import { getValueFromObject } from "./getValueFromObject.js";
import { getDataElements } from "./getData.js";

/**
 * Sets values on elements keyed with `key` or `{prefix}-key`.
 * A `set-data="false"` or `{prefix}-set-data="false"` attribute opts an element out.
 * A key of `{}` maps the complete data object to its element.
 *
 * @param {{ form: Element|Document, prefix?: string, data: Object }} options
 */
export function setData({ form, prefix, data } = {}) {
	if (!data || typeof data !== "object") return;

	for (const element of getDataElements({ form, prefix, operation: "set" })) {
		const key = element.getAttribute(prefix ? `${prefix}-key` : "key");
		if (!key) continue;

		const value = key === "{}" ? data : getValueFromObject(data, key);
		if (typeof element.renderValue === "function") element.renderValue(value);
		else if (typeof element.setValue === "function") element.setValue(value);
	}
}

export default setData;
