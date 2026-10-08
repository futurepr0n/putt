// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

// UI Elements
const aimButton = document.getElementById('aimButton');
const puttButton = document.getElementById('puttButton');
const statusDisplay = document.getElementById('statusDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const permissionButton = document.getElementById('permissionButton');
const permissionSection = document.getElementById('permissionSection');
const controlsSection = document.getElementById('controlsSection'); // Container for controls
const debugInfo = document.getElementById('debugInfo');
const puttLabel = document.getElementById('puttLabel');
const powerRing = document.getElementById('powerRing');
const traceCanvas = document.getElementById('traceCanvas');
const practiceToggle = document.getElementById('practiceToggle');
const turnBanner = document.getElementById('turnBanner');
const playerBadge = document.getElementById('playerBadge');
const nameInput = document.getElementById('nameInput');

// Global State
let motionPermissionGranted = false;
let currentOrientation = { alpha: 0, beta: 0, gamma: 0 };
let socket = io();

// Player identity: a stable id per phone so reconnecting keeps your ball and score
function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}
function makeClientId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
const clientId = storageGet('putt.clientId') || makeClientId();
storageSet('putt.clientId', clientId);
let playerName = storageGet('putt.name') || '';
let myPlayerId = null;
let hasJoined = false;
let isMyTurn = false;

// Aiming State
let isAiming = false;
let lockedAngle = 0; // The angle set by the user (degrees 0-360)
let aimInterval = null;



// --- 1. Orientation Handling ---

// Sensor timestamp so sample spacing reflects when readings were taken, not when JS ran
function sampleTime(event) {
  return event && event.timeStamp > 0 ? event.timeStamp : performance.now();
}

function handleOrientation(event) {
  // Store raw values
  if (event.alpha !== null) currentOrientation.alpha = event.alpha;
  if (event.beta !== null) currentOrientation.beta = event.beta;
  if (event.gamma !== null) currentOrientation.gamma = event.gamma;

  orientationRateSample(event);
}

// Turn of the phone since aiming began, in degrees (-180..180, positive = turned left)
let aimBaseAlpha = 0;

function wrapDegrees(deg) {
  return ((deg + 540) % 360) - 180;
}

function getAimDelta() {
  return wrapDegrees(currentOrientation.alpha - aimBaseAlpha);
}

function emitAimDelta(deltaDeg) {
  const rad = deltaDeg * (Math.PI / 180);
  socket.emit('orientation', { x: Math.sin(rad), y: 0, z: Math.cos(rad) });
}


// --- 2. Aiming Logic ---

function startAiming() {
  if (isAiming || !isMyTurn) return;
  isAiming = true;
  aimBaseAlpha = currentOrientation.alpha;
  aimButton.style.backgroundColor = '#1f78d1';
  aimButton.textContent = "Aiming...";

  // Game anchors the arrow's current direction to this phone pose
  socket.emit('aim_start');

  if (aimInterval) clearInterval(aimInterval);
  aimInterval = setInterval(() => {
    const delta = getAimDelta();
    emitAimDelta(delta);
    statusDisplay.innerHTML = `Aiming...<br>Turn: ${delta.toFixed(0)}°<br>(Rotate phone to adjust)`;
  }, 50);
}

function stopAiming() {
  if (!isAiming) return;
  isAiming = false;
  clearInterval(aimInterval);

  lockedAngle = getAimDelta();

  aimButton.style.backgroundColor = '';
  aimButton.textContent = `Set! (${lockedAngle.toFixed(0)}°)`;
  statusDisplay.textContent = "Angle Locked. Hold Green to Putt.";

  emitAimDelta(lockedAngle);
  socket.emit('aim_end');
}


// --- 3. Putting Logic ---
// Hold PUTT -> hold still (address) -> buzz -> swing back and through.
// The stroke is read from the gyroscope (see swing.js); the putt is sent at impact + follow-through.

const POWER_SCALES = { soft: 0.8, normal: 1, firm: 1.2 };
let powerScaleKey = storageGet('putt.powerScale') || 'normal';
let practiceMode = false;

let puttState = 'idle'; // idle | address | swinging
let puttStartTime = 0;
let addressSamples = [];
let strokeSamples = [];
let maxAccel = 0;
let lastLiveEmit = 0;
let puttTimeout = null;
let gyroAvailable = false;
let lastOrientationSample = null;

function powerScale() {
  return POWER_SCALES[powerScaleKey] || 1;
}

// Every angular-velocity reading (deg/s, device axes) funnels through here
function onRateSample(sample) {
  if (puttState === 'address') {
    addressSamples.push(sample);
    const waited = sample.t - addressSamples[0].t;
    if (Swing.isStill(addressSamples, sample.t) || waited > 2000) beginStroke();
  } else if (puttState === 'swinging') {
    strokeSamples.push(sample);
    updateLiveStroke(sample.t);
  }
}

function handleMotion(event) {
  const acc = event.acceleration;
  if (puttState === 'swinging' && acc && acc.x !== null) {
    maxAccel = Math.max(maxAccel, Math.hypot(acc.x, acc.y, acc.z));
  }
  const rate = event.rotationRate;
  if (!rate || rate.alpha === null || rate.beta === null || rate.gamma === null) return;
  if (gyroSensor) return; // Generic Sensor API already feeding higher-rate samples
  gyroAvailable = true;
  onRateSample({ t: sampleTime(event), x: rate.beta, y: rate.gamma, z: rate.alpha });
}

// Fallback when the gyroscope is unavailable (e.g. motion permission denied):
// approximate rates from orientation changes
function orientationRateSample(event) {
  if (gyroAvailable) return;
  const t = sampleTime(event);
  const prev = lastOrientationSample;
  lastOrientationSample = { t, a: currentOrientation.alpha, b: currentOrientation.beta, g: currentOrientation.gamma };
  if (!prev || t <= prev.t) return;
  const dt = (t - prev.t) / 1000;
  onRateSample({
    t,
    x: wrapDegrees(currentOrientation.beta - prev.b) / dt,
    y: wrapDegrees(currentOrientation.gamma - prev.g) / dt,
    z: wrapDegrees(currentOrientation.alpha - prev.a) / dt
  });
}

// Chrome on Android: Generic Sensor API gives ~120 Hz instead of devicemotion's ~60 Hz
let gyroSensor = null;
function startGyroSensor() {
  if (!('Gyroscope' in window)) return;
  try {
    const sensor = new Gyroscope({ frequency: 120 });
    const toDeg = 180 / Math.PI;
    sensor.addEventListener('reading', () => {
      gyroAvailable = true;
      onRateSample({ t: sensor.timestamp || performance.now(), x: sensor.x * toDeg, y: sensor.y * toDeg, z: sensor.z * toDeg });
    });
    sensor.addEventListener('error', () => { gyroSensor = null; });
    sensor.start();
    gyroSensor = sensor;
  } catch (e) {
    gyroSensor = null;
  }
}

function startPutt() {
  // Practice swings are allowed while waiting for your turn
  if ((!isMyTurn && !practiceMode) || puttState !== 'idle') return;
  puttState = 'address';
  puttStartTime = performance.now();
  addressSamples = [];
  strokeSamples = [];
  maxAccel = 0;
  setPowerRing(0);
  puttButton.classList.add('active');
  puttLabel.textContent = 'HOLD STILL';
  statusDisplay.textContent = 'Set up at the ball and hold still...';
  clearTimeout(puttTimeout);
  puttTimeout = setTimeout(() => finishStroke(), 8000);
}

function beginStroke() {
  puttState = 'swinging';
  strokeSamples = addressSamples.slice(-1);
  if (navigator.vibrate) navigator.vibrate(25);
  puttLabel.textContent = 'SWING';
  statusDisplay.textContent = practiceMode ? 'Practice swing - nothing is sent' : 'Swing back and through the ball';
}

function updateLiveStroke(now) {
  const backswing = Swing.liveBackswing(strokeSamples);
  const livePower = Swing.predictedPower(backswing, powerScale());
  setPowerRing(livePower);

  if (!practiceMode && now - lastLiveEmit > 50) {
    lastLiveEmit = now;
    socket.emit('swing_data', { power: livePower, deviation: 0 });
  }

  // Auto-finish once the putter has come through the ball and followed through
  if (strokeSamples.length % 3 === 0) {
    const result = Swing.analyzeStroke(strokeSamples, { powerScale: powerScale(), maxAccel });
    if (result.ok && now - result.impactT >= Swing.SWING.followThroughMs) finishStroke(result);
  }
}

function stopPutt() {
  if (puttState === 'address') {
    resetPuttButton();
    statusDisplay.textContent = 'Keep holding PUTT until it buzzes, then swing';
  } else if (puttState === 'swinging') {
    finishStroke();
  }
}

function resetPuttButton() {
  puttState = 'idle';
  clearTimeout(puttTimeout);
  puttButton.classList.remove('active');
  puttLabel.textContent = 'PUTT';
}

function finishStroke(result) {
  if (puttState === 'idle') return;
  const wasSwinging = puttState === 'swinging';
  resetPuttButton();
  if (!wasSwinging) {
    statusDisplay.textContent = 'No swing detected';
    return;
  }
  result = result || Swing.analyzeStroke(strokeSamples, { powerScale: powerScale(), maxAccel });
  drawTrace(result);

  if (!result.ok) {
    setPowerRing(0);
    statusDisplay.textContent = result.reason;
    if (!practiceMode) socket.emit('swing_data', { power: 0, deviation: 0 });
    return;
  }

  setPowerRing(result.power);
  const faceText = Math.abs(result.face) < 0.5 ? 'square' : `${Math.abs(result.face).toFixed(1)}° ${result.face > 0 ? 'left' : 'right'}`;
  const summary = `${Math.round(result.power * 100)}% · backswing ${result.backswing.toFixed(0)}° · tempo ${result.tempo.toFixed(2)} · face ${faceText}`;

  if (practiceMode) {
    statusDisplay.textContent = `Practice: ${summary}`;
    return;
  }

  statusDisplay.textContent = `Putt! ${summary}`;
  socket.emit('throw', { power: result.power, deviation: result.face });
  socket.emit('swing_log', {
    power: +result.power.toFixed(3),
    face: +result.face.toFixed(2),
    backswing: +result.backswing.toFixed(1),
    tempo: +result.tempo.toFixed(2),
    impactSpeed: Math.round(result.impactSpeed),
    confidence: +result.confidence.toFixed(2),
    scale: powerScaleKey,
    source: gyroSensor ? 'gyroscope-api' : gyroAvailable ? 'devicemotion' : 'orientation',
    samples: strokeSamples.length,
    trace: result.trace
  });
}

// --- Stroke UI: power ring and stroke trace ---

function setPowerRing(power) {
  const circumference = 2 * Math.PI * 92;
  powerRing.style.strokeDasharray = `${circumference}`;
  powerRing.style.strokeDashoffset = `${circumference * (1 - Math.max(0, Math.min(power, 1)))}`;
  powerRing.style.stroke = power > 0.85 ? '#ff7043' : power > 0.5 ? '#ffd54f' : '#9ccc65';
}

// Putter angle over time: backswing up, impact where it crosses the address line
function drawTrace(result) {
  const ctx = traceCanvas.getContext('2d');
  const w = traceCanvas.width, h = traceCanvas.height;
  ctx.clearRect(0, 0, w, h);
  const trace = result.trace || [];
  if (trace.length < 2) return;
  const tMax = trace[trace.length - 1][0] || 1;
  const aMax = Math.max(10, ...trace.map(p => Math.abs(p[1])));
  const x = (t) => 8 + (t / tMax) * (w - 16);
  const y = (a) => h / 2 - (a / aMax) * (h / 2 - 10);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = result.ok ? '#9ccc65' : '#ff8a65';
  ctx.lineWidth = 3;
  ctx.beginPath();
  trace.forEach(([t, a], i) => (i ? ctx.lineTo(x(t), y(a)) : ctx.moveTo(x(t), y(a))));
  ctx.stroke();

  if (result.ok) {
    const impactX = x(result.impactT - strokeSamples[0].t);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(impactX, h / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('impact', Math.min(impactX + 7, w - 45), h / 2 - 7);
  }
}

function setPowerScale(key) {
  powerScaleKey = key;
  storageSet('putt.powerScale', key);
  document.querySelectorAll('[data-scale]').forEach(b => b.classList.toggle('selected', b.dataset.scale === key));
}


// --- 4. Setup & Permissions ---

window.addEventListener('DOMContentLoaded', () => {
  if (nameInput) nameInput.value = playerName;
  // Add Listeners
  if (aimButton) {
    aimButton.addEventListener('touchstart', (e) => { e.preventDefault(); startAiming(); });
    aimButton.addEventListener('touchend', (e) => { e.preventDefault(); stopAiming(); });
    aimButton.addEventListener('mousedown', (e) => { startAiming(); });
    aimButton.addEventListener('mouseup', (e) => { stopAiming(); });
  }

  if (puttButton) {
    puttButton.addEventListener('touchstart', (e) => { e.preventDefault(); startPutt(); });
    puttButton.addEventListener('touchend', (e) => { e.preventDefault(); stopPutt(); });
    puttButton.addEventListener('mousedown', (e) => { startPutt(); });
    puttButton.addEventListener('mouseup', (e) => { stopPutt(); });
  }

  if (permissionButton) permissionButton.addEventListener('click', requestPermissions);

  document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => setPowerScale(b.dataset.scale)));
  if (practiceToggle) {
    practiceToggle.addEventListener('click', () => {
      practiceMode = !practiceMode;
      practiceToggle.classList.toggle('selected', practiceMode);
      controlsSection.classList.toggle('practice', practiceMode);
      practiceToggle.textContent = practiceMode ? 'Practice: ON' : 'Practice: OFF';
    });
  }
});

function joinGame() {
  playerName = (nameInput.value || '').trim().slice(0, 16) || playerName || 'Player';
  storageSet('putt.name', playerName);
  hasJoined = true;
  if (socket.connected && roomId) {
    socket.emit('joinRoom', { roomId, role: 'controller', clientId, name: playerName });
  }
}

function requestPermissions() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    // Both requests must start inside the same tap gesture on iOS
    const motionRequest = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'
      ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');
    Promise.all([DeviceOrientationEvent.requestPermission(), motionRequest])
      .then(([orientationState]) => {
        if (orientationState === 'granted') {
          enableControls();
        } else {
          statusDisplay.textContent = 'Motion permission denied. Enable it in Settings and reload.';
        }
      })
      .catch(console.error);
  } else {
    // Non-iOS 13+
    enableControls();
  }
}

function enableControls() {
  motionPermissionGranted = true;
  permissionSection.style.display = 'none';
  controlsSection.style.display = 'flex'; // Show buttons
  statusDisplay.textContent = "Joined! Wait for your turn.";
  joinGame();

  // Relative (gyro-fused) orientation: steady for aiming, unlike compass-based absolute alpha
  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('devicemotion', handleMotion, true);
  startGyroSensor();
  setPowerScale(powerScaleKey);
  setPowerRing(0);
}

// --- 5. Utilities ---

function debug(msg) {
  console.log(msg);
  if (debugInfo) debugInfo.innerText = msg;
}

// Socket Events
socket.on('connect', () => {
  connectionStatus.textContent = 'Connected';
  connectionStatus.className = 'connected';
  if (hasJoined) joinGame();
  else turnBanner.textContent = 'Enter your name to join';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = 'Reconnecting...';
  connectionStatus.className = 'disconnected';
  setMyTurn(false);
  turnBanner.textContent = 'Reconnecting...';
});

socket.on('roomJoined', (data) => {
  roomId = data.roomId;
  myPlayerId = data.playerId;
  connectionStatus.textContent = `Room: ${roomId} · ${playerName}`;
});

socket.on('roomError', (data) => {
  setMyTurn(false);
  turnBanner.textContent = data.message;
});

// Cancel any half-finished aim or swing without sending it
function cancelInput() {
  if (isAiming) {
    isAiming = false;
    clearInterval(aimInterval);
    aimButton.style.backgroundColor = '';
    aimButton.textContent = 'HOLD TO AIM';
  }
  if (puttState !== 'idle') {
    resetPuttButton();
    setPowerRing(0);
  }
}

function setMyTurn(mine) {
  if (!mine && isMyTurn && !practiceMode) cancelInput();
  isMyTurn = mine;
  controlsSection.classList.toggle('locked', !mine);
  turnBanner.classList.toggle('my-turn', mine);
}

socket.on('turn', (turn) => {
  if (!turn || !myPlayerId) return;
  const me = Array.isArray(turn.players) ? turn.players.find(p => p.playerId === myPlayerId) : null;
  if (me) playerBadge.style.backgroundColor = me.color;

  const mine = turn.playerId === myPlayerId && turn.phase === 'aiming';
  const wasMine = isMyTurn;
  setMyTurn(mine);

  if (mine) {
    turnBanner.textContent = `YOUR TURN · Hole ${turn.hole} · Stroke ${me ? me.strokes + 1 : ''}`;
    if (!wasMine && navigator.vibrate) navigator.vibrate([60, 40, 60]);
  } else if (turn.phase === 'game_over') {
    turnBanner.textContent = 'Round complete!';
  } else if (turn.phase === 'between_holes') {
    turnBanner.textContent = `Hole ${turn.hole} complete`;
  } else if (turn.playerId) {
    turnBanner.textContent = `${turn.name} is up · Hole ${turn.hole}`;
  } else if (me && (me.holed || me.pickedUp)) {
    turnBanner.textContent = 'Done this hole · waiting for others';
  } else {
    turnBanner.textContent = 'Waiting for players...';
  }
});

const statusVibration = { putt_accepted: 40, putt_rejected: [30, 60, 30], not_your_turn: [30, 60, 30], holed: [80, 60, 160] };

socket.on('game_status', (data) => {
  if (puttState !== 'idle' || isAiming) return;
  statusDisplay.textContent = data.message;
  const pattern = statusVibration[data.state];
  if (pattern && navigator.vibrate) navigator.vibrate(pattern);
});
