# Consumer fit review

This review assesses the shared API against the saved reference functions and
the current consumer functions. Callers can choose their input encoding and
output format explicitly; they do not need identical parameter lists to the
old functions. The MIME registry update makes no further consumer edits. The
converter integrations from the earlier step remain in the working tree.

| Consumer | Required behavior | API fit |
| --- | --- | --- |
| File Server `normalizeSrc` | Decode fonts/media to response bytes and SVG to text; preserve raw text and rendering behavior | `decodeContent({ value, encoding: "base64", format: "bytes" })` for binary; `format: "text"` for SVG. Percent-encoded text uses data-URL input and `fatal: true` to retain the existing fallback. Rendering and MIME-specific selection stay with the caller. |
| File client `readFile` | Read File/Blob content as a data URL, text, binary string, or ArrayBuffer; retain directory/blob passthrough | `getContentType` normalizes MIME parameters for mode selection. `encodeContent({ value: file, contentType: file.type || "application/octet-stream", format: "data-url" })` retains the declared type, or `decodeContent` selects `format: "text"`, `"binary"`, or `"arraybuffer"`. `charset: "auto"` preserves FileReader charset/BOM behavior. |
| File server upload, used by COC Upload | Read filesystem bytes, prepare UTF-8 text or a Base64 data URL, and retain metadata/template behavior | `decodeContent({ value: bytes, format: "text" })` and `encodeContent({ value: bytes, contentType, format: "data-url" })`. MIME lookups use `getContentType({ pathname, fallback })`, preserving the caller's fallback and supporting uppercase extensions. |
| File server download | Restore Buffers/byte data, decode data URLs, preserve unmarked text, and keep existing malformed-input fallback | `decodeContent` with `format: "bytes"` for files, explicit `encoding: "utf8"` for unmarked strings, and auto encoding for data URLs. Percent-encoded text uses `format: "text", fatal: true`; the caller retains destination/path checks and fallback selection. |
| URL Uploader | Convert fetched ArrayBuffer bytes to raw Base64, retaining explicit metadata and the socket envelope | `encodeContent({ value: arrayBuffer, format: "base64" })` preserves the raw Base64 response. `getContentType` supplies a fallback if the response omits its MIME header. Fetching and socket handling stay with the caller. |

## Registry and reverse lookup

- The original extension map is preserved exactly and compared with its JSON snapshot.
- `getContentType` accepts explicit metadata, data URLs, Blob/File metadata,
  filename extensions, and explicit dotted or bare extensions.
- `getExtension` returns a preferred extension; `getExtensions` returns all
  registered extensions. Multiple extensions can share a MIME type.
- MIME parameters and case are normalized for lookup. Data-URL output retains
  MIME parameters, including charset information.
- Records are frozen and lookup arrays are copied, preventing callers from
  invalidating the derived indexes.

## Verification boundaries

The tests compare saved and live conversion functions, include every original
extension mapping, and exercise real filesystem writes and a local HTTP response.
Browser FileReader I/O is represented by a stand-in using real File/Blob objects;
a live browser smoke test is still pending. BSON-shaped bytes are checked without
writing to a database. These tests assess conversion behavior, not authentication,
authorization, or general server correctness.

Existing caller-specific MIME selection rules remain explicit. In particular,
PDF/Office upload classification gaps are not silently repaired by this registry
change. A later interface adjustment can select a different output option after
its intended storage and transport behavior is agreed.
