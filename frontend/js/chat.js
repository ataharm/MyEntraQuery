/**
 * Chat Module
 * Responsibilities: Core messaging functionality, rendering user/agent messages,
 * markdown parsing, syntax highlighting, typing indicators, and input handling.
 */

// Initialize global App namespace if it doesn't exist
window.App = window.App || {};

window.App.chat = (function() {
    'use strict';

    // State
    let isWaitingForResponse = false;

    // DOM Elements
    const DOM = {
        chatArea: null,
        messageInput: null,
        sendBtn: null,
        typingIndicator: null
    };

    /**
     * Safe HTML escaping to prevent XSS for plain text
     */
    function escapeHtml(unsafe) {
        if (window.App.utils && window.App.utils.escapeHtml) {
            return window.App.utils.escapeHtml(unsafe);
        }
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
     * Show toast notification
     */
    function notify(message, type = 'info') {
        if (window.App.showToast) {
            window.App.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Scroll the chat area to the bottom
     */
    function scrollToBottom() {
        if (DOM.chatArea) {
            // Use a slight delay to ensure DOM has updated and images/content rendered
            setTimeout(() => {
                DOM.chatArea.scrollTop = DOM.chatArea.scrollHeight;
            }, 50);
        }
    }

    /**
     * Copy text to clipboard with fallback
     * @param {string} text - Text to copy
     * @param {HTMLElement} btn - The button that triggered the copy (for visual feedback)
     */
    async function copyToClipboard(text, btn) {
        try {
            if (window.App.utils && window.App.utils.copyToClipboard) {
                await window.App.utils.copyToClipboard(text);
            } else if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            
            // Visual feedback
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
            btn.style.color = 'var(--success-color)';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.color = '';
            }, 2000);
            
            notify('Copied to clipboard', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            notify('Failed to copy to clipboard', 'error');
        }
    }

    /**
     * Render a user message in the chat
     * @param {string} text - The message text
     */
    function addUserMessage(text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper user';
        
        wrapper.innerHTML = `
            <div class="message user">
                <div class="message-content">${escapeHtml(text).replace(/
/g, '<br>')}</div>
            </div>
        `;
        
        // Insert before typing indicator if it exists, otherwise append
        if (DOM.typingIndicator && DOM.typingIndicator.parentNode === DOM.chatArea) {
            DOM.chatArea.insertBefore(wrapper, DOM.typingIndicator);
        } else {
            DOM.chatArea.appendChild(wrapper);
        }
        
        scrollToBottom();
    }

    /**
     * Render an agent message in the chat with Markdown and syntax highlighting
     * @param {string} text - The markdown message text
     */
    function addAgentMessage(text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper agent';
        
        // Parse markdown if marked.js is available, otherwise fallback to plain text
        let parsedContent = text;
        if (window.marked) {
            // Configure marked to break on newlines
            window.marked.setOptions({ breaks: true });
            parsedContent = window.marked.parse(text);
        } else {
            parsedContent = `<p>${escapeHtml(text).replace(/
/g, '<br>')}</p>`;
        }
        
        wrapper.innerHTML = `
            <div class="message agent">
                <div class="message-content">${parsedContent}</div>
                <div class="message-actions">
                    <button class="action-btn copy-msg-btn" title="Copy message">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy
                    </button>
                </div>
            </div>
        `;
        
        // Apply syntax highlighting and add copy buttons to code blocks
        const preBlocks = wrapper.querySelectorAll('pre');
        preBlocks.forEach(pre => {
            // Add copy button to pre block
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
            
            const codeBlock = pre.querySelector('code');
            const codeText = codeBlock ? codeBlock.innerText : pre.innerText;
            
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(codeText, copyBtn);
            });
            
            pre.appendChild(copyBtn);
            
            // Apply highlight.js if available
            if (codeBlock && window.hljs) {
                window.hljs.highlightElement(codeBlock);
            }
        });
        
        // Bind full message copy button
        const copyMsgBtn = wrapper.querySelector('.copy-msg-btn');
        if (copyMsgBtn) {
            copyMsgBtn.addEventListener('click', () => {
                copyToClipboard(text, copyMsgBtn);
            });
        }
        
        // Insert before typing indicator if it exists
        if (DOM.typingIndicator && DOM.typingIndicator.parentNode === DOM.chatArea) {
            DOM.chatArea.insertBefore(wrapper, DOM.typingIndicator);
        } else {
            DOM.chatArea.appendChild(wrapper);
        }
        
        scrollToBottom();
    }

    /**
     * Toggle the typing indicator visibility
     * @param {boolean} show - Whether to show or hide
     */
    function setTypingIndicator(show) {
        if (!DOM.typingIndicator) return;
        
        if (show) {
            DOM.typingIndicator.classList.add('active');
            scrollToBottom();
        } else {
            DOM.typingIndicator.classList.remove('active');
        }
    }

    /**
     * Clear all messages from the chat area
     */
    function clearChat() {
        if (!DOM.chatArea) return;
        
        // Remove all message wrappers
        const messages = DOM.chatArea.querySelectorAll('.message-wrapper');
        messages.forEach(msg => msg.remove());
        
        // Ensure typing indicator is hidden
        setTypingIndicator(false);
    }

    /**
     * Load messages for a specific conversation
     * @param {string} conversationId - The ID of the conversation to load
     */
    async function loadMessages(conversationId) {
        if (!conversationId) return;
        
        clearChat();
        setTypingIndicator(true);
        
        try {
            const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load messages: ${response.status}`);
            }
            
            const data = await response.json();
            const messages = data.messages || [];
            
            setTypingIndicator(false);
            
            // Render messages
            messages.forEach(msg => {
                if (msg.role === 'user') {
                    addUserMessage(msg.content);
                } else if (msg.role === 'agent' || msg.role === 'assistant') {
                    addAgentMessage(msg.content);
                }
            });
            
            scrollToBottom();
            
        } catch (error) {
            console.error('Error loading messages:', error);
            setTypingIndicator(false);
            notify('Failed to load conversation history', 'error');
        }
    }

    /**
     * Handle textarea auto-resize
     */
    function handleInputResize() {
        if (!DOM.messageInput) return;
        
        // Reset height to auto to correctly calculate scrollHeight
        DOM.messageInput.style.height = 'auto';
        
        // Set new height based on scrollHeight, capped by max-height in CSS
        const newHeight = Math.min(DOM.messageInput.scrollHeight, 200);
        DOM.messageInput.style.height = newHeight + 'px';
        
        // Enable/disable send button based on content
        const text = DOM.messageInput.value.trim();
        const hasFile = window.App.fileUpload && window.App.fileUpload.getSelectedFile();
        
        if (DOM.sendBtn) {
            DOM.sendBtn.disabled = text.length === 0 && !hasFile;
        }
    }

    /**
     * Send a message to the API
     */
    async function sendMessage() {
        if (isWaitingForResponse || !DOM.messageInput) return;
        
        const text = DOM.messageInput.value.trim();
        const fileData = window.App.fileUpload ? window.App.fileUpload.getSelectedFile() : null;
        
        // Don't send if empty and no file
        if (!text && !fileData) return;
        
        // Disable input UI
        isWaitingForResponse = true;
        DOM.messageInput.disabled = true;
        if (DOM.sendBtn) DOM.sendBtn.disabled = true;
        
        let fileId = null;
        
        try {
            // 1. Handle file upload if a file is selected but not yet uploaded
            if (fileData && fileData.file && !fileData.fileId) {
                fileId = await window.App.fileUpload.uploadFile();
            } else if (fileData && fileData.fileId) {
                fileId = fileData.fileId;
            }
            
            // 2. Add user message to UI
            if (text) {
                addUserMessage(text);
            } else if (fileData) {
                addUserMessage(`[Attached File: ${fileData.file.name}]`);
            }
            
            // Clear input
            DOM.messageInput.value = '';
            DOM.messageInput.style.height = 'auto';
            
            // 3. Show typing indicator
            setTypingIndicator(true);
            
            // 4. Prepare payload
            const conversationId = window.App.history ? window.App.history.getCurrentConversationId() : null;
            const payload = {
                message: text,
                conversation_id: conversationId,
                file_ids: fileId ? [fileId] : []
            };
            
            // 5. Send to API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`Chat API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // 6. Hide typing indicator and show response
            setTypingIndicator(false);
            addAgentMessage(data.message || data.response || 'No response received.');
            
            // 7. Clear file upload UI
            if (window.App.fileUpload) {
                window.App.fileUpload.clearFile();
            }
            
            // 8. If this was a new conversation, refresh the history list
            // (The backend might return a new conversation_id if we didn't provide one)
            if (!conversationId && data.conversation_id && window.App.history) {
                // We'd need a way to set the current ID in history module without reloading messages
                // For now, just refreshing the list is safe
                window.App.history.refreshConversationList();
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            setTypingIndicator(false);
            notify('Failed to send message. Please try again.', 'error');
        } finally {
            // Re-enable input UI
            isWaitingForResponse = false;
            DOM.messageInput.disabled = false;
            DOM.messageInput.focus();
            handleInputResize(); // Re-evaluate send button state
        }
    }

    /**
     * Initialize the chat module
     */
    function init() {
        // Cache DOM elements
        DOM.chatArea = document.querySelector('.chat-area');
        DOM.messageInput = document.getElementById('messageInput');
        DOM.sendBtn = document.getElementById('sendBtn');
        DOM.typingIndicator = document.getElementById('typingIndicator');

        // Bind Textarea Events
        if (DOM.messageInput) {
            DOM.messageInput.addEventListener('input', handleInputResize);
            
            DOM.messageInput.addEventListener('keydown', (e) => {
                // Enter to send, Shift+Enter for newline
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!DOM.sendBtn.disabled) {
                        sendMessage();
                    }
                }
            });
            
            // Initial resize to set correct height
            handleInputResize();
        }

        // Bind Send Button
        if (DOM.sendBtn) {
            DOM.sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                sendMessage();
            });
        }
        
        // Listen for file selection changes to enable/disable send button
        // We can hook into the DOM node since fileUpload.js updates it
        const fileChipContainer = document.getElementById('fileChipContainer');
        if (fileChipContainer) {
            const observer = new MutationObserver(() => {
                handleInputResize();
            });
            observer.observe(fileChipContainer, { childList: true });
        }
    }

    // Export public API
    return {
        init,
        sendMessage,
        loadMessages,
        clearChat,
        addUserMessage,
        addAgentMessage
    };
})();