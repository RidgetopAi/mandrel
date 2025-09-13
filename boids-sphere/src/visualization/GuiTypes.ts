/**
 * GuiTypes - TypeScript type definitions for GUI control parameters
 * Provides type safety and intellisense for the dat.GUI control system
 */

export interface FlockControlParams {
    size: number;
    addBoids: () => void;
    removeBoids: () => void;
    resetFlock: () => void;
}

export interface BehaviorControlParams {
    separationWeight: number;
    alignmentWeight: number;
    cohesionWeight: number;
    wanderWeight: number;
    boundaryWeight: number;
}

export interface MovementControlParams {
    maxSpeed: number;
    maxForce: number;
    separationRadius: number;
    alignmentRadius: number;
    cohesionRadius: number;
    turnRate: number;
}

export interface VisualControlParams {
    boidColor: string;
    trailColor: string;
    sphereColor: string;
    showTrails: boolean;
    showVelocityVectors: boolean;
    showSphere: boolean;
    showDebugInfo: boolean;
    trailLength: number;
    boidSize: number;
}

export interface SimulationControlParams {
    paused: boolean;
    speed: number;
    fps: number;
    sphereRadius: number;
    autoRotate: boolean;
    resetCamera: () => void;
    resetSimulation: () => void;
    exportData: () => void;
    pausePlay: () => void;
}

export interface GuiControlParams {
    flock: FlockControlParams;
    behavior: BehaviorControlParams;
    movement: MovementControlParams;
    visual: VisualControlParams;
    simulation: SimulationControlParams;
}

export interface GuiControllerOptions {
    min?: number;
    max?: number;
    step?: number;
    listen?: boolean;
    onChange?: (value: any) => void;
    onFinishChange?: (value: any) => void;
}

export interface GuiFolderConfig {
    name: string;
    open?: boolean;
    closed?: boolean;
    autoPlace?: boolean;
}

export interface GuiConfig {
    autoPlace?: boolean;
    width?: number;
    hideable?: boolean;
    resizable?: boolean;
    preset?: string;
    folders?: { [key: string]: GuiFolderConfig };
}

export type GuiParameterType = 
    | 'number'
    | 'string'
    | 'boolean'
    | 'function'
    | 'color'
    | 'option';

export interface GuiParameterDefinition {
    name: string;
    type: GuiParameterType;
    value: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[] | { [key: string]: any };
    onChange?: (value: any) => void;
    onFinishChange?: (value: any) => void;
    folder: string;
    description?: string;
}

export interface GuiPreset {
    name: string;
    parameters: Partial<GuiControlParams>;
    description?: string;
}

// Predefined GUI presets for different scenarios
export const GUI_PRESETS: { [key: string]: GuiPreset } = {
    default: {
        name: 'Default Flocking',
        description: 'Balanced flocking behavior with moderate settings',
        parameters: {
            behavior: {
                separationWeight: 1.5,
                alignmentWeight: 1.0,
                cohesionWeight: 1.0,
                wanderWeight: 0.1,
                boundaryWeight: 2.0
            },
            movement: {
                maxSpeed: 2.0,
                maxForce: 0.03,
                separationRadius: 25.0,
                alignmentRadius: 50.0,
                cohesionRadius: 50.0,
                turnRate: 1.0
            },
            visual: {
                showTrails: true,
                showVelocityVectors: false,
                showSphere: true,
                showDebugInfo: false,
                trailLength: 20,
                boidSize: 1.0
            }
        }
    },
    
    tightFlock: {
        name: 'Tight Flocking',
        description: 'Highly cohesive flock with strong alignment',
        parameters: {
            behavior: {
                separationWeight: 1.0,
                alignmentWeight: 2.0,
                cohesionWeight: 2.5,
                wanderWeight: 0.05,
                boundaryWeight: 2.0
            },
            movement: {
                maxSpeed: 1.5,
                maxForce: 0.05,
                separationRadius: 15.0,
                alignmentRadius: 30.0,
                cohesionRadius: 40.0,
                turnRate: 1.5
            }
        }
    },
    
    dispersed: {
        name: 'Dispersed Swarm',
        description: 'Loose formation with high separation forces',
        parameters: {
            behavior: {
                separationWeight: 3.0,
                alignmentWeight: 0.5,
                cohesionWeight: 0.3,
                wanderWeight: 0.3,
                boundaryWeight: 1.5
            },
            movement: {
                maxSpeed: 3.0,
                maxForce: 0.02,
                separationRadius: 40.0,
                alignmentRadius: 60.0,
                cohesionRadius: 80.0,
                turnRate: 0.8
            }
        }
    },
    
    chaotic: {
        name: 'Chaotic Movement',
        description: 'High wander forces for unpredictable behavior',
        parameters: {
            behavior: {
                separationWeight: 1.0,
                alignmentWeight: 0.3,
                cohesionWeight: 0.5,
                wanderWeight: 1.5,
                boundaryWeight: 3.0
            },
            movement: {
                maxSpeed: 4.0,
                maxForce: 0.08,
                separationRadius: 30.0,
                alignmentRadius: 45.0,
                cohesionRadius: 60.0,
                turnRate: 2.0
            }
        }
    },
    
    schooling: {
        name: 'Fish Schooling',
        description: 'Mimics fish schooling behavior with balanced forces',
        parameters: {
            behavior: {
                separationWeight: 2.0,
                alignmentWeight: 1.5,
                cohesionWeight: 1.2,
                wanderWeight: 0.08,
                boundaryWeight: 2.5
            },
            movement: {
                maxSpeed: 2.5,
                maxForce: 0.04,
                separationRadius: 20.0,
                alignmentRadius: 35.0,
                cohesionRadius: 45.0,
                turnRate: 1.2
            }
        }
    },
    
    debug: {
        name: 'Debug Mode',
        description: 'Visualization settings optimized for debugging',
        parameters: {
            visual: {
                showTrails: true,
                showVelocityVectors: true,
                showSphere: true,
                showDebugInfo: true,
                trailLength: 10,
                boidSize: 1.5
            },
            simulation: {
                speed: 0.5
            }
        }
    }
};

// Color schemes for different visual styles
export const COLOR_SCHEMES: { [key: string]: Partial<VisualControlParams> } = {
    default: {
        boidColor: '#ffffff',
        trailColor: '#4488ff',
        sphereColor: '#4488ff'
    },
    
    ocean: {
        boidColor: '#00ccff',
        trailColor: '#0066aa',
        sphereColor: '#003366'
    },
    
    forest: {
        boidColor: '#88ff88',
        trailColor: '#44aa44',
        sphereColor: '#226622'
    },
    
    sunset: {
        boidColor: '#ff8844',
        trailColor: '#cc4422',
        sphereColor: '#aa2211'
    },
    
    neon: {
        boidColor: '#ff00ff',
        trailColor: '#00ffff',
        sphereColor: '#ffff00'
    },
    
    monochrome: {
        boidColor: '#ffffff',
        trailColor: '#888888',
        sphereColor: '#444444'
    }
};

// Performance optimization settings
export interface PerformanceSettings {
    maxBoids: number;
    targetFPS: number;
    enableTrails: boolean;
    enableVelocityVectors: boolean;
    trailLength: number;
    spatialOptimization: boolean;
    adaptiveQuality: boolean;
}

export const PERFORMANCE_PRESETS: { [key: string]: PerformanceSettings } = {
    high: {
        maxBoids: 1000,
        targetFPS: 60,
        enableTrails: true,
        enableVelocityVectors: true,
        trailLength: 30,
        spatialOptimization: true,
        adaptiveQuality: false
    },
    
    medium: {
        maxBoids: 500,
        targetFPS: 45,
        enableTrails: true,
        enableVelocityVectors: false,
        trailLength: 20,
        spatialOptimization: true,
        adaptiveQuality: true
    },
    
    low: {
        maxBoids: 200,
        targetFPS: 30,
        enableTrails: false,
        enableVelocityVectors: false,
        trailLength: 10,
        spatialOptimization: true,
        adaptiveQuality: true
    },
    
    mobile: {
        maxBoids: 100,
        targetFPS: 30,
        enableTrails: false,
        enableVelocityVectors: false,
        trailLength: 5,
        spatialOptimization: true,
        adaptiveQuality: true
    }
};

export default {
    GuiControlParams,
    GUI_PRESETS,
    COLOR_SCHEMES,
    PERFORMANCE_PRESETS
};