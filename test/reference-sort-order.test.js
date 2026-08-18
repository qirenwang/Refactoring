'use strict';

// Reference lists (Purposes, polymers, colours, ...) are rendered in the order
// /api/references returns them, and that order comes from the SortOrder column
// added by db/20260817_add_reference_sort_order.sql — never from the name or
// the auto-increment ID (alphabetical ordering is what put "Other" in the
// middle of the Purposes drop-down). These tests pin both halves of that
// contract: the API orders every reference table by SortOrder, and the
// migration gives every one of those tables the column with the intended
// values.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const projectRoot = path.join(__dirname, '..');
const migrationPath = path.join(projectRoot, 'db', '20260817_add_reference_sort_order.sql');

// Every reference table served by /api/references (and the /api/ref/* endpoints)
// with its ID column, which is the tie-breaker after SortOrder.
const REFERENCE_TABLES = {
    PolymerType_Ref: 'PolymerUniqueID',
    Purpose_Ref: 'PurposeUniqueID',
    ColorType_Ref: 'ColorUniqueID',
    Form_Ref: 'FormUniqueID',
    Methods_Ref: 'MethodsUniqueID',
    Opacity_Ref: 'OpacityUniqueID',
    SoilTexture_Ref: 'SoilTextureUniqueID',
    Units_Ref: 'UnitsUniqueID',
    SizeClass_Ref: 'SizeUniqueID',
    PubSource_Ref: 'PubSourceUniqueID'
};

function loadApiRouterWithRecordingPool(recordedSql) {
    const databaseModulePath = require.resolve('../config/database');
    const apiModulePath = require.resolve('../routes/api');
    const originalDatabaseModule = require.cache[databaseModulePath];
    const originalApiModule = require.cache[apiModulePath];

    const record = async sql => {
        recordedSql.push(String(sql));
        return [[]];
    };
    require.cache[databaseModulePath] = {
        id: databaseModulePath,
        filename: databaseModulePath,
        loaded: true,
        exports: {
            pool: { query: record, execute: record },
            testConnection: async () => true
        }
    };
    delete require.cache[apiModulePath];

    try {
        return require('../routes/api');
    } finally {
        delete require.cache[apiModulePath];
        if (originalApiModule) require.cache[apiModulePath] = originalApiModule;
        if (originalDatabaseModule) {
            require.cache[databaseModulePath] = originalDatabaseModule;
        } else {
            delete require.cache[databaseModulePath];
        }
    }
}

async function withServer(router, run) {
    const app = express();
    app.use((req, res, next) => { req.session = {}; next(); });
    app.use('/api', router);
    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function referenceTableOf(sql) {
    const match = sql.match(/FROM\s+`?(\w+_Ref)`?/i);
    return match ? match[1] : null;
}

test('/api/references and /api/ref/* order every reference table by SortOrder, ID as tie-breaker', async () => {
    const recordedSql = [];
    const router = loadApiRouterWithRecordingPool(recordedSql);

    await withServer(router, async baseUrl => {
        const referencesResponse = await fetch(`${baseUrl}/api/references`);
        assert.equal(referencesResponse.status, 200);
        const payload = await referencesResponse.json();
        assert.equal(payload.success, true);
        assert.deepEqual(
            Object.keys(payload.data).sort(),
            ['colors', 'forms', 'methods', 'opacities', 'polymers', 'pubSources', 'purposes', 'sizes', 'soilTextures', 'units']
        );

        const referencesTables = recordedSql.map(referenceTableOf).filter(Boolean).sort();
        assert.deepEqual(referencesTables, Object.keys(REFERENCE_TABLES).sort(),
            'every reference table is read exactly once by /api/references');

        for (const endpoint of ['/api/ref/methods?type=Polymer&appliesTo=MP', '/api/ref/opacity', '/api/ref/soil-texture', '/api/ref/units']) {
            const response = await fetch(`${baseUrl}${endpoint}`);
            assert.equal(response.status, 200, endpoint);
        }
    });

    assert.ok(recordedSql.length >= Object.keys(REFERENCE_TABLES).length + 4);
    for (const sql of recordedSql) {
        const table = referenceTableOf(sql);
        assert.ok(table, `unexpected non-reference query: ${sql}`);
        const idColumn = REFERENCE_TABLES[table];
        assert.ok(idColumn, `unexpected reference table ${table}`);
        assert.match(sql, new RegExp(`ORDER BY\\s+SortOrder,\\s*${idColumn}\\s*$`),
            `${table} must be ordered by SortOrder then ${idColumn}: ${sql.trim()}`);
        assert.doesNotMatch(sql, /ORDER BY\s+\w+_(Name|Code)\b/, `${table} must not be ordered alphabetically`);
    }
});

test('the SortOrder migration covers every reference table the API orders by', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');

    for (const table of Object.keys(REFERENCE_TABLES)) {
        assert.match(
            migration,
            new RegExp(`ALTER TABLE \`${table}\` ADD COLUMN \`SortOrder\` INT NOT NULL DEFAULT 0`),
            `${table} gets a SortOrder column`
        );
        assert.match(
            migration,
            new RegExp(`UPDATE \`${table}\`[\\s\\S]*?WHERE \`SortOrder\` = 0;`),
            `${table} back-fill only touches rows still at 0 (idempotent, never clobbers manual edits)`
        );
    }
});

test('the migration encodes the PI datasheet order for Purposes and pins Other/Unknown last', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');

    const purposeBlock = migration.match(/UPDATE `Purpose_Ref`[\s\S]*?WHERE `SortOrder` = 0;/)[0];
    const purposeOrder = [...purposeBlock.matchAll(/WHEN '(\w+)'\s+THEN (\d+)/g)]
        .map(([, code, value]) => ({ code, value: Number(value) }))
        .sort((a, b) => a.value - b.value)
        .map(entry => entry.code);
    assert.deepEqual(purposeOrder, [
        'single_use',        // Products for consuming Food/Beverages one time
        'multi_use',         // Products for consuming or storing Food/Beverages multiple times
        'consumer_product',  // Other durable goods for longer term use
        'bag_container',     // Bag for carrying or containing items
        'packing',           // Packing or wrapping materials
        'other_purpose',     // Other
        'unknown_purpose'    // Unknown purpose
    ]);
    assert.match(purposeBlock, /WHEN 'other_purpose'\s+THEN 900/);
    assert.match(purposeBlock, /WHEN 'unknown_purpose'\s+THEN 990/);

    const polymerBlock = migration.match(/UPDATE `PolymerType_Ref`[\s\S]*?WHERE `SortOrder` = 0;/)[0];
    const polymerOrder = [...polymerBlock.matchAll(/WHEN '(\w+)'\s+THEN (\d+)/g)]
        .map(([, code, value]) => ({ code, value: Number(value) }))
        .sort((a, b) => a.value - b.value)
        .map(entry => entry.code);
    // Recycle codes 1-6 lead, "Other" closes the list.
    assert.deepEqual(polymerOrder.slice(0, 6), ['PETE', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS']);
    assert.equal(polymerOrder[polymerOrder.length - 1], 'Other');
    assert.match(polymerBlock, /WHEN 'Other'\s+THEN 900/);
});
