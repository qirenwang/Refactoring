/**
 * Main application JavaScript file
 * Common functionality across all pages
 */

$(document).ready(function() {
    // Initialize common components
    initializeCommonComponents();
    
    // Setup global event listeners
    setupGlobalEventListeners();
    
    // Initialize session timeout if user is logged in
    if (window.userLoggedIn) {
        initSessionTimeout();
    }
});

function initializeCommonComponents() {
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
    
    // Initialize popovers
    $('[data-toggle="popover"]').popover();
    
    // Setup auto-dismissing alerts
    setupAutoAlerts();
}

function setupGlobalEventListeners() {
    // Handle logout dropdown
    $(document).on('click', '.user-dropdown .dropdown-toggle', function(e) {
        e.preventDefault();
        $(this).next('.dropdown-menu').toggle();
    });
    
    // Close dropdown when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.user-dropdown').length) {
            $('.dropdown-menu').hide();
        }
    });
    
    // Handle form validation
    setupFormValidation();
}

function setupAutoAlerts() {
    // Auto-dismiss alerts after 5 seconds
    $('.alert').each(function() {
        const alert = $(this);
        if (alert.hasClass('alert-success') || alert.hasClass('alert-info')) {
            setTimeout(function() {
                alert.fadeOut();
            }, 5000);
        }
    });
}

function setupFormValidation() {
    // Add Bootstrap form validation
    $('.needs-validation').on('submit', function(event) {
        if (!this.checkValidity()) {
            event.preventDefault();
            event.stopPropagation();
        }
        $(this).addClass('was-validated');
    });
    
    // Real-time validation feedback
    $('.form-control').on('input change', function() {
        const field = $(this);
        const form = field.closest('.needs-validation');
        
        if (form.hasClass('was-validated')) {
            if (this.checkValidity()) {
                field.removeClass('is-invalid').addClass('is-valid');
            } else {
                field.removeClass('is-valid').addClass('is-invalid');
            }
        }
    });
}

// Utility Functions
function showAlert(message, type = 'info') {
    const alertTypes = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    };
    
    const alertClass = alertTypes[type] || 'alert-info';
    
    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
    `;
    
    // Find the best place to insert the alert
    let container = $('.main-content').first();
    if (container.length === 0) {
        container = $('body');
    }
    
    container.prepend(alertHtml);
    
    // Auto-dismiss after 5 seconds for success/info alerts
    if (type === 'success' || type === 'info') {
        setTimeout(function() {
            container.find('.alert').first().alert('close');
        }, 5000);
    }
}

function formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';
    
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    switch (format) {
        case 'MM/DD/YYYY':
            return `${month}/${day}/${year}`;
        case 'DD/MM/YYYY':
            return `${day}/${month}/${year}`;
        case 'YYYY-MM-DD':
        default:
            return `${year}-${month}-${day}`;
    }
}

function validateCoordinates(latitude, longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    return {
        valid: !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
        latitude: lat,
        longitude: lng
    };
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// AJAX utilities
function makeRequest(url, options = {}) {
    const defaults = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const config = Object.assign(defaults, options);
    
    return fetch(url, config)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        });
}

// Export functions for use in other modules
window.AppUtils = {
    showAlert,
    formatDate,
    validateCoordinates,
    formatFileSize,
    makeRequest
};
