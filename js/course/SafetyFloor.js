const THREE = window.THREE;
const CANNON = window.CANNON;

export class SafetyFloor {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.floors = [];
  }
  
  create(courseSize) {
    // Create multiple safety floors at different heights to catch the ball
    this.createFloorAtHeight(-0.5, courseSize);  // Just below the main terrain
    this.createFloorAtHeight(-2, courseSize);    // Further down
    this.createFloorAtHeight(-5, courseSize);    // Even further
    
    return this.floors;
  }
  
  createFloorAtHeight(height, courseSize) {
    // Create floor visualization (transparent)
    const floorGeometry = new THREE.PlaneGeometry(courseSize.width * 3, courseSize.length * 3);
    const floorMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x355E3B, 
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = height;
    this.sceneManager.add(floorMesh);
    
    // Physics body for the floor
    const floorBody = new CANNON.Body({ mass: 0 });
    const floorShape = new CANNON.Plane();
    floorBody.addShape(floorShape);
    floorBody.position.set(0, height, 0);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    
    // Add special properties to identify safety floors
    floorBody.isSafetyFloor = true;
    
    // Create floor material
    floorBody.material = new CANNON.Material('safetyFloorMaterial');
    this.physicsManager.addBody(floorBody);
    
    // Store for cleanup
    this.floors.push({
      mesh: floorMesh,
      body: floorBody,
      height: height
    });
    
    return { mesh: floorMesh, body: floorBody };
  }
  
  remove() {
    // Remove all safety floors
    for (const floor of this.floors) {
      this.sceneManager.remove(floor.mesh);
      this.physicsManager.removeBody(floor.body);
    }
    
    this.floors = [];
  }
}