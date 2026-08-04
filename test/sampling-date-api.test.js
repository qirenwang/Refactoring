const assert = require('node:assert/strict');
const test = require('node:test');

const {
    addPartialDatePresentation,
    normalizeSamplingEventDates
} = require('../utils/sampling-date');

test('single collection accepts year-only precision and clears end components', () => {
    assert.deepEqual(
        normalizeSamplingEventDates({
            device_installation_period: 'no',
            start_year: '2025',
            start_month: '',
            start_day: ''
        }),
        {
            mode: 'no',
            start: {
                year: 2025,
                month: null,
                day: null,
                precision: 'year'
            },
            end: {
                year: null,
                month: null,
                day: null,
                precision: null
            }
        }
    );
});

test('single collection rejects hidden end-date values', () => {
    assert.throws(
        () => normalizeSamplingEventDates({
            device_installation_period: 'no',
            start_year: 2025,
            end_year: 2026
        }),
        error => error.statusCode === 400 &&
            /must be blank/.test(error.message)
    );
});

test('device period validates both partial dates and their order', () => {
    const valid = normalizeSamplingEventDates({
        device_installation_period: 'yes',
        start_year: 2024,
        start_month: 11,
        end_year: 2025,
        end_month: 2
    });
    assert.equal(valid.start.precision, 'month');
    assert.equal(valid.end.precision, 'month');

    assert.throws(
        () => normalizeSamplingEventDates({
            device_installation_period: 'yes',
            start_year: 2025,
            start_month: 7,
            end_year: 2025,
            end_month: 6
        }),
        error => error.statusCode === 400 &&
            /must be after/.test(error.message)
    );
});

test('server normalization enforces leap years and month lengths', () => {
    assert.doesNotThrow(() => normalizeSamplingEventDates({
        device_installation_period: 'no',
        start_year: 2000,
        start_month: 2,
        start_day: 29
    }));

    for (const start of [
        { start_year: 1900, start_month: 2, start_day: 29 },
        { start_year: 2025, start_month: 4, start_day: 31 },
        { start_year: 2025, start_day: 18 }
    ]) {
        assert.throws(
            () => normalizeSamplingEventDates({
                device_installation_period: 'no',
                ...start
            }),
            error => error.statusCode === 400
        );
    }
});

test('API presentation exposes component aliases without inventing precision', () => {
    const single = addPartialDatePresentation({
        StartYear: 2025,
        StartMonth: null,
        StartDay: null,
        DeviceInstallationPeriod: 'no'
    });
    assert.equal(single.collection_date_key, '2025');
    assert.equal(single.collection_date_display, '2025');
    assert.equal(single.collection_year, 2025);
    assert.equal(single.collection_month, null);

    const device = addPartialDatePresentation({
        start_year: 2024,
        start_month: 11,
        start_day: null,
        end_year: 2025,
        end_month: 2,
        end_day: 28,
        device_installation_period: 'yes'
    });
    assert.equal(
        device.collection_date_display,
        'November 2024 – February 28, 2025'
    );
    assert.equal(device.collection_date_key, '2024-11');
    assert.equal(device.end_date, '2025-02-28');
});
