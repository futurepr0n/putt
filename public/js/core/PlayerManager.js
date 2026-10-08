import { gameConfig } from '../config/gameConfig.js';

// Roster, turn order and scoring. No rendering or physics: the Game supplies ball distances.
export class PlayerManager {
  constructor() {
    this.players = new Map();
    this.joinCounter = 0;
    this.honors = []; // Tee order for the current hole
    this.hole = 0;
  }

  addOrReconnect(id, name) {
    let p = this.players.get(id);
    if (p) {
      p.connected = true;
      p.retired = false;
      p.name = name || p.name;
      // Back during a hole they were sitting out: play it like a late joiner
      if (p.sittingOut) {
        p.sittingOut = false;
        p.pickedUp = false;
        p.strokes = 0;
        p.teedOff = false;
      }
      return { player: p, isNew: false };
    }
    const color = gameConfig.players.colors[this.joinCounter % gameConfig.players.colors.length];
    p = {
      id,
      name: name || `Player ${this.joinCounter + 1}`,
      color,
      joinOrder: this.joinCounter++,
      connected: true,
      retired: false,
      scores: [],
      strokes: 0,
      teedOff: false,
      holed: false,
      pickedUp: false,
      sittingOut: false,
      lastLie: null
    };
    this.players.set(id, p);
    this.honors.push(id);
    return { player: p, isNew: true };
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (p) p.connected = false;
  }

  // Disconnected too long: pick up for this hole so the group isn't blocked
  retire(id) {
    const p = this.players.get(id);
    if (!p || p.connected) return;
    p.retired = true;
    if (!this.isFinished(p)) this.pickUp(p);
  }

  get(id) {
    return this.players.get(id) || null;
  }

  list() {
    return Array.from(this.players.values()).sort((a, b) => a.joinOrder - b.joinOrder);
  }

  isFinished(p) {
    return p.holed || p.pickedUp;
  }

  // Still has to play this hole (connected or not)
  stillToPlay() {
    return this.list().filter(p => !this.isFinished(p) && !p.retired);
  }

  recordStroke(id, penalty = 0) {
    const p = this.players.get(id);
    if (!p) return;
    p.strokes += 1 + penalty;
    p.teedOff = true;
  }

  addPenalty(id, strokes = 1) {
    const p = this.players.get(id);
    if (p) p.strokes += strokes;
  }

  markHoled(id) {
    const p = this.players.get(id);
    if (p) p.holed = true;
  }

  // Returns true if the player hit the stroke limit and was picked up
  enforceMaxStrokes(id) {
    const p = this.players.get(id);
    if (!p || this.isFinished(p)) return false;
    if (p.strokes >= gameConfig.players.maxStrokes) {
      this.pickUp(p);
      return true;
    }
    return false;
  }

  pickUp(p) {
    p.pickedUp = true;
    p.strokes = Math.max(p.strokes, gameConfig.players.maxStrokes);
  }

  // Golf order: everyone tees off in honors order, then furthest from the hole plays
  nextPlayer(distanceOf) {
    const candidates = this.stillToPlay().filter(p => p.connected);
    if (candidates.length === 0) return null;

    const honorRank = (p) => {
      const i = this.honors.indexOf(p.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };

    const onTee = candidates.filter(p => !p.teedOff).sort((a, b) => honorRank(a) - honorRank(b));
    if (onTee.length > 0) return onTee[0];

    return candidates.sort((a, b) => {
      const d = distanceOf(b.id) - distanceOf(a.id);
      return Math.abs(d) > 1e-6 ? d : honorRank(a) - honorRank(b);
    })[0];
  }

  // Hole is over when nobody active still has to play (disconnected players pause the hole until retired)
  isHoleComplete() {
    return this.players.size > 0 && this.stillToPlay().length === 0;
  }

  // Lock in scores, set honors for the next hole (lowest score first, ties keep previous order)
  finishHole() {
    for (const p of this.players.values()) {
      p.scores[this.hole] = !p.sittingOut && (p.holed || p.pickedUp) ? p.strokes : null;
    }
    const prevRank = new Map(this.honors.map((id, i) => [id, i]));
    this.honors = Array.from(this.players.keys()).sort((a, b) => {
      const sa = this.players.get(a).scores[this.hole] ?? Infinity;
      const sb = this.players.get(b).scores[this.hole] ?? Infinity;
      return sa !== sb ? sa - sb : (prevRank.get(a) ?? 0) - (prevRank.get(b) ?? 0);
    });
  }

  startHole(holeIndex) {
    this.hole = holeIndex;
    for (const p of this.players.values()) {
      p.strokes = 0;
      p.teedOff = false;
      p.holed = false;
      p.pickedUp = false;
      p.lastLie = null;
      // Still away: sits this hole out with no score
      p.sittingOut = p.retired && !p.connected;
      p.pickedUp = p.sittingOut;
    }
  }

  totalStrokes(p) {
    return p.scores.reduce((sum, s) => sum + (s ?? 0), 0);
  }

  // Score relative to par over holes actually played
  toPar(p, pars) {
    return p.scores.reduce((sum, s, i) => (s == null ? sum : sum + s - (pars[i] || 0)), 0);
  }

  standings(pars) {
    return this.list()
      .map(p => ({ player: p, total: this.totalStrokes(p), toPar: this.toPar(p, pars), played: p.scores.filter(s => s != null).length }))
      .sort((a, b) => b.played - a.played || a.toPar - b.toPar || a.player.joinOrder - b.player.joinOrder);
  }

  snapshot() {
    return this.list().map(p => ({
      playerId: p.id,
      name: p.name,
      color: '#' + p.color.toString(16).padStart(6, '0'),
      strokes: p.strokes,
      holed: p.holed,
      pickedUp: p.pickedUp,
      connected: p.connected
    }));
  }
}
