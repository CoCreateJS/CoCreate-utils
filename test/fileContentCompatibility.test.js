import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import os from 'node:os';
import { once } from 'node:events';
import { encodeContent, decodeContent, getContentType, mimeTypes } from '../src/modules/file/index.js';

const modules = new URL('../../', import.meta.url);
const references = new URL('../src/modules/file/references/', import.meta.url);
const targets = {
    http: 'CoCreate-file-server/src/index.js',
    client: 'CoCreate-file/src/client/index.js',
    server: 'CoCreate-file/src/server/index.js',
    url: 'CoCreate-url-uploader/src/index.js'
};
function source(name) {
    const staged = process.env.COCREATE_FILE_CANDIDATES;
    return fs.readFileSync(staged ? path.join(staged, `${name}.js`) : new URL(targets[name], modules), 'utf8').replace(/\r/g, '');
}
function reference(name) {
    return fs.readFileSync(new URL(`${name}.js`, references), 'utf8').replace(/\r/g, '');
}
function section(text, start, end) {
    const position = text.indexOf(start);
    assert.notEqual(position, -1, `Missing ${start}`);
    const finish = end ? text.indexOf(end, position) : -1;
    return text.slice(position, finish < 0 ? text.length : finish);
}
function compile(code, name, context = {}) {
    return vm.runInNewContext(`(() => { ${code}\nreturn ${name}; })()`, {
        Buffer, ArrayBuffer, Uint8Array, Blob, File, TextDecoder, encodeContent, decodeContent, getContentType, ...context
    });
}
function wire(value) {
    return typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
}

const normalizeCode = text => section(text, 'async function normalizeSrc(', '\nasync function sendResponse(');
const httpCases = [
    ['font buffer', Buffer.from([0, 255, 20]), 'font/woff2', '/a.woff2'],
    ['font data URL', 'data:font/woff2;base64,AP8U', 'font/woff2', '/a.woff2'],
    ['font whitespace and URL-safe Base64', ' AP_-\nAQ== ', 'font/woff2', '/a.woff2'],
    ['font raw binary string', '\0\xff !', 'font/woff2', '/a.woff2'],
    ['font binary string with UTF-16 code units', '🌍', 'font/woff2', '/a.woff2'],
    ['empty font', '', 'font/woff2', '/a.woff2'],
    ['permissive font Base64', 'data:font/woff2;base64,not@@base64', 'font/woff2', '/a.woff2'],
    ['font MIME inferred by extension', 'AP8U', 'application/octet-stream', '/a.woff2'],
    ['image data URL', 'data:image/png;base64,AP8U', 'image/png', '/a.png'],
    ['audio data URL', 'data:audio/ogg;base64,AP8U', 'audio/ogg', '/a.ogg'],
    ['video raw Base64', 'AP8U', 'video/mp4', '/a.mp4'],
    ['SVG Base64 data URL', 'data:image/svg+xml;base64,' + Buffer.from('\ufeff<svg>é</svg>').toString('base64'), 'image/svg+xml', '/a.svg'],
    ['SVG percent data URL', 'data:image/svg+xml,%3Csvg%3Ecaf%C3%A9%3C/svg%3E', 'image/svg+xml', '/a.svg'],
    ['plain SVG', '<svg>é</svg>', 'image/svg+xml', '/a.svg'],
    ['percent text', 'data:text/plain,caf%C3%A9', 'text/plain', '/a.txt'],
    ['bad percent text fallback', 'data:text/plain,bad%ZZ', 'text/plain', '/a.txt'],
    ['invalid UTF-8 percent fallback', 'data:text/plain,%FF', 'text/plain', '/a.txt'],
    ['bare JSON text', '{"a":"é"}', 'application/json', '/a.json'],
    ['BOM text', '\ufeffcafé', 'text/plain', '/a.txt'],
    ['Base64-looking ordinary text', 'test', 'text/plain', '/a.txt'],
    ['HTML rendering', '<html>Hello</html>', 'text/html', '/index.html'],
    ['XML host replacement', '<host>{{$host}}</host>', 'application/xml', '/a.xml'],
    ['pre-existing unsupported PDF data URL pass-through', 'data:application/pdf;base64,AP8U', 'application/pdf', '/a.pdf'],
    ['buffer passthrough', Buffer.from([0, 255, 20]), 'application/octet-stream', '/a.bin']
];
for (const [name, src, contentType, pathname] of httpCases) {
    test(`File Server reference: ${name}`, async () => {
        const records = [];
        const make = code => compile(normalizeCode(code), 'normalizeSrc', {
            server: null,
            render: { HTML: async options => {
                records.push({ theme: options.theme, src: options.file.src });
                return `rendered:${options.file.src}`;
            } }
        });
        const input = { src, contentType, pathname, file: { src }, theme: 'dark', urlObject: new URL('https://example.test/'), organization: {} };
        const expected = await make(reference('normalizeSrc'))(input);
        const actual = await make(source('http'))(input);
        assert.deepEqual(wire(actual), wire(expected));
        if (contentType === 'text/html') assert.deepEqual(records, [{ theme: 'dark', src }, { theme: 'dark', src }]);
    });
}

const uploadCode = text => section(text, 'async function getSource(', '\n    async function getData(');
for (const [name, mimeType] of Object.entries(mimeTypes)) {
    test(`File upload reference: ${name}`, async () => {
        const fileBytes = Buffer.from([239, 187, 191, 65, 195, 169, 0, 255, 20]);
        const run = async code => {
            const getSource = compile(uploadCode(code), 'getSource', {
                fs: { promises: { readFile: async () => fileBytes } }, realpathAsync: async value => value, console
            });
            const content = await getSource(`/test${name}`, mimeType, true);
            const expression = /"\{\{source\}\}": (.+),$/m.exec(code)?.[1];
            assert.ok(expression, 'Upload source template expression exists');
            const encoded = vm.runInNewContext(expression, { Buffer, encodeContent, source: content, mimeType });
            return { content: wire(content), encoded };
        };
        assert.deepEqual(await run(source('server')), await run(reference('upload')));
    });
}

test('shared MIME map exactly matches the File server reference lookup', () => {
    // Snapshot the original extension map independently of the implementation under test.
    const original = JSON.parse(fs.readFileSync(new URL('mimeTypes.json', references), 'utf8'));
    assert.deepEqual(mimeTypes, original);
});

const downloadCode = text => section(text, 'async function writeFiles(', '\nexport default async function file(');
const downloadCases = [
    ['native Buffer', Buffer.from([0, 255, 20])],
    ['serialized Buffer', { type: 'Buffer', data: [0, 255, 20] }],
    ['data array wrapper', { data: [0, 255, 20] }],
    ['Base64 data URL', 'data:image/png;base64,AP8U'],
    ['permissive Base64 data URL', 'data:image/png;base64,not@@base64'],
    ['raw Base64 payload characters', 'data:image/png;base64,%41%50'],
    ['text data URL', 'data:text/plain,caf%C3%A9'],
    ['raw text with BOM', '\ufeffcafé 🌍'],
    ['unmarked Base64-looking text', 'test'],
    ['empty source', ''],
    ['malformed data URL', 'data:text/plain,bad%ZZ'],
    ['invalid UTF-8 percent data URL', 'data:text/plain,%FF'],
    ['ordinary object fallback', { foo: 'bar' }]
];
for (const [name, src] of downloadCases) {
    test(`File download reference: ${name}`, async () => {
        const run = async code => {
            const writes = [];
            const writeFiles = compile(downloadCode(code), 'writeFiles', {
                path, process, console,
                fs: { existsSync: () => true, promises: {
                    mkdir: async () => {},
                    writeFile: async (filePath, value) => { writes.push({ filePath, bytes: wire(value) }); }
                } }
            });
            await writeFiles([{ pathname: '/example.bin', src }], null, '/virtual');
            return writes;
        };
        assert.deepEqual(await run(source('server')), await run(reference('download')));
    });
}

// A small FileReader stand-in isolates the reference's browser I/O. Its outputs
// follow native FileReader modes; comparisons run with real Blob/File objects.
class ReferenceFileReader {
    complete(file, transform) {
        file.arrayBuffer().then(buffer => {
            this.result = transform(Buffer.from(buffer));
            this.onload();
        });
    }
    readAsDataURL(file) { this.complete(file, bytes => `data:${file.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`); }
    readAsBinaryString(file) { this.complete(file, bytes => bytes.toString('latin1')); }
    readAsArrayBuffer(file) { this.complete(file, bytes => Uint8Array.from(bytes).buffer); }
    readAsText(file) {
        this.complete(file, bytes => {
            const parameter = /charset\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(file.type);
            let fallback = parameter?.[1] || parameter?.[2] || 'utf-8';
            try { fallback = new TextDecoder(fallback).encoding; } catch { fallback = 'utf-8'; }
            const charset = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
                : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be'
                : bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 'utf-8' : fallback;
            return new TextDecoder(charset).decode(bytes);
        });
    }
}

for (const [type, bytes, expected] of [
    ['text/plain;charset=windows-1252', [0x80, 0xe9], '€é'],
    ['text/plain;charset="windows-1252"', [0x80], '€'],
    ['text/plain;charset=invalid', [0xc3, 0xa9], 'é'],
    ['text/plain;charset=windows-1252', [0xef, 0xbb, 0xbf, 0xc3, 0xa9], 'é']
]) {
    test(`File client reference: MIME charset ${type} (${bytes.join(',')})`, async () => {
        for (const code of [reference('readFile'), source('client')]) {
            const reader = compile(readerCode(code), 'readFile', { FileReader: ReferenceFileReader });
            const file = new File([Uint8Array.from(bytes)], 'example.txt', { type });
            await reader(file);
            assert.equal(file.src, expected);
        }
    });
}
function readerCode(text) {
    const start = text.includes('async function readFile(') ? 'async function readFile(' : 'function readFile(';
    return section(text, start, '\nfunction setFiles(');
}
const readerCases = [
    ['image', 'image/png', undefined], ['video', 'video/mp4', undefined],
    ['audio', 'audio/ogg', undefined], ['PDF', 'application/pdf', undefined],
    ['MIME parameters', 'image/svg+xml;charset=utf-8', undefined],
    ['legacy Office binary string', 'application/msword', undefined],
    ['Office MIME text fallback', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', undefined],
    ['plain text', 'text/plain', undefined], ['SVG', 'image/svg+xml', undefined],
    ['explicit binary', 'text/plain', 'readAsBinaryString'],
    ['explicit buffer', 'image/png', 'readAsArrayBuffer'],
    ['explicit text', 'image/png', 'readAsText'],
    ['explicit data URL', 'text/plain', 'readAsDataURL'],
    ['empty MIME data URL', '', 'readAsDataURL'],
    ['directory', 'text/directory', undefined], ['blob passthrough', 'image/png', 'blob']
];
for (const [name, type, mode] of readerCases) {
    test(`File client reference: ${name}`, async () => {
        const run = async code => {
            const readFile = compile(readerCode(code), 'readFile', { FileReader: ReferenceFileReader, btoa });
            const file = new File([Uint8Array.of(0, 255, 20, 195, 169)], 'example.txt', { type });
            const result = await readFile(file, mode);
            assert.equal(result, file);
            return file.src instanceof ArrayBuffer ? new Uint8Array(file.src) : file.src;
        };
        assert.deepEqual(await run(source('client')), await run(reference('readFile')));
    });
}
for (const [name, bytes] of [
    ['UTF-8 BOM', [239, 187, 191, 65]], ['UTF-16 LE BOM', [255, 254, 65, 0]], ['UTF-16 BE BOM', [254, 255, 0, 65]]
]) {
    test(`File client reference: ${name}`, async () => {
        for (const code of [reference('readFile'), source('client')]) {
            const reader = compile(readerCode(code), 'readFile', { FileReader: ReferenceFileReader });
            const file = new File([Uint8Array.from(bytes)], 'example.txt', { type: 'text/plain' });
            await reader(file);
            assert.equal(file.src, 'A');
        }
    });
}

test('URL Uploader reference: fetch response, raw Base64, metadata, and same envelope', async () => {
    const payload = Uint8Array.from({ length: 100000 }, (_, index) => index % 256);
    const run = async code => {
        const sent = [];
        const fetchFileFromURL = compile(section(code, 'async function fetchFileFromURL(', '\n/**\n * Auto-initialization'), 'fetchFileFromURL', {
            URL, server: { wsManager: { send: value => sent.push(value) } }, console,
            arrayBufferToBase64: compile(section(reference('urlUploader'), 'function arrayBufferToBase64(', '\n/**'), 'arrayBufferToBase64'),
            fetch: async () => ({ ok: true, arrayBuffer: async () => payload.buffer, headers: new Map([['content-type', 'image/png']]) })
        });
        const data = { socket: {}, file: { src: 'https://example.test/file.png', custom: 'preserved' } };
        await fetchFileFromURL(data);
        assert.equal(sent[0], data);
        assert.equal(data.file.src, Buffer.from(payload).toString('base64'));
        return data;
    };
    assert.deepEqual(await run(source('url')), await run(reference('urlUploader')));
});

test('native filesystem writes and HTTP responses preserve the same binary file bytes', async t => {
    const bytes = Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256));
    const src = encodeContent({ value: bytes, contentType: 'image/png' });
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'coc-file-conversion-'));
    t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
    const writeFiles = compile(downloadCode(source('server')), 'writeFiles', { path, process, console, fs });
    await writeFiles([{ pathname: '/image.png', src }], null, directory);
    assert.deepEqual(await fs.promises.readFile(path.join(directory, 'image.png')), bytes);

    const normalizeSrc = compile(normalizeCode(source('http')), 'normalizeSrc', { server: null });
    const sendResponse = compile(section(source('http'), 'async function sendResponse(', '\n/**'), 'sendResponse', {
        console, process: { emit() {} }, getLastModified: () => null,
        responseCacheControl: () => 'no-store', getCachePolicy: () => ({})
    });
    const server = http.createServer(async (_request, response) => {
        try {
            const body = await normalizeSrc({ src, contentType: 'image/png', pathname: '/image.png' });
            await sendResponse({ res: response, src: body, statusCode: 200, headers: { 'Content-Type': 'image/png' } });
        } catch (error) { response.destroy(error); }
    });
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/image.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});
