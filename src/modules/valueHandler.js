import { decodeHTML } from "entities";

function valueAttributeName(element, name, prefix = "value") {
    const scoped = `${prefix}-${name}`;
    return prefix !== "value" && element.hasAttribute(scoped)
        ? scoped
        : `value-${name}`;
}

function getValueAttribute(element, name, prefix = "value", raw = false) {
    const attribute = valueAttributeName(element, name, prefix);
    return raw
        ? element.attributes.getNamedItem
            ? element.attributes.getNamedItem(attribute)?.value
            : element.getAttribute(attribute)
        : element.getAttribute(attribute);
}

const regexOperations = new Set([
    "replace", "replaceall", "test", "match", "split", "lastindex", "search", "exec"
]);

/**
 * Adjusts casing transformations on attributes.
 */
function caseHandler(element, value, prefix = "value") {
    if (typeof value !== "string") return value;
    const lowercase = getValueAttribute(element, "lowercase", prefix);
    if (lowercase != null && lowercase !== false && lowercase !== "false") {
        value = value.toLowerCase();
    }

    const uppercase = getValueAttribute(element, "uppercase", prefix);
    if (uppercase != null && uppercase !== false && uppercase !== "false") {
        value = value.toUpperCase();
    }

    return value;
}

/**
 * Transforms output based on Regular Expression definitions.
 */
function regex(element, value, prefix = "value") {
    try {
        const attributes = typeof element.attributes.length === "number"
            ? element.attributes
            : Object.entries(element.attributes).map(([name, value]) => ({ name, value }));
        for (let i = 0; i < attributes.length; i++) {
            if (typeof value !== "string") break;
            const name = attributes[i].name;
            const operation = name.startsWith(`${prefix}-`)
                ? name.slice(prefix.length + 1)
                : name.startsWith("value-") ? name.slice(6) : "";
            if (!regexOperations.has(operation) ||
                name !== valueAttributeName(element, operation, prefix)) continue;

            let regexAttributeValue = attributes[i].value;
            if (!regexAttributeValue || regexAttributeValue === "false") continue;

            let { regex, replacement } = regexParser(regexAttributeValue);
            if (regex) regexAttributeValue = regex;

            replacement =
                replacement || getValueAttribute(element, "replacement", prefix) || "";

            switch (operation) {
                case "replace":
                    value = value.replace(regexAttributeValue, replacement);
                    break;
                case "replaceall":
                    value = value.replaceAll(regexAttributeValue, replacement);
                    break;
                case "test":
                    value = regex.test(value);
                    break;
                case "match": {
                    const matches = value.match(regexAttributeValue);
                    if (matches) {
                        value = matches[1] || matches[0];
                    }
                    break;
                }
                case "split":
                    value = value.split(regexAttributeValue);
                    break;
                case "lastindex":
                    regex.lastIndex = 0;
                    regex.test(value);
                    value = regex.lastIndex;
                    break;
                case "search":
                    value = value.search(regexAttributeValue);
                    break;
                case "exec": {
                    const execResult = regex.exec(value);
                    if (execResult) {
                        value = execResult[1] || execResult[2] || execResult[0];
                    }
                    break;
                }
            }
        }

        return value;
    } catch (error) {
        console.warn(
            "Warning: Transformation error during regex operation:",
            error,
            element
        );
        return value;
    }
}

function regexParser(string) {
    let regex, replacement;
    let regexMatch = string.match(/\/(.+)\/([gimuy]*)/);

    if (regexMatch) {
        regex = new RegExp(regexMatch[1], regexMatch[2]);
        const splitReplace = string.split(", ");
        replacement =
            splitReplace.length > 1 ? splitReplace[1].slice(1, -1) : "";
    }

    return { regex, replacement };
}

/**
 * Encodes values.
 */
function encodeValue(value, encodingType) {
    if (!encodingType || encodingType === "false") {
        return value;
    }

    switch (encodingType.toLowerCase()) {
        case "url":
        case "uri":
            return encodeURI(value.replace(/ /g, "%20"));

        case "uri-component":
            return encodeURIComponent(value.replace(/ /g, "%20"));

        case "base64":
        case "atob":
            try {
                const encoder = new TextEncoder();
                const uint8Array = encoder.encode(value);
                return btoa(String.fromCharCode(...uint8Array));
            } catch (error) {
                console.warn(`Failed to encode as Base64: ${error.message}`);
                return value;
            }

        case "html-entities":
            return value.replace(/[\u00A0-\u9999<>\&]/g, (i) => {
                return `&#${i.charCodeAt(0)};`;
            });

        case "json":
            try {
                return JSON.stringify(value);
            } catch (error) {
                console.warn(`Failed to convert to JSON: ${error.message}`);
                return value;
            }

        default:
            console.warn(`Unsupported encoding type: ${encodingType}`);
            return value;
    }
}

/**
 * Decodes values.
 */
function decodeValue(value, decodingType) {
    if (!decodingType || decodingType === "false") {
        return value;
    }

    switch (decodingType.toLowerCase()) {
        case "url":
        case "uri":
            return decodeURI(value);

        case "uri-component":
            return decodeURIComponent(value);

        case "base64":
        case "btoa":
        case "atob":
            try {
                const decodedArray = Uint8Array.from(atob(value), (c) =>
                    c.charCodeAt(0)
                );
                const decoder = new TextDecoder();
                return decoder.decode(decodedArray);
            } catch (error) {
                console.warn(`Failed to decode Base64: ${error.message}`);
                return value;
            }

        case "html-entities": {
            if (typeof document === "undefined") return decodeHTML(String(value));
            const tempElement = document.createElement("div");
            tempElement.innerHTML = value;
            return tempElement.textContent;
        }

        case "json":
            try {
                return JSON.parse(value);
            } catch (error) {
                console.warn(`Failed to parse JSON: ${error.message}`);
                return value;
            }

        default:
            console.warn(`Unsupported decoding type: ${decodingType}`);
            return value;
    }
}

function parseJson(value, valueType = "") {
    if (
        typeof value === "string" && value &&
        (valueType === "object" ||
            valueType === "json" ||
            valueType.startsWith("array"))
    ) {
        try {
            value = JSON.parse(value);
        } catch {
            const jsonRegex = /(\{[\s\S]*}|\[[\s\S]*\])/;
            const match = value.match(jsonRegex);

            if (match) {
                try {
                    value = JSON.parse(match[0]);
                } catch {
                    console.warn(
                        "Warning: Failed to parse JSON after extraction. Returning original value."
                    );
                }
            } else {
                console.warn(
                    "Warning: No valid JSON structure found in the string. Returning original value."
                );
            }
        }
    }
    return value;
}

/**
 * Converts element values to an explicit boolean.
 */
function toBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
    if (value === null || value === undefined) return false;

    const normalized = String(value).trim().toLowerCase();
    return !["", "false", "0", "off", "no", "null", "undefined"].includes(
        normalized
    );
}

function toArray(value, valueType = "") {
    if (valueType.startsWith("array")) {
        if (!Array.isArray(value)) {
            if (typeof value === "object" && value !== null) {
                if (valueType === "array.$keys") {
                    value = Object.keys(value);
                } else if (valueType === "array.$values") {
                    value = Object.values(value);
                } else if (valueType === "array.$entries") {
                    value = Object.entries(value);
                } else {
                    value = [value];
                }
            } else {
                value = [value];
            }
        }
    }
    return value;
}

function transformValue(element, value, prefix = "value") {
    value = caseHandler(element, value, prefix);
    value = regex(element, value, prefix);
    value = encodeValue(value, getValueAttribute(element, "encode", prefix) || "");
    return decodeValue(value, getValueAttribute(element, "decode", prefix) || "");
}

function convertValue(value, valueType = "") {
    if (valueType === "boolean") return toBoolean(value);
    return toArray(parseJson(value, valueType), valueType);
}

export {
    getValueAttribute, transformValue, convertValue, caseHandler, regex,
    encodeValue, decodeValue, parseJson, toBoolean, toArray
};
