export function getAttributes(el) {
	if (!el) return;

	let attributes = window.CoCreateConfig.attributes;
	let object = {};

	for (let attribute of el.attributes) {
		let variable = attributes[attribute.name];
		if (variable) {
			object[variable] = el.getAttribute(attribute.name);
		}
	}

	return object;
}

export function getAttributeNames(variables) {
	let reversedObject = {};
	for (const key of Object.keys(CoCreateConfig.attributes)) {
		reversedObject[CoCreateConfig.attributes[key]] = key;
	}

	let attributes = [];
	for (const variable of variables) {
		let attribute = reversedObject[variable];
		if (attribute) attributes.push(attribute);
	}
	return attributes;
}

export function setAttributeNames(attributes, overWrite) {
	let reversedObject = {};
	for (const key of Object.keys(CoCreateConfig.attributes)) {
		reversedObject[CoCreateConfig.attributes[key]] = key;
	}

	for (const attribute of Object.keys(attributes)) {
		const variable = attributes[attribute];
		if (!reversedObject[variable] || overWrite != false)
			reversedObject[variable] = attribute;
	}

	let revertObject = {};
	for (const key of Object.keys(reversedObject)) {
		revertObject[reversedObject[key]] = key;
	}
	CoCreateConfig.attributes = revertObject;
}
