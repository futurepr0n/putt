const THREE = window.THREE;
import { roughTexture, skyTexture } from '../utils/Textures.js';

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
    // Sharp on high-DPI screens, capped so 4K TVs stay fast
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
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
    this.setupEnvironment();
    
    // Setup controls
    this.setupControls();
  }
  


  
  setupLighting() {
    // Sky/ground bounce light keeps shadowed sides from going flat black
    this.ambientLight = new THREE.HemisphereLight(0xcfe8ff, 0x4a6b2a, 0.65);
    this.scene.add(this.ambientLight);

    // Low warm sun for long, readable shadows across the green
    this.directionalLight = new THREE.DirectionalLight(0xfff1d6, 1.1);
    this.directionalLight.position.set(8, 14, -6);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.bias = -0.0005;
    this.directionalLight.shadow.normalBias = 0.02;
    // Shadow frustum sized to cover the whole course (8 x 16) plus margin
    const cam = this.directionalLight.shadow.camera;
    cam.left = -11; cam.right = 11; cam.top = 11; cam.bottom = -11;
    cam.near = 1; cam.far = 45;
    this.scene.add(this.directionalLight);
  }

  // Static park around the course: sky, distant rough and a ring of trees
  setupEnvironment() {
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xcfe6ef, 28, 75);

    const rough = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: roughTexture(), roughness: 1 })
    );
    rough.rotation.x = -Math.PI / 2;
    rough.position.y = -0.05;
    rough.receiveShadow = true;
    this.scene.add(rough);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
    const leafMats = [0x2f7d32, 0x3b8f3a, 0x276b2c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6);
    const leafGeo = new THREE.ConeGeometry(1.1, 2.6, 7);

    // Deterministic placement so the park looks the same every load
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 46; i++) {
      const angle = (i / 46) * Math.PI * 2 + rand() * 0.2;
      const radius = 15 + rand() * 18;
      const x = Math.sin(angle) * radius * 0.75;
      const z = Math.cos(angle) * radius;
      const scale = 0.8 + rand() * 0.9;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.6;
      const leaves = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
      leaves.position.y = 2.4;
      trunk.castShadow = leaves.castShadow = true;
      tree.add(trunk, leaves);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      this.scene.add(tree);
    }
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
  
  handleResize() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
