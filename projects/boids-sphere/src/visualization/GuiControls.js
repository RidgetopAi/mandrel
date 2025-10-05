/**
 * GuiControls - Comprehensive dat.GUI control panel for boids-sphere simulation
 * Provides organized interface for all simulation parameters
 */

export class GuiControls {
    constructor(visualizationSystem) {
        this.visualizationSystem = visualizationSystem;
        this.gui = null;
        this.folders = {};
        
        // Comprehensive parameter configuration
        this.params = {
            // Flock Controls
            flock: {
                size: 100,
                addBoids: () => this.addBoids(10),
                removeBoids: () => this.removeBoids(10),
                resetFlock: () => this.resetFlock()
            },
            
            // Behavior Controls
            behavior: {
                separationWeight: 1.5,
                alignmentWeight: 1.0,
                cohesionWeight: 1.0,
                wanderWeight: 0.1,
                boundaryWeight: 2.0
            },
            
            // Movement Controls
            movement: {
                maxSpeed: 2.0,
                maxForce: 0.03,
                separationRadius: 25.0,
                alignmentRadius: 50.0,
                cohesionRadius: 50.0,
                turnRate: 1.0
            },

            // Attractor Controls
            attractors: {
                enabled: true,
                strength: 1.0,
                attractorWeight: 2.0,
                showEffectRadius: true,
                clearAll: () => this.clearAllAttractors(),
                toggleInteraction: () => this.toggleAttractorInteraction()
            },
            
            // Visual Controls
            visual: {
                boidColor: '#ffffff',
                trailColor: '#4488ff',
                sphereColor: '#4488ff',
                showTrails: true,
                showVelocityVectors: false,
                showSphere: true,
                showDebugInfo: false,
                trailLength: 20,
                boidSize: 1.0
            },
            
            // Simulation Controls
            simulation: {
                paused: false,
                speed: 1.0,
                fps: 60,
                sphereRadius: 50,
                autoRotate: false,
                resetCamera: () => this.resetCamera(),
                resetSimulation: () => this.resetSimulation(),
                exportData: () => this.exportData(),
                pausePlay: () => this.togglePause()
            }
        };
        
        this.initializeGUI();
    }
    
    /**
     * Initialize the dat.GUI interface
     */
    initializeGUI() {
        if (typeof window === 'undefined' || !window.dat) {
            console.warn('dat.GUI not available');
            return;
        }
        
        this.gui = new window.dat.GUI({ 
            autoPlace: false,
            width: 320,
            hideable: true
        });
        
        // Add to controls container
        const controlsContainer = document.getElementById('controls');
        if (controlsContainer) {
            controlsContainer.appendChild(this.gui.domElement);
        }
        
        this.createFlockControls();
        this.createBehaviorControls();
        this.createMovementControls();
        this.createAttractorControls();
        this.createVisualControls();
        this.createSimulationControls();
        
        // Set initial GUI state to match visualization system
        this.syncWithVisualizationSystem();
        
        console.log('🎛️ GUI Controls initialized with comprehensive parameter sets');
    }
    
    /**
     * Create Flock Controls folder
     */
    createFlockControls() {
        this.folders.flock = this.gui.addFolder('🐦 Flock Controls');
        
        this.folders.flock.add(this.params.flock, 'size', 1, 1000, 1)
            .name('Flock Size')
            .onChange((value) => this.updateFlockSize(value));
            
        this.folders.flock.add(this.params.flock, 'addBoids')
            .name('Add 10 Boids');
            
        this.folders.flock.add(this.params.flock, 'removeBoids')
            .name('Remove 10 Boids');
            
        this.folders.flock.add(this.params.flock, 'resetFlock')
            .name('Reset Flock');
            
        this.folders.flock.open();
    }
    
    /**
     * Create Behavior Controls folder
     */
    createBehaviorControls() {
        this.folders.behavior = this.gui.addFolder('🧠 Behavior Controls');
        
        this.folders.behavior.add(this.params.behavior, 'separationWeight', 0.0, 5.0, 0.1)
            .name('Separation')
            .onChange((value) => this.updateBehavior('separationWeight', value));
            
        this.folders.behavior.add(this.params.behavior, 'alignmentWeight', 0.0, 5.0, 0.1)
            .name('Alignment')
            .onChange((value) => this.updateBehavior('alignmentWeight', value));
            
        this.folders.behavior.add(this.params.behavior, 'cohesionWeight', 0.0, 5.0, 0.1)
            .name('Cohesion')
            .onChange((value) => this.updateBehavior('cohesionWeight', value));
            
        this.folders.behavior.add(this.params.behavior, 'wanderWeight', 0.0, 2.0, 0.05)
            .name('Wander')
            .onChange((value) => this.updateBehavior('wanderWeight', value));
            
        this.folders.behavior.add(this.params.behavior, 'boundaryWeight', 0.0, 10.0, 0.1)
            .name('Boundary Force')
            .onChange((value) => this.updateBehavior('boundaryWeight', value));
    }
    
    /**
     * Create Movement Controls folder
     */
    createMovementControls() {
        this.folders.movement = this.gui.addFolder('🏃 Movement Controls');
        
        this.folders.movement.add(this.params.movement, 'maxSpeed', 0.1, 10.0, 0.1)
            .name('Max Speed')
            .onChange((value) => this.updateMovement('maxSpeed', value));
            
        this.folders.movement.add(this.params.movement, 'maxForce', 0.001, 0.1, 0.001)
            .name('Max Force')
            .onChange((value) => this.updateMovement('maxForce', value));
            
        this.folders.movement.add(this.params.movement, 'separationRadius', 5.0, 100.0, 1.0)
            .name('Separation Radius')
            .onChange((value) => this.updateMovement('separationRadius', value));
            
        this.folders.movement.add(this.params.movement, 'alignmentRadius', 10.0, 200.0, 5.0)
            .name('Alignment Radius')
            .onChange((value) => this.updateMovement('alignmentRadius', value));
            
        this.folders.movement.add(this.params.movement, 'cohesionRadius', 10.0, 200.0, 5.0)
            .name('Cohesion Radius')
            .onChange((value) => this.updateMovement('cohesionRadius', value));
            
        this.folders.movement.add(this.params.movement, 'turnRate', 0.1, 3.0, 0.1)
            .name('Turn Rate')
            .onChange((value) => this.updateMovement('turnRate', value));
    }
    
    /**
     * Create Attractor Controls folder
     */
    createAttractorControls() {
        this.folders.attractors = this.gui.addFolder('🎯 Attractor Controls');
        
        this.folders.attractors.add(this.params.attractors, 'enabled')
            .name('Enable Interaction')
            .onChange((value) => this.updateAttractors('enabled', value));
            
        this.folders.attractors.add(this.params.attractors, 'strength', 0.1, 5.0, 0.1)
            .name('Default Strength')
            .onChange((value) => this.updateAttractors('strength', value));
            
        this.folders.attractors.add(this.params.attractors, 'attractorWeight', 0.0, 5.0, 0.1)
            .name('Force Weight')
            .onChange((value) => this.updateAttractors('attractorWeight', value));
            
        this.folders.attractors.add(this.params.attractors, 'showEffectRadius')
            .name('Show Effect Radius')
            .onChange((value) => this.updateAttractors('showEffectRadius', value));
            
        this.folders.attractors.add(this.params.attractors, 'clearAll')
            .name('🗑️ Clear All');
            
        this.folders.attractors.add(this.params.attractors, 'toggleInteraction')
            .name('🎯 Toggle Interaction');

        // Add instructions
        const instructionsController = this.folders.attractors.add({
            instructions: 'Left click: Add attractor\nRight click: Add repeller\nShift+click: Remove nearest'
        }, 'instructions');
        instructionsController.domElement.style.pointerEvents = 'none';
        instructionsController.domElement.querySelector('input').style.color = '#888';
        instructionsController.domElement.querySelector('input').style.fontSize = '11px';
        instructionsController.domElement.querySelector('input').style.height = '60px';
            
        this.folders.attractors.open();
    }

    /**
     * Create Visual Controls folder
     */
    createVisualControls() {
        this.folders.visual = this.gui.addFolder('🎨 Visual Controls');
        
        this.folders.visual.addColor(this.params.visual, 'boidColor')
            .name('Boid Color')
            .onChange((value) => this.updateVisual('boidColor', value));
            
        this.folders.visual.addColor(this.params.visual, 'trailColor')
            .name('Trail Color')
            .onChange((value) => this.updateVisual('trailColor', value));
            
        this.folders.visual.addColor(this.params.visual, 'sphereColor')
            .name('Sphere Color')
            .onChange((value) => this.updateVisual('sphereColor', value));
            
        this.folders.visual.add(this.params.visual, 'showTrails')
            .name('Show Trails')
            .onChange((value) => this.updateVisual('showTrails', value));
            
        this.folders.visual.add(this.params.visual, 'showVelocityVectors')
            .name('Show Velocity')
            .onChange((value) => this.updateVisual('showVelocityVectors', value));
            
        this.folders.visual.add(this.params.visual, 'showSphere')
            .name('Show Sphere')
            .onChange((value) => this.updateVisual('showSphere', value));
            
        this.folders.visual.add(this.params.visual, 'showDebugInfo')
            .name('Debug Overlay')
            .onChange((value) => this.updateVisual('showDebugInfo', value));
            
        this.folders.visual.add(this.params.visual, 'trailLength', 5, 100, 1)
            .name('Trail Length')
            .onChange((value) => this.updateVisual('trailLength', value));
            
        this.folders.visual.add(this.params.visual, 'boidSize', 0.5, 3.0, 0.1)
            .name('Boid Size')
            .onChange((value) => this.updateVisual('boidSize', value));
    }
    
    /**
     * Create Simulation Controls folder
     */
    createSimulationControls() {
        this.folders.simulation = this.gui.addFolder('⚙️ Simulation Controls');
        
        this.folders.simulation.add(this.params.simulation, 'pausePlay')
            .name('⏯️ Pause/Play');
            
        this.folders.simulation.add(this.params.simulation, 'speed', 0.1, 3.0, 0.1)
            .name('Simulation Speed')
            .onChange((value) => this.updateSimulation('speed', value));
            
        this.folders.simulation.add(this.params.simulation, 'sphereRadius', 10, 500, 5)
            .name('Sphere Radius')
            .onChange((value) => this.updateSimulation('sphereRadius', value));
            
        this.folders.simulation.add(this.params.simulation, 'autoRotate')
            .name('Auto Rotate Camera')
            .onChange((value) => this.updateSimulation('autoRotate', value));
            
        this.folders.simulation.add(this.params.simulation, 'resetCamera')
            .name('🎥 Reset Camera');
            
        this.folders.simulation.add(this.params.simulation, 'resetSimulation')
            .name('🔄 Reset Simulation');
            
        this.folders.simulation.add(this.params.simulation, 'exportData')
            .name('📊 Export Data');
            
        this.folders.simulation.open();
    }
    
    /**
     * Update flock size
     */
    updateFlockSize(value) {
        if (this.visualizationSystem.boidsEngine) {
            const currentCount = this.visualizationSystem.boidsEngine.boids.length;
            const targetCount = Math.floor(value);
            
            if (targetCount > currentCount) {
                const toAdd = targetCount - currentCount;
                this.visualizationSystem.boidsEngine.addRandomBoidsOnSphere(toAdd);
            } else if (targetCount < currentCount) {
                this.visualizationSystem.boidsEngine.boids = 
                    this.visualizationSystem.boidsEngine.boids.slice(0, targetCount);
            }
        }
    }
    
    /**
     * Add boids to the simulation
     */
    addBoids(count) {
        if (this.visualizationSystem.boidsEngine) {
            this.visualizationSystem.boidsEngine.addRandomBoidsOnSphere(count);
            this.params.flock.size = this.visualizationSystem.boidsEngine.boids.length;
            this.updateGUIDisplay();
        }
    }
    
    /**
     * Remove boids from the simulation
     */
    removeBoids(count) {
        if (this.visualizationSystem.boidsEngine) {
            const currentCount = this.visualizationSystem.boidsEngine.boids.length;
            const newCount = Math.max(1, currentCount - count);
            this.visualizationSystem.boidsEngine.boids = 
                this.visualizationSystem.boidsEngine.boids.slice(0, newCount);
            this.params.flock.size = newCount;
            this.updateGUIDisplay();
        }
    }
    
    /**
     * Reset flock to initial state
     */
    resetFlock() {
        if (this.visualizationSystem.boidsEngine) {
            this.visualizationSystem.boidsEngine.boids = [];
            this.visualizationSystem.boidsEngine.addRandomBoidsOnSphere(this.params.flock.size);
        }
    }
    
    /**
     * Update behavior parameters
     */
    updateBehavior(param, value) {
        if (this.visualizationSystem.boidsEngine) {
            this.visualizationSystem.boidsEngine.config[param] = value;
        }
    }
    
    /**
     * Update movement parameters
     */
    updateMovement(param, value) {
        if (this.visualizationSystem.boidsEngine) {
            this.visualizationSystem.boidsEngine.config[param] = value;
        }
    }
    
    /**
     * Update visual parameters
     */
    updateVisual(param, value) {
        switch (param) {
            case 'showTrails':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setTrailsVisible(value);
                }
                break;
            case 'showVelocityVectors':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setVelocityArrowsVisible(value);
                }
                break;
            case 'showSphere':
                if (this.visualizationSystem.sphereGeometry) {
                    this.visualizationSystem.sphereGeometry.setWireframeVisible(value);
                }
                break;
            case 'boidColor':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setBoidColor(value);
                }
                break;
            case 'trailColor':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setTrailColor(value);
                }
                break;
            case 'sphereColor':
                if (this.visualizationSystem.sphereGeometry) {
                    this.visualizationSystem.sphereGeometry.setColor(value);
                }
                break;
            case 'boidSize':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setBoidSize(value);
                }
                break;
            case 'trailLength':
                if (this.visualizationSystem.boidSwarm) {
                    this.visualizationSystem.boidSwarm.setTrailLength(value);
                }
                break;
            case 'showDebugInfo':
                this.toggleDebugOverlay(value);
                break;
        }
    }
    
    /**
     * Update attractor parameters
     */
    updateAttractors(param, value) {
        if (!this.visualizationSystem.interactiveAttractors) return;

        switch (param) {
            case 'enabled':
                this.visualizationSystem.interactiveAttractors.setEnabled(value);
                break;
            case 'strength':
                this.visualizationSystem.interactiveAttractors.options.defaultStrength = value;
                break;
            case 'attractorWeight':
                if (this.visualizationSystem.boidsEngine) {
                    this.visualizationSystem.boidsEngine.config.attractorWeight = value;
                }
                break;
            case 'showEffectRadius':
                this.visualizationSystem.interactiveAttractors.options.showEffectRadius = value;
                // Update existing attractors
                const attractors = this.visualizationSystem.interactiveAttractors.getAttractors();
                for (const attractor of attractors) {
                    if (attractor.effectSphere) {
                        attractor.effectSphere.visible = value;
                    }
                }
                break;
        }
    }

    /**
     * Clear all attractors
     */
    clearAllAttractors() {
        if (this.visualizationSystem.interactiveAttractors) {
            this.visualizationSystem.interactiveAttractors.clearAllAttractors();
            console.log('🗑️ All attractors cleared via GUI');
        }
    }

    /**
     * Toggle attractor interaction
     */
    toggleAttractorInteraction() {
        if (this.visualizationSystem.interactiveAttractors) {
            const currentState = this.visualizationSystem.interactiveAttractors.isEnabled;
            this.visualizationSystem.interactiveAttractors.setEnabled(!currentState);
            this.params.attractors.enabled = !currentState;
            this.updateGUIDisplay();
            console.log(`🎯 Attractor interaction ${!currentState ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Update simulation parameters
     */
    updateSimulation(param, value) {
        switch (param) {
            case 'speed':
                // Store time scale in visualization system for use in update loop
                this.visualizationSystem.timeScale = value;
                break;
            case 'sphereRadius':
                if (this.visualizationSystem.sphereGeometry) {
                    this.visualizationSystem.sphereGeometry.updateRadius(value);
                }
                if (this.visualizationSystem.boidsEngine) {
                    this.visualizationSystem.boidsEngine.config.sphereRadius = value;
                }
                if (this.visualizationSystem.interactiveAttractors) {
                    this.visualizationSystem.interactiveAttractors.updateSphereRadius(value);
                }
                break;
            case 'autoRotate':
                if (this.visualizationSystem.cameraControls) {
                    this.visualizationSystem.cameraControls.autoRotate = value;
                }
                break;
        }
    }
    
    /**
     * Toggle pause/play
     */
    togglePause() {
        this.visualizationSystem.togglePause();
        this.params.simulation.paused = !this.visualizationSystem.isRunning;
        this.updateGUIDisplay();
    }
    
    /**
     * Reset camera
     */
    resetCamera() {
        if (this.visualizationSystem.cameraControls) {
            this.visualizationSystem.cameraControls.reset();
        }
    }
    
    /**
     * Reset simulation
     */
    resetSimulation() {
        this.visualizationSystem.resetSimulation();
    }
    
    /**
     * Export simulation data
     */
    exportData() {
        if (this.visualizationSystem.boidsEngine) {
            const data = {
                timestamp: new Date().toISOString(),
                boids: this.visualizationSystem.boidsEngine.boids.map(boid => ({
                    id: boid.id,
                    position: { x: boid.position.x, y: boid.position.y, z: boid.position.z },
                    velocity: { x: boid.velocity.x, y: boid.velocity.y, z: boid.velocity.z }
                })),
                config: this.visualizationSystem.boidsEngine.config,
                stats: this.visualizationSystem.getStats()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `boids_simulation_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
    
    /**
     * Toggle debug overlay
     */
    toggleDebugOverlay(show) {
        const existingOverlay = document.getElementById('debug-overlay');
        
        if (show && !existingOverlay) {
            const overlay = document.createElement('div');
            overlay.id = 'debug-overlay';
            overlay.style.cssText = `
                position: absolute;
                top: 200px;
                left: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 12px;
                z-index: 100;
                max-width: 250px;
            `;
            document.getElementById('container').appendChild(overlay);
            
            // Update debug info periodically
            this.debugInterval = setInterval(() => {
                this.updateDebugOverlay();
            }, 100);
        } else if (!show && existingOverlay) {
            existingOverlay.remove();
            if (this.debugInterval) {
                clearInterval(this.debugInterval);
                this.debugInterval = null;
            }
        }
    }
    
    /**
     * Update debug overlay content
     */
    updateDebugOverlay() {
        const overlay = document.getElementById('debug-overlay');
        if (!overlay || !this.visualizationSystem.boidsEngine) return;
        
        const stats = this.visualizationSystem.getStats();
        const engine = this.visualizationSystem.boidsEngine;
        
        overlay.innerHTML = `
            <strong>Debug Info</strong><br>
            Boids: ${engine.boids.length}<br>
            FPS: ${stats.fps}<br>
            Render: ${stats.renderTime.toFixed(1)}ms<br>
            Update: ${stats.updateTime.toFixed(1)}ms<br>
            Camera: ${this.visualizationSystem.getCamera().position.x.toFixed(1)}, 
                     ${this.visualizationSystem.getCamera().position.y.toFixed(1)}, 
                     ${this.visualizationSystem.getCamera().position.z.toFixed(1)}<br>
            Sphere Radius: ${engine.config.sphereRadius}<br>
            Max Speed: ${engine.config.maxSpeed}<br>
        `;
    }
    
    /**
     * Sync GUI parameters with visualization system
     */
    syncWithVisualizationSystem() {
        if (this.visualizationSystem.boidsEngine) {
            const config = this.visualizationSystem.boidsEngine.config;
            
            // Update parameters from engine config
            this.params.behavior.separationWeight = config.separationWeight;
            this.params.behavior.alignmentWeight = config.alignmentWeight;
            this.params.behavior.cohesionWeight = config.cohesionWeight;
            this.params.movement.maxSpeed = config.maxSpeed;
            this.params.simulation.sphereRadius = config.sphereRadius;
            this.params.flock.size = this.visualizationSystem.boidsEngine.boids.length;
        }
        
        this.updateGUIDisplay();
    }
    
    /**
     * Update GUI display to reflect current parameter values
     */
    updateGUIDisplay() {
        // Force GUI to update its display
        for (const folderName in this.folders) {
            const folder = this.folders[folderName];
            for (const controller of folder.__controllers) {
                controller.updateDisplay();
            }
        }
    }
    
    /**
     * Dispose of GUI resources
     */
    dispose() {
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
        }
        
        if (this.gui) {
            this.gui.destroy();
        }
        
        console.log('🧹 GUI Controls disposed');
    }
}