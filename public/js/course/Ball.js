const THREE = window.THREE;
const CANNON = window.CANNON;

export class Ball {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    
    this.ballRadius = 0.08;
    this.ballMesh = null;
    this.ballBody = null;
    this.debugSphere = null;
    
    this.initialPosition = { x: 0, y: 0.5, z: 0 };
  }
  
  create(x, y, z) {
    this.initialPosition = { x, y, z };
    
    // Create visual representation
    this.createVisual(x, y, z);
    
    // Create physics body
    this.createPhysics(x, y, z);
    
    // Create debug visualization
    this.createDebugSphere();
    
    return this.ballBody;
  }
  
  createVisual(x, y, z) {
    // Ball geometry
    const ballGeometry = new THREE.SphereGeometry(this.ballRadius, 32, 32);
    
    // Ball material with highlight for visibility
    const ballMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      emissive: 0xAAAAAA,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.2
    });
    
    // Create mesh
    this.ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    
    // Add highlight for visibility
    const highlightGeometry = new THREE.SphereGeometry(this.ballRadius * 0.2, 16, 16);
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.7
    });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.position.set(
      this.ballRadius * 0.4, 
      this.ballRadius * 0.4, 
      this.ballRadius * 0.4
    );
    this.ballMesh.add(highlight);
    
    // Set position
    this.ballMesh.position.set(x, y, z);
    
    // Add to scene
    this.sceneManager.add(this.ballMesh);
  }
  
  createPhysics(x, y, z) {
    // Create ball physics material
    const ballPhysMaterial = new CANNON.Material('ballMaterial');
    
    // Physics body with improved parameters
    this.ballBody = new CANNON.Body({ 
      mass: 0.15,
      linearDamping: 0.2,
      angularDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.05,
      sleepTimeLimit: 1,
      material: ballPhysMaterial
    });
    
    // Add sphere shape
    this.ballBody.addShape(new CANNON.Sphere(this.ballRadius));
    
    // Set position
    this.ballBody.position.set(x, y + 0.5, z);
    
    // Add to physics world
    this.physicsManager.addBody(this.ballBody, this.ballMesh);
    
    return this.ballBody;
  }
  
  createDebugSphere() {
    // Create a small sphere to visualize physics position
    const debugGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
    this.debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
    this.debugSphere.visible = false;
    
    // Add to scene
    this.sceneManager.add(this.debugSphere);
  }
  
  reset() {
    if (!this.ballBody) return;
    
    // Reset position, velocity, and wake the body
    this.ballBody.position.set(
      this.initialPosition.x, 
      this.initialPosition.y + 0.5, 
      this.initialPosition.z
    );
    this.ballBody.velocity.set(0, 0, 0);
    this.ballBody.angularVelocity.set(0, 0, 0);
    
    // Make sure it's awake
    this.ballBody.wakeUp();
    
    // Reset any scale changes
    if (this.ballMesh) {
      this.ballMesh.scale.set(1, 1, 1);
    }
  }
  
  applyPutt(direction, power) {
    if (!this.ballBody) return false;
    
    // Clear any existing velocity
    this.ballBody.velocity.set(0, 0, 0);
    this.ballBody.angularVelocity.set(0, 0, 0);
    
    // Make sure the ball is awake
    this.ballBody.wakeUp();
    
    // Create velocity vector
    const velocity = new CANNON.Vec3(
      direction.x * power,
      0.05, // Small upward component
      direction.z * power
    );
    
    // Apply impulse at the center of the ball
    this.ballBody.applyImpulse(velocity, this.ballBody.position);
    
    return true;
  }
  
  getPosition() {
    if (!this.ballBody) return null;
    return this.ballBody.position;
  }
  
  getVelocity() {
    if (!this.ballBody) return null;
    return this.ballBody.velocity;
  }
  
  setDebugVisibility(visible) {
    if (this.debugSphere) {
      this.debugSphere.visible = visible;
    }
  }
  
  update() {
    // Update debug sphere position
    if (this.debugSphere && this.ballBody) {
      this.debugSphere.position.copy(this.ballBody.position);
    }
  }
  
  remove() {
    if (this.ballMesh) {
      this.sceneManager.remove(this.ballMesh);
      this.ballMesh = null;
    }
    
    if (this.debugSphere) {
      this.sceneManager.remove(this.debugSphere);
      this.debugSphere = null;
    }
    
    if (this.ballBody) {
      this.physicsManager.removeBody(this.ballBody);
      this.ballBody = null;
    }
  }
}