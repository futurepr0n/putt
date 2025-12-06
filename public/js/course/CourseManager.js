const THREE = window.THREE;
const CANNON = window.CANNON;
import { gameConfig } from '../config/gameConfig.js';
import { Ball } from './Ball.js';
import { Hole } from './Hole.js';
import { Tee } from './Tee.js';
import { Barrier } from './obstacles/Barrier.js';
import { SandTrap } from './obstacles/SandTrap.js';
import { Hill } from './obstacles/Hill.js';
import { SafetyFloor } from './SafetyFloor.js';

export class CourseManager {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;

    this.courseSize = gameConfig.courseSize;
    this.ball = null;
    this.hole = null;
    this.tee = null;
    this.obstacles = [];
    this.safetyFloors = [];
    this.boundaries = [];
    this.groundMesh = null;
    this.groundBody = null;

    this.materials = {
      green: new THREE.MeshStandardMaterial({ color: gameConfig.materials.green }),
      rough: new THREE.MeshStandardMaterial({ color: gameConfig.materials.rough }),
      sand: new THREE.MeshStandardMaterial({ color: gameConfig.materials.sand })
    };

    this.holeInProgress = false;
  }

  createCourse(courseNumber, par) {
    // Clear existing course
    this.clearCourse();

    // Create base green
    this.createGround();

    // Create the hole (cup)
    this.createHole(0, this.courseSize.length / 2 - 2);

    // Create tee marker
    this.createTee(0, -this.courseSize.length / 2 + 3);

    // Create boundaries
    this.createBoundaries();

    // Create safety floors
    this.createSafetyFloors();

    // Create ball at the tee position
    this.createBall(0, 0.5, -this.courseSize.length / 2 + 3);

    // Set up contact detection
    this.setupContactDetection();

    // Add obstacles based on course number
    this.addObstacles(courseNumber);
  }

  createGround() {
    // Create the base green - a simple flat plane
    const groundGeometry = new THREE.PlaneGeometry(this.courseSize.width, this.courseSize.length);
    this.groundMesh = new THREE.Mesh(groundGeometry, this.materials.green);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.sceneManager.add(this.groundMesh);

    // Create a simple flat ground for physics
    this.groundBody = new CANNON.Body({ mass: 0 });
    const groundShape = new CANNON.Plane();
    this.groundBody.addShape(groundShape);
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.groundBody.material = new CANNON.Material('groundMaterial');
    this.physicsManager.addBody(this.groundBody);
  }

  createHole(x, z) {
    this.hole = new Hole(this.sceneManager, this.physicsManager);
    this.hole.create(x, z);
  }

  createTee(x, z) {
    this.tee = new Tee(this.sceneManager);
    this.tee.create(x, z);
  }

  createBall(x, y, z) {
    this.ball = new Ball(this.sceneManager, this.physicsManager);
    this.ball.create(x, y, z);
  }

  createBoundaries() {
    const boundaryHeight = 0.3;
    const boundaryThickness = 0.4;

    // Create boundaries around the course
    // Left boundary
    this.createBoundary(
      -this.courseSize.width / 2 - boundaryThickness / 2,
      0,
      0,
      boundaryThickness,
      this.courseSize.length + boundaryThickness * 2
    );

    // Right boundary
    this.createBoundary(
      this.courseSize.width / 2 + boundaryThickness / 2,
      0,
      0,
      boundaryThickness,
      this.courseSize.length + boundaryThickness * 2
    );

    // Top boundary
    this.createBoundary(
      0,
      0,
      this.courseSize.length / 2 + boundaryThickness / 2,
      this.courseSize.width + boundaryThickness * 2,
      boundaryThickness
    );

    // Bottom boundary
    this.createBoundary(
      0,
      0,
      -this.courseSize.length / 2 - boundaryThickness / 2,
      this.courseSize.width + boundaryThickness * 2,
      boundaryThickness
    );
  }

  createBoundary(x, y, z, width, depth) {
    const boundaryHeight = 0.3;

    // Visual
    const boundaryGeom = new THREE.BoxGeometry(width, boundaryHeight, depth);
    const boundaryMesh = new THREE.Mesh(boundaryGeom, this.materials.rough);
    boundaryMesh.position.set(x, y + boundaryHeight / 2, z);
    boundaryMesh.castShadow = true;
    boundaryMesh.receiveShadow = true;
    this.sceneManager.add(boundaryMesh);

    // Physics
    const boundaryBody = new CANNON.Body({ mass: 0 });
    boundaryBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, boundaryHeight / 2, depth / 2)));
    boundaryBody.position.set(x, y + boundaryHeight / 2, z);
    this.physicsManager.addBody(boundaryBody);

    this.boundaries.push({
      mesh: boundaryMesh,
      body: boundaryBody
    });
  }

  createSafetyFloors() {
    const safetyFloor = new SafetyFloor(this.sceneManager, this.physicsManager);
    safetyFloor.create(this.courseSize);
    this.safetyFloors.push(safetyFloor);
  }

  addObstacles(courseNumber) {
    const numObstacles = Math.min(courseNumber + 1, 3);

    for (let i = 0; i < numObstacles; i++) {
      // Determine obstacle type based on index and course
      const obstacleType = (i + courseNumber) % 3;

      // Position obstacles on sides, away from the center path
      const x = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2);
      const z = -this.courseSize.length / 4 + (Math.random() * this.courseSize.length / 2);

      // Create obstacle based on type
      let obstacle;

      switch (obstacleType) {
        case 0: // Sand trap
          obstacle = new SandTrap(this.sceneManager, this.physicsManager);
          obstacle.create(x, z, 0.6 + Math.random() * 0.4);
          break;

        case 1: // Hill
          obstacle = new Hill(this.sceneManager, this.physicsManager);
          obstacle.create(x, z, 0.3 + Math.random() * 0.2);
          break;

        case 2: // Barrier
          obstacle = new Barrier(this.sceneManager, this.physicsManager);
          obstacle.create(x, z, 0.8 + Math.random() * 0.6);
          break;
      }

      if (obstacle) {
        this.obstacles.push(obstacle);
      }
    }
  }

  setupContactDetection() {
    this.physicsManager.addContactDetection((event) => {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;

      // Check for safety floor contacts
      if ((bodyA === this.ball.ballBody && bodyB.isSafetyFloor) ||
        (bodyB === this.ball.ballBody && bodyA.isSafetyFloor)) {

        if (this.ball.ballBody.velocity.y < -5) {
          console.log("Ball hit safety floor with high velocity");
          this.ball.ballBody.velocity.y = Math.abs(this.ball.ballBody.velocity.y) * 0.5;

          if (this.ball.ballBody.position.y < -10) {
            this.resetBallToTee();
          }
        }
      }

      // Check for hole trigger contact
      if ((bodyA === this.ball.ballBody && bodyB.isHoleTrigger) ||
        (bodyB === this.ball.ballBody && bodyA.isHoleTrigger)) {

        console.log("Ball contacted hole physics");

        // Only trigger if ball is moving slowly enough and close to center
        const velocity = this.ball.ballBody.velocity;
        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

        const ballPos = this.ball.ballBody.position;
        const dx = ballPos.x - this.hole.holeCenterX;
        const dz = ballPos.z - this.hole.holeCenterZ;
        const distanceToCenter = Math.sqrt(dx * dx + dz * dz);

        // More forgiving conditions on actual collision
        if (horizontalSpeed < 2.5 &&
          distanceToCenter < this.hole.holeRadius * 1.5 &&
          !this.holeInProgress) {
          console.log("Ball in hole detected via contact!");
          this.startHoleAnimation();
        }
      }
    });
  }

  checkBallInHole() {
    if (this.holeInProgress || !this.ball || !this.hole) return false;

    const ballPos = this.ball.ballBody.position;
    const holeX = this.hole.holeCenterX;
    const holeZ = this.hole.holeCenterZ;

    // Calculate distance from ball to hole center (horizontal only)
    const dx = ballPos.x - holeX;
    const dz = ballPos.z - holeZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Check if ball is close enough to hole center and moving slowly
    const velocity = this.ball.ballBody.velocity;
    const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

    // Apply gentle attraction when ball is near the hole
    if (distance < this.hole.holeRadius * 4 && horizontalSpeed < 2 && ballPos.y < 0.2) {
      // Calculate force direction toward hole
      const forceFactor = 0.01 * (1 - distance / (this.hole.holeRadius * 4));
      const forceX = -dx * forceFactor;
      const forceZ = -dz * forceFactor;

      // Apply the force
      this.ball.ballBody.applyForce(
        new CANNON.Vec3(forceX, 0, forceZ),
        this.ball.ballBody.position
      );
    }

    // Ball is in hole if it's closer to the center and moving at a reasonable speed
    // MODIFIED: Relaxed thresholds for better gameplay
    if (distance < this.hole.holeRadius * 1.5 && horizontalSpeed < 2.5 && ballPos.y < 0.25) {
      console.log("Ball in hole! Distance:", distance, "Speed:", horizontalSpeed);
      this.startHoleAnimation();
      return true;
    }

    return false;
  }

  startHoleAnimation() {
    if (this.holeInProgress) return;
    this.holeInProgress = true;

    this.hole.animateBallInHole(this.ball.ballBody, this.ball.ballMesh, () => {
      // Hole animation complete
      this.holeInProgress = false;
    });
  }

  isHoleInProgress() {
    return this.holeInProgress;
  }

  resetBallToTee() {
    if (!this.ball || !this.tee) return;

    const teePosition = this.tee.getPosition();
    this.ball.reset();

    // Update ball position to tee position
    this.ball.ballBody.position.set(
      teePosition.x,
      0.5,
      teePosition.z
    );
  }

  puttBall(velocityData) {
    if (!this.ball) return false;

    // Calculate the magnitude of the input velocity
    const velocityMagnitude = Math.sqrt(
      velocityData.x * velocityData.x +
      velocityData.y * velocityData.y +
      velocityData.z * velocityData.z
    );

    // Normalize direction
    const direction = { x: 0, y: 0, z: 1 }; // Default direction (forward)
    const dirMagnitude = Math.sqrt(
      velocityData.x * velocityData.x +
      velocityData.z * velocityData.z
    );

    if (dirMagnitude > 0) {
      direction.x = velocityData.x / dirMagnitude;
      direction.z = velocityData.z / dirMagnitude;
    }

    // Calculate power
    const normalizedMagnitude = Math.min(velocityMagnitude / 30, 1);
    // Apply a power curve: slower at low power, more responsive at mid power
    const powerCurve = normalizedMagnitude < 0.5 ?
      normalizedMagnitude * normalizedMagnitude * 2 : // Quadratic for low values
      normalizedMagnitude; // Linear for higher values

    const forceMagnitude = gameConfig.putt.minForce +
      powerCurve * (gameConfig.putt.maxForce - gameConfig.putt.minForce);

    // Add power to the velocity data for UI feedback
    velocityData.power = normalizedMagnitude;

    // Apply putt to ball
    return this.ball.applyPutt(direction, forceMagnitude);
  }

  getBallPosition() {
    return this.ball ? this.ball.getPosition() : null;
  }

  getBallVelocity() {
    return this.ball ? this.ball.getVelocity() : null;
  }

  setDebugVisibility(visible) {
    if (this.ball) {
      this.ball.setDebugVisibility(visible);
    }
  }

  clearCourse() {
    // Remove all objects from the scene and physics world

    // Remove ball
    if (this.ball) {
      this.ball.remove();
      this.ball = null;
    }

    // Remove hole
    if (this.hole) {
      this.hole.remove();
      this.hole = null;
    }

    // Remove tee
    if (this.tee) {
      this.tee.remove();
      this.tee = null;
    }

    // Remove obstacles
    for (const obstacle of this.obstacles) {
      obstacle.remove();
    }
    this.obstacles = [];

    // Remove safety floors
    for (const floor of this.safetyFloors) {
      floor.remove();
    }
    this.safetyFloors = [];

    // Remove boundaries
    for (const boundary of this.boundaries) {
      this.sceneManager.remove(boundary.mesh);
      this.physicsManager.removeBody(boundary.body);
    }
    this.boundaries = [];

    // Remove ground
    if (this.groundMesh) {
      this.sceneManager.remove(this.groundMesh);
      this.groundMesh = null;
    }

    if (this.groundBody) {
      this.physicsManager.removeBody(this.groundBody);
      this.groundBody = null;
    }

    // Reset state
    this.holeInProgress = false;
  }
}