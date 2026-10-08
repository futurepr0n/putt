//const THREE = window.THREE;
const THREE = window.THREE;

export class SceneManager {
  constructor() {
    // Initialize scene, camera, renderer immediately
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
    
    this.ambientLight = null;
    this.directionalLight = null;
    this.controls = null;

    // Camera director: frames the active ball from behind its aim line
    this.director = {
      enabled: true,
      paused: false, // User grabbed the camera; resumes on the next turn
      target: new THREE.Vector3(0, 0, 0),
      angle: 0,
      distance: 4.5,
      height: 3.2
    };
  }
  
  init() {
    // Add renderer to document
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
    // OrbitControls is loaded by game.html before this module runs
    if (!THREE.OrbitControls) {
      console.warn('OrbitControls not loaded; camera controls disabled');
      return;
    }
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI / 1.8;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.addEventListener('start', () => {
      this.director.paused = true;
    });
  }

  // Frame a point from behind the given aim angle. resume=false keeps a user's manual camera.
  focusOn(position, angle, resume = true) {
    if (!position) return;
    this.director.target.set(position.x, 0, position.z);
    this.director.angle = angle;
    if (resume) this.director.paused = false;
  }

  // Track a moving ball without changing the viewing angle
  followTarget(position) {
    if (position) this.director.target.set(position.x, 0, position.z);
  }

  setDirectorEnabled(enabled) {
    this.director.enabled = enabled;
    this.director.paused = false;
  }

  updateDirector(dt) {
    const d = this.director;
    if (!d.enabled || d.paused || !this.controls || dt <= 0) return;
    const k = 1 - Math.exp(-dt * 3);
    const desired = new THREE.Vector3(
      d.target.x - Math.sin(d.angle) * d.distance,
      d.height,
      d.target.z - Math.cos(d.angle) * d.distance
    );
    this.camera.position.lerp(desired, k);
    this.controls.target.lerp(d.target, k);
  }
  
  add(object) {
    this.scene.add(object);
  }
  
  // Removes and frees GPU resources; shared materials re-upload automatically if reused
  remove(object) {
    if (!object) return;
    this.scene.remove(object);
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => m && m.dispose());
    });
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
  
  render(dt = 0) {
    this.updateDirector(dt);
    if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
