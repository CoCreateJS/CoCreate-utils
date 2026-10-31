import test from 'node:test';
import assert from 'node:assert/strict';
import { astSync, astAsync } from '../src/modules/ast/index.js';
import { encodeContent } from '../src/modules/file/index.js';
import { sharedGlobalsScope } from '../src/modules/ast/sharedGlobals.js';

test('file AST globals directly delegate to shared conversion helpers', async () => {
    assert.equal(sharedGlobalsScope.$encodeContent, encodeContent);
    for (const execute of [astSync, astAsync]) {
        assert.equal(await execute({ executeAST: { $encodeContent: { value: [0, 255], format: 'base64' } } }), 'AP8=');
        assert.deepEqual(await execute({ executeAST: { $decodeContent: { value: 'AP8=', encoding: 'base64', format: 'bytes' } } }), Uint8Array.of(0, 255));
        assert.equal(await execute({ executeAST: { $getContentType: { pathname: 'image.PNG' } } }), 'image/png');
        assert.equal(await execute({ executeAST: { $getExtension: { contentType: 'image/jpeg' } } }), '.jpg');
        assert.deepEqual(await execute({ executeAST: { $getExtensions: { contentType: 'image/jpeg' } } }), ['.jpg', '.jpeg']);
        assert.equal(await execute({ executeAST: { $isTextContentType: 'image/svg+xml' } }), true);
    }
});

test('async AST awaits File/Blob conversion', async () => {
    const file = new Blob([Uint8Array.of(0, 255)], { type: 'image/png' });
    assert.equal(await astAsync({ executeAST: { $encodeContent: { value: '$file', format: 'base64' } }, sandbox: { file } }), 'AP8=');
});
