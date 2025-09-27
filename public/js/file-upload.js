/**
 * File Upload JavaScript
 * Handles file upload functionality for data entry forms
 */

document.addEventListener('DOMContentLoaded', function() {
    initializeFileUpload();
});

function initializeFileUpload() {
    setupFileDropZone();
    setupFileInput();
    setupProgressTracking();
}

function setupFileDropZone() {
    const dropZone = document.getElementById('file-drop-zone');
    if (!dropZone) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    const dropZone = document.getElementById('file-drop-zone');
    dropZone.classList.add('highlight');
}

function unhighlight(e) {
    const dropZone = document.getElementById('file-drop-zone');
    dropZone.classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    handleFiles(files);
}

function setupFileInput() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            handleFiles(e.target.files);
        });
    }
}

function handleFiles(files) {
    const fileList = Array.from(files);
    const validFiles = [];
    
    fileList.forEach(file => {
        if (validateFile(file)) {
            validFiles.push(file);
        }
    });
    
    if (validFiles.length > 0) {
        displayFileList(validFiles);
        enableUploadButton(validFiles.length > 0);
    }
}

function validateFile(file) {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!allowedTypes.includes(file.type)) {
        showError(`File "${file.name}" is not a supported format. Please upload CSV or Excel files only.`);
        return false;
    }
    
    if (file.size > maxSize) {
        showError(`File "${file.name}" is too large. Maximum size is 10MB.`);
        return false;
    }
    
    return true;
}

function displayFileList(files) {
    const fileListContainer = document.getElementById('file-list');
    if (!fileListContainer) return;
    
    fileListContainer.innerHTML = '';
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <i class="fas fa-file-excel"></i>
                <span class="file-name">${file.name}</span>
                <span class="file-size">(${formatFileSize(file.size)})</span>
            </div>
            <div class="file-actions">
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeFile(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="upload-progress" id="progress-${index}" style="display: none;">
                <div class="progress">
                    <div class="progress-bar" role="progressbar" style="width: 0%">0%</div>
                </div>
            </div>
        `;
        
        fileListContainer.appendChild(fileItem);
    });
    
    // Store files for upload
    window.selectedFiles = files;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
    if (window.selectedFiles) {
        window.selectedFiles.splice(index, 1);
        displayFileList(window.selectedFiles);
        enableUploadButton(window.selectedFiles.length > 0);
    }
}

function enableUploadButton(enabled) {
    const uploadButton = document.getElementById('upload-button');
    if (uploadButton) {
        uploadButton.disabled = !enabled;
    }
}

function setupProgressTracking() {
    const uploadButton = document.getElementById('upload-button');
    if (uploadButton) {
        uploadButton.addEventListener('click', function(e) {
            e.preventDefault();
            uploadFiles();
        });
    }
}

function uploadFiles() {
    if (!window.selectedFiles || window.selectedFiles.length === 0) {
        showError('Please select files to upload.');
        return;
    }
    
    const uploadButton = document.getElementById('upload-button');
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    // Upload files one by one
    uploadFileSequentially(0);
}

function uploadFileSequentially(index) {
    if (index >= window.selectedFiles.length) {
        // All files uploaded
        showSuccess('All files uploaded successfully!');
        resetUploadForm();
        return;
    }
    
    const file = window.selectedFiles[index];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_type', 'data_file');
    
    const progressElement = document.getElementById(`progress-${index}`);
    if (progressElement) {
        progressElement.style.display = 'block';
    }
    
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            updateProgress(index, percentComplete);
        }
    });
    
    xhr.addEventListener('load', function() {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    markFileComplete(index);
                    // Upload next file
                    setTimeout(() => uploadFileSequentially(index + 1), 500);
                } else {
                    markFileError(index, response.message);
                    showError(`Error uploading ${file.name}: ${response.message}`);
                }
            } catch (error) {
                markFileError(index, 'Invalid server response');
                showError(`Error uploading ${file.name}: Invalid server response`);
            }
        } else {
            markFileError(index, `HTTP ${xhr.status}`);
            showError(`Error uploading ${file.name}: HTTP ${xhr.status}`);
        }
    });
    
    xhr.addEventListener('error', function() {
        markFileError(index, 'Network error');
        showError(`Error uploading ${file.name}: Network error`);
    });
    
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
}

function updateProgress(index, percent) {
    const progressBar = document.querySelector(`#progress-${index} .progress-bar`);
    if (progressBar) {
        progressBar.style.width = percent + '%';
        progressBar.textContent = Math.round(percent) + '%';
    }
}

function markFileComplete(index) {
    const progressBar = document.querySelector(`#progress-${index} .progress-bar`);
    if (progressBar) {
        progressBar.classList.add('bg-success');
        progressBar.textContent = 'Complete';
    }
}

function markFileError(index, error) {
    const progressBar = document.querySelector(`#progress-${index} .progress-bar`);
    if (progressBar) {
        progressBar.classList.add('bg-danger');
        progressBar.textContent = 'Error: ' + error;
    }
}

function resetUploadForm() {
    window.selectedFiles = [];
    const fileListContainer = document.getElementById('file-list');
    if (fileListContainer) {
        fileListContainer.innerHTML = '';
    }
    
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.value = '';
    }
    
    const uploadButton = document.getElementById('upload-button');
    if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.innerHTML = '<i class="fas fa-upload"></i> Upload Files';
    }
}

function showError(message) {
    const alertContainer = document.getElementById('alert-container');
    if (alertContainer) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger alert-dismissible fade show';
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
    } else {
        alert(message);
    }
}

function showSuccess(message) {
    const alertContainer = document.getElementById('alert-container');
    if (alertContainer) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-success alert-dismissible fade show';
        alert.innerHTML = `
            ${message}
            <button type="button" class="close" data-dismiss="alert">
                <span>&times;</span>
            </button>
        `;
        alertContainer.appendChild(alert);
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 3000);
    } else {
        alert(message);
    }
}

// Export functions for external use
window.FileUpload = {
    uploadFiles,
    validateFile,
    formatFileSize,
    resetUploadForm
};
