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

// Export functions for external use
window.FormValidation = {
    validateForm,
    validateRequiredField,
    validateLatitude,
    validateLongitude,
    validateDate,
    validateNumeric,
    validateEmail
};
