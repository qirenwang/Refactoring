/**
 * Stagewise Toolbar Integration
 * Provides AI-powered editing capabilities through a browser toolbar
 * Only loads in development mode
 */

(function() {
    'use strict';

    // Check if we're in development mode
    const isDevelopment = window.location.hostname === 'localhost' ||
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname.includes('dev') ||
                         window.location.port === '3000' ||
                         window.location.port === '3001';
    
    // Only initialize in development mode
    if (!isDevelopment) {
        console.log('Stagewise toolbar disabled in production mode');
        return;
    }
    
    console.log('🔧 Initializing Stagewise Toolbar in development mode...');
    
    // State management
    let isToolbarVisible = false;
    let isElementSelectionMode = false;
    let selectedElement = null;
    let highlightedElement = null;
    let commentModal = null;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeStagewiseToolbar);
    } else {
        initializeStagewiseToolbar();
    }
    
    function initializeStagewiseToolbar() {
        try {
            console.log('🔧 Creating Stagewise toolbar...');
            
            // Try to load stagewise from npm package first
            if (window.StagewiseToolbar || window.Stagewise) {
                initializeOfficialStagewise();
            } else {
                // Create our own implementation
                createCustomStagewiseToolbar();
            }
        } catch (error) {
            console.warn('Stagewise toolbar initialization error:', error);
            createCustomStagewiseToolbar();
        }
    }
    
    function initializeOfficialStagewise() {
        try {
            const StagewiseLib = window.StagewiseToolbar || window.Stagewise;
            const config = {
                position: 'bottom',
                environment: 'development',
                project: {
                    name: 'MicroPlastics Data Entry',
                    framework: 'Express.js',
                    language: 'JavaScript'
                }
            };
            
            if (typeof StagewiseLib.init === 'function') {
                StagewiseLib.init(config);
                console.log('🔧 Official Stagewise toolbar initialized!');
                return;
            }
        } catch (error) {
            console.warn('Failed to initialize official Stagewise, using custom implementation:', error);
        }
        
        createCustomStagewiseToolbar();
    }
    
    function createCustomStagewiseToolbar() {
        console.log('🔧 Creating custom Stagewise toolbar implementation...');
        
        // Add required CSS
        addToolbarStyles();
        
        // Create bottom toolbar
        createBottomToolbar();
        
        // Initialize element selection functionality
        initializeElementSelection();
        
        console.log('🔧 Custom Stagewise toolbar created successfully!');
    }
    
    function addToolbarStyles() {
        if (document.getElementById('stagewise-toolbar-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'stagewise-toolbar-styles';
        style.textContent = `
            .stagewise-toolbar {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 20px;
                box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                align-items: center;
                justify-content: space-between;
                transition: transform 0.3s ease;
                transform: translateY(100%);
            }
            
            .stagewise-toolbar.visible {
                transform: translateY(0);
            }
            
            .stagewise-toolbar-left {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .stagewise-toolbar-right {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .stagewise-btn {
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s ease;
                user-select: none;
            }
            
            .stagewise-btn:hover {
                background: rgba(255,255,255,0.3);
                transform: translateY(-1px);
            }
            
            .stagewise-btn.active {
                background: rgba(255,255,255,0.4);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
            
            .stagewise-toggle {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000000;
                font-size: 18px;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .stagewise-toggle:hover {
                transform: translateY(-2px) scale(1.05);
                box-shadow: 0 6px 25px rgba(0,0,0,0.4);
            }
            
            .stagewise-element-highlight {
                outline: 3px solid #667eea !important;
                outline-offset: 2px !important;
                background: rgba(102, 126, 234, 0.1) !important;
                cursor: crosshair !important;
                position: relative !important;
            }
            
            .stagewise-element-selected {
                outline: 3px solid #28a745 !important;
                outline-offset: 2px !important;
                background: rgba(40, 167, 69, 0.1) !important;
            }
            
            .stagewise-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .stagewise-modal-content {
                background: white;
                border-radius: 8px;
                padding: 20px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            }
            
            .stagewise-modal h3 {
                margin: 0 0 15px 0;
                color: #333;
                font-size: 18px;
            }
            
            .stagewise-modal textarea {
                width: 100%;
                height: 100px;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                font-family: inherit;
                resize: vertical;
            }
            
            .stagewise-modal-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 15px;
            }
            
            .stagewise-modal-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s ease;
            }
            
            .stagewise-modal-btn.primary {
                background: #667eea;
                color: white;
            }
            
            .stagewise-modal-btn.secondary {
                background: #6c757d;
                color: white;
            }
            
            .stagewise-modal-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }
    
    function createBottomToolbar() {
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'stagewise-toggle';
        toggleBtn.innerHTML = '🔧';
        toggleBtn.title = 'Toggle Stagewise Toolbar';
        document.body.appendChild(toggleBtn);
        
        // Create toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'stagewise-toolbar';
        toolbar.innerHTML = `
            <div class="stagewise-toolbar-left">
                <div style="font-weight: 600; font-size: 14px;">🔧 Stagewise Dev Tools</div>
                <div style="font-size: 11px; opacity: 0.8;">Express.js Project</div>
            </div>
            <div class="stagewise-toolbar-right">
                <button class="stagewise-btn" id="select-element-btn">
                    📍 Select Element
                </button>
                <button class="stagewise-btn" id="clear-selection-btn" style="display: none;">
                    ✖️ Clear
                </button>
                <button class="stagewise-btn" id="close-toolbar-btn">
                    ❌ Close
                </button>
            </div>
        `;
        document.body.appendChild(toolbar);
        
        // Add event listeners
        toggleBtn.addEventListener('click', toggleToolbar);
        toolbar.querySelector('#select-element-btn').addEventListener('click', toggleElementSelection);
        toolbar.querySelector('#clear-selection-btn').addEventListener('click', clearSelection);
        toolbar.querySelector('#close-toolbar-btn').addEventListener('click', hideToolbar);
        
        return toolbar;
    }
    
    function toggleToolbar() {
        const toolbar = document.querySelector('.stagewise-toolbar');
        isToolbarVisible = !isToolbarVisible;
        
        if (isToolbarVisible) {
            toolbar.classList.add('visible');
            console.log('🔧 Stagewise toolbar opened');
        } else {
            toolbar.classList.remove('visible');
            if (isElementSelectionMode) {
                toggleElementSelection();
            }
            console.log('🔧 Stagewise toolbar closed');
        }
    }
    
    function hideToolbar() {
        const toolbar = document.querySelector('.stagewise-toolbar');
        isToolbarVisible = false;
        toolbar.classList.remove('visible');
        if (isElementSelectionMode) {
            toggleElementSelection();
        }
    }
    
    function toggleElementSelection() {
        const btn = document.querySelector('#select-element-btn');
        const clearBtn = document.querySelector('#clear-selection-btn');
        
        isElementSelectionMode = !isElementSelectionMode;
        
        if (isElementSelectionMode) {
            btn.classList.add('active');
            btn.textContent = '🎯 Selecting...';
            clearBtn.style.display = 'inline-block';
            document.body.style.cursor = 'crosshair';
            console.log('🔧 Element selection mode enabled');
        } else {
            btn.classList.remove('active');
            btn.textContent = '📍 Select Element';
            clearBtn.style.display = 'none';
            document.body.style.cursor = '';
            clearHighlight();
            console.log('🔧 Element selection mode disabled');
        }
    }
    
    function clearSelection() {
        if (selectedElement) {
            selectedElement.classList.remove('stagewise-element-selected');
            selectedElement = null;
        }
        clearHighlight();
        console.log('🔧 Selection cleared');
    }
    
    function clearHighlight() {
        if (highlightedElement) {
            highlightedElement.classList.remove('stagewise-element-highlight');
            highlightedElement = null;
        }
    }
    
    function initializeElementSelection() {
        document.addEventListener('mouseover', function(e) {
            if (!isElementSelectionMode) return;
            
            // Don't highlight toolbar elements
            if (e.target.closest('.stagewise-toolbar, .stagewise-toggle, .stagewise-modal')) {
                return;
            }
            
            clearHighlight();
            highlightedElement = e.target;
            highlightedElement.classList.add('stagewise-element-highlight');
        });
        
        document.addEventListener('mouseout', function(e) {
            if (!isElementSelectionMode) return;
            // Keep highlight for better UX
        });
        
        document.addEventListener('click', function(e) {
            if (!isElementSelectionMode) return;
            
            // Don't select toolbar elements
            if (e.target.closest('.stagewise-toolbar, .stagewise-toggle, .stagewise-modal')) {
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            // Clear previous selection
            clearSelection();
            
            // Select new element
            selectedElement = e.target;
            selectedElement.classList.remove('stagewise-element-highlight');
            selectedElement.classList.add('stagewise-element-selected');
            
            // Show comment modal
            showCommentModal(selectedElement);
            
            console.log('🔧 Element selected:', selectedElement.tagName, selectedElement.className || selectedElement.id || '');
        });
    }
    
    function showCommentModal(element) {
        const modal = document.createElement('div');
        modal.className = 'stagewise-modal';
        
        const elementInfo = getElementInfo(element);
        
        modal.innerHTML = `
            <div class="stagewise-modal-content">
                <h3>Add AI-Powered Comment</h3>
                <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px;">
                    <strong>Selected Element:</strong><br>
                    ${elementInfo}
                </div>
                <textarea id="stagewise-comment" placeholder="Describe what you'd like to change about this element...

Examples:
- Make this button larger and more prominent
- Change the text color to blue
- Add hover effects
- Move this section to the right
- Make the form validation more user-friendly"></textarea>
                <div class="stagewise-modal-buttons">
                    <button class="stagewise-modal-btn secondary" id="cancel-comment">Cancel</button>
                    <button class="stagewise-modal-btn primary" id="submit-comment">Submit for AI Processing</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        commentModal = modal;
        
        // Focus textarea
        setTimeout(() => {
            modal.querySelector('#stagewise-comment').focus();
        }, 100);
        
        // Event listeners
        modal.querySelector('#cancel-comment').addEventListener('click', closeCommentModal);
        modal.querySelector('#submit-comment').addEventListener('click', submitComment);
        
        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeCommentModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeCommentModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }
    
    function closeCommentModal() {
        if (commentModal) {
            commentModal.remove();
            commentModal = null;
        }
        toggleElementSelection(); // Exit selection mode
    }
    
    function submitComment() {
        const comment = document.querySelector('#stagewise-comment').value.trim();
        
        if (!comment) {
            alert('Please enter a comment describing what you\'d like to change.');
            return;
        }
        
        // Process the comment with AI (simulated)
        processAIComment(selectedElement, comment);
        closeCommentModal();
    }
      function processAIComment(element, comment) {
        console.log('🔧 Processing AI comment for element:', element);
        console.log('💬 Comment:', comment);
        console.log('📍 Element details:', getElementInfo(element));
        
        // Create comprehensive prompt for AI
        const elementInfo = getDetailedElementInfo(element);
        const aiPrompt = createAIPrompt(elementInfo, comment);
        
        console.log('🤖 Generated AI Prompt:');
        console.log(aiPrompt);
        
        // Try to send to AI assistant
        sendToAIAssistant(aiPrompt);
        
        // Show success notification
        showNotification(`AI prompt copied to clipboard! Switch to your AI assistant and paste.\n`, 'success');
    }
    
    function getDetailedElementInfo(element) {
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
        const text = element.textContent ? element.textContent.trim().substring(0, 200) : '';
        const attributes = Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
        
        // Get parent context
        const parent = element.parentElement;
        const parentInfo = parent ? `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}${parent.className ? '.' + parent.className.split(' ').join('.') : ''}` : 'none';
        
        // Get file context
        const currentPage = window.location.pathname;
        const pageTitle = document.title;
        
        return {
            selector: `${tagName}${id}${classes}`,
            tagName,
            id: element.id || 'none',
            classes: element.className || 'none',
            text: text || 'none',
            attributes,
            parentElement: parentInfo,
            currentPage,
            pageTitle,
            outerHTML: element.outerHTML.substring(0, 500) + (element.outerHTML.length > 500 ? '...' : '')
        };
    }
      function createAIPrompt(elementInfo, userComment) {
        return `I need help modifying an element in my Express.js/EJS web application.

**Context:**
- File: ${elementInfo.currentPage} (EJS template)
- Page Title: ${elementInfo.pageTitle}
- Framework: Express.js with EJS templating

**Target Element:**
- Tag: <${elementInfo.tagName}>
- ID: ${elementInfo.id}
- Classes: ${elementInfo.classes}
- CSS Selector: ${elementInfo.selector}
- Parent Element: <${elementInfo.parentElement}>

**Current Content:**
${elementInfo.text !== 'none' ? `Text Content: "${elementInfo.text}"` : 'No text content'}

**HTML Code:**
\`\`\`html
${elementInfo.outerHTML}
\`\`\`

**What I Want to Change:**
${userComment}

**Please Help Me:**
1. Analyze the current implementation of this element
2. Suggest specific code changes to implement the requested modification
3. If you need to see more context (full file content, CSS, or related files), please let me know
4. Provide the exact code changes needed, considering this is an EJS template in an Express.js application

**Additional Notes:**
- This element was selected using the Stagewise dev toolbar
- The project structure follows standard Express.js conventions with views/ directory for EJS files
- Consider responsive design and accessibility best practices`;
    }
      function sendToAIAssistant(prompt) {
        try {            // Check if we're in VS Code environment (development mode)
            const isVSCode = window.location.protocol === 'http:' && isDevelopment;
            
            // Method 1: Always copy to clipboard first
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(prompt).then(() => {
                    if (isVSCode) {
                        // showAIPromptDialog(prompt);
                    } else {
                        showNotification('AI prompt copied to clipboard! Switch to your AI assistant and paste.', 'success');
                    }
                }).catch(() => {
                    fallbackCopyMethod(prompt);
                });
            } else {
                fallbackCopyMethod(prompt);
                if (isVSCode) {
                    // showAIPromptDialog(prompt);
                }
            }
            
            // Method 2: Try to detect and interact with web-based chat interface
            if (!isVSCode) {
                detectAndSendToChatInterface(prompt);
            }
            
        } catch (error) {
            console.error('Error sending to AI assistant:', error);
            showNotification('Unable to send automatically. Check console for the AI prompt.', 'warning');
        }
    }
    
    function showAIPromptDialog(prompt) {
        // Create a styled dialog for VS Code environment
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #007acc;
            border-radius: 8px;
            padding: 20px;
            max-width: 80%;
            max-height: 80%;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 1000003;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
        `;
        
        dialog.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #007acc; font-size: 16px;">🤖 AI Prompt Generated</h3>
                <p style="margin: 0; color: #666; font-size: 12px;">The prompt has been copied to your clipboard. Switch to your AI assistant (VS Code Copilot Chat, GitHub Copilot, etc.) and paste it.</p>
            </div>
            
            <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 15px; margin: 15px 0; max-height: 300px; overflow-y: auto;">
                <pre style="margin: 0; white-space: pre-wrap; font-size: 11px; line-height: 1.4;">${prompt}</pre>
            </div>
            
            <div style="text-align: right; margin-top: 15px;">
                <button id="copy-again-btn" style="background: #007acc; color: white; border: none; padding: 8px 16px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 Copy Again</button>
                <button id="close-dialog-btn" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">✖ Close</button>
            </div>
        `;
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000002;
        `;
        
        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);
        
        // Add event listeners
        document.getElementById('copy-again-btn').addEventListener('click', () => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(prompt).then(() => {
                    showNotification('Prompt copied again!', 'success');
                });
            } else {
                fallbackCopyMethod(prompt);
            }
        });
        
        document.getElementById('close-dialog-btn').addEventListener('click', closeDialog);
        backdrop.addEventListener('click', closeDialog);
        
        function closeDialog() {
            if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        }
        
        // Auto close after 15 seconds
        setTimeout(closeDialog, 15000);
    }

    function fallbackCopyMethod(text) {
        // Create temporary textarea for copying
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            showNotification('AI prompt copied to clipboard! Paste it in the chat window.', 'success');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            showNotification('Copy failed. Check console for the AI prompt.', 'error');
        }
        
        document.body.removeChild(textArea);
    }
    
    function detectAndSendToChatInterface(prompt) {
        // Try to detect common AI chat interfaces
        const chatSelectors = [
            'textarea[placeholder*="Enter prompt"]',
            'textarea[placeholder*="Type a message"]',
            'textarea[aria-label*="Message"]',
            '[data-testid="textbox"]',
            '.chatbox textarea',
            '#chat-input',
            '[role="textbox"]'
        ];
        
        let chatInput = null;
        for (const selector of chatSelectors) {
            chatInput = document.querySelector(selector);
            if (chatInput) {
                console.log('🎯 Found potential chat input:', selector);
                break;
            }
        }
        
        if (chatInput) {
            try {
                // Try to populate the chat input
                chatInput.value = prompt;
                chatInput.textContent = prompt;
                
                // Trigger input events
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                chatInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Focus the input
                chatInput.focus();
                
                showNotification('AI prompt sent to chat interface! Press Enter to send.', 'success');
                console.log('✅ Prompt sent to chat interface');
                
                // Try to find and click send button (optional)
                setTimeout(() => {
                    const sendButtons = document.querySelectorAll('button[type="submit"], button[aria-label*="Send"], button:contains("Send")');
                    for (const btn of sendButtons) {
                        if (btn.offsetParent !== null) { // Check if visible
                            console.log('🎯 Found potential send button, but not auto-clicking for safety');
                            break;
                        }
                    }
                }, 100);
                
            } catch (error) {
                console.error('Error interacting with chat interface:', error);
                showNotification('Found chat interface but couldn\'t populate it. Prompt copied to clipboard instead.', 'warning');
            }
        } else {
            console.log('ℹ️ No chat interface detected. Prompt available in console and clipboard.');
        }
    }
    
    function getElementInfo(element) {
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
        const text = element.textContent ? element.textContent.substring(0, 50) + (element.textContent.length > 50 ? '...' : '') : '';
        
        return `&lt;${tagName}${id}${classes}&gt;${text ? '<br><em>Text: "' + text + '"</em>' : ''}`;
    }
    
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 1000002;
            max-width: 300px;
            word-wrap: break-word;
            white-space: pre-line;
            animation: slideInFromRight 0.3s ease;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutToRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    // Add notification animations
    if (!document.getElementById('stagewise-notification-animations')) {
        const style = document.createElement('style');
        style.id = 'stagewise-notification-animations';
        style.textContent = `
            @keyframes slideInFromRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutToRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
})();
