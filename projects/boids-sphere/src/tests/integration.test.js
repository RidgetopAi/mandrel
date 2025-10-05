/**
 * Comprehensive integration tests for the boids-sphere system
 * Tests end-to-end functionality, performance benchmarks, and system integration
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';
import { BoidsEngine, DEFAULT_CONFIG } from '../math/BoidsEngine.js';
import { ConsoleRunner } from '../simulation/ConsoleRunner.js';
import {
    separation,
    alignment,
    cohesion,
    getNeighbors
} from '../math/BoidsRules.js';
import {
    projectToSphere,
    geodesicDistance,
    sphericalToCartesian,
    cartesianToSpherical
} from '../math/SphericalMath.js';
import {
    createSphericalConstraintSystem,
    getConstraintPreset
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
 * Helper function to run simulation for specified steps
 */
function runSimulation(engine, steps, deltaTime = 1.0) {
    const results = {
        initialStats: engine.getStats(),
        finalStats: null,
        trajectory: [],
        performance: []
    };
    
    for (let i = 0; i < steps; i++) {
        const startTime = performance.now();
        engine.update(deltaTime);
        const endTime = performance.now();
        
        results.performance.push(endTime - startTime);
        
        if (i % (Math.floor(steps / 10) || 1) === 0) {
            results.trajectory.push({
                step: i,
                stats: engine.getStats(),
                boidPositions: engine.boids.map(boid => boid.position.clone()),
                boidVelocities: engine.boids.map(boid => boid.velocity.clone())
            });
        }
    }
    
    results.finalStats = engine.getStats();
    return results;
}

describe('Integration Tests', () => {
    describe('Free Space Simulation', () => {
        let engine;

        beforeEach(() => {
            engine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: false,
                boundaryRadius: 100
            });
        });

        it('should simulate basic flocking behavior', () => {
            engine.addRandomBoids(20);
            const results = runSimulation(engine, 50);
            
            expect(results.finalStats.frameCount).toBe(50);
            expect(results.finalStats.boidsCount).toBe(20);
            
            // Boids should maintain reasonable speeds
            for (const boid of engine.boids) {
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(engine.config.maxSpeed + EPSILON);
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
            }
            
            // Should show flocking behavior (boids moving in similar directions)
            const avgVelocity = new Vector3D();
            for (const boid of engine.boids) {
                avgVelocity.add(boid.velocity);
            }
            avgVelocity.divide(engine.boids.length);
            
            expect(avgVelocity.magnitude()).toBeGreaterThan(0.1); // Some coordinated movement
        });

        it('should demonstrate separation behavior', () => {
            // Create two very close boids
            engine.addBoid(new Vector3D(0, 0, 0), new Vector3D(0, 0, 0));
            engine.addBoid(new Vector3D(1, 0, 0), new Vector3D(0, 0, 0));
            
            const initialDistance = engine.boids[0].position.distanceTo(engine.boids[1].position);
            
            runSimulation(engine, 20);
            
            const finalDistance = engine.boids[0].position.distanceTo(engine.boids[1].position);
            expect(finalDistance).toBeGreaterThan(initialDistance);
        });

        it('should demonstrate alignment behavior', () => {
            // Create boids with different velocities
            engine.addBoid(new Vector3D(0, 0, 0), new Vector3D(1, 0, 0));
            engine.addBoid(new Vector3D(10, 0, 0), new Vector3D(0, 1, 0));
            engine.addBoid(new Vector3D(0, 10, 0), new Vector3D(-1, 0, 0));
            
            const initialVelocities = engine.boids.map(boid => boid.velocity.clone());
            
            runSimulation(engine, 30);
            
            // Calculate alignment metric
            const finalVelocities = engine.boids.map(boid => boid.velocity.clone());
            let alignmentImprovement = 0;
            
            for (let i = 0; i < engine.boids.length; i++) {
                for (let j = i + 1; j < engine.boids.length; j++) {
                    const initialAlignment = initialVelocities[i].clone().normalize().dot(initialVelocities[j].clone().normalize());
                    const finalAlignment = finalVelocities[i].clone().normalize().dot(finalVelocities[j].clone().normalize());
                    
                    if (finalAlignment > initialAlignment) {
                        alignmentImprovement++;
                    }
                }
            }
            
            expect(alignmentImprovement).toBeGreaterThan(0);
        });

        it('should demonstrate cohesion behavior', () => {
            // Create spread out boids
            engine.addBoid(new Vector3D(-20, 0, 0), new Vector3D(0, 0, 0));
            engine.addBoid(new Vector3D(20, 0, 0), new Vector3D(0, 0, 0));
            engine.addBoid(new Vector3D(0, 20, 0), new Vector3D(0, 0, 0));
            engine.addBoid(new Vector3D(0, -20, 0), new Vector3D(0, 0, 0));
            
            // Calculate initial spread
            const initialCenter = new Vector3D();
            for (const boid of engine.boids) {
                initialCenter.add(boid.position);
            }
            initialCenter.divide(engine.boids.length);
            
            let initialSpread = 0;
            for (const boid of engine.boids) {
                initialSpread += boid.position.distanceTo(initialCenter);
            }
            initialSpread /= engine.boids.length;
            
            runSimulation(engine, 50);
            
            // Calculate final spread
            const finalCenter = new Vector3D();
            for (const boid of engine.boids) {
                finalCenter.add(boid.position);
            }
            finalCenter.divide(engine.boids.length);
            
            let finalSpread = 0;
            for (const boid of engine.boids) {
                finalSpread += boid.position.distanceTo(finalCenter);
            }
            finalSpread /= engine.boids.length;
            
            expect(finalSpread).toBeLessThan(initialSpread); // Group should be more cohesive
        });

        it('should handle boundary enforcement', () => {
            // Place boids outside boundary
            engine.addBoid(new Vector3D(150, 0, 0), new Vector3D(1, 0, 0));
            engine.addBoid(new Vector3D(-150, 0, 0), new Vector3D(-1, 0, 0));
            
            runSimulation(engine, 100);
            
            // Boids should be pulled back toward boundary
            for (const boid of engine.boids) {
                const distanceFromCenter = boid.position.distanceTo(engine.config.boundaryCenter);
                expect(distanceFromCenter).toBeLessThan(engine.config.boundaryRadius * 1.5);
            }
        });

        it('should handle obstacle avoidance', () => {
            engine.addBoid(new Vector3D(-30, 0, 0), new Vector3D(1, 0, 0));
            engine.addObstacle(new Vector3D(0, 0, 0), 10);
            
            const initialVelocity = engine.boids[0].velocity.clone();
            runSimulation(engine, 50);
            
            // Boid should avoid obstacle
            const finalPosition = engine.boids[0].position;
            const obstacleDistance = finalPosition.distanceTo(engine.obstacles[0].position);
            expect(obstacleDistance).toBeGreaterThan(engine.obstacles[0].radius);
        });
    });

    describe('Spherical Surface Simulation', () => {
        let sphericalEngine;

        beforeEach(() => {
            sphericalEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphereRadius: 50,
                sphericalConstraintPreset: 'natural',
                separationRadius: 15,
                alignmentRadius: 25,
                cohesionRadius: 25
            });
        });

        it('should maintain boids on sphere surface', () => {
            sphericalEngine.addRandomBoidsOnSphere(15);
            const results = runSimulation(sphericalEngine, 100);
            
            // Check all trajectory points
            for (const snapshot of results.trajectory) {
                for (const position of snapshot.boidPositions) {
                    const distance = position.distanceTo(sphericalEngine.config.sphereCenter);
                    expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 2.0);
                }
            }
            
            // Check final positions
            for (const boid of sphericalEngine.boids) {
                const distance = boid.position.distanceTo(sphericalEngine.config.sphereCenter);
                expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 1.0);
            }
        });

        it('should maintain tangential velocities', () => {
            sphericalEngine.addRandomBoidsOnSphere(10);
            runSimulation(sphericalEngine, 50);
            
            for (const boid of sphericalEngine.boids) {
                const normal = Vector3D.subtract(boid.position, sphericalEngine.config.sphereCenter).normalize();
                const radialComponent = Math.abs(boid.velocity.dot(normal));
                
                expect(radialComponent).toBeLessThan(0.1); // Should be mostly tangential
            }
        });

        it('should demonstrate spherical flocking behavior', () => {
            sphericalEngine.addRandomBoidsOnSphere(20);
            const results = runSimulation(sphericalEngine, 100);
            
            // Measure clustering over time
            let finalClustering = 0;
            const center = sphericalEngine.config.sphereCenter;
            const radius = sphericalEngine.config.sphereRadius;
            
            for (let i = 0; i < sphericalEngine.boids.length; i++) {
                for (let j = i + 1; j < sphericalEngine.boids.length; j++) {
                    const geodesicDist = geodesicDistance(
                        sphericalEngine.boids[i].position,
                        sphericalEngine.boids[j].position,
                        radius
                    );
                    finalClustering += geodesicDist;
                }
            }
            finalClustering /= (sphericalEngine.boids.length * (sphericalEngine.boids.length - 1) / 2);
            
            // Should show some level of organization
            expect(finalClustering).toBeLessThan(Math.PI * radius); // Less than maximum possible
            expect(results.finalStats.frameCount).toBe(100);
        });

        it('should handle different constraint presets', () => {
            const presets = ['strict', 'loose', 'natural', 'boundary-only'];
            const results = {};
            
            for (const preset of presets) {
                const engine = new BoidsEngine({
                    ...DEFAULT_CONFIG,
                    enableSphericalConstraints: true,
                    sphereRadius: 30,
                    sphericalConstraintPreset: preset
                });
                
                engine.addRandomBoidsOnSphere(5);
                const simResult = runSimulation(engine, 20);
                
                results[preset] = {
                    avgDistanceFromSphere: 0,
                    avgRadialVelocity: 0
                };
                
                for (const boid of engine.boids) {
                    const distance = boid.position.distanceTo(engine.config.sphereCenter);
                    const normal = Vector3D.subtract(boid.position, engine.config.sphereCenter).normalize();
                    const radialVel = Math.abs(boid.velocity.dot(normal));
                    
                    results[preset].avgDistanceFromSphere += Math.abs(distance - engine.config.sphereRadius);
                    results[preset].avgRadialVelocity += radialVel;
                }
                
                results[preset].avgDistanceFromSphere /= engine.boids.length;
                results[preset].avgRadialVelocity /= engine.boids.length;
            }
            
            // Strict should have better surface adherence
            expect(results.strict.avgDistanceFromSphere).toBeLessThan(results.loose.avgDistanceFromSphere);
            expect(results.strict.avgRadialVelocity).toBeLessThan(results.loose.avgRadialVelocity);
        });

        it('should handle transitions between constraint modes', () => {
            sphericalEngine.addRandomBoidsOnSphere(10);
            
            // Start with strict constraints
            sphericalEngine.updateSphericalConstraints({ preset: 'strict' });
            runSimulation(sphericalEngine, 25);
            
            const strictPositions = sphericalEngine.boids.map(boid => boid.position.clone());
            
            // Switch to loose constraints
            sphericalEngine.updateSphericalConstraints({ preset: 'loose' });
            runSimulation(sphericalEngine, 25);
            
            const loosePositions = sphericalEngine.boids.map(boid => boid.position.clone());
            
            // Positions should have changed
            let positionsChanged = false;
            for (let i = 0; i < strictPositions.length; i++) {
                if (!strictPositions[i].equals(loosePositions[i], 0.1)) {
                    positionsChanged = true;
                    break;
                }
            }
            
            expect(positionsChanged).toBe(true);
        });

        it('should work with different sphere sizes', () => {
            const radii = [5, 25, 100];
            
            for (const radius of radii) {
                const engine = new BoidsEngine({
                    ...DEFAULT_CONFIG,
                    enableSphericalConstraints: true,
                    sphereRadius: radius,
                    separationRadius: radius * 0.3,
                    alignmentRadius: radius * 0.5,
                    cohesionRadius: radius * 0.5
                });
                
                engine.addRandomBoidsOnSphere(8);
                runSimulation(engine, 30);
                
                for (const boid of engine.boids) {
                    const distance = boid.position.distanceTo(engine.config.sphereCenter);
                    expectFloatEqual(distance, radius, radius * 0.1);
                }
            }
        });
    });

    describe('Performance Benchmarks', () => {
        it('should handle 500 boids efficiently', () => {
            const performanceEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                spatialOptimization: true,
                maxNeighbors: 30
            });
            
            performanceEngine.addRandomBoids(500);
            
            const startTime = performance.now();
            const results = runSimulation(performanceEngine, 20, 1.0);
            const endTime = performance.now();
            
            const totalTime = endTime - startTime;
            const avgTimePerFrame = totalTime / 20;
            const avgTimePerBoid = avgTimePerFrame / 500;
            
            // Performance targets
            expect(avgTimePerFrame).toBeLessThan(50); // Less than 50ms per frame
            expect(avgTimePerBoid).toBeLessThan(0.1); // Less than 0.1ms per boid per frame
            
            // All boids should be in valid state
            expect(performanceEngine.boids).toHaveLength(500);
            for (const boid of performanceEngine.boids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
            
            // Performance should be reasonably consistent
            const maxTime = Math.max(...results.performance);
            const minTime = Math.min(...results.performance);
            const timeVariance = maxTime - minTime;
            
            expect(timeVariance).toBeLessThan(avgTimePerFrame * 3); // Not too much variation
        });

        it('should demonstrate spatial optimization benefits', () => {
            const configs = [
                { spatialOptimization: false, name: 'no optimization' },
                { spatialOptimization: true, name: 'with optimization' }
            ];
            
            const results = {};
            
            for (const config of configs) {
                const engine = new BoidsEngine({
                    ...DEFAULT_CONFIG,
                    ...config,
                    maxNeighbors: 50
                });
                
                engine.addRandomBoids(200);
                
                const startTime = performance.now();
                runSimulation(engine, 10);
                const endTime = performance.now();
                
                results[config.name] = endTime - startTime;
            }
            
            // Optimization should provide some benefit (or at least not hurt significantly)
            expect(results['with optimization']).toBeLessThan(results['no optimization'] * 2);
        });

        it('should scale reasonably with boid count', () => {
            const boidCounts = [50, 100, 200];
            const times = {};
            
            for (const count of boidCounts) {
                const engine = new BoidsEngine({
                    ...DEFAULT_CONFIG,
                    spatialOptimization: true,
                    maxNeighbors: 30
                });
                
                engine.addRandomBoids(count);
                
                const startTime = performance.now();
                runSimulation(engine, 5);
                const endTime = performance.now();
                
                times[count] = (endTime - startTime) / 5; // Time per frame
            }
            
            // Time per boid should not increase dramatically
            const timePerBoid50 = times[50] / 50;
            const timePerBoid200 = times[200] / 200;
            
            expect(timePerBoid200).toBeLessThan(timePerBoid50 * 5); // Should not be 5x worse
        });

        it('should handle spherical constraints efficiently', () => {
            const sphericalEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphereRadius: 40,
                spatialOptimization: true,
                maxNeighbors: 25
            });
            
            sphericalEngine.addRandomBoidsOnSphere(300);
            
            const startTime = performance.now();
            runSimulation(sphericalEngine, 15);
            const endTime = performance.now();
            
            const avgTimePerFrame = (endTime - startTime) / 15;
            
            // Should still be efficient with constraints
            expect(avgTimePerFrame).toBeLessThan(80); // Less than 80ms per frame for 300 boids
            
            // Verify constraints are working
            for (const boid of sphericalEngine.boids) {
                const distance = boid.position.distanceTo(sphericalEngine.config.sphereCenter);
                expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 2.0);
            }
        });
    });

    describe('Mathematical Accuracy Tests', () => {
        it('should maintain mathematical properties of spherical projection', () => {
            const points = [];
            const radius = 25;
            
            // Generate test points
            for (let i = 0; i < 50; i++) {
                const theta = (Math.PI * 2 * i) / 50;
                const phi = Math.PI / 2; // Equatorial
                points.push(sphericalToCartesian(theta, phi, radius));
            }
            
            // Test that projections maintain mathematical properties
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const projected = projectToSphere(point, new Vector3D(0, 0, 0), radius);
                
                // Should be exactly on sphere
                expectFloatEqual(projected.magnitude(), radius, 1e-10);
                
                // Should maintain direction for points already on sphere
                if (Math.abs(point.magnitude() - radius) < 1e-10) {
                    expectVectorEqual(point, projected, 1e-10);
                }
            }
        });

        it('should maintain geodesic distance properties', () => {
            const radius = 30;
            const center = new Vector3D(0, 0, 0);
            
            // Test triangle inequality
            const a = sphericalToCartesian(0, Math.PI / 2, radius);
            const b = sphericalToCartesian(Math.PI / 2, Math.PI / 2, radius);
            const c = sphericalToCartesian(Math.PI, Math.PI / 2, radius);
            
            const dAB = geodesicDistance(a, b, radius);
            const dBC = geodesicDistance(b, c, radius);
            const dAC = geodesicDistance(a, c, radius);
            
            // Triangle inequality
            expect(dAB + dBC).toBeGreaterThan(dAC - 1e-6);
            expect(dAB + dAC).toBeGreaterThan(dBC - 1e-6);
            expect(dBC + dAC).toBeGreaterThan(dAB - 1e-6);
            
            // Known distances for equatorial quarter circles
            expectFloatEqual(dAB, Math.PI * radius / 2, 1e-6);
            expectFloatEqual(dBC, Math.PI * radius / 2, 1e-6);
            expectFloatEqual(dAC, Math.PI * radius, 1e-6);
        });

        it('should maintain conservation properties in simulation', () => {
            const engine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                boundaryWeight: 0, // No external forces
                obstacleWeight: 0
            });
            
            engine.addRandomBoids(10);
            
            // Calculate initial momentum
            const initialMomentum = new Vector3D();
            for (const boid of engine.boids) {
                initialMomentum.add(boid.velocity);
            }
            
            runSimulation(engine, 50);
            
            // Calculate final momentum
            const finalMomentum = new Vector3D();
            for (const boid of engine.boids) {
                finalMomentum.add(boid.velocity);
            }
            
            // Momentum should be approximately conserved (flocking forces are internal)
            expectVectorEqual(initialMomentum, finalMomentum, 2.0);
        });

        it('should handle coordinate system conversions accurately', () => {
            const testCases = [
                { x: 10, y: 0, z: 0 },
                { x: 0, y: 10, z: 0 },
                { x: 0, y: 0, z: 10 },
                { x: 6, y: 8, z: 0 },
                { x: 3, y: 4, z: 5 },
                { x: -5, y: -5, z: -5 }
            ];
            
            for (const testCase of testCases) {
                const original = new Vector3D(testCase.x, testCase.y, testCase.z);
                const spherical = cartesianToSpherical(original.x, original.y, original.z);
                const backToCartesian = sphericalToCartesian(spherical.theta, spherical.phi, spherical.radius);
                
                expectVectorEqual(original, backToCartesian, 1e-10);
            }
        });
    });

    describe('Console Runner Integration', () => {
        it('should create and configure console runner', () => {
            const runner = new ConsoleRunner({
                maxSpeed: 3.0,
                separationWeight: 2.0
            });
            
            expect(runner.engine).toBeDefined();
            expect(runner.engine.config.maxSpeed).toBe(3.0);
            expect(runner.engine.config.separationWeight).toBe(2.0);
            expect(runner.presets).toBeDefined();
            expect(runner.presets.sphere).toBeDefined();
        });

        it('should handle different simulation presets', () => {
            const runner = new ConsoleRunner();
            
            const presets = ['default', 'dense', 'sparse', 'sphere', 'performance'];
            
            for (const presetName of presets) {
                const preset = runner.presets[presetName];
                expect(preset).toBeDefined();
                
                // Each preset should have valid configuration
                expect(preset.maxSpeed).toBeGreaterThan(0);
                expect(preset.maxForce).toBeGreaterThan(0);
                expect(preset.separationRadius).toBeGreaterThan(0);
            }
        });

        it('should handle performance data recording', () => {
            const runner = new ConsoleRunner();
            runner.engine.addRandomBoids(10);
            
            // Simulate performance recording
            for (let i = 0; i < 5; i++) {
                const startTime = performance.now();
                runner.engine.update();
                const endTime = performance.now();
                
                runner.recordPerformance(endTime - startTime, 1.0);
            }
            
            expect(runner.performanceData).toHaveLength(5);
            expect(runner.performanceData[0].updateTime).toBeGreaterThan(0);
            expect(runner.performanceData[0].fps).toBeGreaterThan(0);
        });

        it('should handle export data recording', () => {
            const runner = new ConsoleRunner();
            runner.engine.addRandomBoids(5);
            runner.exportEnabled = true;
            
            for (let i = 0; i < 3; i++) {
                runner.engine.update();
                runner.recordExportData(i);
            }
            
            expect(runner.exportData).toHaveLength(3);
            expect(runner.exportData[0].boidCount).toBe(5);
            expect(runner.exportData[0].sampleBoids).toHaveLength(5);
        });
    });

    describe('System Robustness Tests', () => {
        it('should handle extreme parameter configurations', () => {
            const extremeConfigs = [
                { maxSpeed: 0.001, maxForce: 0.00001 }, // Very slow
                { maxSpeed: 100, maxForce: 10 }, // Very fast
                { separationRadius: 0.1, alignmentRadius: 0.1, cohesionRadius: 0.1 }, // Very small radii
                { separationRadius: 500, alignmentRadius: 500, cohesionRadius: 500 } // Very large radii
            ];
            
            for (const config of extremeConfigs) {
                const engine = new BoidsEngine({ ...DEFAULT_CONFIG, ...config });
                engine.addRandomBoids(5);
                
                expect(() => {
                    runSimulation(engine, 10);
                }).not.toThrow();
                
                // Check final state is valid
                for (const boid of engine.boids) {
                    expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                    expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
                    expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
                }
            }
        });

        it('should handle empty and single boid scenarios', () => {
            // Empty simulation
            const emptyEngine = new BoidsEngine();
            expect(() => {
                runSimulation(emptyEngine, 10);
            }).not.toThrow();
            
            // Single boid
            const singleEngine = new BoidsEngine();
            singleEngine.addBoid(new Vector3D(0, 0, 0));
            
            const results = runSimulation(singleEngine, 20);
            expect(results.finalStats.boidsCount).toBe(1);
            
            const boid = singleEngine.boids[0];
            expect(Number.isFinite(boid.position.magnitude())).toBe(true);
        });

        it('should handle rapid configuration changes', () => {
            const engine = new BoidsEngine();
            engine.addRandomBoids(10);
            
            // Rapidly change configuration during simulation
            for (let i = 0; i < 20; i++) {
                engine.updateConfig({
                    maxSpeed: 1 + Math.random() * 3,
                    separationWeight: Math.random() * 3,
                    alignmentWeight: Math.random() * 3,
                    cohesionWeight: Math.random() * 3
                });
                
                engine.update();
            }
            
            // Should still be in valid state
            for (const boid of engine.boids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
            }
        });

        it('should maintain stability under stress conditions', () => {
            const stressEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                spatialOptimization: true,
                enableSphericalConstraints: true,
                sphereRadius: 30
            });
            
            // Add many boids in difficult configuration
            for (let i = 0; i < 100; i++) {
                const position = Vector3D.random(25);
                const velocity = Vector3D.random(5);
                stressEngine.addBoid(position, velocity);
            }
            
            // Add obstacles
            for (let i = 0; i < 10; i++) {
                stressEngine.addObstacle(Vector3D.random(20), 5);
            }
            
            // Run intensive simulation
            const results = runSimulation(stressEngine, 100, 0.5);
            
            // System should remain stable
            expect(results.finalStats.frameCount).toBe(100);
            expect(stressEngine.boids).toHaveLength(100);
            
            for (const boid of stressEngine.boids) {
                expect(Number.isFinite(boid.position.magnitude())).toBe(true);
                expect(Number.isFinite(boid.velocity.magnitude())).toBe(true);
                expect(boid.velocity.magnitude()).toBeLessThanOrEqual(boid.maxSpeed + EPSILON);
                
                // Should be on or near sphere
                const distance = boid.position.distanceTo(stressEngine.config.sphereCenter);
                expect(distance).toBeLessThan(stressEngine.config.sphereRadius * 1.5);
            }
        });

        it('should handle numerical edge cases gracefully', () => {
            const edgeCaseEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphereRadius: 1e-6 // Very small sphere
            });
            
            // Add boids at various scales
            edgeCaseEngine.addBoid(new Vector3D(1e-9, 1e-9, 1e-9));
            edgeCaseEngine.addBoid(new Vector3D(1e6, 0, 0));
            edgeCaseEngine.addBoid(new Vector3D(0, 0, 0));
            
            expect(() => {
                runSimulation(edgeCaseEngine, 10);
            }).not.toThrow();
            
            for (const boid of edgeCaseEngine.boids) {
                expect(Number.isFinite(boid.position.x)).toBe(true);
                expect(Number.isFinite(boid.velocity.x)).toBe(true);
            }
        });
    });

    describe('Comparison Tests', () => {
        it('should show different behavior between free space and spherical modes', () => {
            const freeSpaceEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: false,
                boundaryRadius: 50
            });
            
            const sphericalEngine = new BoidsEngine({
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphereRadius: 50,
                boundaryRadius: 100
            });
            
            // Add same initial conditions
            for (let i = 0; i < 10; i++) {
                const pos = Vector3D.random(30);
                const vel = Vector3D.random(1);
                
                freeSpaceEngine.addBoid(pos.clone(), vel.clone());
                sphericalEngine.addBoidOnSphere(pos.clone(), vel.clone());
            }
            
            const freeResults = runSimulation(freeSpaceEngine, 50);
            const sphericalResults = runSimulation(sphericalEngine, 50);
            
            // Behaviors should be different
            let significantDifference = false;
            for (let i = 0; i < 10; i++) {
                const freePos = freeSpaceEngine.boids[i].position;
                const spherePos = sphericalEngine.boids[i].position;
                
                if (freePos.distanceTo(spherePos) > 10) {
                    significantDifference = true;
                    break;
                }
            }
            
            expect(significantDifference).toBe(true);
            
            // Spherical boids should be on sphere
            for (const boid of sphericalEngine.boids) {
                const distance = boid.position.distanceTo(sphericalEngine.config.sphereCenter);
                expectFloatEqual(distance, sphericalEngine.config.sphereRadius, 2.0);
            }
        });

        it('should demonstrate performance differences between optimization modes', () => {
            const sizes = [50, 100];
            const results = {};
            
            for (const size of sizes) {
                results[size] = {};
                
                for (const useOptimization of [false, true]) {
                    const engine = new BoidsEngine({
                        ...DEFAULT_CONFIG,
                        spatialOptimization: useOptimization,
                        maxNeighbors: 30
                    });
                    
                    engine.addRandomBoids(size);
                    
                    const startTime = performance.now();
                    runSimulation(engine, 5);
                    const endTime = performance.now();
                    
                    results[size][useOptimization ? 'optimized' : 'unoptimized'] = endTime - startTime;
                }
            }
            
            // Optimization should help more with larger sizes
            const improvement50 = results[50].unoptimized / results[50].optimized;
            const improvement100 = results[100].unoptimized / results[100].optimized;
            
            expect(improvement100).toBeGreaterThanOrEqual(improvement50 * 0.8); // Should scale reasonably
        });
    });
});