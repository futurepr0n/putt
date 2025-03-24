import * as THREE from 'three';
import * as CANNON from 'cannon';
import { gameConfig } from '../../config/gameConfig.js';

export class SandTrap {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    
    this.sandMesh = null;
    this.sandBody = null;
    this.position = { x: 0, z: 0 };
    this.size = 0;
    
    // Create material
    this.material = new THREE.MeshStandardMaterial({ 
      color: gameConfig.materials.sand 
    });
  }
  
  create(x, z, size) {
    this.position = { x, z };
    this.size = size;
    
    // Visual representation - a flat cylinder for the sand trap
    const sandGeometry = new THREE.CylinderGeometry(size, size, 0.05, 32);
    this.sandMesh = new THREE.Mesh(sandGeometry, this.material);
    this.sandMesh.position.set(x, 0.025, z);
    this.sandMesh.receiveShadow = true;
    this.sceneManager.add(this.sandMesh);
    
    // Create a physics material for the sand
    const sandPhysicsMaterial = new CANNON.Material('sandMaterial');
    
    // Use a trigger zone
    this.sandBody = new CANNON.Body({
      mass: 0,
      collisionResponse: true,
      type: CANNON.Body.STATIC,
      material: sandPhysicsMaterial
    });
    
    // Use a cylinder shape with very small height to act as a zone
    const sandShape = new CANNON.Cylinder(size, size, 0.01, 16);
    this.sandBody.addShape(sandShape);
    this.sandBody.position.set(x, 0.005, z); // Place it just above ground level
    
    // Mark this body as a sand trap for collision detection
    this.sandBody.isSandTrap = true;
    
    // Add to physics world
    this.physicsManager.addBody(this.sandBody);
    
    // Create contact material between ball and sand with high friction but allowing passage
    const ballMaterial = new CANNON.Material('ballMaterial');
    const ballSandContactMaterial = new CANNON.ContactMaterial(
      ballMaterial,
      sandPhysicsMaterial,
      {
        friction: 0.9,       // High friction to slow the ball
        restitution: 0.1,    // Low bounce
        contactEquationStiffness: 1e6,  // Lower stiffness than normal ground
        contactEquationRelaxation: 5    // More relaxation for smoother interaction
      }
    );
    this.physicsManager.createContactMaterial(ballMaterial, sandPhysicsMaterial, {
      friction: 0.9,
      restitution: 0.1,
      contactEquationStiffness: 1e6,
      contactEquationRelaxation: 5
    });
    
    // Register post-step event to apply drag force to ball when in sand trap
    this.setupSandTrapPhysics();
    
    return {
      type: 'sandTrap',
      position: this.position,
      size: this.size
    };
  }
  
  setupSandTrapPhysics() {
    // Add event listener to apply drag force to ball when in sand trap
    this.physicsManager.world.addEventListener('postStep', () => {
      const balls = this.physicsManager.bodies.filter(body => 
        body.shapes[0] instanceof CANNON.Sphere && 
        body.mass > 0
      );
      
      for (const ball of balls) {
        if (this.isInSandTrap(ball)) {
          this.applyDragForce(ball);
        }
      }
    });
  }
  
  isInSandTrap(ballBody) {
    const pos = ballBody.position;
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const distanceSquared = dx * dx + dz * dz;
    
    // Check if ball's center is within the sand trap radius
    return distanceSquared < this.size * this.size;
  }
  
  applyDragForce(ballBody) {
    const velocity = ballBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    if (speed > 0.1) {
      // Calculate drag force (opposite to velocity direction)
      const dragFactor = 0.15; // Adjust as needed
      const dragForce = new CANNON.Vec3(
        -velocity.x * dragFactor,
        0, // No vertical drag
        -velocity.z * dragFactor
      );
      
      // Apply the drag force at the center of the ball
      ballBody.applyForce(dragForce, ballBody.position);
    }
  }
  
  remove() {
    if (this.sandMesh) {
      this.sceneManager.remove(this.sandMesh);
      this.sandMesh = null;
    }
    
    if (this.sandBody) {
      this.physicsManager.removeBody(this.sandBody);
      this.sandBody = null;
    }
  }
}