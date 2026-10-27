import assert from "node:assert/strict";
import test from "node:test";
import { resolveProperty } from "../src/modules/resolveProperty.js";

test("resolves own, inherited, non-enumerable, and function properties", () => {
    class Target {
        customMethod() {}
    }
    const target = new Target();
    target.textContent = "";
    Object.defineProperty(target, "hiddenValue", { value: undefined });
    assert.equal(resolveProperty(target, "TEXTCONTENT"), "textContent");
    assert.equal(resolveProperty(target, "custommethod"), "customMethod");
    assert.equal(resolveProperty(target, "hiddenvalue"), "hiddenValue");
    Target.staticMethod = () => {};
    assert.equal(resolveProperty(Target, "staticmethod"), "staticMethod");
});

test("missing names and nullish inputs return undefined", () => {
    for (const object of [null, undefined, {}, Object.create(null)]) {
        assert.equal(resolveProperty(object, "missing"), undefined);
    }
    assert.equal(resolveProperty({}, undefined), undefined);
    assert.equal(resolveProperty({ "": 1 }, ""), "");
});

test("does not evaluate getters while resolving keys", () => {
    const target = { get customValue() { assert.fail("Getter must not run"); } };
    assert.equal(resolveProperty(target, "customvalue"), "customValue");
});

test("identical overrides are allowed but different casing is ambiguous", () => {
    const target = Object.create({ customMethod() {} });
    target.customMethod = () => {};
    assert.equal(resolveProperty(target, "custommethod"), "customMethod");
    target.custommethod = () => {};
    for (const name of ["custommethod", "customMethod", "CUSTOMMETHOD"]) {
        assert.throws(() => resolveProperty(target, name), /Ambiguous property/);
    }
    assert.throws(() => resolveProperty({ foo: 1, Foo: 2 }, "foo"), /Ambiguous property/);
});
