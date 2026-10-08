const THREE = window.THREE;
const CANNON = window.CANNON;
import { gameConfig } from '../../config/gameConfig.js';
import { sandTexture } from '../../utils/Textures.js';

export class SandTrap {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;

    this.sandMesh = null;
    this.position = { x: 0, z: 0 };
    this.size = 0;
    this.stepListener = null;

    // Create material
    this.material = new THREE.MeshStandardMaterial({
      map: sandTexture(),
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  create(x, z, size) {
    this.position = { x, z };
    this.size = size;

    // Flat decal on the green; sand is a slowdown zone, not a collider
    const sandGeometry = new THREE.CircleGeometry(size, 48);
    this.sandMesh = new THREE.Mesh(sandGeometry, this.material);
    this.sandMesh.rotation.x = -Math.PI / 2;
    this.sandMesh.position.set(x, 0.003, z);
    this.sandMesh.receiveShadow = true;
    this.sceneManager.add(this.sandMesh);

    this.stepListener = () => this.applySandDrag();
    this.physicsManager.world.addEventListener('postStep', this.stepListener);

    return {
      type: 'sandTrap',
      position: this.position,
      size: this.size
    };
  }

  isInSandTrap(ballBody) {
    const pos = ballBody.position;
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    return dx * dx + dz * dz < this.size * this.size;
  }

  // Extra deceleration on top of the green's rolling resistance
  applySandDrag() {
    const dt = this.physicsManager.world.dt;
    for (const body of this.physicsManager.bodies) {
      if (body.type !== CANNON.Body.DYNAMIC || !(body.shapes[0] instanceof CANNON.Sphere)) continue;
      if (!this.isInSandTrap(body)) continue;

      const v = body.velocity;
      const speed = Math.sqrt(v.x * v.x + v.z * v.z);
      if (speed === 0) continue;

      const newSpeed = Math.max(0, speed - gameConfig.sand.decel * dt);
      const scale = newSpeed / speed;
      v.x *= scale;
      v.z *= scale;
      body.angularVelocity.scale(scale, body.angularVelocity);
    }
  }

  remove() {
    if (this.stepListener) {
      this.physicsManager.world.removeEventListener('postStep', this.stepListener);
      this.stepListener = null;
    }

    if (this.sandMesh) {
      this.sceneManager.remove(this.sandMesh);
      this.sandMesh = null;
    }
  }
}
