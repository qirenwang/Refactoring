/**
 * Stagewise Toolbar Integration
 * Provides AI-powered editing capabilities through a browser toolbar
 * Only loads in development mode
 */

(function() {
    'use strict';    // Check if we're in development mode    const isDevelopment = window.location.hostname === 'localhost' || 
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
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeStagewise);
    } else {
        initializeStagewise();
    }
    
    function initializeStagewise() {
        console.log('🔧 Starting Stagewise initialization...');
        
        // Try to load the actual stagewise package first
        loadStagewisePackage();
    }
    
    function loadStagewisePackage() {
        console.log('🔧 Loading @stagewise/toolbar-next...');
        
        // Create script element to load stagewise
        const script = document.createElement('script');
        script.type = 'module';
        script.innerHTML = `
            import { StagewiseToolbar } from 'https://unpkg.com/@stagewise/toolbar-next@latest/dist/index.js';
            
            console.log('🔧 Stagewise module loaded, initializing...');
            
            const toolbar = new StagewiseToolbar({
                plugins: [],
                environment: 'development',
                project: {
                    name: 'MicroPlastics Data Entry',
                    framework: 'Express.js',
                    language: 'JavaScript'
                },
                theme: {
                    position: 'top-right'
                }
            });
            
            toolbar.init();
            console.log('🔧 Stagewise toolbar initialized successfully!');
            
            // Make toolbar globally accessible for debugging
            window.stagewise = toolbar;
        `;
        
        script.onerror = function(error) {
            console.warn('Failed to load stagewise module:', error);
            loadStagewiseScript();
        };
        
        document.head.appendChild(script);
        
        // Fallback after timeout
        setTimeout(() => {
            if (!window.stagewise) {
                console.log('Module loading timeout, trying script approach...');
                loadStagewiseScript();
            }
        }, 3000);
    }
    
    function loadStagewiseScript() {
        console.log('🔧 Loading Stagewise as regular script...');
        
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://unpkg.com/@stagewise/toolbar-next@latest/dist/index.js';
        
        script.onload = function() {
            console.log('🔧 Stagewise script loaded');
            setTimeout(() => {
                initializeStagewiseFromGlobal();
            }, 500);
        };
        
        script.onerror = function() {
            console.warn('Failed to load stagewise script, showing enhanced fallback...');
            showEnhancedFallback();
        };
        
        document.head.appendChild(script);
    }
    
    function initializeStagewiseFromGlobal() {
        console.log('🔧 Initializing from global variables...');
        console.log('Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('stage')));
        
        // Check for various possible global exports
        let StagewiseClass = null;
        
        if (window.StagewiseToolbar) {
            StagewiseClass = window.StagewiseToolbar;
        } else if (window.Stagewise) {
            StagewiseClass = window.Stagewise;
        } else if (window.stagewise) {
            StagewiseClass = window.stagewise;
        } else if (window.StageWise) {
            StagewiseClass = window.StageWise;
        }
        
        if (StagewiseClass) {
            try {
                const toolbar = new StagewiseClass({
                    plugins: [],
                    environment: 'development',
                    project: {
                        name: 'MicroPlastics Data Entry',
                        framework: 'Express.js',
                        language: 'JavaScript'
                    }
                });
                
                if (typeof toolbar.init === 'function') {
                    toolbar.init();
                    console.log('🔧 Stagewise toolbar initialized successfully!');
                    window.stagewise = toolbar;
                    return;
                }
            } catch (error) {
                console.warn('Error initializing stagewise:', error);
            }
        }
        
        console.warn('Stagewise not found globally, showing enhanced fallback');
        showEnhancedFallback();
    }
    
    function showEnhancedFallback() {
        console.log('🔧 Creating enhanced fallback toolbar with element selection...');
        
        // Create toolbar container
        const container = document.createElement('div');
        container.id = 'stagewise-fallback-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        // Create main toolbar
        container.innerHTML = `
            <div id="stagewise-fallback-toolbar" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 13px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                cursor: pointer;
                user-select: none;
                transition: all 0.3s ease;
                border: 1px solid rgba(255,255,255,0.2);
                margin-bottom: 10px;
            ">
                🔧 Stagewise Dev
                <div style="font-size: 11px; opacity: 0.8; margin-top: 2px;">
                    Development Mode
                </div>
            </div>
            <div id="stagewise-controls" style="display: none;">
                <button id="select-mode-btn" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    margin-bottom: 5px;
                    width: 100%;
                ">🎯 选择元素模式</button>
                <button id="stop-select-btn" style="
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    width: 100%;
                    display: none;
                ">❌ 停止选择</button>
            </div>
        `;
        
        document.body.appendChild(container);
        
        const toolbar = container.querySelector('#stagewise-fallback-toolbar');
        const controls = container.querySelector('#stagewise-controls');
        const selectBtn = container.querySelector('#select-mode-btn');
        const stopBtn = container.querySelector('#stop-select-btn');
        
        let isSelecting = false;
        let selectedElement = null;
        
        // Toggle controls
        toolbar.addEventListener('click', function() {
            const isVisible = controls.style.display !== 'none';
            controls.style.display = isVisible ? 'none' : 'block';
        });
        
        // Element selection functionality
        selectBtn.addEventListener('click', function() {
            if (!isSelecting) {
                startElementSelection();
            }
        });
        
        stopBtn.addEventListener('click', function() {
            stopElementSelection();
        });
        
        function startElementSelection() {
            isSelecting = true;
            selectBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            
            // Add selection overlay styles
            if (!document.getElementById('stagewise-selection-styles')) {
                const styles = document.createElement('style');
                styles.id = 'stagewise-selection-styles';
                styles.textContent = `
                    .stagewise-selectable:hover {
                        outline: 2px solid #007bff !important;
                        outline-offset: 2px !important;
                        cursor: crosshair !important;
                    }
                    .stagewise-selected {
                        outline: 3px solid #28a745 !important;
                        outline-offset: 2px !important;
                        background: rgba(40, 167, 69, 0.1) !important;
                    }
                `;
                document.head.appendChild(styles);
            }
            
            // Add hover effects to all elements
            document.addEventListener('mouseover', elementHover);
            document.addEventListener('click', elementClick);
            
            showNotification('✨ 选择模式已激活！将鼠标悬停在元素上，然后点击选择');
        }
        
        function stopElementSelection() {
            isSelecting = false;
            selectBtn.style.display = 'block';
            stopBtn.style.display = 'none';
            
            // Remove event listeners
            document.removeEventListener('mouseover', elementHover);
            document.removeEventListener('click', elementClick);
            
            // Remove selection classes
            document.querySelectorAll('.stagewise-selectable, .stagewise-selected').forEach(el => {
                el.classList.remove('stagewise-selectable', 'stagewise-selected');
            });
            
            showNotification('选择模式已停用');
        }
        
        function elementHover(e) {
            if (!isSelecting || e.target.closest('#stagewise-fallback-container')) return;
            
            // Remove previous hover effects
            document.querySelectorAll('.stagewise-selectable').forEach(el => {
                el.classList.remove('stagewise-selectable');
            });
            
            // Add hover effect to current element
            e.target.classList.add('stagewise-selectable');
        }
        
        function elementClick(e) {
            if (!isSelecting || e.target.closest('#stagewise-fallback-container')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Remove previous selections
            document.querySelectorAll('.stagewise-selected').forEach(el => {
                el.classList.remove('stagewise-selected');
            });
            
            // Select current element
            e.target.classList.add('stagewise-selected');
            e.target.classList.remove('stagewise-selectable');
            selectedElement = e.target;
            
            console.log('🎯 Element selected:', selectedElement);
            console.log('Tag:', selectedElement.tagName);
            console.log('Classes:', selectedElement.className);
            console.log('ID:', selectedElement.id);
            console.log('Text content:', selectedElement.textContent?.slice(0, 100));
            
            showElementInfo(selectedElement);
            stopElementSelection();
        }
        
        function showElementInfo(element) {
            const info = `
选中元素信息:
• 标签: ${element.tagName}
• ID: ${element.id || '无'}
• 类: ${element.className || '无'}
• 文本: ${element.textContent?.slice(0, 50) || '无'}...
            `;
            
            showNotification(info, 5000);
        }
        
        console.log('🔧 Enhanced fallback toolbar ready!');
    }
    
    function showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 15px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000000;
            max-width: 300px;
            white-space: pre-line;
            animation: slideIn 0.3s ease;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, duration);
    }
    
    // Add CSS animations
    if (!document.getElementById('stagewise-animations')) {
        const style = document.createElement('style');
        style.id = 'stagewise-animations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
})();
