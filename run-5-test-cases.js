// 5 Test Cases for Form Data Submission - Admin User
const { pool } = require('./config/database');

// Test case data - 5 different scenarios
const testCases = [
    {
        name: "Test Case 1: Water Sample with Microplastics",
        locationData: {
            locationName: 'TC1_Water_Location',
            locationShortCode: 'TC1-W',
            locationDescription: 'Test Case 1 - Water sample location',
            latitude: 42.3314,
            longitude: -83.0458,
            city: 'Detroit',
            state: 'MI',
            country: 'USA',
            zipCode: '48226'
        },
        formData: {
            device_installation_period: 'no',
            start_year: 2026,
            start_month: 2,
            start_day: 3,
            media_type: 'water',
            water_type: 'River',
            environment_type: 'River',
            air_temp: 15.5,
            microplastics_count: 50,
            fragments_count: 25,
            packaging_count: 10,
            has_quantitative_data: 'yes',
            // Microplastics size percentages (must sum to 100)
            mp_size_lt_1um: 10,
            mp_size_1_20um: 20,
            mp_size_20_100um: 30,
            mp_size_100um_1mm: 25,
            mp_size_1_5mm: 15,
            // Microplastics form percentages (must sum to 100)
            mp_form_fiber: 40,
            mp_form_pellet: 30,
            mp_form_fragment: 30,
            // Color percentages (must sum to 100)
            fragment_color_clear: 25,
            fragment_color_opaque_light: 25,
            fragment_color_opaque_dark: 25,
            fragment_color_mixed: 25,
            // Packaging details
            packaging_count_single_use: 6,
            packaging_count_multi_use: 4,
            single_use_recycle_1: 2,
            single_use_recycle_2: 2,
            single_use_recycle_5: 2,
            multi_use_recycle_1: 2,
            multi_use_recycle_2: 2
        }
    },
    {
        name: "Test Case 2: Soil/Sediment Sample",
        locationData: {
            locationName: 'TC2_Sediment_Location',
            locationShortCode: 'TC2-S',
            locationDescription: 'Test Case 2 - Sediment sample location',
            latitude: 42.3401,
            longitude: -82.9849,
            city: 'Detroit',
            state: 'MI',
            country: 'USA',
            zipCode: '48207'
        },
        formData: {
            device_installation_period: 'no',
            start_year: 2026,
            start_month: 2,
            start_day: 3,
            media_type: 'soil_sediment',
            sediment_type: 'Lake sediment',
            air_temp: 8.0,
            soil_moisture: 35.5,
            microplastics_count: 75,
            fragments_count: 40,
            packaging_count: 5,
            has_quantitative_data: 'yes',
            mp_size_lt_1um: 5,
            mp_size_1_20um: 15,
            mp_size_20_100um: 40,
            mp_size_100um_1mm: 30,
            mp_size_1_5mm: 10,
            mp_form_fiber: 60,
            mp_form_pellet: 20,
            mp_form_fragment: 20,
            fragment_color_clear: 40,
            fragment_color_opaque_light: 30,
            fragment_color_opaque_dark: 20,
            fragment_color_mixed: 10
        }
    },
    {
        name: "Test Case 3: High Fragment Count Sample",
        locationData: {
            locationName: 'TC3_Fragment_Location',
            locationShortCode: 'TC3-F',
            locationDescription: 'Test Case 3 - High fragment count',
            latitude: 42.3298,
            longitude: -83.0365,
            city: 'Detroit',
            state: 'MI',
            country: 'USA',
            zipCode: '48226'
        },
        formData: {
            device_installation_period: 'no',
            start_year: 2026,
            start_month: 2,
            start_day: 3,
            media_type: 'water',
            water_type: 'Stream',
            environment_type: 'Stream',
            microplastics_count: 20,
            fragments_count: 150,
            packaging_count: 30,
            has_quantitative_data: 'yes',
            mp_size_lt_1um: 25,
            mp_size_1_20um: 25,
            mp_size_20_100um: 25,
            mp_size_100um_1mm: 15,
            mp_size_1_5mm: 10,
            mp_form_fiber: 33,
            mp_form_pellet: 33,
            mp_form_fragment: 34,
            // Fragment form percentages (must sum to 100)
            fragment_form_fiber: 10,
            fragment_form_pellet: 5,
            fragment_form_film: 25,
            fragment_form_foam: 20,
            fragment_form_hardplastic: 30,
            fragment_form_other: 10,
            fragment_color_clear: 20,
            fragment_color_opaque_light: 40,
            fragment_color_opaque_dark: 30,
            fragment_color_mixed: 10
        }
    },
    {
        name: "Test Case 4: Packaging-Heavy Sample with All Categories",
        locationData: {
            locationName: 'TC4_Packaging_Location',
            locationShortCode: 'TC4-P',
            locationDescription: 'Test Case 4 - Packaging heavy sample',
            latitude: 42.3481,
            longitude: -83.0401,
            city: 'Detroit',
            state: 'MI',
            country: 'USA',
            zipCode: '48207'
        },
        formData: {
            device_installation_period: 'no',
            start_year: 2026,
            start_month: 2,
            start_day: 3,
            media_type: 'soil_litter',
            microplastics_count: 10,
            fragments_count: 20,
            packaging_count: 100,
            has_quantitative_data: 'yes',
            mp_size_lt_1um: 50,
            mp_size_1_20um: 20,
            mp_size_20_100um: 15,
            mp_size_100um_1mm: 10,
            mp_size_1_5mm: 5,
            mp_form_fiber: 70,
            mp_form_pellet: 15,
            mp_form_fragment: 15,
            fragment_color_clear: 30,
            fragment_color_opaque_light: 30,
            fragment_color_opaque_dark: 20,
            fragment_color_mixed: 20,
        }
    },
    {
        name: "Test Case 5: Mixed/Composite Media Sample",
        locationData: {
            locationName: 'TC5_Mixed_Location',
            locationShortCode: 'TC5-M',
            locationDescription: 'Test Case 5 - Mixed composite sample',
            latitude: 42.3350,
            longitude: -83.0500,
            city: 'Detroit',
            state: 'MI',
            country: 'USA',
            zipCode: '48201'
        },
        formData: {
            device_installation_period: 'no',
            start_year: 2026,
            start_month: 2,
            start_day: 3,
            media_type: 'mixed_composite',
            mixed_media_description: 'Water and sediment composite sample',
            air_temp: 12.0,
            microplastics_count: 200,
            fragments_count: 80,
            packaging_count: 45,
            has_quantitative_data: 'yes',
            mp_size_lt_1um: 15,
            mp_size_1_20um: 25,
            mp_size_20_100um: 25,
            mp_size_100um_1mm: 20,
            mp_size_1_5mm: 15,
            mp_form_fiber: 45,
            mp_form_pellet: 25,
            mp_form_fragment: 30,
            fragment_color_clear: 35,
            fragment_color_opaque_light: 30,
            fragment_color_opaque_dark: 20,
            fragment_color_mixed: 15,
            // Polymer percentages for microplastics (must sum to 100)
            mp_polymer_pete: 25,
            mp_polymer_hdpe: 20,
            mp_polymer_pp: 25,
            mp_polymer_ps: 15,
            mp_polymer_other: 15
        }
    }
];

async function runTestCases() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     5 Test Cases - Form Data Submission Validation          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const connection = await pool.getConnection();

    try {
        // Get admin user ID
        const [users] = await connection.execute(
            "SELECT User_UniqueID, username FROM users WHERE username='admin'"
        );
        if (users.length === 0) {
            throw new Error('Admin user not found!');
        }
        const adminId = users[0].User_UniqueID;
        const adminUsername = users[0].username;
        console.log(`Admin user: ${adminUsername} (ID: ${adminId})\n`);

        let passedTests = 0;
        let failedTests = 0;

        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            console.log(`\n${'─'.repeat(60)}`);
            console.log(`📋 ${tc.name}`);
            console.log(`${'─'.repeat(60)}`);

            await connection.beginTransaction();

            try {
                // Step 1: Create Location
                console.log('  [1] Creating location...');
                const [locResult] = await connection.execute(`
                    INSERT INTO Location (
                        UserLocID_txt, LocationName, Location_Desc,
                        \`Lat_DecimalDegree\`, \`Long_DecimalDegree\`,
                        City, State, Country, ZipCode,
                        \`Env_Indoor_SelectID\`, UserCreated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                `, [
                    tc.locationData.locationShortCode,
                    tc.locationData.locationName,
                    tc.locationData.locationDescription,
                    tc.locationData.latitude,
                    tc.locationData.longitude,
                    tc.locationData.city,
                    tc.locationData.state,
                    tc.locationData.country,
                    tc.locationData.zipCode ? parseInt(tc.locationData.zipCode) : null,
                    adminUsername
                ]);
                const locationId = locResult.insertId;
                console.log(`      ✓ Location created: ID ${locationId}`);

                // Step 2: Create SamplingEvent
                console.log('  [2] Creating sampling event...');
                const [maxEventId] = await connection.execute(
                    'SELECT MAX(SamplingEventUniqueID) as maxId FROM SamplingEvent'
                );
                const samplingEventId = (maxEventId[0].maxId || 0) + 1;

                await connection.execute(`
                    INSERT INTO SamplingEvent (
                        SamplingEventUniqueID, LocationID_Num,
                        StartYear, StartMonth, StartDay,
                        UserSamplingID, \`AirTemp_C\`, DeviceInstallationPeriod
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'no')
                `, [
                    samplingEventId,
                    locationId,
                    tc.formData.start_year,
                    tc.formData.start_month,
                    tc.formData.start_day,
                    adminId,
                    tc.formData.air_temp || null
                ]);
                console.log(`      ✓ Sampling Event created: ID ${samplingEventId}`);

                // Step 3: Create SampleDetails
                console.log('  [3] Creating sample details...');
                const [maxSampleId] = await connection.execute(
                    'SELECT MAX(SampleUniqueID) as maxId FROM SampleDetails'
                );
                const sampleId = (maxSampleId[0].maxId || 0) + 1;

                // Get media type ID
                const mediaTypeMapping = {
                    'water': 1, 'soil_sediment': 2, 'in_soil': 2,
                    'soil_litter': 3, 'mixed_composite': 4
                };
                const mediaTypeId = mediaTypeMapping[tc.formData.media_type] || 1;

                await connection.execute(`
                    INSERT INTO SampleDetails (
                        SampleUniqueID, SamplingEvent_Num, MediaType_SelectID,
                        FragLargerThan5mm_Count, Micro5mmAndSmaller_Count,
                        \`SoilMoisture_Percent\`, MixedMediaDescription
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    sampleId,
                    samplingEventId,
                    mediaTypeId,
                    (tc.formData.fragments_count || 0) + (tc.formData.packaging_count || 0),
                    tc.formData.microplastics_count || null,
                    tc.formData.soil_moisture || null,
                    tc.formData.mixed_media_description || null
                ]);
                console.log(`      ✓ Sample Details created: ID ${sampleId}`);

                // Step 4: Create MicroplasticsInSample if has microplastics
                if (tc.formData.microplastics_count && tc.formData.microplastics_count > 0) {
                    console.log('  [4] Creating microplastics details...');
                    const [maxMicroId] = await connection.execute(
                        'SELECT MAX(Micro_UniqueID) as maxId FROM MicroplasticsInSample'
                    );
                    const microId = (maxMicroId[0].maxId || 0) + 1;

                    await connection.execute(`
                        INSERT INTO MicroplasticsInSample (
                            Micro_UniqueID, SampleDetails_Num,
                            \`PercentSize_LessThan1um\`, \`PercentSize_1_20um\`,
                            \`PercentSize_20_100um\`, \`PercentSize_100um_1mm\`, \`PercentSize_1_5mm\`,
                            PercentForm_fiber, PercentForm_Pellet, PercentForm_Fragment,
                            PercentColor_Clear, PercentColor_OpaqueLight, PercentColor_OpaqueDark, PercentColor_Mixed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        microId, sampleId,
                        tc.formData.mp_size_lt_1um || null,
                        tc.formData.mp_size_1_20um || null,
                        tc.formData.mp_size_20_100um || null,
                        tc.formData.mp_size_100um_1mm || null,
                        tc.formData.mp_size_1_5mm || null,
                        tc.formData.mp_form_fiber || null,
                        tc.formData.mp_form_pellet || null,
                        tc.formData.mp_form_fragment || null,
                        tc.formData.fragment_color_clear || null,
                        tc.formData.fragment_color_opaque_light || null,
                        tc.formData.fragment_color_opaque_dark || null,
                        tc.formData.fragment_color_mixed || null
                    ]);
                    console.log(`      ✓ Microplastics Details created: ID ${microId}`);
                }

                // Step 5: Create FragmentsInSample if there is any fragment debris
                if ((tc.formData.fragments_count && tc.formData.fragments_count > 0) ||
                    (tc.formData.packaging_count && tc.formData.packaging_count > 0)) {
                    console.log('  [5] Creating fragments details...');
                    const [maxFragId] = await connection.execute(
                        'SELECT MAX(Fragment_UniqueID) as maxId FROM FragmentsInSample'
                    );
                    const fragmentId = (maxFragId[0].maxId || 0) + 1;

                    await connection.execute(`
                        INSERT INTO FragmentsInSample (
                            Fragment_UniqueID, SampleDetails_Num,
                            PurposeKnown_Count, PurposeUnknown_Count,
                            PercentColor_Clear, \`PercentColor_Op_Color\`, \`PercentColor_Op_Dk\`, PercentColor_Mixed,
                            PercentForm_Fiber, PercentForm_Pellet, PercentForm_Film,
                            PercentForm_Foam, PercentForm_HardPlastic, PercentForm_Other
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        fragmentId, sampleId,
                        tc.formData.packaging_count || null,
                        tc.formData.fragments_count || null,
                        tc.formData.fragment_color_clear || null,
                        tc.formData.fragment_color_opaque_light || null,
                        tc.formData.fragment_color_opaque_dark || null,
                        tc.formData.fragment_color_mixed || null,
                        tc.formData.fragment_form_fiber || null,
                        tc.formData.fragment_form_pellet || null,
                        tc.formData.fragment_form_film || null,
                        tc.formData.fragment_form_foam || null,
                        tc.formData.fragment_form_hardplastic || null,
                        tc.formData.fragment_form_other || null
                    ]);
                    console.log(`      ✓ Fragments Details created: ID ${fragmentId}`);
                }

                await connection.commit();

                // Verification - Read back data
                console.log('\n  📊 Verification - Reading back saved data:');

                const [savedSample] = await connection.execute(`
                    SELECT
                        sd.SampleUniqueID,
                        l.LocationName,
                        se.StartYear,
                        se.StartMonth,
                        se.StartDay,
                        mt.MediaTypeOverall as MediaType,
                        sd.Micro5mmAndSmaller_Count as MP_Count,
                        sd.FragLargerThan5mm_Count as Debris_Count,
                        f.PurposeKnown_Count as PurposeKnown_Count,
                        f.PurposeUnknown_Count as PurposeUnknown_Count
                    FROM SampleDetails sd
                    JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
                    JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
                    LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
                    LEFT JOIN FragmentsInSample f ON f.SampleDetails_Num = sd.SampleUniqueID
                    WHERE sd.SampleUniqueID = ?
                `, [sampleId]);

                if (savedSample.length > 0) {
                    const s = savedSample[0];
                    console.log(`      Location: ${s.LocationName}`);
                    const samplingDate = [s.StartYear, s.StartMonth, s.StartDay]
                        .filter(value => value !== null && value !== undefined)
                        .join('-');
                    console.log(`      Date: ${samplingDate}`);
                    console.log(`      Media Type: ${s.MediaType}`);
                    console.log(`      Counts - MP: ${s.MP_Count}, Debris: ${s.Debris_Count} (known: ${s.PurposeKnown_Count}, unknown: ${s.PurposeUnknown_Count})`);

                    // Verify values match input
                    const mpMatch = s.MP_Count === tc.formData.microplastics_count;
                    const debrisMatch = s.Debris_Count === tc.formData.fragments_count + tc.formData.packaging_count;
                    const fragMatch = s.PurposeUnknown_Count === tc.formData.fragments_count;
                    const pkgMatch = s.PurposeKnown_Count === tc.formData.packaging_count;

                    if (mpMatch && debrisMatch && fragMatch && pkgMatch) {
                        console.log('\n  ✅ TEST PASSED - All values correctly stored!');
                        passedTests++;
                    } else {
                        console.log('\n  ❌ TEST FAILED - Values mismatch!');
                        console.log(`      Expected MP: ${tc.formData.microplastics_count}, Got: ${s.MP_Count}`);
                        console.log(`      Expected Debris: ${tc.formData.fragments_count + tc.formData.packaging_count}, Got: ${s.Debris_Count}`);
                        console.log(`      Expected Purpose Unknown: ${tc.formData.fragments_count}, Got: ${s.PurposeUnknown_Count}`);
                        console.log(`      Expected Purpose Known: ${tc.formData.packaging_count}, Got: ${s.PurposeKnown_Count}`);
                        failedTests++;
                    }
                }

            } catch (error) {
                await connection.rollback();
                console.log(`\n  ❌ TEST FAILED - Error: ${error.message}`);
                failedTests++;
            }
        }

        // Final Summary
        console.log(`\n${'═'.repeat(60)}`);
        console.log('                    TEST SUMMARY');
        console.log(`${'═'.repeat(60)}`);
        console.log(`  Total Tests: ${testCases.length}`);
        console.log(`  ✅ Passed: ${passedTests}`);
        console.log(`  ❌ Failed: ${failedTests}`);
        console.log(`${'═'.repeat(60)}\n`);

        // Show final database state
        console.log('Final Database State:');
        const tables = ['Location', 'SamplingEvent', 'SampleDetails', 'MicroplasticsInSample', 'FragmentsInSample', 'FragmentsPurposes'];
        for (const table of tables) {
            const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`  ${table}: ${count[0].count} rows`);
        }

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        connection.release();
        await pool.end();
    }
}

runTestCases();
