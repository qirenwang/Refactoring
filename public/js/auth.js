/**
 * Authentication JavaScript
 * Handles login, signup, password reset, and captcha functionality
 */

// Utility function to show alerts
function showAlert(type, message) {
    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        const formContainer = document.querySelector('.form-container');
        const form = formContainer.querySelector('form');
        formContainer.insertBefore(errorDiv, form);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Utility function to hide alerts
function hideAlert() {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// Global function for refreshing captcha (needed by templates)
function refreshCaptcha() {
    const captchaImage = document.getElementById('captcha-image');
    if (captchaImage) {
        captchaImage.src = '/auth/captcha?' + Math.random();
        const captchaInput = document.getElementById('captcha');
        if (captchaInput) {
            captchaInput.value = '';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializeAuthForms();
    initializeCaptcha();
});

function initializeAuthForms() {
    setupLoginForm();
    setupSignupForm();
    setupPasswordResetForm();
    setupPasswordStrengthMeter();
}

function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const submitButton = this.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        // Show loading state
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitButton.disabled = true;
          // Get form data
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        
        // Submit form via AJAX
        fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())        .then(data => {
            if (data.success) {
                // Redirect to dashboard or intended page
                window.location.href = data.redirectUrl || '/home';
            } else {
                showAlert('danger', data.message);
                refreshCaptcha();
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            showAlert('danger', 'An error occurred during login. Please try again.');
            refreshCaptcha();
        })
        .finally(() => {
            // Restore button state
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        });
    });
}

function setupSignupForm() {
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) return;
    
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Check password confirmation
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm_password').value;
        
        if (password !== confirmPassword) {
            showAlert('danger', 'Passwords do not match');
            return;
        }
        
        const submitButton = this.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        // Show loading state
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitButton.disabled = true;        // Get form data
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        
        // Submit form via AJAX
        fetch('/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showAlert('success', 'Account created successfully! Redirecting...');
                // Redirect to home page after a delay
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/home';
                }, 2000);
            } else {
                showAlert('danger', data.message);
                refreshCaptcha();
            }
        })        .catch(error => {
            console.error('Signup error:', error);
            showAlert('danger', 'An error occurred during signup. Please try again.');
            refreshCaptcha();
        })
        .finally(() => {
            // Restore button state
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        });
    });
}

function setupPasswordResetForm() {
    const resetRequestForm = document.getElementById('reset-request-form');
    const resetForm = document.getElementById('reset-form');
    
    if (resetRequestForm) {
        resetRequestForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const submitButton = this.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitButton.disabled = true;
            
            const formData = new FormData(this);
            
            fetch('/auth/reset-password-request', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showEmailSentMessage();
                } else {
                    showAlert('danger', data.message);
                }
            })
            .catch(error => {
                console.error('Password reset request error:', error);
                showAlert('danger', 'An error occurred. Please try again.');
            })
            .finally(() => {
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
            });
        });
    }
    
    if (resetForm) {
        resetForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            
            if (newPassword !== confirmPassword) {
                showAlert('danger', 'Passwords do not match');
                return;
            }
            
            const submitButton = this.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
            submitButton.disabled = true;
            
            const formData = new FormData(this);
            
            fetch('/auth/reset-password', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showAlert('success', 'Password reset successfully! You can now log in with your new password.');
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 3000);
                } else {
                    showAlert('danger', data.message);
                }
            })
            .catch(error => {
                console.error('Password reset error:', error);
                showAlert('danger', 'An error occurred. Please try again.');
            })
            .finally(() => {
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
            });
        });
    }
}

function setupPasswordStrengthMeter() {
    const passwordField = document.getElementById('password');
    const newPasswordField = document.getElementById('new-password');
    
    if (passwordField) {
        passwordField.addEventListener('input', function() {
            updatePasswordStrength(this.value, 'password-strength');
        });
    }
    
    if (newPasswordField) {
        newPasswordField.addEventListener('input', function() {
            updatePasswordStrength(this.value, 'new-password-strength');
        });
    }
}

function updatePasswordStrength(password, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const strength = checkPasswordStrength(password);
    
    container.innerHTML = `
        <div class="password-strength-meter">
            <div class="strength-bar">
                <div class="strength-fill strength-${strength.level}" style="width: ${strength.score * 25}%"></div>
            </div>
            <div class="strength-text">Password strength: ${strength.level}</div>
            ${strength.feedback.length > 0 ? '<ul class="strength-feedback">' + strength.feedback.map(item => `<li>${item}</li>`).join('') + '</ul>' : ''}
        </div>
    `;
}

function checkPasswordStrength(password) {
    let score = 0;
    let feedback = [];
    
    if (password.length < 6) {
        feedback.push('Password should be at least 6 characters long');
    } else {
        score += 1;
    }
    
    if (password.length >= 8) {
        score += 1;
    } else if (password.length >= 6) {
        feedback.push('Use 8 or more characters for better security');
    }
    
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
        score += 1;
    } else {
        feedback.push('Use both uppercase and lowercase letters');
    }
    
    if (/\d/.test(password)) {
        score += 1;
    } else {
        feedback.push('Include at least one number');
    }
    
    if (/[^a-zA-Z0-9]/.test(password)) {
        score += 1;
    } else {
        feedback.push('Include special characters (!@#$%^&*)');
    }
    
    const levels = ['very-weak', 'weak', 'fair', 'good', 'strong'];
    const level = levels[Math.min(score, 4)];
    
    return {
        score: score,
        level: level,
        feedback: feedback
    };
}

function initializeCaptcha() {
    const captchaImage = document.getElementById('captcha-image');
    if (captchaImage) {
        captchaImage.addEventListener('click', refreshCaptcha);
    }
    
    // Add refresh button if it exists
    const refreshButton = document.getElementById('refresh-captcha');
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshCaptcha);
    }
}

function refreshCaptcha() {
    const captchaImage = document.getElementById('captcha-image');
    if (captchaImage) {
        // Add timestamp to prevent caching
        const timestamp = new Date().getTime();
        captchaImage.src = '/auth/captcha?' + timestamp;
    }
    
    // Clear captcha input
    const captchaInput = document.getElementById('captcha');
    if (captchaInput) {
        captchaInput.value = '';
        captchaInput.classList.remove('is-valid', 'is-invalid');
    }
}

function showEmailSentMessage() {
    const requestSection = document.getElementById('request-section');
    const sentSection = document.getElementById('sent-section');
    
    if (requestSection && sentSection) {
        requestSection.style.display = 'none';
        sentSection.style.display = 'block';
    } else {
        showAlert('success', 'Password reset email sent! Please check your inbox.');
    }
}

function showResetForm(token) {
    const requestSection = document.getElementById('request-section');
    const resetSection = document.getElementById('reset-section');
    const tokenInput = document.getElementById('token');
    
    if (requestSection && resetSection && tokenInput) {
        requestSection.style.display = 'none';
        resetSection.style.display = 'block';
        tokenInput.value = token;
    }
}

function showAlert(type, message) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert">
            <span>&times;</span>
        </button>
    `;
    
    // Find the best container to insert the alert
    let container = document.querySelector('.form-container');
    if (!container) {
        container = document.querySelector('.auth-body');
    }
    if (!container) {
        container = document.querySelector('.login-container, .signup-container, .reset-container');
    }
    if (!container) {
        container = document.body;
    }
    
    // Insert at the top of the container, before the first form
    const form = container.querySelector('form');
    if (form) {
        container.insertBefore(alertDiv, form);
    } else {
        container.insertBefore(alertDiv, container.firstChild);
    }
    
    // Add click handler for close button
    const closeButton = alertDiv.querySelector('.close');
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            alertDiv.remove();
        });
    }
    
    // Auto-dismiss success alerts
    if (type === 'success') {
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }
}

// Test captcha functionality
function testCaptcha() {
    const captchaInput = document.getElementById('test-captcha-input');
    const testButton = document.getElementById('test-captcha-button');
    
    if (!captchaInput || !testButton) return;
    
    const originalText = testButton.innerHTML;
    testButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    testButton.disabled = true;
    
    const formData = new FormData();
    formData.append('captcha', captchaInput.value);
    
    fetch('/auth/test-captcha', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('success', 'Captcha verification successful!');
        } else {
            showAlert('danger', data.message);
        }
        refreshCaptcha();
        captchaInput.value = '';
    })
    .catch(error => {
        console.error('Captcha test error:', error);
        showAlert('danger', 'Error testing captcha. Please try again.');
        refreshCaptcha();
    })
    .finally(() => {
        testButton.innerHTML = originalText;
        testButton.disabled = false;
    });
}

// Export functions for external use
window.Auth = {
    refreshCaptcha,
    testCaptcha,
    checkPasswordStrength,
    showAlert,
    showResetForm
};
