'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ejs = require('ejs');
const express = require('express');
const session = require('express-session');

const projectRoot = path.join(__dirname, '..');

function extractCountryRows(sql) {
    const valuesMatch = sql.match(
        /INSERT INTO `Country_Ref` \(`CountryUniqueID`, `ISOAlpha2`, `Country`\) VALUES\s*([\s\S]*?)(?:\nON DUPLICATE KEY UPDATE|\n\n-- --------------------------------------------------------)/
    );

    assert.ok(valuesMatch, 'Country reference insert should be present');

    return Array.from(valuesMatch[1].matchAll(
        /\((\d+),\s*'([A-Z]{2})',\s*'((?:[^']|'')*)'\)/g
    ), match => ({
        id: Number(match[1]),
        code: match[2],
        name: match[3].replaceAll("''", "'")
    }));
}

async function seedCaptcha(origin) {
    const response = await fetch(`${origin}/seed-captcha`);
    assert.equal(response.status, 204);

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie, 'Captcha seed should create a session cookie');
    return setCookie.split(';', 1)[0];
}

async function submitSignup(origin, payload) {
    const cookie = await seedCaptcha(origin);
    const response = await fetch(`${origin}/auth/signup`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify(payload),
        redirect: 'manual'
    });

    return {
        status: response.status,
        body: await response.json()
    };
}

test('signup form marks every applicable field as required', async () => {
    const html = await ejs.renderFile(
        path.join(projectRoot, 'views', 'signup.ejs'),
        {
            title: 'Sign Up',
            error: '',
            organizationTypes: [
                { OrganizationTypeUniqueID: 1, OrganizationType: 'Academic Higher Education' },
                { OrganizationTypeUniqueID: 12, OrganizationType: 'Other (please specify)' }
            ],
            countries: [
                { CountryUniqueID: 76, ISOAlpha2: 'FR', Country: 'France' },
                { CountryUniqueID: 1, ISOAlpha2: 'US', Country: 'United States of America' }
            ],
            states: [
                { StateUniqueID: 5, State: 'California', Country_Num: 1 }
            ]
        }
    );
    const normalizedHtml = html.replace(/\s+/g, ' ');

    for (const fieldId of [
        'username',
        'email',
        'password',
        'confirm_password',
        'first_name',
        'last_name',
        'organization',
        'organization_type_num',
        'job_title',
        'country_num',
        'captcha'
    ]) {
        assert.match(
            normalizedHtml,
            new RegExp(`id="${fieldId}"[^>]*\\brequired\\b`),
            `${fieldId} should be required`
        );
    }

    assert.match(normalizedHtml, /data-country-code="US"> United States <\/option>/);
    assert.match(normalizedHtml, /id="state_num"[^>]*disabled[^>]*aria-required="false"/);

    const clientScript = await fs.readFile(
        path.join(projectRoot, 'public', 'js', 'auth.js'),
        'utf8'
    );
    assert.match(clientScript, /organizationTypeOtherInput\.required = showOther/);
    assert.match(clientScript, /selectedCountryOption\.dataset\.countryCode === 'US'/);
    assert.match(clientScript, /stateSelect\.required = isUnitedStates/);
});

test('canonical schema and migration contain the complete 249-entry ISO country set', async () => {
    const [schemaSql, migrationSql] = await Promise.all([
        fs.readFile(path.join(projectRoot, 'database_init.sql'), 'utf8'),
        fs.readFile(path.join(projectRoot, 'db', '20260722_expand_country_reference.sql'), 'utf8')
    ]);
    const schemaCountries = extractCountryRows(schemaSql);
    const migrationCountries = extractCountryRows(migrationSql);

    for (const countries of [schemaCountries, migrationCountries]) {
        assert.equal(countries.length, 249);
        assert.equal(new Set(countries.map(country => country.id)).size, 249);
        assert.equal(new Set(countries.map(country => country.code)).size, 249);
        assert.equal(new Set(countries.map(country => country.name)).size, 249);
        assert.deepEqual(
            countries.find(country => country.code === 'US'),
            { id: 1, code: 'US', name: 'United States of America' }
        );
    }

    assert.deepEqual(migrationCountries, schemaCountries);
});

test('signup API enforces required profile fields and conditional fields', async t => {
    const databaseModulePath = require.resolve('../config/database');
    const emailServiceModulePath = require.resolve('../services/emailService');
    const authModulePath = require.resolve('../routes/auth');
    const originalDatabaseModule = require.cache[databaseModulePath];
    const originalEmailServiceModule = require.cache[emailServiceModulePath];
    const originalAuthModule = require.cache[authModulePath];
    const insertedUsers = [];

    const pool = {
        async execute(sql, params = []) {
            if (sql.includes('FROM OrganizationType_Ref')) {
                return [[{
                    OrganizationType: Number(params[0]) === 12
                        ? 'Other (please specify)'
                        : 'Academic Higher Education'
                }]];
            }

            if (sql.includes('FROM Country_Ref')) {
                const countryId = Number(params[0]);
                return [[{
                    CountryUniqueID: countryId,
                    ISOAlpha2: countryId === 1 ? 'US' : 'FR'
                }]];
            }

            if (sql.includes('FROM State_Ref')) {
                return Number(params[0]) === 5 && Number(params[1]) === 1
                    ? [[{ StateUniqueID: 5 }]]
                    : [[]];
            }

            if (sql.includes('FROM users') && sql.includes('username IN')) {
                return [[]];
            }

            if (sql.startsWith('INSERT INTO users')) {
                insertedUsers.push(params);
                return [{ insertId: 42 }];
            }

            throw new Error(`Unexpected SQL in signup test: ${sql}`);
        }
    };

    require.cache[databaseModulePath] = {
        id: databaseModulePath,
        filename: databaseModulePath,
        loaded: true,
        exports: { pool }
    };
    require.cache[emailServiceModulePath] = {
        id: emailServiceModulePath,
        filename: emailServiceModulePath,
        loaded: true,
        exports: {
            async sendPasswordResetConfirmationEmail() {}
        }
    };
    delete require.cache[authModulePath];

    const authRouter = require('../routes/auth');
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'signup-route-test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.get('/seed-captcha', (req, res) => {
        req.session.captcha_code = 'ABC123';
        res.sendStatus(204);
    });
    app.use('/auth', authRouter);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    t.after(async () => {
        await new Promise(resolve => server.close(resolve));

        if (originalDatabaseModule) {
            require.cache[databaseModulePath] = originalDatabaseModule;
        } else {
            delete require.cache[databaseModulePath];
        }

        if (originalAuthModule) {
            require.cache[authModulePath] = originalAuthModule;
        } else {
            delete require.cache[authModulePath];
        }

        if (originalEmailServiceModule) {
            require.cache[emailServiceModulePath] = originalEmailServiceModule;
        } else {
            delete require.cache[emailServiceModulePath];
        }
    });

    const validFrenchSignup = {
        username: 'ExampleUser',
        email: 'user@example.test',
        password: 'example-password',
        confirm_password: 'example-password',
        first_name: 'Example',
        last_name: 'User',
        organization: 'Example Institute',
        organization_type_num: '1',
        job_title: 'Researcher',
        country_num: '76',
        captcha: 'ABC123'
    };

    const newlyRequiredFields = new Map([
        ['first_name', 'First name is required'],
        ['last_name', 'Last name is required'],
        ['organization', 'Organization is required'],
        ['organization_type_num', 'Organization type is required'],
        ['job_title', 'Job / Position Title is required'],
        ['country_num', 'Country is required']
    ]);

    for (const [field, expectedMessage] of newlyRequiredFields) {
        const payload = { ...validFrenchSignup };
        delete payload[field];
        const result = await submitSignup(origin, payload);

        assert.equal(result.status, 400, `${field} should be rejected when missing`);
        assert.equal(result.body.message, expectedMessage);
    }

    const whitespaceOnlyFirstName = await submitSignup(origin, {
        ...validFrenchSignup,
        first_name: '   '
    });
    assert.equal(whitespaceOnlyFirstName.status, 400);
    assert.equal(whitespaceOnlyFirstName.body.message, 'First name is required');

    const missingOtherOrganizationType = await submitSignup(origin, {
        ...validFrenchSignup,
        organization_type_num: '12'
    });
    assert.equal(missingOtherOrganizationType.status, 400);
    assert.equal(
        missingOtherOrganizationType.body.message,
        'Other organization type is required'
    );

    const missingUsState = await submitSignup(origin, {
        ...validFrenchSignup,
        country_num: '1'
    });
    assert.equal(missingUsState.status, 400);
    assert.equal(
        missingUsState.body.message,
        'State is required when United States is selected'
    );

    const invalidUsState = await submitSignup(origin, {
        ...validFrenchSignup,
        country_num: '1',
        state_num: '999'
    });
    assert.equal(invalidUsState.status, 400);
    assert.equal(
        invalidUsState.body.message,
        'Invalid state for the selected country'
    );

    const stateForFrance = await submitSignup(origin, {
        ...validFrenchSignup,
        state_num: '5'
    });
    assert.equal(stateForFrance.status, 400);
    assert.equal(
        stateForFrance.body.message,
        'State can only be selected for United States'
    );

    const frenchSignup = await submitSignup(origin, validFrenchSignup);
    assert.equal(frenchSignup.status, 200);
    assert.equal(frenchSignup.body.success, true);
    assert.equal(insertedUsers.at(-1)[9], 76);
    assert.equal(insertedUsers.at(-1)[10], null);

    const otherOrganizationSignup = await submitSignup(origin, {
        ...validFrenchSignup,
        username: 'OtherOrganizationUser',
        email: 'other-organization@example.test',
        organization_type_num: '12',
        organization_type_other: 'Citizen science collective'
    });
    assert.equal(otherOrganizationSignup.status, 200);
    assert.equal(otherOrganizationSignup.body.success, true);
    assert.equal(insertedUsers.at(-1)[6], 12);
    assert.equal(insertedUsers.at(-1)[7], 'Citizen science collective');

    const usSignup = await submitSignup(origin, {
        ...validFrenchSignup,
        username: 'AmericanUser',
        email: 'american@example.test',
        country_num: '1',
        state_num: '5'
    });
    assert.equal(usSignup.status, 200);
    assert.equal(usSignup.body.success, true);
    assert.equal(insertedUsers.at(-1)[9], 1);
    assert.equal(insertedUsers.at(-1)[10], 5);
});
