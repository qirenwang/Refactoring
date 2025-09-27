/**
 * Session Timeout Management
 * 
 * This script handles the client-side aspect of session timeouts.
 * It periodically checks if the user's session is still active and
 * displays a notification when the session expires.
 */

// Session check interval in milliseconds (e.g., every 5 seconds)
// const SESSION_CHECK_INTERVAL = 5000;
const SESSION_CHECK_INTERVAL = 30000;

// Track if we've already shown the timeout message
let timeoutMessageShown = false;
let sessionCheckerInitialized = false;

// Start the session checker when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // First check if the user is logged in before initializing the session checker
    checkUserLoginStatus();
});

/**
 * Check if user is logged in before initializing the session checker
 */
function checkUserLoginStatus() {
    // Don't initialize on login or signup pages
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'login' || currentPage === 'signup' ||
        currentPage === 'reset_password') {
        return;
    }

    fetch('/api/check-session', {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
        .then(response => response.json())
        .then(data => {
            // Only initialize the session checker if the user is logged in
            if (data.hasOwnProperty('logged_in') && data.logged_in === true) {
                initSessionChecker();
            }
        })
        .catch(error => {
            console.error('Login status check error:', error);
        });
}

/**
 * Initialize the session checker
 */
function initSessionChecker() {
    // Don't initialize more than once
    if (sessionCheckerInitialized) {
        return;
    }

    sessionCheckerInitialized = true;

    // Start periodic session checking
    setInterval(checkSession, SESSION_CHECK_INTERVAL);

    console.log('Session checker initialized');
}

/**
 * Check if the session is still active
 */
function checkSession() {
    fetch('/api/check-session', {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
        .then(response => response.json())
        .then(data => {
            // First check if user is still logged in
            if (data.hasOwnProperty('logged_in') && data.logged_in === false) {
                // User is no longer logged in, stop session checking
                sessionCheckerInitialized = false;
                return;
            }

            // If session has timed out and we haven't shown the message yet
            if (data.hasOwnProperty('timeout') && data.timeout === true && !timeoutMessageShown) {
                timeoutMessageShown = true;
                showTimeoutMessage(data.message || 'Logging out after a long time of inactivity');
            }
        })
        .catch(error => {
            console.error('Session check error:', error);
        });
}

/**
 * Display the session timeout message with options to log in again or close
 */
function showTimeoutMessage(message) {
    // Create modal background overlay
    const overlay = document.createElement('div');
    overlay.id = 'session-timeout-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';

    // Create modal dialog
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.padding = '20px';
    modal.style.borderRadius = '5px';
    modal.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    modal.style.textAlign = 'center';
    modal.style.maxWidth = '400px';
    modal.style.width = '80%';
    modal.style.position = 'relative';

    // Add close button (X) in the top-right corner
    const closeX = document.createElement('span');
    closeX.innerHTML = '&times;';
    closeX.style.position = 'absolute';
    closeX.style.top = '5px';
    closeX.style.right = '10px';
    closeX.style.fontSize = '24px';
    closeX.style.fontWeight = 'bold';
    closeX.style.cursor = 'pointer';
    closeX.style.color = '#888';
    closeX.onclick = function() {
        document.body.removeChild(document.getElementById('session-timeout-overlay'));
    };
    closeX.onmouseover = function() {
        closeX.style.color = '#000';
    };
    closeX.onmouseout = function() {
        closeX.style.color = '#888';
    };
    modal.appendChild(closeX);

    // Add title to the modal
    const title = document.createElement('h3');
    title.textContent = 'Session Timeout';
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    modal.appendChild(title);

    // Add timeout message
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.style.marginBottom = '20px';
    messageElement.style.fontSize = '16px';
    modal.appendChild(messageElement);

    // Add button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.gap = '10px';

    // Add login button
    const loginButton = document.createElement('button');
    loginButton.textContent = 'Log in again';
    loginButton.style.padding = '8px 16px';
    loginButton.style.backgroundColor = '#4285f4';
    loginButton.style.color = 'white';
    loginButton.style.border = 'none';
    loginButton.style.borderRadius = '4px';
    loginButton.style.cursor = 'pointer';    loginButton.onclick = function() {
        window.location.href = '/login';
    };
    buttonContainer.appendChild(loginButton);

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Continue browsing';
    closeButton.style.padding = '8px 16px';
    closeButton.style.backgroundColor = '#f5f5f5';
    closeButton.style.color = '#333';
    closeButton.style.border = '1px solid #ddd';
    closeButton.style.borderRadius = '4px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = function() {
        document.body.removeChild(document.getElementById('session-timeout-overlay'));
    };
    buttonContainer.appendChild(closeButton);

    modal.appendChild(buttonContainer);

    // Add modal to overlay
    overlay.appendChild(modal);

    // Add overlay to page
    document.body.appendChild(overlay);
}