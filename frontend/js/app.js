/**
 * Main Application Orchestrator
 * Responsibilities: Initialize all modules in the correct sequence, manage global UI state
 * (sidebar toggle, responsive behavior), provide a global toast notification system,
 * and handle global errors.
 */

// Initialize global App namespace
window.App = window.App || {};

(function(App) {
    'use strict';

    // Constants
    const TOAST_DURATION = 3000; // 3 seconds
    const MOBILE_BREAKPOINT = 768;

    // SVG Icons for Toasts
    const TOAST_ICONS = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    /**
     * Display a toast notification
     * @param {string} message - The message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    App.showToast = function(message, type = 'info') {
        // Ensure toast container exists
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
        
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
            <button class="toast-close" aria-label="Close notification">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        // Add to container
        container.appendChild(toast);

        // Setup removal
        const removeToast = () => {
            if (toast.parentNode) {
                toast.classList.add('hiding');
                toast.addEventListener('animationend', () => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                });
            }
        };

        // Bind close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', removeToast);

        // Auto remove after duration
        setTimeout(removeToast, TOAST_DURATION);
    };

    /**
     * Toggle the mobile sidebar visibility
     */
    App.toggleSidebar = function() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // Create overlay if it doesn't exist (handling the cut-off CSS)
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            // Apply inline styles as fallback for truncated CSS
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0', right: '0', bottom: '0',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: '15',
                display: 'none',
                opacity: '0',
                transition: 'opacity 0.3s ease'
            });
            document.body.appendChild(overlay);
            
            // Close sidebar when clicking overlay
            overlay.addEventListener('click', App.toggleSidebar);
        }

        const isOpen = sidebar.classList.contains('open');
        
        if (isOpen) {
            sidebar.classList.remove('open');
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
        } else {
            sidebar.classList.add('open');
            overlay.style.display = 'block';
            // Small delay to allow display:block to apply before changing opacity for transition
            setTimeout(() => { overlay.style.opacity = '1'; }, 10);
        }
    };

    /**
     * Safe HTML escaping utility for internal use
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
     * Setup global error handlers
     */
    function setupErrorHandling() {
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled Promise Rejection:', event.reason);
            // Only show toast for actual Error objects to avoid spamming UI with minor network aborts
            if (event.reason instanceof Error) {
                App.showToast('An unexpected error occurred.', 'error');
            }
        });

        window.addEventListener('error', (event) => {
            console.error('Global Error:', event.error);
            App.showToast('An application error occurred.', 'error');
        });
    }

    /**
     * Handle window resize events for responsive layout adjustments
     */
    function handleResize() {
        if (window.innerWidth > MOBILE_BREAKPOINT) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            
            // Reset mobile states when returning to desktop view
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
            if (overlay) {
                overlay.style.display = 'none';
                overlay.style.opacity = '0';
            }
        }
    }

    /**
     * Main Initialization Sequence
     */
    App.init = async function() {
        try {
            // 1. Setup global utilities and listeners
            setupErrorHandling();
            window.addEventListener('resize', handleResize);

            const sidebarToggleBtn = document.getElementById('sidebarToggle');
            if (sidebarToggleBtn) {
                sidebarToggleBtn.addEventListener('click', App.toggleSidebar);
            }

            // 2. Initialize Theme (Synchronous)
            if (App.theme && typeof App.theme.init === 'function') {
                App.theme.init();
            }

            // 3. Initialize Auth (Asynchronous - wait for user identity)
            if (App.auth && typeof App.auth.init === 'function') {
                await App.auth.init();
            }

            // 4. Initialize History (Depends on Auth for user ID)
            if (App.history && typeof App.history.init === 'function') {
                App.history.init();
            }

            // 5. Initialize File Upload
            if (App.fileUpload && typeof App.fileUpload.init === 'function') {
                App.fileUpload.init();
            }

            // 6. Initialize Chat (Depends on History and FileUpload)
            if (App.chat && typeof App.chat.init === 'function') {
                App.chat.init();
            }

            console.log('Application initialized successfully.');

        } catch (error) {
            console.error('Application initialization failed:', error);
            App.showToast('Failed to initialize application completely.', 'error');
        }
    };

    // Boot the application when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', App.init);
    } else {
        // DOM already loaded
        App.init();
    }

})(window.App);