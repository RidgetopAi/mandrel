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

        // Animation state
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.deltaTime = 0;

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
        this.gui = null;
        this.guiParams = {
            sphereRadius: this.options.sphereRadius,
            boidCount: 100,
            maxSpeed: 2.0,
            separationWeight: 1.5,
            alignmentWeight: 1.0,
            cohesionWeight: 1.0,
            showSphere: this.options.showSphere,
            showTrails: this.options.showTrails,
            showVelocityVectors: this.options.showVelocityVectors,
            autoRotate: false,
            resetSimulation: () => this.resetSimulation(),
            pausePlay: () => this.togglePause()
        };

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

        // Initialize boids engine with default configuration
        this.createBoidsEngine();

        // Set up GUI controls
        this.initGUI();

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

        // Create new engine with current GUI parameters
        const engineConfig = {
            ...DEFAULT_CONFIG,
            enableSphericalConstraints: this.options.enableSphericalConstraints,
            sphereRadius: this.guiParams.sphereRadius,
            sphericalConstraintPreset: 'natural',
            maxSpeed: this.guiParams.maxSpeed,
            separationWeight: this.guiParams.separationWeight,
            alignmentWeight: this.guiParams.alignmentWeight,
            cohesionWeight: this.guiParams.cohesionWeight,
            spatialOptimization: true,
            separationRadius: 8.0,
            alignmentRadius: 15.0,
            cohesionRadius: 15.0
        };

        this.boidsEngine = new BoidsEngine(engineConfig);

        // Add initial boids
        if (this.options.enableSphericalConstraints) {
            this.boidsEngine.addRandomBoidsOnSphere(this.guiParams.boidCount);
        } else {
            this.boidsEngine.addRandomBoids(this.guiParams.boidCount);
        }

        console.log(`🐦 Created boids engine with ${this.guiParams.boidCount} boids`);
    }

    /**
     * Initialize GUI controls using dat.GUI
     */
    initGUI() {
        if (typeof window !== 'undefined' && window.dat) {
            this.gui = new window.dat.GUI({ autoPlace: false });
            
            // Add to controls container
            const controlsContainer = document.getElementById('controls');
            if (controlsContainer) {
                controlsContainer.appendChild(this.gui.domElement);
            }

            // Simulation controls
            const simFolder = this.gui.addFolder('Simulation');
            simFolder.add(this.guiParams, 'boidCount', 10, 500, 10)
                .onChange(() => this.updateBoidCount());
            simFolder.add(this.guiParams, 'pausePlay').name('Pause/Play');
            simFolder.add(this.guiParams, 'resetSimulation').name('Reset');
            simFolder.open();

            // Boid behavior controls
            const behaviorFolder = this.gui.addFolder('Boid Behavior');
            behaviorFolder.add(this.guiParams, 'maxSpeed', 0.5, 5.0, 0.1)
                .onChange(() => this.updateEngineConfig());
            behaviorFolder.add(this.guiParams, 'separationWeight', 0.0, 3.0, 0.1)
                .onChange(() => this.updateEngineConfig());
            behaviorFolder.add(this.guiParams, 'alignmentWeight', 0.0, 3.0, 0.1)
                .onChange(() => this.updateEngineConfig());
            behaviorFolder.add(this.guiParams, 'cohesionWeight', 0.0, 3.0, 0.1)
                .onChange(() => this.updateEngineConfig());

            // Sphere controls
            const sphereFolder = this.gui.addFolder('Sphere');
            sphereFolder.add(this.guiParams, 'sphereRadius', 20, 200, 5)
                .onChange(() => this.updateSphereRadius());
            sphereFolder.add(this.guiParams, 'showSphere')
                .onChange(() => this.toggleSphere());

            // Visual controls
            const visualFolder = this.gui.addFolder('Visuals');
            visualFolder.add(this.guiParams, 'showTrails')
                .onChange(() => this.boidSwarm.setTrailsVisible(this.guiParams.showTrails));
            visualFolder.add(this.guiParams, 'showVelocityVectors')
                .onChange(() => this.boidSwarm.setVelocityArrowsVisible(this.guiParams.showVelocityVectors));
            visualFolder.add(this.guiParams, 'autoRotate')
                .onChange(() => this.cameraControls.autoRotate = this.guiParams.autoRotate);
        }
    }

    /**
     * Update boid count
     */
    updateBoidCount() {
        if (this.boidsEngine) {
            const currentCount = this.boidsEngine.boids.length;
            const targetCount = this.guiParams.boidCount;

            if (targetCount > currentCount) {
                // Add more boids
                const toAdd = targetCount - currentCount;
                if (this.options.enableSphericalConstraints) {
                    this.boidsEngine.addRandomBoidsOnSphere(toAdd);
                } else {
                    this.boidsEngine.addRandomBoids(toAdd);
                }
            } else if (targetCount < currentCount) {
                // Remove excess boids
                this.boidsEngine.boids = this.boidsEngine.boids.slice(0, targetCount);
            }
        }
    }

    /**
     * Update engine configuration
     */
    updateEngineConfig() {
        if (this.boidsEngine) {
            this.boidsEngine.config.maxSpeed = this.guiParams.maxSpeed;
            this.boidsEngine.config.separationWeight = this.guiParams.separationWeight;
            this.boidsEngine.config.alignmentWeight = this.guiParams.alignmentWeight;
            this.boidsEngine.config.cohesionWeight = this.guiParams.cohesionWeight;
        }
    }

    /**
     * Update sphere radius
     */
    updateSphereRadius() {
        if (this.sphereGeometry) {
            this.sphereGeometry.updateRadius(this.guiParams.sphereRadius);
        }
        
        if (this.boidsEngine) {
            this.boidsEngine.config.sphereRadius = this.guiParams.sphereRadius;
        }
    }

    /**
     * Toggle sphere visibility
     */
    toggleSphere() {
        if (this.sphereGeometry) {
            this.sphereGeometry.setWireframeVisible(this.guiParams.showSphere);
        }
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
            // Convert deltaTime from ms to seconds for the engine
            this.boidsEngine.update(deltaTime / 1000);

            // Update boid visualizations
            this.boidSwarm.updateBoids(this.boidsEngine.boids);
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

        if (this.gui) {
            this.gui.destroy();
        }

        console.log('🧹 Visualization system disposed');
    }
}