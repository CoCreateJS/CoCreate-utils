import assert from 'node:assert/strict';
import test from 'node:test';
import { queryElements } from '../src/modules/queryElements.js';

class Element {
    nodeType = 1;
    matches(selector) {
        this.matched = selector;
        return selector === this.selfSelector;
    }
    querySelector(selector) {
        this.queried = selector;
        return this.child;
    }
}
globalThis.Element = Element;
globalThis.HTMLCollection = class {};
globalThis.NodeList = class {};

for (const selector of ['#self', '.active', ':checked', '[title="a b, c"]', ':is(.a, :not(.b, .c))']) {
    test(`leading $this passes ${selector} intact to matches`, () => {
        const element = new Element();
        element.selfSelector = selector;
        assert.deepEqual(queryElements({ element, selector: `$this${selector}` }), [element]);
        assert.equal(element.matched, selector);
        assert.equal(element.queried, undefined);
    });
}

test('a failed guard stops only its own comma-separated branch', () => {
    const element = new Element();
    element.selfSelector = '.active';
    element.nextElementSibling = new Element();
    assert.deepEqual(queryElements({ element, selector: '$this.off $parent, $this.active $next' }), [element.nextElementSibling]);
});

test('bare $this returns self and a guarded descendant query preserves its full remainder', () => {
    const element = new Element();
    element.selfSelector = '.active';
    element.child = new Element();
    assert.deepEqual(queryElements({ element, selector: '$this' }), [element]);
    assert.deepEqual(queryElements({ element, selector: '$this.active .child span' }), [element.child]);
    assert.equal(element.queried, '.child span');
});

test('guarded queries continue through existing traversal operators', () => {
    const element = new Element();
    element.selfSelector = ':checked';
    element.parentElement = new Element();
    element.parentElement.child = new Element();
    assert.deepEqual(queryElements({ element, selector: '$this:checked $parent .peer' }), [element.parentElement.child]);
    assert.equal(element.parentElement.queried, '.peer');
});
