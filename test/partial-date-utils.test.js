const assert = require('node:assert/strict');
const test = require('node:test');

const {
    daysInMonth,
    formatPartialDate,
    formatPartialDateKey,
    isLeapYear,
    validateDateOrder,
    validateDateParts
} = require('../public/js/partial-date-utils');

test('leap years and month lengths follow Gregorian calendar rules', () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2025), false);
    assert.equal(isLeapYear(1900), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(daysInMonth(2024, 2), 29);
    assert.equal(daysInMonth(2025, 2), 28);
    assert.equal(daysInMonth(2025, 4), 30);
    assert.equal(daysInMonth(2025, 1), 31);
});

test('year, year-month, and full-date precision are valid', () => {
    assert.deepEqual(
        validateDateParts({ year: '2025', month: '', day: '' }),
        {
            valid: true,
            errors: [],
            year: 2025,
            month: null,
            day: null,
            precision: 'year'
        }
    );
    assert.equal(
        validateDateParts({ year: 2025, month: 6, day: null }).precision,
        'month'
    );
    assert.equal(
        validateDateParts({ year: 2024, month: 2, day: 29 }).precision,
        'day'
    );
});

test('invalid sparse and calendar dates are rejected', () => {
    assert.equal(validateDateParts({ year: 2025, month: null, day: 18 }).valid, false);
    assert.equal(validateDateParts({ year: 2025, month: 4, day: 31 }).valid, false);
    assert.equal(validateDateParts({ year: 2023, month: 2, day: 29 }).valid, false);
    assert.equal(validateDateParts({ year: 2024, month: 2, day: 30 }).valid, false);
    assert.equal(validateDateParts({ year: 2024, month: 13, day: null }).valid, false);
});

test('partial dates format without inventing missing components', () => {
    assert.equal(formatPartialDate({ year: 2025 }), '2025');
    assert.equal(formatPartialDate({ year: 2025, month: 6 }), 'June 2025');
    assert.equal(formatPartialDate({ year: 2025, month: 6, day: 18 }), 'June 18, 2025');
    assert.equal(formatPartialDateKey({ year: 2025 }), '2025');
    assert.equal(formatPartialDateKey({ year: 2025, month: 6 }), '2025-06');
    assert.equal(formatPartialDateKey({ year: 2025, month: 6, day: 18 }), '2025-06-18');
});

test('device date order rejects impossible ranges and permits ambiguous partial ranges', () => {
    assert.equal(
        validateDateOrder(
            { year: 2025, month: 6 },
            { year: 2025, month: 5 }
        ).valid,
        false
    );
    assert.equal(
        validateDateOrder(
            { year: 2025, month: 6 },
            { year: 2025, month: 6 }
        ).ambiguous,
        true
    );
    assert.equal(
        validateDateOrder(
            { year: 2025, month: 6, day: 10 },
            { year: 2025, month: 6, day: 10 }
        ).valid,
        false
    );
    assert.equal(
        validateDateOrder(
            { year: 2025, month: 6 },
            { year: 2025, month: 7 }
        ).valid,
        true
    );
});
