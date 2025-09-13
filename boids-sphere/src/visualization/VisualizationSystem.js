/**
 * VisualizationSystem - Main 3D visualization system for boids-sphere simulation
 * Integrates scene management, camera controls, and boid rendering with the math engine
 */
import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraControls } from './CameraControls.js';
import { SphereGeometry } from './SphereGeometry.js';
import { BoidSwarm } from './BoidVisualizer.js';
import { BoidsEngine, DEFAULT_CONFIG } from '../math/BoidsEngine.js';
import { GuiControls } from './GuiControls.js';
import { InteractiveAttractors } from './InteractiveAttractors.js';

export class VisualizationSystem {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }

        this.options = {
            sphereRadius: 50,
            enableSphericalConstraints: true,
            showSphere: true,
            showTrails: true,
            showVelocityVectors: false,
            maxBoids: 500,
            targetFPS: 60,
            enableStats: true,
            autoStart: true,
            ...options
        };

        // Core components
        this.sceneManager = null;
        this.cameraControls = null;
        this.sphereGeometry = null;
        this.boidSwarm = null;
        this.boidsEngine = null;
        this.interactiveAttractors = null;

        // Animation state
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.timeScale = 1.0;

        // Performance tracking
        this.stats = {
            fps: 0,
            renderTime: 0,
            updateTime: 0,
            boidCount: 0,
            frameCount: 0,
            lastFPSUpdate: 0
        };

        // GUI controls (will be initialized later)
        this.guiControls = null;

        this.init();
    }

    /**
     * Initialize the visualization system
     */
    init() {
        // Create scene manager
        this.sceneManager = new SceneManager(this.container);

        // Create camera controls
        this.cameraControls = new CameraControls(
            this.sceneManager.getCamera(),
            this.sceneManager.renderer.domElement
        );

        // Create sphere geometry
        if (this.options.showSphere) {
            this.sphereGeometry = new SphereGeometry(this.options.sphereRadius, {
                wireframe: true,
                solid: false,
                wireframeColor: 0x4488ff
            });
            this.sceneManager.add(this.sphereGeometry.getObject3D());
        }

        // Create boid swarm
        this.boidSwarm = new BoidSwarm({
            maxBoids: this.options.maxBoids,
            showTrails: this.options.showTrails,
            showVelocityVectors: this.options.showVelocityVectors
        });
        this.sceneManager.add(this.boidSwarm.getObject3D());

        // Create interactive attractors system
        this.interactiveAttractors = new InteractiveAttractors(this.options.sphereRadius, {
            maxAttractors: 10,
            defaultStrength: 1.0
        });
        this.sceneManager.add(this.interactiveAttractors.getObject3D());

        // Initialize boids engine with default configuration
        this.createBoidsEngine();

        // Set up GUI controls
        this.initGUI();

        // Initialize attractor mouse handlers
        this.interactiveAttractors.initMouseHandlers(
            this.sceneManager.renderer,
            this.sceneManager.getCamera()
        );

        // Start animation loop if auto-start is enabled
        if (this.options.autoStart) {
            this.start();
        }

        console.log('🎯 Visualization system initialized');
        console.log('Controls: Mouse to orbit, wheel to zoom, WASD/arrows to navigate');
        console.log('Keyboard: Q/E zoom, R reset camera');
    }

    /**
     * Create or recreate the boids engine with current parameters
     */
    createBoidsEngine() {
        // Stop current engine if running
        if (this.boidsEngine) {
            this.boidsEngine = null;
        }

        // Create new engine with current configuration
        const engineConfig = {
            ...DEFAULT_CONFIG,
            enableSphericalConstraints: this.options.enableSphericalConstraints,
            sphereRadius: this.options.sphereRadius,
            sphericalConstraintPreset: 'natural',
            spatialOptimization: true
        };

        this.boidsEngine = new BoidsEngine(engineConfig);

        // Connect attractor system to boids engine
        if (this.interactiveAttractors) {
            this.boidsEngine.setAttractorSystem(this.interactiveAttractors);
        }

        // Add initial boids
        const initialBoidCount = 100;
        if (this.options.enableSphericalConstraints) {
            this.boidsEngine.addRandomBoidsOnSphere(initialBoidCount);
        } else {
            this.boidsEngine.addRandomBoids(initialBoidCount);
        }

        console.log(`🐦 Created boids engine with ${initialBoidCount} boids`);
    }

    /**
     * Initialize GUI controls using comprehensive GuiControls system
     */
    initGUI() {
        this.guiControls = new GuiControls(this);
        console.log('🎛️ Comprehensive GUI controls initialized');
    }


    /**
     * Reset the simulation
     */
    resetSimulation() {
        this.createBoidsEngine();
        this.cameraControls.reset();
        console.log('🔄 Simulation reset');
    }

    /**
     * Toggle pause/play
     */
    togglePause() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    /**
     * Start the animation loop
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.animate();
            console.log('▶️ Animation started');
        }
    }

    /**
     * Stop the animation loop
     */
    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            console.log('⏸️ Animation stopped');
        }
    }

    /**
     * Main animation loop
     */
    animate() {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        this.deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update simulation
        this.update(this.deltaTime);

        // Render frame
        this.render();

        // Update performance stats
        this.updateStats(currentTime);

        // Schedule next frame
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * Update simulation logic
     * @param {number} deltaTime - Time since last update in milliseconds
     */
    update(deltaTime) {
        const updateStartTime = performance.now();

        // Update camera controls
        this.cameraControls.update(deltaTime);

        // Update boids simulation
        if (this.boidsEngine) {
            // Convert deltaTime from ms to seconds and apply time scale
            const scaledDeltaTime = (deltaTime / 1000) * this.timeScale;
            this.boidsEngine.update(scaledDeltaTime);

            // Update boid visualizations
            this.boidSwarm.updateBoids(this.boidsEngine.boids);
        }

        // Update interactive attractors
        if (this.interactiveAttractors) {
            const scaledDeltaTime = (deltaTime / 1000) * this.timeScale;
            this.interactiveAttractors.update(scaledDeltaTime);
        }

        this.stats.updateTime = performance.now() - updateStartTime;
    }

    /**
     * Render the scene
     */
    render() {
        const renderStartTime = performance.now();
        
        this.sceneManager.render(this.deltaTime);
        
        this.stats.renderTime = performance.now() - renderStartTime;
    }

    /**
     * Update performance statistics
     * @param {number} currentTime - Current time in milliseconds
     */
    updateStats(currentTime) {
        this.stats.frameCount++;
        
        // Update FPS every second
        if (currentTime - this.stats.lastFPSUpdate >= 1000) {
            this.stats.fps = Math.round(this.stats.frameCount * 1000 / (currentTime - this.stats.lastFPSUpdate));
            this.stats.frameCount = 0;
            this.stats.lastFPSUpdate = currentTime;
            
            if (this.boidsEngine) {
                this.stats.boidCount = this.boidsEngine.boids.length;
            }

            // Update HTML stats display
            this.updateStatsDisplay();
        }
    }

    /**
     * Update stats display in HTML
     */
    updateStatsDisplay() {
        const fpsElement = document.getElementById('fps');
        const boidCountElement = document.getElementById('boid-count');

        if (fpsElement) {
            fpsElement.textContent = this.stats.fps;
        }

        if (boidCountElement) {
            boidCountElement.textContent = this.stats.boidCount;
        }
    }

    /**
     * Get performance statistics
     * @returns {Object} Current performance stats
     */
    getStats() {
        return {
            ...this.stats,
            sceneStats: this.sceneManager ? this.sceneManager.getStats() : null,
            engineStats: this.boidsEngine ? this.boidsEngine.getStats() : null
        };
    }

    /**
     * Resize the visualization
     */
    resize() {
        if (this.sceneManager) {
            this.sceneManager.onWindowResize();
        }
    }

    /**
     * Set camera to preset position
     * @param {string} preset - Camera preset name
     */
    setCameraPreset(preset) {
        if (this.cameraControls) {
            this.cameraControls.setPreset(preset);
        }
    }

    /**
     * Get current scene for external access
     * @returns {THREE.Scene} The Three.js scene
     */
    getScene() {
        return this.sceneManager ? this.sceneManager.getScene() : null;
    }

    /**
     * Get current camera for external access
     * @returns {THREE.PerspectiveCamera} The camera
     */
    getCamera() {
        return this.sceneManager ? this.sceneManager.getCamera() : null;
    }

    /**
     * Clean up and dispose of all resources
     */
    dispose() {
        // Stop animation
        this.stop();

        // Dispose of components
        if (this.interactiveAttractors) {
            this.interactiveAttractors.dispose();
        }

        if (this.boidSwarm) {
            this.boidSwarm.dispose();
        }

        if (this.sphereGeometry) {
            this.sphereGeometry.dispose();
        }

        if (this.cameraControls) {
            this.cameraControls.dispose();
        }

        if (this.sceneManager) {
            this.sceneManager.dispose();
        }

        if (this.guiControls) {
            this.guiControls.dispose();
        }

        console.log('🧹 Visualization system disposed');
    }
}