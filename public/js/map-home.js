/**
 * Home page map initialization and functions
 * Displays real sample data from the database
 */

/**
 * Fixed marker colors by sampling medium (MediaType_WithinLitterWaterSoil_Ref.MediaTypeOverall).
 * Colors encode the medium only; they are deliberately not a red/orange "heat" scale,
 * which field users misread as severity. Listed in legend display order.
 */
const MEDIA_TYPE_COLORS = [
    { key: 'in water', label: 'In Water', color: '#1E90FF' },
    { key: 'in soil/sediment', label: 'In Soil/Sediment', color: '#5C4033' },
    { key: 'on soil', label: 'On Soil', color: '#D8B14A' },
    { key: 'mixed media', label: 'Mixed Media', color: '#888888' }
];
const UNKNOWN_MEDIA_TYPE = { key: 'unknown', label: 'Other / Unspecified', color: '#666666' };

// Case- and whitespace-insensitive key: " in soil / SEDIMENT " -> "in soil/sediment"
function normalizeMediaTypeKey(type) {
    if (type === null || type === undefined) return '';
    return String(type)
        .trim()
        .toLowerCase()
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ');
}

// Legend entry ({ key, label, color }) for a MediaTypeOverall value; unknown types share one entry
function getMediaTypeEntry(type) {
    const key = normalizeMediaTypeKey(type);
    return MEDIA_TYPE_COLORS.find(entry => entry.key === key) || UNKNOWN_MEDIA_TYPE;
}

// Marker color for a MediaTypeOverall value
function getColorForType(type) {
    return getMediaTypeEntry(type).color;
}

// Legend entries for the types present, in fixed order; unknown types (if any) last
function buildLegendEntries(types) {
    const presentKeys = new Set(
        Array.from(types || []).map(type => getMediaTypeEntry(type).key)
    );
    return MEDIA_TYPE_COLORS
        .concat(UNKNOWN_MEDIA_TYPE)
        .filter(entry => presentKeys.has(entry.key));
}

// Document ready function for home page
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize the home map
        if (document.getElementById('home-map')) {
            initHomeMap();
        }
    });
}

function getPointDateParts(point, prefix) {
    return {
        year: point[`${prefix}_year`],
        month: point[`${prefix}_month`],
        day: point[`${prefix}_day`]
    };
}

function nonEmptyDateText(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
}

function formatPointCollectionDate(point) {
    const utils = window.PartialDateUtils;
    const startParts = getPointDateParts(point, 'collection');
    const endParts = getPointDateParts(point, 'end');
    const suppliedDisplay = nonEmptyDateText(point.collection_date_display);
    if (suppliedDisplay) return suppliedDisplay;

    const startKey = nonEmptyDateText(point.collection_date_key) ||
        utils?.formatPartialDateKey(startParts) ||
        '';
    const startDisplay = utils?.formatPartialDate(startParts, { emptyLabel: '' }) ||
        startKey ||
        'N/A';
    const endKey = utils?.formatPartialDateKey(endParts) || '';

    if (!startKey || !endKey) return startDisplay;

    const endDisplay = utils?.formatPartialDate(endParts, { emptyLabel: '' }) || endKey;
    return `${startDisplay} – ${endDisplay}`;
}

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

                    if (!lat || !lng) return;

                    // Track sample types for the legend
                    sampleTypesSet.add(sampleType);

                    // Fixed color for the sampling medium
                    const markerColor = getColorForType(sampleType);

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

                    const dateStr = formatPointCollectionDate(point);

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

                // Legend: media types present in the data, fixed order, same colors as markers
                updateMapLegend(buildLegendEntries(sampleTypesSet));

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

// Show message when no data is available
function showNoDataMessage() {
    const legend = document.querySelector('.map-legend');
    if (legend) {
        legend.innerHTML = '<div class="legend-item"><span>No sample data available yet</span></div>';
    }
}

// Update the map legend from entries built by buildLegendEntries ({ label, color })
function updateMapLegend(entries) {
    const legend = document.querySelector('.map-legend');
    if (!legend) return;

    legend.innerHTML = ''; // Clear existing legend

    if (entries.length === 0) {
        legend.innerHTML = '<div class="legend-item"><span>No data available</span></div>';
        return;
    }

    // Create rows with 4 columns each
    const itemsPerRow = 4;
    const totalRows = Math.ceil(entries.length / itemsPerRow);

    for (let row = 0; row < totalRows; row++) {
        const legendRow = document.createElement('div');
        legendRow.className = 'legend-row';

        // Add up to 4 items per row
        for (let col = 0; col < itemsPerRow; col++) {
            const index = row * itemsPerRow + col;
            if (index >= entries.length) break;

            const entry = entries[index];

            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <span class="legend-marker" style="background-color: ${entry.color};"></span>
                <span>${entry.label}</span>
            `;

            legendRow.appendChild(legendItem);
        }

        legend.appendChild(legendRow);
    }
}

// Expose the pure color helpers to Node tests (no effect in the browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MEDIA_TYPE_COLORS,
        UNKNOWN_MEDIA_TYPE,
        buildLegendEntries,
        getColorForType,
        getMediaTypeEntry,
        normalizeMediaTypeKey
    };
}
