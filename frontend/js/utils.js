/**
 * Shared Utilities Module
 * Responsibilities: Provide pure, reusable utility functions across the application
 * for formatting, validation, text manipulation, and browser API fallbacks.
 */

// Initialize global App namespace if it doesn't exist
window.App = window.App || {};

window.App.utils = (function() {
    'use strict';

    /**
     * Convert ISO dates or Date objects to human-readable format
     * @param {string|Date} dateInput - The date to format
     * @returns {string} Formatted date string ('Today', 'Yesterday', or 'MM/DD/YYYY')
     */
    function formatTimestamp(dateInput) {
        if (!dateInput) return '';
        
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return ''; // Handle invalid dates

        const now = new Date();
        
        // Create date objects for midnight to compare just the days
        const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (targetDate.getTime() === today.getTime()) {
            return 'Today';
        } else if (targetDate.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Truncate text to a maximum length and append an ellipsis if needed
     * @param {string} text - The text to truncate
     * @param {number} maxLength - Maximum allowed length (default: 50)
     * @returns {string} Truncated text
     */
    function truncateText(text, maxLength = 50) {
        if (!text) return '';
        const str = String(text);
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }

    /**
     * Safely escape HTML characters to prevent XSS attacks
     * @param {string} unsafe - The potentially unsafe string
     * @returns {string} Escaped safe HTML string
     */
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Debounce a function call to optimize performance (e.g., for resize events)
     * @param {Function} func - The function to debounce
     * @param {number} wait - Milliseconds to wait before executing
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Copy text to clipboard using the modern Clipboard API with a fallback
     * for older browsers or non-secure contexts.
     * @param {string} text - The text to copy
     * @returns {Promise<boolean>} Resolves to true if successful
     */
    async function copyToClipboard(text) {
        // Try modern Clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('Clipboard API failed, falling back to execCommand', err);
            }
        }
        
        // Fallback for older browsers
        return new Promise((resolve, reject) => {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                
                // Move outside of viewport to avoid scrolling or visual jumps
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const successful = document.execCommand('copy');
                textArea.remove();
                
                if (successful) {
                    resolve(true);
                } else {
                    reject(new Error('execCommand copy failed'));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Format file size in bytes to a human-readable string
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size (e.g., '1.5 MB')
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        if (!bytes || isNaN(bytes)) return '';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Validate if a filename has an allowed extension
     * @param {string} filename - The name of the file
     * @param {string[]} allowedExtensions - Array of allowed extensions (e.g., ['.pdf', '.csv'])
     * @returns {boolean} True if valid, false otherwise
     */
    function validateFileType(filename, allowedExtensions) {
        if (!filename || !allowedExtensions || !Array.isArray(allowedExtensions)) {
            return false;
        }
        
        const lowerName = filename.toLowerCase();
        return allowedExtensions.some(ext => lowerName.endsWith(ext.toLowerCase()));
    }

    /**
     * Generate a unique ID for optimistic UI updates or temporary elements
     * @returns {string} A unique identifier string
     */
    function generateId() {
        // Use crypto.randomUUID if available (modern browsers)
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        
        // Fallback pseudo-random ID generator
        return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
    }

    // Export public API
    return {
        formatTimestamp,
        truncateText,
        escapeHtml,
        debounce,
        copyToClipboard,
        formatFileSize,
        validateFileType,
        generateId
    };
})();