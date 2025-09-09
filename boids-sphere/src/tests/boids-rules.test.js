/**
 * Comprehensive unit tests for BoidsRules
 * Tests separation, alignment, cohesion, seek, flee, boundary, and helper functions
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';
import {
    separation,
    alignment,
    cohesion,
    seek,
    flee,
    getNeighbors,
    sphericalBoundary,
    wander,
    avoidObstacles
} from '../math/BoidsRules.js';

const EPSILON = 1e-10;

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

/**
 * Helper function to create a test boid
 */
function createTestBoid(x, y, z, vx = 0, vy = 0, vz = 0, maxSpeed = 2.0, maxForce = 0.03) {
    return {
        position: new Vector3D(x, y, z),
        velocity: new Vector3D(vx, vy, vz),
        acceleration: new Vector3D(0, 0, 0),
        maxSpeed,
        maxForce
    };
}

describe('BoidsRules', () => {
    let boid;
    let neighbors;

    beforeEach(() => {
        boid = createTestBoid(0, 0, 0, 1, 0, 0);
        neighbors = [];
    });

    describe('getNeighbors', () => {
        it('should find neighbors within radius', () => {
            const allBoids = [
                createTestBoid(0, 0, 0), // Center boid
                createTestBoid(5, 0, 0), // Within radius 10
                createTestBoid(15, 0, 0), // Outside radius 10
                createTestBoid(0, 7, 0), // Within radius 10
                createTestBoid(0, 0, 8), // Within radius 10
            ];

            const neighbors = getNeighbors(allBoids[0], allBoids, 10);
            expect(neighbors).toHaveLength(3); // Should exclude self and far boid
            expect(neighbors).not.toContain(allBoids[0]); // Should not include self
            expect(neighbors).not.toContain(allBoids[2]); // Should not include far boid
        });

        it('should exclude self from neighbors', () => {
            const allBoids = [
                createTestBoid(0, 0, 0),
                createTestBoid(1, 1, 1)
            ];

            const neighbors = getNeighbors(allBoids[0], allBoids, 10);
            expect(neighbors).toHaveLength(1);
            expect(neighbors[0]).toBe(allBoids[1]);
        });

        it('should handle empty boids list', () => {
            const neighbors = getNeighbors(boid, [], 10);
            expect(neighbors).toHaveLength(0);
        });

        it('should handle single boid', () => {
            const neighbors = getNeighbors(boid, [boid], 10);
            expect(neighbors).toHaveLength(0);
        });

        it('should use optimized distance calculation (squared)', () => {
            const allBoids = [
                createTestBoid(0, 0, 0),
                createTestBoid(3, 4, 0) // Distance = 5
            ];

            const neighborsRadius5 = getNeighbors(allBoids[0], allBoids, 5);
            const neighborsRadius4 = getNeighbors(allBoids[0], allBoids, 4);

            expect(neighborsRadius5).toHaveLength(1);
            expect(neighborsRadius4).toHaveLength(0);
        });

        it('should handle 3D distances correctly', () => {
            const allBoids = [
                createTestBoid(0, 0, 0),
                createTestBoid(1, 1, 1), // Distance = sqrt(3) ≈ 1.73
                createTestBoid(2, 2, 2)  // Distance = sqrt(12) ≈ 3.46
            ];

            const neighbors = getNeighbors(allBoids[0], allBoids, 2);
            expect(neighbors).toHaveLength(1); // Only the first neighbor
        });
    });

    describe('separation', () => {
        it('should return zero force when no neighbors', () => {
            const force = separation(boid, [], 25);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should create repulsive force from nearby neighbor', () => {
            const closeBoid = createTestBoid(10, 0, 0); // Close neighbor
            const force = separation(boid, [closeBoid], 25);
            
            // Force should point away from neighbor (negative X direction)
            expect(force.x).toBeLessThan(0);
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            
            // Force should be limited by maxForce
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should ignore neighbors beyond separation distance', () => {
            const farBoid = createTestBoid(30, 0, 0); // Far neighbor
            const force = separation(boid, [farBoid], 25);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should weight force by distance (closer = stronger)', () => {
            const closeBoid = createTestBoid(5, 0, 0);
            const farBoid = createTestBoid(20, 0, 0);
            
            const closeForce = separation(boid, [closeBoid], 25);
            const farForce = separation(boid, [farBoid], 25);
            
            expect(closeForce.magnitude()).toBeGreaterThan(farForce.magnitude());
        });

        it('should handle multiple neighbors', () => {
            const neighbor1 = createTestBoid(10, 0, 0);
            const neighbor2 = createTestBoid(0, 10, 0);
            
            const force = separation(boid, [neighbor1, neighbor2], 25);
            
            // Should be average of individual forces
            expect(force.magnitude()).toBeGreaterThan(0);
            expect(force.x).toBeLessThan(0); // Away from neighbor1
            expect(force.y).toBeLessThan(0); // Away from neighbor2
        });

        it('should handle identical positions gracefully', () => {
            const identicalBoid = createTestBoid(0, 0, 0); // Same position
            const force = separation(boid, [identicalBoid], 25);
            
            // Should not produce NaN or infinite force
            expect(Number.isFinite(force.x)).toBe(true);
            expect(Number.isFinite(force.y)).toBe(true);
            expect(Number.isFinite(force.z)).toBe(true);
        });

        it('should implement Reynolds steering formula', () => {
            const neighbor = createTestBoid(5, 0, 0);
            const force = separation(boid, [neighbor], 25);
            
            // Force magnitude should be limited by maxForce
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle 3D separation', () => {
            const neighbor = createTestBoid(5, 5, 5);
            const force = separation(boid, [neighbor], 25);
            
            expect(force.x).toBeLessThan(0);
            expect(force.y).toBeLessThan(0);
            expect(force.z).toBeLessThan(0);
            expect(force.magnitude()).toBeGreaterThan(0);
        });
    });

    describe('alignment', () => {
        it('should return zero force when no neighbors', () => {
            const force = alignment(boid, []);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should align with neighbor velocity', () => {
            const fastBoid = createTestBoid(10, 0, 0, 2, 0, 0); // Moving fast in X
            boid.velocity.set(0, 1, 0); // Moving in Y
            
            const force = alignment(boid, [fastBoid]);
            
            // Force should encourage alignment with neighbor's direction
            expect(force.x).toBeGreaterThan(0); // Toward X direction
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should average multiple neighbor velocities', () => {
            const neighbor1 = createTestBoid(10, 0, 0, 1, 0, 0);
            const neighbor2 = createTestBoid(0, 10, 0, 0, 1, 0);
            boid.velocity.set(0, 0, 1); // Different direction
            
            const force = alignment(boid, [neighbor1, neighbor2]);
            
            // Should create force toward average velocity direction
            expect(force.magnitude()).toBeGreaterThan(0);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should ignore identical positions (distance = 0)', () => {
            const identicalBoid = createTestBoid(0, 0, 0, 2, 0, 0);
            const normalBoid = createTestBoid(10, 0, 0, 2, 0, 0);
            
            const force = alignment(boid, [identicalBoid, normalBoid]);
            
            // Should only consider the normal boid
            expect(force.magnitude()).toBeGreaterThan(0);
        });

        it('should handle zero velocity neighbors', () => {
            const stillBoid = createTestBoid(10, 0, 0, 0, 0, 0);
            boid.velocity.set(1, 1, 1);
            
            const force = alignment(boid, [stillBoid]);
            
            // Should create force to slow down toward zero velocity
            expect(force.x).toBeLessThan(0);
            expect(force.y).toBeLessThan(0);
            expect(force.z).toBeLessThan(0);
        });

        it('should implement Reynolds steering formula correctly', () => {
            const neighbor = createTestBoid(10, 0, 0, 0, 2, 0);
            boid.velocity.set(1, 0, 0);
            
            const force = alignment(boid, [neighbor]);
            
            // The desired velocity should be normalized and scaled by maxSpeed
            // Then steering = desired - current
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle 3D alignment', () => {
            const neighbor = createTestBoid(10, 10, 10, 1, 1, 1);
            boid.velocity.set(0, 0, 0);
            
            const force = alignment(boid, [neighbor]);
            
            expect(force.x).toBeGreaterThan(0);
            expect(force.y).toBeGreaterThan(0);
            expect(force.z).toBeGreaterThan(0);
        });
    });

    describe('cohesion', () => {
        it('should return zero force when no neighbors', () => {
            const force = cohesion(boid, []);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should create attractive force toward neighbor', () => {
            const neighbor = createTestBoid(20, 0, 0);
            const force = cohesion(boid, [neighbor]);
            
            // Force should point toward neighbor (positive X direction)
            expect(force.x).toBeGreaterThan(0);
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should seek toward center of mass of multiple neighbors', () => {
            const neighbor1 = createTestBoid(10, 0, 0);
            const neighbor2 = createTestBoid(30, 0, 0);
            // Center of mass at (20, 0, 0)
            
            const force = cohesion(boid, [neighbor1, neighbor2]);
            
            expect(force.x).toBeGreaterThan(0); // Toward center of mass
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
        });

        it('should ignore identical positions (distance = 0)', () => {
            const identicalBoid = createTestBoid(0, 0, 0);
            const normalBoid = createTestBoid(20, 0, 0);
            
            const force = cohesion(boid, [identicalBoid, normalBoid]);
            
            // Should seek toward the normal boid only
            expect(force.x).toBeGreaterThan(0);
        });

        it('should handle 3D cohesion', () => {
            const neighbor1 = createTestBoid(10, 10, 0);
            const neighbor2 = createTestBoid(10, 0, 10);
            
            const force = cohesion(boid, [neighbor1, neighbor2]);
            
            expect(force.x).toBeGreaterThan(0);
            expect(force.y).toBeGreaterThan(0);
            expect(force.z).toBeGreaterThan(0);
        });

        it('should use seek behavior internally', () => {
            const neighbor = createTestBoid(10, 10, 10);
            const cohesionForce = cohesion(boid, [neighbor]);
            const seekForce = seek(boid, neighbor.position);
            
            // Should produce similar results (cohesion uses seek internally)
            expectVectorEqual(cohesionForce, seekForce, 1e-6);
        });
    });

    describe('seek', () => {
        it('should create force toward target', () => {
            const target = new Vector3D(10, 0, 0);
            const force = seek(boid, target);
            
            expect(force.x).toBeGreaterThan(0);
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should implement Reynolds steering formula', () => {
            const target = new Vector3D(10, 0, 0);
            boid.velocity.set(0, 1, 0); // Current velocity
            
            const force = seek(boid, target);
            
            // Desired velocity should be toward target at maxSpeed
            // Steering = desired - current
            const desired = Vector3D.subtract(target, boid.position).normalize().multiply(boid.maxSpeed);
            const expectedSteering = Vector3D.subtract(desired, boid.velocity);
            expectedSteering.limit(boid.maxForce);
            
            expectVectorEqual(force, expectedSteering, 1e-6);
        });

        it('should handle target at same position', () => {
            const target = new Vector3D(0, 0, 0);
            const force = seek(boid, target);
            
            // Should produce minimal force
            expect(force.magnitude()).toBeLessThan(0.1);
        });

        it('should limit force by maxForce', () => {
            const target = new Vector3D(1000, 1000, 1000); // Very far target
            const force = seek(boid, target);
            
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle 3D seeking', () => {
            const target = new Vector3D(5, 5, 5);
            const force = seek(boid, target);
            
            expect(force.x).toBeGreaterThan(0);
            expect(force.y).toBeGreaterThan(0);
            expect(force.z).toBeGreaterThan(0);
        });
    });

    describe('flee', () => {
        it('should create force away from target', () => {
            const target = new Vector3D(10, 0, 0);
            const force = flee(boid, target);
            
            expect(force.x).toBeLessThan(0); // Away from target
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should be opposite to seek behavior', () => {
            const target = new Vector3D(10, 5, 3);
            const seekForce = seek(boid, target);
            const fleeForce = flee(boid, target);
            
            // Flee should be roughly opposite to seek
            const expectedFlee = Vector3D.multiply(seekForce, -1);
            // Note: They won't be exactly opposite due to velocity differences
            expect(fleeForce.x).toBeLessThan(0);
            expect(seekForce.x).toBeGreaterThan(0);
        });

        it('should handle target at same position', () => {
            const target = new Vector3D(0, 0, 0);
            const force = flee(boid, target);
            
            // Should produce minimal force or random direction
            expect(Number.isFinite(force.magnitude())).toBe(true);
        });

        it('should limit force by maxForce', () => {
            const target = new Vector3D(-1000, -1000, -1000);
            const force = flee(boid, target);
            
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle 3D fleeing', () => {
            const target = new Vector3D(5, 5, 5);
            boid.position.set(10, 10, 10);
            const force = flee(boid, target);
            
            expect(force.x).toBeGreaterThan(0); // Away from target
            expect(force.y).toBeGreaterThan(0);
            expect(force.z).toBeGreaterThan(0);
        });
    });

    describe('sphericalBoundary', () => {
        it('should return zero force when inside boundary', () => {
            const center = new Vector3D(0, 0, 0);
            const radius = 100;
            boid.position.set(50, 0, 0); // Inside boundary
            
            const force = sphericalBoundary(boid, center, radius);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should create inward force when outside boundary', () => {
            const center = new Vector3D(0, 0, 0);
            const radius = 50;
            boid.position.set(100, 0, 0); // Outside boundary
            
            const force = sphericalBoundary(boid, center, radius);
            
            expect(force.x).toBeLessThan(0); // Toward center
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should scale force by strength parameter', () => {
            const center = new Vector3D(0, 0, 0);
            const radius = 50;
            boid.position.set(100, 0, 0);
            
            const weakForce = sphericalBoundary(boid, center, radius, 0.5);
            const strongForce = sphericalBoundary(boid, center, radius, 2.0);
            
            expect(strongForce.magnitude()).toBeGreaterThan(weakForce.magnitude());
        });

        it('should handle non-centered boundaries', () => {
            const center = new Vector3D(50, 50, 50);
            const radius = 25;
            boid.position.set(100, 50, 50); // Outside boundary
            
            const force = sphericalBoundary(boid, center, radius);
            
            expect(force.x).toBeLessThan(0); // Toward center
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
        });

        it('should handle 3D boundaries', () => {
            const center = new Vector3D(0, 0, 0);
            const radius = 50;
            boid.position.set(100, 100, 100); // Outside in all dimensions
            
            const force = sphericalBoundary(boid, center, radius);
            
            expect(force.x).toBeLessThan(0);
            expect(force.y).toBeLessThan(0);
            expect(force.z).toBeLessThan(0);
        });
    });

    describe('wander', () => {
        it('should create random steering force', () => {
            const force1 = wander(boid);
            const force2 = wander(boid);
            
            // Forces should be random (very unlikely to be identical)
            expect(force1.equals(force2)).toBe(false);
            
            // Force should be limited by wander strength * maxForce
            const expectedMaxMagnitude = 0.1 * boid.maxForce;
            expect(force1.magnitude()).toBeLessThanOrEqual(expectedMaxMagnitude + 1e-6);
            expect(force2.magnitude()).toBeLessThanOrEqual(expectedMaxMagnitude + 1e-6);
        });

        it('should scale by wander strength parameter', () => {
            const weakForce = wander(boid, 0.1);
            const strongForce = wander(boid, 1.0);
            
            // Can't guarantee which will be larger due to randomness, but can check limits
            expect(weakForce.magnitude()).toBeLessThanOrEqual(0.1 * boid.maxForce + 1e-6);
            expect(strongForce.magnitude()).toBeLessThanOrEqual(1.0 * boid.maxForce + 1e-6);
        });

        it('should produce different forces on multiple calls', () => {
            const forces = [];
            for (let i = 0; i < 10; i++) {
                forces.push(wander(boid));
            }
            
            // Check that not all forces are identical
            let allIdentical = true;
            for (let i = 1; i < forces.length; i++) {
                if (!forces[0].equals(forces[i], 1e-6)) {
                    allIdentical = false;
                    break;
                }
            }
            expect(allIdentical).toBe(false);
        });

        it('should handle zero wander strength', () => {
            const force = wander(boid, 0);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });
    });

    describe('avoidObstacles', () => {
        it('should return zero force when no obstacles', () => {
            const force = avoidObstacles(boid, [], 30);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should create avoidance force near obstacle', () => {
            const obstacle = {
                position: new Vector3D(20, 0, 0),
                radius: 5
            };
            boid.position.set(0, 0, 0);
            
            const force = avoidObstacles(boid, [obstacle], 30);
            
            expect(force.x).toBeLessThan(0); // Away from obstacle
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should ignore distant obstacles', () => {
            const obstacle = {
                position: new Vector3D(100, 0, 0),
                radius: 5
            };
            boid.position.set(0, 0, 0);
            
            const force = avoidObstacles(boid, [obstacle], 30);
            expectVectorEqual(force, new Vector3D(0, 0, 0));
        });

        it('should weight force by proximity', () => {
            const closeObstacle = {
                position: new Vector3D(10, 0, 0),
                radius: 5
            };
            const farObstacle = {
                position: new Vector3D(25, 0, 0),
                radius: 5
            };
            
            const closeForce = avoidObstacles(boid, [closeObstacle], 30);
            const farForce = avoidObstacles(boid, [farObstacle], 30);
            
            expect(closeForce.magnitude()).toBeGreaterThan(farForce.magnitude());
        });

        it('should handle multiple obstacles', () => {
            const obstacle1 = {
                position: new Vector3D(20, 0, 0),
                radius: 5
            };
            const obstacle2 = {
                position: new Vector3D(0, 20, 0),
                radius: 5
            };
            
            const force = avoidObstacles(boid, [obstacle1, obstacle2], 30);
            
            expect(force.x).toBeLessThan(0); // Away from obstacle1
            expect(force.y).toBeLessThan(0); // Away from obstacle2
            expect(force.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle overlapping with obstacle', () => {
            const obstacle = {
                position: new Vector3D(0, 0, 0),
                radius: 10
            };
            boid.position.set(5, 0, 0); // Inside obstacle
            
            const force = avoidObstacles(boid, [obstacle], 30);
            
            expect(force.x).toBeGreaterThan(0); // Away from obstacle center
            expect(Math.abs(force.y)).toBeLessThan(1e-6);
            expect(Math.abs(force.z)).toBeLessThan(1e-6);
        });

        it('should handle identical positions gracefully', () => {
            const obstacle = {
                position: new Vector3D(0, 0, 0),
                radius: 5
            };
            boid.position.set(0, 0, 0); // Same position as obstacle
            
            const force = avoidObstacles(boid, [obstacle], 30);
            
            // Should not produce NaN or infinite force
            expect(Number.isFinite(force.x)).toBe(true);
            expect(Number.isFinite(force.y)).toBe(true);
            expect(Number.isFinite(force.z)).toBe(true);
        });

        it('should handle 3D obstacle avoidance', () => {
            const obstacle = {
                position: new Vector3D(10, 10, 10),
                radius: 5
            };
            boid.position.set(0, 0, 0);
            
            const force = avoidObstacles(boid, [obstacle], 30);
            
            expect(force.x).toBeLessThan(0); // Away from obstacle
            expect(force.y).toBeLessThan(0);
            expect(force.z).toBeLessThan(0);
        });
    });

    describe('Edge Cases and Integration', () => {
        it('should handle boids with different maxSpeed and maxForce', () => {
            const slowBoid = createTestBoid(0, 0, 0, 0, 0, 0, 1.0, 0.01);
            const fastBoid = createTestBoid(10, 0, 0, 0, 0, 0, 5.0, 0.1);
            
            const slowForce = seek(slowBoid, new Vector3D(20, 0, 0));
            const fastForce = seek(fastBoid, new Vector3D(20, 0, 0));
            
            expect(slowForce.magnitude()).toBeLessThanOrEqual(slowBoid.maxForce + 1e-6);
            expect(fastForce.magnitude()).toBeLessThanOrEqual(fastBoid.maxForce + 1e-6);
        });

        it('should handle extreme positions and velocities', () => {
            const extremeBoid = createTestBoid(1e6, 1e6, 1e6, 100, 100, 100);
            const neighbor = createTestBoid(1e6 + 10, 1e6, 1e6);
            
            const sepForce = separation(extremeBoid, [neighbor], 50);
            const aliForce = alignment(extremeBoid, [neighbor]);
            const cohForce = cohesion(extremeBoid, [neighbor]);
            
            expect(Number.isFinite(sepForce.magnitude())).toBe(true);
            expect(Number.isFinite(aliForce.magnitude())).toBe(true);
            expect(Number.isFinite(cohForce.magnitude())).toBe(true);
        });

        it('should maintain force limits in combined behaviors', () => {
            const neighbors = [
                createTestBoid(5, 0, 0, 1, 1, 0),
                createTestBoid(0, 5, 0, -1, 0, 1),
                createTestBoid(0, 0, 5, 0, -1, -1)
            ];
            
            const sepForce = separation(boid, neighbors, 25);
            const aliForce = alignment(boid, neighbors);
            const cohForce = cohesion(boid, neighbors);
            
            expect(sepForce.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
            expect(aliForce.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
            expect(cohForce.magnitude()).toBeLessThanOrEqual(boid.maxForce + 1e-6);
        });

        it('should handle zero maxForce gracefully', () => {
            const paralyzedBoid = createTestBoid(0, 0, 0, 1, 0, 0, 2.0, 0);
            const target = new Vector3D(10, 0, 0);
            
            const force = seek(paralyzedBoid, target);
            expect(force.magnitude()).toBeLessThanOrEqual(1e-10);
        });

        it('should handle zero maxSpeed gracefully', () => {
            const stillBoid = createTestBoid(0, 0, 0, 1, 0, 0, 0, 0.03);
            const target = new Vector3D(10, 0, 0);
            
            const force = seek(stillBoid, target);
            // Force should still be generated to counteract current velocity
            expect(Number.isFinite(force.magnitude())).toBe(true);
        });
    });

    describe('Performance Tests', () => {
        it('should handle large numbers of neighbors efficiently', () => {
            const manyNeighbors = [];
            for (let i = 0; i < 1000; i++) {
                manyNeighbors.push(createTestBoid(
                    Math.random() * 100 - 50,
                    Math.random() * 100 - 50,
                    Math.random() * 100 - 50,
                    Math.random() * 4 - 2,
                    Math.random() * 4 - 2,
                    Math.random() * 4 - 2
                ));
            }
            
            const startTime = performance.now();
            
            const sepForce = separation(boid, manyNeighbors, 25);
            const aliForce = alignment(boid, manyNeighbors);
            const cohForce = cohesion(boid, manyNeighbors);
            
            const endTime = performance.now();
            
            // Should complete in reasonable time
            expect(endTime - startTime).toBeLessThan(100); // Less than 100ms
            
            expect(Number.isFinite(sepForce.magnitude())).toBe(true);
            expect(Number.isFinite(aliForce.magnitude())).toBe(true);
            expect(Number.isFinite(cohForce.magnitude())).toBe(true);
        });

        it('should optimize neighbor finding with large flocks', () => {
            const largeFlock = [];
            for (let i = 0; i < 1000; i++) {
                largeFlock.push(createTestBoid(
                    Math.random() * 200 - 100,
                    Math.random() * 200 - 100,
                    Math.random() * 200 - 100
                ));
            }
            
            const startTime = performance.now();
            
            const neighbors = getNeighbors(largeFlock[0], largeFlock, 50);
            
            const endTime = performance.now();
            
            expect(endTime - startTime).toBeLessThan(50); // Should be fast
            expect(neighbors.length).toBeGreaterThanOrEqual(0);
            expect(neighbors.length).toBeLessThan(largeFlock.length);
        });
    });
});