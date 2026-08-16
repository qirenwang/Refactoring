'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const {
    getOtherPolymerDescription,
    validateOtherPolymerDescription,
    validateNewSaveRules,
    assertPolymerOtherDescColumn,
    insertPolymerDetails,
    replacePolymerDetails,
    loadPolymerFieldsForForm,
    POLYMER_OTHER_DESC_COLUMN
} = require('../routes/api')._internals;

const POLYMER_REFS = [
    { PolymerUniqueID: 1, Polymer_Code: 'PETE', Polymer_FullName: 'Polyethylene Terephthalate', RecycleCode: 1 },
    { PolymerUniqueID: 5, Polymer_Code: 'PP', Polymer_FullName: 'Polypropylene', RecycleCode: 5 },
    { PolymerUniqueID: 20, Polymer_Code: 'Other', Polymer_FullName: 'Other polymer type', RecycleCode: 7 }
];

// Minimal in-memory stand-in for the mysql2 connection, covering the queries
// the polymer persistence helpers issue.
function fakeConnection({ withDescColumn = true, seedRows = [] } = {}) {
    const baseColumns = [
        'MicroPolymerUniqueID', 'MicroInSample_Num', 'PolymerID_Num', 'PolymerType_Legacy',
        'Percentage', 'Method_PercentEstimate', 'DateEntered'
    ];
    const columns = withDescColumn ? [...baseColumns, POLYMER_OTHER_DESC_COLUMN] : baseColumns;
    const table = [...seedRows];
    let nextId = 100;
    const log = [];

    const normalize = sql => sql.replace(/\s+/g, ' ').trim();

    async function run(sql, params = []) {
        const q = normalize(sql);
        log.push({ q, params });

        if (q.startsWith('SELECT * FROM PolymerType_Ref')) return [POLYMER_REFS];
        if (q.startsWith('SELECT MethodsUniqueID FROM Methods_Ref')) {
            return [params[0] === 13 || params[0] === 4 ? [{ MethodsUniqueID: params[0] }] : []];
        }
        if (q.startsWith('SELECT COLUMN_NAME FROM information_schema.COLUMNS')) {
            return [columns.map(name => ({ COLUMN_NAME: name }))];
        }
        if (q.startsWith('SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE')) {
            return [[{ DATA_TYPE: 'decimal', NUMERIC_PRECISION: 7, NUMERIC_SCALE: 4 }]];
        }
        if (q.startsWith('SELECT EXTRA FROM INFORMATION_SCHEMA.COLUMNS')) {
            return [[{ EXTRA: 'auto_increment' }]];
        }
        if (q.startsWith('INSERT INTO MicroplasticsPolymerDetails')) {
            const colList = q.slice(q.indexOf('(') + 1, q.indexOf(')')).split(',').map(c => c.trim().replace(/`/g, ''));
            const row = { MicroPolymerUniqueID: nextId++ };
            colList.forEach((column, index) => {
                if (column === 'DateEntered') return;
                if (!columns.includes(column)) throw new Error(`Unknown column ${column}`);
                row[column] = params[index];
            });
            columns.forEach(column => { if (!(column in row)) row[column] = null; });
            table.push(row);
            return [{ affectedRows: 1 }];
        }
        if (q.startsWith('DELETE FROM MicroplasticsPolymerDetails')) {
            for (let i = table.length - 1; i >= 0; i -= 1) {
                if (table[i].MicroInSample_Num === params[0]) table.splice(i, 1);
            }
            return [{ affectedRows: 1 }];
        }
        if (q.startsWith('SELECT pd.*, pr.Polymer_Code FROM MicroplasticsPolymerDetails')) {
            return [table
                .filter(row => row.MicroInSample_Num === params[0])
                .map(row => ({ ...row, Polymer_Code: POLYMER_REFS.find(p => p.PolymerUniqueID === row.PolymerID_Num)?.Polymer_Code || null }))];
        }
        if (q.startsWith('SELECT PolymerID_Num, PolymerType_Legacy, Percentage, Method_PercentEstimate')) {
            const wantsDesc = q.includes(POLYMER_OTHER_DESC_COLUMN);
            if (wantsDesc && !withDescColumn) throw new Error(`Unknown column ${POLYMER_OTHER_DESC_COLUMN}`);
            return [table
                .filter(row => row.MicroInSample_Num === params[0])
                .map(row => {
                    const out = {
                        PolymerID_Num: row.PolymerID_Num,
                        PolymerType_Legacy: row.PolymerType_Legacy,
                        Percentage: row.Percentage,
                        Method_PercentEstimate: row.Method_PercentEstimate
                    };
                    if (wantsDesc) out[POLYMER_OTHER_DESC_COLUMN] = row[POLYMER_OTHER_DESC_COLUMN];
                    return out;
                })];
        }
        throw new Error(`Unexpected query: ${q}`);
    }

    return { execute: run, query: run, table, log };
}

const baseForm = {
    micro_method_polymer_num: '4',
    micro_method_percent_estimate: '13',
    mp_polymer_pete: '60',
    mp_polymer_other: '40',
    mp_polymer_other_specify: '  PTFE and polyurethane foam  '
};

test('the description is trimmed and blank text counts as absent', () => {
    assert.equal(getOtherPolymerDescription({ mp_polymer_other_specify: '  PTFE ' }, 'mp_polymer_'), 'PTFE');
    assert.equal(getOtherPolymerDescription({ mp_polymer_other_specify: '   ' }, 'mp_polymer_'), null);
    assert.equal(getOtherPolymerDescription({}, 'mp_polymer_'), null);
});

test('Other percentage and its description must be entered together', () => {
    assert.deepEqual(validateOtherPolymerDescription({}, 'mp_polymer_', 'Microplastics'), []);
    assert.deepEqual(validateOtherPolymerDescription({ mp_polymer_other: '', mp_polymer_other_specify: '' }, 'mp_polymer_', 'Microplastics'), []);
    assert.deepEqual(validateOtherPolymerDescription({ mp_polymer_other: '5', mp_polymer_other_specify: 'PTFE' }, 'mp_polymer_', 'Microplastics'), []);

    const missingText = validateOtherPolymerDescription({ mp_polymer_other: '5' }, 'mp_polymer_', 'Microplastics');
    assert.equal(missingText.length, 1);
    assert.match(missingText[0], /describe the "Other" polymer/);

    const orphanText = validateOtherPolymerDescription({ fragment_polymer_other: '0', fragment_polymer_other_specify: 'PTFE' }, 'fragment_polymer_', 'Fragments');
    assert.equal(orphanText.length, 1);
    assert.match(orphanText[0], /Other percentage is blank or 0/);

    const tooLong = validateOtherPolymerDescription({ mp_polymer_other: '5', mp_polymer_other_specify: 'x'.repeat(256) }, 'mp_polymer_', 'Microplastics');
    assert.ok(tooLong.some(message => /255 characters/.test(message)));

    // Both groups are wired into the save-time rules.
    const result = validateNewSaveRules({ has_quantitative_data: 'yes', fragment_polymer_other: '10', fragments_method_polymer_num: '4', fragments_method_percent_estimate: '13' });
    assert.equal(result.isValid, false);
    assert.match(result.message, /Fragments polymer types: describe the "Other" polymer/);
});

test('saving a description before the migration fails loudly instead of dropping it', () => {
    assert.throws(
        () => assertPolymerOtherDescColumn('MicroplasticsPolymerDetails', new Set(['Percentage']), 'PTFE'),
        error => error.statusCode === 500 && /20260815_add_polymer_other_description/.test(error.message)
    );
    assert.doesNotThrow(() => assertPolymerOtherDescColumn('MicroplasticsPolymerDetails', new Set(['Percentage']), null));
    assert.doesNotThrow(() => assertPolymerOtherDescColumn('MicroplasticsPolymerDetails', new Set([POLYMER_OTHER_DESC_COLUMN]), 'PTFE'));
});

test('insertPolymerDetails stores the description on the Other row only and reads it back', async () => {
    const connection = fakeConnection();
    await insertPolymerDetails(connection, 7, baseForm, 'microplastics');

    const other = connection.table.find(row => row.PolymerID_Num === 20);
    const pete = connection.table.find(row => row.PolymerID_Num === 1);
    assert.equal(other[POLYMER_OTHER_DESC_COLUMN], 'PTFE and polyurethane foam');
    assert.equal(pete[POLYMER_OTHER_DESC_COLUMN], null);
    assert.equal(Number(other.Percentage), 40);
    assert.equal(other.Method_PercentEstimate, '13');

    const fields = await loadPolymerFieldsForForm(
        connection, 'MicroplasticsPolymerDetails', 7, 'mp_polymer_', ['MicroInSample_Num'], 'micro_method_percent_estimate'
    );
    assert.equal(fields.mp_polymer_other_specify, 'PTFE and polyurethane foam');
    assert.equal(Number(fields.mp_polymer_other), 40);
    assert.equal(Number(fields.mp_polymer_pete), 60);
    assert.equal(fields.micro_method_percent_estimate, '13');
});

test('insertPolymerDetails refuses to silently drop a description when the column is missing', async () => {
    const connection = fakeConnection({ withDescColumn: false });
    await assert.rejects(
        () => insertPolymerDetails(connection, 7, baseForm, 'microplastics'),
        error => error.statusCode === 500 && /PolymerOther_Desc is missing/.test(error.message)
    );
    assert.equal(connection.table.length, 0);

    // Without an Other description the pre-migration schema still works.
    const legacy = fakeConnection({ withDescColumn: false });
    await insertPolymerDetails(legacy, 7, {
        micro_method_polymer_num: '4', micro_method_percent_estimate: '13',
        mp_polymer_pete: '100'
    }, 'microplastics');
    assert.equal(legacy.table.length, 1);
    assert.equal(POLYMER_OTHER_DESC_COLUMN in legacy.table[0], false);
});

test('replacePolymerDetails rewrites the description with the group and clears it when Other is removed', async () => {
    const connection = fakeConnection();
    await insertPolymerDetails(connection, 7, baseForm, 'microplastics');

    await replacePolymerDetails(connection, {
        tableName: 'MicroplasticsPolymerDetails',
        idColumnCandidates: ['MicroPolymerUniqueID'],
        parentColumnCandidates: ['MicroInSample_Num'],
        parentId: 7,
        fieldPrefix: 'mp_polymer_',
        methodPercentEstimate: '13',
        formData: { ...baseForm, mp_polymer_other_specify: 'Nylon 6' }
    });
    assert.equal(connection.table.find(row => row.PolymerID_Num === 20)[POLYMER_OTHER_DESC_COLUMN], 'Nylon 6');

    await replacePolymerDetails(connection, {
        tableName: 'MicroplasticsPolymerDetails',
        idColumnCandidates: ['MicroPolymerUniqueID'],
        parentColumnCandidates: ['MicroInSample_Num'],
        parentId: 7,
        fieldPrefix: 'mp_polymer_',
        methodPercentEstimate: '13',
        formData: {
            micro_method_polymer_num: '4', micro_method_percent_estimate: '13',
            mp_polymer_pete: '50', mp_polymer_pp: '50', mp_polymer_other: '', mp_polymer_other_specify: ''
        }
    });
    assert.deepEqual(connection.table.map(row => row.PolymerID_Num).sort(), [1, 5]);
    assert.ok(connection.table.every(row => row[POLYMER_OTHER_DESC_COLUMN] === null));
});

test('form and client keep the description next to the Other percentage', () => {
    const handler = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'form-handler.js'), 'utf8');
    assert.match(handler, /Describe the other polymer\(s\):/);
    assert.match(handler, /polymer-other-specify-row/);
    assert.match(handler, /otherDescription: String\(state\[`\$\{config\.prefix\}other_specify`\]/);
    assert.match(handler, /function getOtherPolymerDescriptionIssues/);

    const page5 = fs.readFileSync(path.join(projectRoot, 'views', 'data_forms', 'formpage5.ejs'), 'utf8');
    assert.match(page5, /other_specify/);
    assert.match(page5, /i\.type === 'number'/);

    const migration = fs.readFileSync(path.join(projectRoot, 'db', '20260815_add_polymer_other_description.sql'), 'utf8');
    assert.match(migration, /ADD COLUMN `PolymerOther_Desc` VARCHAR\(255\) NULL/);
    assert.match(migration, /SET `Polymer_FullName` = 'Other polymer type'/);
    assert.equal((migration.match(/PREPARE add_\w+_stmt FROM/g) || []).length, 2);
});
