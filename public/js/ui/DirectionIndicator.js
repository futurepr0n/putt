const THREE = window.THREE;

export class DirectionIndicator {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.arrow = null;
  }

  create() {
    // Create arrow components
    const arrowLength = 3.0; // Significantly longer (was 1)
    const arrowHeadSize = 0.5; // Larger head

    // Create arrow body
    const bodyGeometry = new THREE.CylinderGeometry(0.04, 0.04, arrowLength, 8);
    bodyGeometry.rotateX(Math.PI / 2); // Make it point forward (z-axis)
    bodyGeometry.translate(0, 0, arrowLength / 2); // Move center to base of arrow

    // Create arrow head
    const headGeometry = new THREE.ConeGeometry(arrowHeadSize, arrowHeadSize * 2.0, 16);
    headGeometry.rotateX(Math.PI / 2); // Make it point forward
    headGeometry.translate(0, 0, arrowLength); // Position at end of body

    // Arrow material
    const arrowMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7
    });

    try {
      // Create arrow with merged geometry if BufferGeometryUtils is available
      if (typeof THREE.BufferGeometryUtils !== 'undefined' &&
        typeof THREE.BufferGeometryUtils.mergeBufferGeometries === 'function') {

        const combinedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries([
          bodyGeometry,
          headGeometry
        ]);

        this.arrow = new THREE.Mesh(combinedGeometry, arrowMaterial);
      } else {
        // If BufferGeometryUtils is not available, create a group
        this.arrow = new THREE.Group();

        const bodyMesh = new THREE.Mesh(bodyGeometry, arrowMaterial);
        const headMesh = new THREE.Mesh(headGeometry, arrowMaterial);

        this.arrow.add(bodyMesh);
        this.arrow.add(headMesh);
      }

      this.arrow.visible = false; // Initially hidden
      this.sceneManager.add(this.arrow);

    } catch (error) {
      console.error("Error creating direction indicator:", error);

      // Basic fallback arrow
      const basicArrowGeometry = new THREE.CylinderGeometry(0.02, 0.02, arrowLength, 8);
      basicArrowGeometry.rotateX(Math.PI / 2);
      this.arrow = new THREE.Mesh(basicArrowGeometry, arrowMaterial);
      this.arrow.visible = false;
      this.sceneManager.add(this.arrow);
    }

    return this.arrow;
  }

  update(ballPosition, directionData, isSwingFeedback = false) {
    if (!this.arrow) return;

    // Position arrow at the ball's current position
    this.arrow.position.set(ballPosition.x, 0.1, ballPosition.z); // Slightly above ground

    // Use orientation data to set arrow direction
    const angle = Math.atan2(directionData.x, directionData.z);
    this.arrow.rotation.y = angle;

    // Calculate magnitude of direction
    const magnitude = Math.sqrt(
      directionData.x * directionData.x +
      directionData.y * directionData.y +
      directionData.z * directionData.z
    );

    // Map power to arrow length (scale)
    const minScale = 0.5;
    const maxScale = 3.0;
    // If swing feedback, magnitude is already scaled nicely by UIManager
    let powerScale = isSwingFeedback ? Math.min(magnitude, maxScale) : 1.0;

    if (!isSwingFeedback) {
      // Normal aiming mode - keep constant length or slight pulse?
      // User requested pulse.
      const time = Date.now() / 500;
      const pulse = 1.0 + Math.sin(time) * 0.1;
      powerScale = pulse;
    }

    // Apply scale
    if (this.arrow instanceof THREE.Group) {
      this.arrow.scale.set(1, 1, powerScale);
    } else {
      this.arrow.scale.z = powerScale;
    }

    // Make arrow visible
    this.arrow.visible = true;

    // Update visuals based on mode
    const opacity = isSwingFeedback ? 1.0 : 0.6;
    const color = isSwingFeedback ? 0x00ff00 : 0xffffff; // Green for swing, White for aim

    this.updateMaterial(color, opacity);
  }

  updateMaterial(color, opacity) {
    if (this.arrow.material) {
      this.arrow.material.color.setHex(color);
      this.arrow.material.opacity = opacity;
    } else if (this.arrow.children) {
      this.arrow.children.forEach(child => {
        if (child.material) {
          child.material.color.setHex(color);
          child.material.opacity = opacity;
        }
      });
    }
  }

  hide() {
    if (this.arrow) {
      this.arrow.visible = false;
    }
  }

  show() {
    if (this.arrow) {
      this.arrow.visible = true;
    }
  }

  remove() {
    if (this.arrow) {
      this.sceneManager.remove(this.arrow);
      this.arrow = null;
    }
  }
}