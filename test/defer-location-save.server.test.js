'use strict';

// A new page-1 location is no longer written when page 1 is confirmed. POST
// /api/locations/check validates it read-only, and POST /api/save-form-data
// inserts it on the save transaction's connection, before the SamplingEvent
// row, so a failed save leaves no orphan location. POST /api/locations (My
// Locations) keeps its behaviour. Every route here runs against a fake pool.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const DUPLICATE_MESSAGE = 'A location with this name already exists';
const GROUP_MESSAGE = 'Please provide either coordinates, complete address, or zip code';
const NEW_LOCATION_ID = 321;
const USER_ID = 6;
const OWNED_SAMPLE_ID = 9;
const OWNED_EVENT_ID = 42;
const SAMPLING_EVENT_COLUMNS = ['LocationID_Num', 'PublicationID_Num', 'StartYear', 'StartMonth', 'StartDay'];
const LOCATION_REQUIRED_MESSAGE = 'Please select a location on Page 1.';

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
    app.use(express.json());
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

async function postJson(baseUrl, path, payload) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() };
}

function duplicateEntryError() {
    return Object.assign(new Error("Duplicate entry 'Creek A' for key 'LocationName'"), {
        code: 'ER_DUP_ENTRY',
        sqlMessage: "Duplicate entry 'Creek A' for key 'LocationName'"
    });
}

// Page-1 body, exactly what the client sends to /locations and /locations/check.
function newLocationBody(overrides = {}) {
    return {
        locationName: 'Creek A',
        locationShortCode: 'CA1',
        locationDescription: 'Creek behind the school',
        latitude: '42.5',
        longitude: '-83.1',
        streetAddress: null,
        city: null,
        state: null,
        country: null,
        zipCode: '04812',
        acres: '2.5',
        ...overrides
    };
}

function baseFormData(overrides = {}) {
    return {
        media_type: 'water',
        device_installation_period: 'no',
        start_year: '2025',
        start_month: '',
        start_day: '',
        data_source_present: 'yes',
        data_source_id: '5',
        ...overrides
    };
}

// Fake transactional pool. `calls` records every statement in order, tagged
// with where it ran ('pool' or 'connection').
// `ownedSample` makes the Edit My Data ownership lookup find sample
// OWNED_SAMPLE_ID (event OWNED_EVENT_ID, current location CURRENT_LOCATION_ID)
// and reports SamplingEvent columns so the PUT writes a real UPDATE.
function createFakeDb({
    existingNameCount = 0,
    locationInsertError = null,
    failSamplingEvent = false,
    ownedSample = false,
    failSamplingEventUpdate = false
} = {}) {
    const calls = [];
    const state = { began: false, committed: false, rolledBack: false, released: false };

    const respond = async (where, sql, params = []) => {
        const text = String(sql);
        calls.push({ where, sql: text, params });

        if (/SELECT COUNT\(\*\) as count FROM Location WHERE LocationName = \?/i.test(text)) {
            return [[{ count: existingNameCount }]];
        }
        if (/INSERT INTO Location\b/.test(text)) {
            if (locationInsertError) throw locationInsertError;
            return [{ insertId: NEW_LOCATION_ID, affectedRows: 1 }];
        }
        if (/FROM SampleDetails sd\s+INNER JOIN SamplingEvent se/.test(text)) {
            return [ownedSample
                ? [{ SampleUniqueID: OWNED_SAMPLE_ID, SamplingEvent_Num: OWNED_EVENT_ID, PublicationID_Num: 5 }]
                : []];
        }
        if (/information_schema\.COLUMNS/.test(text) && params[0] === 'SamplingEvent') {
            return [SAMPLING_EVENT_COLUMNS.map(COLUMN_NAME => ({ COLUMN_NAME }))];
        }
        if (/^\s*UPDATE SamplingEvent\b/.test(text)) {
            if (failSamplingEventUpdate) throw new Error('SamplingEvent update failed');
            return [{ affectedRows: 1 }];
        }
        if (/FROM DataSourceReference/.test(text)) {
            return [[{ data_source_id: 5, is_mine: 1 }]];
        }
        if (/MAX\(/.test(text)) {
            return [[{ maxId: 41 }]];
        }
        if (/INSERT INTO SamplingEvent\b/.test(text)) {
            if (failSamplingEvent) throw new Error('SamplingEvent insert failed');
            return [{ insertId: 0, affectedRows: 1 }];
        }
        if (/^\s*INSERT/i.test(text)) {
            return [{ insertId: 1, affectedRows: 1 }];
        }
        return [[]];
    };

    const connection = {
        execute: (sql, params) => respond('connection', sql, params),
        query: (sql, params) => respond('connection', sql, params),
        async beginTransaction() { state.began = true; calls.push({ where: 'connection', sql: 'BEGIN' }); },
        async commit() { state.committed = true; calls.push({ where: 'connection', sql: 'COMMIT' }); },
        async rollback() { state.rolledBack = true; calls.push({ where: 'connection', sql: 'ROLLBACK' }); },
        release() { state.released = true; }
    };

    const pool = {
        execute: (sql, params) => respond('pool', sql, params),
        query: (sql, params) => respond('pool', sql, params),
        async getConnection() { return connection; }
    };

    return { pool, calls, state };
}

const indexOfSql = (calls, pattern) => calls.findIndex(call => pattern.test(call.sql));
const locationInserts = calls => calls.filter(call => /INSERT INTO Location\b/.test(call.sql));
const eventInserts = calls => calls.filter(call => /INSERT INTO SamplingEvent\b/.test(call.sql));

// ---------- POST /api/locations/check ----------

test('POST /api/locations/check accepts a valid new location and never inserts', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/locations/check', newLocationBody());
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { success: true });
    });

    assert.equal(locationInserts(db.calls).length, 0);
    assert.ok(db.calls.every(call => !/^\s*(INSERT|UPDATE|DELETE)/i.test(call.sql)));
    const lookup = db.calls.find(call => /FROM Location WHERE LocationName = \?/.test(call.sql));
    assert.deepEqual(lookup.params, ['Creek A']);
});

test('POST /api/locations/check rejects missing required fields with the POST /locations messages', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ locationName: '' }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Location name is required' });

        result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ locationShortCode: '' }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Location short code is required');

        result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ locationDescription: '' }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Location description is required');

        result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ latitude: '95' }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Invalid latitude');
    });

    assert.equal(db.calls.length, 0, 'invalid input must not reach the database');
});

test('POST /api/locations/check requires coordinates, a full address or a zip code', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/locations/check',
            newLocationBody({ latitude: null, longitude: null, zipCode: null }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: GROUP_MESSAGE });

        // Absent keys count as missing too.
        const body = newLocationBody({ zipCode: null });
        delete body.latitude;
        delete body.longitude;
        result = await postJson(baseUrl, '/api/locations/check', body);
        assert.equal(result.status, 400);
        assert.equal(result.body.message, GROUP_MESSAGE);

        // A partial address is not enough; a complete one is.
        result = await postJson(baseUrl, '/api/locations/check', newLocationBody({
            latitude: null, longitude: null, zipCode: null, streetAddress: '1 Main St', city: 'Ann Arbor', state: 'MI'
        }));
        assert.equal(result.status, 400);
        result = await postJson(baseUrl, '/api/locations/check', newLocationBody({
            latitude: null, longitude: null, zipCode: null,
            streetAddress: '1 Main St', city: 'Ann Arbor', state: 'MI', country: 'USA'
        }));
        assert.equal(result.status, 200);
    });

    assert.equal(locationInserts(db.calls).length, 0);
});

test('POST /api/locations/check reports a taken name with 400 and does not insert', async () => {
    const db = createFakeDb({ existingNameCount: 1 });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/locations/check', newLocationBody());
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: DUPLICATE_MESSAGE });
    });

    assert.equal(locationInserts(db.calls).length, 0);
});

test('POST /api/locations/check requires a signed-in user', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, {}, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/locations/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(newLocationBody())
        });
        assert.equal(response.status, 401);
    });
    assert.equal(db.calls.length, 0);
});

// ---------- POST /api/save-form-data with a new location ----------

test('save-form-data inserts the new location on the transaction connection before the SamplingEvent', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            location_name: 'Creek A',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.success, true);
        assert.equal(result.body.message, 'Data saved successfully');
        assert.equal(result.body.locationId, NEW_LOCATION_ID);
        assert.equal(result.body.locationName, 'Creek A');
        assert.equal(result.body.locationCreated, true);
        // Existing response fields are kept.
        assert.equal(result.body.samplingEventId, 42);
        assert.equal(result.body.sampleDetailsId, 42);
        assert.equal(result.body.publicationId, 5);
        assert.equal(result.body.dataSourceId, 5);
    });

    const inserts = locationInserts(db.calls);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].where, 'connection', 'the location must be inserted inside the save transaction');
    // Same column mapping as POST /api/locations.
    assert.deepEqual(inserts[0].params, [
        'CA1', 'Creek A', 'Creek behind the school', '42.5', '-83.1',
        null, null, null, null, 4812, 2.5, 1, USER_ID
    ]);

    const begin = indexOfSql(db.calls, /^BEGIN$/);
    const locationInsert = indexOfSql(db.calls, /INSERT INTO Location\b/);
    const eventInsert = indexOfSql(db.calls, /INSERT INTO SamplingEvent\b/);
    const commit = indexOfSql(db.calls, /^COMMIT$/);
    assert.ok(begin >= 0 && begin < locationInsert, 'location insert happens after BEGIN');
    assert.ok(locationInsert < eventInsert, 'location insert happens before the SamplingEvent insert');
    assert.ok(eventInsert < commit);

    // insertId is the SamplingEvent's LocationID_Num.
    assert.equal(eventInserts(db.calls)[0].params[1], NEW_LOCATION_ID);
    assert.equal(db.state.committed, true);
    assert.equal(db.state.rolledBack, false);
    assert.equal(db.state.released, true);
});

test('save-form-data rolls back with 400 when the new location name is already taken (UNIQUE key)', async () => {
    const db = createFakeDb({ locationInsertError: duplicateEntryError() });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.success, false);
        assert.equal(result.body.message, DUPLICATE_MESSAGE);
    });

    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
    assert.equal(eventInserts(db.calls).length, 0, 'no sampling event after a duplicate location');
    assert.equal(db.state.released, true);
});

test('save-form-data rolls back with 400 when the name check finds an existing location', async () => {
    const db = createFakeDb({ existingNameCount: 1 });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, DUPLICATE_MESSAGE);
    });

    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(eventInserts(db.calls).length, 0);
    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
});

test('save-form-data rolls the new location back when a later insert fails', async () => {
    const db = createFakeDb({ failSamplingEvent: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 500);
        assert.equal(result.body.success, false);
        assert.match(result.body.message, /^Error saving data: /);
    });

    assert.equal(locationInserts(db.calls).length, 1);
    assert.equal(locationInserts(db.calls)[0].where, 'connection');
    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
});

test('save-form-data rejects an invalid new location before opening a transaction', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ locationShortCode: '' })
        }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Location short code is required' });

        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ latitude: null, longitude: null, zipCode: '' })
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, GROUP_MESSAGE);
    });

    assert.equal(db.state.began, false);
    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(eventInserts(db.calls).length, 0);
});

test('save-form-data still needs a location: no ID and no new_location object is 400', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/save-form-data', baseFormData());
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Location is required' });

        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new', location_name: 'Creek A'
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Location is required');

        // new_location without location_type 'new' is not a new location.
        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Location is required');
    });

    assert.equal(locationInserts(db.calls).length, 0);
});

// ---------- existing location paths ----------

test('save-form-data with an existing location_id does not touch the Location table', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'existing',
            location_id: '77',
            location_name: 'Old Pond'
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, 77);
        assert.equal(result.body.locationName, 'Old Pond');
        assert.equal(result.body.locationCreated, false);
    });

    assert.equal(db.calls.filter(call => /\bLocation\b/.test(call.sql) && !/SamplingEvent/.test(call.sql)).length, 0);
    assert.equal(eventInserts(db.calls)[0].params[1], 77);
    assert.equal(db.state.committed, true);
});

test('save-form-data treats location_type "new" with a location_id as the existing location (post-save reuse)', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            location_id: String(NEW_LOCATION_ID),
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, NEW_LOCATION_ID);
        assert.equal(result.body.locationCreated, false);

        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            selected_location_id: '88',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, 88);
    });

    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(indexOfSql(db.calls, /FROM Location WHERE LocationName/), -1);
});

// ---------- POST /api/locations (My Locations) unchanged ----------

test('POST /api/locations still inserts directly and returns the new ID', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/locations', newLocationBody());
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, {
            success: true,
            message: 'Location created successfully',
            locationId: NEW_LOCATION_ID
        });
    });

    const inserts = locationInserts(db.calls);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].where, 'pool');
    assert.deepEqual(inserts[0].params, [
        'CA1', 'Creek A', 'Creek behind the school', '42.5', '-83.1',
        null, null, null, null, 4812, 2.5, 1, USER_ID
    ]);
});

test('POST /api/locations keeps its duplicate, validation and My Locations form behaviour', async () => {
    const dupDb = createFakeDb({ locationInsertError: duplicateEntryError() });
    await withServer(loadApiRouterWithPool(dupDb.pool), { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/locations', newLocationBody());
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: DUPLICATE_MESSAGE });
    });

    const db = createFakeDb();
    await withServer(loadApiRouterWithPool(db.pool), { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/locations', newLocationBody({ locationDescription: '' }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Location description is required' });

        result = await postJson(baseUrl, '/api/locations',
            newLocationBody({ latitude: null, longitude: null, zipCode: null }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: GROUP_MESSAGE });

        // The My Locations form posts every field as a string, '' when empty;
        // that was accepted before and still is.
        result = await postJson(baseUrl, '/api/locations', {
            locationId: '', locationName: 'Field B', locationShortCode: 'FB', locationDescription: 'Field',
            latitude: '', longitude: '', streetAddress: '', city: '', state: '', country: '', zipCode: ''
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.locationId, NEW_LOCATION_ID);
    });
});

// ---------- helpers ----------

test('validateLocationPayload applies the POST /locations rules to a nested payload', async () => {
    const { validateLocationPayload, getNewLocationPayload } = loadApiRouterWithPool(createFakeDb().pool)._internals;

    assert.deepEqual(await validateLocationPayload(newLocationBody()), { isValid: true });
    assert.deepEqual(await validateLocationPayload(newLocationBody({ longitude: '-200' })),
        { isValid: false, message: 'Invalid longitude' });
    assert.deepEqual(await validateLocationPayload(newLocationBody({ locationName: 'x'.repeat(256) })),
        { isValid: false, message: 'Location name too long' });
    assert.deepEqual(await validateLocationPayload(null),
        { isValid: false, message: 'New location details are missing' });

    const payload = newLocationBody();
    assert.equal(getNewLocationPayload({ location_type: 'new', new_location: payload }), payload);
    assert.equal(getNewLocationPayload({ location_type: 'new', location_id: '3', new_location: payload }), null);
    assert.equal(getNewLocationPayload({ location_type: 'existing', new_location: payload }), null);
    assert.equal(getNewLocationPayload({ location_type: 'new', new_location: [payload] }), null);
});

// ---------- review fixes: values the Location INSERT would reject ----------

test('POST /api/locations/check rejects a zip or acres value the Location columns cannot hold', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        // ZipCode INT(11): 12 digits fit the 20-character limit but not the column.
        let result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ zipCode: '123456789012' }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Zip code is out of range' });

        // Area_acres DECIMAL(10,0).
        for (const acres of ['1e12', '10000000000', 'abc', '-1']) {
            result = await postJson(baseUrl, '/api/locations/check', newLocationBody({ acres }));
            assert.equal(result.status, 400, `acres ${acres}`);
            assert.deepEqual(result.body, { success: false, message: 'Invalid acres' });
        }

        // Values the columns do hold still pass; empty acres is optional.
        for (const overrides of [
            { zipCode: '2147483647' }, { zipCode: '12345-6789' }, { zipCode: '04812' },
            { acres: '' }, { acres: null }, { acres: '9999999999' }, { acres: '0.25' }
        ]) {
            result = await postJson(baseUrl, '/api/locations/check', newLocationBody(overrides));
            assert.equal(result.status, 200, JSON.stringify(overrides));
        }
    });

    assert.equal(locationInserts(db.calls).length, 0);
});

test('save-form-data rejects an out-of-range zip or acres before opening a transaction', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ zipCode: '123456789012' })
        }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Zip code is out of range' });

        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ acres: '1e12' })
        }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Invalid acres' });
    });

    assert.equal(db.state.began, false);
    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(eventInserts(db.calls).length, 0);
});

test('POST /api/locations shares the zip and acres range rules (400 instead of a failed INSERT)', async () => {
    const db = createFakeDb();
    await withServer(loadApiRouterWithPool(db.pool), { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/locations', newLocationBody({ zipCode: '123456789012' }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Zip code is out of range');
        result = await postJson(baseUrl, '/api/locations', newLocationBody({ acres: '1e12' }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, 'Invalid acres');
    });
    assert.equal(locationInserts(db.calls).length, 0);
});

// ---------- review fixes: a locator must be one that is actually stored ----------

test('POST /api/locations/check does not count empty coordinates or an unreadable zip as a locator', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        for (const overrides of [
            { latitude: '', longitude: '', zipCode: null },
            { latitude: null, longitude: null, zipCode: 'abc' },
            { latitude: '', longitude: '', zipCode: 'abc' }
        ]) {
            const result = await postJson(baseUrl, '/api/locations/check', newLocationBody(overrides));
            assert.equal(result.status, 400, JSON.stringify(overrides));
            assert.deepEqual(result.body, { success: false, message: GROUP_MESSAGE });
        }

        // Blank-but-not-empty coordinates are refused too (by the latitude rule).
        const blank = await postJson(baseUrl, '/api/locations/check',
            newLocationBody({ latitude: '  ', longitude: '  ', zipCode: '' }));
        assert.equal(blank.status, 400);
        assert.equal(blank.body.success, false);

        // Numeric coordinates (strings or numbers) and a readable zip still count.
        for (const overrides of [
            { latitude: 0, longitude: 0, zipCode: null },
            { latitude: '42.5', longitude: '-83.1', zipCode: null },
            { latitude: null, longitude: null, zipCode: '48109' }
        ]) {
            const result = await postJson(baseUrl, '/api/locations/check', newLocationBody(overrides));
            assert.equal(result.status, 200, JSON.stringify(overrides));
        }
    });

    assert.equal(locationInserts(db.calls).length, 0);
});

test('save-form-data rejects a hand-made new_location with no real locator', async () => {
    const db = createFakeDb();
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: { locationName: 'X', locationShortCode: 'X', locationDescription: 'X', latitude: '', longitude: '' }
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, GROUP_MESSAGE);

        result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ latitude: null, longitude: null, zipCode: 'abc' })
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, GROUP_MESSAGE);
    });

    assert.equal(db.state.began, false);
    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(eventInserts(db.calls).length, 0);
});

test('hasLocationGroup keeps the old rule only for POST /locations (legacy)', () => {
    const { hasLocationGroup } = loadApiRouterWithPool(createFakeDb().pool)._internals;
    const blank = { latitude: '', longitude: '', streetAddress: '', city: '', state: '', country: '', zipCode: '' };
    assert.equal(hasLocationGroup(blank, { legacy: true }), true);
    assert.equal(hasLocationGroup(blank), false);
    assert.equal(hasLocationGroup({ zipCode: 'abc' }, { legacy: true }), true);
    assert.equal(hasLocationGroup({ zipCode: 'abc' }), false);
    assert.equal(hasLocationGroup({ latitude: '1', longitude: '2' }), true);
    assert.equal(hasLocationGroup({ streetAddress: 'a', city: 'b', state: 'c', country: 'd' }), true);
});

// ---------- review fixes: a DB value error on the Save-path Location insert ----------

test('save-form-data reports a Location column value error as a 400 about the page-1 location and rolls back', async () => {
    const charsetError = Object.assign(new Error("Incorrect string value: '\\xE6\\xB9\\x96' for column 'LocationName' at row 1"), {
        code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
        sqlMessage: "Incorrect string value: '\\xE6\\xB9\\x96' for column 'LocationName' at row 1"
    });
    const db = createFakeDb({ locationInsertError: charsetError });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await postJson(baseUrl, '/api/save-form-data', baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ locationName: '湖' })
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.success, false);
        assert.match(result.body.message, /^The new location details could not be saved \(Incorrect string value/);
        assert.match(result.body.message, /go back to page 1/);
    });

    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
    assert.equal(eventInserts(db.calls).length, 0);
    assert.equal(db.state.released, true);
});

// ---------- PUT /api/my-samples/:id/form-data (Edit My Data) ----------
// Edit My Data uses the same deferred page-1 flow: a new location is held
// client-side and created only by the final Update, inside its transaction.

async function putJson(baseUrl, path, payload) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() };
}

const editPath = `/api/my-samples/${OWNED_SAMPLE_ID}/form-data`;
const eventUpdates = calls => calls.filter(call => /^\s*UPDATE SamplingEvent\b/.test(call.sql));
// LocationID_Num is the first SET column (SAMPLING_EVENT_COLUMNS order of the map).
const updatedLocationId = call => {
    const columns = [...call.sql.matchAll(/`(\w+)` = \?/g)].map(match => match[1]);
    return call.params[columns.indexOf('LocationID_Num')];
};

test('PUT form-data inserts a held new location on the transaction connection before the SamplingEvent update', async () => {
    const db = createFakeDb({ ownedSample: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            location_name: 'Creek A',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.success, true);
        assert.equal(result.body.message, 'Sample updated successfully');
        assert.equal(result.body.sampleDetailsId, OWNED_SAMPLE_ID);
        assert.equal(result.body.locationId, NEW_LOCATION_ID);
        assert.equal(result.body.locationName, 'Creek A');
        assert.equal(result.body.locationCreated, true);
    });

    const inserts = locationInserts(db.calls);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].where, 'connection', 'the location must be inserted inside the update transaction');
    assert.deepEqual(inserts[0].params, [
        'CA1', 'Creek A', 'Creek behind the school', '42.5', '-83.1',
        null, null, null, null, 4812, 2.5, 1, USER_ID
    ]);

    const begin = indexOfSql(db.calls, /^BEGIN$/);
    const locationInsert = indexOfSql(db.calls, /INSERT INTO Location\b/);
    const eventUpdate = indexOfSql(db.calls, /^\s*UPDATE SamplingEvent\b/);
    const commit = indexOfSql(db.calls, /^COMMIT$/);
    assert.ok(begin >= 0 && begin < locationInsert, 'location insert happens after BEGIN');
    assert.ok(locationInsert < eventUpdate, 'location insert happens before the SamplingEvent update');
    assert.ok(eventUpdate < commit);

    const updates = eventUpdates(db.calls);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].where, 'connection');
    assert.equal(updatedLocationId(updates[0]), NEW_LOCATION_ID, 'the new ID is written to LocationID_Num');
    assert.deepEqual(updates[0].params.slice(-2), [OWNED_EVENT_ID, USER_ID], 'ownership WHERE is unchanged');
    assert.equal(db.state.committed, true);
    assert.equal(db.state.rolledBack, false);
    assert.equal(db.state.released, true);
});

test('PUT form-data rolls back with 400 and no update when the held location name is taken', async () => {
    for (const options of [{ existingNameCount: 1 }, { locationInsertError: duplicateEntryError() }]) {
        const db = createFakeDb({ ownedSample: true, ...options });
        const router = loadApiRouterWithPool(db.pool);

        await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
            const result = await putJson(baseUrl, editPath, baseFormData({
                location_type: 'new',
                new_location: newLocationBody()
            }));
            assert.equal(result.status, 400, JSON.stringify(options));
            assert.deepEqual(result.body, { success: false, message: DUPLICATE_MESSAGE });
        });

        assert.equal(eventUpdates(db.calls).length, 0, 'no SamplingEvent update after a duplicate location');
        assert.equal(db.calls.filter(call => /^\s*UPDATE\b/i.test(call.sql)).length, 0);
        assert.equal(db.state.rolledBack, true);
        assert.equal(db.state.committed, false);
        assert.equal(db.state.released, true);
    }
});

test('PUT form-data rejects an invalid held location with 400, rollback and no write', async () => {
    const db = createFakeDb({ ownedSample: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ locationShortCode: '' })
        }));
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { success: false, message: 'Location short code is required' });

        result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            new_location: newLocationBody({ latitude: null, longitude: null, zipCode: '' })
        }));
        assert.equal(result.status, 400);
        assert.equal(result.body.message, GROUP_MESSAGE);
    });

    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
    assert.equal(locationInserts(db.calls).length, 0);
    assert.equal(db.calls.filter(call => /^\s*(INSERT|UPDATE|DELETE)/i.test(call.sql)).length, 0);
});

test('PUT form-data rolls the held location back when the sample update fails after the insert', async () => {
    const db = createFakeDb({ ownedSample: true, failSamplingEventUpdate: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 500);
        assert.equal(result.body.success, false);
        assert.match(result.body.message, /^Error updating sample: /);
    });

    assert.equal(locationInserts(db.calls).length, 1);
    assert.equal(locationInserts(db.calls)[0].where, 'connection');
    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
    assert.equal(db.state.released, true);
});

test('PUT form-data rolls the held location back when the sample is not the user\'s (404)', async () => {
    const db = createFakeDb({ ownedSample: false });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 404);
        assert.deepEqual(result.body, { success: false, message: 'Sample not found' });
    });

    assert.equal(db.state.rolledBack, true);
    assert.equal(db.state.committed, false);
    assert.equal(eventUpdates(db.calls).length, 0);
});

test('PUT form-data with an existing location_id does not touch the Location table', async () => {
    const db = createFakeDb({ ownedSample: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        const result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'existing',
            location_id: '77',
            location_name: 'Old Pond'
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, 77);
        assert.equal(result.body.locationName, 'Old Pond');
        assert.equal(result.body.locationCreated, false);
    });

    assert.equal(db.calls.filter(call => /\bLocation\b/.test(call.sql) && !/SamplingEvent/.test(call.sql)).length, 0);
    assert.equal(updatedLocationId(eventUpdates(db.calls)[0]), 77);
    assert.equal(db.state.committed, true);
});

test('PUT form-data never writes a NULL or 0 LocationID_Num: no usable location ID is a 400', async () => {
    const db = createFakeDb({ ownedSample: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        for (const overrides of [
            {},
            { location_id: '' },
            { location_id: '0' },
            { location_id: 'abc' },
            { location_type: 'existing', location_id: null },
            // A held new location that did not arrive intact is not silently dropped.
            { location_type: 'new', location_name: 'Creek A' },
            { location_type: 'new', new_location: [newLocationBody()] }
        ]) {
            const result = await putJson(baseUrl, editPath, baseFormData(overrides));
            assert.equal(result.status, 400, JSON.stringify(overrides));
            assert.deepEqual(result.body, { success: false, message: LOCATION_REQUIRED_MESSAGE });
        }
    });

    assert.equal(db.calls.filter(call => /^\s*(INSERT|UPDATE|DELETE)/i.test(call.sql)).length, 0);
    assert.equal(db.state.committed, false);
    assert.equal(db.state.rolledBack, true);
});

test('PUT form-data treats location_type "new" with a location_id as that existing location', async () => {
    const db = createFakeDb({ ownedSample: true });
    const router = loadApiRouterWithPool(db.pool);

    await withServer(router, { user_id: USER_ID }, async (baseUrl) => {
        let result = await putJson(baseUrl, editPath, baseFormData({
            location_type: 'new',
            location_id: String(NEW_LOCATION_ID),
            new_location: newLocationBody()
        }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, NEW_LOCATION_ID);
        assert.equal(result.body.locationCreated, false);

        result = await putJson(baseUrl, editPath, baseFormData({ selected_location_id: '88' }));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.locationId, 88);
    });

    assert.equal(locationInserts(db.calls).length, 0);
    assert.deepEqual(eventUpdates(db.calls).map(updatedLocationId), [NEW_LOCATION_ID, 88]);
});
