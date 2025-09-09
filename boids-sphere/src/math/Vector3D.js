/**
 * Vector3D - 3D Vector operations for boids simulation
 * Provides essential vector mathematics for position, velocity, and acceleration calculations
 */
export class Vector3D {
    /**
     * Create a 3D vector
     * @param {number} x - X coordinate (default: 0)
     * @param {number} y - Y coordinate (default: 0)
     * @param {number} z - Z coordinate (default: 0)
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Create a copy of this vector
     * @returns {Vector3D} New vector with same coordinates
     */
    clone() {
        return new Vector3D(this.x, this.y, this.z);
    }

    /**
     * Set vector coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @returns {Vector3D} This vector for chaining
     */
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    /**
     * Copy coordinates from another vector
     * @param {Vector3D} vector - Vector to copy from
     * @returns {Vector3D} This vector for chaining
     */
    copy(vector) {
        this.x = vector.x;
        this.y = vector.y;
        this.z = vector.z;
        return this;
    }

    /**
     * Add another vector to this vector
     * @param {Vector3D} vector - Vector to add
     * @returns {Vector3D} This vector for chaining
     */
    add(vector) {
        this.x += vector.x;
        this.y += vector.y;
        this.z += vector.z;
        return this;
    }

    /**
     * Subtract another vector from this vector
     * @param {Vector3D} vector - Vector to subtract
     * @returns {Vector3D} This vector for chaining
     */
    subtract(vector) {
        this.x -= vector.x;
        this.y -= vector.y;
        this.z -= vector.z;
        return this;
    }

    /**
     * Multiply vector by a scalar value
     * @param {number} scalar - Value to multiply by
     * @returns {Vector3D} This vector for chaining
     */
    multiply(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        return this;
    }

    /**
     * Divide vector by a scalar value
     * @param {number} scalar - Value to divide by
     * @returns {Vector3D} This vector for chaining
     */
    divide(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
            this.z /= scalar;
        }
        return this;
    }

    /**
     * Calculate the magnitude (length) of this vector
     * @returns {number} Magnitude of the vector
     */
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /**
     * Calculate the squared magnitude (avoids sqrt for performance)
     * @returns {number} Squared magnitude of the vector
     */
    magnitudeSquared() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * Normalize this vector (make it unit length)
     * @returns {Vector3D} This vector for chaining
     */
    normalize() {
        const mag = this.magnitude();
        if (mag > 0) {
            this.divide(mag);
        }
        return this;
    }

    /**
     * Limit the magnitude of this vector
     * @param {number} max - Maximum magnitude
     * @returns {Vector3D} This vector for chaining
     */
    limit(max) {
        const magSq = this.magnitudeSquared();
        if (magSq > max * max) {
            this.normalize().multiply(max);
        }
        return this;
    }

    /**
     * Calculate distance to another vector
     * @param {Vector3D} vector - Other vector
     * @returns {number} Distance between vectors
     */
    distanceTo(vector) {
        const dx = this.x - vector.x;
        const dy = this.y - vector.y;
        const dz = this.z - vector.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate squared distance to another vector (performance optimization)
     * @param {Vector3D} vector - Other vector
     * @returns {number} Squared distance between vectors
     */
    distanceToSquared(vector) {
        const dx = this.x - vector.x;
        const dy = this.y - vector.y;
        const dz = this.z - vector.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Calculate dot product with another vector
     * @param {Vector3D} vector - Other vector
     * @returns {number} Dot product
     */
    dot(vector) {
        return this.x * vector.x + this.y * vector.y + this.z * vector.z;
    }

    /**
     * Calculate cross product with another vector
     * @param {Vector3D} vector - Other vector
     * @returns {Vector3D} New vector representing cross product
     */
    cross(vector) {
        return new Vector3D(
            this.y * vector.z - this.z * vector.y,
            this.z * vector.x - this.x * vector.z,
            this.x * vector.y - this.y * vector.x
        );
    }

    /**
     * Linear interpolation towards another vector
     * @param {Vector3D} vector - Target vector
     * @param {number} alpha - Interpolation factor (0-1)
     * @returns {Vector3D} This vector for chaining
     */
    lerp(vector, alpha) {
        this.x += (vector.x - this.x) * alpha;
        this.y += (vector.y - this.y) * alpha;
        this.z += (vector.z - this.z) * alpha;
        return this;
    }

    /**
     * Check if this vector equals another vector
     * @param {Vector3D} vector - Other vector
     * @param {number} epsilon - Tolerance for floating point comparison
     * @returns {boolean} True if vectors are equal within tolerance
     */
    equals(vector, epsilon = 1e-10) {
        return Math.abs(this.x - vector.x) < epsilon &&
               Math.abs(this.y - vector.y) < epsilon &&
               Math.abs(this.z - vector.z) < epsilon;
    }

    /**
     * Convert vector to string representation
     * @returns {string} String representation
     */
    toString() {
        return `Vector3D(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
    }

    // Static utility methods

    /**
     * Add two vectors and return a new vector
     * @param {Vector3D} a - First vector
     * @param {Vector3D} b - Second vector
     * @returns {Vector3D} New vector representing sum
     */
    static add(a, b) {
        return new Vector3D(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    /**
     * Subtract two vectors and return a new vector
     * @param {Vector3D} a - First vector
     * @param {Vector3D} b - Second vector
     * @returns {Vector3D} New vector representing difference
     */
    static subtract(a, b) {
        return new Vector3D(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    /**
     * Multiply vector by scalar and return a new vector
     * @param {Vector3D} vector - Vector to multiply
     * @param {number} scalar - Scalar to multiply by
     * @returns {Vector3D} New vector representing product
     */
    static multiply(vector, scalar) {
        return new Vector3D(vector.x * scalar, vector.y * scalar, vector.z * scalar);
    }

    /**
     * Calculate distance between two vectors
     * @param {Vector3D} a - First vector
     * @param {Vector3D} b - Second vector
     * @returns {number} Distance between vectors
     */
    static distance(a, b) {
        return a.distanceTo(b);
    }

    /**
     * Create a random vector within a sphere
     * @param {number} radius - Radius of the sphere (default: 1)
     * @returns {Vector3D} Random vector within sphere
     */
    static random(radius = 1) {
        // Generate random point within sphere using rejection sampling
        let x, y, z;
        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            z = Math.random() * 2 - 1;
        } while (x * x + y * y + z * z > 1);
        
        // Scale by radius
        return new Vector3D(x * radius, y * radius, z * radius);
    }

    /**
     * Create a zero vector
     * @returns {Vector3D} Zero vector
     */
    static zero() {
        return new Vector3D(0, 0, 0);
    }

    /**
     * Create a unit vector along X axis
     * @returns {Vector3D} Unit X vector
     */
    static unitX() {
        return new Vector3D(1, 0, 0);
    }

    /**
     * Create a unit vector along Y axis
     * @returns {Vector3D} Unit Y vector
     */
    static unitY() {
        return new Vector3D(0, 1, 0);
    }

    /**
     * Create a unit vector along Z axis
     * @returns {Vector3D} Unit Z vector
     */
    static unitZ() {
        return new Vector3D(0, 0, 1);
    }
}