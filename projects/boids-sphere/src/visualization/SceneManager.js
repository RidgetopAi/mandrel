/**
 * SceneManager - Three.js scene management for boids-sphere visualization
 * Handles camera, renderer, lighting, and basic scene setup
 */
import * as THREE from 'three';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.stats = {
            renderTime: 0,
            frameCount: 0,
            fps: 0
        };
        this.lastTime = 0;
        
        this.init();
    }

    /**
     * Initialize the Three.js scene, camera, renderer, and lighting
     */
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 100, 1000);

        // Create camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 2000);
        this.camera.position.set(150, 100, 150);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        this.container.appendChild(this.renderer.domElement);

        // Set up lighting
        this.setupLighting();

        // Handle resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    /**
     * Set up scene lighting
     */
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(200, 200, 100);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 1000;
        mainLight.shadow.camera.left = -200;
        mainLight.shadow.camera.right = 200;
        mainLight.shadow.camera.top = 200;
        mainLight.shadow.camera.bottom = -200;
        this.scene.add(mainLight);

        // Fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
        fillLight.position.set(-100, -100, -200);
        this.scene.add(fillLight);

        // Rim light for depth
        const rimLight = new THREE.DirectionalLight(0xff8844, 0.3);
        rimLight.position.set(0, 300, 0);
        this.scene.add(rimLight);
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Add object to scene
     * @param {THREE.Object3D} object - Object to add
     */
    add(object) {
        this.scene.add(object);
    }

    /**
     * Remove object from scene
     * @param {THREE.Object3D} object - Object to remove
     */
    remove(object) {
        this.scene.remove(object);
    }

    /**
     * Render the scene
     * @param {number} deltaTime - Time since last render
     */
    render(deltaTime) {
        const startTime = performance.now();
        
        this.renderer.render(this.scene, this.camera);
        
        const endTime = performance.now();
        this.stats.renderTime = endTime - startTime;
        this.stats.frameCount++;
        
        // Calculate FPS every second
        if (endTime - this.lastTime >= 1000) {
            this.stats.fps = Math.round(this.stats.frameCount * 1000 / (endTime - this.lastTime));
            this.stats.frameCount = 0;
            this.lastTime = endTime;
        }
    }

    /**
     * Get rendering statistics
     * @returns {Object} Stats object with renderTime, fps
     */
    getStats() {
        return {
            renderTime: this.stats.renderTime,
            fps: this.stats.fps
        };
    }

    /**
     * Get the camera for external control
     * @returns {THREE.PerspectiveCamera} The scene camera
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Get the scene for external access
     * @returns {THREE.Scene} The Three.js scene
     */
    getScene() {
        return this.scene;
    }

    /**
     * Clean up resources
     */
    dispose() {
        window.removeEventListener('resize', this.onWindowResize.bind(this));
        
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
        
        // Dispose of scene objects
        if (this.scene) {
            this.scene.traverse((object) => {
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
}