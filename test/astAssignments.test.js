import assert from 'node:assert/strict';
import test from 'node:test';
import { astAsync, astSync } from '../src/modules/ast/index.js';

for (const execute of [astSync, astAsync]) {
    test(`${execute.name}: dotted destination receives a nested call result`, async () => {
        const node = {};
        const instance = { ready: true };
        let calls = 0;
        const result = await execute({
            executeAST: { '$this.particlesJS': { $particlesJS: ['auth-particles', {}] } },
            node,
            sandbox: {
                $this: node,
                $particlesJS(id, options) {
                    calls++;
                    assert.equal(id, 'auth-particles');
                    assert.deepEqual(options, {});
                    return instance;
                }
            }
        });
        assert.equal(calls, 1);
        assert.equal(result, instance);
        assert.equal(node.particlesJS, instance);
        assert.equal(Object.hasOwn(node, '$this.particlesJS'), false);
    });

    test(`${execute.name}: sibling assignments use preceding results and preserve the host`, async () => {
        const node = { value: 'old', settings: { enabled: true }, items: [] };
        const response = { data: 'created' };
        const result = await execute({
            executeAST: {
                response: { '$api.send': [] },
                '$this.value': '$response.data',
                '$this.settings.enabled': false,
                '$this.items[0]': '$response',
                host: '$this'
            },
            node,
            sandbox: { $this: node, api: { send: () => response } }
        });
        assert.equal(node.value, 'created');
        assert.equal(node.settings.enabled, false);
        assert.equal(node.items[0], response);
        assert.equal(result.response, response);
        assert.equal(result.host, node);
    });

    test(`${execute.name}: callable members retain invocation and receiver semantics`, async () => {
        const plugin = { method(value) { this.received = value; return 'called'; } };
        const result = await execute({
            executeAST: { '$Plugin.method': ['argument'] },
            sandbox: { Plugin: plugin }
        });
        assert.equal(result, 'called');
        assert.equal(plugin.received, 'argument');
        assert.equal(typeof plugin.method, 'function');
    });

    test(`${execute.name}: assignments retain null, array, and function values`, async () => {
        const node = {};
        const callback = () => assert.fail('Assigned callback must not run');
        for (const value of [null, 0, '', [1, 2], callback]) {
            await execute({
                executeAST: { '$this.value': '$assigned' },
                node,
                sandbox: { $this: node, assigned: value }
            });
            assert.equal(node.value, value);
        }
    });

    test(`${execute.name}: shared dot notation creates parents and appends array values`, async () => {
        const node = { items: ['existing'] };
        await execute({
            executeAST: {
                '$this.settings.theme.color': 'blue',
                '$this.items[]': ['one', 'two'],
                '$this.rows[0].name': 'first'
            },
            sandbox: { $this: node }
        });
        assert.equal(node.settings.theme.color, 'blue');
        assert.deepEqual(node.items, ['existing', 'one', 'two']);
        assert.deepEqual(node.rows, [{ name: 'first' }]);
    });

    test(`${execute.name}: undefined uses shared property deletion and array splice semantics`, async () => {
        const node = { value: 1, items: ['one', 'two'] };
        await execute({
            executeAST: { '$this.value': '$removed', '$this.items[0]': '$removed' },
            sandbox: { $this: node, removed: undefined }
        });
        assert.equal(Object.hasOwn(node, 'value'), false);
        assert.deepEqual(node.items, ['two']);
    });

    test(`${execute.name}: registry and Map sandbox roots keep their original references`, async () => {
        for (const prefixed of [true, false]) {
            const destination = {};
            const registry = new Map([[prefixed ? '$destination' : 'destination', destination]]);
            for (const scope of [{ registry }, { sandbox: registry }]) {
                await execute({
                    executeAST: { '$destination.settings.enabled': true },
                    ...scope
                });
                assert.equal(destination.settings.enabled, true);
            }
        }
    });
}

test('asynchronous assignment waits for the initializer result', async () => {
    const node = {};
    const instance = {};
    await astAsync({
        executeAST: { '$this.instance': { $create: [] } },
        node,
        sandbox: { $this: node, create: async () => instance }
    });
    assert.equal(node.instance, instance);
});
