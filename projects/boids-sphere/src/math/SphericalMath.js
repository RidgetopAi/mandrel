/**
 * SphericalMath - Utilities for spherical surface mathematics
 * Provides essential mathematical operations for constraining boids to spherical surfaces
 */
import { Vector3D } from './Vector3D.js';

/**
 * Small epsilon value for floating point comparisons
 */
export const EPSILON = 1e-10;

/**
 * Pole threshold - points closer to poles than this will use special handling
 */
export const POLE_THRESHOLD = 0.9999;

/**
 * Project a 3D point onto a sphere surface
 * @param {Vector3D} point - Point to project
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @returns {Vector3D} Projected point on sphere surface
 */
export function projectToSphere(point, sphereCenter, sphereRadius) {
    // Calculate vector from sphere center to point
    const toPoint = Vector3D.subtract(point, sphereCenter);
    const distance = toPoint.magnitude();
    
    // Handle case where point is at sphere center
    if (distance < EPSILON) {
        // Return a default point on the sphere (along positive X axis)
        return Vector3D.add(sphereCenter, new Vector3D(sphereRadius, 0, 0));
    }
    
    // Normalize and scale to sphere radius
    toPoint.normalize().multiply(sphereRadius);
    
    // Return projected point
    return Vector3D.add(sphereCenter, toPoint);
}

/**
 * Calculate geodesic (great circle) distance between two points on a sphere
 * @param {Vector3D} point1 - First point on sphere
 * @param {Vector3D} point2 - Second point on sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @returns {number} Geodesic distance
 */
export function geodesicDistance(point1, point2, sphereRadius) {
    // Convert points to unit vectors from sphere center (assuming sphere is centered at origin)
    const v1 = point1.clone().normalize();
    const v2 = point2.clone().normalize();
    
    // Calculate dot product, clamped to valid range for acos
    let dotProduct = v1.dot(v2);
    dotProduct = Math.max(-1, Math.min(1, dotProduct));
    
    // Calculate angle between vectors
    const angle = Math.acos(dotProduct);
    
    // Return arc length
    return angle * sphereRadius;
}

/**
 * Convert spherical coordinates (theta, phi) to Cartesian coordinates
 * @param {number} theta - Azimuthal angle (0 to 2π)
 * @param {number} phi - Polar angle (0 to π)
 * @param {number} radius - Radius from origin
 * @returns {Vector3D} Cartesian coordinates
 */
export function sphericalToCartesian(theta, phi, radius) {
    const sinPhi = Math.sin(phi);
    const x = radius * sinPhi * Math.cos(theta);
    const y = radius * sinPhi * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    return new Vector3D(x, y, z);
}

/**
 * Convert Cartesian coordinates to spherical coordinates
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {Object} Object with {radius, theta, phi} properties
 */
export function cartesianToSpherical(x, y, z) {
    const radius = Math.sqrt(x * x + y * y + z * z);
    
    // Handle case where point is at origin
    if (radius < EPSILON) {
        return { radius: 0, theta: 0, phi: 0 };
    }
    
    const theta = Math.atan2(y, x);
    const phi = Math.acos(Math.max(-1, Math.min(1, z / radius)));
    
    return { radius, theta, phi };
}

/**
 * Get tangent vector at a point on the sphere surface
 * This creates a basis for the tangent plane at the given point
 * @param {Vector3D} point - Point on sphere surface
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @returns {Object} Object with {normal, tangent1, tangent2} basis vectors
 */
export function tangentVectorAt(point, sphereCenter, sphereRadius) {
    // Calculate normal vector (from center to point)
    const normal = Vector3D.subtract(point, sphereCenter).normalize();
    
    // Handle pole singularities
    const { tangent1, tangent2 } = handlePoleSingularities(normal, sphereRadius);
    
    return { normal, tangent1, tangent2 };
}

/**
 * Handle pole singularities when calculating tangent vectors
 * @param {Vector3D} normal - Normal vector at the point
 * @param {number} sphereRadius - Radius of the sphere (used for scaling)
 * @returns {Object} Object with {tangent1, tangent2} orthogonal tangent vectors
 */
export function handlePoleSingularities(normal, sphereRadius) {
    let tangent1, tangent2;
    
    // Check if we're near the north or south pole (high |z| value)
    if (Math.abs(normal.z) > POLE_THRESHOLD) {
        // Near poles: use X and Y axes as tangent references
        tangent1 = new Vector3D(1, 0, 0);
        tangent2 = new Vector3D(0, 1, 0);
    } else {
        // General case: create tangent vectors using cross products
        // First tangent vector: cross product with Z axis
        const up = new Vector3D(0, 0, 1);
        tangent1 = normal.cross(up).normalize();
        
        // Second tangent vector: cross product of normal and first tangent
        tangent2 = normal.cross(tangent1).normalize();
    }
    
    // Ensure tangent vectors are orthogonal to normal
    // Project out any component parallel to normal
    const dot1 = tangent1.dot(normal);
    const dot2 = tangent2.dot(normal);
    
    tangent1.subtract(Vector3D.multiply(normal, dot1)).normalize();
    tangent2.subtract(Vector3D.multiply(normal, dot2)).normalize();
    
    return { tangent1, tangent2 };
}

/**
 * Project a vector onto the tangent plane at a point on the sphere
 * @param {Vector3D} vector - Vector to project
 * @param {Vector3D} normal - Normal vector at the point on sphere
 * @returns {Vector3D} Projected vector in tangent plane
 */
export function projectToTangentPlane(vector, normal) {
    // Project out the component parallel to the normal
    const parallelComponent = Vector3D.multiply(normal, vector.dot(normal));
    return Vector3D.subtract(vector, parallelComponent);
}

/**
 * Calculate the shortest path (geodesic) direction from one point to another on a sphere
 * @param {Vector3D} from - Starting point on sphere
 * @param {Vector3D} to - Target point on sphere
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @returns {Vector3D} Direction vector in tangent plane at 'from' point
 */
export function geodesicDirection(from, to, sphereCenter) {
    // Get vectors from sphere center
    const fromCenter = Vector3D.subtract(from, sphereCenter).normalize();
    const toCenter = Vector3D.subtract(to, sphereCenter).normalize();
    
    // Calculate the great circle direction using cross product
    const axis = fromCenter.cross(toCenter);
    const axisLength = axis.magnitude();
    
    // Handle case where points are very close or antipodal
    if (axisLength < EPSILON) {
        // Points are the same or antipodal - return zero direction
        return new Vector3D(0, 0, 0);
    }
    
    axis.normalize();
    
    // The geodesic direction at 'from' is perpendicular to both 'from' and the rotation axis
    const direction = axis.cross(fromCenter).normalize();
    
    // Ensure direction points toward 'to' by checking dot product
    const toDirection = Vector3D.subtract(toCenter, fromCenter);
    if (direction.dot(toDirection) < 0) {
        direction.multiply(-1);
    }
    
    return direction;
}

/**
 * Interpolate between two points on a sphere using spherical linear interpolation (slerp)
 * @param {Vector3D} from - Starting point on sphere
 * @param {Vector3D} to - Target point on sphere
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @param {number} t - Interpolation parameter (0-1)
 * @returns {Vector3D} Interpolated point on sphere surface
 */
export function sphericalLerp(from, to, sphereCenter, sphereRadius, t) {
    // Convert to unit vectors from center
    const fromUnit = Vector3D.subtract(from, sphereCenter).normalize();
    const toUnit = Vector3D.subtract(to, sphereCenter).normalize();
    
    // Calculate angle between vectors
    let dotProduct = Math.max(-1, Math.min(1, fromUnit.dot(toUnit)));
    const angle = Math.acos(dotProduct);
    
    // Handle case where points are very close
    if (angle < EPSILON) {
        return from.clone();
    }
    
    // Spherical linear interpolation
    const sinAngle = Math.sin(angle);
    const weight1 = Math.sin((1 - t) * angle) / sinAngle;
    const weight2 = Math.sin(t * angle) / sinAngle;
    
    const interpolated = Vector3D.add(
        Vector3D.multiply(fromUnit, weight1),
        Vector3D.multiply(toUnit, weight2)
    ).normalize().multiply(sphereRadius);
    
    return Vector3D.add(sphereCenter, interpolated);
}

/**
 * Calculate the curvature-adjusted steering force for movement along a sphere
 * This accounts for the curved nature of the sphere surface
 * @param {Vector3D} position - Current position on sphere
 * @param {Vector3D} velocity - Current velocity (should be in tangent plane)
 * @param {Vector3D} desiredDirection - Desired movement direction
 * @param {Vector3D} sphereCenter - Center of the sphere
 * @param {number} sphereRadius - Radius of the sphere
 * @returns {Vector3D} Curvature-adjusted steering force
 */
export function sphericalSteering(position, velocity, desiredDirection, sphereCenter, sphereRadius) {
    // Get normal at current position
    const normal = Vector3D.subtract(position, sphereCenter).normalize();
    
    // Project desired direction onto tangent plane
    const tangentDesired = projectToTangentPlane(desiredDirection, normal);
    
    // Project current velocity onto tangent plane (should already be tangent, but ensure it)
    const tangentVelocity = projectToTangentPlane(velocity, normal);
    
    // Calculate steering force in tangent plane
    const steering = Vector3D.subtract(tangentDesired, tangentVelocity);
    
    // Add curvature compensation
    // The centripetal force needed to maintain motion on the sphere
    const speed = tangentVelocity.magnitude();
    if (speed > EPSILON) {
        const centripetalForce = Vector3D.multiply(normal, speed * speed / sphereRadius);
        // Note: In practice, this centripetal force is automatically handled by the constraint
        // system, so we primarily return the tangential steering component
    }
    
    return steering;
}