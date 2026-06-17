/**
 * Conversation History Module
 * Responsibilities: Manage the sidebar conversation list, handle creating new conversations,
 * fetching history, and switching between active conversations.
 */

// Initialize global App namespace if it doesn't exist
window.App = window.App || {};

window.App.history = (function() {
    'use strict';

    // State
    let currentConversationId = null;
    let conversations = [];

    // DOM Elements
    const DOM = {
        list: null,
        newBtn: null
    };

    /**
     * Safe HTML escaping to prevent XSS
     * (Fallback in case App.utils.escapeHtml is not yet loaded)
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
     * Format timestamp to human-readable format
     * (Fallback in case App.utils.formatTimestamp is not yet loaded)
     */
    function formatTimestamp(dateString) {
        if (window.App.utils && window.App.utils.formatTimestamp) {
            return window.App.utils.formatTimestamp(dateString);
        }

        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        
        // Reset hours to compare just the dates
        const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffTime = Math.abs(nowDay - dateDay);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return date.toLocaleDateString();
    }

    /**
     * Truncate text for conversation titles
     * (Fallback in case App.utils.truncateText is not yet loaded)
     */
    function truncateText(text, maxLength = 50) {
        if (window.App.utils && window.App.utils.truncateText) {
            return window.App.utils.truncateText(text, maxLength);
        }
        if (!text) return 'New Conversation';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Fetch the list of conversations for the current user
     */
    async function refreshConversationList() {
        try {
            // Get user ID from auth module, fallback to anonymous if not ready
            const userId = (window.App.auth && window.App.auth.getUserId()) || 'anonymous-user';
            
            const response = await fetch(`/api/conversations?userId=${encodeURIComponent(userId)}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch conversations: ${response.status}`);
            }
            
            conversations = await response.json();
            renderList();
        } catch (error) {
            console.error('Error fetching conversation history:', error);
            if (window.App.showToast) {
                window.App.showToast('Failed to load conversation history', 'error');
            }
        }
    }

    /**
     * Render the conversation list in the sidebar
     */
    function renderList() {
        if (!DOM.list) return;
        
        DOM.list.innerHTML = '';
        
        if (!conversations || conversations.length === 0) {
            DOM.list.innerHTML = '<div class="empty-history">No conversations yet. Start a new chat!</div>';
            return;
        }
        
        // Sort conversations by most recent first
        const sortedConversations = [...conversations].sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
        });
        
        sortedConversations.forEach(conv => {
            // Handle different ID field names depending on backend implementation
            const id = conv.id || conv.conversation_id;
            const item = document.createElement('div');
            item.className = 'conversation-item';
            
            if (id === currentConversationId) {
                item.classList.add('active');
            }
            
            const titleText = truncateText(conv.title || 'New Conversation', 50);
            const dateText = formatTimestamp(conv.updated_at || conv.created_at);
            
            item.innerHTML = `
                <div class="conversation-title" title="${escapeHtml(conv.title || 'New Conversation')}">
                    ${escapeHtml(titleText)}
                </div>
                <div class="conversation-date">${escapeHtml(dateText)}</div>
            `;
            
            item.addEventListener('click', () => {
                if (id !== currentConversationId) {
                    loadConversation(id);
                }
            });
            
            DOM.list.appendChild(item);
        });
    }

    /**
     * Update the active class in the UI without re-rendering the whole list
     */
    function updateActiveItem() {
        if (!DOM.list) return;
        
        const items = DOM.list.querySelectorAll('.conversation-item');
        // We need to re-render to easily match IDs since we didn't store IDs on the DOM elements
        // For simplicity and consistency, we'll just call renderList
        renderList();
    }

    /**
     * Load a specific conversation
     * @param {string} id - The conversation ID to load
     */
    async function loadConversation(id) {
        currentConversationId = id;
        updateActiveItem();
        
        // Close sidebar on mobile after selection
        if (window.innerWidth <= 768 && window.App.toggleSidebar) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                window.App.toggleSidebar();
            }
        }

        // Instruct chat module to load the messages
        if (window.App.chat && window.App.chat.loadMessages) {
            await window.App.chat.loadMessages(id);
        }
    }

    /**
     * Create a new conversation
     */
    async function createNewConversation() {
        try {
            const userId = (window.App.auth && window.App.auth.getUserId()) || 'anonymous-user';
            
            const response = await fetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId: userId,
                    title: 'New Conversation'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create conversation: ${response.status}`);
            }
            
            const data = await response.json();
            const newId = data.id || data.conversation_id;
            
            // Clear the chat UI for the new conversation
            if (window.App.chat && window.App.chat.clearChat) {
                window.App.chat.clearChat();
            }
            
            currentConversationId = newId;
            
            // Refresh the list to include the new conversation
            await refreshConversationList();
            
            // Note: We don't need to call loadMessages here because it's a brand new empty chat
            updateActiveItem();
            
        } catch (error) {
            console.error('Error creating new conversation:', error);
            if (window.App.showToast) {
                window.App.showToast('Failed to create new conversation', 'error');
            }
        }
    }

    /**
     * Get the currently active conversation ID
     * @returns {string|null} The active conversation ID
     */
    function getCurrentConversationId() {
        return currentConversationId;
    }

    /**
     * Initialize the history module
     */
    function init() {
        // Cache DOM elements
        DOM.list = document.getElementById('conversationList');
        DOM.newBtn = document.getElementById('newChatBtn');

        // Bind events
        if (DOM.newBtn) {
            DOM.newBtn.addEventListener('click', createNewConversation);
        }

        // Initial fetch
        refreshConversationList();
    }

    // Export public API
    return {
        init,
        loadConversation,
        refreshConversationList,
        getCurrentConversationId,
        createNewConversation
    };
})();