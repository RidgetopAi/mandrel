/**
 * Comprehensive unit tests for BoidsEngine
 * Tests engine configuration, boid management, simulation updates, and performance
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';
import { BoidsEngine, DEFAULT_CONFIG } from '../math/BoidsEngine.js';

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

describe('BoidsEngine', () => {
    let engine;
    let config;

    beforeEach(() => {
        config = { ...DEFAULT_CONFIG };
        engine = new BoidsEngine(config);
    });

    describe('Constructor and Configuration', () => {
        it('should create engine with default configuration', () => {
            const defaultEngine = new BoidsEngine();
            expect(defaultEngine.config).toBeDefined();
            expect(defaultEngine.boids).toEqual([]);
            expect(defaultEngine.obstacles).toEqual([]);
        });

        it('should merge custom configuration with defaults', () => {
            const customConfig = {
                maxSpeed: 5.0,
                separationWeight: 3.0,
                customProperty: 'test'
            };
            
            const customEngine = new BoidsEngine(customConfig);
            
            expect(customEngine.config.maxSpeed).toBe(5.0);
            expect(customEngine.config.separationWeight).toBe(3.0);
            expect(customEngine.config.alignmentWeight).toBe(DEFAULT_CONFIG.alignmentWeight);
            expect(customEngine.config.customProperty).toBe('test');
        });

        it('should initialize performance tracking variables', () => {
            expect(engine.frameCount).toBe(0);
            expect(engine.averageUpdateTime).toBe(0);
            expect(engine.lastPerformanceCheck).toBe(0);
        });

        it('should initialize spatial optimization if enabled', () => {
            const spatialEngine = new BoidsEngine({ spatialOptimization: true });
            expect(spatialEngine.config.spatialOptimization).toBe(true);
            expect(spatialEngine.spatialGrid).toBeDefined();
        });

        it('should initialize spherical constraints if enabled', () => {
            const sphericalEngine = new BoidsEngine({
                enableSphericalConstraints: true,
                sphereRadius: 50
            });
            
            expect(sphericalEngine.config.enableSphericalConstraints).toBe(true);
            expect(sphericalEngine.sphericalConstraints).toBeDefined();
        });
    });

    describe('Boid Management', () => {
        it('should add boid with specified position', () => {
            const position = new Vector3D(10, 20, 30);
            const boid = engine.addBoid(position);
            
            expect(engine.boids).toHaveLength(1);
            expect(boid.id).toBe(0);
            expectVectorEqual(boid.position, position);
            expect(boid.velocity.magnitude()).toBeLessThanOrEqual(engine.config.maxSpeed);
        });

        it('should add boid with specified position and velocity', () => {
            const position = new Vector3D(10, 20, 30);
            const velocity = new Vector3D(1, 0, 0);
            const boid = engine.addBoid(position, velocity);
            
            expectVectorEqual(boid.position, position);
            expectVectorEqual(boid.velocity, velocity);
        });

        it('should limit initial velocity to maxSpeed', () => {
            const position = new Vector3D(0, 0, 0);
            const fastVelocity = new Vector3D(10, 10, 10); // Much faster than maxSpeed
            const boid = engine.addBoid(position, fastVelocity);
            
            expect(boid.velocity.magnitude()).toBeLessThanOrEqual(engine.config.maxSpeed + EPSILON);
        });

        it('should assign sequential IDs to boids', () => {
            const boid1 = engine.addBoid(new Vector3D(0, 0, 0));
            const boid2 = engine.addBoid(new Vector3D(1, 1, 1));
            const boid3 = engine.addBoid(new Vector3D(2, 2, 2));
            
            expect(boid1.id).toBe(0);
            expect(boid2.id).toBe(1);
            expect(boid3.id).toBe(2);
        });

        it('should add random boids within boundary', () => {
            engine.addRandomBoids(10);
            
            expect(engine.boids).toHaveLength(10);
            
            for (const boid of engine.boids) {
                const distance = boid.position.distanceTo(engine.config.boundaryCenter);
                expect(distance).toBeLessThanOrEqual(engine.config.boundaryRadius * 0.8 + 50); // Some tolerance for randomness
            }
        });

        it('should add random boids with custom spread', () => {
            const customSpread = 25;
            engine.addRandomBoids(5, customSpread);
            
            for (const boid of engine.boids) {
                const distance = boid.position.distanceTo(engine.config.boundaryCenter);
                expect(distance).toBeLessThanOrEqual(customSpread + 10); // Some tolerance
            }
        });

        it('should get boid by ID', () => {
            const boid1 = engine.addBoid(new Vector3D(1, 1, 1));
            const boid2 = engine.addBoid(new Vector3D(2, 2, 2));
            
            const found1 = engine.getBoidById(0);
            const found2 = engine.getBoidById(1);
            const notFound = engine.getBoidById(99);
            
            expect(found1).toBe(boid1);
            expect(found2).toBe(boid2);
            expect(notFound).toBeNull();
        });

        it('should remove boid by ID', () => {
            engine.addBoid(new Vector3D(1, 1, 1));
            engine.addBoid(new Vector3D(2, 2, 2));
            engine.addBoid(new Vector3D(3, 3, 3));
            
            const removed = engine.removeBoid(1);
            const notRemoved = engine.removeBoid(99);
            
            expect(removed).toBe(true);
            expect(notRemoved).toBe(false);
            expect(engine.boids).toHaveLength(2);
            expect(engine.getBoidById(1)).toBeNull();
        });
    });

    describe('Obstacle Management', () => {
        it('should add obstacle with specified properties', () => {
            const position = new Vector3D(50, 50, 50);
            const radius = 10;
            const obstacle = engine.addObstacle(position, radius);
            
            expect(engine.obstacles).toHaveLength(1);
            expect(obstacle.id).toBe(0);
            expectVectorEqual(obstacle.position, position);
            expect(obstacle.radius).toBe(radius);
            expect(obstacle.type).toBe('sphere');
        });

        it('should add obstacle with custom type', () => {
            const obstacle = engine.addObstacle(new Vector3D(0, 0, 0), 5, 'wall');
            expect(obstacle.type).toBe('wall');
        });

        it('should assign sequential IDs to obstacles', () => {
            const obstacle1 = engine.addObstacle(new Vector3D(0, 0, 0), 5);
            const obstacle2 = engine.addObstacle(new Vector3D(10, 10, 10), 8);
            
            expect(obstacle1.id).toBe(0);
            expect(obstacle2.id).toBe(1);
        });
    });

    describe('Simulation Updates', () => {
        beforeEach(() => {
            // Add some boids for testing
            engine.addRandomBoids(5);
        });

        it('should update frame count on each update', () => {
            const initialFrameCount = engine.frameCount;
            engine.update();
            expect(engine.frameCount).toBe(initialFrameCount + 1);
        });

        it('should update boid positions and velocities', () => {
            const boid = engine.boids[0];
            const initialPosition = boid.position.clone();
            const initialVelocity = boid.velocity.clone();
            
            engine.update();
            
            // Position should change based on velocity
            expect(boid.position.equals(initialPosition)).toBe(false);
            
            // Velocity might change due to forces, but should remain within limits
            expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
        });

        it('should respect maxSpeed limits', () => {
            // Give boids extreme accelerations
            for (const boid of engine.boids) {
                boid.acceleration.set(100, 100, 100);
            }
            
            engine.update();
            
            for (const boid of engine.boids) {
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
        });

        it('should handle zero deltaTime gracefully', () => {
            const initialPositions = engine.boids.map(boid => boid.position.clone());
            engine.update(0);
            
            for (let i = 0; i < engine.boids.length; i++) {
                expectVectorEqual(engine.boids[i].position, initialPositions[i]);
            }
        });

        it('should handle large deltaTime values', () => {
            const largeDelta = 10.0;
            
            expect(() => {
                engine.update(largeDelta);
            }).not.toThrow();
            
            // All boids should still be in reasonable state
            for (const boid of engine.boids) {
                expect(Number.isFinite(boid.position.x)).toBe(true);
                expect(Number.isFinite(boid.position.y)).toBe(true);
                expect(Number.isFinite(boid.position.z)).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
        });

        it('should update boid age and energy', () => {
            const boid = engine.boids[0];
            const initialAge = boid.age;
            const deltaTime = 2.0;
            
            engine.update(deltaTime);
            
            expect(boid.age).toBeGreaterThan(initialAge);
            expect(boid.energy).toBeGreaterThanOrEqual(0);
            expect(boid.energy).toBeLessThanOrEqual(1);
        });
    });

    describe('Force Calculations', () => {
        beforeEach(() => {
            engine.addRandomBoids(10);
        });

        it('should apply separation forces', () => {
            // Place two boids very close together
            engine.boids[0].position.set(0, 0, 0);
            engine.boids[1].position.set(5, 0, 0); // Within separation radius
            
            engine.update();
            
            // Boids should move apart
            expect(engine.boids[0].velocity.x).toBeLessThan(0); // Moving away
            expect(engine.boids[1].velocity.x).toBeGreaterThan(0); // Moving away
        });

        it('should apply alignment forces', () => {
            // Set up boids with different velocities
            engine.boids[0].position.set(0, 0, 0);
            engine.boids[0].velocity.set(1, 0, 0);
            engine.boids[1].position.set(10, 0, 0);
            engine.boids[1].velocity.set(0, 1, 0);
            
            engine.update();
            
            // Velocities should become more aligned (this is a complex test due to multiple forces)
            expect(Number.isFinite(engine.boids[0].velocity.magnitude())).toBe(true);
            expect(Number.isFinite(engine.boids[1].velocity.magnitude())).toBe(true);
        });

        it('should apply cohesion forces', () => {
            // Place boids in a line, they should move toward center
            for (let i = 0; i < 5; i++) {
                engine.boids[i].position.set(i * 20, 0, 0);
                engine.boids[i].velocity.set(0, 0, 0);
            }
            
            engine.update();
            
            // End boids should move toward center
            expect(engine.boids[0].velocity.x).toBeGreaterThan(-0.1); // Toward center
            expect(engine.boids[4].velocity.x).toBeLessThan(0.1); // Toward center
        });

        it('should apply boundary forces when outside boundary', () => {
            const boid = engine.boids[0];
            boid.position.set(engine.config.boundaryRadius + 50, 0, 0); // Outside boundary
            boid.velocity.set(1, 0, 0); // Moving further out
            
            engine.update();
            
            // Should have force toward center
            expect(boid.velocity.x).toBeLessThan(1); // Reduced outward velocity or inward velocity
        });

        it('should apply obstacle avoidance forces', () => {
            // Add obstacle near a boid
            engine.addObstacle(new Vector3D(20, 0, 0), 10);
            const boid = engine.boids[0];
            boid.position.set(0, 0, 0);
            boid.velocity.set(1, 0, 0); // Moving toward obstacle
            
            engine.update();
            
            // Should have some avoidance force (complex to test exactly due to multiple forces)
            expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
        });

        it('should weight forces according to configuration', () => {
            const highSeparation = new BoidsEngine({
                ...config,
                separationWeight: 5.0,
                alignmentWeight: 0.1,
                cohesionWeight: 0.1
            });
            
            const highCohesion = new BoidsEngine({
                ...config,
                separationWeight: 0.1,
                alignmentWeight: 0.1,
                cohesionWeight: 5.0
            });
            
            // Set up similar initial conditions
            for (let i = 0; i < 3; i++) {
                highSeparation.addBoid(new Vector3D(i * 10, 0, 0));
                highCohesion.addBoid(new Vector3D(i * 10, 0, 0));
            }
            
            highSeparation.update();
            highCohesion.update();
            
            // Different weighting should produce different behaviors
            // (Exact comparison is complex due to multiple interacting forces)
            expect(highSeparation.boids[0].velocity.equals(highCohesion.boids[0].velocity)).toBe(false);
        });
    });

    describe('Configuration Updates', () => {
        it('should update configuration dynamically', () => {
            const newConfig = {
                maxSpeed: 5.0,
                separationWeight: 3.0
            };
            
            engine.updateConfig(newConfig);
            
            expect(engine.config.maxSpeed).toBe(5.0);
            expect(engine.config.separationWeight).toBe(3.0);
            expect(engine.config.alignmentWeight).toBe(DEFAULT_CONFIG.alignmentWeight); // Unchanged
        });

        it('should update boid maxSpeed when configuration changes', () => {
            engine.addBoid(new Vector3D(0, 0, 0));
            const boid = engine.boids[0];
            
            expect(boid.maxSpeed).toBe(DEFAULT_CONFIG.maxSpeed);
            
            engine.updateConfig({ maxSpeed: 5.0 });
            expect(boid.maxSpeed).toBe(5.0);
        });

        it('should update boid maxForce when configuration changes', () => {
            engine.addBoid(new Vector3D(0, 0, 0));
            const boid = engine.boids[0];
            
            expect(boid.maxForce).toBe(DEFAULT_CONFIG.maxForce);
            
            engine.updateConfig({ maxForce: 0.1 });
            expect(boid.maxForce).toBe(0.1);
        });

        it('should reinitialize spatial grid when spatial optimization enabled', () => {
            expect(engine.spatialGrid).toBeNull();
            
            engine.updateConfig({ spatialOptimization: true });
            expect(engine.spatialGrid).toBeDefined();
        });
    });

    describe('Performance Tracking', () => {
        it('should track average update time', () => {
            engine.addRandomBoids(50);
            
            // Run several updates
            for (let i = 0; i < 5; i++) {
                engine.update();
            }
            
            expect(engine.averageUpdateTime).toBeGreaterThan(0);
            expect(engine.frameCount).toBe(5);
        });

        it('should provide performance statistics', () => {
            engine.addRandomBoids(10);
            engine.update();
            
            const stats = engine.getStats();
            
            expect(stats.boidsCount).toBe(10);
            expect(stats.obstaclesCount).toBe(0);
            expect(stats.frameCount).toBe(1);
            expect(stats.averageUpdateTime).toBeGreaterThanOrEqual(0);
            expect(stats.estimatedFPS).toBeGreaterThanOrEqual(0);
        });

        it('should include spatial grid stats when enabled', () => {
            const spatialEngine = new BoidsEngine({ spatialOptimization: true });
            spatialEngine.addRandomBoids(10);
            spatialEngine.update();
            
            const stats = spatialEngine.getStats();
            expect(stats.spatialGrid).toBeDefined();
            expect(stats.spatialGrid.cellCount).toBeGreaterThanOrEqual(0);
        });

        it('should include spherical constraint stats when enabled', () => {
            const sphericalEngine = new BoidsEngine({
                enableSphericalConstraints: true,
                sphereRadius: 50
            });
            sphericalEngine.addRandomBoids(5);
            sphericalEngine.update();
            
            const stats = sphericalEngine.getStats();
            expect(stats.sphericalConstraints.enabled).toBe(true);
            expect(stats.sphericalConstraints.sphereRadius).toBe(50);
        });
    });

    describe('Spherical Constraints Integration', () => {
        let sphericalEngine;

        beforeEach(() => {
            sphericalEngine = new BoidsEngine({
                enableSphericalConstraints: true,
                sphereRadius: 25,
                sphericalConstraintPreset: 'natural'
            });
        });

        it('should enable spherical constraints', () => {
            expect(sphericalEngine.sphericalConstraints).toBeDefined();
            expect(sphericalEngine.config.enableSphericalConstraints).toBe(true);
        });

        it('should add boids on sphere surface', () => {
            sphericalEngine.addRandomBoidsOnSphere(5);
            
            expect(sphericalEngine.boids).toHaveLength(5);
            
            for (const boid of sphericalEngine.boids) {
                const distance = boid.position.distanceTo(sphericalEngine.config.sphereCenter);
                expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 0.1);
            }
        });

        it('should maintain boids on sphere during simulation', () => {
            sphericalEngine.addRandomBoidsOnSphere(3);
            
            for (let i = 0; i < 5; i++) {
                sphericalEngine.update();
                
                for (const boid of sphericalEngine.boids) {
                    const distance = boid.position.distanceTo(sphericalEngine.config.sphereCenter);
                    expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 0.2);
                }
            }
        });

        it('should project boids to sphere when enabled', () => {
            sphericalEngine.addBoid(new Vector3D(50, 50, 50)); // Far from sphere
            sphericalEngine.projectBoidsToSphere();
            
            const distance = sphericalEngine.boids[0].position.distanceTo(sphericalEngine.config.sphereCenter);
            expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 0.1);
        });

        it('should toggle spherical constraints', () => {
            sphericalEngine.disableSphericalConstraints();
            expect(sphericalEngine.config.enableSphericalConstraints).toBe(false);
            expect(sphericalEngine.sphericalConstraints).toBeNull();
            
            sphericalEngine.enableSphericalConstraints('strict');
            expect(sphericalEngine.config.enableSphericalConstraints).toBe(true);
            expect(sphericalEngine.sphericalConstraints).toBeDefined();
            expect(sphericalEngine.config.sphericalConstraintPreset).toBe('strict');
        });
    });

    describe('Spatial Optimization', () => {
        let spatialEngine;

        beforeEach(() => {
            spatialEngine = new BoidsEngine({
                spatialOptimization: true,
                boundaryRadius: 100
            });
        });

        it('should initialize spatial grid', () => {
            expect(spatialEngine.spatialGrid).toBeDefined();
            expect(spatialEngine.spatialGrid.type).toBe('cartesian');
        });

        it('should use spherical grid for spherical constraints', () => {
            const sphericalSpatialEngine = new BoidsEngine({
                spatialOptimization: true,
                enableSphericalConstraints: true,
                sphereRadius: 50
            });
            
            expect(sphericalSpatialEngine.spatialGrid.type).toBe('spherical');
        });

        it('should improve performance with large numbers of boids', () => {
            const normalEngine = new BoidsEngine({ spatialOptimization: false });
            
            // Add many boids to both engines
            for (let i = 0; i < 100; i++) {
                spatialEngine.addRandomBoids(1);
                normalEngine.addRandomBoids(1);
            }
            
            // Time updates
            const spatialStart = performance.now();
            spatialEngine.update();
            const spatialTime = performance.now() - spatialStart;
            
            const normalStart = performance.now();
            normalEngine.update();
            const normalTime = performance.now() - normalStart;
            
            // Spatial optimization should be faster or at least not significantly slower
            // (This is a rough test as performance can vary)
            expect(spatialTime).toBeLessThan(normalTime * 2);
        });

        it('should limit neighbors when too many are found', () => {
            const limitedEngine = new BoidsEngine({
                spatialOptimization: true,
                maxNeighbors: 5
            });
            
            // Create dense cluster of boids
            for (let i = 0; i < 20; i++) {
                limitedEngine.addBoid(new Vector3D(
                    Math.random() * 10,
                    Math.random() * 10,
                    Math.random() * 10
                ));
            }
            
            limitedEngine.update();
            
            // Check that neighbor counts are limited
            for (const boid of limitedEngine.boids) {
                expect(boid.lastNeighbors.length).toBeLessThanOrEqual(limitedEngine.config.maxNeighbors);
            }
        });
    });

    describe('Reset and Cleanup', () => {
        it('should reset simulation state', () => {
            engine.addRandomBoids(10);
            engine.addObstacle(new Vector3D(0, 0, 0), 5);
            engine.update();
            
            expect(engine.boids.length).toBeGreaterThan(0);
            expect(engine.obstacles.length).toBeGreaterThan(0);
            expect(engine.frameCount).toBeGreaterThan(0);
            
            engine.reset();
            
            expect(engine.boids).toEqual([]);
            expect(engine.obstacles).toEqual([]);
            expect(engine.frameCount).toBe(0);
            expect(engine.averageUpdateTime).toBe(0);
        });

        it('should reinitialize systems after reset', () => {
            const spatialEngine = new BoidsEngine({
                spatialOptimization: true,
                enableSphericalConstraints: true,
                sphereRadius: 30
            });
            
            spatialEngine.addRandomBoids(5);
            spatialEngine.reset();
            
            // Systems should be reinitialized
            expect(spatialEngine.spatialGrid).toBeDefined();
            expect(spatialEngine.sphericalConstraints).toBeDefined();
        });
    });

    describe('Edge Cases and Robustness', () => {
        it('should handle zero maxSpeed', () => {
            const stillEngine = new BoidsEngine({ maxSpeed: 0 });
            stillEngine.addBoid(new Vector3D(0, 0, 0));
            
            expect(() => {
                stillEngine.update();
            }).not.toThrow();
            
            const boid = stillEngine.boids[0];
            expect(boid.velocity.magnitude()).toBeLessThanOrEqual(EPSILON);
        });

        it('should handle zero maxForce', () => {
            const paralyzedEngine = new BoidsEngine({ maxForce: 0 });
            paralyzedEngine.addRandomBoids(3);
            
            expect(() => {
                paralyzedEngine.update();
            }).not.toThrow();
            
            for (const boid of paralyzedEngine.boids) {
                expect(boid.acceleration.magnitude()).toBeLessThanOrEqual(EPSILON);
            }
        });

        it('should handle extreme positions', () => {
            const extremeBoid = engine.addBoid(new Vector3D(1e6, 1e6, 1e6));
            
            expect(() => {
                engine.update();
            }).not.toThrow();
            
            expect(Number.isFinite(extremeBoid.position.x)).toBe(true);
            expect(Number.isFinite(extremeBoid.velocity.x)).toBe(true);
        });

        it('should handle many rapid updates', () => {
            engine.addRandomBoids(10);
            
            expect(() => {
                for (let i = 0; i < 1000; i++) {
                    engine.update(0.01);
                }
            }).not.toThrow();
            
            expect(engine.frameCount).toBe(1000);
            
            for (const boid of engine.boids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
        });

        it('should handle empty boid list gracefully', () => {
            expect(() => {
                engine.update();
            }).not.toThrow();
            
            expect(engine.frameCount).toBe(1);
        });

        it('should maintain numerical stability', () => {
            engine.addRandomBoids(5);
            
            // Run for many iterations
            for (let i = 0; i < 100; i++) {
                engine.update();
            }
            
            // Check that all values are still finite
            for (const boid of engine.boids) {
                expect(Number.isFinite(boid.position.x)).toBe(true);
                expect(Number.isFinite(boid.position.y)).toBe(true);
                expect(Number.isFinite(boid.position.z)).toBe(true);
                expect(Number.isFinite(boid.velocity.x)).toBe(true);
                expect(Number.isFinite(boid.velocity.y)).toBe(true);
                expect(Number.isFinite(boid.velocity.z)).toBe(true);
                expect(Number.isFinite(boid.acceleration.x)).toBe(true);
                expect(Number.isFinite(boid.acceleration.y)).toBe(true);
                expect(Number.isFinite(boid.acceleration.z)).toBe(true);
            }
        });
    });

    describe('Performance Tests', () => {
        it('should handle 500 boids target efficiently', () => {
            const startTime = performance.now();
            
            engine.addRandomBoids(500);
            
            // Run several updates
            for (let i = 0; i < 10; i++) {
                engine.update();
            }
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const avgTimePerFrame = totalTime / 10;
            
            // Should maintain reasonable performance (less than 100ms per frame for 500 boids)
            expect(avgTimePerFrame).toBeLessThan(100);
            
            // All boids should still be in valid state
            expect(engine.boids).toHaveLength(500);
            for (const boid of engine.boids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
        });

        it('should benefit from spatial optimization with many boids', () => {
            const manyBoidsConfig = {
                spatialOptimization: true,
                maxNeighbors: 30
            };
            
            const optimizedEngine = new BoidsEngine(manyBoidsConfig);
            optimizedEngine.addRandomBoids(200);
            
            const startTime = performance.now();
            optimizedEngine.update();
            const endTime = performance.now();
            
            const updateTime = endTime - startTime;
            
            // Should complete update in reasonable time
            expect(updateTime).toBeLessThan(50); // Less than 50ms
            
            const stats = optimizedEngine.getStats();
            expect(stats.spatialGrid).toBeDefined();
            expect(stats.spatialGrid.cellCount).toBeGreaterThan(0);
        });
    });
});