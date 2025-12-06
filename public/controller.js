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
}

function stopPutt() {
  if (!isPutting) return;
  isPutting = false;
  const duration = (Date.now() - puttStartTime) / 1000;

  puttButton.style.backgroundColor = '#4CAF50';
  puttButton.textContent = "HOLD TO PUTT";

  if (duration < 0.1) {
    statusDisplay.textContent = "Tap detected. Hold button to putt.";
    return;
  }

  // Analyze Swing
  analyzeSwingAndSend(duration);
}

function analyzeSwingAndSend(duration) {
  if (orientationHistory.length < 5) return;

  // 1. Calculate Swing Speed (Max change in Beta/Gamma)
  // We look for the peak angular velocity
  let maxSpeed = 0;

  for (let i = 1; i < orientationHistory.length; i++) {
    const prev = orientationHistory[i - 1];
    const curr = orientationHistory[i];
    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;

    // Simple distance in angular space
    const d_beta = curr.beta - prev.beta;
    const d_gamma = curr.gamma - prev.gamma;
    const speed = Math.sqrt(d_beta * d_beta + d_gamma * d_gamma) / dt;

    if (speed > maxSpeed) maxSpeed = speed;
  }

  // 2. Calculate Deviation (Slice/Hook)
  // We compare the final orientation (or average of swing) vs start
  // Specifically looking at 'Gamma' (Roll) or 'Alpha' (Yaw) depending on holding style.
  // Assuming standard "pointing" swing:
  // Change in Alpha represents deviation from the straight line.

  // Let's use the difference between the End Heading and Start Heading during the swing
  // But be careful of the locked angle vs actual phone heading.
  // If I lock angle at 90, but turn my body to 100 to start putt, 100 is my "Zero".
  // If I swing and end at 110, I sliced 10 degrees right.

  const startAlpha = orientationHistory[0].alpha;
  const endAlpha = orientationHistory[orientationHistory.length - 1].alpha;

  // Check for wrapping
  let alphaDiff = endAlpha - startAlpha;
  // Normalize -180 to 180
  alphaDiff = ((alphaDiff + 540) % 360) - 180;

  // Deviation is this change. 
  // Positive = Right/Clockwise deviation
  // Negative = Left/Counter-Clockwise deviation
  const deviation = alphaDiff;

  // 3. Construct Final Velocity Vector
  // Base direction is Locked Angle
  // Final direction is Locked Angle + Deviation
  const finalAngle = lockedAngle + deviation;
  const finalRad = finalAngle * (Math.PI / 180);

  // Power factor 
  // Golf putt: maxSpeed of ~200 deg/s is a solid hit.
  // Cap at ~400
  const normalizedPower = Math.min(maxSpeed / 300, 1.5);
  const baseSpeed = 15 * normalizedPower;

  const velocity = {
    x: Math.sin(finalRad) * baseSpeed,
    y: 0.1, // Small hop
    z: Math.cos(finalRad) * baseSpeed,
    power: normalizedPower // For UI display
  };

  debug(`Swing: Speed=${maxSpeed.toFixed(0)} Dev=${deviation.toFixed(1)}° Power=${(normalizedPower * 100).toFixed(0)}%`);
  statusDisplay.textContent = `Putt! Power: ${(normalizedPower * 100).toFixed(0)}%`;

  socket.emit('throw', velocity);
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
