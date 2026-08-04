const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function quoteIdentifier(value) {
    return `\`${String(value).replace(/`/g, '``')}\``;
}

function timestampForFilename(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        '_',
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('');
}

function stripDefiner(createSql) {
    return createSql.replace(/DEFINER=`[^`]+`@`[^`]+`\s+/i, '');
}

function removeOlderBackups(outputDirectory, currentOutputPath, databaseName) {
    const expectedPrefix = `${databaseName}_`;
    let removedBackupCount = 0;

    for (const filename of fs.readdirSync(outputDirectory)) {
        const backupPath = path.join(outputDirectory, filename);
        if (
            backupPath !== currentOutputPath &&
            filename.startsWith(expectedPrefix) &&
            filename.endsWith('.sql')
        ) {
            fs.unlinkSync(backupPath);
            removedBackupCount += 1;
        }
    }

    return removedBackupCount;
}

async function writeDatabaseBackup() {
    const databaseName = process.env.DB_NAME;
    if (!databaseName) {
        throw new Error('DB_NAME is required');
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        charset: 'utf8mb4',
        dateStrings: true
    });

    const outputDirectory = path.join(__dirname, '..', 'db', 'backups');
    fs.mkdirSync(outputDirectory, { recursive: true });
    const outputPath = path.join(
        outputDirectory,
        `${databaseName}_${timestampForFilename()}.sql`
    );
    const output = fs.createWriteStream(outputPath, { encoding: 'utf8', mode: 0o600 });
    const write = chunk => new Promise((resolve, reject) => {
        output.write(chunk, error => error ? reject(error) : resolve());
    });

    try {
        await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

        const [objects] = await connection.query(`
            SELECT TABLE_NAME, TABLE_TYPE
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_TYPE, TABLE_NAME
        `, [databaseName]);

        const tables = objects.filter(object => object.TABLE_TYPE === 'BASE TABLE');
        const views = objects.filter(object => object.TABLE_TYPE === 'VIEW');

        await write([
            `-- Logical backup of ${databaseName}`,
            `-- Generated at ${new Date().toISOString()}`,
            'SET NAMES utf8mb4;',
            'SET FOREIGN_KEY_CHECKS=0;',
            `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
            `USE ${quoteIdentifier(databaseName)};`,
            ''
        ].join('\n'));

        for (const table of tables) {
            const tableName = table.TABLE_NAME;
            const [createRows] = await connection.query(`SHOW CREATE TABLE ${quoteIdentifier(tableName)}`);
            const createSql = createRows[0]['Create Table'];
            const [rows, fields] = await connection.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);

            await write(`\nDROP TABLE IF EXISTS ${quoteIdentifier(tableName)};\n${createSql};\n`);

            const columnList = fields.map(field => quoteIdentifier(field.name)).join(', ');
            const batchSize = 250;
            for (let offset = 0; offset < rows.length; offset += batchSize) {
                const batch = rows.slice(offset, offset + batchSize);
                const values = batch.map(row => `(${fields.map(field => connection.escape(row[field.name])).join(', ')})`);
                await write(
                    `INSERT INTO ${quoteIdentifier(tableName)} (${columnList}) VALUES\n${values.join(',\n')};\n`
                );
            }
        }

        for (const view of views) {
            const viewName = view.TABLE_NAME;
            const [createRows] = await connection.query(`SHOW CREATE VIEW ${quoteIdentifier(viewName)}`);
            const createSql = stripDefiner(createRows[0]['Create View']);
            await write(`\nDROP VIEW IF EXISTS ${quoteIdentifier(viewName)};\n${createSql};\n`);
        }

        await connection.commit();
        await write('\nSET FOREIGN_KEY_CHECKS=1;\n');
        await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()));

        const stats = fs.statSync(outputPath);
        const removedBackupCount = process.env.PRUNE_DATABASE_BACKUPS === 'true'
            ? removeOlderBackups(outputDirectory, outputPath, databaseName)
            : 0;
        return {
            outputPath,
            bytes: stats.size,
            tableCount: tables.length,
            viewCount: views.length,
            removedBackupCount
        };
    } catch (error) {
        await connection.rollback();
        output.destroy();
        throw error;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    writeDatabaseBackup()
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => {
            console.error(error.message);
            process.exit(1);
        });
}

module.exports = { writeDatabaseBackup };
