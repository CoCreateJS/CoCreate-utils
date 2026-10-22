import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = { location: {} };
globalThis.localStorage = { getItem: () => null };

const { astSync, astAsync } = await import("../src/modules/ast/index.js");
const { processOperators } = await import("../src/modules/ast/operators.js");

test("backticks stringify values without evaluating the returned text again", async () => {
    for (const value of [true, false, "true", "false", 0, 12, null, undefined,
        "$value", "a'b\"c`,()", { name: "example" }, [1, 2]]) {
        const node = { getValue: () => value };
        for (const execute of [astSync, astAsync]) {
            assert.equal(await execute({ executeAST: "$value", node }), value);
            assert.equal(await execute({ executeAST: "`$value`", node }), String(value));
            assert.equal(await execute({ executeAST: "$(`$value`)", node }), String(value));
        }
    }
});

test("the badge ternary handles booleans and strings in sync and async AST", async () => {
    const expression = "$(`$value` === 'true' ? 'Enabled' : 'Disabled')";
    for (const [value, expected] of [[true, "Enabled"], [false, "Disabled"],
        ["true", "Enabled"], ["false", "Disabled"]]) {
        const node = { getValue: () => value };
        assert.equal(astSync({ executeAST: expression, node }), expected);
        assert.equal(await astAsync({ executeAST: expression, node }), expected);
        assert.equal(await astAsync({
            executeAST: expression,
            node: { getValue: () => Promise.resolve(value) }
        }), expected);
    }
});

test("single and double quotes preserve operators and backticks verbatim", async () => {
    const node = { getValue: () => { throw new Error("Literal was evaluated"); } };
    for (const expression of ["'$value'", '"$value"', "'`$value`'", '"`$value`"',
        "'$setValue($value)'", '"$setValue($value)"']) {
        assert.equal(processOperators(node, expression), expression);
        assert.equal(astSync({ executeAST: expression, node }), expression);
        assert.equal(await astAsync({ executeAST: expression, node }), expression);
    }
    for (const expression of ["$('$value')", '$("$value")', "$concat('$value')"]) {
        assert.equal(astSync({ executeAST: expression, node }), "$value");
        assert.equal(await astAsync({ executeAST: expression, node }), "$value");
    }
});

test("backtick interpolation retains the AST sandbox and mixed literal text", async () => {
    for (const execute of [astSync, astAsync]) {
        assert.equal(await execute({
            executeAST: "`$record.enabled`",
            sandbox: { $record: { enabled: false } }
        }), "false");
        assert.equal(await execute({
            executeAST: "`Hello $value`",
            node: { getValue: () => "world" }
        }), "Hello world");
        assert.equal(await execute({ executeAST: "`plain text`" }), "plain text");
    }
});

test("replacing an operator never modifies an identical occurrence inside quotes", async () => {
    const node = { getValue: () => "resolved" };
    for (const execute of [astSync, astAsync]) {
        assert.equal(await execute({
            executeAST: "'$value' $value",
            node
        }), "'$value' resolved");
        assert.equal(await execute({
            executeAST: "'`$value`' `$value`",
            node
        }), "'`$value`' resolved");
        assert.equal(await execute({
            executeAST: "'$concat(\"literal\")' $concat(\"literal\")",
            node
        }), "'$concat(\"literal\")' literal");
    }
});

test("each AST evaluation removes one backtick layer before the final string conversion", async () => {
    for (const execute of [astSync, astAsync]) {
        for (const layers of [2, 3, 5, 10]) {
            let expression = "`".repeat(layers) + "$value" + "`".repeat(layers);
            const node = { getValue: () => { throw new Error("Resolved before the last layer"); } };
            for (let remaining = layers - 1; remaining > 0; remaining--) {
                expression = await execute({ executeAST: expression, node });
                assert.equal(expression, "`".repeat(remaining) + "$value" + "`".repeat(remaining));
            }
            assert.equal(await execute({
                executeAST: expression,
                node: { getValue: () => true }
            }), "true");
        }
    }
});

test("backticks preserve single and double quotes at every layer", async () => {
    const node = { getValue: () => { throw new Error("Quoted operator was evaluated"); } };
    for (const execute of [astSync, astAsync]) {
        for (const quoted of ["'$value'", '"$value"']) {
            assert.equal(await execute({
                executeAST: "`" + quoted + "`", node
            }), quoted);
            const intermediate = await execute({
                executeAST: "``" + quoted + "``", node
            });
            assert.equal(intermediate, "`" + quoted + "`");
            assert.equal(await execute({ executeAST: intermediate, node }), quoted);
        }
    }
});
