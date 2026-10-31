import { contentTypes } from "./contentTypes.js";

const contentTypeIndex = new Map(contentTypes.map(record => [record.contentType, record]));

// Retain the existing extension-to-MIME lookup API for current consumers.
export const mimeTypes = Object.freeze(Object.fromEntries(contentTypes.flatMap(record =>
    record.extensions.map(extension => [extension, record.contentType]))));

function normalizeContentType(value) {
    return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function normalizeExtension(value) {
    const extension = String(value || "").trim().toLowerCase();
    return extension && !extension.startsWith(".") ? `.${extension}` : extension;
}

/** Resolve an explicit MIME type, data URL, Blob/File type, extension, or pathname. */
export function getContentType({ contentType, value, extension, pathname, fallback = "application/octet-stream" } = {}) {
    if (contentType) return normalizeContentType(contentType);
    if (typeof value === "string" && /^data:/i.test(value.trim())) {
        return normalizeContentType(value.trim().slice(5).split(/[;,]/, 1)[0]) || "text/plain";
    }
    if (typeof Blob !== "undefined" && value instanceof Blob && value.type) {
        return normalizeContentType(value.type);
    }
    const filename = String(pathname || value?.name || "").split(/[?#]/, 1)[0];
    const suffix = extension || /\.[^./\\]+$/.exec(filename)?.[0];
    return mimeTypes[normalizeExtension(suffix)] || fallback;
}

/** Return every known extension for a MIME type; the preferred extension is first. */
export function getExtensions({ contentType } = {}) {
    return [...(contentTypeIndex.get(normalizeContentType(contentType))?.extensions || [])];
}

/** Return the preferred extension for a MIME type, or the caller's fallback. */
export function getExtension({ contentType, fallback = "" } = {}) {
    return contentTypeIndex.get(normalizeContentType(contentType))?.extensions[0] ?? fallback;
}

/** Classify textual content, including MIME families not explicitly in the registry. */
export function isTextContentType(contentType = "") {
    const type = normalizeContentType(contentType);
    return contentTypeIndex.get(type)?.text ??
        (type.startsWith("text/") || /[+](json|xml)$/.test(type));
}
