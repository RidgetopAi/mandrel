/**
 * main.js - Entry point for the boids-sphere simulation system
 * Demonstrates the complete system with both flat space and spherical boids
 * Includes performance comparisons between different configurations
 */
import { BoidsEngine, DEFAULT_CONFIG } from './math/BoidsEngine.js';
import { Vector3D } from './math/Vector3D.js';
import { ConsoleRunner } from './simulation/ConsoleRunner.js';

/**
 * Main application entry point
 */
function main() {
    console.log('🐦 Boids-Sphere Simulation System');
    console.log('=================================');
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const command = args[0] || 'interactive';
    
    switch (command.toLowerCase()) {
        case 'interactive':
        case 'console':
            startConsoleInterface();
            break;
            
        case 'demo':
            runDemo();
            break;
            
        case 'compare':
            runPerformanceComparison();
            break;
            
        case 'benchmark':
            runBenchmark();
            break;
            
        case 'test':
            runTests();
            break;
            
        case 'help':
            showHelp();
            break;
            
        default:
            console.log(`Unknown command: ${command}`);
            showHelp();
            break;
    }
}

/**
 * Start the interactive console interface
 */
function startConsoleInterface() {
    console.log('Starting interactive console interface...\n');
    ConsoleRunner.create();
}

/**
 * Run demonstration of different simulation modes
 */
async function runDemo() {
    console.log('🎬 Running Boids Simulation Demo\n');
    
    // Demo 1: Basic free space flocking
    console.log('Demo 1: Free Space Flocking (50 boids, 5 seconds)');
    console.log('================================================');
    
    const freeSpaceEngine = new BoidsEngine({
        ...DEFAULT_CONFIG,
        spatialOptimization: true
    });
    
    // Add boids and run simulation
    freeSpaceEngine.addRandomBoids(50);
    await runSimulationDemo(freeSpaceEngine, 5, 'Free Space');
    
    console.log('\n');
    
    // Demo 2: Spherical surface flocking
    console.log('Demo 2: Spherical Surface Flocking (50 boids, 5 seconds)');
    console.log('======================================================');
    
    const sphericalEngine = new BoidsEngine({
        ...DEFAULT_CONFIG,
        enableSphericalConstraints: true,
        sphericalConstraintPreset: 'natural',
        sphereRadius: 50.0,
        spatialOptimization: true,
        separationRadius: 8.0,
        alignmentRadius: 15.0,
        cohesionRadius: 15.0
    });
    
    // Add boids to sphere surface
    sphericalEngine.addRandomBoidsOnSphere(50);
    await runSimulationDemo(sphericalEngine, 5, 'Spherical Surface');
    
    console.log('\n');
    
    // Demo 3: Dense flocking comparison
    console.log('Demo 3: Dense vs Sparse Flocking Comparison');
    console.log('==========================================');
    
    // Dense configuration
    const denseEngine = new BoidsEngine({
        ...DEFAULT_CONFIG,
        separationRadius: 15.0,
        alignmentRadius: 30.0,
        cohesionRadius: 30.0,
        separationWeight: 2.0,
        maxSpeed: 1.5,
        spatialOptimization: true
    });
    
    denseEngine.addRandomBoids(75);
    console.log('Dense Configuration:');
    await runSimulationDemo(denseEngine, 3, 'Dense');
    
    // Sparse configuration
    const sparseEngine = new BoidsEngine({
        ...DEFAULT_CONFIG,
        separationRadius: 40.0,
        alignmentRadius: 80.0,
        cohesionRadius: 80.0,
        boundaryRadius: 400.0,
        maxSpeed: 3.0,
        spatialOptimization: true
    });
    
    sparseEngine.addRandomBoids(75);
    console.log('\nSparse Configuration:');
    await runSimulationDemo(sparseEngine, 3, 'Sparse');
    
    console.log('\n✅ Demo complete! Try "node src/main.js interactive" for hands-on control.');
}

/**
 * Run a simulation demo for a specified duration
 * @param {BoidsEngine} engine - Engine to run
 * @param {number} duration - Duration in seconds
 * @param {string} name - Name of the demo for logging
 */
async function runSimulationDemo(engine, duration, name) {
    const startTime = Date.now();
    let frameCount = 0;
    
    console.log(`Running ${name} simulation...`);
    
    // Run simulation loop
    const intervalTime = 1000 / 60; // Target 60 FPS
    
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const currentTime = performance.now();
            engine.update(1.0);
            frameCount++;
            
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed >= duration) {
                clearInterval(interval);
                
                // Show results
                const stats = engine.getStats();
                console.log(`  Duration: ${elapsed.toFixed(1)}s`);
                console.log(`  Frames: ${frameCount}`);
                console.log(`  Average FPS: ${(frameCount / elapsed).toFixed(1)}`);
                console.log(`  Average Update Time: ${stats.averageUpdateTime.toFixed(2)}ms`);
                console.log(`  Final Boids: ${stats.boidsCount}`);
                
                if (stats.spatialGrid) {
                    console.log(`  Spatial Grid: ${stats.spatialGrid.type}, ${stats.spatialGrid.cellCount} cells`);
                    if (stats.spatialGrid.type === 'spherical') {
                        console.log(`  Grid Efficiency: ${stats.spatialGrid.hitRate} hit rate`);
                    }
                }
                
                resolve();
            }
        }, intervalTime);
    });
}

/**
 * Run performance comparison between different configurations
 */
async function runPerformanceComparison() {
    console.log('🏁 Performance Comparison Test');
    console.log('==============================\n');
    
    const testConfigurations = [
        {
            name: 'Free Space (No Optimization)',
            config: {
                ...DEFAULT_CONFIG,
                spatialOptimization: false
            },
            boids: 200
        },
        {
            name: 'Free Space (With Spatial Grid)',
            config: {
                ...DEFAULT_CONFIG,
                spatialOptimization: true
            },
            boids: 200
        },
        {
            name: 'Spherical (No Optimization)',
            config: {
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphericalConstraintPreset: 'natural',
                sphereRadius: 50.0,
                spatialOptimization: false,
                separationRadius: 8.0,
                alignmentRadius: 15.0,
                cohesionRadius: 15.0
            },
            boids: 200
        },
        {
            name: 'Spherical (With Spherical Grid)',
            config: {
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphericalConstraintPreset: 'natural',
                sphereRadius: 50.0,
                spatialOptimization: true,
                separationRadius: 8.0,
                alignmentRadius: 15.0,
                cohesionRadius: 15.0
            },
            boids: 200
        }
    ];
    
    const results = [];
    
    for (const testConfig of testConfigurations) {
        console.log(`Testing: ${testConfig.name} (${testConfig.boids} boids)`);
        
        const engine = new BoidsEngine(testConfig.config);
        
        // Add boids
        if (testConfig.config.enableSphericalConstraints) {
            engine.addRandomBoidsOnSphere(testConfig.boids);
        } else {
            engine.addRandomBoids(testConfig.boids);
        }
        
        // Warm up
        for (let i = 0; i < 10; i++) {
            engine.update(1.0);
        }
        
        // Performance test
        const startTime = performance.now();
        const testDuration = 3000; // 3 seconds
        let frames = 0;
        
        while (performance.now() - startTime < testDuration) {
            engine.update(1.0);
            frames++;
        }
        
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const stats = engine.getStats();
        
        const result = {
            name: testConfig.name,
            boids: testConfig.boids,
            frames,
            totalTime,
            averageFPS: (frames / totalTime * 1000),
            averageUpdateTime: stats.averageUpdateTime,
            spatialOptimization: testConfig.config.spatialOptimization,
            sphericalConstraints: testConfig.config.enableSphericalConstraints
        };
        
        results.push(result);
        
        console.log(`  FPS: ${result.averageFPS.toFixed(1)}, Update Time: ${result.averageUpdateTime.toFixed(2)}ms`);
        
        if (stats.spatialGrid && stats.spatialGrid.type === 'spherical') {
            console.log(`  Grid Hit Rate: ${stats.spatialGrid.hitRate}`);
        }
        
        console.log('');
    }
    
    // Summary
    console.log('Performance Summary:');
    console.log('===================');
    
    results.sort((a, b) => b.averageFPS - a.averageFPS);
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const rank = i + 1;
        console.log(`${rank}. ${result.name}`);
        console.log(`   FPS: ${result.averageFPS.toFixed(1)}, Update: ${result.averageUpdateTime.toFixed(2)}ms`);
        
        if (i === 0) {
            console.log('   ⭐ Best Performance');
        }
    }
    
    // Performance insights
    console.log('\nPerformance Insights:');
    console.log('====================');
    
    const spatialOptResults = results.filter(r => r.spatialOptimization);
    const noOptResults = results.filter(r => !r.spatialOptimization);
    
    if (spatialOptResults.length > 0 && noOptResults.length > 0) {
        const avgSpatialFPS = spatialOptResults.reduce((sum, r) => sum + r.averageFPS, 0) / spatialOptResults.length;
        const avgNoOptFPS = noOptResults.reduce((sum, r) => sum + r.averageFPS, 0) / noOptResults.length;
        const improvement = ((avgSpatialFPS - avgNoOptFPS) / avgNoOptFPS * 100);
        
        console.log(`• Spatial optimization improves performance by ${improvement.toFixed(1)}% on average`);
    }
    
    const sphericalResults = results.filter(r => r.sphericalConstraints);
    const freeSpaceResults = results.filter(r => !r.sphericalConstraints);
    
    if (sphericalResults.length > 0 && freeSpaceResults.length > 0) {
        const avgSphericalFPS = sphericalResults.reduce((sum, r) => sum + r.averageFPS, 0) / sphericalResults.length;
        const avgFreeSpaceFPS = freeSpaceResults.reduce((sum, r) => sum + r.averageFPS, 0) / freeSpaceResults.length;
        const difference = ((avgFreeSpaceFPS - avgSphericalFPS) / avgSphericalFPS * 100);
        
        if (difference > 5) {
            console.log(`• Free space simulation is ${difference.toFixed(1)}% faster than spherical constraints`);
        } else {
            console.log(`• Spherical constraints have minimal performance impact (<5% difference)`);
        }
    }
}

/**
 * Run standard benchmark test
 */
async function runBenchmark() {
    console.log('🚀 Running Standard Benchmark');
    console.log('=============================');
    console.log('Test: 500 boids, performance configuration, 10 seconds\n');
    
    const runner = new ConsoleRunner({
        ...DEFAULT_CONFIG,
        spatialOptimization: true,
        maxNeighbors: 30,
        separationRadius: 20.0,
        alignmentRadius: 35.0,
        cohesionRadius: 35.0
    });
    
    // Enable export for benchmark
    runner.exportEnabled = true;
    
    // Run benchmark
    runner.runSimulation(500, 10);
}

/**
 * Run basic functionality tests
 */
async function runTests() {
    console.log('🧪 Running Basic Functionality Tests');
    console.log('====================================\n');
    
    let testsPassed = 0;
    let testsTotal = 0;
    
    // Test 1: Engine creation
    testsTotal++;
    try {
        const engine = new BoidsEngine();
        console.log('✅ Test 1: Engine creation - PASSED');
        testsPassed++;
    } catch (error) {
        console.log('❌ Test 1: Engine creation - FAILED:', error.message);
    }
    
    // Test 2: Boid addition
    testsTotal++;
    try {
        const engine = new BoidsEngine();
        engine.addBoid(new Vector3D(0, 0, 0));
        if (engine.boids.length === 1) {
            console.log('✅ Test 2: Boid addition - PASSED');
            testsPassed++;
        } else {
            console.log('❌ Test 2: Boid addition - FAILED: Expected 1 boid, got', engine.boids.length);
        }
    } catch (error) {
        console.log('❌ Test 2: Boid addition - FAILED:', error.message);
    }
    
    // Test 3: Spherical constraints
    testsTotal++;
    try {
        const engine = new BoidsEngine({
            enableSphericalConstraints: true,
            sphereRadius: 50.0
        });
        engine.addRandomBoidsOnSphere(10);
        engine.update();
        console.log('✅ Test 3: Spherical constraints - PASSED');
        testsPassed++;
    } catch (error) {
        console.log('❌ Test 3: Spherical constraints - FAILED:', error.message);
    }
    
    // Test 4: Spatial optimization
    testsTotal++;
    try {
        const engine = new BoidsEngine({
            spatialOptimization: true
        });
        engine.addRandomBoids(20);
        engine.update();
        const stats = engine.getStats();
        if (stats.spatialGrid && stats.spatialGrid.type === 'cartesian') {
            console.log('✅ Test 4: Spatial optimization - PASSED');
            testsPassed++;
        } else {
            console.log('❌ Test 4: Spatial optimization - FAILED: No spatial grid found');
        }
    } catch (error) {
        console.log('❌ Test 4: Spatial optimization - FAILED:', error.message);
    }
    
    // Test 5: Spherical spatial grid
    testsTotal++;
    try {
        const engine = new BoidsEngine({
            enableSphericalConstraints: true,
            sphereRadius: 50.0,
            spatialOptimization: true
        });
        engine.addRandomBoidsOnSphere(20);
        engine.update();
        const stats = engine.getStats();
        if (stats.spatialGrid && stats.spatialGrid.type === 'spherical') {
            console.log('✅ Test 5: Spherical spatial grid - PASSED');
            testsPassed++;
        } else {
            console.log('❌ Test 5: Spherical spatial grid - FAILED: Expected spherical grid');
        }
    } catch (error) {
        console.log('❌ Test 5: Spherical spatial grid - FAILED:', error.message);
    }
    
    // Test 6: Performance with many boids
    testsTotal++;
    try {
        const engine = new BoidsEngine({
            spatialOptimization: true
        });
        engine.addRandomBoids(100);
        
        const startTime = performance.now();
        for (let i = 0; i < 10; i++) {
            engine.update();
        }
        const endTime = performance.now();
        const avgUpdateTime = (endTime - startTime) / 10;
        
        if (avgUpdateTime < 100) { // Less than 100ms per update is reasonable for 100 boids
            console.log(`✅ Test 6: Performance test - PASSED (${avgUpdateTime.toFixed(2)}ms avg update)`);
            testsPassed++;
        } else {
            console.log(`❌ Test 6: Performance test - FAILED: Too slow (${avgUpdateTime.toFixed(2)}ms avg update)`);
        }
    } catch (error) {
        console.log('❌ Test 6: Performance test - FAILED:', error.message);
    }
    
    // Summary
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Tests Passed: ${testsPassed}/${testsTotal}`);
    console.log(`Success Rate: ${(testsPassed / testsTotal * 100).toFixed(1)}%`);
    
    if (testsPassed === testsTotal) {
        console.log('🎉 All tests passed! The system is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please check the implementation.');
        process.exit(1);
    }
}

/**
 * Show help information
 */
function showHelp() {
    console.log('Boids-Sphere Simulation System');
    console.log('==============================');
    console.log('');
    console.log('Usage: node src/main.js [command]');
    console.log('');
    console.log('Commands:');
    console.log('  interactive  - Start interactive console interface (default)');
    console.log('  console      - Same as interactive');
    console.log('  demo         - Run demonstration of different simulation modes');
    console.log('  compare      - Run performance comparison between configurations');
    console.log('  benchmark    - Run standard benchmark (500 boids, 10 seconds)');
    console.log('  test         - Run basic functionality tests');
    console.log('  help         - Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node src/main.js                 # Start interactive mode');
    console.log('  node src/main.js demo             # Run demonstration');
    console.log('  node src/main.js compare          # Performance comparison');
    console.log('  node src/main.js benchmark        # Run benchmark test');
    console.log('');
    console.log('Interactive Mode Commands:');
    console.log('  Once in interactive mode, type "help" for available commands');
    console.log('  Key commands: run, preset, config, stats, benchmark, quit');
    console.log('');
}

// Export main function for testing
export { main };

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}