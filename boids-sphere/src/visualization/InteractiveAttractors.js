/**
 * InteractiveAttractors - Manages interactive attractors and repellers on sphere surface
 * Provides mouse interaction for placing, removing, and visualizing attractors
 */
import * as THREE from 'three';
import { Vector3D } from '../math/Vector3D.js';

export class InteractiveAttractors {
    constructor(sphereRadius = 50, options = {}) {
        this.sphereRadius = sphereRadius;
        this.options = {
            maxAttractors: 10,
            defaultStrength: 1.0,
            attractorSize: 3.0,
            repellerSize: 3.0,
            attractorColor: 0x44ff44,  // Green
            repellerColor: 0xff4444,   // Red
            pulseSpeed: 2.0,
            showEffectRadius: true,
            effectRadiusOpacity: 0.2,
            ...options
        };

        // Attractor/Repeller data
        this.attractors = [];
        this.nextId = 0;

        // Three.js components
        this.group = new THREE.Group();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Sphere geometry for ray casting (invisible)
        this.sphereGeometry = new THREE.SphereGeometry(this.sphereRadius, 64, 32);
        this.sphereMaterial = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            opacity: 0,
            side: THREE.DoubleSide 
        });
        this.invisibleSphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
        this.group.add(this.invisibleSphere);

        // Animation state
        this.animationTime = 0;
        this.isEnabled = true;
    }

    /**
     * Initialize mouse event handlers for the renderer
     * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
     * @param {THREE.Camera} camera - The camera for raycasting
     */
    initMouseHandlers(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.domElement = renderer.domElement;

        // Bind event handlers
        this.onMouseMove = this.handleMouseMove.bind(this);
        this.onMouseDown = this.handleMouseDown.bind(this);
        this.onContextMenu = this.handleContextMenu.bind(this);

        // Add event listeners
        this.domElement.addEventListener('mousemove', this.onMouseMove, false);
        this.domElement.addEventListener('mousedown', this.onMouseDown, false);
        this.domElement.addEventListener('contextmenu', this.onContextMenu, false);

        console.log('🎯 Interactive attractors mouse handlers initialized');
    }

    /**
     * Handle mouse move events for hover effects
     * @param {MouseEvent} event 
     */
    handleMouseMove(event) {
        if (!this.isEnabled) return;

        // Update mouse coordinates
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Handle mouse down events for placing/removing attractors
     * @param {MouseEvent} event 
     */
    handleMouseDown(event) {
        if (!this.isEnabled) return;

        // Prevent default behavior
        event.preventDefault();

        // Update mouse coordinates
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Perform raycast to find intersection with sphere
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.invisibleSphere);

        if (intersects.length > 0) {
            const intersectionPoint = intersects[0].point;

            if (event.button === 0) { // Left click - Add attractor
                if (event.shiftKey) {
                    // Shift+left click - Remove nearby attractor
                    this.removeNearestAttractor(intersectionPoint);
                } else {
                    // Regular left click - Add attractor
                    this.addAttractor(intersectionPoint, 'attract');
                }
            } else if (event.button === 2) { // Right click - Add repeller
                if (event.shiftKey) {
                    // Shift+right click - Remove nearby attractor
                    this.removeNearestAttractor(intersectionPoint);
                } else {
                    // Regular right click - Add repeller
                    this.addAttractor(intersectionPoint, 'repel');
                }
            } else if (event.button === 1) { // Middle click - Remove nearest
                this.removeNearestAttractor(intersectionPoint);
            }
        }
    }

    /**
     * Handle context menu events (prevent right-click menu)
     * @param {MouseEvent} event 
     */
    handleContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Add an attractor or repeller at the specified position
     * @param {THREE.Vector3} position - Position on sphere surface
     * @param {string} type - 'attract' or 'repel'
     * @param {number} strength - Force strength (optional)
     * @returns {Object} Created attractor object
     */
    addAttractor(position, type = 'attract', strength = null) {
        // Check if we've reached the maximum number of attractors
        if (this.attractors.length >= this.options.maxAttractors) {
            console.warn(`Maximum number of attractors (${this.options.maxAttractors}) reached`);
            return null;
        }

        // Use default strength if not provided
        if (strength === null) {
            strength = this.options.defaultStrength;
        }

        // Create attractor data object
        const attractor = {
            id: this.nextId++,
            position: new Vector3D(position.x, position.y, position.z),
            type: type,
            strength: strength,
            effectRadius: this.sphereRadius * 0.3, // Default effect radius
            createdAt: Date.now(),
            
            // Visual components
            marker: null,
            effectSphere: null,
            
            // Animation properties
            pulsePhase: Math.random() * Math.PI * 2,
            originalSize: type === 'attract' ? this.options.attractorSize : this.options.repellerSize
        };

        // Create visual representation
        this.createAttractorVisuals(attractor);

        // Add to collection
        this.attractors.push(attractor);

        console.log(`🎯 Added ${type}or at position (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
        
        return attractor;
    }

    /**
     * Create visual representation for an attractor
     * @param {Object} attractor - Attractor data object
     */
    createAttractorVisuals(attractor) {
        const isAttractor = attractor.type === 'attract';
        const color = isAttractor ? this.options.attractorColor : this.options.repellerColor;
        const size = attractor.originalSize;

        // Create main marker (pulsing sphere)
        const markerGeometry = new THREE.SphereGeometry(size, 16, 16);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });

        attractor.marker = new THREE.Mesh(markerGeometry, markerMaterial);
        attractor.marker.position.copy(attractor.position);
        attractor.marker.castShadow = true;
        attractor.marker.userData = { attractor: attractor };

        // Create effect radius visualization (optional)
        if (this.options.showEffectRadius) {
            const effectGeometry = new THREE.SphereGeometry(attractor.effectRadius, 16, 16);
            const effectMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: this.options.effectRadiusOpacity,
                wireframe: true
            });

            attractor.effectSphere = new THREE.Mesh(effectGeometry, effectMaterial);
            attractor.effectSphere.position.copy(attractor.position);
            attractor.effectSphere.userData = { attractor: attractor };
        }

        // Add to group
        this.group.add(attractor.marker);
        if (attractor.effectSphere) {
            this.group.add(attractor.effectSphere);
        }
    }

    /**
     * Remove the nearest attractor to a given position
     * @param {THREE.Vector3} position - Position to search near
     * @param {number} maxDistance - Maximum distance to search (optional)
     * @returns {boolean} True if an attractor was removed
     */
    removeNearestAttractor(position, maxDistance = this.sphereRadius * 0.2) {
        let nearestAttractor = null;
        let nearestDistance = Infinity;

        // Find the nearest attractor
        for (const attractor of this.attractors) {
            const distance = attractor.position.distanceTo(new Vector3D(position.x, position.y, position.z));
            if (distance < nearestDistance && distance <= maxDistance) {
                nearestDistance = distance;
                nearestAttractor = attractor;
            }
        }

        // Remove if found
        if (nearestAttractor) {
            this.removeAttractor(nearestAttractor.id);
            return true;
        }

        return false;
    }

    /**
     * Remove an attractor by ID
     * @param {number} id - Attractor ID
     * @returns {boolean} True if attractor was removed
     */
    removeAttractor(id) {
        const index = this.attractors.findIndex(attractor => attractor.id === id);
        if (index === -1) return false;

        const attractor = this.attractors[index];

        // Remove visual components
        if (attractor.marker) {
            this.group.remove(attractor.marker);
            attractor.marker.geometry.dispose();
            attractor.marker.material.dispose();
        }
        
        if (attractor.effectSphere) {
            this.group.remove(attractor.effectSphere);
            attractor.effectSphere.geometry.dispose();
            attractor.effectSphere.material.dispose();
        }

        // Remove from collection
        this.attractors.splice(index, 1);

        console.log(`🗑️ Removed ${attractor.type}or (ID: ${id})`);
        return true;
    }

    /**
     * Clear all attractors
     */
    clearAllAttractors() {
        // Remove all visual components
        for (const attractor of this.attractors) {
            if (attractor.marker) {
                this.group.remove(attractor.marker);
                attractor.marker.geometry.dispose();
                attractor.marker.material.dispose();
            }
            
            if (attractor.effectSphere) {
                this.group.remove(attractor.effectSphere);
                attractor.effectSphere.geometry.dispose();
                attractor.effectSphere.material.dispose();
            }
        }

        // Clear collection
        this.attractors = [];
        console.log('🧹 Cleared all attractors');
    }

    /**
     * Update attractor animations
     * @param {number} deltaTime - Time since last update (seconds)
     */
    update(deltaTime) {
        this.animationTime += deltaTime;

        // Update pulsing animation for each attractor
        for (const attractor of this.attractors) {
            if (attractor.marker) {
                // Pulsing scale effect
                const pulseScale = 1.0 + Math.sin(this.animationTime * this.options.pulseSpeed + attractor.pulsePhase) * 0.2;
                attractor.marker.scale.setScalar(pulseScale);

                // Varying emissive intensity
                const emissiveIntensity = 0.3 + Math.sin(this.animationTime * this.options.pulseSpeed * 1.5 + attractor.pulsePhase) * 0.2;
                attractor.marker.material.emissiveIntensity = emissiveIntensity;
            }

            // Update effect sphere if visible
            if (attractor.effectSphere) {
                const effectPulse = 1.0 + Math.sin(this.animationTime * this.options.pulseSpeed * 0.7 + attractor.pulsePhase) * 0.1;
                attractor.effectSphere.scale.setScalar(effectPulse);
            }
        }
    }

    /**
     * Calculate force from all attractors affecting a boid
     * @param {Object} boid - Boid object with position property
     * @returns {Vector3D} Combined force vector from all attractors
     */
    calculateAttractorForces(boid) {
        if (!boid || !boid.position || this.attractors.length === 0) {
            return new Vector3D(0, 0, 0);
        }

        const totalForce = new Vector3D(0, 0, 0);
        const boidPos = boid.position;

        for (const attractor of this.attractors) {
            // Calculate distance to attractor
            const toAttractor = Vector3D.subtract(attractor.position, boidPos);
            const distance = toAttractor.magnitude();

            // Skip if outside effect radius
            if (distance > attractor.effectRadius || distance < 0.1) {
                continue;
            }

            // Calculate force magnitude using inverse square law with smooth falloff
            const normalizedDistance = distance / attractor.effectRadius;
            let forceMagnitude = attractor.strength / (distance * distance + 1); // +1 prevents division by zero
            
            // Apply smooth falloff at edge of effect radius
            if (normalizedDistance > 0.8) {
                const falloff = 1.0 - (normalizedDistance - 0.8) / 0.2;
                forceMagnitude *= falloff * falloff; // Smooth quadratic falloff
            }

            // Direction depends on attractor type
            const forceDirection = toAttractor.normalize();
            if (attractor.type === 'repel') {
                forceDirection.multiply(-1); // Reverse direction for repellers
            }

            // Apply force
            const force = Vector3D.multiply(forceDirection, forceMagnitude);
            totalForce.add(force);
        }

        return totalForce;
    }

    /**
     * Update sphere radius (call when sphere geometry changes)
     * @param {number} newRadius - New sphere radius
     */
    updateSphereRadius(newRadius) {
        this.sphereRadius = newRadius;
        
        // Update invisible sphere for raycasting
        this.group.remove(this.invisibleSphere);
        this.invisibleSphere.geometry.dispose();
        
        this.sphereGeometry = new THREE.SphereGeometry(newRadius, 64, 32);
        this.invisibleSphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
        this.group.add(this.invisibleSphere);

        // Update effect radii for existing attractors
        for (const attractor of this.attractors) {
            attractor.effectRadius = newRadius * 0.3; // Maintain relative size
            
            if (attractor.effectSphere) {
                attractor.effectSphere.scale.setScalar(1.0);
                attractor.effectSphere.geometry.dispose();
                attractor.effectSphere.geometry = new THREE.SphereGeometry(attractor.effectRadius, 16, 16);
            }
        }
    }

    /**
     * Set attractor visibility
     * @param {boolean} visible - Whether attractors should be visible
     */
    setVisible(visible) {
        this.group.visible = visible;
    }

    /**
     * Enable or disable attractor interaction
     * @param {boolean} enabled - Whether interaction should be enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    /**
     * Get all attractors data
     * @returns {Array} Array of attractor objects
     */
    getAttractors() {
        return [...this.attractors]; // Return copy to prevent external modification
    }

    /**
     * Get Three.js group containing all attractor visuals
     * @returns {THREE.Group} Attractor group
     */
    getObject3D() {
        return this.group;
    }

    /**
     * Get statistics about current attractors
     * @returns {Object} Statistics object
     */
    getStats() {
        const attractorCount = this.attractors.filter(a => a.type === 'attract').length;
        const repellerCount = this.attractors.filter(a => a.type === 'repel').length;

        return {
            totalCount: this.attractors.length,
            attractorCount,
            repellerCount,
            maxAttractors: this.options.maxAttractors,
            isEnabled: this.isEnabled
        };
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Remove event listeners
        if (this.domElement) {
            this.domElement.removeEventListener('mousemove', this.onMouseMove);
            this.domElement.removeEventListener('mousedown', this.onMouseDown);
            this.domElement.removeEventListener('contextmenu', this.onContextMenu);
        }

        // Clear all attractors (disposes geometries and materials)
        this.clearAllAttractors();

        // Dispose invisible sphere
        if (this.invisibleSphere) {
            this.invisibleSphere.geometry.dispose();
            this.invisibleSphere.material.dispose();
        }

        console.log('🧹 Interactive attractors disposed');
    }
}