'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PERCENTAGE_DECIMAL_PLACES,
    PERCENTAGE_TOLERANCE,
    isBlankPercentage,
    isPercentageTotalValid,
    parsePercentage,
    sumPercentages,
    toDatabasePercentage
} = require('../utils/percentage');

test('blank percentage values are treated as missing', () => {
    for (const value of [undefined, null, '', '   ']) {
        assert.equal(isBlankPercentage(value), true);
        assert.equal(parsePercentage(value), null);
        assert.equal(toDatabasePercentage(value), null);
    }

    assert.equal(isBlankPercentage(0), false);
    assert.equal(isBlankPercentage('0'), false);
});

test('parses integer, decimal, and sub-one percentages without truncation', () => {
    assert.equal(parsePercentage(25), 25);
    assert.equal(parsePercentage('33.6'), 33.6);
    assert.equal(parsePercentage('0.8'), 0.8);
    assert.equal(parsePercentage(0), 0);
    assert.equal(parsePercentage(100), 100);
});

test('normalizes percentages to four decimal places', () => {
    assert.equal(PERCENTAGE_DECIMAL_PLACES, 4);
    assert.equal(parsePercentage('12.34567'), 12.3457);
    assert.equal(parsePercentage('0.12344'), 0.1234);
    assert.equal(parsePercentage('0.00006'), 0.0001);
});

test('rejects unsupported value types', () => {
    for (const value of [true, false, [], {}, ['25']]) {
        assert.throws(
            () => parsePercentage(value, 'Polymer percentage'),
            TypeError
        );
    }
});

test('rejects non-numeric and non-finite values', () => {
    for (const value of ['not-a-number', '12abc', NaN, Infinity, -Infinity]) {
        assert.throws(
            () => parsePercentage(value, 'Polymer percentage'),
            {
                name: 'TypeError',
                message: 'Polymer percentage must be a number.'
            }
        );
    }
});

test('rejects percentages outside the inclusive 0 to 100 range', () => {
    for (const value of [-0.0001, -1, 100.0001, 101]) {
        assert.throws(
            () => parsePercentage(value, 'Polymer percentage'),
            {
                name: 'RangeError',
                message: 'Polymer percentage must be between 0 and 100.'
            }
        );
    }
});

test('sums decimal percentage groups and validates a total of 100', () => {
    const total = sumPercentages(['33.6', 33.6, '32.8'], 'Polymer percentage');

    assert.equal(total, 100);
    assert.equal(PERCENTAGE_TOLERANCE, 0.1);
    assert.equal(isPercentageTotalValid(total), true);
});

test('rejects the incomplete totals 98 and 99', () => {
    assert.equal(isPercentageTotalValid(98), false);
    assert.equal(isPercentageTotalValid(99), false);
});

test('applies the documented 0.1 tolerance at four-decimal precision', () => {
    assert.equal(isPercentageTotalValid(99.9), true);
    assert.equal(isPercentageTotalValid(100.1), true);
    assert.equal(isPercentageTotalValid(99.8999), false);
    assert.equal(isPercentageTotalValid(100.1001), false);
});

test('formats database values at fixed four-decimal precision', () => {
    assert.equal(toDatabasePercentage(25), '25.0000');
    assert.equal(toDatabasePercentage('33.6'), '33.6000');
    assert.equal(toDatabasePercentage('0.8'), '0.8000');
    assert.equal(toDatabasePercentage('12.34567'), '12.3457');
});
