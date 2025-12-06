const THREE = window.THREE;
const CANNON = window.CANNON;
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
    // VISUAL: Use a scaled sphere to create a wide, gentle mound
    // We make it much wider than it is tall
    const radius = height * 4; // Much larger radius for gentler slope
    const geometry = new THREE.SphereGeometry(radius, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2);

    this.hillMesh = new THREE.Mesh(geometry, this.material);

    // Position it so only the top tip protrudes by 'height' amount
    // y = -radius + height
    this.hillMesh.position.set(x, -radius + height, z);

    // Scale it to be slightly elongated if desired, or keep circular
    // For now, let's keep it circular but wide
    this.hillMesh.scale.set(1, 0.5, 1); // Flatten it vertically visually

    this.hillMesh.receiveShadow = true;
    this.hillMesh.castShadow = true;
    this.sceneManager.add(this.hillMesh);

    // PHYSICS: Use a matching large sphere
    const hillMaterial = new CANNON.Material('hillMaterial');
    this.hillBody = new CANNON.Body({
      mass: 0,
      material: hillMaterial
    });

    // Physics shape matches the visual radius
    // Note: We don't scale physics shapes usually, so we rely on the large radius
    // and deep burial to create the gentle slope effect
    const hillShape = new CANNON.Sphere(radius);

    this.hillBody.addShape(hillShape);

    // Position matches visual (accounting for visual scaling vs real physics)
    // Since visual is scaled Y by 0.5, the effective visual height is radius * 0.5
    // But we want exact control.
    // Simpler approach: Don't scale visual, just bury a large sphere.
    // Let's reset visual scale and just use the large sphere technique.
    this.hillMesh.scale.set(1, 1, 1);
    this.hillMesh.position.set(x, -radius + height, z);
    this.hillBody.position.set(x, -radius + height, z);

    this.physicsManager.addBody(this.hillBody);

    // Create contact material that allows smoother rolling over the hill
    const ballMaterial = new CANNON.Material('ballMaterial');
    this.physicsManager.createContactMaterial(ballMaterial, hillMaterial, {
      friction: 0.1,        // Very low friction for smooth rolling
      restitution: 0.1,     // Low bounce
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