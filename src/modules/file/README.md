# File content helpers

These shared helpers prepare file content for four boundaries: filesystem
reads/writes, HTTP responses, JSON socket messages, and database storage. They
operate on content; callers retain file metadata and control I/O, rendering, and
database operations.

Reference snapshots preserve the existing implementations for comparison:

| Snapshot | Source and responsibility |
| --- | --- |
| `references/readFile.js` | CoCreate File client: FileReader output and MIME-based read mode |
| `references/upload.js` | CoCreate File server: filesystem reads, source templating, and transport encoding; used by COC Upload |
| `references/download.js` | CoCreate File server: stored sources decoded for filesystem writes |
| `references/normalizeSrc.js` | CoCreate File Server: stored sources decoded for HTTP responses, followed by rendering |
| `references/urlUploader.js` | CoCreate URL Uploader: fetch response ArrayBuffer converted to raw Base64, with socket envelope and file metadata |
| `references/mimeTypes.json` | Original File server MIME extension lookup for regression comparisons |

The snapshots are reference material and are not imported by the helpers.
`test/fileContentCompatibility.test.js` executes these snapshots and the live
consumer functions with identical fixtures, comparing their output bytes and
transport strings. It covers each MIME mapping, FileReader modes, BOMs, data URLs,
malformed-input fallbacks, HTTP rendering, and the URL Uploader envelope. A native
filesystem/HTTP test writes and serves the same binary file to verify actual I/O.
Browser FileReader comparisons use a stand-in with real File/Blob objects; they
do not replace a browser smoke test.

File Server, File's browser reader and server upload/download conversions, and
URL Uploader now call these helpers. Each replacement was compared against the
snapshots before being applied. Consumer-specific read modes and MIME policies
remain explicit to preserve existing representations; changing those policies is
a separate decision. COC Upload continues to delegate to CoCreate File.

## API

```js
import {
    encodeContent, decodeContent, getContentType,
    getExtension, getExtensions, isTextContentType
} from "@cocreate/utils/file";

// Read file bytes elsewhere, then prepare an envelope-safe source string.
const src = encodeContent({ value: bytes, pathname: "photo.png" });
// => data:image/png;base64,...

// Restore content for an HTTP response or filesystem write.
const body = decodeContent({ value: src }); // Uint8Array

// Preserve ordinary UTF-8 source text for editing/rendering.
encodeContent({ value: "<h1>Hello</h1>", pathname: "index.html" });

// Explicit formats, including raw Base64 and binary database content.
const base64 = encodeContent({ value: bytes, format: "base64" });
const storageBytes = decodeContent({ value: base64, encoding: "base64", format: "bytes" });
const arrayBuffer = decodeContent({ value: src, format: "arraybuffer" });

getContentType({ pathname: "/images/photo.JPEG" }); // image/jpeg
getContentType({ extension: "jpg" });              // image/jpeg
getExtension({ contentType: "image/jpeg" });       // .jpg
getExtensions({ contentType: "image/jpeg" });      // [.jpg, .jpeg]
isTextContentType("image/svg+xml");                // true
```

The same functions are shared AST globals in browser and server execution:
`$encodeContent`, `$decodeContent`, `$getContentType`, `$getExtension`,
`$getExtensions`, and `$isTextContentType`. For example:

```json
{ "$encodeContent": { "value": "$actions.bytes", "format": "base64" } }
```

Use `astAsync` for File/Blob inputs, which require asynchronous reads. The
operators delegate directly to these helpers.

Both functions accept an options object containing `value`, optional `contentType`,
`pathname`, `encoding`, `format`, `charset`, and `fatal`. Inputs include UTF-8 strings, binary strings,
Base64, data URLs, ArrayBuffers, typed array views, byte arrays, Node Buffers,
serialized Buffers (`{ type: "Buffer", data: [...] }`), BSON Binary instances,
and Blob/File objects. Blob/File input returns a Promise; other inputs are
synchronous. Byte views preserve their offsets and lengths.

`encoding` describes **input strings**: `auto` (default), `text` / `utf8` / `utf-8`,
`binary` / `latin1`, `base64`, or `data-url`. It has no effect on existing bytes.
Data URLs identify their own encoding. Raw Base64 can also use URL-safe alphabet
characters; explicit Base64 encoding accepts omitted padding.
Explicit Base64 decoding preserves the existing server Buffer decoder's tolerant
behavior, including ignored characters and incomplete trailing groups, in both
browser and server implementations.

`encodeContent` output formats: `auto` (text or Base64 data URL according to MIME
type), `text`, `binary` (a Latin-1 binary string), `base64`, and `data-url`.

`decodeContent` output formats: `auto` (text or Uint8Array according to MIME type),
`text`, `binary`, `bytes`, and `arraybuffer`. Text conversion defaults to UTF-8 and
preserves a BOM, matching Node Buffer's text output. `charset: "auto"` honors MIME
charset parameters and detects/removes UTF-8/UTF-16 BOMs according to the
[FileReader encoding rules](https://www.w3.org/TR/file-upload/#encoding-determination).
Blob/File reads fall back to FileReader when `arrayBuffer()` is unavailable.
`fatal: true` rejects
invalid text encodings; it lets existing URI-decoding callers retain their
fallback behavior. Latin-1 conversion preserves Node Buffer's byte-per-code-unit
semantics. Returned bytes
can be passed to Node HTTP/filesystem APIs or wrapped in a Blob in a browser.
Database callers choose text storage or their driver's binary representation;
these helpers do not write to a database or automatically choose a storage policy.

## Content types and comparison points

`contentTypes.js` is the maintained registry. Each record contains a MIME type,
its extensions in preference order, and a text classification:

```js
{ contentType: "image/jpeg", extensions: [".jpg", ".jpeg"], text: false }
```

`contentTypes` exports these frozen records. A MIME index and the exported
`mimeTypes` extension-to-MIME view are derived once from them. The forward view
preserves every mapping from CoCreate File's original extension table.

`getContentType({ contentType, value, extension, pathname, fallback })` resolves,
in order, an explicit type, a data URL's MIME type, a Blob/File type, an explicit
extension, and a filename extension. Extensions can include or omit the dot.
Its default fallback is `application/octet-stream`.
The conversion functions default unidentified strings to `text/plain` and
unidentified bytes to `application/octet-stream`.

`getExtension({ contentType, fallback })` returns the preferred extension or `""`
by default. `getExtensions({ contentType })` returns a fresh array of all known
extensions or `[]`. For JPEG the preference is `.jpg` before `.jpeg`, and for HTML
it is `.html` before `.htm`. A MIME type cannot identify the original filename
extension uniquely. Other preferences follow their original table order.
Both reverse lookups ignore MIME parameters and letter case.

`isTextContentType(contentType)` reads the registry's text flag, then applies
`text/*`, `*+json`, and `*+xml` rules for types outside the registry. It classifies
text, JSON, XML, JavaScript, and SVG as textual content.
Other types, including PDF, archives, and Office documents, remain binary.
Explicit output formats override that classification.
MIME parameters are preserved in encoded data URLs, while classification uses
the normalized MIME type without parameters.

Existing implementations differ: the server uploader's binary regex omits PDF,
archives, and Office documents, while the browser reads PDF as a data URL and
some Office documents as binary strings. Its Office conversion condition also
checks the split MIME array rather than its subtype. The helpers support binary
outputs for these MIME types, but the migrated callers retain their previous
mode selections. This migration does not silently change existing storage formats
or correct those pre-existing classification gaps.

Auto mode follows the file server's convention of recognizing bare Base64 for
binary MIME types when the string matches its alphabet and padded length.
Otherwise it treats that binary source as a Latin-1 binary string. Ordinary
strings can also happen to be valid Base64: specify `encoding` whenever the
source encoding is known. MIME type alone cannot remove this ambiguity.

HTML rendering, XML host replacement, directory handling, metadata templates,
socket requests, and filesystem operations remain component responsibilities.

See [consumer-fit.md](./consumer-fit.md) for the requirements and explicit output
options reviewed for each consumer. The registry update itself changes Utils
and its tests/documentation, with no additional edits to consumer components.
