/**
 * Comprehensive unit tests for SphericalConstraints
 * Tests constraint system, force application, and integration with engine
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';
import {
    constrainToSphere,
    constrainVelocityToSphere,
    geodesicSteering,
    sphericalBoundaryForce,
    applySphericalConstraints,
    createSphericalConstraintSystem,
    getConstraintPreset,
    CONSTRAINT_CONFIG
} from '../math/SphericalConstraints.js';

const EPSILON = 1e-6;

/**
 * Helper function to check vector equality within tolerance
 */
function expectVectorEqual(v1, v2, tolerance = EPSILON) {
    expect(Math.abs(v1.x - v2.x)).toBeLessThan(tolerance);
    expect(Math.abs(v1.y - v2.y)).toBeLessThan(tolerance);
    expect(Math.abs(v1.z - v2.z)).toBeLessThan(tolerance);
}

/**
 * Helper function to check scalar equality within tolerance
 */
function expectFloatEqual(a, b, tolerance = EPSILON) {
    expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

/**
 * Helper function to create a test boid
 */
function createTestBoid(x, y, z, vx = 0, vy = 0, vz = 0) {
    return {
        position: new Vector3D(x, y, z),
        velocity: new Vector3D(vx, vy, vz),
        acceleration: new Vector3D(0, 0, 0),
        maxSpeed: 2.0,
        maxForce: 0.03
    };
}

describe('SphericalConstraints', () => {
    let sphereCenter, sphereRadius;

    beforeEach(() => {
        sphereCenter = new Vector3D(0, 0, 0);
        sphereRadius = 10.0;
    });

    describe('Configuration Constants', () => {
        it('should have valid default constraint configuration', () => {
            expect(CONSTRAINT_CONFIG.positionCorrectionStrength).toBeGreaterThan(0);
            expect(CONSTRAINT_CONFIG.velocityProjectionStrength).toBeGreaterThan(0);
            expect(CONSTRAINT_CONFIG.boundaryForceStrength).toBeGreaterThan(0);
            expect(CONSTRAINT_CONFIG.maxCorrectionDistance).toBeGreaterThan(0);
            expect(CONSTRAINT_CONFIG.dampingFactor).toBeGreaterThan(0);
            expect(CONSTRAINT_CONFIG.dampingFactor).toBeLessThanOrEqual(1);
        });
    });

    describe('constrainToSphere', () => {
        it('should not correct position for boid already on sphere', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 0, 1, 0);
            const result = constrainToSphere(boid, sphereCenter, sphereRadius);
            
            expect(result.positionCorrected).toBe(false);
            expect(result.correctionMagnitude).toBe(0);
            expectVectorEqual(boid.position, new Vector3D(sphereRadius, 0, 0));
        });

        it('should correct position for boid outside sphere', () => {
            const boid = createTestBoid(15, 0, 0, 1, 0, 0);
            const result = constrainToSphere(boid, sphereCenter, sphereRadius);
            
            expect(result.positionCorrected).toBe(true);
            expect(result.correctionMagnitude).toBeGreaterThan(0);
            
            const distance = boid.position.distanceTo(sphereCenter);
            expectFloatEqual(distance, sphereRadius, 0.5); // Allow some tolerance for gradual correction
        });

        it('should correct position for boid inside sphere', () => {
            const boid = createTestBoid(5, 0, 0, 0, 1, 0);
            const result = constrainToSphere(boid, sphereCenter, sphereRadius);
            
            expect(result.positionCorrected).toBe(true);
            expect(result.correctionMagnitude).toBeGreaterThan(0);
            
            const distance = boid.position.distanceTo(sphereCenter);
            expect(distance).toBeGreaterThan(5); // Should move outward
            expect(distance).toBeLessThanOrEqual(sphereRadius + 1); // Should be closer to sphere
        });

        it('should limit correction magnitude', () => {
            const config = { ...CONSTRAINT_CONFIG, maxCorrectionDistance: 1.0 };
            const boid = createTestBoid(100, 0, 0, 0, 0, 0); // Very far from sphere
            
            const initialDistance = boid.position.distanceTo(sphereCenter);
            constrainToSphere(boid, sphereCenter, sphereRadius, config);
            const finalDistance = boid.position.distanceTo(sphereCenter);
            
            const correction = initialDistance - finalDistance;
            expect(correction).toBeLessThanOrEqual(config.maxCorrectionDistance + EPSILON);
        });

        it('should apply velocity damping for large corrections', () => {
            const boid = createTestBoid(50, 0, 0, 10, 10, 10); // Far from sphere with high velocity
            const initialSpeed = boid.velocity.magnitude();
            
            constrainToSphere(boid, sphereCenter, sphereRadius);
            
            const finalSpeed = boid.velocity.magnitude();
            expect(finalSpeed).toBeLessThan(initialSpeed);
        });

        it('should always project velocity to tangent plane', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 1, 0, 0); // Velocity pointing radially
            constrainToSphere(boid, sphereCenter, sphereRadius);
            
            const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
            const velocityRadialComponent = boid.velocity.dot(normal);
            
            expectFloatEqual(velocityRadialComponent, 0, 1e-3);
        });

        it('should use custom configuration', () => {
            const customConfig = {
                ...CONSTRAINT_CONFIG,
                positionCorrectionStrength: 0.5,
                dampingFactor: 0.8
            };
            
            const boid = createTestBoid(15, 0, 0, 5, 5, 5);
            const initialVelocity = boid.velocity.clone();
            
            constrainToSphere(boid, sphereCenter, sphereRadius, customConfig);
            
            // Should apply correction based on custom config
            expect(boid.velocity.magnitude()).toBeLessThan(initialVelocity.magnitude());
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(10, 10, 10);
            const boid = createTestBoid(20, 10, 10, 0, 1, 0); // Outside sphere
            
            constrainToSphere(boid, center, sphereRadius);
            
            const distance = boid.position.distanceTo(center);
            expect(distance).toBeLessThanOrEqual(sphereRadius + 1);
        });

        it('should handle boid at sphere center', () => {
            const boid = createTestBoid(0, 0, 0, 1, 1, 1);
            const result = constrainToSphere(boid, sphereCenter, sphereRadius);
            
            expect(result.positionCorrected).toBe(true);
            expect(Number.isFinite(boid.position.magnitude())).toBe(true);
            
            const distance = boid.position.distanceTo(sphereCenter);
            expect(distance).toBeGreaterThan(0);
        });
    });

    describe('constrainVelocityToSphere', () => {
        it('should project radial velocity to tangent plane', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 1, 0, 0); // Radial velocity
            
            constrainVelocityToSphere(boid, sphereCenter, sphereRadius);
            
            const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
            const radialComponent = boid.velocity.dot(normal);
            
            expectFloatEqual(radialComponent, 0, 1e-6);
        });

        it('should leave tangent velocity unchanged', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 0, 1, 0); // Tangent velocity
            const initialVelocity = boid.velocity.clone();
            
            constrainVelocityToSphere(boid, sphereCenter, sphereRadius);
            
            expectVectorEqual(boid.velocity, initialVelocity, 1e-6);
        });

        it('should handle mixed radial and tangent components', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 0.5, 1, 0.5);
            
            constrainVelocityToSphere(boid, sphereCenter, sphereRadius);
            
            const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
            const radialComponent = boid.velocity.dot(normal);
            
            expectFloatEqual(radialComponent, 0, 1e-6);
            expect(boid.velocity.magnitude()).toBeGreaterThan(0);
        });

        it('should use configurable projection strength', () => {
            const strongConfig = { ...CONSTRAINT_CONFIG, velocityProjectionStrength: 1.0 };
            const weakConfig = { ...CONSTRAINT_CONFIG, velocityProjectionStrength: 0.1 };
            
            const strongBoid = createTestBoid(sphereRadius, 0, 0, 1, 1, 0);
            const weakBoid = createTestBoid(sphereRadius, 0, 0, 1, 1, 0);
            
            constrainVelocityToSphere(strongBoid, sphereCenter, sphereRadius, strongConfig);
            constrainVelocityToSphere(weakBoid, sphereCenter, sphereRadius, weakConfig);
            
            const strongNormal = Vector3D.subtract(strongBoid.position, sphereCenter).normalize();
            const weakNormal = Vector3D.subtract(weakBoid.position, sphereCenter).normalize();
            
            const strongRadial = Math.abs(strongBoid.velocity.dot(strongNormal));
            const weakRadial = Math.abs(weakBoid.velocity.dot(weakNormal));
            
            expect(strongRadial).toBeLessThan(weakRadial);
        });

        it('should handle zero velocity', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 0, 0, 0);
            
            expect(() => {
                constrainVelocityToSphere(boid, sphereCenter, sphereRadius);
            }).not.toThrow();
            
            expectVectorEqual(boid.velocity, new Vector3D(0, 0, 0));
        });

        it('should handle arbitrary positions on sphere', () => {
            const positions = [
                new Vector3D(6, 8, 0),
                new Vector3D(0, 0, sphereRadius),
                new Vector3D(5, 5, 7.07), // Approximately on sphere
                new Vector3D(-sphereRadius, 0, 0)
            ];
            
            for (const pos of positions) {
                const normalizedPos = pos.clone().normalize().multiply(sphereRadius);
                const boid = createTestBoid(normalizedPos.x, normalizedPos.y, normalizedPos.z, 1, 1, 1);
                
                constrainVelocityToSphere(boid, sphereCenter, sphereRadius);
                
                const normal = Vector3D.subtract(normalizedPos, sphereCenter).normalize();
                const radialComponent = boid.velocity.dot(normal);
                
                expectFloatEqual(radialComponent, 0, 1e-5);
            }
        });
    });

    describe('geodesicSteering', () => {
        it('should return zero for identical positions', () => {
            const position = new Vector3D(sphereRadius, 0, 0);
            const steering = geodesicSteering(position, position, sphereCenter, sphereRadius);
            
            expectVectorEqual(steering, new Vector3D(0, 0, 0));
        });

        it('should create steering toward target along sphere surface', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const steering = geodesicSteering(from, to, sphereCenter, sphereRadius);
            
            // Should be tangent to sphere
            const normal = Vector3D.subtract(from, sphereCenter).normalize();
            expectFloatEqual(steering.dot(normal), 0, 1e-6);
            
            // Should point toward target (Y direction)
            expect(steering.y).toBeGreaterThan(0);
        });

        it('should scale by geodesic steering strength', () => {
            const strongConfig = { geodesicSteeringStrength: 2.0 };
            const weakConfig = { geodesicSteeringStrength: 0.5 };
            
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(0, sphereRadius, 0);
            
            const strongSteering = geodesicSteering(from, to, sphereCenter, sphereRadius, strongConfig);
            const weakSteering = geodesicSteering(from, to, sphereCenter, sphereRadius, weakConfig);
            
            expect(strongSteering.magnitude()).toBeGreaterThan(weakSteering.magnitude());
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(5, 5, 5);
            const radius = 8;
            const from = new Vector3D(13, 5, 5);
            const to = new Vector3D(5, 13, 5);
            
            const steering = geodesicSteering(from, to, center, radius);
            
            const normal = Vector3D.subtract(from, center).normalize();
            expectFloatEqual(steering.dot(normal), 0, 1e-5);
        });

        it('should handle antipodal points', () => {
            const from = new Vector3D(sphereRadius, 0, 0);
            const to = new Vector3D(-sphereRadius, 0, 0);
            
            const steering = geodesicSteering(from, to, sphereCenter, sphereRadius);
            
            // For antipodal points, any tangent direction is valid
            const normal = Vector3D.subtract(from, sphereCenter).normalize();
            expectFloatEqual(steering.dot(normal), 0, 1e-5);
        });
    });

    describe('sphericalBoundaryForce', () => {
        it('should return zero force when far from boundary', () => {
            const boid = createTestBoid(5, 0, 0, 1, 0, 0); // Well inside sphere
            const force = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 1.0);
            
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should create inward force near boundary', () => {
            const threshold = sphereRadius * 0.1;
            const boid = createTestBoid(sphereRadius - threshold * 0.5, 0, 0, 0, 0, 0);
            
            const force = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 1.0, threshold);
            
            expect(force.x).toBeLessThan(0); // Toward center
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
        });

        it('should scale force by strength parameter', () => {
            const threshold = sphereRadius * 0.1;
            const boid = createTestBoid(sphereRadius - threshold * 0.5, 0, 0, 0, 0, 0);
            
            const weakForce = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 0.5, threshold);
            const strongForce = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 2.0, threshold);
            
            expect(strongForce.magnitude()).toBeGreaterThan(weakForce.magnitude());
        });

        it('should use custom threshold', () => {
            const boid = createTestBoid(sphereRadius - 2, 0, 0, 0, 0, 0);
            
            const smallThreshold = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 1.0, 1.0);
            const largeThreshold = sphericalBoundaryForce(boid, sphereCenter, sphereRadius, 1.0, 5.0);
            
            expectVectorEqual(smallThreshold, new Vector3D(0, 0, 0)); // Outside threshold
            expect(largeThreshold.magnitude()).toBeGreaterThan(0); // Inside threshold
        });

        it('should have exponential falloff', () => {
            const threshold = sphereRadius * 0.2;
            const nearBoid = createTestBoid(sphereRadius - threshold * 0.1, 0, 0);
            const farBoid = createTestBoid(sphereRadius - threshold * 0.9, 0, 0);
            
            const nearForce = sphericalBoundaryForce(nearBoid, sphereCenter, sphereRadius, 1.0, threshold);
            const farForce = sphericalBoundaryForce(farBoid, sphereCenter, sphereRadius, 1.0, threshold);
            
            // Force should decrease non-linearly with distance
            const forceRatio = nearForce.magnitude() / farForce.magnitude();
            expect(forceRatio).toBeGreaterThan(2); // More than linear relationship
        });

        it('should handle non-centered spheres', () => {
            const center = new Vector3D(10, 10, 10);
            const radius = 5;
            const threshold = radius * 0.2;
            const boid = createTestBoid(14.5, 10, 10); // Near boundary
            
            const force = sphericalBoundaryForce(boid, center, radius, 1.0, threshold);
            
            expect(force.x).toBeLessThan(0); // Toward center
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
        });
    });

    describe('applySphericalConstraints', () => {
        it('should apply surface constraints', () => {
            const boid = createTestBoid(15, 0, 0, 1, 0, 0); // Outside sphere
            const result = applySphericalConstraints(boid, sphereCenter, sphereRadius);
            
            expect(result.surfaceCorrection.positionCorrected).toBe(true);
            expect(result.surfaceCorrection.velocityProjected).toBe(true);
        });

        it('should apply boundary forces when enabled', () => {
            const options = { boundaryForceStrength: 2.0 };
            const threshold = sphereRadius * 0.1;
            const boid = createTestBoid(sphereRadius - threshold * 0.5, 0, 0, 0, 0, 0);
            
            const initialAcceleration = boid.acceleration.clone();
            const result = applySphericalConstraints(boid, sphereCenter, sphereRadius, options);
            
            expect(result.boundaryForce.magnitude()).toBeGreaterThan(0);
            expect(boid.acceleration.magnitude()).toBeGreaterThan(initialAcceleration.magnitude());
        });

        it('should not apply boundary forces when disabled', () => {
            const options = { boundaryForceStrength: 0 };
            const boid = createTestBoid(sphereRadius - 1, 0, 0, 0, 0, 0);
            
            const result = applySphericalConstraints(boid, sphereCenter, sphereRadius, options);
            
            expectVectorEqual(result.boundaryForce, new Vector3D(0, 0, 0));
        });

        it('should merge custom options with defaults', () => {
            const options = { positionCorrectionStrength: 0.5 };
            const result = applySphericalConstraints(
                createTestBoid(15, 0, 0), sphereCenter, sphereRadius, options
            );
            
            expect(result.config.positionCorrectionStrength).toBe(0.5);
            expect(result.config.velocityProjectionStrength).toBe(CONSTRAINT_CONFIG.velocityProjectionStrength);
        });
    });

    describe('createSphericalConstraintSystem', () => {
        let constraintSystem;

        beforeEach(() => {
            constraintSystem = createSphericalConstraintSystem(sphereCenter, sphereRadius);
        });

        it('should create system with correct parameters', () => {
            expectVectorEqual(constraintSystem.center, sphereCenter);
            expect(constraintSystem.radius).toBe(sphereRadius);
            expect(constraintSystem.config).toBeDefined();
        });

        it('should update single boid', () => {
            const boid = createTestBoid(15, 0, 0, 1, 0, 0);
            const result = constraintSystem.updateBoid(boid);
            
            expect(result.surfaceCorrection.positionCorrected).toBe(true);
        });

        it('should update multiple boids', () => {
            const boids = [
                createTestBoid(15, 0, 0, 1, 0, 0),
                createTestBoid(5, 0, 0, 0, 1, 0),
                createTestBoid(0, 12, 0, 0, 0, 1)
            ];
            
            const results = constraintSystem.updateBoids(boids);
            
            expect(results).toHaveLength(3);
            expect(results[0].surfaceCorrection.positionCorrected).toBe(true);
            expect(results[1].surfaceCorrection.positionCorrected).toBe(true);
            expect(results[2].surfaceCorrection.positionCorrected).toBe(true);
        });

        it('should update sphere parameters', () => {
            const newCenter = new Vector3D(5, 5, 5);
            const newRadius = 15;
            
            constraintSystem.updateSphere(newCenter, newRadius);
            
            expectVectorEqual(constraintSystem.center, newCenter);
            expect(constraintSystem.radius).toBe(newRadius);
        });

        it('should update configuration', () => {
            const newConfig = { positionCorrectionStrength: 0.8 };
            constraintSystem.updateConfig(newConfig);
            
            expect(constraintSystem.config.positionCorrectionStrength).toBe(0.8);
        });

        it('should provide geodesic steering', () => {
            const boid = createTestBoid(sphereRadius, 0, 0, 0, 1, 0);
            const target = new Vector3D(0, sphereRadius, 0);
            
            const steering = constraintSystem.getGeodesicSteering(boid, target);
            
            expect(steering.magnitude()).toBeGreaterThan(0);
            
            const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
            expectFloatEqual(steering.dot(normal), 0, 1e-6);
        });

        it('should project points to sphere', () => {
            const point = new Vector3D(20, 0, 0);
            const projected = constraintSystem.projectPoint(point);
            
            expectFloatEqual(projected.distanceTo(constraintSystem.center), constraintSystem.radius);
        });

        it('should provide system statistics', () => {
            const stats = constraintSystem.getStats();
            
            expectVectorEqual(stats.center, sphereCenter);
            expect(stats.radius).toBe(sphereRadius);
            expect(stats.config).toBeDefined();
            expectFloatEqual(stats.surfaceArea, 4 * Math.PI * sphereRadius * sphereRadius);
            expectFloatEqual(stats.volume, (4/3) * Math.PI * Math.pow(sphereRadius, 3));
        });
    });

    describe('getConstraintPreset', () => {
        it('should return strict preset', () => {
            const preset = getConstraintPreset('strict');
            
            expect(preset.positionCorrectionStrength).toBe(0.3);
            expect(preset.velocityProjectionStrength).toBe(1.0);
            expect(preset.boundaryForceStrength).toBe(3.0);
            expect(preset.maxCorrectionDistance).toBe(0.5);
            expect(preset.dampingFactor).toBe(0.9);
        });

        it('should return loose preset', () => {
            const preset = getConstraintPreset('loose');
            
            expect(preset.positionCorrectionStrength).toBe(0.05);
            expect(preset.velocityProjectionStrength).toBe(0.7);
            expect(preset.boundaryForceStrength).toBe(1.0);
            expect(preset.maxCorrectionDistance).toBe(2.0);
            expect(preset.dampingFactor).toBe(0.98);
        });

        it('should return natural preset', () => {
            const preset = getConstraintPreset('natural');
            
            expect(preset.positionCorrectionStrength).toBe(0.1);
            expect(preset.velocityProjectionStrength).toBe(0.9);
            expect(preset.boundaryForceStrength).toBe(1.5);
            expect(preset.maxCorrectionDistance).toBe(1.0);
            expect(preset.dampingFactor).toBe(0.95);
        });

        it('should return boundary-only preset', () => {
            const preset = getConstraintPreset('boundary-only');
            
            expect(preset.positionCorrectionStrength).toBe(0.01);
            expect(preset.velocityProjectionStrength).toBe(0.1);
            expect(preset.boundaryForceStrength).toBe(4.0);
            expect(preset.maxCorrectionDistance).toBe(5.0);
            expect(preset.dampingFactor).toBe(1.0);
        });

        it('should return natural preset for unknown preset name', () => {
            const preset = getConstraintPreset('unknown');
            const naturalPreset = getConstraintPreset('natural');
            
            expect(preset).toEqual(naturalPreset);
        });

        it('should return natural preset for null input', () => {
            const preset = getConstraintPreset(null);
            const naturalPreset = getConstraintPreset('natural');
            
            expect(preset).toEqual(naturalPreset);
        });
    });

    describe('Integration and Behavioral Tests', () => {
        it('should maintain boids on sphere surface over multiple updates', () => {
            const system = createSphericalConstraintSystem(sphereCenter, sphereRadius);
            const boids = [
                createTestBoid(8, 6, 0, 1, 1, 0),
                createTestBoid(15, 0, 0, 0, 1, 1),
                createTestBoid(3, 4, 0, 1, 0, 1)
            ];
            
            // Apply constraints multiple times
            for (let i = 0; i < 10; i++) {
                system.updateBoids(boids);
                
                // Update positions as if in simulation
                for (const boid of boids) {
                    boid.position.add(Vector3D.multiply(boid.velocity, 0.1));
                }
            }
            
            // All boids should remain close to sphere surface
            for (const boid of boids) {
                const distance = boid.position.distanceTo(sphereCenter);
                expectFloatEqual(distance, sphereRadius, 1.0);
                
                // Velocity should be tangent to sphere
                const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
                const radialComponent = Math.abs(boid.velocity.dot(normal));
                expect(radialComponent).toBeLessThan(0.1);
            }
        });

        it('should handle extreme initial conditions', () => {
            const system = createSphericalConstraintSystem(sphereCenter, sphereRadius);
            const extremeBoids = [
                createTestBoid(1000, 0, 0, 50, 50, 50), // Very far, very fast
                createTestBoid(0.001, 0.001, 0.001, 10, 10, 10), // Very close to center
                createTestBoid(-500, -500, -500, -20, -20, -20) // Far in opposite direction
            ];
            
            expect(() => {
                for (let i = 0; i < 5; i++) {
                    system.updateBoids(extremeBoids);
                }
            }).not.toThrow();
            
            for (const boid of extremeBoids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
            }
        });

        it('should different presets produce different behaviors', () => {
            const strictSystem = createSphericalConstraintSystem(
                sphereCenter, sphereRadius, getConstraintPreset('strict')
            );
            const looseSystem = createSphericalConstraintSystem(
                sphereCenter, sphereRadius, getConstraintPreset('loose')
            );
            
            // Same initial conditions
            const strictBoid = createTestBoid(15, 0, 0, 5, 5, 0);
            const looseBoid = createTestBoid(15, 0, 0, 5, 5, 0);
            
            strictSystem.updateBoid(strictBoid);
            looseSystem.updateBoid(looseBoid);
            
            // Strict should correct position more aggressively
            const strictDistance = strictBoid.position.distanceTo(sphereCenter);
            const looseDistance = looseBoid.position.distanceTo(sphereCenter);
            
            expect(strictDistance).toBeLessThan(looseDistance);
        });

        it('should handle rapid direction changes gracefully', () => {
            const system = createSphericalConstraintSystem(sphereCenter, sphereRadius);
            const boid = createTestBoid(sphereRadius, 0, 0, 1, 0, 0);
            
            // Simulate rapid direction changes
            for (let i = 0; i < 100; i++) {
                system.updateBoid(boid);
                
                // Random velocity changes
                boid.velocity.set(
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4
                );
                
                // Small position update
                boid.position.add(Vector3D.multiply(boid.velocity, 0.01));
            }
            
            // Should still be on sphere
            const finalDistance = boid.position.distanceTo(sphereCenter);
            expectFloatEqual(finalDistance, sphereRadius, 2.0);
            
            // Velocity should still be tangent
            const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
            const radialComponent = Math.abs(boid.velocity.dot(normal));
            expect(radialComponent).toBeLessThan(0.5);
        });

        it('should work with very small and very large spheres', () => {
            const smallSystem = createSphericalConstraintSystem(sphereCenter, 0.1);
            const largeSystem = createSphericalConstraintSystem(sphereCenter, 1000);
            
            const smallBoid = createTestBoid(1, 0, 0, 1, 1, 1);
            const largeBoid = createTestBoid(500, 500, 500, 10, 10, 10);
            
            smallSystem.updateBoid(smallBoid);
            largeSystem.updateBoid(largeBoid);
            
            expectFloatEqual(smallBoid.position.distanceTo(sphereCenter), 0.1, 0.05);
            expectFloatEqual(largeBoid.position.distanceTo(sphereCenter), 1000, 50);
        });
    });

    describe('Performance and Stability', () => {
        it('should handle many constraints efficiently', () => {
            const system = createSphericalConstraintSystem(sphereCenter, sphereRadius);
            const manyBoids = [];
            
            for (let i = 0; i < 1000; i++) {
                manyBoids.push(createTestBoid(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4
                ));
            }
            
            const startTime = performance.now();
            system.updateBoids(manyBoids);
            const endTime = performance.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Should be reasonably fast
            
            // Check that all boids are in valid state
            for (const boid of manyBoids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
            }
        });

        it('should maintain numerical stability over many iterations', () => {
            const system = createSphericalConstraintSystem(sphereCenter, sphereRadius);
            const boid = createTestBoid(sphereRadius, 0, 0, 1, 1, 1);
            
            for (let i = 0; i < 10000; i++) {
                system.updateBoid(boid);
                
                // Small random perturbation
                boid.position.add(new Vector3D(
                    (Math.random() - 0.5) * 0.001,
                    (Math.random() - 0.5) * 0.001,
                    (Math.random() - 0.5) * 0.001
                ));
            }
            
            // Should still be stable
            const distance = boid.position.distanceTo(sphereCenter);
            expectFloatEqual(distance, sphereRadius, 0.5);
            
            expect(Number.isFinite(boid.position.x)).toBe(true);
            expect(Number.isFinite(boid.velocity.x)).toBe(true);
        });
    });
});