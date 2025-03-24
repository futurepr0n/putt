//const CANNON = window.CANNON;
const CANNON = window.CANNON;

export class PhysicsManager {
  constructor() {
    this.world = null;
    this.bodies = [];
    this.bodyToMesh = new Map(); // Maps physics bodies to visual meshes
  }
  
  init() {
    // Create physics world
    this.world = new CANNON.World();
    this.setupPhysics();
  }
  
  setupPhysics() {
    // Standard earth gravity
    this.world.gravity.set(0, -9.82, 0);
    
    // More iterations for stable physics
    this.world.solver.iterations = 20;
    
    // Smaller time step for more accurate physics
    this.world.fixedTimeStep = 1/120;
    
    // Set default contact material
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.3;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;
  }
  
  addBody(body, mesh = null) {
    this.world.addBody(body);
    this.bodies.push(body);
    
    if (mesh) {
      this.bodyToMesh.set(body, mesh);
    }
    
    return body;
  }
  
  removeBody(body) {
    this.world.removeBody(body);
    const index = this.bodies.indexOf(body);
    if (index !== -1) {
      this.bodies.splice(index, 1);
    }
    
    this.bodyToMesh.delete(body);
  }
  
  clear() {
    // Remove all physics bodies
    for (const body of this.bodies) {
      this.world.removeBody(body);
    }
    
    this.bodies = [];
    this.bodyToMesh.clear();
  }
  
  update() {
    // Step the physics simulation
    this.world.step(1/60);
    
    // Sync meshes with physics bodies
    this.syncMeshes();
  }
  
  syncMeshes() {
    for (const [body, mesh] of this.bodyToMesh.entries()) {
      if (mesh && body) {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      }
    }
  }
  
  createContactMaterial(material1, material2, options) {
    const contactMaterial = new CANNON.ContactMaterial(material1, material2, options);
    this.world.addContactMaterial(contactMaterial);
    return contactMaterial;
  }
  
  addContactDetection(callback) {
    this.world.addEventListener('beginContact', callback);
  }
}