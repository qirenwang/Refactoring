/**
 * JavaScript for the enter_and_edit_data.php page
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the home map with Detroit center
    if (document.getElementById('home-map')) {
        initHomeMap();
    }
});

// Initialize the interactive map centered on Detroit with 10 random data points
function initHomeMap() {
    // Detroit, Michigan coordinates
    const detroitLat = 42.3314;
    const detroitLng = -83.0458;

    // Create the map centered on Detroit
    const map = L.map('home-map').setView([detroitLat, detroitLng], 12);

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
        '#66c2a5' // teal
    ];

    // Define sample types
    const sampleTypes = [
        'sample type 1',
        'sample type 2',
        'sample type 3',
        'sample type 4',
        'sample type 5',
        'sample type 6',
        'sample type 7',
        'sample type 8',
        'sample type 9',
        'sample type 10'
    ];

    // Generate 10 random points around Detroit
    const points = generateRandomPoints(detroitLat, detroitLng, 10, 0.05);

    // Add each point to the map
    points.forEach((point, index) => {
        // Create a custom colored marker
        const markerColor = markerColors[index % markerColors.length];
        const sampleType = sampleTypes[index % sampleTypes.length];

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
        const marker = L.marker([point.lat, point.lng], { icon: icon }).addTo(map);

        // Generate random data values
        const microplasticCount = Math.floor(Math.random() * 300) + 10;
        const collectionDate = getRandomDate();

        // Add popup with sample information
        marker.bindPopup(`
            <div class="marker-popup">
                <h4>${sampleType}</h4>
                <p>Location: <span class="data-value">${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</span></p>
                <p>Microplastic Count: <span class="data-value">${microplasticCount}</span></p>
                <p>Collected: <span class="data-value">${collectionDate}</span></p>
            </div>
        `);
    });

    // Update the map legend with the marker colors and sample types
    updateMapLegend(markerColors, sampleTypes);
}

// Generate random points around a center point
function generateRandomPoints(centerLat, centerLng, numPoints, radius) {
    const points = [];

    for (let i = 0; i < numPoints; i++) {
        // Generate a random angle and distance within the radius
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * radius;

        // Convert to lat/lng offset 
        // Note: Simple approximation, works for small distances
        const latOffset = distance * Math.cos(angle);
        const lngOffset = distance * Math.sin(angle) / Math.cos(centerLat * Math.PI / 180);

        points.push({
            lat: centerLat + latOffset,
            lng: centerLng + lngOffset
        });
    }

    return points;
}

// Generate a random date within the last 2 years
function getRandomDate() {
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setFullYear(today.getFullYear() - 2);

    const randomTime = pastDate.getTime() + Math.random() * (today.getTime() - pastDate.getTime());
    const randomDate = new Date(randomTime);

    return randomDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Update the map legend with the marker colors and sample types
function updateMapLegend(colors, types) {
    const legend = document.querySelector('.map-legend');
    if (!legend) return;

    legend.innerHTML = ''; // Clear existing legend

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
            const color = colors[index % colors.length];

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