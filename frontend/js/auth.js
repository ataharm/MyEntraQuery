/**
 * Authentication Module
 * Responsibilities: Handle Azure Static Web Apps EasyAuth integration,
 * fetch user identity, update UI with user details, and provide user ID
 * for conversation isolation.
 */

// Initialize global App namespace if it doesn't exist
window.App = window.App || {};

window.App.auth = (function() {
    'use strict';

    // State
    let currentUser = null;
    
    // Fallback ID for local development or unauthenticated state
    const DEFAULT_USER_ID = 'anonymous-user';

    /**
     * Fetch user information from Azure Static Web Apps built-in auth endpoint
     * @returns {Promise<void>}
     */
    async function fetchUserInfo() {
        try {
            const response = await fetch('/.auth/me');
            
            if (!response.ok) {
                throw new Error(`Auth request failed with status ${response.status}`);
            }
            
            const payload = await response.json();
            const { clientPrincipal } = payload;

            if (clientPrincipal) {
                // User is authenticated
                currentUser = {
                    userId: clientPrincipal.userId,
                    userDetails: clientPrincipal.userDetails,
                    identityProvider: clientPrincipal.identityProvider
                };
                updateUI();
            } else {
                // User is not authenticated
                handleUnauthenticated();
            }
        } catch (error) {
            console.warn('Authentication endpoint not reachable. Defaulting to guest mode.', error);
            handleUnauthenticated();
        }
    }

    /**
     * Update the UI with the authenticated user's details
     */
    function updateUI() {
        const userNameEl = document.getElementById('userName');
        if (userNameEl && currentUser) {
            // Display the user's name/email, fallback to 'Authenticated User' if missing
            userNameEl.textContent = currentUser.userDetails || 'Authenticated User';
        }
    }

    /**
     * Handle the unauthenticated state gracefully
     */
    function handleUnauthenticated() {
        currentUser = null;
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = 'Guest User';
        }
    }

    /**
     * Redirect the user to the EasyAuth logout endpoint
     */
    function logout() {
        // Azure Static Web Apps default logout endpoint
        window.location.href = '/.auth/logout';
    }

    /**
     * Get the current user's ID for API requests and conversation isolation
     * @returns {string} The user ID or a default anonymous ID
     */
    function getUserId() {
        return currentUser && currentUser.userId ? currentUser.userId : DEFAULT_USER_ID;
    }

    /**
     * Initialize the authentication module
     * @returns {Promise<void>}
     */
    async function init() {
        // Bind logout button event listener if the element exists
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Fetch and process user info
        await fetchUserInfo();
    }

    // Export public API
    return {
        init,
        getUserId,
        logout
    };
})();