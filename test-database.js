// Database Test Script - 5 Test Cases for Form Data Submission
const { pool } = require('./config/database');
const { formatPartialDate } = require('./public/js/partial-date-utils');

async function runTests() {
    console.log('=== Database Testing Script ===\n');

    try {
        // Check admin user
        const [users] = await pool.execute("SELECT User_UniqueID, username, email FROM users WHERE username='admin'");
        if (users.length === 0) {
            console.log('❌ Admin user not found!');
            return;
        }
        console.log('✅ Admin user found:', users[0]);
        const adminId = users[0].User_UniqueID;
        const adminUsername = users[0].username;

        // Check existing locations
        console.log('\n--- Existing Locations ---');
        const [locations] = await pool.execute("SELECT Loc_UniqueID, LocationName, UserCreated FROM Location WHERE UserCreated = ? LIMIT 5", [adminUsername]);
        console.log('Admin locations:', locations);

        // Check existing sample data
        console.log('\n--- Existing Sample Data ---');
        const [samples] = await pool.execute(`
            SELECT
                sd.SampleUniqueID,
                se.StartYear,
                se.StartMonth,
                se.StartDay,
                l.LocationName,
                mt.MediaTypeOverall as MediaType,
                sd.Micro5mmAndSmaller_Count as Microplastics,
                sd.FragLargerThan5mm_Count as FragmentDebris,
                f.PurposeKnown_Count as PurposeKnown,
                f.PurposeUnknown_Count as PurposeUnknown
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            LEFT JOIN FragmentsInSample f ON f.SampleDetails_Num = sd.SampleUniqueID
            WHERE se.UserSamplingID = ?
            ORDER BY sd.SampleUniqueID DESC
            LIMIT 10
        `, [adminId]);

        if (samples.length > 0) {
            console.log('Recent samples by admin:');
            samples.forEach(s => {
                const dateDisplay = formatPartialDate({
                    year: s.StartYear,
                    month: s.StartMonth,
                    day: s.StartDay
                });
                console.log(`  - ID ${s.SampleUniqueID}: ${s.LocationName || 'N/A'} on ${dateDisplay} | ${s.MediaType || 'N/A'} | MP:${s.Microplastics || 0} Debris:${s.FragmentDebris || 0} (known:${s.PurposeKnown || 0}, unknown:${s.PurposeUnknown || 0})`);
            });
        } else {
            console.log('No samples found for admin user');
        }

        // Check counts in main tables
        console.log('\n--- Table Row Counts ---');
        const tables = ['Location', 'SamplingEvent', 'SampleDetails', 'MicroplasticsInSample', 'FragmentsInSample', 'FragmentsPurposes', 'Units_Ref'];
        for (const table of tables) {
            const [count] = await pool.execute(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`  ${table}: ${count[0].count} rows`);
        }

        const [unitForeignKeys] = await pool.execute(`
            SELECT COUNT(*) AS count
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'SampleDetails'
              AND REFERENCED_TABLE_NAME = 'Units_Ref'
        `);
        console.log(`  SampleDetails → Units_Ref foreign keys: ${unitForeignKeys[0].count}`);

        // Check microplastics details
        console.log('\n--- Microplastics Details ---');
        const [microDetails] = await pool.execute(`
            SELECT m.*, sd.SampleUniqueID
            FROM MicroplasticsInSample m
            JOIN SampleDetails sd ON m.SampleDetails_Num = sd.SampleUniqueID
            ORDER BY m.Micro_UniqueID DESC
            LIMIT 3
        `);
        if (microDetails.length > 0) {
            microDetails.forEach(m => {
                console.log(`  Sample ${m.SampleDetails_Num}: Size<1um:${m['PercentSize_LessThan1um']}% | Fiber:${m.PercentForm_fiber}% Pellet:${m.PercentForm_Pellet}% Fragment:${m.PercentForm_Fragment}%`);
            });
        }

        // Check normalized fragment purpose details
        console.log('\n--- Fragment Purpose Details ---');
        const [purposeDetails] = await pool.execute(`
            SELECT * FROM FragmentsPurposes
            ORDER BY FragPurposeUniqueID DESC
            LIMIT 5
        `);
        if (purposeDetails.length > 0) {
            purposeDetails.forEach(p => {
                console.log(`  Fragment ${p.FragInSample_Num}: ${p.Purpose_Legacy} - ${p.Percent_Purpose}%`);
            });
        }

        console.log('\n=== Test Complete ===');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await pool.end();
    }
}

runTests();
