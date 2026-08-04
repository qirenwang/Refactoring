const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveMigrationPath } = require('../scripts/update-database');

test('migration runner requires an explicit SQL file inside db', () => {
    const migrationPath = resolveMigrationPath('db/20260727_fix_account_recovery.sql');

    assert.equal(
        migrationPath,
        path.resolve(__dirname, '..', 'db', '20260727_fix_account_recovery.sql')
    );
    assert.throws(() => resolveMigrationPath(), /Migration path is required/);
    assert.throws(
        () => resolveMigrationPath('database_init.sql'),
        /inside the db\/ directory/
    );
    assert.throws(
        () => resolveMigrationPath('db/not-a-migration.txt'),
        /must be a \.sql file/
    );
});
