/**
 * Comprehensive unit tests for Vector3D class
 * Tests all mathematical operations, distance calculations, edge cases, and static helpers
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3D } from '../math/Vector3D.js';

const EPSILON = 1e-10;

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

describe('Vector3D', () => {
    let vector;

    beforeEach(() => {
        vector = new Vector3D();
    });

    describe('Constructor and Basic Properties', () => {
        it('should create vector with default values (0, 0, 0)', () => {
            const v = new Vector3D();
            expect(v.x).toBe(0);
            expect(v.y).toBe(0);
            expect(v.z).toBe(0);
        });

        it('should create vector with specified values', () => {
            const v = new Vector3D(1, 2, 3);
            expect(v.x).toBe(1);
            expect(v.y).toBe(2);
            expect(v.z).toBe(3);
        });

        it('should handle negative values', () => {
            const v = new Vector3D(-1, -2, -3);
            expect(v.x).toBe(-1);
            expect(v.y).toBe(-2);
            expect(v.z).toBe(-3);
        });

        it('should handle floating point values', () => {
            const v = new Vector3D(1.5, 2.7, -3.14);
            expectFloatEqual(v.x, 1.5);
            expectFloatEqual(v.y, 2.7);
            expectFloatEqual(v.z, -3.14);
        });
    });

    describe('Clone and Copy Operations', () => {
        it('should clone vector correctly', () => {
            const original = new Vector3D(1, 2, 3);
            const clone = original.clone();
            
            expect(clone).not.toBe(original);
            expectVectorEqual(clone, original);
        });

        it('should copy from another vector', () => {
            const source = new Vector3D(4, 5, 6);
            vector.copy(source);
            
            expectVectorEqual(vector, source);
        });

        it('should maintain independence after clone', () => {
            const original = new Vector3D(1, 2, 3);
            const clone = original.clone();
            
            original.x = 10;
            expect(clone.x).toBe(1);
        });
    });

    describe('Set Operations', () => {
        it('should set coordinates correctly', () => {
            vector.set(7, 8, 9);
            expect(vector.x).toBe(7);
            expect(vector.y).toBe(8);
            expect(vector.z).toBe(9);
        });

        it('should return self for method chaining', () => {
            const result = vector.set(1, 2, 3);
            expect(result).toBe(vector);
        });
    });

    describe('Addition Operations', () => {
        it('should add vectors correctly', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            
            v1.add(v2);
            expectVectorEqual(v1, new Vector3D(5, 7, 9));
        });

        it('should handle negative addition', () => {
            const v1 = new Vector3D(10, 20, 30);
            const v2 = new Vector3D(-5, -10, -15);
            
            v1.add(v2);
            expectVectorEqual(v1, new Vector3D(5, 10, 15));
        });

        it('should return self for method chaining', () => {
            const v2 = new Vector3D(1, 1, 1);
            const result = vector.add(v2);
            expect(result).toBe(vector);
        });

        it('should handle zero vector addition', () => {
            const original = new Vector3D(1, 2, 3);
            const zero = new Vector3D(0, 0, 0);
            
            original.add(zero);
            expectVectorEqual(original, new Vector3D(1, 2, 3));
        });
    });

    describe('Subtraction Operations', () => {
        it('should subtract vectors correctly', () => {
            const v1 = new Vector3D(10, 20, 30);
            const v2 = new Vector3D(4, 5, 6);
            
            v1.subtract(v2);
            expectVectorEqual(v1, new Vector3D(6, 15, 24));
        });

        it('should handle negative subtraction', () => {
            const v1 = new Vector3D(5, 10, 15);
            const v2 = new Vector3D(-5, -10, -15);
            
            v1.subtract(v2);
            expectVectorEqual(v1, new Vector3D(10, 20, 30));
        });

        it('should return self for method chaining', () => {
            const v2 = new Vector3D(1, 1, 1);
            const result = vector.subtract(v2);
            expect(result).toBe(vector);
        });
    });

    describe('Scalar Multiplication and Division', () => {
        it('should multiply by scalar correctly', () => {
            const v = new Vector3D(2, 3, 4);
            v.multiply(3);
            expectVectorEqual(v, new Vector3D(6, 9, 12));
        });

        it('should handle negative scalar multiplication', () => {
            const v = new Vector3D(2, 3, 4);
            v.multiply(-2);
            expectVectorEqual(v, new Vector3D(-4, -6, -8));
        });

        it('should handle zero scalar multiplication', () => {
            const v = new Vector3D(2, 3, 4);
            v.multiply(0);
            expectVectorEqual(v, new Vector3D(0, 0, 0));
        });

        it('should divide by scalar correctly', () => {
            const v = new Vector3D(6, 9, 12);
            v.divide(3);
            expectVectorEqual(v, new Vector3D(2, 3, 4));
        });

        it('should handle division by zero gracefully', () => {
            const v = new Vector3D(6, 9, 12);
            const original = v.clone();
            v.divide(0);
            expectVectorEqual(v, original);
        });

        it('should handle fractional division', () => {
            const v = new Vector3D(1, 2, 3);
            v.divide(2);
            expectVectorEqual(v, new Vector3D(0.5, 1, 1.5));
        });
    });

    describe('Magnitude Calculations', () => {
        it('should calculate magnitude correctly', () => {
            const v = new Vector3D(3, 4, 0);
            expectFloatEqual(v.magnitude(), 5);
        });

        it('should calculate 3D magnitude correctly', () => {
            const v = new Vector3D(1, 2, 2);
            expectFloatEqual(v.magnitude(), 3);
        });

        it('should calculate squared magnitude correctly', () => {
            const v = new Vector3D(3, 4, 0);
            expectFloatEqual(v.magnitudeSquared(), 25);
        });

        it('should calculate squared magnitude for 3D vector', () => {
            const v = new Vector3D(1, 2, 2);
            expectFloatEqual(v.magnitudeSquared(), 9);
        });

        it('should handle zero vector magnitude', () => {
            const v = new Vector3D(0, 0, 0);
            expectFloatEqual(v.magnitude(), 0);
            expectFloatEqual(v.magnitudeSquared(), 0);
        });

        it('should handle very small vectors', () => {
            const v = new Vector3D(1e-10, 1e-10, 1e-10);
            expect(v.magnitude()).toBeGreaterThan(0);
            expect(v.magnitudeSquared()).toBeGreaterThan(0);
        });

        it('should handle very large vectors', () => {
            const v = new Vector3D(1e10, 1e10, 1e10);
            expect(v.magnitude()).toBeGreaterThan(0);
            expect(v.magnitudeSquared()).toBeGreaterThan(0);
        });
    });

    describe('Normalization', () => {
        it('should normalize vector to unit length', () => {
            const v = new Vector3D(3, 4, 0);
            v.normalize();
            expectFloatEqual(v.magnitude(), 1, 1e-6);
            expectVectorEqual(v, new Vector3D(0.6, 0.8, 0), 1e-6);
        });

        it('should normalize 3D vector correctly', () => {
            const v = new Vector3D(2, 2, 1);
            v.normalize();
            expectFloatEqual(v.magnitude(), 1, 1e-6);
        });

        it('should handle zero vector normalization gracefully', () => {
            const v = new Vector3D(0, 0, 0);
            v.normalize();
            expectVectorEqual(v, new Vector3D(0, 0, 0));
        });

        it('should return self for method chaining', () => {
            const v = new Vector3D(1, 1, 1);
            const result = v.normalize();
            expect(result).toBe(v);
        });

        it('should handle very small vectors', () => {
            const v = new Vector3D(1e-15, 1e-15, 1e-15);
            v.normalize();
            // Should either normalize correctly or remain zero
            expect(v.magnitude()).toBeLessThanOrEqual(1.1);
        });
    });

    describe('Limit Operations', () => {
        it('should limit vector magnitude', () => {
            const v = new Vector3D(6, 8, 0); // magnitude = 10
            v.limit(5);
            expectFloatEqual(v.magnitude(), 5, 1e-6);
        });

        it('should not affect vectors within limit', () => {
            const v = new Vector3D(3, 4, 0); // magnitude = 5
            const original = v.clone();
            v.limit(10);
            expectVectorEqual(v, original);
        });

        it('should handle zero limit', () => {
            const v = new Vector3D(3, 4, 0);
            v.limit(0);
            expectVectorEqual(v, new Vector3D(0, 0, 0));
        });

        it('should handle zero vector limiting', () => {
            const v = new Vector3D(0, 0, 0);
            v.limit(5);
            expectVectorEqual(v, new Vector3D(0, 0, 0));
        });

        it('should maintain direction when limiting', () => {
            const v = new Vector3D(6, 8, 0);
            const originalNormalized = v.clone().normalize();
            v.limit(5);
            const limitedNormalized = v.clone().normalize();
            expectVectorEqual(originalNormalized, limitedNormalized, 1e-6);
        });
    });

    describe('Distance Calculations', () => {
        it('should calculate distance between vectors', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(3, 4, 0);
            expectFloatEqual(v1.distanceTo(v2), 5);
        });

        it('should calculate 3D distance correctly', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 6, 7);
            expectFloatEqual(v1.distanceTo(v2), Math.sqrt(41));
        });

        it('should calculate squared distance correctly', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(3, 4, 0);
            expectFloatEqual(v1.distanceToSquared(v2), 25);
        });

        it('should handle same vector distance', () => {
            const v1 = new Vector3D(5, 10, 15);
            expectFloatEqual(v1.distanceTo(v1), 0);
            expectFloatEqual(v1.distanceToSquared(v1), 0);
        });

        it('should handle negative coordinates', () => {
            const v1 = new Vector3D(-3, -4, 0);
            const v2 = new Vector3D(0, 0, 0);
            expectFloatEqual(v1.distanceTo(v2), 5);
        });

        it('should be symmetric', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            expectFloatEqual(v1.distanceTo(v2), v2.distanceTo(v1));
        });
    });

    describe('Dot Product', () => {
        it('should calculate dot product correctly', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            expectFloatEqual(v1.dot(v2), 32); // 1*4 + 2*5 + 3*6
        });

        it('should handle orthogonal vectors', () => {
            const v1 = new Vector3D(1, 0, 0);
            const v2 = new Vector3D(0, 1, 0);
            expectFloatEqual(v1.dot(v2), 0);
        });

        it('should handle parallel vectors', () => {
            const v1 = new Vector3D(2, 4, 6);
            const v2 = new Vector3D(1, 2, 3);
            expectFloatEqual(v1.dot(v2), 28); // Should be positive
        });

        it('should handle antiparallel vectors', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(-1, -2, -3);
            expectFloatEqual(v1.dot(v2), -14); // Should be negative
        });

        it('should be commutative', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            expectFloatEqual(v1.dot(v2), v2.dot(v1));
        });

        it('should handle zero vector dot product', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(0, 0, 0);
            expectFloatEqual(v1.dot(v2), 0);
        });
    });

    describe('Cross Product', () => {
        it('should calculate cross product correctly', () => {
            const v1 = new Vector3D(1, 0, 0);
            const v2 = new Vector3D(0, 1, 0);
            const result = v1.cross(v2);
            expectVectorEqual(result, new Vector3D(0, 0, 1));
        });

        it('should handle general cross product', () => {
            const v1 = new Vector3D(2, 3, 4);
            const v2 = new Vector3D(5, 6, 7);
            const result = v1.cross(v2);
            expectVectorEqual(result, new Vector3D(-3, 6, -3));
        });

        it('should be anticommutative', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            const cross12 = v1.cross(v2);
            const cross21 = v2.cross(v1);
            expectVectorEqual(cross12, cross21.multiply(-1), 1e-10);
        });

        it('should handle parallel vectors', () => {
            const v1 = new Vector3D(2, 4, 6);
            const v2 = new Vector3D(1, 2, 3);
            const result = v1.cross(v2);
            expectVectorEqual(result, new Vector3D(0, 0, 0));
        });

        it('should produce perpendicular vector', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            const cross = v1.cross(v2);
            
            // Cross product should be perpendicular to both input vectors
            expectFloatEqual(cross.dot(v1), 0, 1e-10);
            expectFloatEqual(cross.dot(v2), 0, 1e-10);
        });

        it('should handle zero vector cross product', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(0, 0, 0);
            const result = v1.cross(v2);
            expectVectorEqual(result, new Vector3D(0, 0, 0));
        });
    });

    describe('Linear Interpolation (lerp)', () => {
        it('should interpolate correctly at endpoints', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(10, 10, 10);
            
            const result1 = v1.clone().lerp(v2, 0);
            expectVectorEqual(result1, v1);
            
            const result2 = v1.clone().lerp(v2, 1);
            expectVectorEqual(result2, v2);
        });

        it('should interpolate correctly at midpoint', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(10, 10, 10);
            
            const result = v1.clone().lerp(v2, 0.5);
            expectVectorEqual(result, new Vector3D(5, 5, 5));
        });

        it('should handle arbitrary interpolation factors', () => {
            const v1 = new Vector3D(2, 4, 6);
            const v2 = new Vector3D(8, 16, 24);
            
            const result = v1.clone().lerp(v2, 0.25);
            expectVectorEqual(result, new Vector3D(3.5, 7, 10.5));
        });

        it('should return self for method chaining', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(4, 5, 6);
            const result = v1.lerp(v2, 0.5);
            expect(result).toBe(v1);
        });

        it('should handle extrapolation', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(10, 10, 10);
            
            const result = v1.clone().lerp(v2, 1.5);
            expectVectorEqual(result, new Vector3D(15, 15, 15));
        });
    });

    describe('Equality Comparison', () => {
        it('should detect equal vectors', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(1, 2, 3);
            expect(v1.equals(v2)).toBe(true);
        });

        it('should detect unequal vectors', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(1, 2, 4);
            expect(v1.equals(v2)).toBe(false);
        });

        it('should handle floating point precision', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(1 + 1e-12, 2, 3);
            expect(v1.equals(v2)).toBe(true);
        });

        it('should respect custom epsilon', () => {
            const v1 = new Vector3D(1, 2, 3);
            const v2 = new Vector3D(1.01, 2, 3);
            expect(v1.equals(v2, 0.1)).toBe(true);
            expect(v1.equals(v2, 0.001)).toBe(false);
        });

        it('should handle zero vectors', () => {
            const v1 = new Vector3D(0, 0, 0);
            const v2 = new Vector3D(0, 0, 0);
            expect(v1.equals(v2)).toBe(true);
        });
    });

    describe('String Representation', () => {
        it('should format vector as string', () => {
            const v = new Vector3D(1.123456, 2.654321, 3.987654);
            const str = v.toString();
            expect(str).toMatch(/Vector3D\(1\.123, 2\.654, 3\.988\)/);
        });

        it('should handle integers', () => {
            const v = new Vector3D(1, 2, 3);
            const str = v.toString();
            expect(str).toBe('Vector3D(1.000, 2.000, 3.000)');
        });

        it('should handle negative numbers', () => {
            const v = new Vector3D(-1.5, -2.7, -3.14);
            const str = v.toString();
            expect(str).toMatch(/Vector3D\(-1\.500, -2\.700, -3\.140\)/);
        });

        it('should handle zero vector', () => {
            const v = new Vector3D(0, 0, 0);
            const str = v.toString();
            expect(str).toBe('Vector3D(0.000, 0.000, 0.000)');
        });
    });

    describe('Static Utility Methods', () => {
        describe('Static Add', () => {
            it('should add vectors without modifying originals', () => {
                const v1 = new Vector3D(1, 2, 3);
                const v2 = new Vector3D(4, 5, 6);
                const original1 = v1.clone();
                const original2 = v2.clone();
                
                const result = Vector3D.add(v1, v2);
                
                expectVectorEqual(result, new Vector3D(5, 7, 9));
                expectVectorEqual(v1, original1);
                expectVectorEqual(v2, original2);
            });
        });

        describe('Static Subtract', () => {
            it('should subtract vectors without modifying originals', () => {
                const v1 = new Vector3D(10, 20, 30);
                const v2 = new Vector3D(1, 2, 3);
                const original1 = v1.clone();
                const original2 = v2.clone();
                
                const result = Vector3D.subtract(v1, v2);
                
                expectVectorEqual(result, new Vector3D(9, 18, 27));
                expectVectorEqual(v1, original1);
                expectVectorEqual(v2, original2);
            });
        });

        describe('Static Multiply', () => {
            it('should multiply vector by scalar without modifying original', () => {
                const v = new Vector3D(2, 3, 4);
                const original = v.clone();
                
                const result = Vector3D.multiply(v, 3);
                
                expectVectorEqual(result, new Vector3D(6, 9, 12));
                expectVectorEqual(v, original);
            });
        });

        describe('Static Distance', () => {
            it('should calculate distance between vectors', () => {
                const v1 = new Vector3D(0, 0, 0);
                const v2 = new Vector3D(3, 4, 0);
                const distance = Vector3D.distance(v1, v2);
                expectFloatEqual(distance, 5);
            });

            it('should match instance method', () => {
                const v1 = new Vector3D(1, 2, 3);
                const v2 = new Vector3D(4, 6, 8);
                const staticDistance = Vector3D.distance(v1, v2);
                const instanceDistance = v1.distanceTo(v2);
                expectFloatEqual(staticDistance, instanceDistance);
            });
        });

        describe('Static Random', () => {
            it('should create random vector with default radius', () => {
                const v = Vector3D.random();
                expect(v.magnitude()).toBeLessThanOrEqual(1);
            });

            it('should create random vector with specified radius', () => {
                const radius = 5;
                const v = Vector3D.random(radius);
                expect(v.magnitude()).toBeLessThanOrEqual(radius);
            });

            it('should create different random vectors', () => {
                const v1 = Vector3D.random();
                const v2 = Vector3D.random();
                expect(v1.equals(v2)).toBe(false);
            });

            it('should handle zero radius', () => {
                const v = Vector3D.random(0);
                expectVectorEqual(v, new Vector3D(0, 0, 0));
            });

            it('should create vectors uniformly within sphere', () => {
                const samples = 1000;
                const radius = 2;
                let averageDistance = 0;
                
                for (let i = 0; i < samples; i++) {
                    const v = Vector3D.random(radius);
                    averageDistance += v.magnitude();
                    expect(v.magnitude()).toBeLessThanOrEqual(radius);
                }
                
                averageDistance /= samples;
                // Average distance should be roughly 3/4 of radius for uniform distribution in 3D sphere
                expect(averageDistance).toBeGreaterThan(radius * 0.6);
                expect(averageDistance).toBeLessThan(radius * 0.9);
            });
        });

        describe('Static Unit Vectors', () => {
            it('should create zero vector', () => {
                const v = Vector3D.zero();
                expectVectorEqual(v, new Vector3D(0, 0, 0));
            });

            it('should create unit X vector', () => {
                const v = Vector3D.unitX();
                expectVectorEqual(v, new Vector3D(1, 0, 0));
            });

            it('should create unit Y vector', () => {
                const v = Vector3D.unitY();
                expectVectorEqual(v, new Vector3D(0, 1, 0));
            });

            it('should create unit Z vector', () => {
                const v = Vector3D.unitZ();
                expectVectorEqual(v, new Vector3D(0, 0, 1));
            });

            it('should create independent instances', () => {
                const v1 = Vector3D.unitX();
                const v2 = Vector3D.unitX();
                expect(v1).not.toBe(v2);
                v1.x = 5;
                expect(v2.x).toBe(1);
            });
        });
    });

    describe('Edge Cases and Stress Tests', () => {
        it('should handle extremely large values', () => {
            const v = new Vector3D(1e100, 1e100, 1e100);
            expect(v.magnitude()).toBeGreaterThan(0);
            expect(v.magnitude()).toBeLessThan(Infinity);
        });

        it('should handle extremely small values', () => {
            const v = new Vector3D(1e-100, 1e-100, 1e-100);
            expect(v.magnitude()).toBeGreaterThan(0);
        });

        it('should handle infinity values gracefully', () => {
            const v = new Vector3D(Infinity, 0, 0);
            expect(v.magnitude()).toBe(Infinity);
        });

        it('should handle NaN values', () => {
            const v = new Vector3D(NaN, 0, 0);
            expect(Number.isNaN(v.magnitude())).toBe(true);
        });

        it('should maintain precision in chained operations', () => {
            const v = new Vector3D(1, 1, 1);
            const result = v.add(new Vector3D(0.1, 0.1, 0.1))
                           .subtract(new Vector3D(0.1, 0.1, 0.1))
                           .multiply(2)
                           .divide(2);
            
            expectVectorEqual(result, new Vector3D(1, 1, 1), 1e-10);
        });

        it('should handle rapid normalization and denormalization', () => {
            let v = new Vector3D(123.456, 789.012, 345.678);
            const original = v.clone();
            
            for (let i = 0; i < 10; i++) {
                const magnitude = v.magnitude();
                v.normalize().multiply(magnitude);
            }
            
            expectVectorEqual(v, original, 1e-6);
        });
    });

    describe('Performance Tests', () => {
        it('should perform vector operations efficiently', () => {
            const iterations = 10000;
            const vectors = [];
            
            // Generate test vectors
            for (let i = 0; i < 100; i++) {
                vectors.push(Vector3D.random(10));
            }
            
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                const v1 = vectors[i % vectors.length];
                const v2 = vectors[(i + 1) % vectors.length];
                
                // Perform various operations
                const sum = Vector3D.add(v1, v2);
                const distance = v1.distanceTo(v2);
                const dot = v1.dot(v2);
                const cross = v1.cross(v2);
                
                // Use results to prevent optimization
                expect(sum).toBeDefined();
                expect(distance).toBeGreaterThanOrEqual(0);
                expect(dot).toBeDefined();
                expect(cross).toBeDefined();
            }
            
            const endTime = performance.now();
            const timePerOperation = (endTime - startTime) / iterations;
            
            // Should complete operations in reasonable time (less than 0.1ms per operation)
            expect(timePerOperation).toBeLessThan(0.1);
        });

        it('should handle distance calculations efficiently', () => {
            const vectors = [];
            for (let i = 0; i < 1000; i++) {
                vectors.push(Vector3D.random(100));
            }
            
            const startTime = performance.now();
            
            let totalDistance = 0;
            for (let i = 0; i < vectors.length; i++) {
                for (let j = i + 1; j < vectors.length; j++) {
                    totalDistance += vectors[i].distanceTo(vectors[j]);
                }
            }
            
            const endTime = performance.now();
            
            // Should complete many distance calculations quickly
            expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
            expect(totalDistance).toBeGreaterThan(0);
        });
    });
});