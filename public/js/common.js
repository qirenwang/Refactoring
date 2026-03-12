/**
 * Common JavaScript functions for all pages
 */

// Document ready function
document.addEventListener('DOMContentLoaded', function() {
    // Initialize timeout modal if user is logged in
    if (document.getElementById('timeout-modal')) {
        initSessionTimeout();
    }
    
    // Initialize location dropdown if it exists on the page
    if (document.getElementById('location-select')) {
        fetchLocations();
    }
});

// Function to fetch locations (common across multiple pages)
function fetchLocations() {
    const selectElement = document.getElementById('location-select');
    const loadingElement = document.getElementById('location-loading');

    // Skip if elements don't exist on current page
    if (!selectElement) return;

    // Show loading message if loading element exists
    if (loadingElement) {
        loadingElement.classList.remove('hidden');
        selectElement.classList.add('hidden');
    }

    // Fetch locations from the new API endpoint
    fetch('/api/locations')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.locations) {
                // Hide loading message and show select
                if (loadingElement) {
                    loadingElement.classList.add('hidden');
                    selectElement.classList.remove('hidden');
                }

                // Clear existing options (except first one)
                while (selectElement.options.length > 1) {
                    selectElement.remove(1);
                }

                // Add options from data
                if (data.locations.length > 0) {
                    data.locations.forEach(location => {
                        const option = document.createElement('option');
                        option.value = location.id;
                        // Display format: "LocationName (UserLocID)" or just "LocationName" if no UserLocID
                        const displayText = location.userLocId ? 
                            `${location.name} (${location.userLocId})` : 
                            location.name;
                        option.textContent = displayText;
                        
                        // Add additional data as attributes for future use
                        option.setAttribute('data-name', location.name ?? '');
                        option.setAttribute('data-user-loc-id', location.userLocId ?? '');
                        option.setAttribute('data-description', location.description ?? '');
                        option.setAttribute('data-city', location.city ?? '');
                        option.setAttribute('data-state', location.state ?? '');
                        option.setAttribute('data-zipcode', location.zipCode ?? '');
                        option.setAttribute('data-latitude', location.latitude ?? '');
                        option.setAttribute('data-longitude', location.longitude ?? '');
                        
                        selectElement.appendChild(option);
                    });
                } else {
                    const option = document.createElement('option');
                    option.value = "";
                    option.textContent = "No locations found";
                    selectElement.appendChild(option);
                }
            } else {
                if (loadingElement) {
                    loadingElement.textContent = 'Error loading locations: ' + (data.message || 'Unknown error');
                } else {
                    console.error('Error loading locations:', data.message || 'Unknown error');
                }
            }
        })
        .catch(error => {
            if (loadingElement) {
                loadingElement.textContent = 'Error connecting to server';
            }
            console.error('Error fetching locations:', error);
        });
}

// Initialize session timeout handling
function initSessionTimeout() {
    // Get timeout value from the script data attribute or use default
    const timeoutModal = document.getElementById('timeout-modal');
    if (!timeoutModal) return;

    const sessionTimeout = parseInt(timeoutModal.getAttribute('data-timeout') || '300') * 1000;

    // Track user activity to prevent timeout
    let activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    let inactivityTime = function() {
        let time = 0;
        let timer;

        // Reset timer on user activity
        function resetTimer() {
            time = 0;
        }

        // Check every minute
        timer = setInterval(function() {
            time = time + 60000; // Add 1 minute
            if (time >= sessionTimeout) {
                document.getElementById('timeout-modal').style.display = 'flex';
                clearInterval(timer);
            }
        }, 60000); // Check every minute

        // Reset timer on activity events
        activityEvents.forEach(function(event) {
            document.addEventListener(event, resetTimer);
        });
    };

    // Start inactivity timer
    inactivityTime();
}

// Close modal function
function closeModal() {
    console.log('closeModal() called');
    const modal = document.getElementById('timeout-modal');
    if (modal) {
        console.log('Modal found, hiding it');
        modal.style.display = 'none';
    } else {
        console.error('Modal with ID "timeout-modal" not found');
    }
}

// Show modal function (for testing)
function showModal() {
    console.log('showModal() called');
    const modal = document.getElementById('timeout-modal');
    if (modal) {
        console.log('Modal found, showing it');
        modal.style.display = 'flex';
    } else {
        console.error('Modal with ID "timeout-modal" not found');
    }
}

// Logout function
function logout() {
    console.log('logout() called');
    // Use fetch to call the logout API endpoint
    fetch('/auth/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
    })
    .then(response => {
        console.log('Logout response received', response);
        return response.json();
    })
    .then(data => {
        console.log('Logout data:', data);
        if (data.success) {
            // Redirect to login page
            window.location.href = data.redirectUrl || '/login';
        } else {
            console.error('Logout failed:', data.message);
            // Fallback: redirect to login anyway
            window.location.href = '/login';
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
        // Fallback: redirect to login anyway
        window.location.href = '/login';
    });
}
