# Spherical Constraints System - Usage Guide

The spherical constraints system enables boids to move naturally on the surface of a sphere, creating realistic flocking behavior constrained to curved surfaces.

## Quick Start

### Basic Usage

```javascript
import { BoidsEngine } from '../math/BoidsEngine.js';
import { Vector3D } from '../math/Vector3D.js';

// Create engine with spherical constraints enabled
const engine = new BoidsEngine({
    enableSphericalConstraints: true,
    sphereCenter: new Vector3D(0, 0, 0),
    sphereRadius: 20.0,
    sphericalConstraintPreset: 'natural'
});

// Add boids on sphere surface
engine.addRandomBoidsOnSphere(30);

// Run simulation
setInterval(() => engine.update(), 16); // ~60 FPS
```

### Configuration Options

#### Spherical Constraint Settings
- `enableSphericalConstraints`: Enable/disable the constraint system
- `sphereCenter`: Center point of the constraint sphere (Vector3D)
- `sphereRadius`: Radius of the constraint sphere (number)
- `sphericalConstraintPreset`: Preset configuration ('strict', 'loose', 'natural', 'boundary-only')

#### Available Presets
- **'strict'**: Tight constraints, boids stay very close to sphere surface
- **'loose'**: Relaxed constraints, allows more deviation from surface
- **'natural'**: Balanced constraints for natural-looking movement (default)
- **'boundary-only'**: Minimal position correction, focuses on boundary forces

## Core Components

### 1. SphericalMath.js - Mathematical Utilities

```javascript
import { 
    projectToSphere, 
    geodesicDistance, 
    sphericalToCartesian,
    tangentVectorAt 
} from '../math/SphericalMath.js';

// Project a point onto sphere surface
const projected = projectToSphere(point, sphereCenter, radius);

// Calculate great circle distance
const distance = geodesicDistance(point1, point2, radius);

// Get tangent space at a point
const { normal, tangent1, tangent2 } = tangentVectorAt(point, center, radius);
```

### 2. SphericalConstraints.js - Constraint System

```javascript
import { 
    createSphericalConstraintSystem,
    constrainToSphere,
    getConstraintPreset 
} from '../math/SphericalConstraints.js';

// Create constraint system
const constraints = createSphericalConstraintSystem(center, radius, config);

// Apply constraints to a boid
constraints.updateBoid(boid);

// Get preset configuration
const config = getConstraintPreset('strict');
```

## Advanced Usage

### Dynamic Sphere Manipulation

```javascript
// Change sphere parameters during simulation
engine.updateSphericalConstraints({
    center: new Vector3D(10, 0, 0),  // Move sphere
    radius: 15.0,                    // Resize sphere
    preset: 'strict'                 // Change constraint strength
});

// Enable/disable constraints dynamically
engine.enableSphericalConstraints('natural', center, radius);
engine.disableSphericalConstraints();
```

### Custom Constraint Configuration

```javascript
const customConfig = {
    positionCorrectionStrength: 0.2,    // How quickly to correct position drift
    velocityProjectionStrength: 0.8,     // How strongly to project velocity to tangent
    boundaryForceStrength: 2.5,          // Strength of boundary enforcement
    maxCorrectionDistance: 1.5,          // Maximum correction per frame
    dampingFactor: 0.92                  // Velocity damping during correction
};

engine.updateSphericalConstraints({ config: customConfig });
```

### Adding Boids to Sphere

```javascript
// Method 1: Random distribution on sphere surface
engine.addRandomBoidsOnSphere(count);

// Method 2: Add specific boid and auto-project to surface
const position = new Vector3D(x, y, z);
const boid = engine.addBoidOnSphere(position, velocity);

// Method 3: Project existing boids to sphere
engine.projectBoidsToSphere();
```

## Performance Considerations

### Optimization Tips
1. **Use appropriate preset**: 'loose' for performance, 'strict' for accuracy
2. **Limit boid count**: Constraints add ~35% overhead per boid
3. **Batch updates**: Update constraints after all boids have moved
4. **Monitor constraint error**: Check stats to ensure acceptable accuracy

### Performance Monitoring

```javascript
const stats = engine.getStats();
console.log(`Constraint overhead: ${stats.sphericalConstraints}`);
console.log(`Average update time: ${stats.averageUpdateTime}ms`);
console.log(`Estimated FPS: ${stats.estimatedFPS}`);
```

## Common Patterns

### Earth-like Simulation
```javascript
const earthEngine = new BoidsEngine({
    enableSphericalConstraints: true,
    sphereRadius: 6371,  // Earth radius in km
    sphericalConstraintPreset: 'natural',
    maxSpeed: 0.1,       // Slow movement for realism
    separationRadius: 50 // Larger separation for global scale
});
```

### Bubble/Cell Simulation
```javascript
const cellEngine = new BoidsEngine({
    enableSphericalConstraints: true,
    sphereRadius: 5.0,   // Small radius
    sphericalConstraintPreset: 'strict',
    maxSpeed: 0.5,       // Medium speed
    separationRadius: 1.0 // Small separation
});
```

### Dynamic Growing Sphere
```javascript
function growingSphere(engine, targetRadius, growthRate) {
    const currentRadius = engine.config.sphereRadius;
    if (currentRadius < targetRadius) {
        const newRadius = Math.min(targetRadius, currentRadius + growthRate);
        engine.updateSphericalConstraints({ radius: newRadius });
    }
}

// Call in update loop
setInterval(() => {
    engine.update();
    growingSphere(engine, 50.0, 0.1);
}, 16);
```

## Troubleshooting

### Common Issues

1. **Boids drift off sphere**: Increase `positionCorrectionStrength` or use 'strict' preset
2. **Jittery movement**: Decrease `velocityProjectionStrength` or use 'loose' preset  
3. **Poor performance**: Reduce boid count or use 'boundary-only' preset
4. **Unnatural movement**: Use 'natural' preset and adjust `wanderWeight`

### Debug Information

```javascript
// Check constraint effectiveness
for (const boid of engine.boids) {
    const distance = boid.position.distanceTo(engine.config.sphereCenter);
    const error = Math.abs(distance - engine.config.sphereRadius);
    console.log(`Boid ${boid.id} constraint error: ${error.toFixed(4)}`);
}

// Check velocity tangency
const normal = Vector3D.subtract(boid.position, sphereCenter).normalize();
const tangencyError = Math.abs(boid.velocity.dot(normal));
console.log(`Velocity tangency error: ${tangencyError.toFixed(6)}`); // Should be ~0
```

## Integration with Other Systems

### Visualization Integration
The constraint system is designed to work seamlessly with Three.js, WebGL, or other rendering systems:

```javascript
// The boid positions are automatically constrained to the sphere
// Just render them as normal - they'll stay on the surface
function render() {
    engine.update();
    
    for (const boid of engine.boids) {
        // boid.position is guaranteed to be on sphere surface
        updateBoidVisualization(boid.position, boid.velocity);
    }
}
```

### Physics Integration
Combine with other physics systems by applying constraints after physics updates:

```javascript
function physicsUpdate() {
    // Apply external forces (gravity, wind, etc.)
    applyExternalForces();
    
    // Update boids with standard rules
    engine.update();
    
    // Spherical constraints are automatically applied in engine.update()
}
```

## Mathematical Background

The system uses several key mathematical concepts:

1. **Sphere Projection**: Points are projected onto the sphere using normalized vectors from the center
2. **Tangent Space**: Velocities are constrained to the tangent plane at each boid's position
3. **Geodesic Paths**: Movement follows great circle paths for natural curved movement
4. **Pole Handling**: Special handling for mathematical singularities at sphere poles
5. **Great Circle Distance**: Accurate distance calculations along the sphere surface

This ensures boids move naturally while maintaining the spherical constraint with minimal computational overhead.