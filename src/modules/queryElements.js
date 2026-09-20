const queryTypes = [
	"$closest",
	"$parent",
	"$next",
	"$previous",
	"$document",
	"$frame",
	"$top"
];

const regexPatternString = `(?:${queryTypes
	.map((type) => type.replace("$", "\\$"))
	.join("|")})`;

const queryTypesRegex = new RegExp(regexPatternString);

const mediaRanges = {
	xs: [0, 575],
	sm: [576, 768],
	md: [769, 992],
	lg: [993, 1200],
	xl: [1201, 0]
};

export function checkMediaQueries(selector) {
	if (selector && selector.includes("@")) {
		const viewportWidth = window.innerWidth;
		let mediaViewport = false;

		let screenSizes = selector.split("@");
		selector = screenSizes.shift();

		for (let screenSize of screenSizes) {
			if (mediaRanges.hasOwnProperty(screenSize)) {
				const [minWidth, maxWidth] = mediaRanges[screenSize];
				if (viewportWidth >= minWidth && viewportWidth <= maxWidth) {
					mediaViewport = true;
					break;
				}
			}
		}
		if (!mediaViewport) return false;
	}

	return selector;
}

function queryType(element, type) {
	if (!element) return null;

	switch (type) {
		case "$top":
			return window.top.document;
		case "$frame":
			if (element.nodeType === 9) return window.frameElement;
			return element;
		case "$document":
			return element.nodeType === 9 ? element : element.ownerDocument;
		case "$closest":
			return element.nodeType === 9 ? element : element.ownerDocument;
		case "$parent":
			if (element.nodeType === 9) {
				return element.defaultView !== window.top
					? element.defaultView.parent.document
					: null;
			}
			return element.parentElement;
		case "$next":
			return element.nextElementSibling;
		case "$previous":
			return element.previousElementSibling;
		default:
			return null;
	}
}

function querySelector(element, selector) {
	if (!element) return null;
	return selector.endsWith("[]")
		? element.querySelectorAll(selector.slice(0, -2))
		: element.querySelector(selector);
}

// Split only outside CSS brackets, parentheses, strings, and escapes.
function splitSelector(selector, separator, firstOnly = false) {
	const parts = [];
	let start = 0;
	let depth = 0;
	let quote = "";
	for (let i = 0; i < selector.length; i++) {
		const char = selector[i];
		if (char === "\\") {
			i++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = "";
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === "[" || char === "(") {
			depth++;
		} else if (char === "]" || char === ")") {
			depth--;
		} else if (!depth && separator.test(char)) {
			parts.push(selector.slice(start, i).trim());
			if (firstOnly) return [...parts, selector.slice(i).trim()];
			start = i + 1;
		}
	}
	return firstOnly ? [selector, ""] : [...parts, selector.slice(start).trim()];
}

export function queryElements({ element = document, prefix, selector }) {
	try {
		let elements = new Set();

		if (!selector && element.nodeType === 1) {
			let queryName = prefix ? `${prefix}-query` : null;
			// Query expressions such as "$closest form" are syntax for this
			// parser, not values for the AST-aware getAttribute override.
			if (queryName)
				selector = element.attributes.getNamedItem(queryName)?.value;
			if (!selector) return [];
		}

		let selectors = splitSelector(selector, /,/);
		for (let i = 0; i < selectors.length; i++) {
			if (!selectors[i]) continue;

			let queriedElement = element;

			if (selectors[i].includes("@")) {
				selectors[i] = checkMediaQueries(selectors[i]);
				if (selectors[i] === false) continue;
			}

			let remainingSelector = selectors[i].trim();
			// $this is a leading guard, not a traversal operator.
			if (remainingSelector.startsWith("$this")) {
				const [selfSelector, remaining] = splitSelector(remainingSelector.slice(5), /\s/, true);
				if (selfSelector && !queriedElement.matches?.(selfSelector)) continue;
				remainingSelector = remaining;
			}
			let match;

			while ((match = queryTypesRegex.exec(remainingSelector)) !== null) {
				const matchIndex = match.index;
				const operator = match[0];

				const part = remainingSelector
					.substring(0, matchIndex)
					.trim()
					.replace(/,$/, "");
				if (part) {
					queriedElement = querySelector(queriedElement, part);
					if (!queriedElement) break;
				}

				remainingSelector = remainingSelector
					.substring(matchIndex + operator.length)
					.trim();

				if (operator === "$closest") {
					let [closest, remaining = ""] = remainingSelector.split(/\s+/, 2);
					queriedElement = queriedElement.closest(closest);
					remainingSelector = remaining.trim();
				} else {
					queriedElement = queryType(queriedElement, operator);
				}

				if (!queriedElement) break;
			}

			if (!queriedElement) continue;

			if (remainingSelector) {
				queriedElement = querySelector(queriedElement, remainingSelector);
			}

			if (
				Array.isArray(queriedElement) ||
				queriedElement instanceof HTMLCollection ||
				queriedElement instanceof NodeList
			) {
				for (let el of queriedElement) {
					if (el instanceof Element) {
						elements.add(el);
					}
				}
			} else if (queriedElement instanceof Element) {
				elements.add(queriedElement);
			}
		}

		return Array.from(elements);
	} catch (e) {
		console.error(
			`CoCreate: Error in queryElements with selector: "${selector}".`,
			e
		);
		return [];
	}
}
