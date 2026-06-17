/**
 * File Upload Module
 * Responsibilities: Handle file selection, validation (type and size),
 * UI state for selected files, and uploading to the server.
 */

// Initialize global App namespace if it doesn't exist
window.App = window.App || {};

window.App.fileUpload = (function() {
    'use strict';

    // Constants
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.docx', '.pdf'];
    
    // State
    let selectedFile = null;
    let uploadedFileId = null;
    let isUploading = false;

    // DOM Elements
    const DOM = {
        fileInput: null,
        uploadBtn: null,
        chipContainer: null
    };

    /**
     * Safe HTML escaping to prevent XSS
     */
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return (unsafe + '').replace(/[&<"']/g, function(m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
                default: return m;
            }
        });
    }

    /**
     * Format file size to human-readable format
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Show toast notification (wrapper around App.showToast)
     */
    function notify(message, type = 'info') {
        if (window.App.showToast) {
            window.App.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Validate file type and size
     * @param {File} file - The file to validate
     * @returns {boolean} True if valid, false otherwise
     */
    function validateFile(file) {
        if (!file) return false;

        // Check file extension
        const fileName = file.name.toLowerCase();
        const isValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
        
        if (!isValidExtension) {
            notify(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error');
            return false;
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            notify(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`, 'error');
            return false;
        }

        return true;
    }

    /**
     * Handle file selection event
     * @param {Event} event - The change event from the file input
     */
    function handleFileSelect(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return; // User canceled selection
        }

        if (validateFile(file)) {
            selectedFile = file;
            uploadedFileId = null; // Reset uploaded ID for new file
            renderFileChip();
        } else {
            // Clear the input if validation fails
            if (DOM.fileInput) DOM.fileInput.value = '';
        }
    }

    /**
     * Render the selected file as a chip in the UI
     */
    function renderFileChip() {
        if (!DOM.chipContainer) return;

        if (!selectedFile) {
            DOM.chipContainer.innerHTML = '';
            return;
        }

        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.id = 'currentFileChip';
        
        chip.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <span class="file-name" title="${escapeHtml(selectedFile.name)}">
                ${escapeHtml(selectedFile.name)} <small style="opacity:0.7">(${formatFileSize(selectedFile.size)})</small>
            </span>
            <button type="button" class="remove-file-btn" aria-label="Remove file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        // Bind remove event
        const removeBtn = chip.querySelector('.remove-file-btn');
        removeBtn.addEventListener('click', clearFile);

        DOM.chipContainer.innerHTML = '';
        DOM.chipContainer.appendChild(chip);
    }

    /**
     * Clear the currently selected file and reset UI
     */
    function clearFile() {
        selectedFile = null;
        uploadedFileId = null;
        isUploading = false;
        
        if (DOM.fileInput) {
            DOM.fileInput.value = '';
        }
        
        if (DOM.chipContainer) {
            DOM.chipContainer.innerHTML = '';
        }
    }

    /**
     * Upload the selected file to the server
     * @returns {Promise<string|null>} The file_id from the server, or null if no file
     */
    async function uploadFile() {
        if (!selectedFile) return null;
        
        // If already uploaded successfully, return the cached ID
        if (uploadedFileId) return uploadedFileId;

        if (isUploading) {
            throw new Error('File upload already in progress');
        }

        isUploading = true;
        
        // Update UI to show uploading state
        const chip = document.getElementById('currentFileChip');
        if (chip) {
            chip.style.opacity = '0.7';
            const nameSpan = chip.querySelector('.file-name');
            if (nameSpan) nameSpan.innerHTML += ' <em>(Uploading...)</em>';
        }

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }

            const data = await response.json();
            uploadedFileId = data.file_id || data.id;
            
            notify('File uploaded successfully', 'success');
            
            // Restore chip UI
            if (chip) chip.style.opacity = '1';
            
            return uploadedFileId;
            
        } catch (error) {
            console.error('File upload error:', error);
            notify('Failed to upload file. Please try again.', 'error');
            
            // Restore chip UI and remove uploading text
            renderFileChip();
            
            throw error;
        } finally {
            isUploading = false;
        }
    }

    /**
     * Get the currently selected file and its upload status
     * @returns {Object|null} Object containing file and fileId, or null
     */
    function getSelectedFile() {
        if (!selectedFile) return null;
        return {
            file: selectedFile,
            fileId: uploadedFileId
        };
    }

    /**
     * Initialize the file upload module
     */
    function init() {
        // Cache DOM elements
        DOM.fileInput = document.getElementById('fileInput');
        DOM.uploadBtn = document.getElementById('uploadBtn');
        DOM.chipContainer = document.getElementById('fileChipContainer');

        // Bind events
        if (DOM.uploadBtn && DOM.fileInput) {
            // Clicking the visible button triggers the hidden file input
            DOM.uploadBtn.addEventListener('click', () => {
                DOM.fileInput.click();
            });

            // Handle file selection
            DOM.fileInput.addEventListener('change', handleFileSelect);
        }
    }

    // Export public API
    return {
        init,
        getSelectedFile,
        uploadFile,
        clearFile
    };
})();