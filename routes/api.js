const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const {
    PERCENTAGE_DECIMAL_PLACES,
    PERCENTAGE_TOLERANCE,
    isPercentageTotalValid,
    parsePercentage,
    toDatabasePercentage
} = require('../utils/percentage');
const {
    addPartialDatePresentation,
    normalizeSamplingEventDates
} = require('../utils/sampling-date');

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
function validatePercentageGroups(formData, options = {}) {
    const { includeLegacyColumnGroups = true } = options;
    const legacyColumnGroups = new Set([
        'mp_size',
        'mp_color',
        'mp_form',
        'fragment_color',
        'fragment_form'
    ]);
    const percentageGroups = {
        // Active polymer detail groups
        mp_polymer: getSubmittedPolymerPercentageFields(formData, 'mp_polymer_'),
        fragment_polymer: getSubmittedPolymerPercentageFields(formData, 'fragment_polymer_')
    };

    // These fixed columns belong to the retired, hidden percentage UI. Keep
    // validating them for legacy create clients, but never make an edit of an
    // existing record depend on values the current UI cannot display or change.
    if (includeLegacyColumnGroups) {
        Object.assign(percentageGroups, {
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
            // Fragments color percentages
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
            ]
        });
    }

    const errors = [];

    for (const [groupName, fields] of Object.entries(percentageGroups)) {
        let total = 0;
        let hasAnyValue = false;
        let hasInvalidValue = false;

        fields.forEach(fieldName => {
            const value = formData[fieldName];
            if (value !== undefined && value !== null && value !== '') {
                hasAnyValue = true;
                try {
                    const numValue = parsePercentage(value, fieldName);
                    if (numValue !== null) {
                        if (legacyColumnGroups.has(groupName) && !Number.isInteger(numValue)) {
                            hasInvalidValue = true;
                            errors.push({
                                group: groupName,
                                field: fieldName,
                                message: `${fieldName} is a retired integer percentage field and cannot store decimals.`
                            });
                            return;
                        }
                        total += numValue;
                    }
                } catch (error) {
                    hasInvalidValue = true;
                    errors.push({
                        group: groupName,
                        field: fieldName,
                        message: error.message
                    });
                }
            }
        });

        // Only validate if user has entered any values in this group
        if (hasAnyValue && !hasInvalidValue) {
            if (!isPercentageTotalValid(total)) {
                errors.push({
                    group: groupName,
                    total: total.toFixed(PERCENTAGE_DECIMAL_PLACES),
                    message: `${groupName} percentages sum to ` +
                        `${total.toFixed(PERCENTAGE_DECIMAL_PLACES)}% but must equal ` +
                        `100% ± ${PERCENTAGE_TOLERANCE}%`
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

// Fragments (>5mm) and whole packaging are entered as one count
// (`fragments_count`). Older payloads may still carry a separate
// `packaging_count`; it is folded into the same total.
function getFragmentDebrisCount(formData) {
    const fragmentsCount = parseNullableInt(formData.fragments_count);
    const legacyPackagingCount = parseNullableInt(formData.packaging_count);

    return fragmentsCount === null && legacyPackagingCount === null
        ? null
        : (fragmentsCount || 0) + (legacyPackagingCount || 0);
}

// FragmentsInSample historically split the count into PurposeKnown_Count
// (whole packaging) and PurposeUnknown_Count (fragments). The form now
// records one merged count. Once db/20260815_merge_fragment_purpose_counts.sql
// has run, the merged count lives in FragmentsInSample.FragLargerThan5mm_Count
// (mirroring SampleDetails); until then it is kept in PurposeUnknown_Count,
// which the migration folds into the new column.
async function buildFragmentCountColumns(connection, formData, tableColumns = null) {
    const columns = tableColumns || await getTableColumns(connection, 'FragmentsInSample');
    const mergedCount = getFragmentDebrisCount(formData);

    if (columns.has('FragLargerThan5mm_Count')) {
        const data = { FragLargerThan5mm_Count: mergedCount };
        // Clear any legacy split still present so it cannot disagree with the merged count.
        if (columns.has('PurposeKnown_Count')) data.PurposeKnown_Count = null;
        if (columns.has('PurposeUnknown_Count')) data.PurposeUnknown_Count = null;
        return data;
    }

    return {
        PurposeUnknown_Count: mergedCount,
        PurposeKnown_Count: null
    };
}

// Reads the merged fragments count back from a FragmentsInSample row,
// whichever schema generation it was written under.
function readFragmentCountFromRow(fragmentRow) {
    if (!fragmentRow) return null;
    if (fragmentRow.FragLargerThan5mm_Count !== undefined && fragmentRow.FragLargerThan5mm_Count !== null) {
        return fragmentRow.FragLargerThan5mm_Count;
    }
    const known = fragmentRow.PurposeKnown_Count;
    const unknown = fragmentRow.PurposeUnknown_Count;
    if ((known === undefined || known === null) && (unknown === undefined || unknown === null)) {
        return null;
    }
    return (Number(known) || 0) + (Number(unknown) || 0);
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
    const hasSnakeKey = Object.prototype.hasOwnProperty.call(formData, snakeKey);
    const hasCamelKey = Object.prototype.hasOwnProperty.call(formData, camelKey);
    if (snakeKey !== camelKey && hasSnakeKey && hasCamelKey) {
        const error = new TypeError(
            `Submit only one of ${snakeKey} or ${camelKey}, not both.`
        );
        error.statusCode = 400;
        throw error;
    }

    const submittedKey = hasSnakeKey
        ? snakeKey
        : (hasCamelKey ? camelKey : null);

    if (!submittedKey) {
        return [];
    }

    const value = formData[submittedKey];
    if (!Array.isArray(value)) {
        const error = new TypeError(`${submittedKey} must be an array.`);
        error.statusCode = 400;
        throw error;
    }

    return value;
}

function normalizeDetailRow(row, fieldName = 'Detail percentage') {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        const error = new TypeError(`${fieldName} row must be an object.`);
        error.statusCode = 400;
        throw error;
    }

    const rawRefNum = row.ref_num ?? row.refNum;
    let refNum = null;
    if (rawRefNum !== undefined && rawRefNum !== null && rawRefNum !== '') {
        const parsedRefNum = Number(rawRefNum);
        if (!Number.isInteger(parsedRefNum) || parsedRefNum <= 0) {
            const error = new TypeError(`${fieldName} reference ID must be a positive integer.`);
            error.statusCode = 400;
            throw error;
        }
        refNum = parsedRefNum;
    }

    let percent;
    try {
        percent = parsePercentage(row.percent, fieldName);
    } catch (error) {
        error.statusCode = 400;
        throw error;
    }

    return {
        refNum,
        legacy: String(row.legacy ?? ''),
        percent,
        methodPercentEstimate: row.method_percent_estimate ?? row.methodPercentEstimate ?? null
    };
}

function hasPolymerPercentages(formData, prefix) {
    return getSubmittedPolymerPercentageFields(formData, prefix)
        .some(key => parseNullableFloat(formData[key]) > 0);
}

function getSubmittedPolymerPercentageFields(formData, prefix) {
    return Object.keys(formData)
        .filter(fieldName => fieldName.startsWith(prefix) && !fieldName.endsWith('_specify'));
}

// "Other" polymer support: PolymerType_Ref.Polymer_Code = 'Other' carries a
// free-text description posted as `<prefix>other_specify` and stored in
// <Microplastics|Fragments>PolymerDetails.PolymerOther_Desc on the Other row
// (db/20260815_add_polymer_other_description.sql).
const OTHER_POLYMER_CODE = 'other';
const OTHER_POLYMER_SPECIFY_SUFFIX = 'other_specify';
const POLYMER_OTHER_DESC_COLUMN = 'PolymerOther_Desc';
const POLYMER_OTHER_DESC_MAX_LENGTH = 255;

function isOtherPolymerCode(polymerCode) {
    return normalizeRefCodeForField(polymerCode) === OTHER_POLYMER_CODE;
}

function getOtherPolymerDescription(formData, prefix) {
    const raw = formData[`${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`];
    if (raw === undefined || raw === null) return null;
    const trimmed = String(raw).trim();
    return trimmed === '' ? null : trimmed;
}

// The Other percentage and its description must be entered together. Only
// evaluated when the polymer group is part of the payload (an update that
// leaves the group untouched omits every one of its fields).
function validateOtherPolymerDescription(formData, prefix, groupLabel) {
    const errors = [];
    const otherField = `${prefix}${OTHER_POLYMER_CODE}`;
    const specifyField = `${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`;
    const groupSubmitted = Object.prototype.hasOwnProperty.call(formData, otherField) ||
        Object.prototype.hasOwnProperty.call(formData, specifyField);
    if (!groupSubmitted) return errors;

    const otherPercent = parseNullableFloat(formData[otherField]);
    const description = getOtherPolymerDescription(formData, prefix);

    if (description && description.length > POLYMER_OTHER_DESC_MAX_LENGTH) {
        errors.push(`${groupLabel} "Other" polymer description must be ${POLYMER_OTHER_DESC_MAX_LENGTH} characters or fewer.`);
    }
    if (otherPercent > 0 && !description) {
        errors.push(`${groupLabel} polymer types: describe the "Other" polymer(s) (${specifyField}).`);
    }
    if (description && !(otherPercent > 0)) {
        errors.push(`${groupLabel} polymer types: an "Other" description was given but the Other percentage is blank or 0.`);
    }
    return errors;
}

function hasMicroplasticsDetailData(formData) {
    const detailRows = [
        ...getDetailRows(formData, 'micro_color_details', 'microColorDetails'),
        ...getDetailRows(formData, 'micro_shape_details', 'microShapeDetails'),
        ...getDetailRows(formData, 'micro_texture_details', 'microTextureDetails'),
        ...getDetailRows(formData, 'micro_opacity_details', 'microOpacityDetails'),
        ...getDetailRows(formData, 'micro_size_details', 'microSizeDetails')
    ];

    return parseNullableInt(formData.microplastics_count) > 0 ||
        parseNullableFloat(firstPresent(formData, 'micro_mass_mp_total', 'micro_massMPTotal')) > 0 ||
        Boolean(firstPresent(formData, 'micro_method_polymer_num', 'micro_methodPolymerNum')) ||
        detailRows.length > 0 ||
        hasPolymerPercentages(formData, 'mp_polymer_') ||
        hasAnyFormValue(formData, [
            'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um',
            'mp_size_100um_1mm', 'mp_size_1_5mm',
            'mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment',
            'mp_color_clear', 'mp_color_opaque_light', 'mp_color_opaque_dark', 'mp_color_mixed'
        ]);
}

function hasFragmentsDetailData(formData) {
    return getFragmentDebrisCount(formData) > 0 ||
        parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')) > 0 ||
        hasDebrisDetailData(formData) ||
        hasAnyFormValue(formData, [
            'fragment_color_clear', 'fragment_color_opaque_light',
            'fragment_color_opaque_dark', 'fragment_color_mixed',
            'fragment_form_fiber', 'fragment_form_pellet', 'fragment_form_film',
            'fragment_form_foam', 'fragment_form_hardplastic', 'fragment_form_other'
        ]);
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

// Measurements, counts and amounts that can never be negative. Air temperature,
// latitude and longitude are deliberately absent. Percent-type fields are
// additionally capped at 100.
const NON_NEGATIVE_NUMERIC_FIELDS = {
    // Page 2
    rainfall: 'Rainfall',
    // Page 4 – water
    volume_sampled: 'Volume sampled',
    total_water_depth: 'Total water depth',
    water_depth: 'Water depth',
    sample_water_depth: 'Sample water depth',
    water_flow_velocity: 'Water flow velocity',
    flow_velocity: 'Flow velocity',
    turbidity: 'Turbidity',
    total_suspended_solids: 'Total suspended solids',
    suspended_solids: 'Suspended solids',
    dissolved_oxygen: 'Dissolved oxygen',
    conductivity: 'Conductivity',
    // Page 4 – sediment / soil
    sediment_depth: 'Sediment sampling depth',
    sediment_dry_weight: 'Sediment dry weight',
    soil_depth: 'Soil depth',
    soil_sample_dry_weight: 'Soil sample dry weight',
    soil_dry_weight: 'Soil dry weight',
    surface_area_sampled: 'Area sampled',
    // Page 5
    replicates_count: 'Number of replicates',
    total_sample_amount: 'Total sample amount',
    totalSampleAmount: 'Total sample amount',
    microplastics_sample_amount: 'Microplastics sample amount',
    fragments_sample_amount: 'Fragments sample amount',
    packaging_sample_amount: 'Packaging sample amount',
    microplastics_count: 'Microplastics count',
    fragments_count: 'Fragments count',
    packaging_count: 'Packaging count',
    micro_mass_mp_total: 'Total microplastics mass',
    micro_massMPTotal: 'Total microplastics mass',
    fragments_mass_debris_total: 'Total fragments mass',
    fragments_massDebrisTotal: 'Total fragments mass'
};

const PERCENT_NUMERIC_FIELDS = {
    sediment_organic_matter: 'Sediment organic matter (%)',
    sediment_moisture: 'Sediment moisture (%)',
    sediment_sand: 'Sediment sand (%)',
    sediment_silt: 'Sediment silt (%)',
    sediment_clay: 'Sediment clay (%)',
    soil_organic_matter: 'Soil organic matter (%)',
    soil_moisture: 'Soil moisture (%)',
    soil_moisture_content: 'Soil moisture (%)',
    soil_sand: 'Soil sand (%)',
    soil_silt: 'Soil silt (%)',
    soil_clay: 'Soil clay (%)',
    permeable_surfaces: 'Permeable surfaces (%)',
    impermeable_surfaces: 'Impermeable surfaces (%)'
};

const WHOLE_NUMBER_FIELDS = ['replicates_count', 'microplastics_count', 'fragments_count', 'packaging_count'];

// Plain decimal notation only ("12", "0.5", "-3.25"). Exponent and hex forms
// ("1e3", "0x10") are valid to Number() but the storage path uses
// parseInt/parseFloat, which read them as 1 and 0 – so they are rejected here.
const PLAIN_DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const PLAIN_INTEGER_PATTERN = /^[+-]?\d+$/;

function validateNumericRanges(formData) {
    const errors = [];
    const check = (fieldName, label, { max = null, integer = false } = {}) => {
        const raw = formData[fieldName];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        const text = String(raw).trim();
        if (!PLAIN_DECIMAL_PATTERN.test(text)) {
            errors.push(`${label} must be a plain number (digits and a decimal point only).`);
            return;
        }
        const value = Number(text);
        if (!Number.isFinite(value)) {
            errors.push(`${label} must be a number.`);
            return;
        }
        if (value < 0) {
            errors.push(`${label} cannot be negative.`);
            return;
        }
        if (max !== null && value > max) {
            errors.push(`${label} cannot exceed ${max}.`);
            return;
        }
        if (integer && !PLAIN_INTEGER_PATTERN.test(text)) {
            errors.push(`${label} must be a whole number.`);
        }
    };

    Object.entries(NON_NEGATIVE_NUMERIC_FIELDS).forEach(([fieldName, label]) => {
        check(fieldName, label, { integer: WHOLE_NUMBER_FIELDS.includes(fieldName) });
    });
    Object.entries(PERCENT_NUMERIC_FIELDS).forEach(([fieldName, label]) => {
        check(fieldName, label, { max: 100 });
    });

    return errors;
}

function validateNewSaveRules(formData) {
    const errors = [];
    const totalSampleAmount = firstPresent(formData, 'total_sample_amount', 'totalSampleAmount');
    const sampleUnit = firstPresent(formData, 'sample_unit', 'sampleUnit');

    errors.push(...validateNumericRanges(formData));

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
    if (!hasQuantitativeData && (hasMicroplasticsDetailData(formData) || hasFragmentsDetailData(formData))) {
        errors.push(
            'Quantitative details were provided while Has Quantitative Data is not Yes. ' +
            'Select Yes or clear those details so they are not silently omitted.'
        );
    }
    const debrisCount = getFragmentDebrisCount(formData) || 0;
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

    const duplicateRepresentationGroups = [
        {
            label: 'Microplastics size',
            legacyFields: [
                'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um',
                'mp_size_100um_1mm', 'mp_size_1_5mm'
            ],
            detailKeys: ['micro_size_details', 'microSizeDetails']
        },
        {
            label: 'Microplastics color',
            legacyFields: [
                'mp_color_clear', 'mp_color_opaque_light',
                'mp_color_opaque_dark', 'mp_color_mixed'
            ],
            detailKeys: ['micro_color_details', 'microColorDetails']
        },
        {
            label: 'Microplastics form',
            legacyFields: ['mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment'],
            detailKeys: ['micro_shape_details', 'microShapeDetails']
        },
        {
            label: 'Fragments color',
            legacyFields: [
                'fragment_color_clear', 'fragment_color_opaque_light',
                'fragment_color_opaque_dark', 'fragment_color_mixed'
            ],
            detailKeys: ['fragments_color_details', 'fragmentsColorDetails']
        },
        {
            label: 'Fragments form',
            legacyFields: [
                'fragment_form_fiber', 'fragment_form_pellet', 'fragment_form_film',
                'fragment_form_foam', 'fragment_form_hardplastic', 'fragment_form_other'
            ],
            detailKeys: ['fragments_form_details', 'fragmentsFormDetails']
        }
    ];

    duplicateRepresentationGroups.forEach(group => {
        const hasLegacyValues = hasAnyFormValue(formData, group.legacyFields);
        const hasActiveRows = getDetailRows(formData, ...group.detailKeys).length > 0;
        if (hasLegacyValues && hasActiveRows) {
            errors.push(
                `${group.label} was submitted in both retired fixed columns and active detail rows. ` +
                'Submit only the active detail rows.'
            );
        }
    });

    detailGroups.forEach(([snakeKey, camelKey]) => {
        const rows = getDetailRows(formData, snakeKey, camelKey);
        if (rows.length === 0) return;

        try {
            const normalizedRows = rows.map((row, index) =>
                normalizeDetailRow(row, `${snakeKey}[${index}].percent`)
            );
            const incompleteRow = normalizedRows.find(row =>
                row.refNum === null || row.percent === null
            );
            if (incompleteRow) {
                errors.push(`${snakeKey} has a row missing its reference or percentage.`);
                return;
            }

            const total = normalizedRows.reduce((sum, row) => sum + row.percent, 0);
            if (!isPercentageTotalValid(total)) {
                errors.push(
                    `${snakeKey} percentages sum to ${total.toFixed(PERCENTAGE_DECIMAL_PLACES)}% ` +
                    `but must equal 100% ± ${PERCENTAGE_TOLERANCE}%.`
                );
            }

            const missingMethod = normalizedRows.some(row => !row.methodPercentEstimate);
            if (missingMethod) {
                errors.push(`${snakeKey} requires a percent-estimation method for every provided row.`);
            }
        } catch (error) {
            errors.push(error.message);
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

    errors.push(...validateOtherPolymerDescription(formData, 'mp_polymer_', 'Microplastics'));
    errors.push(...validateOtherPolymerDescription(formData, 'fragment_polymer_', 'Fragments'));

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

    if (entries.length === 0) {
        return;
    }

    const columns = entries.map(([column]) => `\`${column}\``).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const values = entries.map(([, value]) => value);

    await connection.execute(
        `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
        values
    );
}

async function updateFromMap(connection, tableName, dataMap, whereSql, whereValues, tableColumns = null) {
    const availableColumns = tableColumns || await getTableColumns(connection, tableName);
    const entries = Object.entries(dataMap).filter(([column]) => availableColumns.has(column));

    if (entries.length === 0) {
        return;
    }

    const assignments = entries.map(([column]) => `\`${column}\` = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    await connection.execute(
        `UPDATE ${tableName} SET ${assignments} WHERE ${whereSql}`,
        [...values, ...whereValues]
    );
}

async function nextTableId(connection, tableName, idColumn) {
    const [rows] = await connection.execute(`SELECT MAX(\`${idColumn}\`) as maxId FROM ${tableName}`);
    return (rows[0].maxId || 0) + 1;
}

const DETAIL_REFERENCE_RULES = {
    'FragmentsColorDetails:FragColor_Num': {
        tableName: 'ColorType_Ref', idColumn: 'ColorUniqueID', legacyColumn: 'Color_Code',
        methodAppliesColumn: 'AppliesTo_Debris'
    },
    'FragmentsFormDetails:FragForm_Num': {
        tableName: 'Form_Ref', idColumn: 'FormUniqueID', legacyColumn: 'Form_Name',
        applicabilityColumn: 'AppliesTo_Texture', methodAppliesColumn: 'AppliesTo_Debris'
    },
    'FragmentsOpacityDetails:FragOpacity_Num': {
        tableName: 'Opacity_Ref', idColumn: 'OpacityUniqueID', legacyColumn: 'Opacity_Code',
        methodAppliesColumn: 'AppliesTo_Debris'
    },
    'FragmentsPurposes:Purpose_Num': {
        tableName: 'Purpose_Ref', idColumn: 'PurposeUniqueID', legacyColumn: 'Purpose_Code',
        methodAppliesColumn: 'AppliesTo_Debris'
    },
    'MicroplasticsColorDetails:MicroColor_Num': {
        tableName: 'ColorType_Ref', idColumn: 'ColorUniqueID', legacyColumn: 'Color_Code',
        methodAppliesColumn: 'AppliesTo_MP'
    },
    'MicroplasticsOpacityDetails:MicroOpacity_Num': {
        tableName: 'Opacity_Ref', idColumn: 'OpacityUniqueID', legacyColumn: 'Opacity_Code',
        methodAppliesColumn: 'AppliesTo_MP'
    },
    'MicroplasticsSizeDetails:MicroSize_Num': {
        tableName: 'SizeClass_Ref', idColumn: 'SizeUniqueID', legacyColumn: 'Size_Code',
        methodAppliesColumn: 'AppliesTo_MP'
    },
    'MicroplasticsFormDetails:MicroShape_Num': {
        tableName: 'Form_Ref', idColumn: 'FormUniqueID', legacyColumn: 'Form_Name',
        applicabilityColumn: 'AppliesTo_MP_Shape', methodAppliesColumn: 'AppliesTo_MP'
    },
    'MicroplasticsFormDetails:MicroTexture_Num': {
        tableName: 'Form_Ref', idColumn: 'FormUniqueID', legacyColumn: 'Form_Name',
        applicabilityColumn: 'AppliesTo_Texture', methodAppliesColumn: 'AppliesTo_MP'
    }
};

async function assertMethodReference(connection, rawMethodId, methodType, appliesColumn, fieldName) {
    const methodId = Number(rawMethodId);
    if (!Number.isInteger(methodId) || methodId <= 0) {
        const error = new Error(`${fieldName} must be a valid method reference ID.`);
        error.statusCode = 400;
        throw error;
    }

    const [rows] = await connection.execute(`
        SELECT MethodsUniqueID
        FROM Methods_Ref
        WHERE MethodsUniqueID = ?
          AND MethodType = ?
          AND \`${appliesColumn}\` = 1
        LIMIT 1
    `, [methodId, methodType]);

    if (rows.length === 0) {
        const error = new Error(`${fieldName} is not valid for this data group.`);
        error.statusCode = 400;
        throw error;
    }

    return String(methodId);
}

async function validateSubmittedPolymerMethod(connection, formData, type) {
    const isMicroplastics = type === 'microplastics';
    const rawMethodId = isMicroplastics
        ? firstPresent(formData, 'micro_method_polymer_num', 'micro_methodPolymerNum')
        : firstPresent(formData, 'fragments_method_polymer_num', 'fragments_methodPolymerNum');

    if (rawMethodId === null) {
        return null;
    }

    const validatedMethodId = await assertMethodReference(
        connection,
        rawMethodId,
        'Polymer',
        isMicroplastics ? 'AppliesTo_MP' : 'AppliesTo_Debris',
        `${type} polymer identification method`
    );
    return Number(validatedMethodId);
}

async function resolveDetailReferenceValues(connection, config, rows) {
    const rule = DETAIL_REFERENCE_RULES[`${config.tableName}:${config.refColumn}`];
    if (!rule) {
        const error = new Error(`No reference validation rule is configured for ${config.tableName}.`);
        error.statusCode = 500;
        throw error;
    }

    const referenceIds = [...new Set(rows.map(row => row.refNum))];
    const referencePlaceholders = referenceIds.map(() => '?').join(', ');
    const applicabilitySql = rule.applicabilityColumn
        ? ` AND \`${rule.applicabilityColumn}\` = 1`
        : '';
    const [referenceRows] = await connection.execute(`
        SELECT
            \`${rule.idColumn}\` AS RefId,
            \`${rule.legacyColumn}\` AS LegacyValue
        FROM ${rule.tableName}
        WHERE \`${rule.idColumn}\` IN (${referencePlaceholders})${applicabilitySql}
    `, referenceIds);
    const referenceById = new Map(
        referenceRows.map(row => [String(row.RefId), String(row.LegacyValue ?? '')])
    );

    for (const referenceId of referenceIds) {
        if (!referenceById.has(String(referenceId))) {
            const error = new Error(
                `${config.tableName} reference ID ${referenceId} is invalid for this detail group.`
            );
            error.statusCode = 400;
            throw error;
        }
    }

    const methodIds = [];
    for (const row of rows) {
        const methodId = Number(row.methodPercentEstimate);
        if (!Number.isInteger(methodId) || methodId <= 0) {
            const error = new Error(
                `${config.tableName} percent-estimation method must be a valid reference ID.`
            );
            error.statusCode = 400;
            throw error;
        }
        methodIds.push(methodId);
    }

    const uniqueMethodIds = [...new Set(methodIds)];
    if (uniqueMethodIds.length !== 1) {
        const error = new Error(
            `${config.tableName} must use one percent-estimation method per detail group.`
        );
        error.statusCode = 400;
        throw error;
    }
    const validatedMethodId = await assertMethodReference(
        connection,
        uniqueMethodIds[0],
        'Percent',
        rule.methodAppliesColumn,
        `${config.tableName} percent-estimation method`
    );

    return rows.map(row => ({
        ...row,
        legacy: referenceById.get(String(row.refNum)),
        methodPercentEstimate: validatedMethodId
    }));
}

async function assertStoredDetailRows(connection, config, parentId, expectedRows) {
    const [rows] = await connection.execute(`
        SELECT
            \`${config.refColumn}\` AS RefNum,
            \`${config.legacyColumn}\` AS LegacyValue,
            \`${config.percentColumn}\` AS PercentageValue,
            Method_PercentEstimate
        FROM ${config.tableName}
        WHERE \`${config.parentColumn}\` = ?
          AND \`${config.refColumn}\` IS NOT NULL
    `, [parentId]);

    const failVerification = detail => {
        const error = new Error(`${config.tableName} detail percentages were not stored exactly: ${detail}`);
        error.statusCode = 500;
        throw error;
    };

    if (rows.length !== expectedRows.length) {
        failVerification(`expected ${expectedRows.length} rows but found ${rows.length}.`);
    }

    const expectedRefIds = new Set();
    for (const row of expectedRows) {
        const refId = String(row.refNum);
        if (expectedRefIds.has(refId)) {
            const error = new Error(`${config.tableName} contains duplicate submitted reference ID ${refId}.`);
            error.statusCode = 400;
            throw error;
        }
        expectedRefIds.add(refId);
    }

    const storedByRefId = new Map();
    for (const row of rows) {
        const refId = String(row.RefNum);
        if (storedByRefId.has(refId)) {
            failVerification(`reference ID ${refId} was stored more than once.`);
        }
        storedByRefId.set(refId, row);
    }

    for (const expected of expectedRows) {
        const refId = String(expected.refNum);
        const stored = storedByRefId.get(refId);
        if (!stored) {
            failVerification(`reference ID ${refId} is missing.`);
        }

        const expectedPercentage = toDatabasePercentage(
            expected.percent,
            `${config.tableName}.${config.percentColumn}`
        );
        const storedPercentage = toDatabasePercentage(
            stored.PercentageValue,
            `${config.tableName}.${config.percentColumn}`
        );
        if (storedPercentage !== expectedPercentage) {
            failVerification(
                `reference ID ${refId} expected ${expectedPercentage}% but found ${storedPercentage}%.`
            );
        }

        if (String(stored.LegacyValue ?? '') !== String(expected.legacy ?? '')) {
            failVerification(`reference ID ${refId} has the wrong legacy value.`);
        }

        if (String(stored.Method_PercentEstimate ?? '') !==
            String(expected.methodPercentEstimate ?? '')) {
            failVerification(`reference ID ${refId} has the wrong percent-estimation method.`);
        }
    }
}

async function insertDetailRows(connection, config, parentId, rows) {
    let normalizedRows = [];

    for (let index = 0; index < rows.length; index += 1) {
        const row = normalizeDetailRow(
            rows[index],
            `${config.tableName}.${config.percentColumn}[${index}]`
        );
        if (row.refNum === null || row.percent === null) {
            const error = new Error(
                `${config.tableName} row ${index + 1} is missing its reference or percentage.`
            );
            error.statusCode = 400;
            throw error;
        }
        normalizedRows.push(row);
    }

    if (normalizedRows.length === 0) {
        return normalizedRows;
    }

    const submittedTotal = normalizedRows.reduce((total, row) => total + row.percent, 0);
    if (!isPercentageTotalValid(submittedTotal)) {
        const error = new Error(
            `${config.tableName} percentages sum to ` +
            `${submittedTotal.toFixed(PERCENTAGE_DECIMAL_PLACES)}% ` +
            `but must equal 100% ± ${PERCENTAGE_TOLERANCE}%.`
        );
        error.statusCode = 400;
        throw error;
    }

    if (normalizedRows.some(row => !row.methodPercentEstimate)) {
        const error = new Error(`${config.tableName} requires a percent-estimation method for every row.`);
        error.statusCode = 400;
        throw error;
    }

    const submittedRefIds = normalizedRows.map(row => String(row.refNum));
    if (new Set(submittedRefIds).size !== submittedRefIds.length) {
        const error = new Error(`${config.tableName} contains duplicate submitted reference IDs.`);
        error.statusCode = 400;
        throw error;
    }

    normalizedRows = await resolveDetailReferenceValues(connection, config, normalizedRows);

    const columns = await getTableColumns(connection, config.tableName);
    const requiredColumns = [
        config.idColumn,
        config.parentColumn,
        config.refColumn,
        config.legacyColumn,
        config.percentColumn,
        'Method_PercentEstimate'
    ];
    const missingColumns = requiredColumns.filter(column => !columns.has(column));
    if (missingColumns.length > 0) {
        const error = new Error(
            `${config.tableName} is missing required detail columns: ${missingColumns.join(', ')}.`
        );
        error.statusCode = 500;
        throw error;
    }

    await assertDecimalPercentageStorage(connection, config.tableName, config.percentColumn);
    await assertAutoIncrementColumn(connection, config.tableName, config.idColumn);

    for (const row of normalizedRows) {
        const dataMap = {
            [config.parentColumn]: parentId,
            [config.refColumn]: row.refNum,
            [config.legacyColumn]: row.legacy,
            [config.percentColumn]: toDatabasePercentage(
                row.percent,
                `${config.tableName}.${config.percentColumn}`
            ),
            Method_PercentEstimate: row.methodPercentEstimate,
            DateEntered: new Date()
        };

        await insertFromMap(connection, config.tableName, dataMap, columns);
    }

    await assertStoredDetailRows(connection, config, parentId, normalizedRows);
    return normalizedRows;
}

async function replaceDetailRows(connection, config, parentId, rows, options = {}) {
    if (!parentId) {
        return false;
    }

    const columns = await getTableColumns(connection, config.tableName);
    const requiredColumns = [
        config.idColumn,
        config.parentColumn,
        config.refColumn,
        config.legacyColumn,
        config.percentColumn,
        'Method_PercentEstimate'
    ];
    const missingColumns = requiredColumns.filter(column => !columns.has(column));
    if (missingColumns.length > 0) {
        const error = new Error(
            `${config.tableName} is missing required detail columns: ${missingColumns.join(', ')}.`
        );
        error.statusCode = 500;
        throw error;
    }

    if (options.deleteExisting !== false) {
        await connection.execute(
            `DELETE FROM ${config.tableName} WHERE \`${config.parentColumn}\` = ?`,
            [parentId]
        );
    }

    const insertedRows = await insertDetailRows(connection, config, parentId, rows);
    if (insertedRows.length === 0) {
        await assertStoredDetailRows(connection, config, parentId, []);
    }
    return true;
}

function formatTimeForInput(value) {
    if (!value) return null;
    return String(value).slice(0, 5);
}

function normalizeRefCodeForField(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function valueOrNull(value) {
    return value === undefined || value === null || value === '' ? null : value;
}

function hasAnyFormValue(formData, fields) {
    return fields.some(field => valueOrNull(formData[field]) !== null);
}

function resolveMediaTypeForForm(row) {
    const mediaTypeId = parseNullableInt(row.MediaType_SelectID);
    const mediaText = String(row.MediaTypeOverall || '').toLowerCase();

    if (mediaTypeId === 1 || mediaText.includes('water')) {
        return 'water';
    }
    if (mediaTypeId === 3 || mediaText.includes('on soil')) {
        return 'soil_litter';
    }
    if (mediaTypeId === 4 || mediaText.includes('mixed')) {
        return 'mixed_composite';
    }
    if (String(row.MediaSubType || '').toLowerCase() === 'terrestrial_soil') {
        return 'in_soil';
    }
    return 'soil_sediment';
}

function setIfPresent(target, key, value) {
    if (value !== undefined && value !== null && value !== '') {
        target[key] = value;
    }
}

async function loadDetailRowsForForm(connection, config, parentId) {
    const columns = await getTableColumns(connection, config.tableName);
    const requiredColumns = [
        config.idColumn,
        config.parentColumn,
        config.refColumn,
        config.legacyColumn,
        config.percentColumn,
        'Method_PercentEstimate'
    ];
    const missingColumns = requiredColumns.filter(column => !columns.has(column));

    if (missingColumns.length > 0) {
        const error = new Error(
            `${config.tableName} is missing required detail columns: ${missingColumns.join(', ')}.`
        );
        error.statusCode = 500;
        throw error;
    }

    const [rows] = await connection.execute(`
        SELECT *
        FROM ${config.tableName}
        WHERE \`${config.parentColumn}\` = ?
        ORDER BY \`${config.idColumn}\`
    `, [parentId]);

    return rows
        .map(row => {
            const refNum = row[config.refColumn];
            const percent = row[config.percentColumn];
            const hasRef = refNum !== null && refNum !== undefined;
            const hasPercent = percent !== null && percent !== undefined;

            // A shared-table sibling row has neither field for this config and
            // is intentionally ignored. A half-populated row is corrupt and
            // must stop edit loading instead of being converted to an empty group.
            if (hasRef !== hasPercent) {
                const error = new Error(
                    `${config.tableName} contains a row with only one of ` +
                    `${config.refColumn}/${config.percentColumn}.`
                );
                error.statusCode = 500;
                throw error;
            }
            if (!hasRef) {
                return null;
            }

            return {
                ref_num: row[config.refColumn],
                legacy: row[config.legacyColumn],
                percent: row[config.percentColumn],
                method_percent_estimate: row.Method_PercentEstimate
            };
        })
        .filter(Boolean);
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
                req.session.user_id
            ]);

            const locationId = locationResult.insertId;

            // Insert sampling event
            const [eventResult] = await pool.execute(`
                INSERT INTO SamplingEvent (
                    SamplingEventUniqueID, LocationID_Num, DeviceInstallationPeriod,
                    StartYear, StartMonth, StartDay, UserSamplingID, DateEntered
                ) VALUES (?, ?, 'no', YEAR(CURDATE()), MONTH(CURDATE()), DAY(CURDATE()), ?, NOW())
            `, [locationId, locationId, req.session.user_id]);

            // Insert sample details
            await pool.execute(`
                INSERT INTO SampleDetails (
                    SampleUniqueID, SamplingEvent_Num, MediaType_SelectID,
                    Micro5mmAndSmaller_Count, FragLargerThan5mm_Count
                ) VALUES (?, ?, 1, ?, ?)
            `, [
                locationId,
                locationId,
                Math.floor(Math.random() * 100) + 10,
                Math.floor(Math.random() * 50) + 5
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
                se.StartYear as collection_year,
                se.StartMonth as collection_month,
                se.StartDay as collection_day,
                se.EndYear as end_year,
                se.EndMonth as end_month,
                se.EndDay as end_day,
                se.DeviceInstallationPeriod as device_installation_period,
                mt.MediaTypeOverall as plasticTypes,
                (COALESCE(sd.FragLargerThan5mm_Count, 0) +
                 COALESCE(sd.Micro5mmAndSmaller_Count, 0)) as particleCount
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
        sql += " ORDER BY se.StartYear DESC, se.StartMonth DESC, se.StartDay DESC, se.SamplingEventUniqueID DESC";

        // Execute the query
        const [rows] = await pool.execute(sql, params);

        // Format the data to match the PHP response format
        const formattedData = rows.map(row => {
            const presentedRow = addPartialDatePresentation(row);
            return {
                SampleUniqueID: row.SampleUniqueID,
                location: row.location || 'Unknown Location',
                zipCode: row.zipCode || 'N/A',
                lat: parseFloat(row.lat) || 0,
                lng: parseFloat(row.lng) || 0,
                sampleType: row.sampleType || 'Unknown',
                date: presentedRow.collection_date,
                date_display: presentedRow.collection_date_display,
                start_year: presentedRow.start_year,
                start_month: presentedRow.start_month,
                start_day: presentedRow.start_day,
                end_year: presentedRow.end_year,
                end_month: presentedRow.end_month,
                end_day: presentedRow.end_day,
                device_installation_period: row.device_installation_period,
                plasticTypes: row.plasticTypes || 'N/A',
                particleCount: row.particleCount || 0
            };
        });

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
                se.StartYear as collection_year,
                se.StartMonth as collection_month,
                se.StartDay as collection_day,
                se.EndYear as end_year,
                se.EndMonth as end_month,
                se.EndDay as end_day,
                se.DeviceInstallationPeriod as device_installation_period,
                se.UserSamplingID as created_by
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat_DecimalDegree\` IS NOT NULL
            AND l.\`Long_DecimalDegree\` IS NOT NULL
            ORDER BY se.StartYear DESC, se.StartMonth DESC, se.StartDay DESC, se.SamplingEventUniqueID DESC
        `);

        res.json({
            success: true,
            data: rows.map(addPartialDatePresentation)
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

        sql += ' ORDER BY SortOrder, MethodsUniqueID';

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
            ORDER BY SortOrder, OpacityUniqueID
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
            ORDER BY SortOrder, SoilTextureUniqueID
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
            ORDER BY SortOrder, UnitsUniqueID
        `);
        res.json({ success: true, data: units });
    } catch (error) {
        console.error('Error fetching units reference:', error);
        res.status(500).json({ success: false, message: 'Error fetching units reference' });
    }
});

// Get reference data (polymers, purposes, methods, forms, colors, etc.)
//
// The form renders every list in the order returned here, and that order is
// data: each *_Ref table carries a SortOrder column (regular options 10, 20,
// 30, ...; catch-alls pinned high — "Other ..." 900, "Unknown" 990 — see
// db/20260817_add_reference_sort_order.sql). Reordering an option or slotting
// in a new one is an UPDATE on that column, never a code change. The ID is
// only the tie-breaker so ties (e.g. new rows still at 0) stay deterministic.
router.get('/references', async (req, res) => {
    try {
        const [polymers] = await pool.query('SELECT * FROM PolymerType_Ref ORDER BY SortOrder, PolymerUniqueID');
        const [purposes] = await pool.query('SELECT * FROM Purpose_Ref ORDER BY SortOrder, PurposeUniqueID');
        const [colors] = await pool.query('SELECT * FROM ColorType_Ref ORDER BY SortOrder, ColorUniqueID');
        const [forms] = await pool.query('SELECT * FROM Form_Ref ORDER BY SortOrder, FormUniqueID');
        const [methods] = await pool.query(`
            SELECT MethodsUniqueID, MethodType, AppliesTo_MP, AppliesTo_Debris,
                   AppliesTo_SoilType, Method_Code, Method_Label, DateEntered
            FROM Methods_Ref
            WHERE MethodType <> 'Count'
            ORDER BY SortOrder, MethodsUniqueID
        `);
        const [opacities] = await pool.query(`
            SELECT OpacityUniqueID, Opacity_Code, Opacity_Label
            FROM Opacity_Ref
            ORDER BY SortOrder, OpacityUniqueID
        `);
        const [soilTextures] = await pool.query(`
            SELECT SoilTextureUniqueID, SoilTexture_Code, SoilTexture_Definition
            FROM SoilTexture_Ref
            ORDER BY SortOrder, SoilTextureUniqueID
        `);
        const [units] = await pool.query(`
            SELECT UnitsUniqueID, Units_Type, Units_Code, Units_Desc
            FROM Units_Ref
            ORDER BY SortOrder, UnitsUniqueID
        `);
        const [sizes] = await pool.query('SELECT * FROM SizeClass_Ref ORDER BY SortOrder, SizeUniqueID');
        const [pubSources] = await pool.query('SELECT * FROM PubSource_Ref ORDER BY SortOrder, PubSourceUniqueID');

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

            // FragmentsPurposes row totals validate purpose data.

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

            // Validate and normalize the shared Start date and conditional End
            // date before opening a transaction.
            const normalizeDate = (value) => {
                if (value === undefined || value === null) return null;
                const trimmed = String(value).trim();
                return trimmed === '' ? null : trimmed;
            };
            const eventDates = normalizeSamplingEventDates(formData);

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
                StartYear: eventDates.start.year,
                StartMonth: eventDates.start.month,
                StartDay: eventDates.start.day,
                EndYear: eventDates.end.year,
                EndMonth: eventDates.end.month,
                EndDay: eventDates.end.day,
                UserSamplingID: userId,
                'AirTemp_C': parseNullableFloat(formData.air_temp),
                'Weather_Current': formData.current_conditions ? await getWeatherTypeId(connection, formData.current_conditions) : null,
                'Weather_Precedent24': formData.precedent_weather ? await getWeatherTypeId(connection, formData.precedent_weather) : null,
                'Rainfall_cm_Precedent24': parseNullableFloat(formData.rainfall),
                SamplerNames: formData.sample_description || null,
                DeviceInstallationPeriod: eventDates.mode,
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
                    SamplingEventUniqueID, LocationID_Num, PublicationID_Num,
                    StartYear, StartMonth, StartDay, EndYear, EndMonth, EndDay,
                    UserSamplingID, \`AirTemp_C\`,
                    \`Weather_Current\`, \`Weather_Precedent24\`, \`Rainfall_cm_Precedent24\`, SamplerNames,
                    DeviceInstallationPeriod, SampleTime,
                    WeatherPrecedent24, AdditionalNotes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                samplingEventUniqueId,
                samplingEventData.LocationID_Num,
                samplingEventData.PublicationID_Num,
                samplingEventData.StartYear,
                samplingEventData.StartMonth,
                samplingEventData.StartDay,
                samplingEventData.EndYear,
                samplingEventData.EndMonth,
                samplingEventData.EndDay,
                samplingEventData.UserSamplingID,
                samplingEventData['AirTemp_C'],
                samplingEventData['Weather_Current'],
                samplingEventData['Weather_Precedent24'],
                samplingEventData['Rainfall_cm_Precedent24'],
                samplingEventData.SamplerNames,
                samplingEventData.DeviceInstallationPeriod,
                samplingEventData.SampleTime,
                samplingEventData.WeatherPrecedent24,
                samplingEventData.AdditionalNotes
            ]);

            const samplingEventId = samplingEventUniqueId; // Use the generated ID
            console.log('Sampling event created with ID:', samplingEventId);

            // Step 2: Insert into SampleDetails table (complete fields)
            const mediaTypeId = await getMediaTypeId(connection, formData.media_type);
            const waterEnvTypeId = formData.environment_type ? await getWaterEnvTypeId(connection, formData.environment_type) : null;

            // Normalize alternate frontend field names (support both variants).
            // firstPresent (not ??) so that an empty string coming from a
            // hidden section's input cannot mask the filled variant.
            const soilMoistureVal = firstPresent(formData, 'soil_moisture', 'soil_moisture_content', 'sediment_moisture');
            const waterDepthVal = firstPresent(formData, 'water_depth', 'total_water_depth', 'sample_water_depth');
            const samplingDepthVal = firstPresent(formData, 'soil_depth', 'sediment_depth'); // Map for SamplingDepth
            const flowVelocityVal = firstPresent(formData, 'flow_velocity', 'water_flow_velocity');
            const suspendedSolidsVal = firstPresent(formData, 'suspended_solids', 'total_suspended_solids');
            const soilDryWeightVal = firstPresent(formData, 'soil_dry_weight', 'soil_sample_dry_weight', 'sediment_dry_weight');
            const soilOrganicMatterVal = firstPresent(formData, 'soil_organic_matter', 'sediment_organic_matter');
            const soilSandVal = firstPresent(formData, 'soil_sand', 'sediment_sand');
            const soilSiltVal = firstPresent(formData, 'soil_silt', 'sediment_silt');
            const soilClayVal = firstPresent(formData, 'soil_clay', 'sediment_clay');
            const soilTextureVal = await resolveSoilTextureLabel(
                connection,
                firstPresent(formData, 'soil_texture', 'soilTexture')
            );
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
            const sampleUnitId = sampleUnitVal ? await getSampleUnitId(connection, sampleUnitVal) : null;
            // Media-specific amounts/units are stored as submitted; the total is
            // only a fallback so older payloads keep their previous behavior.
            const microplasticsSampleAmountVal = firstPresent(formData, 'microplastics_sample_amount') ?? totalSampleAmountVal;
            const fragmentsSampleAmountVal = firstPresent(formData, 'fragments_sample_amount') ?? totalSampleAmountVal;
            const packagingSampleAmountVal = firstPresent(formData, 'packaging_sample_amount') ?? totalSampleAmountVal;
            const microplasticsUnitVal = firstPresent(formData, 'microplastics_sample_unit');
            const fragmentsUnitVal = firstPresent(formData, 'fragments_sample_unit');
            const packagingUnitVal = firstPresent(formData, 'packaging_sample_unit');
            const microplasticsSampleUnitId = microplasticsUnitVal ? await getSampleUnitId(connection, microplasticsUnitVal) : sampleUnitId;
            const fragmentsSampleUnitId = fragmentsUnitVal ? await getSampleUnitId(connection, fragmentsUnitVal) : sampleUnitId;
            const packagingSampleUnitId = packagingUnitVal ? await getSampleUnitId(connection, packagingUnitVal) : sampleUnitId;

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
                FragLargerThan5mm_Count: getFragmentDebrisCount(formData),
                Micro5mmAndSmaller_Count: parseNullableInt(formData.microplastics_count),
                WaterEnvType_SelectID: waterEnvTypeId,
                'SoilMoisture_Percent': parseNullableFloat(soilMoistureVal),
                // Additional fields from formpage2-5
                MediaSubType: getMediaSubType(formData),
                MixedMediaDescription: formData.mixed_media_description || null,
                VolumeSampled: parseNullableFloat(formData.volume_sampled),
                WaterDepth: parseNullableFloat(waterDepthVal),
                SamplingDepth: parseNullableFloat(samplingDepthVal),
                FlowVelocity: parseNullableFloat(flowVelocityVal),
                SuspendedSolids: parseNullableFloat(suspendedSolidsVal),
                Conductivity: parseNullableFloat(formData.conductivity),
                SoilDryWeight: parseNullableFloat(soilDryWeightVal),
                SoilOrganicMatter: parseNullableFloat(soilOrganicMatterVal),
                SoilSand: parseNullableFloat(soilSandVal),
                SoilSilt: parseNullableFloat(soilSiltVal),
                SoilClay: parseNullableFloat(soilClayVal),
                SoilTexture: soilTextureVal,
                ReplicatesCount: parseNullableInt(formData.replicates_count),
                TotalSampleAmount: parseNullableFloat(totalSampleAmountVal),
                SampleUnit_Num: sampleUnitId,
                MicroplasticsSampleAmount: parseNullableFloat(microplasticsSampleAmountVal),
                MicroplasticsSampleUnit_Num: microplasticsSampleUnitId,
                FragmentsSampleAmount: parseNullableFloat(fragmentsSampleAmountVal),
                FragmentsSampleUnit_Num: fragmentsSampleUnitId,
                PackagingSampleAmount: parseNullableFloat(packagingSampleAmountVal),
                PackagingSampleUnit_Num: packagingSampleUnitId,
                // New columns added by migration
                Turbidity: parseNullableFloat(turbidityVal),
                DissolvedOxygen: parseNullableFloat(dissolvedOxygenVal),
                SampleWaterDepth: parseNullableFloat(sampleWaterDepthVal),
                SurfaceAreaSampled: parseNullableFloat(surfaceAreaSampledVal),
                PermeableSurfaces: parseNullableFloat(permeableSurfacesVal),
                ImpermeableSurfaces: parseNullableFloat(impermeableSurfacesVal),
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
                FragLargerThan5mm_Count: sampleDetailsData.FragLargerThan5mm_Count,
                Micro5mmAndSmaller_Count: sampleDetailsData.Micro5mmAndSmaller_Count,
                WaterEnvType_SelectID: sampleDetailsData.WaterEnvType_SelectID,
                SoilMoisture_Percent: sampleDetailsData.SoilMoisture_Percent,
                MediaSubType: sampleDetailsData.MediaSubType,
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
                SampleUnit_Num: sampleDetailsData.SampleUnit_Num,
                MicroplasticsSampleAmount: sampleDetailsData.MicroplasticsSampleAmount,
                MicroplasticsSampleUnit_Num: sampleDetailsData.MicroplasticsSampleUnit_Num,
                FragmentsSampleAmount: sampleDetailsData.FragmentsSampleAmount,
                FragmentsSampleUnit_Num: sampleDetailsData.FragmentsSampleUnit_Num,
                PackagingSampleAmount: sampleDetailsData.PackagingSampleAmount,
                PackagingSampleUnit_Num: sampleDetailsData.PackagingSampleUnit_Num,
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
            const shouldInsertMicroplastics = hasMicroplasticsDetailData(formData);

            if (shouldInsertMicroplastics) {
                console.log('Inserting microplastics details...');

                const validatedMicroPolymerMethod = await validateSubmittedPolymerMethod(
                    connection,
                    formData,
                    'microplastics'
                );

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
                    Method_Polymer_Num: validatedMicroPolymerMethod,
                    Method_Polymer_Other: firstPresent(formData, 'micro_method_polymer_other', 'micro_methodPolymerOther'),
                    PercentSize_LessThan1um: parseNullableInt(formData.mp_size_lt_1um),
                    PercentSize_1_20um: parseNullableInt(formData.mp_size_1_20um),
                    PercentSize_20_100um: parseNullableInt(formData.mp_size_20_100um),
                    PercentSize_100um_1mm: parseNullableInt(formData.mp_size_100um_1mm),
                    PercentSize_1_5mm: parseNullableInt(formData.mp_size_1_5mm),
                    PercentForm_fiber: parseNullableInt(formData.mp_form_fiber),
                    PercentForm_Pellet: parseNullableInt(formData.mp_form_pellet),
                    PercentForm_Fragment: parseNullableInt(formData.mp_form_fragment),
                    PercentColor_Clear: parseNullableInt(formData.mp_color_clear),
                    PercentColor_OpaqueLight: parseNullableInt(formData.mp_color_opaque_light),
                    PercentColor_OpaqueDark: parseNullableInt(formData.mp_color_opaque_dark),
                    PercentColor_Mixed: parseNullableInt(formData.mp_color_mixed)
                });
                console.log('Microplastics details inserted with ID:', microUniqueId);

                // Insert polymer details for microplastics if provided
                await insertPolymerDetails(connection, microUniqueId, formData, 'microplastics');
            }

            // Step 4: Insert fragments details if provided (complete fields)
            const shouldInsertFragments = hasFragmentsDetailData(formData);

            if (shouldInsertFragments) {
                console.log('Inserting fragments details...');

                const validatedFragmentsPolymerMethod = await validateSubmittedPolymerMethod(
                    connection,
                    formData,
                    'fragments'
                );

                // Generate a unique ID for fragments
                const [maxFragmentIdResult] = await connection.execute(
                    'SELECT MAX(Fragment_UniqueID) as maxId FROM FragmentsInSample'
                );
                fragmentUniqueId = (maxFragmentIdResult[0].maxId || 0) + 1;

                await insertFromMap(connection, 'FragmentsInSample', {
                    Fragment_UniqueID: fragmentUniqueId,
                    SampleDetails_Num: sampleDetailsId,
                    Mass_Debris_Total: parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')),
                    ...(await buildFragmentCountColumns(connection, formData)),
                    Method_Polymer_Num: validatedFragmentsPolymerMethod,
                    Method_Polymer_Other: firstPresent(formData, 'fragments_method_polymer_other', 'fragments_methodPolymerOther'),
                    PercentColor_Clear: parseNullableInt(formData.fragment_color_clear),
                    PercentColor_Op_Color: parseNullableInt(formData.fragment_color_opaque_light),
                    PercentColor_Op_Dk: parseNullableInt(formData.fragment_color_opaque_dark),
                    PercentColor_Mixed: parseNullableInt(formData.fragment_color_mixed),
                    PercentForm_Fiber: parseNullableInt(formData.fragment_form_fiber),
                    PercentForm_Pellet: parseNullableInt(formData.fragment_form_pellet),
                    PercentForm_Film: parseNullableInt(formData.fragment_form_film),
                    PercentForm_Foam: parseNullableInt(formData.fragment_form_foam),
                    PercentForm_HardPlastic: parseNullableInt(formData.fragment_form_hardplastic),
                    PercentForm_Other: parseNullableInt(formData.fragment_form_other)
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

async function getSampleUnitId(connection, unitValue) {
    const normalizedUnit = String(unitValue || '').trim();
    if (!normalizedUnit) return null;

    const [rows] = await connection.execute(`
        SELECT UnitsUniqueID
        FROM Units_Ref
        WHERE Units_Type = 'Sample_Quantity'
          AND (Units_Code = ? OR UnitsUniqueID = ?)
        LIMIT 1
    `, [normalizedUnit, parseNullableInt(normalizedUnit)]);

    if (rows.length === 0) {
        const error = new Error(`Invalid sample unit: ${normalizedUnit}`);
        error.statusCode = 400;
        throw error;
    }

    return rows[0].UnitsUniqueID;
}

async function resolveSoilTextureLabel(connection, value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw)) return raw;
    // The soil-texture selects submit the SoilTexture_Ref ID; store the label
    // so SampleDetails.SoilTexture reads consistently for both media paths.
    const [rows] = await connection.execute(
        'SELECT SoilTexture_Code FROM SoilTexture_Ref WHERE SoilTextureUniqueID = ?',
        [parseInt(raw, 10)]
    );
    return rows.length > 0 ? String(rows[0].SoilTexture_Code).trim() : raw;
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
    } else if (formData.media_type === 'in_soil') {
        return 'terrestrial_soil';
    }
    return null;
}

function hasOwnAny(formData, ...keys) {
    return keys.some(key => Object.prototype.hasOwnProperty.call(formData, key));
}

function getPolymerPercentageFieldNames(fieldPrefix, polymerCode) {
    const normalizedCode = normalizeRefCodeForField(polymerCode);
    return [...new Set([
        `${fieldPrefix}${normalizedCode}`,
        `${fieldPrefix}${String(polymerCode || '').trim().toLowerCase()}`
    ])];
}

function findPolymerPercentageField(formData, fieldPrefix, polymerCode) {
    const candidates = getPolymerPercentageFieldNames(fieldPrefix, polymerCode);

    for (const fieldName of candidates) {
        if (Object.prototype.hasOwnProperty.call(formData, fieldName)) {
            return { fieldName, rawValue: formData[fieldName] };
        }
    }

    return null;
}

function collectSubmittedPolymerFields(formData, fieldPrefix, polymerRefs) {
    const fieldOwners = new Map();
    for (const polymer of polymerRefs) {
        const polymerId = String(polymer.PolymerUniqueID ?? '');
        const fieldNames = getPolymerPercentageFieldNames(fieldPrefix, polymer.Polymer_Code);
        for (const fieldName of fieldNames) {
            const existingOwner = fieldOwners.get(fieldName);
            if (existingOwner && existingOwner !== polymerId) {
                const error = new Error(
                    `Polymer reference codes collide at form field ${fieldName}. ` +
                    'No polymer data was saved.'
                );
                error.statusCode = 500;
                throw error;
            }
            fieldOwners.set(fieldName, polymerId);
        }
    }

    const allowedFields = new Set(
        polymerRefs.flatMap(polymer =>
            getPolymerPercentageFieldNames(fieldPrefix, polymer.Polymer_Code)
        )
    );
    const unknownFields = getSubmittedPolymerPercentageFields(formData, fieldPrefix)
        .filter(fieldName => !allowedFields.has(fieldName));

    if (unknownFields.length > 0) {
        const error = new Error(
            `Unknown polymer percentage field(s): ${unknownFields.join(', ')}. ` +
            'No polymer data was saved.'
        );
        error.statusCode = 400;
        throw error;
    }

    return polymerRefs
        .map(polymer => ({
            polymer,
            code: polymer.Polymer_Code || '',
            field: findPolymerPercentageField(formData, fieldPrefix, polymer.Polymer_Code)
        }))
        .filter(entry => entry.field);
}

function assertSubmittedPolymerTotal(percentages, type) {
    if (percentages.length === 0) {
        return;
    }

    const total = percentages.reduce((sum, entry) => sum + entry.percentage, 0);
    if (!isPercentageTotalValid(total)) {
        const error = new Error(
            `${type} polymer percentages sum to ${total.toFixed(4)}% ` +
            `(expected 100% ± ${PERCENTAGE_TOLERANCE}%).`
        );
        error.statusCode = 400;
        throw error;
    }
}

async function assertDecimalPercentageStorage(connection, tableName, columnName = 'Percentage') {
    const [rows] = await connection.execute(`
        SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
    `, [tableName, columnName]);

    const column = rows[0];
    const numericPrecision = Number(column?.NUMERIC_PRECISION);
    const numericScale = Number(column?.NUMERIC_SCALE);
    const supportsRequiredPrecision = column &&
        ['decimal', 'numeric'].includes(String(column.DATA_TYPE).toLowerCase()) &&
        numericScale >= PERCENTAGE_DECIMAL_PLACES &&
        numericPrecision - numericScale >= 3;

    if (!supportsRequiredPrecision) {
        const error = new Error(
            `${tableName}.${columnName} must be DECIMAL with room for 100 and at least ` +
            `${PERCENTAGE_DECIMAL_PLACES} decimal places. ` +
            'Run db/20260720_preserve_percentage_precision.sql before saving detail percentages.'
        );
        error.statusCode = 500;
        throw error;
    }
}

async function assertAutoIncrementColumn(connection, tableName, columnName) {
    const [rows] = await connection.execute(`
        SELECT EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
    `, [tableName, columnName]);

    const isAutoIncrement = String(rows[0]?.EXTRA || '')
        .toLowerCase()
        .split(/\s+/)
        .includes('auto_increment');
    if (!isAutoIncrement) {
        const error = new Error(
            `${tableName}.${columnName} must be AUTO_INCREMENT. ` +
            'Run db/20260720_preserve_percentage_precision.sql before saving detail percentages.'
        );
        error.statusCode = 500;
        throw error;
    }
}

// The Other-polymer description can only be stored once the migration that
// adds the column has run; refusing loudly beats silently dropping user text.
function assertPolymerOtherDescColumn(tableName, columns, otherDescription) {
    if (!otherDescription || columns.has(POLYMER_OTHER_DESC_COLUMN)) return;
    const error = new Error(
        `${tableName}.${POLYMER_OTHER_DESC_COLUMN} is missing, so the "Other" polymer description cannot be saved. ` +
        'Run db/20260815_add_polymer_other_description.sql.'
    );
    error.statusCode = 500;
    throw error;
}

async function assertStoredPolymerDetails(
    connection,
    tableName,
    foreignKey,
    parentId,
    type,
    expectedEntries,
    expectedMethod,
    { otherDescription = null, hasDescColumn = false } = {}
) {
    const descSelect = hasDescColumn ? `, ${POLYMER_OTHER_DESC_COLUMN}` : '';
    const [rows] = await connection.execute(`
        SELECT PolymerID_Num, PolymerType_Legacy, Percentage, Method_PercentEstimate${descSelect}
        FROM ${tableName}
        WHERE ${foreignKey} = ?
    `, [parentId]);

    const failVerification = detail => {
        const error = new Error(`${type} polymer percentages were not stored exactly: ${detail}`);
        error.statusCode = 500;
        throw error;
    };

    if (rows.length !== expectedEntries.length) {
        failVerification(`expected ${expectedEntries.length} rows but found ${rows.length}.`);
    }

    const storedByPolymerId = new Map();
    for (const row of rows) {
        const polymerId = String(row.PolymerID_Num);
        if (storedByPolymerId.has(polymerId)) {
            failVerification(`polymer ID ${polymerId} was stored more than once.`);
        }
        storedByPolymerId.set(polymerId, row);
    }

    for (const { polymer, field, percentage } of expectedEntries) {
        const polymerId = String(polymer.PolymerUniqueID);
        const stored = storedByPolymerId.get(polymerId);
        if (!stored) {
            failVerification(`polymer ${polymer.Polymer_Code} is missing.`);
        }

        const expectedPercentage = toDatabasePercentage(percentage, field.fieldName);
        const storedPercentage = toDatabasePercentage(
            stored.Percentage,
            `${tableName}.Percentage for ${polymer.Polymer_Code}`
        );
        if (storedPercentage !== expectedPercentage) {
            failVerification(
                `polymer ${polymer.Polymer_Code} expected ${expectedPercentage}% ` +
                `but found ${storedPercentage}%.`
            );
        }

        if (String(stored.PolymerType_Legacy || '') !== String(polymer.Polymer_Code || '')) {
            failVerification(`polymer ${polymer.Polymer_Code} was stored under the wrong legacy code.`);
        }

        if (String(stored.Method_PercentEstimate ?? '') !== String(expectedMethod ?? '')) {
            failVerification(`polymer ${polymer.Polymer_Code} has the wrong percent-estimation method.`);
        }

        if (hasDescColumn) {
            const expectedDesc = isOtherPolymerCode(polymer.Polymer_Code) ? (otherDescription || null) : null;
            const storedDesc = stored[POLYMER_OTHER_DESC_COLUMN] ?? null;
            if (String(storedDesc ?? '') !== String(expectedDesc ?? '')) {
                failVerification(`polymer ${polymer.Polymer_Code} has the wrong "Other" description.`);
            }
        }
    }

    const storedTotal = rows.reduce((total, row) => total + Number(row.Percentage || 0), 0);

    if (!isPercentageTotalValid(storedTotal)) {
        failVerification(
            `database total is ${storedTotal.toFixed(4)}% ` +
            `(expected 100% ± ${PERCENTAGE_TOLERANCE}%).`
        );
    }
}

async function insertPolymerDetails(connection, parentId, formData, type) {
    const tableName = type === 'microplastics' ? 'MicroplasticsPolymerDetails' : 'FragmentsPolymerDetails';
    const idColumn = type === 'microplastics' ? 'MicroPolymerUniqueID' : 'FragPolymerUniqueID';
    const foreignKey = type === 'microplastics' ? 'MicroInSample_Num' : 'FragInSample_Num';
    const fieldPrefix = type === 'microplastics' ? 'mp_polymer_' : 'fragment_polymer_';
    const methodPercentEstimate = type === 'microplastics'
        ? firstPresent(formData, 'micro_method_percent_estimate')
        : firstPresent(formData, 'fragments_method_percent_estimate');
    const [polymerRefs] = await connection.query('SELECT * FROM PolymerType_Ref');
    const submittedFields = collectSubmittedPolymerFields(formData, fieldPrefix, polymerRefs);
    const percentagesToInsert = [];

    for (const { polymer, field } of submittedFields) {
        const percentage = parsePercentage(field.rawValue, field.fieldName);
        if (percentage === null) continue;

        percentagesToInsert.push({ polymer, field, percentage });
    }

    if (percentagesToInsert.length === 0) {
        return;
    }

    const appliesColumn = type === 'microplastics' ? 'AppliesTo_MP' : 'AppliesTo_Debris';
    await validateSubmittedPolymerMethod(connection, formData, type);
    const validatedPercentMethod = await assertMethodReference(
        connection,
        methodPercentEstimate,
        'Percent',
        appliesColumn,
        `${type} polymer percent-estimation method`
    );

    assertSubmittedPolymerTotal(percentagesToInsert, type);
    await assertDecimalPercentageStorage(connection, tableName);
    await assertAutoIncrementColumn(connection, tableName, idColumn);

    const otherDescription = getOtherPolymerDescription(formData, fieldPrefix);
    const columns = await getTableColumns(connection, tableName);
    assertPolymerOtherDescColumn(tableName, columns, otherDescription);
    const hasDescColumn = columns.has(POLYMER_OTHER_DESC_COLUMN);

    for (const { polymer, field, percentage } of percentagesToInsert) {
        const insertColumns = [
            foreignKey, 'PolymerID_Num', 'PolymerType_Legacy',
            'Percentage', 'Method_PercentEstimate'
        ];
        const values = [
            parentId,
            polymer.PolymerUniqueID,
            polymer.Polymer_Code,
            toDatabasePercentage(percentage, field.fieldName),
            validatedPercentMethod
        ];
        if (hasDescColumn) {
            insertColumns.push(POLYMER_OTHER_DESC_COLUMN);
            values.push(isOtherPolymerCode(polymer.Polymer_Code) ? otherDescription : null);
        }

        try {
            await connection.execute(`
                INSERT INTO ${tableName} (
                    ${insertColumns.join(', ')}, DateEntered
                ) VALUES (${insertColumns.map(() => '?').join(', ')}, NOW())
            `, values);
        } catch (error) {
            error.message = `Failed to store ${type} polymer ${polymer.Polymer_Code}: ${error.message}`;
            throw error;
        }
    }

    await assertStoredPolymerDetails(
        connection,
        tableName,
        foreignKey,
        parentId,
        type,
        percentagesToInsert,
        validatedPercentMethod,
        { otherDescription, hasDescColumn }
    );
}

async function loadPolymerFieldsForForm(connection, tableName, parentId, prefix, candidateParentColumns, methodFieldName = null) {
    const formFields = {};

    const columns = await getTableColumns(connection, tableName);
    const parentColumn = candidateParentColumns.find(column => columns.has(column));
    const requiredColumns = ['PolymerID_Num', 'PolymerType_Legacy', 'Percentage'];
    if (methodFieldName) {
        requiredColumns.push('Method_PercentEstimate');
    }
    const missingColumns = requiredColumns.filter(column => !columns.has(column));

    if (!parentColumn || missingColumns.length > 0) {
        const details = [
            !parentColumn ? `one of ${candidateParentColumns.join('/')}` : null,
            ...missingColumns
        ].filter(Boolean);
        const error = new Error(`${tableName} is missing required polymer columns: ${details.join(', ')}.`);
        error.statusCode = 500;
        throw error;
    }

    const [rows] = await connection.execute(`
        SELECT pd.*, pr.Polymer_Code
        FROM ${tableName} pd
        LEFT JOIN PolymerType_Ref pr ON pd.PolymerID_Num = pr.PolymerUniqueID
        WHERE pd.\`${parentColumn}\` = ?
    `, [parentId]);

    const seenPolymerIds = new Set();
    const fieldOwners = new Map();
    const methods = new Set();

    for (const row of rows) {
        const referenceCode = row.Polymer_Code || '';
        const legacyCode = row.PolymerType_Legacy || '';
        const code = referenceCode || legacyCode;
        const normalizedCode = normalizeRefCodeForField(code);
        if (!normalizedCode) {
            const error = new Error(`${tableName} contains a polymer row without an identifiable code.`);
            error.statusCode = 500;
            throw error;
        }

        if (referenceCode && legacyCode &&
            normalizeRefCodeForField(referenceCode) !== normalizeRefCodeForField(legacyCode)) {
            const error = new Error(
                `${tableName} contains a polymer row whose reference and legacy codes disagree.`
            );
            error.statusCode = 500;
            throw error;
        }

        const polymerIdentity = row.PolymerID_Num === null || row.PolymerID_Num === undefined
            ? `legacy:${normalizedCode}`
            : `id:${row.PolymerID_Num}`;
        if (seenPolymerIds.has(polymerIdentity)) {
            const error = new Error(`${tableName} contains duplicate polymer ${code}.`);
            error.statusCode = 500;
            throw error;
        }
        seenPolymerIds.add(polymerIdentity);

        const fieldName = `${prefix}${normalizedCode}`;
        if (fieldOwners.has(fieldName)) {
            const error = new Error(
                `${tableName} contains polymer codes that collide at form field ${fieldName}.`
            );
            error.statusCode = 500;
            throw error;
        }
        fieldOwners.set(fieldName, polymerIdentity);

        let percentage;
        try {
            percentage = parsePercentage(row.Percentage, `${tableName}.${fieldName}`);
        } catch (error) {
            error.statusCode = 500;
            throw error;
        }
        if (percentage === null) {
            const error = new Error(`${tableName}.${fieldName} is missing its percentage.`);
            error.statusCode = 500;
            throw error;
        }

        formFields[fieldName] = toDatabasePercentage(percentage, `${tableName}.${fieldName}`);
        methods.add(String(row.Method_PercentEstimate ?? ''));

        // The "Other" row carries the free-text description of the polymer(s).
        if (isOtherPolymerCode(code) && columns.has(POLYMER_OTHER_DESC_COLUMN)) {
            setIfPresent(
                formFields,
                `${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`,
                row[POLYMER_OTHER_DESC_COLUMN]
            );
        }
    }

    if (methods.size > 1) {
        const error = new Error(`${tableName} contains inconsistent percent-estimation methods.`);
        error.statusCode = 500;
        throw error;
    }
    if (methodFieldName && methods.size === 1) {
        const [method] = methods;
        setIfPresent(formFields, methodFieldName, method);
    }

    return formFields;
}

async function replacePolymerDetails(connection, options) {
    const {
        tableName,
        idColumnCandidates,
        parentColumnCandidates,
        parentId,
        fieldPrefix,
        methodPercentEstimate
    } = options;

    if (!parentId) {
        return;
    }

    const [polymerRefs] = await connection.query('SELECT * FROM PolymerType_Ref');
    const submittedFields = collectSubmittedPolymerFields(
        options.formData,
        fieldPrefix,
        polymerRefs
    );

    // A missing group means "leave it unchanged". An explicitly submitted
    // group whose known fields are blank means "clear it".
    if (submittedFields.length === 0) {
        return false;
    }

    const columns = await getTableColumns(connection, tableName);
    const parentColumn = parentColumnCandidates.find(column => columns.has(column));
    const idColumn = idColumnCandidates.find(column => columns.has(column));
    const requiredColumns = [
        'PolymerID_Num',
        'PolymerType_Legacy',
        'Percentage',
        'Method_PercentEstimate'
    ];

    if (!parentColumn || requiredColumns.some(column => !columns.has(column))) {
        const error = new Error(`${tableName} is missing required polymer detail columns.`);
        error.statusCode = 500;
        throw error;
    }

    const percentagesToInsert = [];
    let validatedPercentMethod = null;
    const otherDescription = getOtherPolymerDescription(options.formData, fieldPrefix);
    const hasDescColumn = columns.has(POLYMER_OTHER_DESC_COLUMN);

    for (const { polymer, code, field } of submittedFields) {

        const percentage = parsePercentage(field.rawValue, field.fieldName);

        if (percentage === null) {
            continue;
        }

        percentagesToInsert.push({ polymer, code, field, percentage });
    }

    if (percentagesToInsert.length > 0) {
        const type = fieldPrefix === 'mp_polymer_' ? 'microplastics' : 'fragments';
        const appliesColumn = type === 'microplastics' ? 'AppliesTo_MP' : 'AppliesTo_Debris';
        await validateSubmittedPolymerMethod(connection, options.formData, type);
        validatedPercentMethod = await assertMethodReference(
            connection,
            methodPercentEstimate,
            'Percent',
            appliesColumn,
            `${type} polymer percent-estimation method`
        );
        assertSubmittedPolymerTotal(percentagesToInsert, type);
        await assertDecimalPercentageStorage(connection, tableName);
        if (!idColumn) {
            const error = new Error(`${tableName} is missing its polymer detail ID column.`);
            error.statusCode = 500;
            throw error;
        }
        await assertAutoIncrementColumn(connection, tableName, idColumn);
        assertPolymerOtherDescColumn(tableName, columns, otherDescription);
    }

    await connection.execute(
        `DELETE FROM ${tableName} WHERE \`${parentColumn}\` = ?`,
        [parentId]
    );

    for (const { polymer, code, field, percentage } of percentagesToInsert) {

        const dataMap = {
            [parentColumn]: parentId,
            PolymerID_Num: polymer.PolymerUniqueID,
            PolymerType_Legacy: code,
            Percentage: toDatabasePercentage(percentage, field.fieldName),
            Method_PercentEstimate: validatedPercentMethod ?? '',
            DateEntered: new Date()
        };
        if (hasDescColumn) {
            dataMap[POLYMER_OTHER_DESC_COLUMN] = isOtherPolymerCode(code) ? otherDescription : null;
        }

        await insertFromMap(connection, tableName, dataMap, columns);
    }

    if (percentagesToInsert.length > 0) {
        const type = fieldPrefix === 'mp_polymer_' ? 'microplastics' : 'fragments';
        await assertStoredPolymerDetails(
            connection,
            tableName,
            parentColumn,
            parentId,
            type,
            percentagesToInsert,
            validatedPercentMethod,
            { otherDescription, hasDescColumn }
        );
    }

    return true;
}

async function buildSampleFormData(connection, sampleId, userId) {
    const [rows] = await connection.execute(`
        SELECT
            sd.*,
            se.*,
            l.*,
            mt.MediaTypeOverall,
            wt.WaterEnv_Name,
            sampleUnit.Units_Code AS SampleUnitCode,
            microUnit.Units_Code AS MicroplasticsSampleUnitCode,
            fragmentUnit.Units_Code AS FragmentsSampleUnitCode,
            packagingUnit.Units_Code AS PackagingSampleUnitCode
        FROM SampleDetails sd
        INNER JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
        LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
        LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
        LEFT JOIN WaterEnvType_Ref wt ON sd.WaterEnvType_SelectID = wt.WaterEnv_UniqueID
        LEFT JOIN Units_Ref sampleUnit ON sd.SampleUnit_Num = sampleUnit.UnitsUniqueID
        LEFT JOIN Units_Ref microUnit ON sd.MicroplasticsSampleUnit_Num = microUnit.UnitsUniqueID
        LEFT JOIN Units_Ref fragmentUnit ON sd.FragmentsSampleUnit_Num = fragmentUnit.UnitsUniqueID
        LEFT JOIN Units_Ref packagingUnit ON sd.PackagingSampleUnit_Num = packagingUnit.UnitsUniqueID
        WHERE sd.SampleUniqueID = ? AND se.UserSamplingID = ?
        LIMIT 1
    `, [sampleId, userId]);

    if (rows.length === 0) {
        return null;
    }

    const row = rows[0];
    const formData = {
        edit_mode: 'true',
        sample_id: String(sampleId),
        sampling_event_id: String(row.SamplingEvent_Num),
        location_id: row.LocationID_Num ? String(row.LocationID_Num) : '',
        location_type: 'existing',
        location_name: row.LocationName || '',
        location_shortcode: row.UserLocID_txt || '',
        location_description: row.Location_Desc || '',
        latitude: row.Lat_DecimalDegree ?? row['Lat-DecimalDegree'] ?? '',
        longitude: row.Long_DecimalDegree ?? row['Long-DecimalDegree'] ?? '',
        acres: row.Area_acres ?? row['Area-acres'] ?? '',
        streetaddress: row.StreetAddress || '',
        city: row.City || '',
        state: row.State || '',
        country: row.Country || '',
        zip_code: row.ZipCode || '',
        land_use_cover: row.LandUseCover || '',
        device_installation_period: row.DeviceInstallationPeriod || 'no',
        sample_time: formatTimeForInput(row.SampleTime) || '',
        sample_description: row.SamplerNames || '',
        publication_id_num: row.PublicationID_Num ? String(row.PublicationID_Num) : '',
        publication_present: row.PublicationID_Num ? 'yes' : 'no',
        air_temp: row.AirTemp_C ?? row['AirTemp-C'] ?? '',
        rainfall: row.Rainfall_cm_Precedent24 ?? row['Rainfall-cm-Precedent24'] ?? '',
        additional_notes: row.AdditionalNotes || '',
        media_type: resolveMediaTypeForForm(row),
        environment_type: row.WaterEnv_Name || '',
        volume_sampled: row.VolumeSampled ?? '',
        total_water_depth: row.WaterDepth ?? '',
        sample_water_depth: row.SampleWaterDepth ?? '',
        water_flow_velocity: row.FlowVelocity ?? '',
        turbidity: row.Turbidity ?? '',
        total_suspended_solids: row.SuspendedSolids ?? '',
        dissolved_oxygen: row.DissolvedOxygen ?? '',
        conductivity: row.Conductivity ?? '',
        soil_texture: row.SoilTexture ?? '',
        surface_area_sampled: row.SurfaceAreaSampled ?? '',
        permeable_surfaces: row.PermeableSurfaces ?? '',
        impermeable_surfaces: row.ImpermeableSurfaces ?? '',
        replicates_count: row.ReplicatesCount ?? '',
        total_sample_amount: row.TotalSampleAmount ?? row.MicroplasticsSampleAmount ?? row.FragmentsSampleAmount ?? row.PackagingSampleAmount ?? '',
        sample_unit: row.SampleUnitCode || row.MicroplasticsSampleUnitCode || row.FragmentsSampleUnitCode || row.PackagingSampleUnitCode || '',
        microplastics_sample_amount: row.MicroplasticsSampleAmount ?? '',
        microplastics_sample_unit: row.MicroplasticsSampleUnitCode || '',
        fragments_sample_amount: row.FragmentsSampleAmount ?? '',
        fragments_sample_unit: row.FragmentsSampleUnitCode || '',
        packaging_sample_amount: row.PackagingSampleAmount ?? '',
        packaging_sample_unit: row.PackagingSampleUnitCode || '',
        microplastics_count: row.Micro5mmAndSmaller_Count ?? '',
        fragments_count: row.FragLargerThan5mm_Count ?? ''
    };

    formData.start_year = row.StartYear ?? '';
    formData.start_month = row.StartMonth ?? '';
    formData.start_day = row.StartDay ?? '';
    formData.end_year = row.EndYear ?? '';
    formData.end_month = row.EndMonth ?? '';
    formData.end_day = row.EndDay ?? '';

    if (formData.media_type === 'water') {
        formData.water_type = row.MediaSubType || '';
        formData.water_type_other_description = row.WaterTypeOtherDescription || '';
        formData.water_additional_notes = row.MediaAdditionalNotes || '';
    } else if (formData.media_type === 'soil_sediment') {
        formData.sediment_type = row.MediaSubType || '';
        formData.sediment_type_other_description = row.SedimentTypeOtherDescription || '';
        formData.sediment_depth = row.SamplingDepth ?? '';
        formData.sediment_dry_weight = row.SoilDryWeight ?? '';
        formData.sediment_organic_matter = row.SoilOrganicMatter ?? '';
        formData.sediment_moisture = row.SoilMoisture_Percent ?? row['SoilMoisture%'] ?? '';
        formData.sediment_sand = row.SoilSand ?? '';
        formData.sediment_silt = row.SoilSilt ?? '';
        formData.sediment_clay = row.SoilClay ?? '';
        formData.sediment_additional_notes = row.MediaAdditionalNotes || '';
    } else if (formData.media_type === 'in_soil') {
        formData.soil_depth = row.SamplingDepth ?? '';
        formData.soil_sample_dry_weight = row.SoilDryWeight ?? '';
        formData.soil_organic_matter = row.SoilOrganicMatter ?? '';
        formData.soil_moisture = row.SoilMoisture_Percent ?? row['SoilMoisture%'] ?? '';
        formData.soil_sand = row.SoilSand ?? '';
        formData.soil_silt = row.SoilSilt ?? '';
        formData.soil_clay = row.SoilClay ?? '';
        formData.soil_additional_notes = row.MediaAdditionalNotes || '';
    } else if (formData.media_type === 'soil_litter') {
        formData.surface_additional_notes = row.MediaAdditionalNotes || '';
    } else if (formData.media_type === 'mixed_composite') {
        formData.mixed_media_description = row.MixedMediaDescription || '';
        formData.mixed_additional_notes = row.MediaAdditionalNotes || '';
    }

    const hasAdditionalInfo = hasAnyFormValue(formData, [
        'environment_type', 'volume_sampled', 'total_water_depth', 'sample_water_depth',
        'water_flow_velocity', 'turbidity', 'total_suspended_solids', 'dissolved_oxygen',
        'conductivity', 'sediment_depth', 'sediment_dry_weight', 'sediment_organic_matter',
        'soil_depth', 'soil_sample_dry_weight', 'soil_organic_matter', 'surface_area_sampled',
        'permeable_surfaces', 'impermeable_surfaces', 'water_additional_notes',
        'sediment_additional_notes', 'soil_additional_notes', 'surface_additional_notes',
        'mixed_additional_notes'
    ]);
    formData.additional_info = hasAdditionalInfo ? 'yes' : 'no';

    const [microRows] = await connection.execute(
        'SELECT * FROM MicroplasticsInSample WHERE SampleDetails_Num = ? LIMIT 1',
        [sampleId]
    );
    const micro = microRows[0];
    let microUniqueId = null;
    if (micro) {
        microUniqueId = micro.Micro_UniqueID;
        setIfPresent(formData, 'microplastics_count', micro.Micro5mmAndSmaller_Count);
        setIfPresent(formData, 'micro_mass_mp_total', micro.Mass_MP_Total);
        setIfPresent(formData, 'micro_method_polymer_num', micro.Method_Polymer_Num);
        setIfPresent(formData, 'micro_method_polymer_other', micro.Method_Polymer_Other);
    }

    const [fragmentRows] = await connection.execute(
        'SELECT * FROM FragmentsInSample WHERE SampleDetails_Num = ? LIMIT 1',
        [sampleId]
    );
    const fragment = fragmentRows[0];
    let fragmentUniqueId = null;
    if (fragment) {
        fragmentUniqueId = fragment.Fragment_UniqueID;
        // Prefer the child-table count (merged or legacy split); fall back to
        // the SampleDetails aggregate already placed in fragments_count.
        setIfPresent(formData, 'fragments_count', readFragmentCountFromRow(fragment));
        setIfPresent(formData, 'fragments_mass_debris_total', fragment.Mass_Debris_Total);
        setIfPresent(formData, 'fragments_method_polymer_num', fragment.Method_Polymer_Num);
        setIfPresent(formData, 'fragments_method_polymer_other', fragment.Method_Polymer_Other);
    }

    if (microUniqueId) {
        Object.assign(formData, await loadPolymerFieldsForForm(
            connection,
            'MicroplasticsPolymerDetails',
            microUniqueId,
            'mp_polymer_',
            ['MicroInSample_Num', 'Micro_UniqueID'],
            'micro_method_percent_estimate'
        ));
    }

    if (fragmentUniqueId) {
        Object.assign(formData, await loadPolymerFieldsForForm(
            connection,
            'FragmentsPolymerDetails',
            fragmentUniqueId,
            'fragment_polymer_',
            ['FragInSample_Num', 'Fragment_UniqueID'],
            'fragments_method_percent_estimate'
        ));
    }

    const detailConfigs = [
        { key: 'fragments_color_details', tableName: 'FragmentsColorDetails', idColumn: 'FragmentColor_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragColor_Num', legacyColumn: 'FragColor_Legacy', percentColumn: 'FragColorPercent', parentId: fragmentUniqueId },
        { key: 'fragments_form_details', tableName: 'FragmentsFormDetails', idColumn: 'FragForm_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragForm_Num', legacyColumn: 'FragForm_Legacy', percentColumn: 'FragFormPercent', parentId: fragmentUniqueId },
        { key: 'fragments_opacity_details', tableName: 'FragmentsOpacityDetails', idColumn: 'FragOpacity_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragOpacity_Num', legacyColumn: 'FragOpacity_Legacy', percentColumn: 'FragOpacityPercent', parentId: fragmentUniqueId },
        { key: 'fragments_purpose_details', tableName: 'FragmentsPurposes', idColumn: 'FragPurposeUniqueID', parentColumn: 'FragInSample_Num', refColumn: 'Purpose_Num', legacyColumn: 'Purpose_Legacy', percentColumn: 'Percent_Purpose', parentId: fragmentUniqueId },
        { key: 'micro_color_details', tableName: 'MicroplasticsColorDetails', idColumn: 'MicroColor_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroColor_Num', legacyColumn: 'MicroColor_Legacy', percentColumn: 'MicroColorPercent', parentId: microUniqueId },
        { key: 'micro_opacity_details', tableName: 'MicroplasticsOpacityDetails', idColumn: 'MicroOpacityUniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroOpacity_Num', legacyColumn: 'MicroOpacity_Legacy', percentColumn: 'MicroOpacityPercent', parentId: microUniqueId },
        { key: 'micro_size_details', tableName: 'MicroplasticsSizeDetails', idColumn: 'MicroplasticsSize_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroSize_Num', legacyColumn: 'MicroSize_Legacy', percentColumn: 'MicroSizePercent', parentId: microUniqueId },
        { key: 'micro_shape_details', tableName: 'MicroplasticsFormDetails', idColumn: 'MicroForm_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroShape_Num', legacyColumn: 'MicroShape_Legacy', percentColumn: 'MicroShape_Percent', parentId: microUniqueId },
        { key: 'micro_texture_details', tableName: 'MicroplasticsFormDetails', idColumn: 'MicroForm_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroTexture_Num', legacyColumn: 'MicroTexture_Legacy', percentColumn: 'MicroTexture_Percent', parentId: microUniqueId }
    ];

    for (const config of detailConfigs) {
        if (!config.parentId) continue;
        const rowsForDetail = await loadDetailRowsForForm(connection, config, config.parentId);
        // Include [] explicitly so shared shape/texture groups can round-trip
        // together and the client can distinguish "loaded empty" from omitted.
        formData[config.key] = rowsForDetail;
    }

    const hasQuantitativeData = hasAnyFormValue(formData, [
        'total_sample_amount', 'sample_unit', 'microplastics_count', 'fragments_count',
        'micro_mass_mp_total', 'fragments_mass_debris_total'
    ]) || hasMicroplasticsDetailData(formData) || hasFragmentsDetailData(formData);
    formData.has_quantitative_data = hasQuantitativeData ? 'yes' : 'no';

    return formData;
}

async function upsertChildRow(connection, tableName, idColumn, sampleId, dataMap) {
    const [rows] = await connection.execute(
        `SELECT \`${idColumn}\` as id FROM ${tableName} WHERE SampleDetails_Num = ? LIMIT 1`,
        [sampleId]
    );

    if (rows.length > 0) {
        await updateFromMap(connection, tableName, dataMap, `\`${idColumn}\` = ?`, [rows[0].id]);
        return rows[0].id;
    }

    const nextId = await nextTableId(connection, tableName, idColumn);
    await insertFromMap(connection, tableName, {
        [idColumn]: nextId,
        SampleDetails_Num: sampleId,
        ...dataMap
    });
    return nextId;
}

async function updateSampleFromFormData(connection, sampleId, userId, formData) {
    const [ownerRows] = await connection.execute(`
        SELECT sd.SampleUniqueID, sd.SamplingEvent_Num
        FROM SampleDetails sd
        INNER JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
        WHERE sd.SampleUniqueID = ? AND se.UserSamplingID = ?
        LIMIT 1
    `, [sampleId, userId]);

    if (ownerRows.length === 0) {
        return false;
    }

    const samplingEventId = ownerRows[0].SamplingEvent_Num;
    const eventDates = normalizeSamplingEventDates(formData);

    const publicationId = await resolvePublicationId(connection, formData);
    const mediaTypeId = await getMediaTypeId(connection, formData.media_type);
    const waterEnvTypeId = formData.environment_type ? await getWaterEnvTypeId(connection, formData.environment_type) : null;
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
    const sampleUnitId = sampleUnitVal ? await getSampleUnitId(connection, sampleUnitVal) : null;
    // Media-specific amounts/units are stored as submitted; the total remains a
    // fallback for older payloads. firstPresent (not ??) so an empty string from
    // a hidden section's input cannot mask the filled variant.
    const microplasticsSampleAmountVal = firstPresent(formData, 'microplastics_sample_amount') ?? totalSampleAmountVal;
    const fragmentsSampleAmountVal = firstPresent(formData, 'fragments_sample_amount') ?? totalSampleAmountVal;
    const packagingSampleAmountVal = firstPresent(formData, 'packaging_sample_amount') ?? totalSampleAmountVal;
    const microplasticsUnitVal = firstPresent(formData, 'microplastics_sample_unit');
    const fragmentsUnitVal = firstPresent(formData, 'fragments_sample_unit');
    const packagingUnitVal = firstPresent(formData, 'packaging_sample_unit');
    const microplasticsSampleUnitId = microplasticsUnitVal ? await getSampleUnitId(connection, microplasticsUnitVal) : sampleUnitId;
    const fragmentsSampleUnitId = fragmentsUnitVal ? await getSampleUnitId(connection, fragmentsUnitVal) : sampleUnitId;
    const packagingSampleUnitId = packagingUnitVal ? await getSampleUnitId(connection, packagingUnitVal) : sampleUnitId;
    const soilMoistureVal = firstPresent(formData, 'soil_moisture', 'soil_moisture_content', 'sediment_moisture');
    const waterDepthVal = firstPresent(formData, 'water_depth', 'total_water_depth', 'sample_water_depth');
    const samplingDepthVal = firstPresent(formData, 'soil_depth', 'sediment_depth');
    const flowVelocityVal = firstPresent(formData, 'flow_velocity', 'water_flow_velocity');
    const suspendedSolidsVal = firstPresent(formData, 'suspended_solids', 'total_suspended_solids');
    const soilDryWeightVal = firstPresent(formData, 'soil_dry_weight', 'soil_sample_dry_weight', 'sediment_dry_weight');
    const soilOrganicMatterVal = firstPresent(formData, 'soil_organic_matter', 'sediment_organic_matter');
    const soilSandVal = firstPresent(formData, 'soil_sand', 'sediment_sand');
    const soilSiltVal = firstPresent(formData, 'soil_silt', 'sediment_silt');
    const soilClayVal = firstPresent(formData, 'soil_clay', 'sediment_clay');
    const soilTextureVal = await resolveSoilTextureLabel(
        connection,
        firstPresent(formData, 'soil_texture', 'soilTexture')
    );
    const mediaAdditionalNotes = formData.water_additional_notes || formData.sediment_additional_notes ||
        formData.soil_additional_notes || formData.surface_additional_notes ||
        formData.mixed_additional_notes || null;

    await updateFromMap(connection, 'SamplingEvent', {
        LocationID_Num: parseNullableInt(formData.location_id),
        PublicationID_Num: publicationId,
        StartYear: eventDates.start.year,
        StartMonth: eventDates.start.month,
        StartDay: eventDates.start.day,
        EndYear: eventDates.end.year,
        EndMonth: eventDates.end.month,
        EndDay: eventDates.end.day,
        AirTemp_C: parseNullableFloat(formData.air_temp),
        Weather_Current: formData.current_conditions ? await getWeatherTypeId(connection, formData.current_conditions) : null,
        Weather_Precedent24: formData.precedent_weather ? await getWeatherTypeId(connection, formData.precedent_weather) : null,
        Rainfall_cm_Precedent24: parseNullableFloat(formData.rainfall),
        SamplerNames: valueOrNull(formData.sample_description),
        DeviceInstallationPeriod: eventDates.mode,
        SampleTime: valueOrNull(formData.sample_time),
        WeatherPrecedent24: formData.precedent_weather_24h ? await getWeatherTypeId(connection, formData.precedent_weather_24h) : null,
        AdditionalNotes: valueOrNull(formData.additional_notes)
    }, 'SamplingEventUniqueID = ? AND UserSamplingID = ?', [samplingEventId, userId]);

    await updateFromMap(connection, 'SampleDetails', {
        MediaType_SelectID: mediaTypeId,
        FragLargerThan5mm_Count: getFragmentDebrisCount(formData),
        Micro5mmAndSmaller_Count: parseNullableInt(formData.microplastics_count),
        WaterEnvType_SelectID: waterEnvTypeId,
        SoilMoisture_Percent: parseNullableFloat(soilMoistureVal),
        MediaSubType: getMediaSubType(formData),
        MixedMediaDescription: valueOrNull(formData.mixed_media_description),
        VolumeSampled: parseNullableFloat(formData.volume_sampled),
        WaterDepth: parseNullableFloat(waterDepthVal),
        SamplingDepth: parseNullableFloat(samplingDepthVal),
        FlowVelocity: parseNullableFloat(flowVelocityVal),
        SuspendedSolids: parseNullableFloat(suspendedSolidsVal),
        Conductivity: parseNullableFloat(formData.conductivity),
        SoilDryWeight: parseNullableFloat(soilDryWeightVal),
        SoilOrganicMatter: parseNullableFloat(soilOrganicMatterVal),
        SoilSand: parseNullableFloat(soilSandVal),
        SoilSilt: parseNullableFloat(soilSiltVal),
        SoilClay: parseNullableFloat(soilClayVal),
        SoilTexture: soilTextureVal,
        ReplicatesCount: parseNullableInt(formData.replicates_count),
        TotalSampleAmount: parseNullableFloat(totalSampleAmountVal),
        SampleUnit_Num: sampleUnitId,
        MicroplasticsSampleAmount: parseNullableFloat(microplasticsSampleAmountVal),
        MicroplasticsSampleUnit_Num: microplasticsSampleUnitId,
        FragmentsSampleAmount: parseNullableFloat(fragmentsSampleAmountVal),
        FragmentsSampleUnit_Num: fragmentsSampleUnitId,
        PackagingSampleAmount: parseNullableFloat(packagingSampleAmountVal),
        PackagingSampleUnit_Num: packagingSampleUnitId,
        Turbidity: parseNullableFloat(formData.turbidity),
        DissolvedOxygen: parseNullableFloat(formData.dissolved_oxygen),
        SampleWaterDepth: parseNullableFloat(formData.sample_water_depth),
        SurfaceAreaSampled: parseNullableFloat(formData.surface_area_sampled),
        PermeableSurfaces: parseNullableFloat(formData.permeable_surfaces),
        ImpermeableSurfaces: parseNullableFloat(formData.impermeable_surfaces),
        WaterTypeOtherDescription: valueOrNull(formData.water_type_other_description),
        SedimentTypeOtherDescription: valueOrNull(formData.sediment_type_other_description),
        MediaAdditionalNotes: mediaAdditionalNotes
    }, 'SampleUniqueID = ?', [sampleId]);

    const microPolymerMethodSubmitted = hasOwnAny(
        formData,
        'micro_method_polymer_num',
        'micro_methodPolymerNum'
    );
    const fragmentsPolymerMethodSubmitted = hasOwnAny(
        formData,
        'fragments_method_polymer_num',
        'fragments_methodPolymerNum'
    );
    const microPolymerFieldsSubmitted =
        getSubmittedPolymerPercentageFields(formData, 'mp_polymer_').length > 0;
    const fragmentsPolymerFieldsSubmitted =
        getSubmittedPolymerPercentageFields(formData, 'fragment_polymer_').length > 0;
    const validatedMicroPolymerMethod = microPolymerMethodSubmitted
        ? await validateSubmittedPolymerMethod(connection, formData, 'microplastics')
        : undefined;
    const validatedFragmentsPolymerMethod = fragmentsPolymerMethodSubmitted
        ? await validateSubmittedPolymerMethod(connection, formData, 'fragments')
        : undefined;

    if (microPolymerMethodSubmitted && validatedMicroPolymerMethod === null &&
        !microPolymerFieldsSubmitted) {
        const error = new Error(
            'To clear the microplastics polymer method, submit the polymer percentage group explicitly.'
        );
        error.statusCode = 400;
        throw error;
    }
    if (fragmentsPolymerMethodSubmitted && validatedFragmentsPolymerMethod === null &&
        !fragmentsPolymerFieldsSubmitted) {
        const error = new Error(
            'To clear the fragments polymer method, submit the polymer percentage group explicitly.'
        );
        error.statusCode = 400;
        throw error;
    }

    const microChildData = {
        Micro5mmAndSmaller_Count: parseNullableInt(formData.microplastics_count),
        Mass_MP_Total: parseNullableFloat(firstPresent(formData, 'micro_mass_mp_total', 'micro_massMPTotal'))
    };
    if (microPolymerMethodSubmitted) {
        microChildData.Method_Polymer_Num = validatedMicroPolymerMethod;
    }
    if (hasOwnAny(formData, 'micro_method_polymer_other', 'micro_methodPolymerOther')) {
        microChildData.Method_Polymer_Other = firstPresent(
            formData,
            'micro_method_polymer_other',
            'micro_methodPolymerOther'
        );
    }

    const microUniqueId = await upsertChildRow(
        connection,
        'MicroplasticsInSample',
        'Micro_UniqueID',
        sampleId,
        microChildData
    );

    const fragmentsChildData = {
        Mass_Debris_Total: parseNullableFloat(firstPresent(formData, 'fragments_mass_debris_total', 'fragments_massDebrisTotal')),
        ...(await buildFragmentCountColumns(connection, formData))
    };
    if (fragmentsPolymerMethodSubmitted) {
        fragmentsChildData.Method_Polymer_Num = validatedFragmentsPolymerMethod;
    }
    if (hasOwnAny(formData, 'fragments_method_polymer_other', 'fragments_methodPolymerOther')) {
        fragmentsChildData.Method_Polymer_Other = firstPresent(
            formData,
            'fragments_method_polymer_other',
            'fragments_methodPolymerOther'
        );
    }

    const fragmentUniqueId = await upsertChildRow(
        connection,
        'FragmentsInSample',
        'Fragment_UniqueID',
        sampleId,
        fragmentsChildData
    );

    await replacePolymerDetails(connection, {
        tableName: 'MicroplasticsPolymerDetails',
        idColumnCandidates: ['MicroPolymerUniqueID'],
        parentColumnCandidates: ['MicroInSample_Num', 'Micro_UniqueID'],
        parentId: microUniqueId,
        fieldPrefix: 'mp_polymer_',
        methodPercentEstimate: firstPresent(formData, 'micro_method_percent_estimate'),
        formData
    });

    await replacePolymerDetails(connection, {
        tableName: 'FragmentsPolymerDetails',
        idColumnCandidates: ['FragPolymerUniqueID'],
        parentColumnCandidates: ['FragInSample_Num', 'Fragment_UniqueID'],
        parentId: fragmentUniqueId,
        fieldPrefix: 'fragment_polymer_',
        methodPercentEstimate: firstPresent(formData, 'fragments_method_percent_estimate'),
        formData
    });

    const detailConfigs = [
        { key: 'fragments_color_details', camelKey: 'fragmentsColorDetails', tableName: 'FragmentsColorDetails', idColumn: 'FragmentColor_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragColor_Num', legacyColumn: 'FragColor_Legacy', percentColumn: 'FragColorPercent', parentId: fragmentUniqueId },
        { key: 'fragments_form_details', camelKey: 'fragmentsFormDetails', tableName: 'FragmentsFormDetails', idColumn: 'FragForm_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragForm_Num', legacyColumn: 'FragForm_Legacy', percentColumn: 'FragFormPercent', parentId: fragmentUniqueId },
        { key: 'fragments_opacity_details', camelKey: 'fragmentsOpacityDetails', tableName: 'FragmentsOpacityDetails', idColumn: 'FragOpacity_UniqueID', parentColumn: 'FragInSample_Num', refColumn: 'FragOpacity_Num', legacyColumn: 'FragOpacity_Legacy', percentColumn: 'FragOpacityPercent', parentId: fragmentUniqueId },
        { key: 'fragments_purpose_details', camelKey: 'fragmentsPurposeDetails', tableName: 'FragmentsPurposes', idColumn: 'FragPurposeUniqueID', parentColumn: 'FragInSample_Num', refColumn: 'Purpose_Num', legacyColumn: 'Purpose_Legacy', percentColumn: 'Percent_Purpose', parentId: fragmentUniqueId },
        { key: 'micro_color_details', camelKey: 'microColorDetails', tableName: 'MicroplasticsColorDetails', idColumn: 'MicroColor_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroColor_Num', legacyColumn: 'MicroColor_Legacy', percentColumn: 'MicroColorPercent', parentId: microUniqueId },
        { key: 'micro_opacity_details', camelKey: 'microOpacityDetails', tableName: 'MicroplasticsOpacityDetails', idColumn: 'MicroOpacityUniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroOpacity_Num', legacyColumn: 'MicroOpacity_Legacy', percentColumn: 'MicroOpacityPercent', parentId: microUniqueId },
        { key: 'micro_size_details', camelKey: 'microSizeDetails', tableName: 'MicroplasticsSizeDetails', idColumn: 'MicroplasticsSize_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroSize_Num', legacyColumn: 'MicroSize_Legacy', percentColumn: 'MicroSizePercent', parentId: microUniqueId },
        { key: 'micro_shape_details', camelKey: 'microShapeDetails', tableName: 'MicroplasticsFormDetails', idColumn: 'MicroForm_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroShape_Num', legacyColumn: 'MicroShape_Legacy', percentColumn: 'MicroShape_Percent', parentId: microUniqueId },
        { key: 'micro_texture_details', camelKey: 'microTextureDetails', tableName: 'MicroplasticsFormDetails', idColumn: 'MicroForm_UniqueID', parentColumn: 'MicroInSample_Num', refColumn: 'MicroTexture_Num', legacyColumn: 'MicroTexture_Legacy', percentColumn: 'MicroTexture_Percent', parentId: microUniqueId }
    ];

    const wasDetailGroupSubmitted = config =>
        Object.prototype.hasOwnProperty.call(formData, config.key) ||
        Object.prototype.hasOwnProperty.call(formData, config.camelKey);

    const shapeSubmitted = wasDetailGroupSubmitted(
        detailConfigs.find(config => config.key === 'micro_shape_details')
    );
    const textureSubmitted = wasDetailGroupSubmitted(
        detailConfigs.find(config => config.key === 'micro_texture_details')
    );
    if (shapeSubmitted !== textureSubmitted) {
        const error = new Error(
            'Microplastics shape and texture detail groups must be submitted together during an update.'
        );
        error.statusCode = 400;
        throw error;
    }

    const clearedDetailTables = new Set();
    for (const config of detailConfigs) {
        // Omitted groups are left untouched; an explicitly submitted [] means
        // the user cleared that group.
        if (!wasDetailGroupSubmitted(config)) continue;

        const clearKey = `${config.tableName}:${config.parentColumn}:${config.parentId}`;
        const replaced = await replaceDetailRows(
            connection,
            config,
            config.parentId,
            getDetailRows(formData, config.key, config.camelKey),
            { deleteExisting: !clearedDetailTables.has(clearKey) }
        );

        if (replaced) {
            clearedDetailTables.add(clearKey);
        }
    }

    return true;
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
                se.StartYear as start_year,
                se.StartMonth as start_month,
                se.StartDay as start_day,
                se.EndYear as end_year,
                se.EndMonth as end_month,
                se.EndDay as end_day,
                se.DeviceInstallationPeriod as device_installation_period,
                COALESCE(
                    sd.TotalSampleAmount,
                    sd.MicroplasticsSampleAmount,
                    sd.FragmentsSampleAmount,
                    sd.PackagingSampleAmount
                ) as total_sample_amount,
                COALESCE(
                    sampleUnit.Units_Code,
                    microUnit.Units_Code,
                    fragmentUnit.Units_Code,
                    packagingUnit.Units_Code
                ) as sample_unit,
                COALESCE(se.AdditionalNotes, sd.MediaAdditionalNotes, l.Location_Desc) as notes,
                se.DateEntered as created_at
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            LEFT JOIN Units_Ref sampleUnit ON sd.SampleUnit_Num = sampleUnit.UnitsUniqueID
            LEFT JOIN Units_Ref microUnit ON sd.MicroplasticsSampleUnit_Num = microUnit.UnitsUniqueID
            LEFT JOIN Units_Ref fragmentUnit ON sd.FragmentsSampleUnit_Num = fragmentUnit.UnitsUniqueID
            LEFT JOIN Units_Ref packagingUnit ON sd.PackagingSampleUnit_Num = packagingUnit.UnitsUniqueID
            WHERE se.UserSamplingID = ?
            ORDER BY se.StartYear DESC, se.StartMonth DESC, se.StartDay DESC, se.SamplingEventUniqueID DESC
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
            data: rows.map(addPartialDatePresentation),
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

// Get one sample owned by the current user
router.get('/my-samples/:id', requireAuth, async (req, res) => {
    try {
        const sampleId = parseNullableInt(req.params.id);
        if (!sampleId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sample ID'
            });
        }

        const [rows] = await pool.execute(`
            SELECT
                sd.SampleUniqueID as id,
                se.SamplingEventUniqueID as sampling_event_id,
                l.LocationName as location_name,
                mt.MediaTypeOverall as sample_type,
                se.StartYear as start_year,
                se.StartMonth as start_month,
                se.StartDay as start_day,
                se.EndYear as end_year,
                se.EndMonth as end_month,
                se.EndDay as end_day,
                se.DeviceInstallationPeriod as device_installation_period,
                COALESCE(
                    sd.TotalSampleAmount,
                    sd.MicroplasticsSampleAmount,
                    sd.FragmentsSampleAmount,
                    sd.PackagingSampleAmount
                ) as total_sample_amount,
                COALESCE(
                    sampleUnit.Units_Code,
                    microUnit.Units_Code,
                    fragmentUnit.Units_Code,
                    packagingUnit.Units_Code
                ) as sample_unit,
                COALESCE(se.AdditionalNotes, sd.MediaAdditionalNotes, '') as notes
            FROM SampleDetails sd
            INNER JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            LEFT JOIN Units_Ref sampleUnit ON sd.SampleUnit_Num = sampleUnit.UnitsUniqueID
            LEFT JOIN Units_Ref microUnit ON sd.MicroplasticsSampleUnit_Num = microUnit.UnitsUniqueID
            LEFT JOIN Units_Ref fragmentUnit ON sd.FragmentsSampleUnit_Num = fragmentUnit.UnitsUniqueID
            LEFT JOIN Units_Ref packagingUnit ON sd.PackagingSampleUnit_Num = packagingUnit.UnitsUniqueID
            WHERE sd.SampleUniqueID = ? AND se.UserSamplingID = ?
            LIMIT 1
        `, [sampleId, req.session.user_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sample not found'
            });
        }

        res.json({
            success: true,
            data: addPartialDatePresentation(rows[0])
        });
    } catch (error) {
        console.error('Error fetching sample:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sample'
        });
    }
});

// Get one sample as form data for full edit mode
router.get('/my-samples/:id/form-data', requireAuth, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const sampleId = parseNullableInt(req.params.id);
        if (!sampleId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sample ID'
            });
        }

        const formData = await buildSampleFormData(connection, sampleId, req.session.user_id);
        if (!formData) {
            return res.status(404).json({
                success: false,
                message: 'Sample not found'
            });
        }

        res.json({
            success: true,
            data: {
                sampleId,
                formData
            }
        });
    } catch (error) {
        console.error('Error building sample edit form data:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading sample for editing'
        });
    } finally {
        connection.release();
    }
});

// Update one sample from full edit form data
router.put('/my-samples/:id/form-data', requireAuth, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const sampleId = parseNullableInt(req.params.id);
        if (!sampleId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sample ID'
            });
        }

        const formData = req.body || {};

        const percentageValidationResult = validatePercentageGroups(formData, {
            includeLegacyColumnGroups: false
        });
        if (!percentageValidationResult.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Percentage validation failed: ' + percentageValidationResult.message,
                errors: percentageValidationResult.details
            });
        }

        const newSaveValidationResult = validateNewSaveRules(formData);
        if (!newSaveValidationResult.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Updated field validation failed: ' + newSaveValidationResult.message,
                errors: newSaveValidationResult.details
            });
        }

        await connection.beginTransaction();
        const updated = await updateSampleFromFormData(connection, sampleId, req.session.user_id, formData);
        if (!updated) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Sample not found'
            });
        }
        await connection.commit();

        res.json({
            success: true,
            message: 'Sample updated successfully',
            sampleDetailsId: sampleId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating sample from form data:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: 'Error updating sample: ' + error.message
        });
    } finally {
        connection.release();
    }
});

// Update sample data owned by the current user
router.put('/my-samples/:id',
    requireAuth,
    [
        body('total_sample_amount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Sample amount must be a non-negative number'),
        body('sample_unit').optional({ values: 'falsy' }).isLength({ max: 20 }).withMessage('Sample unit is too long'),
        body('notes').optional({ values: 'falsy' }).isLength({ max: 2000 }).withMessage('Notes are too long')
    ],
    async (req, res) => {
        const connection = await pool.getConnection();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const sampleId = parseNullableInt(req.params.id);
            if (!sampleId) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid sample ID'
                });
            }

            const [ownerRows] = await connection.execute(`
                SELECT
                    sd.SampleUniqueID,
                    sd.SamplingEvent_Num,
                    se.DeviceInstallationPeriod,
                    se.StartYear,
                    se.StartMonth,
                    se.StartDay,
                    se.EndYear,
                    se.EndMonth,
                    se.EndDay
                FROM SampleDetails sd
                INNER JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
                WHERE sd.SampleUniqueID = ? AND se.UserSamplingID = ?
                LIMIT 1
            `, [sampleId, req.session.user_id]);

            if (ownerRows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sample not found'
                });
            }

            const currentEvent = ownerRows[0];
            const samplingEventId = currentEvent.SamplingEvent_Num;
            const hasOwn = key => Object.prototype.hasOwnProperty.call(req.body, key);
            const requestedMode = hasOwn('device_installation_period')
                ? req.body.device_installation_period
                : currentEvent.DeviceInstallationPeriod;
            const submittedOrCurrent = (key, column) =>
                hasOwn(key) ? req.body[key] : currentEvent[column];
            const quickDateData = {
                device_installation_period: requestedMode,
                start_year: submittedOrCurrent('start_year', 'StartYear'),
                start_month: submittedOrCurrent('start_month', 'StartMonth'),
                start_day: submittedOrCurrent('start_day', 'StartDay'),
                end_year: hasOwn('end_year')
                    ? req.body.end_year
                    : (requestedMode === 'yes' ? currentEvent.EndYear : null),
                end_month: hasOwn('end_month')
                    ? req.body.end_month
                    : (requestedMode === 'yes' ? currentEvent.EndMonth : null),
                end_day: hasOwn('end_day')
                    ? req.body.end_day
                    : (requestedMode === 'yes' ? currentEvent.EndDay : null)
            };
            const eventDates = normalizeSamplingEventDates(quickDateData);
            const sampleAmount = parseNullableFloat(req.body.total_sample_amount);
            const normalizeOptionalText = (value) => {
                if (value === undefined || value === null) return null;
                const trimmed = String(value).trim();
                return trimmed === '' ? null : trimmed;
            };
            const sampleUnit = normalizeOptionalText(req.body.sample_unit);
            const sampleUnitId = sampleUnit ? await getSampleUnitId(connection, sampleUnit) : null;
            const notes = normalizeOptionalText(req.body.notes);

            await connection.beginTransaction();

            await connection.execute(`
                UPDATE SamplingEvent
                SET
                    StartYear = ?,
                    StartMonth = ?,
                    StartDay = ?,
                    EndYear = ?,
                    EndMonth = ?,
                    EndDay = ?,
                    DeviceInstallationPeriod = ?,
                    AdditionalNotes = ?
                WHERE SamplingEventUniqueID = ? AND UserSamplingID = ?
            `, [
                eventDates.start.year,
                eventDates.start.month,
                eventDates.start.day,
                eventDates.end.year,
                eventDates.end.month,
                eventDates.end.day,
                eventDates.mode,
                notes,
                samplingEventId,
                req.session.user_id
            ]);

            await connection.execute(`
                UPDATE SampleDetails
                SET
                    TotalSampleAmount = ?,
                    SampleUnit_Num = ?
                WHERE SampleUniqueID = ?
            `, [
                sampleAmount,
                sampleUnitId,
                sampleId
            ]);

            await connection.commit();

            res.json({
                success: true,
                message: 'Sample updated successfully'
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error updating sample:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.statusCode ? error.message : 'Error updating sample'
            });
        } finally {
            connection.release();
        }
    }
);

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

        if (req.session && req.session.user_id) {

            sql += " AND UserCreated = ?";

            params.push(req.session.user_id);

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
                req.session.user_id
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

        // Check if user is authenticated
        if (!userId) {
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

        const [locations] = await pool.execute(query, [userId]);

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
        'device_installation_period',
        'start_year', 'start_month', 'start_day',
        'end_year', 'end_month', 'end_day',
        'sample_time', 'media_type', 'water_type', 'sediment_type',

        // Weather Conditions
        'air_temp', 'current_conditions', 'recent_rainfall_amount', 'recent_rainfall_period',

        // Sample Details
        'microplastics_count', 'microplastics_sample_amount', 'microplastics_sample_unit',
        'fragments_count', 'fragments_sample_amount', 'fragments_sample_unit',

        // Microplastics Percentages
        'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um', 'mp_size_100um_1mm', 'mp_size_1_5mm',
        'mp_color_clear', 'mp_color_opaque_light', 'mp_color_opaque_dark', 'mp_color_mixed',
        'mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment',
        // Fragments color percentages
        'fragment_color_clear', 'fragment_color_opaque_light', 'fragment_color_opaque_dark', 'fragment_color_mixed',

        // Polymer Types (sample selection)
        'mp_polymer_pete', 'mp_polymer_hdpe', 'mp_polymer_pvc', 'mp_polymer_ldpe', 'mp_polymer_pp',
        'mp_polymer_ps', 'mp_polymer_pa', 'mp_polymer_pc', 'mp_polymer_pla', 'mp_polymer_abs'
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
        csvContent += '# device_installation_period: no for one collection date; yes for a device start/end range\n';
        csvContent += '# start_year: Four-digit collection/start year (required)\n';
        csvContent += '# start_month/start_day: Optional numeric components; a day requires a month\n';
        csvContent += '# end_year/end_month/end_day: Required for device periods; leave blank for single events\n';
        csvContent += '# Missing month/day values remain blank and are not replaced with January or day 1\n';
        csvContent += '# media_type: water, soil_sediment, in_soil, soil_litter, or mixed_composite\n';
        csvContent += '# Percentage fields: Must sum to 100% or leave all blank in each group\n';
        csvContent += '# fragments_count: Count of all items larger than 5mm, whole packaging included\n';

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
                se.StartYear as start_year,
                se.StartMonth as start_month,
                se.StartDay as start_day,
                se.EndYear as end_year,
                se.EndMonth as end_month,
                se.EndDay as end_day,
                se.DeviceInstallationPeriod as device_installation_period,
                COUNT(DISTINCT sd.SampleUniqueID) as particleCount
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat_DecimalDegree\` IS NOT NULL
              AND l.\`Long_DecimalDegree\` IS NOT NULL
            GROUP BY
                sd.SampleUniqueID,
                l.LocationName,
                l.\`Lat_DecimalDegree\`,
                l.\`Long_DecimalDegree\`,
                mt.MediaTypeOverall,
                se.StartYear,
                se.StartMonth,
                se.StartDay,
                se.EndYear,
                se.EndMonth,
                se.EndDay,
                se.DeviceInstallationPeriod,
                se.SamplingEventUniqueID
            ORDER BY se.StartYear DESC, se.StartMonth DESC, se.StartDay DESC, se.SamplingEventUniqueID DESC
        `;

        const [rows] = await pool.execute(sql);
        const formattedRows = rows.map(row => {
            const presentedRow = addPartialDatePresentation(row);
            return {
                ...presentedRow,
                date: presentedRow.collection_date,
                date_display: presentedRow.collection_date_display
            };
        });

        res.json({
            success: true,
            data: formattedRows,
            count: formattedRows.length
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

// Pure helpers exposed for unit tests (no database access).
module.exports._internals = {
    getFragmentDebrisCount,
    buildFragmentCountColumns,
    readFragmentCountFromRow,
    validateNumericRanges,
    validateNewSaveRules,
    hasFragmentsDetailData,
    getOtherPolymerDescription,
    validateOtherPolymerDescription,
    assertPolymerOtherDescColumn,
    insertPolymerDetails,
    replacePolymerDetails,
    loadPolymerFieldsForForm,
    POLYMER_OTHER_DESC_COLUMN
};
