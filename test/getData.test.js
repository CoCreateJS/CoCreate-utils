import assert from "node:assert/strict";
import test from "node:test";
import { getData } from "../src/modules/getData.js";

function makeElement(attributes, value) {
	return {
		attributes: Object.entries(attributes).map(([name, attributeValue]) => ({ name, value: attributeValue })),
		hasAttribute(name) {
			return Object.hasOwn(attributes, name);
		},
		getAttribute(name) {
			return attributes[name] ?? null;
		},
		closest() {
			return null;
		},
		async getValue() {
			return value;
		}
	};
}

test("prefixed data only collects elements with the matching key attribute", async () => {
	const keyed = [
		makeElement({ "unique-key": "array" }, "users"),
		makeElement({ "unique-key": "key" }, "email"),
		makeElement({ "unique-key": "value" }, "person@example.test")
	];
	const barePrefix = makeElement({ unique: "", "data-mode": "fast" }, "ignored");
	const form = {
		elements: [...keyed, barePrefix],
		querySelectorAll(selector) {
			return selector === "[unique-key]" ? keyed : [];
		}
	};

	assert.deepEqual(await getData({ form, prefix: "unique" }), {
		array: "users",
		key: "email",
		value: "person@example.test"
	});
});
