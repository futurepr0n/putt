import { DirectionIndicator } from './DirectionIndicator.js';
import { Scoreboard } from './Scoreboard.js';
import { gameConfig } from '../config/gameConfig.js';
import { ShotEffects, predictedDistance } from './ShotEffects.js';
import { audioReady } from '../utils/Sound.js';
import { CameraControls } from './CameraControls.js';
import { DomUtils } from '../utils/DomUtils.js';

export class UIManager {
  constructor(game) {
    this.game = game;
    this.sceneManager = game.sceneManager;

    this.directionIndicator = null;
    this.scoreboard = null;
    this.cameraControls = null;

    this.messageElement = null;
    this.lastDirectionData = null;
  }

  init() {
    // Create direction indicator
    this.directionIndicator = new DirectionIndicator(this.sceneManager);
    this.directionIndicator.create();

    this.scoreboard = new Scoreboard();
    this.scoreboard.init();

    this.effects = new ShotEffects(this.sceneManager);
    this.effects.init();

    this.createSoundPrompt();

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

  // Live swing: path stretches to where this much power would roll the ball
  updateSwingVisuals(swingData) {
    if (!(swingData.power > 0)) {
      this.game.refreshAimArrow();
      return;
    }
    const angle = this.game.aimAngle + (Number(swingData.deviation) || 0) * Math.PI / 180;
    this.effects.showPath(this.game.courseManager.getBallPosition(), angle, predictedDistance(swingData.power), 0x5dff7a);
  }

  setAimColor(color) {
    this.directionIndicator.setAimColor(color);
  }

  hideAim() {
    this.directionIndicator.hide();
    this.effects.hidePath();
  }

  showAimPath(angle, length, color) {
    this.effects.showPath(this.game.courseManager.getBallPosition(), angle, length, color);
  }

  setTurnBanner(player, detail) {
    this.scoreboard.setBanner(player, detail);
  }

  updateScoreboard(players, activeId, holeIndex, pars) {
    this.scoreboard.update(players, activeId, holeIndex, pars);
  }

  updateCourseInfo(current, total, par) {
    this.scoreboard.updateCourseInfo(current, total, par);
  }

  showHoleResults(players, holeIndex, par) {
    this.scoreboard.showHoleResults(players, holeIndex, par, gameConfig.players.holeResultsMs - 300);
  }

  showGameComplete(standings, pars) {
    this.scoreboard.showGameComplete(standings, pars);
  }

  // Browsers block audio until the TV screen is clicked once
  createSoundPrompt() {
    this.soundPrompt = DomUtils.createElement('button', {
      position: 'absolute',
      bottom: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      color: 'white',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '20px',
      cursor: 'pointer',
      zIndex: '150'
    }, '🔇 Click to enable sound');
    document.body.appendChild(this.soundPrompt);
  }

  update() {
    if (this.soundPrompt && audioReady()) {
      this.soundPrompt.remove();
      this.soundPrompt = null;
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
      const p = this.game.players.get(this.game.activeId);
      if (p && p.lastLie) this.game.courseManager.placeActiveBall(p.lastLie.x, p.lastLie.z);
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
      this.game.handlePutt({ playerId: this.game.activeId, power: 0.5, deviation: 0 });
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