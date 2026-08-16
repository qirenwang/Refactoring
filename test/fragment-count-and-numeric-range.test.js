'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const {
    getFragmentDebrisCount,
    buildFragmentCountColumns,
    readFragmentCountFromRow,
    validateNumericRanges,
    validateNewSaveRules,
    hasFragmentsDetailData
} = require('../routes/api')._internals;

const fakeConnection = () => ({
    execute: async () => { throw new Error('unexpected query'); }
});

test('the form exposes a single merged fragments count and no whole-packaging count', () => {
    const page5 = fs.readFileSync(path.join(projectRoot, 'views', 'data_forms', 'formpage5.ejs'), 'utf8');
    assert.match(page5, /Fragments Count \(greater than 5mm\):/);
    assert.doesNotMatch(page5, /name="packaging_count"/);
    assert.doesNotMatch(page5, /Whole packaging Count/);

    // Purposes come first in Fragments Details (before Color Types).
    const purposeIdx = page5.indexOf("tableId: 'fragments_purpose_details'");
    const colorIdx = page5.indexOf("tableId: 'fragments_color_details'");
    assert.ok(purposeIdx > 0 && colorIdx > 0 && purposeIdx < colorIdx);
});

test('getFragmentDebrisCount uses fragments_count and folds a legacy packaging_count', () => {
    assert.equal(getFragmentDebrisCount({}), null);
    assert.equal(getFragmentDebrisCount({ fragments_count: '' }), null);
    assert.equal(getFragmentDebrisCount({ fragments_count: '12' }), 12);
    assert.equal(getFragmentDebrisCount({ fragments_count: '10', packaging_count: '5' }), 15);
    assert.equal(getFragmentDebrisCount({ packaging_count: '5' }), 5);
    assert.equal(hasFragmentsDetailData({ fragments_count: '3' }), true);
    assert.equal(hasFragmentsDetailData({ fragments_count: '0' }), false);
});

test('buildFragmentCountColumns writes the merged column when it exists and clears the legacy split', async () => {
    const merged = await buildFragmentCountColumns(
        fakeConnection(),
        { fragments_count: '12' },
        new Set(['FragLargerThan5mm_Count', 'PurposeKnown_Count', 'PurposeUnknown_Count'])
    );
    assert.deepEqual(merged, {
        FragLargerThan5mm_Count: 12,
        PurposeKnown_Count: null,
        PurposeUnknown_Count: null
    });

    const afterDrop = await buildFragmentCountColumns(
        fakeConnection(),
        { fragments_count: '12' },
        new Set(['FragLargerThan5mm_Count'])
    );
    assert.deepEqual(afterDrop, { FragLargerThan5mm_Count: 12 });
});

test('buildFragmentCountColumns keeps the merged count in PurposeUnknown_Count before the migration', async () => {
    const legacy = await buildFragmentCountColumns(
        fakeConnection(),
        { fragments_count: '7' },
        new Set(['PurposeKnown_Count', 'PurposeUnknown_Count'])
    );
    assert.deepEqual(legacy, { PurposeUnknown_Count: 7, PurposeKnown_Count: null });

    const empty = await buildFragmentCountColumns(
        fakeConnection(),
        {},
        new Set(['PurposeKnown_Count', 'PurposeUnknown_Count'])
    );
    assert.deepEqual(empty, { PurposeUnknown_Count: null, PurposeKnown_Count: null });
});

test('readFragmentCountFromRow reads either schema generation', () => {
    assert.equal(readFragmentCountFromRow(null), null);
    assert.equal(readFragmentCountFromRow({ FragLargerThan5mm_Count: 9 }), 9);
    assert.equal(readFragmentCountFromRow({ FragLargerThan5mm_Count: 0, PurposeKnown_Count: 4 }), 0);
    assert.equal(readFragmentCountFromRow({ PurposeKnown_Count: 4, PurposeUnknown_Count: 6 }), 10);
    assert.equal(readFragmentCountFromRow({ PurposeKnown_Count: null, PurposeUnknown_Count: 6 }), 6);
    assert.equal(readFragmentCountFromRow({ PurposeKnown_Count: null, PurposeUnknown_Count: null }), null);
    assert.equal(readFragmentCountFromRow({ Mass_Debris_Total: 1.5 }), null);
});

test('negative measurements and counts are rejected server-side', () => {
    assert.deepEqual(validateNumericRanges({}), []);
    assert.deepEqual(validateNumericRanges({ volume_sampled: '2.5', fragments_count: '3', air_temp: '-4' }), []);

    const errors = validateNumericRanges({
        volume_sampled: '-0.01',
        total_water_depth: '-0.1',
        fragments_count: '-2',
        microplastics_count: '1.5',
        soil_sand: '120',
        conductivity: 'abc'
    });
    assert.ok(errors.some(e => /Volume sampled cannot be negative/.test(e)));
    assert.ok(errors.some(e => /Total water depth cannot be negative/.test(e)));
    assert.ok(errors.some(e => /Fragments count cannot be negative/.test(e)));
    assert.ok(errors.some(e => /Microplastics count must be a whole number/.test(e)));
    assert.ok(errors.some(e => /Soil sand \(%\) cannot exceed 100/.test(e)));
    assert.ok(errors.some(e => /Conductivity must be a plain number/.test(e)));
    assert.equal(errors.length, 6);

    const result = validateNewSaveRules({ has_quantitative_data: 'no', volume_sampled: '-1' });
    assert.equal(result.isValid, false);
    assert.match(result.message, /Volume sampled cannot be negative/);
});

test('exponent/hex forms that parseInt would truncate are rejected, plain decimals accepted', () => {
    // '1e1' -> Number 10 but parseInt 1; '0x10' -> Number 16 but parseInt 0.
    const errors = validateNumericRanges({ fragments_count: '1e1', microplastics_count: '0x10', volume_sampled: '2e2' });
    assert.equal(errors.length, 3);
    errors.forEach(message => assert.match(message, /plain number/));

    assert.deepEqual(validateNumericRanges({ fragments_count: '12', volume_sampled: '.5', turbidity: '3.', conductivity: '+0.25' }), []);
    assert.deepEqual(validateNumericRanges({ fragments_count: '12.0' }), ['Fragments count must be a whole number.']);
});

test('camelCase aliases honoured by the save path are validated too', () => {
    const errors = validateNumericRanges({
        fragments_massDebrisTotal: '-3',
        micro_massMPTotal: '-1',
        totalSampleAmount: '-2'
    });
    assert.deepEqual(errors.sort(), [
        'Total fragments mass cannot be negative.',
        'Total microplastics mass cannot be negative.',
        'Total sample amount cannot be negative.'
    ].sort());
});

test('migration headers document the safe deployment order', () => {
    const merge = fs.readFileSync(path.join(projectRoot, 'db', '20260815_merge_fragment_purpose_counts.sql'), 'utf8');
    assert.match(merge, /CODE FIRST, then this migration/);
    const other = fs.readFileSync(path.join(projectRoot, 'db', '20260815_add_polymer_other_description.sql'), 'utf8');
    assert.match(other, /merge_fragment_purpose_counts\.sql \(that one must[\s-]+come AFTER the code deploy/);
});

test('page 4 numeric inputs carry min="0" so the browser and JS guard agree', () => {
    const page4 = fs.readFileSync(path.join(projectRoot, 'views', 'data_forms', 'formpage4.ejs'), 'utf8');
    const numberInputs = page4.match(/<input type="number"[^>]*>/g) || [];
    assert.ok(numberInputs.length >= 20);
    numberInputs.forEach(tag => {
        assert.match(tag, /min="0"/, `missing min="0": ${tag}`);
    });
});

test('client keeps a single polymer total banner and validates numeric ranges before navigating', () => {
    const handler = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'form-handler.js'), 'utf8');
    assert.doesNotMatch(handler, /function validatePolymerPercentages/);
    assert.doesNotMatch(handler, /polymer-percentage-warning/);
    assert.match(handler, /Current Total: \$\{total\.toFixed\(1\)\}%/);
    assert.match(handler, /function ensureNumericInputsValid/);
    assert.match(handler, /Value cannot be negative\./);

    // Review follow-ups: the polymer validator only undoes its own button lock
    // (never re-enables an in-flight Save), untouched legacy groups in edit mode
    // are informational, error messages sit under grid rows, and a lower bound
    // above zero is not enforced mid-keystroke.
    assert.match(handler, /button\.dataset\.percentLock === 'true'/);
    assert.match(handler, /percentage-status legacy/);
    assert.match(handler, /input\.closest\('\.form-row, \.detail-percent-row, \.partial-date-inputs'\)/);
    assert.match(handler, /function isPartialEntryOfPositiveMin/);
    assert.match(handler, /syncOtherPolymerSpecifyRow\(prefix, \{ clear: true \}\)/);
    assert.doesNotMatch(handler, /'packaging_count': 'Packaging Items Count'/);
});
