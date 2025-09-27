document.addEventListener('DOMContentLoaded', function() {
    // Load initial form
    loadForm('location');

    // Add click handlers for tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadForm(this.dataset.form);
        });
    });
});

function loadForm(formName) {
    // 将连字符转换为下划线
    const fileName = formName.replace(/-/g, '_');
    
    fetch(`forms/${fileName}.php`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            if (!html || html.trim() === '') {
                throw new Error('Empty response received');
            }
            
            const formContainer = document.getElementById('form-container');
            formContainer.innerHTML = html;
            
            // 确保表单完全加载
            setTimeout(() => {
                const form = formContainer.querySelector('form');
                if (form) {
                    initializeFormHandlers();
                    
                    // 如果是位置表单，初始化地图
                    if (fileName === 'location' && typeof initMap === 'function') {
                        initMap();
                    }
                }
            }, 100);
        })
        .catch(error => {
            console.error('Error loading form:', error);
            document.getElementById('form-container').innerHTML = 
                `<div class="alert alert-error">Error loading form: ${error.message}. Please try again.</div>`;
        });
}

function initializeFormHandlers() {
    const form = document.querySelector('form');
    if (!form) {
        console.error('Form not found in container');
        return;
    }
    
    console.log('Form loaded:', form);
    console.log('Form elements:', form.elements);

    // Add form submission handler
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);

        fetch(this.action, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showAlert('Data saved successfully!', 'success');
                if (data.newId) {
                    updateDropdowns(data.newId, data.formType);
                }
                form.reset();
            } else {
                showAlert('Error: ' + data.message, 'error');
            }
        })
        .catch(error => {
            showAlert('Error submitting form: ' + error, 'error');
        });
    });

    // Initialize any dependent dropdowns
    initializeDependentDropdowns();
}

function initializeDependentDropdowns() {
    const dependentSelects = document.querySelectorAll('select[data-depends-on]');
    dependentSelects.forEach(select => {
        const parentSelect = document.getElementById(select.dataset.dependsOn);
        if (parentSelect) {
            parentSelect.addEventListener('change', function() {
                updateDependentDropdown(select, this.value);
            });
        }
    });
}

function updateDependentDropdown(select, parentValue) {
    fetch(`get_dependent_options.php?parent=${parentValue}&type=${select.dataset.type}`)
        .then(response => response.json())
        .then(data => {
            select.innerHTML = '<option value="">Select...</option>';
            data.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.text;
                select.appendChild(opt);
            });
        });
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => alertDiv.remove(), 5000);
}

function updateDropdowns(newId, formType) {
    // Update relevant dropdowns when new data is added
    document.querySelectorAll(`select[data-type="${formType}"]`).forEach(select => {
        fetch(`get_options.php?type=${formType}`)
            .then(response => response.json())
            .then(data => {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select...</option>';
                data.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.text;
                    select.appendChild(opt);
                });
                if (currentValue) select.value = currentValue;
            });
    });
}
