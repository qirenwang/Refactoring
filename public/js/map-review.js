/**
 * Review page map and filter functionality
 */

// Document ready function for review page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map if the map element exists on this page
    if (document.getElementById('map')) {
        initReviewMap();
    }
});

// Initialize the map for the review page
function initReviewMap() {
    // Initialize map
    const map = L.map('map').setView([39.8283, -98.5795], 4); // Center on USA

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Store markers for later reference
    let markers = [];
    let markerLayer = L.layerGroup().addTo(map);

    // Event listener for Apply Filters button
    document.getElementById('apply-filters').addEventListener('click', function() {
        const zipcodeInput = document.getElementById('zipcode-filter').value.trim();
        const plasticTypeInput = document.getElementById('plastic-type-filter').value;
        
        const filters = {};
        
        // Validate and add zipcode filter
        if (zipcodeInput) {
            // Ensure zipcode is numeric and 5 digits
            if (/^\d{5}$/.test(zipcodeInput)) {
                filters.zipcode = zipcodeInput;
            } else {
                alert('Please enter a valid 5-digit ZIP code.');
                return;
            }
        }
        
        // Add plastic type filter
        if (plasticTypeInput) {
            filters.plastic_type = plasticTypeInput;
        }

        loadMapData(filters);
    });

    // Event listener for Reset Filters button
    document.getElementById('reset-filters').addEventListener('click', function() {
        document.getElementById('zipcode-filter').value = '';
        document.getElementById('plastic-type-filter').value = '';

        loadMapData();
    });

    // Initial load of map data
    loadMapData();

    // Add test data button functionality (development only)
    const addTestDataBtn = document.getElementById('add-test-data');
    if (addTestDataBtn) {
        addTestDataBtn.addEventListener('click', function() {
            const statusSpan = document.getElementById('test-data-status');
            statusSpan.textContent = 'Adding test data...';
            statusSpan.style.color = 'blue';
            
            fetch('/api/add-test-location-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusSpan.textContent = data.message;
                    statusSpan.style.color = 'green';
                    // Reload map data to show new test locations
                    loadMapData();
                } else {
                    statusSpan.textContent = 'Error: ' + data.message;
                    statusSpan.style.color = 'red';
                }
            })
            .catch(error => {
                statusSpan.textContent = 'Error: ' + error.message;
                statusSpan.style.color = 'red';
            });
        });
    }

    // Function to load data from API
    function loadMapData(filters = {}) {
        // Show loading indicator
        document.getElementById('map-loading').classList.remove('hidden');

        // Build query string from filters
        const queryParams = new URLSearchParams();
        if (filters.zipcode) queryParams.append('zipcode', filters.zipcode);
        if (filters.plastic_type) queryParams.append('plastic_type', filters.plastic_type);

        console.log('Loading map data with filters:', filters);
        console.log('Query params:', queryParams.toString());

        // Fetch data from API
        fetch(`/api/php/get_map_data.php?${queryParams.toString()}`)
            .then(response => {
                console.log('Response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Received data:', data);
                
                // Hide loading indicator
                document.getElementById('map-loading').classList.add('hidden');

                if (data.success) {
                    // Clear existing markers
                    markerLayer.clearLayers();
                    markers = [];

                    if (data.count > 0) {
                        console.log(`Adding ${data.count} markers to map`);
                        
                        // Add new markers
                        data.data.forEach(point => {
                            console.log('Adding marker for point:', point);
                            
                            const marker = L.marker([point.lat, point.lng])
                                .bindPopup(`
                                    <div class="marker-popup">
                                        <h4>${point.location}</h4>
                                        <p><strong>ZIP Code:</strong> ${point.zipCode}</p>
                                        <p><strong>Sample Type:</strong> ${point.sampleType}</p>
                                        <p><strong>Date:</strong> ${formatDate(point.date)}</p>
                                        <p><strong>Particle Count:</strong> ${point.particleCount}</p>
                                        <p><strong>Coordinates:</strong> ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</p>
                                    </div>
                                `)
                                .on('click', () => showPointDetails(point));

                            markers.push({
                                marker: marker,
                                data: point
                            });

                            markerLayer.addLayer(marker);
                        });

                        // Fit bounds to markers if we have any
                        if (markers.length > 0) {
                            const bounds = L.featureGroup(markers.map(m => m.marker)).getBounds();
                            map.fitBounds(bounds);
                        }
                    } else {
                        console.log('No data found for current filters');
                        // No data found
                        showNoDataMessage();
                    }
                } else {
                    console.error('API returned error:', data.message);
                    // Error fetching data
                    showErrorMessage(data.message);
                }
            })
            .catch(error => {
                console.error('Fetch error:', error);
                document.getElementById('map-loading').classList.add('hidden');
                showErrorMessage('Error loading map data: ' + error.message);
            });
    }

    // Function to show point details in the results section
    function showPointDetails(point) {
        // Hide no selection message and show details
        document.getElementById('no-selection').classList.add('hidden');
        document.getElementById('point-details').classList.remove('hidden');

        // Populate details
        document.getElementById('location-name').textContent = point.location;
        document.getElementById('sample-date').textContent = formatDate(point.date);
        document.getElementById('detail-zipcode').textContent = point.zipCode || 'N/A';
        document.getElementById('detail-sample-type').textContent = point.sampleType || 'N/A';
        document.getElementById('detail-plastic-types').textContent = point.plasticTypes || 'N/A';
        document.getElementById('detail-particle-count').textContent = point.particleCount;
        document.getElementById('detail-coordinates').textContent =
            `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    }

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Show no data message
    function showNoDataMessage() {
        document.getElementById('no-selection').classList.remove('hidden');
        document.getElementById('point-details').classList.add('hidden');
        document.getElementById('no-selection').innerHTML =
            'No data points found for the current filter criteria.';
    }

    // Show error message
    function showErrorMessage(message) {
        document.getElementById('no-selection').classList.remove('hidden');
        document.getElementById('point-details').classList.add('hidden');
        document.getElementById('no-selection').innerHTML =
            `<div class="error-message">Error: ${message}</div>`;
    }
}