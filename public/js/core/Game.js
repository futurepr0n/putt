import { SceneManager } from './SceneManager.js';
import { PhysicsManager } from './PhysicsManager.js';
import { SocketManager } from './SocketManager.js';
import { PlayerManager } from './PlayerManager.js';
import { CourseManager } from '../course/CourseManager.js';
import { UIManager } from '../ui/UIManager.js';
import { gameConfig } from '../config/gameConfig.js';

// Phases of play: waiting (no one can shoot) → aiming → rolling → (sinking) → next turn
export class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.currentCourse = 0;
    this.phase = 'waiting';
    this.activeId = null;
    this.lastPuttTime = 0;
    this.lastFrameTime = null;
    this.retireTimers = new Map();

    // Aim angle in world space (radians, atan2(x, z) convention)
    this.aimAngle = 0;
    this.aimAnchor = 0;

    this.sceneManager = new SceneManager();
    this.physicsManager = new PhysicsManager();
    this.players = new PlayerManager();

    // Depend on the scene and physics, created in init()
    this.courseManager = null;
    this.uiManager = null;
    this.socketManager = null;

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  init() {
    this.sceneManager.init();

    this.courseManager = new CourseManager(this.sceneManager, this.physicsManager);
    this.uiManager = new UIManager(this);
    this.socketManager = new SocketManager(this.roomId, this);

    this.uiManager.init();
    this.connectSocketEvents();
    this.socketManager.init();

    this.setupEventListeners();
    this.startHole();
  }

  get par() {
    return gameConfig.coursePars[this.currentCourse] || 3;
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    const dt = this.lastFrameTime === null ? 0 : Math.min((time - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = time;

    if (this.physicsManager && this.physicsManager.world && dt > 0) {
      this.physicsManager.update(dt);
    }

    if (this.courseManager) this.updateShot();
    if (this.uiManager) this.uiManager.update();

    if (this.sceneManager && this.sceneManager.renderer) {
      this.sceneManager.render(dt);
    }
  }

  // --- Holes ---

  startHole() {
    this.phase = 'waiting';
    this.activeId = null;
    this.courseManager.createCourse(this.currentCourse, this.par);
    this.players.startHole(this.currentCourse);
    this.uiManager.updateCourseInfo(this.currentCourse + 1, gameConfig.totalCourses, this.par);
    this.sceneManager.focusOn(this.courseManager.tee.getPosition(), 0);
    this.advanceTurn();
  }

  endHole() {
    this.phase = 'between_holes';
    this.activeId = null;
    this.players.finishHole();
    this.uiManager.hideAim();
    this.uiManager.showHoleResults(this.players.list(), this.currentCourse, this.par);
    this.refreshScoreboard();
    this.emitTurn();
    this.notify('hole_complete', `Hole ${this.currentCourse + 1} complete`);

    setTimeout(() => {
      this.currentCourse++;
      if (this.currentCourse < gameConfig.totalCourses) {
        this.startHole();
      } else {
        this.phase = 'game_over';
        const pars = gameConfig.coursePars.slice(0, gameConfig.totalCourses);
        const standings = this.players.standings(pars);
        this.uiManager.showGameComplete(standings, pars);
        this.emitTurn();
        const leader = standings[0];
        this.notify('game_complete', leader ? `Round over - ${leader.player.name} wins!` : 'Round over');
      }
    }, gameConfig.players.holeResultsMs);
  }

  // --- Turns ---

  advanceTurn() {
    if (this.phase === 'between_holes' || this.phase === 'game_over') return;

    if (this.players.isHoleComplete()) {
      this.endHole();
      return;
    }

    const next = this.players.nextPlayer(id => this.courseManager.distanceToHole(id));
    if (!next) {
      this.phase = 'waiting';
      this.activeId = null;
      this.courseManager.setActiveBall(null);
      this.uiManager.hideAim();
      const waitingOnAway = this.players.stillToPlay().length > 0 && this.players.players.size > 0;
      this.uiManager.setTurnBanner(null, waitingOnAway ? 'Waiting for players to reconnect...' : 'Scan the QR code to join');
      this.refreshScoreboard();
      this.emitTurn();
      return;
    }

    this.activeId = next.id;
    this.courseManager.spawnBall(next.id, next.color);
    this.courseManager.setActiveBall(next.id);
    this.phase = 'aiming';

    this.aimAtHole();
    this.uiManager.setAimColor(next.color);
    this.uiManager.setTurnBanner(next, next.teedOff ? `Stroke ${next.strokes + 1}` : 'On the tee');
    this.uiManager.showMessage(`${next.name}, you're up`);
    this.sceneManager.focusOn(this.courseManager.getBallPosition(), this.aimAngle);
    this.refreshScoreboard();
    this.emitTurn();
    this.notify('your_turn', `Your turn - stroke ${next.strokes + 1}`, next.id);
  }

  emitTurn() {
    const active = this.players.get(this.activeId);
    this.socketManager.emitTurn({
      playerId: active ? active.id : null,
      name: active ? active.name : null,
      phase: this.phase,
      hole: this.currentCourse + 1,
      par: this.par,
      players: this.players.snapshot()
    });
  }

  refreshScoreboard() {
    this.uiManager.updateScoreboard(this.players.list(), this.activeId, this.currentCourse, gameConfig.coursePars);
  }

  notify(state, message, to) {
    if (this.socketManager) this.socketManager.emitStatus(state, message, to);
  }

  // --- Shots ---

  handlePutt(data) {
    if (this.phase !== 'aiming' || data.playerId !== this.activeId) {
      this.notify('putt_rejected', this.phase === 'rolling' ? 'Ball still moving - wait' : 'Not your turn', data.playerId);
      return;
    }

    const player = this.players.get(this.activeId);
    const power = Math.max(0, Math.min(Number(data.power) || 0, 1));
    const maxDeviation = 15 * Math.PI / 180;
    const deviation = Math.max(-maxDeviation, Math.min((Number(data.deviation) || 0) * Math.PI / 180, maxDeviation));

    const lie = this.courseManager.getBallPosition();
    player.lastLie = { x: lie.x, z: lie.z };

    if (!this.courseManager.puttBall(this.aimAngle + deviation, power)) return;

    this.players.recordStroke(player.id);
    this.phase = 'rolling';
    this.lastPuttTime = performance.now();
    this.uiManager.hideAim();
    this.uiManager.showMessage(`${player.name}: ${Math.round(power * 100)}% power`);
    this.refreshScoreboard();
    this.notify('putt_accepted', `Stroke ${player.strokes} - ${Math.round(power * 100)}% power`, player.id);
  }

  updateShot() {
    const cm = this.courseManager;

    if (this.phase === 'rolling') {
      if (cm.checkBallInHole()) {
        this.phase = 'sinking';
        this.players.markHoled(this.activeId);
        const p = this.players.get(this.activeId);
        this.uiManager.showMessage(`${p.name} holes out in ${p.strokes}!`);
        this.notify('holed', `In the hole! ${p.strokes} strokes (par ${this.par})`, p.id);
        return;
      }

      const pos = cm.getBallPosition();
      if (pos) {
        this.sceneManager.followTarget(pos);
        if (this.isOutOfBounds(pos)) {
          this.handleOutOfBounds();
          return;
        }
      }

      if (cm.allBallsAtRest() && performance.now() - this.lastPuttTime > gameConfig.players.minShotMs) {
        cm.stopBall();
        this.finishShot();
      }
    } else if (this.phase === 'sinking' && !cm.isHoleInProgress()) {
      cm.removeBall(this.activeId);
      this.finishShot();
    }
  }

  isOutOfBounds(pos) {
    const { width, length } = gameConfig.courseSize;
    return pos.y < -1 || Math.abs(pos.x) > width / 2 + 0.5 || Math.abs(pos.z) > length / 2 + 0.5;
  }

  // Stroke and distance: one penalty stroke, replay from where the shot was played
  handleOutOfBounds() {
    const p = this.players.get(this.activeId);
    this.players.addPenalty(p.id, 1);
    const lie = p.lastLie || this.courseManager.tee.getPosition();
    this.courseManager.placeActiveBall(lie.x, lie.z);
    this.uiManager.showMessage(`${p.name}: out of bounds, +1 stroke`);
    this.notify('penalty', 'Out of bounds - +1 stroke', p.id);
    this.refreshScoreboard();
  }

  finishShot() {
    const id = this.activeId;
    if (this.players.enforceMaxStrokes(id)) {
      this.courseManager.removeBall(id);
      const p = this.players.get(id);
      this.uiManager.showMessage(`${p.name} picks up at ${p.strokes}`);
      this.notify('picked_up', `Picked up at ${p.strokes} strokes`, id);
    }
    this.advanceTurn();
  }

  // --- Aim ---

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

  isActiveInput(data) {
    return this.phase === 'aiming' && data && data.playerId === this.activeId;
  }

  // --- Players ---

  addPlayer(id, name, connected = true) {
    clearTimeout(this.retireTimers.get(id));
    this.retireTimers.delete(id);

    const { player, isNew } = this.players.addOrReconnect(id, name);
    if (!connected) this.handlePlayerLeft(id);

    this.uiManager.showMessage(isNew ? `${player.name} joined` : `${player.name} is back`);
    this.refreshScoreboard();
    if (this.phase === 'waiting') this.advanceTurn();
    else this.emitTurn();
  }

  handlePlayerLeft(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.disconnect(id);
    this.uiManager.showMessage(`${player.name} disconnected`);

    clearTimeout(this.retireTimers.get(id));
    this.retireTimers.set(id, setTimeout(() => this.retirePlayer(id), gameConfig.players.disconnectGraceMs));

    // Don't make everyone wait on an empty controller; a shot already rolling still finishes
    if (this.activeId === id && this.phase === 'aiming') this.advanceTurn();
    else this.refreshScoreboard();
  }

  retirePlayer(id) {
    this.retireTimers.delete(id);
    const player = this.players.get(id);
    if (!player || player.connected) return;
    this.players.retire(id);
    this.courseManager.removeBall(id);
    this.refreshScoreboard();
    if (this.phase === 'waiting') this.advanceTurn();
  }

  // --- Wiring ---

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.sceneManager.handleResize();
    });
  }

  connectSocketEvents() {
    const sm = this.socketManager;

    sm.on('roster', (list) => {
      if (!Array.isArray(list)) return;
      list.forEach(p => this.addPlayer(p.playerId, p.name, p.connected));
    });
    sm.on('player_joined', (p) => this.addPlayer(p.playerId, p.name, true));
    sm.on('player_left', (p) => this.handlePlayerLeft(p.playerId));

    sm.on('orientation', (data) => {
      if (!this.isActiveInput(data)) return;
      // Controller sends phone turn relative to its pose at aim_start
      this.aimAngle = this.aimAnchor + Math.atan2(data.x, data.z);
      this.refreshAimArrow();
      this.sceneManager.focusOn(this.courseManager.getBallPosition(), this.aimAngle, false);
    });

    sm.on('aim_start', (data) => {
      if (this.isActiveInput(data)) this.aimAnchor = this.aimAngle;
    });

    sm.on('swing_data', (data) => {
      if (this.isActiveInput(data)) this.uiManager.updateSwingVisuals(data);
    });

    sm.on('throw', (data) => this.handlePutt(data));
  }
}
