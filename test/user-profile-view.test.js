const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const ejs = require('ejs');

const projectRoot = path.join(__dirname, '..');

test('profile renders the fields stored by signup instead of legacy missing columns', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
        const html = await ejs.renderFile(
            path.join(projectRoot, 'views', 'my_profile.ejs'),
            {
                currentPage: 'my-profile',
                success: null,
                error: null,
                user: {
                    User_UniqueID: 42,
                    username: 'ExampleUser',
                    email: 'user@example.test',
                    first_name: 'Example',
                    last_name: 'Person',
                    organization: 'Example Institute',
                    OrganizationType_Num: 2,
                    OrganizationTypeOther: null,
                    job_title: 'Researcher',
                    Country_Num: 1,
                    State_Num: 33,
                    created_at: new Date('2026-01-02T00:00:00Z'),
                    updated_at: new Date('2026-02-03T00:00:00Z')
                },
                organizationTypes: [
                    { OrganizationTypeUniqueID: 2, OrganizationType: 'Academic Higher Education' },
                    { OrganizationTypeUniqueID: 12, OrganizationType: 'Other (please specify)' }
                ],
                countries: [
                    { CountryUniqueID: 1, ISOAlpha2: 'US', Country: 'United States of America' }
                ],
                states: [
                    { StateUniqueID: 33, State: 'New York', Country_Num: 1 }
                ]
            }
        );

        assert.match(html, /name="first_name"[^>]*value="Example"/);
        assert.match(html, /name="last_name"[^>]*value="Person"/);
        assert.match(html, /name="organization"[^>]*value="Example Institute"/);
        assert.match(html, /name="job_title"[^>]*value="Researcher"/);
        assert.match(html, /value="2"[\s\S]*selected[\s\S]*Academic Higher Education/);
        assert.match(html, /value="33"[\s\S]*selected[\s\S]*New York/);
        assert.match(html, /data-country-code="US"[\s\S]*United States/);

        for (const fieldName of [
            'first_name',
            'last_name',
            'email',
            'organization',
            'organization_type_num',
            'job_title',
            'country_num'
        ]) {
            assert.match(
                html,
                new RegExp(`name="${fieldName}"[^>]*\\brequired\\b`),
                `${fieldName} should be required`
            );
        }

        assert.match(html, /organizationTypeOtherInput\.required = showOther/);
        assert.match(html, /selectedCountryOption\.dataset\.countryCode === 'US'/);
        assert.match(html, /stateSelect\.required = isUnitedStates/);

        assert.doesNotMatch(html, /name="full_name"/);
        assert.doesNotMatch(html, /name="institution"/);
        assert.doesNotMatch(html, /name="cell_phone"/);
        assert.doesNotMatch(html, /name="sample_confidentiality"/);
    } finally {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    }
});

test('profile load failure shows saved identity without an editable empty form', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
        const html = await ejs.renderFile(
            path.join(projectRoot, 'views', 'my_profile.ejs'),
            {
                currentPage: 'my-profile',
                success: null,
                error: 'Editing is temporarily unavailable.',
                profileEditable: false,
                user: {
                    username: 'ExampleUser',
                    email: 'user@example.test',
                    first_name: 'Example',
                    last_name: 'Person',
                    organization: 'Example Institute',
                    job_title: 'Researcher'
                },
                organizationTypes: [],
                countries: [],
                states: []
            }
        );

        assert.match(html, /ExampleUser/);
        assert.match(html, /user@example\.test/);
        assert.match(html, /Example Person/);
        assert.match(html, /Example Institute/);
        assert.doesNotMatch(html, /<form id="profile-form"/);
    } finally {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    }
});

test('canonical schema includes a stable account-recovery token table', async () => {
    const schema = await fs.readFile(path.join(projectRoot, 'database_init.sql'), 'utf8');
    const migration = await fs.readFile(
        path.join(projectRoot, 'db', '20260727_fix_account_recovery.sql'),
        'utf8'
    );
    const tableMatch = schema.match(
        /CREATE TABLE `password_reset_tokens` \(([\s\S]*?)\) ENGINE=InnoDB/
    );

    assert.ok(tableMatch, 'password_reset_tokens must be present in database_init.sql');
    assert.match(tableMatch[1], /`token` varchar\(64\) NOT NULL/);
    assert.match(tableMatch[1], /UNIQUE KEY `token` \(`token`\)/);
    assert.match(tableMatch[1], /`expires_at` timestamp NOT NULL/);
    assert.doesNotMatch(tableMatch[1], /ON UPDATE CURRENT_TIMESTAMP/i);
    assert.match(
        schema,
        /CONSTRAINT `FK_ResetToken_User` FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`User_UniqueID`\)/
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS `password_reset_tokens`/);
    assert.match(migration, /MODIFY COLUMN `expires_at` timestamp NOT NULL/);
    assert.match(schema, /CREATE TABLE `account_recovery_cooldowns`/);
    assert.match(schema, /`key_hash` binary\(32\) NOT NULL/);
    assert.match(schema, /CREATE TABLE `account_recovery_outbox`/);
    assert.match(schema, /`payload_ciphertext` mediumtext DEFAULT NULL/);
    assert.match(schema, /`claim_token` char\(36\)/);
    assert.match(
        schema,
        /CONSTRAINT `FK_RecoveryOutbox_ResetToken`[\s\S]*?REFERENCES `password_reset_tokens` \(`id`\)/
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS `account_recovery_cooldowns`/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS `account_recovery_outbox`/);
    assert.doesNotMatch(
        migration.match(/MODIFY COLUMN `expires_at`[^\n]*/)[0],
        /ON UPDATE/i
    );
});
