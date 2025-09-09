/**
 * Comprehensive unit tests for SphericalMath
 * Tests spherical projections, geodesic calculations, coordinate conversions, and tangent operations
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';
import {
    projectToSphere,
    geodesicDistance,
    sphericalToCartesian,
    cartesianToSpherical,
    tangentVectorAt,
    handlePoleSingularities,
    projectToTangentPlane,
    geodesicDirection,
    sphericalLerp,
    sphericalSteering,
    EPSILON,
    POLE_THRESHOLD
} from '../math/SphericalMath.js';

/**
 * Helper function to check vector equality within tolerance
 */
function expectVectorEqual(v1, v2, tolerance = 1e-6) {
    expect(Math.abs(v1.x - v2.x)).toBeLessThan(tolerance);
    expect(Math.abs(v1.y - v2.y)).toBeLessThan(tolerance);
    expect(Math.abs(v1.z - v2.z)).toBeLessThan(tolerance);
}

/**
 * Helper function to check scalar equality within tolerance
 */
function expectFloatEqual(a, b, tolerance = 1e-6) {
    expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

describe('SphericalMath', () => {
    let sphereCenter, sphereRadius;

    beforeEach(() => {
        sphereCenter = new Vector3D(0, 0, 0);
        sphereRadius = 10.0;
    });

    describe('Constants', () => {
        it('should have appropriate epsilon value', () => {
            expect(EPSILON).toBe(1e-10);
            expect(EPSILON).toBeGreaterThan(0);
            expect(EPSILON).toBeLessThan(1e-6);
        });

        it('should have appropriate pole threshold', () => {
            expect(POLE_THRESHOLD).toBe(0.9999);
            expect(POLE_THRESHOLD).toBeLessThan(1.0);
            expect(POLE_THRESHOLD).toBeGreaterThan(0.99);
        });
    });

    describe('projectToSphere', () => {
        it('should project point on sphere surface correctly', () => {
            const point = new Vector3D(5, 0, 0); // Already on sphere surface (r=5)
            const projected = projectToSphere(point, new Vector3D(0, 0, 0), 5);
            
            expectVectorEqual(projected, new Vector3D(5, 0, 0));
            expectFloatEqual(projected.magnitude(), 5);
        });

        it('should project point inside sphere outward', () => {
            const point = new Vector3D(3, 4, 0); // Inside sphere, distance = 5
            const projected = projectToSphere(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius);
            
            // Should maintain direction
            const originalDirection = point.clone().normalize();
            const projectedDirection = projected.clone().normalize();
            expectVectorEqual(originalDirection, projectedDirection);
        });

        it('should project point outside sphere inward', () => {
            const point = new Vector3D(20, 0, 0); // Outside sphere
            const projected = projectToSphere(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius);
            expectVectorEqual(projected, new Vector3D(sphereRadius, 0, 0));
        });

        it('should handle point at sphere center', () => {
            const point = new Vector3D(0, 0, 0);
            const projected = projectToSphere(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius);
            expectVectorEqual(projected, new Vector3D(sphereRadius, 0, 0)); // Default direction
        });

        it('should handle non-centered sphere', () => {
            const center = new Vector3D(5, 5, 5);
            const point = new Vector3D(5, 5, 10); // Along Z axis from center
            const projected = projectToSphere(point, center, 3);
            
            expectFloatEqual(projected.distanceTo(center), 3);
            expectVectorEqual(projected, new Vector3D(5, 5, 8));
        });

        it('should handle very small distances from center', () => {
            const point = new Vector3D(EPSILON / 2, 0, 0);
            const projected = projectToSphere(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius);
            expectVectorEqual(projected, new Vector3D(sphereRadius, 0, 0));
        });

        it('should handle negative coordinates', () => {
            const point = new Vector3D(-6, -8, 0);
            const projected = projectToSphere(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius);
            
            // Should maintain direction
            const expectedDirection = point.clone().normalize().multiply(sphereRadius);
            expectVectorEqual(projected, expectedDirection);
        });

        it('should be idempotent for points already on sphere', () => {
            const point = new Vector3D(6, 8, 0); // Distance = 10, already on sphere
            const projected1 = projectToSphere(point, sphereCenter, sphereRadius);
            const projected2 = projectToSphere(projected1, sphereCenter, sphereRadius);
            
            expectVectorEqual(projected1, projected2, 1e-10);
        });
    });

    describe('geodesicDistance', () => {
        it('should calculate distance between identical points', () => {
            const point = new Vector3D(sphereRadius, 0, 0);
            const distance = geodesicDistance(point, point, sphereRadius);
            
            expectFloatEqual(distance, 0);
        });

        it('should calculate quarter circle distance', () => {
            const point1 = new Vector3D(sphereRadius, 0, 0);
            const point2 = new Vector3D(0, sphereRadius, 0);
            const distance = geodesicDistance(point1, point2, sphereRadius);
            
            expectFloatEqual(distance, Math.PI * sphereRadius / 2);
        });

        it('should calculate half circle distance', () => {
            const point1 = new Vector3D(sphereRadius, 0, 0);
            const point2 = new Vector3D(-sphereRadius, 0, 0);
            const distance = geodesicDistance(point1, point2, sphereRadius);
            
            expectFloatEqual(distance, Math.PI * sphereRadius);
        });

        it('should calculate antipodal distance', () => {
            const north = new Vector3D(0, 0, sphereRadius);
            const south = new Vector3D(0, 0, -sphereRadius);
            const distance = geodesicDistance(north, south, sphereRadius);
            
            expectFloatEqual(distance, Math.PI * sphereRadius);
        });

        it('should handle arbitrary points on sphere', () => {
            const point1 = new Vector3D(6, 8, 0);
            const point2 = new Vector3D(8, 6, 0);
            
            const distance = geodesicDistance(point1, point2, sphereRadius);
            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThanOrEqual(Math.PI * sphereRadius);
        });

        it('should be symmetric', () => {
            const point1 = new Vector3D(6, 8, 0);
            const point2 = new Vector3D(0, 10, 0);
            
            const dist12 = geodesicDistance(point1, point2, sphereRadius);
            const dist21 = geodesicDistance(point2, point1, sphereRadius);
            
            expectFloatEqual(dist12, dist21);
        });

        it('should handle very close points', () => {
            const point1 = new Vector3D(sphereRadius, 0, 0);
            const point2 = new Vector3D(sphereRadius - 0.001, 0.001, 0);
            const normalizedPoint2 = projectToSphere(point2, sphereCenter, sphereRadius);
            
            const distance = geodesicDistance(point1, normalizedPoint2, sphereRadius);
            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThan(0.1);
        });

        it('should handle points not perfectly on sphere', () => {
            const point1 = new Vector3D(9.99, 0, 0);
            const point2 = new Vector3D(0, 10.01, 0);
            
            const distance = geodesicDistance(point1, point2, sphereRadius);
            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeLessThanOrEqual(Math.PI * sphereRadius + 1);
        });
    });

    describe('sphericalToCartesian', () => {
        it('should convert basic spherical coordinates', () => {
            const theta = 0; // Azimuth
            const phi = Math.PI / 2; // Polar (equator)
            const result = sphericalToCartesian(theta, phi, sphereRadius);
            
            expectVectorEqual(result, new Vector3D(sphereRadius, 0, 0), 1e-10);
        });

        it('should convert north pole', () => {
            const theta = 0;
            const phi = 0;
            const result = sphericalToCartesian(theta, phi, sphereRadius);
            
            expectVectorEqual(result, new Vector3D(0, 0, sphereRadius), 1e-10);
        });

        it('should convert south pole', () => {
            const theta = 0;
            const phi = Math.PI;
            const result = sphericalToCartesian(theta, phi, sphereRadius);
            
            expectVectorEqual(result, new Vector3D(0, 0, -sphereRadius), 1e-10);
        });

        it('should convert 45-degree angles', () => {
            const theta = Math.PI / 4;
            const phi = Math.PI / 2;
            const result = sphericalToCartesian(theta, phi, sphereRadius);
            
            const expected = new Vector3D(
                sphereRadius * Math.cos(Math.PI / 4),
                sphereRadius * Math.sin(Math.PI / 4),
                0
            );
            expectVectorEqual(result, expected, 1e-10);
        });

        it('should handle various radii', () => {
            const theta = Math.PI / 3;
            const phi = Math.PI / 3;
            
            const result1 = sphericalToCartesian(theta, phi, 1);
            const result5 = sphericalToCartesian(theta, phi, 5);
            
            expectVectorEqual(result5, Vector3D.multiply(result1, 5), 1e-10);
        });

        it('should maintain radius', () => {
            const theta = Math.PI / 6;
            const phi = 2 * Math.PI / 3;
            const result = sphericalToCartesian(theta, phi, sphereRadius);
            
            expectFloatEqual(result.magnitude(), sphereRadius, 1e-10);
        });

        it('should handle zero radius', () => {
            const result = sphericalToCartesian(Math.PI / 4, Math.PI / 4, 0);
            expectVectorEqual(result, new Vector3D(0, 0, 0));
        });

        it('should handle full rotation in theta', () => {
            const phi = Math.PI / 2;
            const result0 = sphericalToCartesian(0, phi, sphereRadius);
            const result2Pi = sphericalToCartesian(2 * Math.PI, phi, sphereRadius);
            
            expectVectorEqual(result0, result2Pi, 1e-10);
        });
    });

    describe('cartesianToSpherical', () => {
        it('should convert basic cartesian coordinates', () => {
            const result = cartesianToSpherical(sphereRadius, 0, 0);
            
            expectFloatEqual(result.radius, sphereRadius);
            expectFloatEqual(result.theta, 0, 1e-10);
            expectFloatEqual(result.phi, Math.PI / 2, 1e-10);
        });

        it('should convert north pole', () => {
            const result = cartesianToSpherical(0, 0, sphereRadius);
            
            expectFloatEqual(result.radius, sphereRadius);
            expectFloatEqual(result.phi, 0, 1e-10);
        });

        it('should convert south pole', () => {
            const result = cartesianToSpherical(0, 0, -sphereRadius);
            
            expectFloatEqual(result.radius, sphereRadius);
            expectFloatEqual(result.phi, Math.PI, 1e-10);
        });

        it('should handle origin', () => {
            const result = cartesianToSpherical(0, 0, 0);
            
            expectFloatEqual(result.radius, 0);
            expectFloatEqual(result.theta, 0);
            expectFloatEqual(result.phi, 0);
        });

        it('should be inverse of sphericalToCartesian', () => {
            const theta = Math.PI / 3;
            const phi = Math.PI / 4;
            const radius = 7.5;
            
            const cartesian = sphericalToCartesian(theta, phi, radius);
            const spherical = cartesianToSpherical(cartesian.x, cartesian.y, cartesian.z);
            
            expectFloatEqual(spherical.radius, radius, 1e-10);
            expectFloatEqual(spherical.theta, theta, 1e-10);
            expectFloatEqual(spherical.phi, phi, 1e-10);
        });

        it('should handle negative coordinates', () => {
            const result = cartesianToSpherical(-sphereRadius, 0, 0);
            
            expectFloatEqual(result.radius, sphereRadius);
            expectFloatEqual(Math.abs(result.theta), Math.PI, 1e-10);
            expectFloatEqual(result.phi, Math.PI / 2, 1e-10);
        });

        it('should handle all quadrants', () => {
            const testPoints = [
                [1, 1, 0],   // First quadrant
                [-1, 1, 0],  // Second quadrant
                [-1, -1, 0], // Third quadrant
                [1, -1, 0]   // Fourth quadrant
            ];
            
            for (const [x, y, z] of testPoints) {
                const result = cartesianToSpherical(x, y, z);
                expect(result.radius).toBeGreaterThan(0);
                expect(result.theta).toBeGreaterThanOrEqual(-Math.PI);
                expect(result.theta).toBeLessThanOrEqual(Math.PI);
                expect(result.phi).toBeGreaterThanOrEqual(0);
                expect(result.phi).toBeLessThanOrEqual(Math.PI);
            }
        });
    });

    describe('tangentVectorAt', () => {
        it('should create orthogonal tangent vectors', () => {
            const point = new Vector3D(sphereRadius, 0, 0);
            const basis = tangentVectorAt(point, sphereCenter, sphereRadius);
            
            // Check that all vectors are unit length
            expectFloatEqual(basis.normal.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent1.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent2.magnitude(), 1, 1e-10);
            
            // Check orthogonality
            expectFloatEqual(basis.normal.dot(basis.tangent1), 0, 1e-10);
            expectFloatEqual(basis.normal.dot(basis.tangent2), 0, 1e-10);
            expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
        });

        it('should have normal pointing away from center', () => {
            const point = new Vector3D(5, 5, 0);
            const basis = tangentVectorAt(point, sphereCenter, sphereRadius);
            
            const expectedNormal = Vector3D.subtract(point, sphereCenter).normalize();
            expectVectorEqual(basis.normal, expectedNormal, 1e-10);
        });

        it('should handle points on coordinate axes', () => {
            const testPoints = [
                new Vector3D(sphereRadius, 0, 0),
                new Vector3D(0, sphereRadius, 0),
                new Vector3D(0, 0, sphereRadius),
                new Vector3D(-sphereRadius, 0, 0),
                new Vector3D(0, -sphereRadius, 0),
                new Vector3D(0, 0, -sphereRadius)
            ];
            
            for (const point of testPoints) {
                const basis = tangentVectorAt(point, sphereCenter, sphereRadius);
                
                // Check orthogonality for all points
                expectFloatEqual(basis.normal.dot(basis.tangent1), 0, 1e-10);
                expectFloatEqual(basis.normal.dot(basis.tangent2), 0, 1e-10);
                expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
            }
        });

        it('should handle arbitrary points', () => {
            const point = new Vector3D(6, 8, 0);
            const basis = tangentVectorAt(point, sphereCenter, sphereRadius);
            
            expectFloatEqual(basis.normal.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent1.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent2.magnitude(), 1, 1e-10);
            
            expectFloatEqual(basis.normal.dot(basis.tangent1), 0, 1e-10);
            expectFloatEqual(basis.normal.dot(basis.tangent2), 0, 1e-10);
            expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(10, 10, 10);
            const point = new Vector3D(15, 10, 10);
            const basis = tangentVectorAt(point, center, 5);
            
            const expectedNormal = Vector3D.subtract(point, center).normalize();
            expectVectorEqual(basis.normal, expectedNormal, 1e-10);
        });
    });

    describe('handlePoleSingularities', () => {
        it('should handle north pole singularity', () => {
            const northPole = new Vector3D(0, 0, 1); // Normalized
            const basis = handlePoleSingularities(northPole, sphereRadius);
            
            expectFloatEqual(basis.tangent1.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent2.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
            expectFloatEqual(basis.tangent1.dot(northPole), 0, 1e-10);
            expectFloatEqual(basis.tangent2.dot(northPole), 0, 1e-10);
        });

        it('should handle south pole singularity', () => {
            const southPole = new Vector3D(0, 0, -1); // Normalized
            const basis = handlePoleSingularities(southPole, sphereRadius);
            
            expectFloatEqual(basis.tangent1.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent2.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
            expectFloatEqual(basis.tangent1.dot(southPole), 0, 1e-10);
            expectFloatEqual(basis.tangent2.dot(southPole), 0, 1e-10);
        });

        it('should use general case for non-pole points', () => {
            const equatorial = new Vector3D(1, 0, 0); // Normalized
            const basis = handlePoleSingularities(equatorial, sphereRadius);
            
            expectFloatEqual(basis.tangent1.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent2.magnitude(), 1, 1e-10);
            expectFloatEqual(basis.tangent1.dot(basis.tangent2), 0, 1e-10);
            expectFloatEqual(basis.tangent1.dot(equatorial), 0, 1e-10);
            expectFloatEqual(basis.tangent2.dot(equatorial), 0, 1e-10);
        });

        it('should distinguish between pole and non-pole based on threshold', () => {
            const nearPole = new Vector3D(0, 0, POLE_THRESHOLD + 0.0001);
            const notPole = new Vector3D(0, 0, POLE_THRESHOLD - 0.0001);
            
            const nearPoleBasis = handlePoleSingularities(nearPole, sphereRadius);
            const notPoleBasis = handlePoleSingularities(notPole, sphereRadius);
            
            // Both should produce valid orthogonal bases, but computed differently
            expect(nearPoleBasis.tangent1).toBeDefined();
            expect(nearPoleBasis.tangent2).toBeDefined();
            expect(notPoleBasis.tangent1).toBeDefined();
            expect(notPoleBasis.tangent2).toBeDefined();
        });
    });

    describe('projectToTangentPlane', () => {
        it('should project vector onto tangent plane', () => {
            const normal = new Vector3D(0, 0, 1);
            const vector = new Vector3D(1, 1, 1);
            
            const projected = projectToTangentPlane(vector, normal);
            
            expectVectorEqual(projected, new Vector3D(1, 1, 0));
            expectFloatEqual(projected.dot(normal), 0, 1e-10);
        });

        it('should leave tangent vectors unchanged', () => {
            const normal = new Vector3D(1, 0, 0);
            const tangent = new Vector3D(0, 1, 0);
            
            const projected = projectToTangentPlane(tangent, normal);
            expectVectorEqual(projected, tangent);
        });

        it('should handle vector parallel to normal', () => {
            const normal = new Vector3D(0, 1, 0);
            const parallel = new Vector3D(0, 5, 0);
            
            const projected = projectToTangentPlane(parallel, normal);
            expectVectorEqual(projected, new Vector3D(0, 0, 0));
        });

        it('should handle zero vector', () => {
            const normal = new Vector3D(0, 0, 1);
            const zero = new Vector3D(0, 0, 0);
            
            const projected = projectToTangentPlane(zero, normal);
            expectVectorEqual(projected, new Vector3D(0, 0, 0));
        });

        it('should be idempotent for vectors already in tangent plane', () => {
            const normal = new Vector3D(1, 0, 0);
            const tangent = new Vector3D(0, 3, 4);
            
            const projected1 = projectToTangentPlane(tangent, normal);
            const projected2 = projectToTangentPlane(projected1, normal);
            
            expectVectorEqual(projected1, projected2, 1e-10);
        });

        it('should handle arbitrary normal vectors', () => {
            const normal = new Vector3D(1, 1, 1).normalize();
            const vector = new Vector3D(2, 3, 4);
            
            const projected = projectToTangentPlane(vector, normal);
            expectFloatEqual(projected.dot(normal), 0, 1e-10);
        });
    });

    describe('geodesicDirection', () => {
        it('should return zero for identical points', () => {
            const point = new Vector3D(sphereRadius, 0, 0);
            const direction = geodesicDirection(point, point, sphereCenter);
            
            expectVectorEqual(direction, new Vector3D(0, 0, 0));
        });

        it('should calculate direction for quarter circle', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const direction = geodesicDirection(from, to, sphereCenter);
            
            // Direction should be tangent to sphere at 'from' point
            const normal = Vector3D.subtract(from, sphereCenter).normalize();
            expectFloatEqual(direction.dot(normal), 0, 1e-10);
            
            // Direction should point generally toward 'to'
            expect(direction.y).toBeGreaterThan(0);
        });

        it('should handle antipodal points', () => {
            const north = new Vector3D(0, 0, sphereRadius);
            const south = new Vector3D(0, 0, -sphereRadius);
            
            const direction = geodesicDirection(north, south, sphereCenter);
            
            // For antipodal points, any tangent direction is valid (or zero)
            const normal = Vector3D.subtract(north, sphereCenter).normalize();
            expectFloatEqual(direction.dot(normal), 0, 1e-6);
        });

        it('should produce unit length direction', () => {
            const from = new Vector3D(6, 8, 0);
            const to = new Vector3D(8, 6, 0);
            
            const direction = geodesicDirection(from, to, sphereCenter);
            
            if (direction.magnitude() > 0) {
                expectFloatEqual(direction.magnitude(), 1, 1e-10);
            }
        });

        it('should be tangent to sphere surface', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, 0, sphereRadius);
            
            const direction = geodesicDirection(from, to, sphereCenter);
            const normal = Vector3D.subtract(from, sphereCenter).normalize();
            
            expectFloatEqual(direction.dot(normal), 0, 1e-10);
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(5, 5, 5);
            const from = new Vector3D(10, 5, 5);
            const to = new Vector3D(5, 10, 5);
            
            const direction = geodesicDirection(from, to, center);
            const normal = Vector3D.subtract(from, center).normalize();
            
            if (direction.magnitude() > 0) {
                expectFloatEqual(direction.dot(normal), 0, 1e-10);
            }
        });
    });

    describe('sphericalLerp', () => {
        it('should interpolate at endpoints correctly', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const start = sphericalLerp(from, to, sphereCenter, sphereRadius, 0);
            const end = sphericalLerp(from, to, sphereCenter, sphereRadius, 1);
            
            expectVectorEqual(start, from);
            expectVectorEqual(end, to);
        });

        it('should maintain radius during interpolation', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            for (let t = 0; t <= 1; t += 0.1) {
                const interpolated = sphericalLerp(from, to, sphereCenter, sphereRadius, t);
                expectFloatEqual(interpolated.distanceTo(sphereCenter), sphereRadius, 1e-10);
            }
        });

        it('should interpolate along great circle', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const mid = sphericalLerp(from, to, sphereCenter, sphereRadius, 0.5);
            
            // Midpoint should be equidistant from both endpoints along great circle
            const distFromStart = geodesicDistance(from, mid, sphereRadius);
            const distToEnd = geodesicDistance(mid, to, sphereRadius);
            
            expectFloatEqual(distFromStart, distToEnd, 1e-10);
        });

        it('should handle identical points', () => {
            const point = new Vector3D(sphereRadius, 0, 0);
            const interpolated = sphericalLerp(point, point, sphereCenter, sphereRadius, 0.5);
            
            expectVectorEqual(interpolated, point);
        });

        it('should handle very close points', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(sphereRadius - 0.001, 0.001, 0);
            const toNormalized = projectToSphere(to, sphereCenter, sphereRadius);
            
            const interpolated = sphericalLerp(from, toNormalized, sphereCenter, sphereRadius, 0.5);
            expectFloatEqual(interpolated.distanceTo(sphereCenter), sphereRadius, 1e-10);
        });

        it('should handle extrapolation (t > 1)', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const extrapolated = sphericalLerp(from, to, sphereCenter, sphereRadius, 1.5);
            expectFloatEqual(extrapolated.distanceTo(sphereCenter), sphereRadius, 1e-10);
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(10, 10, 10);
            const radius = 5;
            const from = new Vector3D(15, 10, 10);
            const to = new Vector3D(10, 15, 10);
            
            const interpolated = sphericalLerp(from, to, center, radius, 0.5);
            expectFloatEqual(interpolated.distanceTo(center), radius, 1e-10);
        });
    });

    describe('sphericalSteering', () => {
        it('should project desired direction to tangent plane', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const velocity = new Vector3D(0, 1, 0);
            const desired = new Vector3D(1, 1, 1); // Not in tangent plane
            
            const steering = sphericalSteering(position, velocity, desired, sphereCenter, sphereRadius);
            const normal = Vector3D.subtract(position, sphereCenter).normalize();
            
            // Steering should be in tangent plane
            expectFloatEqual(steering.dot(normal), 0, 1e-10);
        });

        it('should return zero for already aligned velocity', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const velocity = new Vector3D(0, 1, 0);
            const desired = new Vector3D(0, 1, 0);
            
            const steering = sphericalSteering(position, velocity, desired, sphereCenter, sphereRadius);
            expectVectorEqual(steering, new Vector3D(0, 0, 0), 1e-10);
        });

        it('should compute steering toward desired direction', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const velocity = new Vector3D(0, 1, 0);
            const desired = new Vector3D(0, 0, 1);
            
            const steering = sphericalSteering(position, velocity, desired, sphereCenter, sphereRadius);
            
            // Should steer toward Z direction
            expect(steering.z).toBeGreaterThan(0);
            expect(steering.y).toBeLessThan(0);
        });

        it('should handle zero velocity', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const velocity = new Vector3D(0, 0, 0);
            const desired = new Vector3D(0, 1, 0);
            
            const steering = sphericalSteering(position, velocity, desired, sphereCenter, sphereRadius);
            const normal = Vector3D.subtract(position, sphereCenter).normalize();
            
            expectFloatEqual(steering.dot(normal), 0, 1e-10);
        });

        it('should handle desired direction parallel to normal', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const velocity = new Vector3D(0, 1, 0);
            const desired = new Vector3D(1, 0, 0); // Parallel to normal
            
            const steering = sphericalSteering(position, velocity, desired, sphereCenter, sphereRadius);
            
            // Should result in negative velocity (to slow down)
            expect(steering.y).toBeLessThan(0);
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(5, 5, 5);
            const radius = 3;
            const position = new Vector3D(8, 5, 5);
            const velocity = new Vector3D(0, 1, 0);
            const desired = new Vector3D(0, 0, 1);
            
            const steering = sphericalSteering(position, velocity, desired, center, radius);
            const normal = Vector3D.subtract(position, center).normalize();
            
            expectFloatEqual(steering.dot(normal), 0, 1e-10);
        });
    });

    describe('Edge Cases and Mathematical Properties', () => {
        it('should handle very large sphere radii', () => {
            const largeRadius = 1e6;
            const point = new Vector3D(500000, 500000, 0);
            const projected = projectToSphere(point, sphereCenter, largeRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), largeRadius, 1e-3);
        });

        it('should handle very small sphere radii', () => {
            const smallRadius = 1e-6;
            const point = new Vector3D(1, 0, 0);
            const projected = projectToSphere(point, sphereCenter, smallRadius);
            
            expectFloatEqual(projected.distanceTo(sphereCenter), smallRadius, 1e-12);
        });

        it('should maintain mathematical properties under composition', () => {
            const point = new Vector3D(6, 8, 0);
            
            // Project to sphere, convert to spherical, convert back, project again
            const projected1 = projectToSphere(point, sphereCenter, sphereRadius);
            const spherical = cartesianToSpherical(projected1.x, projected1.y, projected1.z);
            const backToCartesian = sphericalToCartesian(spherical.theta, spherical.phi, spherical.radius);
            const projected2 = projectToSphere(backToCartesian, sphereCenter, sphereRadius);
            
            expectVectorEqual(projected1, projected2, 1e-10);
        });

        it('should handle coordinate system edge cases', () => {
            // Test all octants
            const testPoints = [
                [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
                [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
            ];
            
            for (const [x, y, z] of testPoints) {
                const point = new Vector3D(x, y, z);
                const projected = projectToSphere(point, sphereCenter, sphereRadius);
                expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius, 1e-10);
                
                const spherical = cartesianToSpherical(projected.x, projected.y, projected.z);
                expect(spherical.radius).toBeGreaterThan(0);
                expect(spherical.phi).toBeGreaterThanOrEqual(0);
                expect(spherical.phi).toBeLessThanOrEqual(Math.PI);
            }
        });

        it('should handle numerical precision edge cases', () => {
            const almostZero = new Vector3D(1e-15, 1e-15, 1e-15);
            const projected = projectToSphere(almostZero, sphereCenter, sphereRadius);
            
            expect(Number.isFinite(projected.x)).toBe(true);
            expect(Number.isFinite(projected.y)).toBe(true);
            expect(Number.isFinite(projected.z)).toBe(true);
            expectFloatEqual(projected.distanceTo(sphereCenter), sphereRadius, 1e-10);
        });
    });

    describe('Performance and Stability Tests', () => {
        it('should handle repeated operations without degradation', () => {
            let point = new Vector3D(6, 8, 0);
            
            for (let i = 0; i < 1000; i++) {
                point = projectToSphere(point, sphereCenter, sphereRadius);
                const spherical = cartesianToSpherical(point.x, point.y, point.z);
                point = sphericalToCartesian(spherical.theta, spherical.phi, spherical.radius);
            }
            
            expectFloatEqual(point.distanceTo(sphereCenter), sphereRadius, 1e-6);
        });

        it('should handle many geodesic distance calculations efficiently', () => {
            const points = [];
            for (let i = 0; i < 100; i++) {
                const theta = (Math.PI * 2 * i) / 100;
                const phi = Math.PI / 2;
                points.push(sphericalToCartesian(theta, phi, sphereRadius));
            }
            
            const startTime = performance.now();
            let totalDistance = 0;
            
            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    totalDistance += geodesicDistance(points[i], points[j], sphereRadius);
                }
            }
            
            const endTime = performance.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Should be fast
            expect(totalDistance).toBeGreaterThan(0);
        });

        it('should maintain stability with extreme interpolation values', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const extremeValues = [-10, -1, 0, 0.5, 1, 2, 10];
            
            for (const t of extremeValues) {
                const interpolated = sphericalLerp(from, to, sphereCenter, sphereRadius, t);
                expect(Number.isFinite(interpolated.x)).toBe(true);
                expect(Number.isFinite(interpolated.y)).toBe(true);
                expect(Number.isFinite(interpolated.z)).toBe(true);
                expectFloatEqual(interpolated.distanceTo(sphereCenter), sphereRadius, 1e-6);
            }
        });
    });
});