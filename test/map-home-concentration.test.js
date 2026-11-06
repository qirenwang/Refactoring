'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildConcentrationLines,
    formatConcentration,
    formatConcentrationValue,
    formatUnitLabel
} = require('../public/js/map-home');

test('unit codes render as popup suffixes, km2 as km²', () => {
    assert.equal(formatUnitLabel('L'), 'L');
    assert.equal(formatUnitLabel('g'), 'g');
    assert.equal(formatUnitLabel('km2'), 'km²');
    assert.equal(formatUnitLabel(' KM2 '), 'km²');
    assert.equal(formatUnitLabel('m3'), 'm3');
    assert.equal(formatUnitLabel(null), '');
});

test('values >= 10 round to integers, values < 10 keep two significant digits', () => {
    assert.equal(formatConcentrationValue(10), '10');
    assert.equal(formatConcentrationValue(12.5), '13');
    assert.equal(formatConcentrationValue(1234.4), '1,234');
    assert.equal(formatConcentrationValue(9.96), '10');
    assert.equal(formatConcentrationValue(9.4), '9.4');
    assert.equal(formatConcentrationValue(2.5), '2.5');
    assert.equal(formatConcentrationValue(0.5), '0.5');
    assert.equal(formatConcentrationValue(1 / 3), '0.33');
    assert.equal(formatConcentrationValue(0.000123), '0.00012');
    assert.equal(formatConcentrationValue(0), '0');
});

test('count divided by the size class amount, per its own unit', () => {
    assert.equal(formatConcentration(25, '2.000000', 'L', '10', 'g'), '13 /L');
    assert.equal(formatConcentration(3, '4', 'g', null, null), '0.75 /g');
    assert.equal(formatConcentration(7, '0.000500', 'km2', null, null), '14,000 /km²');
    assert.equal(formatConcentration(0, '5', 'L', null, null), '0 /L');
});

test('missing or zero dedicated amount falls back to the total sample amount and unit', () => {
    assert.equal(formatConcentration(12, null, null, '3', 'g'), '4 /g');
    assert.equal(formatConcentration(12, '0', 'L', '3', 'g'), '4 /g');
    assert.equal(formatConcentration(12, '', 'L', '24', 'L'), '0.5 /L');
    // dedicated amount present but its unit missing: borrow the total unit
    assert.equal(formatConcentration(12, '6', null, null, 'L'), '2 /L');
});

test('missing count reads "Not analyzed"', () => {
    assert.equal(formatConcentration(null, '2', 'L', '2', 'L'), 'Not analyzed');
    assert.equal(formatConcentration(undefined, null, null, null, null), 'Not analyzed');
    assert.equal(formatConcentration('', '2', 'L', null, null), 'Not analyzed');
});

test('count without a usable amount shows the raw count (divide-by-zero guard)', () => {
    assert.equal(formatConcentration(42, null, null, null, null), '42 particles (no sample amount recorded)');
    assert.equal(formatConcentration(1, '0', 'L', '0', 'L'), '1 particle (no sample amount recorded)');
    assert.equal(formatConcentration(0, null, 'L', '-1', 'L'), '0 particles (no sample amount recorded)');
});

test('amount without any unit is still divided but flagged', () => {
    assert.equal(formatConcentration(10, '4', null, null, null), '2.5 per sample amount (unit not recorded)');
});

test('popup lines use the API field names for both size classes', () => {
    const lines = buildConcentrationLines({
        fragments_count: 6,
        fragments_sample_amount: '3.000000',
        fragments_sample_unit: 'km2',
        microplastics_count: null,
        microplastics_sample_amount: '1.000000',
        microplastics_sample_unit: 'L',
        total_sample_amount: null,
        total_sample_unit: null
    });
    assert.deepEqual(lines, [
        { label: 'Plastic fragments (>5mm)', value: '2 /km²' },
        { label: 'Microplastics (<5mm)', value: 'Not analyzed' }
    ]);
});
