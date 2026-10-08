const THREE = window.THREE;

export class Tee {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.teeMesh = null;
    this.teeAreaMesh = null;
    this.position = { x: 0, z: 0 };
  }
  
  create(x, z) {
    // Store position
    this.position = { x, z };
    
    // Create tee marker (visual only, no physics)
    this.createTeeMarker(x, z);
    
    return this.position;
  }
  
  createTeeMarker(x, z) {
    // Flat rubber tee mat flush with the green; a raised puck would swallow the ball
    const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const teeGeometry = new THREE.RingGeometry(0.17, 0.2, 40);
    const teeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, ...decal });
    this.teeMesh = new THREE.Mesh(teeGeometry, teeMaterial);
    this.teeMesh.rotation.x = -Math.PI / 2;
    this.teeMesh.position.set(x, 0.003, z);
    this.teeMesh.receiveShadow = true;
    this.sceneManager.add(this.teeMesh);
    
    // Also add a visual indicator for the tee area
    const teeAreaGeometry = new THREE.CircleGeometry(0.4, 32);
    const teeAreaMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f6b35, // Darker rubber mat
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    this.teeAreaMesh = new THREE.Mesh(teeAreaGeometry, teeAreaMaterial);
    this.teeAreaMesh.rotation.x = -Math.PI / 2; // Flat on ground
    this.teeAreaMesh.position.set(x, 0.002, z);
    this.teeAreaMesh.receiveShadow = true;
    this.sceneManager.add(this.teeAreaMesh);
  }
  
  getPosition() {
    return this.position;
  }
  
  remove() {
    if (this.teeMesh) {
      this.sceneManager.remove(this.teeMesh);
      this.teeMesh = null;
    }
    
    if (this.teeAreaMesh) {
      this.sceneManager.remove(this.teeAreaMesh);
      this.teeAreaMesh = null;
    }
  }
}