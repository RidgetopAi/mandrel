/**
 * CameraControls - 3D navigation controls for the boids-sphere visualization
 * Provides orbit controls, zoom, pan, and preset camera positions
 */
import * as THREE from 'three';

export class CameraControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        // Control state
        this.enabled = true;
        this.target = new THREE.Vector3(0, 0, 0);
        
        // Mouse state
        this.isMouseDown = false;
        this.mouseButtons = {
            left: false,
            middle: false,
            right: false
        };
        this.lastMousePosition = { x: 0, y: 0 };
        
        // Spherical coordinates for orbit
        this.spherical = new THREE.Spherical();
        this.sphericalDelta = new THREE.Spherical();
        
        // Control parameters
        this.minDistance = 10;
        this.maxDistance = 500;
        this.minPolarAngle = 0; // radians
        this.maxPolarAngle = Math.PI; // radians
        
        // Rotation and zoom sensitivity
        this.rotateSpeed = 1.0;
        this.zoomSpeed = 0.1;
        this.panSpeed = 0.3;
        
        // Auto rotation
        this.autoRotate = false;
        this.autoRotateSpeed = 2.0; // degrees per second
        
        // Damping
        this.enableDamping = true;
        this.dampingFactor = 0.05;
        
        // Initialize
        this.init();
        this.update();
    }

    /**
     * Initialize event handlers
     */
    init() {
        // Mouse events
        this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this));
        
        // Touch events for mobile
        this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // Keyboard events
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        
        // Prevent context menu
        this.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
        
        // Initialize spherical coordinates from current camera position
        this.updateSphericalFromCamera();
    }

    /**
     * Update spherical coordinates from camera position
     */
    updateSphericalFromCamera() {
        const offset = new THREE.Vector3();
        offset.copy(this.camera.position).sub(this.target);
        this.spherical.setFromVector3(offset);
    }

    /**
     * Mouse down handler
     */
    onMouseDown(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        this.isMouseDown = true;
        this.lastMousePosition.x = event.clientX;
        this.lastMousePosition.y = event.clientY;
        
        switch (event.button) {
            case 0: // left
                this.mouseButtons.left = true;
                break;
            case 1: // middle
                this.mouseButtons.middle = true;
                break;
            case 2: // right
                this.mouseButtons.right = true;
                break;
        }
    }

    /**
     * Mouse move handler
     */
    onMouseMove(event) {
        if (!this.enabled || !this.isMouseDown) return;
        
        event.preventDefault();
        
        const deltaX = event.clientX - this.lastMousePosition.x;
        const deltaY = event.clientY - this.lastMousePosition.y;
        
        if (this.mouseButtons.left) {
            // Orbit
            this.rotateLeft(2 * Math.PI * deltaX / this.domElement.clientWidth * this.rotateSpeed);
            this.rotateUp(2 * Math.PI * deltaY / this.domElement.clientHeight * this.rotateSpeed);
        } else if (this.mouseButtons.right) {
            // Pan
            this.pan(deltaX, deltaY);
        }
        
        this.lastMousePosition.x = event.clientX;
        this.lastMousePosition.y = event.clientY;
    }

    /**
     * Mouse up handler
     */
    onMouseUp(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        this.isMouseDown = false;
        this.mouseButtons.left = false;
        this.mouseButtons.middle = false;
        this.mouseButtons.right = false;
    }

    /**
     * Mouse wheel handler for zoom
     */
    onMouseWheel(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        if (event.deltaY < 0) {
            this.dollyIn(this.getZoomScale());
        } else if (event.deltaY > 0) {
            this.dollyOut(this.getZoomScale());
        }
    }

    /**
     * Touch start handler
     */
    onTouchStart(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        if (event.touches.length === 1) {
            // Single touch - rotate
            this.lastMousePosition.x = event.touches[0].clientX;
            this.lastMousePosition.y = event.touches[0].clientY;
            this.isMouseDown = true;
            this.mouseButtons.left = true;
        } else if (event.touches.length === 2) {
            // Two finger - zoom and pan
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            this.touchZoomDistanceStart = Math.sqrt(dx * dx + dy * dy);
        }
    }

    /**
     * Touch move handler
     */
    onTouchMove(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        if (event.touches.length === 1 && this.isMouseDown) {
            // Single touch - rotate
            const deltaX = event.touches[0].clientX - this.lastMousePosition.x;
            const deltaY = event.touches[0].clientY - this.lastMousePosition.y;
            
            this.rotateLeft(2 * Math.PI * deltaX / this.domElement.clientWidth * this.rotateSpeed);
            this.rotateUp(2 * Math.PI * deltaY / this.domElement.clientHeight * this.rotateSpeed);
            
            this.lastMousePosition.x = event.touches[0].clientX;
            this.lastMousePosition.y = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            // Two finger - zoom
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (this.touchZoomDistanceStart) {
                const scale = this.touchZoomDistanceStart / distance;
                if (scale > 1) {
                    this.dollyOut(scale);
                } else {
                    this.dollyIn(1 / scale);
                }
                this.touchZoomDistanceStart = distance;
            }
        }
    }

    /**
     * Touch end handler
     */
    onTouchEnd(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        this.isMouseDown = false;
        this.mouseButtons.left = false;
        this.touchZoomDistanceStart = null;
    }

    /**
     * Keyboard controls
     */
    onKeyDown(event) {
        if (!this.enabled) return;
        
        const moveSpeed = 10;
        
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.rotateUp(0.1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.rotateUp(-0.1);
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.rotateLeft(0.1);
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.rotateLeft(-0.1);
                break;
            case 'KeyQ':
                this.dollyOut(1.1);
                break;
            case 'KeyE':
                this.dollyIn(1.1);
                break;
            case 'KeyR':
                this.reset();
                break;
        }
    }

    /**
     * Rotate camera left/right
     */
    rotateLeft(angle) {
        this.sphericalDelta.theta -= angle;
    }

    /**
     * Rotate camera up/down
     */
    rotateUp(angle) {
        this.sphericalDelta.phi -= angle;
    }

    /**
     * Zoom in (dolly camera closer)
     */
    dollyIn(dollyScale) {
        this.sphericalDelta.radius /= dollyScale;
    }

    /**
     * Zoom out (dolly camera away)
     */
    dollyOut(dollyScale) {
        this.sphericalDelta.radius *= dollyScale;
    }

    /**
     * Pan the camera
     */
    pan(deltaX, deltaY) {
        const offset = new THREE.Vector3();
        offset.copy(this.camera.position).sub(this.target);
        
        let targetDistance = offset.length();
        targetDistance *= Math.tan((this.camera.fov / 2) * Math.PI / 180.0);
        
        const panLeft = new THREE.Vector3();
        panLeft.setFromMatrixColumn(this.camera.matrix, 0);
        panLeft.multiplyScalar(-2 * deltaX * targetDistance / this.domElement.clientHeight * this.panSpeed);
        
        const panUp = new THREE.Vector3();
        panUp.setFromMatrixColumn(this.camera.matrix, 1);
        panUp.multiplyScalar(2 * deltaY * targetDistance / this.domElement.clientHeight * this.panSpeed);
        
        this.target.add(panLeft);
        this.target.add(panUp);
    }

    /**
     * Get zoom scale factor
     */
    getZoomScale() {
        return Math.pow(0.95, this.zoomSpeed);
    }

    /**
     * Reset camera to default position
     */
    reset() {
        this.target.set(0, 0, 0);
        this.camera.position.set(150, 100, 150);
        this.camera.lookAt(this.target);
        this.updateSphericalFromCamera();
    }

    /**
     * Set camera to preset position
     */
    setPreset(preset) {
        const presets = {
            front: { position: [0, 0, 200], target: [0, 0, 0] },
            back: { position: [0, 0, -200], target: [0, 0, 0] },
            top: { position: [0, 200, 0], target: [0, 0, 0] },
            bottom: { position: [0, -200, 0], target: [0, 0, 0] },
            left: { position: [-200, 0, 0], target: [0, 0, 0] },
            right: { position: [200, 0, 0], target: [0, 0, 0] },
            diagonal: { position: [150, 100, 150], target: [0, 0, 0] }
        };
        
        if (presets[preset]) {
            const p = presets[preset];
            this.camera.position.set(...p.position);
            this.target.set(...p.target);
            this.camera.lookAt(this.target);
            this.updateSphericalFromCamera();
        }
    }

    /**
     * Update camera position based on controls
     */
    update(deltaTime) {
        if (!this.enabled) return false;
        
        const offset = new THREE.Vector3();
        const quat = new THREE.Quaternion().setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0));
        const quatInverse = quat.clone().invert();
        
        // Auto rotation
        if (this.autoRotate && deltaTime) {
            this.rotateLeft(this.getAutoRotationAngle(deltaTime));
        }
        
        // Apply deltas to spherical coordinates
        this.spherical.theta += this.sphericalDelta.theta;
        this.spherical.phi += this.sphericalDelta.phi;
        this.spherical.radius *= this.sphericalDelta.radius;
        
        // Restrict theta to be between desired limits
        this.spherical.theta = Math.max(-Infinity, Math.min(Infinity, this.spherical.theta));
        
        // Restrict phi to be between desired limits
        this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));
        
        // Restrict radius to be between desired limits
        this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
        
        this.spherical.makeSafe();
        
        offset.setFromSpherical(this.spherical);
        offset.applyQuaternion(quat);
        
        this.camera.position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);
        
        if (this.enableDamping) {
            this.sphericalDelta.theta *= (1 - this.dampingFactor);
            this.sphericalDelta.phi *= (1 - this.dampingFactor);
            this.sphericalDelta.radius *= (1 - this.dampingFactor);
        } else {
            this.sphericalDelta.set(0, 0, 0);
        }
        
        return true;
    }

    /**
     * Get auto rotation angle for this frame
     */
    getAutoRotationAngle(deltaTime) {
        return 2 * Math.PI / 60 / 60 * this.autoRotateSpeed * deltaTime / 1000;
    }

    /**
     * Enable/disable controls
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Dispose of event handlers
     */
    dispose() {
        this.domElement.removeEventListener('mousedown', this.onMouseDown.bind(this));
        this.domElement.removeEventListener('mousemove', this.onMouseMove.bind(this));
        this.domElement.removeEventListener('mouseup', this.onMouseUp.bind(this));
        this.domElement.removeEventListener('wheel', this.onMouseWheel.bind(this));
        this.domElement.removeEventListener('touchstart', this.onTouchStart.bind(this));
        this.domElement.removeEventListener('touchmove', this.onTouchMove.bind(this));
        this.domElement.removeEventListener('touchend', this.onTouchEnd.bind(this));
        window.removeEventListener('keydown', this.onKeyDown.bind(this));
    }
}