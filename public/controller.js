// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

// DOM Elements
const puttButton = document.getElementById('throwButton'); // Reusing the throw button
const statusDisplay = document.getElementById('statusDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const permissionButton = document.getElementById('permissionButton');
const permissionSection = document.getElementById('permissionSection');
const debugInfo = document.getElementById('debugInfo');

// Rename UI elements for golf
if (puttButton) puttButton.textContent = 'HOLD TO PUTT';
if (permissionButton) permissionButton.textContent = 'TAP HERE TO ENABLE CLUB MOTION';
if (document.querySelector('.ios-note')) {
  document.querySelector('.ios-note').textContent = 'iOS requires permission to use motion controls for putting';
}
if (document.querySelector('h2')) {
  document.querySelector('h2').textContent = 'Mini Golf Controller';
}

// Initially hide the putt button
if (puttButton) puttButton.style.display = 'none';

// Set up Socket.io connection
const socket = io();

// Motion sensors flag
let motionPermissionGranted = false;

// Motion tracking variables
let initialOrientation = { beta: 0, gamma: 0 };
let currentOrientation = { beta: 0, gamma: 0 };
let isPutting = false;
let puttStartTime = 0;
let orientationHistory = [];
let lastOrientationTime = 0;

let sendingOrientation = false;
const orientationInterval = 100; // ms between orientation updates


function addAbsoluteModeToggle() {
  // Check if button already exists
  if (document.getElementById('absoluteModeToggle')) return;

  const toggleButton = document.createElement('button');
  toggleButton.id = 'absoluteModeToggle';
  toggleButton.textContent = '360° Aiming: OFF';
  toggleButton.style.position = 'fixed';
  toggleButton.style.top = '10px';
  toggleButton.style.right = '10px';
  toggleButton.style.padding = '8px 12px';
  toggleButton.style.backgroundColor = 'rgba(0, 0, 255, 0.7)';
  toggleButton.style.color = 'white';
  toggleButton.style.border = 'none';
  toggleButton.style.borderRadius = '5px';
  toggleButton.style.zIndex = '1000';

  window.useAbsoluteMode = true;

  toggleButton.addEventListener('click', function () {
    window.useAbsoluteMode = !window.useAbsoluteMode;
    // Update button visual state
    updateButtonState();
  });

  function updateButtonState() {
    toggleButton.textContent = `360° Aiming: ${window.useAbsoluteMode ? 'ON' : 'OFF'}`;
    toggleButton.style.backgroundColor = window.useAbsoluteMode ? 'rgba(0, 128, 0, 0.7)' : 'rgba(0, 0, 255, 0.7)';

    if (statusDisplay) {
      statusDisplay.textContent = `Direction mode: ${window.useAbsoluteMode ? '360° aiming' : 'Relative to phone'}`;
    }
  }

  // Initial state
  updateButtonState();

  document.body.appendChild(toggleButton);
}

document.addEventListener('DOMContentLoaded', function () {
  // Initialize orientation object with all properties
  currentOrientation = { alpha: 0, beta: 0, gamma: 0 };

  // Add the mode toggle button
  addAbsoluteModeToggle();
});

function startSendingOrientation() {
  if (sendingOrientation) return;
  sendingOrientation = true;

  // Send initial orientation
  sendOrientationData();

  // Set up interval to regularly send orientation data
  window.orientationUpdateInterval = setInterval(sendOrientationData, orientationInterval);
}

function stopSendingOrientation() {
  sendingOrientation = false;
  if (window.orientationUpdateInterval) {
    clearInterval(window.orientationUpdateInterval);
    window.orientationUpdateInterval = null;
  }
}
function sendOrientationData() {
  if (!socket.connected) return;

  let direction;

  if (window.useAbsoluteMode) {
    // Determine the best angle source
    // Priority: 
    // 1. webkitCompassHeading (iOS - best for compass)
    // 2. absolute alpha (Android - best for compass)
    // 3. standard alpha (Gyro-based/Relative)
    let rawAngle = 0;
    let source = 'None';

    if (currentOrientation.heading !== undefined) {
      rawAngle = currentOrientation.heading;
      source = 'iOS Compass';
    } else if (currentOrientation.absolute !== undefined) {
      rawAngle = currentOrientation.absolute;
      // Android absolute alpha is usually 0=North, increasing Counter-Clockwise?
      // Standard Web API: 0=North, Counter-Clockwise around Z.
      // We might need to invert it to match compass heading (Clockwise).
      // Let's stick to raw for now and let user "Invert" if needed.
      source = 'Android Absolute';
    } else if (currentOrientation.alpha !== undefined) {
      rawAngle = currentOrientation.alpha;
      source = 'Relative Gyro';
    } else {
      // Fallback relies on gamma? No, we stay in absolute mode but warn
      source = 'No Data';
      // If we really have no alpha, maybe we SHOULD use gamma if face down?
      // But let's assume valid device.
    }

    if (statusDisplay && Math.random() < 0.05) { // Update occasionally to reduce flicker
      // Optional: Show source in specific debug element if it existed, or append to status?
      // For now, let's keep status clean, but log to debug.
      debug(`Source: ${source} | Angle: ${rawAngle?.toFixed(0)}`);
    }

    // Fallback if no angle available
    if (rawAngle === undefined || rawAngle === null) rawAngle = 0;

    // Calculate delta angle
    let angle = rawAngle - (referenceAngle || 0);

    // Apply Invert option (flips the aim 180 degrees)
    if (window.invertAim) {
      angle += 180;
    }

    // Robust normalization to 0-360
    angle = ((angle % 360) + 360) % 360;

    // Convert to radians
    // Note: We might need to invert direction of rotation depending on the device/OS convention
    // But calibration usually handles the offset. If rotation is mirrored, we might need a "Mirror" toggle too.
    // For now, let's assume standard compass rotation (Clockwise increases angle).
    let angleRad = angle * (Math.PI / 180);

    // Get power from beta tilt - centered around 45 degrees
    const betaAngle = currentOrientation.beta || 45;
    const tiltPower = Math.abs(betaAngle - 45) / 45;
    const power = 10 + tiltPower * 5; // 10-15 range

    // Use polar coordinates for direction
    // Map standard compass (0=North, 90=East) to 3D space (0=+Z, 90=+X)
    direction = {
      x: Math.sin(angleRad) * power,
      y: 0.1 * power,
      z: Math.cos(angleRad) * power
    };
  } else {
    // Regular mode - use gamma for direction
    const gamma = currentOrientation.gamma || 0;
    const beta = currentOrientation.beta || 45;

    // Basic direction calculation
    direction = {
      x: -Math.sin(gamma * (Math.PI / 180)) * 15,
      y: Math.sin(beta * (Math.PI / 180)) * 5,
      z: Math.cos(gamma * (Math.PI / 180)) * 15
    };
  }

  // Send the direction data to the server
  socket.emit('orientation', direction);
}


function handleOrientation(event) {
  const timestamp = Date.now();

  // Store all orientation values
  if (event.beta !== null) {
    currentOrientation.beta = event.beta;
  }
  if (event.gamma !== null) {
    currentOrientation.gamma = event.gamma;
  }
  if (event.alpha !== null) {
    currentOrientation.alpha = event.alpha;
  }
  if (event.absolute === true && event.alpha !== null) {
    currentOrientation.absolute = event.alpha;
  }
  // iOS support
  if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
    currentOrientation.heading = event.webkitCompassHeading;
  }

  debug(`Orientation: ${currentOrientation.alpha?.toFixed(2)}, ${currentOrientation.beta?.toFixed(2)}, ${currentOrientation.gamma?.toFixed(2)}`);

  // If putting, record orientation history
  if (isPutting) {
    if (timestamp - lastOrientationTime > 50) {
      orientationHistory.push({
        alpha: currentOrientation.alpha,
        beta: currentOrientation.beta,
        gamma: currentOrientation.gamma,
        timestamp: timestamp
      });
      lastOrientationTime = timestamp;
    }
  }
}

// Add UI components when page loads
window.addEventListener('DOMContentLoaded', function () {
  // Direction mode toggle removed
  addCalibrationButton();
  addInvertToggle();

  // Initialize with current orientation values
  currentOrientation = { alpha: 0, beta: 0, gamma: 0 };
});



// Debug function
function debug(message) {
  console.log(message);
  if (debugInfo) debugInfo.textContent = message;
}

// Check if device supports motion events
function checkDeviceMotionSupport() {
  if (window.DeviceOrientationEvent) {
    debug("DeviceOrientationEvent is supported");
    return true;
  } else {
    debug("DeviceOrientationEvent is NOT supported");
    if (statusDisplay) statusDisplay.textContent = "Your device doesn't support motion sensors. Please use a different device.";
    return false;
  }
}

// Request iOS motion permission
function requestMotionPermission() {
  debug("Permission button clicked");
  if (statusDisplay) statusDisplay.textContent = "Requesting permission...";

  // iOS 13+ request for DeviceOrientationEvent
  if (typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function') {

    debug("Using DeviceOrientationEvent.requestPermission");
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        debug("Permission response: " + permissionState);
        if (permissionState === 'granted') {
          motionPermissionGranted = true;
          showPuttButton();
        } else {
          if (statusDisplay) statusDisplay.textContent = 'Motion permission denied. Please allow motion sensors and refresh.';
        }
      })
      .catch(error => {
        debug("Permission error: " + error);
        // Fall back to DeviceMotionEvent
        requestDeviceMotionPermission();
      });
  }
  // iOS 13+ request for DeviceMotionEvent
  else {
    requestDeviceMotionPermission();
  }
}

function requestDeviceMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function') {

    debug("Using DeviceMotionEvent.requestPermission");
    DeviceMotionEvent.requestPermission()
      .then(permissionState => {
        debug("Motion permission response: " + permissionState);
        if (permissionState === 'granted') {
          motionPermissionGranted = true;
          showPuttButton();
        } else {
          if (statusDisplay) statusDisplay.textContent = 'Motion permission denied. Please allow motion sensors and refresh.';
        }
      })
      .catch(error => {
        debug("Motion permission error: " + error);
        // Assume non-iOS device or older iOS, try direct approach
        assumeMotionPermission();
      });
  } else {
    // Not iOS 13+ or not supporting explicit permission
    assumeMotionPermission();
  }
}

function assumeMotionPermission() {
  debug("Assuming motion permission (non-iOS or older iOS)");
  // Some devices don't need permission, show putt button and we'll see if events come in
  motionPermissionGranted = true;
  showPuttButton();

  // Setup a timeout to check if we're getting orientation events
  setTimeout(() => {
    if (currentOrientation.beta === 0 && currentOrientation.gamma === 0) {
      debug("Not receiving orientation events after timeout");
      if (statusDisplay) statusDisplay.textContent = "Motion sensors not available. Please check your device settings.";
    }
  }, 2000);
}

function showPuttButton() {
  debug("Showing putt button");
  if (permissionSection) permissionSection.style.display = 'none';
  if (puttButton) puttButton.style.display = 'block';
  if (statusDisplay) statusDisplay.textContent = 'Motion access granted! Hold to putt.';

  // Force iOS to start sending events (sometimes needed)
  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('devicemotion', function () { }, true);
}


// Direction mode toggle removed in favor of absoluteModeToggle

// Add calibration functionality
// Direction mode is now handled by window.useAbsoluteMode
let referenceAngle = 0;

function addCalibrationButton() {
  // Check if button already exists
  if (document.getElementById('calibrateButton')) return;

  const calibrateButton = document.createElement('button');
  calibrateButton.id = 'calibrateButton';
  calibrateButton.textContent = 'Calibrate Direction';
  calibrateButton.style.position = 'fixed';
  calibrateButton.style.top = '60px';
  calibrateButton.style.right = '10px';
  calibrateButton.style.padding = '8px 12px';
  calibrateButton.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
  calibrateButton.style.color = 'white';
  calibrateButton.style.border = 'none';
  calibrateButton.style.borderRadius = '5px';
  calibrateButton.style.zIndex = '1000';

  calibrateButton.addEventListener('click', function () {
    // Single click calibration
    let currentAlpha = 0;
    if (currentOrientation.heading !== undefined) currentAlpha = currentOrientation.heading;
    else if (currentOrientation.absolute !== undefined) currentAlpha = currentOrientation.absolute;
    else if (currentOrientation.alpha !== undefined) currentAlpha = currentOrientation.alpha;

    // Set reference angle to current alpha (this becomes "forward" or 0 deg)
    referenceAngle = currentAlpha;

    // Visual feedback
    const originalText = this.textContent;
    const originalColor = this.style.backgroundColor;

    this.textContent = 'Direction Set!';
    this.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';

    if (statusDisplay) {
      statusDisplay.textContent = 'Direction calibrated! Current angle set as forward.';
    }

    // Reset button after a short delay
    setTimeout(() => {
      this.textContent = originalText;
      this.style.backgroundColor = originalColor;
    }, 1500);
  });

  document.body.appendChild(calibrateButton);
}

function addInvertToggle() {
  // Check if button already exists
  if (document.getElementById('invertToggle')) return;

  const invertButton = document.createElement('button');
  invertButton.id = 'invertToggle';
  invertButton.textContent = 'Invert Aim: OFF';
  invertButton.style.position = 'fixed';
  invertButton.style.top = '110px';
  invertButton.style.right = '10px';
  invertButton.style.padding = '8px 12px';
  invertButton.style.backgroundColor = 'rgba(100, 100, 100, 0.7)';
  invertButton.style.color = 'white';
  invertButton.style.border = 'none';
  invertButton.style.borderRadius = '5px';
  invertButton.style.zIndex = '1000';

  window.invertAim = false;

  invertButton.addEventListener('click', function () {
    window.invertAim = !window.invertAim;
    this.textContent = `Invert Aim: ${window.invertAim ? 'ON' : 'OFF'}`;
    this.style.backgroundColor = window.invertAim ? 'rgba(0, 128, 0, 0.7)' : 'rgba(100, 100, 100, 0.7)';

    if (statusDisplay) {
      statusDisplay.textContent = `Aim direction ${window.invertAim ? 'inverted' : 'normal'}`;
    }
  });

  document.body.appendChild(invertButton);
}



// Start tracking orientation when permissions are granted
window.addEventListener('deviceorientation', handleOrientation, true);
if ('ondeviceorientationabsolute' in window) {
  window.addEventListener('deviceorientationabsolute', (event) => {
    if (event.absolute === true && event.alpha !== null) {
      currentOrientation.absolute = event.alpha;
    }
  }, true);
}

// Start putt
if (puttButton) {
  puttButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startSendingOrientation();
    isPutting = true;
    puttStartTime = Date.now();
    initialOrientation.beta = currentOrientation.beta;
    initialOrientation.gamma = currentOrientation.gamma;

    // Reset history for this putt
    orientationHistory = [{
      beta: initialOrientation.beta,
      gamma: initialOrientation.gamma,
      timestamp: puttStartTime
    }];
    lastOrientationTime = puttStartTime;

    if (statusDisplay) statusDisplay.textContent = 'Hold and swing your phone to putt...';
    debug("Putt started: initial beta=" + initialOrientation.beta.toFixed(2) + ", gamma=" + initialOrientation.gamma.toFixed(2));
  });

  // End putt and calculate velocity
  puttButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopSendingOrientation();
    if (isPutting) {
      isPutting = false;
      const puttEndTime = Date.now();
      const puttDuration = (puttEndTime - puttStartTime) / 1000; // in seconds

      debug("Putt ended: final beta=" + currentOrientation.beta.toFixed(2) + ", gamma=" + currentOrientation.gamma.toFixed(2));

      // Add the final position to history
      orientationHistory.push({
        beta: currentOrientation.beta,
        gamma: currentOrientation.gamma,
        timestamp: puttEndTime
      });

      // Calculate motion
      let maxAngularSpeed = 0;

      if (orientationHistory.length > 1) {
        for (let i = 1; i < orientationHistory.length; i++) {
          const prev = orientationHistory[i - 1];
          const curr = orientationHistory[i];
          const dt = (curr.timestamp - prev.timestamp) / 1000; // time diff in seconds

          if (dt > 0) {
            // Robust angle difference for swinging (handle 360/0 wrapping)
            const betaDiff = curr.beta - prev.beta;
            const betaChange = Math.abs((betaDiff + 540) % 360 - 180); // Shortest path -180 to 180

            const gammaDiff = curr.gamma - prev.gamma;
            const gammaChange = Math.abs((gammaDiff + 540) % 360 - 180);

            // Angular speed in degrees per second
            const angularSpeed = Math.sqrt(betaChange * betaChange + gammaChange * gammaChange) / dt;
            maxAngularSpeed = Math.max(maxAngularSpeed, angularSpeed);
          }
        }
      }

      // For putting, we're more interested in a forward swing motion
      // Calculate orientation change in radians (first to last point)
      const deltaBeta = (currentOrientation.beta - initialOrientation.beta) * (Math.PI / 180);
      const deltaGamma = (currentOrientation.gamma - initialOrientation.gamma) * (Math.PI / 180);

      // Golf putting is more controlled, so we use different factors
      const speedFactor = Math.min(maxAngularSpeed / 80, 2); // Cap at 2x, normalize by 80deg/s
      const durationFactor = Math.min(puttDuration / 1.0, 1); // Duration factor maxes at 1 second (shorter for putting)

      // Combined power factor
      const powerFactor = 0.2 + (speedFactor * 0.9) + (durationFactor * 0.1);

      // Base speed with dynamic adjustment for putting (should be lower than throwing)
      const baseSpeed = 10;
      const speed = baseSpeed * powerFactor;

      // Direction calculation - modified for golf putting (mostly forward motion)
      // We interpret a backswing followed by forward motion
      // The motion should be more along the z-axis (forward) than left/right
      const direction = {
        x: -Math.sin(deltaGamma) * 0.5, // Reduced side-to-side effect
        y: Math.sin(deltaBeta) * 0.3,   // Reduced up-down effect
        z: Math.cos(deltaGamma) * Math.cos(deltaBeta) // Forward motion
      };

      // Normalize direction vector
      const dirMagnitude = Math.sqrt(
        direction.x * direction.x +
        direction.y * direction.y +
        direction.z * direction.z
      );

      if (dirMagnitude > 0) {
        direction.x /= dirMagnitude;
        direction.y /= dirMagnitude;
        direction.z /= dirMagnitude;
      }

      // For putting, we need more precise control, so we use a different velocity calculation
      const velocity = {
        x: direction.x * speed,
        y: 0.1, // Very little vertical component
        z: direction.z * speed
      };

      // Check for minimal motion
      const totalMotion = Math.abs(deltaBeta) + Math.abs(deltaGamma);
      const minimalMotionThreshold = 0.1; // Lower threshold for putting

      if (totalMotion < minimalMotionThreshold || maxAngularSpeed < 15) {
        // Default gentle putt
        velocity.x = 0 + (Math.random() * 1 - 0.5); // Less variation
        velocity.y = 0.1;
        velocity.z = 3 + (Math.random() * 1 - 0.5); // Gentle forward motion
        if (statusDisplay) statusDisplay.textContent = 'Minimal motion detected. Using light putt.';
      } else {
        if (statusDisplay) statusDisplay.textContent = `Putt power: ${Math.round(powerFactor * 100)}%`;
      }

      debug(`Putt stats: motion=${totalMotion.toFixed(2)}, speed=${maxAngularSpeed.toFixed(2)}, power=${powerFactor.toFixed(2)}`);

      // Send putt data to server (still using 'throw' event for compatibility)
      socket.emit('throw', velocity);
    }
  });
}

// Socket connection event handlers
socket.on('connect', () => {
  if (connectionStatus) {
    connectionStatus.textContent = 'Connected to server';
    connectionStatus.className = 'connected';
  }

  // Check for room ID and join
  if (roomId) {
    socket.emit('joinRoom', roomId);
  } else if (statusDisplay) {
    statusDisplay.textContent = 'No room ID provided. Please scan the QR code from the game screen.';
  }
});

socket.on('disconnect', () => {
  if (connectionStatus) {
    connectionStatus.textContent = 'Disconnected from server';
    connectionStatus.className = 'disconnected';
  }
  if (statusDisplay) {
    statusDisplay.textContent = 'Connection lost. Please refresh the page.';
  }
});

socket.on('roomJoined', (data) => {
  roomId = data.roomId;
  if (connectionStatus) {
    connectionStatus.textContent = `Connected to room: ${roomId}`;
  }

  // Check for device support
  if (checkDeviceMotionSupport()) {
    if (!motionPermissionGranted) {
      if (statusDisplay) statusDisplay.textContent = 'Please enable motion controls to play';
      if (permissionSection) permissionSection.style.display = 'flex';
    }
  }
});

socket.on('roomError', (data) => {
  if (connectionStatus) {
    connectionStatus.textContent = `Error: ${data.message}`;
    connectionStatus.className = 'disconnected';
  }
  if (statusDisplay) {
    statusDisplay.textContent = 'Invalid room ID. Please scan the QR code again.';
  }
});

// Add permission button click handler
if (permissionButton) {
  permissionButton.addEventListener('click', requestMotionPermission);
}

// Initialize
debug("Golf controller initializing...");
