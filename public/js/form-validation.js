/**
 * Form Validation JavaScript
 * Handles client-side validation for data entry forms
 */

document.addEventListener('DOMContentLoaded', function() {
    initializeFormValidation();
});

function initializeFormValidation() {
    // Setup real-time validation for required fields
    setupRequiredFieldValidation();

    // Setup coordinate validation
    setupCoordinateValidation();

    // Setup date validation
    setupDateValidation();

    // Setup numeric field validation
    setupNumericValidation();

    // Setup email validation
    setupEmailValidation();
}

function setupRequiredFieldValidation() {
    const requiredFields = document.querySelectorAll('input[required], select[required], textarea[required]');

    requiredFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateRequiredField(this);
        });

        field.addEventListener('input', function() {
            if (this.classList.contains('is-invalid')) {
                validateRequiredField(this);
            }
        });
    });
}

function validateRequiredField(field) {
    const value = field.value.trim();
    const isValid = value !== '';

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, 'This field is required');
    }

    return isValid;
}

function setupCoordinateValidation() {
    const latField = document.getElementById('latitude');
    const lngField = document.getElementById('longitude');

    if (latField) {
        latField.addEventListener('blur', function() {
            validateLatitude(this);
        });
    }

    if (lngField) {
        lngField.addEventListener('blur', function() {
            validateLongitude(this);
        });
    }
}

function validateLatitude(field) {
    const value = parseFloat(field.value);
    const isValid = !isNaN(value) && value >= -90 && value <= 90;

    if (field.value.trim() === '') {
        // Let required field validation handle empty values
        return true;
    }

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, 'Latitude must be between -90 and 90 degrees');
    }

    return isValid;
}

function validateLongitude(field) {
    const value = parseFloat(field.value);
    const isValid = !isNaN(value) && value >= -180 && value <= 180;

    if (field.value.trim() === '') {
        // Let required field validation handle empty values
        return true;
    }

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, 'Longitude must be between -180 and 180 degrees');
    }

    return isValid;
}

function setupDateValidation() {
    const dateFields = document.querySelectorAll('input[type="date"]');

    dateFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateDate(this);
        });
    });
}

function validateDate(field) {
    const value = field.value;

    if (field.value.trim() === '') {
        // Let required field validation handle empty values
        return true;
    }

    const date = new Date(value);
    const today = new Date();
    const isValid = date <= today && !isNaN(date.getTime());

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, 'Date cannot be in the future');
    }

    return isValid;
}

function setupNumericValidation() {
    const numericFields = document.querySelectorAll('input[type="number"], input[data-type="numeric"]');

    numericFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateNumeric(this);
        });
    });
}

function validateNumeric(field) {
    const value = field.value.trim();

    if (value === '') {
        // Let required field validation handle empty values
        return true;
    }

    const numValue = parseFloat(value);
    const min = field.getAttribute('min');
    const max = field.getAttribute('max');

    let isValid = !isNaN(numValue);
    let errorMessage = 'Please enter a valid number';

    if (isValid && min !== null) {
        const minValue = parseFloat(min);
        if (numValue < minValue) {
            isValid = false;
            errorMessage = `Value must be at least ${minValue}`;
        }
    }

    if (isValid && max !== null) {
        const maxValue = parseFloat(max);
        if (numValue > maxValue) {
            isValid = false;
            errorMessage = `Value must be no more than ${maxValue}`;
        }
    }

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, errorMessage);
    }

    return isValid;
}

function setupEmailValidation() {
    const emailFields = document.querySelectorAll('input[type="email"]');

    emailFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateEmail(this);
        });
    });
}

function validateEmail(field) {
    const value = field.value.trim();

    if (value === '') {
        // Let required field validation handle empty values
        return true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(value);

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        clearErrorMessage(field);
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        showErrorMessage(field, 'Please enter a valid email address');
    }

    return isValid;
}

function showErrorMessage(field, message) {
    clearErrorMessage(field);

    const errorDiv = document.createElement('div');
    errorDiv.className = 'invalid-feedback';
    errorDiv.textContent = message;
    errorDiv.setAttribute('data-field-error', field.name || field.id);

    field.parentNode.appendChild(errorDiv);
}

function clearErrorMessage(field) {
    const fieldName = field.name || field.id;
    const existingError = document.querySelector(`[data-field-error="${fieldName}"]`);
    if (existingError) {
        existingError.remove();
    }
}

// Public function to validate entire form
function validateForm(formElement) {
    const requiredFields = formElement.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!validateRequiredField(field)) {
            isValid = false;
        }
    });

    // Validate specific field types
    const latField = formElement.querySelector('#latitude');
    const lngField = formElement.querySelector('#longitude');
    const dateFields = formElement.querySelectorAll('input[type="date"]');
    const numericFields = formElement.querySelectorAll('input[type="number"], input[data-type="numeric"]');
    const emailFields = formElement.querySelectorAll('input[type="email"]');

    if (latField && !validateLatitude(latField)) isValid = false;
    if (lngField && !validateLongitude(lngField)) isValid = false;

    dateFields.forEach(field => {
        if (!validateDate(field)) isValid = false;
    });

    numericFields.forEach(field => {
        if (!validateNumeric(field)) isValid = false;
    });

    emailFields.forEach(field => {
        if (!validateEmail(field)) isValid = false;
    });

    return isValid;
}

function validateTask5Rules(state = {}) {
    const errors = [];

    const publicationSelected = state.publication_id_num || state.publication_id || state.publicationId;
    const publicationFields = [
        state.publication_year,
        state.publication_authors,
        state.publication_journal,
        state.publication_full_citation_apa,
        state.publication_pub_source_code
    ];
    if (!publicationSelected && !publicationFields.every(value => value !== undefined && value !== null && String(value).trim() !== '')) {
        errors.push('Please select or enter a publication source.');
    }

    if ((state.total_sample_amount && !state.sample_unit) || (!state.total_sample_amount && state.sample_unit)) {
        errors.push('Total Sample Amount and Sample Unit must be entered together.');
    }

    const debrisRows = [
        ...(Array.isArray(state.fragments_color_details) ? state.fragments_color_details : []),
        ...(Array.isArray(state.fragments_form_details) ? state.fragments_form_details : []),
        ...(Array.isArray(state.fragments_opacity_details) ? state.fragments_opacity_details : []),
        ...(Array.isArray(state.fragments_purpose_details) ? state.fragments_purpose_details : [])
    ];
    const hasDebrisDetailData = debrisRows.length > 0 ||
        Object.keys(state).some(key => key.startsWith('fragment_polymer_') && parseFloat(state[key]) > 0) ||
        !!state.fragments_method_polymer_num ||
        !!state.fragments_method_polymer_other ||
        !!state.fragments_method_percent_estimate;
    const debrisCount = (parseFloat(state.fragments_count) || 0) + (parseFloat(state.packaging_count) || 0);
    const debrisMass = parseFloat(state.fragments_mass_debris_total) || 0;
    if (state.has_quantitative_data === 'yes' && hasDebrisDetailData && debrisCount <= 0 && debrisMass <= 0) {
        errors.push('Enter at least a count or a mass for debris.');
    }

    const detailTables = [
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

    detailTables.forEach(tableId => {
        const rows = Array.isArray(state[tableId]) ? state[tableId] : [];
        if (rows.length === 0) return;

        const total = rows.reduce((sum, row) => sum + (parseFloat(row.percent) || 0), 0);
        if (Math.abs(total - 100) > 0.1) {
            errors.push(`${tableId.replace(/_/g, ' ')} must total 100%.`);
        }
    });

    const hasMicroPolymerRows = Object.keys(state).some(key => key.startsWith('mp_polymer_') && parseFloat(state[key]) > 0);
    if (hasMicroPolymerRows && !state.micro_method_polymer_num) {
        errors.push('Microplastics polymer percentages require a Polymer ID Method.');
    }
    if (hasMicroPolymerRows && !state.micro_method_percent_estimate) {
        errors.push('Microplastics polymer percentages require a percent-estimation method.');
    }

    const hasFragmentPolymerRows = Object.keys(state).some(key => key.startsWith('fragment_polymer_') && parseFloat(state[key]) > 0);
    if (hasFragmentPolymerRows && !state.fragments_method_polymer_num) {
        errors.push('Fragments polymer percentages require a Polymer ID Method.');
    }
    if (hasFragmentPolymerRows && !state.fragments_method_percent_estimate) {
        errors.push('Fragments polymer percentages require a percent-estimation method.');
    }

    return { isValid: errors.length === 0, errors };
}

window.validateTask5Rules = validateTask5Rules;

// Export functions for external use
window.FormValidation = {
    validateForm,
    validateRequiredField,
    validateLatitude,
    validateLongitude,
    validateDate,
    validateNumeric,
    validateEmail,
    validateTask5Rules
};
