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
    this.courseManager.createCourse(this.currentCourse);

    // Set up event listeners
    this.setupEventListeners();
  }

  animate() {
    requestAnimationFrame(this.animate);

    // Only update physics after everything is initialized
    if (this.physicsManager && this.physicsManager.world) {
      this.physicsManager.update();
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
      return;
    }

    // Apply velocity to ball
    const success = this.courseManager.puttBall(velocityData);

    if (success) {
      this.ballInMotion = true;
      this.lastPuttTime = Date.now();
      this.strokeCount++;
      this.uiManager.updateStrokeDisplay(this.strokeCount);
      this.uiManager.showMessage(`Putt power: ${Math.round(velocityData.power * 100)}%`);
    }
  }

  resetBall() {
    this.ballInMotion = false;
    this.courseManager.resetBallToTee();
    this.uiManager.showMessage('Ball reset. Ready for next shot');
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
      this.uiManager.showMessage('Ready for next shot');
    }
  }

  checkBallInHole() {
    if (!this.courseCompleted && !this.courseManager.isHoleInProgress()) {
      const isInHole = this.courseManager.checkBallInHole();

      if (isInHole) {
        this.holeComplete();
      }
    }
  }

  holeComplete() {
    this.courseCompleted = true;

    // Show hole complete message
    this.uiManager.showHoleComplete(this.strokeCount, this.par);

    // Add to total score
    this.totalScore += this.strokeCount;

    // Move to next course after a delay
    setTimeout(() => {
      this.currentCourse++;
      if (this.currentCourse < gameConfig.totalCourses) {
        this.courseManager.createCourse(this.currentCourse);
      } else {
        this.uiManager.showGameComplete(this.totalScore);
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
      if (!this.ballInMotion && !this.courseCompleted) {
        this.uiManager.updateDirectionArrow(data);
      }
    });

    this.socketManager.on('throw', (velocityData) => {
      this.handlePutt(velocityData);
    });
  }
}