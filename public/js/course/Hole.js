const THREE = window.THREE;
const CANNON = window.CANNON;
import { gameConfig } from '../config/gameConfig.js';
import { playCupRattle } from '../utils/Sound.js';

export class Hole {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;

    this.holeRadius = gameConfig.hole.radius;
    this.holeDepth = gameConfig.hole.depth;
    this.holeMesh = null;
    this.holeGradientMesh = null;
    this.holeBody = null;
    this.poleMesh = null;
    this.flagMesh = null;
    this.holeCenterX = 0;
    this.holeCenterZ = 0;

    this.materials = {
      hole: new THREE.MeshStandardMaterial({ color: gameConfig.materials.hole }),
      flag: new THREE.MeshStandardMaterial({ color: gameConfig.materials.flag, side: THREE.DoubleSide, roughness: 0.7 }),
      pole: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.3 })
    };
  }

  create(x, z) {
    // Store center coordinates
    this.holeCenterX = x;
    this.holeCenterZ = z;

    // Create the hole (cup)
    this.createHoleMesh(x, z);

    // Create flag pole
    this.createFlag(x, z);

    // Create hole gradient
    this.createHoleGradient(x, z);

    // NOTE: We do not create a physics body for the hole anymore
    // to prevent the ball from bouncing off the "sensor" cylinder.
    // Detection is done via distance check in CourseManager.

    return {
      x: this.holeCenterX,
      z: this.holeCenterZ,
      radius: this.holeRadius
    };
  }

  createHoleMesh(x, z) {
    // Flush cup: dark opening plus a white liner rim, drawn on top of the green
    const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.holeMesh = new THREE.Group();
    this.holeMesh.position.set(x, 0.002, z);
    this.holeMesh.rotation.x = -Math.PI / 2;

    const opening = new THREE.Mesh(
      new THREE.CircleGeometry(this.holeRadius, 48),
      new THREE.MeshBasicMaterial({ map: Hole.cupTexture(), ...decal })
    );
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(this.holeRadius * 0.92, this.holeRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xf2f2f2, ...decal })
    );
    rim.position.z = 0.0005;
    this.holeMesh.add(opening, rim);
    this.sceneManager.add(this.holeMesh);
  }

  // Radial shading so the opening reads as a deep cup rather than a black disc
  static cupTexture() {
    if (!Hole._cupTexture) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(56, 70, 4, 64, 64, 64);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.6, '#0b0b0b');
      g.addColorStop(0.9, '#2a2a2a');
      g.addColorStop(1, '#4a4a4a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      Hole._cupTexture = new THREE.CanvasTexture(c);
      Hole._cupTexture.encoding = THREE.sRGBEncoding;
    }
    return Hole._cupTexture;
  }

  // Ripple the flag; called every frame
  update(time) {
    if (!this.flagMesh) return;
    const pos = this.flagMesh.geometry.attributes.position;
    const base = this.flagBase;
    const t = time / 1000;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const along = x + 0.2; // 0 at the pole, 0.4 at the free end
      pos.setZ(i, Math.sin(along * 14 - t * 5) * 0.035 * (along / 0.4));
    }
    pos.needsUpdate = true;
  }

  createFlag(x, z) {
    // Create flag pole
    const poleGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 8);
    this.poleMesh = new THREE.Mesh(poleGeometry, this.materials.pole);
    this.poleMesh.position.set(x, 0.6, z);
    this.poleMesh.castShadow = true;
    this.sceneManager.add(this.poleMesh);

    // Create flag
    const flagGeometry = new THREE.PlaneGeometry(0.4, 0.26, 12, 1);
    this.flagBase = Float32Array.from(flagGeometry.attributes.position.array);
    this.flagMesh = new THREE.Mesh(flagGeometry, this.materials.flag);
    this.flagMesh.position.set(x + 0.2, 1.05, z);
    this.flagMesh.castShadow = true;
    this.sceneManager.add(this.flagMesh);
  }

  createHoleGradient(x, z) {
    // Create a subtle hole gradient around the hole
    const holeGradientGeometry = new THREE.RingGeometry(this.holeRadius, this.holeRadius * 2, 48);
    const holeGradientMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a3a0a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.holeGradientMesh = new THREE.Mesh(holeGradientGeometry, holeGradientMaterial);
    this.holeGradientMesh.rotation.x = -Math.PI / 2;
    this.holeGradientMesh.position.set(x, 0.011, z);
    this.sceneManager.add(this.holeGradientMesh);
  }

  animateBallInHole(ballBody, ballMesh, onComplete) {
    if (!ballBody || !ballMesh) return;

    // Disable physics while animation is happening
    ballBody.type = CANNON.Body.KINEMATIC;
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);

    // Get starting position
    const startPos = ballBody.position.clone();
    const targetY = -0.3; // Target y position (below ground)
    const duration = gameConfig.hole.animationDuration; // Animation duration in ms
    const startTime = Date.now();

    // Try to play a sound effect
    playCupRattle();

    // Animation function
    const animateBallSink = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-in function for natural motion
      const easedProgress = progress * progress;

      // Drop and shrink the ball
      if (ballBody) {
        // Move down
        ballBody.position.y = startPos.y - easedProgress * (startPos.y - targetY);

        // Shrink ball mesh slightly as it "disappears" into the hole
        if (ballMesh) {
          const scale = 1 - easedProgress * 0.3;
          ballMesh.scale.set(scale, scale, scale);
        }

        // Rotate slightly during drop
        ballBody.quaternion.setFromAxisAngle(
          new CANNON.Vec3(1, 0, 0),
          progress * Math.PI / 2
        );
      }

      if (progress < 1) {
        requestAnimationFrame(animateBallSink);
      } else {
        // Animation complete
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 500);
      }
    };

    // Start the animation
    animateBallSink();
  }

  remove() {
    // Remove all hole-related objects
    if (this.holeMesh) {
      this.sceneManager.remove(this.holeMesh);
      this.holeMesh = null;
    }

    if (this.holeGradientMesh) {
      this.sceneManager.remove(this.holeGradientMesh);
      this.holeGradientMesh = null;
    }

    if (this.poleMesh) {
      this.sceneManager.remove(this.poleMesh);
      this.poleMesh = null;
    }

    if (this.flagMesh) {
      this.sceneManager.remove(this.flagMesh);
      this.flagMesh = null;
    }


  }
}