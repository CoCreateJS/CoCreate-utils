import assert from 'node:assert/strict';
import test from 'node:test';
import { searchData } from '../src/modules/dataQuery.js';

for (const value of [123, 0, true, false, 123n, Symbol('example')]) {
    test(`scalar search ${String(value)} behaves like its string form`, () => {
        const search = { value, operator: 'or' };
        assert.equal(searchData({ name: 'unrelated' }, search), false);
        assert.equal(searchData({ name: String(value) }, search), true);
        assert.equal(searchData({}, search), false);
    });
}

for (const value of [null, undefined, '']) {
    test(`empty search ${String(value)} is safe and matches like an empty string`, () => {
        for (const data of [{}, { name: 'example' }, { name: null }]) {
            assert.equal(searchData(data, { value, operator: 'or' }), true);
        }
    });
}

test('normalizes multiple terms without modifying the input', () => {
    const values = Object.freeze([123, false]);
    const search = Object.freeze({ value: values, operator: 'or' });
    assert.equal(searchData({ name: 'false' }, search), true);
    assert.equal(searchData({ name: 'unrelated' }, search), false);
    assert.equal(searchData({}, search), false);
});

test('supports both boolean and string case sensitivity flags', () => {
    for (const caseSensitive of [true, 'true']) {
        assert.equal(searchData({ name: 'Alpha' }, { value: ['miss', 'alpha'], operator: 'or', caseSensitive }), false);
        assert.equal(searchData({ name: 'Alpha' }, { value: ['miss', 'Alpha'], operator: 'or', caseSensitive }), true);
    }
    for (const caseSensitive of [false, 'false', undefined]) {
        assert.equal(searchData({ name: 'Alpha' }, { value: 'alpha', operator: 'or', caseSensitive }), true);
    }
});

test('searches later fields and converts primitive field values', () => {
    assert.equal(searchData({ first: 'miss', second: false }, { value: 'false', operator: 'or' }), true);
    assert.equal(searchData({ value: 123n }, { value: '123', operator: 'or' }), true);
    assert.equal(searchData({ value: undefined }, { value: 'undefined', operator: 'or' }), false);
});

test('preserves empty filter and empty AND matching behavior', () => {
    assert.equal(searchData({}, undefined), true);
    assert.equal(searchData({}, []), true);
    assert.equal(searchData({}, { value: [], operator: 'or' }), true);
    assert.equal(searchData({ name: null }, { value: null, operator: 'and' }), true);
    assert.equal(searchData({ name: 'example' }, { value: null, operator: 'and' }), false);
});
