/**
 * BoidVisualizer - 3D visualization component for individual boids
 * Creates and manages Three.js objects representing boids with velocity-based orientation
 */
import * as THREE from 'three';

export class BoidVisualizer {
    constructor(options = {}) {
        this.options = {
            size: 1.5,
            color: 0x44aaff,
            showTrail: true,
            trailLength: 20,
            velocityScale: 8.0,
            showVelocityVector: false,
            ...options
        };
        
        this.mesh = null;
        this.trail = null;
        this.velocityArrow = null;
        this.group = new THREE.Group();
        
        this.trailPositions = [];
        this.maxTrailLength = this.options.trailLength;
        
        this.createBoidMesh();
        if (this.options.showTrail) {
            this.createTrail();
        }
        if (this.options.showVelocityVector) {
            this.createVelocityArrow();
        }
    }

    /**
     * Create the main boid mesh - a small arrow/cone shape
     */
    createBoidMesh() {
        // Create cone geometry pointing along +Z axis
        const geometry = new THREE.ConeGeometry(
            this.options.size * 0.6,  // radius
            this.options.size * 2.0,  // height
            6  // radial segments
        );
        
        const material = new THREE.MeshPhongMaterial({
            color: this.options.color,
            shininess: 30,
            transparent: true,
            opacity: 0.9
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Rotate to point along positive Z-axis (forward)
        this.mesh.rotation.x = -Math.PI / 2;
        
        this.group.add(this.mesh);
    }

    /**
     * Create trail visualization
     */
    createTrail() {
        const trailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTrailLength * 3);
        const colors = new Float32Array(this.maxTrailLength * 3);
        
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const trailMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });
        
        this.trail = new THREE.Line(trailGeometry, trailMaterial);
        this.group.add(this.trail);
    }

    /**
     * Create velocity vector arrow (for debugging)
     */
    createVelocityArrow() {
        const arrowGeometry = new THREE.ConeGeometry(0.3, 1.0, 4);
        const arrowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.7
        });
        
        this.velocityArrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        this.velocityArrow.rotation.x = -Math.PI / 2;
        this.group.add(this.velocityArrow);
    }

    /**
     * Update boid position and orientation
     * @param {Object} boid - Boid data with position and velocity
     */
    updateFromBoid(boid) {
        if (!this.mesh) return;
        
        // Update position
        this.group.position.set(boid.position.x, boid.position.y, boid.position.z);
        
        // Update orientation based on velocity
        if (boid.velocity.magnitude() > 0.01) {
            const velocity = boid.velocity.clone().normalize();
            
            // Calculate rotation to align with velocity
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion();
            
            // Create a direction matrix
            const matrix = new THREE.Matrix4();
            matrix.lookAt(
                new THREE.Vector3(0, 0, 0),
                velocity,
                up
            );
            quaternion.setFromRotationMatrix(matrix);
            
            this.mesh.quaternion.slerp(quaternion, 0.1);
        }
        
        // Update trail
        if (this.options.showTrail && this.trail) {
            this.updateTrail(boid.position);
        }
        
        // Update velocity arrow
        if (this.options.showVelocityVector && this.velocityArrow && boid.velocity.magnitude() > 0.01) {
            const velocityLength = boid.velocity.magnitude() * this.options.velocityScale;
            const velocityNorm = boid.velocity.clone().normalize();
            
            // Position arrow at boid position plus small offset
            this.velocityArrow.position.copy(velocityNorm.multiplyScalar(this.options.size * 1.5));
            this.velocityArrow.scale.setScalar(velocityLength);
            
            // Orient arrow along velocity
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion();
            const matrix = new THREE.Matrix4();
            matrix.lookAt(
                new THREE.Vector3(0, 0, 0),
                boid.velocity.clone().normalize(),
                up
            );
            quaternion.setFromRotationMatrix(matrix);
            this.velocityArrow.quaternion.copy(quaternion);
        }
    }

    /**
     * Update trail positions
     * @param {THREE.Vector3} position - Current boid position
     */
    updateTrail(position) {
        // Add current position to trail
        this.trailPositions.push(position.clone());
        
        // Remove old positions
        if (this.trailPositions.length > this.maxTrailLength) {
            this.trailPositions.shift();
        }
        
        // Update trail geometry
        const positions = this.trail.geometry.attributes.position.array;
        const colors = this.trail.geometry.attributes.color.array;
        
        for (let i = 0; i < this.maxTrailLength; i++) {
            if (i < this.trailPositions.length) {
                const pos = this.trailPositions[i];
                positions[i * 3] = pos.x;
                positions[i * 3 + 1] = pos.y;
                positions[i * 3 + 2] = pos.z;
                
                // Fade trail from head to tail
                const alpha = i / this.trailPositions.length;
                colors[i * 3] = (this.options.color >> 16) / 255 * alpha;
                colors[i * 3 + 1] = ((this.options.color >> 8) & 0xff) / 255 * alpha;
                colors[i * 3 + 2] = (this.options.color & 0xff) / 255 * alpha;
            } else {
                // Clear unused positions
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
                colors[i * 3] = 0;
                colors[i * 3 + 1] = 0;
                colors[i * 3 + 2] = 0;
            }
        }
        
        this.trail.geometry.attributes.position.needsUpdate = true;
        this.trail.geometry.attributes.color.needsUpdate = true;
        
        // Update geometry bounds
        this.trail.geometry.computeBoundingSphere();
    }

    /**
     * Set boid color
     * @param {number} color - New color as hex value
     */
    setColor(color) {
        this.options.color = color;
        if (this.mesh) {
            this.mesh.material.color.setHex(color);
        }
    }

    /**
     * Set trail visibility
     * @param {boolean} visible - Whether trail should be visible
     */
    setTrailVisible(visible) {
        if (this.trail) {
            this.trail.visible = visible;
        }
    }

    /**
     * Set velocity arrow visibility
     * @param {boolean} visible - Whether velocity arrow should be visible
     */
    setVelocityArrowVisible(visible) {
        if (this.velocityArrow) {
            this.velocityArrow.visible = visible;
        }
    }

    /**
     * Get the Three.js group containing all boid components
     * @returns {THREE.Group} The boid visualization group
     */
    getObject3D() {
        return this.group;
    }

    /**
     * Dispose of geometry and materials
     */
    dispose() {
        this.group.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
}

/**
 * BoidSwarm - Manager for multiple boid visualizers
 * Handles efficient creation, updating, and removal of boid visuals
 */
export class BoidSwarm {
    constructor(options = {}) {
        this.options = {
            maxBoids: 1000,
            boidSize: 1.5,
            showTrails: true,
            showVelocityVectors: false,
            colorVariation: true,
            baseColor: 0x44aaff,
            ...options
        };
        
        this.boids = new Map();
        this.group = new THREE.Group();
        this.objectPool = [];
    }

    /**
     * Update all boid visualizations
     * @param {Array} boidData - Array of boid objects with position and velocity
     */
    updateBoids(boidData) {
        const currentIds = new Set(this.boids.keys());
        
        // Update existing boids and create new ones
        for (let i = 0; i < boidData.length; i++) {
            const boid = boidData[i];
            const id = boid.id || i;
            
            if (this.boids.has(id)) {
                // Update existing boid
                this.boids.get(id).updateFromBoid(boid);
                currentIds.delete(id);
            } else {
                // Create new boid
                this.createBoidVisualizer(id, boid);
            }
        }
        
        // Remove boids that no longer exist
        for (const id of currentIds) {
            this.removeBoidVisualizer(id);
        }
    }

    /**
     * Create a new boid visualizer
     * @param {string|number} id - Unique identifier for the boid
     * @param {Object} boid - Boid data
     */
    createBoidVisualizer(id, boid) {
        let visualizer;
        
        if (this.objectPool.length > 0) {
            // Reuse from pool
            visualizer = this.objectPool.pop();
        } else {
            // Create new visualizer
            const color = this.options.colorVariation ? 
                this.generateVariantColor(this.options.baseColor, id) : 
                this.options.baseColor;
                
            visualizer = new BoidVisualizer({
                size: this.options.boidSize,
                color: color,
                showTrail: this.options.showTrails,
                showVelocityVector: this.options.showVelocityVectors
            });
        }
        
        this.boids.set(id, visualizer);
        this.group.add(visualizer.getObject3D());
        visualizer.updateFromBoid(boid);
    }

    /**
     * Remove a boid visualizer
     * @param {string|number} id - Unique identifier for the boid
     */
    removeBoidVisualizer(id) {
        const visualizer = this.boids.get(id);
        if (visualizer) {
            this.group.remove(visualizer.getObject3D());
            this.boids.delete(id);
            
            // Return to pool for reuse
            if (this.objectPool.length < 100) {
                this.objectPool.push(visualizer);
            } else {
                visualizer.dispose();
            }
        }
    }

    /**
     * Generate color variation based on ID
     * @param {number} baseColor - Base color
     * @param {string|number} id - Boid ID
     */
    generateVariantColor(baseColor, id) {
        // Simple hash function to generate consistent colors per ID
        let hash = 0;
        const idStr = id.toString();
        for (let i = 0; i < idStr.length; i++) {
            hash = ((hash << 5) - hash + idStr.charCodeAt(i)) & 0xffffffff;
        }
        
        // Extract RGB components
        const r = (baseColor >> 16) & 0xff;
        const g = (baseColor >> 8) & 0xff;
        const b = baseColor & 0xff;
        
        // Add variation based on hash
        const variation = 0.3;
        const rVar = Math.max(0, Math.min(255, r + (hash % 100 - 50) * variation));
        const gVar = Math.max(0, Math.min(255, g + ((hash >> 8) % 100 - 50) * variation));
        const bVar = Math.max(0, Math.min(255, b + ((hash >> 16) % 100 - 50) * variation));
        
        return (Math.floor(rVar) << 16) | (Math.floor(gVar) << 8) | Math.floor(bVar);
    }

    /**
     * Set trail visibility for all boids
     * @param {boolean} visible - Whether trails should be visible
     */
    setTrailsVisible(visible) {
        this.options.showTrails = visible;
        this.boids.forEach(visualizer => {
            visualizer.setTrailVisible(visible);
        });
    }

    /**
     * Set velocity arrow visibility for all boids
     * @param {boolean} visible - Whether velocity arrows should be visible
     */
    setVelocityArrowsVisible(visible) {
        this.options.showVelocityVectors = visible;
        this.boids.forEach(visualizer => {
            visualizer.setVelocityArrowVisible(visible);
        });
    }

    /**
     * Get the Three.js group containing all boid visualizations
     * @returns {THREE.Group} The boid swarm group
     */
    getObject3D() {
        return this.group;
    }

    /**
     * Get current boid count
     * @returns {number} Number of active boid visualizers
     */
    getBoidCount() {
        return this.boids.size;
    }

    /**
     * Clear all boids
     */
    clear() {
        this.boids.forEach(visualizer => {
            this.group.remove(visualizer.getObject3D());
            visualizer.dispose();
        });
        this.boids.clear();
        this.objectPool.forEach(visualizer => visualizer.dispose());
        this.objectPool.length = 0;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.clear();
    }
}