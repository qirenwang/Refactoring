// Form-handler.js - Handles multi-page form functionality and session storage
// Author: [Your Name]
// Date: May 18, 2025

// Global variables
let currentPage = 1;
let loadedPages = 1; // Track how many pages have been loaded
let formData = {};
const formStorageKey = 'microplastics_form_data';
let isPageInitialLoad = true; // Flag to track if this is initial page load/refresh
const formRuntimeConfig = window.microplasticsFormConfig || {};
const isEditMode = Boolean(formRuntimeConfig.isEditMode && formRuntimeConfig.editSampleId);
const editSampleId = formRuntimeConfig.editSampleId ? String(formRuntimeConfig.editSampleId) : null;
let editDataReady = !isEditMode;
const publicationFormUtils = window.PublicationFormUtils;
const partialDateUtils = window.PartialDateUtils;
const dataSummaryUtils = window.DataSummaryUtils;
// Page-1 location state (a new location is only written at the final Save).
const locationFormUtils = window.LocationFormUtils;
// Page-1 location UI hooks, set by setupLocationSelectionInteraction().
let page1LocationUi = null;

let referenceDataCache = null;
let referenceDataPromise = null;
let publicationsCache = null;
let publicationsPromise = null;
const publicationCarryForwardKey = 'microplastics_publication_by_location';
// Data-source form fields (data_source_id + the new-source details).
const DATA_SOURCE_FORM_FIELDS = publicationFormUtils.DATA_SOURCE_FORM_FIELDS;
// In edit mode: the data source the sample had when it was loaded ('' for a
// legacy sample saved before data sources were required).
let editOriginalDataSourceId = null;

const DETAIL_TABLES = [
    'fragments_color_details',
    'fragments_form_details',
    'fragments_opacity_details',
    'fragments_purpose_details',
    'micro_color_details',
    'micro_shape_details',
    'micro_texture_details',
    'micro_opacity_details',
    'micro_size_details'
];

const PAGE4_ADDITIONAL_FIELDS = [
    // Water
    'environment_type', 'volume_sampled',
    'total_water_depth', 'sample_water_depth', 'water_depth',
    'water_flow_velocity', 'flow_velocity', 'turbidity',
    'total_suspended_solids', 'suspended_solids',
    'dissolved_oxygen', 'conductivity', 'water_additional_notes',

    // Aquatic sediment
    'sediment_depth', 'sediment_dry_weight', 'sediment_organic_matter',
    'sediment_moisture', 'sediment_sand', 'sediment_silt', 'sediment_clay',
    'sediment_additional_notes',

    // Terrestrial soil
    'soil_depth', 'soil_sample_dry_weight', 'soil_dry_weight',
    'soil_organic_matter', 'soil_moisture', 'soil_sand', 'soil_silt', 'soil_clay',
    'soil_additional_notes',

    // Shared soil/sediment reference fields
    'soil_texture', 'soil_texture_method',

    // Land surface and mixed media
    'surface_area_sampled', 'permeable_surfaces', 'impermeable_surfaces',
    'surface_additional_notes', 'mixed_additional_notes',

    // Legacy aliases that can still exist in cached/edit data
    'soil_moisture_content', 'sediment_grain_size', 'sediment_organic_content',
    'sampling_depth', 'sampling_method', 'filtration_method',
    'extraction_method', 'identification_method'
];

const POLYMER_PERCENTAGE_GROUPS = {
    mp_polymer: {
        prefix: 'mp_polymer_',
        methodFields: [
            'micro_method_polymer_num',
            'micro_methodPolymerNum',
            'micro_method_polymer_other',
            'micro_methodPolymerOther',
            'micro_method_percent_estimate'
        ]
    },
    fragment_polymer: {
        prefix: 'fragment_polymer_',
        methodFields: [
            'fragments_method_polymer_num',
            'fragments_methodPolymerNum',
            'fragments_method_polymer_other',
            'fragments_methodPolymerOther',
            'fragments_method_percent_estimate'
        ]
    }
};

let editPercentageSnapshots = null;

function normalizePercentageForSnapshot(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(4) : `invalid:${String(value)}`;
}

function canonicalDetailRows(rows) {
    if (!Array.isArray(rows)) return '[]';

    const canonicalRows = rows.map(row => ({
        ref: row?.ref_num ?? row?.refNum ?? null,
        percent: normalizePercentageForSnapshot(row?.percent),
        method: String(row?.method_percent_estimate ?? row?.methodPercentEstimate ?? '')
    }));
    canonicalRows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return JSON.stringify(canonicalRows);
}

function firstOwnedValue(state, fields) {
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(state, field)) {
            return state[field] ?? '';
        }
    }
    return '';
}

function canonicalPolymerGroup(state, config) {
    const percentages = Object.keys(state)
        .filter(key => key.startsWith(config.prefix) && !key.endsWith('_specify'))
        .map(key => [key, normalizePercentageForSnapshot(state[key])])
        .filter(([, value]) => value !== null)
        .sort(([left], [right]) => left.localeCompare(right));

    return JSON.stringify({
        percentages,
        // The Other-polymer description is part of the group: changing only the
        // text must still count as a change so it is submitted on update.
        otherDescription: String(state[`${config.prefix}other_specify`] ?? '').trim(),
        polymerMethod: String(firstOwnedValue(state, config.methodFields.slice(0, 2))),
        polymerMethodOther: String(firstOwnedValue(state, config.methodFields.slice(2, 4))),
        percentMethod: String(firstOwnedValue(state, config.methodFields.slice(4)))
    });
}

function captureEditPercentageSnapshots(state) {
    editPercentageSnapshots = {
        details: Object.fromEntries(
            DETAIL_TABLES.map(tableId => [tableId, canonicalDetailRows(state[tableId])])
        ),
        polymers: Object.fromEntries(
            Object.entries(POLYMER_PERCENTAGE_GROUPS).map(([groupKey, config]) => [
                groupKey,
                canonicalPolymerGroup(state, config)
            ])
        )
    };
}

function isDetailGroupChanged(tableId, state = formData) {
    return !isEditMode || !editPercentageSnapshots ||
        canonicalDetailRows(state[tableId]) !== editPercentageSnapshots.details[tableId];
}

function isPolymerGroupChanged(groupKey, state = formData) {
    const config = POLYMER_PERCENTAGE_GROUPS[groupKey];
    if (!config) return true;
    return !isEditMode || !editPercentageSnapshots ||
        canonicalPolymerGroup(state, config) !== editPercentageSnapshots.polymers[groupKey];
}

function buildSubmissionPayload(state) {
    // A pending new location travels as location_type 'new' + new_location
    // (no location_id); the server creates it inside the save transaction.
    const payload = locationFormUtils.prepareLocationForSubmission(
        publicationFormUtils.normalizeDataSourcePayload(state)
    );
    payload.device_installation_period = state.device_installation_period || 'no';

    ['start_year', 'start_month', 'start_day', 'end_year', 'end_month', 'end_day']
        .forEach(fieldName => {
            if (payload[fieldName] === undefined || String(payload[fieldName]).trim() === '') {
                payload[fieldName] = null;
            }
        });

    if (payload.device_installation_period !== 'yes') {
        payload.end_year = null;
        payload.end_month = null;
        payload.end_day = null;
    }

    if (!isEditMode || !editPercentageSnapshots) return payload;

    const detailChanged = Object.fromEntries(
        DETAIL_TABLES.map(tableId => [tableId, isDetailGroupChanged(tableId, state)])
    );

    // Shape and texture share one database table, so a change to either group
    // must carry both current arrays through the update transaction.
    if (detailChanged.micro_shape_details || detailChanged.micro_texture_details) {
        detailChanged.micro_shape_details = true;
        detailChanged.micro_texture_details = true;
        payload.micro_shape_details = Array.isArray(state.micro_shape_details)
            ? state.micro_shape_details
            : [];
        payload.micro_texture_details = Array.isArray(state.micro_texture_details)
            ? state.micro_texture_details
            : [];
    }

    DETAIL_TABLES.forEach(tableId => {
        if (!detailChanged[tableId]) {
            delete payload[tableId];
        }
    });

    Object.entries(POLYMER_PERCENTAGE_GROUPS).forEach(([groupKey, config]) => {
        if (isPolymerGroupChanged(groupKey, state)) return;

        Object.keys(payload)
            .filter(key => key.startsWith(config.prefix))
            .forEach(key => delete payload[key]);
        config.methodFields.forEach(field => delete payload[field]);
    });

    return payload;
}

window.shouldValidatePercentageGroup = function shouldValidatePercentageGroup(groupKey) {
    if (DETAIL_TABLES.includes(groupKey)) {
        return isDetailGroupChanged(groupKey);
    }
    if (POLYMER_PERCENTAGE_GROUPS[groupKey]) {
        return isPolymerGroupChanged(groupKey);
    }
    return true;
};

function isHiddenLegacyField(element) {
    return !!element.closest(
        '#legacy-lulc, #legacy-raman, #legacy-package-validation, ' +
        '#legacy-micro-column-percentages, #legacy-fragments-column-percentages, ' +
        '#legacy-sample-amounts'
    );
}

function setEditFormLocked(locked) {
    if (!isEditMode) return;
    const container = document.querySelector('.form-pages-container');
    if (!container) return;

    if (locked) {
        container.setAttribute('inert', '');
        container.setAttribute('aria-busy', 'true');
    } else {
        container.removeAttribute('inert');
        container.removeAttribute('aria-busy');
    }
}

// `inert` is supported by current browsers; this capture guard also prevents
// early Add/Continue/Save clicks in older browsers while edit data is loading.
document.addEventListener('click', event => {
    if (!isEditMode || editDataReady) return;
    if (!event.target.closest('.form-pages-container')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof window.showTemporaryMessage === 'function') {
        window.showTemporaryMessage('Please wait for the existing sample to finish loading.', 'info');
    }
}, true);

// A data source is mandatory for new samples and for edits of samples that
// already have one. A legacy sample (saved before data sources were required)
// stays editable without one, but any data-source input it gets must be
// complete. Same rules and messages as routes/api.js validateDataSourceRules().
function isDataSourceRequired() {
    return !isEditMode || Boolean(editOriginalDataSourceId);
}

function getDataSourceIssues(state = {}) {
    // Judge what will be sent: a year / access date the chosen type does not
    // allow is dropped from the payload (buildSubmissionPayload), not an error.
    return publicationFormUtils.validateDataSourceSelection(
        publicationFormUtils.normalizeDataSourcePayload(state),
        { required: isDataSourceRequired() }
    );
}

function hasDataSource(state = {}) {
    return publicationFormUtils.validateDataSourceSelection(state, { required: true }).length === 0;
}

function isLegacySampleWithoutDataSource() {
    return isEditMode && editOriginalDataSourceId === '' && !formData.data_source_id;
}

function hasDebrisDetailData(state = {}) {
    const detailRows = [
        ...(Array.isArray(state.fragments_color_details) ? state.fragments_color_details : []),
        ...(Array.isArray(state.fragments_form_details) ? state.fragments_form_details : []),
        ...(Array.isArray(state.fragments_opacity_details) ? state.fragments_opacity_details : []),
        ...(Array.isArray(state.fragments_purpose_details) ? state.fragments_purpose_details : [])
    ];

    return detailRows.length > 0 ||
        Object.keys(state).some(key => key.startsWith('fragment_polymer_') && !isOtherPolymerSpecifyField(key) && parseFloat(state[key]) > 0) ||
        !!state.fragments_method_polymer_num ||
        !!state.fragments_method_polymer_other ||
        !!state.fragments_method_percent_estimate;
}

// Fragments (>5mm) and whole packaging are entered as one count.
function getCombinedDebrisCount(state = {}) {
    return parseInt(state.fragments_count, 10) || 0;
}

function getPartialDateParts(state, prefix) {
    return {
        year: state[`${prefix}_year`],
        month: state[`${prefix}_month`],
        day: state[`${prefix}_day`]
    };
}

function setPartialDateError(prefix, message = '') {
    const fieldset = document.getElementById(
        prefix === 'start' ? 'start-date-section' : 'device-period-section'
    );
    const errorElement = document.getElementById(`${prefix}-date-error`);
    fieldset?.classList.toggle('has-error', Boolean(message));
    if (errorElement) {
        errorElement.textContent = message;
    }
}

function clearPartialDateFields(prefix) {
    ['year', 'month', 'day'].forEach(part => {
        const fieldName = `${prefix}_${part}`;
        delete formData[fieldName];
        const element = document.querySelector(`[name="${fieldName}"]`);
        if (element) element.value = '';
    });
    setPartialDateError(prefix);
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
}

function syncPartialDateDayOptions(prefix, options = {}) {
    const yearInput = document.getElementById(`${prefix}-year`);
    const monthSelect = document.getElementById(`${prefix}-month`);
    const daySelect = document.getElementById(`${prefix}-day`);
    if (!yearInput || !monthSelect || !daySelect || !partialDateUtils) return;

    const preferredDay = String(
        options.preferredDay ?? formData[`${prefix}_day`] ?? daySelect.value ?? ''
    );
    const year = partialDateUtils.parsePart(yearInput.value);
    const month = partialDateUtils.parsePart(monthSelect.value);
    const maximumDay = partialDateUtils.daysInMonth(year, month);

    daySelect.innerHTML = '<option value="">Unknown / not reported</option>';
    if (!maximumDay) {
        daySelect.disabled = true;
        daySelect.value = '';
        if (preferredDay) {
            delete formData[`${prefix}_day`];
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
        return;
    }

    daySelect.disabled = false;
    for (let day = 1; day <= maximumDay; day += 1) {
        const option = document.createElement('option');
        option.value = String(day);
        option.textContent = String(day);
        daySelect.appendChild(option);
    }

    if (preferredDay && Number.parseInt(preferredDay, 10) <= maximumDay) {
        daySelect.value = preferredDay;
        return;
    }

    daySelect.value = '';
    if (preferredDay) {
        delete formData[`${prefix}_day`];
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        setPartialDateError(
            prefix,
            `The selected day is not valid for ${partialDateUtils.MONTH_NAMES[month - 1]} ${year} and was cleared.`
        );
    }
}

function initializePartialDateControls() {
    syncPartialDateDayOptions('start');
    syncPartialDateDayOptions('end');
}

function validateSamplingEventDates(state = formData, options = {}) {
    const showErrors = options.showErrors === true;
    const isDevicePeriod = state.device_installation_period === 'yes';
    const startLabel = isDevicePeriod
        ? 'Device installation start date'
        : 'Plastic collection date';
    const startResult = partialDateUtils.validateDateParts(
        getPartialDateParts(state, 'start'),
        { label: startLabel }
    );
    let endResult = { valid: true, errors: [] };
    let orderResult = { valid: true, errors: [] };

    if (isDevicePeriod) {
        endResult = partialDateUtils.validateDateParts(
            getPartialDateParts(state, 'end'),
            { label: 'Device removal/end date' }
        );
        if (startResult.valid && endResult.valid) {
            orderResult = partialDateUtils.validateDateOrder(startResult, endResult);
        }
    }

    if (showErrors) {
        setPartialDateError('start', startResult.errors[0] || '');
        setPartialDateError(
            'end',
            endResult.errors[0] || orderResult.errors[0] || ''
        );
    }

    return {
        ok: startResult.valid && endResult.valid && orderResult.valid,
        issues: [...startResult.errors, ...endResult.errors, ...orderResult.errors],
        start: startResult,
        end: endResult
    };
}

function normalizeRefCode(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function mapReferenceOptions(refKey, retainedRefId = '') {
    const data = referenceDataCache || {};

    if (refKey === 'colors') {
        return (data.colors || [])
            .filter(item => item.Color_Set === 'Detailed' ||
                String(item.ColorUniqueID) === String(retainedRefId))
            .map(item => ({
                id: item.ColorUniqueID,
                code: item.Color_Code,
                label: item.Color_Name || item.Color_Code,
                disabled: item.Color_Set !== 'Detailed'
            }));
    }

    if (refKey === 'opacities') {
        return (data.opacities || []).map(item => ({
            id: item.OpacityUniqueID,
            code: item.Opacity_Code,
            label: item.Opacity_Label || item.Opacity_Code
        }));
    }

    if (refKey === 'purposes') {
        return (data.purposes || []).map(item => ({
            id: item.PurposeUniqueID,
            code: item.Purpose_Code,
            label: item.Purpose_Name || item.Purpose_Code
        }));
    }

    if (refKey === 'sizes') {
        return (data.sizes || []).map(item => ({
            id: item.SizeUniqueID,
            code: item.Size_Code,
            label: item.Size_Label || item.Size_Code
        }));
    }

    if (refKey === 'forms_mp_shape') {
        return (data.forms || [])
            .filter(item => Number(item.AppliesTo_MP_Shape) === 1)
            .map(item => ({ id: item.FormUniqueID, code: item.Form_Name, label: item.Form_Name }));
    }

    if (refKey === 'forms_texture') {
        return (data.forms || [])
            .filter(item => Number(item.AppliesTo_Texture) === 1)
            .map(item => ({ id: item.FormUniqueID, code: item.Form_Name, label: item.Form_Name }));
    }

    return [];
}

function getMethodOptions(methodType, appliesTo) {
    return (referenceDataCache?.methods || []).filter(method => {
        if (method.MethodType !== methodType) return false;
        if (appliesTo === 'MP') return Number(method.AppliesTo_MP) === 1;
        if (appliesTo === 'Debris') return Number(method.AppliesTo_Debris) === 1;
        if (appliesTo === 'SoilType') return Number(method.AppliesTo_SoilType) === 1;
        return true;
    });
}

async function loadReferenceData() {
    if (referenceDataCache) return referenceDataCache;
    if (!referenceDataPromise) {
        referenceDataPromise = fetch('/api/references')
            .then(response => response.json())
            .then(payload => {
                if (!payload.success) {
                    throw new Error(payload.message || 'Could not load reference data');
                }
                referenceDataCache = payload.data || {};
                return referenceDataCache;
            })
            .catch(error => {
                referenceDataPromise = null;
                console.error('Error loading reference data:', error);
                throw error;
            });
    }
    return referenceDataPromise;
}

async function loadPublications() {
    if (publicationsCache) return publicationsCache;
    if (!publicationsPromise) {
        // Only the signed-in user's previous data sources are offered for reuse.
        publicationsPromise = fetch('/api/data-sources?scope=mine')
            .then(response => response.json())
            .then(payload => {
                if (!payload.success) {
                    throw new Error(payload.message || 'Could not load data sources');
                }
                publicationsCache = payload.data || [];
                return publicationsCache;
            })
            .catch(error => {
                publicationsPromise = null;
                console.error('Error loading data sources:', error);
                throw error;
            });
    }
    return publicationsPromise;
}

function populateSelectOptions(select, options, placeholder) {
    if (!select) return;
    const currentValue = select.value || (select.name ? formData[select.name] : '') || '';
    select.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.dataset.code = option.code || '';
        optionElement.textContent = option.label || option.code || option.id;
        select.appendChild(optionElement);
    });
    if (currentValue) {
        select.value = String(currentValue);
    }
}

function populateReferenceDrivenControls() {
    if (!referenceDataCache) return;

    document.querySelectorAll('.unit-select').forEach(select => {
        const currentValue = select.value || formData[select.name] || '';
        const units = (referenceDataCache.units || [])
            .filter(unit => unit.Units_Type === 'Sample_Quantity');

        select.innerHTML = '<option value="">-- Select Unit --</option>';
        units.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.Units_Code;
            option.dataset.unitId = unit.UnitsUniqueID;
            option.textContent = `${unit.Units_Desc} (${unit.Units_Code})`;

            if (unit.Units_Code === 'L') option.classList.add('water-unit');
            if (unit.Units_Code === 'g') option.classList.add('soil-unit');
            if (unit.Units_Code === 'km2') option.classList.add('soil-unit', 'area-unit');

            select.appendChild(option);
        });
        select.value = currentValue;
    });

    document.querySelectorAll('.soil-texture-select').forEach(select => {
        const options = (referenceDataCache.soilTextures || []).map(item => ({
            id: item.SoilTextureUniqueID,
            code: item.SoilTexture_Code,
            label: item.SoilTexture_Code
        }));
        populateSelectOptions(select, options, '-- Select Soil Texture --');
    });

    document.querySelectorAll('select[data-method-type]').forEach(select => {
        const methods = getMethodOptions(select.dataset.methodType, select.dataset.appliesTo).map(method => ({
            id: method.MethodsUniqueID,
            code: method.Method_Code,
            label: method.Method_Label || method.Method_Code
        }));
        populateSelectOptions(select, methods, '-- Select Method --');
    });

    document.querySelectorAll('.detail-method-select').forEach(select => {
        const tableId = select.dataset.detailMethodSelect;
        const section = document.querySelector(`[data-detail-section="${tableId}"]`);
        const masterName = section?.dataset.masterMethodField || '';
        const master = masterName ? document.querySelector(`[name="${masterName}"]`) : null;
        const methods = Array.from(master?.options || [])
            .filter(option => option.value)
            .map(option => ({ id: option.value, code: option.dataset.code, label: option.textContent }));
        populateSelectOptions(select, methods, 'Use master method');
    });

    document.querySelectorAll('[data-detail-section]').forEach(section => {
        updateDetailSectionOptions(section.dataset.detailSection);
    });

    document.querySelectorAll('.publication-source-select').forEach(populateDataSourceTypeSelect);

    updateSampleAmountUnits(formData.media_type);
    restoreDetailRowsFromFormData();
}

async function initializeReferenceData() {
    try {
        await Promise.all([loadReferenceData(), loadPublications()]);
        populateReferenceDrivenControls();
        populatePublicationControls();
        applyPublicationCarryForward();
        await Promise.resolve(window.loadPolymerOptions());
        return true;
    } catch (error) {
        console.error('Reference initialization failed:', error);
        return false;
    }
}

// The eight data-source types, grouped Published / Unpublished.
function populateDataSourceTypeSelect(select) {
    if (!select) return;
    const currentValue = select.value || formData[select.name] || '';
    const types = referenceDataCache?.dataSourceTypes || [];
    select.innerHTML = '<option value="">-- Select Source Type --</option>';
    ['Published', 'Unpublished'].forEach(status => {
        const group = document.createElement('optgroup');
        group.label = status;
        types
            .filter(type => type.publication_status === status)
            .forEach(type => {
                const option = document.createElement('option');
                option.value = type.source_type_id;
                option.textContent = type.source_type_name;
                option.dataset.description = type.description || '';
                option.dataset.status = type.publication_status || '';
                group.appendChild(option);
            });
        if (group.children.length > 0) {
            select.appendChild(group);
        }
    });
    if (currentValue) {
        select.value = String(currentValue);
    }
    updateDataSourceTypeUi();
}

// Shows the detail fields once a type is chosen (or a source is reused), the
// publication year only for Published types (1-4) and the access date only for
// type 4, with the chosen type's description as help text. A year or date the
// type does not allow is cleared, unless the fields are locked to an existing
// source.
function updateDataSourceTypeUi() {
    const typeSelect = document.getElementById('data-source-type-id');
    if (!typeSelect) return;

    const typeId = typeSelect.value || formData.data_source_type_id || '';
    const rules = publicationFormUtils.getSourceTypeRules(typeId);
    const locked = Boolean(formData.data_source_id);

    const details = document.getElementById('data-source-detail-fields');
    if (details) {
        details.hidden = !(rules.typeId !== null || locked);
    }

    [
        ['publication-year-row', 'publication_year', rules.requiresYear],
        ['date-accessed-row', 'date_accessed', rules.requiresDateAccessed]
    ].forEach(([rowId, fieldName, applies]) => {
        const row = document.getElementById(rowId);
        if (!row) return;
        const input = row.querySelector(`[name="${fieldName}"]`);
        const show = applies || (locked && Boolean(input?.value));
        row.hidden = !show;
        if (input) {
            input.required = applies && !locked;
        }
        if (!show && !locked && rules.typeId !== null) {
            if (input) input.value = '';
            if (formData[fieldName]) delete formData[fieldName];
        }
    });

    const help = document.getElementById('data-source-type-help');
    if (help) {
        if (!help.dataset.defaultText) {
            help.dataset.defaultText = help.textContent.trim();
        }
        const option = typeSelect.selectedOptions && typeSelect.selectedOptions[0];
        const description = option?.dataset.description || '';
        const status = option?.dataset.status || '';
        if (rules.typeId !== null && description) {
            const yearNote = rules.requiresYear
                ? 'A publication year is required.'
                : 'Unpublished data has no publication year.';
            const dateNote = rules.requiresDateAccessed ? ' The date you accessed it is required.' : '';
            help.textContent = `${status}: ${description}. ${yearNote}${dateNote}`;
        } else {
            help.textContent = help.dataset.defaultText;
        }
    }
}

// An edited sample's data source arrives with the sample (buildSampleFormData);
// keep it selectable even if the reuse list does not include it.
function ensureSelectedDataSourceListed() {
    const selectedId = String(formData.data_source_id || '');
    if (!selectedId || !Array.isArray(publicationsCache)) return;
    const listed = publicationsCache.some(item => String(item.data_source_id) === selectedId);
    if (listed || !formData.source_title) return;
    publicationsCache.unshift({
        data_source_id: selectedId,
        source_type_id: formData.data_source_type_id || '',
        authors_or_organization: formData.authors_or_organization || '',
        publication_year: formData.publication_year || '',
        source_title: formData.source_title || '',
        journal_publisher_or_repository: formData.journal_publisher_or_repository || '',
        source_identifier_or_url: formData.source_identifier_or_url || '',
        project_or_collection_name: formData.project_or_collection_name || '',
        date_accessed: formData.date_accessed || '',
        citation_text: formData.citation_text || ''
    });
}

function populatePublicationControls() {
    ensureSelectedDataSourceListed();
    document.querySelectorAll('.publication-select').forEach(select => {
        const currentValue = select.value || formData.data_source_id || '';
        select.innerHTML = '<option value="">-- Enter a new data source --</option>';
        (publicationsCache || []).forEach(publication => {
            const option = document.createElement('option');
            option.value = publication.data_source_id;
            option.textContent = publicationFormUtils.getPublicationOptionLabel(publication);
            select.appendChild(option);
        });
        if (currentValue) {
            select.value = String(currentValue);
        }
        if (select.value) {
            applySelectedPublication(select);
        } else {
            setPublicationDetailsLocked(false);
            updateDataSourceTypeUi();
        }
    });
}

const publicationAutofillFields = publicationFormUtils.PUBLICATION_FIELD_MAP;

function setPublicationDetailsLocked(locked) {
    publicationFormUtils.setPublicationFieldsLocked(
        document.querySelectorAll('.publication-detail-field'),
        locked
    );
}

function applySelectedPublication(select) {
    const selection = publicationFormUtils.getPublicationSelectionState(
        select?.value,
        publicationsCache || []
    );

    if (!selection.publication) {
        if (select) {
            select.value = '';
        }
        // Clearing the selection unlocks and empties the details so a new
        // data source can be entered.
        delete formData.data_source_id;
        publicationAutofillFields.forEach(([fieldName]) => {
            delete formData[fieldName];
            document.querySelectorAll(`[name="${fieldName}"]`).forEach(element => {
                element.value = '';
            });
        });
        setPublicationDetailsLocked(false);
        updateDataSourceTypeUi();
        syncDataSourceLegacyNotice();
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        rememberPublicationForLocation();
        return;
    }

    formData.data_source_id = selection.publicationId;

    publicationAutofillFields.forEach(([fieldName]) => {
        const value = selection.fields[fieldName] ?? '';
        formData[fieldName] = value;
        document.querySelectorAll(`[name="${fieldName}"]`).forEach(element => {
            element.value = value;
        });
    });

    setPublicationDetailsLocked(true);
    updateDataSourceTypeUi();
    syncDataSourceLegacyNotice();
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    rememberPublicationForLocation();
}

function syncDataSourceLegacyNotice() {
    const notice = document.getElementById('data-source-legacy-notice');
    if (notice) {
        notice.hidden = !isLegacySampleWithoutDataSource();
    }
}

function getPublicationCarryForwardStore() {
    try {
        const store = JSON.parse(sessionStorage.getItem(publicationCarryForwardKey) || '{}');
        Object.keys(store).forEach(locationId => {
            store[locationId] = publicationFormUtils.migrateLegacyDataSourceFields(store[locationId]);
        });
        return store;
    } catch (_) {
        return {};
    }
}

function rememberPublicationForLocation() {
    const locationId = formData.location_id || document.getElementById('location-select')?.value;
    if (!locationId) return;

    const publicationData = {};
    DATA_SOURCE_FORM_FIELDS.forEach(field => {
        if (formData[field]) {
            publicationData[field] = formData[field];
        }
    });

    const store = getPublicationCarryForwardStore();
    if (Object.keys(publicationData).length === 0) {
        delete store[locationId];
        sessionStorage.setItem(publicationCarryForwardKey, JSON.stringify(store));
        return;
    }

    store[locationId] = publicationData;
    sessionStorage.setItem(publicationCarryForwardKey, JSON.stringify(store));
}

function hasAnyDataSourceInput(state = {}) {
    return DATA_SOURCE_FORM_FIELDS.some(field => {
        const value = state[field];
        return value !== undefined && value !== null && String(value).trim() !== '';
    });
}

function applyPublicationCarryForward() {
    // An edited sample keeps its own data source (or, for a legacy sample,
    // none until the user adds one).
    if (isEditMode) return;
    const locationId = formData.location_id || document.getElementById('location-select')?.value;
    if (!locationId) return;

    const store = getPublicationCarryForwardStore();
    const publicationData = store[locationId];
    if (!publicationData) return;

    // Carry forward only into a blank data-source block: a source the user
    // already chose or typed on page 2 (e.g. before going back to page 1 to
    // change the location) is never replaced.
    if (!hasAnyDataSourceInput(formData)) {
        Object.entries(publicationData).forEach(([field, value]) => {
            formData[field] = value;
            document.querySelectorAll(`[name="${field}"]`).forEach(element => {
                element.value = value;
            });
        });
    }

    const select = document.querySelector('.publication-select');
    if (formData.data_source_id && select) {
        select.value = String(formData.data_source_id);
        applySelectedPublication(select);
    } else {
        setPublicationDetailsLocked(false);
        updateDataSourceTypeUi();
    }

    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
}

function handleSavedPublication(data) {
    if (data && data.notice && typeof window.showTemporaryMessage === 'function') {
        // e.g. an edited legacy sample that still has no data source.
        window.showTemporaryMessage(data.notice, 'info');
    }
    const savedId = data && (data.dataSourceId || data.publicationId);
    if (!savedId) return;
    const publicationId = String(savedId);
    formData.data_source_id = publicationId;
    if (isEditMode) {
        editOriginalDataSourceId = publicationId;
    }

    // A newly created data source is not in the list loaded when the form
    // opened. Add it immediately so the carried-forward ID remains selectable
    // when the user reaches the Data Source section in the next case.
    if (Array.isArray(publicationsCache) &&
        !publicationsCache.some(publication => String(publication.data_source_id) === publicationId)) {
        publicationsCache.unshift({
            data_source_id: publicationId,
            source_type_id: formData.data_source_type_id || '',
            authors_or_organization: formData.authors_or_organization || '',
            publication_year: formData.publication_year || '',
            source_title: formData.source_title || '',
            journal_publisher_or_repository: formData.journal_publisher_or_repository || '',
            source_identifier_or_url: formData.source_identifier_or_url || '',
            project_or_collection_name: formData.project_or_collection_name || '',
            date_accessed: formData.date_accessed || '',
            citation_text: formData.citation_text || '',
            is_mine: 1
        });
    }

    populatePublicationControls();
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    rememberPublicationForLocation();
}

function createDetailRow(tableId, initial = {}) {
    const container = document.getElementById(tableId);
    const section = document.querySelector(`[data-detail-section="${tableId}"]`);
    if (!container || !section) return null;

    const row = document.createElement('div');
    row.className = 'detail-percent-row';

    const select = document.createElement('select');
    select.className = 'form-select detail-ref-select';
    select.innerHTML = '<option value="">-- Select --</option>';

    const percent = document.createElement('input');
    percent.type = 'number';
    percent.className = 'form-input detail-percent-input';
    percent.min = '0';
    percent.max = '100';
    percent.step = '0.0001';
    percent.placeholder = 'percentage';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'detail-remove-row';
    remove.textContent = 'x';
    remove.setAttribute('aria-label', 'Remove row');

    row.appendChild(select);
    row.appendChild(percent);
    row.appendChild(remove);
    container.appendChild(row);

    if (initial.ref_num) select.dataset.initialRefNum = String(initial.ref_num);
    updateDetailSectionOptions(tableId);

    if (initial.ref_num) select.value = String(initial.ref_num);
    if (initial.percent !== undefined && initial.percent !== null) percent.value = initial.percent;

    select.addEventListener('change', () => {
        updateDetailSectionOptions(tableId);
        syncDetailRowsToFormData();
    });
    percent.addEventListener('input', () => {
        updateDetailTotal(tableId);
        syncDetailRowsToFormData();
    });
    remove.addEventListener('click', () => {
        row.remove();
        updateDetailSectionOptions(tableId);
        syncDetailRowsToFormData();
    });

    updateDetailTotal(tableId);
    return row;
}

function updateDetailSectionOptions(tableId) {
    const container = document.getElementById(tableId);
    const section = document.querySelector(`[data-detail-section="${tableId}"]`);
    if (!container || !section || !referenceDataCache) return;

    const selectedValues = Array.from(container.querySelectorAll('.detail-ref-select'))
        .map(select => select.value || select.dataset.initialRefNum || '')
        .filter(Boolean);

    container.querySelectorAll('.detail-ref-select').forEach(select => {
        const current = select.value || select.dataset.initialRefNum || '';
        const options = mapReferenceOptions(section.dataset.refKey, current);
        select.innerHTML = '<option value="">-- Select --</option>';
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.id;
            optionElement.dataset.code = option.code || '';
            optionElement.textContent = option.label || option.code || option.id;
            optionElement.disabled = option.disabled ||
                (selectedValues.includes(String(option.id)) && current !== String(option.id));
            select.appendChild(optionElement);
        });
        select.value = current;
        delete select.dataset.initialRefNum;
    });

    updateDetailTotal(tableId);
}

function updateDetailTotal(tableId) {
    const container = document.getElementById(tableId);
    const totalElement = document.querySelector(`[data-total-for="${tableId}"]`);
    if (!container || !totalElement) return 0;

    const total = Array.from(container.querySelectorAll('.detail-percent-input'))
        .reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);

    totalElement.textContent = `Total: ${total.toFixed(4).replace(/\.?0+$/, '')}%`;
    totalElement.classList.toggle('valid', Math.abs(total - 100) <= 0.1);
    return total;
}

function collectDetailRows(tableId) {
    const container = document.getElementById(tableId);
    const section = document.querySelector(`[data-detail-section="${tableId}"]`);
    if (!container || !section) return [];

    const masterField = section.dataset.masterMethodField;
    const masterMethod = masterField ? document.querySelector(`[name="${masterField}"]`)?.value || '' : '';
    const overrideMethod = document.querySelector(`[data-detail-method-select="${tableId}"]`)?.value || '';
    const method = overrideMethod || masterMethod || '';

    return Array.from(container.querySelectorAll('.detail-percent-row'))
        .map(row => {
            const select = row.querySelector('.detail-ref-select');
            const percentInput = row.querySelector('.detail-percent-input');
            const percent = percentInput?.value === '' ? null : parseFloat(percentInput.value);
            return {
                ref_num: select?.value ? parseInt(select.value, 10) : null,
                legacy: select?.selectedOptions?.[0]?.dataset?.code || '',
                percent,
                method_percent_estimate: method
            };
        })
        // Keep partially completed rows so validation can report them instead
        // of silently dropping values the user attempted to enter.
        .filter(row => row.ref_num !== null || row.percent !== null);
}

function syncDetailRowsToFormData() {
    DETAIL_TABLES.forEach(tableId => {
        // A loaded empty container is an explicit clear during edit. If the
        // page/container is not loaded, preserve the existing state instead.
        const container = document.getElementById(tableId);
        if (!container || container.dataset.detailsReady !== 'true') return;

        const rows = collectDetailRows(tableId);
        formData[tableId] = rows;
    });
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    return formData;
}

function restoreDetailRowsFromFormData() {
    DETAIL_TABLES.forEach(tableId => {
        const container = document.getElementById(tableId);
        const rows = Array.isArray(formData[tableId]) ? formData[tableId] : [];
        if (!container) return;

        container.dataset.detailsReady = 'false';
        delete container.dataset.detailRestoreError;
        const authoritativeEditRestore = isEditMode && !editDataReady &&
            container.dataset.editRestored !== 'true';
        if (authoritativeEditRestore) {
            // The database payload is authoritative during the first edit
            // restore. Never let a stale or prematurely added row suppress it.
            container.replaceChildren();
        }

        const methods = [...new Set(rows.map(row =>
            String(row.method_percent_estimate ?? row.methodPercentEstimate ?? '')
        ))];
        if (methods.length > 1) {
            container.dataset.detailRestoreError =
                `${tableId} contains more than one stored percent-estimation method.`;
            console.error(container.dataset.detailRestoreError);
            return;
        }

        const storedMethod = methods[0] || '';
        if (storedMethod) {
            const section = document.querySelector(`[data-detail-section="${tableId}"]`);
            const masterFieldName = section?.dataset.masterMethodField || '';
            const masterSelect = masterFieldName
                ? document.querySelector(`[name="${masterFieldName}"]`)
                : null;
            const overrideSelect = document.querySelector(
                `[data-detail-method-select="${tableId}"]`
            );

            if (!masterSelect) {
                container.dataset.detailRestoreError =
                    `${tableId} could not restore its percent-estimation method.`;
                console.error(container.dataset.detailRestoreError);
                return;
            }

            const currentMasterMethod = String(masterSelect.value || formData[masterFieldName] || '');
            if (currentMasterMethod && masterSelect.value !== currentMasterMethod) {
                masterSelect.value = currentMasterMethod;
                if (masterSelect.value !== currentMasterMethod) {
                    container.dataset.detailRestoreError =
                        `${tableId} uses a percent-estimation method that is no longer available.`;
                    console.error(container.dataset.detailRestoreError);
                    return;
                }
            }
            if (!currentMasterMethod) {
                masterSelect.value = storedMethod;
                if (masterSelect.value !== storedMethod) {
                    container.dataset.detailRestoreError =
                        `${tableId} uses a percent-estimation method that is no longer available.`;
                    console.error(container.dataset.detailRestoreError);
                    return;
                }
                formData[masterFieldName] = storedMethod;
            } else if (currentMasterMethod !== storedMethod) {
                if (!overrideSelect) {
                    container.dataset.detailRestoreError =
                        `${tableId} could not restore its section-specific method.`;
                    console.error(container.dataset.detailRestoreError);
                    return;
                }
                overrideSelect.value = storedMethod;
                if (overrideSelect.value !== storedMethod) {
                    container.dataset.detailRestoreError =
                        `${tableId} uses a percent-estimation method that is no longer available.`;
                    console.error(container.dataset.detailRestoreError);
                    return;
                }
                const overrideContainer = document.querySelector(
                    `[data-method-override="${tableId}"]`
                );
                if (overrideContainer) overrideContainer.style.display = 'block';
            }
        }

        if (rows.length > 0 &&
            (authoritativeEditRestore || !container.querySelector('.detail-percent-row'))) {
            const restored = rows.every(row => Boolean(createDetailRow(tableId, row)));
            if (!restored) {
                container.dataset.detailRestoreError = `${tableId} could not restore all stored rows.`;
                console.error(container.dataset.detailRestoreError);
                return;
            }
        }
        updateDetailSectionOptions(tableId);
        container.dataset.detailsReady = 'true';
        if (authoritativeEditRestore) {
            container.dataset.editRestored = 'true';
        }
    });
}

window.collectDetailRows = collectDetailRows;
window.syncDetailRowsToFormData = syncDetailRowsToFormData;

// The reference polymer whose percentage must be accompanied by a free-text
// description (PolymerType_Ref.Polymer_Code = 'Other'). The description is
// posted as `<prefix>other_specify` and stored in
// <Microplastics|Fragments>PolymerDetails.PolymerOther_Desc on the Other row.
const OTHER_POLYMER_CODE = 'other';
const OTHER_POLYMER_SPECIFY_SUFFIX = 'other_specify';

function isOtherPolymerCode(code) {
    return normalizeRefCode(code) === OTHER_POLYMER_CODE;
}

function isOtherPolymerSpecifyField(fieldName) {
    return typeof fieldName === 'string' && fieldName.endsWith(`_${OTHER_POLYMER_SPECIFY_SUFFIX}`);
}

// "PET - Polyethylene terephthalate", but "Other Polymer" / "Unknown Polymer"
// / "Rubber" alone (DataSummaryUtils.formatPolymerName, shared with the summary).
function polymerRowLabel(polymer) {
    const code = String(polymer.Polymer_Code || '').trim();
    const fullName = String(polymer.Polymer_FullName || '').trim();
    if (isOtherPolymerCode(code) && (!fullName || fullName.toLowerCase() === code.toLowerCase())) {
        return 'Other polymer type';
    }
    if (window.DataSummaryUtils && typeof window.DataSummaryUtils.formatPolymerName === 'function') {
        return window.DataSummaryUtils.formatPolymerName(polymer);
    }
    return `${code} - ${fullName || code}`;
}

// Hover help for a polymer row: the PI's "when to use" note and typical
// sources (PolymerType_Ref.ClassificationNotes / CommonApplications), plus
// alternate abbreviations such as PETE or PUR.
function polymerRowHint(polymer) {
    const parts = [];
    const altCodes = String(polymer.Polymer_AltCodes || '').trim();
    const notes = String(polymer.ClassificationNotes || '').trim();
    const applications = String(polymer.CommonApplications || '').trim();
    if (altCodes) parts.push(`Also reported as: ${altCodes}`);
    if (notes) parts.push(notes);
    if (applications) parts.push(`Common sources: ${applications}`);
    return parts.join('\n');
}

// Removes every reference-driven polymer field (percentages and the Other
// description) for both groups from the in-memory form state.
function deletePolymerFieldsFromFormData() {
    Object.keys(formData).forEach(key => {
        if (key.startsWith('mp_polymer_') || key.startsWith('fragment_polymer_')) {
            delete formData[key];
        }
    });
}

// Shows the "describe the other polymer" box only while the Other percentage
// has a value. While the user is still typing (input events) the box is only
// hidden — the text is kept, because the percentage is often transiently blank
// (select-all + retype). Once the blank value is committed (change event) the
// description is cleared too, so nothing stale is saved.
function syncOtherPolymerSpecifyRow(prefix, { clear = false } = {}) {
    const percentInput = document.querySelector(`input[name="${prefix}${OTHER_POLYMER_CODE}"]`);
    const specifyRow = document.querySelector(`[data-polymer-specify-for="${prefix}${OTHER_POLYMER_CODE}"]`);
    if (!percentInput || !specifyRow) return;

    const specifyInput = specifyRow.querySelector('input');
    const specifyName = `${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`;
    const hasPercent = String(percentInput.value ?? '').trim() !== '';

    if (hasPercent) {
        specifyRow.style.display = '';
        return;
    }

    specifyRow.style.display = 'none';
    if (!clear) return;

    if (specifyInput && specifyInput.value !== '') {
        specifyInput.value = '';
    }
    if (Object.prototype.hasOwnProperty.call(formData, specifyName)) {
        delete formData[specifyName];
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    }
}

window.loadPolymerOptions = function loadPolymerOptions() {
    if (!referenceDataCache) return;

    const render = (containerId, prefix) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (container.dataset.loaded === 'true') return;

        container.innerHTML = '';
        (referenceDataCache.polymers || []).forEach(polymer => {
            const code = normalizeRefCode(polymer.Polymer_Code);
            const fieldName = `${prefix}${code}`;
            const row = document.createElement('div');
            row.className = 'form-row polymer-category';
            row.innerHTML = `
                <label class="form-label"></label>
                <input type="number" name="${fieldName}" class="form-input" placeholder="percentage" min="0" max="100" step="0.0001">
            `;
            const label = row.querySelector('label');
            label.textContent = `${polymerRowLabel(polymer)}:`;
            const hint = polymerRowHint(polymer);
            if (hint) label.title = hint;
            const input = row.querySelector('input');
            if (input && formData[fieldName] !== undefined) {
                input.value = formData[fieldName];
            }
            container.appendChild(row);

            if (!isOtherPolymerCode(polymer.Polymer_Code)) return;

            // "Describe the other polymer(s)" box directly after the Other percentage.
            const specifyName = `${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`;
            const specifyRow = document.createElement('div');
            specifyRow.className = 'form-row polymer-category polymer-other-specify-row';
            specifyRow.dataset.polymerSpecifyFor = fieldName;
            specifyRow.style.display = 'none';
            specifyRow.innerHTML = `
                <label class="form-label" for="${specifyName}">Describe the other polymer(s):</label>
                <input type="text" id="${specifyName}" name="${specifyName}" class="form-input polymer-other-specify" maxlength="255" placeholder="e.g. polyoxymethylene (POM), PEEK" autocomplete="off">
            `;
            const specifyInput = specifyRow.querySelector('input');
            if (specifyInput && formData[specifyName] !== undefined) {
                specifyInput.value = formData[specifyName];
            }
            container.appendChild(specifyRow);
            syncOtherPolymerSpecifyRow(prefix);
        });
        container.dataset.loaded = 'true';
    };

    render('mp-polymer-dynamic-container', 'mp_polymer_');
    render('fragment-polymer-dynamic-container', 'fragment_polymer_');
};

// Keep the description box in step with the Other percentage: visibility
// follows every keystroke, the description itself is only dropped once a
// blank Other percentage is committed.
function otherPolymerPrefixFor(fieldName) {
    if (fieldName === `mp_polymer_${OTHER_POLYMER_CODE}`) return 'mp_polymer_';
    if (fieldName === `fragment_polymer_${OTHER_POLYMER_CODE}`) return 'fragment_polymer_';
    return null;
}
document.addEventListener('input', function(event) {
    const prefix = otherPolymerPrefixFor(event.target && event.target.name);
    if (prefix) syncOtherPolymerSpecifyRow(prefix, { clear: false });
});
document.addEventListener('change', function(event) {
    const prefix = otherPolymerPrefixFor(event.target && event.target.name);
    if (prefix) syncOtherPolymerSpecifyRow(prefix, { clear: true });
});

document.addEventListener('click', function(event) {
    const addButton = event.target.closest('[data-add-detail-row]');
    if (addButton) {
        createDetailRow(addButton.dataset.addDetailRow);
        syncDetailRowsToFormData();
        return;
    }

    const overrideButton = event.target.closest('[data-override-for]');
    if (overrideButton) {
        const tableId = overrideButton.dataset.overrideFor;
        const override = document.querySelector(`[data-method-override="${tableId}"]`);
        if (override) {
            override.style.display = override.style.display === 'none' ? 'block' : 'none';
        }
    }
});

document.addEventListener('change', function(event) {
    if (event.target.matches('.method-polymer-select')) {
        const selected = event.target.selectedOptions[0];
        const selectedCode = selected?.dataset?.code || '';
        const otherRow = document.querySelector(`[data-method-other-for="${event.target.name}"]`);
        if (otherRow) {
            otherRow.style.display = selectedCode === 'Other_PolyType' ? 'flex' : 'none';
        }
    }

    if (event.target.matches('.detail-method-select, .percent-method-select')) {
        syncDetailRowsToFormData();
    }
});

// A Save whose response never arrived (network error) may still have been
// committed on the server, together with a held new location. A later
// duplicate-name error must then not claim that nothing was saved.
let saveOutcomeUncertain = false;
// Unsaved input in this tab. A reload, browser Back/Forward or closing the
// tab would lose it (the view starts every new entry from an empty form), so
// the browser asks before leaving while this is set.
let formHasUnsavedChanges = false;

function markFormDirty() {
    formHasUnsavedChanges = true;
}

function markFormSaved() {
    formHasUnsavedChanges = false;
    saveOutcomeUncertain = false;
}

// Contract C4, for every successful save request in both modes (POST
// /api/save-form-data and, in Edit My Data, PUT /api/my-samples/:id/form-data):
// a held new location has now been created, so the form state switches to
// the returned locationId. A repeated Save/Update (the Update button stays
// enabled until the redirect) or options B/C then reuse that location
// instead of trying to create it a second time. Run it before
// handleSavedPublication(), which remembers the data source under the
// location id.
function applyLocationSaveResponse(data) {
    const savedLocation = locationFormUtils.applySaveResponse(formData, data);
    if (savedLocation.created && page1LocationUi) {
        page1LocationUi.selectSavedLocation(savedLocation.locationId, savedLocation.location);
    }
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    return savedLocation;
}

// Location names are unique in the database under a case-insensitive
// collation that ignores trailing spaces; compare the same way.
function normalizeLocationNameForMatch(name) {
    return String(name === null || name === undefined ? '' : name).trim().toLowerCase();
}

// locations: GET /api/locations rows ({ id, name, ... }) of the current user.
function locationNameInList(locations, name) {
    const wanted = normalizeLocationNameForMatch(name);
    if (!wanted || !Array.isArray(locations)) return false;
    return locations.some(location => normalizeLocationNameForMatch(location && location.name) === wanted);
}

// Text for "a location with this name already exists" (page-1 check or Save).
// ownLocation: the name is one of the user's own locations (now listed in the
// refreshed dropdown); otherwise it belongs to another account and cannot be
// selected. listRefreshed false: the user's list could not be loaded.
function buildDuplicateLocationText(name, options = {}) {
    const label = String(name || '').trim();
    const quoted = label ? `"${label}"` : 'with this name';
    if (options.atSave && options.outcomeUncertain) {
        return `Your previous Save may have gone through: the connection was lost before the server answered, and a location ${quoted} now exists. ` +
            'Please open My Samples and check whether this sample was saved before you save it again.';
    }
    if (!options.listRefreshed) {
        return locationFormUtils.DUPLICATE_LOCATION_HELP;
    }
    if (options.ownLocation) {
        return `You already have a location ${quoted}. If you re-visited it (repeat sampling), select it under ` +
            '"1. Select previously sampled location" (the list has been refreshed) and click "Continue". ' +
            'Otherwise enter a different location name.';
    }
    return `The location name ${label ? quoted + ' ' : ''}is already used by another location (it may have been entered by another account). ` +
        'Please enter a different location name.';
}

// Reloads the "Select previously sampled location" options from
// GET /api/locations (the list is otherwise filled only once, at page load),
// keeping the current selection and without firing 'change'. Returns the
// location rows, or null when they could not be loaded.
async function refreshLocationSelectOptions() {
    const select = document.getElementById('location-select');
    if (!select) return null;

    let data;
    try {
        const response = await fetch('/api/locations', { headers: { 'Accept': 'application/json' } });
        data = await response.json();
        if (!response.ok || !data || !data.success || !Array.isArray(data.locations)) return null;
    } catch (error) {
        console.warn('Could not refresh the location list:', error);
        return null;
    }

    const selectedValue = select.value;
    const previousSelected = selectedValue
        ? Array.from(select.options).find(option => option.value === selectedValue)
        : null;
    Array.from(select.options).forEach(option => {
        if (option.index > 0) option.remove();
    });

    data.locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = location.userLocId ? `${location.name} (${location.userLocId})` : location.name;
        option.setAttribute('data-name', location.name ?? '');
        option.setAttribute('data-user-loc-id', location.userLocId ?? '');
        option.setAttribute('data-description', location.description ?? '');
        option.setAttribute('data-city', location.city ?? '');
        option.setAttribute('data-state', location.state ?? '');
        option.setAttribute('data-zipcode', location.zipCode ?? '');
        option.setAttribute('data-latitude', location.latitude ?? '');
        option.setAttribute('data-longitude', location.longitude ?? '');
        select.appendChild(option);
    });
    if (data.locations.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No locations found';
        select.appendChild(option);
    }

    if (selectedValue) {
        const stillListed = Array.from(select.options).some(option => option.value === selectedValue);
        if (!stillListed && previousSelected) select.appendChild(previousSelected);
        select.value = selectedValue;
    }
    return data.locations;
}

async function describeDuplicateLocationName(name, options = {}) {
    const atSave = Boolean(options.atSave);
    if (atSave && saveOutcomeUncertain) {
        return buildDuplicateLocationText(name, { atSave, outcomeUncertain: true });
    }
    const locations = await refreshLocationSelectOptions();
    return buildDuplicateLocationText(name, {
        atSave,
        listRefreshed: Array.isArray(locations),
        ownLocation: locationNameInList(locations, name)
    });
}

// Save error text. A taken location name refreshes the location list first,
// so the advice matches what the dropdown offers.
async function buildSaveErrorMessage(status, data, currentFormState = {}) {
    const serverMsg = data && (data.message || data.error);
    if (status === 400 && locationFormUtils.isDuplicateLocationMessage(serverMsg)) {
        const state = currentFormState || {};
        const name = (state.new_location && state.new_location.locationName) || state.location_name;
        const uncertain = saveOutcomeUncertain;
        const text = await describeDuplicateLocationName(name, { atSave: true });
        if (uncertain) return text;
        return 'Could not save: ' + text + ` Then click "Continue" on Page 1 and click ${finalSaveButtonLabel()} again. ` +
            'Nothing was saved by this attempt.';
    }
    return buildFriendlySaveError(status, data, currentFormState);
}

// fetch() for the final Save. A request that gets no response at all may
// still have been committed, so say so instead of a bare network error.
function fetchSaveRequest(url, options) {
    return fetch(url, options).catch(error => {
        saveOutcomeUncertain = true;
        const lost = new Error('The connection was lost while saving, so it is not known whether this sample was saved. ' +
            'Please check My Samples before you save it again.');
        lost.cause = error;
        throw lost;
    });
}

// Build a user-friendly save error message for non-technical users
function buildFriendlySaveError(status, data, currentFormState = {}) {
    // Prefer server-provided details when present
    const serverMsg = data && (data.message || data.error);
    const serverErrors = Array.isArray(data && data.errors) ? data.errors : [];

    // Special cases with actionable guidance
    if (status === 400) {
        // The new location's name was taken (checked again at Save). Nothing
        // was saved: the location and the sample were rolled back together.
        // (buildSaveErrorMessage refines this with the refreshed location list.)
        if (locationFormUtils.isDuplicateLocationMessage(serverMsg)) {
            if (saveOutcomeUncertain) {
                return buildDuplicateLocationText(
                    currentFormState.new_location && currentFormState.new_location.locationName,
                    { atSave: true, outcomeUncertain: true }
                );
            }
            return 'Could not save: ' + locationFormUtils.DUPLICATE_LOCATION_HELP +
                ` Then click "Continue" on Page 1 and click ${finalSaveButtonLabel()} again. Nothing was saved by this attempt.`;
        }

        // The new location's details were rejected at Save.
        if (serverMsg && serverMsg.toLowerCase().includes('location') &&
            locationFormUtils.hasPendingNewLocation(currentFormState)) {
            const details = serverErrors
                .map(e => (typeof e === 'string' ? e : (e && (e.msg || e.message))))
                .filter(Boolean)
                .slice(0, 3);
            return 'Could not save: The new location on Page 1 needs attention. ' +
                (details.length > 0 ? details.join('; ') : String(serverMsg).replace(/^Error saving data:\s*/i, '')) +
                ' Please review Page 1, click "Continue", and Save again. Nothing was saved.';
        }

        // Missing location
        if (serverMsg && serverMsg.toLowerCase().includes('location')) {
            const hasNewLocationInputs = !!(
                currentFormState.location_name ||
                currentFormState.location_shortcode ||
                currentFormState.location_description ||
                currentFormState.latitude ||
                currentFormState.longitude ||
                currentFormState.streetaddress ||
                currentFormState.city ||
                currentFormState.state ||
                currentFormState.country ||
                currentFormState.zip_code
            );
            if (hasNewLocationInputs) {
                return 'Could not save: You entered a new location but it has not been confirmed yet. Please go to Page 1 and click "Continue" to check the new location, or select a previous location from the dropdown.';
            }
            return 'Could not save: Please select a location on Page 1 (either choose a previous location or enter a new one and click "Continue").';
        }

        // Missing sample date or media type
        if (serverMsg && (serverMsg.toLowerCase().includes('sample date') || serverMsg.toLowerCase().includes('media type'))) {
            return 'Could not save: Please fill required fields on Page 2 — Sample Date and Media Type.';
        }

        // Percentage validation failures
        if (serverMsg && serverMsg.toLowerCase().includes('percentage validation failed')) {
            return 'Could not save: One or more percentage groups must total 100%. Please review the percentages shown and adjust them to sum to 100%.';
        }

        // Generic 400 with server field errors
        if (serverErrors.length > 0) {
            const details = serverErrors
                .map(e => (typeof e === 'string' ? e : (e && (e.msg || e.message))))
                .filter(Boolean)
                .slice(0, 3);
            if (details.length > 0) {
                return 'Could not save: Some fields need attention. ' + details.join('; ');
            }
        }

        // Fallback for 400 (a rejected new location also explains why)
        if (serverMsg && locationFormUtils.hasPendingNewLocation(currentFormState)) {
            return 'Could not save: ' + String(serverMsg).replace(/^Error saving data:\s*/i, '') +
                ' Please review the form (including the new location on Page 1) and try again. Nothing was saved.';
        }
        return 'Could not save: Some required information is missing or invalid. Please review the form and try again.';
    }

    // Other status codes
    if (status >= 500) {
        return 'Server error while saving. Please try again shortly. If this continues, contact support.';
    }
    return serverMsg || 'An error occurred while saving. Please try again.';
}

// Developer-facing structured log for failed saves
function devLogSaveError(context, status, data, requestBody) {
    try {
        const payload = {
            context,
            status,
            server: {
                message: data && (data.message || data.error),
                errors: data && data.errors,
                code: data && data.code,
                success: data && data.success
            },
            requestBody
        };
        // Always log warnings for failed saves; if mp_debug=1, log as a table + full object
        if (typeof localStorage !== 'undefined' && localStorage.getItem('mp_debug') === '1') {
            // Pretty console for dev
            console.groupCollapsed(`Save failed [${context}] status=${status}`);
            try { console.table(payload.server && payload.server.errors || []); } catch (_) {}
            console.log('Details:', payload);
            console.groupEnd();
        } else {
            console.warn('Save failed:', payload);
        }
    } catch (e) {
        console.warn('Save failed (logging error):', status, data);
    }
}

function getSaveRequestConfig() {
    if (isEditMode && editSampleId) {
        return {
            url: `/api/my-samples/${encodeURIComponent(editSampleId)}/form-data`,
            method: 'PUT',
            successMessage: 'Data Updated Successfully!'
        };
    }

    return {
        url: '/api/save-form-data',
        method: 'POST',
        successMessage: 'Data Saved Successfully!'
    };
}

// Lightweight pre-submit validation to catch common issues before calling the API
function preValidateBeforeSubmit(state) {
    const issues = [];

    if (isEditMode && !editDataReady) {
        issues.push('The existing sample did not finish loading. Refresh the page before saving.');
        return { ok: false, issues };
    }

    if (isEditMode) {
        const unrestoredDetailGroups = DETAIL_TABLES.filter(tableId => {
            const hasStoredRows = Array.isArray(state[tableId]) && state[tableId].length > 0;
            const container = document.getElementById(tableId);
            return hasStoredRows &&
                (!container || container.dataset.detailsReady !== 'true');
        });
        const detailRestoreErrors = DETAIL_TABLES
            .map(tableId => document.getElementById(tableId)?.dataset.detailRestoreError)
            .filter(Boolean);

        const hasMicroPolymerData = Object.keys(state).some(key =>
            key.startsWith('mp_polymer_') && !key.endsWith('_specify') && parseFloat(state[key]) > 0
        );
        const hasFragmentPolymerData = Object.keys(state).some(key =>
            key.startsWith('fragment_polymer_') && !key.endsWith('_specify') && parseFloat(state[key]) > 0
        );
        const microPolymerReady = document.getElementById('mp-polymer-dynamic-container')
            ?.dataset.loaded === 'true';
        const fragmentPolymerReady = document.getElementById('fragment-polymer-dynamic-container')
            ?.dataset.loaded === 'true';

        if (unrestoredDetailGroups.length > 0 || detailRestoreErrors.length > 0 ||
            (hasMicroPolymerData && !microPolymerReady) ||
            (hasFragmentPolymerData && !fragmentPolymerReady)) {
            issues.push(
                detailRestoreErrors[0] ||
                'Existing percentage details did not finish loading. Refresh the page before saving.'
            );
            return { ok: false, issues };
        }
    }

    if (typeof syncDetailRowsToFormData === 'function') {
        syncDetailRowsToFormData();
        Object.assign(state, formData);
    }

    // Location must be confirmed on page 1: either a previous location or a
    // new location that was checked with Continue (it is created on Save).
    if (!locationFormUtils.hasConfirmedLocation(state)) {
        const newLocationEntered = !!(
            state.location_name || state.location_shortcode || state.location_description ||
            state.latitude || state.longitude || state.streetaddress || state.city ||
            state.state || state.country || state.zip_code
        );
        if (newLocationEntered) {
            issues.push('Please go to Page 1 and click "Continue" to check the new location, or clear those fields and select a previous location.');
        } else {
            issues.push('Please select a location on Page 1.');
        }
    } else if ((!isEditMode || locationFormUtils.hasPendingNewLocation(state)) &&
        document.getElementById('form-page1')) {
        // Page 1 stays editable after Continue. If it no longer shows the
        // confirmed location, the edit was never checked: ask for Continue
        // again instead of silently saving either version.
        const comparison = locationFormUtils.compareConfirmedLocation(state, validateLocationInput());
        if (!comparison.matches) {
            issues.push('The location on Page 1 was changed after you confirmed it. Please go to Page 1 and click "Continue" to confirm the location again.');
        }
    }

    // Page 2 date components are validated together so all save paths apply
    // identical partial-date and device-period ordering rules.
    const samplingDateValidation = validateSamplingEventDates(state);
    issues.push(...samplingDateValidation.issues);
    if (!state.media_type) {
        issues.push('Please select Media Type on Page 2.');
    }
    // Data source: mandatory for new samples (same rules as the API).
    issues.push(...getDataSourceIssues(state));

    if ((state.total_sample_amount && !state.sample_unit) || (!state.total_sample_amount && state.sample_unit)) {
        issues.push('Total Sample Amount and Sample Unit must be entered together.');
    }

    const debrisCount = getCombinedDebrisCount(state);
    const debrisMass = parseFloat(state.fragments_mass_debris_total) || 0;
    if (state.has_quantitative_data === 'yes' && hasDebrisDetailData(state) && debrisCount <= 0 && debrisMass <= 0) {
        issues.push('Enter at least a fragments count or a fragments mass.');
    }

    DETAIL_TABLES.forEach(tableId => {
        if (isEditMode && !isDetailGroupChanged(tableId, state)) return;
        const rows = Array.isArray(state[tableId]) ? state[tableId] : [];
        if (rows.length === 0) return;
        const total = rows.reduce((sum, row) => sum + (parseFloat(row.percent) || 0), 0);
        if (Math.abs(total - 100) > 0.1) {
            issues.push(`${tableId.replace(/_/g, ' ')} must total 100%.`);
        }
        if (rows.some(row => !row.method_percent_estimate)) {
            issues.push(`${tableId.replace(/_/g, ' ')} requires a percent-estimation method.`);
        }
    });

    const validateMicroPolymer = !isEditMode || isPolymerGroupChanged('mp_polymer', state);
    const hasMicroPolymerRows = validateMicroPolymer && Object.keys(state).some(key =>
        key.startsWith('mp_polymer_') && !isOtherPolymerSpecifyField(key) && parseFloat(state[key]) > 0
    );
    if (hasMicroPolymerRows && !state.micro_method_polymer_num) {
        issues.push('Microplastics polymer percentages require a Polymer ID Method.');
    }
    if (hasMicroPolymerRows && !state.micro_method_percent_estimate) {
        issues.push('Microplastics polymer percentages require a percent-estimation method.');
    }
    if (validateMicroPolymer) {
        issues.push(...getOtherPolymerDescriptionIssues(state, 'mp_polymer_', 'Microplastics'));
    }

    const validateFragmentPolymer = !isEditMode || isPolymerGroupChanged('fragment_polymer', state);
    const hasFragmentPolymerRows = validateFragmentPolymer && Object.keys(state).some(key =>
        key.startsWith('fragment_polymer_') && !isOtherPolymerSpecifyField(key) && parseFloat(state[key]) > 0
    );
    if (hasFragmentPolymerRows && !state.fragments_method_polymer_num) {
        issues.push('Fragments polymer percentages require a Polymer ID Method.');
    }
    if (hasFragmentPolymerRows && !state.fragments_method_percent_estimate) {
        issues.push('Fragments polymer percentages require a percent-estimation method.');
    }
    if (validateFragmentPolymer) {
        issues.push(...getOtherPolymerDescriptionIssues(state, 'fragment_polymer_', 'Fragments'));
    }

    return { ok: issues.length === 0, issues };
}

// The Other polymer percentage and its description go together: a percentage
// needs a description, and a description without a percentage is meaningless.
// Mirrors validateNumericRanges/validateNewSaveRules on the server.
function getOtherPolymerDescriptionIssues(state, prefix, groupLabel) {
    const issues = [];
    const otherPercent = parseFloat(state[`${prefix}${OTHER_POLYMER_CODE}`]);
    const description = String(state[`${prefix}${OTHER_POLYMER_SPECIFY_SUFFIX}`] ?? '').trim();

    if (otherPercent > 0 && !description) {
        issues.push(`${groupLabel} polymer types: please describe the "Other" polymer(s) in the box under the Other percentage.`);
    }
    if (description && !(otherPercent > 0)) {
        issues.push(`${groupLabel} polymer types: an "Other" description was entered but the Other percentage is blank or 0.`);
    }
    return issues;
}

// Location validation and priority system functions - GLOBAL SCOPE
async function validateAndProceedFromPage1() {
    console.log('=== validateAndProceedFromPage1 called ===');

    try {
        const locationData = validateLocationInput();
        console.log('Location validation result:', locationData);

        if (!locationData.isValid) {
            console.log('Validation failed, showing error:', locationData.message);
            await showValidationError(locationData.message);
            return;
        }

        // Clear any existing validation error messages when validation succeeds
        clearValidationError();

        // Show confirmation dialog based on whether it's existing or new location
        if (locationData.isExistingLocation) {
            console.log('Showing existing location confirmation');
            await showExistingLocationConfirmation(locationData);
        } else {
            console.log('Showing new location confirmation');
            await showNewLocationConfirmation(locationData);
        }
    } catch (error) {
        console.error('Error in validateAndProceedFromPage1:', error);
        await showValidationError('An error occurred during validation. Please try again.');
    }
}

function validateLocationInput() {
    // Option 1: Previously sampled location (has priority)
    const locationSelect = document.getElementById('location-select');
    const selectedLocationId = locationSelect ? locationSelect.value : '';

    console.log('validateLocationInput - selectedLocationId:', selectedLocationId);
    console.log('validateLocationInput - locationSelect.value:', locationSelect?.value);

    // Option 2 fields an existing location may override for this event.
    const locationDescription = document.getElementById('location-description')?.value?.trim() || '';
    const latitude = document.getElementById('latitude')?.value?.trim() || '';
    const longitude = document.getElementById('longitude')?.value?.trim() || '';

    // Priority system: Option 1 overrides Option 2
    // but allows sample-specific overrides for description/coordinates.
    if (selectedLocationId) {
        const selectedOption = locationSelect.options[locationSelect.selectedIndex];
        const selectedDescription = selectedOption?.getAttribute('data-description')?.trim() || '';
        const selectedLatitude = selectedOption?.getAttribute('data-latitude')?.trim() || '';
        const selectedLongitude = selectedOption?.getAttribute('data-longitude')?.trim() || '';

        const hasCoordinateInput = latitude !== '' || longitude !== '';
        if (hasCoordinateInput && (!latitude || !longitude)) {
            return {
                isValid: false,
                message: 'Please provide both latitude and longitude when editing coordinates for an existing location.'
            };
        }

        if (hasCoordinateInput) {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return {
                    isValid: false,
                    message: 'Please provide valid coordinates (latitude: -90 to 90, longitude: -180 to 180).'
                };
            }
        }

        const normalizeCoordinate = (value) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }
            const parsed = parseFloat(value);
            if (isNaN(parsed)) {
                return String(value).trim();
            }
            return parsed.toFixed(6);
        };

        const normalizedCurrentLat = normalizeCoordinate(latitude);
        const normalizedCurrentLng = normalizeCoordinate(longitude);
        const normalizedSelectedLat = normalizeCoordinate(selectedLatitude);
        const normalizedSelectedLng = normalizeCoordinate(selectedLongitude);

        const latitudeChanged = hasCoordinateInput && normalizedCurrentLat !== normalizedSelectedLat;
        const longitudeChanged = hasCoordinateInput && normalizedCurrentLng !== normalizedSelectedLng;

        if (latitudeChanged !== longitudeChanged) {
            return {
                isValid: false,
                message: 'Please update both latitude and longitude together for an existing location override.'
            };
        }

        const locationOverrides = {};
        if (locationDescription && locationDescription !== selectedDescription) {
            locationOverrides.description = locationDescription;
        }
        if (latitudeChanged && longitudeChanged) {
            locationOverrides.latitude = latitude;
            locationOverrides.longitude = longitude;
        }

        console.log('Location select has value, returning valid with existing location');
        return {
            isValid: true,
            isExistingLocation: true,
            locationId: selectedLocationId,
            locationName: selectedOption?.getAttribute('data-name') || selectedOption?.textContent || '',
            locationOverrides: Object.keys(locationOverrides).length > 0 ? locationOverrides : null
        };
    }

    // If Option 1 is not selected, validate Option 2 (shared with the
    // server-side rules of /api/locations/check and the final Save).
    return locationFormUtils.validateNewLocationValues(readPage1LocationValues());
}

// Current page-1 location inputs, keyed by input name.
function readPage1LocationValues() {
    const page1 = document.getElementById('form-page1');
    const values = {};
    locationFormUtils.PAGE1_FORM_KEYS.forEach(name => {
        const input = page1 ? page1.querySelector(`[name="${name}"]`) : null;
        values[name] = input ? String(input.value || '').trim() : '';
    });
    return values;
}

function writePage1LocationValues(values) {
    const page1 = document.getElementById('form-page1');
    if (!page1) return;
    locationFormUtils.PAGE1_FORM_KEYS.forEach(name => {
        const input = page1.querySelector(`[name="${name}"]`);
        if (input) {
            input.value = values && values[name] !== undefined && values[name] !== null
                ? String(values[name])
                : '';
        }
    });
}

// Event-level description/coordinates confirmed (Continue) for this existing
// location, or {} when the location is not the confirmed one (new entries).
function getConfirmedOverridesForLocation(locationId) {
    if (isEditMode || !locationId) return {};
    if (formData.location_type === 'new' || String(formData.location_id || '') !== String(locationId)) return {};
    const overrides = {};
    if (formData.event_location_description) overrides.description = String(formData.event_location_description);
    if (formData.event_latitude && formData.event_longitude) {
        overrides.latitude = String(formData.event_latitude);
        overrides.longitude = String(formData.event_longitude);
    }
    return overrides;
}

function isPage1LocationBlank() {
    const select = document.getElementById('location-select');
    return !(select && select.value) &&
        locationFormUtils.arePage1ValuesBlank(readPage1LocationValues());
}

// Refills page 1 from the confirmed location in formData. Page 1 is never
// re-rendered, so this only acts when its inputs were emptied while a
// confirmed location is still held (it never overwrites what is shown).
function restorePage1FromFormData() {
    if (isEditMode || !isPage1LocationBlank()) return false;
    if (!locationFormUtils.hasConfirmedLocation(formData)) return false;

    const restore = locationFormUtils.getPage1RestoreValues(formData);
    const select = document.getElementById('location-select');
    if (restore.mode === 'existing') {
        const hasOption = select && Array.from(select.options)
            .some(option => String(option.value) === restore.selectValue);
        if (!hasOption) return false;
        select.value = restore.selectValue;
        writePage1LocationValues(restore.values);
        if (page1LocationUi) page1LocationUi.markExistingMode();
    } else if (restore.mode === 'new') {
        if (select) select.value = '';
        writePage1LocationValues(restore.values);
        if (page1LocationUi) page1LocationUi.markNewMode();
    } else {
        return false;
    }

    syncLocationMapFromInputs({ zoom: 13 });
    return true;
}

function clearValidationError() {
    const errorElement = document.getElementById('location-validation-error');
    if (errorElement) {
        errorElement.remove();
    }
}

function syncLocationMapFromInputs(options = {}) {
    if (typeof window !== 'undefined' && typeof window.syncDataEntryMapFromInputs === 'function') {
        window.syncDataEntryMapFromInputs(options);
    }
}

async function showValidationError(message) {
    // Also show fancy modal for immediate attention
    await window.showErrorMessage(message, 'Validation Error');

    // Keep the existing inline error display for reference
    let errorElement = document.getElementById('location-validation-error');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'location-validation-error';
        errorElement.className = 'validation-error';
        errorElement.style.cssText = `
            background-color: #fee;
            color: #c33;
            padding: 10px;
            border: 1px solid #fcc;
            border-radius: 4px;
            margin: 10px 0;
            font-weight: bold;
        `;

        // Insert before the continue button
        const continueButton = document.getElementById('page1-continue');
        continueButton.parentNode.insertBefore(errorElement, continueButton);
    }

    errorElement.textContent = message;
    errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function showExistingLocationConfirmation(locationData) {
    try {
        const confirmed = await window.showLocationConfirmationModal(locationData.locationName);

        if (confirmed) {
            // Save the selection to form data. Any new-location details held
            // from an earlier Continue are dropped, so they cannot be saved.
            locationFormUtils.applyExistingLocationConfirmation(formData, locationData);

            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
            if (!isEditMode) markFormDirty();

            // Clear any validation errors
            clearValidationError();
            proceedToNextPage();
            refreshSummaryIfLoaded();
        }
    } catch (error) {
        console.error('Error in location confirmation:', error);
        window.showErrorMessage('An error occurred while confirming the location selection.');
    }
}

async function showNewLocationConfirmation(locationData) {
    // New entries and Edit My Data alike: nothing is written on Continue.
    await checkAndHoldNewLocation(locationData);
}

// Label of the button that finally writes the sample (and a held new
// location) to the database.
function finalSaveButtonLabel() {
    return isEditMode ? '"Update Data"' : '"Save"';
}

// The new location is checked read-only on the server and kept in the form.
// It is written to the database only by the final Save (POST
// /api/save-form-data, or PUT /api/my-samples/:id/form-data in Edit My Data),
// in the same transaction as the sample.
async function checkAndHoldNewLocation(locationData) {
    const continueButton = document.getElementById('page1-continue');
    const payload = locationData.locationData;

    let checkResult;
    try {
        window.showProgress('Checking New Location', 'Please wait while we check the new location details...');
        if (continueButton) continueButton.disabled = true;
        clearValidationError();

        const response = await fetch('/api/locations/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        let data = null;
        try { data = await response.json(); } catch (_) { data = null; }
        checkResult = { ok: response.ok && Boolean(data && data.success), data };
    } catch (error) {
        console.error('Error checking new location:', error);
        checkResult = { ok: false, networkError: true };
    } finally {
        window.hideProgress();
        if (continueButton) continueButton.disabled = false;
    }
    // fancyModal.hide() resolves the pending modal after its 300 ms close
    // animation; opening the next modal sooner would auto-cancel it.
    await new Promise(resolve => setTimeout(resolve, 350));

    if (!checkResult.ok) {
        const serverMessage = checkResult.data && checkResult.data.message;
        let message;
        if (checkResult.networkError) {
            message = 'The new location could not be checked. Please check your connection and try again.';
        } else if (locationFormUtils.isDuplicateLocationMessage(serverMessage)) {
            message = await describeDuplicateLocationName(payload && payload.locationName);
        } else {
            const errors = Array.isArray(checkResult.data && checkResult.data.errors)
                ? checkResult.data.errors
                    .map(e => (typeof e === 'string' ? e : (e && (e.msg || e.message))))
                    .filter(Boolean)
                : [];
            message = errors.length > 0
                ? errors.slice(0, 3).join(' ')
                : (serverMessage || 'The new location details could not be checked. Please try again.');
        }
        await showValidationError(message);
        return;
    }

    let confirmed = false;
    try {
        confirmed = await window.fancyModal.show({
            type: 'new-location',
            title: 'Confirm New Location',
            message: `Please check the new location details below. The location will be saved together with your sample when you click ${finalSaveButtonLabel()} on the last page.`,
            details: locationFormUtils.buildNewLocationConfirmationDetails(payload),
            confirmText: 'Continue',
            cancelText: 'Go back and edit',
            icon: '✨'
        });
    } catch (error) {
        console.error('Error in new location confirmation:', error);
        window.showErrorMessage('An error occurred while confirming the new location details.');
        return;
    }
    if (!confirmed) return;

    // Contract C2: hold the checked details; no location id exists yet.
    locationFormUtils.applyNewLocationConfirmation(formData, payload);
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    // A new check passed, so an earlier lost Save response no longer
    // explains a later duplicate-name error.
    saveOutcomeUncertain = false;
    markFormDirty();

    clearValidationError();
    showSuccessMessage(`Location "${payload.locationName}" details checked. The location will be saved together with your sample when you click ${finalSaveButtonLabel()} on the last page.`);
    proceedToNextPage();
    refreshSummaryIfLoaded();
}

// The page-6 summary is built when page 6 is reached; re-confirming the
// location afterwards (from the summary's Edit button) must refresh it.
function refreshSummaryIfLoaded() {
    if (document.getElementById('summary-container') && typeof window.generateSummary === 'function') {
        window.generateSummary();
    }
}

function showSuccessMessage(message) {
    // Create success message element
    let successElement = document.getElementById('location-success-message');
    if (!successElement) {
        successElement = document.createElement('div');
        successElement.id = 'location-success-message';
        successElement.className = 'success-message';
        successElement.style.cssText = `
            background-color: #dfd;
            color: #363;
            padding: 10px;
            border: 1px solid #cfc;
            border-radius: 4px;
            margin: 10px 0;
            font-weight: bold;
        `;

        // Insert before the continue button
        const continueButton = document.getElementById('page1-continue');
        continueButton.parentNode.insertBefore(successElement, continueButton);
    }

    successElement.textContent = message;

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (successElement.parentNode) {
            successElement.parentNode.removeChild(successElement);
        }
    }, 3000);
}

function clearValidationError() {
    const errorElement = document.getElementById('location-validation-error');
    if (errorElement && errorElement.parentNode) {
        errorElement.parentNode.removeChild(errorElement);
    }
}

// Function to save current page data to session storage
// ---------------------------------------------------------------------------
// Numeric range validation (min / max / whole-number) for type="number" inputs.
// The HTML attributes alone only affect the spinner buttons; a typed "-0.01"
// still submits, so the same rules are enforced here (and again on the server).
// ---------------------------------------------------------------------------
function isNumericInputVisible(input) {
    if (isHiddenLegacyField(input)) return false;
    const mediaSection = input.closest('.media-specific-section');
    if (mediaSection && mediaSection.style.display === 'none') return false;
    return input.offsetParent !== null;
}

// Same rules as validateNumericRanges on the server: plain decimal notation
// only, because "1e3"/"0x10" are read as 1/0 by the storage path.
const PLAIN_DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const PLAIN_INTEGER_PATTERN = /^[+-]?\d+$/;

function getNumericInputProblem(input) {
    const raw = String(input.value ?? '').trim();
    if (raw === '') return null;

    if (!PLAIN_DECIMAL_PATTERN.test(raw)) {
        return 'Please enter a plain number (digits and a decimal point only).';
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return 'Please enter a valid number.';

    const minAttr = input.getAttribute('min');
    if (minAttr !== null && minAttr !== '' && value < Number(minAttr)) {
        return Number(minAttr) === 0
            ? 'Value cannot be negative.'
            : `Value cannot be less than ${minAttr}.`;
    }

    const maxAttr = input.getAttribute('max');
    if (maxAttr !== null && maxAttr !== '' && value > Number(maxAttr)) {
        return `Value cannot be greater than ${maxAttr}.`;
    }

    if (input.getAttribute('step') === '1' && !PLAIN_INTEGER_PATTERN.test(raw)) {
        return 'Please enter a whole number.';
    }

    return null;
}

function setNumericInputError(input, message) {
    // The message element is tracked on the input itself: it lives *after* the
    // input's row (form rows are flex containers, so inserting inside the row
    // would place it beside the input instead of underneath).
    let feedback = input._numericRangeFeedback && input._numericRangeFeedback.isConnected
        ? input._numericRangeFeedback
        : null;

    if (!message) {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
        if (feedback) feedback.remove();
        input._numericRangeFeedback = null;
        return;
    }

    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    if (!feedback) {
        feedback = document.createElement('div');
        feedback.className = 'numeric-range-error';
        feedback.dataset.for = input.name || '';
        feedback.setAttribute('role', 'alert');
        // Detail-percent rows and the partial-date row are CSS grids: the
        // message must go after the whole row, not inside a grid cell.
        const host = input.closest('.form-row, .detail-percent-row, .partial-date-inputs') || input;
        host.insertAdjacentElement('afterend', feedback);
        input._numericRangeFeedback = feedback;
    }
    feedback.textContent = message;
}

// Validates every visible numeric input inside `root`. Returns the list of
// offending inputs (empty when everything is fine) and marks them inline.
function validateNumericInputs(root) {
    const scope = root || document;
    const invalid = [];
    scope.querySelectorAll('input[type="number"]').forEach(input => {
        if (!isNumericInputVisible(input)) {
            setNumericInputError(input, null);
            return;
        }
        const problem = getNumericInputProblem(input);
        setNumericInputError(input, problem);
        if (problem) invalid.push({ input, problem });
    });
    return invalid;
}

function labelForInput(input) {
    const row = input.closest('.form-row');
    const label = row ? row.querySelector('.form-label, label') : null;
    const text = label ? label.textContent.replace(/\s+/g, ' ').replace(/:\s*$/, '').trim() : '';
    return text || input.name || 'A numeric field';
}

// Blocks navigation/saving when `root` contains out-of-range numbers.
function ensureNumericInputsValid(root) {
    const invalid = validateNumericInputs(root);
    if (invalid.length === 0) return true;

    invalid[0].input.focus({ preventScroll: false });
    invalid[0].input.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const summary = invalid
        .slice(0, 5)
        .map(({ input, problem }) => `• ${labelForInput(input)}: ${problem}`)
        .join('\n');
    const more = invalid.length > 5 ? `\n…and ${invalid.length - 5} more.` : '';
    if (typeof window.showTemporaryMessage === 'function') {
        window.showTemporaryMessage(
            `Please correct the highlighted number field${invalid.length > 1 ? 's' : ''} before continuing.`,
            'error'
        );
    } else {
        alert(`Please correct the following before continuing:\n\n${summary}${more}`);
    }
    return false;
}

// Live feedback while typing. A lower bound above zero (e.g. year >= 1000)
// is not enforced on every keystroke — "2" on the way to "2025" is not an
// error — unless the field is already flagged; negatives, upper bounds and
// malformed numbers are flagged immediately. The full check runs on commit.
function isPartialEntryOfPositiveMin(input, problem) {
    if (!problem || input._numericRangeFeedback) return false;
    const minAttr = input.getAttribute('min');
    if (minAttr === null || minAttr === '' || !(Number(minAttr) > 0)) return false;
    return /cannot be less than/.test(problem);
}
document.addEventListener('input', function(event) {
    const target = event.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'number') return;
    const problem = getNumericInputProblem(target);
    if (isPartialEntryOfPositiveMin(target, problem)) return;
    setNumericInputError(target, problem);
});
document.addEventListener('change', function(event) {
    const target = event.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'number') return;
    setNumericInputError(target, getNumericInputProblem(target));
});

function saveCurrentPageData() {
    const currentPageElement = document.getElementById(`form-page${currentPage}`);

    if (!currentPageElement) return;

    // Get all input, select, and textarea elements in the current page
    const formElements = currentPageElement.querySelectorAll('input, select, textarea');

    // Save each element's value
    formElements.forEach(element => {
        if (!element.name || element.name.trim() === '') {
            return;
        }
        if (isHiddenLegacyField(element)) {
            return;
        }
        // Fields inside media sections hidden for the selected media type must
        // not be captured: their empty values would overwrite/mask the visible
        // section's data (sediment vs soil fields share server-side precedence,
        // and both sections contain a select named soil_texture).
        const mediaSection = element.closest('.media-specific-section');
        if (mediaSection && mediaSection.style.display === 'none') {
            return;
        }

        // Special handling for location select. An empty select means "new
        // location" (held in formData.new_location, no id until Save).
        if (element.name === 'location_id') {
            const value = element.value?.trim() || '';
            if (value) {
                formData[element.name] = value;
            } else {
                delete formData[element.name];
            }
            return;
        }

        if (element.type === 'radio' || element.type === 'checkbox') {
            if (element.checked) {
                formData[element.name] = element.value;
            } else if (element.type === 'checkbox') {
                delete formData[element.name];
            }
        } else {
            formData[element.name] = element.value;
        }
    });

    if (typeof syncDetailRowsToFormData === 'function') {
        syncDetailRowsToFormData();
    }
    rememberPublicationForLocation();

    // Save to session storage
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
}

// Saves the inputs of one loaded page, whichever page currentPage points at
// (the user can scroll back to an earlier page and continue from there).
function savePageData(pageNumber) {
    if (!document.getElementById(`form-page${pageNumber}`)) return false;
    const savedPage = currentPage;
    currentPage = pageNumber;
    try {
        saveCurrentPageData();
    } finally {
        currentPage = savedPage;
    }
    return true;
}

// Before a new-entry Save: capture pages 2-6 as they are shown. currentPage
// may point at an earlier page (e.g. page 1 was re-confirmed from page 6),
// and edits made since must not be left out. Page 1 is not read here: its
// location is the one held by Continue (Save checks that page 1 matches).
function captureLoadedFormPages() {
    for (let pageNumber = 2; pageNumber <= 6; pageNumber++) {
        savePageData(pageNumber);
    }
}

// Function to scroll to a specific page
function scrollToPage(pageNumber) {
    const targetPage = document.getElementById(`form-page${pageNumber}`);
    if (Number(pageNumber) === 1) {
        // Going back to page 1 must show the confirmed location again.
        restorePage1FromFormData();
    }
    if (targetPage) {
        targetPage.scrollIntoView({ behavior: 'smooth' });
    }
}

// Function to update progress indicator steps
function updateProgressSteps(currentPage) {
    document.querySelectorAll('.progress-step').forEach(step => {
        const stepNumber = parseInt(step.dataset.step);

        // Remove all statuses
        step.classList.remove('active', 'completed');

        if (stepNumber === currentPage) {
            step.classList.add('active');
        } else if (stepNumber < currentPage) {
            step.classList.add('completed');
        }
    });
}

// Function to fill form fields in a specific page
function fillFormFieldsInPage(pageElement) {
    if (!pageElement) return;

    const formElements = pageElement.querySelectorAll('input, select, textarea');

    formElements.forEach(element => {
        if (element.name && formData[element.name] !== undefined) {
            if (element.type === 'radio' || element.type === 'checkbox') {
                element.checked = (formData[element.name] === element.value ||
                                 (element.type === 'checkbox' && formData[element.name] === true));
            } else {
                element.value = formData[element.name];
            }
        }
    });
}

// Function to clear form fields in a specific page
function clearFormFieldsInPage(pageElement) {
    if (!pageElement) return;

    const formElements = pageElement.querySelectorAll('input, select, textarea');

    formElements.forEach(element => {
        if (element.type === 'radio' || element.type === 'checkbox') {
            element.checked = false;
        } else if (element.tagName === 'SELECT') {
            element.selectedIndex = 0;
        } else {
            element.value = '';
        }
    });
}

// Function to update existing page content based on current form data
function updateExistingPageContent(pageElement, pageNumber) {
    if (!pageElement) return;

    // Fill form fields with current data
    fillFormFieldsInPage(pageElement);

    // Apply page-specific updates based on previous page data
    if (pageNumber === 2) {
        updatePage2Content(); // Sampling Event Information
    } else if (pageNumber === 3) {
        updatePage3Content(); // Media Selection - was page 2
    } else if (pageNumber === 4) {
        updatePage4Content(); // Additional Information - was page 3
    } else if (pageNumber === 5) {
        updatePage5Content(); // Particle Details - was page 4
    } else if (pageNumber === 6) {
        generateSummary(); // Review and Submit - was page 5
    }
}

// Function to update page 2 content based on page 1 data
async function updatePage2Content() {
    // Update any dynamic content based on location selection
    if (formData.location_id) {
        console.log('Updating page 2 based on location:', formData.location_id);
    }
    syncPage2SectionVisibility();
    await initializeReferenceData();
    syncPage2SectionVisibility();
}

// Keep the device-period and publication sections in sync with the stored
// form data when page 2 is restored (re-checking a radio does not fire change).
function syncPage2SectionVisibility() {
    // Device installation period section visibility
    const isDevicePeriod = formData.device_installation_period === 'yes';
    const startLegend = document.getElementById('start-date-legend');
    const deviceSection = document.getElementById('device-period-section');
    if (startLegend) {
        startLegend.innerHTML = isDevicePeriod
            ? 'Device Installation Start Date (<span class="required-marker">*</span>):'
            : 'Plastic Collection Date (<span class="required-marker">*</span>):';
    }
    if (deviceSection) {
        deviceSection.style.display = isDevicePeriod ? 'block' : 'none';
    }
    initializePartialDateControls();

    // Data source section: lock the details to a reused source, show the
    // fields the chosen type needs, and flag a legacy sample without one.
    setPublicationDetailsLocked(Boolean(formData.data_source_id));
    updateDataSourceTypeUi();
    syncDataSourceLegacyNotice();
}

// Function to update page 3 content based on page 2 data
function updatePage3Content() {
    // Update media-specific sections in form-page3
    const mediaType = formData.media_type;
    if (mediaType) {
        updateFormPage3MediaSections(mediaType);
    }
}

// Function to update page 4 content (Additional Information)
function updatePage4Content() {
    // Update media-specific sections in Additional Information page
    const mediaType = formData.media_type;
    if (mediaType) {
        updateFormPage4MediaSections(mediaType);
    }
}

// Function to update page 5 content (Particle Details) based on previous pages data
function updatePage5Content() {
    // Update particle details sections based on sample and media type
    updateFormPage5Sections();

    // Show/hide quantitative data sections
    if (formData.has_quantitative_data === 'yes') {
        const quantitativeContainer = document.getElementById('quantitative-counts-container');
        if (quantitativeContainer) {
            quantitativeContainer.style.display = 'block';
        }
    }

    // Load reference-driven options and polymer controls dynamically.
    initializeReferenceData();
}

// Function to update page 5 sections (Particle Details) based on count values
function updateFormPage5Sections() {
    console.log('updateFormPage5Sections called');

    // Get current form data from session storage
    const currentFormData = JSON.parse(sessionStorage.getItem('microplastics_form_data') || '{}');

    // Update microplastics details section and sample amount
    const microplasticsCount = parseInt(currentFormData['microplastics_count']) || 0;
    const microplasticsDetails = document.getElementById('microplastics-details');
    const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
    if (microplasticsDetails) {
        microplasticsDetails.style.display = microplasticsCount > 0 ? 'block' : 'none';
        console.log('Microplastics details section:', microplasticsCount > 0 ? 'shown' : 'hidden');
    }
    if (microplasticsAmountContainer) {
        microplasticsAmountContainer.style.display = microplasticsCount > 0 ? 'block' : 'none';
    }

    // Update fragments details section and sample amount
    const debrisCount = getCombinedDebrisCount(currentFormData);
    const fragmentsDetails = document.getElementById('fragments-details');
    const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
    if (fragmentsDetails) {
        fragmentsDetails.style.display = debrisCount > 0 ? 'block' : 'none';
        console.log('Fragments details section:', debrisCount > 0 ? 'shown' : 'hidden');
    }
    if (fragmentsAmountContainer) {
        fragmentsAmountContainer.style.display = debrisCount > 0 ? 'block' : 'none';
    }

    // Update unit options based on selected media type
    updateSampleAmountUnits(currentFormData['media_type']);

    // Update quantitative data container visibility
    const hasQuantitativeData = currentFormData['has_quantitative_data'];
    const quantitativeContainer = document.getElementById('quantitative-counts-container');
    if (quantitativeContainer) {
        quantitativeContainer.style.display = hasQuantitativeData === 'yes' ? 'block' : 'none';
        console.log('Quantitative container:', hasQuantitativeData === 'yes' ? 'shown' : 'hidden');
    }

    // Update formpage4 additional info sections based on media type
    updateFormPage4MediaSections();
}

// Function to update page 4 media-specific sections based on selected media type
function updateFormPage4MediaSections() {
    console.log('updateFormPage4MediaSections called');

    // Get current form data from session storage
    const currentFormData = JSON.parse(sessionStorage.getItem('microplastics_form_data') || '{}');
    const selectedMediaType = currentFormData['media_type'];

    if (!selectedMediaType) {
        console.log('No media type selected, hiding all media-specific sections in page 4');
        return;
    }

    console.log('Updating page 4 media sections for media type:', selectedMediaType);

    // Get the form page 4 container
    const formPage4 = document.getElementById('form-page4');
    if (!formPage4) {
        console.log('Form page 4 not found');
        return;
    }

    // Hide all media-specific sections in page 4
    const mediaSpecificSections = formPage4.querySelectorAll('.media-specific-section');
    mediaSpecificSections.forEach(section => {
        section.style.display = 'none';
    });

    // Show the section that matches the selected media type
    const selectedSection = formPage4.querySelector(`.media-specific-section[data-media-type="${selectedMediaType}"]`);
    if (selectedSection) {
        selectedSection.style.display = 'block';
        console.log(`Showing media section for: ${selectedMediaType}`);
    } else {
        console.log(`No media section found for: ${selectedMediaType}`);
    }
}

// Function to load and append the next page to the container
function loadAndAppendNextPage(pageNumber) {
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading next section...</span>';
    document.querySelector('.form-pages-container').appendChild(loadingIndicator);

    // Get the form page container
    const formPagesContainer = document.querySelector('.form-pages-container');

    try {
        // Get template for the next page from the template container
        const templateId = `template-form-page${pageNumber}`;
        const template = document.getElementById(templateId);

        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        // Clone the template content
        const pageContent = template.content.cloneNode(true);

        // Remove loading indicator
        loadingIndicator.remove();

        // Append the new page to the container
        formPagesContainer.appendChild(pageContent);

        // Get the newly added form page
        const newPage = document.getElementById(`form-page${pageNumber}`);

        // Add fade-in class for animation
        if (newPage) {
            newPage.classList.add('fade-in');

            // Scroll to the newly added page
            newPage.scrollIntoView({ behavior: 'smooth' });

            // Fill in form fields from session data if available, but only if this is not initial page load
            if (isPageInitialLoad) {
                // Clear form fields on initial load/refresh to ensure clean state
                clearFormFieldsInPage(newPage);
                // Set flag to false after first dynamic page load
                isPageInitialLoad = false;
            } else {
                // Fill with cached data for subsequent navigations
                fillFormFieldsInPage(newPage);
            }

            // Publication options are reference-backed and the initial fetch can
            // finish before page 2 is cloned into the document.
            if (pageNumber === 2) {
                updatePage2Content();
            }

            // If loading page 4, update additional info sections
            if (pageNumber === 4) {
                updatePage4Content();
            }

            // If loading page 5, update the particle details sections and load polymer options
            if (pageNumber === 5) {
                updatePage5Content();
            }
        }
    } catch (error) {
        console.error('Error loading next form page:', error);
        loadingIndicator.remove();

        // Show error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Failed to load the next section. Please try again.';
        formPagesContainer.appendChild(errorMessage);

        // Add a retry button
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Retry';
        retryButton.className = 'retry-button';
        retryButton.onclick = () => {
            errorMessage.remove();
            loadAndAppendNextPage(pageNumber);
        };
        errorMessage.appendChild(retryButton);
    }
}

function proceedToNextPage() {
    // Save current page data
    saveCurrentPageData();

    const nextPage = 2;

    // Check if the page already exists in the DOM
    const existingPage = document.getElementById(`form-page${nextPage}`);

    if (existingPage) {
        // Page exists, update its content and scroll to it
        updateExistingPageContent(existingPage, nextPage);
        scrollToPage(nextPage);
    } else {
        // Page doesn't exist, load it for the first time
        loadAndAppendNextPage(nextPage);
        loadedPages = Math.max(loadedPages, nextPage);
    }

    // Update current page tracker
    currentPage = nextPage;

    // Update progress steps
    updateProgressSteps(currentPage);

    // Reset continue button
    const continueButton = document.getElementById('page1-continue');
    continueButton.textContent = 'Continue';
    continueButton.disabled = false;
}

// Lets the page-level cache reset (enter_data_by_form.ejs) empty the in-memory
// form state as well as sessionStorage, so a fresh entry cannot inherit values
// left over from a previous one.
window.resetInMemoryFormData = function resetInMemoryFormData() {
    Object.keys(formData).forEach(key => delete formData[key]);
    formHasUnsavedChanges = false;
};

// Everything entered (including a new location held from page 1, which is
// not in the database until Save) lives only in this tab. The view clears it
// on every page load, so ask before a reload, Back/Forward or close loses it.
window.addEventListener('beforeunload', function(event) {
    if (!formHasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
});

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== Form-handler.js DOMContentLoaded ===');

    // Initialize form data from session storage or create new object
    formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
    // Drop pre-redesign publication_* keys a stored session may still carry.
    formData = publicationFormUtils.migrateLegacyDataSourceFields(formData);
    setEditFormLocked(isEditMode);

    // Initialize device installation period radio button default selection
    initializeDeviceInstallationPeriod();

    // Pre-fill form fields from session
    // fillFormFieldsFromSession();

    // Set up navigation buttons
    setupNavigationButtons();

    // Set up form fields change tracking
    setupFormFieldTracking();

    // Setup summary generation for the final page
    setupSummaryGeneration();

    // Legacy package-category detail UI is hidden; FragmentsPurposes is active.

    // Set up percentage validation - call only once
    setupPercentageValidation();

    // Legacy whole-package validation is hidden and must not block submission.

    // Set up location selection interaction - call only once
    setupLocationSelectionInteraction();

    // Set up "Back to New Media" functionality
    setupBackToNewMediaFunction();

    // Load reference data used by dynamic dropdowns and detail-row tables.
    initializeReferenceData();
    initializeEditModeIfNeeded();

    async function initializeEditModeIfNeeded() {
        if (!isEditMode || !editSampleId) {
            return;
        }

        try {
            editDataReady = false;
            setEditFormLocked(true);
            document.body.classList.add('edit-mode');
            showTemporaryMessage('Loading your submitted data for editing...', 'info');

            const response = await fetch(`/api/my-samples/${encodeURIComponent(editSampleId)}/form-data`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            const payload = await response.json();

            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Could not load sample data for editing.');
            }

            formData = {
                ...(payload.data?.formData || {}),
                edit_mode: 'true',
                sample_id: editSampleId
            };
            editOriginalDataSourceId = String(formData.data_source_id || '');
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
            isPageInitialLoad = false;

            addEditModeBanner();

            const firstPage = document.getElementById('form-page1');
            if (firstPage) {
                fillFormFieldsInPage(firstPage);
            }

            for (let pageNumber = 2; pageNumber <= 6; pageNumber += 1) {
                const existingPage = document.getElementById(`form-page${pageNumber}`);
                if (existingPage) {
                    updateExistingPageContent(existingPage, pageNumber);
                } else {
                    loadAndAppendNextPage(pageNumber);
                    loadedPages = Math.max(loadedPages, pageNumber);
                }
            }

            const referencesReady = await initializeReferenceData();
            if (!referencesReady) {
                throw new Error(
                    'The reference lists needed to restore this sample could not be loaded. Refresh the page before saving.'
                );
            }
            fillFormFieldsFromSession();

            for (let pageNumber = 2; pageNumber <= 6; pageNumber += 1) {
                const page = document.getElementById(`form-page${pageNumber}`);
                if (page) {
                    updateExistingPageContent(page, pageNumber);
                }
            }

            currentPage = 6;
            updateProgressSteps(currentPage);

            const saveButton = document.getElementById('save-button');
            if (saveButton) {
                saveButton.textContent = 'Update Data';
            }

            // Use the fully restored, reference-aware UI as the edit baseline.
            // Capturing the raw GET payload earlier can make inherited method
            // selectors look like user edits and rewrite otherwise untouched rows.
            syncDetailRowsToFormData();
            captureEditPercentageSnapshots(formData);

            // Keep update actions blocked until the existing record and all
            // reference-driven controls have finished restoring.
            editDataReady = true;
            setEditFormLocked(false);

            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
        } catch (error) {
            editDataReady = false;
            setEditFormLocked(true);
            console.error('Error initializing edit mode:', error);
            showTemporaryMessage(error.message || 'Failed to load sample data for editing.', 'error');
        }
    }

    function addEditModeBanner() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent || document.getElementById('edit-mode-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'edit-mode-banner';
        banner.className = 'edit-mode-banner';
        banner.innerHTML = `
            <strong>Edit My Data</strong>
            <span>You are editing a submitted sample. Saving will update this record instead of creating a new one.</span>
        `;
        mainContent.insertBefore(banner, mainContent.firstChild);
    }

    // Function to set up "Back to New Media" functionality
    function setupBackToNewMediaFunction() {
        console.log('Setting up Back to New Media functionality');

        // Create and add "Back to New Media" button to appropriate pages
        addBackToNewMediaButtons();

        // Function to add "Back to New Media" buttons
        function addBackToNewMediaButtons() {
            // Add button to pages 4, 5, and 6 (after media selection)
            const targetPages = [4, 5, 6];

            targetPages.forEach(pageNum => {
                // Use a timer to ensure pages are loaded
                setTimeout(() => {
                    addBackToNewMediaButtonToPage(pageNum);
                }, 1000);

                // Also add when pages are dynamically loaded
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        addBackToNewMediaButtonToPage(pageNum);
                    }, 500);
                });
            });
        }

        // Function to add button to a specific page
        function addBackToNewMediaButtonToPage(pageNumber) {
            const page = document.getElementById(`form-page${pageNumber}`);
            if (!page) return;

            // Check if button already exists
            const existingButton = page.querySelector('.back-to-new-media-btn');
            if (existingButton) return;

            // Find the navigation section or create one
            let navigationSection = page.querySelector('.form-navigation');
            if (!navigationSection) {
                navigationSection = document.createElement('div');
                navigationSection.className = 'form-navigation';
                page.appendChild(navigationSection);
            }

            // Create the "Back to New Media" button
            const backButton = document.createElement('button');
            backButton.type = 'button';
            backButton.className = 'btn btn-outline-secondary back-to-new-media-btn';
            backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to New Media';
            backButton.style.marginRight = '10px';

            // Add click event listener
            backButton.addEventListener('click', function() {
                handleBackToNewMedia();
            });

            // Insert button at the beginning of navigation section
            navigationSection.insertBefore(backButton, navigationSection.firstChild);
        }

        // Function to handle "Back to New Media" action. Like option B after a
        // save, it keeps the location (page 1) and the sampling event and data
        // source (page 2) and only clears the media-dependent pages 3-6.
        function handleBackToNewMedia() {
            // Show confirmation dialog
            const confirmed = confirm(
                'Are you sure you want to go back to media selection?\n\n' +
                'This will:\n' +
                '• Keep the location (Page 1) and the sampling event and data source (Page 2)\n' +
                '• Clear the media type and everything entered on Pages 3-6\n' +
                '• Return to the media type selection page\n\n' +
                'Click OK to continue or Cancel to stay on this page.'
            );

            if (!confirmed) {
                return;
            }

            console.log('Back to New Media: clearing media pages 3-6 and returning to media selection');

            // 1. Clear media-dependent data only (pages 3-6)
            clearMediaPagesData();

            // 2. Reset all validation states
            resetAllValidationStates();

            // 3. Navigate to page 3 (media selection)
            navigateToPage(3);

            // 4. Scroll to top of page
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            // 5. Show success message
            showTemporaryMessage('Returned to media selection. Location, sampling event and data source were kept; media and sample details were cleared.', 'info');

            // 6. Clear any selected media types
            setTimeout(() => {
                clearMediaTypeSelections();
            }, 500);
        }

        // Keeps pages 1-2 (form state and inputs) and clears pages 3-6.
        function clearMediaPagesData() {
            // Capture the latest page-2 inputs first so nothing typed there is
            // lost (page 1's location is already held from its Continue), then
            // drop every field that lives on pages 3-6.
            savePageData(2);

            const mediaFieldNames = new Set();
            [3, 4, 5, 6].forEach(pageNumber => {
                const page = document.getElementById(`form-page${pageNumber}`);
                if (!page) return;
                page.querySelectorAll('[name]').forEach(element => {
                    if (element.name) mediaFieldNames.add(element.name);
                });
            });
            [
                'media_type', 'water_type', 'water_type_other_description',
                'sediment_type', 'sediment_type_other_description', 'mixed_media_description'
            ].forEach(name => mediaFieldNames.add(name));
            mediaFieldNames.forEach(name => {
                if (!DATA_SOURCE_FORM_FIELDS.includes(name)) delete formData[name];
            });
            DETAIL_TABLES.forEach(tableId => { delete formData[tableId]; });
            deletePolymerFieldsFromFormData();
            Object.keys(formData)
                .filter(key => /^packaging_/.test(key))
                .forEach(key => { delete formData[key]; });

            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Clear the inputs of pages 3-6 only
            clearMediaSpecificFields();

            console.log('Media pages 3-6 cleared; pages 1-2 kept');
        }

        // Function to reset all validation states
        function resetAllValidationStates() {
            // Reset percentage validation displays
            const percentageContainers = document.querySelectorAll('.percentage-validation-container');
            percentageContainers.forEach(container => {
                container.remove();
            });

            // Reset submit button states
            const submitButtons = document.querySelectorAll('.btn-continue, #save-button, .btn-submit');
            submitButtons.forEach(button => {
                button.disabled = false;
                delete button.dataset.percentLock;
                button.title = '';
                button.style.opacity = '';
                button.style.cursor = '';
            });

            console.log('All validation states reset');
        }

        // Function to clear media type selections
        function clearMediaTypeSelections() {
            // Clear radio button selections
            const mediaRadios = document.querySelectorAll('input[name="media_type"]');
            mediaRadios.forEach(radio => {
                radio.checked = false;
            });

            // Clear any visual selection indicators
            const mediaOptions = document.querySelectorAll('.media-option-group');
            mediaOptions.forEach(option => {
                option.classList.remove('selected', 'active');
            });

            // Hide any media-specific sub-sections
            const mediaSuboptions = document.querySelectorAll('.media-suboptions');
            mediaSuboptions.forEach(suboption => {
                suboption.style.display = 'none';
            });

            console.log('Media type selections cleared');
        }

        // Make the function globally available for other scripts
        window.backToNewMedia = handleBackToNewMedia;
    }

    // Function to set up location selection interaction logic
    function setupLocationSelectionInteraction() {
        console.log('Setting up location selection interaction');

        // Get elements
        const locationSelect = document.getElementById('location-select');
        const newLocationForm = document.querySelector('.location-form');
        const locationNameInput = document.getElementById('location-name');
        const locationShortCodeInput = document.getElementById('location-shortcode');
        const locationDescriptionInput = document.getElementById('location-description');
        const latitudeInput = document.getElementById('latitude');
        const longitudeInput = document.getElementById('longitude');
        const cityInput = document.querySelector('input[name="city"]');
        const stateInput = document.querySelector('input[name="state"]');
        const zipInput = document.querySelector('input[name="zip_code"]');
        const existingHintClass = 'existing-location-hint';

        console.log('Location elements found:', {
            locationSelect: !!locationSelect,
            newLocationForm: !!newLocationForm
        });

        if (!locationSelect || !newLocationForm) {
            console.log('Location select elements not found');
            return;
        }

        function setInputReadonly(input, isReadonly) {
            if (!input) return;
            input.readOnly = isReadonly;
            input.style.backgroundColor = isReadonly ? '#f5f5f5' : '';
            input.style.cursor = isReadonly ? 'not-allowed' : '';
        }

        function addExistingLocationHint() {
            if (!newLocationForm || newLocationForm.querySelector(`.${existingHintClass}`)) {
                return;
            }

            const hint = document.createElement('div');
            hint.className = existingHintClass;
            hint.style.cssText = 'background-color: #e8f4fd; border: 1px solid #b6dcfe; color: #0c5460; padding: 10px; border-radius: 6px; margin: 10px 0;';
            hint.innerHTML = `
                <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                Selected existing location. Name and short code are locked. You may edit description/coordinates for this sampling event.
            `;
            newLocationForm.insertBefore(hint, newLocationForm.firstChild);
        }

        function removeExistingLocationHint() {
            if (!newLocationForm) return;
            const hint = newLocationForm.querySelector(`.${existingHintClass}`);
            if (hint) {
                hint.remove();
            }
        }

        function populateFieldsFromSelectedLocation() {
            const selectedOption = locationSelect.options[locationSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) return;

            const selectedName = (selectedOption.getAttribute('data-name') || selectedOption.textContent || '').trim();
            const selectedShortCode = (selectedOption.getAttribute('data-user-loc-id') || '').trim();
            const selectedDescription = (selectedOption.getAttribute('data-description') || '').trim();
            const selectedLatitude = (selectedOption.getAttribute('data-latitude') || '').trim();
            const selectedLongitude = (selectedOption.getAttribute('data-longitude') || '').trim();
            const selectedCity = (selectedOption.getAttribute('data-city') || '').trim();
            const selectedState = (selectedOption.getAttribute('data-state') || '').trim();
            const selectedZip = (selectedOption.getAttribute('data-zipcode') || '').trim();

            // Re-selecting the location confirmed with Continue shows the
            // event-level description/coordinates confirmed for it again.
            const confirmedOverrides = getConfirmedOverridesForLocation(selectedOption.value);
            const shownDescription = confirmedOverrides.description || selectedDescription;
            const shownLatitude = confirmedOverrides.latitude || selectedLatitude;
            const shownLongitude = confirmedOverrides.longitude || selectedLongitude;

            if (locationNameInput) locationNameInput.value = selectedName;
            if (locationShortCodeInput) locationShortCodeInput.value = selectedShortCode;
            if (locationDescriptionInput) locationDescriptionInput.value = shownDescription;
            if (latitudeInput) latitudeInput.value = shownLatitude;
            if (longitudeInput) longitudeInput.value = shownLongitude;
            if (cityInput) cityInput.value = selectedCity;
            if (stateInput) stateInput.value = selectedState;
            if (zipInput) zipInput.value = selectedZip;

            syncLocationMapFromInputs({ zoom: 13 });

            formData['location_name'] = selectedName;
            formData['location_shortcode'] = selectedShortCode;
            formData['location_description'] = shownDescription;
            formData['latitude'] = shownLatitude;
            formData['longitude'] = shownLongitude;
            formData['existing_location_description'] = selectedDescription;
            formData['existing_location_latitude'] = selectedLatitude;
            formData['existing_location_longitude'] = selectedLongitude;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }

        function setExistingLocationMode() {
            setInputReadonly(locationNameInput, true);
            setInputReadonly(locationShortCodeInput, true);
            setInputReadonly(locationDescriptionInput, false);
            setInputReadonly(latitudeInput, false);
            setInputReadonly(longitudeInput, false);
            addExistingLocationHint();
        }

        function setNewLocationMode() {
            setInputReadonly(locationNameInput, false);
            setInputReadonly(locationShortCodeInput, false);
            setInputReadonly(locationDescriptionInput, false);
            setInputReadonly(latitudeInput, false);
            setInputReadonly(longitudeInput, false);
            removeExistingLocationHint();

            delete formData['existing_location_description'];
            delete formData['existing_location_latitude'];
            delete formData['existing_location_longitude'];
            if (isEditMode) {
                delete formData['event_location_description'];
                delete formData['event_latitude'];
                delete formData['event_longitude'];
            }
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }

        // Values typed for a new location (Option 2) are kept here while an
        // existing location is selected, so clearing the selection again
        // brings them back instead of losing them or leaving the existing
        // location's details in the new-location inputs.
        let newLocationDraft = null;
        let lastLocationMode = null;

        function syncPage1ValuesToFormData() {
            const values = readPage1LocationValues();
            Object.entries(values).forEach(([name, value]) => {
                formData[name] = value;
            });
        }

        function handleLocationSelectionChange(fromUserChange = false) {
            const selectedLocationId = locationSelect.value;

            if (selectedLocationId && selectedLocationId !== '') {
                console.log('Previous location selected:', selectedLocationId);
                if (fromUserChange && lastLocationMode !== 'existing') {
                    const typed = readPage1LocationValues();
                    newLocationDraft = locationFormUtils.arePage1ValuesBlank(typed) ? null : typed;
                }
                clearValidationError();
                populateFieldsFromSelectedLocation();
                setExistingLocationMode();
                lastLocationMode = 'existing';
            } else {
                console.log('No previous location selected');
                if (fromUserChange && lastLocationMode === 'existing') {
                    // Drop the existing location's details from the inputs and
                    // bring back what was typed for a new location (if any).
                    writePage1LocationValues(newLocationDraft || {});
                    newLocationDraft = null;
                    syncPage1ValuesToFormData();
                    resetOrSyncLocationMap();
                }
                setNewLocationMode();
                lastLocationMode = 'new';
            }
        }

        function resetOrSyncLocationMap() {
            const values = readPage1LocationValues();
            if (values.latitude && values.longitude) {
                syncLocationMapFromInputs({ zoom: 13 });
            } else if (typeof window.resetDataEntryMap === 'function') {
                window.resetDataEntryMap();
            }
        }

        // Set up event listener
        locationSelect.addEventListener('change', function() {
            // In new entries the event-level overrides (event_*) stay with
            // the location confirmed by Continue (formData.location_id): they
            // are replaced only by the next Continue, and Save refuses a page
            // 1 that no longer shows what was confirmed. Edit My Data keeps
            // dropping them with the previous selection.
            if (isEditMode) {
                delete formData['event_location_description'];
                delete formData['event_latitude'];
                delete formData['event_longitude'];
            }

            handleLocationSelectionChange(true);

            // Pages 2-6 are NOT cleared here: going back to page 1 to change
            // the location must not erase the dates, data source, media and
            // sample details already entered. The new location choice only
            // takes effect after Continue on page 1 confirms it.
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        });

        // Hooks for code outside this closure (restore after going back,
        // post-save reuse of a just-created location, "Start New" resets).
        page1LocationUi = {
            markExistingMode() {
                setExistingLocationMode();
                lastLocationMode = 'existing';
            },
            markNewMode() {
                setInputReadonly(locationNameInput, false);
                setInputReadonly(locationShortCodeInput, false);
                setInputReadonly(locationDescriptionInput, false);
                setInputReadonly(latitudeInput, false);
                setInputReadonly(longitudeInput, false);
                removeExistingLocationHint();
                lastLocationMode = 'new';
            },
            // A location created by the last Save becomes a normal previous
            // location: add it to the dropdown (GET /api/locations would not
            // keep the current selection) and select it without firing
            // 'change'.
            selectSavedLocation(locationId, locationPayload) {
                const id = String(locationId);
                let option = Array.from(locationSelect.options).find(item => String(item.value) === id);
                if (!option && locationPayload) {
                    const spec = locationFormUtils.buildLocationOption(id, locationPayload);
                    option = document.createElement('option');
                    option.value = spec.value;
                    option.textContent = spec.text;
                    Object.entries(spec.attributes).forEach(([name, value]) => option.setAttribute(name, value));
                    // Drop a "No locations found" placeholder if present.
                    Array.from(locationSelect.options)
                        .filter(item => !item.value && item.index > 0)
                        .forEach(item => item.remove());
                    locationSelect.appendChild(option);
                }
                if (!option) return false;
                locationSelect.value = id;
                newLocationDraft = null;
                setExistingLocationMode();
                lastLocationMode = 'existing';
                return true;
            },
            // Blank page 1 for a brand-new case (options A and D).
            resetForNewCase() {
                newLocationDraft = null;
                this.markNewMode();
                if (typeof window.resetDataEntryMap === 'function') {
                    window.resetDataEntryMap();
                }
            }
        };

        // Initialize on page load
        setTimeout(() => {
            handleLocationSelectionChange();
        }, 500);

        // Also listen to programmatic changes (e.g., when form is pre-filled)
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
                    handleLocationSelectionChange();
                }
            });
        });

        observer.observe(locationSelect, {
            attributes: true,
            attributeFilter: ['value']
        });
    }

    // Live "Current Total" banner for the two polymer-percentage groups on
    // page 5. This is the single on-screen total for polymer types (the
    // row-based sections use their own header total). The banner is inserted
    // directly above the dynamic polymer input list of each section.
    function setupPercentageValidation() {
        const polymerGroups = {
            mp_polymer: {
                prefix: 'mp_polymer_',
                scope: '#microplastics-details',
                anchor: 'mp-polymer-dynamic-container'
            },
            fragment_polymer: {
                prefix: 'fragment_polymer_',
                scope: '#fragments-details',
                anchor: 'fragment-polymer-dynamic-container'
            }
        };
        const TOLERANCE = 0.1; // Match backend and formpage5.ejs validation

        function findGroupForField(fieldName) {
            if (!fieldName || fieldName.endsWith('_specify')) return null;
            return Object.keys(polymerGroups).find(groupKey =>
                fieldName.startsWith(polymerGroups[groupKey].prefix)
            ) || null;
        }

        function getGroupInputs(groupKey) {
            const config = polymerGroups[groupKey];
            const scopeRoot = document.querySelector(config.scope) || document;
            return Array.from(scopeRoot.querySelectorAll(`input[name^="${config.prefix}"]`))
                .filter(input => !input.name.endsWith('_specify'));
        }

        function ensureValidationContainer(groupKey) {
            const existing = document.getElementById(`${groupKey}-validation`);
            if (existing) return existing;

            const anchor = document.getElementById(polymerGroups[groupKey].anchor);
            if (!anchor) return null;

            const validationContainer = document.createElement('div');
            validationContainer.className = 'percentage-validation-container';
            validationContainer.id = `${groupKey}-validation`;
            validationContainer.style.cssText = 'margin: 10px 0; padding: 10px; border-radius: 4px; display: none;';
            validationContainer.innerHTML = `
                <div class="percentage-summary" style="display: flex; align-items: center; gap: 10px;">
                    <span class="percentage-total" id="${groupKey}-total" style="font-weight: bold;"></span>
                    <span class="percentage-status" id="${groupKey}-status"></span>
                </div>
            `;
            anchor.insertAdjacentElement('beforebegin', validationContainer);
            return validationContainer;
        }

        function validatePercentageGroup(groupKey) {
            const validationContainer = ensureValidationContainer(groupKey);
            if (!validationContainer) return;
            const totalElement = document.getElementById(`${groupKey}-total`);
            const statusElement = document.getElementById(`${groupKey}-status`);
            if (!totalElement || !statusElement) return;

            let total = 0;
            let hasAnyValue = false;
            getGroupInputs(groupKey).forEach(input => {
                if (input.value !== '') {
                    total += parseFloat(input.value) || 0;
                    hasAnyValue = true;
                }
            });

            // Only show the banner once the user has entered something
            if (!hasAnyValue) {
                validationContainer.style.display = 'none';
                statusElement.textContent = '';
                statusElement.className = 'percentage-status';
                updateSubmitButtonState();
                return;
            }

            validationContainer.style.display = 'block';
            totalElement.textContent = `Current Total: ${total.toFixed(1)}%`;

            // In edit mode an UNCHANGED group is neither re-validated nor
            // re-submitted (see shouldValidatePercentageGroup), so a legacy
            // total that is off 100% is shown as information, not as a blocker.
            const exemptFromValidation = typeof window.shouldValidatePercentageGroup === 'function' &&
                !window.shouldValidatePercentageGroup(groupKey);

            if (Math.abs(total - 100) <= TOLERANCE) {
                validationContainer.style.backgroundColor = '#d4edda';
                validationContainer.style.border = '1px solid #c3e6cb';
                totalElement.style.color = '#155724';
                statusElement.innerHTML = '<i class="fas fa-check-circle"></i> ✓ Total is correct';
                statusElement.style.color = '#155724';
                statusElement.className = 'percentage-status valid';
            } else if (exemptFromValidation) {
                validationContainer.style.backgroundColor = '#e9ecef';
                validationContainer.style.border = '1px solid #ced4da';
                totalElement.style.color = '#495057';
                statusElement.innerHTML = '<i class="fas fa-info-circle"></i> Stored total (unchanged values are kept as-is; edit any value to re-validate)';
                statusElement.style.color = '#495057';
                statusElement.className = 'percentage-status legacy';
            } else if (total > 100) {
                validationContainer.style.backgroundColor = '#f8d7da';
                validationContainer.style.border = '1px solid #f5c6cb';
                totalElement.style.color = '#721c24';
                statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> ✗ Error: Total exceeds 100%! Please adjust your values.';
                statusElement.style.color = '#721c24';
                statusElement.className = 'percentage-status invalid';
            } else {
                validationContainer.style.backgroundColor = '#fff3cd';
                validationContainer.style.border = '1px solid #ffeaa7';
                totalElement.style.color = '#856404';
                statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ⚠ Warning: Total must equal 100% (or leave all blank)';
                statusElement.style.color = '#856404';
                statusElement.className = 'percentage-status invalid';
            }
            statusElement.style.fontWeight = 'bold';
            updateSubmitButtonState();
        }

        function validateAllPolymerGroups() {
            Object.keys(polymerGroups).forEach(validatePercentageGroup);
        }

        // Function to update submit button state based on all percentage validations
        function updateSubmitButtonState() {
            const invalidGroups = document.querySelectorAll('.percentage-status.invalid');
            const submitButtons = document.querySelectorAll('#form-page5 .btn-continue[data-next="6"], #save-button, .btn-submit');

            submitButtons.forEach(button => {
                // A button that is disabled for another reason (e.g. a save in
                // flight, which sets disabled=true itself) must never be
                // re-enabled here — only undo our own lock.
                if (button.dataset.submitting === 'true') return;
                if (invalidGroups.length > 0) {
                    button.disabled = true;
                    button.dataset.percentLock = 'true';
                    button.title = 'Polymer percentages must total 100% (or all be left blank)';
                } else if (button.dataset.percentLock === 'true') {
                    button.disabled = false;
                    delete button.dataset.percentLock;
                    button.title = '';
                }
            });
        }

        // Real-time validation as the user types
        document.addEventListener('input', function(event) {
            const groupKey = findGroupForField(event.target && event.target.name);
            if (groupKey) validatePercentageGroup(groupKey);
        });

        // Page 5 and its polymer inputs are stamped/rendered dynamically (the
        // polymer list arrives after /api/references). Re-evaluate whenever
        // the page container changes so restored/edit values show a total too.
        const formPagesContainer = document.querySelector('.form-pages-container');
        if (formPagesContainer) {
            let scheduled = false;
            const observer = new MutationObserver(function(mutations) {
                // Ignore the banner's own updates, otherwise re-rendering the
                // banner would re-trigger this observer indefinitely.
                const relevant = mutations.some(mutation =>
                    !(mutation.target.closest && mutation.target.closest('.percentage-validation-container'))
                );
                if (!relevant || scheduled) return;
                scheduled = true;
                setTimeout(function() {
                    scheduled = false;
                    if (document.getElementById('form-page5')) validateAllPolymerGroups();
                }, 50);
            });
            observer.observe(formPagesContainer, { childList: true, subtree: true });
        }

        if (document.getElementById('form-page5')) {
            validateAllPolymerGroups();
        }

        window.refreshPolymerPercentageTotals = validateAllPolymerGroups;
    }

    // Set up event delegation for media options in form-page3 (both old and new layouts)
    document.addEventListener('click', function(event) {
        // Check if the clicked element is a media option or inside one (old layout)
        const mediaOption = event.target.closest('.media-option');
        // Check if the clicked element is a media option header (new vertical layout)
        const mediaOptionHeader = event.target.closest('.media-option-header');

        if (mediaOption) {
            // Handle old horizontal layout
            const radioInput = mediaOption.querySelector('input[type="radio"]');
            if (radioInput) {
                // Select the radio button
                radioInput.checked = true;

                // Remove selected class from all media options
                document.querySelectorAll('.media-option').forEach(option => {
                    option.classList.remove('selected');
                });

                // Add selected class to the clicked option
                mediaOption.classList.add('selected');

                // Update formData
                const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
                formData[radioInput.name] = radioInput.value;
                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                // If form-page3 is already loaded, update visible sections
                updateFormPage3MediaSections(radioInput.value);

                // Also update formpage4 media sections if page 4 is loaded and additional_info is yes
                const formPage4 = document.getElementById('form-page4');
                if (formPage4) {
                    const additionalInfoYes = document.querySelector('input[name="additional_info"][value="yes"]:checked');
                    if (additionalInfoYes) {
                        updateFormPage4MediaSections();
                    }
                }
            }
        } else if (mediaOptionHeader) {
            // Handle new vertical layout
            const radioInput = mediaOptionHeader.querySelector('input[type="radio"]');
            if (radioInput) {
                // Select the radio button
                radioInput.checked = true;

                // Update formData
                const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
                formData[radioInput.name] = radioInput.value;
                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                // Show/hide suboptions and update sections
                updateFormPage3MediaSections(radioInput.value);

                // Also update formpage4 media sections if page 4 is loaded and additional_info is yes
                const formPage4 = document.getElementById('form-page4');
                if (formPage4) {
                    const additionalInfoYes = document.querySelector('input[name="additional_info"][value="yes"]:checked');
                    if (additionalInfoYes) {
                        updateFormPage4MediaSections();
                    }
                }
            }
        }
    });

    // Add event delegation for media type changes - clears media-specific data
    document.addEventListener('change', function(event) {
        // Handle media type radio button changes
        if (event.target.name === 'media_type') {
            console.log('Media type changed from', formData.media_type, 'to', event.target.value);

            // Clear all media-specific data when switching media types
            const mediaSpecificFields = [
                // Sample details
                'total_sample_amount', 'sample_unit',
                'microplastics_sample_amount', 'microplastics_sample_unit',
                'fragments_sample_amount', 'fragments_sample_unit',
                'packaging_sample_amount', 'packaging_sample_unit',

                // Media subtype fields
                'water_type', 'water_type_other_description',
                'sediment_type', 'sediment_type_other_description',
                'mixed_media_description',

                // Every media-specific field on Additional Information
                ...PAGE4_ADDITIONAL_FIELDS
            ];

            // Clear these fields from formData and sessionStorage
            mediaSpecificFields.forEach(field => {
                delete formData[field];
            });

            // Clear the visual form fields
            mediaSpecificFields.forEach(fieldName => {
                const fields = document.querySelectorAll(`[name="${fieldName}"]`);
                fields.forEach(field => {
                    if (field.type === 'radio' || field.type === 'checkbox') {
                        field.checked = false;
                    } else {
                        field.value = '';
                    }
                });
            });

            // Reset all unit selects to default
            const unitSelects = document.querySelectorAll('.unit-select');
            unitSelects.forEach(select => {
                select.selectedIndex = 0; // Reset to "-- Select Unit --"
            });

            // Update the new media type in formData
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Update unit options for new media type
            updateSampleAmountUnits(event.target.value);

            console.log('Cleared media-specific data, updated to:', event.target.value);
        }
    });

    // Add event delegation for suboption selections
    document.addEventListener('change', function(event) {
        // Handle suboption radio buttons
        if (event.target.name === 'water_type' ||
            event.target.name === 'sediment_type') {

            // Update formData with suboption selection
            const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Handle "Other" option descriptions
            if (event.target.name === 'water_type') {
                const otherDescription = document.getElementById('water-other-description');
                if (otherDescription) {
                    otherDescription.style.display = event.target.value === 'other' ? 'block' : 'none';
                }
            } else if (event.target.name === 'sediment_type') {
                const otherDescription = document.getElementById('sediment-other-description');
                if (otherDescription) {
                    otherDescription.style.display = event.target.value === 'other' ? 'block' : 'none';
                }
            }
        }

        // Handle mixed media description
        if (event.target.name === 'mixed_media_description') {
            const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }

        // Handle other description text areas
        if (event.target.name === 'water_type_other_description' ||
            event.target.name === 'sediment_type_other_description') {
            const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
    });

    // Add event delegation for additional info toggle in form-page4
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('toggle-additional-info')) {
            const showAdditionalInfo = event.target.value === 'yes';
            const additionalInfoSections = document.getElementById('additional-info-sections');

            if (additionalInfoSections) {
                additionalInfoSections.style.display = showAdditionalInfo ? 'block' : 'none';

                // If showing additional info, update media sections for both page 3 and page 4
                if (showAdditionalInfo) {
                    const selectedMediaType = document.querySelector('input[name="media_type"]:checked');
                    if (selectedMediaType) {
                        // Update page 3 sections (if page 3 is loaded)
                        const formPage3 = document.getElementById('form-page3');
                        if (formPage3) {
                            updateFormPage3MediaSections(selectedMediaType.value);
                        }

                        // Update page 4 media sections (if page 4 is loaded)
                        const formPage4 = document.getElementById('form-page4');
                        if (formPage4) {
                            updateFormPage4MediaSections();
                        }
                    }
                } else {
                    // Hide all media sections in page 4 when "No" is selected
                    const formPage4 = document.getElementById('form-page4');
                    if (formPage4) {
                        const mediaSpecificSections = formPage4.querySelectorAll('.media-specific-section');
                        mediaSpecificSections.forEach(section => {
                            section.style.display = 'none';
                        });
                    }

                    // Clear all additional info field data when selecting "No"
                    const additionalInfoFields = [
                        'air_temp', 'current_conditions', 'rainfall',
                        ...PAGE4_ADDITIONAL_FIELDS
                    ];

                    // Clear from formData and sessionStorage
                    additionalInfoFields.forEach(field => {
                        delete formData[field];
                    });
                    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                    // Clear the visual form fields in additional info sections
                    if (additionalInfoSections) {
                        const fields = additionalInfoSections.querySelectorAll('input, select, textarea');
                        fields.forEach(field => {
                            if (field.type === 'radio' || field.type === 'checkbox') {
                                field.checked = false;
                            } else {
                                field.value = '';
                            }
                        });
                    }
                }
            }
        }
    });

    // Add event delegation for quantitative data toggle in form-page4
    document.addEventListener('change', function(event) {
        if (event.target.name === 'has_quantitative_data') {
            const showQuantitativeData = event.target.value === 'yes';
            const quantitativeCountsContainer = document.getElementById('quantitative-counts-container');

            if (quantitativeCountsContainer) {
                quantitativeCountsContainer.style.display = showQuantitativeData ? 'block' : 'none';

                // Hide all detail sections when "No" is selected
                if (!showQuantitativeData) {
                    const microplasticsDetails = document.getElementById('microplastics-details');
                    const fragmentsDetails = document.getElementById('fragments-details');

                    if (microplasticsDetails) microplasticsDetails.style.display = 'none';
                    if (fragmentsDetails) fragmentsDetails.style.display = 'none';

                    // Clear all quantitative data fields when selecting "No"
                    const quantitativeDataFields = [
                        'replicates_count', 'microplastics_count', 'fragments_count',
                        'total_sample_amount', 'sample_unit',
                        'microplastics_sample_amount', 'microplastics_sample_unit',
                        'fragments_sample_amount', 'fragments_sample_unit',
                        'packaging_sample_amount', 'packaging_sample_unit',
                        'micro_mass_mp_total', 'micro_method_polymer_num', 'micro_method_polymer_other', 'micro_method_percent_estimate',
                        'fragments_mass_debris_total', 'fragments_method_polymer_num', 'fragments_method_polymer_other', 'fragments_method_percent_estimate',
                        ...DETAIL_TABLES,
                        // Microplastics size distribution
                        'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um', 'mp_size_100um_1mm', 'mp_size_1_5mm',
                        // Microplastics color distribution
                        'mp_color_clear', 'mp_color_opaque_light', 'mp_color_opaque_dark', 'mp_color_mixed',
                        // Microplastics form distribution
                        'mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment', 'mp_form_film', 'mp_form_foam',
                        // Microplastics polymer types
                        'mp_polymer_pet', 'mp_polymer_hdpe', 'mp_polymer_pvc', 'mp_polymer_ldpe', 'mp_polymer_pp', 'mp_polymer_ps',
                        'mp_polymer_pc', 'mp_polymer_pan', 'mp_polymer_pmma', 'mp_polymer_pa', 'mp_polymer_abs',
                        'mp_polymer_polyester_fiber', 'mp_polymer_acrylic_fiber', 'mp_polymer_pe_fiber', 'mp_polymer_pp_fiber',
                        'mp_polymer_tire_rubber', 'mp_polymer_natural_rubber', 'mp_polymer_synthetic_rubber',
                        // Fragments color distribution
                        'fragment_color_clear', 'fragment_color_opaque_light', 'fragment_color_opaque_dark', 'fragment_color_mixed',
                        // Legacy fragment color keys
                        'frag_color_clear', 'frag_color_opaque_light', 'frag_color_opaque_dark', 'frag_color_mixed',
                        // Fragments form distribution
                        'fragment_form_fiber', 'fragment_form_pellet', 'fragment_form_film', 'fragment_form_foam', 'fragment_form_hardplastic', 'fragment_form_other',
                        // Legacy fragment form keys
                        'frag_form_fiber', 'frag_form_pellet', 'frag_form_fragment', 'frag_form_film', 'frag_form_foam',
                        // Fragments polymer types
                        'fragment_polymer_pet', 'fragment_polymer_hdpe', 'fragment_polymer_pvc', 'fragment_polymer_ldpe', 'fragment_polymer_pp', 'fragment_polymer_ps',
                        'fragment_polymer_pc', 'fragment_polymer_pan', 'fragment_polymer_pmma', 'fragment_polymer_pa', 'fragment_polymer_abs',
                        'fragment_polymer_polyester_fiber', 'fragment_polymer_acrylic_fiber', 'fragment_polymer_pe_fiber', 'fragment_polymer_pp_fiber',
                        'fragment_polymer_tire_rubber', 'fragment_polymer_natural_rubber', 'fragment_polymer_synthetic_rubber',
                        // Legacy fragment polymer keys
                        'frag_polymer_pet', 'frag_polymer_hdpe', 'frag_polymer_pvc', 'frag_polymer_ldpe', 'frag_polymer_pp', 'frag_polymer_ps',
                        'frag_polymer_pc', 'frag_polymer_pan', 'frag_polymer_pmma', 'frag_polymer_pa', 'frag_polymer_abs',
                        'frag_polymer_polyester_fiber', 'frag_polymer_acrylic_fiber', 'frag_polymer_pe_fiber', 'frag_polymer_pp_fiber',
                        'frag_polymer_tire_rubber', 'frag_polymer_natural_rubber', 'frag_polymer_synthetic_rubber',
                        // Packaging items
                        'packaging_item_1', 'packaging_item_2', 'packaging_item_3', 'packaging_item_4', 'packaging_item_5',
                        'packaging_item_6', 'packaging_item_7', 'packaging_item_8', 'packaging_item_9', 'packaging_item_10'
                    ];

                    // Clear from formData and sessionStorage (plus every
                    // reference-driven polymer field, including the "Other" description)
                    quantitativeDataFields.forEach(field => {
                        delete formData[field];
                    });
                    deletePolymerFieldsFromFormData();
                    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                    // Clear the visual form fields in quantitative data sections
                    if (quantitativeCountsContainer) {
                        const fields = quantitativeCountsContainer.querySelectorAll('input, select, textarea');
                        fields.forEach(field => {
                            if (field.type === 'radio' || field.type === 'checkbox') {
                                field.checked = false;
                            } else {
                                field.value = '';
                            }
                        });
                    }

                    // Also clear fields in detail sections
                    [microplasticsDetails, fragmentsDetails].forEach(section => {
                        if (section) {
                            const fields = section.querySelectorAll('input, select, textarea');
                            fields.forEach(field => {
                                if (field.type === 'radio' || field.type === 'checkbox') {
                                    field.checked = false;
                                } else {
                                    field.value = '';
                                }
                            });
                        }
                    });

                    // Also hide the amount containers
                    const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
                    const fragmentsAmountContainer = document.getElementById('fragments-amount-container');

                    if (microplasticsAmountContainer) microplasticsAmountContainer.style.display = 'none';
                    if (fragmentsAmountContainer) fragmentsAmountContainer.style.display = 'none';

                    // Hide all percentage validation containers
                    const validationContainers = document.querySelectorAll('.percentage-validation-container');
                    validationContainers.forEach(container => {
                        container.style.display = 'none';
                    });
                } else {
                    // When "Yes" is selected, DON'T automatically show sections
                    // Only show them when user enters count > 0
                    // Check microplastics count
                    const microplasticsInput = document.getElementById('microplastics-count');
                    if (microplasticsInput) {
                        const microplasticsCount = parseInt(microplasticsInput.value) || 0;
                        const microplasticsDetails = document.getElementById('microplastics-details');
                        const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');

                        // Only show if count > 0
                        if (microplasticsDetails) {
                            microplasticsDetails.style.display = microplasticsCount > 0 ? 'block' : 'none';
                        }
                        if (microplasticsAmountContainer) {
                            microplasticsAmountContainer.style.display = microplasticsCount > 0 ? 'block' : 'none';
                        }

                        // Add change event listener - but don't duplicate
                        if (!microplasticsInput.hasAttribute('data-event-bound')) {
                            microplasticsInput.setAttribute('data-event-bound', 'true');
                            microplasticsInput.addEventListener('input', function() {
                                const count = parseInt(this.value) || 0;
                                const details = document.getElementById('microplastics-details');
                                const amountContainer = document.getElementById('microplastics-amount-container');
                                if (details) {
                                    details.style.display = count > 0 ? 'block' : 'none';
                                }
                                if (amountContainer) {
                                    amountContainer.style.display = count > 0 ? 'block' : 'none';
                                }
                                // Save to formData
                                formData['microplastics_count'] = this.value;
                                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
                            });
                        }
                    }

                    // Check fragments count
                    const fragmentsInput = document.getElementById('fragments-count');
                    if (fragmentsInput) {
                        const fragmentsCount = parseInt(fragmentsInput.value) || 0;
                        const fragmentsDetails = document.getElementById('fragments-details');
                        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');

                        // Only show if count > 0
                        if (fragmentsDetails) {
                            fragmentsDetails.style.display = fragmentsCount > 0 ? 'block' : 'none';
                        }
                        if (fragmentsAmountContainer) {
                            fragmentsAmountContainer.style.display = fragmentsCount > 0 ? 'block' : 'none';
                        }

                        // Add change event listener - but don't duplicate
                        if (!fragmentsInput.hasAttribute('data-event-bound')) {
                            fragmentsInput.setAttribute('data-event-bound', 'true');
                            fragmentsInput.addEventListener('input', function() {
                                const count = parseInt(this.value) || 0;
                                const details = document.getElementById('fragments-details');
                                const amountContainer = document.getElementById('fragments-amount-container');
                                const showDebrisDetails = count > 0;
                                if (details) {
                                    details.style.display = showDebrisDetails ? 'block' : 'none';
                                }
                                if (amountContainer) {
                                    amountContainer.style.display = showDebrisDetails ? 'block' : 'none';
                                }
                                // Save to formData
                                formData['fragments_count'] = this.value;
                                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
                            });
                        }
                    }
                }
            }

            // Update formData
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
    });

    // Add event delegation for device installation period toggle in form-page2
    document.addEventListener('change', function(event) {
        if (event.target.name === 'device_installation_period') {
            const isDevicePeriod = event.target.value === 'yes';
            const startLegend = document.getElementById('start-date-legend');
            const deviceSection = document.getElementById('device-period-section');

            if (startLegend) {
                startLegend.innerHTML = isDevicePeriod
                    ? 'Device Installation Start Date (<span class="required-marker">*</span>):'
                    : 'Plastic Collection Date (<span class="required-marker">*</span>):';
            }
            if (deviceSection) {
                deviceSection.style.display = isDevicePeriod ? 'block' : 'none';
            }
            if (!isDevicePeriod) {
                clearPartialDateFields('end');
                syncPartialDateDayOptions('end');
            }

            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
    });

    // Data source section in form-page2: reusing a source autofills and
    // locks the details; the source type decides which details apply.
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('publication-select')) {
            applySelectedPublication(event.target);
        }

        if (event.target.name === 'data_source_type_id') {
            formData.data_source_type_id = event.target.value;
            updateDataSourceTypeUi();
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
            rememberPublicationForLocation();
        }
    });

    // Function to update media-specific sections in form-page3
    function updateFormPage3MediaSections(mediaType) {
        // Check if form-page3 is loaded
        const formPage3 = document.getElementById('form-page3');
        if (!formPage3) return;

        // Hide all media-specific sections first (for page 4)
        const mediaSpecificSections = formPage3.querySelectorAll('.media-specific-section');
        mediaSpecificSections.forEach(section => {
            section.style.display = 'none';
        });

        // Show the section for the selected media type (for page 4)
        const selectedSection = formPage3.querySelector(`.media-specific-section[data-media-type="${mediaType}"]`);
        if (selectedSection) {
            selectedSection.style.display = 'block';
        }

        // Handle new vertical media options and suboptions
        handleMediaSuboptions(mediaType);
    }

    // Function to handle media suboptions display
    function handleMediaSuboptions(mediaType) {
        // Hide all suboptions first
        const allSuboptions = document.querySelectorAll('.media-suboptions');
        allSuboptions.forEach(suboption => {
            suboption.style.display = 'none';
        });

        // Hide all "other" description boxes first
        const allOtherDescriptions = document.querySelectorAll('.other-description-container');
        allOtherDescriptions.forEach(container => {
            container.style.display = 'none';
        });

        // Show suboptions for the selected media type
        if (mediaType) {
            let suboptions = null;
            switch(mediaType) {
                case 'water':
                    suboptions = document.getElementById('water-suboptions');
                    // Check if "other" is selected for water type
                    setTimeout(() => {
                        const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
                        if (formData.water_type === 'other') {
                            const otherDescription = document.getElementById('water-other-description');
                            if (otherDescription) {
                                otherDescription.style.display = 'block';
                            }
                        }
                    }, 100);
                    break;
                case 'soil_sediment':
                    suboptions = document.getElementById('sediment-suboptions');
                    // Check if "other" is selected for sediment type
                    setTimeout(() => {
                        const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
                        if (formData.sediment_type === 'other') {
                            const otherDescription = document.getElementById('sediment-other-description');
                            if (otherDescription) {
                                otherDescription.style.display = 'block';
                            }
                        }
                    }, 100);
                    break;
                case 'in_soil':
                    suboptions = document.getElementById('soil-suboptions');
                    break;
                case 'soil_litter':
                    suboptions = document.getElementById('surface-suboptions');
                    break;
                case 'mixed_composite':
                    suboptions = document.getElementById('mixed-suboptions');
                    break;
            }

            if (suboptions) {
                suboptions.style.display = 'block';
            }

            // Update sample amount unit options based on media type
            updateSampleAmountUnits(mediaType);
        }
    }    // Function to set up navigation buttons
    function setupNavigationButtons() {
        console.log('Setting up navigation buttons...');

        // Check if form-pages-container exists
        const container = document.querySelector('.form-pages-container');
        if (!container) {
            console.error('form-pages-container not found!');
            return;
        }

        console.log('form-pages-container found, adding event listener');

        // Set up event delegation for continue buttons
        container.addEventListener('click', function(event) {
            console.log('Click event detected on:', event.target);

            // Check if the clicked element is a continue button
            // "Find Address on Map" (page 1) reuses the .btn-continue style
            // but is not a navigation button; it must not skip the page-1
            // location check by loading page 2.
            if (event.target.classList.contains('btn-continue') &&
                event.target.id !== 'find-address-on-map') {
                console.log('Continue button clicked:', event.target.id, event.target);

                // Special validation for page 1 (location information)
                if (event.target.id === 'page1-continue' ||
                    (event.target.dataset && event.target.dataset.next === '2' && currentPage === 1)) {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('Triggering page 1 validation');
                    validateAndProceedFromPage1();
                    return;
                }

                // Special validation for page 2 (sampling event information)
                if (event.target.id === 'page2-continue' ||
                    (event.target.dataset && event.target.dataset.next === '3' && currentPage === 2)) {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('Triggering page 2 validation');

                    if (!validatePage2()) {
                        return; // Stop navigation if validation fails
                    }
                }

                // Numeric fields must be within their allowed range (no negative
                // measurements/counts, percentages <= 100) before leaving a page.
                const currentPageElement = event.target.closest('.form-page') ||
                    document.getElementById(`form-page${currentPage}`);
                if (!ensureNumericInputsValid(currentPageElement)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                // Save the page this Continue button is on. It can be an
                // earlier page than currentPage after scrolling back.
                const ownerMatch = currentPageElement && /^form-page(\d+)$/.exec(currentPageElement.id || '');
                const ownerPage = ownerMatch ? parseInt(ownerMatch[1], 10) : currentPage;
                if (!savePageData(ownerPage)) saveCurrentPageData();

                const nextPage = event.target.dataset.next ? parseInt(event.target.dataset.next) : ownerPage + 1;

                // Check if the page already exists in the DOM
                const existingPage = document.getElementById(`form-page${nextPage}`);

                if (existingPage) {
                    // Page exists, update its content and scroll to it
                    updateExistingPageContent(existingPage, nextPage);
                    scrollToPage(nextPage);
                } else {
                    // Page doesn't exist, load it for the first time
                    loadAndAppendNextPage(nextPage);
                    loadedPages = Math.max(loadedPages, nextPage);
                }

                // Update current page tracker
                currentPage = nextPage;

                // Update progress steps
                updateProgressSteps(currentPage);

                // If navigating to page 5 (Particle Details), update the particle details sections and load polymer options
                if (nextPage === 5) {
                    updatePage5Content();
                }

                // If navigating to page 6 (Review and Submit), generate summary
                if (nextPage === 6) {
                    generateSummary();
                }
            }

            // Check if the clicked element is the save button
            if (event.target.id === 'save-button') {
                event.preventDefault();

                // Re-check every loaded page's numeric fields before submitting
                if (!ensureNumericInputsValid(document.querySelector('.form-pages-container'))) {
                    return;
                }

                // First save to sessionStorage: every loaded page in new
                // entries (see captureLoadedFormPages).
                if (isEditMode) {
                    saveCurrentPageData();
                } else {
                    captureLoadedFormPages();
                }

                // Then submit to server and show options after success
                submitFormDataAndShowNextSteps();
            }
        });
    }

    // Function to show confirmation dialog with three options after successful save
    function showIterationConfirmation() {
        // Create a modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay success-options-modal';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.zIndex = '1000';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content success-options-content';
        modalContent.style.backgroundColor = '#fff';
        modalContent.style.padding = '30px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.maxWidth = '500px';
        modalContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';

        // Add success message
        const successMessage = document.createElement('div');
        successMessage.className = 'success-message';
        successMessage.innerHTML = `
            <h3 style="color: #28a745; margin-bottom: 15px; display: flex; align-items: center;">
                <i class="fas fa-check-circle" style="margin-right: 10px;"></i>
                Data Saved Successfully!
            </h3>
            <p style="margin-bottom: 25px; color: #6c757d;">
                What would you like to do next?
            </p>
        `;

        // Create options container
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'next-step-options';
        optionsContainer.style.marginBottom = '20px';

        // Option A: Start New Location/Date
        const optionA = document.createElement('div');
        optionA.className = 'option-item';
        optionA.innerHTML = `
            <button type="button" class="btn btn-outline-primary option-button" id="new-location-date" style="width: 100%; margin-bottom: 15px; padding: 15px; text-align: left;">
                <strong>A) Start New Location/Date</strong>
                <div style="font-size: 0.9em; color: #6c757d; margin-top: 5px;">
                    Clear all data and start fresh with a new location and date
                </div>
            </button>
        `;

        // Options B & C grouped under "Add Sample to the Same Location-Date"
        const groupedOptions = document.createElement('div');
        groupedOptions.className = 'grouped-options';
        groupedOptions.innerHTML = `
            <h5 style="margin: 20px 0 15px 0; color: #495057;">Add Sample to the Same Location-Date</h5>
            <button type="button" class="btn btn-outline-secondary option-button" id="different-media" style="width: 100%; margin-bottom: 10px; padding: 15px; text-align: left;">
                <strong>B) Different Media Type</strong>
            </button>
            <button type="button" class="btn btn-outline-secondary option-button" id="same-media-sample" style="width: 100%; margin-bottom: 15px; padding: 15px; text-align: left;">
                <strong>C) Same Media Type</strong>
            </button>
        `;

        // Option D: New Case, Same Data Source
        const optionD = document.createElement('div');
        optionD.className = 'option-item';
        optionD.innerHTML = `
            <button type="button" class="btn btn-outline-primary option-button" id="same-publication-case" style="width: 100%; margin-bottom: 15px; padding: 15px; text-align: left;">
                <strong>D) New Case, Same Data Source</strong>
                <div style="font-size: 0.9em; color: #6c757d; margin-top: 5px;">
                    Start a brand-new case keeping only this data source
                </div>
            </button>
        `;

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close & Exit';
        closeButton.className = 'btn btn-light';
        closeButton.style.width = '100%';
        closeButton.style.padding = '10px';
        closeButton.style.marginTop = '10px';

        // Event listeners
        closeButton.addEventListener('click', function() {
            document.body.removeChild(modalOverlay);
            // Optionally redirect to dashboard or main page
            if (window.location.pathname.includes('enter_data_by_form')) {
                window.location.href = '/my-samples';
            }
        });

        // Assemble the modal
        optionsContainer.appendChild(optionA);
        optionsContainer.appendChild(groupedOptions);
        optionsContainer.appendChild(optionD);
        modalContent.appendChild(successMessage);
        modalContent.appendChild(optionsContainer);
        modalContent.appendChild(closeButton);
        modalOverlay.appendChild(modalContent);

        // Add the modal to the document
        document.body.appendChild(modalOverlay);

        // Add event listeners to option buttons after they're added to DOM
        setTimeout(() => {
            const newLocationButton = document.getElementById('new-location-date');
            const differentMediaButton = document.getElementById('different-media');
            const sameMediaSampleButton = document.getElementById('same-media-sample');
            const samePublicationButton = document.getElementById('same-publication-case');

            if (samePublicationButton) {
                samePublicationButton.addEventListener('click', function() {
                    document.body.removeChild(modalOverlay);
                    handleSamePublication();
                });
            }

            if (newLocationButton) {
                newLocationButton.addEventListener('click', function() {
                    document.body.removeChild(modalOverlay);
                    handleNewLocationDate();
                });
            }

            if (differentMediaButton) {
                differentMediaButton.addEventListener('click', function() {
                    document.body.removeChild(modalOverlay);
                    handleDifferentMedia();
                });
            }

            if (sameMediaSampleButton) {
                sameMediaSampleButton.addEventListener('click', function() {
                    document.body.removeChild(modalOverlay);
                    handleSameMediaSample();
                });
            }
        }, 100);
    }

    // Function to show next steps options after saving
    function showNextStepsOptions() {
        console.log('showNextStepsOptions called');

        // Ensure page 6 is loaded first
        const page6 = document.getElementById('form-page6');
        if (!page6) {
            console.log('Page 6 not loaded, loading it first...');
            // Load page 6 if not already loaded
            loadAndAppendNextPage(6).then(() => {
                // After page 6 is loaded, try again
                setTimeout(() => showNextStepsOptionsInternal(), 200);
            });
            return;
        }

        showNextStepsOptionsInternal();
    }

    function showNextStepsOptionsInternal() {
        console.log('showNextStepsOptionsInternal called');

        // Get page 6 element
        const page6 = document.getElementById('form-page6');
        if (!page6) {
            console.error('Page 6 not found in DOM!');
            return;
        }
        console.log('Page 6 found:', page6);

        // Debug: log all children of page 6
        console.log('Page 6 innerHTML length:', page6.innerHTML.length);
        console.log('Page 6 has next-steps-options?', page6.innerHTML.includes('next-steps-options'));

        // Find the save button and next steps container within page 6
        const saveButton = page6.querySelector('#save-button');
        console.log('Save button found:', saveButton);
        if (saveButton) {
            saveButton.style.display = 'none';
            console.log('Save button hidden');
        } else {
            console.warn('Save button not found in page 6');
        }

        // Show the next steps container within page 6
        const nextStepsContainer = page6.querySelector('#next-steps-options');
        console.log('Next steps container found:', nextStepsContainer);
        if (nextStepsContainer) {
            nextStepsContainer.style.display = 'block';
            console.log('Next steps container displayed, style:', nextStepsContainer.style.display);

            // Add event listeners to the option buttons (only if not already bound)
            const newLocationButton = page6.querySelector('#new-location-date');
            const differentMediaButton = page6.querySelector('#different-media');
            const sameMediaSampleButton = page6.querySelector('#same-media-sample');
            const samePublicationButton = page6.querySelector('#same-publication-case');

            if (samePublicationButton && !samePublicationButton.hasAttribute('data-listener-bound')) {
                samePublicationButton.setAttribute('data-listener-bound', 'true');
                samePublicationButton.addEventListener('click', function() {
                    handleSamePublication();
                });
                console.log('Same publication button listener added');
            }

            if (newLocationButton && !newLocationButton.hasAttribute('data-listener-bound')) {
                newLocationButton.setAttribute('data-listener-bound', 'true');
                newLocationButton.addEventListener('click', function() {
                    handleNewLocationDate();
                });
                console.log('New location button listener added');
            }

            if (differentMediaButton && !differentMediaButton.hasAttribute('data-listener-bound')) {
                differentMediaButton.setAttribute('data-listener-bound', 'true');
                differentMediaButton.addEventListener('click', function() {
                    handleDifferentMedia();
                });
                console.log('Different media button listener added');
            }

            if (sameMediaSampleButton && !sameMediaSampleButton.hasAttribute('data-listener-bound')) {
                sameMediaSampleButton.setAttribute('data-listener-bound', 'true');
                sameMediaSampleButton.addEventListener('click', function() {
                    handleSameMediaSample();
                });
                console.log('Same media button listener added');
            }
        } else {
            console.error('Next steps container not found in page 6!');
        }
    }

    // Handler for Option A: Start New Location/Date
    function handleNewLocationDate() {
        // The options are only displayed after a successful save. Do not submit
        // the same sample a second time while preparing the next case.
        formData = {};
        sessionStorage.removeItem(formStorageKey);

        navigateToPage(1);
        clearAllFormFields();
        if (page1LocationUi) page1LocationUi.resetForNewCase();
        showTemporaryMessage('Data saved! Starting fresh data entry for new location and date', 'success');

        // A data source reused for the saved sample left the page-2 details
        // locked; unlock them so a new source can be chosen or entered.
        setPublicationDetailsLocked(false);
        updateDataSourceTypeUi();
        syncDataSourceLegacyNotice();
    }

    // Options B and C keep the sampling event (page 2), which stays on
    // screen: capture its inputs and return all of its field names, so values
    // such as the sample description, air temperature, weather and rainfall
    // are saved with the next sample too, not only shown.
    function capturePage2FieldNames() {
        const page2 = document.getElementById('form-page2');
        if (!page2) return [];
        savePageData(2);
        const names = new Set();
        page2.querySelectorAll('[name]').forEach(element => {
            if (element.name && element.name.trim() !== '') names.add(element.name);
        });
        return Array.from(names);
    }

    function preserveNextStepFields(fieldNames) {
        const preservedData = {};

        fieldNames.forEach(fieldName => {
            if (Object.prototype.hasOwnProperty.call(formData, fieldName)) {
                preservedData[fieldName] = formData[fieldName];
            }
        });

        return preservedData;
    }

    // Handler for Option B: Different Media Type (same location/date)
    function handleDifferentMedia() {
        // Preserve the full location context and sampling date/time metadata.
        const preservedData = preserveNextStepFields([
            'location_id',
            'location_type',
            'location_name',
            'location_shortcode',
            'location_description',
            'latitude',
            'longitude',
            'streetaddress',
            'city',
            'state',
            'country',
            'zip_code',
            'acres',
            'event_location_description',
            'event_latitude',
            'event_longitude',
            'device_installation_period',
            'start_year',
            'start_month',
            'start_day',
            'end_year',
            'end_month',
            'end_day',
            'sample_time',
            ...DATA_SOURCE_FORM_FIELDS,
            ...capturePage2FieldNames()
        ]);

        formData = preservedData;
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

        navigateToPage(3);
        clearMediaSpecificFields();
        showTemporaryMessage('Data saved! Select different media type for same location/date', 'success');
    }

    // Handler for Option C: Additional Sample (same media, location, date)
    function handleSameMediaSample() {
        // Preserve location/date context plus media selections/subtypes.
        const preservedData = preserveNextStepFields([
            'location_id',
            'location_type',
            'location_name',
            'location_shortcode',
            'location_description',
            'latitude',
            'longitude',
            'streetaddress',
            'city',
            'state',
            'country',
            'zip_code',
            'acres',
            'event_location_description',
            'event_latitude',
            'event_longitude',
            'device_installation_period',
            'start_year',
            'start_month',
            'start_day',
            'end_year',
            'end_month',
            'end_day',
            'sample_time',
            ...DATA_SOURCE_FORM_FIELDS,
            ...capturePage2FieldNames(),
            'media_type',
            'water_type',
            'water_type_other_description',
            'sediment_type',
            'sediment_type_other_description',
            'mixed_media_description'
        ]);

        formData = preservedData;
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

        navigateToPage(4);
        clearSampleSpecificFields();
        showTemporaryMessage('Data saved! Enter additional sample for same media and location', 'success');
    }

    // Handler for Option D: New Case, Same Data Source
    // Keeps ONLY the data-source block and starts a brand-new case from page 1.
    function handleSamePublication() {
        const preservedData = preserveNextStepFields(DATA_SOURCE_FORM_FIELDS);
        if (!hasDataSource(preservedData)) {
            DATA_SOURCE_FORM_FIELDS.forEach(field => { delete preservedData[field]; });
        }

        formData = preservedData;
        sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

        navigateToPage(1);
        clearAllFormFields();
        if (page1LocationUi) page1LocationUi.resetForNewCase();
        Object.entries(preservedData).forEach(([name, value]) => {
            document.querySelectorAll(`[name="${name}"]`).forEach(element => {
                if (element.type === 'radio' || element.type === 'checkbox') {
                    element.checked = (element.value === String(value));
                } else {
                    element.value = value;
                }
            });
        });

        showTemporaryMessage('Data saved! Starting a new case with the same data source', 'success');
    }

    // Function to navigate to a specific page (load if not exists, then scroll)
    function navigateToPage(pageNumber) {
        // Check if the page already exists in the DOM
        const existingPage = document.getElementById(`form-page${pageNumber}`);

        if (existingPage) {
            // Page exists, update its content and scroll to it
            updateExistingPageContent(existingPage, pageNumber);
            scrollToPage(pageNumber);
        } else {
            // Page doesn't exist, load it for the first time
            loadAndAppendNextPage(pageNumber);
            loadedPages = Math.max(loadedPages, pageNumber);
        }

        // Update current page tracker
        currentPage = pageNumber;

        // Update progress steps
        updateProgressSteps(currentPage);
    }
    function clearAllFormFields() {
        const allFormElements = document.querySelectorAll('input, select, textarea');
        allFormElements.forEach(element => {
            if (element.type === 'radio' || element.type === 'checkbox') {
                element.checked = false;
            } else {
                element.value = '';
            }
        });

        // Also clear the summary section
        const summaryContainer = document.getElementById('summary-container');
        if (summaryContainer) {
            summaryContainer.innerHTML = '';
        }

        // Hide next steps options if they are showing
        const nextStepsContainer = document.getElementById('next-steps-options');
        if (nextStepsContainer) {
            nextStepsContainer.style.display = 'none';
        }

        // Show save button again
        const saveButton = document.getElementById('save-button');
        if (saveButton) {
            saveButton.style.display = 'block';
        }

        // Hide all expandable sections to reset to initial state
        // Page 4: Hide additional info sections
        const additionalInfoSections = document.getElementById('additional-info-sections');
        if (additionalInfoSections) {
            additionalInfoSections.style.display = 'none';
        }

        // Page 4: Hide media-specific sections
        const waterSection = document.getElementById('water-section');
        const soilSection = document.getElementById('soil-section');
        if (waterSection) waterSection.style.display = 'none';
        if (soilSection) soilSection.style.display = 'none';

        // Page 5: Hide quantitative data container
        const quantitativeContainer = document.getElementById('quantitative-counts-container');
        if (quantitativeContainer) {
            quantitativeContainer.style.display = 'none';
        }

        // Page 5: Hide amount containers
        const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
        const packagingAmountContainer = document.getElementById('packaging-amount-container');
        if (microplasticsAmountContainer) microplasticsAmountContainer.style.display = 'none';
        if (fragmentsAmountContainer) fragmentsAmountContainer.style.display = 'none';
        if (packagingAmountContainer) packagingAmountContainer.style.display = 'none';

        // Page 5: Hide detail sections
        const microplasticsDetails = document.getElementById('microplastics-details');
        const fragmentsDetails = document.getElementById('fragments-details');
        const packagingDetails = document.getElementById('packaging-details');
        if (microplasticsDetails) microplasticsDetails.style.display = 'none';
        if (fragmentsDetails) fragmentsDetails.style.display = 'none';
        if (packagingDetails) packagingDetails.style.display = 'none';

        // Hide all percentage validation containers
        const validationContainers = document.querySelectorAll('.percentage-validation-container');
        validationContainers.forEach(container => {
            container.style.display = 'none';
        });

        // Clear packaging items container
        const packagingItemsContainer = document.getElementById('packaging-items-container');
        if (packagingItemsContainer) {
            packagingItemsContainer.innerHTML = '';
        }
    }

    // Helper function to clear media-specific fields (pages 3-6)
    function clearMediaSpecificFields() {
        const mediaPages = document.querySelectorAll('#form-page3, #form-page4, #form-page5, #form-page6');
        mediaPages.forEach(page => {
            const formElements = page.querySelectorAll('input, select, textarea');
            formElements.forEach(element => {
                if (element.type === 'radio' || element.type === 'checkbox') {
                    element.checked = false;
                } else {
                    element.value = '';
                }
            });
        });

        // Hide all expandable sections in these pages
        // Page 4: Hide additional info sections
        const additionalInfoSections = document.getElementById('additional-info-sections');
        if (additionalInfoSections) {
            additionalInfoSections.style.display = 'none';
        }

        // Page 4: Hide media-specific sections
        const waterSection = document.getElementById('water-section');
        const soilSection = document.getElementById('soil-section');
        if (waterSection) waterSection.style.display = 'none';
        if (soilSection) soilSection.style.display = 'none';

        // Page 5: Hide quantitative data container
        const quantitativeContainer = document.getElementById('quantitative-counts-container');
        if (quantitativeContainer) {
            quantitativeContainer.style.display = 'none';
        }

        // Page 5: Hide amount containers
        const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
        const packagingAmountContainer = document.getElementById('packaging-amount-container');
        if (microplasticsAmountContainer) microplasticsAmountContainer.style.display = 'none';
        if (fragmentsAmountContainer) fragmentsAmountContainer.style.display = 'none';
        if (packagingAmountContainer) packagingAmountContainer.style.display = 'none';

        // Page 5: Hide detail sections
        const microplasticsDetails = document.getElementById('microplastics-details');
        const fragmentsDetails = document.getElementById('fragments-details');
        const packagingDetails = document.getElementById('packaging-details');
        if (microplasticsDetails) microplasticsDetails.style.display = 'none';
        if (fragmentsDetails) fragmentsDetails.style.display = 'none';
        if (packagingDetails) packagingDetails.style.display = 'none';

        // Hide all percentage validation containers
        const validationContainers = document.querySelectorAll('.percentage-validation-container');
        validationContainers.forEach(container => {
            container.style.display = 'none';
        });

        // Clear packaging items container
        const packagingItemsContainer = document.getElementById('packaging-items-container');
        if (packagingItemsContainer) {
            packagingItemsContainer.innerHTML = '';
        }

        // Clear the previous entry's summary so page 6 does not keep showing it
        const summaryContainer = document.getElementById('summary-container');
        if (summaryContainer) {
            summaryContainer.innerHTML = '';
        }

        // Hide next steps options and show save button
        const nextStepsContainer = document.getElementById('next-steps-options');
        if (nextStepsContainer) {
            nextStepsContainer.style.display = 'none';
        }
        const saveButton = document.getElementById('save-button');
        if (saveButton) {
            saveButton.style.display = 'block';
        }
    }

    // Helper function to clear sample-specific fields (pages 4-6)
    function clearSampleSpecificFields() {
        const samplePages = document.querySelectorAll('#form-page4, #form-page5, #form-page6');
        samplePages.forEach(page => {
            const formElements = page.querySelectorAll('input, select, textarea');
            formElements.forEach(element => {
                if (element.type === 'radio' || element.type === 'checkbox') {
                    element.checked = false;
                } else {
                    element.value = '';
                }
            });
        });

        // Hide all expandable sections in these pages
        // Page 4: Hide additional info sections
        const additionalInfoSections = document.getElementById('additional-info-sections');
        if (additionalInfoSections) {
            additionalInfoSections.style.display = 'none';
        }

        // Page 5: Hide quantitative data container
        const quantitativeContainer = document.getElementById('quantitative-counts-container');
        if (quantitativeContainer) {
            quantitativeContainer.style.display = 'none';
        }

        // Page 5: Hide amount containers
        const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
        const packagingAmountContainer = document.getElementById('packaging-amount-container');
        if (microplasticsAmountContainer) microplasticsAmountContainer.style.display = 'none';
        if (fragmentsAmountContainer) fragmentsAmountContainer.style.display = 'none';
        if (packagingAmountContainer) packagingAmountContainer.style.display = 'none';

        // Page 5: Hide detail sections
        const microplasticsDetails = document.getElementById('microplastics-details');
        const fragmentsDetails = document.getElementById('fragments-details');
        const packagingDetails = document.getElementById('packaging-details');
        if (microplasticsDetails) microplasticsDetails.style.display = 'none';
        if (fragmentsDetails) fragmentsDetails.style.display = 'none';
        if (packagingDetails) packagingDetails.style.display = 'none';

        // Hide all percentage validation containers
        const validationContainers = document.querySelectorAll('.percentage-validation-container');
        validationContainers.forEach(container => {
            container.style.display = 'none';
        });

        // Clear packaging items container
        const packagingItemsContainer = document.getElementById('packaging-items-container');
        if (packagingItemsContainer) {
            packagingItemsContainer.innerHTML = '';
        }

        // Clear the previous entry's summary so page 6 does not keep showing it
        const summaryContainer = document.getElementById('summary-container');
        if (summaryContainer) {
            summaryContainer.innerHTML = '';
        }

        // Hide next steps options and show save button
        const nextStepsContainer = document.getElementById('next-steps-options');
        if (nextStepsContainer) {
            nextStepsContainer.style.display = 'none';
        }
        const saveButton = document.getElementById('save-button');
        if (saveButton) {
            saveButton.style.display = 'block';
        }
    }

    // Helper function to show temporary success messages
    function showTemporaryMessage(message, type = 'success') {
        const styles = {
            success: {
                background: '#d4edda',
                color: '#155724',
                border: '#c3e6cb'
            },
            error: {
                background: '#f8d7da',
                color: '#721c24',
                border: '#f5c6cb'
            },
            info: {
                background: '#e8f4fd',
                color: '#0c5460',
                border: '#b6dcfe'
            }
        };
        const style = styles[type] || styles.success;
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type}`;
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.right = '20px';
        messageDiv.style.zIndex = '9999';
        messageDiv.style.padding = '15px';
        messageDiv.style.backgroundColor = style.background;
        messageDiv.style.color = style.color;
        messageDiv.style.border = `1px solid ${style.border}`;
        messageDiv.style.borderRadius = '5px';
        messageDiv.style.maxWidth = '300px';
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        // Remove message after 4 seconds
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 4000);
    }
    window.showTemporaryMessage = showTemporaryMessage;

    // Make generateSummary available globally for debugging
    window.generateSummary = generateSummary;

    // Function to update existing page content based on current form data
    function updateExistingPageContent(pageElement, pageNumber) {
        if (!pageElement) return;

        // Fill form fields with current data
        fillFormFieldsInPage(pageElement);

        // Apply page-specific updates based on previous page data
        if (pageNumber === 2) {
            updatePage2Content();
        } else if (pageNumber === 3) {
            updatePage3Content();
        } else if (pageNumber === 4) {
            updatePage4Content();
        } else if (pageNumber === 5) {
            updatePage5Content(); // Particle Details - load polymer options
        } else if (pageNumber === 6) {
            generateSummary(); // Review and Submit
        }
    }

    // Function to update page 3 content based on page 2 data
    function updatePage3Content() {
        // Show/hide media-specific sections based on selected media type
        if (formData.media_type) {
            updateFormPage3MediaSections(formData.media_type);
        }

        // Show/hide additional info sections based on toggle
        if (formData.additional_info === 'yes') {
            const additionalInfoSections = document.getElementById('additional-info-sections');
            if (additionalInfoSections) {
                additionalInfoSections.style.display = 'block';
                // Update visible sections based on media type
                if (formData.media_type) {
                    updateFormPage3MediaSections(formData.media_type);
                }
            }
        }
    }

    // Function to update page 4 content based on previous pages data
    function updatePage4Content() {
        // Update particle details sections based on sample and media type
        updateFormPage5Sections();

        // Show/hide quantitative data sections
        if (formData.has_quantitative_data === 'yes') {
            const quantitativeContainer = document.getElementById('quantitative-counts-container');
            if (quantitativeContainer) {
                quantitativeContainer.style.display = 'block';
            }
        }

        // Handle additional info sections
        if (formData.additional_info === 'yes') {
            const additionalInfoSections = document.getElementById('additional-info-sections');
            if (additionalInfoSections) {
                additionalInfoSections.style.display = 'block';
                // Update media sections for page 4
                updateFormPage4MediaSections();
            }
        }
    }

    // Function to update page 4 sections based on count values
    function updateFormPage5Sections() {
        console.log('updateFormPage5Sections called');

        // Get current form data from session storage
        const currentFormData = JSON.parse(sessionStorage.getItem('microplastics_form_data') || '{}');

        // Update microplastics details section and sample amount
        const microplasticsCount = parseInt(currentFormData['microplastics_count']) || 0;
        const microplasticsDetails = document.getElementById('microplastics-details');
        const microplasticsAmountContainer = document.getElementById('microplastics-amount-container');
        if (microplasticsDetails) {
            microplasticsDetails.style.display = microplasticsCount > 0 ? 'block' : 'none';
            console.log('Microplastics details section:', microplasticsCount > 0 ? 'shown' : 'hidden');
        }
        if (microplasticsAmountContainer) {
            microplasticsAmountContainer.style.display = microplasticsCount > 0 ? 'block' : 'none';
        }

        // Update fragments details section and sample amount
        const debrisCount = getCombinedDebrisCount(currentFormData);
        const fragmentsDetails = document.getElementById('fragments-details');
        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
        if (fragmentsDetails) {
            fragmentsDetails.style.display = debrisCount > 0 ? 'block' : 'none';
            console.log('Fragments details section:', debrisCount > 0 ? 'shown' : 'hidden');
        }
        if (fragmentsAmountContainer) {
            fragmentsAmountContainer.style.display = debrisCount > 0 ? 'block' : 'none';
        }

        // Update unit options based on selected media type
        updateSampleAmountUnits(currentFormData['media_type']);

        // Update quantitative data container visibility
        const hasQuantitativeData = currentFormData['has_quantitative_data'];
        const quantitativeContainer = document.getElementById('quantitative-counts-container');
        if (quantitativeContainer) {
            quantitativeContainer.style.display = hasQuantitativeData === 'yes' ? 'block' : 'none';
            console.log('Quantitative container:', hasQuantitativeData === 'yes' ? 'shown' : 'hidden');
        }
    }

    // Function to load and append the next page to the container
    function loadAndAppendNextPage(pageNumber) {
        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading next section...</span>';
        document.querySelector('.form-pages-container').appendChild(loadingIndicator);

        // Get the form page container
        const formPagesContainer = document.querySelector('.form-pages-container');

        try {
            // Get template for the next page from the template container
            const templateId = `template-form-page${pageNumber}`;
            const template = document.getElementById(templateId);

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            // Clone the template content
            const pageContent = template.content.cloneNode(true);

            // Remove loading indicator
            loadingIndicator.remove();

            // Append the new page to the container
            formPagesContainer.appendChild(pageContent);

            // Get the newly added form page
            const newPage = document.getElementById(`form-page${pageNumber}`);

            // Add fade-in class for animation
            if (newPage) {
                newPage.classList.add('fade-in');

                // Scroll to the newly added page
                newPage.scrollIntoView({ behavior: 'smooth' });

                // Fill in form fields from session data if available, but only if this is not initial page load
                if (isPageInitialLoad) {
                    // Clear form fields on initial load/refresh to ensure clean state
                    clearFormFieldsInPage(newPage);
                    // Set flag to false after first dynamic page load
                    isPageInitialLoad = false;
                } else {
                    // Fill with cached data for subsequent navigations
                    fillFormFieldsInPage(newPage);
                }

                // Publication options are reference-backed and the initial
                // fetch can finish before page 2 is cloned into the document.
                if (pageNumber === 2) {
                    updatePage2Content();
                }

                // If loading page 5, update the particle details sections
                if (pageNumber === 4) {
                    updateFormPage5Sections();
                }
            }
        } catch (error) {
            console.error('Error loading next form page:', error);
            loadingIndicator.remove();

            // Show error message
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = 'Failed to load the next section. Please try again.';
            formPagesContainer.appendChild(errorMessage);

            // Add a retry button
            const retryButton = document.createElement('button');
            retryButton.textContent = 'Retry';
            retryButton.className = 'retry-button';
            retryButton.onclick = () => {
                errorMessage.remove();
                loadAndAppendNextPage(pageNumber);
            };
            errorMessage.appendChild(retryButton);
        }
    }

    // Function to update progress indicator steps    // Function to track changes to form fields and save to session
    function setupFormFieldTracking() {
        // Use event delegation to handle changes on all form fields
        const container = document.querySelector('.form-pages-container');
        // Typing alone (before a field loses focus) already counts as
        // unsaved input for the leave-page warning.
        container.addEventListener('input', function(event) {
            if (!isEditMode && event.target && event.target.name) markFormDirty();
        });
        container.addEventListener('change', function(event) {
            const element = event.target;

            if (element.name && element.name.trim() !== '') {
                if (isHiddenLegacyField(element)) {
                    return;
                }
                if (!isEditMode) markFormDirty();
                // In new entries formData.location_id is the location that
                // page 1 confirmed with Continue. Picking another option in
                // the dropdown does not change it until Continue, so Save can
                // tell that the shown location was never confirmed.
                if (element.name === 'location_id' && !isEditMode) {
                    return;
                }
                if (element.type === 'radio' || element.type === 'checkbox') {
                    if (element.checked) {
                        formData[element.name] = element.value;
                    }
                } else {
                    formData[element.name] = element.value;
                }

                if (DATA_SOURCE_FORM_FIELDS.includes(element.name)) {
                    rememberPublicationForLocation();
                }

                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                const partialDateMatch = element.name.match(/^(start|end)_(year|month|day)$/);
                if (partialDateMatch) {
                    const [, prefix, part] = partialDateMatch;
                    setPartialDateError(prefix);
                    if (part === 'year' || part === 'month') {
                        syncPartialDateDayOptions(prefix, {
                            preferredDay: formData[`${prefix}_day`]
                        });
                    }
                }
            }

            if (element.closest('.detail-percent-section')) {
                syncDetailRowsToFormData();
            }
        });
    }

    // Function to fill form fields from session storage
    function fillFormFieldsFromSession() {
        if (Object.keys(formData).length > 0) {
            // For each saved form field, set the value
            Object.keys(formData).forEach(fieldName => {
                const elements = document.querySelectorAll(`[name="${fieldName}"]`);
                elements.forEach(element => {
                    if (element.tagName === 'SELECT' || element.tagName === 'TEXTAREA' ||
                        (element.tagName === 'INPUT' &&
                            element.type !== 'radio' &&
                            element.type !== 'checkbox')) {
                        element.value = formData[fieldName];
                    } else if (element.tagName === 'INPUT' && element.type === 'radio') {
                        if (element.value === formData[fieldName]) {
                            element.checked = true;
                        }
                    } else if (element.tagName === 'INPUT' && element.type === 'checkbox') {
                        element.checked = formData[fieldName] === 'on' || formData[fieldName] === true;
                    }
                });
            });
        }

        syncLocationMapFromInputs({ zoom: 13 });
        initializePartialDateControls();
    }    // Function to set up summary generation
    function setupSummaryGeneration() {
        console.log('=== Setting up summary generation ===');

        // Check if we're already on page 5 and generate summary if needed
        setTimeout(() => {
            const summaryContainer = document.getElementById('summary-container');
            if (summaryContainer) {
                console.log('Summary container found, generating summary immediately');
                generateSummary();
            } else {
                console.log('Summary container not found');
            }
        }, 100);

        // Set up observer to watch for summary container being loaded
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the node itself or any of its children contains the summary container
                        const summaryContainer = node.querySelector ? node.querySelector('#summary-container') : null;
                        if (summaryContainer || node.id === 'summary-container') {
                            console.log('Summary container detected via mutation observer');
                            setTimeout(() => generateSummary(), 50);
                        }

                        // Check for page 5 - load polymer options
                        if (node.id === 'form-page5') {
                            console.log('Page 5 detected via mutation observer');
                            setTimeout(() => updatePage5Content(), 100);
                        }

                        // Check for page 6 - generate summary
                        if (node.id === 'form-page6') {
                            console.log('Page 6 detected via mutation observer');
                            setTimeout(() => generateSummary(), 100);
                        }
                    }
                });
            });
        });

        // Observe the whole document body for changes
        observer.observe(document.body, { childList: true, subtree: true });

        // Also set up interval check as fallback
        const intervalCheck = setInterval(() => {
            const summaryContainer = document.getElementById('summary-container');
            if (summaryContainer && summaryContainer.innerHTML.trim() === '') {
                console.log('Summary container found empty, generating summary via interval check');
                generateSummary();
                clearInterval(intervalCheck);
            }
        }, 1000);

        // Clear interval after 30 seconds to avoid indefinite checking
        setTimeout(() => clearInterval(intervalCheck), 30000);
    }// Function to generate summary for the final page
    async function generateSummary() {
        console.log('=== generateSummary called ===');
        const summaryContainer = document.getElementById('summary-container');
        if (!summaryContainer) {
            console.log('Summary container not found');
            return;
        }

        if (!dataSummaryUtils) {
            summaryContainer.innerHTML =
                '<p class="error-message">The data summary could not be generated. Please refresh the page.</p>';
            console.error('DataSummaryUtils is not available');
            return;
        }

        // Polymer names and method labels are reference-backed. Wait for that
        // data so the review page never falls back to an incomplete hard-coded
        // list or displays database IDs as user-facing methods.
        if (!referenceDataCache) {
            summaryContainer.innerHTML =
                '<p style="color: #666; font-style: italic;">Loading complete data summary...</p>';
            try {
                await loadReferenceData();
            } catch (error) {
                console.error('Could not load reference labels for the data summary:', error);
            }
        }

        // Get current form data from session storage
        const currentFormData = JSON.parse(sessionStorage.getItem(formStorageKey) || '{}');
        console.log('Current form data for summary:', currentFormData);

        // Merge with global formData
        formData = { ...formData, ...currentFormData };
        console.log('Merged form data:', formData);

        // Clear previous summary
        summaryContainer.innerHTML = '';

        // Check if we have any data to display
        if (Object.keys(formData).length === 0) {
            summaryContainer.innerHTML = '<p style="color: #666; font-style: italic;">No data available to display. Please fill out the previous pages.</p>';
            return;
        }

        // Add data validation status section
        const validationSection = document.createElement('div');
        validationSection.className = 'validation-status-section';
        validationSection.style.marginBottom = '20px';
        validationSection.style.padding = '15px';
        validationSection.style.backgroundColor = '#f8f9fa';
        validationSection.style.border = '1px solid #dee2e6';
        validationSection.style.borderRadius = '5px';

        const validationHeader = document.createElement('h4');
        validationHeader.textContent = 'Data Validation Status';
        validationHeader.style.marginTop = '0';
        validationHeader.style.marginBottom = '10px';
        validationHeader.style.color = '#495057';
        validationSection.appendChild(validationHeader);

        // Check required fields
        const requiredFields = [
            { key: 'media_type', label: 'Media Type', page: 2 }
        ];

        const missingRequired = [];
        const validationItems = [];

        // A checked new location counts: it is created when Save is clicked.
        if (!locationFormUtils.hasConfirmedLocation(formData)) {
            missingRequired.push({ key: 'location_id', label: 'Location', page: 1 });
        }
        requiredFields.forEach(field => {
            if (!formData[field.key] || formData[field.key].toString().trim() === '') {
                missingRequired.push(field);
            }
        });

        const dateValidation = validateSamplingEventDates(formData);
        dateValidation.issues.forEach(message => {
            missingRequired.push({
                key: 'sampling_event_date',
                label: message,
                page: 2
            });
        });

        getDataSourceIssues(formData).forEach(message => {
            missingRequired.push({ key: 'data_source', label: message, page: 2 });
        });
        if (isLegacySampleWithoutDataSource()) {
            validationItems.push({
                type: 'warning',
                message: publicationFormUtils.DATA_SOURCE_MESSAGES.legacyNotice
            });
        }

        // Check percentage validation for quantitative data
        // Note: Detailed percentage validation is performed on the backend during save
        if (formData.has_quantitative_data === 'yes') {
            // Basic check: if counts are provided, suggest filling percentage data
            if (formData.microplastics_count && parseInt(formData.microplastics_count) > 0) {
                // Just a reminder, not an error
                // Full validation happens on backend
            }
            if (formData.fragments_count && parseInt(formData.fragments_count) > 0) {
                // Just a reminder, not an error
                // Full validation happens on backend
            }
        }

        // Display validation status
        if (missingRequired.length === 0 && validationItems.length === 0) {
            const successDiv = document.createElement('div');
            successDiv.style.color = '#28a745';
            successDiv.style.fontWeight = 'bold';
            successDiv.innerHTML = '✓ All required fields completed and data validation passed';
            validationSection.appendChild(successDiv);
        } else {
            if (missingRequired.length > 0) {
                const errorDiv = document.createElement('div');
                errorDiv.style.color = '#dc3545';
                errorDiv.style.marginBottom = '10px';
                errorDiv.innerHTML = '⚠ Missing required fields: ' + missingRequired.map(f => f.label).join(', ');
                validationSection.appendChild(errorDiv);
            }

            validationItems.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.style.color = item.type === 'warning' ? '#ffc107' : '#dc3545';
                itemDiv.style.marginBottom = '5px';
                itemDiv.innerHTML = `⚠ ${item.message}`;
                validationSection.appendChild(itemDiv);
            });
        }

        summaryContainer.appendChild(validationSection);

        const particleSummary = dataSummaryUtils.buildParticleSummary(
            formData,
            referenceDataCache || {}
        );
        const microPolymerEntries = particleSummary.microplastics.polymers;
        const fragmentPolymerEntries = particleSummary.fragments.polymers;

        // Field groups ordered to match the order the form pages ask for them
        // (page 1 location, page 2 event + weather, page 3 media, page 4
        // additional info, page 5 sample details, page 6 notes).
        const fieldGroups = {
            'Location Information': [
                'location_status',
                'location_id', 'location_name', 'location_shortcode', 'location_description', 'land_use_cover',
                'latitude', 'longitude',
                'event_location_description', 'event_latitude', 'event_longitude',
                'zip_code', 'acres',
                'streetaddress', 'city', 'state', 'country'
            ],
            'Sampling Event Information': [
                'device_installation_period',
                'start_date_summary', 'end_date_summary',
                'sample_time', 'sample_description'
            ],
            'Data Source': [
                'data_source_id', 'data_source_type_id',
                'source_title', 'authors_or_organization', 'publication_year', 'date_accessed',
                'journal_publisher_or_repository', 'source_identifier_or_url',
                'project_or_collection_name', 'citation_text'
            ],
            'Sampling Weather Conditions': [
                'air_temp', 'current_conditions', 'rainfall'
            ],
            'Media Information': [
                'media_type', 'water_type', 'water_type_other_description',
                'sediment_type', 'sediment_type_other_description',
                'mixed_media_description'
            ],
            'Additional Environmental Information': [
                'additional_info', 'environment_type'
            ],
            'Additional Water Information': [
                'volume_sampled',
                'total_water_depth', 'sample_water_depth', 'water_depth',
                'water_flow_velocity', 'flow_velocity',
                'turbidity',
                'total_suspended_solids', 'suspended_solids',
                'dissolved_oxygen', 'conductivity', 'water_additional_notes'
            ],
            'Additional Aquatic Sediment Information': [
                'sediment_depth', 'sediment_dry_weight', 'sediment_organic_matter',
                'soil_texture', 'soil_texture_method',
                'sediment_moisture', 'sediment_sand', 'sediment_silt', 'sediment_clay',
                'sediment_additional_notes'
            ],
            'Additional Terrestrial Soil Information': [
                'soil_depth', 'soil_sample_dry_weight', 'soil_dry_weight', 'soil_organic_matter',
                'soil_texture', 'soil_texture_method',
                'soil_moisture', 'soil_sand', 'soil_silt', 'soil_clay',
                'soil_additional_notes'
            ],
            'Additional Land Surface Information': [
                'surface_area_sampled', 'permeable_surfaces', 'impermeable_surfaces',
                'surface_additional_notes'
            ],
            'Additional Mixed Media Information': [
                'mixed_additional_notes'
            ],
            'Quantitative Data': [
                'has_quantitative_data', 'replicates_count',
                'total_sample_amount', 'sample_unit',
                'microplastics_count', 'fragments_count'
            ],
            'Microplastics Details': [
                'micro_mass_mp_total', 'micro_method_polymer_num', 'micro_method_polymer_other', 'micro_method_percent_estimate'
            ],
            'Microplastics Size Distribution': [
                'mp_size_lt_1um', 'mp_size_1_20um', 'mp_size_20_100um', 'mp_size_100um_1mm', 'mp_size_1_5mm'
            ],
            'Microplastics Color Distribution': [
                'mp_color_clear', 'mp_color_opaque_light', 'mp_color_opaque_dark', 'mp_color_mixed'
            ],
            'Microplastics Form Distribution': [
                'mp_form_fiber', 'mp_form_pellet', 'mp_form_fragment', 'mp_form_film', 'mp_form_foam'
            ],
            'Microplastics Polymer Types': microPolymerEntries.map(entry => entry.field),
            'Fragments Details': [
                'fragments_mass_debris_total', 'fragments_method_polymer_num', 'fragments_method_polymer_other', 'fragments_method_percent_estimate'
            ],
            'Fragments Color Distribution': [
                'fragment_color_clear', 'fragment_color_opaque_light', 'fragment_color_opaque_dark', 'fragment_color_mixed'
            ],
            'Fragments Form Distribution': [
                'fragment_form_fiber', 'fragment_form_pellet', 'fragment_form_film',
                'fragment_form_foam', 'fragment_form_hardplastic', 'fragment_form_other'
            ],
            'Fragments Polymer Types': fragmentPolymerEntries.map(entry => entry.field),
            'Submission Notes': [
                'additional_notes'
            ]
        };        // Field labels mapping for better display
        const fieldLabels = {
            // Location Information
            'location_status': 'Location',
            'location_id': 'Selected Location',
            'location_name': 'Location Name',
            'location_shortcode': 'Location Short Code',
            'location_description': 'Location Description',
            'latitude': 'Latitude',
            'longitude': 'Longitude',
            'event_location_description': 'Event Location Description (Override)',
            'event_latitude': 'Event Latitude (Override)',
            'event_longitude': 'Event Longitude (Override)',
            'acres': 'Area (acres)',
            'streetaddress': 'Street Address',
            'city': 'City',
            'state': 'State',
            'country': 'Country',
            'zip_code': 'Zip Code',
            'land_use_cover': 'Land Use and Land Cover',

            // Sampling Event Information
            'device_installation_period': 'Device Installation Period',
            'start_date_summary': formData.device_installation_period === 'yes'
                ? 'Device Installation Start Date'
                : 'Plastic Collection Date',
            'end_date_summary': 'Device Removal/End Date',
            'sample_time': 'Collection Time',
            'sample_description': 'Sample Description',

            // Data Source
            'data_source_id': 'Existing Data Source',
            'data_source_type_id': 'Data Source Type',
            'source_title': 'Source Title',
            'authors_or_organization': 'Authors or Organization',
            'publication_year': 'Publication Year',
            'date_accessed': 'Date Accessed',
            'journal_publisher_or_repository': 'Journal, Publisher, or Repository',
            'source_identifier_or_url': 'Identifier or URL',
            'project_or_collection_name': 'Project or Collection Name',
            'citation_text': 'Full Citation (APA)',
            'additional_notes': 'Additional Notes',

            // Media Information
            'media_type': 'Media Type',
            'water_type': 'Water Type',
            'water_type_other_description': 'Other Water Type Description',
            'sediment_type': 'Sediment Type',
            'sediment_type_other_description': 'Other Sediment Type Description',
            'mixed_media_description': 'Mixed Media Description',

            // Environmental Conditions
            'additional_info': 'Additional Sampling Information Available',
            'air_temp': 'Air Temperature (°C)',
            'current_conditions': 'Current Weather Conditions',
            'rainfall': 'Rainfall (cm)',
            'environment_type': 'Environment Type',

            // Additional Water Information
            'volume_sampled': 'Volume Sampled (L)',
            'water_depth': 'Water Depth (m)',
            'total_water_depth': 'Total Water Depth at Sampling Site (m)',
            'sample_water_depth': 'Sample Collection Depth (m)',
            'flow_velocity': 'Flow Velocity (m/s)',
            'water_flow_velocity': 'Water Flow Velocity (m/s)',
            'turbidity': 'Turbidity (NTU)',
            'suspended_solids': 'Total Suspended Solids (mg/L)',
            'total_suspended_solids': 'Total Suspended Solids (mg/L)',
            'dissolved_oxygen': 'Dissolved Oxygen (mg/L)',
            'conductivity': 'Conductivity (S/m)',
            'water_additional_notes': 'Additional Water Notes',

            // Additional Aquatic Sediment / Terrestrial Soil Information
            'sediment_depth': 'Sediment Sampling Depth (m)',
            'sediment_dry_weight': 'Sediment Sample Dry Weight (g)',
            'sediment_organic_matter': 'Sediment Organic Matter (%)',
            'soil_texture': 'Soil Texture Classification',
            'soil_texture_method': 'Soil Texture Method',
            'sediment_moisture': 'Sediment Moisture Content (%)',
            'sediment_sand': 'Sediment Sand Content (%)',
            'sediment_silt': 'Sediment Silt Content (%)',
            'sediment_clay': 'Sediment Clay Content (%)',
            'sediment_additional_notes': 'Additional Sediment Notes',
            'soil_depth': 'Soil Depth (m)',
            'soil_sample_dry_weight': 'Soil Sample Dry Weight (g)',
            'soil_dry_weight': 'Soil Dry Weight (g)',
            'soil_organic_matter': 'Soil Organic Matter (%)',
            'soil_moisture': 'Soil Moisture Content (%)',
            'soil_sand': 'Sand Content (%)',
            'soil_silt': 'Silt Content (%)',
            'soil_clay': 'Clay Content (%)',
            'soil_additional_notes': 'Additional Soil Notes',

            // Additional Land Surface / Mixed Media Information
            'surface_area_sampled': 'Surface Area Sampled (km²)',
            'permeable_surfaces': 'Permeable Surfaces (%)',
            'impermeable_surfaces': 'Impermeable Surfaces (%)',
            'surface_additional_notes': 'Additional Land Surface Notes',
            'mixed_additional_notes': 'Additional Mixed Media Notes',

            // Quantitative Data
            'has_quantitative_data': 'Quantitative Data Available',
            'replicates_count': 'Number of Replicates',
            'microplastics_count': 'Microplastics Count',
            'fragments_count': 'Fragments Count (greater than 5mm)',

            // Sample Amounts
            'total_sample_amount': 'Total Sample Amount',
            'sample_unit': 'Sample Unit',
            'microplastics_sample_amount': 'Microplastics Sample Amount',
            'microplastics_sample_unit': 'Microplastics Sample Unit',
            'fragments_sample_amount': 'Fragments Sample Amount',
            'fragments_sample_unit': 'Fragments Sample Unit',
            'packaging_sample_amount': 'Whole Packaging Sample Amount',
            'packaging_sample_unit': 'Whole Packaging Sample Unit',

            // Microplastics Size Distribution
            'mp_size_lt_1um': '< 1 μm (%)',
            'mp_size_1_20um': '1-20 μm (%)',
            'mp_size_20_100um': '20-100 μm (%)',
            'mp_size_100um_1mm': '100 μm - 1 mm (%)',
            'mp_size_1_5mm': '1-5 mm (%)',

            // Microplastics Color Distribution
            'mp_color_clear': 'Clear (%)',
            'mp_color_opaque_light': 'Opaque Light (%)',
            'mp_color_opaque_dark': 'Opaque Dark (%)',
            'mp_color_mixed': 'Mixed Colors (%)',

            // Microplastics Form Distribution
            'mp_form_fiber': 'Fiber (%)',
            'mp_form_pellet': 'Pellet (%)',
            'mp_form_fragment': 'Fragment (%)',
            'mp_form_film': 'Film (%)',
            'mp_form_foam': 'Foam (%)',

            // Microplastics Estimation Method
            'micro_mass_mp_total': 'Total Microplastics Mass (g)',
            'micro_method_polymer_num': 'Microplastics Polymer ID Method',
            'micro_method_polymer_other': 'Other Microplastics Polymer ID Method',
            'micro_method_percent_estimate': 'Microplastics Percent Method',

            // Fragments Form Distribution
            'fragment_color_clear': 'Clear (%)',
            'fragment_color_opaque_light': 'Opaque Light (%)',
            'fragment_color_opaque_dark': 'Opaque Dark (%)',
            'fragment_color_mixed': 'Mixed Colors (%)',
            'fragment_form_fiber': 'Fiber (%)',
            'fragment_form_pellet': 'Pellet (%)',
            'fragment_form_film': 'Film (%)',
            'fragment_form_foam': 'Foam (%)',
            'fragment_form_hardplastic': 'Hard Plastic (%)',
            'fragment_form_other': 'Other Form (%)',

            // Fragments Estimation Method
            'fragments_mass_debris_total': 'Total Debris Mass (g)',
            'fragments_method_polymer_num': 'Fragments Polymer ID Method',
            'fragments_method_polymer_other': 'Other Fragments Polymer ID Method',
            'fragments_method_percent_estimate': 'Fragments Percent Method'
        };

        [...microPolymerEntries, ...fragmentPolymerEntries].forEach(entry => {
            fieldLabels[entry.field] = entry.label;
        });

        const locationSummaryFields = new Set(fieldGroups['Location Information']);

        function getSummaryFieldValue(field) {
            if (field === 'start_date_summary') {
                return partialDateUtils.formatPartialDate(
                    getPartialDateParts(formData, 'start'),
                    { emptyLabel: '' }
                );
            }
            if (field === 'end_date_summary') {
                if (formData.device_installation_period !== 'yes') return '';
                return partialDateUtils.formatPartialDate(
                    getPartialDateParts(formData, 'end'),
                    { emptyLabel: '' }
                );
            }
            if (field === 'location_status' || locationSummaryFields.has(field)) {
                // A pending new location shows the checked details that
                // Save will create (not later, unconfirmed page-1 edits).
                return locationFormUtils.getLocationSummaryValue(formData, field, {
                    saveLabel: isEditMode ? 'Update Data' : 'Save'
                });
            }
            return formData[field];
        }

        const methodReferenceFields = new Set([
            'micro_method_polymer_num',
            'micro_method_percent_estimate',
            'fragments_method_polymer_num',
            'fragments_method_percent_estimate',
            'soil_texture_method'
        ]);
        const particleMethodLabels = new Map([
            ['micro_method_polymer_num', particleSummary.microplastics.polymerMethod],
            ['micro_method_percent_estimate', particleSummary.microplastics.percentMethod],
            ['fragments_method_polymer_num', particleSummary.fragments.polymerMethod],
            ['fragments_method_percent_estimate', particleSummary.fragments.percentMethod]
        ]);
        const yesNoFields = new Set(['additional_info']);

        function getSelectedControlLabel(field, value) {
            const select = Array.from(document.querySelectorAll('select[name]'))
                .find(element => element.name === field);
            const option = Array.from(select?.options || [])
                .find(item => String(item.value) === String(value));
            if (option?.textContent) {
                return option.textContent.trim();
            }

            const radio = Array.from(
                document.querySelectorAll('input[type="radio"][name]')
            ).find(element =>
                element.name === field && String(element.value) === String(value)
            );
            const radioLabel = Array.from(radio?.labels || [])[0] ||
                radio?.closest('label');
            return String(radioLabel?.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function getSummaryDisplayValue(field, value) {
            const selectedControlLabel = getSelectedControlLabel(field, value);
            if (methodReferenceFields.has(field)) {
                const modelLabel = particleMethodLabels.get(field);
                if (modelLabel && !modelLabel.startsWith('Unknown method')) {
                    return modelLabel;
                }
                return dataSummaryUtils.resolveMethodLabel(
                    value,
                    referenceDataCache?.methods || [],
                    selectedControlLabel
                );
            }
            if (selectedControlLabel && !selectedControlLabel.startsWith('--')) {
                return selectedControlLabel;
            }
            if (yesNoFields.has(field)) {
                if (value === 'yes') return 'Yes';
                if (value === 'no') return 'No';
            }
            return value;
        }

        const allDefinedFields = new Set();
        Object.values(fieldGroups).forEach(fields => {
            fields.forEach(field => allDefinedFields.add(field));
        });
        [
            'start_year', 'start_month', 'start_day',
            'end_year', 'end_month', 'end_day',
            'existing_location_description',
            'existing_location_latitude',
            'existing_location_longitude',
            'location_type',
            'new_location',
            'selected_location_id',
            'edit_mode',
            'sample_id',
            'sampling_event_id',
            'microplastics_sample_amount',
            'microplastics_sample_unit',
            'fragments_sample_amount',
            'fragments_sample_unit',
            'packaging_sample_amount',
            'packaging_sample_unit'
        ].forEach(field => allDefinedFields.add(field));

        const packagingItemPattern =
            /^packaging_(?:id|purpose|recycle_code|color_opacity|color)_(\d+)$/;
        const otherFields = Object.keys(formData).filter(field =>
            !allDefinedFields.has(field) &&
            !DETAIL_TABLES.includes(field) &&
            dataSummaryUtils.hasSummaryValue(formData[field]) &&
            !packagingItemPattern.test(field)
        );

        let otherSectionAdded = false;
        function appendOtherInformationSection() {
            if (otherSectionAdded || otherFields.length === 0) {
                return;
            }

            const otherHeader = document.createElement('h4');
            otherHeader.textContent = 'Other Information';
            otherHeader.style.marginBottom = '10px';
            otherHeader.style.marginTop = '15px';
            otherHeader.style.paddingBottom = '5px';
            otherHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(otherHeader);

            otherFields.forEach(field => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'summary-item';
                itemDiv.style.display = 'flex';
                itemDiv.style.marginBottom = '8px';

                const labelDiv = document.createElement('div');
                labelDiv.className = 'summary-label';
                labelDiv.style.width = '40%';
                labelDiv.style.fontWeight = 'bold';
                labelDiv.textContent = fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                const valueDiv = document.createElement('div');
                valueDiv.className = 'summary-value';
                valueDiv.style.width = '60%';
                valueDiv.textContent = getSummaryDisplayValue(field, formData[field]);

                itemDiv.appendChild(labelDiv);
                itemDiv.appendChild(valueDiv);
                summaryContainer.appendChild(itemDiv);
            });

            otherSectionAdded = true;
        }

        const groupMediaTypes = {
            'Additional Water Information': ['water'],
            'Additional Aquatic Sediment Information': ['soil_sediment'],
            'Additional Terrestrial Soil Information': ['in_soil'],
            'Additional Land Surface Information': ['soil_litter'],
            'Additional Mixed Media Information': ['mixed_composite']
        };

        const detailLabels = {
            fragments_color_details: 'Fragments Color Details',
            fragments_form_details: 'Fragments Texture Details',
            fragments_opacity_details: 'Fragments Opacity Details',
            fragments_purpose_details: 'Fragments Purpose Details',
            micro_color_details: 'Microplastics Color Details',
            micro_shape_details: 'Microplastics Shape Details',
            micro_texture_details: 'Microplastics Texture Details',
            micro_opacity_details: 'Microplastics Opacity Details',
            micro_size_details: 'Microplastics Size Details'
        };

        const renderedDetailTables = new Set();
        function renderDetailTable(tableId) {
            if (renderedDetailTables.has(tableId)) return;
            renderedDetailTables.add(tableId);

            const rows = Array.isArray(formData[tableId]) ? formData[tableId] : [];
            if (rows.length === 0) return;

            const detailHeader = document.createElement('h4');
            detailHeader.textContent = detailLabels[tableId] || tableId;
            detailHeader.style.marginBottom = '10px';
            detailHeader.style.marginTop = '15px';
            detailHeader.style.paddingBottom = '5px';
            detailHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(detailHeader);

            const sectionMethodLabels = dataSummaryUtils.getDetailMethodLabels(
                rows,
                referenceDataCache?.methods || []
            );
            if (sectionMethodLabels.length > 0) {
                const methodItem = document.createElement('div');
                methodItem.className = 'summary-item';
                methodItem.style.display = 'flex';
                methodItem.style.marginBottom = '8px';

                const methodLabel = document.createElement('div');
                methodLabel.className = 'summary-label';
                methodLabel.style.width = '40%';
                methodLabel.style.fontWeight = 'bold';
                methodLabel.textContent = 'Section Percent Estimation Method';

                const methodValue = document.createElement('div');
                methodValue.className = 'summary-value';
                methodValue.style.width = '60%';
                methodValue.textContent = sectionMethodLabels.join(', ');

                methodItem.appendChild(methodLabel);
                methodItem.appendChild(methodValue);
                summaryContainer.appendChild(methodItem);
            }

            rows.forEach(row => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'summary-item';
                itemDiv.style.display = 'flex';
                itemDiv.style.marginBottom = '8px';

                const labelDiv = document.createElement('div');
                labelDiv.className = 'summary-label';
                labelDiv.style.width = '40%';
                labelDiv.style.fontWeight = 'bold';
                labelDiv.textContent = row.legacy || `Reference ${row.ref_num}`;

                const valueDiv = document.createElement('div');
                valueDiv.className = 'summary-value';
                valueDiv.style.width = '60%';
                valueDiv.textContent = `${row.percent}%`;

                itemDiv.appendChild(labelDiv);
                itemDiv.appendChild(valueDiv);
                summaryContainer.appendChild(itemDiv);
            });
        }

        // Detail tables are entered inside the Microplastics/Fragments sections
        // on page 5 (in this on-screen order), so render them right after those
        // sections' summary groups to keep the summary in fill-in order.
        const detailTablesAfterGroup = {
            'Microplastics Details': [
                'micro_size_details', 'micro_color_details', 'micro_opacity_details',
                'micro_shape_details', 'micro_texture_details'
            ],
            'Fragments Details': [
                'fragments_purpose_details', 'fragments_color_details',
                'fragments_form_details', 'fragments_opacity_details'
            ]
        };

        // Create summary sections by field groups
        for (const [groupTitle, configuredFields] of Object.entries(fieldGroups)) {
            // Skip certain groups based on conditions
            const allowedMediaTypes = groupMediaTypes[groupTitle];
            let fields = configuredFields;
            if (allowedMediaTypes && !allowedMediaTypes.includes(formData.media_type)) {
                // Normally media changes clear these values. If older/edit data
                // still contains non-current media fields, show them instead of
                // hiding data that would otherwise remain in the submission.
                fields = configuredFields.filter(field =>
                    field !== 'soil_texture' && field !== 'soil_texture_method'
                );
                if (!fields.some(field =>
                    dataSummaryUtils.hasSummaryValue(getSummaryFieldValue(field))
                )) {
                    continue;
                }
            }
            // Create group header
            const groupHeader = document.createElement('h4');
            groupHeader.textContent = groupTitle;
            groupHeader.style.marginBottom = '10px';
            groupHeader.style.marginTop = '15px';
            groupHeader.style.paddingBottom = '5px';
            groupHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(groupHeader);

            // Add fields from this group that have values
            let hasValues = false;
            fields.forEach(field => {
                if (field.endsWith('_sample_unit') || field === 'sample_unit') {
                    return;
                }
                if (field === 'total_sample_amount' && formData['has_quantitative_data'] !== 'yes') {
                    return;
                }

                const summaryFieldValue = getSummaryFieldValue(field);
                if (dataSummaryUtils.hasSummaryValue(summaryFieldValue)) {
                    hasValues = true;

                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'summary-item';
                    itemDiv.style.display = 'flex';
                    itemDiv.style.marginBottom = '8px';

                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'summary-label';
                    labelDiv.style.width = '40%';
                    labelDiv.style.fontWeight = 'bold';
                    labelDiv.textContent = fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                    const valueDiv = document.createElement('div');
                    valueDiv.className = 'summary-value';
                    valueDiv.style.width = '60%';

                    // Special handling for certain fields
                    if (field === 'total_sample_amount') {
                        const unitValue = formData.sample_unit ? ` ${formData.sample_unit}` : '';
                        valueDiv.textContent = `${formData[field]}${unitValue}`;
                    } else if (field.includes('_sample_amount')) {
                        const unitField = field.replace('_amount', '_unit');
                        const unitValue = formData[unitField] ? ` ${formData[unitField]}` : '';
                        valueDiv.textContent = `${formData[field]}${unitValue}`;
                    } else if (field === 'device_installation_period') {
                        valueDiv.textContent = formData[field] === 'yes' ? 'Yes (Device installed for a period)' : 'No (Single collection event)';
                    } else if (field === 'has_quantitative_data') {
                        valueDiv.textContent = formData[field] === 'yes' ? 'Yes' : formData[field] === 'no' ? 'No' : 'Not specified';
                    } else if (field === 'start_date_summary' || field === 'end_date_summary') {
                        valueDiv.textContent = summaryFieldValue;
                    } else if (field.includes('_polymer_other_specify')) {
                        // Display the specified polymer type with percentage from the corresponding _other field
                        const otherField = field.replace('_specify', '');
                        if (dataSummaryUtils.hasSummaryValue(formData[otherField])) {
                            valueDiv.textContent = `${formData[field]} (${formData[otherField]}%)`;
                            valueDiv.style.fontStyle = 'italic';
                            valueDiv.style.color = '#0066cc';
                        } else {
                            valueDiv.textContent = formData[field];
                        }
                    } else if ((field === 'mp_polymer_other' || field === 'fragment_polymer_other') && formData[field + '_specify']) {
                        // Don't display the generic "Other" entry if there's a specification
                        return;
                    } else {
                        valueDiv.textContent = getSummaryDisplayValue(field, summaryFieldValue);
                    }

                    itemDiv.appendChild(labelDiv);
                    itemDiv.appendChild(valueDiv);
                    summaryContainer.appendChild(itemDiv);
                }
            });

            // If no values in this group, show message or remove header
            if (!hasValues) {
                summaryContainer.removeChild(groupHeader);
            }

            (detailTablesAfterGroup[groupTitle] || []).forEach(renderDetailTable);

            if (groupTitle === 'Fragments Polymer Types') {
                renderPackagingItems();
            }
        }

        // Safety net: render any detail tables not anchored to a section above.
        DETAIL_TABLES.forEach(renderDetailTable);

        // Unclassified fields have no fill-in position, so list them last.
        if (!otherSectionAdded) {
            appendOtherInformationSection();
        }

        // Preserve legacy per-item packaging data when it is actually present,
        // without creating an empty section for the current count-only form.
        function renderPackagingItems() {
            const packagingItemNumbers = [...new Set(
                Object.keys(formData)
                    .map(field => field.match(packagingItemPattern))
                    .filter(match => match && dataSummaryUtils.hasSummaryValue(formData[match[0]]))
                    .map(match => Number.parseInt(match[1], 10))
            )].sort((left, right) => left - right);

            if (packagingItemNumbers.length === 0) return;

            const packagingHeader = document.createElement('h4');
            packagingHeader.textContent = `Packaging Item Details (${packagingItemNumbers.length})`;
            packagingHeader.style.marginBottom = '10px';
            packagingHeader.style.marginTop = '15px';
            packagingHeader.style.paddingBottom = '5px';
            packagingHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(packagingHeader);

            packagingItemNumbers.forEach(i => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'packaging-item-summary';
                itemDiv.style.margin = '10px 0';
                itemDiv.style.padding = '10px';
                itemDiv.style.border = '1px solid #ddd';
                itemDiv.style.borderRadius = '4px';

                const itemHeader = document.createElement('h5');
                itemHeader.textContent = `Packaging Item #${i}`;
                itemHeader.style.marginTop = '0';
                itemDiv.appendChild(itemHeader);

                // Add each field for this item
                const packagingFields = [
                    { key: `packaging_id_${i}`, label: 'User Piece ID' },
                    { key: `packaging_purpose_${i}`, label: 'Purpose' },
                    { key: `packaging_recycle_code_${i}`, label: 'Recycle Code' },
                    { key: `packaging_color_opacity_${i}`, label: 'Opacity Type' },
                    { key: `packaging_color_${i}`, label: 'Color' }
                ];

                let hasItemData = false;
                packagingFields.forEach(fieldInfo => {
                    if (dataSummaryUtils.hasSummaryValue(formData[fieldInfo.key])) {
                        hasItemData = true;
                        const fieldDiv = document.createElement('div');
                        fieldDiv.style.display = 'flex';
                        fieldDiv.style.marginBottom = '5px';

                        const fieldLabel = document.createElement('div');
                        fieldLabel.style.width = '40%';
                        fieldLabel.style.fontWeight = 'bold';
                        fieldLabel.textContent = fieldInfo.label + ':';

                        const fieldValue = document.createElement('div');
                        fieldValue.style.width = '60%';
                        fieldValue.textContent = formData[fieldInfo.key];

                        fieldDiv.appendChild(fieldLabel);
                        fieldDiv.appendChild(fieldValue);
                        itemDiv.appendChild(fieldDiv);
                    }
                });

                if (hasItemData) {
                    summaryContainer.appendChild(itemDiv);
                }
            });
        }

        // Add edit buttons for each section for better usability
        const sectionHeaders = summaryContainer.querySelectorAll('h4');
        sectionHeaders.forEach(header => {
            const sectionTitle = header.textContent;
            const pageNumber = dataSummaryUtils.resolveSectionEditPage(sectionTitle);

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-edit-section';
            editButton.textContent = 'Edit';
            editButton.style.marginLeft = '10px';
            editButton.style.fontSize = '12px';
            editButton.style.padding = '2px 8px';
            editButton.style.backgroundColor = '#f0f0f0';
            editButton.style.border = '1px solid #ccc';
            editButton.style.borderRadius = '3px';
            editButton.style.cursor = 'pointer';

            editButton.addEventListener('click', function() {
                scrollToPage(pageNumber);
            });

            header.appendChild(editButton);
        });

        // Some headers are appended later (for example "Other Information"),
        // so attach Edit buttons to any section that still does not have one.
        summaryContainer.querySelectorAll('h4').forEach(header => {
            if (header.querySelector('.btn-edit-section')) {
                return;
            }

            const sectionTitle = header.textContent;
            const pageNumber = dataSummaryUtils.resolveSectionEditPage(sectionTitle);

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-edit-section';
            editButton.textContent = 'Edit';
            editButton.style.marginLeft = '10px';
            editButton.style.fontSize = '12px';
            editButton.style.padding = '2px 8px';
            editButton.style.backgroundColor = '#f0f0f0';
            editButton.style.border = '1px solid #ccc';
            editButton.style.borderRadius = '3px';
            editButton.style.cursor = 'pointer';
            editButton.addEventListener('click', function() {
                scrollToPage(pageNumber);
            });

            header.appendChild(editButton);
        });

        console.log('Summary generation completed');
    }

    // Function to submit form data and continue iterating
    function submitFormDataAndIterate() {
        // Show loading state
        const saveButton = document.getElementById('save-button');
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saving...';
        saveButton.disabled = true;

        // Add an iteration flag to indicate this is part of an iteration
        const dataToSubmit = { ...formData, is_iteration: 'true' };

        // Pre-validate
        const pre = preValidateBeforeSubmit(dataToSubmit);
        if (!pre.ok) {
            const msg = 'Could not save: ' + pre.issues.join(' ');
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            saveButton.textContent = originalText;
            saveButton.disabled = false;
            return;
        }

        const saveRequest = getSaveRequestConfig();
        const requestPayload = buildSubmissionPayload(dataToSubmit);

        // Use fetch API to submit data
        fetchSaveRequest(saveRequest.url, {
                method: saveRequest.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            })
            .then(async response => {
                if (!response.ok) {
                    let data;
                    try { data = await response.json(); } catch (_) { data = null; }
                    devLogSaveError('save-and-iterate', response.status, data, formData);
                    const friendly = await buildSaveErrorMessage(response.status, data, formData);
                    throw new Error(friendly);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    markFormSaved();
                    applyLocationSaveResponse(data);
                    handleSavedPublication(data);
                    // Show success message
                    alert('Data saved successfully! You can now enter another sample for the same location.');

                    // Preserve location information for next iteration
                    const locationData = {};
                    const locationFields = [
                        'location_id', 'location_name', 'latitude', 'longitude',
                        'acres', 'address', 'zip_code',
                        'start_year', 'start_month', 'start_day',
                        'end_year', 'end_month', 'end_day',
                        ...DATA_SOURCE_FORM_FIELDS
                    ];

                    // Save location data
                    locationFields.forEach(field => {
                        if (formData[field]) {
                            locationData[field] = formData[field];
                        }
                    });

                    // Clear the form data
                    formData = {};

                    // Restore location information
                    Object.keys(locationData).forEach(key => {
                        formData[key] = locationData[key];
                    });

                    // Save the updated form data to session storage
                    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                    // Reset to page 2 (Sample Details)
                    currentPage = 1;

                    // Remove all pages except page 1
                    for (let i = 2; i <= loadedPages; i++) {
                        const pageElement = document.getElementById(`form-page${i}`);
                        if (pageElement) {
                            pageElement.remove();
                        }
                    }

                    loadedPages = 1;

                    // Re-fill form fields for page 1
                    fillFormFieldsFromSession();

                    // Load page 2 (Sample Details) and navigate to it
                    loadAndAppendNextPage(2);
                    loadedPages = 2;
                    currentPage = 2;
                    updateProgressSteps(currentPage);

                    // Reset save button
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                } else {
                    // Show error message
                    alert('Error: ' + (data.message || 'Failed to save data'));
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                const msg = (error && error.message) ? error.message : 'An error occurred while saving the data.';
                if (typeof showTemporaryMessage === 'function') {
                    showTemporaryMessage(msg, 'error');
                } else {
                    alert(msg);
                }
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            });
    }

    // Function to submit form data silently without alert (returns Promise)
    function saveFormDataSilently() {
        console.log('=== FRONTEND SILENT SAVE ATTEMPT ===');
        console.log('Form data to submit:', formData);
        console.log('Form data JSON:', JSON.stringify(formData, null, 2));

        // Pre-validate to avoid confusing server errors
        const pre = preValidateBeforeSubmit(formData);
        if (!pre.ok) {
            const msg = 'Could not save: ' + pre.issues.join(' ');
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            return Promise.reject(new Error(msg));
        }

        const saveRequest = getSaveRequestConfig();
        const requestPayload = buildSubmissionPayload(formData);

        // Submit data directly to save endpoint
        return fetchSaveRequest(saveRequest.url, {
            method: saveRequest.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        })
        .then(async response => {
            console.log('Silent save response status:', response.status);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('silent-save', response.status, data, formData);
                const friendly = await buildSaveErrorMessage(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Silent save success:', data);
            if (data.success) {
                markFormSaved();
                applyLocationSaveResponse(data);
                handleSavedPublication(data);
                return data; // Return success data
            } else {
                throw new Error(data.message || 'Save failed');
            }
        });
    }

    // Function to submit form data and show next steps options
    function submitFormDataAndShowNextSteps() {
        // Show loading state
        const saveButton = document.getElementById('save-button');
        const originalText = saveButton ? saveButton.textContent : 'Save';
        if (saveButton) {
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;
        }

        console.log('=== SUBMITTING FORM DATA ===');
        console.log('Form data:', JSON.stringify(formData, null, 2));

        // Pre-validate before submitting to server
        const pre = preValidateBeforeSubmit(formData);
        if (!pre.ok) {
            const msg = 'Could not save: ' + pre.issues.join(' ');
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            if (saveButton) {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            }
            return;
        }

        const saveRequest = getSaveRequestConfig();
        const requestPayload = buildSubmissionPayload(formData);

        // Submit data to server
        fetchSaveRequest(saveRequest.url, {
            method: saveRequest.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        })
        .then(async response => {
            console.log('Save response status:', response.status);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('save-and-next-steps', response.status, data, formData);
                const friendly = await buildSaveErrorMessage(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save success:', data);
            if (data.success) {
                markFormSaved();
                // New entry and Edit My Data alike: the held new location
                // now exists, so reuse its id from here on.
                applyLocationSaveResponse(data);
                handleSavedPublication(data);
                // Show success message at the top of the page
                showTemporaryMessage(saveRequest.successMessage, 'success');

                if (isEditMode) {
                    if (saveButton) {
                        saveButton.textContent = originalText;
                        saveButton.disabled = false;
                    }
                    setTimeout(() => {
                        window.location.href = '/my-samples';
                    }, 900);
                    return;
                }

                // Show three options on the page (not in popup)
                showNextStepsOptions();

                // Re-enable save button
                if (saveButton) {
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                }
            } else {
                // Show error message
                alert('Error saving data: ' + data.message);
                if (saveButton) {
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error saving data:', error);
            const msg = (error && error.message) ? error.message : 'An error occurred while saving the data.';
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            if (saveButton) {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            }
        });
    }

    // Function to submit form data to the server (renamed to avoid conflicts)
    function submitFormDataOnly() {
        // Show loading state
        const saveButton = document.getElementById('save-button');
        const originalText = saveButton ? saveButton.textContent : 'Save';
        if (saveButton) {
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;
        }

        // Create FormData object for AJAX submission
        const formDataToSubmit = new FormData();

        // Add all form data to FormData object
        Object.keys(formData).forEach(key => {
            formDataToSubmit.append(key, formData[key]);
        });

        console.log('=== FRONTEND SAVE ATTEMPT ===');
        console.log('Form data to submit:', formData);
        console.log('Form data JSON:', JSON.stringify(formData, null, 2));

        // Pre-validate before submitting
        const pre = preValidateBeforeSubmit(formData);
        if (!pre.ok) {
            const msg = 'Could not save: ' + pre.issues.join(' ');
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            if (saveButton) {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            }
            return;
        }

        const saveRequest = getSaveRequestConfig();
        const requestPayload = buildSubmissionPayload(formData);

        // Submit data directly to save endpoint
        fetchSaveRequest(saveRequest.url, {
            method: saveRequest.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        })
        .then(async response => {
            console.log('Save response status:', response.status);
            console.log('Save response headers:', response.headers);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('save-only', response.status, data, formData);
                const friendly = await buildSaveErrorMessage(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save endpoint success:', data);
            if (data.success) {
                markFormSaved();
                applyLocationSaveResponse(data);
                handleSavedPublication(data);

                if (isEditMode) {
                    showTemporaryMessage(saveRequest.successMessage, 'success');
                    if (saveButton) {
                        saveButton.textContent = originalText;
                        saveButton.disabled = false;
                    }
                    setTimeout(() => {
                        window.location.href = '/my-samples';
                    }, 900);
                    return;
                }

                // Show success message and options for next steps
                showIterationConfirmation();

                // Re-enable save button for potential future saves
                if (saveButton) {
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                }
            } else {
                // Show error message
                alert('Error: ' + data.message);
                if (saveButton) {
                    saveButton.textContent = originalText;
                    saveButton.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            const msg = (error && error.message) ? error.message : 'An error occurred while saving the data.';
            if (typeof showTemporaryMessage === 'function') {
                showTemporaryMessage(msg, 'error');
            } else {
                alert(msg);
            }
            if (saveButton) {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
            }
        });
    }

    // Handle packaging grid selection interface
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('option-item')) {
        const field = event.target.dataset.field;
        const value = event.target.dataset.value;
        const column = event.target.closest('.selection-column');

        // Remove selected class from all options in this column
        const allOptions = column.querySelectorAll('.option-item');
        allOptions.forEach(option => option.classList.remove('selected'));

        // Add selected class to clicked option
        event.target.classList.add('selected');

        // Find the corresponding hidden input and update its value
        const packagingItem = event.target.closest('.packaging-item');
        let hiddenInput;

        if (field === 'packaging_purpose') {
            hiddenInput = packagingItem.querySelector('.packaging-purpose-value');
        } else if (field === 'packaging_recycle_code') {
            hiddenInput = packagingItem.querySelector('.packaging-recycle-code-value');
        } else if (field === 'packaging_color_opacity') {
            hiddenInput = packagingItem.querySelector('.packaging-color-opacity-value');
        } else if (field === 'packaging_color') {
            hiddenInput = packagingItem.querySelector('.packaging-color-value');
        }

        if (hiddenInput) {
            hiddenInput.value = value;

            // Update formData and save to session
            const itemNumber = packagingItem.querySelector('.item-number').textContent;
            const fieldKey = `${field}_${itemNumber}`;
            formData[fieldKey] = value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            console.log(`Updated ${fieldKey} to: ${value}`);
        }
    }
});

// Function to restore selection state from form data
function restorePackagingSelections() {
    Object.keys(formData).forEach(key => {
        if (key.startsWith('packaging_') && key !== 'packaging_count') {
            const parts = key.split('_');
            if (parts.length >= 3) {
                const field = parts.slice(0, -1).join('_');
                const itemNumber = parts[parts.length - 1];
                const value = formData[key];

                // Find the corresponding option button and hidden input
                const packagingItems = document.querySelectorAll('.packaging-item');
                packagingItems.forEach(item => {
                    const itemNumberSpan = item.querySelector('.item-number');
                    if (itemNumberSpan && itemNumberSpan.textContent === itemNumber) {
                        // Find the option button with matching field and value
                        const optionButton = item.querySelector(`[data-field="${field}"][data-value="${value}"]`);
                        if (optionButton) {
                            // Remove selected from all options in this column
                            const column = optionButton.closest('.selection-column');
                            const allOptions = column.querySelectorAll('.option-item');
                            allOptions.forEach(option => option.classList.remove('selected'));

                            // Add selected to this option
                            optionButton.classList.add('selected');
                        }

                        // Update the hidden input
                        let hiddenInput;
                        if (field === 'packaging_purpose') {
                            hiddenInput = item.querySelector('.packaging-purpose-value');
                        } else if (field === 'packaging_recycle_code') {
                            hiddenInput = item.querySelector('.packaging-recycle-code-value');
                        } else if (field === 'packaging_color_opacity') {
                            hiddenInput = item.querySelector('.packaging-color-opacity-value');
                        } else if (field === 'packaging_color') {
                            hiddenInput = item.querySelector('.packaging-color-value');
                        }

                        if (hiddenInput) {
                            hiddenInput.value = value;
                        }
                    }
                });
            }
        }
    });
}
});

// Function to validate page 2 (sampling event information)
function validatePage2() {
    const devicePeriodRadio = document.querySelector('input[name="device_installation_period"]:checked');
    if (!devicePeriodRadio) {
        displayErrorMessage('Please select whether this sample came from a device installed for a period of time.');
        return false;
    }

    savePageData(2);
    const validation = validateSamplingEventDates(formData, { showErrors: true });
    if (!validation.ok) {
        displayErrorMessage(validation.issues[0]);
        return false;
    }

    const dataSourceIssues = getDataSourceIssues(formData);
    if (dataSourceIssues.length > 0) {
        displayErrorMessage(dataSourceIssues.join(' '));
        document.getElementById('publication-source-section')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return false;
    }

    return true;
}

// Helper function to show error messages
async function displayErrorMessage(message) {
    try {
        if (window.showErrorMessage && typeof window.showErrorMessage === 'function') {
            await window.showErrorMessage(message, 'Validation Error');
        } else {
            alert(message);
        }
    } catch (error) {
        console.error('Error showing error message:', error);
        alert(message);
    }
}

// Function to initialize device installation period radio button
function initializeDeviceInstallationPeriod() {
    console.log('Initializing device installation period radio button');

    // Check if we're on the correct page (page 2)
    const devicePeriodRadios = document.querySelectorAll('input[name="device_installation_period"]');
    if (devicePeriodRadios.length === 0) {
        console.log('Device installation period radios not found on this page');
        return;
    }

    // Check if any radio is already selected
    const checkedRadio = document.querySelector('input[name="device_installation_period"]:checked');

    if (!checkedRadio) {
        console.log('No device installation period radio selected, setting default to "no"');
        // Set default to "no" (single collection event)
        const noRadio = document.getElementById('device-period-no');
        if (noRadio) {
            noRadio.checked = true;
            console.log('Default radio button set to "no"');

            // Trigger change event to ensure UI is updated correctly
            const changeEvent = new Event('change', { bubbles: true });
            noRadio.dispatchEvent(changeEvent);
        }
    } else {
        console.log('Device installation period radio already selected:', checkedRadio.value);
    }
}

// Debug function to check session storage
window.debugFormData = function() {
    const data = JSON.parse(sessionStorage.getItem(formStorageKey) || '{}');
    console.log('Current form data in session storage:', data);
    console.log('formStorageKey:', formStorageKey);
    return data;
};

// Debug function to manually populate some test data
window.addTestData = function() {
    const testData = {
        'location_name': 'Test Location',
        'latitude': '42.3601',
        'longitude': '-71.0589',
        'start_year': '2025',
        'start_month': '6',
        'start_day': '18',
        'media_type': 'water',
        'sample_description': 'Test sample description'
    };

    const existingData = JSON.parse(sessionStorage.getItem(formStorageKey) || '{}');
    const mergedData = { ...existingData, ...testData };
    sessionStorage.setItem(formStorageKey, JSON.stringify(mergedData));
    console.log('Test data added:', mergedData);

    // Trigger summary generation
    if (window.generateSummary) {
        window.generateSummary();
    }
};

// Function to update sample amount unit options based on media type
function updateSampleAmountUnits(mediaType) {
    const unitSelects = document.querySelectorAll('.unit-select');

    unitSelects.forEach(select => {
        // Remove existing classes
        select.classList.remove('hide-water', 'hide-soil');

        // Reset visibility of all options
        const options = select.querySelectorAll('option');
        options.forEach(option => {
            option.style.display = '';
        });

        if (mediaType === 'water') {
            // For water samples, hide soil units
            select.classList.add('hide-soil');
            const soilOptions = select.querySelectorAll('.soil-unit:not(.area-unit)');
            soilOptions.forEach(option => {
                option.style.display = 'none';
            });
        } else if (mediaType === 'soil_sediment' || mediaType === 'in_soil' || mediaType === 'soil_litter') {
            // For soil/sediment samples, hide water units (except area)
            select.classList.add('hide-water');
            const waterOptions = select.querySelectorAll('.water-unit:not(.area-unit)');
            waterOptions.forEach(option => {
                option.style.display = 'none';
            });
        } else if (mediaType === 'mixed_composite') {
            // For mixed media, show all options
            // No hiding needed
        }
    });
}

// Add event listeners for count inputs to show/hide sample amount containers
document.addEventListener('input', function(event) {
    if (event.target.id === 'microplastics-count') {
        const count = parseInt(event.target.value) || 0;
        const container = document.getElementById('microplastics-amount-container');
        if (container) {
            container.style.display = count > 0 ? 'block' : 'none';
        }
    } else if (event.target.id === 'fragments-count') {
        const count = parseInt(event.target.value) || 0;
        const container = document.getElementById('fragments-amount-container');
        if (container) {
            container.style.display = count > 0 ? 'block' : 'none';
        }
    }        // Save sample amount data and polymer type data to session storage
        if (event.target.name && (
            event.target.name.includes('sample_amount') ||
            event.target.name.includes('sample_unit') ||
            event.target.name.includes('method_polymer') ||
            event.target.name.includes('method_percent') ||
            event.target.name.includes('mass_') ||
            event.target.name.includes('soil_texture') ||
            event.target.name.includes('mp_polymer_') ||
            event.target.name.includes('fragment_polymer_') ||
            event.target.name.includes('mp_estimate_method') ||
            event.target.name.includes('fragment_estimate_method')
        )) {
            const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
            formData[event.target.name] = event.target.value;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
});
