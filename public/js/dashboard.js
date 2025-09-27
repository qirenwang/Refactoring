/**
 * Dashboard JavaScript
 * Handles dashboard functionality for enter and edit data page
 */

document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

function initializeDashboard() {
    loadUserData();
    setupDataGrid();
    setupSearchFunctionality();
    setupFilterOptions();
    setupExportFeatures();
    loadRecentSamples();
}

function loadUserData() {
    // Load user profile information
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        // User data should be available from the server-side template
        // This can be enhanced with AJAX calls if needed
    }
}

function setupDataGrid() {
    const dataGrid = document.getElementById('samples-grid');
    if (!dataGrid) return;
    
    // Load samples data
    loadSamplesData();
    
    // Setup pagination
    setupPagination();
    
    // Setup sorting
    setupSorting();
}

function loadSamplesData(page = 1, limit = 10, search = '', filters = {}) {
    const dataGrid = document.getElementById('samples-grid');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
    
    // Build query parameters
    const params = new URLSearchParams({
        page: page,
        limit: limit,
        search: search,
        ...filters
    });
    
    fetch(`/api/samples?${params}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderSamplesGrid(data.samples);
                updatePagination(data.pagination);
            } else {
                showError('Failed to load samples data');
            }
        })
        .catch(error => {
            console.error('Error loading samples:', error);
            showError('Error loading samples data');
        })
        .finally(() => {
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        });
}

function renderSamplesGrid(samples) {
    const dataGrid = document.getElementById('samples-grid');
    if (!dataGrid) return;
    
    if (samples.length === 0) {
        dataGrid.innerHTML = `
            <div class="no-data">
                <i class="fas fa-flask"></i>
                <h4>No samples found</h4>
                <p>Start by adding your first sample using the form above.</p>
            </div>
        `;
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table table-striped table-hover';
    
    // Table header
    table.innerHTML = `
        <thead>
            <tr>
                <th data-sort="sample_id">Sample ID <i class="fas fa-sort"></i></th>
                <th data-sort="location_name">Location <i class="fas fa-sort"></i></th>
                <th data-sort="sample_date">Date <i class="fas fa-sort"></i></th>
                <th data-sort="media_type">Media Type <i class="fas fa-sort"></i></th>
                <th data-sort="sample_type">Sample Type <i class="fas fa-sort"></i></th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    
    samples.forEach(sample => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${sample.sample_id || 'N/A'}</strong></td>
            <td>${sample.location_name || 'N/A'}</td>
            <td>${formatDate(sample.sample_date)}</td>
            <td>
                <span class="badge badge-primary">${sample.media_type || 'N/A'}</span>
            </td>
            <td>
                <span class="badge badge-secondary">${sample.sample_type || 'N/A'}</span>
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-primary" onclick="viewSample('${sample.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-outline-success" onclick="editSample('${sample.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" onclick="deleteSample('${sample.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    dataGrid.innerHTML = '';
    dataGrid.appendChild(table);
}

function setupPagination() {
    // Pagination controls will be updated by updatePagination function
}

function updatePagination(paginationData) {
    const paginationContainer = document.getElementById('pagination-container');
    if (!paginationContainer || !paginationData) return;
    
    const { currentPage, totalPages, totalRecords, limit } = paginationData;
    
    let paginationHTML = '<nav><ul class="pagination justify-content-center">';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a></li>`;
    } else {
        paginationHTML += '<li class="page-item disabled"><span class="page-link">Previous</span></li>';
    }
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            paginationHTML += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
        } else {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
        }
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a></li>`;
    } else {
        paginationHTML += '<li class="page-item disabled"><span class="page-link">Next</span></li>';
    }
    
    paginationHTML += '</ul></nav>';
    
    // Add showing info
    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(currentPage * limit, totalRecords);
    paginationHTML += `<div class="text-center mt-2"><small>Showing ${start}-${end} of ${totalRecords} records</small></div>`;
    
    paginationContainer.innerHTML = paginationHTML;
}

function changePage(page) {
    const currentSearch = document.getElementById('search-input')?.value || '';
    const currentFilters = getCurrentFilters();
    loadSamplesData(page, 10, currentSearch, currentFilters);
}

function setupSorting() {
    document.addEventListener('click', function(e) {
        const sortButton = e.target.closest('[data-sort]');
        if (!sortButton) return;
        
        const sortField = sortButton.getAttribute('data-sort');
        const currentSort = sortButton.getAttribute('data-direction') || 'asc';
        const newSort = currentSort === 'asc' ? 'desc' : 'asc';
        
        // Update UI
        document.querySelectorAll('[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort';
        });
        
        const icon = sortButton.querySelector('i');
        icon.className = newSort === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        sortButton.setAttribute('data-direction', newSort);
        
        // Load sorted data
        const currentSearch = document.getElementById('search-input')?.value || '';
        const currentFilters = getCurrentFilters();
        currentFilters.sortField = sortField;
        currentFilters.sortDirection = newSort;
        
        loadSamplesData(1, 10, currentSearch, currentFilters);
    });
}

function setupSearchFunctionality() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
        
        // Debounced search
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch();
            }, 500);
        });
    }
    
    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }
}

function performSearch() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const currentFilters = getCurrentFilters();
    
    loadSamplesData(1, 10, searchTerm, currentFilters);
}

function setupFilterOptions() {
    const filterForm = document.getElementById('filter-form');
    if (!filterForm) return;
    
    const filterInputs = filterForm.querySelectorAll('select, input[type="date"]');
    
    filterInputs.forEach(input => {
        input.addEventListener('change', function() {
            performSearch();
        });
    });
    
    // Clear filters button
    const clearFiltersButton = document.getElementById('clear-filters');
    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', function() {
            filterInputs.forEach(input => {
                input.value = '';
            });
            performSearch();
        });
    }
}

function getCurrentFilters() {
    const filterForm = document.getElementById('filter-form');
    const filters = {};
    
    if (filterForm) {
        const formData = new FormData(filterForm);
        for (const [key, value] of formData.entries()) {
            if (value.trim() !== '') {
                filters[key] = value;
            }
        }
    }
    
    return filters;
}

function setupExportFeatures() {
    const exportButton = document.getElementById('export-button');
    if (exportButton) {
        exportButton.addEventListener('click', function() {
            exportData();
        });
    }
}

function exportData() {
    const currentSearch = document.getElementById('search-input')?.value || '';
    const currentFilters = getCurrentFilters();
    
    // Build export URL
    const params = new URLSearchParams({
        search: currentSearch,
        format: 'csv',
        ...currentFilters
    });
    
    // Download file
    window.location.href = `/api/samples/export?${params}`;
}

function loadRecentSamples() {
    const recentSamplesContainer = document.getElementById('recent-samples');
    if (!recentSamplesContainer) return;
    
    fetch('/api/samples/recent?limit=5')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.samples.length > 0) {
                renderRecentSamples(data.samples);
            } else {
                recentSamplesContainer.innerHTML = '<p class="text-muted">No recent samples</p>';
            }
        })
        .catch(error => {
            console.error('Error loading recent samples:', error);
        });
}

function renderRecentSamples(samples) {
    const container = document.getElementById('recent-samples');
    
    const list = document.createElement('ul');
    list.className = 'list-group list-group-flush';
    
    samples.forEach(sample => {
        const item = document.createElement('li');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <div>
                <strong>${sample.sample_id || 'N/A'}</strong><br>
                <small class="text-muted">${sample.location_name} - ${formatDate(sample.sample_date)}</small>
            </div>
            <span class="badge badge-primary">${sample.media_type}</span>
        `;
        list.appendChild(item);
    });
    
    container.innerHTML = '';
    container.appendChild(list);
}

// Sample management functions
function viewSample(sampleId) {
    window.location.href = `/sample/${sampleId}`;
}

function editSample(sampleId) {
    window.location.href = `/sample/${sampleId}/edit`;
}

function deleteSample(sampleId) {
    if (!confirm('Are you sure you want to delete this sample? This action cannot be undone.')) {
        return;
    }
    
    fetch(`/api/samples/${sampleId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccess('Sample deleted successfully');
            // Reload current page
            const currentPage = getCurrentPage();
            const currentSearch = document.getElementById('search-input')?.value || '';
            const currentFilters = getCurrentFilters();
            loadSamplesData(currentPage, 10, currentSearch, currentFilters);
        } else {
            showError(data.message || 'Failed to delete sample');
        }
    })
    .catch(error => {
        console.error('Error deleting sample:', error);
        showError('Error deleting sample');
    });
}

function getCurrentPage() {
    const activePage = document.querySelector('.pagination .page-item.active .page-link');
    return activePage ? parseInt(activePage.textContent) : 1;
}

// Utility functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function showError(message) {
    showAlert(message, 'danger');
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function showAlert(message, type) {
    const alertContainer = document.getElementById('alert-container') || document.body;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert">
            <span>&times;</span>
        </button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

// Export functions for external use
window.Dashboard = {
    loadSamplesData,
    changePage,
    performSearch,
    exportData,
    viewSample,
    editSample,
    deleteSample
};
