import assert from "node:assert/strict";
import test from "node:test";
import { astSync, astAsync } from "../src/modules/ast/index.js";

for (const [name, evaluate] of [["astSync", astSync], ["astAsync", astAsync]]) {
    test(`${name}: $function returns synchronously regardless of its creator`, async () => {
        const callback = await evaluate({
            executeAST: { $function: { params: ["value"], body: "$value" } }
        });
        assert.equal(callback("Returned value"), "Returned value");
        const promise = Promise.resolve("Promise returned without awaiting");
        assert.equal(callback(promise), promise);
    });

    test(`${name}: $async creates a deferred async callback that can await`, async () => {
        let calls = 0;
        const callback = await evaluate({
            sandbox: { record(value) { calls++; return value; } },
            executeAST: {
                $async: {
                    $function: {
                        params: ["value"],
                        body: { $record: { $await: "$value" } }
                    }
                }
            }
        });
        assert.equal(calls, 0);
        const result = callback(Promise.resolve("Awaited value"));
        assert.ok(result instanceof Promise);
        assert.equal(await result, "Awaited value");
        assert.equal(calls, 1);
        assert.deepEqual(await Promise.all([callback(Promise.resolve("A")), callback(Promise.resolve("B"))]), ["A", "B"]);
    });

    for (const isAsync of [false, true]) {
        test(`${name}: ${isAsync ? "$async" : "$function"} preserves scope, parameters, and binding`, async () => {
            const definition = {
                $function: {
                    params: ["value"],
                    bind: "$receiver",
                    body: { $concat: [["$prefix", ": ", "$this.label", ": ", "$value"]] }
                }
            };
            const callback = await evaluate({
                sandbox: { receiver: { label: "Bound" }, prefix: "Captured" },
                executeAST: isAsync ? { $async: definition } : definition
            });
            const result = callback("result");
            assert.equal(result instanceof Promise, isAsync);
            assert.equal(await result, "Captured: Bound: result");
        });
    }

    test(`${name}: synchronous callbacks throw and asynchronous callbacks reject`, async () => {
        const definition = { $function: { body: { $throw: "Defined failure" } } };
        const syncCallback = await evaluate({ executeAST: definition });
        assert.throws(() => syncCallback(), /Defined failure/);
        const asyncCallback = await evaluate({ executeAST: { $async: definition } });
        await assert.rejects(asyncCallback(), /Defined failure/);
    });

    test(`${name}: $await in an ordinary callback requires explicit $async`, async () => {
        const callback = await evaluate({
            executeAST: { $function: { params: ["value"], body: { $await: "$value" } } }
        });
        assert.throws(() => callback(Promise.resolve("value")), /requires astAsync/);
    });

    test(`${name}: removed async flags and invalid wrappers fail clearly`, async () => {
        for (const async of [true, false]) {
            await assert.rejects(async () => evaluate({
                executeAST: { $function: { async, body: "value" } }
            }), /wrap '\$function' in '\$async'/);
        }
        for (const wrapped of [null, [], "value", {}, { body: "value" }, { $function: { body: "value" }, extra: true }]) {
            await assert.rejects(async () => evaluate({ executeAST: { $async: wrapped } }), /nested '\$function'/);
        }
    });
}

test("async initialization still awaits existing library functions", async () => {
    const library = { async initialize() { return { ready: true }; } };
    const result = await astAsync({
        sandbox: { library },
        executeAST: { "$library.initialize": [] }
    });
    assert.deepEqual(result, { ready: true });
});

test("a JSON callback highlights supported code and returns a synchronous fallback", async () => {
    const calls = [];
    const grammar = { keyword: /const/ };
    const Prism = {
        languages: { javascript: grammar },
        highlight(code, receivedGrammar, language) {
            assert.equal(this, Prism);
            assert.equal(receivedGrammar, grammar);
            calls.push({ code, language });
            return "<span>Highlighted</span>";
        }
    };
    const callback = await astAsync({
        sandbox: { Prism },
        executeAST: {
            $function: {
                params: ["code", "language"],
                body: {
                    grammar: { $getObjectValue: ["$Prism.languages", "$language"] },
                    $return: {
                        $if: {
                            $grammar: {
                                $eq: {
                                    $undefined: "",
                                    $else: { "$Prism.highlight": ["$code", "$grammar", "$language"] }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    assert.equal(callback("const value = 1;", "javascript"), "<span>Highlighted</span>");
    assert.equal(callback("<button>", "unknown"), "");
    assert.equal(callback("<button>", ""), "");
    assert.equal(callback("const other = 2;", "javascript"), "<span>Highlighted</span>");
    assert.equal(calls.length, 2);
});
