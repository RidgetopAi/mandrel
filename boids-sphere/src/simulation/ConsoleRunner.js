/**
 * ConsoleRunner - Command-line interface for testing boids simulation
 * Provides performance monitoring, statistical output, and real-time parameter adjustment
 */
import { BoidsEngine, DEFAULT_CONFIG } from '../math/BoidsEngine.js';
import { Vector3D } from '../math/Vector3D.js';
import * as fs from 'fs';
import * as readline from 'readline';

/**
 * Console interface for the boids simulation
 */
export class ConsoleRunner {
    /**
     * Create a new ConsoleRunner
     * @param {Object} config - Initial configuration (optional)
     */
    constructor(config = {}) {
        this.engine = new BoidsEngine({ ...DEFAULT_CONFIG, ...config });
        this.running = false;
        this.intervalId = null;
        this.rl = null;
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        
        // Performance tracking
        this.performanceData = [];
        this.maxPerformanceEntries = 1000;
        this.lastStatsTime = 0;
        this.statsInterval = 1000; // Log stats every second
        
        // Data export settings
        this.exportData = [];
        this.exportEnabled = false;
        this.exportInterval = 100; // Export every 100 frames
        
        // Presets for different test scenarios
        this.presets = {
            default: { ...DEFAULT_CONFIG },
            dense: {
                ...DEFAULT_CONFIG,
                separationRadius: 15.0,
                alignmentRadius: 30.0,
                cohesionRadius: 30.0,
                separationWeight: 2.0,
                maxSpeed: 1.5
            },
            sparse: {
                ...DEFAULT_CONFIG,
                separationRadius: 40.0,
                alignmentRadius: 80.0,
                cohesionRadius: 80.0,
                boundaryRadius: 400.0,
                maxSpeed: 3.0
            },
            sphere: {
                ...DEFAULT_CONFIG,
                enableSphericalConstraints: true,
                sphericalConstraintPreset: 'natural',
                sphereRadius: 50.0,
                boundaryRadius: 100.0,
                separationRadius: 8.0,
                alignmentRadius: 15.0,
                cohesionRadius: 15.0
            },
            performance: {
                ...DEFAULT_CONFIG,
                spatialOptimization: true,
                maxNeighbors: 30,
                separationRadius: 20.0,
                alignmentRadius: 35.0,
                cohesionRadius: 35.0
            }
        };
    }

    /**
     * Start the interactive console interface
     */
    start() {
        console.log('\n🐦 Boids Sphere Simulation - Console Runner');
        console.log('==========================================');
        console.log('Available commands:');
        console.log('  run [boids] [seconds] - Start simulation (default: 100 boids, 10 seconds)');
        console.log('  preset <name> - Load preset configuration (default, dense, sparse, sphere, performance)');
        console.log('  config - Show current configuration');
        console.log('  stats - Show current statistics');
        console.log('  export <on|off> - Enable/disable data export');
        console.log('  benchmark - Run 500 boids for 10 seconds performance test');
        console.log('  help - Show this help message');
        console.log('  quit - Exit the application');
        console.log('');

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.rl.setPrompt('boids> ');
        this.rl.prompt();

        this.rl.on('line', (input) => {
            this.handleCommand(input.trim());
            if (this.rl) {
                this.rl.prompt();
            }
        });

        this.rl.on('close', () => {
            this.stop();
            console.log('\nGoodbye!');
            process.exit(0);
        });
    }

    /**
     * Handle console commands
     * @param {string} command - Command string to process
     */
    handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        try {
            switch (cmd) {
                case 'run':
                    this.runSimulation(
                        args[0] ? parseInt(args[0]) : 100,
                        args[1] ? parseInt(args[1]) : 10
                    );
                    break;

                case 'preset':
                    this.loadPreset(args[0]);
                    break;

                case 'config':
                    this.showConfig();
                    break;

                case 'stats':
                    this.showStats();
                    break;

                case 'export':
                    this.toggleExport(args[0]);
                    break;

                case 'benchmark':
                    this.runBenchmark();
                    break;

                case 'help':
                    this.showHelp();
                    break;

                case 'stop':
                    this.stop();
                    break;

                case 'quit':
                case 'exit':
                    this.rl.close();
                    break;

                case '':
                    break; // Empty command, do nothing

                default:
                    console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
                    break;
            }
        } catch (error) {
            console.error(`Error executing command '${cmd}':`, error.message);
        }
    }

    /**
     * Run simulation with specified parameters
     * @param {number} boidCount - Number of boids to simulate
     * @param {number} duration - Duration in seconds
     */
    async runSimulation(boidCount, duration) {
        if (this.running) {
            console.log('Simulation already running. Use "stop" to stop it first.');
            return;
        }

        console.log(`\n🚀 Starting simulation: ${boidCount} boids for ${duration} seconds`);
        console.log(`Configuration: ${this.engine.config.enableSphericalConstraints ? 'Spherical' : 'Free space'} mode`);

        // Reset and initialize simulation
        this.engine.reset();
        
        if (this.engine.config.enableSphericalConstraints) {
            this.engine.addRandomBoidsOnSphere(boidCount);
        } else {
            this.engine.addRandomBoids(boidCount);
        }

        this.running = true;
        this.performanceData = [];
        this.exportData = [];

        const startTime = Date.now();
        let frameCount = 0;
        let lastFrameTime = performance.now();

        console.log('\nSimulation running... (statistics will be displayed periodically)');
        console.log('Press Ctrl+C or type "stop" to stop early.\n');

        this.intervalId = setInterval(() => {
            const currentTime = performance.now();
            const deltaTime = Math.min((currentTime - lastFrameTime) / 16.67, 2.0); // Cap delta to prevent jumps
            
            // Update simulation
            this.engine.update(deltaTime);
            
            // Track performance
            const updateTime = performance.now() - currentTime;
            this.recordPerformance(updateTime, deltaTime);
            
            // Export data if enabled
            if (this.exportEnabled && frameCount % this.exportInterval === 0) {
                this.recordExportData(frameCount);
            }

            // Show periodic stats
            if (currentTime - this.lastStatsTime > this.statsInterval) {
                this.showRuntimeStats(frameCount, startTime);
                this.lastStatsTime = currentTime;
            }

            frameCount++;
            lastFrameTime = currentTime;

            // Check if duration is complete
            if ((Date.now() - startTime) / 1000 >= duration) {
                this.stop();
                this.showFinalResults(frameCount, startTime, boidCount);
            }
        }, this.frameTime);
    }

    /**
     * Stop the current simulation
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.running = false;
    }

    /**
     * Load a configuration preset
     * @param {string} presetName - Name of the preset to load
     */
    loadPreset(presetName) {
        if (!presetName) {
            console.log('Available presets:', Object.keys(this.presets).join(', '));
            return;
        }

        const preset = this.presets[presetName.toLowerCase()];
        if (!preset) {
            console.log(`Unknown preset: ${presetName}`);
            console.log('Available presets:', Object.keys(this.presets).join(', '));
            return;
        }

        this.engine.updateConfig(preset);
        console.log(`✅ Loaded preset: ${presetName}`);
        this.showConfigSummary();
    }

    /**
     * Show current configuration
     */
    showConfig() {
        const config = this.engine.config;
        console.log('\n📋 Current Configuration:');
        console.log('========================');
        console.log(`Boids Count: ${this.engine.boids.length}`);
        console.log(`Max Speed: ${config.maxSpeed}`);
        console.log(`Max Force: ${config.maxForce}`);
        console.log(`Separation Radius: ${config.separationRadius}`);
        console.log(`Alignment Radius: ${config.alignmentRadius}`);
        console.log(`Cohesion Radius: ${config.cohesionRadius}`);
        console.log(`Boundary Radius: ${config.boundaryRadius}`);
        console.log(`Spherical Constraints: ${config.enableSphericalConstraints ? 'Enabled' : 'Disabled'}`);
        if (config.enableSphericalConstraints) {
            console.log(`  Sphere Radius: ${config.sphereRadius}`);
            console.log(`  Constraint Preset: ${config.sphericalConstraintPreset}`);
        }
        console.log(`Spatial Optimization: ${config.spatialOptimization ? 'Enabled' : 'Disabled'}`);
        console.log('');
    }

    /**
     * Show brief configuration summary
     */
    showConfigSummary() {
        const config = this.engine.config;
        const mode = config.enableSphericalConstraints ? 'Spherical' : 'Free space';
        const spatial = config.spatialOptimization ? ' + Spatial opt.' : '';
        console.log(`Mode: ${mode}${spatial}, Speed: ${config.maxSpeed}, Radii: ${config.separationRadius}/${config.alignmentRadius}/${config.cohesionRadius}`);
    }

    /**
     * Show current simulation statistics
     */
    showStats() {
        const stats = this.engine.getStats();
        console.log('\n📊 Simulation Statistics:');
        console.log('=========================');
        console.log(`Boids: ${stats.boidsCount}`);
        console.log(`Obstacles: ${stats.obstaclesCount}`);
        console.log(`Frame Count: ${stats.frameCount}`);
        console.log(`Average Update Time: ${stats.averageUpdateTime.toFixed(2)}ms`);
        console.log(`Estimated FPS: ${stats.estimatedFPS.toFixed(1)}`);
        console.log(`Spatial Optimization: ${stats.spatialOptimization ? 'Enabled' : 'Disabled'}`);
        
        if (stats.sphericalConstraints.enabled) {
            console.log(`Spherical Constraints: ${stats.sphericalConstraints.preset} (r=${stats.sphericalConstraints.sphereRadius})`);
        }

        // Show recent performance data
        if (this.performanceData.length > 0) {
            const recent = this.performanceData.slice(-10);
            const avgUpdateTime = recent.reduce((sum, data) => sum + data.updateTime, 0) / recent.length;
            const avgFPS = recent.reduce((sum, data) => sum + data.fps, 0) / recent.length;
            console.log(`Recent Avg Update Time: ${avgUpdateTime.toFixed(2)}ms`);
            console.log(`Recent Avg FPS: ${avgFPS.toFixed(1)}`);
        }

        console.log('');
    }

    /**
     * Show runtime statistics during simulation
     * @param {number} frameCount - Current frame count
     * @param {number} startTime - Simulation start time
     */
    showRuntimeStats(frameCount, startTime) {
        const elapsed = (Date.now() - startTime) / 1000;
        const actualFPS = frameCount / elapsed;
        
        // Calculate average forces from recent boids
        const sampleSize = Math.min(10, this.engine.boids.length);
        let avgSeparation = 0, avgAlignment = 0, avgCohesion = 0;
        
        for (let i = 0; i < sampleSize; i++) {
            const boid = this.engine.boids[i];
            if (boid.lastNeighbors && boid.lastNeighbors.length > 0) {
                avgSeparation += boid.lastNeighbors.length;
            }
        }
        avgSeparation /= sampleSize;

        const stats = this.engine.getStats();
        console.log(`[${elapsed.toFixed(1)}s] Frames: ${frameCount}, FPS: ${actualFPS.toFixed(1)}, Update: ${stats.averageUpdateTime.toFixed(2)}ms, Avg Neighbors: ${avgSeparation.toFixed(1)}`);
    }

    /**
     * Show final simulation results
     * @param {number} frameCount - Total frames processed
     * @param {number} startTime - Simulation start time
     * @param {number} boidCount - Number of boids
     */
    showFinalResults(frameCount, startTime, boidCount) {
        const totalTime = (Date.now() - startTime) / 1000;
        const avgFPS = frameCount / totalTime;
        
        console.log('\n🏁 Simulation Complete - Final Results:');
        console.log('======================================');
        console.log(`Duration: ${totalTime.toFixed(2)} seconds`);
        console.log(`Total Frames: ${frameCount}`);
        console.log(`Average FPS: ${avgFPS.toFixed(1)}`);
        console.log(`Boids: ${boidCount}`);
        
        // Performance analysis
        if (this.performanceData.length > 0) {
            const updateTimes = this.performanceData.map(d => d.updateTime);
            const avgUpdate = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;
            const minUpdate = Math.min(...updateTimes);
            const maxUpdate = Math.max(...updateTimes);
            
            console.log(`\nPerformance Analysis:`);
            console.log(`  Average update time: ${avgUpdate.toFixed(2)}ms`);
            console.log(`  Min update time: ${minUpdate.toFixed(2)}ms`);
            console.log(`  Max update time: ${maxUpdate.toFixed(2)}ms`);
            console.log(`  Performance score: ${(1000 / avgUpdate / boidCount * 1000).toFixed(2)} (higher is better)`);
        }

        // Export data if enabled
        if (this.exportEnabled && this.exportData.length > 0) {
            this.saveExportData(`boids_simulation_${boidCount}_${Date.now()}.csv`);
        }

        console.log('');
    }

    /**
     * Run performance benchmark
     */
    runBenchmark() {
        console.log('\n🏃 Running Performance Benchmark...');
        console.log('Test: 500 boids for 10 seconds');
        
        // Use performance preset for benchmark
        this.loadPreset('performance');
        this.exportEnabled = true;
        this.runSimulation(500, 10);
    }

    /**
     * Toggle data export
     * @param {string} state - 'on' or 'off'
     */
    toggleExport(state) {
        if (!state) {
            console.log(`Data export is currently ${this.exportEnabled ? 'enabled' : 'disabled'}`);
            return;
        }

        switch (state.toLowerCase()) {
            case 'on':
            case 'true':
            case '1':
                this.exportEnabled = true;
                console.log('✅ Data export enabled');
                break;
            case 'off':
            case 'false':
            case '0':
                this.exportEnabled = false;
                console.log('❌ Data export disabled');
                break;
            default:
                console.log(`Invalid state: ${state}. Use 'on' or 'off'.`);
        }
    }

    /**
     * Record performance data
     * @param {number} updateTime - Time taken for this update
     * @param {number} deltaTime - Delta time for this frame
     */
    recordPerformance(updateTime, deltaTime) {
        this.performanceData.push({
            timestamp: Date.now(),
            updateTime,
            deltaTime,
            fps: 1000 / updateTime,
            boidCount: this.engine.boids.length,
            frameCount: this.engine.frameCount
        });

        // Limit performance data to prevent memory issues
        if (this.performanceData.length > this.maxPerformanceEntries) {
            this.performanceData.shift();
        }
    }

    /**
     * Record data for export
     * @param {number} frameCount - Current frame number
     */
    recordExportData(frameCount) {
        const stats = this.engine.getStats();
        
        // Sample first few boids for detailed data
        const sampleBoids = this.engine.boids.slice(0, Math.min(5, this.engine.boids.length));
        
        this.exportData.push({
            frame: frameCount,
            timestamp: Date.now(),
            boidCount: this.engine.boids.length,
            updateTime: stats.averageUpdateTime,
            estimatedFPS: stats.estimatedFPS,
            sampleBoids: sampleBoids.map(boid => ({
                id: boid.id,
                position: { x: boid.position.x, y: boid.position.y, z: boid.position.z },
                velocity: { x: boid.velocity.x, y: boid.velocity.y, z: boid.velocity.z },
                speed: boid.velocity.magnitude(),
                neighborCount: boid.lastNeighbors ? boid.lastNeighbors.length : 0,
                age: boid.age,
                energy: boid.energy
            }))
        });
    }

    /**
     * Save export data to CSV file
     * @param {string} filename - Filename to save to
     */
    saveExportData(filename) {
        try {
            let csvContent = 'frame,timestamp,boidCount,updateTime,estimatedFPS';
            
            // Add headers for sample boid data
            for (let i = 0; i < 5; i++) {
                csvContent += `,boid${i}_x,boid${i}_y,boid${i}_z,boid${i}_vx,boid${i}_vy,boid${i}_vz,boid${i}_speed,boid${i}_neighbors`;
            }
            csvContent += '\n';

            // Add data rows
            for (const data of this.exportData) {
                let row = `${data.frame},${data.timestamp},${data.boidCount},${data.updateTime.toFixed(4)},${data.estimatedFPS.toFixed(2)}`;
                
                // Add sample boid data (pad with empty values if fewer than 5 boids)
                for (let i = 0; i < 5; i++) {
                    if (i < data.sampleBoids.length) {
                        const boid = data.sampleBoids[i];
                        row += `,${boid.position.x.toFixed(3)},${boid.position.y.toFixed(3)},${boid.position.z.toFixed(3)}`;
                        row += `,${boid.velocity.x.toFixed(3)},${boid.velocity.y.toFixed(3)},${boid.velocity.z.toFixed(3)}`;
                        row += `,${boid.speed.toFixed(3)},${boid.neighborCount}`;
                    } else {
                        row += ',,,,,,,';
                    }
                }
                csvContent += row + '\n';
            }

            fs.writeFileSync(filename, csvContent);
            console.log(`📊 Export data saved to: ${filename} (${this.exportData.length} entries)`);
        } catch (error) {
            console.error('❌ Failed to save export data:', error.message);
        }
    }

    /**
     * Show help message
     */
    showHelp() {
        console.log('\n📖 Boids Sphere Simulation - Console Runner Help');
        console.log('=================================================');
        console.log('Commands:');
        console.log('  run [boids] [seconds]     - Start simulation');
        console.log('                              Default: 100 boids, 10 seconds');
        console.log('                              Example: run 200 30');
        console.log('');
        console.log('  preset <name>             - Load configuration preset');
        console.log('                              Available: default, dense, sparse, sphere, performance');
        console.log('                              Example: preset sphere');
        console.log('');
        console.log('  config                    - Show current configuration');
        console.log('  stats                     - Show current statistics');
        console.log('  export <on|off>           - Enable/disable CSV data export');
        console.log('  benchmark                 - Run 500 boids for 10 seconds (performance test)');
        console.log('  stop                      - Stop current simulation');
        console.log('  help                      - Show this help message');
        console.log('  quit, exit                - Exit the application');
        console.log('');
        console.log('Presets:');
        console.log('  default      - Standard flocking behavior');
        console.log('  dense        - Tighter flocking, smaller radii');
        console.log('  sparse       - Looser flocking, larger radii');
        console.log('  sphere       - Spherical surface constraints');
        console.log('  performance  - Optimized for high boid counts');
        console.log('');
    }

    /**
     * Create a console runner instance and start it
     * @param {Object} config - Initial configuration
     * @returns {ConsoleRunner} The created runner instance
     */
    static create(config = {}) {
        const runner = new ConsoleRunner(config);
        runner.start();
        return runner;
    }
}