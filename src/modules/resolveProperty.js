/**
 * Resolve a case-insensitive name to its original property key.
 * Searches own and inherited string keys without reading property values.
 * Names must be unique ignoring case; differently cased matches throw.
 * @param {Object|Function} object
 * @param {string} name
 * @returns {string|undefined} The original key, or undefined when not found.
 * @throws {TypeError} When more than one distinct key matches.
 */
export function resolveProperty(object, name) {
    if (object === null || object === undefined || typeof name !== "string") {
        return undefined;
    }

    const lowerName = name.toLowerCase();
    let match;

    for (let current = Object(object); current !== null; current = Object.getPrototypeOf(current)) {
        for (const key of Object.getOwnPropertyNames(current)) {
            if (key.toLowerCase() !== lowerName) continue;
            if (match !== undefined && match !== key) {
                throw new TypeError(`Ambiguous property "${name}": "${match}" and "${key}" match ignoring case.`);
            }
            match = key;
        }
    }

    return match;
}
