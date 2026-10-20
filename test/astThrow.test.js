import assert from 'node:assert/strict';
import test from 'node:test';
import { astAsync, astSync } from '../src/modules/ast/index.js';

test('AST can stop a pipeline with a defined error in sync and async execution', async () => {
    const pipeline = {
        check: { $throw: 'The required record is unavailable.' },
        request: { '$send': [] }
    };
    const sandbox = { send: () => assert.fail('Execution must stop before sending') };
    assert.throws(() => astSync({ executeAST: pipeline, sandbox }), /required record is unavailable/);
    await assert.rejects(astAsync({ executeAST: pipeline, sandbox }), /required record is unavailable/);
});
