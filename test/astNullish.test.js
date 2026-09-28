import assert from "node:assert/strict";
import test from "node:test";
import { astAsync, astSync } from "../src/modules/ast/index.js";

test("AST preserves explicit undefined and null operators", async () => {
    const node = {};

    assert.equal(astSync({ executeAST: "$undefined", node }), undefined);
    assert.equal(astSync({ executeAST: "$null", node }), null);
    assert.equal(await astAsync({ executeAST: "$undefined", node }), undefined);
    assert.equal(await astAsync({ executeAST: "$null", node }), null);
});

test("AST preserves an unknown operator instead of treating it as undefined", async () => {
    const node = {};

    assert.equal(astSync({ executeAST: "$unknownOperator", node }), "$unknownOperator");
    assert.equal(
        await astAsync({ executeAST: "$unknownOperator", node }),
        "$unknownOperator"
    );
});
