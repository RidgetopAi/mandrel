/**
 * SphericalConstraints - Constraint system for keeping boids on spherical surfaces
 * Provides forces and corrections to maintain boids on sphere surfaces while preserving natural movement
 */
import { Vector3D } from './Vector3D.js';
import { 
    projectToSphere, 
    projectToTangentPlane, 
    geodesicDirection,
    tangentVectorAt,
    EPSILON 
} from './SphericalMath.js';

/**
 * Default constraint configuration
 */
export const CONSTRAINT_CONFIG = {
    positionCorrectionStrength: 0.1,    // How quickly to correct position drift
    velocityProjectionStrength: 1.0,     // How strongly to project velocity to tangent plane
    boundaryForceStrength: 2.0,          // Strength of boundary enforcement
    geodesicSteeringStrength: 1.0,       // Strength of geodesic path following
    maxCorrectionDistance: 1.0,          // Maximum distance for position correction per frame
    dampingFactor: 0.95                  // Velocity damping when correcting position
};

/**
 * Constrain a boid to stay on the sphere surface
 * This function corrects both position and velocity to maintain surface constraint
 * @param {Object} boid - Boid object with position, velocity, acceleration properties
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {Object} config - Configuration options (optional)
 * @returns {Object} Information about applied corrections
 */
export function constrainToSphere(boid, sphereCenter, sphereRadius, config = CONSTRAINT_CONFIG) {
    const corrections = {
        positionCorrected: false,
        velocityProjected: false,
        correctionMagnitude: 0
    };
    
    // Calculate distance from sphere center
    const toCenter = Vector3D.subtract(boid.position, sphereCenter);
    const distanceFromCenter = toCenter.magnitude();
    
    // Check if position correction is needed
    const distanceFromSurface = Math.abs(distanceFromCenter - sphereRadius);
    
    if (distanceFromSurface > EPSILON) {
        // Project position onto sphere surface
        const correctedPosition = projectToSphere(boid.position, sphereCenter, sphereRadius);
        
        // Calculate correction vector
        const correction = Vector3D.subtract(correctedPosition, boid.position);
        const correctionMagnitude = correction.magnitude();
        
        // Limit correction magnitude to prevent large jumps
        if (correctionMagnitude > config.maxCorrectionDistance) {
            correction.normalize().multiply(config.maxCorrectionDistance);
        }
        
        // Apply position correction gradually
        const appliedCorrection = Vector3D.multiply(correction, config.positionCorrectionStrength);
        boid.position.add(appliedCorrection);
        
        // Damp velocity when applying large corrections to maintain stability
        if (correctionMagnitude > config.maxCorrectionDistance * 0.5) {
            boid.velocity.multiply(config.dampingFactor);
        }
        
        corrections.positionCorrected = true;
        corrections.correctionMagnitude = correctionMagnitude;
    }
    
    // Always project velocity to tangent plane
    constrainVelocityToSphere(boid, sphereCenter, sphereRadius, config);
    corrections.velocityProjected = true;
    
    return corrections;
}

/**
 * Constrain boid velocity to the tangent plane of the sphere
 * This ensures velocity is always tangent to the sphere surface
 * @param {Object} boid - Boid object with position and velocity
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {Object} config - Configuration options (optional)
 * @returns {Vector3D} The projected velocity vector
 */
export function constrainVelocityToSphere(boid, sphereCenter, sphereRadius, config = CONSTRAINT_CONFIG) {
    // Calculate normal vector at boid's position
    const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
    
    // Project velocity onto tangent plane
    const projectedVelocity = projectToTangentPlane(boid.velocity, normal);
    
    // Apply velocity projection with configurable strength
    const velocityDifference = Vector3D.subtract(projectedVelocity, boid.velocity);
    const correction = Vector3D.multiply(velocityDifference, config.velocityProjectionStrength);
    boid.velocity.add(correction);
    
    return boid.velocity;
}

/**
 * Calculate geodesic steering force for natural movement along sphere surface
 * This provides steering toward a target while following the sphere's curvature
 * @param {Vector3D} from - Starting position on sphere
 * @param {Vector3D} to - Target position on sphere
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {Object} config - Configuration options (optional)
 * @returns {Vector3D} Steering force along geodesic path
 */
export function geodesicSteering(from, to, sphereCenter, sphereRadius, config = CONSTRAINT_CONFIG) {
    // Get geodesic direction from current position to target
    const direction = geodesicDirection(from, to, sphereCenter);
    
    // Apply steering strength
    return Vector3D.multiply(direction, config.geodesicSteeringStrength);
}

/**
 * Apply boundary enforcement force to keep boids within spherical bounds
 * This creates a repulsive force when boids get too close to the boundary
 * @param {Object} boid - Boid object
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {number} strength - Force strength multiplier
 * @param {number} threshold - Distance from boundary to start applying force (default: 10% of radius)
 * @returns {Vector3D} Boundary enforcement force
 */
export function sphericalBoundaryForce(boid, sphereCenter, sphereRadius, strength, threshold = sphereRadius * 0.1) {
    const force = new Vector3D(0, 0, 0);
    
    // Calculate distance from sphere center
    const toCenter = Vector3D.subtract(boid.position, sphereCenter);
    const distanceFromCenter = toCenter.magnitude();
    
    // Check if we need to apply boundary force
    const distanceFromBoundary = sphereRadius - distanceFromCenter;
    
    if (distanceFromBoundary < threshold) {
        // Calculate force direction (toward center for outer boundary)
        const forceDirection = toCenter.clone().normalize().multiply(-1);
        
        // Calculate force magnitude based on proximity to boundary
        const forceMagnitude = (threshold - distanceFromBoundary) / threshold;
        
        // Apply exponential falloff for smoother force transition
        const smoothedMagnitude = Math.pow(forceMagnitude, 2) * strength;
        
        force.copy(forceDirection).multiply(smoothedMagnitude);
    }
    
    return force;
}

/**
 * Apply comprehensive spherical constraints to a boid
 * This combines position correction, velocity projection, and boundary forces
 * @param {Object} boid - Boid object
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {Object} options - Configuration options
 * @returns {Object} Applied forces and corrections information
 */
export function applySphericalConstraints(boid, sphereCenter, sphereRadius, options = {}) {
    const config = { ...CONSTRAINT_CONFIG, ...options };
    
    // Apply surface constraint
    const surfaceCorrection = constrainToSphere(boid, sphereCenter, sphereRadius, config);
    
    // Apply boundary force if enabled
    let boundaryForce = new Vector3D(0, 0, 0);
    if (config.boundaryForceStrength > 0) {
        boundaryForce = sphericalBoundaryForce(
            boid, 
            sphereCenter, 
            sphereRadius, 
            config.boundaryForceStrength
        );
        boid.acceleration.add(boundaryForce);
    }
    
    return {
        surfaceCorrection,
        boundaryForce,
        config
    };
}

/**
 * Create a spherical constraint system that can be applied to multiple boids
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {Object} options - Configuration options
 * @returns {Object} Constraint system with update methods
 */
export function createSphericalConstraintSystem(sphereCenter, sphereRadius, options = {}) {
    const config = { ...CONSTRAINT_CONFIG, ...options };
    
    return {
        center: sphereCenter.clone(),
        radius: sphereRadius,
        config: { ...config },
        
        /**
         * Update constraints for a single boid
         * @param {Object} boid - Boid to constrain
         * @returns {Object} Applied constraint information
         */
        updateBoid(boid) {
            return applySphericalConstraints(boid, this.center, this.radius, this.config);
        },
        
        /**
         * Update constraints for multiple boids
         * @param {Array} boids - Array of boids to constrain
         * @returns {Array} Array of constraint information for each boid
         */
        updateBoids(boids) {
            return boids.map(boid => this.updateBoid(boid));
        },
        
        /**
         * Update the sphere parameters
         * @param {Vector3D} newCenter - New sphere center (optional)
         * @param {number} newRadius - New sphere radius (optional)
         */
        updateSphere(newCenter, newRadius) {
            if (newCenter) {
                this.center.copy(newCenter);
            }
            if (newRadius !== undefined) {
                this.radius = newRadius;
            }
        },
        
        /**
         * Update configuration
         * @param {Object} newConfig - New configuration options
         */
        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
        },
        
        /**
         * Get geodesic steering force for a boid toward a target
         * @param {Object} boid - Boid object
         * @param {Vector3D} target - Target position
         * @returns {Vector3D} Steering force
         */
        getGeodesicSteering(boid, target) {
            return geodesicSteering(boid.position, target, this.center, this.radius, this.config);
        },
        
        /**
         * Project a point onto the sphere surface
         * @param {Vector3D} point - Point to project
         * @returns {Vector3D} Projected point
         */
        projectPoint(point) {
            return projectToSphere(point, this.center, this.radius);
        },
        
        /**
         * Get constraint system statistics
         * @returns {Object} Statistics about the constraint system
         */
        getStats() {
            return {
                center: this.center.clone(),
                radius: this.radius,
                config: { ...this.config },
                surfaceArea: 4 * Math.PI * this.radius * this.radius,
                volume: (4/3) * Math.PI * Math.pow(this.radius, 3)
            };
        }
    };
}

/**
 * Helper function to create constraint presets for common scenarios
 * @param {string} preset - Preset name ('strict', 'loose', 'natural', 'boundary-only')
 * @returns {Object} Configuration object for the preset
 */
export function getConstraintPreset(preset) {
    const presets = {
        'strict': {
            positionCorrectionStrength: 0.3,
            velocityProjectionStrength: 1.0,
            boundaryForceStrength: 3.0,
            maxCorrectionDistance: 0.5,
            dampingFactor: 0.9
        },
        'loose': {
            positionCorrectionStrength: 0.05,
            velocityProjectionStrength: 0.7,
            boundaryForceStrength: 1.0,
            maxCorrectionDistance: 2.0,
            dampingFactor: 0.98
        },
        'natural': {
            positionCorrectionStrength: 0.1,
            velocityProjectionStrength: 0.9,
            boundaryForceStrength: 1.5,
            maxCorrectionDistance: 1.0,
            dampingFactor: 0.95
        },
        'boundary-only': {
            positionCorrectionStrength: 0.01,
            velocityProjectionStrength: 0.1,
            boundaryForceStrength: 4.0,
            maxCorrectionDistance: 5.0,
            dampingFactor: 1.0
        }
    };
    
    return presets[preset] || presets['natural'];
}