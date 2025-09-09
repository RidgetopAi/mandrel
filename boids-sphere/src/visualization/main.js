/**
 * main.js - Entry point for the 3D boids-sphere visualization
 * Sets up and initializes the complete visualization system
 */
import { VisualizationSystem } from './VisualizationSystem.js';

// Global visualization system instance
let visualizationSystem = null;

/**
 * Initialize the visualization system
 */
async function init() {
    try {
        console.log('🚀 Initializing Boids-Sphere 3D Visualization');
        
        // Hide loading screen after a brief delay to show it
        setTimeout(() => {
            const loadingElement = document.getElementById('loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }, 1500);

        // Create visualization system
        visualizationSystem = new VisualizationSystem('container', {
            sphereRadius: 50,
            enableSphericalConstraints: true,
            showSphere: true,
            showTrails: true,
            showVelocityVectors: false,
            maxBoids: 500,
            targetFPS: 60,
            enableStats: true,
            autoStart: true
        });

        // Set up window event handlers
        setupEventHandlers();

        // Add development helpers
        if (typeof window !== 'undefined') {
            window.visualization = visualizationSystem;
            window.resetCamera = () => visualizationSystem.setCameraPreset('diagonal');
            window.togglePause = () => visualizationSystem.togglePause();
        }

        console.log('✅ Visualization system ready!');
        console.log('Use window.visualization to access the system programmatically');
        
    } catch (error) {
        console.error('❌ Failed to initialize visualization:', error);
        showError(error.message);
    }
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
    // Handle window resize
    window.addEventListener('resize', () => {
        if (visualizationSystem) {
            visualizationSystem.resize();
        }
    });

    // Handle visibility change (pause when tab is not visible)
    document.addEventListener('visibilitychange', () => {
        if (visualizationSystem) {
            if (document.hidden) {
                // Tab is hidden, consider pausing for performance
                console.log('👁️ Tab hidden - visualization continues running');
            } else {
                // Tab is visible again
                console.log('👁️ Tab visible - visualization active');
            }
        }
    });

    // Handle keyboard shortcuts
    window.addEventListener('keydown', (event) => {
        if (!visualizationSystem) return;

        // Don't interfere with dat.GUI inputs
        if (event.target.tagName === 'INPUT') return;

        switch (event.code) {
            case 'Space':
                event.preventDefault();
                visualizationSystem.togglePause();
                break;
            case 'Digit1':
                visualizationSystem.setCameraPreset('front');
                break;
            case 'Digit2':
                visualizationSystem.setCameraPreset('back');
                break;
            case 'Digit3':
                visualizationSystem.setCameraPreset('left');
                break;
            case 'Digit4':
                visualizationSystem.setCameraPreset('right');
                break;
            case 'Digit5':
                visualizationSystem.setCameraPreset('top');
                break;
            case 'Digit6':
                visualizationSystem.setCameraPreset('bottom');
                break;
            case 'Digit7':
                visualizationSystem.setCameraPreset('diagonal');
                break;
            case 'KeyH':
                toggleInstructions();
                break;
            case 'KeyI':
                toggleInfo();
                break;
        }
    });

    // Performance monitoring
    setInterval(() => {
        updatePerformanceStats();
    }, 1000);
}

/**
 * Update performance statistics in the UI
 */
function updatePerformanceStats() {
    if (!visualizationSystem) return;

    const stats = visualizationSystem.getStats();
    
    // Update additional stats display
    const renderTimeElement = document.getElementById('render-time');
    const updateTimeElement = document.getElementById('update-time');
    
    if (renderTimeElement) {
        renderTimeElement.textContent = stats.renderTime.toFixed(1);
    }
    
    if (updateTimeElement) {
        updateTimeElement.textContent = stats.updateTime.toFixed(1);
    }

    // Log performance warnings
    if (stats.fps < 30) {
        console.warn(`⚠️ Low FPS detected: ${stats.fps}fps`);
    }
}

/**
 * Toggle instructions visibility
 */
function toggleInstructions() {
    const instructions = document.getElementById('instructions');
    if (instructions) {
        instructions.style.display = instructions.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Toggle info panel visibility
 */
function toggleInfo() {
    const info = document.getElementById('info');
    if (info) {
        info.style.display = info.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Show error message to user
 * @param {string} message - Error message to display
 */
function showError(message) {
    const container = document.getElementById('container');
    if (container) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            z-index: 1000;
            max-width: 400px;
        `;
        errorDiv.innerHTML = `
            <h3>❌ Error</h3>
            <p>${message}</p>
            <p style="font-size: 12px; margin-top: 15px; opacity: 0.8;">
                Check the console for more details.
            </p>
        `;
        container.appendChild(errorDiv);
    }
}

/**
 * Clean up resources before page unload
 */
function cleanup() {
    if (visualizationSystem) {
        console.log('🧹 Cleaning up visualization system...');
        visualizationSystem.dispose();
        visualizationSystem = null;
    }
}

// Handle page unload
window.addEventListener('beforeunload', cleanup);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already ready
    init();
}

// Export for debugging
export { visualizationSystem };