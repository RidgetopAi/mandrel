/**
 * Spherical Boids Demo - Example of using spherical constraints
 * Demonstrates how to create and run a boids simulation constrained to a sphere surface
 */
import { Vector3D } from '../math/Vector3D.js';
import { BoidsEngine } from '../math/BoidsEngine.js';
import { getConstraintPreset } from '../math/SphericalConstraints.js';

/**
 * Create a demo simulation with boids on a sphere
 */
function createSphericalBoidsDemo() {
    console.log('=== Spherical Boids Simulation Demo ===\n');
    
    // Configuration for spherical boids
    const config = {
        // Enable spherical constraints
        enableSphericalConstraints: true,
        sphereCenter: new Vector3D(0, 0, 0),
        sphereRadius: 25.0,
        sphericalConstraintPreset: 'natural',
        
        // Boids behavior parameters
        separationWeight: 2.0,
        alignmentWeight: 1.0,
        cohesionWeight: 1.0,
        wanderWeight: 0.2,
        
        // Physics
        maxSpeed: 1.5,
        maxForce: 0.05,
        
        // Perception
        separationRadius: 8.0,
        alignmentRadius: 12.0,
        cohesionRadius: 12.0,
        
        // Disable regular boundary forces since we're using spherical constraints
        boundaryWeight: 0.0
    };
    
    // Create the engine
    const engine = new BoidsEngine(config);
    
    console.log('1. Engine Configuration:');
    const stats = engine.getStats();
    console.log(`   Sphere Center: ${config.sphereCenter.toString()}`);
    console.log(`   Sphere Radius: ${config.sphereRadius}`);
    console.log(`   Constraint Preset: ${config.sphericalConstraintPreset}`);
    console.log(`   Surface Area: ${(4 * Math.PI * config.sphereRadius * config.sphereRadius).toFixed(1)} units²`);
    
    return engine;
}

/**
 * Add boids to the sphere using different methods
 */
function addBoids(engine, count = 20) {
    console.log('\n2. Adding Boids to Sphere:');
    
    // Method 1: Add random boids on sphere surface
    const sphereBoids = Math.floor(count * 0.7); // 70% random on sphere
    engine.addRandomBoidsOnSphere(sphereBoids);
    console.log(`   Added ${sphereBoids} random boids on sphere surface`);
    
    // Method 2: Add boids at specific locations and let constraints project them
    const specificBoids = count - sphereBoids;
    for (let i = 0; i < specificBoids; i++) {
        // Add boids inside the sphere that will be projected outward
        const position = Vector3D.random(engine.config.sphereRadius * 0.5);
        engine.addBoidOnSphere(position);
    }
    console.log(`   Added ${specificBoids} boids inside sphere (auto-projected to surface)`);
    
    // Verify all boids are on the sphere
    console.log('\n   Verifying boid positions:');
    let minDist = Infinity, maxDist = 0, avgDist = 0;
    for (const boid of engine.boids) {
        const dist = boid.position.distanceTo(engine.config.sphereCenter);
        minDist = Math.min(minDist, dist);
        maxDist = Math.max(maxDist, dist);
        avgDist += dist;
    }
    avgDist /= engine.boids.length;
    
    console.log(`   Distance from sphere center - Min: ${minDist.toFixed(3)}, Max: ${maxDist.toFixed(3)}, Avg: ${avgDist.toFixed(3)}`);
    console.log(`   Target radius: ${engine.config.sphereRadius}`);
    
    return engine.boids.length;
}

/**
 * Run simulation and demonstrate different constraint presets
 */
function runSimulation(engine, steps = 50) {
    console.log('\n3. Running Simulation:');
    
    const presets = ['loose', 'natural', 'strict'];
    
    for (const preset of presets) {
        console.log(`\n   Testing with '${preset}' constraint preset:`);
        
        // Update constraint preset
        engine.updateConfig({
            sphericalConstraintPreset: preset
        });
        
        // Record initial positions
        const initialPositions = engine.boids.map(boid => ({
            distance: boid.position.distanceTo(engine.config.sphereCenter),
            speed: boid.velocity.magnitude()
        }));
        
        // Run simulation steps
        for (let i = 0; i < steps; i++) {
            engine.update();
        }
        
        // Analyze results
        let totalConstraintError = 0;
        let totalSpeedChange = 0;
        let minDist = Infinity, maxDist = 0;
        
        engine.boids.forEach((boid, i) => {
            const dist = boid.position.distanceTo(engine.config.sphereCenter);
            const speed = boid.velocity.magnitude();
            
            totalConstraintError += Math.abs(dist - engine.config.sphereRadius);
            totalSpeedChange += Math.abs(speed - initialPositions[i].speed);
            minDist = Math.min(minDist, dist);
            maxDist = Math.max(maxDist, dist);
        });
        
        const avgConstraintError = totalConstraintError / engine.boids.length;
        const avgSpeedChange = totalSpeedChange / engine.boids.length;
        
        console.log(`     After ${steps} steps:`);
        console.log(`     Constraint error (avg): ${avgConstraintError.toFixed(4)} units`);
        console.log(`     Distance range: ${minDist.toFixed(3)} - ${maxDist.toFixed(3)}`);
        console.log(`     Average speed change: ${avgSpeedChange.toFixed(3)}`);
        
        // Check velocity tangency
        let tangencyError = 0;
        for (const boid of engine.boids) {
            const normal = Vector3D.subtract(boid.position, engine.config.sphereCenter).normalize();
            const dotProduct = Math.abs(boid.velocity.dot(normal));
            tangencyError += dotProduct;
        }
        tangencyError /= engine.boids.length;
        console.log(`     Velocity tangency error (avg): ${tangencyError.toFixed(6)} (should be ~0)`);
    }
}

/**
 * Demonstrate advanced features
 */
function demonstrateAdvancedFeatures(engine) {
    console.log('\n4. Advanced Features Demonstration:');
    
    // Test dynamic sphere resizing
    console.log('\n   Testing dynamic sphere resizing:');
    const originalRadius = engine.config.sphereRadius;
    
    // Shrink sphere
    const newRadius = originalRadius * 0.7;
    engine.updateSphericalConstraints({ radius: newRadius });
    console.log(`   Shrinking sphere from ${originalRadius} to ${newRadius}`);
    
    // Run a few steps to see boids adapt
    for (let i = 0; i < 10; i++) {
        engine.update();
    }
    
    // Check adaptation
    const distances = engine.boids.map(boid => 
        boid.position.distanceTo(engine.config.sphereCenter)
    );
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    console.log(`   Average distance after shrinking: ${avgDistance.toFixed(3)} (target: ${newRadius})`);
    
    // Restore original size
    engine.updateSphericalConstraints({ radius: originalRadius });
    
    // Test sphere movement
    console.log('\n   Testing sphere center movement:');
    const newCenter = new Vector3D(10, 0, 0);
    engine.updateSphericalConstraints({ center: newCenter });
    console.log(`   Moving sphere center to ${newCenter.toString()}`);
    
    // Run steps to see adaptation
    for (let i = 0; i < 10; i++) {
        engine.update();
    }
    
    // Check if boids followed the sphere
    const avgCenterDistance = engine.boids
        .map(boid => boid.position.distanceTo(newCenter))
        .reduce((a, b) => a + b, 0) / engine.boids.length;
    console.log(`   Average distance from new center: ${avgCenterDistance.toFixed(3)} (target: ${originalRadius})`);
    
    // Test constraint presets
    console.log('\n   Available constraint presets:');
    const presetNames = ['strict', 'loose', 'natural', 'boundary-only'];
    presetNames.forEach(name => {
        const preset = getConstraintPreset(name);
        console.log(`   ${name}: correction=${preset.positionCorrectionStrength}, velocity=${preset.velocityProjectionStrength}, boundary=${preset.boundaryForceStrength}`);
    });
}

/**
 * Performance analysis
 */
function analyzePerformance(engine, testSteps = 100) {
    console.log('\n5. Performance Analysis:');
    
    // Test with constraints enabled
    console.log('\n   Testing with spherical constraints enabled:');
    const startTime = performance.now();
    
    for (let i = 0; i < testSteps; i++) {
        engine.update();
    }
    
    const constrainedTime = performance.now() - startTime;
    const constrainedFPS = (testSteps / constrainedTime) * 1000;
    
    console.log(`   ${testSteps} steps with constraints: ${constrainedTime.toFixed(2)}ms`);
    console.log(`   Estimated FPS with constraints: ${constrainedFPS.toFixed(1)}`);
    
    // Test with constraints disabled
    console.log('\n   Testing with spherical constraints disabled:');
    engine.disableSphericalConstraints();
    
    const startTime2 = performance.now();
    
    for (let i = 0; i < testSteps; i++) {
        engine.update();
    }
    
    const unconstrainedTime = performance.now() - startTime2;
    const unconstrainedFPS = (testSteps / unconstrainedTime) * 1000;
    
    console.log(`   ${testSteps} steps without constraints: ${unconstrainedTime.toFixed(2)}ms`);
    console.log(`   Estimated FPS without constraints: ${unconstrainedFPS.toFixed(1)}`);
    
    const overhead = ((constrainedTime - unconstrainedTime) / unconstrainedTime) * 100;
    console.log(`   Constraint system overhead: ${overhead.toFixed(1)}%`);
    
    // Re-enable constraints
    engine.enableSphericalConstraints();
}

/**
 * Main demo function
 */
function runSphericalBoidsDemo() {
    try {
        // Create the simulation
        const engine = createSphericalBoidsDemo();
        
        // Add boids
        const boidCount = addBoids(engine, 25);
        console.log(`\n   Total boids in simulation: ${boidCount}`);
        
        // Run simulation with different presets
        runSimulation(engine, 30);
        
        // Demonstrate advanced features
        demonstrateAdvancedFeatures(engine);
        
        // Analyze performance
        analyzePerformance(engine, 50);
        
        // Final statistics
        console.log('\n6. Final Statistics:');
        const finalStats = engine.getStats();
        console.log(`   Total simulation frames: ${finalStats.frameCount}`);
        console.log(`   Average update time: ${finalStats.averageUpdateTime.toFixed(2)}ms`);
        console.log(`   Estimated FPS: ${finalStats.estimatedFPS.toFixed(1)}`);
        console.log(`   Spherical constraints: ${finalStats.sphericalConstraints.enabled ? 'Enabled' : 'Disabled'}`);
        
        if (finalStats.sphericalConstraints.systemStats) {
            const sphereStats = finalStats.sphericalConstraints.systemStats;
            console.log(`   Sphere surface area: ${sphereStats.surfaceArea.toFixed(1)} units²`);
            console.log(`   Boid density: ${(boidCount / sphereStats.surfaceArea * 1000).toFixed(2)} boids per 1000 units²`);
        }
        
        console.log('\n🎉 Spherical Boids Demo completed successfully!');
        
        return engine;
        
    } catch (error) {
        console.error('❌ Demo failed:', error);
        console.error(error.stack);
        return null;
    }
}

// Export for use as module or run directly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runSphericalBoidsDemo,
        createSphericalBoidsDemo,
        addBoids,
        runSimulation,
        demonstrateAdvancedFeatures,
        analyzePerformance
    };
} else {
    // Run demo if script is executed directly
    runSphericalBoidsDemo();
}