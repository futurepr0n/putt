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
    this.balls = new Map(); // playerId -> Ball
    this.ball = null; // Ball of the player whose shot it is
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

    this.setupHoleDetection();

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

  // Ball enters play on the tee when its player first tees off
  spawnBall(playerId, color) {
    if (this.balls.has(playerId)) return this.balls.get(playerId);
    const tee = this.tee.getPosition();
    const ball = new Ball(this.sceneManager, this.physicsManager, color);
    ball.create(tee.x, -0.5 + ball.ballRadius + 0.01, tee.z);
    this.balls.set(playerId, ball);
    return ball;
  }

  getBall(playerId) {
    return this.balls.get(playerId) || null;
  }

  removeBall(playerId) {
    const ball = this.balls.get(playerId);
    if (!ball) return;
    ball.remove();
    this.balls.delete(playerId);
    if (this.ball === ball) this.ball = null;
  }

  // Active ball is live; every other ball is marked (see-through, no collisions)
  setActiveBall(playerId) {
    this.ball = this.balls.get(playerId) || null;
    for (const [id, ball] of this.balls) ball.setMarked(id !== playerId);
    this.ballSunk = false;
    this.prevBallPos = null;
    this.lippingOut = false;
  }

  distanceToHole(playerId) {
    const ball = this.balls.get(playerId);
    const pos = ball ? ball.getPosition() : this.tee.getPosition();
    return Math.hypot(pos.x - this.hole.holeCenterX, pos.z - this.hole.holeCenterZ);
  }

  allBallsAtRest(threshold = 0.05) {
    for (const ball of this.balls.values()) {
      if (ball.marked) continue;
      const v = ball.getVelocity();
      if (v && Math.hypot(v.x, v.y, v.z) > threshold) return false;
    }
    return true;
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

  setupHoleDetection() {
    this.ballSunk = false;
    this.prevBallPos = null;
    this.lippingOut = false;
    this.holeStepListener = () => this.stepHoleDetection();
    this.physicsManager.world.addEventListener('postStep', this.holeStepListener);
  }

  // Runs every physics sub-step so fast putts can't skip over the cup between checks
  stepHoleDetection() {
    if (this.holeInProgress || this.ballSunk || !this.ball || !this.ball.ballBody || !this.hole) return;

    const body = this.ball.ballBody;
    const pos = body.position;
    const prev = this.prevBallPos || { x: pos.x, z: pos.z };
    this.prevBallPos = { x: pos.x, z: pos.z };

    if (pos.y > this.ball.ballRadius + 0.05) return;

    const hx = this.hole.holeCenterX;
    const hz = this.hole.holeCenterZ;
    const r = this.hole.holeRadius;
    const v = body.velocity;
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);

    // Closest point to the cup centre on the segment travelled this step
    const sx = pos.x - prev.x;
    const sz = pos.z - prev.z;
    const segLenSq = sx * sx + sz * sz;
    const t = segLenSq > 0 ? Math.max(0, Math.min(1, ((hx - prev.x) * sx + (hz - prev.z) * sz) / segLenSq)) : 1;
    const cx = prev.x + sx * t;
    const cz = prev.z + sz * t;
    const dx = hx - cx;
    const dz = hz - cz;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance >= r) this.lippingOut = false;

    if (distance < r) {
      // Fast balls catch less of the cup, so require a more central line as speed rises
      const maxSpeed = gameConfig.hole.maxCaptureSpeed;
      const effectiveRadius = r * Math.max(0, 1 - speed / maxSpeed);
      if (distance < effectiveRadius || speed < 0.3) {
        body.position.set(cx, pos.y, cz);
        this.ballSunk = true;
        this.lippingOut = false;
        this.startHoleAnimation();
        return;
      }
      // Lip-out once per pass: lose some pace and get nudged off line
      if (this.lippingOut) return;
      this.lippingOut = true;
      const lip = Math.sign(dx * sz - dz * sx) || 1;
      const scale = 0.75;
      const angle = lip * 0.25 * (1 - distance / r);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const nvx = (v.x * cos + v.z * sin) * scale;
      const nvz = (-v.x * sin + v.z * cos) * scale;
      v.x = nvx;
      v.z = nvz;
      return;
    }

    // Gentle assist for slow balls dying near the cup
    const assistRange = r * gameConfig.hole.assistRadiusFactor;
    if (distance < assistRange && speed < gameConfig.hole.assistMaxSpeed) {
      const pull = 1.5 * (1 - distance / assistRange) * this.physicsManager.world.dt;
      v.x += (dx / distance) * pull;
      v.z += (dz / distance) * pull;
    }
  }

  checkBallInHole() {
    return !!this.ballSunk;
  }

  stopBall() {
    if (this.ball) this.ball.stop();
  }

  placeActiveBall(x, z) {
    if (!this.ball) return;
    this.ball.setPosition(x, z);
    this.prevBallPos = null;
    this.lippingOut = false;
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

  puttBall(angle, power) {
    if (!this.ball) return false;

    const { minSpeed, maxSpeed, powerExponent } = gameConfig.putt;
    const speed = minSpeed + (maxSpeed - minSpeed) * Math.pow(power, powerExponent);
    return this.ball.applyPutt(angle, speed);
  }

  getBallPosition() {
    return this.ball ? this.ball.getPosition() : null;
  }

  getBallVelocity() {
    return this.ball ? this.ball.getVelocity() : null;
  }

  setDebugVisibility(visible) {
    for (const ball of this.balls.values()) ball.setDebugVisibility(visible);
  }

  clearCourse() {
    // Remove all objects from the scene and physics world
    if (this.holeStepListener) {
      this.physicsManager.world.removeEventListener('postStep', this.holeStepListener);
      this.holeStepListener = null;
    }
    this.ballSunk = false;
    this.prevBallPos = null;
    this.lippingOut = false;

    for (const ball of this.balls.values()) ball.remove();
    this.balls.clear();
    this.ball = null;

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