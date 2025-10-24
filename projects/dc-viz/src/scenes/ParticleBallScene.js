/**
 * ParticleBallScene.js
 * 
 * Particle burst visualization with:
 * - Particles explode outward from center on bass hits
 * - Multiple burst waves with trails
 * - Color-coded by frequency bands
 * - Continuous spawning and recycling
 */

import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';

export class ParticleBallScene extends BaseScene {
  constructor() {
    super('Particle Burst');
    this.particleSystem = null;
    this.particleVelocities = [];
    this.particleLifetimes = [];
    this.particleCount = 2000;
    this.spawnTimer = 0;
    this.lastBassLevel = 0;
  }

  init(camera, audioEngine) {
    super.init(camera, audioEngine);
    
    this.createParticleSystem();
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.add(ambientLight);
  }

  createParticleSystem() {
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
    
    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 1.0;
      colors[i * 3 + 2] = 1.0;
      
      this.particleVelocities.push(new THREE.Vector3());
      this.particleLifetimes.push(0);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    this.add(this.particleSystem);
  }

  enter() {
    super.enter();
  }

  exit() {
    super.exit();
  }

  spawnBurst(count, audioBands) {
    const positions = this.particleSystem.geometry.attributes.position.array;
    const colors = this.particleSystem.geometry.attributes.color.array;
    
    let spawned = 0;
    for (let i = 0; i < this.particleCount && spawned < count; i++) {
      if (this.particleLifetimes[i] <= 0) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        const speed = 3.0 + Math.random() * 4.0 + audioBands.bass * 6.0;
        
        this.particleVelocities[i].set(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed,
          Math.cos(phi) * speed
        );
        
        this.particleLifetimes[i] = 1.0 + Math.random() * 1.5;
        
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        
        const colorChoice = Math.random();
        if (colorChoice < 0.33) {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 0.2;
          colors[i * 3 + 2] = 0.8;
        } else if (colorChoice < 0.66) {
          colors[i * 3] = 0.0;
          colors[i * 3 + 1] = 1.0;
          colors[i * 3 + 2] = 1.0;
        } else {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 1.0;
          colors[i * 3 + 2] = 0.2;
        }
        
        spawned++;
      }
    }
  }

  update(deltaTime, audioBands) {
    if (!audioBands || !this.particleSystem) return;

    const positions = this.particleSystem.geometry.attributes.position.array;
    const colors = this.particleSystem.geometry.attributes.color.array;
    
    const bassDelta = audioBands.bass - this.lastBassLevel;
    if (bassDelta > 0.2 && audioBands.bass > 0.4) {
      this.spawnBurst(80 + Math.floor(audioBands.bass * 150), audioBands);
    }
    this.lastBassLevel = audioBands.bass;
    
    if (audioBands.mid > 0.5) {
      this.spawnTimer += deltaTime;
      if (this.spawnTimer > 0.1) {
        this.spawnBurst(Math.floor(audioBands.mid * 30), audioBands);
        this.spawnTimer = 0;
      }
    }
    
    for (let i = 0; i < this.particleCount; i++) {
      if (this.particleLifetimes[i] > 0) {
        this.particleLifetimes[i] -= deltaTime;
        
        const i3 = i * 3;
        positions[i3] += this.particleVelocities[i].x * deltaTime;
        positions[i3 + 1] += this.particleVelocities[i].y * deltaTime;
        positions[i3 + 2] += this.particleVelocities[i].z * deltaTime;
        
        this.particleVelocities[i].multiplyScalar(0.98);
      } else {
        const i3 = i * 3;
        positions[i3] = 0;
        positions[i3 + 1] = 0;
        positions[i3 + 2] = 0;
        colors[i3] = 0;
        colors[i3 + 1] = 0;
        colors[i3 + 2] = 0;
      }
    }
    
    this.particleSystem.geometry.attributes.position.needsUpdate = true;
    this.particleSystem.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.particleVelocities = [];
    this.particleLifetimes = [];
    super.dispose();
  }
}
