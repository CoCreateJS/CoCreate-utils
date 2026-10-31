import test from "node:test";
import assert from "node:assert/strict";
import { encodeContent, decodeContent, getContentType } from "../src/modules/file/index.js";

const bytes = Uint8Array.from({ length: 200000 }, (_, index) => index % 256);

test("filesystem/upload bytes survive transport and HTTP/download decoding", () => {
    for (const pathname of ["image.png", "font.woff2", "document.pdf", "archive.zip", "sheet.xlsx"]) {
        const src = encodeContent({ value: bytes, pathname });
        assert.equal(src, `data:${getContentType({ pathname })};base64,${Buffer.from(bytes).toString("base64")}`);
        assert.deepEqual(decodeContent({ value: src }), bytes);
    }
});

test("UTF-8 source text and SVG remain usable text", () => {
    const text = "<h1>你好, café 🌍</h1>";
    for (const pathname of ["index.html", "document.svg", "data.json"]) {
        assert.equal(encodeContent({ value: text, pathname }), text);
        const src = encodeContent({ value: text, pathname, format: "data-url" });
        assert.equal(decodeContent({ value: src }), text);
    }
});

test("browser FileReader-style data URLs and binary strings", () => {
    const pdf = "data:application/pdf;base64,AP/+JVBERg==";
    assert.deepEqual(decodeContent({ value: pdf }), Uint8Array.of(0, 255, 254, 37, 80, 68, 70));
    const binary = "\x00\xff\xfe\x01";
    assert.equal(encodeContent({ value: binary, contentType: "application/msword", encoding: "binary", format: "base64" }), "AP/+AQ==");
    assert.equal(encodeContent({ value: pdf }), pdf);
});

test("File/Blob reads are asynchronous and preserve bytes and MIME type", async () => {
    const file = new Blob([bytes], { type: "image/png" });
    const src = await encodeContent({ value: file });
    assert.ok(src.startsWith("data:image/png;base64,"));
    assert.deepEqual(decodeContent({ value: src }), bytes);
    assert.deepEqual(await decodeContent({ value: file }), bytes);
});

test("download accepts serialized Buffers, byte arrays, and BSON Binary", () => {
    const sample = Uint8Array.of(0, 255, 1, 128);
    for (const value of [
        Buffer.from(sample), sample, [...sample],
        { type: "Buffer", data: [...sample] },
        { _bsontype: "Binary", value: () => Buffer.from(sample) }
    ]) {
        assert.deepEqual(decodeContent({ value, format: "bytes" }), sample);
    }
});

test("views encode only their visible bytes; ArrayBuffer output excludes adjacent data", () => {
    const storage = Uint8Array.of(99, 0, 255, 88);
    for (const value of [storage.subarray(1, 3), new DataView(storage.buffer, 1, 2), Buffer.from(storage).subarray(1, 3)]) {
        assert.equal(encodeContent({ value, format: "base64" }), "AP8=");
        const result = decodeContent({ value, format: "arraybuffer" });
        assert.equal(result.byteLength, 2);
        assert.deepEqual(new Uint8Array(result), Uint8Array.of(0, 255));
    }
});

test("HTTP font sources accept bare Base64, URL-safe Base64, and whitespace", () => {
    for (const value of ["AP/+AQ==", "AP_-AQ==", " AP/+\nAQ== "]) {
        assert.deepEqual(decodeContent({ value, contentType: "font/woff2" }), Uint8Array.of(0, 255, 254, 1));
    }
    assert.deepEqual(decodeContent({ value: "AP_-AQ", encoding: "base64", format: "bytes" }), Uint8Array.of(0, 255, 254, 1));
});

test("percent-encoded data URLs preserve binary and UTF-8 text", () => {
    assert.deepEqual(decodeContent({ value: "data:application/octet-stream,%00%FF+%80" }), Uint8Array.of(0, 255, 43, 128));
    assert.equal(decodeContent({ value: "data:text/plain;charset=utf-8,caf%C3%A9" }), "café");
});

test("explicit encoding disambiguates ordinary text from Base64", () => {
    assert.equal(encodeContent({ value: "test", contentType: "image/png", encoding: "utf8", format: "base64" }), "dGVzdA==");
    assert.equal(decodeContent({ value: "dGVzdA==", encoding: "base64", format: "text" }), "test");
});

test("shared browser conversion works without Node Buffer", () => {
    const original = globalThis.Buffer;
    try {
        globalThis.Buffer = undefined;
        const src = encodeContent({ value: bytes, format: "base64" });
        assert.equal(src, original.from(bytes).toString("base64"));
        assert.deepEqual(decodeContent({ value: src, encoding: "base64", format: "bytes" }), bytes);
    } finally {
        globalThis.Buffer = original;
    }
});

test("content type lookup uses explicit metadata, data URLs, and filenames", () => {
    assert.equal(getContentType({ contentType: "Text/HTML; charset=UTF-8", pathname: "image.png" }), "text/html");
    assert.equal(getContentType({ value: "data:;base64,AA==" }), "text/plain");
    assert.equal(getContentType({ pathname: "/file.PDF?download=true" }), "application/pdf");
    assert.equal(getContentType({ pathname: "unknown", fallback: "text/plain" }), "text/plain");
    assert.equal(getContentType({ value: "  data:image/png;base64,AA==  " }), "image/png");
    const src = "data:image/svg+xml;charset=utf-8;base64,PHN2Zy8+";
    assert.equal(encodeContent({ value: src, format: "data-url" }), src);
});

test("invalid representations fail instead of silently corrupting content", () => {
    assert.throws(() => decodeContent({ value: "missing-prefix", encoding: "data-url" }), TypeError);
    assert.throws(() => decodeContent({ value: [256], format: "bytes" }), TypeError);
    assert.throws(() => decodeContent({ value: "data:text/plain,%ZZ" }), TypeError);
});

test("Base64 and binary string decoding preserve existing Buffer semantics in both environments", () => {
    const original = globalThis.Buffer;
    for (const nativeBuffer of [true, false]) {
        try {
            if (!nativeBuffer) globalThis.Buffer = undefined;
            for (const value of ["", "A", "AA", "====", "AA=A", "not@@base64", "AA % 9A", "AP_-AQ=="]) {
                assert.deepEqual(decodeContent({ value, encoding: "base64", format: "bytes" }), new Uint8Array(original.from(value, "base64")));
            }
            assert.deepEqual(decodeContent({ value: "🌍", encoding: "binary", format: "bytes" }), new Uint8Array(original.from("🌍", "binary")));
        } finally {
            globalThis.Buffer = original;
        }
    }
});

test("Blob conversion retains FileReader support when arrayBuffer is unavailable", async () => {
    const original = globalThis.FileReader;
    const file = new Blob([Uint8Array.of(0, 255)], { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: undefined });
    try {
        globalThis.FileReader = class {
            readAsArrayBuffer(value) {
                Blob.prototype.arrayBuffer.call(value).then(result => {
                    this.result = result;
                    this.onload();
                });
            }
        };
        assert.equal(await encodeContent({ value: file }), "data:image/png;base64,AP8=");
        assert.deepEqual(await decodeContent({ value: file }), Uint8Array.of(0, 255));
        globalThis.FileReader = class {
            readAsArrayBuffer() { this.error = new Error("Read failed"); this.onerror(); }
        };
        await assert.rejects(encodeContent({ value: file }), /Read failed/);
    } finally {
        if (original === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = original;
    }
});
