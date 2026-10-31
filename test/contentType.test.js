import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    contentTypes, mimeTypes, getContentType, getExtension, getExtensions, isTextContentType
} from "../src/modules/file/index.js";

const original = JSON.parse(fs.readFileSync(new URL("../src/modules/file/references/mimeTypes.json", import.meta.url), "utf8"));

test("registry preserves every original MIME mapping in both directions", () => {
    assert.deepEqual(mimeTypes, original);
    for (const [extension, contentType] of Object.entries(original)) {
        assert.equal(getContentType({ pathname: `example${extension}` }), contentType);
        assert.equal(getContentType({ extension }), contentType);
        assert.ok(getExtensions({ contentType }).includes(extension));
        assert.equal(getContentType({ extension: getExtension({ contentType }) }), contentType);
    }
});

test("multiple extensions retain their MIME association and a documented preference", () => {
    assert.equal(getExtension({ contentType: "image/jpeg" }), ".jpg");
    assert.deepEqual(getExtensions({ contentType: "image/jpeg" }), [".jpg", ".jpeg"]);
    assert.equal(getExtension({ contentType: "text/html" }), ".html");
    assert.deepEqual(getExtensions({ contentType: "text/html" }), [".html", ".htm"]);
    assert.deepEqual(getExtensions({ contentType: "text/javascript" }), [".js", ".mjs"]);
});

test("lookups normalize casing, MIME parameters, and dotted or bare extensions", () => {
    assert.equal(getContentType({ extension: " JPEG " }), "image/jpeg");
    assert.equal(getContentType({ extension: ".SVG", pathname: "wrong.png" }), "image/svg+xml");
    assert.deepEqual(getExtensions({ contentType: " Image/JPEG; charset=binary " }), [".jpg", ".jpeg"]);
    assert.equal(getExtension({ contentType: "TEXT/HTML; charset=utf-8" }), ".html");
    assert.equal(getContentType({ pathname: "C:\\media\\photo.JPEG?download=1#preview" }), "image/jpeg");
});

test("unknown MIME types and extensions use their documented fallbacks", () => {
    assert.equal(getContentType({ extension: "unknown" }), "application/octet-stream");
    assert.equal(getContentType({ extension: "unknown", fallback: "text/plain" }), "text/plain");
    assert.equal(getExtension({ contentType: "application/x-unknown" }), "");
    assert.equal(getExtension({ contentType: "application/x-unknown", fallback: ".bin" }), ".bin");
    assert.deepEqual(getExtensions({ contentType: "application/x-unknown" }), []);
    assert.deepEqual(getExtensions(), []);
    assert.equal(getExtension(), "");
});

test("classification uses record flags and textual MIME families", () => {
    for (const record of contentTypes) {
        assert.equal(isTextContentType(record.contentType), record.text, record.contentType);
    }
    for (const type of ["text/x-custom", "application/vnd.example+json", "application/vnd.example+xml", "APPLICATION/GRAPHQL; charset=utf-8"]) {
        assert.equal(isTextContentType(type), true, type);
    }
    for (const type of ["image/png", "application/pdf", "application/zip", "font/woff2", "application/x-unknown", ""]) {
        assert.equal(isTextContentType(type), false, type);
    }
    assert.equal(isTextContentType("image/svg+xml"), true);
    assert.deepEqual(getExtensions({ contentType: "application/graphql" }), []);
});

test("returned extension lists cannot mutate the shared registry or indexes", () => {
    const result = getExtensions({ contentType: "image/jpeg" });
    result.splice(0, result.length, ".wrong");
    assert.deepEqual(getExtensions({ contentType: "image/jpeg" }), [".jpg", ".jpeg"]);
    assert.equal(getExtension({ contentType: "image/jpeg" }), ".jpg");
    assert.ok(Object.isFrozen(contentTypes));
    assert.ok(Object.isFrozen(mimeTypes));
    for (const record of contentTypes) {
        assert.ok(Object.isFrozen(record));
        assert.ok(Object.isFrozen(record.extensions));
    }
});

test("registry has one record per MIME type and one MIME association per extension", () => {
    const seenTypes = new Set();
    const seenExtensions = new Set();
    for (const record of contentTypes) {
        assert.ok(!seenTypes.has(record.contentType), record.contentType);
        seenTypes.add(record.contentType);
        assert.equal(typeof record.text, "boolean");
        for (const extension of record.extensions) {
            assert.ok(extension.startsWith("."), extension);
            assert.ok(!seenExtensions.has(extension), extension);
            seenExtensions.add(extension);
        }
    }
    assert.equal(seenExtensions.size, Object.keys(original).length);
});

test("existing metadata resolution still takes precedence over inferred extensions", () => {
    assert.equal(getContentType({ contentType: "application/pdf", extension: ".png" }), "application/pdf");
    assert.equal(getContentType({ value: "data:image/svg+xml;base64,PHN2Zy8+", extension: ".png" }), "image/svg+xml");
    const file = new File(["text"], "example.json", { type: "text/plain" });
    assert.equal(getContentType({ value: file, extension: ".png" }), "text/plain");
    assert.equal(getContentType({ value: new File(["text"], "example.json") }), "application/json");
});
