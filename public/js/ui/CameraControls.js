import * as THREE from 'three';
import { DomUtils } from '../utils/DomUtils.js';

export class CameraControls {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
  }
  
  init() {
    this.addCameraInfo();
    this.addCameraPresets();
    this.setupFollowBallButton();
  }
  
  addCameraInfo() {
    // Remove any existing camera info
    const existingInfo = document.getElementById('cameraInfo');
    if (existingInfo && existingInfo.parentNode) {
      existingInfo.parentNode.removeChild(existingInfo);
    }

    const cameraInfo = DomUtils.createElement('div', {
      id: 'cameraInfo',
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '8px 16px',
      borderRadius: '5px',
      textAlign: 'center',
      zIndex: '1000'
    });
    
    cameraInfo.innerHTML = `
      <div>Camera Controls:</div>
      <div>Mouse: Click & Drag to rotate | Scroll to zoom | Right-click & drag to pan</div>
    `;
    
    document.body.appendChild(cameraInfo);
    
    // Keep the info visible for 30 seconds before fading
    setTimeout(() => {
      cameraInfo.style.opacity = '0';
      cameraInfo.style.transition = 'opacity 2s';
      
      // Remove after fade
      setTimeout(() => {
        if (cameraInfo.parentNode) {
          cameraInfo.parentNode.removeChild(cameraInfo);
        }
      }, 2000);
    }, 30000);
    
    // Also add a permanent camera help button
    this.addCameraHelpButton();
  }
  
  addCameraHelpButton() {
    // Check if button already exists
    if (document.getElementById('cameraHelpButton')) return;
    
    const helpButton = DomUtils.createElement('button', {
      id: 'cameraHelpButton',
      position: 'absolute',
      bottom: '10px',
      right: '10px',
      width: '30px',
      height: '30px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '50%',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      zIndex: '1000'
    }, '?');
    
    helpButton.addEventListener('click', () => {
      this.addCameraInfo();
    });
    
    document.body.appendChild(helpButton);
  }
  
  addCameraPresets() {
    const presetPositions = [
      { name: 'Top View', position: [0, 15, 0], target: [0, 0, 0] },
      { name: 'Side View', position: [15, 5, 0], target: [0, 0, 0] },
      { name: 'Follow View', position: [0, 5, -8], target: [0, 0, 4] },
    ];
    
    const container = DomUtils.createElement('div', {
      position: 'absolute',
      top: '80px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    });
    
    presetPositions.forEach(preset => {
      const button = DomUtils.createElement('button', {
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
      }, preset.name);
      
      button.addEventListener('click', () => this.animateCameraToPreset(preset));
      
      container.appendChild(button);
    });
    
    document.body.appendChild(container);
  }
  
  animateCameraToPreset(preset) {
    const camera = this.sceneManager.camera;
    const controls = this.sceneManager.controls;
    
    if (!camera || !controls) return;
    
    // Turn off follow mode when switching to a preset
    this.setFollowBallMode(false);
    
    // Animate camera move
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPosition = new THREE.Vector3(...preset.position);
    const endTarget = new THREE.Vector3(...preset.target);
    
    const duration = 1000; // ms
    const startTime = Date.now();
    
    const animateCamera = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      // Smoothly interpolate position and target
      camera.position.lerpVectors(startPosition, endPosition, progress);
      controls.target.lerpVectors(startTarget, endTarget, progress);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };
    
    animateCamera();
  }
  
  setupFollowBallButton() {
    // Create the toggle button
    const followButton = DomUtils.createElement('button', {
      id: 'followBallButton',
      position: 'absolute',
      bottom: '80px',
      left: '20px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }, 'Follow Ball: OFF');
    
    document.body.appendChild(followButton);
    
    // Track follow mode state
    this.followBallMode = false;
    
    // Add click handler
    followButton.addEventListener('click', () => {
      this.followBallMode = !this.followBallMode;
      followButton.textContent = `Follow Ball: ${this.followBallMode ? 'ON' : 'OFF'}`;
      
      if (this.followBallMode) {
        followButton.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
      } else {
        followButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        
        // Reset controls target to course center when disabling follow mode
        if (this.sceneManager.controls) {
          this.sceneManager.controls.target.set(0, 0, 0);
        }
      }
      
      this.setFollowBallMode(this.followBallMode);
    });
  }
  
  setFollowBallMode(enabled) {
    this.followBallMode = enabled;
    
    // Update button UI if it exists
    const followButton = document.getElementById('followBallButton');
    if (followButton) {
      followButton.textContent = `Follow Ball: ${enabled ? 'ON' : 'OFF'}`;
      followButton.style.backgroundColor = enabled ? 
        'rgba(0, 128, 0, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    }
    
    // Reset camera target if disabling follow mode
    if (!enabled && this.sceneManager.controls) {
      this.sceneManager.controls.target.set(0, 0, 0);
      this.sceneManager.controls.update();
    }
    
    return this.followBallMode;
  }
}