import { getContentType, isTextContentType } from "./contentType.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

function decodeBase64(value) {
    const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (typeof Buffer !== "undefined") {
        const buffer = Buffer.from(normalized, "base64");
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    // Match the existing server Buffer decoder: tolerate whitespace, ignored
    // characters, missing padding, and an incomplete final Base64 sextet.
    let compact = normalized.split("=", 1)[0].replace(/[^A-Za-z0-9+/]/g, "");
    if (compact.length % 4 === 1) compact = compact.slice(0, -1);
    const binary = atob(compact);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function binaryString(bytes) {
    // Limit spread size so large files do not exceed function argument limits.
    const chunks = [];
    for (let index = 0; index < bytes.length; index += 32768) {
        chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
    }
    return chunks.join("");
}

function encodeBase64(bytes) {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    }
    return btoa(binaryString(bytes));
}

function textContent(bytes, charset = "utf-8", fatal = false, mediaType = "") {
    if (charset !== "auto") {
        return charset === "utf-8" && !fatal ? textDecoder.decode(bytes)
            : new TextDecoder(charset, { ignoreBOM: true, fatal }).decode(bytes);
    }
    // Match FileReader's BOM detection when reading a Blob/File as text.
    const parameter = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(mediaType);
    let fallback = parameter?.[1] || parameter?.[2] || "utf-8";
    try { fallback = new TextDecoder(fallback).encoding; } catch { fallback = "utf-8"; }
    const type = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le"
        : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be"
        : bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? "utf-8" : fallback;
    return new TextDecoder(type, { fatal }).decode(bytes);
}

function decodeDataURL(value) {
    if (!/^data:/i.test(value)) throw new TypeError("Invalid data URL: missing data: prefix.");
    const comma = value.indexOf(",");
    if (comma < 0) throw new TypeError("Invalid data URL: missing comma.");
    const metadata = value.slice(5, comma);
    const content = value.slice(comma + 1);
    if (/;base64(?:;|$)/i.test(metadata)) {
        return decodeBase64(content);
    }
    if (/%(?![\da-f]{2})/i.test(content)) throw new TypeError("Invalid data URL percent escape.");
    // Percent escapes represent bytes, including non-UTF-8 binary content.
    const parts = content.split(/(%[\da-f]{2})/gi).map(part =>
        /^%[\da-f]{2}$/i.test(part)
            ? Uint8Array.of(parseInt(part.slice(1), 16))
            : textEncoder.encode(part));
    const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return bytes;
}

function asBytes(value, contentType, encoding) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    // Includes Buffer, DataView, and typed arrays. Preserve view offsets/lengths.
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value?._bsontype === "Binary" && typeof value.value === "function") {
        return asBytes(value.value(true), contentType, encoding);
    }
    if (value && typeof value === "object" && Array.isArray(value.data)) {
        return asBytes(value.data, contentType, encoding);
    }
    if (Array.isArray(value)) {
        if (!value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            throw new TypeError("Byte arrays must contain integers from 0 to 255.");
        }
        return Uint8Array.from(value);
    }
    if (typeof value !== "string") {
        throw new TypeError("Content must be text, a data URL, or binary bytes.");
    }
    if (!encoding || encoding === "auto") {
        if (/^data:/i.test(value.trim())) return decodeDataURL(value.trim());
        if (isTextContentType(contentType)) return textEncoder.encode(value);
        // Match existing bare Base64 detection for binary MIME types.
        const compact = value.replace(/\s+/g, "");
        if (compact && compact.length % 4 === 0 && /^[A-Za-z0-9+/\-_]*={0,2}$/.test(compact)) {
            return decodeBase64(compact);
        }
        encoding = "binary";
    }
    if (encoding === "base64") return decodeBase64(value);
    if (encoding === "data-url") return decodeDataURL(value);
    if (encoding === "utf8" || encoding === "utf-8" || encoding === "text") {
        return textEncoder.encode(value);
    }
    if (encoding === "binary" || encoding === "latin1") {
        const bytes = new Uint8Array(value.length);
        for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index);
        return bytes;
    }
    throw new TypeError(`Unsupported content encoding: ${encoding}`);
}

function convert(options, transform) {
    const { value, contentType, pathname, encoding = "auto" } = options;
    const type = getContentType({
        contentType, value, pathname,
        fallback: typeof value === "string" ? "text/plain" : "application/octet-stream"
    });
    const isBlob = typeof Blob !== "undefined" && value instanceof Blob;
    const header = typeof value === "string" && /^data:/i.test(value.trim())
        ? value.trim().slice(5, value.trim().indexOf(",")).replace(/;base64\b/i, "") : "";
    const mediaType = String(contentType || header || (isBlob && value.type) || type).trim();
    if (isBlob) {
        const read = typeof value.arrayBuffer === "function" ? value.arrayBuffer()
            : new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error("Could not read file content."));
                reader.onabort = () => reject(new Error("File content read was aborted."));
                reader.readAsArrayBuffer(value);
            });
        return read.then(buffer => transform(new Uint8Array(buffer), type, mediaType));
    }
    return transform(asBytes(value, type, encoding), type, mediaType);
}

/**
 * Prepare content for JSON socket envelopes or text-based storage.
 * Auto format preserves UTF-8 text and encodes binary as a Base64 data URL.
 * Explicit formats: text, binary, base64, data-url. Blob/File input returns a Promise.
 * `encoding` describes the input string, while `format` selects the output.
 */
export function encodeContent({ format = "auto", charset = "utf-8", fatal = false, ...options } = {}) {
    return convert(options, (bytes, contentType, mediaType) => {
        if (format === "text" || (format === "auto" && isTextContentType(contentType))) {
            return textContent(bytes, charset, fatal, mediaType);
        }
        if (format === "binary") return binaryString(bytes);
        if (format === "base64") return encodeBase64(bytes);
        if (format === "auto" || format === "data-url") {
            return `data:${mediaType};base64,${encodeBase64(bytes)}`;
        }
        throw new TypeError(`Unsupported encoded content format: ${format}`);
    });
}

/**
 * Restore content for HTTP responses, filesystem writes, or binary storage.
 * Auto format returns UTF-8 text for textual MIME types and Uint8Array otherwise.
 * Explicit formats: text, binary, bytes, arraybuffer. Blob/File input returns a Promise.
 */
export function decodeContent({ format = "auto", charset = "utf-8", fatal = false, ...options } = {}) {
    return convert(options, (bytes, contentType, mediaType) => {
        if (format === "text" || (format === "auto" && isTextContentType(contentType))) {
            return textContent(bytes, charset, fatal, mediaType);
        }
        if (format === "binary") return binaryString(bytes);
        if (format === "bytes" || format === "auto") return bytes;
        if (format === "arraybuffer") {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        }
        throw new TypeError(`Unsupported decoded content format: ${format}`);
    });
}
