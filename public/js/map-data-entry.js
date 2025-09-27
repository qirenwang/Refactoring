/**
 * Map functionality for data entry pages
 */

// Document ready function for data entry pages
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map if the map element exists
    if (document.getElementById('map')) {
        initMap();
    }

    // Initialize datepicker with today's date if it exists
    const dateInput = document.getElementById('sample-date');
    if (dateInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        dateInput.value = formattedDate;
    }
});

// Initialize the map with default location
function initMap() {
    // Default coordinates (Michigan)
    const defaultLat = 43.890965;
    const defaultLng = -84.484863;

    var map = L.map('map').setView([defaultLat, defaultLng], 5);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Add marker for initial position
    var marker = L.marker([defaultLat, defaultLng], {
        draggable: true
    }).addTo(map);

    // Update lat/lng inputs when marker is dragged
    marker.on('dragend', function(e) {
        var position = marker.getLatLng();
        document.getElementById('latitude').value = position.lat.toFixed(6);
        document.getElementById('longitude').value = position.lng.toFixed(6);
    });

    // Update marker position when clicking on map
    map.on('click', function(e) {
        marker.setLatLng(e.latlng);
        document.getElementById('latitude').value = e.latlng.lat.toFixed(6);
        document.getElementById('longitude').value = e.latlng.lng.toFixed(6);
    });

    // Update marker position when lat/lng inputs change
    document.getElementById('latitude').addEventListener('change', updateMarkerFromInputs);
    document.getElementById('longitude').addEventListener('change', updateMarkerFromInputs);

    function updateMarkerFromInputs() {
        var lat = parseFloat(document.getElementById('latitude').value);
        var lng = parseFloat(document.getElementById('longitude').value);

        if (!isNaN(lat) && !isNaN(lng)) {
            marker.setLatLng([lat, lng]);
            map.panTo([lat, lng]);
        }
    }    // Leave coordinate inputs empty initially to prevent accidental data entry
    // Users can choose to use map click, location dropdown, or manual entry
}