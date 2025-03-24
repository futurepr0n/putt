import * as THREE from 'three';
import * as CANNON from 'cannon';
import { gameConfig } from '../../config/gameConfig.js';

export class Barrier {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    
    this.barrierMesh = null;
    this.barrierBody = null;
    
    this.material = new THREE.MeshStandardMaterial({ 
      color: gameConfig.materials.rough 
    });
  }
  
  create(x, z, width) {
    const height = 0.2;
    const depth = 0.1;
    
    // Determine orientation (random)
    const isVertical = Math.random() > 0.5;
    
    // Create visual representation
    const barrierGeometry = new THREE.BoxGeometry(
      isVertical ? depth : width, 
      height, 
      isVertical ? width : depth
    );
    
    this.barrierMesh = new THREE.Mesh(barrierGeometry, this.material);
    this.barrierMesh.position.set(x, height/2, z);
    this.barrierMesh.castShadow = true;
    this.barrierMesh.receiveShadow = true;
    this.sceneManager.add(this.barrierMesh);
    
    // Create physics body
    this.barrierBody = new CANNON.Body({ mass: 0 });
    this.barrierBody.addShape(new CANNON.Box(new CANNON.Vec3(
      (isVertical ? depth : width) / 2,
      height / 2,
      (isVertical ? width : depth) / 2
    )));
    this.barrierBody.position.set(x, height/2, z);
    this.physicsManager.addBody(this.barrierBody);
    
    return {
      type: 'barrier',
      position: { x, z },
      isVertical: isVertical,
      width: width
    };
  }
  
  remove() {
    if (this.barrierMesh) {
      this.sceneManager.remove(this.barrierMesh);
      this.barrierMesh = null;
    }
    
    if (this.barrierBody) {
      this.physicsManager.removeBody(this.barrierBody);
      this.barrierBody = null;
    }
  }
}