/**
 * Home page map initialization and functions
 * Displays real sample data from the database
 */

// Document ready function for home page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the home map
    if (document.getElementById('home-map')) {
        initHomeMap();
    }
});

// Initialize the interactive map centered on Great Lakes region with real data
function initHomeMap() {
    // Great Lakes region center (covers Detroit area and surrounding)
    const centerLat = 43.5;
    const centerLng = -84.0;

    // Create the map
    const map = L.map('home-map').setView([centerLat, centerLng], 6);

    // Add the tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Define different marker colors for different sample types
    const markerColors = [
        '#e41a1c', // red
        '#377eb8', // blue
        '#4daf4a', // green
        '#984ea3', // purple
        '#ff7f00', // orange
        '#ffff33', // yellow
        '#a65628', // brown
        '#f781bf', // pink
        '#999999', // grey
        '#66c2a5'  // teal
    ];

    // Fetch real map data from the API
    fetch('/api/map-data')
        .then(response => response.json())
        .then(response => {
            if (response.success && Array.isArray(response.data)) {
                const points = response.data;
                const markers = [];
                const sampleTypesSet = new Set();

                // Add each point to the map
                points.forEach((point) => {
                    // Convert field names from API
                    const lat = parseFloat(point.lat || point.latitude);
                    const lng = parseFloat(point.lng || point.longitude);
                    const location = point.location || point.location_name;
                    const sampleType = point.sampleType || point.sample_type || 'Unknown';
                    const date = point.date || point.collection_date;

                    if (!lat || !lng) return;

                    // Track sample types for the legend
                    sampleTypesSet.add(sampleType);

                    // Assign a color based on the sample type (hashing the string to pick a color)
                    const markerColor = getColorForType(sampleType, markerColors);

                    const markerHtml = `
                        <div style="background-color: ${markerColor}; width: 12px; height: 12px;
                        border-radius: 50%; border: 2px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.4)"></div>
                    `;

                    const icon = L.divIcon({
                        html: markerHtml,
                        className: 'custom-marker',
                        iconSize: [16, 16],
                        iconAnchor: [8, 8],
                        popupAnchor: [0, -8]
                    });

                    // Create the marker
                    const marker = L.marker([lat, lng], { icon: icon }).addTo(map);

                    // Format date
                    const dateStr = date ? new Date(date).toLocaleDateString() : 'N/A';

                    // Add popup with sample information
                    marker.bindPopup(`
                        <div class="marker-popup">
                            <h4>${sampleType}</h4>
                            <p>Location: <span class="data-value">${location || 'N/A'}</span></p>
                            <p>Particle Count: <span class="data-value">${point.particleCount || 1}</span></p>
                            <p>Coordinates: <span class="data-value">${lat.toFixed(4)}, ${lng.toFixed(4)}</span></p>
                            <p>Collected: <span class="data-value">${dateStr}</span></p>
                        </div>
                    `);

                    markers.push(marker);
                });

                // Update the map legend with actual sample types
                const sampleTypes = Array.from(sampleTypesSet);
                const legendColors = sampleTypes.map(type => getColorForType(type, markerColors));
                updateMapLegend(legendColors, sampleTypes);

                // Fit map to markers if we have any
                if (markers.length > 0) {
                    const group = L.featureGroup(markers);
                    map.fitBounds(group.getBounds().pad(0.1));
                }

                console.log(`Map loaded with ${markers.length} data points`);
            } else {
                console.warn('No map data available or API error:', response.message);
                showNoDataMessage();
            }
        })
        .catch(error => {
            console.error('Error fetching map data:', error);
            showNoDataMessage();
        });
}

// Get consistent color for a sample type
function getColorForType(type, colors) {
    let typeIndex = 0;
    for (let i = 0; i < type.length; i++) {
        typeIndex += type.charCodeAt(i);
    }
    return colors[typeIndex % colors.length];
}

// Show message when no data is available
function showNoDataMessage() {
    const legend = document.querySelector('.map-legend');
    if (legend) {
        legend.innerHTML = '<div class="legend-item"><span>No sample data available yet</span></div>';
    }
}

// Update the map legend with the marker colors and sample types
function updateMapLegend(colors, types) {
    const legend = document.querySelector('.map-legend');
    if (!legend) return;

    legend.innerHTML = ''; // Clear existing legend

    if (types.length === 0) {
        legend.innerHTML = '<div class="legend-item"><span>No data available</span></div>';
        return;
    }

    // Create rows with 4 columns each
    const itemsPerRow = 4;
    const totalRows = Math.ceil(types.length / itemsPerRow);

    for (let row = 0; row < totalRows; row++) {
        const legendRow = document.createElement('div');
        legendRow.className = 'legend-row';

        // Add up to 4 items per row
        for (let col = 0; col < itemsPerRow; col++) {
            const index = row * itemsPerRow + col;
            if (index >= types.length) break;

            const type = types[index];
            const color = colors[index];

            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <span class="legend-marker" style="background-color: ${color};"></span>
                <span>${type}</span>
            `;

            legendRow.appendChild(legendItem);
        }

        legend.appendChild(legendRow);
    }
}
