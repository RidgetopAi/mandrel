/**
 * BoidsEngine - Main boids simulation engine
 * Combines separation, alignment, and cohesion behaviors with configurable weights
 * Handles the complete boids flocking simulation with performance optimizations
 */
import { Vector3D } from './Vector3D.js';
import { 
    separation, 
    alignment, 
    cohesion, 
    getNeighbors, 
    sphericalBoundary,
    wander,
    avoidObstacles
} from './BoidsRules.js';
import { 
    createSphericalConstraintSystem,
    getConstraintPreset
} from './SphericalConstraints.js';

/**
 * Default configuration for boids simulation
 */
export const DEFAULT_CONFIG = {
    // Rule weights
    separationWeight: 1.5,
    alignmentWeight: 1.0,
    cohesionWeight: 1.0,
    boundaryWeight: 2.0,
    wanderWeight: 0.1,
    obstacleWeight: 3.0,
    
    // Boid physics
    maxSpeed: 2.0,
    maxForce: 0.03,
    
    // Perception radii
    separationRadius: 25.0,
    alignmentRadius: 50.0,
    cohesionRadius: 50.0,
    obstacleAvoidRadius: 30.0,
    
    // Boundary settings
    boundaryCenter: new Vector3D(0, 0, 0),
    boundaryRadius: 200.0,
    
    // Spherical constraint settings
    enableSphericalConstraints: false,
    sphericalConstraintPreset: 'natural', // 'strict', 'loose', 'natural', 'boundary-only'
    sphereCenter: new Vector3D(0, 0, 0),
    sphereRadius: 10.0,
    
    // Performance settings
    maxNeighbors: 50, // Limit neighbors for performance
    spatialOptimization: true
};

/**
 * BoidsEngine class - Main simulation engine
 */
export class BoidsEngine {
    /**
     * Create a new BoidsEngine
     * @param {Object} config - Configuration object (optional)
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.boids = [];
        this.obstacles = [];
        
        // Performance tracking
        this.frameCount = 0;
        this.lastPerformanceCheck = 0;
        this.averageUpdateTime = 0;
        
        // Spatial optimization grid (optional)
        this.spatialGrid = null;
        if (this.config.spatialOptimization) {
            this.initializeSpatialGrid();
        }
        
        // Spherical constraint system
        this.sphericalConstraints = null;
        if (this.config.enableSphericalConstraints) {
            this.initializeSphericalConstraints();
        }
    }

    /**
     * Add a boid to the simulation
     * @param {Vector3D} position - Initial position
     * @param {Vector3D} velocity - Initial velocity (optional)
     * @returns {Object} Created boid object
     */
    addBoid(position, velocity = null) {
        const boid = {
            id: this.boids.length,
            position: position.clone(),
            velocity: velocity ? velocity.clone() : Vector3D.random(1).multiply(this.config.maxSpeed),
            acceleration: new Vector3D(),
            maxSpeed: this.config.maxSpeed,
            maxForce: this.config.maxForce,
            
            // Additional properties for visualization and behavior
            age: 0,
            energy: 1.0,
            lastNeighbors: [],
            
            // Performance optimization
            lastUpdate: 0,
            gridCell: null
        };
        
        // Ensure velocity is within speed limits
        boid.velocity.limit(boid.maxSpeed);
        
        this.boids.push(boid);
        return boid;
    }

    /**
     * Add multiple boids with random positions within boundary
     * @param {number} count - Number of boids to add
     * @param {number} spread - Radius of initial distribution (default: boundary radius * 0.8)
     */
    addRandomBoids(count, spread = null) {
        if (spread === null) {
            spread = this.config.boundaryRadius * 0.8;
        }
        
        for (let i = 0; i < count; i++) {
            const position = Vector3D.add(
                this.config.boundaryCenter,
                Vector3D.random(spread)
            );
            this.addBoid(position);
        }
    }

    /**
     * Add an obstacle to the simulation
     * @param {Vector3D} position - Obstacle position
     * @param {number} radius - Obstacle radius
     * @param {string} type - Obstacle type (optional)
     * @returns {Object} Created obstacle object
     */
    addObstacle(position, radius, type = 'sphere') {
        const obstacle = {
            id: this.obstacles.length,
            position: position.clone(),
            radius,
            type
        };
        
        this.obstacles.push(obstacle);
        return obstacle;
    }

    /**
     * Update all boids by one simulation step
     * @param {number} deltaTime - Time elapsed since last update (default: 1.0)
     */
    update(deltaTime = 1.0) {
        const startTime = performance.now();
        
        // Update spatial grid if enabled
        if (this.config.spatialOptimization) {
            this.updateSpatialGrid();
        }
        
        // Calculate forces for all boids
        for (const boid of this.boids) {
            this.updateBoidForces(boid);
        }
        
        // Apply forces and update positions
        for (const boid of this.boids) {
            this.updateBoidPosition(boid, deltaTime);
        }
        
        // Apply spherical constraints after position updates
        if (this.sphericalConstraints) {
            this.sphericalConstraints.updateBoids(this.boids);
        }
        
        // Performance tracking
        const endTime = performance.now();
        this.updatePerformanceMetrics(endTime - startTime);
        
        this.frameCount++;
    }

    /**
     * Calculate and apply forces to a single boid
     * @param {Object} boid - Boid to update
     */
    updateBoidForces(boid) {
        // Reset acceleration
        boid.acceleration.set(0, 0, 0);
        
        // Get neighbors efficiently
        const neighbors = this.getBoidsNeighbors(boid);
        
        // Apply core boids rules
        const sep = separation(boid, neighbors, this.config.separationRadius);
        const ali = alignment(boid, neighbors);
        const coh = cohesion(boid, neighbors);
        
        // Weight and combine forces
        sep.multiply(this.config.separationWeight);
        ali.multiply(this.config.alignmentWeight);
        coh.multiply(this.config.cohesionWeight);
        
        boid.acceleration.add(sep);
        boid.acceleration.add(ali);
        boid.acceleration.add(coh);
        
        // Apply boundary forces
        if (this.config.boundaryWeight > 0) {
            const boundary = sphericalBoundary(
                boid, 
                this.config.boundaryCenter, 
                this.config.boundaryRadius,
                this.config.boundaryWeight
            );
            boid.acceleration.add(boundary);
        }
        
        // Apply obstacle avoidance
        if (this.obstacles.length > 0 && this.config.obstacleWeight > 0) {
            const avoidance = avoidObstacles(
                boid, 
                this.obstacles, 
                this.config.obstacleAvoidRadius
            );
            avoidance.multiply(this.config.obstacleWeight);
            boid.acceleration.add(avoidance);
        }
        
        // Apply wander behavior for natural movement
        if (this.config.wanderWeight > 0) {
            const wanderForce = wander(boid, this.config.wanderWeight);
            boid.acceleration.add(wanderForce);
        }
        
        // Store neighbors for potential use by visualization or other systems
        boid.lastNeighbors = neighbors;
        boid.lastUpdate = this.frameCount;
    }

    /**
     * Update boid position and velocity based on calculated forces
     * @param {Object} boid - Boid to update
     * @param {number} deltaTime - Time step multiplier
     */
    updateBoidPosition(boid, deltaTime) {
        // Update velocity with acceleration
        const accelerationStep = Vector3D.multiply(boid.acceleration, deltaTime);
        boid.velocity.add(accelerationStep);
        
        // Limit velocity to max speed
        boid.velocity.limit(boid.maxSpeed);
        
        // Update position with velocity
        const velocityStep = Vector3D.multiply(boid.velocity, deltaTime);
        boid.position.add(velocityStep);
        
        // Update boid age and energy (for advanced behaviors)
        boid.age += deltaTime;
        boid.energy = Math.min(1.0, boid.energy + 0.001 * deltaTime); // Slow energy recovery
    }

    /**
     * Get neighbors for a boid using optimized methods
     * @param {Object} boid - Boid to find neighbors for
     * @returns {Array} Array of neighboring boids
     */
    getBoidsNeighbors(boid) {
        let potentialNeighbors = this.boids;
        
        // Use spatial grid optimization if available
        if (this.spatialGrid && boid.gridCell) {
            potentialNeighbors = this.getSpatialNeighbors(boid);
        }
        
        // Find neighbors within perception radius
        const maxRadius = Math.max(
            this.config.separationRadius,
            this.config.alignmentRadius,
            this.config.cohesionRadius
        );
        
        const neighbors = getNeighbors(boid, potentialNeighbors, maxRadius);
        
        // Limit neighbors for performance if needed
        if (neighbors.length > this.config.maxNeighbors) {
            // Sort by distance and take closest neighbors
            neighbors.sort((a, b) => {
                const distA = boid.position.distanceToSquared(a.position);
                const distB = boid.position.distanceToSquared(b.position);
                return distA - distB;
            });
            neighbors.length = this.config.maxNeighbors;
        }
        
        return neighbors;
    }

    /**
     * Initialize spatial grid for performance optimization
     */
    initializeSpatialGrid() {
        const gridSize = Math.max(
            this.config.separationRadius,
            this.config.alignmentRadius,
            this.config.cohesionRadius
        );
        
        // Choose appropriate spatial partitioning based on constraints
        if (this.config.enableSphericalConstraints) {
            this.initializeSphericalGrid(gridSize);
        } else {
            this.initializeCartesianGrid(gridSize);
        }
    }

    /**
     * Initialize Cartesian spatial grid for free space
     * @param {number} gridSize - Size of grid cells
     */
    initializeCartesianGrid(gridSize) {
        this.spatialGrid = {
            type: 'cartesian',
            cellSize: gridSize,
            cells: new Map(),
            bounds: {
                min: Vector3D.subtract(this.config.boundaryCenter, 
                      new Vector3D(this.config.boundaryRadius, this.config.boundaryRadius, this.config.boundaryRadius)),
                max: Vector3D.add(this.config.boundaryCenter,
                      new Vector3D(this.config.boundaryRadius, this.config.boundaryRadius, this.config.boundaryRadius))
            }
        };
    }

    /**
     * Initialize spherical coordinate-based spatial grid for sphere surface
     * @param {number} gridSize - Size of grid cells (in terms of angular resolution)
     */
    initializeSphericalGrid(gridSize) {
        // Calculate angular resolution based on grid size and sphere radius
        const angularResolution = gridSize / this.config.sphereRadius;
        
        // Number of divisions in theta and phi directions
        const thetaDivisions = Math.max(8, Math.ceil(2 * Math.PI / angularResolution));
        const phiDivisions = Math.max(4, Math.ceil(Math.PI / angularResolution));
        
        this.spatialGrid = {
            type: 'spherical',
            angularResolution,
            thetaDivisions,
            phiDivisions,
            cells: new Map(),
            sphereCenter: this.config.sphereCenter.clone(),
            sphereRadius: this.config.sphereRadius,
            // Performance tracking
            collisionChecks: 0,
            spatialHits: 0
        };
    }

    /**
     * Update spatial grid with current boid positions
     */
    updateSpatialGrid() {
        if (!this.spatialGrid) return;
        
        // Clear existing cells
        this.spatialGrid.cells.clear();
        
        // Add boids to appropriate grid cells
        for (const boid of this.boids) {
            const cellKey = this.getGridCellKey(boid.position);
            
            if (!this.spatialGrid.cells.has(cellKey)) {
                this.spatialGrid.cells.set(cellKey, []);
            }
            
            this.spatialGrid.cells.get(cellKey).push(boid);
            boid.gridCell = cellKey;
        }
    }

    /**
     * Get spatial neighbors using grid optimization
     * @param {Object} boid - Boid to find neighbors for
     * @returns {Array} Potential neighboring boids from nearby grid cells
     */
    getSpatialNeighbors(boid) {
        if (!this.spatialGrid) return this.boids;
        
        if (this.spatialGrid.type === 'spherical') {
            return this.getSphericalSpatialNeighbors(boid);
        } else {
            return this.getCartesianSpatialNeighbors(boid);
        }
    }

    /**
     * Get spatial neighbors using Cartesian grid optimization
     * @param {Object} boid - Boid to find neighbors for
     * @returns {Array} Potential neighboring boids from nearby grid cells
     */
    getCartesianSpatialNeighbors(boid) {
        const neighbors = [];
        const cellSize = this.spatialGrid.cellSize;
        
        // Check surrounding 27 cells (3x3x3 cube)
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const cellPos = new Vector3D(
                        Math.floor(boid.position.x / cellSize) + x,
                        Math.floor(boid.position.y / cellSize) + y,
                        Math.floor(boid.position.z / cellSize) + z
                    );
                    
                    const cellKey = `${cellPos.x},${cellPos.y},${cellPos.z}`;
                    const cell = this.spatialGrid.cells.get(cellKey);
                    
                    if (cell) {
                        neighbors.push(...cell);
                    }
                }
            }
        }
        
        return neighbors;
    }

    /**
     * Get spatial neighbors using spherical grid optimization
     * @param {Object} boid - Boid to find neighbors for
     * @returns {Array} Potential neighboring boids from nearby spherical cells
     */
    getSphericalSpatialNeighbors(boid) {
        const neighbors = [];
        const grid = this.spatialGrid;
        
        // Convert boid position to spherical coordinates relative to sphere center
        const relativePos = Vector3D.subtract(boid.position, grid.sphereCenter);
        const spherical = this.cartesianToSpherical(relativePos.x, relativePos.y, relativePos.z);
        
        // Get current cell indices
        const thetaIndex = Math.floor((spherical.theta + Math.PI) / (2 * Math.PI) * grid.thetaDivisions);
        const phiIndex = Math.floor(spherical.phi / Math.PI * grid.phiDivisions);
        
        // Check neighboring cells in spherical coordinates
        // We need to check a wider range near the poles due to coordinate singularities
        const searchRange = spherical.phi < 0.5 || spherical.phi > Math.PI - 0.5 ? 2 : 1;
        
        for (let dTheta = -searchRange; dTheta <= searchRange; dTheta++) {
            for (let dPhi = -1; dPhi <= 1; dPhi++) {
                let neighborThetaIndex = (thetaIndex + dTheta + grid.thetaDivisions) % grid.thetaDivisions;
                let neighborPhiIndex = Math.max(0, Math.min(grid.phiDivisions - 1, phiIndex + dPhi));
                
                const cellKey = `${neighborThetaIndex},${neighborPhiIndex}`;
                const cell = grid.cells.get(cellKey);
                
                if (cell) {
                    neighbors.push(...cell);
                    grid.spatialHits++;
                }
            }
        }
        
        // Track performance metrics
        grid.collisionChecks++;
        
        return neighbors;
    }

    /**
     * Get grid cell key for a position
     * @param {Vector3D} position - Position to get cell key for
     * @returns {string} Grid cell key
     */
    getGridCellKey(position) {
        if (this.spatialGrid.type === 'spherical') {
            return this.getSphericalGridCellKey(position);
        } else {
            return this.getCartesianGridCellKey(position);
        }
    }

    /**
     * Get Cartesian grid cell key for a position
     * @param {Vector3D} position - Position to get cell key for
     * @returns {string} Grid cell key
     */
    getCartesianGridCellKey(position) {
        const cellSize = this.spatialGrid.cellSize;
        const x = Math.floor(position.x / cellSize);
        const y = Math.floor(position.y / cellSize);
        const z = Math.floor(position.z / cellSize);
        return `${x},${y},${z}`;
    }

    /**
     * Get spherical grid cell key for a position
     * @param {Vector3D} position - Position to get cell key for
     * @returns {string} Grid cell key
     */
    getSphericalGridCellKey(position) {
        const grid = this.spatialGrid;
        
        // Convert to spherical coordinates relative to sphere center
        const relativePos = Vector3D.subtract(position, grid.sphereCenter);
        const spherical = this.cartesianToSpherical(relativePos.x, relativePos.y, relativePos.z);
        
        // Calculate grid cell indices
        const thetaIndex = Math.floor((spherical.theta + Math.PI) / (2 * Math.PI) * grid.thetaDivisions);
        const phiIndex = Math.floor(spherical.phi / Math.PI * grid.phiDivisions);
        
        // Ensure indices are within bounds
        const clampedThetaIndex = Math.max(0, Math.min(grid.thetaDivisions - 1, thetaIndex));
        const clampedPhiIndex = Math.max(0, Math.min(grid.phiDivisions - 1, phiIndex));
        
        return `${clampedThetaIndex},${clampedPhiIndex}`;
    }

    /**
     * Convert Cartesian coordinates to spherical coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @returns {Object} Object with {radius, theta, phi} properties
     */
    cartesianToSpherical(x, y, z) {
        const radius = Math.sqrt(x * x + y * y + z * z);
        
        // Handle case where point is at origin
        if (radius < 1e-10) {
            return { radius: 0, theta: 0, phi: 0 };
        }
        
        const theta = Math.atan2(y, x);
        const phi = Math.acos(Math.max(-1, Math.min(1, z / radius)));
        
        return { radius, theta, phi };
    }

    /**
     * Update performance metrics
     * @param {number} updateTime - Time taken for this update
     */
    updatePerformanceMetrics(updateTime) {
        // Update rolling average of update times
        if (this.averageUpdateTime === 0) {
            this.averageUpdateTime = updateTime;
        } else {
            this.averageUpdateTime = this.averageUpdateTime * 0.95 + updateTime * 0.05;
        }
        
        // Log performance periodically
        if (this.frameCount % 60 === 0) { // Every 60 frames
            const fps = 1000 / this.averageUpdateTime;
            console.log(`Boids: ${this.boids.length}, FPS: ${fps.toFixed(1)}, Avg Update: ${this.averageUpdateTime.toFixed(2)}ms`);
        }
    }

    /**
     * Get simulation statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {
            boidsCount: this.boids.length,
            obstaclesCount: this.obstacles.length,
            frameCount: this.frameCount,
            averageUpdateTime: this.averageUpdateTime,
            estimatedFPS: this.averageUpdateTime > 0 ? 1000 / this.averageUpdateTime : 0,
            spatialOptimization: this.config.spatialOptimization,
            sphericalConstraints: {
                enabled: this.config.enableSphericalConstraints,
                preset: this.config.sphericalConstraintPreset,
                sphereRadius: this.config.sphereRadius
            },
            config: { ...this.config }
        };
        
        // Add spatial grid performance stats
        if (this.spatialGrid) {
            stats.spatialGrid = {
                type: this.spatialGrid.type,
                cellCount: this.spatialGrid.cells.size,
                averageBoidsPerCell: this.boids.length / Math.max(1, this.spatialGrid.cells.size)
            };
            
            if (this.spatialGrid.type === 'spherical') {
                stats.spatialGrid.thetaDivisions = this.spatialGrid.thetaDivisions;
                stats.spatialGrid.phiDivisions = this.spatialGrid.phiDivisions;
                stats.spatialGrid.collisionChecks = this.spatialGrid.collisionChecks;
                stats.spatialGrid.spatialHits = this.spatialGrid.spatialHits;
                stats.spatialGrid.hitRate = this.spatialGrid.collisionChecks > 0 ? 
                    (this.spatialGrid.spatialHits / this.spatialGrid.collisionChecks * 100).toFixed(1) + '%' : '0%';
            } else {
                stats.spatialGrid.cellSize = this.spatialGrid.cellSize;
            }
        }
        
        // Add spherical constraint stats if available
        if (this.sphericalConstraints) {
            stats.sphericalConstraints.systemStats = this.sphericalConstraints.getStats();
        }
        
        return stats;
    }

    /**
     * Update simulation configuration
     * @param {Object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update boid properties if max speed or force changed
        if (newConfig.maxSpeed !== undefined || newConfig.maxForce !== undefined) {
            for (const boid of this.boids) {
                if (newConfig.maxSpeed !== undefined) {
                    boid.maxSpeed = newConfig.maxSpeed;
                }
                if (newConfig.maxForce !== undefined) {
                    boid.maxForce = newConfig.maxForce;
                }
            }
        }
        
        // Reinitialize spatial grid if spatial optimization settings changed
        if (newConfig.spatialOptimization !== undefined && newConfig.spatialOptimization) {
            this.initializeSpatialGrid();
        }
        
        // Update spherical constraints if related settings changed
        if (newConfig.enableSphericalConstraints !== undefined) {
            if (newConfig.enableSphericalConstraints) {
                this.initializeSphericalConstraints();
            } else {
                this.disableSphericalConstraints();
            }
        } else if (this.sphericalConstraints && (
            newConfig.sphericalConstraintPreset || 
            newConfig.sphereCenter || 
            newConfig.sphereRadius !== undefined
        )) {
            this.updateSphericalConstraints({
                preset: newConfig.sphericalConstraintPreset,
                center: newConfig.sphereCenter,
                radius: newConfig.sphereRadius
            });
        }
    }

    /**
     * Initialize spherical constraint system
     */
    initializeSphericalConstraints() {
        const constraintConfig = getConstraintPreset(this.config.sphericalConstraintPreset);
        this.sphericalConstraints = createSphericalConstraintSystem(
            this.config.sphereCenter,
            this.config.sphereRadius,
            constraintConfig
        );
    }
    
    /**
     * Enable spherical constraints with optional configuration
     * @param {string} preset - Constraint preset name (optional)
     * @param {Vector3D} sphereCenter - Center of constraint sphere (optional)
     * @param {number} sphereRadius - Radius of constraint sphere (optional)
     */
    enableSphericalConstraints(preset = null, sphereCenter = null, sphereRadius = null) {
        this.config.enableSphericalConstraints = true;
        
        if (preset) {
            this.config.sphericalConstraintPreset = preset;
        }
        if (sphereCenter) {
            this.config.sphereCenter = sphereCenter.clone();
        }
        if (sphereRadius !== null) {
            this.config.sphereRadius = sphereRadius;
        }
        
        this.initializeSphericalConstraints();
    }
    
    /**
     * Disable spherical constraints
     */
    disableSphericalConstraints() {
        this.config.enableSphericalConstraints = false;
        this.sphericalConstraints = null;
    }
    
    /**
     * Update spherical constraint parameters
     * @param {Object} params - Parameters to update
     */
    updateSphericalConstraints(params) {
        if (!this.sphericalConstraints) return;
        
        if (params.center || params.radius) {
            this.sphericalConstraints.updateSphere(params.center, params.radius);
        }
        
        if (params.config) {
            this.sphericalConstraints.updateConfig(params.config);
        }
        
        if (params.preset) {
            const presetConfig = getConstraintPreset(params.preset);
            this.sphericalConstraints.updateConfig(presetConfig);
        }
    }
    
    /**
     * Project all boids onto the sphere surface
     * Useful for initializing boids on the sphere
     */
    projectBoidsToSphere() {
        if (!this.sphericalConstraints) return;
        
        for (const boid of this.boids) {
            const projectedPosition = this.sphericalConstraints.projectPoint(boid.position);
            boid.position.copy(projectedPosition);
            
            // Ensure velocity is tangent to sphere
            this.sphericalConstraints.updateBoid(boid);
        }
    }
    
    /**
     * Add boid and automatically project to sphere if constraints are enabled
     * @param {Vector3D} position - Initial position
     * @param {Vector3D} velocity - Initial velocity (optional)
     * @returns {Object} Created boid object
     */
    addBoidOnSphere(position, velocity = null) {
        const boid = this.addBoid(position, velocity);
        
        if (this.sphericalConstraints) {
            // Project position to sphere surface
            const projectedPosition = this.sphericalConstraints.projectPoint(boid.position);
            boid.position.copy(projectedPosition);
            
            // Ensure velocity is tangent to sphere
            this.sphericalConstraints.updateBoid(boid);
        }
        
        return boid;
    }
    
    /**
     * Add multiple boids randomly distributed on sphere surface
     * @param {number} count - Number of boids to add
     */
    addRandomBoidsOnSphere(count) {
        if (!this.sphericalConstraints) {
            console.warn('Spherical constraints not enabled. Using regular addRandomBoids.');
            this.addRandomBoids(count);
            return;
        }
        
        for (let i = 0; i < count; i++) {
            // Generate random point on sphere using spherical coordinates
            const theta = Math.random() * 2 * Math.PI; // Azimuthal angle
            const phi = Math.acos(2 * Math.random() - 1); // Polar angle (uniform distribution)
            
            const x = this.config.sphereRadius * Math.sin(phi) * Math.cos(theta);
            const y = this.config.sphereRadius * Math.sin(phi) * Math.sin(theta);
            const z = this.config.sphereRadius * Math.cos(phi);
            
            const position = Vector3D.add(this.config.sphereCenter, new Vector3D(x, y, z));
            
            // Generate random tangential velocity
            const randomVelocity = Vector3D.random(this.config.maxSpeed);
            
            this.addBoidOnSphere(position, randomVelocity);
        }
    }
    
    /**
     * Reset simulation
     */
    reset() {
        this.boids = [];
        this.obstacles = [];
        this.frameCount = 0;
        this.averageUpdateTime = 0;
        
        if (this.config.spatialOptimization) {
            this.initializeSpatialGrid();
        }
        
        if (this.config.enableSphericalConstraints) {
            this.initializeSphericalConstraints();
        }
    }

    /**
     * Get boid by ID
     * @param {number} id - Boid ID
     * @returns {Object|null} Boid object or null if not found
     */
    getBoidById(id) {
        return this.boids.find(boid => boid.id === id) || null;
    }

    /**
     * Remove boid by ID
     * @param {number} id - Boid ID to remove
     * @returns {boolean} True if boid was removed
     */
    removeBoid(id) {
        const index = this.boids.findIndex(boid => boid.id === id);
        if (index !== -1) {
            this.boids.splice(index, 1);
            return true;
        }
        return false;
    }
}