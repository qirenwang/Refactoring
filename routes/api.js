const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getGeocodingServiceConfig() {
    return {
        baseUrl: process.env.GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org/search',
        userAgent: process.env.GEOCODING_USER_AGENT || 'GLPF-Microplastics-Data-Entry/1.0',
        contactEmail: process.env.GEOCODING_CONTACT_EMAIL || ''
    };
}

function parseBoundingBox(boundingBox) {
    if (!Array.isArray(boundingBox) || boundingBox.length !== 4) {
        return null;
    }

    const parsed = boundingBox.map(value => parseFloat(value));
    if (parsed.some(value => Number.isNaN(value))) {
        return null;
    }

    return parsed;
}

// Function to validate percentage groups sum to 100%
function validatePercentageGroups(formData) {
    const percentageGroups = {
        // Microplastics size percentages
        mp_size: [
            'mp_size_lt_1um',
            'mp_size_1_20um',
            'mp_size_20_100um',
            'mp_size_100um_1mm',
            'mp_size_1_5mm'
        ],
        // Microplastics color percentages
        mp_color: [
            'mp_color_clear',
            'mp_color_opaque_light',
            'mp_color_opaque_dark',
            'mp_color_mixed'
        ],
        // Microplastics form percentages
        mp_form: [
            'mp_form_fiber',
            'mp_form_pellet',
            'mp_form_fragment'
        ],
        // Microplastics polymer percentages
        mp_polymer: [
            'mp_polymer_pete', 'mp_polymer_hdpe', 'mp_polymer_pvc', 'mp_polymer_ldpe',
            'mp_polymer_pp', 'mp_polymer_ps', 'mp_polymer_pa', 'mp_polymer_pc',
            'mp_polymer_pla', 'mp_polymer_abs', 'mp_polymer_eva', 'mp_polymer_pb',
            'mp_polymer_pe_uhmw', 'mp_polymer_pmma', 'mp_polymer_hips', 'mp_polymer_eps',
            'mp_polymer_pan', 'mp_polymer_rubber', 'mp_polymer_bitumen', 'mp_polymer_other'
        ],
        // Fragments form percentages
        fragment_color: [
            'fragment_color_clear',
            'fragment_color_opaque_light',
            'fragment_color_opaque_dark',
            'fragment_color_mixed'
        ],
        // Fragments form percentages
        fragment_form: [
            'fragment_form_fiber',
            'fragment_form_pellet',
            'fragment_form_film',
            'fragment_form_foam',
            'fragment_form_hardplastic',
            'fragment_form_other'
        ],
        // Fragments polymer percentages
        fragment_polymer: [
            'fragment_polymer_pete', 'fragment_polymer_hdpe', 'fragment_polymer_pvc', 'fragment_polymer_ldpe',
            'fragment_polymer_pp', 'fragment_polymer_ps', 'fragment_polymer_pa', 'fragment_polymer_pc',
            'fragment_polymer_pla', 'fragment_polymer_abs', 'fragment_polymer_eva', 'fragment_polymer_pb',
            'fragment_polymer_pe_uhmw', 'fragment_polymer_pmma', 'fragment_polymer_hips', 'fragment_polymer_eps',
            'fragment_polymer_pan', 'fragment_polymer_rubber', 'fragment_polymer_bitumen', 'fragment_polymer_other'
        ]
    };

    const errors = [];

    for (const [groupName, fields] of Object.entries(percentageGroups)) {
        let total = 0;
        let hasAnyValue = false;

        fields.forEach(fieldName => {
            const value = formData[fieldName];
            if (value !== undefined && value !== null && value !== '') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    total += numValue;
                    hasAnyValue = true;
                }
            }
        });

        // Only validate if user has entered any values in this group
        if (hasAnyValue) {
            if (Math.abs(total - 100) > 0.1) {
                errors.push({
                    group: groupName,
                    total: total.toFixed(1),
                    message: `${groupName} percentages sum to ${total.toFixed(1)}% but must equal 100%`
                });
            }
        }
    }

    if (errors.length > 0) {
        return {
            isValid: false,
            message: errors.map(e => e.message).join('; '),
            details: errors
        };
    }

    return { isValid: true };
}

// Function to validate Whole Package hierarchical data
function validateWholePackageHierarchy(formData) {
    const errors = [];

    // Get values with safe parsing
    const wholePackagesTotal = parseInt(formData.packaging_count) || 0;

    // All 7 packaging categories from the UI
    const singleUseTotal = parseInt(formData.packaging_count_single_use) || 0;
    const multiUseTotal = parseInt(formData.packaging_count_multi_use) || 0;
    const otherContainerTotal = parseInt(formData.packaging_count_other_container) || 0;
    const bagTotal = parseInt(formData.packaging_count_bag) || 0;
    const packingTotal = parseInt(formData.packaging_count_packing) || 0;
    const otherPurposeTotal = parseInt(formData.packaging_count_other) || 0;
    const unknownTotal = parseInt(formData.packaging_count_unknown) || 0;

    // Only validate if user has entered package count
    if (wholePackagesTotal > 0) {
        // Validate main hierarchy: Sum of all categories = Whole Packages total
        const allCategoriesSum = singleUseTotal + multiUseTotal + otherContainerTotal +
                                  bagTotal + packingTotal + otherPurposeTotal + unknownTotal;

        // Only validate if user has entered any category values
        if (allCategoriesSum > 0 && allCategoriesSum !== wholePackagesTotal) {
            errors.push({
                type: 'main_hierarchy',
                message: `Sum of all categories (${allCategoriesSum}) must equal Whole Packages total (${wholePackagesTotal}).`
            });
        }

        // Validate single-use recycle codes if single-use total is provided
        if (singleUseTotal > 0) {
            const singleUseRecycleSum = calculateRecycleCodeSum(formData, 'single_use');
            // Only validate recycle codes if user has entered any recycle code values
            if (singleUseRecycleSum > 0 && singleUseRecycleSum !== singleUseTotal) {
                errors.push({
                    type: 'single_use_recycle',
                    message: `Single-use recycle codes sum to ${singleUseRecycleSum} but Single-use total is ${singleUseTotal}. They must be equal.`
                });
            }
        }

        // Validate multi-use recycle codes if multi-use total is provided
        if (multiUseTotal > 0) {
            const multiUseRecycleSum = calculateRecycleCodeSum(formData, 'multi_use');
            // Only validate recycle codes if user has entered any recycle code values
            if (multiUseRecycleSum > 0 && multiUseRecycleSum !== multiUseTotal) {
                errors.push({
                    type: 'multi_use_recycle',
                    message: `Multi-use recycle codes sum to ${multiUseRecycleSum} but Multi-use total is ${multiUseTotal}. They must be equal.`
                });
            }
        }

        // Validate other container recycle codes if provided
        if (otherContainerTotal > 0) {
            const recycleSum = calculateRecycleCodeSum(formData, 'other_container');
            if (recycleSum > 0 && recycleSum !== otherContainerTotal) {
                errors.push({
                    type: 'other_container_recycle',
                    message: `Other Container recycle codes sum to ${recycleSum} but total is ${otherContainerTotal}. They must be equal.`
                });
            }
        }

        // Validate bag recycle codes if provided
        if (bagTotal > 0) {
            const recycleSum = calculateRecycleCodeSum(formData, 'bag');
            if (recycleSum > 0 && recycleSum !== bagTotal) {
                errors.push({
                    type: 'bag_recycle',
                    message: `Bag recycle codes sum to ${recycleSum} but total is ${bagTotal}. They must be equal.`
                });
            }
        }

        // Validate packing recycle codes if provided
        if (packingTotal > 0) {
            const recycleSum = calculateRecycleCodeSum(formData, 'packing');
            if (recycleSum > 0 && recycleSum !== packingTotal) {
                errors.push({
                    type: 'packing_recycle',
                    message: `Packing Materials recycle codes sum to ${recycleSum} but total is ${packingTotal}. They must be equal.`
                });
            }
        }

        // Validate other purpose recycle codes if provided
        if (otherPurposeTotal > 0) {
            const recycleSum = calculateRecycleCodeSum(formData, 'other_purpose');
            if (recycleSum > 0 && recycleSum !== otherPurposeTotal) {
                errors.push({
                    type: 'other_purpose_recycle',
                    message: `Other Purpose recycle codes sum to ${recycleSum} but total is ${otherPurposeTotal}. They must be equal.`
                });
            }
        }

        // Validate unknown purpose recycle codes if provided
        if (unknownTotal > 0) {
            const recycleSum = calculateRecycleCodeSum(formData, 'unknown_purpose');
            if (recycleSum > 0 && recycleSum !== unknownTotal) {
                errors.push({
                    type: 'unknown_purpose_recycle',
                    message: `Unknown Purpose recycle codes sum to ${recycleSum} but total is ${unknownTotal}. They must be equal.`
                });
            }
        }
    }

    if (errors.length > 0) {
        return {
            isValid: false,
            message: errors.map(e => e.message).join('; '),
            details: errors
        };
    }

    return { isValid: true };
}

// Helper function to calculate recycle code sum for a package type
function calculateRecycleCodeSum(formData, type) {
    let sum = 0;
    // Include recycle codes 0-7 (0 is Unknown)
    for (let i = 0; i <= 7; i++) {
        const fieldName = `${type}_recycle_${i}`;
        const value = parseInt(formData[fieldName]) || 0;
        sum += value;
    }
    return sum;
}

function parseNullableFloat(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableInt(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function firstPresent(formData, ...keys) {
    for (const key of keys) {
        if (formData[key] !== undefined && formData[key] !== null && formData[key] !== '') {
            return formData[key];
        }
    }
    return null;
}

function getDetailRows(formData, snakeKey, camelKey) {
    const value = formData[snakeKey] ?? formData[camelKey] ?? [];
    return Array.isArray(value) ? value : [];
}

function normalizeDetailRow(row) {
    return {
        refNum: parseNullableInt(row.ref_num ?? row.refNum),
        legacy: row.legacy ?? '',
        percent: parseNullableFloat(row.percent),
        methodPercentEstimate: row.method_percent_estimate ?? row.methodPercentEstimate ?? null
    };
}

function detailRowsTotal(rows) {
    return rows.reduce((sum, row) => sum + (parseNullableFloat(row.percent) || 0), 0);
}

function hasPolymerPercentages(formData, prefix) {
    return Object.keys(formData).some(key => key.startsWith(prefix) && parseNullableFloat(formData[key]) > 0);
}

function getPublicationInputState(formData) {
    const selectedPublication = parseNullableInt(firstPresent(formData, 'publication_id_num', 'publication_id', 'publicationId'));
    const newPublicationFields = [
        firstPresent(formData, 'publication_year', 'publicationYear'),
        firstPresent(formData, 'publication_authors', 'publicationAuthors'),
        firstPresent(formData, 'publication_journal', 'publicationJournal'),
        firstPresent(formData, 'publication_full_citation_apa', 'publicationFullCitationApa'),
        firstPresent(formData, 'publication_pub_source_code', 'publicationPubSourceCode')
    ];

    return {
        selectedPublication,
        hasNewPublicationInput: newPublicationFields.some(value => value !== null),
        hasCompleteNewPublication: newPublicationFields.every(value => value !== null)
    };
}

function hasDebrisDetailData(formData) {
    const detailRows = [
        ...getDetailRows(formData, 'fragments_color_details', 'fragmentsColorDetails'),
        ...getDetailRows(formData, 'fragments_form_details', 'fragmentsFormDetails'),
        ...getDetailRows(formData, 'fragments_opacity_details', 'fragmentsOpacityDetails'),
        ...getDetailRows(formData, 'fragments_purpose_details', 'fragmentsPurposeDetails')
    ];

    return detailRows.length > 0 ||
        hasPolymerPercentages(formData, 'fragment_polymer_') ||
        firstPresent(formData, 'fragments_method_polymer_num', 'fragments_methodPolymerNum') ||
        firstPresent(formData, 'fragments_method_polymer_other', 'fragments_methodPolymerOther') ||
        firstPresent(formData, 'fragments_method_percent_estimate');
}

function validateNewSaveRules(formData) {
    const errors = [];
    const totalSampleAmount = firstPresent(formData, 'total_sample_amount', 'totalSampleAmount');
    const sampleUnit = firstPresent(formData, 'sample_unit', 'sampleUnit');

    // Publication is optional. Only require complete details when the user
    // explicitly opted in via the Yes/No toggle.
    const publicationPresent = firstPresent(formData, 'publication_present', 'publicationPresent');
    const publicationInput = getPublicationInputState(formData);
    if (publicationPresent === 'yes' &&
        !publicationInput.selectedPublication && !publicationInput.hasCompleteNewPublication) {
        errors.push('Publication source is incomplete. Please fill in the publication details or choose "No".');
    }

    if ((totalSampleAmount && !sampleUnit) || (!totalSampleAmount && sampleUnit)) {
        errors.push('Total Sample Amount and Sample Unit must be entered together.');
    }

    const hasQuantitativeData = firstPresent(formData, 'has_quantitative_data', 'hasQuantitativeData') === 'yes';
    const debrisCount =
        (parseNullableInt(formData.fragments_count) || 0) +
        (parseNullableInt(formData.packaging_count) || 0);
    const debrisMass = parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')) || 0;
    if (hasQuantitativeData && hasDebrisDetailData(formData) && debrisCount <= 0 && debrisMass <= 0) {
        errors.push('Enter at least a count or a mass for debris.');
    }

    const detailGroups = [
        ['fragments_color_details', 'fragmentsColorDetails'],
        ['fragments_form_details', 'fragmentsFormDetails'],
        ['fragments_opacity_details', 'fragmentsOpacityDetails'],
        ['fragments_purpose_details', 'fragmentsPurposeDetails'],
        ['micro_color_details', 'microColorDetails'],
        ['micro_shape_details', 'microShapeDetails'],
        ['micro_texture_details', 'microTextureDetails'],
        ['micro_opacity_details', 'microOpacityDetails'],
        ['micro_size_details', 'microSizeDetails']
    ];

    detailGroups.forEach(([snakeKey, camelKey]) => {
        const rows = getDetailRows(formData, snakeKey, camelKey);
        if (rows.length === 0) return;

        const total = detailRowsTotal(rows);
        if (Math.abs(total - 100) > 0.1) {
            errors.push(`${snakeKey} percentages sum to ${total.toFixed(1)}% but must equal 100%.`);
        }

        const missingMethod = rows.some(row => !normalizeDetailRow(row).methodPercentEstimate);
        if (missingMethod) {
            errors.push(`${snakeKey} requires a percent-estimation method for every provided row.`);
        }
    });

    if (hasPolymerPercentages(formData, 'fragment_polymer_') && !firstPresent(formData, 'fragments_method_polymer_num', 'fragments_methodPolymerNum')) {
        errors.push('Fragments polymer details require fragments_method_polymer_num.');
    }
    if (hasPolymerPercentages(formData, 'fragment_polymer_') && !firstPresent(formData, 'fragments_method_percent_estimate')) {
        errors.push('Fragments polymer details require fragments_method_percent_estimate.');
    }

    if (hasPolymerPercentages(formData, 'mp_polymer_') && !firstPresent(formData, 'micro_method_polymer_num', 'micro_methodPolymerNum')) {
        errors.push('Microplastics polymer details require micro_method_polymer_num.');
    }
    if (hasPolymerPercentages(formData, 'mp_polymer_') && !firstPresent(formData, 'micro_method_percent_estimate')) {
        errors.push('Microplastics polymer details require micro_method_percent_estimate.');
    }

    return {
        isValid: errors.length === 0,
        message: errors.join('; '),
        details: errors
    };
}

async function getTableColumns(connection, tableName) {
    const [rows] = await connection.execute(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [tableName]
    );
    return new Set(rows.map(row => row.COLUMN_NAME));
}

async function insertFromMap(connection, tableName, dataMap, tableColumns = null) {
    const availableColumns = tableColumns || await getTableColumns(connection, tableName);
    const entries = Object.entries(dataMap).filter(([column]) => availableColumns.has(column));
    const columns = entries.map(([column]) => `\`${column}\``).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const values = entries.map(([, value]) => value);

    await connection.execute(
        `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
        values
    );
}

async function nextTableId(connection, tableName, idColumn) {
    const [rows] = await connection.execute(`SELECT MAX(\`${idColumn}\`) as maxId FROM ${tableName}`);
    return (rows[0].maxId || 0) + 1;
}

async function insertDetailRows(connection, config, parentId, rows) {
    let nextId = await nextTableId(connection, config.tableName, config.idColumn);

    for (const rawRow of rows) {
        const row = normalizeDetailRow(rawRow);
        if (!row.refNum || row.percent === null) continue;

        const dataMap = {
            [config.idColumn]: nextId++,
            [config.parentColumn]: parentId,
            [config.refColumn]: row.refNum,
            [config.legacyColumn]: row.legacy,
            [config.percentColumn]: row.percent,
            Method_PercentEstimate: row.methodPercentEstimate,
            DateEntered: new Date()
        };

        await insertFromMap(connection, config.tableName, dataMap);
    }
}

async function createPublication(connection, publicationData) {
    const publicationId = await nextTableId(connection, 'Publications', 'PublicationUniqueID');
    await connection.execute(`
        INSERT INTO Publications (
            PublicationUniqueID, Year, Authors, Journal, FullCitation_APA,
            PubSource_Code, PubSource_Legacy, DateEntered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())
    `, [
        publicationId,
        parseNullableInt(publicationData.year),
        publicationData.authors,
        publicationData.journal,
        publicationData.fullCitationApa,
        parseNullableInt(publicationData.pubSourceCode),
        publicationData.pubSourceLegacy || String(publicationData.pubSourceCode || '')
    ]);
    return publicationId;
}

async function resolvePublicationId(connection, formData) {
    // Publication is now optional. The SamplingEvent.PublicationID_Num column is
    // nullable, so we store NULL whenever a publication is absent.
    const publicationPresent = firstPresent(formData, 'publication_present', 'publicationPresent');
    if (publicationPresent === 'no') {
        return null;
    }

    const selectedPublication = firstPresent(formData, 'publication_id_num', 'publication_id', 'publicationId');
    if (selectedPublication) {
        return parseNullableInt(selectedPublication);
    }

    const year = firstPresent(formData, 'publication_year', 'publicationYear');
    const authors = firstPresent(formData, 'publication_authors', 'publicationAuthors');
    const journal = firstPresent(formData, 'publication_journal', 'publicationJournal');
    const citation = firstPresent(formData, 'publication_full_citation_apa', 'publicationFullCitationApa');
    const sourceCode = firstPresent(formData, 'publication_pub_source_code', 'publicationPubSourceCode');

    if (year && authors && journal && citation && sourceCode) {
        return createPublication(connection, {
            year,
            authors,
            journal,
            fullCitationApa: citation,
            pubSourceCode: sourceCode,
            pubSourceLegacy: null
        });
    }

    // If the user opted in ('yes') but left required publication fields incomplete,
    // surface a clear error; otherwise treat publication as optional and skip it.
    if (publicationPresent === 'yes') {
        const error = new Error('Publication source is incomplete. Please fill in the publication details or choose "No".');
        error.statusCode = 400;
        throw error;
    }

    // No publication provided and the user didn't opt in: store NULL
    // (PublicationID_Num is nullable).
    return null;
}

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        cors: {
            origin: req.headers.origin || 'no-origin',
            host: req.headers.host,
            userAgent: req.headers['user-agent']
        }
    });
});

// CORS test endpoint
router.get('/cors-test', (req, res) => {
    res.json({
        success: true,
        message: 'CORS is working correctly',
        headers: {
            origin: req.headers.origin,
            host: req.headers.host,
            referer: req.headers.referer,
            userAgent: req.headers['user-agent']
        },
        timestamp: new Date().toISOString()
    });
});

router.get('/geocode/address', requireAuth, async (req, res) => {
    const streetAddress = (req.query.streetAddress || '').trim();
    const city = (req.query.city || '').trim();
    const state = (req.query.state || '').trim();
    const country = (req.query.country || '').trim();

    if (!streetAddress || !city || !state || !country) {
        return res.status(400).json({
            success: false,
            message: 'Street address, city, state, and country are required to place an address on the map.'
        });
    }

    if (typeof fetch !== 'function') {
        return res.status(500).json({
            success: false,
            message: 'Server geocoding is not available in this runtime.'
        });
    }

    const { baseUrl, userAgent, contactEmail } = getGeocodingServiceConfig();
    const searchParams = new URLSearchParams({
        format: 'jsonv2',
        limit: '1',
        addressdetails: '1',
        street: streetAddress,
        city,
        state,
        country
    });

    if (contactEmail) {
        searchParams.set('email', contactEmail);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(`${baseUrl}?${searchParams.toString()}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': userAgent
            },
            signal: controller.signal
        });

        if (!response.ok) {
            const lookupFailedMessage = response.status === 429
                ? 'Address lookup service is temporarily busy. Please try again shortly or enter coordinates manually.'
                : 'Address lookup service is currently unavailable. Please enter coordinates manually or try again later.';

            return res.status(502).json({
                success: false,
                message: lookupFailedMessage
            });
        }

        const results = await response.json();
        if (!Array.isArray(results) || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Address not found. Check the address fields and try again.'
            });
        }

        const bestMatch = results[0];
        const latitude = parseFloat(bestMatch.lat);
        const longitude = parseFloat(bestMatch.lon);

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            return res.status(502).json({
                success: false,
                message: 'Address lookup returned an invalid location. Please enter coordinates manually.'
            });
        }

        return res.json({
            success: true,
            latitude,
            longitude,
            displayName: bestMatch.display_name || `${streetAddress}, ${city}, ${state}, ${country}`,
            boundingBox: parseBoundingBox(bestMatch.boundingbox)
        });
    } catch (error) {
        console.error('Error geocoding address:', error);

        const message = error.name === 'AbortError'
            ? 'Address lookup timed out. Please try again or enter coordinates manually.'
            : 'Address lookup failed. Please try again or enter coordinates manually.';

        return res.status(502).json({
            success: false,
            message
        });
    } finally {
        clearTimeout(timeoutId);
    }
});

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Test endpoint to add sample location data with ZIP codes
router.post('/add-test-location-data', requireAuth, async (req, res) => {
    try {
        // Sample Detroit area ZIP codes with coordinates
        const testLocations = [
            { name: 'Downtown Detroit', lat: 42.3314, lng: -83.0458, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Belle Isle Park', lat: 42.3401, lng: -82.9849, zipCode: 48207, city: 'Detroit', state: 'MI' },
            { name: 'Detroit Riverfront', lat: 42.3298, lng: -83.0365, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Campus Martius', lat: 42.3314, lng: -83.0457, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Eastern Market', lat: 42.3481, lng: -83.0401, zipCode: 48207, city: 'Detroit', state: 'MI' }
        ];

        // Insert test locations
        for (const loc of testLocations) {
            // Insert location
            const [locationResult] = await pool.execute(`
                INSERT INTO Location (
                    LocationName, Location_Desc, \`Env_Indoor_SelectID\`,
                    \`Lat_DecimalDegree\`, \`Long_DecimalDegree\`,
                    City, State, Country, ZipCode,
                    UserCreated
                ) VALUES (?, ?, 1, ?, ?, ?, ?, 'USA', ?, ?)
            `, [
                loc.name,
                `Test location for ${loc.name}`,
                loc.lat,
                loc.lng,
                loc.city,
                loc.state,
                loc.zipCode,
                req.session.username
            ]);

            const locationId = locationResult.insertId;

            // Insert sampling event
            const [eventResult] = await pool.execute(`
                INSERT INTO SamplingEvent (
                    SamplingEventUniqueID, LocationID_Num, DeviceInstallationPeriod,
                    SamplingDate, UserSamplingID, DateEntered
                ) VALUES (?, ?, 'no', CURDATE(), ?, NOW())
            `, [locationId, locationId, req.session.user_id]);

            // Insert sample details
            await pool.execute(`
                INSERT INTO SampleDetails (
                    SampleUniqueID, SamplingEvent_Num, MediaType_SelectID,
                    Micro5mmAndSmaller_Count, FragLargerThan5mm_Count, WholePkg_Count
                ) VALUES (?, ?, 1, ?, ?, ?)
            `, [
                locationId,
                locationId,
                Math.floor(Math.random() * 100) + 10,
                Math.floor(Math.random() * 50) + 5,
                Math.floor(Math.random() * 20) + 1
            ]);
        }

        res.json({
            success: true,
            message: `Added ${testLocations.length} test locations with sample data`
        });

    } catch (error) {
        console.error('Error adding test data:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding test data: ' + error.message
        });
    }
});

// Get map data from SampleDetails and related tables
router.get('/php/get_map_data.php', async (req, res) => {
    try {
        // Build the SQL query with optional filters using the actual database schema
        let sql = `
            SELECT
                sd.SampleUniqueID,
                l.LocationName as location,
                l.ZipCode as zipCode,
                l.\`Lat_DecimalDegree\` as lat,
                l.\`Long_DecimalDegree\` as lng,
                mt.MediaTypeOverall as sampleType,
                DATE(se.SamplingDate) as date,
                mt.MediaTypeOverall as plasticTypes,
                (sd.WholePkg_Count + sd.FragLargerThan5mm_Count + sd.Micro5mmAndSmaller_Count) as particleCount
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat_DecimalDegree\` IS NOT NULL AND l.\`Long_DecimalDegree\` IS NOT NULL
        `;

        const params = [];

        // Apply ZIP code filter if provided (search in actual ZipCode field)
        if (req.query.zipcode && req.query.zipcode.trim()) {
            sql += " AND l.ZipCode = ?";
            params.push(parseInt(req.query.zipcode.trim()));
        }

        // Apply plastic type filter if provided (search in media_type)
        if (req.query.plastic_type && req.query.plastic_type.trim()) {
            sql += " AND mt.MediaTypeOverall LIKE ?";
            params.push(`%${req.query.plastic_type.trim()}%`);
        }

        // Order by collection date (most recent first)
        sql += " ORDER BY se.SamplingDate DESC";

        // Execute the query
        const [rows] = await pool.execute(sql, params);

        // Format the data to match the PHP response format
        const formattedData = rows.map(row => ({
            SampleUniqueID: row.SampleUniqueID,
            location: row.location || 'Unknown Location',
            zipCode: row.zipCode || 'N/A',
            lat: parseFloat(row.lat) || 0,
            lng: parseFloat(row.lng) || 0,
            sampleType: row.sampleType || 'Unknown',
            date: row.date,
            plasticTypes: row.plasticTypes || 'N/A',
            particleCount: row.particleCount || 0
        }));

        // Return the data as JSON (matching PHP response format)
        res.json({
            success: true,
            count: formattedData.length,
            data: formattedData,
            timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ') // MySQL datetime format
        });

    } catch (error) {
        console.error('Error fetching map data:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Get map data
router.get('/map-data', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT
                sd.SampleUniqueID as id,
                l.\`Lat_DecimalDegree\` as latitude,
                l.\`Long_DecimalDegree\` as longitude,
                mt.MediaTypeOverall as sample_type,
                l.LocationName as location_name,
                se.SamplingDate as collection_date,
                se.UserSamplingID as created_by
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat_DecimalDegree\` IS NOT NULL
            AND l.\`Long_DecimalDegree\` IS NOT NULL
            ORDER BY se.SamplingDate DESC
        `);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching map data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching map data'
        });
    }
});

// Test endpoint without authentication
router.post('/test-save', async (req, res) => {
    console.log('=== TEST SAVE ENDPOINT ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Session data:', JSON.stringify(req.session, null, 2));

    res.json({
        success: true,
        message: 'Test endpoint working',
        session: req.session,
        body: req.body
    });
});

// Reference data endpoints
router.get('/ref/methods', async (req, res) => {
    try {
        const { type, appliesTo } = req.query;
        let sql = `
            SELECT MethodsUniqueID, MethodType, AppliesTo_MP, AppliesTo_Debris,
                   AppliesTo_SoilType, Method_Code, Method_Label, DateEntered
            FROM Methods_Ref
            WHERE MethodType <> 'Count'
        `;
        const params = [];

        if (type) {
            sql += ' AND MethodType = ?';
            params.push(type);
        }

        if (appliesTo === 'MP') {
            sql += ' AND AppliesTo_MP = 1';
        } else if (appliesTo === 'Debris') {
            sql += ' AND AppliesTo_Debris = 1';
        } else if (appliesTo === 'SoilType') {
            sql += ' AND AppliesTo_SoilType = 1';
        }

        sql += ' ORDER BY MethodsUniqueID';

        const [methods] = await pool.execute(sql, params);
        res.json({ success: true, data: methods });
    } catch (error) {
        console.error('Error fetching methods reference:', error);
        res.status(500).json({ success: false, message: 'Error fetching methods reference' });
    }
});

router.get('/ref/opacity', async (req, res) => {
    try {
        const [opacities] = await pool.query(`
            SELECT OpacityUniqueID, Opacity_Code, Opacity_Label
            FROM Opacity_Ref
            ORDER BY OpacityUniqueID
        `);
        res.json({ success: true, data: opacities });
    } catch (error) {
        console.error('Error fetching opacity reference:', error);
        res.status(500).json({ success: false, message: 'Error fetching opacity reference' });
    }
});

router.get('/ref/soil-texture', async (req, res) => {
    try {
        const [soilTextures] = await pool.query(`
            SELECT SoilTextureUniqueID, SoilTexture_Code, SoilTexture_Definition
            FROM SoilTexture_Ref
            ORDER BY SoilTextureUniqueID
        `);
        res.json({ success: true, data: soilTextures });
    } catch (error) {
        console.error('Error fetching soil texture reference:', error);
        res.status(500).json({ success: false, message: 'Error fetching soil texture reference' });
    }
});

router.get('/ref/units', async (req, res) => {
    try {
        const [units] = await pool.query(`
            SELECT UnitsUniqueID, Units_Type, Units_Code, Units_Desc
            FROM Units_Ref
            ORDER BY UnitsUniqueID
        `);
        res.json({ success: true, data: units });
    } catch (error) {
        console.error('Error fetching units reference:', error);
        res.status(500).json({ success: false, message: 'Error fetching units reference' });
    }
});

// Get reference data (polymers, purposes, methods, forms, colors, etc.)
router.get('/references', async (req, res) => {
    try {
        const [polymers] = await pool.query('SELECT * FROM PolymerType_Ref ORDER BY Polymer_Code');
        const [purposes] = await pool.query('SELECT * FROM Purpose_Ref ORDER BY Purpose_Name');
        const [colors] = await pool.query('SELECT * FROM ColorType_Ref ORDER BY ColorUniqueID');
        const [forms] = await pool.query('SELECT * FROM Form_Ref ORDER BY FormUniqueID');
        const [methods] = await pool.query(`
            SELECT MethodsUniqueID, MethodType, AppliesTo_MP, AppliesTo_Debris,
                   AppliesTo_SoilType, Method_Code, Method_Label, DateEntered
            FROM Methods_Ref
            WHERE MethodType <> 'Count'
            ORDER BY MethodsUniqueID
        `);
        const [opacities] = await pool.query(`
            SELECT OpacityUniqueID, Opacity_Code, Opacity_Label
            FROM Opacity_Ref
            ORDER BY OpacityUniqueID
        `);
        const [soilTextures] = await pool.query(`
            SELECT SoilTextureUniqueID, SoilTexture_Code, SoilTexture_Definition
            FROM SoilTexture_Ref
            ORDER BY SoilTextureUniqueID
        `);
        const [units] = await pool.query(`
            SELECT UnitsUniqueID, Units_Type, Units_Code, Units_Desc
            FROM Units_Ref
            ORDER BY UnitsUniqueID
        `);
        const [sizes] = await pool.query('SELECT * FROM SizeClass_Ref ORDER BY SizeUniqueID');
        const [pubSources] = await pool.query('SELECT * FROM PubSource_Ref ORDER BY PubSourceUniqueID');

        res.json({
            success: true,
            data: {
                polymers,
                purposes,
                colors,
                forms,
                methods,
                opacities,
                soilTextures,
                units,
                sizes,
                pubSources
            }
        });
    } catch (error) {
        console.error('Error fetching references:', error);
        res.status(500).json({ success: false, message: 'Error fetching references' });
    }
});

router.get('/publications', async (req, res) => {
    try {
        const [publications] = await pool.query(`
            SELECT PublicationUniqueID as publication_id_num,
                   Year as publication_year,
                   Authors as publication_authors,
                   Journal as publication_journal,
                   FullCitation_APA as publication_full_citation_apa,
                   PubSource_Code as publication_pub_source_code,
                   PubSource_Legacy as publication_pub_source_legacy,
                   DateEntered as date_entered
            FROM Publications
            ORDER BY Year DESC, PublicationUniqueID DESC
        `);
        res.json({ success: true, data: publications });
    } catch (error) {
        console.error('Error fetching publications:', error);
        res.status(500).json({ success: false, message: 'Error fetching publications' });
    }
});

router.post('/publications', requireAuth, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const year = parseNullableInt(req.body.publication_year);
        const authors = firstPresent(req.body, 'publication_authors');
        const journal = firstPresent(req.body, 'publication_journal');
        const citation = firstPresent(req.body, 'publication_full_citation_apa');
        const sourceCode = parseNullableInt(firstPresent(req.body, 'publication_pub_source_code'));

        if (!year || !authors || !journal || !citation || !sourceCode) {
            return res.status(400).json({
                success: false,
                message: 'publication_year, publication_authors, publication_journal, publication_full_citation_apa, and publication_pub_source_code are required'
            });
        }

        await connection.beginTransaction();
        const publicationId = await createPublication(connection, {
            year,
            authors,
            journal,
            fullCitationApa: citation,
            pubSourceCode: sourceCode,
            pubSourceLegacy: null
        });
        await connection.commit();

        res.json({ success: true, publication_id_num: publicationId });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating publication:', error);
        res.status(500).json({ success: false, message: 'Error creating publication: ' + error.message });
    } finally {
        connection.release();
    }
});

// Save form data
router.post('/save-form-data',
    requireAuth,
    [
        // Validation for required fields - check both possible field names
        body('location_id').optional(),
        body('selected_location_id').optional(),
        // sample_date is validated manually below because for device-period samples
        // the primary date comes from device_start_date instead of sample_date.
        body('sample_date').optional(),
        body('media_type').notEmpty().withMessage('Media type is required')
    ],
    async (req, res) => {
        console.log('=== SAVE FORM DATA REQUEST ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Session user_id:', req.session.user_id);

        const connection = await pool.getConnection();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('Validation errors:', errors.array());
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg,
                    errors: errors.array()
                });
            }

            const formData = req.body;

            // Percentage validation for Quality Control data
            const percentageValidationResult = validatePercentageGroups(formData);
            if (!percentageValidationResult.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Percentage validation failed: ' + percentageValidationResult.message,
                    errors: percentageValidationResult.details
                });
            }

            // Legacy PackageCategoryDetails validation is hidden in the active UI.
            // FragmentsPurposes row totals now validate purpose data.

            const newSaveValidationResult = validateNewSaveRules(formData);
            if (!newSaveValidationResult.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Updated field validation failed: ' + newSaveValidationResult.message,
                    errors: newSaveValidationResult.details
                });
            }

            // Get location ID from either field name
            const locationId = formData.location_id || formData.selected_location_id;
            if (!locationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Location is required'
                });
            }

            // Normalize date/time values: treat empty strings as NULL so they
            // don't get rejected by MySQL date/time columns. Validate the primary
            // sampling date before opening a transaction.
            const normalizeDate = (value) => {
                if (value === undefined || value === null) return null;
                const trimmed = String(value).trim();
                return trimmed === '' ? null : trimmed;
            };

            const isDevicePeriod = formData.device_installation_period === 'yes';
            const deviceStartDate = normalizeDate(formData.device_start_date);
            const deviceEndDate = normalizeDate(formData.device_end_date);
            const singleSampleDate = normalizeDate(formData.sample_date);

            // For a device-period sample the primary SamplingDate (NOT NULL) is the
            // device installation start date; otherwise it's the single collection date.
            const primarySamplingDate = isDevicePeriod ? deviceStartDate : singleSampleDate;

            if (!primarySamplingDate) {
                return res.status(400).json({
                    success: false,
                    message: isDevicePeriod
                        ? 'Device installation start date is required'
                        : 'Sample date is required'
                });
            }
            if (isDevicePeriod && !deviceEndDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Device removal/end date is required'
                });
            }

            await connection.beginTransaction();

            const userId = req.session.user_id || 'system';
            const locationOverrideParts = [];
            if (formData.event_location_description) {
                locationOverrideParts.push(`event location description: ${formData.event_location_description}`);
            }
            if (formData.event_latitude && formData.event_longitude) {
                locationOverrideParts.push(`event coordinates: ${formData.event_latitude}, ${formData.event_longitude}`);
            }
            const locationOverrideNote = locationOverrideParts.length > 0
                ? `Location override (${locationId}): ${locationOverrideParts.join('; ')}`
                : null;
            const mergedAdditionalNotes = [formData.additional_notes, locationOverrideNote]
                .filter(value => value && String(value).trim() !== '')
                .join(' | ') || null;

            console.log('Starting database transaction...');

            // Step 1: Insert into SamplingEvent table (complete fields)
            const publicationId = await resolvePublicationId(connection, formData);
            const samplingEventData = {
                LocationID_Num: parseInt(locationId),
                PublicationID_Num: publicationId,
                SamplingDate: primarySamplingDate,
                UserSamplingID: userId,
                'AirTemp_C': formData.air_temp ? parseFloat(formData.air_temp) : null,
                'Weather_Current': formData.current_conditions ? await getWeatherTypeId(connection, formData.current_conditions) : null,
                'Weather_Precedent24': formData.precedent_weather ? await getWeatherTypeId(connection, formData.precedent_weather) : null,
                'Rainfall_cm_Precedent24': formData.rainfall ? parseFloat(formData.rainfall) : null,
                SamplerNames: formData.sample_description || null,
                DeviceInstallationPeriod: formData.device_installation_period || 'no',
                DeviceStartDate: isDevicePeriod ? deviceStartDate : null,
                DeviceEndDate: isDevicePeriod ? deviceEndDate : null,
                SampleTime: normalizeDate(formData.sample_time),
                WeatherPrecedent24: formData.precedent_weather_24h ? await getWeatherTypeId(connection, formData.precedent_weather_24h) : null,
                AdditionalNotes: mergedAdditionalNotes
            };

            console.log('Inserting sampling event data:', samplingEventData);

            // Generate a unique ID for the sampling event
            // Check for existing max ID and increment
            const [maxIdResult] = await connection.execute(
                'SELECT MAX(SamplingEventUniqueID) as maxId FROM SamplingEvent'
            );
            const samplingEventUniqueId = (maxIdResult[0].maxId || 0) + 1;

            const [samplingEventResult] = await connection.execute(`
                INSERT INTO SamplingEvent (
                    SamplingEventUniqueID, LocationID_Num, PublicationID_Num, SamplingDate, UserSamplingID, \`AirTemp_C\`,
                    \`Weather_Current\`, \`Weather_Precedent24\`, \`Rainfall_cm_Precedent24\`, SamplerNames,
                    DeviceInstallationPeriod, DeviceStartDate, DeviceEndDate, SampleTime,
                    WeatherPrecedent24, AdditionalNotes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                samplingEventUniqueId,
                samplingEventData.LocationID_Num,
                samplingEventData.PublicationID_Num,
                samplingEventData.SamplingDate,
                samplingEventData.UserSamplingID,
                samplingEventData['AirTemp_C'],
                samplingEventData['Weather_Current'],
                samplingEventData['Weather_Precedent24'],
                samplingEventData['Rainfall_cm_Precedent24'],
                samplingEventData.SamplerNames,
                samplingEventData.DeviceInstallationPeriod,
                samplingEventData.DeviceStartDate,
                samplingEventData.DeviceEndDate,
                samplingEventData.SampleTime,
                samplingEventData.WeatherPrecedent24,
                samplingEventData.AdditionalNotes
            ]);

            const samplingEventId = samplingEventUniqueId; // Use the generated ID
            console.log('Sampling event created with ID:', samplingEventId);

            // Step 2: Insert into SampleDetails table (complete fields)
            const mediaTypeId = await getMediaTypeId(connection, formData.media_type);
            const waterEnvTypeId = formData.environment_type ? await getWaterEnvTypeId(connection, formData.environment_type) : null;

            // Normalize alternate frontend field names (support both variants)
            const soilMoistureVal = (formData.soil_moisture ?? formData.soil_moisture_content ?? formData.sediment_moisture);
            const waterDepthVal = (formData.water_depth ?? formData.total_water_depth ?? formData.sample_water_depth);
            const samplingDepthVal = (formData.soil_depth ?? formData.sediment_depth); // Map for SamplingDepth
            const flowVelocityVal = (formData.flow_velocity ?? formData.water_flow_velocity);
            const suspendedSolidsVal = (formData.suspended_solids ?? formData.total_suspended_solids);
            const soilDryWeightVal = (formData.soil_dry_weight ?? formData.soil_sample_dry_weight ?? formData.sediment_dry_weight);
            const soilOrganicMatterVal = (formData.soil_organic_matter ?? formData.sediment_organic_matter);
            const soilSandVal = (formData.soil_sand ?? formData.sediment_sand);
            const soilSiltVal = (formData.soil_silt ?? formData.sediment_silt);
            const soilClayVal = (formData.soil_clay ?? formData.sediment_clay);
            const totalSampleAmountVal = firstPresent(
                formData,
                'total_sample_amount',
                'totalSampleAmount',
                'microplastics_sample_amount',
                'fragments_sample_amount',
                'packaging_sample_amount'
            );
            const sampleUnitVal = firstPresent(
                formData,
                'sample_unit',
                'sampleUnit',
                'microplastics_sample_unit',
                'fragments_sample_unit',
                'packaging_sample_unit'
            );
            const microplasticsSampleAmountVal = totalSampleAmountVal;
            const microplasticsSampleUnitVal = sampleUnitVal;
            const fragmentsSampleAmountVal = totalSampleAmountVal;
            const fragmentsSampleUnitVal = sampleUnitVal;
            const packagingSampleAmountVal = totalSampleAmountVal;
            const packagingSampleUnitVal = sampleUnitVal;

            // Additional field normalization for new columns
            const turbidityVal = formData.turbidity;
            const dissolvedOxygenVal = formData.dissolved_oxygen;
            const sampleWaterDepthVal = formData.sample_water_depth;
            const surfaceAreaSampledVal = formData.surface_area_sampled;
            const permeableSurfacesVal = formData.permeable_surfaces;
            const impermeableSurfacesVal = formData.impermeable_surfaces;
            const waterTypeOtherDesc = formData.water_type_other_description;
            const sedimentTypeOtherDesc = formData.sediment_type_other_description;
            // Consolidate all media-specific additional notes
            const mediaAdditionalNotes = formData.water_additional_notes || formData.sediment_additional_notes ||
                                         formData.soil_additional_notes || formData.surface_additional_notes ||
                                         formData.mixed_additional_notes || null;

            const sampleDetailsData = {
                SamplingEvent_Num: samplingEventId,
                MediaType_SelectID: mediaTypeId,
                WholePkg_Count: formData.packaging_count ? parseInt(formData.packaging_count) : null,
                FragLargerThan5mm_Count: formData.fragments_count ? parseInt(formData.fragments_count) : null,
                Micro5mmAndSmaller_Count: formData.microplastics_count ? parseInt(formData.microplastics_count) : null,
                WaterEnvType_SelectID: waterEnvTypeId,
                'SoilMoisture_Percent': soilMoistureVal ? parseFloat(soilMoistureVal) : null,
                StorageLocation: 1, // Default storage location
                // Additional fields from formpage2-5
                MediaSubType: getMediaSubType(formData),
                LandscapeType: getLandscapeType(formData),
                MixedMediaDescription: formData.mixed_media_description || null,
                VolumeSampled: formData.volume_sampled ? parseFloat(formData.volume_sampled) : null,
                WaterDepth: waterDepthVal ? parseFloat(waterDepthVal) : null,
                SamplingDepth: samplingDepthVal ? parseFloat(samplingDepthVal) : null,
                FlowVelocity: flowVelocityVal ? parseFloat(flowVelocityVal) : null,
                SuspendedSolids: suspendedSolidsVal ? parseFloat(suspendedSolidsVal) : null,
                Conductivity: formData.conductivity ? parseFloat(formData.conductivity) : null,
                SoilDryWeight: soilDryWeightVal ? parseFloat(soilDryWeightVal) : null,
                SoilOrganicMatter: soilOrganicMatterVal ? parseFloat(soilOrganicMatterVal) : null,
                SoilSand: soilSandVal ? parseFloat(soilSandVal) : null,
                SoilSilt: soilSiltVal ? parseFloat(soilSiltVal) : null,
                SoilClay: soilClayVal ? parseFloat(soilClayVal) : null,
                SoilTexture: firstPresent(formData, 'soil_texture', 'soilTexture'),
                ReplicatesCount: formData.replicates_count ? parseInt(formData.replicates_count) : null,
                TotalSampleAmount: parseNullableFloat(totalSampleAmountVal),
                SampleUnit: sampleUnitVal || null,
                MicroplasticsSampleAmount: parseNullableFloat(microplasticsSampleAmountVal),
                MicroplasticsSampleUnit: microplasticsSampleUnitVal || null,
                FragmentsSampleAmount: parseNullableFloat(fragmentsSampleAmountVal),
                FragmentsSampleUnit: fragmentsSampleUnitVal || null,
                PackagingSampleAmount: parseNullableFloat(packagingSampleAmountVal),
                PackagingSampleUnit: packagingSampleUnitVal || null,
                // New columns added by migration
                Turbidity: turbidityVal ? parseFloat(turbidityVal) : null,
                DissolvedOxygen: dissolvedOxygenVal ? parseFloat(dissolvedOxygenVal) : null,
                SampleWaterDepth: sampleWaterDepthVal ? parseFloat(sampleWaterDepthVal) : null,
                SurfaceAreaSampled: surfaceAreaSampledVal ? parseFloat(surfaceAreaSampledVal) : null,
                PermeableSurfaces: permeableSurfacesVal ? parseFloat(permeableSurfacesVal) : null,
                ImpermeableSurfaces: impermeableSurfacesVal ? parseFloat(impermeableSurfacesVal) : null,
                WaterTypeOtherDescription: waterTypeOtherDesc || null,
                SedimentTypeOtherDescription: sedimentTypeOtherDesc || null,
                MediaAdditionalNotes: mediaAdditionalNotes
            };

            console.log('Inserting sample details data:', sampleDetailsData);

            // Generate a unique ID for the sample details
            // Check for existing max ID and increment
            const [maxSampleIdResult] = await connection.execute(
                'SELECT MAX(SampleUniqueID) as maxId FROM SampleDetails'
            );
            const sampleUniqueId = (maxSampleIdResult[0].maxId || 0) + 1;

            await insertFromMap(connection, 'SampleDetails', {
                SampleUniqueID: sampleUniqueId,
                SamplingEvent_Num: sampleDetailsData.SamplingEvent_Num,
                MediaType_SelectID: sampleDetailsData.MediaType_SelectID,
                WholePkg_Count: sampleDetailsData.WholePkg_Count,
                FragLargerThan5mm_Count: sampleDetailsData.FragLargerThan5mm_Count,
                Micro5mmAndSmaller_Count: sampleDetailsData.Micro5mmAndSmaller_Count,
                WaterEnvType_SelectID: sampleDetailsData.WaterEnvType_SelectID,
                SoilMoisture_Percent: sampleDetailsData.SoilMoisture_Percent,
                StorageLocation: sampleDetailsData.StorageLocation,
                MediaSubType: sampleDetailsData.MediaSubType,
                LandscapeType: sampleDetailsData.LandscapeType,
                MixedMediaDescription: sampleDetailsData.MixedMediaDescription,
                VolumeSampled: sampleDetailsData.VolumeSampled,
                WaterDepth: sampleDetailsData.WaterDepth,
                SamplingDepth: sampleDetailsData.SamplingDepth,
                FlowVelocity: sampleDetailsData.FlowVelocity,
                SuspendedSolids: sampleDetailsData.SuspendedSolids,
                Conductivity: sampleDetailsData.Conductivity,
                SoilDryWeight: sampleDetailsData.SoilDryWeight,
                SoilOrganicMatter: sampleDetailsData.SoilOrganicMatter,
                SoilSand: sampleDetailsData.SoilSand,
                SoilSilt: sampleDetailsData.SoilSilt,
                SoilClay: sampleDetailsData.SoilClay,
                SoilTexture: sampleDetailsData.SoilTexture,
                ReplicatesCount: sampleDetailsData.ReplicatesCount,
                TotalSampleAmount: sampleDetailsData.TotalSampleAmount,
                SampleUnit: sampleDetailsData.SampleUnit,
                MicroplasticsSampleAmount: sampleDetailsData.MicroplasticsSampleAmount,
                MicroplasticsSampleUnit: sampleDetailsData.MicroplasticsSampleUnit,
                FragmentsSampleAmount: sampleDetailsData.FragmentsSampleAmount,
                FragmentsSampleUnit: sampleDetailsData.FragmentsSampleUnit,
                PackagingSampleAmount: sampleDetailsData.PackagingSampleAmount,
                PackagingSampleUnit: sampleDetailsData.PackagingSampleUnit,
                Turbidity: sampleDetailsData.Turbidity,
                DissolvedOxygen: sampleDetailsData.DissolvedOxygen,
                SampleWaterDepth: sampleDetailsData.SampleWaterDepth,
                SurfaceAreaSampled: sampleDetailsData.SurfaceAreaSampled,
                PermeableSurfaces: sampleDetailsData.PermeableSurfaces,
                ImpermeableSurfaces: sampleDetailsData.ImpermeableSurfaces,
                WaterTypeOtherDescription: sampleDetailsData.WaterTypeOtherDescription,
                SedimentTypeOtherDescription: sampleDetailsData.SedimentTypeOtherDescription,
                MediaAdditionalNotes: sampleDetailsData.MediaAdditionalNotes
            });

            const sampleDetailsId = sampleUniqueId; // Use the generated ID
            console.log('Sample details created with ID:', sampleDetailsId);

            let microUniqueId = null;
            let fragmentUniqueId = null;

            // Step 3: Insert microplastics details if provided (complete fields)
            const microDetailRows = [
                ...getDetailRows(formData, 'micro_color_details', 'microColorDetails'),
                ...getDetailRows(formData, 'micro_shape_details', 'microShapeDetails'),
                ...getDetailRows(formData, 'micro_texture_details', 'microTextureDetails'),
                ...getDetailRows(formData, 'micro_opacity_details', 'microOpacityDetails'),
                ...getDetailRows(formData, 'micro_size_details', 'microSizeDetails')
            ];
            const shouldInsertMicroplastics = formData.has_quantitative_data === 'yes' && (
                parseNullableInt(formData.microplastics_count) > 0 ||
                parseNullableFloat(firstPresent(formData, 'micro_mass_mp_total', 'micro_massMPTotal')) > 0 ||
                firstPresent(formData, 'micro_method_polymer_num', 'micro_methodPolymerNum') ||
                microDetailRows.length > 0 ||
                hasPolymerPercentages(formData, 'mp_polymer_')
            );

            if (shouldInsertMicroplastics) {
                console.log('Inserting microplastics details...');

                // Helper to safely pull numeric values with optional fallback keys
                const pickInt = (...keys) => {
                    for (const key of keys) {
                        const raw = formData[key];
                        if (raw !== undefined && raw !== null && raw !== '') {
                            const parsed = parseInt(raw);
                            if (!isNaN(parsed)) return parsed;
                        }
                    }
                    return null;
                };

                // Generate a unique ID for microplastics
                const [maxMicroIdResult] = await connection.execute(
                    'SELECT MAX(Micro_UniqueID) as maxId FROM MicroplasticsInSample'
                );
                microUniqueId = (maxMicroIdResult[0].maxId || 0) + 1;

                await insertFromMap(connection, 'MicroplasticsInSample', {
                    Micro_UniqueID: microUniqueId,
                    SampleDetails_Num: sampleDetailsId,
                    Micro5mmAndSmaller_Count: parseNullableInt(formData.microplastics_count),
                    Mass_MP_Total: parseNullableFloat(firstPresent(formData, 'micro_mass_mp_total', 'micro_massMPTotal')),
                    Method_Polymer_Num: parseNullableInt(firstPresent(formData, 'micro_method_polymer_num', 'micro_methodPolymerNum')),
                    Method_Polymer_Other: firstPresent(formData, 'micro_method_polymer_other', 'micro_methodPolymerOther'),
                    PercentSize_LessThan1um: formData.mp_size_lt_1um ? parseInt(formData.mp_size_lt_1um) : null,
                    PercentSize_1_20um: formData.mp_size_1_20um ? parseInt(formData.mp_size_1_20um) : null,
                    PercentSize_20_100um: formData.mp_size_20_100um ? parseInt(formData.mp_size_20_100um) : null,
                    PercentSize_100um_1mm: formData.mp_size_100um_1mm ? parseInt(formData.mp_size_100um_1mm) : null,
                    PercentSize_1_5mm: formData.mp_size_1_5mm ? parseInt(formData.mp_size_1_5mm) : null,
                    PercentForm_fiber: formData.mp_form_fiber ? parseInt(formData.mp_form_fiber) : null,
                    PercentForm_Pellet: formData.mp_form_pellet ? parseInt(formData.mp_form_pellet) : null,
                    PercentForm_Fragment: formData.mp_form_fragment ? parseInt(formData.mp_form_fragment) : null,
                    PercentColor_Clear: pickInt('mp_color_clear', 'fragment_color_clear'),
                    PercentColor_OpaqueLight: pickInt('mp_color_opaque_light', 'fragment_color_opaque_light'),
                    PercentColor_OpaqueDark: pickInt('mp_color_opaque_dark', 'fragment_color_opaque_dark'),
                    PercentColor_Mixed: pickInt('mp_color_mixed', 'fragment_color_mixed')
                });
                console.log('Microplastics details inserted with ID:', microUniqueId);

                // Insert polymer details for microplastics if provided
                await insertPolymerDetails(connection, microUniqueId, formData, 'microplastics');
            }

            // Step 4: Insert fragments details if provided (complete fields)
            const fragmentDetailRows = [
                ...getDetailRows(formData, 'fragments_color_details', 'fragmentsColorDetails'),
                ...getDetailRows(formData, 'fragments_form_details', 'fragmentsFormDetails'),
                ...getDetailRows(formData, 'fragments_opacity_details', 'fragmentsOpacityDetails'),
                ...getDetailRows(formData, 'fragments_purpose_details', 'fragmentsPurposeDetails')
            ];
            const shouldInsertFragments = formData.has_quantitative_data === 'yes' && (
                parseNullableInt(formData.fragments_count) > 0 ||
                parseNullableInt(formData.packaging_count) > 0 ||
                parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')) > 0 ||
                firstPresent(formData, 'fragments_method_polymer_num', 'fragments_methodPolymerNum') ||
                fragmentDetailRows.length > 0 ||
                hasPolymerPercentages(formData, 'fragment_polymer_')
            );

            if (shouldInsertFragments) {
                console.log('Inserting fragments details...');

                // Generate a unique ID for fragments
                const [maxFragmentIdResult] = await connection.execute(
                    'SELECT MAX(Fragment_UniqueID) as maxId FROM FragmentsInSample'
                );
                fragmentUniqueId = (maxFragmentIdResult[0].maxId || 0) + 1;

                await insertFromMap(connection, 'FragmentsInSample', {
                    Fragment_UniqueID: fragmentUniqueId,
                    SampleDetails_Num: sampleDetailsId,
                    Mass_Debris_Total: parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')),
                    PurposeKnown_Count: parseNullableInt(formData.packaging_count),
                    PurposeUnknown_Count: parseNullableInt(formData.fragments_count),
                    Method_Polymer_Num: parseNullableInt(firstPresent(formData, 'fragments_method_polymer_num', 'fragments_methodPolymerNum')),
                    Method_Polymer_Other: firstPresent(formData, 'fragments_method_polymer_other', 'fragments_methodPolymerOther'),
                    PercentColor_Clear: formData.fragment_color_clear ? parseInt(formData.fragment_color_clear) : null,
                    PercentColor_Op_Color: formData.fragment_color_opaque_light ? parseInt(formData.fragment_color_opaque_light) : null,
                    PercentColor_Op_Dk: formData.fragment_color_opaque_dark ? parseInt(formData.fragment_color_opaque_dark) : null,
                    PercentColor_Mixed: formData.fragment_color_mixed ? parseInt(formData.fragment_color_mixed) : null,
                    PercentForm_Fiber: formData.fragment_form_fiber ? parseInt(formData.fragment_form_fiber) : null,
                    PercentForm_Pellet: formData.fragment_form_pellet ? parseInt(formData.fragment_form_pellet) : null,
                    PercentForm_Film: formData.fragment_form_film ? parseInt(formData.fragment_form_film) : null,
                    PercentForm_Foam: formData.fragment_form_foam ? parseInt(formData.fragment_form_foam) : null,
                    PercentForm_HardPlastic: formData.fragment_form_hardplastic ? parseInt(formData.fragment_form_hardplastic) : null,
                    PercentForm_Other: formData.fragment_form_other ? parseInt(formData.fragment_form_other) : null
                });
                console.log('Fragments details inserted with ID:', fragmentUniqueId);

                // Insert polymer details for fragments if provided
                await insertPolymerDetails(connection, fragmentUniqueId, formData, 'fragments');
            }

            // Step 4B: Insert row-based detail percentages
            if (fragmentUniqueId) {
                await insertDetailRows(connection, {
                    tableName: 'FragmentsColorDetails',
                    idColumn: 'FragmentColor_UniqueID',
                    parentColumn: 'FragInSample_Num',
                    refColumn: 'FragColor_Num',
                    legacyColumn: 'FragColor_Legacy',
                    percentColumn: 'FragColorPercent'
                }, fragmentUniqueId, getDetailRows(formData, 'fragments_color_details', 'fragmentsColorDetails'));

                await insertDetailRows(connection, {
                    tableName: 'FragmentsFormDetails',
                    idColumn: 'FragForm_UniqueID',
                    parentColumn: 'FragInSample_Num',
                    refColumn: 'FragForm_Num',
                    legacyColumn: 'FragForm_Legacy',
                    percentColumn: 'FragFormPercent'
                }, fragmentUniqueId, getDetailRows(formData, 'fragments_form_details', 'fragmentsFormDetails'));

                await insertDetailRows(connection, {
                    tableName: 'FragmentsOpacityDetails',
                    idColumn: 'FragOpacity_UniqueID',
                    parentColumn: 'FragInSample_Num',
                    refColumn: 'FragOpacity_Num',
                    legacyColumn: 'FragOpacity_Legacy',
                    percentColumn: 'FragOpacityPercent'
                }, fragmentUniqueId, getDetailRows(formData, 'fragments_opacity_details', 'fragmentsOpacityDetails'));

                await insertDetailRows(connection, {
                    tableName: 'FragmentsPurposes',
                    idColumn: 'FragPurposeUniqueID',
                    parentColumn: 'FragInSample_Num',
                    refColumn: 'Purpose_Num',
                    legacyColumn: 'Purpose_Legacy',
                    percentColumn: 'Percent_Purpose'
                }, fragmentUniqueId, getDetailRows(formData, 'fragments_purpose_details', 'fragmentsPurposeDetails'));
            }

            if (microUniqueId) {
                await insertDetailRows(connection, {
                    tableName: 'MicroplasticsColorDetails',
                    idColumn: 'MicroColor_UniqueID',
                    parentColumn: 'MicroInSample_Num',
                    refColumn: 'MicroColor_Num',
                    legacyColumn: 'MicroColor_Legacy',
                    percentColumn: 'MicroColorPercent'
                }, microUniqueId, getDetailRows(formData, 'micro_color_details', 'microColorDetails'));

                await insertDetailRows(connection, {
                    tableName: 'MicroplasticsOpacityDetails',
                    idColumn: 'MicroOpacityUniqueID',
                    parentColumn: 'MicroInSample_Num',
                    refColumn: 'MicroOpacity_Num',
                    legacyColumn: 'MicroOpacity_Legacy',
                    percentColumn: 'MicroOpacityPercent'
                }, microUniqueId, getDetailRows(formData, 'micro_opacity_details', 'microOpacityDetails'));

                await insertDetailRows(connection, {
                    tableName: 'MicroplasticsSizeDetails',
                    idColumn: 'MicroplasticsSize_UniqueID',
                    parentColumn: 'MicroInSample_Num',
                    refColumn: 'MicroSize_Num',
                    legacyColumn: 'MicroSize_Legacy',
                    percentColumn: 'MicroSizePercent'
                }, microUniqueId, getDetailRows(formData, 'micro_size_details', 'microSizeDetails'));

                await insertDetailRows(connection, {
                    tableName: 'MicroplasticsFormDetails',
                    idColumn: 'MicroForm_UniqueID',
                    parentColumn: 'MicroInSample_Num',
                    refColumn: 'MicroShape_Num',
                    legacyColumn: 'MicroShape_Legacy',
                    percentColumn: 'MicroShape_Percent'
                }, microUniqueId, getDetailRows(formData, 'micro_shape_details', 'microShapeDetails'));

                await insertDetailRows(connection, {
                    tableName: 'MicroplasticsFormDetails',
                    idColumn: 'MicroForm_UniqueID',
                    parentColumn: 'MicroInSample_Num',
                    refColumn: 'MicroTexture_Num',
                    legacyColumn: 'MicroTexture_Legacy',
                    percentColumn: 'MicroTexture_Percent'
                }, microUniqueId, getDetailRows(formData, 'micro_texture_details', 'microTextureDetails'));
            }

            // Step 5: Insert legacy packaging details only when legacy category inputs are present.
            const legacyPackageCategoryFields = [
                'packaging_count_single_use',
                'packaging_count_multi_use',
                'packaging_count_other_container',
                'packaging_count_bag',
                'packaging_count_packing',
                'packaging_count_other',
                'packaging_count_unknown'
            ];
            const hasLegacyPackageCategoryInput = legacyPackageCategoryFields.some(field => parseNullableInt(formData[field]) > 0);
            if (formData.has_quantitative_data === 'yes' && formData.packaging_count && parseInt(formData.packaging_count) > 0 && hasLegacyPackageCategoryInput) {
                console.log('Inserting packaging details...');

                // Category mapping for the new UI structure
                const categoryMap = [
                    { key: 'single_use', field: 'packaging_count_single_use', purposeCode: 'single_use' },
                    { key: 'multi_use', field: 'packaging_count_multi_use', purposeCode: 'multi_use' },
                    { key: 'other_container', field: 'packaging_count_other_container', purposeCode: 'other_container' },
                    { key: 'bag', field: 'packaging_count_bag', purposeCode: 'bag' },
                    { key: 'packing', field: 'packaging_count_packing', purposeCode: 'packing' },
                    { key: 'other_purpose', field: 'packaging_count_other', purposeCode: 'other_purpose' },
                    { key: 'unknown_purpose', field: 'packaging_count_unknown', purposeCode: 'unknown_purpose' }
                ];

                // Helper to safely parse int
                const safeInt = (val) => {
                    const parsed = parseInt(val);
                    return Number.isFinite(parsed) ? parsed : 0;
                };

                // Insert into PackageCategoryDetails for each category with data
                for (const cat of categoryMap) {
                    const countVal = safeInt(formData[cat.field]);
                    if (countVal <= 0) continue;

                    // Build the detail object for this category
                    const prefix = cat.key;
                    const detailData = {
                        SampleDetails_Num: sampleDetailsId,
                        PurposeCategory: prefix,
                        CategoryCount: countVal,
                        // Recycle codes
                        RecycleCode_0: safeInt(formData[`${prefix}_recycle_0`]),
                        RecycleCode_1: safeInt(formData[`${prefix}_recycle_1`]),
                        RecycleCode_2: safeInt(formData[`${prefix}_recycle_2`]),
                        RecycleCode_3: safeInt(formData[`${prefix}_recycle_3`]),
                        RecycleCode_4: safeInt(formData[`${prefix}_recycle_4`]),
                        RecycleCode_5: safeInt(formData[`${prefix}_recycle_5`]),
                        RecycleCode_6: safeInt(formData[`${prefix}_recycle_6`]),
                        RecycleCode_7: safeInt(formData[`${prefix}_recycle_7`]),
                        // Colors
                        Color_Clear: safeInt(formData[`${prefix}_color_clear`]),
                        Color_Black: safeInt(formData[`${prefix}_color_black`]),
                        Color_Blue: safeInt(formData[`${prefix}_color_blue`]),
                        Color_Green: safeInt(formData[`${prefix}_color_green`]),
                        Color_Pink: safeInt(formData[`${prefix}_color_pink`]),
                        Color_Purple: safeInt(formData[`${prefix}_color_purple`]),
                        Color_Red: safeInt(formData[`${prefix}_color_red`]),
                        Color_White: safeInt(formData[`${prefix}_color_white`]),
                        Color_Yellow: safeInt(formData[`${prefix}_color_yellow`]),
                        Color_Other: safeInt(formData[`${prefix}_color_other`]),
                        // Opacity
                        Opacity_Clear: safeInt(formData[`${prefix}_opacity_clear`]),
                        Opacity_Light: safeInt(formData[`${prefix}_opacity_light`]),
                        Opacity_Dark: safeInt(formData[`${prefix}_opacity_dark`]),
                        Opacity_Mixed: safeInt(formData[`${prefix}_opacity_mixed`])
                    };

                    await connection.execute(`
                        INSERT INTO PackageCategoryDetails (
                            SampleDetails_Num, PurposeCategory, CategoryCount,
                            RecycleCode_0, RecycleCode_1, RecycleCode_2, RecycleCode_3,
                            RecycleCode_4, RecycleCode_5, RecycleCode_6, RecycleCode_7,
                            Color_Clear, Color_Black, Color_Blue, Color_Green,
                            Color_Pink, Color_Purple, Color_Red, Color_White, Color_Yellow, Color_Other,
                            Opacity_Clear, Opacity_Light, Opacity_Dark, Opacity_Mixed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        detailData.SampleDetails_Num,
                        detailData.PurposeCategory,
                        detailData.CategoryCount,
                        detailData.RecycleCode_0,
                        detailData.RecycleCode_1,
                        detailData.RecycleCode_2,
                        detailData.RecycleCode_3,
                        detailData.RecycleCode_4,
                        detailData.RecycleCode_5,
                        detailData.RecycleCode_6,
                        detailData.RecycleCode_7,
                        detailData.Color_Clear,
                        detailData.Color_Black,
                        detailData.Color_Blue,
                        detailData.Color_Green,
                        detailData.Color_Pink,
                        detailData.Color_Purple,
                        detailData.Color_Red,
                        detailData.Color_White,
                        detailData.Color_Yellow,
                        detailData.Color_Other,
                        detailData.Opacity_Clear,
                        detailData.Opacity_Light,
                        detailData.Opacity_Dark,
                        detailData.Opacity_Mixed
                    ]);
                    console.log(`Inserted packaging category '${prefix}' with count ${countVal}`);
                }
            }

            await connection.commit();
            console.log('Transaction committed successfully');

            res.json({
                success: true,
                message: 'Data saved successfully',
                samplingEventId: samplingEventId,
                sampleDetailsId: sampleDetailsId,
                publicationId: publicationId
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error saving form data:', error);
            console.error('Error stack:', error.stack);
            res.status(error.statusCode || 500).json({
                success: false,
                message: 'Error saving data: ' + error.message,
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        } finally {
            connection.release();
        }
    }
);

// Helper functions for data lookup
async function getWeatherTypeId(connection, weatherType) {
    const [rows] = await connection.execute(
        'SELECT WeatherUniqueID FROM WeatherType_Ref WHERE WeatherType = ?',
        [weatherType]
    );
    return rows.length > 0 ? rows[0].WeatherUniqueID : null;
}

async function getMediaTypeId(connection, mediaType) {
    // First try to find exact match in the reference table
    const [rows] = await connection.execute(
        'SELECT MediaTypeUniqueID FROM 	MediaType_WithinLitterWaterSoil_Ref WHERE MediaTypeOverall = ?',
        [mediaType]
    );

    if (rows.length > 0) {
        return rows[0].MediaTypeUniqueID;
    }

    // Fallback to mapping if no exact match found
    const mediaTypeMapping = {
        'water': 1,
        'soil_sediment': 2,
        'in_soil': 2,
        'soil_litter': 3,
        'mixed_composite': 4
    };
    return mediaTypeMapping[mediaType] || 1; // Default to 1 if not found
}

async function getWaterEnvTypeId(connection, environmentType) {
    // First try to find exact match in the reference table
    const [rows] = await connection.execute(
        'SELECT WaterEnv_UniqueID FROM WaterEnvType_Ref WHERE WaterEnv_Name = ?',
        [environmentType]
    );

    if (rows.length > 0) {
        return rows[0].WaterEnv_UniqueID;
    }

    // Fallback to mapping if no exact match found
    const environmentTypeMapping = {
        'Stream': 1,
        'River': 2,
        'Inland Lake': 3,
        'Pond': 4,
        'Wetland': 5,
        'Great Lake': 6,
        'Ocean': 1 // Default to stream if ocean not in database
    };
    return environmentTypeMapping[environmentType] || 1; // Default to 1 if not found
}

function getMediaSubType(formData) {
    // Return the specific media subtype based on media type
    if (formData.media_type === 'water') {
        return formData.water_type || null;
    } else if (formData.media_type === 'soil_sediment') {
        return formData.sediment_type || null;
    }
    return null;
}

function getLandscapeType(formData) {
    // Return the landscape type based on media type
    if (formData.media_type === 'in_soil') {
        return formData.soil_landscape_type || null;
    } else if (formData.media_type === 'soil_litter') {
        return formData.surface_landscape_type || null;
    }
    return null;
}

async function insertPolymerDetails(connection, parentId, formData, type) {
    const tableName = type === 'microplastics' ? 'MicroplasticsPolymerDetails' : 'FragmentsPolymerDetails';
    const idColumn = type === 'microplastics' ? 'MicroPolymerUniqueID' : 'FragPolymerUniqueID';
    const foreignKey = type === 'microplastics' ? 'MicroInSample_Num' : 'FragInSample_Num';
    const fieldPrefix = type === 'microplastics' ? 'mp_polymer_' : 'fragment_polymer_';
    const methodPercentEstimate = type === 'microplastics'
        ? firstPresent(formData, 'micro_method_percent_estimate')
        : firstPresent(formData, 'fragments_method_percent_estimate');

    try {
        // Fetch polymer references
        const [polymerRefs] = await connection.query('SELECT * FROM PolymerType_Ref');

        for (const polymer of polymerRefs) {
            // Match the field name convention (lowercase code)
            // Ensure we handle special characters if necessary, but assuming simple codes for now
            // If DB code is 'PE-UHMW', we might need to normalize.
            // For now assume direct lowercase mapping or frontend matches backend generation.
            const code = polymer.Polymer_Code.toLowerCase().replace(/[^a-z0-9]/g, '_');
            // Note: The previous hardcoded list had 'pe_uhmw', so we normalize to snake_case if needed or just use code.
            // Let's stick to simple lowercase for now, but if the code has hyphens, we might need to check.
            // Actually, if we update the frontend to use the same logic, it will match.

            // However, to maintain backward compatibility with existing hardcoded frontend (until I update it):
            // The existing list has: pete, hdpe, pvc, ldpe, pp, ps, other, pa, pc, rubber, pla, abs, eva, pb, pe_uhmw, pmma, hips, eps, bitumen, pan
            // If DB has 'PE-UHMW', lowercase is 'pe-uhmw'. Existing field is 'pe_uhmw'.
            // I'll try to match both just in case.

            let fieldName = `${fieldPrefix}${code}`;
            let percentage = formData[fieldName];

            if (!percentage && code.includes('-')) {
                 fieldName = `${fieldPrefix}${code.replace(/-/g, '_')}`;
                 percentage = formData[fieldName];
            }
            // Also try exact code if different
            if (!percentage) {
                 fieldName = `${fieldPrefix}${polymer.Polymer_Code.toLowerCase()}`;
                 percentage = formData[fieldName];
            }

            if (percentage && parseInt(percentage) > 0) {
                try {
                    const [maxIdResult] = await connection.execute(
                        `SELECT MAX(${idColumn}) as maxId FROM ${tableName}`
                    );
                    const polymerDetailsId = (maxIdResult[0].maxId || 0) + 1;

                    await connection.execute(`
                        INSERT INTO ${tableName} (
                            ${idColumn}, ${foreignKey}, PolymerID_Num, PolymerType_Legacy,
                            Percentage, Method_PercentEstimate, DateEntered
                        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
                    `, [
                        polymerDetailsId,
                        parentId,
                        polymer.PolymerUniqueID,
                        polymer.Polymer_Code,
                        parseInt(percentage),
                        methodPercentEstimate
                    ]);

                    console.log(`Inserted ${type} polymer detail: ID ${polymer.PolymerUniqueID} (${code}) = ${percentage}%`);
                } catch (error) {
                    console.error(`Error inserting polymer details for ${code}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error processing polymer details:', error);
    }
}

// Upload and process file data
router.post('/upload-file-data',
    requireAuth,
    upload.single('dataFile'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            // Process the uploaded file based on its type
            const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

            if (!['csv', 'xlsx', 'json'].includes(fileExtension)) {
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported file format. Please upload CSV, XLSX, or JSON files.'
                });
            }

            // Here you would implement file parsing logic
            // For now, we'll just acknowledge the upload
            res.json({
                success: true,
                message: 'File uploaded successfully',
                filename: req.file.originalname,
                fileId: req.file.filename
            });

        } catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading file'
            });
        }
    }
);

// Get user's sample data
router.get('/my-samples', requireAuth, async (req, res) => {
    try {
        // Ensure numeric pagination params and apply simple bounds
        const page = Number.isFinite(parseInt(req.query.page, 10)) ? Math.max(1, parseInt(req.query.page, 10)) : 1;
        const limit = Number.isFinite(parseInt(req.query.limit, 10)) ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : 10;
        const offset = (page - 1) * limit;
        const userId = req.session.user_id;

        // Inline numeric LIMIT/OFFSET to avoid prepared statement issues on some MySQL versions
        const samplesSql = `
            SELECT
                sd.SampleUniqueID as id,
                l.\`Lat_DecimalDegree\` as latitude,
                l.\`Long_DecimalDegree\` as longitude,
                mt.MediaTypeOverall as sample_type,
                l.LocationName as location_name,
                se.SamplingDate as collection_date,
                COALESCE(
                    sd.TotalSampleAmount,
                    sd.MicroplasticsSampleAmount,
                    sd.FragmentsSampleAmount,
                    sd.PackagingSampleAmount
                ) as total_sample_amount,
                COALESCE(
                    sd.SampleUnit,
                    sd.MicroplasticsSampleUnit,
                    sd.FragmentsSampleUnit,
                    sd.PackagingSampleUnit
                ) as sample_unit,
                l.Location_Desc as notes,
                se.SamplingDate as created_at
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE se.UserSamplingID = ?
            ORDER BY se.SamplingDate DESC
            LIMIT ${offset}, ${limit}
        `;

        const [rows] = await pool.execute(samplesSql, [userId]);

        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            WHERE se.UserSamplingID = ?
        `, [userId]);

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching user samples:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching samples'
        });
    }
});

// Update sample data - Remove this endpoint as it references non-existent table
// router.put('/sample/:id', requireAuth, [...], async (req, res) => { ... });

// Delete sample data - Remove this endpoint as it references non-existent table
// router.delete('/sample/:id', requireAuth, async (req, res) => { ... });

// Check session status
router.get('/check-session', (req, res) => {
    try {
        if (!req.session || !req.session.user_id) {
            return res.json({
                logged_in: false,
                timeout: false
            });
        }

        // Check if session has timed out
        const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000; // 30 minutes default
        const now = Date.now();
        const lastActivity = req.session.last_activity || req.session.cookie.expires;

        if (lastActivity && (now - lastActivity) > sessionTimeout) {
            return res.json({
                logged_in: true,
                timeout: true,
                message: 'Your session has expired due to inactivity. Please log in again.'
            });
        }

        // Update last activity
        req.session.last_activity = now;

        res.json({
            logged_in: true,
            timeout: false,
            user_id: req.session.user_id,
            username: req.session.username        });
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({
            logged_in: false,
            timeout: false,
            error: 'Session check failed'
        });
    }
});

// Check if location name exists
router.get('/check-location-exists', async (req, res) => {
    try {
        const { name } = req.query;

        if (!name || !name.trim()) {
            return res.json({
                success: true,
                exists: false,
                message: 'No location name provided'
            });
        }

        // Check only in Location table
        const [locationRows] = await pool.execute(
            'SELECT COUNT(*) as count FROM Location WHERE LocationName = ?',
            [name.trim()]
        );

        const existsInLocation = locationRows[0].count > 0;

        res.json({
            success: true,
            exists: existsInLocation,
            details: {
                inLocationTable: existsInLocation,
                locationCount: locationRows[0].count
            }
        });

    } catch (error) {
        console.error('Error checking location existence:', error);
        res.status(500).json({
            success: false,
            exists: false,
            message: 'Error checking location existence'
        });
    }
});

// Get locations from Location table

router.get('/locations', async (req, res) => {

    try {

        let sql = `

            SELECT

                Loc_UniqueID as id,

                UserLocID_txt as userLocId,

                LocationName as name,

                Location_Desc as description,

                City as city,

                State as state,

                ZipCode as zipCode,

                \`Lat_DecimalDegree\` as latitude,

                \`Long_DecimalDegree\` as longitude

            FROM Location

            WHERE 1=1

        `;



        const params = [];



        // Filter by logged-in user if session exists

        if (req.session && req.session.username) {

            sql += " AND UserCreated = ?";

            params.push(req.session.username);

        }



        sql += " ORDER BY LocationName ASC";



        // Query the location table from database_init.sql

        const [rows] = await pool.execute(sql, params);



        res.json({

            success: true,

            locations: rows,

            count: rows.length

        });



    } catch (error) {

        console.error('Error fetching locations:', error);

        res.status(500).json({

            success: false,

            message: 'Error fetching locations',

            locations: []

        });

    }

});

// Create new location
router.post('/locations',
    requireAuth,    [        body('locationName').notEmpty().withMessage('Location name is required').isLength({ max: 255 }).withMessage('Location name too long'),
        body('locationShortCode').notEmpty().withMessage('Location short code is required').isLength({ max: 50 }).withMessage('Location short code too long'),
        body('locationDescription').notEmpty().withMessage('Location description is required').isLength({ max: 500 }).withMessage('Location description too long'),
        body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
        body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
        body('streetAddress').optional().isLength({ max: 500 }).withMessage('Street address too long'),
        body('city').optional().isLength({ max: 100 }).withMessage('City name too long'),
        body('state').optional().isLength({ max: 100 }).withMessage('State name too long'),
        body('country').optional().isLength({ max: 100 }).withMessage('Country name too long'),
        body('zipCode').optional().isLength({ max: 20 }).withMessage('Zip code too long')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }            const {
                locationName,
                locationShortCode,
                locationDescription,
                latitude,
                longitude,
                streetAddress,
                city,
                state,
                country,
                zipCode,
                acres // Extract acres from body
            } = req.body;

            // Validate that at least one location group is provided
            const hasCoordinates = latitude !== null && longitude !== null;
            const hasAddress = streetAddress && city && state && country;
            const hasZipCode = zipCode;

            if (!hasCoordinates && !hasAddress && !hasZipCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide either coordinates, complete address, or zip code'
                });            }            // Insert into location table (use lowercase table name)
            const [result] = await pool.execute(`
                INSERT INTO Location (
                    UserLocID_txt,
                    LocationName,
                    Location_Desc,
                    \`Lat_DecimalDegree\`,
                    \`Long_DecimalDegree\`,
                    StreetAddress,
                    City,
                    State,
                    Country,
                    ZipCode,
                    \`Area_acres\`,
                    \`Env_Indoor_SelectID\`,
                    UserCreated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                locationShortCode || null, // Add the short code field
                locationName,
                locationDescription, // Use the actual location description
                latitude || null,
                longitude || null,
                streetAddress || null,
                city || null,
                state || null,
                country || null,
                zipCode ? parseInt(zipCode) || null : null, // Convert to integer
                acres ? parseFloat(acres) : null, // Insert Area_acres
                1, // Default to Environmental (Outdoors)
                req.session.username || 'system'
            ]);

            res.json({
                success: true,
                message: 'Location created successfully',
                locationId: result.insertId
            });

        } catch (error) {
            console.error('Error creating location:', error);
              // Check for duplicate location name
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    message: 'A location with this name already exists'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Error creating location'
            });
        }
    }
);

// ========== MY LOCATIONS API ENDPOINTS ==========

// Get user's locations
router.get('/my-locations', requireAuth, async (req, res) => {
    try {
    const userId = String(req.session.user_id);
        const username = req.session.username;

        // Check if user is authenticated
        if (!userId || !username) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const query = `
            SELECT
                Loc_UniqueID as id,
                UserLocID_txt as userLocId,
                LocationName as name,
                Location_Desc as description,
                City as city,
                State as state,
                Country as country,
                StreetAddress as streetAddress,
                ZipCode as zipCode,
                \`Lat_DecimalDegree\` as latitude,
                \`Long_DecimalDegree\` as longitude,
                UserCreated as userCreated,
                0 as sample_count
            FROM Location
            WHERE UserCreated = ?
            ORDER BY Loc_UniqueID DESC
        `;

        const [locations] = await pool.execute(query, [username]);

        res.json({
            success: true,
            locations: locations,
            total: locations.length
        });
    } catch (error) {
        console.error('Error fetching user locations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching locations: ' + error.message
        });
    }
});

// Contact form submission endpoint
router.post('/contact', [
    body('user_name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('user_email').isEmail().normalizeEmail().withMessage('Please enter a valid email address'),
    body('user_organization').optional().trim().isLength({ max: 200 }).withMessage('Organization name is too long'),
    body('question_category').isIn([
        'general', 'data-entry', 'data-analysis', 'technical',
        'research', 'manuals', 'sample-analysis', 'other'
    ]).withMessage('Please select a valid question category'),
    body('user_question').trim().isLength({ min: 10, max: 2000 }).withMessage('Question must be between 10 and 2000 characters'),
    body('subscribe_updates').optional().isIn(['yes']).withMessage('Invalid subscription option')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please check your form data',
                errors: errors.array()
            });
        }

        const contactData = {
            user_name: req.body.user_name,
            user_email: req.body.user_email,
            user_organization: req.body.user_organization || null,
            question_category: req.body.question_category,
            user_question: req.body.user_question,
            subscribe_updates: req.body.subscribe_updates || 'no'
        };

        // Save contact form submission to database (optional)
        try {
            await pool.execute(`
                INSERT INTO contact_submissions (
                    user_name, user_email, user_organization,
                    question_category, user_question, subscribe_updates,
                    submission_date, ip_address
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
            `, [
                contactData.user_name,
                contactData.user_email,
                contactData.user_organization,
                contactData.question_category,
                contactData.user_question,
                contactData.subscribe_updates,
                req.ip
            ]);
        } catch (dbError) {
            console.error('Database save error (continuing):', dbError);
            // Continue even if database save fails
        }

        // Import email service
        const { sendContactFormEmail, sendContactConfirmationEmail } = require('../services/emailService');

        // Send email to administrators
        const adminEmailResult = await sendContactFormEmail(contactData);

        // Send confirmation email to user
        const userEmailResult = await sendContactConfirmationEmail(contactData);

        if (adminEmailResult.success) {
            res.json({
                success: true,
                message: 'Thank you for your message! We have received your inquiry and will respond within 1-2 business days.',
                data: {
                    confirmation_sent: userEmailResult.success,
                    admin_notified: adminEmailResult.success
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'There was an error sending your message. Please try again or contact us directly.'
            });
        }

    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'There was an error processing your request. Please try again.'
        });
    }
});

// Admin Contact Submissions API
router.get('/admin/contact-submissions', requireAuth, async (req, res) => {
    try {
        const { status, category } = req.query;

        let query = 'SELECT * FROM contact_submissions';
        let params = [];
        let conditions = [];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        if (category) {
            conditions.push('question_category = ?');
            params.push(category);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY submission_date DESC';

        const [submissions] = await pool.execute(query, params);

        // Get stats
        const [rows] = await pool.execute(`
            SELECT
                status,
                COUNT(*) as count
            FROM contact_submissions
            GROUP BY status
        `);

        const stats = {
            total: submissions.length,
            new: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0
        };


        res.json({
            success: true,
            submissions,
            stats
        });

    } catch (error) {
        console.error('Error fetching contact submissions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching contact submissions'
        });
    }
});

// Update contact submission status
router.put('/admin/contact-submissions/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const updateData = { status };

        // If resolving, set resolved_date and resolved_by
        if (status === 'resolved') {
            updateData.resolved_date = new Date();
            updateData.resolved_by = req.session.user.username; // Assuming user info in session
        }

        await pool.execute(
            'UPDATE contact_submissions SET status = ?, resolved_date = ?, resolved_by = ? WHERE id = ?',
            [status, updateData.resolved_date || null, updateData.resolved_by || null, id]
        );

        res.json({
            success: true,
            message: 'Status updated successfully'
        });

    } catch (error) {
        console.error('Error updating contact submission status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status'
        });
    }
});

// Download template files
router.get('/download-template', requireAuth, async (req, res) => {
    try {
        const templateType = req.query.type || 'comprehensive';

        // Generate template based on type
        const template = generateTemplate(templateType);

        if (templateType === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="microplastics_data_template.csv"');
            res.send(template);
        } else {
            // For Excel files, we would use a library like xlsx
            // For now, return CSV format until Excel library is implemented
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="microplastics_data_template_${templateType}.csv"`);
            res.send(template);
        }

    } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating template file'
        });
    }
});

// Function to generate template content
function generateTemplate(templateType) {
    const headers = [
        // Location Information
        'location_name', 'location_shortcode', 'latitude', 'longitude', 'streetaddress',
        'city', 'state', 'country', 'zip_code',

        // Sample Information
        'sample_date', 'media_type', 'water_type', 'sediment_type',

        // Weather Conditions
        'air_temp', 'current_conditions', 'recent_rainfall_amount', 'recent_rainfall_period',

        // Sample Details
        'microplastics_count', 'microplastics_sample_amount', 'microplastics_sample_unit',
        'fragments_count', 'fragments_sample_amount', 'fragments_sample_unit',
        'packaging_count', 'packaging_sample_amount', 'packaging_sample_unit',

        // Microplastics Percentages
        'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um', 'mp_size_100um_1mm', 'mp_size_1_5mm',
        'mp_color_clear', 'mp_color_opaque_light', 'mp_color_opaque_dark', 'mp_color_mixed',
        'mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment',
        // Fragments color percentages
        'fragment_color_clear', 'fragment_color_opaque_light', 'fragment_color_opaque_dark', 'fragment_color_mixed',

        // Polymer Types (sample selection)
        'mp_polymer_pete', 'mp_polymer_hdpe', 'mp_polymer_pvc', 'mp_polymer_ldpe', 'mp_polymer_pp',
        'mp_polymer_ps', 'mp_polymer_pa', 'mp_polymer_pc', 'mp_polymer_pla', 'mp_polymer_abs',

        // Packaging Details
        'packaging_count_single_use', 'packaging_count_multi_use',
        'single_use_recycle_1', 'single_use_recycle_2', 'single_use_recycle_3', 'single_use_recycle_4',
        'single_use_recycle_5', 'single_use_recycle_6', 'single_use_recycle_7',
        'multi_use_recycle_1', 'multi_use_recycle_2', 'multi_use_recycle_3', 'multi_use_recycle_4',
        'multi_use_recycle_5', 'multi_use_recycle_6', 'multi_use_recycle_7'
    ];

    if (templateType === 'comprehensive') {
        // Single comprehensive template with all fields
        let csvContent = headers.join(',') + '\n';

        // Add example row with sample data
        const exampleRow = headers.map(() => '').join(',');
        csvContent += exampleRow + '\n';

        // Add comments explaining each field (as separate lines)
        csvContent += '\n# Field Descriptions:\n';
        csvContent += '# location_name: Name of sampling location (required)\n';
        csvContent += '# sample_date: Date of sample collection (YYYY-MM-DD format)\n';
        csvContent += '# media_type: water, soil_sediment, in_soil, soil_litter, or mixed_composite\n';
        csvContent += '# Percentage fields: Must sum to 100% or leave all blank in each group\n';
        csvContent += '# Packaging counts: Recycle codes must sum to their respective totals\n';

        return csvContent;

    } else if (templateType === 'multi-sheet') {
        // For multi-sheet, return comprehensive for now
        // In a real implementation, this would generate multiple sheets
        return generateTemplate('comprehensive');

    } else if (templateType === 'csv') {
        // Basic CSV template
        return headers.join(',') + '\n';
    }

    return headers.join(',') + '\n';
}

// Get map data for home page - public endpoint showing all sample locations
router.get('/map-data', async (req, res) => {
    try {
        const sql = `
            SELECT
                sd.SampleUniqueID as id,
                l.LocationName as location,
                l.\`Lat_DecimalDegree\` as lat,
                l.\`Long_DecimalDegree\` as lng,
                mt.MediaTypeOverall as sampleType,
                se.SamplingDate as date,
                COUNT(DISTINCT sd.SampleUniqueID) as particleCount
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat_DecimalDegree\` IS NOT NULL
              AND l.\`Long_DecimalDegree\` IS NOT NULL
            GROUP BY sd.SampleUniqueID, l.LocationName, l.\`Lat_DecimalDegree\`, l.\`Long_DecimalDegree\`, mt.MediaTypeOverall, se.SamplingDate
            ORDER BY se.SamplingDate DESC
        `;

        const [rows] = await pool.execute(sql);

        res.json({
            success: true,
            data: rows,
            count: rows.length
        });

    } catch (error) {
        console.error('Error fetching map data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching map data',
            data: []
        });
    }
});

module.exports = router;
