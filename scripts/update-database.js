const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config();

const projectRoot = path.resolve(__dirname, '..');
const migrationsRoot = path.join(projectRoot, 'db');

function resolveMigrationPath(migrationArgument) {
    if (!migrationArgument) {
        throw new Error(
            'Migration path is required. Example: node scripts/update-database.js db/20260727_fix_account_recovery.sql'
        );
    }

    const migrationPath = path.resolve(projectRoot, migrationArgument);
    const allowedPrefix = `${migrationsRoot}${path.sep}`;

    if (!migrationPath.startsWith(allowedPrefix) || path.extname(migrationPath) !== '.sql') {
        throw new Error('Migration must be a .sql file inside the db/ directory');
    }

    return migrationPath;
}

async function updateDatabase(migrationArgument = process.argv[2]) {
    const migrationPath = resolveMigrationPath(migrationArgument);
    const sqlScript = await fs.readFile(migrationPath, 'utf8');
    let connection;

    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'mysql',
            database: process.env.DB_NAME || 'sweetl23_partner_demo',
            charset: 'utf8mb4',
            multipleStatements: true
        });

        console.log(`Applying migration: ${path.relative(projectRoot, migrationPath)}`);
        await connection.query(sqlScript);
        console.log('Migration completed successfully.');
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    updateDatabase().catch(error => {
        console.error('Database migration failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    resolveMigrationPath,
    updateDatabase
};
