import { DirectionIndicator } from './DirectionIndicator.js';
import { Scorecard } from './Scorecard.js';
import { CameraControls } from './CameraControls.js';
import { DomUtils } from '../utils/DomUtils.js';

export class UIManager {
  constructor(game) {
    this.game = game;
    this.sceneManager = game.sceneManager;

    this.directionIndicator = null;
    this.scorecard = null;
    this.cameraControls = null;

    this.messageElement = null;
    this.lastDirectionData = null;
    this.followBallMode = false;
  }

  init() {
    // Create direction indicator
    this.directionIndicator = new DirectionIndicator(this.sceneManager);
    this.directionIndicator.create();

    // Create scorecard
    this.scorecard = new Scorecard();
    this.scorecard.init();

    // Create camera controls
    this.cameraControls = new CameraControls(this.sceneManager);
    this.cameraControls.init();

    // Create message element for feedback
    this.createMessageElement();

    // Add debug controls if needed
    if (this.game.debug) {
      this.addDebugControls();
    }
  }

  createMessageElement() {
    // Create message element for putt feedback
    this.messageElement = DomUtils.createElement('div', {
      position: 'absolute',
      bottom: '50px',
      left: '20px',
      color: 'white',
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      padding: '5px',
      borderRadius: '5px'
    });

    document.body.appendChild(this.messageElement);
  }

  showMessage(message) {
    if (this.messageElement) {
      this.messageElement.textContent = message;
    }
  }

  updateDirectionArrow(directionData) {
    // Store direction data for later use
    this.lastDirectionData = directionData;

    // Get ball position
    const ballPosition = this.game.courseManager.getBallPosition();
    if (!ballPosition) return;

    // Update direction arrow
    this.directionIndicator.update(ballPosition, directionData);
  }

  updateSwingVisuals(swingData) {
    // Show live feedback for swing (Ghost Arrow or Real-time adjustment)
    if (!this.lastDirectionData) return;

    const ballPosition = this.game.courseManager.getBallPosition();
    if (!ballPosition) return;

    // Calculate resulting vector from Locked Angle + Deviation
    const baseAngle = Math.atan2(this.lastDirectionData.x, this.lastDirectionData.z);
    const deviationRad = swingData.deviation * (Math.PI / 180);
    const finalAngle = baseAngle + deviationRad;

    // Power determines length/scale
    // swingData.power is 0.0 - 1.5 roughly
    const visualPower = Math.max(0.2, swingData.power * 20); // Scale up for visual magnitude

    const visualDir = {
      x: Math.sin(finalAngle) * visualPower,
      y: 0,
      z: Math.cos(finalAngle) * visualPower
    };

    // Reuse the main arrow for feedback?
    // Or maybe change its color?
    this.directionIndicator.update(ballPosition, visualDir, true); // true = isSwingFeedback
  }

  updateStrokeDisplay(strokeCount) {
    this.scorecard.updateStrokes(strokeCount, this.game.par);
  }

  updateCourseInfo(current, total, par) {
    this.scorecard.updateCourseInfo(current, total, par);
  }

  showHoleComplete(strokesTaken, parValue) {
    let scoreName = 'Par';
    let scoreColor = '#FFFFFF';

    if (strokesTaken < parValue - 1) {
      scoreName = 'Eagle';
      scoreColor = '#FFD700'; // Gold
    } else if (strokesTaken === parValue - 1) {
      scoreName = 'Birdie';
      scoreColor = '#00FF00'; // Green
    } else if (strokesTaken === parValue) {
      scoreName = 'Par';
      scoreColor = '#FFFFFF'; // White
    } else if (strokesTaken === parValue + 1) {
      scoreName = 'Bogey';
      scoreColor = '#FFA500'; // Orange
    } else {
      scoreName = `+${strokesTaken - parValue}`;
      scoreColor = '#FF0000'; // Red
    }

    const popup = DomUtils.createPopup({
      title: 'Hole Complete!',
      content: `
        <div style="font-size: 48px; margin: 10px 0; color: ${scoreColor};">${scoreName}</div>
        <div>Strokes: ${strokesTaken} / Par: ${parValue}</div>
        <div style="font-size: 20px; margin-top: 20px;">Next hole loading...</div>
      `,
      duration: 3000
    });
  }

  showGameComplete(totalScore) {
    // Calculate final score vs par
    const totalPar = this.scorecard.getTotalPar();
    const scoreVsPar = totalScore - totalPar;

    const gameCompleteElement = DomUtils.createElement('div', {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      zIndex: '2000'
    });

    gameCompleteElement.innerHTML = `
      <h1 style="font-size: 48px; margin-bottom: 30px;">Game Complete!</h1>
      <div style="font-size: 36px; margin-bottom: 20px;">Final Score: ${scoreVsPar > 0 ? '+' + scoreVsPar : scoreVsPar}</div>
      <div style="margin-bottom: 10px;">Total Strokes: ${totalScore}</div>
      <div style="margin-bottom: 30px;">Course Par: ${totalPar}</div>
      <button id="restartButton" style="padding: 15px 30px; font-size: 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Play Again</button>
    `;

    document.body.appendChild(gameCompleteElement);

    // Add restart button functionality
    document.getElementById('restartButton').addEventListener('click', () => {
      document.body.removeChild(gameCompleteElement);

      // Reset game state and start over
      window.location.reload();
    });
  }

  toggleFollowBallMode() {
    this.followBallMode = !this.followBallMode;
    return this.followBallMode;
  }

  update() {
    // Update camera to follow ball if mode is enabled
    if (this.followBallMode) {
      const ballPosition = this.game.courseManager.getBallPosition();
      if (ballPosition) {
        this.sceneManager.setFollowMode(ballPosition, true);
      }
    }

    // Update direction indicator visibility
    if (this.directionIndicator && this.game.ballInMotion) {
      this.directionIndicator.hide();
    }
  }

  addDebugControls() {
    // Reset Ball button
    const resetButton = DomUtils.createElement('button', {
      position: 'absolute',
      bottom: '160px',
      left: '20px',
      padding: '8px 12px',
      backgroundColor: 'rgba(255, 0, 0, 0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      zIndex: '1000'
    }, 'Reset Ball');

    resetButton.addEventListener('click', () => {
      this.game.resetBall();
    });

    document.body.appendChild(resetButton);

    // Push Ball button
    const pushButton = DomUtils.createElement('button', {
      position: 'absolute',
      bottom: '200px',
      left: '20px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 128, 0, 0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      zIndex: '1000'
    }, 'Push Ball Forward');

    pushButton.addEventListener('click', () => {
      const ballPosition = this.game.courseManager.getBallPosition();
      if (ballPosition) {
        this.game.handlePutt({
          x: 0,
          y: 0.1,
          z: 3,
          power: 0.5
        });
      }
    });

    document.body.appendChild(pushButton);

    // Toggle Physics Debug button
    const debugPhysicsButton = DomUtils.createElement('button', {
      position: 'absolute',
      bottom: '240px',
      left: '20px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 255, 0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      zIndex: '1000'
    }, 'Toggle Physics Debug');

    let physicsDebugEnabled = false;

    debugPhysicsButton.addEventListener('click', () => {
      physicsDebugEnabled = !physicsDebugEnabled;
      this.game.courseManager.setDebugVisibility(physicsDebugEnabled);
      debugPhysicsButton.style.backgroundColor = physicsDebugEnabled ?
        'rgba(0, 255, 0, 0.7)' : 'rgba(0, 0, 255, 0.7)';
    });

    document.body.appendChild(debugPhysicsButton);
  }
}