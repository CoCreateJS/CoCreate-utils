const queryTypes = [
	"$closest",
	"$matches",
	"$parent",
	"$next",
	"$previous",
	"$document",
	"$frame",
	"$contentDocument",
	"$activeElement",
	"$clickedElement",
	"$hoveredElement",
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
			return (element.nodeType === 9
				? element.defaultView
				: element.ownerDocument?.defaultView
			)?.top.document;
		case "$frame":
			if (element.nodeType === 9) return element.defaultView?.frameElement;
			return element;
		case "$contentDocument":
			return element.contentDocument;
		case "$activeElement": {
			const doc = element.nodeType === 9 ? element : element.document || element.ownerDocument;
			return doc?.activeElement;
		}
		case "$clickedElement": {
			if (element.tagName === "IFRAME") {
				const doc = element.contentDocument;
				return element.clickedElement ?? doc?.clickedElement;
			}
			const doc = element.nodeType === 9 ? element : element.document || element.ownerDocument;
			return doc?.clickedElement;
		}
		case "$hoveredElement": {
			if (element.tagName === "IFRAME") {
				const doc = element.contentDocument;
				return element.hoveredElement ?? doc?.hoveredElement;
			}
			const doc = element.nodeType === 9 ? element : element.document || element.ownerDocument;
			return doc?.hoveredElement;
		}
		case "$document":
			return element.nodeType === 9 ? element : element.document || element.ownerDocument;
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
	// Permit a Window context to query its document when supplied directly.
	if (element.document) element = element.document;
	const queryAll = selector.endsWith("[]");
	const actualSelector = queryAll ? selector.slice(0, -2) : selector;
	return queryAll
		? element.querySelectorAll(actualSelector)
		: element.querySelector(actualSelector);
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

export function queryElements({ element, prefix, selector } = {}) {
	try {
		if (!element) return [];

		let elements = new Set();

		if (!selector && element.nodeType === 1) {
			const queryName = prefix ? `${prefix}-query` : null;
			// Query expressions such as "$closest form" are syntax for this
			// parser, not values for the AST-aware getAttribute override.
			if (!queryName || !element.hasAttribute(queryName)) return [];
			selector = element.attributes.getNamedItem(queryName)?.value;
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
					let [closest, remaining] = splitSelector(remainingSelector, /\s/, true);
					queriedElement = queriedElement.closest(closest);
					remainingSelector = remaining;
				} else if (operator === "$matches") {
					const [matchSelector, remaining] = splitSelector(remainingSelector, /\s/, true);
					if (!matchSelector || !queriedElement.matches?.(matchSelector)) {
						queriedElement = null;
					}
					remainingSelector = remaining;
				} else {
					queriedElement = queryType(queriedElement, operator);
				}

				if (!queriedElement) break;
			}

			if (!queriedElement) continue;

			if (remainingSelector) {
				queriedElement = querySelector(queriedElement, remainingSelector);
			}

			// nodeType checks work across iframe realms, where Element, NodeList,
			// and HTMLCollection constructors differ from the parent window's.
			if (queriedElement?.nodeType === 1) {
				elements.add(queriedElement);
			} else if (queriedElement && typeof queriedElement[Symbol.iterator] === "function") {
				for (const el of queriedElement) {
					if (el?.nodeType === 1) elements.add(el);
				}
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

export function queryElementsAll({ element, prefix, selector } = {}) {
	if (!element) return [];

	if (!selector && element?.nodeType === 1) {
		const queryName = prefix ? `${prefix}-query` : null;
		if (!queryName || !element.hasAttribute(queryName)) return [];
		selector = element.attributes.getNamedItem(queryName)?.value;
	}

	if (typeof selector !== "string" || !selector.trim()) return [];

	const allSelectors = splitSelector(selector, /,/)
		.map((item) => item.trim())
		.map((item) => item && (item.endsWith("[]") ? item : `${item}[]`))
		.join(", ");

	return queryElements({ element, prefix, selector: allSelectors });
}
