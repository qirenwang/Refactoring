// My Locations JavaScript Handler
class MyLocationsManager {
    constructor() {
        console.log('MyLocationsManager constructor called');
        this.locations = [];
        this.currentView = 'grid';
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.searchTerm = '';
        this.map = null;
        this.modalMap = null;
        this.modalMarker = null;
        this.locationMarkers = {};
        
        console.log('Starting initialization...');
        this.init();
    }

    init() {
        console.log('Initializing My Locations Manager');
        try {
            this.setupEventListeners();
            console.log('Event listeners setup complete');
            this.loadLocations();
            console.log('Load locations called');
            this.initializeMaps();
            console.log('Maps initialization called');
        } catch (error) {
            console.error('Error in init():', error);
        }
    }    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Add location button
        const addBtn = document.getElementById('add-location-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openAddLocationModal();
            });
            console.log('Add location button listener added');
        } else {
            console.warn('add-location-btn not found');
        }

        // Search functionality
        const searchInput = document.getElementById('location-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterAndDisplayLocations();
            });
            console.log('Search input listener added');
        } else {
            console.warn('location-search not found');
        }

        // View controls
        const viewBtns = document.querySelectorAll('.view-btn');
        console.log('Found view buttons:', viewBtns.length);
        viewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.closest('.view-btn').dataset.view);
            });
        });

        // Form submission
        const locationForm = document.getElementById('location-form');
        if (locationForm) {
            locationForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveLocation();
            });
            console.log('Location form listener added');
        } else {
            console.warn('location-form not found');
        }

        // Delete confirmation
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                this.confirmDelete();
            });
            console.log('Delete confirmation listener added');
        } else {
            console.warn('confirm-delete-btn not found');
        }

        // Pagination
        const prevBtn = document.getElementById('prev-page');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.displayLocations();
                }
            });
            console.log('Previous page listener added');
        } else {
            console.warn('prev-page not found');
        }

        const nextBtn = document.getElementById('next-page');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.getFilteredLocations().length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.displayLocations();
                }
            });
            console.log('Next page listener added');
        } else {
            console.warn('next-page not found');
        }
        
        console.log('Event listeners setup completed');
    }async loadLocations() {
        try {
            document.getElementById('loading-state').style.display = 'block';
            
            const response = await fetch('/api/my-locations');
            if (response.ok) {
                const data = await response.json();
                console.log('Loaded locations data:', data);
                
                // Handle the API response format
                if (data.success && data.locations) {
                    this.locations = data.locations;
                } else if (Array.isArray(data)) {
                    this.locations = data;
                } else {
                    this.locations = [];
                }
                
                this.updateStatistics();
                this.displayLocations();
            } else {
                throw new Error('Failed to load locations');
            }
        } catch (error) {
            console.error('Error loading locations:', error);
            this.showError('Failed to load locations. Please try again.');
        } finally {
            document.getElementById('loading-state').style.display = 'none';
        }
    }

    updateStatistics() {
        const totalLocations = this.locations.length;
        const totalSamples = this.locations.reduce((sum, loc) => sum + (loc.sample_count || 0), 0);
        const thisMonth = this.locations.filter(loc => {
            const created = new Date(loc.created_at);
            const now = new Date();
            return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length;

        document.getElementById('total-locations').textContent = totalLocations;
        document.getElementById('total-samples').textContent = totalSamples;
        document.getElementById('recent-activity').textContent = thisMonth;
    }    getFilteredLocations() {
        if (!this.searchTerm) {
            return this.locations;
        }

        return this.locations.filter(location => {
            // Map database fields to expected names
            const locationName = (location.name || location.LocationName || '').toLowerCase();
            const locationDesc = (location.description || location.Location_Desc || '').toLowerCase();
            const locationCity = (location.city || location.City || '').toLowerCase();
            const locationCountry = (location.country || location.Country || '').toLowerCase();
            const searchLower = this.searchTerm.toLowerCase();
            
            return locationName.includes(searchLower) ||
                   locationDesc.includes(searchLower) ||
                   locationCity.includes(searchLower) ||
                   locationCountry.includes(searchLower);
        });
    }

    displayLocations() {
        const filteredLocations = this.getFilteredLocations();
        
        if (filteredLocations.length === 0) {
            this.showEmptyState();
            return;
        }

        document.getElementById('empty-state').style.display = 'none';

        switch (this.currentView) {
            case 'grid':
                this.displayGridView(filteredLocations);
                break;
            case 'list':
                this.displayListView(filteredLocations);
                break;
            case 'map':
                this.displayMapView(filteredLocations);
                break;
        }

        this.updatePagination(filteredLocations);
    }

    displayGridView(locations) {
        document.getElementById('locations-grid').style.display = 'grid';
        document.getElementById('locations-list').style.display = 'none';
        document.getElementById('locations-map-container').style.display = 'none';

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedLocations = locations.slice(startIndex, endIndex);

        const grid = document.getElementById('locations-grid');
        grid.innerHTML = '';

        paginatedLocations.forEach(location => {
            const card = this.createLocationCard(location);
            grid.appendChild(card);
        });
    }

    displayListView(locations) {
        document.getElementById('locations-grid').style.display = 'none';
        document.getElementById('locations-list').style.display = 'block';
        document.getElementById('locations-map-container').style.display = 'none';

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedLocations = locations.slice(startIndex, endIndex);

        const listBody = document.getElementById('locations-list-body');
        listBody.innerHTML = '';

        paginatedLocations.forEach(location => {
            const row = this.createLocationListRow(location);
            listBody.appendChild(row);
        });
    }

    displayMapView(locations) {
        document.getElementById('locations-grid').style.display = 'none';
        document.getElementById('locations-list').style.display = 'none';
        document.getElementById('locations-map-container').style.display = 'flex';

        // Update map markers
        this.updateMapMarkers(locations);

        // Update sidebar list
        const mapList = document.getElementById('map-locations-list');
        mapList.innerHTML = '';

        locations.forEach(location => {
            const item = this.createMapLocationItem(location);
            mapList.appendChild(item);
        });
    }    createLocationCard(location) {
        const card = document.createElement('div');
        card.className = 'location-card';
        
        // Map database fields to expected names
        const locationName = location.name || location.LocationName || 'Unknown Location';
        const locationDesc = location.description || location.Location_Desc || '';
        const locationCity = location.city || location.City || '';
        const locationCountry = location.country || location.Country || '';
        const locationLat = parseFloat(location.latitude) || 0;
        const locationLng = parseFloat(location.longitude) || 0;
        const locationId = location.id || location.Loc_UniqueID;
        const sampleCount = location.sample_count || 0;
        
        card.innerHTML = `
            <div class="location-card-header">
                <div class="location-card-title">
                    <h4>${this.escapeHtml(locationName)}</h4>
                    <span class="location-type">Sampling Location</span>
                </div>
                <div class="location-coordinates">
                    ${locationLat.toFixed(6)}, ${locationLng.toFixed(6)}
                </div>
            </div>
            <div class="location-card-body">
                <div class="location-info">
                    ${locationCity ? `<div class="location-info-item"><i class="fas fa-city"></i> ${this.escapeHtml(locationCity)}</div>` : ''}
                    ${locationCountry ? `<div class="location-info-item"><i class="fas fa-globe"></i> ${this.escapeHtml(locationCountry)}</div>` : ''}
                    ${locationDesc ? `<div class="location-info-item"><i class="fas fa-info-circle"></i> ${this.escapeHtml(locationDesc)}</div>` : ''}
                </div>
            </div>
            <div class="location-card-footer">
                <div class="location-stats">
                    <div class="location-stat">
                        <div class="location-stat-value">${sampleCount}</div>
                        <div class="location-stat-label">Samples</div>
                    </div>
                </div>
                <div class="location-actions">
                    <button class="action-btn view" onclick="myLocations.viewLocation(${locationId})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" onclick="myLocations.editLocation(${locationId})" title="Edit Location">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="myLocations.deleteLocation(${locationId})" title="Delete Location">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        return card;
    }    createLocationListRow(location) {
        const row = document.createElement('div');
        row.className = 'list-row';
        
        // Map database fields to expected names
        const locationName = location.name || location.LocationName || 'Unknown Location';
        const locationDesc = location.description || location.Location_Desc || '';
        const locationLat = parseFloat(location.latitude) || 0;
        const locationLng = parseFloat(location.longitude) || 0;
        const locationId = location.id || location.Loc_UniqueID;
        const sampleCount = location.sample_count || 0;
        
        row.innerHTML = `
            <div>
                <strong>${this.escapeHtml(locationName)}</strong>
                ${locationDesc ? `<br><small class="text-muted">${this.escapeHtml(locationDesc)}</small>` : ''}
            </div>
            <div>
                <span class="location-type">Sampling Location</span>
            </div>
            <div>
                <span class="location-coordinates">
                    ${locationLat.toFixed(6)}, ${locationLng.toFixed(6)}
                </span>
            </div>
            <div>
                <strong>${sampleCount}</strong>
            </div>
            <div>
                ${new Date().toLocaleDateString()}
            </div>
            <div class="location-actions">
                <button class="action-btn view" onclick="myLocations.viewLocation(${locationId})" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn edit" onclick="myLocations.editLocation(${locationId})" title="Edit Location">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="myLocations.deleteLocation(${locationId})" title="Delete Location">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        return row;
    }    createMapLocationItem(location) {
        const item = document.createElement('div');
        item.className = 'map-location-item';
        
        // Map database fields to expected names
        const locationName = location.name || location.LocationName || 'Unknown Location';
        const locationLat = parseFloat(location.latitude) || 0;
        const locationLng = parseFloat(location.longitude) || 0;
        
        item.innerHTML = `
            <div>
                <strong>${this.escapeHtml(locationName)}</strong>
                <div class="text-muted">Sampling Location</div>
                <div class="location-coordinates">
                    ${locationLat.toFixed(6)}, ${locationLng.toFixed(6)}
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            this.focusLocationOnMap(location);
        });
        
        return item;
    }

    switchView(view) {
        this.currentView = view;
        this.currentPage = 1;
        
        // Update active button
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        this.displayLocations();
    }

    showEmptyState() {
        document.getElementById('empty-state').style.display = 'block';
        document.getElementById('locations-grid').style.display = 'none';
        document.getElementById('locations-list').style.display = 'none';
        document.getElementById('locations-map-container').style.display = 'none';
        document.getElementById('pagination-container').style.display = 'none';
    }

    updatePagination(locations) {
        const totalItems = locations.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        
        if (totalPages <= 1) {
            document.getElementById('pagination-container').style.display = 'none';
            return;
        }

        document.getElementById('pagination-container').style.display = 'flex';
        
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);
        
        document.getElementById('pagination-start').textContent = startItem;
        document.getElementById('pagination-end').textContent = endItem;
        document.getElementById('pagination-total').textContent = totalItems;
        
        document.getElementById('prev-btn').disabled = this.currentPage === 1;
        document.getElementById('next-btn').disabled = this.currentPage === totalPages;
        
        // Update page numbers
        const numbersContainer = document.getElementById('pagination-numbers');
        numbersContainer.innerHTML = '';
        
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const numberBtn = document.createElement('button');
            numberBtn.className = `pagination-number ${i === this.currentPage ? 'active' : ''}`;
            numberBtn.textContent = i;
            numberBtn.addEventListener('click', () => {
                this.currentPage = i;
                this.displayLocations();
            });
            numbersContainer.appendChild(numberBtn);
        }
    }

    initializeMaps() {
        // Initialize main map for map view
        setTimeout(() => {
            if (!this.map) {
                this.map = L.map('locations-map').setView([39.8283, -98.5795], 4); // Center of USA
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(this.map);
            }
        }, 100);
    }

    initializeModalMap() {
        if (!this.modalMap) {
            this.modalMap = L.map('modal-map').setView([39.8283, -98.5795], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.modalMap);

            // Add click handler for setting coordinates
            this.modalMap.on('click', (e) => {
                this.setModalCoordinates(e.latlng.lat, e.latlng.lng);
            });
        }
    }

    setModalCoordinates(lat, lng) {
        document.getElementById('latitude').value = lat.toFixed(6);
        document.getElementById('longitude').value = lng.toFixed(6);

        if (this.modalMarker) {
            this.modalMap.removeLayer(this.modalMarker);
        }

        this.modalMarker = L.marker([lat, lng], {
            draggable: true
        }).addTo(this.modalMap);

        this.modalMarker.on('dragend', (e) => {
            const position = e.target.getLatLng();
            document.getElementById('latitude').value = position.lat.toFixed(6);
            document.getElementById('longitude').value = position.lng.toFixed(6);
        });

        this.modalMap.setView([lat, lng], 13);
    }    updateMapMarkers(locations) {
        if (!this.map) return;

        // Clear existing markers
        Object.values(this.locationMarkers).forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.locationMarkers = {};

        // Add new markers
        locations.forEach(location => {
            // Map database fields to expected names
            const locationName = location.name || location.LocationName || 'Unknown Location';
            const locationDesc = location.description || location.Location_Desc || '';
            const locationLat = parseFloat(location.latitude) || 0;
            const locationLng = parseFloat(location.longitude) || 0;
            const locationId = location.id || location.Loc_UniqueID;
            const sampleCount = location.sample_count || 0;
            
            if (locationLat !== 0 && locationLng !== 0) {
                const marker = L.marker([locationLat, locationLng])
                    .bindPopup(`
                        <div>
                            <h4>${this.escapeHtml(locationName)}</h4>
                            <p><strong>Type:</strong> Sampling Location</p>
                            <p><strong>Samples:</strong> ${sampleCount}</p>
                            ${locationDesc ? `<p><strong>Description:</strong> ${this.escapeHtml(locationDesc)}</p>` : ''}
                        </div>
                    `)
                    .addTo(this.map);

                this.locationMarkers[locationId] = marker;
            }
        });

        // Fit map to show all markers
        if (Object.keys(this.locationMarkers).length > 0) {
            const group = new L.featureGroup(Object.values(this.locationMarkers));
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    focusLocationOnMap(location) {
        if (this.locationMarkers[location.id]) {
            this.map.setView([location.latitude, location.longitude], 15);
            this.locationMarkers[location.id].openPopup();
        }

        // Update active state in sidebar
        document.querySelectorAll('.map-location-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
    }

    openAddLocationModal() {
        document.getElementById('modal-title').textContent = 'Add New Location';
        document.getElementById('location-form').reset();
        document.getElementById('location-id').value = '';
        
        document.getElementById('location-modal').style.display = 'flex';
        
        setTimeout(() => {
            this.initializeModalMap();
        }, 100);
    }

    editLocation(id) {
        const location = this.locations.find(loc => loc.id === id);
        if (!location) return;

        document.getElementById('modal-title').textContent = 'Edit Location';
        document.getElementById('location-id').value = location.id;
        document.getElementById('location-name').value = location.name;
        document.getElementById('location-type').value = location.type;
        document.getElementById('latitude').value = location.latitude;
        document.getElementById('longitude').value = location.longitude;
        document.getElementById('address').value = location.streetaddress || '';
        document.getElementById('city').value = location.city || '';
        document.getElementById('state').value = location.state || '';
        document.getElementById('country').value = location.country || '';
        document.getElementById('zip-code').value = location.zip_code || '';
        document.getElementById('description').value = location.description || '';

        document.getElementById('location-modal').style.display = 'flex';
        
        setTimeout(() => {
            this.initializeModalMap();
            this.setModalCoordinates(location.latitude, location.longitude);
        }, 100);
    }

    viewLocation(id) {
        // For now, just edit the location. Could implement a read-only view later
        this.editLocation(id);
    }

    deleteLocation(id) {
        const location = this.locations.find(loc => loc.id === id);
        if (!location) return;

        document.getElementById('delete-location-name').textContent = location.name;
        document.getElementById('delete-modal').style.display = 'flex';
        
        // Store the ID for confirmation
        this.locationToDelete = id;
    }

    async confirmDelete() {
        if (!this.locationToDelete) return;

        try {
            const response = await fetch(`/api/locations/${this.locationToDelete}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.locations = this.locations.filter(loc => loc.id !== this.locationToDelete);
                this.updateStatistics();
                this.displayLocations();
                this.closeDeleteModal();
                this.showSuccess('Location deleted successfully!');
            } else {
                throw new Error('Failed to delete location');
            }
        } catch (error) {
            console.error('Error deleting location:', error);
            this.showError('Failed to delete location. Please try again.');
        }
    }

    async saveLocation() {
        const formData = new FormData(document.getElementById('location-form'));
        const data = Object.fromEntries(formData.entries());

        try {
            const url = data.id ? `/api/locations/${data.id}` : '/api/locations';
            const method = data.id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const savedLocation = await response.json();
                
                if (data.id) {
                    // Update existing location
                    const index = this.locations.findIndex(loc => loc.id == data.id);
                    if (index !== -1) {
                        this.locations[index] = savedLocation;
                    }
                } else {
                    // Add new location
                    this.locations.push(savedLocation);
                }

                this.updateStatistics();
                this.displayLocations();
                this.closeLocationModal();
                this.showSuccess(data.id ? 'Location updated successfully!' : 'Location added successfully!');
            } else {
                throw new Error('Failed to save location');
            }
        } catch (error) {
            console.error('Error saving location:', error);
            this.showError('Failed to save location. Please try again.');
        }
    }

    closeLocationModal() {
        document.getElementById('location-modal').style.display = 'none';
        if (this.modalMarker) {
            this.modalMap.removeLayer(this.modalMarker);
            this.modalMarker = null;
        }
    }

    closeDeleteModal() {
        document.getElementById('delete-modal').style.display = 'none';
        this.locationToDelete = null;
    }

    filterAndDisplayLocations() {
        this.currentPage = 1;
        this.displayLocations();
    }    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'fas fa-check-circle' : 
                     type === 'error' ? 'fas fa-exclamation-circle' : 
                     'fas fa-info-circle';
        
        toast.innerHTML = `
            <div class="toast-content">
                <i class="${icon}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add to container
        toastContainer.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);

        // Add slide-in animation
        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for onclick handlers
window.openAddLocationModal = function() {
    window.myLocations.openAddLocationModal();
};

window.closeLocationModal = function() {
    window.myLocations.closeLocationModal();
};

window.closeDeleteModal = function() {
    window.myLocations.closeDeleteModal();
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.myLocations = new MyLocationsManager();
});
