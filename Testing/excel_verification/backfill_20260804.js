#!/usr/bin/env node
/**
 * One-shot backfill of Fatima's four never-saved sample chains
 * (SMP015 / SMP020 / SMP023 / SMP028) and repair of fields lost to the
 * form-capture and truthiness bugs fixed on 2026-08-04.
 *
 * Data source: SweetLab_Microplastics_Bulk_Upload_Template_7_30_26.xlsx,
 * interpreted per FINDINGS.md. Distribution rows come from
 * backfill_distributions.json (generated from the workbook).
 *
 * Usage (from the repo root):
 *   node Testing/excel_verification/backfill_20260804.js          # dry run
 *   node Testing/excel_verification/backfill_20260804.js --apply  # execute
 *
 * Runs in one transaction; refuses to run twice (guards on existing events
 * at the four locations). Take a backup first: node scripts/backup-database.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const DIST = require('./backfill_distributions.json');

const APPLY = process.argv.includes('--apply');
const FATIMA_USER_ID = 6;
const PCT_METHOD = '14'; // Methods_Ref: By_Count — matches all of Fatima's rows

// Weather: 1 Sunny, 2 Cloudy, 3 Raining. Units: 1 L, 2 g, 3 km2. Media: 1 water, 2 sediment/soil.
const CHAINS = [
    {
        sid: 'SMP015', loc: 102,
        event: {
            StartYear: 2022, StartMonth: 1, StartDay: 5, EndYear: 2022, EndMonth: 1, EndDay: 18,
            DeviceInstallationPeriod: 'yes', AirTemp_C: 18, Weather_Current: 1, SampleTime: '13:00:00'
        },
        sample: {
            MediaType_SelectID: 1, MediaSubType: 'river_stream',
            FragLargerThan5mm_Count: 30, Micro5mmAndSmaller_Count: 70,
            VolumeSampled: 50, WaterDepth: 8, SampleWaterDepth: 2.5, FlowVelocity: 0.5,
            SuspendedSolids: 3, Conductivity: 0.1, Turbidity: 0.4, DissolvedOxygen: 5,
            TotalSampleAmount: 10, SampleUnit_Num: 1,
            MicroplasticsSampleAmount: 3, MicroplasticsSampleUnit_Num: 2,
            FragmentsSampleAmount: 5, FragmentsSampleUnit_Num: 2,
            PackagingSampleAmount: 10, PackagingSampleUnit_Num: 1
        },
        mp: { Micro5mmAndSmaller_Count: 70, Mass_MP_Total: 3, Method_Polymer_Num: 4 },
        frag: { PurposeUnknown_Count: 30, Mass_Debris_Total: 5 }
    },
    {
        sid: 'SMP020', loc: 107,
        event: {
            StartYear: 2023, StartMonth: 3, StartDay: 14, DeviceInstallationPeriod: 'no',
            AirTemp_C: 12, Weather_Current: 2
        },
        sample: {
            MediaType_SelectID: 1, MediaSubType: 'wastewater_effluent',
            FragLargerThan5mm_Count: 20, Micro5mmAndSmaller_Count: 50,
            VolumeSampled: 10, WaterDepth: 1.2, SampleWaterDepth: 0.2, FlowVelocity: 0.5,
            SuspendedSolids: 0.3, Conductivity: 0.08, Turbidity: 2, DissolvedOxygen: 7.5,
            TotalSampleAmount: 1, SampleUnit_Num: 1,
            MicroplasticsSampleAmount: 3, MicroplasticsSampleUnit_Num: 2,
            FragmentsSampleAmount: 4, FragmentsSampleUnit_Num: 2,
            PackagingSampleAmount: 1, PackagingSampleUnit_Num: 1
        },
        mp: { Micro5mmAndSmaller_Count: 50, Mass_MP_Total: 3, Method_Polymer_Num: 4 },
        frag: { PurposeUnknown_Count: 20, Mass_Debris_Total: 4, Method_Polymer_Num: 4 }
    },
    {
        sid: 'SMP023', loc: 110,
        event: {
            StartYear: 2022, StartMonth: 9, StartDay: 6, DeviceInstallationPeriod: 'no',
            AirTemp_C: 27, Weather_Current: 1, SampleTime: '14:30:00'
        },
        sample: {
            MediaType_SelectID: 2, MediaSubType: 'river_stream',
            FragLargerThan5mm_Count: 4, Micro5mmAndSmaller_Count: 40,
            SoilTexture: 'Sandy loam', SamplingDepth: 0.05, SoilDryWeight: 100, SoilOrganicMatter: 2.8,
            TotalSampleAmount: 200, SampleUnit_Num: 2,
            MicroplasticsSampleAmount: 200, MicroplasticsSampleUnit_Num: 2,
            FragmentsSampleAmount: 200, FragmentsSampleUnit_Num: 2,
            PackagingSampleAmount: 200, PackagingSampleUnit_Num: 2
        },
        mp: { Micro5mmAndSmaller_Count: 40, Method_Polymer_Num: 4 },
        frag: { PurposeUnknown_Count: 4, Method_Polymer_Num: 4 }
    },
    {
        sid: 'SMP028', loc: 115,
        event: {
            StartYear: 2017, StartMonth: 2, StartDay: 1, DeviceInstallationPeriod: 'no',
            AirTemp_C: 28, Weather_Current: 1
        },
        sample: {
            MediaType_SelectID: 2, MediaSubType: 'sludge_wastewater',
            FragLargerThan5mm_Count: 25, Micro5mmAndSmaller_Count: 50,
            SamplingDepth: 0.1, SoilDryWeight: 50, SoilOrganicMatter: 60,
            TotalSampleAmount: 250, SampleUnit_Num: 2,
            MicroplasticsSampleAmount: 250, MicroplasticsSampleUnit_Num: 2,
            FragmentsSampleAmount: 250, FragmentsSampleUnit_Num: 2,
            PackagingSampleAmount: 250, PackagingSampleUnit_Num: 2
        },
        mp: { Micro5mmAndSmaller_Count: 50, Method_Polymer_Num: 4 },
        frag: { PurposeUnknown_Count: 25, Method_Polymer_Num: 4 }
    }
];

const DETAIL_SPECS = {
    mp_polymer: ['MicroplasticsPolymerDetails', 'MicroInSample_Num', 'PolymerID_Num', 'PolymerType_Legacy', 'Percentage', 'polymer', 'micro'],
    mp_form: ['MicroplasticsFormDetails', 'MicroInSample_Num', 'MicroShape_Num', 'MicroShape_Legacy', 'MicroShape_Percent', 'form', 'micro'],
    mp_color: ['MicroplasticsColorDetails', 'MicroInSample_Num', 'MicroColor_Num', 'MicroColor_Legacy', 'MicroColorPercent', 'color', 'micro'],
    mp_size: ['MicroplasticsSizeDetails', 'MicroInSample_Num', 'MicroSize_Num', 'MicroSize_Legacy', 'MicroSizePercent', 'size', 'micro'],
    mp_opacity: ['MicroplasticsOpacityDetails', 'MicroInSample_Num', 'MicroOpacity_Num', 'MicroOpacity_Legacy', 'MicroOpacityPercent', 'opacity', 'micro'],
    mp_texture: ['MicroplasticsFormDetails', 'MicroInSample_Num', 'MicroTexture_Num', 'MicroTexture_Legacy', 'MicroTexture_Percent', 'form', 'micro'],
    fr_purpose: ['FragmentsPurposes', 'FragInSample_Num', 'Purpose_Num', 'Purpose_Legacy', 'Percent_Purpose', 'purpose', 'frag'],
    fr_polymer: ['FragmentsPolymerDetails', 'FragInSample_Num', 'PolymerID_Num', 'PolymerType_Legacy', 'Percentage', 'polymer', 'frag'],
    fr_texture: ['FragmentsFormDetails', 'FragInSample_Num', 'FragForm_Num', 'FragForm_Legacy', 'FragFormPercent', 'form', 'frag'],
    fr_color: ['FragmentsColorDetails', 'FragInSample_Num', 'FragColor_Num', 'FragColor_Legacy', 'FragColorPercent', 'color', 'frag'],
    fr_opacity: ['FragmentsOpacityDetails', 'FragInSample_Num', 'FragOpacity_Num', 'FragOpacity_Legacy', 'FragOpacityPercent', 'opacity', 'frag']
};

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        charset: 'utf8mb4'
    });

    const statements = [];
    const queue = (sql, params, label) => statements.push({ sql, params, label });

    try {
        // Guard: refuse to run if any of the four locations already has an event.
        const [existing] = await connection.execute(
            'SELECT LocationID_Num, COUNT(*) AS n FROM SamplingEvent WHERE LocationID_Num IN (102, 107, 110, 115) GROUP BY LocationID_Num'
        );
        if (existing.length > 0) {
            throw new Error(`Backfill already ran? Events exist at locations: ${existing.map(r => r.LocationID_Num).join(', ')}`);
        }

        const refMaps = {};
        for (const [kind, sql] of [
            ['polymer', 'SELECT PolymerUniqueID AS id, Polymer_Code AS code FROM PolymerType_Ref'],
            ['form', 'SELECT FormUniqueID AS id, Form_Name AS code FROM Form_Ref'],
            ['color', 'SELECT ColorUniqueID AS id, Color_Code AS code FROM ColorType_Ref'],
            ['size', 'SELECT SizeUniqueID AS id, Size_Code AS code FROM SizeClass_Ref'],
            ['opacity', 'SELECT OpacityUniqueID AS id, Opacity_Code AS code FROM Opacity_Ref'],
            ['purpose', 'SELECT PurposeUniqueID AS id, Purpose_Code AS code FROM Purpose_Ref']
        ]) {
            const [rows] = await connection.execute(sql);
            refMaps[kind] = new Map(rows.map(r => [String(r.code).trim().toLowerCase(), r.id]));
        }

        const nextId = async (table, column) => {
            const [rows] = await connection.execute(`SELECT COALESCE(MAX(\`${column}\`), 0) + 1 AS next FROM \`${table}\``);
            return rows[0].next;
        };
        const insertMap = (table, mapping, label) => {
            const keys = Object.keys(mapping);
            queue(
                `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
                keys.map(k => mapping[k]),
                label
            );
        };
        const updateMap = (table, sets, whereColumn, whereValue, label) => {
            const keys = Object.keys(sets);
            queue(
                `UPDATE \`${table}\` SET ${keys.map(k => `\`${k}\` = ?`).join(', ')} WHERE \`${whereColumn}\` = ?`,
                [...keys.map(k => sets[k]), whereValue],
                label
            );
        };

        // ---- A. insert the four chains -----------------------------------
        let eventId = await nextId('SamplingEvent', 'SamplingEventUniqueID');
        let sampleId = await nextId('SampleDetails', 'SampleUniqueID');
        let microId = await nextId('MicroplasticsInSample', 'Micro_UniqueID');
        let fragId = await nextId('FragmentsInSample', 'Fragment_UniqueID');

        for (const chain of CHAINS) {
            insertMap('SamplingEvent',
                { SamplingEventUniqueID: eventId, LocationID_Num: chain.loc, UserSamplingID: FATIMA_USER_ID, ...chain.event },
                `${chain.sid}: sampling event #${eventId} (loc ${chain.loc})`);
            insertMap('SampleDetails',
                { SampleUniqueID: sampleId, SamplingEvent_Num: eventId, ...chain.sample },
                `${chain.sid}: sample details #${sampleId}`);
            insertMap('MicroplasticsInSample',
                { Micro_UniqueID: microId, SampleDetails_Num: sampleId, ...chain.mp },
                `${chain.sid}: microplastics summary #${microId}`);
            insertMap('FragmentsInSample',
                { Fragment_UniqueID: fragId, SampleDetails_Num: sampleId, ...chain.frag },
                `${chain.sid}: fragments summary #${fragId}`);

            for (const [key, [table, parentCol, refCol, legacyCol, pctCol, refKind, parentKind]] of Object.entries(DETAIL_SPECS)) {
                const rows = (DIST[key] && DIST[key][chain.sid]) || [];
                const parentId = parentKind === 'micro' ? microId : fragId;
                for (const [code, pct] of rows) {
                    const refId = refMaps[refKind].get(String(code).trim().toLowerCase());
                    if (!refId) throw new Error(`No ${refKind} reference ID for code ${code} (${chain.sid})`);
                    insertMap(table,
                        { [parentCol]: parentId, [refCol]: refId, [legacyCol]: code, [pctCol]: pct, Method_PercentEstimate: PCT_METHOD },
                        `${chain.sid}: ${key} ${code} = ${pct}%`);
                }
            }
            eventId += 1; sampleId += 1; microId += 1; fragId += 1;
        }

        // ---- B. repairs on existing rows ---------------------------------
        updateMap('SamplingEvent', { StartYear: 2022 }, 'SamplingEventUniqueID', 185,
            'EVT017: year 2025 -> 2022 (Excel: 2022-02-13)');
        for (const [id, name] of [[186, 'EVT018'], [188, 'EVT021'], [193, 'EVT027']]) {
            updateMap('SamplingEvent', { StartDay: 1 }, 'SamplingEventUniqueID', id, `${name}: add missing day (=1)`);
        }
        updateMap('SamplingEvent', { AirTemp_C: 23, Weather_Current: 3, Rainfall_cm_Precedent24: 2.5 },
            'SamplingEventUniqueID', 184, 'EVT016: 23C, Raining, 2.5cm rainfall');
        updateMap('SamplingEvent', { AirTemp_C: 25, Weather_Current: 2 }, 'SamplingEventUniqueID', 185,
            'EVT017: 25C, Cloudy');
        updateMap('SamplingEvent', { AirTemp_C: 10, Weather_Current: 1 }, 'SamplingEventUniqueID', 191,
            'EVT025: 10C, Sunny');

        const NEUSTON = 'Samples collected from a boat using a 333-µm mesh neuston net. Sampling duration ranged form 15-30 min';
        for (let id = 170; id <= 178; id += 1) {
            updateMap('SamplingEvent', { SamplerNames: NEUSTON }, 'SamplingEventUniqueID', id,
                `EVT${String(id - 168).padStart(3, '0')}: event description`);
        }
        for (const id of [179, 180, 181]) {
            updateMap('SamplingEvent', { SamplerNames: 'Samples collected with Manta Trawl' }, 'SamplingEventUniqueID', id,
                `EVT${String(id - 168).padStart(3, '0')}: event description`);
        }

        const AREA_NOTE = 'surface area sampled was calculated using the net width and tow length';
        for (const id of [183, 184, 185]) {
            updateMap('SampleDetails', { MediaAdditionalNotes: AREA_NOTE }, 'SampleUniqueID', id,
                `SMP${String(id - 172).padStart(3, '0')}: sample notes`);
        }

        updateMap('MicroplasticsInSample', { Method_Polymer_Num: 4 }, 'Micro_UniqueID', 129,
            'SMP009: polymer method FTIR');

        updateMap('SampleDetails', { SamplingDepth: 0.05, SoilDryWeight: 85, SoilOrganicMatter: 8.5, SoilTexture: 'Silt loam' },
            'SampleUniqueID', 194, 'SMP024: sediment fields lost to capture bug');
        updateMap('SampleDetails', { SamplingDepth: 0.07, SoilDryWeight: 100, SoilOrganicMatter: 4.2, SoilTexture: 'Silty clay loam' },
            'SampleUniqueID', 195, 'SMP025: sediment fields ("Sily clay loam" -> Silty clay loam)');
        updateMap('SampleDetails', { SamplingDepth: 0.1, SoilDryWeight: 100, SoilOrganicMatter: 0.8, SoilTexture: 'Sand' },
            'SampleUniqueID', 196, 'SMP026: sediment fields');
        updateMap('SampleDetails', { SamplingDepth: 0.2, SoilDryWeight: 100, SoilOrganicMatter: 20 },
            'SampleUniqueID', 198, 'SMP029: sediment fields');
        updateMap('SampleDetails', { SoilTexture: 'Loam' }, 'SampleUniqueID', 199,
            'SMP030: soil texture ref id "6" -> label Loam');

        updateMap('SampleDetails',
            { WaterDepth: 0, SampleWaterDepth: 0, FlowVelocity: 0, Conductivity: 0, Turbidity: 0, DissolvedOxygen: 0 },
            'SampleUniqueID', 191, 'SMP019: restore zero-valued water metrics');

        const AMOUNTS = [
            [187, 'SMP014', { TotalSampleAmount: 20, MicroplasticsSampleAmount: 1, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 2, FragmentsSampleUnit_Num: 2 }],
            [188, 'SMP016', { MicroplasticsSampleAmount: 5, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 6, FragmentsSampleUnit_Num: 2 }],
            [189, 'SMP017', { TotalSampleAmount: 0.5, SampleUnit_Num: 1, MicroplasticsSampleAmount: 0.8, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 1, FragmentsSampleUnit_Num: 2 }],
            [190, 'SMP018', { MicroplasticsSampleAmount: 4, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 5, FragmentsSampleUnit_Num: 2 }],
            [191, 'SMP019', { MicroplasticsSampleAmount: 1, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 2, FragmentsSampleUnit_Num: 2 }],
            [192, 'SMP021', { MicroplasticsSampleAmount: 2, MicroplasticsSampleUnit_Num: 2 }],
            [193, 'SMP022', { MicroplasticsSampleAmount: 0.5, MicroplasticsSampleUnit_Num: 2 }],
            [195, 'SMP025', { MicroplasticsSampleAmount: 3, MicroplasticsSampleUnit_Num: 2 }],
            [197, 'SMP027', { MicroplasticsSampleAmount: 2, MicroplasticsSampleUnit_Num: 2, FragmentsSampleAmount: 3, FragmentsSampleUnit_Num: 2 }],
            [200, 'SMP031', { FragmentsSampleAmount: 10, FragmentsSampleUnit_Num: 2 }]
        ];
        for (const [id, name, sets] of AMOUNTS) {
            updateMap('SampleDetails', sets, 'SampleUniqueID', id, `${name}: separate MP/fragment amounts`);
        }

        for (const [id, name] of [[175, 'SMP003'], [176, 'SMP004'], [177, 'SMP005'], [179, 'SMP007'],
                                  [180, 'SMP008'], [181, 'SMP009'], [182, 'SMP010'], [192, 'SMP021']]) {
            updateMap('SampleDetails', { FragLargerThan5mm_Count: 0 }, 'SampleUniqueID', id,
                `${name}: fragment count 0 (was NULL; Excel documents 0)`);
        }

        // ---- execute ------------------------------------------------------
        console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${statements.length} statements\n`);
        if (!APPLY) {
            for (const s of statements) {
                console.log(`-- ${s.label}\n   ${s.sql}\n   ${JSON.stringify(s.params)}`);
            }
            console.log('\nDry run only. Re-run with --apply to execute.');
            return;
        }

        await connection.beginTransaction();
        for (const s of statements) {
            const [result] = await connection.execute(s.sql, s.params);
            if (result.affectedRows !== 1) {
                throw new Error(`${s.label}: affected ${result.affectedRows} rows, expected 1`);
            }
            console.log(`ok  ${s.label}`);
        }
        await connection.commit();
        console.log(`\nCOMMITTED ${statements.length} statements.`);
    } catch (error) {
        try { await connection.rollback(); } catch (_) { /* no open transaction */ }
        console.error(`\nFAILED (rolled back): ${error.message}`);
        process.exitCode = 1;
    } finally {
        await connection.end();
    }
}

main();
