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
    // Make the tee marker more visible
    const teeGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
    const teeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      emissive: 0x333333
    });
    this.teeMesh = new THREE.Mesh(teeGeometry, teeMaterial);
    
    // Position it higher to be more visible
    this.teeMesh.position.set(x, 0.05, z);
    this.teeMesh.receiveShadow = true;
    this.sceneManager.add(this.teeMesh);
    
    // Also add a visual indicator for the tee area
    const teeAreaGeometry = new THREE.CircleGeometry(0.4, 32);
    const teeAreaMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x90EE90, // Light green
      transparent: true,
      opacity: 0.7
    });
    this.teeAreaMesh = new THREE.Mesh(teeAreaGeometry, teeAreaMaterial);
    this.teeAreaMesh.rotation.x = -Math.PI / 2; // Flat on ground
    this.teeAreaMesh.position.set(x, 0.01, z);
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