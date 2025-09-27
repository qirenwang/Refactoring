/* Fancy Modal JavaScript */

class FancyModal {
    constructor() {
        this.overlay = null;
        this.modal = null;
        this.isShowing = false;
        this.currentResolve = null;
        this.createModal();
    }

    createModal() {
        // Create modal overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'fancy-modal-overlay';
        
        // Create modal container
        this.modal = document.createElement('div');
        this.modal.className = 'fancy-modal';
        
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);
        
        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide(false);
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isShowing) {
                this.hide(false);
            }
        });
    }    show(options = {}) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            
            const {
                type = 'confirmation',
                title = 'Confirmation',
                message = '',
                details = '',
                confirmText = 'Yes',
                cancelText = 'No',
                icon = '❓',
                confirmDisabled = false
            } = options;

            // Set modal type class
            this.overlay.className = `fancy-modal-overlay ${type}`;
            
            // Build modal content
            this.modal.innerHTML = `
                <div class="fancy-modal-header">
                    <div class="fancy-modal-icon">${icon}</div>
                    <h2 class="fancy-modal-title">${title}</h2>
                </div>
                <div class="fancy-modal-body">
                    <div class="fancy-modal-message">${message}</div>
                    ${details ? `<div class="fancy-modal-details">${details}</div>` : ''}
                    <div class="fancy-modal-actions">
                        <button class="fancy-btn fancy-btn-primary ${confirmDisabled ? 'disabled' : ''}" 
                                data-action="confirm" 
                                ${confirmDisabled ? 'disabled' : ''}>
                            ${confirmText}
                        </button>
                        <button class="fancy-btn fancy-btn-secondary" data-action="cancel">
                            ${cancelText}
                        </button>
                    </div>
                </div>
            `;

            // Add event listeners to buttons
            const confirmBtn = this.modal.querySelector('[data-action="confirm"]');
            const cancelBtn = this.modal.querySelector('[data-action="cancel"]');
            
            if (!confirmDisabled) {
                confirmBtn.addEventListener('click', () => this.hide(true));
            }
            cancelBtn.addEventListener('click', () => this.hide(false));

            // Show modal with animation
            this.isShowing = true;
            this.overlay.classList.add('show');
        });
    }

    showAlert(options = {}) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            
            const {
                type = 'alert',
                title = 'Alert',
                message = '',
                details = '',
                buttonText = 'OK',
                icon = 'ℹ️'
            } = options;

            // Set modal type class
            this.overlay.className = `fancy-modal-overlay ${type}`;
            
            // Build modal content for alert (single button)
            this.modal.innerHTML = `
                <div class="fancy-modal-header">
                    <div class="fancy-modal-icon">${icon}</div>
                    <h2 class="fancy-modal-title">${title}</h2>
                </div>
                <div class="fancy-modal-body">
                    <div class="fancy-modal-message">${message}</div>
                    ${details ? `<div class="fancy-modal-details">${details}</div>` : ''}
                    <div class="fancy-modal-actions">
                        <button class="fancy-btn fancy-btn-primary" data-action="ok">
                            ${buttonText}
                        </button>
                    </div>
                </div>
            `;

            // Add event listener to button
            const okBtn = this.modal.querySelector('[data-action="ok"]');
            okBtn.addEventListener('click', () => this.hide(true));

            // Show modal with animation
            this.isShowing = true;
            this.overlay.classList.add('show');
        });
    }

    showProgress(options = {}) {
        const {
            title = 'Processing...',
            message = 'Please wait while we process your request.',
            icon = '⏳'
        } = options;

        // Set modal type class
        this.overlay.className = 'fancy-modal-overlay progress';
        
        // Build modal content for progress (no buttons)
        this.modal.innerHTML = `
            <div class="fancy-modal-header">
                <div class="fancy-modal-icon">${icon}</div>
                <h2 class="fancy-modal-title">${title}</h2>
            </div>
            <div class="fancy-modal-body">
                <div class="fancy-modal-message">${message}</div>
            </div>
        `;

        // Show modal with animation
        this.isShowing = true;
        this.overlay.classList.add('show');
    }

    hide(result = false) {
        if (!this.isShowing) return;
        
        this.isShowing = false;
        this.overlay.classList.remove('show');
        
        // Wait for animation to complete before resolving
        setTimeout(() => {
            if (this.currentResolve) {
                this.currentResolve(result);
                this.currentResolve = null;
            }
        }, 300);
    }

    destroy() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.modal = null;
        this.isShowing = false;
        this.currentResolve = null;
    }
}

// Global instance
window.fancyModal = new FancyModal();

// Helper functions for common use cases
window.fancyConfirm = function(message, title = 'Confirmation', options = {}) {
    return window.fancyModal.show({
        title,
        message,
        ...options
    });
};

window.fancyAlert = function(message, title = 'Alert', options = {}) {
    return window.fancyModal.showAlert({
        title,
        message,
        ...options
    });
};

window.showLocationConfirmationModal = function(locationName) {
    return window.fancyModal.show({
        type: 'location-confirmation',
        title: 'Confirm Location Selection',
        message: `You have selected an existing location:`,
        details: `📍 ${locationName}`,
        confirmText: 'Continue with this location',
        cancelText: 'Go back and change',
        icon: '📍'
    });
};

window.showNewLocationConfirmationModal = async function(locationData) {
    // First check if location name already exists in database
    let locationExists = false;
    let errorMessage = '';
    
    if (locationData.name && locationData.name.trim()) {
        try {
            const response = await fetch(`/api/check-location-exists?name=${encodeURIComponent(locationData.name.trim())}`);
            const result = await response.json();
            locationExists = result.exists;
        } catch (error) {
            console.error('Error checking location existence:', error);
            errorMessage = 'Data has already been entered for this location name.  If you re-visited the same location and want to enter new data (repeat measures), please select it from the pull-down box in #1 above, instead of entering it here.';
        }
    }
    
    let details, message, confirmText, confirmDisabled;
    
    if (locationExists) {
        // Location already exists - show warning message
        message = 'Data has already been entered for this location name. If you re-visited the same location and want to enter new data (repeat measures), please select it from the pull-down box in #1 above, instead of entering it here.';
        details = `Location Name: ${locationData.name || 'Not specified'} ⚠️ (Already exists)
Location Short Code: ${locationData.shortcode || 'Not specified'}
Location Description: ${locationData.description || 'Not specified'}
Latitude: ${locationData.latitude || 'Not specified'}
Longitude: ${locationData.longitude || 'Not specified'}
Address: ${locationData.address || 'Not specified'}
Zip Code: ${locationData.zipcode || 'Not specified'}`;
        confirmText = 'Save and Continue (Disabled)';
        confirmDisabled = true;
    } else if (errorMessage) {
        // Error occurred during check
        message = errorMessage;
        details = `Location Name: ${locationData.name || 'Not specified'} ❌ (Verification failed)
Location Short Code: ${locationData.shortcode || 'Not specified'}
Location Description: ${locationData.description || 'Not specified'}
Latitude: ${locationData.latitude || 'Not specified'}
Longitude: ${locationData.longitude || 'Not specified'}
Address: ${locationData.address || 'Not specified'}
Zip Code: ${locationData.zipcode || 'Not specified'}`;
        confirmText = 'Save and Continue (Disabled)';
        confirmDisabled = true;
    } else {
        // Location doesn't exist - show normal confirmation
        message = 'You are about to create a new location with the following details:';
        details = `Location Name: ${locationData.name || 'Not specified'}
Location Short Code: ${locationData.shortcode || 'Not specified'}
Location Description: ${locationData.description || 'Not specified'}
Latitude: ${locationData.latitude || 'Not specified'}
Longitude: ${locationData.longitude || 'Not specified'}
Address: ${locationData.address || 'Not specified'}
Zip Code: ${locationData.zipcode || 'Not specified'}`;
        confirmText = 'Save and Continue';
        confirmDisabled = false;
    }

    return window.fancyModal.show({
        type: 'new-location',
        title: 'Confirm New Location',
        message: message,
        details: details,
        confirmText: confirmText,
        cancelText: 'Go back and edit',
        icon: locationExists || errorMessage ? '⚠️' : '✨',
        confirmDisabled: confirmDisabled
    });
};

window.showProgress = function(title = 'Processing...', message = 'Please wait...') {
    window.fancyModal.showProgress({ title, message });
};

window.hideProgress = function() {
    window.fancyModal.hide();
};

window.showSuccessMessage = function(message, title = 'Success') {
    return window.fancyModal.showAlert({
        type: 'success',
        title,
        message,
        icon: '✅',
        buttonText: 'Continue'
    });
};

window.showErrorMessage = function(message, title = 'Error') {
    return window.fancyModal.showAlert({
        type: 'error',
        title,
        message,
        icon: '❌',
        buttonText: 'OK'
    });
};
