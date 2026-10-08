import { SceneManager } from './SceneManager.js';
import { PhysicsManager } from './PhysicsManager.js';
import { SocketManager } from './SocketManager.js';
import { CourseManager } from '../course/CourseManager.js';
import { UIManager } from '../ui/UIManager.js';
import { gameConfig } from '../config/gameConfig.js';

export class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.currentCourse = 0;
    this.totalScore = 0;
    this.strokeCount = 0;
    this.ballInMotion = false;
    this.lastPuttTime = 0;
    this.courseCompleted = false;
    this.lastFrameTime = null;

    // Aim angle in world space (radians, atan2(x, z) convention)
    this.aimAngle = 0;
    this.aimAnchor = 0;

    // Initialize managers
    this.sceneManager = new SceneManager();
    this.physicsManager = new PhysicsManager();

    // Don't initialize these yet as they depend on the scene and physics
    this.courseManager = null;
    this.uiManager = null;
    this.socketManager = null;

    // Bind methods
    this.animate = this.animate.bind(this);

    // Start animation loop immediately
    requestAnimationFrame(this.animate);
  }

  init() {
    // Now initialize the managers
    this.sceneManager.init();

    // Initialize the dependent managers
    this.courseManager = new CourseManager(this.sceneManager, this.physicsManager);
    this.uiManager = new UIManager(this);
    this.socketManager = new SocketManager(this.roomId, this);

    // Initialize them
    this.uiManager.init();
    this.socketManager.init();

    // Connect socket events
    this.connectSocketEvents();

    // Create first course
    // Set par for the current course
    this.par = gameConfig.coursePars[this.currentCourse] || 3;

    // Create the course
    this.courseManager.createCourse(this.currentCourse, this.par);

    // Update UI
    this.uiManager.updateCourseInfo(this.currentCourse + 1, gameConfig.totalCourses, this.par);

    this.aimAtHole();

    // Set up event listeners
    this.setupEventListeners();
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    const dt = this.lastFrameTime === null ? 0 : Math.min((time - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = time;

    // Only update physics after everything is initialized
    if (this.physicsManager && this.physicsManager.world && dt > 0) {
      this.physicsManager.update(dt);
    }

    // Check game states if initialized
    if (this.courseManager) {
      this.checkBallReset();
      this.checkBallInHole();
    }

    // Update UI if initialized
    if (this.uiManager) {
      this.uiManager.update();
    }

    // Render scene
    if (this.sceneManager && this.sceneManager.renderer && this.sceneManager.scene && this.sceneManager.camera) {
      this.sceneManager.render();
    }
  }

  handlePutt(velocityData) {
    if (this.ballInMotion || this.courseCompleted) {
      this.uiManager.showMessage('Wait for the ball to stop moving!');
      this.notifyController('putt_rejected', this.courseCompleted ? 'Hole finished - next hole loading' : 'Ball still moving - wait');
      return;
    }

    const power = Math.max(0, Math.min(Number(velocityData.power) || 0, 1));
    const maxDeviation = 15 * Math.PI / 180;
    const deviation = Math.max(-maxDeviation, Math.min((Number(velocityData.deviation) || 0) * Math.PI / 180, maxDeviation));

    const success = this.courseManager.puttBall(this.aimAngle + deviation, power);

    if (success) {
      this.ballInMotion = true;
      this.lastPuttTime = Date.now();
      this.strokeCount++;
      this.uiManager.updateStrokeDisplay(this.strokeCount);
      this.uiManager.showMessage(`Putt power: ${Math.round(power * 100)}%`);
      this.notifyController('putt_accepted', `Stroke ${this.strokeCount} - ${Math.round(power * 100)}% power`);
    }
  }

  resetBall() {
    this.ballInMotion = false;
    this.courseManager.resetBallToTee();
    this.aimAtHole();
    this.uiManager.showMessage('Ball reset. Ready for next shot');
    this.notifyController('ready', 'Ball reset - ready');
  }

  notifyController(state, message) {
    if (this.socketManager) this.socketManager.emitStatus(state, message);
  }

  getAngleToHole() {
    const ballPos = this.courseManager.getBallPosition();
    const hole = this.courseManager.hole;
    if (!ballPos || !hole) return null;
    return Math.atan2(hole.holeCenterX - ballPos.x, hole.holeCenterZ - ballPos.z);
  }

  aimAtHole() {
    const angle = this.getAngleToHole();
    if (angle === null) return;
    this.aimAngle = angle;
    this.aimAnchor = angle;
    this.refreshAimArrow();
  }

  refreshAimArrow() {
    this.uiManager.updateDirectionArrow({ x: Math.sin(this.aimAngle), y: 0, z: Math.cos(this.aimAngle) });
  }

  checkBallReset() {
    const ballPosition = this.courseManager.getBallPosition();

    if (!ballPosition) return;

    // Check if ball is out of bounds
    if (ballPosition.y < -20 ||
      Math.abs(ballPosition.x) > 50 ||
      Math.abs(ballPosition.z) > 50) {

      this.resetBall();

      if (this.strokeCount > 0) {
        this.strokeCount++;
        this.uiManager.updateStrokeDisplay(this.strokeCount);
        this.uiManager.showMessage('Out of bounds! +1 stroke penalty');
      }
    }

    // Check if ball has stopped
    const ballVelocity = this.courseManager.getBallVelocity();
    const speed = Math.sqrt(
      ballVelocity.x * ballVelocity.x +
      ballVelocity.y * ballVelocity.y +
      ballVelocity.z * ballVelocity.z
    );

    if (speed < 0.1 && this.ballInMotion && Date.now() - this.lastPuttTime > 2000) {
      this.ballInMotion = false;
      this.courseManager.stopBall();
      this.aimAtHole();
      this.uiManager.showMessage('Ready for next shot');
      this.notifyController('ready', `Ready for stroke ${this.strokeCount + 1}`);
    }
  }

  checkBallInHole() {
    if (!this.courseCompleted && this.courseManager.checkBallInHole()) {
      this.holeComplete();
    }
  }

  holeComplete() {
    this.courseCompleted = true;

    // Show hole complete message
    this.uiManager.showHoleComplete(this.strokeCount, this.par);

    // Add to total score
    this.totalScore += this.strokeCount;
    this.notifyController('hole_complete', `In the hole! ${this.strokeCount} strokes (par ${this.par})`);

    // Move to next course after a delay
    setTimeout(() => {
      this.currentCourse++;
      if (this.currentCourse < gameConfig.totalCourses) {
        // Set par for next course
        this.par = gameConfig.coursePars[this.currentCourse] || 3;

        // Update UI
        this.uiManager.updateCourseInfo(this.currentCourse + 1, gameConfig.totalCourses, this.par);

        // Create next course
        this.courseManager.createCourse(this.currentCourse, this.par);

        // Reset game state for the new hole
        this.courseCompleted = false;
        this.ballInMotion = false;
        this.strokeCount = 0;
        this.uiManager.updateStrokeDisplay(this.strokeCount);
        this.aimAtHole();
        this.uiManager.showMessage('Ready for Hole ' + (this.currentCourse + 1));
        this.notifyController('ready', `Hole ${this.currentCourse + 1} - par ${this.par}`);
      } else {
        this.uiManager.showGameComplete(this.totalScore);
        this.notifyController('game_complete', `Round complete - ${this.totalScore} strokes`);
      }
    }, 3000);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.sceneManager.handleResize();
    });
  }

  connectSocketEvents() {
    this.socketManager.on('orientation', (data) => {
      if (this.ballInMotion || this.courseCompleted) return;
      // Controller sends phone turn relative to its pose at aim_start
      this.aimAngle = this.aimAnchor + Math.atan2(data.x, data.z);
      this.refreshAimArrow();
    });

    this.socketManager.on('aim_start', () => {
      this.aimAnchor = this.aimAngle;
    });

    this.socketManager.on('swing_data', (data) => {
      if (!this.ballInMotion) {
        this.uiManager.updateSwingVisuals(data);
      }
    });

    this.socketManager.on('throw', (velocityData) => {
      this.handlePutt(velocityData);
    });
  }
}