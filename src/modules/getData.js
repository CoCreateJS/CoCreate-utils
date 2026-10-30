import { dotNotationToObject } from "./dotNotationToObject.js";

export function getDataElements({ form, prefix, operation }) {
	if (!form) return [];

	const keyAttribute = prefix ? `${prefix}-key` : "key";
	const directionAttribute = operation
		? prefix
			? `${prefix}-${operation}-data`
			: `${operation}-data`
		: null;
	const elements = new Set();

	if (form.nodeType === 1 && form.hasAttribute(keyAttribute)) {
		elements.add(form);
	}

	for (const element of Array.from(form.elements || [])) {
		if (element.hasAttribute?.(keyAttribute)) elements.add(element);
	}

	form.querySelectorAll?.(`[${keyAttribute}]`).forEach((element) => {
		elements.add(element);
	});

	return Array.from(elements).filter((element) =>
		!element.closest?.("[template]") &&
		(!directionAttribute || element.getAttribute(directionAttribute) !== "false")
	);
}

/**
 * Collects values from elements keyed with `key` or `{prefix}-key`.
 * A `get-data="false"` or `{prefix}-get-data="false"` attribute opts an element out.
 * Dotted and array keys use the same conversion convention as CoCreate API.
 *
 * @param {{ form: Element|Document, prefix?: string }} options
 * @returns {Promise<Object>}
 */
export async function getData({ form, prefix } = {}) {
	const data = {};

	for (const element of getDataElements({ form, prefix, operation: "get" })) {
		const key = element.getAttribute(prefix ? `${prefix}-key` : "key");
		if (!key || typeof element.getValue !== "function") continue;

		const value = await element.getValue();
		if (value === undefined) continue;

		if (key.endsWith("[]")) {
			if (!data[key]) data[key] = [];
			if (Array.isArray(value)) data[key].push(...value);
			else data[key].push(value);
		} else {
			data[key] = value;
		}
	}

	return dotNotationToObject(data);
}

export default getData;
