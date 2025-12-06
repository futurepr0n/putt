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

// Global State
let motionPermissionGranted = false;
let currentOrientation = { alpha: 0, beta: 0, gamma: 0, absolute: 0, heading: 0 };
let socket = io();

// Aiming State
let isAiming = false;
let lockedAngle = 0; // The angle set by the user (degrees 0-360)
let aimInterval = null;

// Putt State
let isPutting = false;
let puttStartTime = 0;
let puttStartOrientation = null; // Snapshot of orientation when putt button pressed
let orientationHistory = [];


// --- 1. Orientation Handling ---

function handleOrientation(event) {
  // Store raw values
  if (event.alpha !== null) currentOrientation.alpha = event.alpha;
  if (event.beta !== null) currentOrientation.beta = event.beta;
  if (event.gamma !== null) currentOrientation.gamma = event.gamma;

  // High-precision sources
  if (event.webkitCompassHeading) currentOrientation.heading = event.webkitCompassHeading;
  if (event.absolute === true && event.alpha !== null) currentOrientation.absolute = event.alpha;

  // Debug spew for verifying sensors
  // debug(`A:${currentOrientation.alpha?.toFixed(0)} B:${currentOrientation.beta?.toFixed(0)} G:${currentOrientation.gamma?.toFixed(0)}`);

  if (isPutting && isPutting === true) {
    // Record high-freq history for swing analysis
    orientationHistory.push({
      beta: currentOrientation.beta,
      gamma: currentOrientation.gamma,
      alpha: currentOrientation.alpha,
      time: Date.now()
    });
  }
}

// Get the best available compass heading (0-360, 0=North typically, or relative start)
function getCompassHeading() {
  if (currentOrientation.heading !== undefined) return currentOrientation.heading;
  if (currentOrientation.absolute !== undefined) return currentOrientation.absolute;
  return currentOrientation.alpha || 0;
}


// --- 2. Aiming Logic ---

function startAiming() {
  if (isAiming) return;
  isAiming = true;
  aimButton.style.backgroundColor = '#1976D2'; // Darker Blue
  aimButton.textContent = "Aiming...";

  // Notify server we started aiming (for Snap-to-Pin)
  socket.emit('aim_start');

  // Start streaming aiming updates
  if (aimInterval) clearInterval(aimInterval);
  aimInterval = setInterval(() => {
    const heading = getCompassHeading();
    // Send 'preview' direction to game so arrow rotates
    // We send a normalized vector based on this angle
    const angleRad = heading * (Math.PI / 180);
    const direction = {
      x: Math.sin(angleRad),
      y: 0,
      z: Math.cos(angleRad)
    };
    socket.emit('orientation', direction);

    statusDisplay.textContent = `Angle: ${heading.toFixed(0)}°`;
  }, 50);
}

function stopAiming() {
  if (!isAiming) return;
  isAiming = false;
  clearInterval(aimInterval);

  // Lock the angle
  lockedAngle = getCompassHeading();

  aimButton.style.backgroundColor = '#2196F3'; // Original Blue
  aimButton.textContent = `Direction Set! (${lockedAngle.toFixed(0)}°)`;
  statusDisplay.textContent = "Direction Locked. Hold Green to Putt.";

  socket.emit('aim_end'); // Optional, to finalize snap if needed

  // Send final locked orientation to ensure game matches
  const angleRad = lockedAngle * (Math.PI / 180);
  const direction = {
    x: Math.sin(angleRad),
    y: 0,
    z: Math.cos(angleRad)
  };
  socket.emit('orientation', direction);
}


// --- 3. Putting Logic ---

function startPutt() {
  isPutting = true;
  puttStartTime = Date.now();
  orientationHistory = [];

  // Capture the 'Zero' stance for this swing
  // This allows the user to hold the phone comfortably. Deviations from THIS position
  // will cause the ball to curve/slice.
  puttStartOrientation = { ...currentOrientation };

  puttButton.style.backgroundColor = '#388E3C'; // Darker Green
  puttButton.textContent = "Swing Now!";
  statusDisplay.textContent = "Recording Swing...";

  // Start streaming live swing data for visual feedback
  if (swingInterval) clearInterval(swingInterval);
  swingInterval = setInterval(() => {
    streamSwingData();
    // Debugging Swing State
    if (statusDisplay && orientationHistory.length > 0) {
      const last = orientationHistory[orientationHistory.length - 1];
      statusDisplay.innerHTML = `Recording... <br>Hist: ${orientationHistory.length} <br>B: ${last.beta.toFixed(0)} G: ${last.gamma.toFixed(0)}`;
    } else if (orientationHistory.length === 0) {
      statusDisplay.textContent = "Recording... (No Data!)";
    }
  }, 50);
}

function stopPutt() {
  if (!isPutting) return;
  isPutting = false;
  clearInterval(swingInterval);

  const duration = (Date.now() - puttStartTime) / 1000;

  puttButton.style.backgroundColor = '#4CAF50';
  puttButton.textContent = "HOLD TO PUTT";

  // Debug: Verify duration and history check
  debug(`Putt Stop. Duration: ${duration.toFixed(2)}s. History: ${orientationHistory.length}`);

  if (duration < 0.1) {
    statusDisplay.textContent = "Tap detected. Hold button to putt.";
    return;
  }

  // Analyze Swing
  analyzeSwingAndSend(duration);
}

function streamSwingData() {
  if (orientationHistory.length < 2) return;

  // Provide live feedback on power/deviation
  const curr = orientationHistory[orientationHistory.length - 1];

  // Calculate current deviation from start
  let alphaDiff = curr.alpha - puttStartOrientation.alpha;
  alphaDiff = ((alphaDiff + 540) % 360) - 180;

  // Calculate instantaneous power (roughly)
  const prev = orientationHistory[Math.max(0, orientationHistory.length - 2)];
  const dt = (curr.time - prev.time) / 1000;
  let speed = 0;
  if (dt > 0) {
    const d_beta = curr.beta - prev.beta;
    const d_gamma = curr.gamma - prev.gamma;
    speed = Math.sqrt(d_beta * d_beta + d_gamma * d_gamma) / dt;
  }

  const normalizedPower = Math.min(speed / 300, 1.5);

  socket.emit('swing_data', {
    deviation: alphaDiff,
    power: normalizedPower
  });
}

function analyzeSwingAndSend(duration) {
  if (orientationHistory.length < 5) {
    statusDisplay.textContent = "Swing too short. Try again.";
    return;
  }

  // 1. Determine Major Swing Axis (Beta vs Gamma)
  // Calculate range of motion for both
  let minBeta = 999, maxBeta = -999, minGamma = 999, maxGamma = -999;
  orientationHistory.forEach(h => {
    minBeta = Math.min(minBeta, h.beta);
    maxBeta = Math.max(maxBeta, h.beta);
    minGamma = Math.min(minGamma, h.gamma);
    maxGamma = Math.max(maxGamma, h.gamma);
  });

  const rangeBeta = maxBeta - minBeta;
  const rangeGamma = maxGamma - minGamma;

  // Assuming "Face Down" grip:
  // If holding like a putter, swing is mainy Pitch (Beta) or Roll (Gamma) depending on exact hold.
  // We'll just define the "Swing Axis" as the one with more movement.
  const axis = rangeBeta > rangeGamma ? 'beta' : 'gamma';
  const startVal = puttStartOrientation[axis];

  // 2. Identify Backswing Apex
  // Finds the point furthest from startVal
  // note: could be positive or negative depending on direction
  let maxDeviation = 0;
  let apexIndex = 0;

  for (let i = 0; i < orientationHistory.length; i++) {
    const val = orientationHistory[i][axis];
    const diff = Math.abs(val - startVal); // Simple distance
    // handle wrapping? Beta -180 to 180. Gamma -90 to 90.
    // For simplicity assume no full 360 wrap in a single putt swing.

    if (diff > maxDeviation) {
      maxDeviation = diff;
      apexIndex = i;
    }
  }

  // Check if backswing was significant
  if (maxDeviation < 5.0) {
    statusDisplay.textContent = "Minimal motion. Swing larger.";
    debug("Motion too small: " + maxDeviation.toFixed(1));
    return;
  }

  // 3. Find Impact Point (Return to Start)
  // Search from Apex forward
  let impactIndex = -1;
  let minDiffAtImpact = 999;

  // We want to find where it crosses startVal, or gets closest to it *after* the apex
  for (let i = apexIndex + 1; i < orientationHistory.length; i++) {
    const val = orientationHistory[i][axis];
    const diff = Math.abs(val - startVal);

    // If we crossed zero (diff increases after decreasing?), implies we passed it.
    // Let's just find the minimum diff to startVal after Apex.
    if (diff < minDiffAtImpact) {
      minDiffAtImpact = diff;
      impactIndex = i;
    } else {
      // function started increasing again, maybe we passed impact? 
      // Stick with the closest point found so far.
      // But we should continue in case there's noise.
    }
  }

  // Robust check: if we didn't return reasonably close to start
  if (minDiffAtImpact > 15.0) {
    // "You didn't complete the swing"
    // But maybe they just followed through super fast?
    // Let's use the last point if we can't find a good impact.
    debug("Didn't return to start. Closest: " + minDiffAtImpact.toFixed(1));
  }

  // If impact not found (e.g. backswing only), default to end
  if (impactIndex === -1) impactIndex = orientationHistory.length - 1;

  // 4. Calculate Velocity AT Impact
  // Look at window around impactIndex
  const p1 = orientationHistory[Math.max(0, impactIndex - 2)];
  const p2 = orientationHistory[Math.min(orientationHistory.length - 1, impactIndex + 2)];

  const dt = (p2.time - p1.time) / 1000;
  let impactSpeed = 0;

  if (dt > 0) {
    const d_axis = p2[axis] - p1[axis];
    // We care about speed in the *Forward* direction.
    // Backswing direction was (Apex - Start).
    // Forward direction should be opposite.
    const swingDir = orientationHistory[apexIndex][axis] - startVal; // e.g. +20
    const velocityDir = d_axis; // e.g. -40 (coming back)

    // Velocity should oppose backswing
    if (Math.sign(swingDir) !== Math.sign(velocityDir)) {
      impactSpeed = Math.abs(d_axis) / dt;
    } else {
      // Moving in same direction as backswing? weird.
      impactSpeed = 0;
    }
  }

  // 5. Calculate Deviation (Slice/Hook) AT Impact
  // Compare Alpha at Impact vs Start
  const impactAlpha = orientationHistory[impactIndex].alpha;
  const startAlpha = puttStartOrientation.alpha;
  let alphaDiff = impactAlpha - startAlpha;
  alphaDiff = ((alphaDiff + 540) % 360) - 180;

  const deviation = alphaDiff;

  // 6. Final Power Calculation
  // Golf putt: max speed around 300-400 dps is hard.
  const normalizedPower = Math.min(impactSpeed / 400, 1.5);

  // Construct Vector
  const finalAngle = lockedAngle + deviation;
  const finalRad = finalAngle * (Math.PI / 180);

  const baseSpeed = 15 * normalizedPower;

  const velocity = {
    x: Math.sin(finalRad) * baseSpeed,
    y: 0.1,
    z: Math.cos(finalRad) * baseSpeed,
    power: normalizedPower
  };

  debug(`Swing Valid. Axis:${axis} Apex:${maxDeviation.toFixed(0)} Speed:${impactSpeed.toFixed(0)} Dev:${deviation.toFixed(1)}`);
  statusDisplay.textContent = `Putt! Power: ${(normalizedPower * 100).toFixed(0)}%`;

  if (normalizedPower > 0.05) {
    socket.emit('throw', velocity);
  } else {
    statusDisplay.textContent = "Swing too weak/slow.";
  }
}


// --- 4. Setup & Permissions ---

window.addEventListener('DOMContentLoaded', () => {
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
});

function requestPermissions() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(state => {
        if (state === 'granted') {
          enableControls();
        } else {
          alert('Permission denied');
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
  statusDisplay.textContent = "Ready. Set Angle then Putt.";

  window.addEventListener('deviceorientation', handleOrientation, true);
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  }
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
  if (roomId) socket.emit('joinRoom', roomId);
});

socket.on('roomJoined', (data) => {
  roomId = data.roomId;
  connectionStatus.textContent = `Room: ${roomId}`;
});
