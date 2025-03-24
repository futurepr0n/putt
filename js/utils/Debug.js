import * as THREE from 'three';
import { DomUtils } from './DomUtils.js';

export class Debug {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.isEnabled = false;
    this.debugObjects = new THREE.Group();
    this.debugInfoElement = null;
    this.fpsCounter = { frames: 0, lastTime: 0, fps: 0 };
    this.stats = {};
  }
  
  init() {
    // Add the debug group to the scene
    this.sceneManager.add(this.debugObjects);
    
    // Create debug info UI element
    this.createDebugInfo();
    
    // Add debug toggle button
    this.addDebugToggle();
  }
  
  createDebugInfo() {
    this.debugInfoElement = DomUtils.createElement('div', {
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      padding: '10px',
      borderRadius: '5px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: '1000',
      display: 'none'
    });
    
    document.body.appendChild(this.debugInfoElement);
  }
  
  addDebugToggle() {
    const button = DomUtils.createElement('button', {
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      padding: '5px 10px',
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: '1001'
    }, 'Debug: OFF');
    
    button.addEventListener('click', () => {
      this.toggle();
      button.textContent = `Debug: ${this.isEnabled ? 'ON' : 'OFF'}`;
      button.style.backgroundColor = this.isEnabled ? 
        'rgba(0, 255, 0, 0.5)' : 'rgba(0, 0, 0, 0.5)';
    });
    
    document.body.appendChild(button);
  }
  
  toggle() {
    this.isEnabled = !this.isEnabled;
    this.debugObjects.visible = this.isEnabled;
    this.debugInfoElement.style.display = this.isEnabled ? 'block' : 'none';
    
    if (this.isEnabled) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }
  
  startMonitoring() {
    this.updateInterval = setInterval(() => this.updateDebugInfo(), 250);
    this.animateFrame(); // Start FPS counter
  }
  
  stopMonitoring() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  updateDebugInfo() {
    if (!this.isEnabled || !this.debugInfoElement) return;
    
    const { renderer, camera } = this.sceneManager;
    
    // Gather stats
    this.stats = {
      fps: this.fpsCounter.fps.toFixed(1),
      triangles: renderer ? renderer.info.render.triangles : 0,
      calls: renderer ? renderer.info.render.calls : 0,
      memory: window.performance && window.performance.memory ? 
        (window.performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB' : 'N/A',
      cameraPosition: camera ? 
        `x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}` : 'N/A'
    };
    
    // Update UI
    this.debugInfoElement.innerHTML = Object.entries(this.stats)
      .map(([key, value]) => `${key}: ${value}`)
      .join('<br>');
  }
  
  animateFrame() {
    if (!this.isEnabled) return;
    
    // Calculate FPS
    this.fpsCounter.frames++;
    const now = performance.now();
    
    if (now >= this.fpsCounter.lastTime + 1000) {
      this.fpsCounter.fps = this.fpsCounter.frames * 1000 / (now - this.fpsCounter.lastTime);
      this.fpsCounter.lastTime = now;
      this.fpsCounter.frames = 0;
    }
    
    // Request next frame
    requestAnimationFrame(() => this.animateFrame());
  }
  
  // Create a debug marker at a position
  addMarker(position, color = 0xff0000, size = 0.1, label = '') {
    // Create sphere marker
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    this.debugObjects.add(marker);
    
    // Add text label if provided
    if (label) {
      const textSprite = this.createTextSprite(label);
      textSprite.position.set(position.x, position.y + size * 1.5, position.z);
      this.debugObjects.add(textSprite);
    }
    
    return marker;
  }
  
  // Create a debug line between two points
  addLine(start, end, color = 0xff0000) {
    const material = new THREE.LineBasicMaterial({ color });
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, material);
    this.debugObjects.add(line);
    return line;
  }
  
  // Create a debug arrow
  addArrow(origin, direction, length = 1, color = 0xff0000) {
    const arrowHelper = new THREE.ArrowHelper(
      direction.normalize(),
      origin,
      length,
      color
    );
    this.debugObjects.add(arrowHelper);
    return arrowHelper;
  }
  
  // Create a text sprite
  createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(text, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.5, 0.25, 1.0);
    
    return sprite;
  }
  
  // Log to console with timestamp
  log(message, ...args) {
    const timestamp = new Date().toISOString().substr(11, 8);
    console.log(`[${timestamp}] ${message}`, ...args);
  }
  
  // Clear all debug objects
  clear() {
    while (this.debugObjects.children.length > 0) {
      this.debugObjects.remove(this.debugObjects.children[0]);
    }
  }
}