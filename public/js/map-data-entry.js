/**
 * Map functionality for data entry pages
 */

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('map')) {
        initMap();
    }

    const dateInput = document.getElementById('sample-date');
    if (dateInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
    }
});

function initMap() {
    const defaultLat = 43.890965;
    const defaultLng = -84.484863;

    const latitudeInput = document.getElementById('latitude');
    const longitudeInput = document.getElementById('longitude');
    const streetInput = document.querySelector('input[name="streetaddress"]');
    const cityInput = document.querySelector('input[name="city"]');
    const stateInput = document.querySelector('input[name="state"]');
    const countryInput = document.querySelector('input[name="country"]');
    const geocodeButton = document.getElementById('find-address-on-map');
    const geocodeStatus = document.getElementById('address-geocode-status');

    if (!latitudeInput || !longitudeInput) {
        return;
    }

    const map = L.map('map').setView([defaultLat, defaultLng], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    const marker = L.marker([defaultLat, defaultLng], {
        draggable: true
    }).addTo(map);

    function dispatchCoordinateChange(input) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function updateCoordinateInputs(lat, lng, emitChange = true) {
        latitudeInput.value = lat.toFixed(6);
        longitudeInput.value = lng.toFixed(6);

        if (emitChange) {
            dispatchCoordinateChange(latitudeInput);
            dispatchCoordinateChange(longitudeInput);
        }
    }

    function normalizeBounds(bounds) {
        if (!Array.isArray(bounds) || bounds.length !== 4) {
            return null;
        }

        const parsed = bounds.map(value => parseFloat(value));
        if (parsed.some(value => Number.isNaN(value))) {
            return null;
        }

        return [
            [parsed[0], parsed[2]],
            [parsed[1], parsed[3]]
        ];
    }

    function moveMarker(lat, lng, options = {}) {
        const {
            zoom = 13,
            bounds = null,
            updateInputs = false,
            emitChange = true
        } = options;

        marker.setLatLng([lat, lng]);

        const leafletBounds = normalizeBounds(bounds);
        if (leafletBounds) {
            map.fitBounds(leafletBounds, { padding: [24, 24] });
        } else {
            map.setView([lat, lng], zoom);
        }

        if (updateInputs) {
            updateCoordinateInputs(lat, lng, emitChange);
        }
    }

    function syncMarkerFromInputs(options = {}) {
        const lat = parseFloat(latitudeInput.value);
        const lng = parseFloat(longitudeInput.value);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return false;
        }

        moveMarker(lat, lng, {
            zoom: options.zoom || 13,
            bounds: options.bounds || null,
            updateInputs: false
        });

        return true;
    }

    function setGeocodeStatus(message, type = 'info') {
        if (!geocodeStatus) {
            return;
        }

        const colors = {
            info: '#4f5d75',
            success: '#1e7e34',
            error: '#c0392b'
        };

        geocodeStatus.textContent = message;
        geocodeStatus.style.color = colors[type] || colors.info;
    }

    async function geocodeAddressToMap() {
        if (!geocodeButton) {
            return;
        }

        const streetAddress = streetInput ? streetInput.value.trim() : '';
        const city = cityInput ? cityInput.value.trim() : '';
        const state = stateInput ? stateInput.value.trim() : '';
        const country = countryInput ? countryInput.value.trim() : '';

        if (!streetAddress || !city || !state || !country) {
            const message = 'Enter the full indoor address first: street, city, state, and country.';
            setGeocodeStatus(message, 'error');
            if (window.showErrorMessage) {
                await window.showErrorMessage(message, 'Address Lookup');
            }
            return;
        }

        const originalLabel = geocodeButton.textContent;
        geocodeButton.disabled = true;
        geocodeButton.textContent = 'Finding...';
        setGeocodeStatus('Finding address on map...', 'info');

        try {
            const params = new URLSearchParams({
                streetAddress,
                city,
                state,
                country
            });

            const response = await fetch(`/api/geocode/address?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Address lookup failed. Please try again.');
            }

            moveMarker(parseFloat(data.latitude), parseFloat(data.longitude), {
                zoom: 14,
                bounds: data.boundingBox,
                updateInputs: true,
                emitChange: true
            });

            setGeocodeStatus('Address located. Review the point and drag the marker if you need to refine it.', 'success');
        } catch (error) {
            const message = error.message || 'Address lookup failed. Please try again.';
            setGeocodeStatus(message, 'error');
            if (window.showErrorMessage) {
                await window.showErrorMessage(message, 'Address Lookup');
            }
        } finally {
            geocodeButton.disabled = false;
            geocodeButton.textContent = originalLabel;
        }
    }

    marker.on('dragend', function() {
        const position = marker.getLatLng();
        updateCoordinateInputs(position.lat, position.lng, true);
        setGeocodeStatus('Marker moved. Coordinates updated.', 'success');
    });

    map.on('click', function(event) {
        moveMarker(event.latlng.lat, event.latlng.lng, {
            zoom: map.getZoom() < 13 ? 13 : map.getZoom(),
            updateInputs: true,
            emitChange: true
        });
        setGeocodeStatus('Map point selected. Coordinates updated.', 'success');
    });

    latitudeInput.addEventListener('change', function() {
        syncMarkerFromInputs({ zoom: 13 });
    });

    longitudeInput.addEventListener('change', function() {
        syncMarkerFromInputs({ zoom: 13 });
    });

    if (geocodeButton) {
        geocodeButton.addEventListener('click', function() {
            geocodeAddressToMap();
        });
    }

    [streetInput, cityInput, stateInput, countryInput].forEach(input => {
        if (!input) {
            return;
        }

        input.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && geocodeButton) {
                event.preventDefault();
                geocodeAddressToMap();
            }
        });
    });

    window.syncDataEntryMapFromInputs = function(options = {}) {
        return syncMarkerFromInputs(options);
    };

    window.setDataEntryMapCoordinates = function(lat, lng, options = {}) {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
            return false;
        }

        moveMarker(parsedLat, parsedLng, {
            zoom: options.zoom || 13,
            bounds: options.bounds || null,
            updateInputs: options.updateInputs !== false,
            emitChange: options.emitChange !== false
        });

        return true;
    };

    if (geocodeStatus && !geocodeStatus.textContent.trim()) {
        setGeocodeStatus('For indoor samples, use the address fields and then select "Find Address on Map".', 'info');
    }

    syncMarkerFromInputs({ zoom: 13 });
}
