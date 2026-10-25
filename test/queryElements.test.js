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

test('contentDocument enters the selected iframe document and continues querying there', () => {
    const iframe = new Element();
    const inside = new Element();
    const frameDocument = {
        nodeType: 9,
        querySelector(selector) {
            this.queried = selector;
            return inside;
        }
    };
    iframe.contentDocument = frameDocument;

    assert.deepEqual(queryElements({ element: iframe, selector: '$contentDocument .inside' }), [inside]);
    assert.equal(frameDocument.queried, '.inside');
});

test('$frame can be followed by contentDocument to query inside the containing frame', () => {
    const iframe = new Element();
    const inside = new Element();
    const frameDocument = {
        nodeType: 9,
        querySelector(selector) {
            this.queried = selector;
            return inside;
        }
    };
    iframe.contentDocument = frameDocument;
    const currentDocument = { nodeType: 9, defaultView: { frameElement: iframe } };

    assert.deepEqual(queryElements({ element: currentDocument, selector: '$frame $contentDocument .inside' }), [inside]);
    assert.equal(frameDocument.queried, '.inside');
});

test('$activeElement returns the active element from the current document context', () => {
    const active = new Element();
    const doc = { nodeType: 9, activeElement: active };

    assert.deepEqual(queryElements({ element: doc, selector: '$activeElement' }), [active]);
});

test('$clickedElement returns the recorded click target from the current document context', () => {
    const clicked = new Element();
    const doc = { nodeType: 9, clickedElement: clicked };

    assert.deepEqual(queryElements({ element: doc, selector: '$clickedElement' }), [clicked]);
});

test('$clickedElement prefers the recorded click target on an iframe', () => {
    const frameClick = new Element();
    const documentClick = new Element();
    const iframe = new Element();
    iframe.tagName = 'IFRAME';
    iframe.clickedElement = frameClick;
    iframe.contentDocument = { nodeType: 9, clickedElement: documentClick };

    assert.deepEqual(queryElements({ element: iframe, selector: '$clickedElement' }), [frameClick]);
});

test('$clickedElement falls back to the iframe document click target', () => {
    const documentClick = new Element();
    const iframe = new Element();
    iframe.tagName = 'IFRAME';
    iframe.contentDocument = { nodeType: 9, clickedElement: documentClick };

    assert.deepEqual(queryElements({ element: iframe, selector: '$clickedElement' }), [documentClick]);
});

test('activeElement and clickedElement resolve from an element owner document', () => {
    const source = new Element();
    const active = new Element();
    const clicked = new Element();
    source.ownerDocument = { nodeType: 9, activeElement: active, clickedElement: clicked };

    assert.deepEqual(queryElements({ element: source, selector: '$activeElement' }), [active]);
    assert.deepEqual(queryElements({ element: source, selector: '$clickedElement' }), [clicked]);
});
