/**
 * BoidsRules - Core boids behavior algorithms
 * Implements the three fundamental boids rules: separation, alignment, and cohesion
 */
import { Vector3D } from './Vector3D.js';

/**
 * Separation behavior - steer to avoid crowding local neighbors
 * Creates a steering force that moves the boid away from nearby neighbors
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Array} neighbors - Array of nearby boids within perception radius
 * @param {number} separationDistance - Minimum distance to maintain from neighbors
 * @returns {Vector3D} Separation steering force
 */
export function separation(boid, neighbors, separationDistance) {
    const steer = new Vector3D();
    let count = 0;

    // Calculate steering force for each neighbor within separation distance
    for (const neighbor of neighbors) {
        const distance = boid.position.distanceTo(neighbor.position);
        
        // Only consider neighbors that are too close
        if (distance > 0 && distance < separationDistance) {
            // Calculate difference vector (away from neighbor)
            const diff = Vector3D.subtract(boid.position, neighbor.position);
            
            // Weight by distance - closer neighbors have stronger influence
            diff.normalize();
            diff.divide(distance); // Weight by distance
            
            steer.add(diff);
            count++;
        }
    }

    // Average the steering force
    if (count > 0) {
        steer.divide(count);
        
        // Implement Reynolds steering formula: desired - velocity
        steer.normalize();
        steer.multiply(boid.maxSpeed);
        steer.subtract(boid.velocity);
        steer.limit(boid.maxForce);
    }

    return steer;
}

/**
 * Alignment behavior - steer towards the average heading of neighbors
 * Creates a steering force that aligns the boid's velocity with nearby neighbors
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Array} neighbors - Array of nearby boids within perception radius
 * @returns {Vector3D} Alignment steering force
 */
export function alignment(boid, neighbors) {
    const sum = new Vector3D();
    let count = 0;

    // Sum up all neighbor velocities
    for (const neighbor of neighbors) {
        const distance = boid.position.distanceTo(neighbor.position);
        
        // Only consider actual neighbors (not self)
        if (distance > 0) {
            sum.add(neighbor.velocity);
            count++;
        }
    }

    if (count > 0) {
        // Calculate average velocity
        sum.divide(count);
        
        // Implement Reynolds steering formula: desired - velocity
        sum.normalize();
        sum.multiply(boid.maxSpeed);
        sum.subtract(boid.velocity);
        sum.limit(boid.maxForce);
        
        return sum;
    }

    return new Vector3D(); // No steering if no neighbors
}

/**
 * Cohesion behavior - steer towards the average position of neighbors
 * Creates a steering force that moves the boid towards the center of mass of nearby neighbors
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Array} neighbors - Array of nearby boids within perception radius
 * @returns {Vector3D} Cohesion steering force
 */
export function cohesion(boid, neighbors) {
    const sum = new Vector3D();
    let count = 0;

    // Sum up all neighbor positions
    for (const neighbor of neighbors) {
        const distance = boid.position.distanceTo(neighbor.position);
        
        // Only consider actual neighbors (not self)
        if (distance > 0) {
            sum.add(neighbor.position);
            count++;
        }
    }

    if (count > 0) {
        // Calculate center of mass
        sum.divide(count);
        
        // Seek towards center of mass
        return seek(boid, sum);
    }

    return new Vector3D(); // No steering if no neighbors
}

/**
 * Seek behavior - steer towards a target position
 * Helper function used by cohesion and other behaviors
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Vector3D} target - Target position to seek towards
 * @returns {Vector3D} Seek steering force
 */
export function seek(boid, target) {
    // Calculate desired velocity
    const desired = Vector3D.subtract(target, boid.position);
    desired.normalize();
    desired.multiply(boid.maxSpeed);
    
    // Calculate steering force: desired - velocity
    const steer = Vector3D.subtract(desired, boid.velocity);
    steer.limit(boid.maxForce);
    
    return steer;
}

/**
 * Flee behavior - steer away from a target position
 * Opposite of seek behavior, useful for predator avoidance
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Vector3D} target - Target position to flee from
 * @returns {Vector3D} Flee steering force
 */
export function flee(boid, target) {
    // Calculate desired velocity (opposite direction from seek)
    const desired = Vector3D.subtract(boid.position, target);
    desired.normalize();
    desired.multiply(boid.maxSpeed);
    
    // Calculate steering force: desired - velocity
    const steer = Vector3D.subtract(desired, boid.velocity);
    steer.limit(boid.maxForce);
    
    return steer;
}

/**
 * Calculate neighbors within a given radius
 * Helper function to find nearby boids for behavior calculations
 * 
 * @param {Object} boid - Current boid with position
 * @param {Array} allBoids - Array of all boids in the simulation
 * @param {number} radius - Perception radius for neighbor detection
 * @returns {Array} Array of neighboring boids within radius
 */
export function getNeighbors(boid, allBoids, radius) {
    const neighbors = [];
    const radiusSquared = radius * radius; // Optimization: avoid sqrt in distance calculation
    
    for (const otherBoid of allBoids) {
        if (otherBoid !== boid) { // Don't include self
            const distanceSquared = boid.position.distanceToSquared(otherBoid.position);
            
            if (distanceSquared < radiusSquared) {
                neighbors.push(otherBoid);
            }
        }
    }
    
    return neighbors;
}

/**
 * Apply boundary conditions to keep boids within a spherical space
 * Creates a steering force to keep boids within a defined boundary
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Vector3D} center - Center of the boundary sphere
 * @param {number} radius - Radius of the boundary sphere
 * @param {number} strength - Strength of the boundary force (default: 1.0)
 * @returns {Vector3D} Boundary steering force
 */
export function sphericalBoundary(boid, center, radius, strength = 1.0) {
    const distance = boid.position.distanceTo(center);
    
    if (distance > radius) {
        // Boid is outside boundary, steer back towards center
        const desired = Vector3D.subtract(center, boid.position);
        desired.normalize();
        desired.multiply(boid.maxSpeed);
        
        const steer = Vector3D.subtract(desired, boid.velocity);
        steer.limit(boid.maxForce * strength);
        
        return steer;
    }
    
    return new Vector3D(); // No force needed if within boundary
}

/**
 * Apply wander behavior - random steering for more natural movement
 * Creates subtle random steering forces to add natural variation
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {number} wanderStrength - Strength of the wander force (default: 0.1)
 * @returns {Vector3D} Wander steering force
 */
export function wander(boid, wanderStrength = 0.1) {
    // Create random steering force
    const steer = Vector3D.random(1);
    steer.multiply(boid.maxForce * wanderStrength);
    
    return steer;
}

/**
 * Apply obstacle avoidance behavior
 * Creates steering force to avoid collisions with obstacles
 * 
 * @param {Object} boid - Current boid with position, velocity, maxSpeed, maxForce
 * @param {Array} obstacles - Array of obstacle objects with position and radius
 * @param {number} avoidDistance - Distance at which to start avoiding obstacles
 * @returns {Vector3D} Obstacle avoidance steering force
 */
export function avoidObstacles(boid, obstacles, avoidDistance) {
    const steer = new Vector3D();
    
    for (const obstacle of obstacles) {
        const distance = boid.position.distanceTo(obstacle.position);
        const minDistance = obstacle.radius + avoidDistance;
        
        if (distance < minDistance && distance > 0) {
            // Calculate avoidance force
            const avoidForce = Vector3D.subtract(boid.position, obstacle.position);
            avoidForce.normalize();
            
            // Weight by proximity - closer obstacles have stronger influence
            const weight = (minDistance - distance) / minDistance;
            avoidForce.multiply(boid.maxForce * weight);
            
            steer.add(avoidForce);
        }
    }
    
    steer.limit(boid.maxForce);
    return steer;
}