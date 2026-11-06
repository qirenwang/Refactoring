'use strict';

// A user may only reuse their own data sources: ones they entered, or ones
// their own sampling events already cite (legacy rows whose EnteredBy could
// not be back-filled). The "my data sources" list (GET /api/data-sources) and
// the save-time check (resolvePublicationId, used by both the new-sample and
// the edit save paths) apply that same rule, and the list is never served for
// all users.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
    listDataSources,
    resolvePublicationId
} = require('../routes/api')._internals;

const NOT_YOURS_MESSAGE = 'This data source is not one of yours. Choose one of your data sources or enter a new data source.';
const MISSING_MESSAGE = 'The selected data source no longer exists. Choose another one or enter a new data source.';

// Users 6 (current) and 9 (someone else).
const DATA_SOURCES = [
    { data_source_id: 10, EnteredBy: 6 },    // entered by user 6
    { data_source_id: 11, EnteredBy: null }, // legacy, cited by user 6's event
    { data_source_id: 12, EnteredBy: 9 },    // another user's
    { data_source_id: 13, EnteredBy: 9 }     // another user's, cited by user 6's event
];
const SAMPLING_EVENTS = [
    { UserSamplingID: 6, PublicationID_Num: 11 },
    { UserSamplingID: 6, PublicationID_Num: 13 },
    { UserSamplingID: 9, PublicationID_Num: 12 },
    { UserSamplingID: 9, PublicationID_Num: 10 }
];

// Answers resolvePublicationId's lookup from the rows above, evaluating the
// ownership rule the SQL expresses; records every statement it receives.
function fakeConnection() {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            const [userIdForEnteredBy, userIdForEvents, dataSourceId] = params;
            const row = DATA_SOURCES.find(ds => ds.data_source_id === dataSourceId);
            if (!row) return [[]];
            const isMine = (row.EnteredBy !== null && row.EnteredBy === userIdForEnteredBy) ||
                SAMPLING_EVENTS.some(se => se.PublicationID_Num === row.data_source_id &&
                    se.UserSamplingID === userIdForEvents);
            return [[{ data_source_id: row.data_source_id, is_mine: isMine ? 1 : 0 }]];
        }
    };
}

function selecting(dataSourceId) {
    return { data_source_present: 'yes', data_source_id: String(dataSourceId) };
}

test('a data source the user entered is accepted', async () => {
    const connection = fakeConnection();
    assert.equal(await resolvePublicationId(connection, selecting(10), { userId: '6' }), 10);
    assert.deepEqual(connection.calls[0].params, [6, 6, 10]);
});

test('a data source cited by one of the user\'s own sampling events is accepted', async () => {
    // Covers editing one's own sample that already cites a legacy source.
    const connection = fakeConnection();
    assert.equal(await resolvePublicationId(connection, selecting(11), { userId: 6 }), 11);
    assert.equal(await resolvePublicationId(connection, selecting(13), { userId: 6 }), 13);
});

test('another user\'s data source is rejected', async () => {
    const connection = fakeConnection();
    await assert.rejects(
        resolvePublicationId(connection, selecting(12), { userId: 6 }),
        error => error.statusCode === 400 && error.message === NOT_YOURS_MESSAGE
    );
    // The owner can still use it.
    assert.equal(await resolvePublicationId(connection, selecting(12), { userId: 9 }), 12);
    // Without a signed-in user nothing is "mine".
    await assert.rejects(
        resolvePublicationId(connection, selecting(10), {}),
        error => error.statusCode === 400 && error.message === NOT_YOURS_MESSAGE
    );
});

test('a data source that does not exist is rejected with the "no longer exists" message', async () => {
    const connection = fakeConnection();
    await assert.rejects(
        resolvePublicationId(connection, selecting(999), { userId: 6 }),
        error => error.statusCode === 400 && error.message === MISSING_MESSAGE
    );
});

test('the save-time check and the "my data sources" list use the same ownership condition', async () => {
    const connection = fakeConnection();
    await resolvePublicationId(connection, selecting(10), { userId: 6 });
    const saveSql = connection.calls[0].sql;

    const listCalls = [];
    await listDataSources({
        query: async (sql, params) => { listCalls.push({ sql, params }); return [[]]; }
    }, 6);
    const listCondition = listCalls[0].sql.match(/WHERE\s+([\s\S]*?)\s+ORDER BY/)[1];

    const normalize = sql => sql.replace(/\s+/g, ' ').trim();
    assert.match(listCondition, /ds\.EnteredBy = \?/);
    assert.match(listCondition, /mine_se\.UserSamplingID = \?/);
    assert.ok(normalize(saveSql).includes(normalize(listCondition)),
        `save-time check must use the list's condition:\n${listCondition}\n---\n${saveSql}`);
});

function loadApiRouterWithPool(pool) {
    const databaseModulePath = require.resolve('../config/database');
    const apiModulePath = require.resolve('../routes/api');
    const originalDatabaseModule = require.cache[databaseModulePath];
    const originalApiModule = require.cache[apiModulePath];

    require.cache[databaseModulePath] = {
        id: databaseModulePath,
        filename: databaseModulePath,
        loaded: true,
        exports: { pool, testConnection: async () => true }
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

async function withServer(router, session, run) {
    const app = express();
    app.use((req, res, next) => { req.session = { ...session }; next(); });
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

test('GET /api/data-sources lists only the signed-in user\'s sources, whatever ?scope says', async () => {
    const calls = [];
    const record = async (sql, params) => {
        calls.push({ sql: String(sql), params });
        return [[{ data_source_id: 10 }]];
    };
    const router = loadApiRouterWithPool({ query: record, execute: record });

    await withServer(router, { user_id: 6 }, async baseUrl => {
        for (const path of ['/api/data-sources', '/api/data-sources?scope=all',
            '/api/data-sources?scope=mine', '/api/publications']) {
            const response = await fetch(`${baseUrl}${path}`);
            assert.equal(response.status, 200, path);
            assert.deepEqual(await response.json(), { success: true, data: [{ data_source_id: 10 }] }, path);
        }
    });

    assert.equal(calls.length, 4);
    for (const { sql, params } of calls) {
        assert.match(sql, /WHERE ds\.EnteredBy = \?\s+OR EXISTS \(SELECT 1 FROM SamplingEvent mine_se/);
        assert.match(sql, /ORDER BY\s+is_mine DESC,\s*ds\.DateEntered DESC,\s*ds\.data_source_id DESC\s*$/);
        assert.deepEqual(params, [6, 6, 6]);
    }
});

test('GET /api/data-sources returns an empty list to a signed-out caller without querying', async () => {
    const calls = [];
    const record = async sql => { calls.push(String(sql)); return [[{ data_source_id: 10 }]]; };
    const router = loadApiRouterWithPool({ query: record, execute: record });

    await withServer(router, {}, async baseUrl => {
        for (const path of ['/api/data-sources', '/api/data-sources?scope=all', '/api/publications']) {
            const response = await fetch(`${baseUrl}${path}`);
            assert.equal(response.status, 200, path);
            assert.deepEqual(await response.json(), { success: true, data: [] }, path);
        }
    });
    assert.deepEqual(calls, []);
});

test('the test-data endpoint is gone', async () => {
    const record = async () => [[]];
    const router = loadApiRouterWithPool({ query: record, execute: record });
    await withServer(router, { user_id: 6 }, async baseUrl => {
        const response = await fetch(`${baseUrl}/api/add-test-location-data`, { method: 'POST' });
        assert.equal(response.status, 404);
    });
});

test('the unauthenticated session-echo endpoint /test-save is gone', async () => {
    const record = async () => [[]];
    const router = loadApiRouterWithPool({ query: record, execute: record });
    await withServer(router, { user_id: 6, captcha_code: 'SECRET' }, async baseUrl => {
        const response = await fetch(`${baseUrl}/api/test-save`, { method: 'POST' });
        assert.equal(response.status, 404);
        assert.ok(!(await response.text()).includes('SECRET'));
    });
});
