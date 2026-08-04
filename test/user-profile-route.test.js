const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const express = require('express');
const session = require('express-session');

test('profile update writes the same user fields that signup stores', async t => {
    const databaseModulePath = require.resolve('../config/database');
    const pagesModulePath = require.resolve('../routes/pages');
    const originalDatabaseModule = require.cache[databaseModulePath];
    const capturedUpdates = [];

    const pool = {
        async execute(sql, params = []) {
            if (sql.startsWith('SELECT User_UniqueID, username, password FROM users')) {
                return [[{
                    User_UniqueID: 42,
                    username: 'ExampleUser',
                    password: 'unused-without-password-change'
                }]];
            }

            if (sql.includes('WHERE User_UniqueID != ?')) {
                return [[]];
            }

            if (sql.includes('FROM OrganizationType_Ref') && sql.includes('WHERE OrganizationTypeUniqueID')) {
                const organizationTypeId = Number(params[0]);
                if (![1, 12].includes(organizationTypeId)) return [[]];

                return [[{
                    OrganizationType: organizationTypeId === 12
                        ? 'Other (please specify)'
                        : 'Academic Higher Education'
                }]];
            }

            if (sql.includes('FROM Country_Ref') && sql.includes('WHERE CountryUniqueID')) {
                const countryId = Number(params[0]);
                if (![1, 76].includes(countryId)) return [[]];

                return [[{
                    CountryUniqueID: countryId,
                    ISOAlpha2: countryId === 1 ? 'US' : 'FR'
                }]];
            }

            if (sql.includes('FROM State_Ref') && sql.includes('WHERE StateUniqueID')) {
                return Number(params[0]) === 33 && Number(params[1]) === 1
                    ? [[{ StateUniqueID: 33 }]]
                    : [[]];
            }

            if (sql.startsWith('UPDATE users SET')) {
                capturedUpdates.push({ sql, params });
                return [{ affectedRows: 1 }];
            }

            throw new Error(`Unexpected SQL: ${sql}`);
        }
    };

    require.cache[databaseModulePath] = {
        id: databaseModulePath,
        filename: databaseModulePath,
        loaded: true,
        exports: { pool }
    };
    delete require.cache[pagesModulePath];

    const pageRouter = require('../routes/pages');
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(session({
        secret: 'profile-route-test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.get('/seed-user', (req, res) => {
        req.session.user_id = 42;
        req.session.username = 'ExampleUser';
        req.session.email = 'old@example.test';
        res.sendStatus(204);
    });
    app.use('/', pageRouter);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        delete require.cache[pagesModulePath];

        if (originalDatabaseModule) {
            require.cache[databaseModulePath] = originalDatabaseModule;
        } else {
            delete require.cache[databaseModulePath];
        }
    });

    const seedResponse = await fetch(`${origin}/seed-user`);
    const cookie = seedResponse.headers.get('set-cookie').split(';')[0];

    const validFrenchProfile = {
        first_name: 'Updated',
        last_name: 'Person',
        email: 'updated@example.test',
        organization: 'Community Lab',
        organization_type_num: '1',
        job_title: 'Research Lead',
        country_num: '76',
        current_password: '',
        new_password: '',
        confirm_password: ''
    };

    async function submitProfile(payload) {
        return fetch(`${origin}/my-profile`, {
            method: 'POST',
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: cookie
            },
            body: new URLSearchParams(payload).toString()
        });
    }

    function getRedirectError(response) {
        return new URL(response.headers.get('location'), origin).searchParams.get('error');
    }

    const requiredFields = new Map([
        ['first_name', 'First name is required'],
        ['last_name', 'Last name is required'],
        ['email', 'Valid email is required'],
        ['organization', 'Organization is required'],
        ['organization_type_num', 'Organization type is required'],
        ['job_title', 'Job / Position Title is required'],
        ['country_num', 'Country is required']
    ]);

    for (const [field, expectedMessage] of requiredFields) {
        const payload = { ...validFrenchProfile };
        delete payload[field];
        const response = await submitProfile(payload);

        assert.equal(response.status, 302);
        assert.equal(getRedirectError(response), expectedMessage);
        assert.equal(capturedUpdates.length, 0);
    }

    const whitespaceOnlyName = await submitProfile({
        ...validFrenchProfile,
        first_name: '   '
    });
    assert.equal(getRedirectError(whitespaceOnlyName), 'First name is required');
    assert.equal(capturedUpdates.length, 0);

    const missingOtherOrganizationType = await submitProfile({
        ...validFrenchProfile,
        organization_type_num: '12'
    });
    assert.equal(
        getRedirectError(missingOtherOrganizationType),
        'Other organization type is required'
    );
    assert.equal(capturedUpdates.length, 0);

    const missingUsState = await submitProfile({
        ...validFrenchProfile,
        country_num: '1'
    });
    assert.equal(
        getRedirectError(missingUsState),
        'State is required when United States is selected'
    );
    assert.equal(capturedUpdates.length, 0);

    const stateForFrance = await submitProfile({
        ...validFrenchProfile,
        state_num: '33'
    });
    assert.equal(
        getRedirectError(stateForFrance),
        'State can only be selected for United States'
    );
    assert.equal(capturedUpdates.length, 0);

    const frenchResponse = await submitProfile(validFrenchProfile);
    assert.equal(frenchResponse.status, 302);
    assert.equal(frenchResponse.headers.get('location'), '/my-profile?success=1');
    assert.equal(capturedUpdates.length, 1);
    assert.equal(capturedUpdates[0].params[7], 76);
    assert.equal(capturedUpdates[0].params[8], null);

    const response = await submitProfile({
        ...validFrenchProfile,
        first_name: '  Updated  ',
        last_name: '  Person  ',
        organization: '  Community Lab  ',
        organization_type_num: '12',
        organization_type_other: '  Citizen Science Group  ',
        job_title: '  Research Lead  ',
        country_num: '1',
        state_num: '33'
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/my-profile?success=1');
    assert.equal(capturedUpdates.length, 2);
    const capturedUpdate = capturedUpdates[1];
    assert.ok(capturedUpdate);
    assert.match(capturedUpdate.sql, /first_name = \?/);
    assert.match(capturedUpdate.sql, /last_name = \?/);
    assert.match(capturedUpdate.sql, /OrganizationType_Num = \?/);
    assert.match(capturedUpdate.sql, /Country_Num = \?/);
    assert.match(capturedUpdate.sql, /State_Num = \?/);
    assert.doesNotMatch(capturedUpdate.sql, /full_name|institution|cell_phone|sample_confidentiality/);
    assert.deepEqual(capturedUpdate.params, [
        'Updated',
        'Person',
        'updated@example.test',
        'Community Lab',
        12,
        'Citizen Science Group',
        'Research Lead',
        1,
        33,
        42
    ]);
});
