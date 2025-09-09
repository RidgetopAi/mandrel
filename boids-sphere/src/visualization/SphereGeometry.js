/**
 * SphereGeometry - Visualization component for the spherical constraint surface
 * Creates wireframe and solid sphere representations for the boids environment
 */
import * as THREE from 'three';

export class SphereGeometry {
    constructor(radius = 50, options = {}) {
        this.radius = radius;
        this.options = {
            wireframe: true,
            solid: false,
            wireframeColor: 0x4488ff,
            solidColor: 0x2244aa,
            opacity: 0.1,
            segments: 64,
            ...options
        };
        
        this.group = new THREE.Group();
        this.wireframeSphere = null;
        this.solidSphere = null;
        
        this.createGeometry();
    }

    /**
     * Create sphere geometry components
     */
    createGeometry() {
        const geometry = new THREE.SphereGeometry(
            this.radius, 
            this.options.segments, 
            this.options.segments / 2
        );

        // Create wireframe sphere
        if (this.options.wireframe) {
            const wireframeMaterial = new THREE.LineBasicMaterial({
                color: this.options.wireframeColor,
                transparent: true,
                opacity: 0.6
            });

            // Create wireframe from edges
            const edges = new THREE.EdgesGeometry(geometry);
            this.wireframeSphere = new THREE.LineSegments(edges, wireframeMaterial);
            this.group.add(this.wireframeSphere);

            // Add latitude and longitude lines for better depth perception
            this.addGridLines();
        }

        // Create solid sphere (optional, usually for debugging)
        if (this.options.solid) {
            const solidMaterial = new THREE.MeshPhongMaterial({
                color: this.options.solidColor,
                transparent: true,
                opacity: this.options.opacity,
                side: THREE.DoubleSide
            });

            this.solidSphere = new THREE.Mesh(geometry, solidMaterial);
            this.solidSphere.receiveShadow = true;
            this.group.add(this.solidSphere);
        }

        // Add center point
        this.addCenterPoint();
    }

    /**
     * Add grid lines for better spatial reference
     */
    addGridLines() {
        const gridGroup = new THREE.Group();
        
        // Create longitude lines (vertical circles)
        const longitudeLines = 12;
        for (let i = 0; i < longitudeLines; i++) {
            const angle = (i / longitudeLines) * Math.PI * 2;
            const curve = new THREE.EllipseCurve(
                0, 0,
                this.radius, this.radius,
                0, 2 * Math.PI,
                false,
                angle
            );
            
            const points = curve.getPoints(50);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            // Convert 2D circle to 3D by rotating around Y axis
            const line3D = new THREE.Line(
                geometry, 
                new THREE.LineBasicMaterial({
                    color: this.options.wireframeColor,
                    transparent: true,
                    opacity: 0.3
                })
            );
            
            line3D.rotation.y = angle;
            line3D.rotation.x = Math.PI / 2;
            gridGroup.add(line3D);
        }
        
        // Create latitude lines (horizontal circles)
        const latitudeLines = 8;
        for (let i = 1; i < latitudeLines; i++) {
            const phi = (i / latitudeLines) * Math.PI;
            const y = this.radius * Math.cos(phi);
            const circleRadius = this.radius * Math.sin(phi);
            
            const curve = new THREE.EllipseCurve(
                0, 0,
                circleRadius, circleRadius,
                0, 2 * Math.PI,
                false,
                0
            );
            
            const points = curve.getPoints(50);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            const line = new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({
                    color: this.options.wireframeColor,
                    transparent: true,
                    opacity: 0.2
                })
            );
            
            line.position.y = y;
            line.rotation.x = Math.PI / 2;
            gridGroup.add(line);
        }
        
        this.group.add(gridGroup);
    }

    /**
     * Add center point for reference
     */
    addCenterPoint() {
        const centerGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        
        const centerPoint = new THREE.Mesh(centerGeometry, centerMaterial);
        this.group.add(centerPoint);
    }

    /**
     * Update sphere radius
     * @param {number} newRadius - New radius for the sphere
     */
    updateRadius(newRadius) {
        this.radius = newRadius;
        
        // Clear existing geometry
        this.group.clear();
        
        // Recreate with new radius
        this.createGeometry();
    }

    /**
     * Set wireframe visibility
     * @param {boolean} visible - Whether wireframe should be visible
     */
    setWireframeVisible(visible) {
        if (this.wireframeSphere) {
            this.wireframeSphere.visible = visible;
        }
        
        // Also update grid lines
        this.group.children.forEach(child => {
            if (child.type === 'Group') {
                child.visible = visible;
            }
        });
    }

    /**
     * Set solid sphere visibility
     * @param {boolean} visible - Whether solid sphere should be visible
     */
    setSolidVisible(visible) {
        if (this.solidSphere) {
            this.solidSphere.visible = visible;
        }
    }

    /**
     * Update wireframe color
     * @param {number} color - New color as hex value
     */
    setWireframeColor(color) {
        this.options.wireframeColor = color;
        
        if (this.wireframeSphere) {
            this.wireframeSphere.material.color.setHex(color);
        }
        
        // Update grid line colors
        this.group.traverse((child) => {
            if (child.type === 'Line' || child.type === 'LineSegments') {
                child.material.color.setHex(color);
            }
        });
    }

    /**
     * Get the Three.js group containing all sphere components
     * @returns {THREE.Group} The sphere geometry group
     */
    getObject3D() {
        return this.group;
    }

    /**
     * Get sphere radius
     * @returns {number} Current sphere radius
     */
    getRadius() {
        return this.radius;
    }

    /**
     * Dispose of geometry and materials
     */
    dispose() {
        this.group.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
}