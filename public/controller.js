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
  
  let direction = { x: 0, y: 0, z: 0 };
  
  // Calculate direction based on device orientation
  if (window.holeCenterX !== undefined && window.holeCenterZ !== undefined && window.ballBody) {
    // Get vector from ball to hole
    const ballToHoleX = window.holeCenterX - window.ballBody.position.x;
    const ballToHoleZ = window.holeCenterZ - window.ballBody.position.z;
    
    // Normalize this vector
    const length = Math.sqrt(ballToHoleX * ballToHoleX + ballToHoleZ * ballToHoleZ);
    
    if (length > 0) {
      const forwardX = ballToHoleX / length;
      const forwardZ = ballToHoleZ / length;
      
      // Create a perpendicular vector (rightward)
      const rightX = forwardZ;
      const rightZ = -forwardX;
      
      // Use gamma (left/right tilt) to determine direction along the right axis
      // Use beta (forward/back tilt) to determine direction along the forward axis
      
      // Scale factors for sensitivity
      const gammaScale = 0.7; // Reduced from 1.0 for less sensitive left/right
      const betaScale = 0.7;  // Reduced from 1.0 for less sensitive forward/back
      
      // Calculate direction components
      const gammaRad = currentOrientation.gamma * (Math.PI / 180) * gammaScale;
      const betaRad = (currentOrientation.beta - 45) * (Math.PI / 180) * betaScale;
      
      // Mix the forward and right vectors based on tilt
      direction.x = forwardX * Math.cos(betaRad) + rightX * Math.sin(gammaRad);
      direction.z = forwardZ * Math.cos(betaRad) + rightZ * Math.sin(gammaRad);
      direction.y = Math.sin(betaRad) * 0.5; // Reduced y component
      
      // Apply a speed scaling based on the tilt magnitude
      const tiltMagnitude = Math.sqrt(gammaRad * gammaRad + betaRad * betaRad);
      const speedScale = Math.min(tiltMagnitude * 10, 20); // Cap at 20
      
      direction.x *= speedScale;
      direction.y *= speedScale;
      direction.z *= speedScale;
    }
  } else {
    // Fall back to the original calculation if hole position is not available
    direction = {
      x: -Math.sin(currentOrientation.gamma * (Math.PI / 180)) * 10, // Reduced from 20
      y: Math.sin(currentOrientation.beta * (Math.PI / 180)) * 5,     // Reduced from 10
      z: Math.cos(currentOrientation.gamma * (Math.PI / 180)) * 10    // Reduced from 20
    };
  }
  
  // Send the direction data to the server
  socket.emit('orientation', direction);
}
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
  window.addEventListener('devicemotion', function() {}, true);
}

// Handle orientation event
function handleOrientation(event) {
  const timestamp = Date.now();
  
  // Check if we're getting real values
  if (event.beta !== null && event.gamma !== null) {
    currentOrientation.beta = event.beta;   // Forward/back tilt (degrees)
    currentOrientation.gamma = event.gamma; // Left/right tilt (degrees)
    debug(`Orientation: beta=${currentOrientation.beta.toFixed(2)}, gamma=${currentOrientation.gamma.toFixed(2)}`);
    
    // If putting, record orientation with timestamp
    if (isPutting) {
      if (timestamp - lastOrientationTime > 50) {
        orientationHistory.push({
          beta: currentOrientation.beta,
          gamma: currentOrientation.gamma,
          timestamp: timestamp
        });
        lastOrientationTime = timestamp;
      }
    }
  }
}

// Start tracking orientation when permissions are granted
window.addEventListener('deviceorientation', handleOrientation, true);

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
          const prev = orientationHistory[i-1];
          const curr = orientationHistory[i];
          const dt = (curr.timestamp - prev.timestamp) / 1000; // time diff in seconds
          
          if (dt > 0) {
            const betaChange = Math.abs(curr.beta - prev.beta);
            const gammaChange = Math.abs(curr.gamma - prev.gamma);
            // Angular speed in degrees per second
            const angularSpeed = Math.sqrt(betaChange*betaChange + gammaChange*gammaChange) / dt;
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
