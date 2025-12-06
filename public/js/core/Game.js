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
    // Set par for the current course
    this.par = gameConfig.coursePars[this.currentCourse] || 3;

    // Create the course
    this.courseManager.createCourse(this.currentCourse, this.par);

    // Update UI
    this.uiManager.updateCourseInfo(this.currentCourse + 1, gameConfig.totalCourses, this.par);

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

    // Use the aimed direction from the UI/Controller if available
    if (this.uiManager && this.uiManager.lastDirectionData) {
      const aim = this.uiManager.lastDirectionData;

      // Calculate the power/magnitude of the physical swing
      const swingMagnitude = Math.sqrt(
        velocityData.x * velocityData.x +
        velocityData.y * velocityData.y +
        velocityData.z * velocityData.z
      );

      // Normalize the aim direction
      const aimMagnitude = Math.sqrt(aim.x * aim.x + aim.z * aim.z);

      if (aimMagnitude > 0) {
        // Apply swing power to aim direction
        // We override the x and z components to match the arrow direction
        // but scale them to match the physical swing power
        velocityData.x = (aim.x / aimMagnitude) * swingMagnitude;
        velocityData.z = (aim.z / aimMagnitude) * swingMagnitude;
        // velocityData.y stays the same (usually small)
      }
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
        this.uiManager.showMessage('Ready for Hole ' + (this.currentCourse + 1));
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