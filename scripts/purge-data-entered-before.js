#!/usr/bin/env node
'use strict';

// One-off data purge: delete every sampling entry ENTERED before a cutoff date
// (SamplingEvent.DateEntered < cutoff) together with everything underneath it,
// while leaving user accounts untouched. Locations and publications are kept
// unless explicitly included, and even then only rows that no remaining
// sampling event still references.
//
// Usage (from the project root, credentials from .env):
//   node scripts/purge-data-entered-before.js --before=2026-08-01                       # dry run: counts only
//   node scripts/purge-data-entered-before.js --before=2026-08-01 --include-locations \
//        --include-publications                                                            # dry run, wider scope
//   node scripts/purge-data-entered-before.js --before=2026-08-01 --execute \
//        --backup=db/backups/sweetl23_partner_demo_20260818_HHMMSS.sql                    # really delete
//
// --execute refuses to run without --backup pointing at an existing dump taken
// within the last two hours (node scripts/backup-database.js). All deletes run
// in ONE transaction; the script re-counts before COMMIT and rolls back on any
// mismatch or error. Users (and their password-reset rows) are never touched.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config();

const args = Object.fromEntries(
    process.argv.slice(2).map(arg => {
        const [key, ...rest] = arg.replace(/^--/, '').split('=');
        return [key, rest.length ? rest.join('=') : true];
    })
);

const cutoff = args.before;
if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff))) {
    console.error('Usage: --before=YYYY-MM-DD is required (rows with DateEntered strictly before that day are removed).');
    process.exit(2);
}
const execute = args.execute === true;
const includeLocations = args['include-locations'] === true;
const includePublications = args['include-publications'] === true;

if (execute) {
    const backupArg = typeof args.backup === 'string' ? args.backup : null;
    if (!backupArg) {
        console.error('--execute requires --backup=<path to a fresh dump from scripts/backup-database.js>.');
        process.exit(2);
    }
    const backupPath = path.resolve(process.cwd(), backupArg);
    if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size < 10_000) {
        console.error(`Backup file not found or suspiciously small: ${backupPath}`);
        process.exit(2);
    }
    const ageMinutes = (Date.now() - fs.statSync(backupPath).mtimeMs) / 60_000;
    if (ageMinutes > 120) {
        console.error(`Backup is ${ageMinutes.toFixed(0)} minutes old; take a fresh one before executing.`);
        process.exit(2);
    }
}

// The dependency chain, children first. Every set is derived from the target
// SamplingEvent IDs so a row is only removed because its event is going away.
const TARGET_EVENTS = 'SELECT SamplingEventUniqueID FROM SamplingEvent WHERE DateEntered < ?';
const TARGET_SAMPLES = `SELECT SampleUniqueID FROM SampleDetails WHERE SamplingEvent_Num IN (${TARGET_EVENTS})`;
const TARGET_MICRO = `SELECT Micro_UniqueID FROM MicroplasticsInSample WHERE SampleDetails_Num IN (${TARGET_SAMPLES})`;
const TARGET_FRAG = `SELECT Fragment_UniqueID FROM FragmentsInSample WHERE SampleDetails_Num IN (${TARGET_SAMPLES})`;

const STEPS = [
    { table: 'MicroplasticsPolymerDetails', where: `MicroInSample_Num IN (${TARGET_MICRO})` },
    { table: 'MicroplasticsColorDetails',   where: `MicroInSample_Num IN (${TARGET_MICRO})` },
    { table: 'MicroplasticsFormDetails',    where: `MicroInSample_Num IN (${TARGET_MICRO})` },
    { table: 'MicroplasticsOpacityDetails', where: `MicroInSample_Num IN (${TARGET_MICRO})` },
    { table: 'MicroplasticsSizeDetails',    where: `MicroInSample_Num IN (${TARGET_MICRO})` },
    { table: 'FragmentsPolymerDetails',     where: `FragInSample_Num IN (${TARGET_FRAG})` },
    { table: 'FragmentsColorDetails',       where: `FragInSample_Num IN (${TARGET_FRAG})` },
    { table: 'FragmentsFormDetails',        where: `FragInSample_Num IN (${TARGET_FRAG})` },
    { table: 'FragmentsOpacityDetails',     where: `FragInSample_Num IN (${TARGET_FRAG})` },
    { table: 'FragmentsPurposes',           where: `FragInSample_Num IN (${TARGET_FRAG})` },
    { table: 'RamanDetails',                where: `SampleDetails_Num IN (${TARGET_SAMPLES})` },
    { table: 'MicroplasticsInSample',       where: `SampleDetails_Num IN (${TARGET_SAMPLES})` },
    { table: 'FragmentsInSample',           where: `SampleDetails_Num IN (${TARGET_SAMPLES})` },
    { table: 'SampleDetails',               where: `SamplingEvent_Num IN (${TARGET_EVENTS})` },
    { table: 'SamplingEvent',               where: 'DateEntered < ?' }
];

// Master data is optional and only removed when nothing left points at it.
const OPTIONAL_STEPS = [];
if (includeLocations) {
    OPTIONAL_STEPS.push({
        table: 'Location',
        where: 'DateCreated < ? AND Loc_UniqueID NOT IN (SELECT LocationID_Num FROM SamplingEvent WHERE LocationID_Num IS NOT NULL AND DateEntered >= ?)',
        params: 2
    });
}
if (includePublications) {
    OPTIONAL_STEPS.push({
        table: 'Publications',
        where: 'DateEntered < ? AND PublicationUniqueID NOT IN (SELECT PublicationID_Num FROM SamplingEvent WHERE PublicationID_Num IS NOT NULL AND DateEntered >= ?)',
        params: 2
    });
}

const PROTECTED_TABLES = ['users', 'password_reset_tokens', 'account_recovery_outbox', 'account_recovery_cooldowns'];

function paramsFor(step) {
    const count = step.params || (step.where.match(/\?/g) || []).length;
    return Array.from({ length: count }, () => cutoff);
}

async function countRows(connection, table, where = null, params = []) {
    const sql = `SELECT COUNT(*) AS n FROM \`${table}\`${where ? ` WHERE ${where}` : ''}`;
    const [[row]] = await connection.execute(sql, params);
    return Number(row.n);
}

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || 'mysql',
        database: process.env.DB_NAME || 'sweetl23_partner_demo',
        charset: 'utf8mb4'
    });

    try {
        const [[meta]] = await connection.query('SELECT DATABASE() AS db, @@hostname AS host, NOW() AS now');
        console.log(`Database: ${meta.db} @ ${meta.host}  (server time ${meta.now.toISOString?.() || meta.now})`);
        console.log(`Mode    : ${execute ? '*** EXECUTE — rows will be deleted ***' : 'DRY RUN — nothing is modified'}`);
        console.log(`Cutoff  : DateEntered < ${cutoff} 00:00:00`);
        console.log(`Scope   : sampling data${includeLocations ? ' + unreferenced Location rows' : ''}${includePublications ? ' + unreferenced Publications rows' : ''}`);
        console.log('');

        // Consistency checks worth seeing before deciding anything.
        const [[orphans]] = await connection.execute(`
            SELECT
              (SELECT COUNT(*) FROM SampleDetails sd LEFT JOIN SamplingEvent se ON se.SamplingEventUniqueID = sd.SamplingEvent_Num WHERE se.SamplingEventUniqueID IS NULL) AS samples_without_event,
              (SELECT COUNT(*) FROM SampleDetails sd JOIN SamplingEvent se ON se.SamplingEventUniqueID = sd.SamplingEvent_Num WHERE (sd.DateEntered < ?) <> (se.DateEntered < ?)) AS samples_straddling_cutoff,
              (SELECT COUNT(*) FROM SamplingEvent WHERE DateEntered >= ?) AS events_kept
        `, [cutoff, cutoff, cutoff]);
        console.log(`Sanity  : samples without an event = ${orphans.samples_without_event}, samples whose own DateEntered disagrees with their event = ${orphans.samples_straddling_cutoff}, events kept (>= cutoff) = ${orphans.events_kept}`);
        console.log('');

        const allSteps = [...STEPS, ...OPTIONAL_STEPS];
        const plan = [];
        for (const step of allSteps) {
            const total = await countRows(connection, step.table);
            const toDelete = await countRows(connection, step.table, step.where, paramsFor(step));
            plan.push({ table: step.table, total, toDelete, remaining: total - toDelete });
        }
        const protectedCounts = [];
        for (const table of PROTECTED_TABLES) {
            protectedCounts.push({ table, total: await countRows(connection, table) });
        }

        console.log('Plan (children first):');
        console.log('  ' + 'table'.padEnd(30) + 'total'.padStart(7) + 'delete'.padStart(8) + 'keep'.padStart(6));
        for (const row of plan) {
            console.log('  ' + row.table.padEnd(30) + String(row.total).padStart(7) + String(row.toDelete).padStart(8) + String(row.remaining).padStart(6));
        }
        console.log('Untouched:');
        for (const row of protectedCounts) {
            console.log('  ' + row.table.padEnd(30) + String(row.total).padStart(7));
        }
        if (!includeLocations || !includePublications) {
            const locKept = await countRows(connection, 'Location', 'DateCreated < ?', [cutoff]);
            const pubKept = await countRows(connection, 'Publications', 'DateEntered < ?', [cutoff]);
            console.log(`Note: ${!includeLocations ? `${locKept} Location rows created before the cutoff are KEPT (add --include-locations to drop the unreferenced ones)` : ''}${!includeLocations && !includePublications ? '; ' : ''}${!includePublications ? `${pubKept} Publications rows entered before the cutoff are KEPT (add --include-publications)` : ''}.`);
        }
        console.log('');

        if (!execute) {
            console.log('Dry run complete. Re-run with --execute --backup=<fresh dump> to apply.');
            return;
        }

        const expectedRemaining = new Map(plan.map(row => [row.table, row.remaining]));
        const usersBefore = protectedCounts.find(row => row.table === 'users').total;

        await connection.beginTransaction();
        try {
            for (const step of allSteps) {
                const [result] = await connection.execute(
                    `DELETE FROM \`${step.table}\` WHERE ${step.where}`,
                    paramsFor(step)
                );
                const expected = plan.find(row => row.table === step.table).toDelete;
                console.log(`  deleted ${String(result.affectedRows).padStart(5)} from ${step.table}${result.affectedRows === expected ? '' : `  (expected ${expected}!)`}`);
                if (result.affectedRows !== expected) {
                    throw new Error(`${step.table}: deleted ${result.affectedRows} rows but the plan said ${expected}; rolling back.`);
                }
            }

            // Re-count everything inside the transaction before committing.
            for (const [table, remaining] of expectedRemaining) {
                const now = await countRows(connection, table);
                if (now !== remaining) {
                    throw new Error(`${table}: ${now} rows remain but ${remaining} were expected; rolling back.`);
                }
            }
            const usersAfter = await countRows(connection, 'users');
            if (usersAfter !== usersBefore) {
                throw new Error(`users changed from ${usersBefore} to ${usersAfter}; rolling back.`);
            }
            const leftovers = await countRows(connection, 'SamplingEvent', 'DateEntered < ?', [cutoff]);
            if (leftovers !== 0) {
                throw new Error(`${leftovers} SamplingEvent rows before the cutoff still present; rolling back.`);
            }

            await connection.commit();
            console.log('');
            console.log('COMMITTED. Post-state:');
            for (const [table, remaining] of expectedRemaining) {
                console.log('  ' + table.padEnd(30) + String(remaining).padStart(7));
            }
            console.log('  ' + 'users'.padEnd(30) + String(usersAfter).padStart(7) + '  (unchanged)');
        } catch (error) {
            await connection.rollback();
            console.error('');
            console.error('ROLLED BACK — nothing was changed:', error.message);
            process.exitCode = 1;
        }
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error('Purge failed before touching data:', error.message);
    process.exitCode = 1;
});
