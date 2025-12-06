const THREE = window.THREE;
const CANNON = window.CANNON;
import { gameConfig } from '../config/gameConfig.js';

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
      flag: new THREE.MeshStandardMaterial({ color: gameConfig.materials.flag }),
      pole: new THREE.MeshStandardMaterial({ color: gameConfig.materials.pole })
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
    // Create hole (black circle)
    const holeGeometry = new THREE.CylinderGeometry(this.holeRadius, this.holeRadius, this.holeDepth, 32);
    this.holeMesh = new THREE.Mesh(holeGeometry, this.materials.hole);
    this.holeMesh.position.set(x, 0.01, z); // Slightly above ground to avoid z-fighting
    this.holeMesh.receiveShadow = true;
    this.sceneManager.add(this.holeMesh);
  }

  createFlag(x, z) {
    // Create flag pole
    const poleGeometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 8);
    this.poleMesh = new THREE.Mesh(poleGeometry, this.materials.pole);
    this.poleMesh.position.set(x, 0.5, z);
    this.poleMesh.castShadow = true;
    this.sceneManager.add(this.poleMesh);

    // Create flag
    const flagGeometry = new THREE.PlaneGeometry(0.3, 0.2);
    this.flagMesh = new THREE.Mesh(flagGeometry, this.materials.flag);
    this.flagMesh.position.set(x + 0.15, 0.8, z);
    this.flagMesh.castShadow = true;
    this.sceneManager.add(this.flagMesh);
  }

  createHoleGradient(x, z) {
    // Create a subtle hole gradient around the hole
    const holeGradientGeometry = new THREE.RingGeometry(this.holeRadius, this.holeRadius * 2, 32);
    const holeGradientMaterial = new THREE.MeshBasicMaterial({
      color: 0x005500,
      transparent: true,
      opacity: 0.3,
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
    this.playSinkSound();

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

  playSinkSound() {
    try {
      // Create an audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create oscillator for the "plop" sound
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      // Connect everything
      osc.connect(gain);
      gain.connect(audioContext.destination);

      // Set properties
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);

      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

      // Play the sound
      osc.start();
      osc.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error("Error playing hole sound:", error);
    }
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