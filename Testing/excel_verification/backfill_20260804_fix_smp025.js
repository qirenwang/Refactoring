#!/usr/bin/env node
/**
 * Follow-up to backfill_20260804.js: one repair that was missed there.
 * SMP025 (SampleDetails 195) polymer percentages are swapped vs the Excel:
 * Excel says LDPE 12 / HDPE 10; the DB has LDPE 10 / HDPE 12.
 *
 * Usage: node Testing/excel_verification/backfill_20260804_fix_smp025.js --apply
 * (without --apply it only prints what it would do)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });
    try {
        const [[micro]] = await connection.query(
            'SELECT Micro_UniqueID AS id FROM MicroplasticsInSample WHERE SampleDetails_Num = 195'
        );
        const [rows] = await connection.query(
            'SELECT PolymerType_Legacy AS code, Percentage FROM MicroplasticsPolymerDetails WHERE MicroInSample_Num = ? AND PolymerType_Legacy IN (?, ?)',
            [micro.id, 'LDPE', 'HDPE']
        );
        console.log('Current:', JSON.stringify(rows));
        if (!APPLY) {
            console.log('Dry run. Would set LDPE -> 12 and HDPE -> 10. Re-run with --apply.');
            return;
        }
        await connection.beginTransaction();
        const [r1] = await connection.execute(
            'UPDATE MicroplasticsPolymerDetails SET Percentage = 12 WHERE MicroInSample_Num = ? AND PolymerType_Legacy = ? AND Percentage = 10',
            [micro.id, 'LDPE']
        );
        const [r2] = await connection.execute(
            'UPDATE MicroplasticsPolymerDetails SET Percentage = 10 WHERE MicroInSample_Num = ? AND PolymerType_Legacy = ? AND Percentage = 12',
            [micro.id, 'HDPE']
        );
        if (r1.affectedRows !== 1 || r2.affectedRows !== 1) {
            throw new Error(`unexpected affected rows: LDPE=${r1.affectedRows}, HDPE=${r2.affectedRows}`);
        }
        await connection.commit();
        console.log('Fixed: LDPE -> 12, HDPE -> 10.');
    } catch (error) {
        try { await connection.rollback(); } catch (_) { /* no open transaction */ }
        console.error('FAILED (rolled back):', error.message);
        process.exitCode = 1;
    } finally {
        await connection.end();
    }
}

main();
