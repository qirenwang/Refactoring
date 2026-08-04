const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('sampling-event form uses six date components and no exact-date controls', () => {
    const template = read('views/data_forms/formpage2.ejs');

    [
        'start_year',
        'start_month',
        'start_day',
        'end_year',
        'end_month',
        'end_day'
    ].forEach(fieldName => {
        assert.match(template, new RegExp(`name="${fieldName}"`));
    });

    assert.doesNotMatch(template, /name="(?:sample_date|device_start_date|device_end_date)"/);
    assert.doesNotMatch(template, /type="date"/);
});

test('browser entry points load the shared partial-date utility before consumers', () => {
    const formPage = read('views/enter_data_by_form.ejs');
    const mySamples = read('views/my_samples.ejs');
    const home = read('views/home.ejs');

    assert.ok(
        formPage.indexOf('/js/partial-date-utils.js') <
        formPage.indexOf('/js/form-handler.js')
    );
    assert.match(mySamples, /\/js\/partial-date-utils\.js/);
    assert.ok(
        home.indexOf('/js/partial-date-utils.js') <
        home.indexOf('/js/map-home.js')
    );
});

test('active API and canonical schema no longer depend on exact date columns', () => {
    const api = read('routes/api.js');
    const schema = read('database_init.sql');

    const removedDatabaseColumns = /\b(?:SamplingDate|DeviceStartDate|DeviceEndDate)\b/;
    assert.doesNotMatch(api, removedDatabaseColumns);
    assert.doesNotMatch(schema, removedDatabaseColumns);

    [
        'StartYear',
        'StartMonth',
        'StartDay',
        'EndYear',
        'EndMonth',
        'EndDay'
    ].forEach(columnName => {
        assert.match(api, new RegExp(`\\b${columnName}\\b`));
        assert.match(schema, new RegExp(`\\b${columnName}\\b`));
    });
});

test('in-place migration adds components, backfills them, then removes exact dates', () => {
    const migration = read('db/20260728_replace_sampling_dates_with_components.sql');

    assert.match(migration, /ALTER TABLE\s+`?SamplingEvent`?/i);
    assert.match(migration, /ADD COLUMN\s+`?StartYear`?/i);
    assert.match(migration, /UPDATE\s+`?SamplingEvent`?/i);
    assert.match(migration, /DROP COLUMN\s+`?SamplingDate`?/i);
    assert.match(migration, /DROP COLUMN\s+`?DeviceStartDate`?/i);
    assert.match(migration, /DROP COLUMN\s+`?DeviceEndDate`?/i);
    assert.doesNotMatch(migration, /CREATE TABLE\s+`?SamplingEvent`?/i);
});
