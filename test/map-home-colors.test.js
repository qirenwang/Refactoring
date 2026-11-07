'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    buildLegendEntries,
    getColorForType,
    getMediaTypeEntry
} = require('../public/js/map-home');

const projectRoot = path.resolve(__dirname, '..');

test('each media type maps to its fixed marker color', () => {
    assert.equal(getColorForType('In Water'), '#1E90FF');
    assert.equal(getColorForType('In Soil/Sediment'), '#5C4033');
    assert.equal(getColorForType('On Soil'), '#D8B14A');
    assert.equal(getColorForType('Mixed Media'), '#888888');
});

test('media type matching ignores case and stray whitespace', () => {
    assert.equal(getColorForType('IN WATER'), '#1E90FF');
    assert.equal(getColorForType('  in water '), '#1E90FF');
    assert.equal(getColorForType('in soil / sediment'), '#5C4033');
    assert.equal(getColorForType('on  SOIL'), '#D8B14A');
    assert.equal(getColorForType('mixed media'), '#888888');
});

test('unknown or missing media types fall back to grey', () => {
    ['Unknown', '', null, undefined, 'Air'].forEach(type => {
        assert.equal(getColorForType(type), '#666666');
        assert.equal(getMediaTypeEntry(type).label, 'Other / Unspecified');
    });
});

test('legend lists only present types, in fixed order, with marker colors', () => {
    const legend = buildLegendEntries(new Set(['Mixed Media', 'on soil', 'In Water']));
    assert.deepEqual(
        legend.map(entry => [entry.label, entry.color]),
        [
            ['In Water', '#1E90FF'],
            ['On Soil', '#D8B14A'],
            ['Mixed Media', '#888888']
        ]
    );

    const all = buildLegendEntries(['Unknown', 'Mixed Media', 'On Soil', 'In Soil/Sediment', 'In Water', 'IN WATER']);
    assert.deepEqual(
        all.map(entry => entry.label),
        ['In Water', 'In Soil/Sediment', 'On Soil', 'Mixed Media', 'Other / Unspecified']
    );
    all.forEach(entry => assert.equal(entry.color, getColorForType(entry.label)));

    assert.deepEqual(buildLegendEntries([]), []);
});

test('home page no longer ships the placeholder "sample type N" legend', () => {
    const home = fs.readFileSync(path.join(projectRoot, 'views/home.ejs'), 'utf8');
    assert.doesNotMatch(home, /sample type \d+/i);
    assert.match(home, /class="map-legend"/);
});
