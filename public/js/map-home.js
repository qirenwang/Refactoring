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

// Units_Ref.Units_Code -> popup suffix ("km2" renders as km²)
const UNIT_DISPLAY = { l: 'L', g: 'g', km2: 'km²' };

function formatUnitLabel(unitCode) {
    if (unitCode === null || unitCode === undefined) return '';
    const code = String(unitCode).trim();
    return UNIT_DISPLAY[code.toLowerCase()] || code;
}

// Finite number or null (API sends DECIMAL columns as strings, missing values as null)
function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// >= 10: whole number with thousands separators; < 10: two significant digits
function formatConcentrationValue(value) {
    if (Math.abs(value) >= 10) {
        return Math.round(value).toLocaleString('en-US');
    }
    // Number() drops trailing zeros from toPrecision ("0.50" -> 0.5, "0.0" -> 0)
    return String(Number(value.toPrecision(2)));
}

/**
 * Popup text for one size class: count ÷ sample amount per unit.
 * The class's own amount/unit is used when it is a usable (> 0) number,
 * otherwise the sample's TotalSampleAmount/SampleUnit.
 *   count missing             -> "Not analyzed"
 *   no usable amount anywhere -> "<count> particles (no sample amount recorded)"
 */
function formatConcentration(count, amount, unit, fallbackAmount, fallbackUnit) {
    const countValue = toFiniteNumber(count);
    if (countValue === null) return 'Not analyzed';

    let amountValue = toFiniteNumber(amount);
    let unitCode = unit;
    if (amountValue === null || amountValue <= 0) {
        amountValue = toFiniteNumber(fallbackAmount);
        unitCode = fallbackUnit;
    } else if (!formatUnitLabel(unitCode)) {
        unitCode = fallbackUnit;
    }

    if (amountValue === null || amountValue <= 0) {
        return `${countValue} particle${countValue === 1 ? '' : 's'} (no sample amount recorded)`;
    }

    const unitLabel = formatUnitLabel(unitCode);
    const valueText = formatConcentrationValue(countValue / amountValue);
    return unitLabel ? `${valueText} /${unitLabel}` : `${valueText} per sample amount (unit not recorded)`;
}

// The two concentration lines shown in a map popup
function buildConcentrationLines(point) {
    return [
        {
            label: 'Plastic fragments (>5mm)',
            value: formatConcentration(
                point.fragments_count,
                point.fragments_sample_amount,
                point.fragments_sample_unit,
                point.total_sample_amount,
                point.total_sample_unit
            )
        },
        {
            label: 'Microplastics (<5mm)',
            value: formatConcentration(
                point.microplastics_count,
                point.microplastics_sample_amount,
                point.microplastics_sample_unit,
                point.total_sample_amount,
                point.total_sample_unit
            )
        }
    ];
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
                    const concentrationHtml = buildConcentrationLines(point)
                        .map(line => `<p>${escapeHtml(line.label)}: <span class="data-value">${escapeHtml(line.value)}</span></p>`)
                        .join('');

                    // Add popup with sample information
                    marker.bindPopup(`
                        <div class="marker-popup">
                            <h4>${escapeHtml(sampleType)}</h4>
                            <p>Location: <span class="data-value">${escapeHtml(location || 'N/A')}</span></p>
                            ${concentrationHtml}
                            <p>Coordinates: <span class="data-value">${lat.toFixed(4)}, ${lng.toFixed(4)}</span></p>
                            <p>Collected: <span class="data-value">${escapeHtml(dateStr)}</span></p>
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

// Expose the pure helpers to Node tests (no effect in the browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MEDIA_TYPE_COLORS,
        UNKNOWN_MEDIA_TYPE,
        buildConcentrationLines,
        buildLegendEntries,
        formatConcentration,
        formatConcentrationValue,
        formatUnitLabel,
        getColorForType,
        getMediaTypeEntry,
        normalizeMediaTypeKey
    };
}
