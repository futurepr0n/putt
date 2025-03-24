import * as THREE from 'three';
import * as CANNON from 'cannon';
import { gameConfig } from '../../config/gameConfig.js';

export class Hill {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    
    this.hillMesh = null;
    this.hillBody = null;
    
    this.material = new THREE.MeshStandardMaterial({ 
      color: gameConfig.materials.green 
    });
  }
  
  create(x, z, height) {
    // Visual - we'll use a hemisphere for the hill
    const hillGeometry = new THREE.SphereGeometry(
      height * 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2
    );
    this.hillMesh = new THREE.Mesh(hillGeometry, this.material);
    this.hillMesh.position.set(x, 0, z);
    this.hillMesh.receiveShadow = true;
    this.hillMesh.castShadow = true;
    this.sceneManager.add(this.hillMesh);
    
    // Physics - use a sphere shape with a smoother collision response
    const hillMaterial = new CANNON.Material('hillMaterial');
    this.hillBody = new CANNON.Body({ 
      mass: 0,
      material: hillMaterial
    });
    
    // Use a smaller collision shape than the visual one
    const hillShape = new CANNON.Sphere(height * 1.5); // Reduced from height * 2
    
    // Position the sphere so more of it is below the ground
    this.hillBody.addShape(hillShape);
    this.hillBody.position.set(x, -height * 0.7, z); // More embedded in ground
    this.physicsManager.addBody(this.hillBody);
    
    // Create contact material that allows smoother rolling over the hill
    const ballMaterial = new CANNON.Material('ballMaterial');
    this.physicsManager.createContactMaterial(ballMaterial, hillMaterial, {
      friction: 0.2,        // Lower friction for smoother rolling
      restitution: 0.3,     // Moderate bounce
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4
    });
    
    return {
      type: 'hill',
      position: { x, z },
      height: height
    };
  }
  
  remove() {
    if (this.hillMesh) {
      this.sceneManager.remove(this.hillMesh);
      this.hillMesh = null;
    }
    
    if (this.hillBody) {
      this.physicsManager.removeBody(this.hillBody);
      this.hillBody = null;
    }
  }
}