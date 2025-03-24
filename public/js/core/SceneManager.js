import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ambientLight = null;
    this.directionalLight = null;
    this.controls = null;
  }
  
  init() {
    // Create scene
    this.scene = new THREE.Scene();
    
    // Create camera with better initial position
    this.camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    this.camera.position.set(0, 10, -12);
    this.camera.lookAt(0, 0, 2);
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    
    // Add lighting
    this.setupLighting();
    
    // Setup controls
    this.setupControls();
  }
  
  setupLighting() {
    // Add ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);
    
    // Add directional light for shadows
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(10, 20, 10);
    this.directionalLight.castShadow = true;
    this.scene.add(this.directionalLight);
  }
  
  setupControls() {
    // This would import and setup OrbitControls
    // For this example, we're assuming the script is loaded externally
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/examples/js/controls/OrbitControls.js';
    
    script.onload = () => {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.2;
      this.controls.screenSpacePanning = false;
      this.controls.maxPolarAngle = Math.PI / 1.8;
      this.controls.minDistance = 2;
      this.controls.maxDistance = 30;
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    };
    
    document.head.appendChild(script);
  }
  
  add(object) {
    this.scene.add(object);
  }
  
  remove(object) {
    this.scene.remove(object);
  }
  
  clear() {
    // Remove all meshes except the camera
    while(this.scene.children.length > 0) {
      const object = this.scene.children[0];
      if (object.type === 'PerspectiveCamera') {
        this.scene.remove(object);
        this.scene.add(object);
      } else {
        this.scene.remove(object);
      }
    }
    
    // Re-add lights
    this.setupLighting();
  }
  
  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  render() {
    if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
  
  setFollowMode(target, enabled) {
    if (!this.controls || !target) return;
    
    if (enabled) {
      this.controls.target.copy(target);
    } else {
      this.controls.target.set(0, 0, 0);
    }
    
    this.controls.update();
  }
}