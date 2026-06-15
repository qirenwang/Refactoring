// Form-handler.js - Handles multi-page form functionality and session storage
// Author: [Your Name]
// Date: May 18, 2025

// Global variables
let currentPage = 1;
let loadedPages = 1; // Track how many pages have been loaded
let formData = {};
const formStorageKey = 'microplastics_form_data';
let isPageInitialLoad = true; // Flag to track if this is initial page load/refresh

const PACKAGING_DETAIL_GROUPS = {
    recycle: ['1', '2', '3', '4', '5', '6', '7', '0'],
    color: ['clear', 'black', 'blue', 'green', 'pink', 'purple', 'red', 'white', 'yellow', 'other'],
    opacity: ['clear', 'light', 'dark', 'mixed']
};

const PACKAGING_DETAIL_LABELS = {
    recycle: 'Recycle codes total',
    color: 'Color total',
    opacity: 'Opacity total'
};

const PACKAGING_CATEGORY_CONFIG = [
    { prefix: 'single_use', countField: 'packaging_count_single_use', label: 'Single-Use Food/Beverage Container' },
    { prefix: 'multi_use', countField: 'packaging_count_multi_use', label: 'Multi-Use Food/Beverage Container' },
    { prefix: 'other_container', countField: 'packaging_count_other_container', label: 'Other Container' },
    { prefix: 'bag', countField: 'packaging_count_bag', label: 'Bag' },
    { prefix: 'packing', countField: 'packaging_count_packing', label: 'Packing Materials' },
    { prefix: 'other_purpose', countField: 'packaging_count_other', label: 'Other Purpose' },
    { prefix: 'unknown_purpose', countField: 'packaging_count_unknown', label: 'Unknown Purpose' }
];

let runWholePackageValidation = () => {};
let referenceDataCache = null;
let referenceDataPromise = null;
let publicationsCache = null;
let publicationsPromise = null;
const publicationCarryForwardKey = 'microplastics_publication_by_location';

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

function isHiddenLegacyField(element) {
    return !!element.closest('#legacy-lulc, #legacy-raman, #legacy-package-validation');
}

function hasPublicationSource(state = {}) {
    const selected = state.publication_id_num || state.publication_id || state.publicationId;
    const newFields = [
        state.publication_year,
        state.publication_authors,
        state.publication_journal,
        state.publication_full_citation_apa,
        state.publication_pub_source_code
    ];
    return !!selected || newFields.every(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function hasDebrisDetailData(state = {}) {
    const detailRows = [
        ...(Array.isArray(state.fragments_color_details) ? state.fragments_color_details : []),
        ...(Array.isArray(state.fragments_form_details) ? state.fragments_form_details : []),
        ...(Array.isArray(state.fragments_opacity_details) ? state.fragments_opacity_details : []),
        ...(Array.isArray(state.fragments_purpose_details) ? state.fragments_purpose_details : [])
    ];

    return detailRows.length > 0 ||
        Object.keys(state).some(key => key.startsWith('fragment_polymer_') && parseFloat(state[key]) > 0) ||
        !!state.fragments_method_polymer_num ||
        !!state.fragments_method_polymer_other ||
        !!state.fragments_method_percent_estimate;
}

function normalizeRefCode(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function mapReferenceOptions(refKey) {
    const data = referenceDataCache || {};

    if (refKey === 'colors') {
        return (data.colors || []).map(item => ({
            id: item.ColorUniqueID,
            code: item.Color_Code,
            label: item.Color_Name || item.Color_Code
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
        publicationsPromise = fetch('/api/publications')
            .then(response => response.json())
            .then(payload => {
                if (!payload.success) {
                    throw new Error(payload.message || 'Could not load publications');
                }
                publicationsCache = payload.data || [];
                return publicationsCache;
            })
            .catch(error => {
                publicationsPromise = null;
                console.error('Error loading publications:', error);
                throw error;
            });
    }
    return publicationsPromise;
}

function populateSelectOptions(select, options, placeholder) {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.dataset.code = option.code || '';
        optionElement.textContent = option.label || option.code || option.id;
        select.appendChild(optionElement);
    });
    if (currentValue) {
        select.value = currentValue;
    }
}

function populateReferenceDrivenControls() {
    if (!referenceDataCache) return;

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

    document.querySelectorAll('.publication-source-select').forEach(select => {
        const options = (referenceDataCache.pubSources || []).map(item => ({
            id: item.PubSourceUniqueID,
            code: item.PubSourceUniqueID,
            label: item.PubSourceLabel
        }));
        populateSelectOptions(select, options, '-- Select Source Type --');
    });

    restoreDetailRowsFromFormData();
}

async function initializeReferenceData() {
    try {
        await Promise.all([loadReferenceData(), loadPublications()]);
        populateReferenceDrivenControls();
        populatePublicationControls();
        applyPublicationCarryForward();
        window.loadPolymerOptions();
    } catch (error) {
        console.error('Reference initialization failed:', error);
    }
}

function populatePublicationControls() {
    document.querySelectorAll('.publication-select').forEach(select => {
        const currentValue = select.value || formData.publication_id_num || '';
        select.innerHTML = '<option value="">-- Select Publication --</option>';
        (publicationsCache || []).forEach(publication => {
            const option = document.createElement('option');
            option.value = publication.publication_id_num;
            option.textContent = `${publication.publication_year} - ${publication.publication_authors}`;
            option.dataset.citation = publication.publication_full_citation_apa || '';
            select.appendChild(option);
        });
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

function getPublicationCarryForwardStore() {
    try {
        return JSON.parse(sessionStorage.getItem(publicationCarryForwardKey) || '{}');
    } catch (_) {
        return {};
    }
}

function rememberPublicationForLocation() {
    const locationId = formData.location_id || document.getElementById('location-select')?.value;
    if (!locationId) return;

    const publicationFields = [
        'publication_id_num',
        'publication_year',
        'publication_authors',
        'publication_journal',
        'publication_full_citation_apa',
        'publication_pub_source_code'
    ];
    const publicationData = {};
    publicationFields.forEach(field => {
        if (formData[field]) {
            publicationData[field] = formData[field];
        }
    });

    if (Object.keys(publicationData).length === 0) return;

    const store = getPublicationCarryForwardStore();
    store[locationId] = publicationData;
    sessionStorage.setItem(publicationCarryForwardKey, JSON.stringify(store));
}

function applyPublicationCarryForward() {
    const locationId = formData.location_id || document.getElementById('location-select')?.value;
    if (!locationId) return;

    const store = getPublicationCarryForwardStore();
    const publicationData = store[locationId];
    if (!publicationData) return;

    Object.entries(publicationData).forEach(([field, value]) => {
        if (formData[field]) return;
        formData[field] = value;
        document.querySelectorAll(`[name="${field}"]`).forEach(element => {
            element.value = value;
        });
    });
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
}

function handleSavedPublication(data) {
    if (!data || !data.publicationId) return;
    formData.publication_id_num = String(data.publicationId);
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
    percent.step = '0.01';
    percent.placeholder = 'percent';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'detail-remove-row';
    remove.textContent = 'x';
    remove.setAttribute('aria-label', 'Remove row');

    row.appendChild(select);
    row.appendChild(percent);
    row.appendChild(remove);
    container.appendChild(row);

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

    const options = mapReferenceOptions(section.dataset.refKey);
    const selectedValues = Array.from(container.querySelectorAll('.detail-ref-select'))
        .map(select => select.value)
        .filter(Boolean);

    container.querySelectorAll('.detail-ref-select').forEach(select => {
        const current = select.value;
        select.innerHTML = '<option value="">-- Select --</option>';
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.id;
            optionElement.dataset.code = option.code || '';
            optionElement.textContent = option.label || option.code || option.id;
            optionElement.disabled = selectedValues.includes(String(option.id)) && current !== String(option.id);
            select.appendChild(optionElement);
        });
        select.value = current;
    });

    updateDetailTotal(tableId);
}

function updateDetailTotal(tableId) {
    const container = document.getElementById(tableId);
    const totalElement = document.querySelector(`[data-total-for="${tableId}"]`);
    if (!container || !totalElement) return 0;

    const total = Array.from(container.querySelectorAll('.detail-percent-input'))
        .reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);

    totalElement.textContent = `Total: ${total.toFixed(2).replace(/\.00$/, '')}%`;
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
        .filter(row => row.ref_num && row.percent !== null && !Number.isNaN(row.percent));
}

function syncDetailRowsToFormData() {
    DETAIL_TABLES.forEach(tableId => {
        const rows = collectDetailRows(tableId);
        if (rows.length > 0) {
            formData[tableId] = rows;
        } else {
            delete formData[tableId];
        }
    });
    sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
    return formData;
}

function restoreDetailRowsFromFormData() {
    DETAIL_TABLES.forEach(tableId => {
        const container = document.getElementById(tableId);
        const rows = Array.isArray(formData[tableId]) ? formData[tableId] : [];
        if (!container || rows.length === 0 || container.querySelector('.detail-percent-row')) return;
        rows.forEach(row => createDetailRow(tableId, row));
        updateDetailSectionOptions(tableId);
    });
}

window.collectDetailRows = collectDetailRows;
window.syncDetailRowsToFormData = syncDetailRowsToFormData;

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
                <label class="form-label">${polymer.Polymer_Code} - ${polymer.Polymer_FullName || polymer.Polymer_Code}:</label>
                <input type="number" name="${fieldName}" class="form-input" placeholder="percentage" min="0" max="100">
            `;
            const input = row.querySelector('input');
            if (input && formData[fieldName] !== undefined) {
                input.value = formData[fieldName];
            }
            container.appendChild(row);
        });
        container.dataset.loaded = 'true';
    };

    render('mp-polymer-dynamic-container', 'mp_polymer_');
    render('fragment-polymer-dynamic-container', 'fragment_polymer_');
};

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

// Build a user-friendly save error message for non-technical users
function buildFriendlySaveError(status, data, currentFormState = {}) {
    // Prefer server-provided details when present
    const serverMsg = data && (data.message || data.error);
    const serverErrors = Array.isArray(data && data.errors) ? data.errors : [];

    // Special cases with actionable guidance
    if (status === 400) {
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
                return 'Could not save: You entered a new location but it has not been saved yet. Please go to Page 1 and click "Continue" to save the new location, or select a previous location from the dropdown.';
            }
            return 'Could not save: Please select a location on Page 1 (either choose a previous location or enter and save a new one).';
        }

        // Missing sample date or media type
        if (serverMsg && (serverMsg.toLowerCase().includes('sample date') || serverMsg.toLowerCase().includes('media type'))) {
            return 'Could not save: Please fill required fields on Page 2 — Sample Date and Media Type.';
        }

        // Percentage or package validation failures
        if (serverMsg && serverMsg.toLowerCase().includes('percentage validation failed')) {
            return 'Could not save: One or more percentage groups must total 100%. Please review the percentages shown and adjust them to sum to 100%.';
        }
        if (serverMsg && serverMsg.toLowerCase().includes('package validation failed')) {
            return 'Could not save: Package counts are inconsistent. Ensure all purpose-category counts equal the Whole Packages total, and any filled detail group sums match the category total.';
        }

        // Generic 400 with server field errors
        if (serverErrors.length > 0) {
            const details = serverErrors.map(e => e.msg || e.message).filter(Boolean).slice(0, 3);
            return 'Could not save: Some fields need attention. ' + details.join('; ');
        }

        // Fallback for 400
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

// Lightweight pre-submit validation to catch common issues before calling the API
function preValidateBeforeSubmit(state) {
    if (typeof syncDetailRowsToFormData === 'function') {
        syncDetailRowsToFormData();
        Object.assign(state, formData);
    }

    const issues = [];

    // Location must exist (either selected or saved new location)
    if (!state.location_id) {
        const newLocationEntered = !!(
            state.location_name || state.location_shortcode || state.location_description ||
            state.latitude || state.longitude || state.streetaddress || state.city ||
            state.state || state.country || state.zip_code
        );
        if (newLocationEntered) {
            issues.push('Please go to Page 1 and click "Continue" to save the new location, or clear those fields and select a previous location.');
        } else {
            issues.push('Please select a location on Page 1.');
        }
    }

    // Page 2 required fields.
    // For a device-period sample the primary date is the device start date;
    // otherwise it's the single collection date.
    const isDevicePeriod = state.device_installation_period === 'yes';
    if (isDevicePeriod) {
        if (!state.device_start_date) {
            issues.push('Please enter the Device Installation Start Date on Page 2.');
        }
        if (!state.device_end_date) {
            issues.push('Please enter the Device Removal/End Date on Page 2.');
        }
    } else if (!state.sample_date) {
        issues.push('Please enter Sample Date on Page 2.');
    }
    if (!state.media_type) {
        issues.push('Please select Media Type on Page 2.');
    }
    // Publication is optional. Only require complete details when the user opted in.
    if (state.publication_present === 'yes' && !hasPublicationSource(state)) {
        issues.push('Please select or enter a publication source, or choose "No".');
    }

    if ((state.total_sample_amount && !state.sample_unit) || (!state.total_sample_amount && state.sample_unit)) {
        issues.push('Total Sample Amount and Sample Unit must be entered together.');
    }

    const debrisCount = (parseFloat(state.fragments_count) || 0) + (parseFloat(state.packaging_count) || 0);
    const debrisMass = parseFloat(state.fragments_mass_debris_total) || 0;
    if (state.has_quantitative_data === 'yes' && hasDebrisDetailData(state) && debrisCount <= 0 && debrisMass <= 0) {
        issues.push('Enter at least a count or a mass for debris.');
    }

    DETAIL_TABLES.forEach(tableId => {
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

    const hasMicroPolymerRows = Object.keys(state).some(key => key.startsWith('mp_polymer_') && parseFloat(state[key]) > 0);
    if (hasMicroPolymerRows && !state.micro_method_polymer_num) {
        issues.push('Microplastics polymer percentages require a Polymer ID Method.');
    }
    if (hasMicroPolymerRows && !state.micro_method_percent_estimate) {
        issues.push('Microplastics polymer percentages require a percent-estimation method.');
    }

    const hasFragmentPolymerRows = Object.keys(state).some(key => key.startsWith('fragment_polymer_') && parseFloat(state[key]) > 0);
    if (hasFragmentPolymerRows && !state.fragments_method_polymer_num) {
        issues.push('Fragments polymer percentages require a Polymer ID Method.');
    }
    if (hasFragmentPolymerRows && !state.fragments_method_percent_estimate) {
        issues.push('Fragments polymer percentages require a percent-estimation method.');
    }

    return { ok: issues.length === 0, issues };
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

    // Option 2: New location fields
    const locationName = document.getElementById('location-name')?.value?.trim() || '';
    const locationShortCode = document.getElementById('location-shortcode')?.value?.trim() || '';
    const locationDescription = document.getElementById('location-description')?.value?.trim() || '';
    const latitude = document.getElementById('latitude')?.value?.trim() || '';
    const longitude = document.getElementById('longitude')?.value?.trim() || '';
    const streetAddress = document.querySelector('input[name="streetaddress"]')?.value?.trim() || '';
    const city = document.querySelector('input[name="city"]')?.value?.trim() || '';
    const state = document.querySelector('input[name="state"]')?.value?.trim() || '';
    const country = document.querySelector('input[name="country"]')?.value?.trim() || '';
    const zipCode = document.querySelector('input[name="zip_code"]')?.value?.trim() || '';
    const acres = document.getElementById('acres')?.value?.trim() || '';

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

    // If Option 1 is not selected, validate Option 2
    if (!locationName) {
        return {
            isValid: false,
            message: 'A location name is required for new locations. Or select an existing location to continue.'
        };
    }

    if (!locationShortCode) {
        return {
            isValid: false,
            message: 'Location short code is required for new locations.'
        };
    }

    if (!locationDescription) {
        return {
            isValid: false,
            message: 'Location description is required for new locations.'
        };
    }

    // Check if at least one location group is provided
    const hasCoordinates = latitude && longitude;
    const hasAddress = streetAddress && city && state && country;
    const hasZipCode = zipCode;

    if (!hasCoordinates && !hasAddress && !hasZipCode) {
        return {
            isValid: false,
            message: 'Please provide either coordinates, complete address, or zip code for the new location.'
        };
    }

    // Validate coordinates if provided
    if (latitude || longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return {
                isValid: false,
                message: 'Please provide valid coordinates (latitude: -90 to 90, longitude: -180 to 180).'
            };
        }
    }

    return {
        isValid: true,
        isExistingLocation: false,
        locationData: {
            locationName,
            locationShortCode,
            locationDescription,
            latitude: latitude || null,
            longitude: longitude || null,
            streetAddress: streetAddress || null,
            city: city || null,
            state: state || null,
            country: country || null,
            zipCode: zipCode || null,
            acres: acres || null
        }
    };
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
            // Save the selection to form data
            formData['location_id'] = locationData.locationId;
            formData['location_type'] = 'existing';

            const overrides = locationData.locationOverrides;
            if (overrides) {
                if (overrides.description) {
                    formData['event_location_description'] = overrides.description;
                } else {
                    delete formData['event_location_description'];
                }

                if (overrides.latitude && overrides.longitude) {
                    formData['event_latitude'] = overrides.latitude;
                    formData['event_longitude'] = overrides.longitude;
                } else {
                    delete formData['event_latitude'];
                    delete formData['event_longitude'];
                }
            } else {
                delete formData['event_location_description'];
                delete formData['event_latitude'];
                delete formData['event_longitude'];
            }

            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Clear any validation errors
            clearValidationError();
            proceedToNextPage();
        }
    } catch (error) {
        console.error('Error in location confirmation:', error);
        window.showErrorMessage('An error occurred while confirming the location selection.');
    }
}

async function showNewLocationConfirmation(locationData) {
    const data = locationData.locationData;
      const locationDetails = {
        name: data.locationName,
        shortcode: data.locationShortCode,
        description: data.locationDescription,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.streetAddress ? `${data.streetAddress}, ${data.city}, ${data.state}, ${data.country}` : '',
        zipcode: data.zipCode
    };

    try {
        const confirmed = await window.showNewLocationConfirmationModal(locationDetails);

        if (confirmed) {
            await saveNewLocationAndProceed(locationData);
        }
    } catch (error) {
        console.error('Error in new location confirmation:', error);
        window.showErrorMessage('An error occurred while confirming the new location details.');
    }
}

async function saveNewLocationAndProceed(locationData) {
    const continueButton = document.getElementById('page1-continue');
    const originalText = continueButton.textContent;

    try {
        // Show progress modal
        window.showProgress('Saving New Location', 'Please wait while we save your new location...');

        // Disable button
        continueButton.disabled = true;

        // Clear any validation errors
        clearValidationError();

        // Send data to server
        const response = await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(locationData.locationData)
        });

        const data = await response.json();

        // Hide progress modal
        window.hideProgress();

        if (data.success) {
            // Save the new location ID to form data
            formData['location_id'] = data.locationId;
            formData['location_type'] = 'new';
            formData['location_name'] = locationData.locationData.locationName;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Show success message with fancy modal
            await window.showSuccessMessage(`Location "${locationData.locationData.locationName}" has been saved successfully!`);

            // Refresh the location dropdown for future use
            if (typeof fetchLocations === 'function') {
                fetchLocations();
            }

            // Proceed to next page
            proceedToNextPage();

        } else {
            // Show error message with fancy modal
            await window.showErrorMessage('Failed to save location: ' + (data.message || 'Unknown error'));
            continueButton.disabled = false;
        }
    } catch (error) {
        console.error('Error saving location:', error);
        window.hideProgress();
        await window.showErrorMessage('Error connecting to server. Please try again.');
        continueButton.disabled = false;
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

        // Special handling for location select - don't overwrite the stored
        // location ID when the user added a new location (option 2).
        if (element.name === 'location_id') {
            const value = element.value?.trim() || '';
            if (value) {
                formData[element.name] = value;
            } else if (formData.location_type !== 'new') {
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

// Function to scroll to a specific page
function scrollToPage(pageNumber) {
    const targetPage = document.getElementById(`form-page${pageNumber}`);
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
function updatePage2Content() {
    // Update any dynamic content based on location selection
    if (formData.location_id) {
        console.log('Updating page 2 based on location:', formData.location_id);
    }
    initializeReferenceData();
    applyPublicationCarryForward();
    syncPage2SectionVisibility();
}

// Keep the device-period and publication sections in sync with the stored
// form data when page 2 is restored (re-checking a radio does not fire change).
function syncPage2SectionVisibility() {
    // Device installation period section visibility
    const isDevicePeriod = formData.device_installation_period === 'yes';
    const singleSection = document.getElementById('single-collection-section');
    const deviceSection = document.getElementById('device-period-section');
    if (singleSection && deviceSection) {
        singleSection.style.display = isDevicePeriod ? 'none' : 'block';
        deviceSection.style.display = isDevicePeriod ? 'block' : 'none';
    }

    // Publication source section visibility. Default to "No" unless the user
    // selected "Yes" or publication data has been carried forward.
    const hasPubData = !!(formData.publication_id_num || formData.publication_year ||
        formData.publication_authors || formData.publication_journal ||
        formData.publication_full_citation_apa || formData.publication_pub_source_code);
    const showPublication = formData.publication_present === 'yes' || hasPubData;
    if (showPublication) {
        formData.publication_present = 'yes';
    }
    const yesRadio = document.querySelector('input[name="publication_present"][value="yes"]');
    const noRadio = document.querySelector('input[name="publication_present"][value="no"]');
    if (yesRadio && noRadio) {
        yesRadio.checked = showPublication;
        noRadio.checked = !showPublication;
    }
    const publicationFields = document.getElementById('publication-source-fields');
    if (publicationFields) {
        publicationFields.style.display = showPublication ? 'block' : 'none';
    }
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
    const fragmentsCount = parseInt(currentFormData['fragments_count']) || 0;
    const fragmentsDetails = document.getElementById('fragments-details');
    const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
    if (fragmentsDetails) {
        fragmentsDetails.style.display = fragmentsCount > 0 ? 'block' : 'none';
        console.log('Fragments details section:', fragmentsCount > 0 ? 'shown' : 'hidden');
    }
    if (fragmentsAmountContainer) {
        fragmentsAmountContainer.style.display = fragmentsCount > 0 ? 'block' : 'none';
    }

    // Update packaging details section and sample amount
    const packagingCount = parseInt(currentFormData['packaging_count']) || 0;
    const packagingDetails = document.getElementById('packaging-details');
    const packagingAmountContainer = document.getElementById('packaging-amount-container');
    if (packagingDetails) {
        packagingDetails.style.display = packagingCount > 0 ? 'block' : 'none';

        // If packaging count > 0, update the packaging items
        if (packagingCount > 0 && typeof window.updatePackagingItems === 'function') {
            window.updatePackagingItems(packagingCount);
        }
        console.log('Packaging details section:', packagingCount > 0 ? 'shown' : 'hidden');
    }
    if (packagingAmountContainer) {
        packagingAmountContainer.style.display = packagingCount > 0 ? 'block' : 'none';
    }
    if (typeof window.updateAllPackagingDetailsVisibility === 'function') {
        window.updateAllPackagingDetailsVisibility();
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

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== Form-handler.js DOMContentLoaded ===');

    // Initialize form data from session storage or create new object
    formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};

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

    // Set up packaging count handler - call only once
    setupPackagingCountHandler();

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

        // Function to handle "Back to New Media" action
        function handleBackToNewMedia() {
            // Show confirmation dialog
            const confirmed = confirm(
                'Are you sure you want to go back to media selection?\n\n' +
                'This will:\n' +
                '• Clear all currently entered data\n' +
                '• Reset all validation states\n' +
                '• Return to the media type selection page\n\n' +
                'Click OK to continue or Cancel to stay on this page.'
            );

            if (!confirmed) {
                return;
            }

            console.log('Back to New Media: Clearing data and returning to media selection');

            // 1. Clear all form data
            clearAllFormData();

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
            showTemporaryMessage('Returned to media selection. All data has been cleared.', 'info');

            // 6. Clear any selected media types
            setTimeout(() => {
                clearMediaTypeSelections();
            }, 500);
        }

        // Function to clear all form data completely
        function clearAllFormData() {
            // Clear global formData object
            formData = {};

            // Clear session storage
            sessionStorage.removeItem(formStorageKey);

            // Clear all form fields in all pages
            clearAllFormFields();

            console.log('All form data cleared');
        }

        // Function to reset all validation states
        function resetAllValidationStates() {
            // Reset percentage validation displays
            const percentageContainers = document.querySelectorAll('.percentage-validation-container');
            percentageContainers.forEach(container => {
                container.remove();
            });

            // Reset whole package validation displays
            const packageContainers = document.querySelectorAll('.whole-package-validation-container');
            packageContainers.forEach(container => {
                container.remove();
            });

            // Reset submit button states
            const submitButtons = document.querySelectorAll('.btn-continue, #save-button, .btn-submit');
            submitButtons.forEach(button => {
                button.disabled = false;
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

            if (locationNameInput) locationNameInput.value = selectedName;
            if (locationShortCodeInput) locationShortCodeInput.value = selectedShortCode;
            if (locationDescriptionInput) locationDescriptionInput.value = selectedDescription;
            if (latitudeInput) latitudeInput.value = selectedLatitude;
            if (longitudeInput) longitudeInput.value = selectedLongitude;
            if (cityInput) cityInput.value = selectedCity;
            if (stateInput) stateInput.value = selectedState;
            if (zipInput) zipInput.value = selectedZip;

            syncLocationMapFromInputs({ zoom: 13 });

            formData['location_name'] = selectedName;
            formData['location_shortcode'] = selectedShortCode;
            formData['location_description'] = selectedDescription;
            formData['latitude'] = selectedLatitude;
            formData['longitude'] = selectedLongitude;
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
            delete formData['event_location_description'];
            delete formData['event_latitude'];
            delete formData['event_longitude'];
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }

        function handleLocationSelectionChange() {
            const selectedLocationId = locationSelect.value;

            if (selectedLocationId && selectedLocationId !== '') {
                console.log('Previous location selected:', selectedLocationId);
                clearValidationError();
                populateFieldsFromSelectedLocation();
                setExistingLocationMode();
            } else {
                console.log('No previous location selected');
                setNewLocationMode();
            }
        }

        // Set up event listener
        locationSelect.addEventListener('change', function() {
            handleLocationSelectionChange();

            // Clear all form data from pages 2-6 when location changes
            clearDataFromPages2to6();
        });

        // Function to clear all data from pages 2-6 when location changes
        function clearDataFromPages2to6() {
            console.log('Clearing all data from pages 2-6 due to location change');

            // Define all fields from pages 2-6 to clear
            const fieldsToClean = [
                // Existing location override info
                'event_location_description', 'event_latitude', 'event_longitude',
                'existing_location_description', 'existing_location_latitude', 'existing_location_longitude',

                // Page 2: Sampling Event Information
                'device_installation_period', 'sample_date', 'device_start_date', 'device_end_date',
                'sample_time', 'sample_description',

                // Page 3: Media Information
                'media_type', 'water_type', 'water_type_other_description',
                'sediment_type', 'sediment_type_other_description',
                'soil_landscape_type', 'surface_landscape_type', 'mixed_media_description',

                // Page 4: Additional Sampling Information
                'additional_info', 'air_temp', 'current_conditions', 'rainfall', 'environment_type',
                'volume_sampled', 'total_water_depth', 'sample_water_depth',
                'water_flow_velocity', 'turbidity', 'total_suspended_solids',
                'dissolved_oxygen',
                'soil_depth', 'soil_sample_dry_weight', 'soil_organic_matter', 'soil_moisture',
                'soil_sand', 'soil_silt', 'soil_clay', 'soil_additional_notes',
                'sediment_depth', 'sediment_dry_weight', 'sediment_organic_matter', 'sediment_moisture',
                'sediment_sand', 'sediment_silt', 'sediment_clay', 'sediment_additional_notes',
                'surface_area_sampled', 'permeable_surfaces', 'impermeable_surfaces', 'surface_additional_notes',
                'mixed_additional_notes',

                // Page 5: Sample Details
                'has_quantitative_data', 'replicates_count',
                'microplastics_count', 'fragments_count', 'packaging_count',
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

            // Clear from formData
            fieldsToClean.forEach(field => {
                delete formData[field];
            });

            // Save to sessionStorage
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Clear visual form fields in pages 2-6
            for (let pageNum = 2; pageNum <= 6; pageNum++) {
                const page = document.getElementById(`form-page${pageNum}`);
                if (page) {
                    const fields = page.querySelectorAll('input, select, textarea');
                    fields.forEach(field => {
                        if (field.type === 'radio' || field.type === 'checkbox') {
                            field.checked = false;
                        } else {
                            field.value = '';
                        }
                    });
                }
            }

            console.log('All data from pages 2-6 cleared');
        }

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

    // Function to set up Whole Package hierarchical validation
    function setupWholePackageValidation() {
        console.log('Setting up whole package validation');

        // Ensure validation display exists when page 5 is rendered dynamically.
        ensureWholePackageValidationDisplay();

        const formPagesContainer = document.querySelector('.form-pages-container') || document.body;
        const packageValidationObserver = new MutationObserver(() => {
            if (!document.getElementById('whole-package-validation') && ensureWholePackageValidationDisplay()) {
                validateWholePackageHierarchy();
            }
        });

        packageValidationObserver.observe(formPagesContainer, { childList: true, subtree: true });

        // Add input event listeners for real-time validation
        document.addEventListener('input', function(event) {
            const fieldName = event.target.name;

            // Check if this field belongs to whole package validation
            if (isWholePackageField(fieldName)) {
                validateWholePackageHierarchy();
            }
        });

        // Function to check if a field belongs to whole package validation
        function isWholePackageField(fieldName) {
            if (!fieldName) return false;

            if (fieldName === 'packaging_count') {
                return true;
            }

            return PACKAGING_CATEGORY_CONFIG.some(cfg => {
                if (fieldName === cfg.countField) return true;
                return fieldName.startsWith(`${cfg.prefix}_`);
            });
        }

        function ensureWholePackageValidationDisplay() {
            const packageCountField = document.querySelector('[name="packaging_count"]');
            if (!packageCountField) return false;
            createWholePackageValidationDisplay();
            return true;
        }

        // Function to create validation display
        function createWholePackageValidationDisplay() {
            if (document.getElementById('whole-package-validation')) {
                return;
            }

            const packageCountField = document.querySelector('[name="packaging_count"]');
            if (!packageCountField) return;

            const parentSection = packageCountField.closest('.count-section');
            if (!parentSection) return;

            // Create validation container
            const validationContainer = document.createElement('div');
            validationContainer.className = 'whole-package-validation-container';
            validationContainer.id = 'whole-package-validation';
            validationContainer.innerHTML = `
                <div class="package-validation-summary">
                    <h5 style="margin: 10px 0; color: #495057;">Package Count Validation</h5>
                    <div class="validation-row">
                        <span class="validation-label">Whole Packages Total:</span>
                        <span class="validation-value" id="whole-packages-total">0</span>
                    </div>
                    <div class="validation-row">
                        <span class="validation-label">All Purpose Categories Total:</span>
                        <span class="validation-value" id="single-multi-total">0</span>
                        <span class="validation-status" id="main-total-status"></span>
                    </div>
                    <div class="validation-details">
                        <div class="validation-subgroup">
                            <div class="validation-row">
                                <span class="validation-label">Single-use Total:</span>
                                <span class="validation-value" id="single-use-total">0</span>
                            </div>
                            <div class="validation-row">
                                <span class="validation-label">Single-use Recycle Codes Sum:</span>
                                <span class="validation-value" id="single-use-recycle-sum">0</span>
                                <span class="validation-status" id="single-use-status"></span>
                            </div>
                        </div>
                        <div class="validation-subgroup">
                            <div class="validation-row">
                                <span class="validation-label">Multi-use Total:</span>
                                <span class="validation-value" id="multi-use-total">0</span>
                            </div>
                            <div class="validation-row">
                                <span class="validation-label">Multi-use Recycle Codes Sum:</span>
                                <span class="validation-value" id="multi-use-recycle-sum">0</span>
                                <span class="validation-status" id="multi-use-status"></span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Insert validation container after the packaging count field
            parentSection.appendChild(validationContainer);
        }

        // Function to validate the whole package hierarchy
        function validateWholePackageHierarchy() {
            ensureWholePackageValidationDisplay();

            const wholePackagesTotal = parseInt(document.querySelector('[name="packaging_count"]')?.value || 0);

            const categoryResults = PACKAGING_CATEGORY_CONFIG.map(cfg => {
                const countValue = parseInt(document.querySelector(`[name="${cfg.countField}"]`)?.value || 0);
                const groupSums = {};
                const groupStates = {};
                const errorMessages = [];

                Object.keys(PACKAGING_DETAIL_GROUPS).forEach(groupKey => {
                    const groupData = calculateGroupSum(cfg.prefix, groupKey);
                    groupSums[groupKey] = groupData;

                    const validation = evaluateGroupAgainstCount(countValue, groupKey, groupData);
                    groupStates[groupKey] = {
                        key: groupKey,
                        label: PACKAGING_DETAIL_LABELS[groupKey] || groupKey,
                        sum: groupData.sum,
                        hasValues: groupData.hasValues,
                        hasAnyField: groupData.hasAnyField,
                        isValid: validation.isValid
                    };

                    if (!validation.isValid) {
                        errorMessages.push(validation.message);
                    }
                });

                setCategoryValidationState(cfg.prefix, countValue, groupStates, errorMessages);

                return {
                    prefix: cfg.prefix,
                    label: cfg.label,
                    count: countValue,
                    groupSums,
                    groupStates,
                    errorMessages,
                    isValid: errorMessages.length === 0
                };
            });

            const singleResult = categoryResults.find(res => res.prefix === 'single_use') || { count: 0, groupSums: {}, errorMessages: [], isValid: true };
            const multiResult = categoryResults.find(res => res.prefix === 'multi_use') || { count: 0, groupSums: {}, errorMessages: [], isValid: true };

            const singleUseRecycleSum = singleResult.groupSums?.recycle?.sum || 0;
            const multiUseRecycleSum = multiResult.groupSums?.recycle?.sum || 0;

            const wholePackagesTotalEl = document.getElementById('whole-packages-total');
            if (wholePackagesTotalEl) wholePackagesTotalEl.textContent = wholePackagesTotal;

            const allCategoriesTotal = categoryResults.reduce((sum, result) => sum + result.count, 0);

            const singleMultiTotalEl = document.getElementById('single-multi-total');
            if (singleMultiTotalEl) singleMultiTotalEl.textContent = allCategoriesTotal;

            const singleUseTotalEl = document.getElementById('single-use-total');
            if (singleUseTotalEl) singleUseTotalEl.textContent = singleResult.count;

            const multiUseTotalEl = document.getElementById('multi-use-total');
            if (multiUseTotalEl) multiUseTotalEl.textContent = multiResult.count;

            const singleUseRecycleSumEl = document.getElementById('single-use-recycle-sum');
            if (singleUseRecycleSumEl) singleUseRecycleSumEl.textContent = singleUseRecycleSum;

            const multiUseRecycleSumEl = document.getElementById('multi-use-recycle-sum');
            if (multiUseRecycleSumEl) multiUseRecycleSumEl.textContent = multiUseRecycleSum;

            const mainTotalValid = allCategoriesTotal === wholePackagesTotal;
            updateValidationStatus(
                'main-total-status',
                mainTotalValid,
                mainTotalValid ? '✓ Totals match' : '✗ Sum of all purpose categories must equal Whole Packages total'
            );

            const singleUseMessage = buildCategorySummaryMessage(singleResult, '(No Single-Use items)');
            updateValidationStatus('single-use-status', singleResult.isValid, singleUseMessage);

            const multiUseMessage = buildCategorySummaryMessage(multiResult, '(No Multi-Use items)');
            updateValidationStatus('multi-use-status', multiResult.isValid, multiUseMessage);

            const categoryTotalsValid = categoryResults.every(result => result.isValid || result.count === 0);
            const allValid = mainTotalValid && categoryTotalsValid;
            updateSubmitButtonForPackageValidation(allValid);
        }

        function calculateGroupSum(prefix, groupKey) {
            const suffixes = PACKAGING_DETAIL_GROUPS[groupKey] || [];
            let sum = 0;
            let hasValues = false;
            let hasAnyField = false;

            suffixes.forEach(suffix => {
                const field = document.querySelector(`[name="${prefix}_${groupKey}_${suffix}"]`);
                if (!field) return;
                hasAnyField = true;
                const rawValue = field.value != null ? field.value.trim() : '';
                if (rawValue !== '') {
                    hasValues = true;
                    const parsed = parseInt(rawValue, 10);
                    if (!isNaN(parsed)) {
                        sum += parsed;
                    }
                }
            });

            return { sum, hasValues, hasAnyField };
        }

        function evaluateGroupAgainstCount(count, groupKey, groupData) {
            if (!groupData.hasAnyField) {
                return { isValid: true };
            }

            const label = PACKAGING_DETAIL_LABELS[groupKey] || groupKey;
            const sum = groupData.sum;

        if (count === 0) {
            if (groupData.hasValues && sum !== 0) {
                return { isValid: false, message: `${label}: ${sum}, but category count is 0` };
            }
            return { isValid: true };
        }

        // Detail groups are optional; only validate groups where user entered values.
        if (!groupData.hasValues) {
            return { isValid: true };
        }

        if (sum !== count) {
            return { isValid: false, message: `${label}: ${sum}, expected ${count}` };
        }

            return { isValid: true };
        }

        function setCategoryValidationState(prefix, count, groupStates, errorMessages) {
            const detailSection = document.querySelector(`.inline-category-details[data-category="${prefix}"]`);
            if (!detailSection) return;

            const warningEl = detailSection.querySelector('.category-warning');
            if (!warningEl) return;

            const allGroupStates = Object.values(groupStates || {}).filter(group => group.hasAnyField);
            const filledGroupStates = allGroupStates.filter(group => group.hasValues);

            const setBannerStyle = (state) => {
                warningEl.style.display = 'block';
                warningEl.style.marginTop = '10px';
                warningEl.style.padding = '10px 12px';
                warningEl.style.borderRadius = '6px';
                warningEl.style.fontWeight = '600';
                warningEl.style.whiteSpace = 'pre-line';

                if (state === 'valid') {
                    warningEl.style.color = '#155724';
                    warningEl.style.backgroundColor = '#d4edda';
                    warningEl.style.border = '1px solid #c3e6cb';
                } else if (state === 'invalid') {
                    warningEl.style.color = '#721c24';
                    warningEl.style.backgroundColor = '#f8d7da';
                    warningEl.style.border = '1px solid #f5c6cb';
                } else {
                    warningEl.style.color = '#856404';
                    warningEl.style.backgroundColor = '#fff3cd';
                    warningEl.style.border = '1px solid #ffeaa7';
                }
            };

            if (count <= 0) {
                warningEl.textContent = '';
                warningEl.style.display = 'none';
                detailSection.classList.remove('validation-error');
                return;
            }

            if (filledGroupStates.length === 0) {
                warningEl.textContent = `Reminder: enter detail counts by Recycle Code / Color / Opacity.
For each group you fill, Current Total should equal ${count}.`;
                setBannerStyle('info');
                detailSection.classList.remove('validation-error');
                return;
            }

            const currentTotalLines = filledGroupStates.map(group => {
                const marker = group.isValid ? '✓' : '✗';
                return `${group.label}: Current Total ${group.sum} / Expected ${count} ${marker}`;
            });

            if (errorMessages.length > 0) {
                warningEl.textContent = ['Validation issue(s):', ...currentTotalLines].join('\n');
                setBannerStyle('invalid');
                detailSection.classList.add('validation-error');
                return;
            }

            warningEl.textContent = ['✓ Total is correct for all entered groups', ...currentTotalLines].join('\n');
            setBannerStyle('valid');
            detailSection.classList.remove('validation-error');
        }

        function buildCategorySummaryMessage(result, emptyMessage) {
            if (!result) return emptyMessage || '';
            if (result.count === 0) {
                return emptyMessage || '(No items)';
            }
            if (result.errorMessages.length === 0) {
                return '✓ All details match total';
            }
            return '✗ ' + result.errorMessages.join('；');
        }

        runWholePackageValidation = validateWholePackageHierarchy;
        validateWholePackageHierarchy();

        // Helper function to update validation status display
        function updateValidationStatus(elementId, isValid, message) {
            const statusElement = document.getElementById(elementId);
            if (!statusElement) return;

            statusElement.textContent = message;
            statusElement.className = `validation-status ${isValid ? 'valid' : 'invalid'}`;

            if (!message) {
                statusElement.style.color = '';
                statusElement.style.backgroundColor = '';
                statusElement.style.border = '';
                statusElement.style.padding = '';
                statusElement.style.borderRadius = '';
                statusElement.style.fontWeight = '';
                return;
            }

            statusElement.style.padding = '4px 8px';
            statusElement.style.borderRadius = '4px';
            statusElement.style.fontWeight = '600';

            if (isValid) {
                statusElement.style.color = '#155724';
                statusElement.style.backgroundColor = '#d4edda';
                statusElement.style.border = '1px solid #c3e6cb';
            } else {
                statusElement.style.color = '#721c24';
                statusElement.style.backgroundColor = '#f8d7da';
                statusElement.style.border = '1px solid #f5c6cb';
            }
        }

        // Helper function to update submit button for package validation
        function updateSubmitButtonForPackageValidation(isValid) {
            const submitButtons = document.querySelectorAll('#form-page5 .btn-continue[data-next="6"], #save-button, .btn-submit');

            submitButtons.forEach(button => {
                if (!isValid) {
                    button.disabled = true;
                    button.title = '请确保包装数据层级验证通过';
                } else {
                    // Check if there are other validation errors before enabling
                    const otherInvalidGroups = document.querySelectorAll('.percentage-status.invalid');
                    if (otherInvalidGroups.length === 0) {
                        button.disabled = false;
                        button.title = '';
                    }
                }
            });
        }
    }

    // Function to set up percentage validation for Quality Control sections
    function setupPercentageValidation() {
        console.log('Setting up percentage validation');

        // Define percentage groups that need to sum to 100%
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

        // Scope each percentage group to the correct details section.
        const groupScopes = {
            'mp_size': '#microplastics-details',
            'mp_color': '#microplastics-details',
            'mp_form': '#microplastics-details',
            'mp_polymer': '#microplastics-details',
            'fragment_color': '#fragments-details',
            'fragment_form': '#fragments-details',
            'fragment_polymer': '#fragments-details'
        };

        // Function to initialize validation containers when page 5 is loaded
        function initializeValidationContainers() {
            console.log('Initializing percentage validation containers');
            Object.keys(percentageGroups).forEach(groupKey => {
                createValidationContainer(groupKey, percentageGroups[groupKey]);
            });
        }

        // Try to initialize immediately if page 5 exists
        if (document.getElementById('form-page5')) {
            initializeValidationContainers();
        }

        // Also watch for when page 5 is loaded dynamically
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.id === 'form-page5') {
                        console.log('Page 5 detected, initializing validation containers');
                        // Wait a bit for the page to fully render
                        setTimeout(initializeValidationContainers, 100);
                    }
                });
            });
        });

        // Observe the form pages container for new pages
        const formPagesContainer = document.querySelector('.form-pages-container');
        if (formPagesContainer) {
            observer.observe(formPagesContainer, { childList: true, subtree: true });
        }

        // Add input event listeners for real-time validation
        document.addEventListener('input', function(event) {
            const fieldName = event.target.name;

            // Check if this field belongs to any percentage group
            for (const [groupKey, fields] of Object.entries(percentageGroups)) {
                if (fields.includes(fieldName)) {
                    validatePercentageGroup(groupKey, fields);
                    break;
                }
            }
        });

        // Function to create validation display container for a percentage group
        function createValidationContainer(groupKey, fields) {
            console.log(`Creating validation container for ${groupKey}`);

            // Check if container already exists
            if (document.getElementById(`${groupKey}-validation`)) {
                console.log(`Validation container for ${groupKey} already exists`);
                return;
            }

            const scopeRoot = document.querySelector(groupScopes[groupKey]) || document;

            // Find the first field in the group to determine where to insert validation
            const firstField = scopeRoot.querySelector(`[name="${fields[0]}"]`);
            if (!firstField) {
                console.log(`First field not found for ${groupKey}: ${fields[0]}`);
                return;
            }

            // Find the parent section
            let parentSection = scopeRoot.querySelector('.details-form');
            if (!parentSection) {
                parentSection = firstField.closest('.details-form');
            }
            if (!parentSection) {
                parentSection = firstField.closest('#microplastics-details, #fragments-details');
            }
            if (!parentSection) {
                console.log(`Parent section not found for ${groupKey}`);
                return;
            }

            // Create validation container with improved styling
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

            // Find the specific section title for this group and insert right after it
            const allSectionTitles = parentSection.querySelectorAll('.form-section-title');
            let targetTitle = null;

            // Map group keys to their title keywords - need exact match for proper identification
            const titleKeywords = {
                'mp_size': '1. Size',
                'mp_color': '2. Color type',
                'mp_form': '3. Form',
                'mp_polymer': '4. Polymer type',
                'fragment_color': '1. Color type',
                'fragment_form': '2. Form',
                'fragment_polymer': '3. Polymer type'
            };

            // Find the matching title
            allSectionTitles.forEach(title => {
                const keyword = titleKeywords[groupKey];
                if (keyword && title.textContent.includes(keyword)) {
                    // For fragments, make sure we're in the right section
                    if (groupKey.startsWith('fragment_')) {
                        if (title.closest('#fragments-details')) {
                            targetTitle = title;
                        }
                    } else if (groupKey.startsWith('mp_')) {
                        if (title.closest('#microplastics-details')) {
                            targetTitle = title;
                        }
                    }
                }
            });

            // Insert validation container after the specific section title
            if (targetTitle) {
                // Insert after the title, before the first form-row
                targetTitle.insertAdjacentElement('afterend', validationContainer);
                console.log(`Validation container for ${groupKey} inserted after title`);
            } else {
                console.log(`Target title not found for ${groupKey}, trying fallback`);
                // Fallback: insert before the first field's form-row
                const firstFormRow = firstField.closest('.form-row');
                if (firstFormRow) {
                    firstFormRow.insertAdjacentElement('beforebegin', validationContainer);
                    console.log(`Validation container for ${groupKey} inserted before first field`);
                }
            }
        }

        // Function to validate a percentage group
        function validatePercentageGroup(groupKey, fields) {
            let total = 0;
            let hasAnyValue = false;
            const scopeRoot = document.querySelector(groupScopes[groupKey]) || document;

            // Calculate total percentage
            fields.forEach(fieldName => {
                const field = scopeRoot.querySelector(`[name="${fieldName}"]`);
                if (field && field.value !== '') {
                    const value = parseFloat(field.value) || 0;
                    total += value;
                    hasAnyValue = true;
                }
            });

            // Update validation display
            const validationContainer = document.getElementById(`${groupKey}-validation`);
            const totalElement = document.getElementById(`${groupKey}-total`);
            const statusElement = document.getElementById(`${groupKey}-status`);

            if (!totalElement || !statusElement || !validationContainer) return;

            // Only show validation if user has entered some values
            if (!hasAnyValue) {
                validationContainer.style.display = 'none';
                statusElement.textContent = '';
                statusElement.className = 'percentage-status';
                updateSubmitButtonState();
                return;
            }

            // Show validation container
            validationContainer.style.display = 'block';
            totalElement.textContent = `Current Total: ${total.toFixed(1)}%`;

            const TOLERANCE = 0.5; // Same tolerance as formpage5.ejs validation

            if (Math.abs(total - 100) <= TOLERANCE) {
                // Valid - equals 100% (within tolerance)
                validationContainer.style.backgroundColor = '#d4edda';
                validationContainer.style.border = '1px solid #c3e6cb';
                totalElement.style.color = '#155724';
                statusElement.innerHTML = '<i class="fas fa-check-circle"></i> ✓ Total is correct';
                statusElement.style.color = '#155724';
                statusElement.style.fontWeight = 'bold';
                statusElement.className = 'percentage-status valid';
                updateSubmitButtonState();
            } else if (total > 100) {
                // Invalid - exceeds 100% - RED ERROR
                validationContainer.style.backgroundColor = '#f8d7da';
                validationContainer.style.border = '1px solid #f5c6cb';
                totalElement.style.color = '#721c24';
                statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> ✗ Error: Total exceeds 100%! Please adjust your values.';
                statusElement.style.color = '#721c24';
                statusElement.style.fontWeight = 'bold';
                statusElement.className = 'percentage-status invalid';
                updateSubmitButtonState();
            } else {
                // Invalid - less than 100% - YELLOW WARNING
                validationContainer.style.backgroundColor = '#fff3cd';
                validationContainer.style.border = '1px solid #ffeaa7';
                totalElement.style.color = '#856404';
                statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ⚠ Warning: Total must equal 100% (or leave all blank)';
                statusElement.style.color = '#856404';
                statusElement.style.fontWeight = 'bold';
                statusElement.className = 'percentage-status invalid';
                updateSubmitButtonState();
            }
        }

        // Function to update submit button state based on all percentage validations
        function updateSubmitButtonState() {
            const invalidGroups = document.querySelectorAll('.percentage-status.invalid');
            const submitButtons = document.querySelectorAll('#form-page5 .btn-continue[data-next="6"], #save-button, .btn-submit');

            submitButtons.forEach(button => {
                if (invalidGroups.length > 0) {
                    button.disabled = true;
                    button.title = '请确保所有百分比总和等于100%';
                } else {
                    button.disabled = false;
                    button.title = '';
                }
            });
        }
    }

    // Function to handle packaging count input - centralized in one place
    function setupPackagingCountHandler() {
        console.log('Setting up packaging count handler');

        // Use event delegation to handle packaging-count input changes
        document.addEventListener('input', function(event) {
            if (event.target.id === 'packaging-count') {
                const value = event.target.value;
                console.log('Input Event - Packaging count changed to:', value);

                // Store the value in formData
                formData['packaging_count'] = value;
                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

                // Update UI based on current value
                updatePackagingUI(parseInt(value) || 0);
            }
        });
    }

    // Function to show or hide category detail sections based on count inputs
    function setupPackagingCategoryDetailsToggle() {
        const packagingCountFields = PACKAGING_CATEGORY_CONFIG.map(cfg => cfg.countField);

        const refreshAll = () => {
            packagingCountFields.forEach(name => {
                const field = document.querySelector(`[name="${name}"]`);
                if (field) {
                    togglePackagingCategoryDetails(field);
                }
            });
            runWholePackageValidation();
        };

        document.addEventListener('input', event => {
            const target = event.target;
            if (!target || !packagingCountFields.includes(target.name)) {
                return;
            }
            togglePackagingCategoryDetails(target);
            runWholePackageValidation();
        });

        document.addEventListener('change', event => {
            const target = event.target;
            if (!target || !packagingCountFields.includes(target.name)) {
                return;
            }
            togglePackagingCategoryDetails(target);
            runWholePackageValidation();
        });

        setTimeout(refreshAll, 0);
    }

    function togglePackagingCategoryDetails(countField) {
        if (!countField) return;

        const categoryBlock = countField.closest('.purpose-category-block');
        if (!categoryBlock) return;

        const detailSection = categoryBlock.querySelector('.inline-category-details');
        if (!detailSection) return;

        const count = parseInt(countField.value, 10) || 0;
        detailSection.style.display = count > 0 ? 'block' : 'none';

        if (count <= 0) {
            const warningEl = detailSection.querySelector('.category-warning');
            if (warningEl) {
                warningEl.textContent = '';
                warningEl.style.display = 'none';
            }
            detailSection.classList.remove('validation-error');
            clearPackagingDetailFields(detailSection);
        }
    }

    function clearPackagingDetailFields(detailSection) {
        if (!detailSection) return;

        const inputs = detailSection.querySelectorAll('input[name], select[name], textarea[name]');
        if (!inputs.length) return;

        let formDataUpdated = false;
        inputs.forEach(input => {
            if (!input.name) return;

            if (input.value !== '') {
                input.value = '';
            }

            if (Object.prototype.hasOwnProperty.call(formData, input.name)) {
                delete formData[input.name];
                formDataUpdated = true;
            }
        });

        if (formDataUpdated) {
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
        }
    }

    function updateAllPackagingDetailsVisibility() {
        const packagingDetails = document.getElementById('packaging-details');
        if (!packagingDetails) return;

        const countInputs = packagingDetails.querySelectorAll('.purpose-category-block input[name^="packaging_count_"]');
        countInputs.forEach(input => togglePackagingCategoryDetails(input));
        runWholePackageValidation();
    }
    // Expose to global scope for external calls
    window.updateAllPackagingDetailsVisibility = updateAllPackagingDetailsVisibility;

    // Function to update UI based on packaging count
    function updatePackagingUI(count) {
        console.log('Updating UI for packaging count:', count);

        // Update visibility of packaging details section
        const packagingDetails = document.getElementById('packaging-details');
        console.log('packaging-details element:', packagingDetails);
        if (packagingDetails) {
            packagingDetails.style.display = count > 0 ? 'block' : 'none';
            console.log('Set packaging-details display to:', count > 0 ? 'block' : 'none');

            // Only update packaging items if the section is visible
            if (count > 0) {
                updatePackagingItems(count);
            }
        } else {
            console.error('packaging-details element not found!');
        }

        runWholePackageValidation();
    }

    // Function to update packaging items - separated from event handler
    function updatePackagingItems(count) {
        console.log('Updating packaging items for count:', count);

        const packagingItemsContainer = document.getElementById('packaging-items-container');
        if (!packagingItemsContainer) return;

        // Clear existing items
        packagingItemsContainer.innerHTML = '';

        // Generate new forms for each packaging item
        for (let i = 1; i <= count; i++) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'packaging-item';
            itemDiv.innerHTML = `
                <h4>Packaging Item #${i}</h4>
                <div class="form-group">
                    <label for="packaging-userpiece-${i}">UserPieceID Label:</label>
                    <input type="text" id="packaging-userpiece-${i}" name="packaging_userpiece_${i}" class="form-input" placeholder="User defined">
                </div>
                <div style="display: none;" class="item-number">${i}</div>
                <hr>
            `;
            packagingItemsContainer.appendChild(itemDiv);
        }        // Re-fill form fields from session if available
        fillFormFieldsFromSession();

        // Restore selection states
        setTimeout(() => {
            restorePackagingSelections();
        }, 100);
    }
    window.updatePackagingItems = updatePackagingItems;

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

                // Water-specific fields (Additional Sampling Information page)
                'environment_type', 'volume_sampled', 'water_depth',
                'flow_velocity', 'suspended_solids', 'conductivity',
                'water_type', 'water_type_other_description',
                'total_water_depth', 'sample_water_depth', 'water_flow_velocity',
                'turbidity', 'total_suspended_solids',

                // Sediment/soil-specific fields (Additional Sampling Information page)
                'soil_dry_weight', 'soil_organic_matter', 'soil_moisture',
                'soil_sand', 'soil_silt', 'soil_clay',
                'sediment_type', 'sediment_type_other_description',
                'soil_moisture_content', 'soil_texture', 'soil_texture_method',
                'sediment_grain_size', 'sediment_organic_content',

                // Mixed media fields
                'mixed_media_description',

                // Additional sampling parameters
                'sampling_depth', 'sampling_method', 'filtration_method',
                'extraction_method', 'identification_method'
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
            event.target.name === 'sediment_type' ||
            event.target.name === 'soil_landscape_type' ||
            event.target.name === 'surface_landscape_type') {

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
                        'air_temp', 'current_conditions', 'rainfall', 'environment_type',
                        'volume_sampled', 'total_water_depth', 'sample_water_depth',
                        'water_flow_velocity', 'turbidity', 'total_suspended_solids',
                        'soil_dry_weight', 'soil_organic_matter', 'soil_moisture_content',
                        'soil_texture', 'soil_texture_method', 'sediment_grain_size', 'sediment_organic_content'
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
                    const packagingDetails = document.getElementById('packaging-details');

                    if (microplasticsDetails) microplasticsDetails.style.display = 'none';
                    if (fragmentsDetails) fragmentsDetails.style.display = 'none';
                    if (packagingDetails) packagingDetails.style.display = 'none';

                    // Clear all quantitative data fields when selecting "No"
                    const quantitativeDataFields = [
                        'replicates_count', 'microplastics_count', 'fragments_count', 'packaging_count',
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

                    // Clear from formData and sessionStorage
                    quantitativeDataFields.forEach(field => {
                        delete formData[field];
                    });
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
                    [microplasticsDetails, fragmentsDetails, packagingDetails].forEach(section => {
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
                    const packagingAmountContainer = document.getElementById('packaging-amount-container');

                    if (microplasticsAmountContainer) microplasticsAmountContainer.style.display = 'none';
                    if (fragmentsAmountContainer) fragmentsAmountContainer.style.display = 'none';
                    if (packagingAmountContainer) packagingAmountContainer.style.display = 'none';

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
                                if (details) {
                                    details.style.display = count > 0 ? 'block' : 'none';
                                }
                                if (amountContainer) {
                                    amountContainer.style.display = count > 0 ? 'block' : 'none';
                                }
                                // Save to formData
                                formData['fragments_count'] = this.value;
                                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
                            });
                        }
                    }

                    // Check packaging count - do not add another event handler here!
                    const packagingInput = document.getElementById('packaging-count');
                    if (packagingInput) {
                        // Just update the UI based on the current value (will be 0 after clearing)
                        const packagingCount = parseInt(packagingInput.value) || 0;
                        updatePackagingUI(packagingCount);
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
            const singleSection = document.getElementById('single-collection-section');
            const deviceSection = document.getElementById('device-period-section');

            if (singleSection && deviceSection) {
                if (isDevicePeriod) {
                    // Show device period section, hide single collection
                    singleSection.style.display = 'none';
                    deviceSection.style.display = 'block';

                    // Clear single date field since it's not needed
                    const singleDateInput = document.getElementById('sample-date');
                    if (singleDateInput) singleDateInput.value = '';
                } else {
                    // Show single collection section, hide device period
                    singleSection.style.display = 'block';
                    deviceSection.style.display = 'none';

                    // Clear device date fields since they're not needed
                    const startDateInput = document.getElementById('device-start-date');
                    const endDateInput = document.getElementById('device-end-date');
                    if (startDateInput) startDateInput.value = '';
                    if (endDateInput) endDateInput.value = '';
                }

                // Update formData
                const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
                formData[event.target.name] = event.target.value;
                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
            }
        }
    });

    // Add event delegation for publication source Yes/No toggle in form-page2
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('toggle-publication-source')) {
            const showPublication = event.target.value === 'yes';
            const publicationFields = document.getElementById('publication-source-fields');

            if (publicationFields) {
                publicationFields.style.display = showPublication ? 'block' : 'none';

                // When switching to "No", clear all publication field data
                if (!showPublication) {
                    const publicationFieldNames = [
                        'publication_id_num',
                        'publication_year',
                        'publication_authors',
                        'publication_journal',
                        'publication_full_citation_apa',
                        'publication_pub_source_code'
                    ];
                    publicationFieldNames.forEach(name => {
                        const el = publicationFields.querySelector(`[name="${name}"]`);
                        if (el) el.value = '';
                    });
                }
            }

            // Persist the toggle (and cleared fields) to formData
            const formData = JSON.parse(sessionStorage.getItem(formStorageKey)) || {};
            formData[event.target.name] = event.target.value;
            if (event.target.value === 'no') {
                ['publication_id_num', 'publication_year', 'publication_authors',
                 'publication_journal', 'publication_full_citation_apa',
                 'publication_pub_source_code'].forEach(name => { delete formData[name]; });
            }
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
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
            if (event.target.classList.contains('btn-continue')) {
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

                // Save current page data
                saveCurrentPageData();

                const nextPage = event.target.dataset.next ? parseInt(event.target.dataset.next) : currentPage + 1;

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

                // First save to sessionStorage
                saveCurrentPageData();

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

        // Option D: New Case, Same Publication
        const optionD = document.createElement('div');
        optionD.className = 'option-item';
        optionD.innerHTML = `
            <button type="button" class="btn btn-outline-primary option-button" id="same-publication-case" style="width: 100%; margin-bottom: 15px; padding: 15px; text-align: left;">
                <strong>D) New Case, Same Publication</strong>
                <div style="font-size: 0.9em; color: #6c757d; margin-top: 5px;">
                    Start a brand-new case keeping only this publication source
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
        // First save current data in background (without alert)
        saveFormDataSilently().then(() => {
            // Clear all form data
            formData = {};
            sessionStorage.removeItem(formStorageKey);

            // Reset to page 1 (location and date)
            navigateToPage(1);

            // Clear all form fields
            clearAllFormFields();

            // Show success message
            showTemporaryMessage('Data saved! Starting fresh data entry for new location and date', 'success');
        }).catch(error => {
            console.error('Error saving data:', error);
            showTemporaryMessage('Error saving data: ' + error.message, 'error');
        });
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
        // First save current data in background (without alert)
        saveFormDataSilently().then(() => {
            // Preserve the full location context and sampling date/time metadata.
            const preservedData = preserveNextStepFields([
                'location_id',
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
                'sample_date',
                'device_start_date',
                'device_end_date',
                'sample_time',
                'publication_id_num',
                'publication_year',
                'publication_authors',
                'publication_journal',
                'publication_full_citation_apa',
                'publication_pub_source_code'
            ]);

            // Reset form data but keep preserved data
            formData = preservedData;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Go to page 3 (media type selection)
            navigateToPage(3);

            // Clear media-specific fields only
            clearMediaSpecificFields();

            // Show success message
            showTemporaryMessage('Data saved! Select different media type for same location/date', 'success');
        }).catch(error => {
            console.error('Error saving data:', error);
            showTemporaryMessage('Error saving data: ' + error.message, 'error');
        });
    }

    // Handler for Option C: Additional Sample (same media, location, date)
    function handleSameMediaSample() {
        // First save current data in background (without alert)
        saveFormDataSilently().then(() => {
            // Preserve location/date context plus media selections/subtypes.
            const preservedData = preserveNextStepFields([
                'location_id',
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
                'sample_date',
                'device_start_date',
                'device_end_date',
                'sample_time',
                'publication_id_num',
                'publication_year',
                'publication_authors',
                'publication_journal',
                'publication_full_citation_apa',
                'publication_pub_source_code',
                'media_type',
                'water_type',
                'water_type_other_description',
                'sediment_type',
                'sediment_type_other_description',
                'soil_landscape_type',
                'surface_landscape_type',
                'mixed_media_description'
            ]);

            // Reset form data but keep preserved data
            formData = preservedData;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Go to page 4 (additional sampling information)
            navigateToPage(4);

            // Clear sample-specific fields only
            clearSampleSpecificFields();

            // Show success message
            showTemporaryMessage('Data saved! Enter additional sample for same media and location', 'success');
        }).catch(error => {
            console.error('Error saving data:', error);
            showTemporaryMessage('Error saving data: ' + error.message, 'error');
        });
    }

    // Handler for Option D: New Case, Same Publication
    // Keeps ONLY the publication block and starts a brand-new case from page 1.
    function handleSamePublication() {
        // First save current data in background (without alert)
        saveFormDataSilently().then(() => {
            // Preserve only the publication source fields and the Yes/No toggle.
            const preservedData = preserveNextStepFields([
                'publication_present',
                'publication_id_num',
                'publication_year',
                'publication_authors',
                'publication_journal',
                'publication_full_citation_apa',
                'publication_pub_source_code'
            ]);

            // Reset all form data but keep the publication block.
            formData = preservedData;
            sessionStorage.setItem(formStorageKey, JSON.stringify(formData));

            // Go back to page 1 (location) to begin a new case.
            navigateToPage(1);

            // Clear every field, then restore the preserved publication values.
            clearAllFormFields();
            Object.entries(preservedData).forEach(([name, value]) => {
                document.querySelectorAll(`[name="${name}"]`).forEach(element => {
                    if (element.type === 'radio' || element.type === 'checkbox') {
                        element.checked = (element.value === String(value));
                    } else {
                        element.value = value;
                    }
                });
            });

            // Show success message
            showTemporaryMessage('Data saved! Starting a new case with the same publication', 'success');
        }).catch(error => {
            console.error('Error saving data:', error);
            showTemporaryMessage('Error saving data: ' + error.message, 'error');
        });
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
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type}`;
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.right = '20px';
        messageDiv.style.zIndex = '9999';
        messageDiv.style.padding = '15px';
        messageDiv.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
        messageDiv.style.color = type === 'success' ? '#155724' : '#721c24';
        messageDiv.style.border = `1px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'}`;
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

    // Function to update page 2 content based on page 1 data
    function updatePage2Content() {
        // Update any dynamic content based on location selection
        if (formData.location_id) {
            console.log('Updating page 2 based on location:', formData.location_id);
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
        const fragmentsCount = parseInt(currentFormData['fragments_count']) || 0;
        const fragmentsDetails = document.getElementById('fragments-details');
        const fragmentsAmountContainer = document.getElementById('fragments-amount-container');
        if (fragmentsDetails) {
            fragmentsDetails.style.display = fragmentsCount > 0 ? 'block' : 'none';
            console.log('Fragments details section:', fragmentsCount > 0 ? 'shown' : 'hidden');
        }
        if (fragmentsAmountContainer) {
            fragmentsAmountContainer.style.display = fragmentsCount > 0 ? 'block' : 'none';
        }

        // Update packaging details section and sample amount
        const packagingCount = parseInt(currentFormData['packaging_count']) || 0;
        const packagingDetails = document.getElementById('packaging-details');
        const packagingAmountContainer = document.getElementById('packaging-amount-container');
        if (packagingDetails) {
            packagingDetails.style.display = packagingCount > 0 ? 'block' : 'none';

            // If packaging count > 0, update the packaging items
            if (packagingCount > 0) {
                updatePackagingItems(packagingCount);
            }
            console.log('Packaging details section:', packagingCount > 0 ? 'shown' : 'hidden');
        }
        if (packagingAmountContainer) {
            packagingAmountContainer.style.display = packagingCount > 0 ? 'block' : 'none';
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
        document.querySelector('.form-pages-container').addEventListener('change', function(event) {
            const element = event.target;

            if (element.name && element.name.trim() !== '') {
                if (isHiddenLegacyField(element)) {
                    return;
                }
                if (element.type === 'radio' || element.type === 'checkbox') {
                    if (element.checked) {
                        formData[element.name] = element.value;
                    }
                } else {
                    formData[element.name] = element.value;
                }

                if (element.name && element.name.startsWith('publication_')) {
                    rememberPublicationForLocation();
                }

                sessionStorage.setItem(formStorageKey, JSON.stringify(formData));
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

        if (typeof updateAllPackagingDetailsVisibility === 'function') {
            updateAllPackagingDetailsVisibility();
        }

        syncLocationMapFromInputs({ zoom: 13 });
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
    function generateSummary() {
        console.log('=== generateSummary called ===');
        const summaryContainer = document.getElementById('summary-container');
        if (!summaryContainer) {
            console.log('Summary container not found');
            return;
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
            { key: 'location_id', label: 'Location', page: 1 },
            { key: 'sample_date', label: 'Sample Date', page: 1 },
            { key: 'media_type', label: 'Media Type', page: 2 }
        ];

        const missingRequired = [];
        const validationItems = [];

        requiredFields.forEach(field => {
            if (!formData[field.key] || formData[field.key].toString().trim() === '') {
                missingRequired.push(field);
            }
        });

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

        // Define field groups for better organization
        const fieldGroups = {
            'Location Information': [
                'location_id', 'location_name', 'location_shortcode', 'location_description', 'latitude', 'longitude',
                'event_location_description', 'event_latitude', 'event_longitude', 'acres',
                'streetaddress', 'city', 'state', 'country', 'zip_code'
            ],
            'Sampling Event Information': [
                'device_installation_period', 'sample_date', 'device_start_date', 'device_end_date',
                'sample_time', 'sample_description',
                'publication_id_num', 'publication_year', 'publication_authors', 'publication_journal',
                'publication_full_citation_apa', 'publication_pub_source_code'
            ],
            'Media Information': [
                'media_type', 'water_type', 'sediment_type', 'soil_landscape_type', 'surface_landscape_type',
                'mixed_media_description'
            ],
            'Environmental Conditions': [
                'air_temp', 'current_conditions', 'rainfall', 'environment_type'
            ],
            'Additional Water Information': [
                'volume_sampled', 'water_depth', 'flow_velocity', 'suspended_solids', 'conductivity'
            ],
            'Additional Soil Information': [
                'soil_dry_weight', 'soil_organic_matter', 'soil_moisture', 'soil_sand', 'soil_silt', 'soil_clay'
            ],
            'Quantitative Data': [
                'has_quantitative_data', 'microplastics_count', 'fragments_count', 'packaging_count'
            ],
            'Sample Amounts': [
                'total_sample_amount', 'sample_unit',
                'microplastics_sample_amount', 'microplastics_sample_unit',
                'fragments_sample_amount', 'fragments_sample_unit',
                'packaging_sample_amount', 'packaging_sample_unit'
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
            'Microplastics Polymer Types': [
                'mp_polymer_pet', 'mp_polymer_hdpe', 'mp_polymer_pvc', 'mp_polymer_ldpe', 'mp_polymer_pp', 'mp_polymer_ps',
                'mp_polymer_pc', 'mp_polymer_pan', 'mp_polymer_pmma', 'mp_polymer_pa', 'mp_polymer_abs',
                'mp_polymer_polyester_fiber', 'mp_polymer_acrylic_fiber', 'mp_polymer_pe_fiber', 'mp_polymer_pp_fiber',
                'mp_polymer_tire_rubber', 'mp_polymer_natural_rubber', 'mp_polymer_synthetic_rubber',
                'mp_polymer_mixed', 'mp_polymer_unknown', 'mp_polymer_other', 'mp_polymer_other_specify'
            ],
            'Microplastics Estimation Method': [
                'micro_mass_mp_total', 'micro_method_polymer_num', 'micro_method_polymer_other', 'micro_method_percent_estimate'
            ],
            'Fragments Color Distribution': [
                'fragment_color_clear', 'fragment_color_opaque_light', 'fragment_color_opaque_dark', 'fragment_color_mixed'
            ],
            'Fragments Form Distribution': [
                'fragment_form_fiber', 'fragment_form_pellet', 'fragment_form_film', 'fragment_form_foam', 'fragment_form_hardplastic'
            ],
            'Fragments Polymer Types': [
                'fragment_polymer_pet', 'fragment_polymer_hdpe', 'fragment_polymer_pvc', 'fragment_polymer_ldpe', 'fragment_polymer_pp', 'fragment_polymer_ps',
                'fragment_polymer_pc', 'fragment_polymer_pan', 'fragment_polymer_pmma', 'fragment_polymer_pa', 'fragment_polymer_abs',
                'fragment_polymer_polyester_fiber', 'fragment_polymer_acrylic_fiber', 'fragment_polymer_pe_fiber', 'fragment_polymer_pp_fiber',
                'fragment_polymer_tire_rubber', 'fragment_polymer_natural_rubber', 'fragment_polymer_synthetic_rubber',
                'fragment_polymer_mixed', 'fragment_polymer_unknown', 'fragment_polymer_other', 'fragment_polymer_other_specify'
            ],
            'Fragments Estimation Method': [
                'fragments_mass_debris_total', 'fragments_method_polymer_num', 'fragments_method_polymer_other', 'fragments_method_percent_estimate'
            ]
        };        // Field labels mapping for better display
        const fieldLabels = {
            // Location Information
            'location_id': 'Selected Location',
            'location_name': 'Location Name',
            'location_shortcode': 'Location Short Code',
            'location_description': 'Location Description',
            'latitude': 'Latitude',
            'longitude': 'Longitude',
            'event_location_description': 'Event Location Description (Override)',
            'event_latitude': 'Event Latitude (Override)',
            'event_longitude': 'Event Longitude (Override)',
            'acres': 'Area (km²)',
            'streetaddress': 'Street Address',
            'city': 'City',
            'state': 'State',
            'country': 'Country',
            'zip_code': 'Zip Code',

            // Sampling Event Information
            'device_installation_period': 'Device Installation Period',
            'sample_date': 'Sample Date',
            'device_start_date': 'Device Start Date',
            'device_end_date': 'Device End Date',
            'sample_time': 'Collection Time',
            'sample_description': 'Sample Description',
            'publication_id_num': 'Selected Publication',
            'publication_year': 'Publication Year',
            'publication_authors': 'Publication Authors',
            'publication_journal': 'Publication Journal',
            'publication_full_citation_apa': 'Full Citation APA',
            'publication_pub_source_code': 'Publication Source Type',

            // Media Information
            'media_type': 'Media Type',
            'water_type': 'Water Type',
            'sediment_type': 'Sediment Type',
            'soil_landscape_type': 'Soil Landscape Type',
            'surface_landscape_type': 'Surface Landscape Type',
            'mixed_media_description': 'Mixed Media Description',

            // Environmental Conditions
            'air_temp': 'Air Temperature (°C)',
            'current_conditions': 'Current Weather Conditions',
            'rainfall': 'Rainfall (cm)',
            'environment_type': 'Environment Type',

            // Additional Water Information
            'volume_sampled': 'Volume Sampled (L)',
            'water_depth': 'Water Depth (m)',
            'flow_velocity': 'Flow Velocity (m/s)',
            'suspended_solids': 'Total Suspended Solids (mg/L)',
            'conductivity': 'Conductivity (μS/cm)',

            // Additional Soil Information
            'soil_dry_weight': 'Soil Dry Weight (g)',
            'soil_organic_matter': 'Soil Organic Matter (%)',
            'soil_moisture': 'Soil Moisture Content (%)',
            'soil_sand': 'Sand Content (%)',
            'soil_silt': 'Silt Content (%)',
            'soil_clay': 'Clay Content (%)',

            // Quantitative Data
            'has_quantitative_data': 'Quantitative Data Available',
            'replicates_count': 'Number of Replicates',
            'microplastics_count': 'Microplastics Count',
            'fragments_count': 'Fragments Count',
            'packaging_count': 'Packaging Items Count',

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

            // Microplastics Polymer Types
            'mp_polymer_pet': 'PET - Polyethylene Terephthalate #1 (%)',
            'mp_polymer_hdpe': 'HDPE - High-Density Polyethylene #2 (%)',
            'mp_polymer_pvc': 'PVC - Polyvinyl Chloride #3 (%)',
            'mp_polymer_ldpe': 'LDPE - Low-Density Polyethylene #4 (%)',
            'mp_polymer_pp': 'PP - Polypropylene #5 (%)',
            'mp_polymer_ps': 'PS - Polystyrene #6 (%)',
            'mp_polymer_pc': 'PC - Polycarbonate (%)',
            'mp_polymer_pan': 'PAN - Polyacrylonitrile (%)',
            'mp_polymer_pmma': 'PMMA - Polymethyl Methacrylate (%)',
            'mp_polymer_pa': 'PA - Polyamide/Nylon (%)',
            'mp_polymer_abs': 'ABS - Acrylonitrile Butadiene Styrene (%)',
            'mp_polymer_polyester_fiber': 'Polyester Fiber (%)',
            'mp_polymer_acrylic_fiber': 'Acrylic Fiber (%)',
            'mp_polymer_pe_fiber': 'Polyethylene Fiber (%)',
            'mp_polymer_pp_fiber': 'Polypropylene Fiber (%)',
            'mp_polymer_tire_rubber': 'Tire Rubber (SBR) (%)',
            'mp_polymer_natural_rubber': 'Natural Rubber (%)',
            'mp_polymer_synthetic_rubber': 'Synthetic Rubber (%)',
            'mp_polymer_mixed': 'Mixed/Composite Polymers (%)',
            'mp_polymer_unknown': 'Unknown Polymer Type (%)',
            'mp_polymer_other': 'Other Polymer Type (%)',
            'mp_polymer_other_specify': 'Specify Other Polymer Type',

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

            // Fragments Polymer Types
            'fragment_polymer_pet': 'PET - Polyethylene Terephthalate #1 (%)',
            'fragment_polymer_hdpe': 'HDPE - High-Density Polyethylene #2 (%)',
            'fragment_polymer_pvc': 'PVC - Polyvinyl Chloride #3 (%)',
            'fragment_polymer_ldpe': 'LDPE - Low-Density Polyethylene #4 (%)',
            'fragment_polymer_pp': 'PP - Polypropylene #5 (%)',
            'fragment_polymer_ps': 'PS - Polystyrene #6 (%)',
            'fragment_polymer_pc': 'PC - Polycarbonate (%)',
            'fragment_polymer_pan': 'PAN - Polyacrylonitrile (%)',
            'fragment_polymer_pmma': 'PMMA - Polymethyl Methacrylate (%)',
            'fragment_polymer_pa': 'PA - Polyamide/Nylon (%)',
            'fragment_polymer_abs': 'ABS - Acrylonitrile Butadiene Styrene (%)',
            'fragment_polymer_polyester_fiber': 'Polyester Fiber (%)',
            'fragment_polymer_acrylic_fiber': 'Acrylic Fiber (%)',
            'fragment_polymer_pe_fiber': 'Polyethylene Fiber (%)',
            'fragment_polymer_pp_fiber': 'Polypropylene Fiber (%)',
            'fragment_polymer_tire_rubber': 'Tire Rubber (SBR) (%)',
            'fragment_polymer_natural_rubber': 'Natural Rubber (%)',
            'fragment_polymer_synthetic_rubber': 'Synthetic Rubber (%)',
            'fragment_polymer_mixed': 'Mixed/Composite Polymers (%)',
            'fragment_polymer_unknown': 'Unknown Polymer Type (%)',
            'fragment_polymer_other': 'Other Polymer Type (%)',
            'fragment_polymer_other_specify': 'Specify Other Polymer Type',

            // Fragments Estimation Method
            'fragments_mass_debris_total': 'Total Debris Mass (g)',
            'fragments_method_polymer_num': 'Fragments Polymer ID Method',
            'fragments_method_polymer_other': 'Other Fragments Polymer ID Method',
            'fragments_method_percent_estimate': 'Fragments Percent Method'
        };        // Check if packaging items exist and add them to a separate section
        const packagingItems = [];
        Object.keys(formData).forEach(key => {
            if (key.startsWith('packaging_') && key !== 'packaging_count') {
                packagingItems.push(key);
            }
        });

        if (packagingItems.length > 0) {
            fieldGroups['Packaging Items'] = packagingItems;
        }

        const allDefinedFields = new Set();
        Object.values(fieldGroups).forEach(fields => {
            fields.forEach(field => allDefinedFields.add(field));
        });

        const otherFields = Object.keys(formData).filter(field =>
            !allDefinedFields.has(field) &&
            !DETAIL_TABLES.includes(field) &&
            formData[field] &&
            formData[field].toString().trim() !== '' &&
            !field.startsWith('packaging_') // These are handled separately
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
                valueDiv.textContent = formData[field];

                itemDiv.appendChild(labelDiv);
                itemDiv.appendChild(valueDiv);
                summaryContainer.appendChild(itemDiv);
            });

            otherSectionAdded = true;
        }

        // Create summary sections by field groups
        for (const [groupTitle, fields] of Object.entries(fieldGroups)) {
            // Skip certain groups based on conditions
            if (groupTitle === 'Additional Water Information' && formData['media_type'] !== 'water') {
                continue;
            }
            if (groupTitle === 'Additional Soil Information' && !['soil_sediment', 'in_soil', 'soil_litter'].includes(formData['media_type'])) {
                continue;
            }
            if (groupTitle === 'Sample Amounts' && formData['has_quantitative_data'] !== 'yes') {
                continue;
            }
            if (groupTitle.includes('Microplastics') && (!formData['microplastics_count'] || parseInt(formData['microplastics_count']) === 0)) {
                continue;
            }
            if (groupTitle.includes('Fragments') && (!formData['fragments_count'] || parseInt(formData['fragments_count']) === 0)) {
                continue;
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

                if (formData[field] && formData[field].toString().trim() !== '') {
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
                    } else if (field.includes('_polymer_other_specify')) {
                        // Display the specified polymer type with percentage from the corresponding _other field
                        const otherField = field.replace('_specify', '');
                        if (formData[otherField]) {
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
                        valueDiv.textContent = formData[field];
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

            if (groupTitle === 'Location Information') {
                appendOtherInformationSection();
            }
        }

        if (!otherSectionAdded) {
            appendOtherInformationSection();
        }

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

        DETAIL_TABLES.forEach(tableId => {
            const rows = Array.isArray(formData[tableId]) ? formData[tableId] : [];
            if (rows.length === 0) return;

            const detailHeader = document.createElement('h4');
            detailHeader.textContent = detailLabels[tableId] || tableId;
            detailHeader.style.marginBottom = '10px';
            detailHeader.style.marginTop = '15px';
            detailHeader.style.paddingBottom = '5px';
            detailHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(detailHeader);

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
        });

        // Add a section for packaging details if needed
        if (parseInt(formData['packaging_count']) > 0) {
            // Create a header for packaging items
            const packagingHeader = document.createElement('h4');
            packagingHeader.textContent = `Packaging Items (${formData['packaging_count']})`;
            packagingHeader.style.marginBottom = '10px';
            packagingHeader.style.marginTop = '15px';
            packagingHeader.style.paddingBottom = '5px';
            packagingHeader.style.borderBottom = '1px solid #ddd';
            summaryContainer.appendChild(packagingHeader);

            // Group by item number
            const itemCount = parseInt(formData['packaging_count']);
            for (let i = 1; i <= itemCount; i++) {
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
                    if (formData[fieldInfo.key]) {
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
            }
        }

        function resolveSectionEditPage(sectionTitle) {
            if (sectionTitle === 'Location Information') return 1;
            if (sectionTitle === 'Other Information') return 4;
            if (sectionTitle === 'Sampling Event Information') return 2;
            if (sectionTitle === 'Media Information') return 3;
            if (
                sectionTitle === 'Environmental Conditions' ||
                sectionTitle === 'Additional Water Information' ||
                sectionTitle === 'Additional Soil Information'
            ) {
                return 4;
            }
            if (sectionTitle === 'Data Validation Status') return 6;
            return 5; // Most summary blocks map to Step 5 details
        }

        // Add edit buttons for each section for better usability
        const sectionHeaders = summaryContainer.querySelectorAll('h4');
        sectionHeaders.forEach(header => {
            const sectionTitle = header.textContent;
            const pageNumber = resolveSectionEditPage(sectionTitle);

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
            const pageNumber = resolveSectionEditPage(sectionTitle);

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

        // Use fetch API to submit data
        fetch('/api/save-form-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataToSubmit)
            })
            .then(async response => {
                if (!response.ok) {
                    let data;
                    try { data = await response.json(); } catch (_) { data = null; }
                    devLogSaveError('save-and-iterate', response.status, data, formData);
                    const friendly = buildFriendlySaveError(response.status, data, formData);
                    throw new Error(friendly);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    handleSavedPublication(data);
                    // Show success message
                    alert('Data saved successfully! You can now enter another sample for the same location.');

                    // Preserve location information for next iteration
                    const locationData = {};
                    const locationFields = [
                        'location_id', 'location_name', 'latitude', 'longitude',
                        'acres', 'address', 'zip_code', 'sample_date',
                        'publication_id_num', 'publication_year', 'publication_authors',
                        'publication_journal', 'publication_full_citation_apa',
                        'publication_pub_source_code'
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

        // Submit data directly to save endpoint
        return fetch('/api/save-form-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(async response => {
            console.log('Silent save response status:', response.status);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('silent-save', response.status, data, formData);
                const friendly = buildFriendlySaveError(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Silent save success:', data);
            if (data.success) {
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

        // Submit data to server
        fetch('/api/save-form-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(async response => {
            console.log('Save response status:', response.status);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('save-and-next-steps', response.status, data, formData);
                const friendly = buildFriendlySaveError(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save success:', data);
            if (data.success) {
                handleSavedPublication(data);
                // Show success message at the top of the page
                showTemporaryMessage('Data Saved Successfully!', 'success');

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

        // Submit data directly to save endpoint
        fetch('/api/save-form-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(async response => {
            console.log('Save response status:', response.status);
            console.log('Save response headers:', response.headers);
            if (!response.ok) {
                let data;
                try { data = await response.json(); } catch (_) { data = null; }
                devLogSaveError('save-only', response.status, data, formData);
                const friendly = buildFriendlySaveError(response.status, data, formData);
                throw new Error(friendly);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save endpoint success:', data);
            if (data.success) {
                handleSavedPublication(data);
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

    if (devicePeriodRadio.value === 'yes') {
        // Validate device installation period dates
        const startDate = document.getElementById('device-start-date')?.value;
        const endDate = document.getElementById('device-end-date')?.value;
          if (!startDate) {
            displayErrorMessage('Please provide the device installation start date.');
            return false;
        }
          if (!endDate) {
            displayErrorMessage('Please provide the device removal/end date.');
            return false;        }

        // Validate that end date is after start date
        if (new Date(endDate) <= new Date(startDate)) {
            displayErrorMessage('Device removal/end date must be after the installation start date.');
            return false;
        }
    } else {
        // Validate single collection date
        const sampleDate = document.getElementById('sample-date')?.value;

        if (!sampleDate) {
            displayErrorMessage('Please provide the plastic collection date.');
            return false;
        }
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
        'sample_date': '2025-06-18',
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
    } else if (event.target.id === 'packaging-count') {
        const count = parseInt(event.target.value) || 0;
        const container = document.getElementById('packaging-amount-container');
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

// Add validation for polymer type percentages
document.addEventListener('input', function(event) {
    if (event.target.name && event.target.name.includes('mp_polymer_')) {
        validatePolymerPercentages('mp');
    } else if (event.target.name && event.target.name.includes('fragment_polymer_')) {
        validatePolymerPercentages('fragment');
    }
});

// Function to validate polymer type percentages
function validatePolymerPercentages(type = 'mp') {
    const prefix = type === 'mp' ? 'mp_polymer_' : 'fragment_polymer_';
    const polymerInputs = document.querySelectorAll(`input[name^="${prefix}"]`);
    let total = 0;

    polymerInputs.forEach(input => {
        const value = parseFloat(input.value) || 0;
        total += value;
    });

    // Find or create warning element
    const warningId = `${type}-polymer-percentage-warning`;
    let warningElement = document.getElementById(warningId);
    if (!warningElement) {
        warningElement = document.createElement('div');
        warningElement.id = warningId;
        warningElement.className = 'percentage-warning';
        warningElement.style.cssText = `
            color: #dc3545;
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            padding: 10px;
            border-radius: 6px;
            margin-top: 15px;
            font-size: 14px;
            display: none;
        `;

        // Insert after the last polymer category in the appropriate section
        const sectionId = type === 'mp' ? 'microplastics-details' : 'fragments-details';
        const section = document.getElementById(sectionId);
        if (section) {
            const lastPolymerCategory = section.querySelector('.polymer-category:last-of-type');
            if (lastPolymerCategory) {
                lastPolymerCategory.parentNode.insertBefore(warningElement, lastPolymerCategory.nextSibling);
            }
        }
    }

    if (total > 100) {
        warningElement.textContent = `Warning: Total ${type === 'mp' ? 'microplastics' : 'fragments'} polymer percentages (${total.toFixed(1)}%) exceed 100%. Please adjust the values.`;
        warningElement.style.display = 'block';
    } else if (total > 0) {
        warningElement.textContent = `Total ${type === 'mp' ? 'microplastics' : 'fragments'} polymer percentages: ${total.toFixed(1)}%`;
        warningElement.style.display = 'block';
        warningElement.style.color = '#155724';
        warningElement.style.backgroundColor = '#d4edda';
        warningElement.style.borderColor = '#c3e6cb';
    } else {
        warningElement.style.display = 'none';
    }
}
