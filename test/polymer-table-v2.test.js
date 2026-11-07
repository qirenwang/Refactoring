'use strict';

// Polymer reference table v2 (db/20261105_polymer_table_v2.sql): the PI's
// 25-row list, in-place updates that keep PolymerUniqueID, guarded inserts and
// a retire step that never deletes a referenced row; plus the labels the form
// and the summary derive from the new rows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    formatPolymerLabel,
    formatPolymerName,
    getPolymerSummaryEntries,
    normalizeReferenceCode
} = require('../public/js/data-summary-utils');

const projectRoot = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(projectRoot, 'db', '20261105_polymer_table_v2.sql'),
    'utf8'
);

// PI order (No. 1..25) and the code each row must end up with.
const PI_CODES = [
    'PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'ABS', 'CA', 'EVA', 'PAN',
    'PA', 'PBT', 'PC', 'PE', 'PMMA', 'PTFE', 'PU', 'SAN', 'MIX', 'OTHER',
    'UNKNOWN', 'BITUMEN', 'RUBBER', 'RTB', 'OSM'
];
const IN_PLACE = ['PET', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'ABS', 'EVA', 'PAN', 'PA',
    'PC', 'PMMA', 'OTHER', 'BITUMEN', 'RUBBER'];
const INSERTED = ['CA', 'PBT', 'PE', 'PTFE', 'PU', 'SAN', 'MIX', 'UNKNOWN', 'RTB', 'OSM'];
const RETIRED = ['PLA', 'PB', 'PE_UHMW', 'HIPS', 'EPS'];

function sortOrderAssignedTo(code) {
    const update = migration.match(new RegExp(
        `UPDATE \`PolymerType_Ref\`\\s+SET \`Polymer_Code\` = '${code}'[^;]*?\`SortOrder\` = (\\d+)`
    ));
    if (update) return Number(update[1]);
    const insert = migration.match(new RegExp(`SELECT @next_id, (\\d+), '${code}',`));
    return insert ? Number(insert[1]) : null;
}

test('every PI row gets SortOrder = PI No. x 10', () => {
    PI_CODES.forEach((code, index) => {
        assert.equal(sortOrderAssignedTo(code), (index + 1) * 10, code);
    });
    assert.deepEqual([...IN_PLACE, ...INSERTED].sort(), [...PI_CODES].sort());
});

test('continuing rows are updated in place, guarded so a re-run is a no-op', () => {
    const updates = migration.match(/UPDATE `PolymerType_Ref`\s+SET `Polymer_Code` = [\s\S]*?;\n/g)
        .map(sql => sql.trim());
    assert.equal(updates.length, IN_PLACE.length);
    updates.forEach(sql => {
        assert.match(sql, /AND `CommonApplications` IS NULL;$/);
        assert.doesNotMatch(sql, /PolymerUniqueID/, 'in-place updates must never rewrite the ID');
    });
    // PETE is matched by its old code so ID 1 becomes PET.
    assert.match(migration, /WHERE `Polymer_Code` IN \('PETE', 'PET'\) AND `CommonApplications` IS NULL;/);
    assert.match(migration, /`Polymer_Code` = 'PET', `Polymer_AltCodes` = 'PETE'/);
});

test('PETE snapshots on saved polymer rows follow the rename to PET', () => {
    ['MicroplasticsPolymerDetails', 'FragmentsPolymerDetails'].forEach(table => {
        assert.match(migration, new RegExp(
            `UPDATE \`${table}\` d\\s+JOIN \`PolymerType_Ref\` p ON p.\`PolymerUniqueID\` = d.\`PolymerID_Num\`\\s+` +
            `SET d.\`PolymerType_Legacy\` = 'PET'\\s+` +
            `WHERE p.\`Polymer_Code\` = 'PET' AND d.\`PolymerType_Legacy\` = 'PETE';`
        ), table);
    });
});

test('new rows use MAX+1 IDs and are skipped when their code exists', () => {
    INSERTED.forEach(code => {
        assert.match(
            migration,
            new RegExp(`WHERE NOT EXISTS \\(SELECT 1 FROM \`PolymerType_Ref\` WHERE \`Polymer_Code\` = '${code}'\\);`),
            code
        );
    });
    const nextIds = migration.match(/SET @next_id = \(SELECT COALESCE\(MAX\(`PolymerUniqueID`\), 0\) \+ 1 FROM `PolymerType_Ref`\);/g);
    assert.equal(nextIds.length, INSERTED.length);
});

test('dropped options are deleted only when no polymer-details row references them', () => {
    const del = migration.match(/DELETE FROM `PolymerType_Ref`[\s\S]*?;/)[0];
    RETIRED.forEach(code => assert.ok(del.includes(`'${code}'`), code));
    assert.match(del, /NOT EXISTS \(SELECT 1 FROM `FragmentsPolymerDetails`/);
    assert.match(del, /NOT EXISTS \(SELECT 1 FROM `MicroplasticsPolymerDetails`/);
});

test('new columns are added behind INFORMATION_SCHEMA guards', () => {
    ['Polymer_AltCodes', 'CommonApplications', 'ClassificationNotes'].forEach(column => {
        assert.match(migration, new RegExp(`COLUMN_NAME = '${column}'\\);`), column);
        assert.match(migration, new RegExp(`ADD COLUMN \`${column}\``), column);
    });
});

test('the 25 codes map to 25 distinct form field names; Other keeps mp_polymer_other', () => {
    const fields = PI_CODES.map(code => `mp_polymer_${normalizeReferenceCode(code)}`);
    assert.equal(new Set(fields).size, PI_CODES.length);
    assert.ok(fields.includes('mp_polymer_other'));
    assert.ok(fields.includes('mp_polymer_pet'));
    // Kept legacy rows must not collide with a PI code either.
    const legacy = RETIRED.map(code => `mp_polymer_${normalizeReferenceCode(code)}`);
    legacy.forEach(field => assert.ok(!fields.includes(field), field));
});

test('labels read naturally for the new word codes and keep abbreviations', () => {
    const row = (Polymer_Code, Polymer_FullName, RecycleCode = null) =>
        ({ Polymer_Code, Polymer_FullName, RecycleCode });

    assert.equal(formatPolymerName(row('PET', 'Polyethylene terephthalate', 1)), 'PET - Polyethylene terephthalate');
    assert.equal(formatPolymerLabel(row('PET', 'Polyethylene terephthalate', 1)), 'PET - Polyethylene terephthalate #1 (%)');
    assert.equal(formatPolymerName(row('OTHER', 'Other Polymer')), 'Other Polymer');
    assert.equal(formatPolymerName(row('UNKNOWN', 'Unknown Polymer')), 'Unknown Polymer');
    assert.equal(formatPolymerName(row('RUBBER', 'Rubber')), 'Rubber');
    assert.equal(formatPolymerName(row('MIX', 'Mixed Polymer')), 'MIX - Mixed Polymer');
    assert.equal(formatPolymerName(row('RTB', 'Rubber/Tire/Bituminous (combined category)')),
        'RTB - Rubber/Tire/Bituminous (combined category)');
    assert.equal(formatPolymerName(row('OSM', 'Other Synthetic Materials')), 'OSM - Other Synthetic Materials');
    assert.equal(formatPolymerName(row('BITUMEN', 'Bituminous Material / Bitumen')),
        'BITUMEN - Bituminous Material / Bitumen');
    // A code that is only a prefix of the first word is not "repeated".
    assert.equal(formatPolymerName(row('PE', 'Pebble-like polymer')), 'PE - Pebble-like polymer');
    // Pre-migration rows still render as before.
    assert.equal(formatPolymerName(row('Other', 'Other polymer type')), 'Other polymer type');
    assert.equal(formatPolymerName(row('Other', 'Other (specify in method)')), 'Other (specify in method)');
    assert.equal(formatPolymerName(row('PVC', '')), 'PVC');
});

test('summary lists the new codes in reference order with the Other description', () => {
    const references = PI_CODES.map((code, index) => ({
        PolymerUniqueID: index + 1,
        Polymer_Code: code,
        Polymer_FullName: code === 'OTHER' ? 'Other Polymer' : `${code} name`,
        RecycleCode: null
    }));
    const entries = getPolymerSummaryEntries({
        mp_polymer_osm: '10',
        mp_polymer_mix: '20',
        mp_polymer_other: '30',
        mp_polymer_other_specify: 'POM',
        mp_polymer_pet: '40'
    }, 'mp_polymer_', references);

    assert.deepEqual(entries.map(entry => entry.field), [
        'mp_polymer_pet', 'mp_polymer_mix', 'mp_polymer_other', 'mp_polymer_osm', 'mp_polymer_other_specify'
    ]);
    assert.equal(entries[2].label, 'Other Polymer (%)');
    assert.equal(entries[4].label, 'Other Polymer Type (specified)');
});
