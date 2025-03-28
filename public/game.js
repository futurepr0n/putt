// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (!roomId) {
  alert('Room ID is missing. Redirecting to home page...');
  window.location.href = '/';
}

// Scene setup
const scene = new THREE.Scene();

// Create camera with better initial position
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, -12); // Higher and further back for better view
camera.lookAt(0, 0, 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Load and setup orbit controls
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/examples/js/controls/OrbitControls.js';

script.onload = function() {
  // Initialize controls with better settings
  window.controls = new THREE.OrbitControls(camera, renderer.domElement);
  window.controls.enableDamping = true;
  window.controls.dampingFactor = 0.2;
  window.controls.screenSpacePanning = false;
  window.controls.maxPolarAngle = Math.PI / 1.8; // Limit angle to prevent seeing under the course
  window.controls.minDistance = 2; // Allow closer zoom
  window.controls.maxDistance = 30; // Allow further zoom out
  
  // Set target to course center
  window.controls.target.set(0, 0, 0);
  window.controls.update();
  
  // Add follow ball mode toggle
  setupFollowBallMode();
  
  // Add camera info overlay
  addCameraInfo();
  
  // Add camera preset buttons
  addCameraPresets();
};

document.head.appendChild(script);

// Add ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Add directional light for shadows
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Physics setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Standard earth gravity
world.defaultContactMaterial.friction = 0.3; // Lower friction for smooth rolling
world.solver.iterations = 20; // More iterations for stable physics
world.fixedTimeStep = 1/120; // Smaller time step for more accurate physics

// Course generation variables
let currentCourse = 0;
const totalCourses = 5;
let courseCompleted = false;
let strokeCount = 0;
let totalScore = 0;
let par = 2; // Default par value

// Material for ground and obstacles
const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const roughMaterial = new THREE.MeshStandardMaterial({ color: 0x355E3B });
const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xE3C587 });
const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
const flagMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
const poleMatrial = new THREE.MeshStandardMaterial({ color: 0xCCCCCC });

// Golf-specific physics settings for more realistic putting
function improvePhysicsSettings() {
  // Use standard gravity for better behavior
  world.gravity.set(0, -9.8, 0);
  
  // Increase solver iterations for more stable physics
  world.solver.iterations = 10;
  
  // Adjust default contact material for better ball-green interaction
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.3;
  world.defaultContactMaterial.contactEquationStiffness = 1e7;
  world.defaultContactMaterial.contactEquationRelaxation = 3;
  
  // Set time step for physics
  world.fixedTimeStep = 1/60;
}

// Create a button to toggle "follow ball" mode
function setupFollowBallMode() {
  // Create the toggle button
  const followButton = document.createElement('button');
  followButton.id = 'followBallButton';
  followButton.style.position = 'absolute';
  followButton.style.bottom = '80px';
  followButton.style.left = '20px';
  followButton.style.padding = '8px 12px';
  followButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  followButton.style.color = 'white';
  followButton.style.border = 'none';
  followButton.style.borderRadius = '5px';
  followButton.style.cursor = 'pointer';
  followButton.style.fontSize = '14px';
  followButton.textContent = 'Follow Ball: OFF';
  
  document.body.appendChild(followButton);
  
  // Track follow mode state
  window.followBallMode = false;
  
  // Add click handler
  followButton.addEventListener('click', function() {
    window.followBallMode = !window.followBallMode;
    followButton.textContent = `Follow Ball: ${window.followBallMode ? 'ON' : 'OFF'}`;
    
    if (window.followBallMode) {
      followButton.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
    } else {
      followButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      
      // Reset controls target to course center when disabling follow mode
      if (window.controls) {
        window.controls.target.set(0, 0, 0);
      }
    }
  });
}

// Add camera position preset buttons for quick viewing angles
function addCameraPresets() {
  const presetPositions = [
    { name: 'Top View', position: [0, 15, 0], target: [0, 0, 0] },
    { name: 'Side View', position: [15, 5, 0], target: [0, 0, 0] },
    { name: 'Follow View', position: [0, 5, -8], target: [0, 0, 4] },
  ];
  
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '80px';
  container.style.right = '20px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '10px';
  
  presetPositions.forEach(preset => {
    const button = document.createElement('button');
    button.textContent = preset.name;
    button.style.padding = '8px 12px';
    button.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    
    button.addEventListener('click', () => {
      if (camera && window.controls) {
        // Turn off follow mode when switching to a preset
        window.followBallMode = false;
        if (document.getElementById('followBallButton')) {
          document.getElementById('followBallButton').textContent = 'Follow Ball: OFF';
          document.getElementById('followBallButton').style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        }
        
        // Animate camera move
        const startPosition = camera.position.clone();
        const startTarget = window.controls.target.clone();
        const endPosition = new THREE.Vector3(...preset.position);
        const endTarget = new THREE.Vector3(...preset.target);
        
        const duration = 1000; // ms
        const startTime = Date.now();
        
        function animateCamera() {
          const elapsedTime = Date.now() - startTime;
          const progress = Math.min(elapsedTime / duration, 1);
          
          // Smoothly interpolate position and target
          camera.position.lerpVectors(startPosition, endPosition, progress);
          window.controls.target.lerpVectors(startTarget, endTarget, progress);
          window.controls.update();
          
          if (progress < 1) {
            requestAnimationFrame(animateCamera);
          }
        }
        
        animateCamera();
      }
    });
    
    container.appendChild(button);
  });
  
  document.body.appendChild(container);
}

// Create a course with terrain features
function createCourse(courseNumber) {
  // Clear existing course
  clearCourse();
  
  // Reset course state
  courseCompleted = false;
  strokeCount = 0;
  
  // Set par based on course difficulty
  par = 2 + Math.floor(courseNumber / 2);
  
  // Apply golf-specific physics settings
  improvePhysicsSettings();
  
  // Create the base green - USING A SIMPLE FLAT PLANE INSTEAD OF TERRAIN
  const courseSize = { width: 8, length: 16 };
  const groundGeometry = new THREE.PlaneGeometry(courseSize.width, courseSize.length);
  const groundMesh = new THREE.Mesh(groundGeometry, greenMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  
  // Create a simple flat ground for physics (instead of heightfield)
  const groundBody = new CANNON.Body({ mass: 0 });
  const groundShape = new CANNON.Plane();
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  groundBody.material = new CANNON.Material('groundMaterial');
  world.addBody(groundBody);
  
  // Add the hole (cup)
  createHole(0, courseSize.length/2 - 2);
  
  // Add tee marker
  createTeeMarker(0, -courseSize.length/2 + 3);
  
  // Add boundaries with reduced height
  createSimpleBoundaries(courseSize);
  
  // Create safety floors under the course
  createSafetyFloor(courseSize);
  
  // Create ball at the tee position
  createBall(0, 0.5, -courseSize.length/2 + 3);
  
  // Set up contact detection after ball creation
  setupContactDetection();
  
  // Add obstacles based on course number (simplified)
  addSimpleObstacles(courseNumber, courseSize);
  
  // Update stroke counter display
  updateStrokeDisplay();
  
  // Update the course info
  updateCourseInfo(courseNumber + 1, totalCourses, par);

  // Create direction indicator
  createDirectionIndicator();
  
  // Make sure camera info is displayed
  addCameraInfo();
  
  // Add debug controls for testing
  addDebugControls();
}


function addDebugControls() {
  // Check if button already exists
  if (document.getElementById('resetBallButton')) return;
  
  const resetButton = document.createElement('button');
  resetButton.id = 'resetBallButton';
  resetButton.textContent = 'Reset Ball';
  resetButton.style.position = 'absolute';
  resetButton.style.bottom = '160px';
  resetButton.style.left = '20px';
  resetButton.style.padding = '8px 12px';
  resetButton.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
  resetButton.style.color = 'white';
  resetButton.style.border = 'none';
  resetButton.style.borderRadius = '5px';
  resetButton.style.cursor = 'pointer';
  resetButton.style.zIndex = '1000';
  
  resetButton.addEventListener('click', function() {
    resetBall();
  });
  
  document.body.appendChild(resetButton);
  
  // Add a force push button
  const pushButton = document.createElement('button');
  pushButton.id = 'pushBallButton';
  pushButton.textContent = 'Push Ball Forward';
  pushButton.style.position = 'absolute';
  pushButton.style.bottom = '200px';
  pushButton.style.left = '20px';
  pushButton.style.padding = '8px 12px';
  pushButton.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
  pushButton.style.color = 'white';
  pushButton.style.border = 'none';
  pushButton.style.borderRadius = '5px';
  pushButton.style.cursor = 'pointer';
  pushButton.style.zIndex = '1000';
  
  pushButton.addEventListener('click', function() {
    if (window.ballBody) {
      // Apply a gentle push forward
      window.ballBody.velocity.set(0, 0.1, 3);
      ballInMotion = true;
    }
  });
  
  document.body.appendChild(pushButton);

  // Add hole debug button
  addHoleDebugButton();

  // Add a toggle button for physics debug
  const debugPhysicsButton = document.createElement('button');
  debugPhysicsButton.id = 'debugPhysicsButton';
  debugPhysicsButton.textContent = 'Toggle Physics Debug';
  debugPhysicsButton.style.position = 'absolute';
  debugPhysicsButton.style.bottom = '240px';
  debugPhysicsButton.style.left = '20px';
  debugPhysicsButton.style.padding = '8px 12px';
  debugPhysicsButton.style.backgroundColor = 'rgba(0, 0, 255, 0.7)';
  debugPhysicsButton.style.color = 'white';
  debugPhysicsButton.style.border = 'none';
  debugPhysicsButton.style.borderRadius = '5px';
  debugPhysicsButton.style.cursor = 'pointer';
  debugPhysicsButton.style.zIndex = '1000';
  
  // Store debug state
  window.showPhysicsDebug = false;
  
  debugPhysicsButton.addEventListener('click', function() {
    window.showPhysicsDebug = !window.showPhysicsDebug;
    
    // Toggle debug sphere visibility
    if (window.debugSphere) {
      window.debugSphere.visible = window.showPhysicsDebug;
    }
    
    debugPhysicsButton.style.backgroundColor = window.showPhysicsDebug ? 
      'rgba(0, 255, 0, 0.7)' : 'rgba(0, 0, 255, 0.7)';
  });
  
  document.body.appendChild(debugPhysicsButton);
}



function createSimpleBoundaries(courseSize) {
  const boundaryHeight = 0.3;
  const boundaryThickness = 0.4;
  
  // Create a boundary helper function
  function createBoundary(x, y, z, width, depth) {
    const boundaryGeom = new THREE.BoxGeometry(width, boundaryHeight, depth);
    const boundaryMesh = new THREE.Mesh(boundaryGeom, roughMaterial);
    boundaryMesh.position.set(x, y + boundaryHeight/2, z);
    boundaryMesh.castShadow = true;
    boundaryMesh.receiveShadow = true;
    scene.add(boundaryMesh);
    
    // Physics body
    const boundaryBody = new CANNON.Body({ mass: 0 });
    boundaryBody.addShape(new CANNON.Box(new CANNON.Vec3(width/2, boundaryHeight/2, depth/2)));
    boundaryBody.position.set(x, y + boundaryHeight/2, z);
    world.addBody(boundaryBody);
  }
  
  // Left boundary
  createBoundary(-courseSize.width/2 - boundaryThickness/2, 0, 0, 
                boundaryThickness, courseSize.length + boundaryThickness*2);
  
  // Right boundary
  createBoundary(courseSize.width/2 + boundaryThickness/2, 0, 0, 
                boundaryThickness, courseSize.length + boundaryThickness*2);
  
  // Top boundary
  createBoundary(0, 0, courseSize.length/2 + boundaryThickness/2, 
                courseSize.width + boundaryThickness*2, boundaryThickness);
  
  // Bottom boundary
  createBoundary(0, 0, -courseSize.length/2 - boundaryThickness/2, 
                courseSize.width + boundaryThickness*2, boundaryThickness);
}

function addObstacleDebugger() {
  // Add this function to the end of createCourse() function
  // Create small markers to show where obstacles are placed
  const debugObjects = [];
  
  // Add a visible debug marker for obstacles
  if (window.debugObstacles) {
    scene.remove(window.debugObstacles);
  }
  
  // Create a group to hold all debug objects
  window.debugObstacles = new THREE.Group();
  scene.add(window.debugObstacles);
  
  // Function to add a debug marker
  function addDebugMarker(x, y, z, color, type) {
    const markerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: color });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(x, y + 0.5, z); // Position slightly above ground
    window.debugObstacles.add(marker);
    
    // Add text label
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText(type, 4, 20);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({ map: texture });
    const label = new THREE.Sprite(labelMaterial);
    label.position.set(x, y + 0.7, z);
    label.scale.set(0.5, 0.25, 1);
    window.debugObstacles.add(label);
  }
  
  // Add debug markers for all obstacles
  for (const obstacle of window.obstaclePositions || []) {
    addDebugMarker(
      obstacle.x, 
      obstacle.y || 0, 
      obstacle.z, 
      obstacle.type === 'hill' ? 0x00FF00 : 
      obstacle.type === 'sand' ? 0xFFFF00 : 0xFF0000,
      obstacle.type
    );
  }
}


function addObstacles(courseNumber, courseSize) {
  const numObstacles = Math.min(courseNumber + 1, 5);
  
  // Create array to store obstacle positions
  window.obstaclePositions = [];
  
  for (let i = 0; i < numObstacles; i++) {
    // Determine obstacle type based on index and course
    const obstacleType = (i + courseNumber) % 3;
    
    // Calculate a position that's not too close to the tee or hole
    let x, z;
    let validPosition = false;
    
    // IMPROVED ALGORITHM: Create a clear path down the center
    while (!validPosition) {
      // Modified to avoid center line - create a path in the middle
      const centerLineWidth = 1.5; // Width of the clear path
      let offsetX;
      
      // Determine which side of the course to place obstacle
      if (Math.random() > 0.5) {
        // Right side
        offsetX = centerLineWidth/2 + Math.random() * ((courseSize.width/2) - centerLineWidth/2 - 0.5);
      } else {
        // Left side
        offsetX = -centerLineWidth/2 - Math.random() * ((courseSize.width/2) - centerLineWidth/2 - 0.5);
      }
      
      x = offsetX;
      z = (Math.random() - 0.5) * (courseSize.length - 2);
      
      // Check distance from tee and hole
      const distToTee = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (-courseSize.length/2 + 1), 2));
      const distToHole = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (courseSize.length/2 - 1), 2));
      
      if (distToTee > 1.5 && distToHole > 1.5) {
        validPosition = true;
      }
    }
    
    // Store obstacle position for debugging
    window.obstaclePositions.push({
      x, z, 
      type: obstacleType === 0 ? 'sand' : obstacleType === 1 ? 'hill' : 'barrier'
    });
    
    // Create obstacle based on type
    switch (obstacleType) {
      case 0: // Sand trap
        createSandTrap(x, z, 0.6 + Math.random() * 0.4);
        break;
      case 1: // Small hill
        createHill(x, z, 0.3 + Math.random() * 0.2);
        break;
      case 2: // Barrier
        createBarrier(x, z, 0.8 + Math.random() * 0.6);
        break;
    }
  }
  
  // Add debug visualization of obstacles
  console.log(`Obstacle ${i}: x=${x}, z=${z}, type=${obstacleType === 0 ? 'sand' : obstacleType === 1 ? 'hill' : 'barrier'}`);
  addObstacleDebugger();
}

function addDebugToggleButton() {
  const debugButton = document.createElement('button');
  debugButton.textContent = 'Toggle Debug View';
  debugButton.style.position = 'absolute';
  debugButton.style.bottom = '120px';
  debugButton.style.left = '20px';
  debugButton.style.padding = '8px 12px';
  debugButton.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
  debugButton.style.color = 'white';
  debugButton.style.border = 'none';
  debugButton.style.borderRadius = '5px';
  debugButton.style.cursor = 'pointer';
  
  debugButton.addEventListener('click', function() {
    if (window.debugObstacles) {
      window.debugObstacles.visible = !window.debugObstacles.visible;
      debugButton.style.backgroundColor = window.debugObstacles.visible ? 
        'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
    }
  });
  
  document.body.appendChild(debugButton);
}

// Simplified Perlin Noise function for terrain generation
function simplex(x, y) {
  // Reduced amplitude of the terrain variations
  return (Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.0 + // Reduced from 2.0
         Math.sin(x * 0.4 + 0.5) * Math.cos(y * 0.3) * 0.4); // Reduced from 0.8
}

// Create a heightfield shape from a THREE.js geometry
function createHeightfieldFromGeometry(geometry, courseSize) {
  const vertices = geometry.attributes.position.array;
  const elementSize = 0.25; // Size of each grid element
  
  // Calculate grid dimensions
  const nx = Math.ceil(courseSize.width / elementSize) + 1;
  const ny = Math.ceil(courseSize.length / elementSize) + 1;
  
  // Create heightfield data
  const data = [];
  for (let i = 0; i < ny; i++) {
    const row = [];
    for (let j = 0; j < nx; j++) {
      // Sample height from the geometry
      const x = (j / (nx - 1)) * courseSize.width - courseSize.width / 2;
      const z = (i / (ny - 1)) * courseSize.length - courseSize.length / 2;
      
      // Find closest vertex in the geometry
      let closestDist = Infinity;
      let height = 0;
      
      for (let k = 0; k < vertices.length; k += 3) {
        const vx = vertices[k];
        const vy = vertices[k + 1]; // Height
        const vz = vertices[k + 2];
        
        const dist = Math.sqrt(Math.pow(vx - x, 2) + Math.pow(vz - z, 2));
        if (dist < closestDist) {
          closestDist = dist;
          height = vy;
        }
      }
      
      // Ensure a minimum height to prevent falling through
      height = Math.max(height, -0.1);
      row.push(height);
    }
    data.push(row);
  }
  
  // Create the heightfield shape
  const heightfieldShape = new CANNON.Heightfield(data, {
    elementSize: elementSize
  });
  
  // Position the heightfield
  heightfieldShape.offset = new CANNON.Vec3(
    -courseSize.width / 2 + elementSize * (nx - 1) / 2,
    0,
    -courseSize.length / 2 + elementSize * (ny - 1) / 2
  );
  
  return heightfieldShape;
}

// Contact detection - add this after the ball is created
function setupContactDetection() {
  world.addEventListener('beginContact', function(event) {
    const bodyA = event.bodyA;
    const bodyB = event.bodyB;
    
    // Check for safety floor contacts (existing code)
    if ((bodyA === window.ballBody && bodyB.isSafetyFloor) || 
        (bodyB === window.ballBody && bodyA.isSafetyFloor)) {
      
      if (window.ballBody.velocity.y < -5) {
        console.log("Ball hit safety floor with high velocity");
        window.ballBody.velocity.y = Math.abs(window.ballBody.velocity.y) * 0.5;
        
        if (window.ballBody.position.y < -10) {
          resetBall();
        }
      }
    }
    
    // Check for hole trigger contact
    if ((bodyA === window.ballBody && bodyB.isHoleTrigger) || 
        (bodyB === window.ballBody && bodyA.isHoleTrigger)) {
      
      console.log("Ball contacted hole physics");
      
      // Only trigger if ball is moving slowly enough and close to center
      const velocity = window.ballBody.velocity;
      const horizontalSpeed = Math.sqrt(velocity.x*velocity.x + velocity.z*velocity.z);
      
      const ballPos = window.ballBody.position;
      const dx = ballPos.x - window.holeCenterX;
      const dz = ballPos.z - window.holeCenterZ;
      const distanceToCenter = Math.sqrt(dx*dx + dz*dz);
      
      // More forgiving conditions on actual collision
      if (horizontalSpeed < 2.0 && distanceToCenter < window.holeRadius * 1.2 && !window.holeInProgress && !courseCompleted) {
        console.log("Ball in hole detected via contact!");
        startHoleAnimation();
      }
    }
  });
}
// Create the hole (cup)
// Create the hole (cup)
function createHole(x, z) {
  // Visual representation of the hole
  const holeRadius = 0.15;
  const holeDepth = 0.1;
  
  // Create hole (black circle)
  const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 32);
  const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
  holeMesh.position.set(x, 0.01, z); // Slightly above ground to avoid z-fighting
  holeMesh.receiveShadow = true;
  scene.add(holeMesh);
  
  // Create flag pole
  const poleGeometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 8);
  const poleMesh = new THREE.Mesh(poleGeometry, poleMatrial);
  poleMesh.position.set(x, 0.5, z);
  poleMesh.castShadow = true;
  scene.add(poleMesh);
  
  // Create flag
  const flagGeometry = new THREE.PlaneGeometry(0.3, 0.2);
  const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
  flagMesh.position.set(x + 0.15, 0.8, z);
  flagMesh.castShadow = true;
  scene.add(flagMesh);
  
  // Create a subtle hole gradient around the hole
  const holeGradientGeometry = new THREE.RingGeometry(holeRadius, holeRadius * 2, 32);
  const holeGradientMaterial = new THREE.MeshBasicMaterial({
    color: 0x005500,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const holeGradientMesh = new THREE.Mesh(holeGradientGeometry, holeGradientMaterial);
  holeGradientMesh.rotation.x = -Math.PI / 2;
  holeGradientMesh.position.set(x, 0.011, z);
  scene.add(holeGradientMesh);
  
  // Physics trigger for hole
  const holeBody = new CANNON.Body({
    mass: 0,
    collisionResponse: false,
    type: CANNON.Body.STATIC
  });
  
  // Create a slightly larger cylinder shape for easier detection
  const triggerRadius = holeRadius * 1.5;
  const holeShape = new CANNON.Cylinder(triggerRadius, triggerRadius, holeDepth * 2, 8);
  holeBody.addShape(holeShape);
  holeBody.position.set(x, 0, z);
  holeBody.isHoleTrigger = true;
  world.addBody(holeBody);
  
  // Store references for collision detection
  window.holeMesh = holeMesh;
  window.holeBody = holeBody;
  window.holeRadius = holeRadius;
  window.holeCenterX = x;
  window.holeCenterZ = z;
  window.holeInProgress = false;
  
  console.log("Hole created at:", {x, z});
}

// Replace checkBallInHole with this simpler version
function checkBallInHole() {
  if (courseCompleted || !window.ballBody || window.holeCenterX === undefined || window.holeCenterZ === undefined) return;
  
  // If hole animation is already in progress, don't check again
  if (window.holeInProgress) return;
  
  const ballPos = window.ballBody.position;
  const holeX = window.holeCenterX;
  const holeZ = window.holeCenterZ;
  
  // Calculate distance from ball to hole center (horizontal only)
  const dx = ballPos.x - holeX;
  const dz = ballPos.z - holeZ;
  const distance = Math.sqrt(dx*dx + dz*dz);
  
  // Check if ball is close enough to hole center and moving slowly
  const velocity = window.ballBody.velocity;
  const horizontalSpeed = Math.sqrt(velocity.x*velocity.x + velocity.z*velocity.z);
  
  // Apply gentle attraction when ball is near the hole
  if (distance < window.holeRadius * 4 && horizontalSpeed < 2 && ballPos.y < 0.2) {
    // Calculate force direction toward hole
    const forceFactor = 0.01 * (1 - distance / (window.holeRadius * 4));
    const forceX = -dx * forceFactor;
    const forceZ = -dz * forceFactor;
    
    // Apply the force
    window.ballBody.applyForce(
      new CANNON.Vec3(forceX, 0, forceZ),
      window.ballBody.position
    );
  }
  
  // Ball is in hole if it's very close to the center and moving slowly
  if (distance < window.holeRadius * 1.2 && horizontalSpeed < 1.0 && ballPos.y < 0.15) {
    console.log("Ball in hole! Distance:", distance, "Speed:", horizontalSpeed);
    startHoleAnimation();
  }
}



// Animate the ball dropping into the hole
function startHoleAnimation() {
  if (window.holeInProgress || courseCompleted) return;
  window.holeInProgress = true;
  
  console.log("Ball in hole! Starting animation");
  
  // Disable physics while animation is happening
  window.ballBody.type = CANNON.Body.KINEMATIC;
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  
  // Get starting position
  const startPos = window.ballBody.position.clone();
  const targetY = -0.3; // Target y position (below ground)
  const duration = 1000; // Animation duration in ms
  const startTime = Date.now();
  
  // Create a satisfying "ball falling in hole" sound
  try {
    // Create an audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create oscillator for the "plop" sound
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    // Connect everything
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    // Set properties
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    
    // Play the sound
    osc.start();
    osc.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error("Error playing hole sound:", error);
  }
  
  // Animation function
  function animateBallSink() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-in function for natural motion
    const easedProgress = progress * progress;
    
    // Drop and shrink the ball
    if (window.ballBody) {
      // Move down
      window.ballBody.position.y = startPos.y - easedProgress * (startPos.y - targetY);
      
      // Shrink ball mesh slightly as it "disappears" into the hole
      if (window.ballMesh) {
        const scale = 1 - easedProgress * 0.3;
        window.ballMesh.scale.set(scale, scale, scale);
      }
      
      // Rotate slightly during drop
      window.ballBody.quaternion.setFromAxisAngle(
        new CANNON.Vec3(1, 0, 0), 
        progress * Math.PI / 2
      );
    }
    
    if (progress < 1) {
      requestAnimationFrame(animateBallSink);
    } else {
      // Animation complete - finish the hole
      setTimeout(() => holeComplete(), 500);
    }
  }
  
  // Start the animation
  animateBallSink();
}

// Play a satisfying sound when the ball drops in the hole
function playSinkSound() {
  // Create an audio context
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create oscillator for the "plop" sound
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  // Connect everything
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  // Set properties
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
  
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
  
  // Play the sound
  osc.start();
  osc.stop(audioContext.currentTime + 0.5);
}

// Debug button to show hole physics
function addHoleDebugButton() {
  // Skip if already exists
  if (document.getElementById('holeDebugButton')) return;
  
  const button = document.createElement('button');
  button.id = 'holeDebugButton';
  button.textContent = 'Test Hole Drop';
  button.style.position = 'absolute';
  button.style.bottom = '280px';
  button.style.left = '20px';
  button.style.padding = '8px 12px';
  button.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '5px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '1000';
  
  button.addEventListener('click', function() {
    if (window.ballBody && window.holeCenterX !== undefined && window.holeCenterZ !== undefined) {
      // Move the ball right to the hole for testing
      window.ballBody.position.set(window.holeCenterX, 0.1, window.holeCenterZ);
      window.ballBody.velocity.set(0, 0, 0);
      window.ballBody.angularVelocity.set(0, 0, 0);
      window.ballBody.wakeUp();
    }
  });
  
  document.body.appendChild(button);
}

// Create tee marker
function createTeeMarker(x, z) {
    // Make the tee marker more visible
    const teeGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
    const teeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      emissive: 0x333333
    });
    const teeMesh = new THREE.Mesh(teeGeometry, teeMaterial);
    
    // Position it higher to be more visible
    teeMesh.position.set(x, 0.05, z);
    teeMesh.receiveShadow = true;
    scene.add(teeMesh);
    
    console.log("Created tee marker at position:", {x, z});
    
    // Also add a visual indicator for the tee area
    const teeAreaGeometry = new THREE.CircleGeometry(0.4, 32);
    const teeAreaMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x90EE90, // Light green
      transparent: true,
      opacity: 0.7
    });
    const teeAreaMesh = new THREE.Mesh(teeAreaGeometry, teeAreaMaterial);
    teeAreaMesh.rotation.x = -Math.PI / 2; // Flat on ground
    teeAreaMesh.position.set(x, 0.01, z);
    scene.add(teeAreaMesh);
    
    window.teePosition = { x, z };
  }

// Create ball with improved physics for a golf ball
/* function createBall(x, y, z) {
    // Visual representation remains the same
    const ballRadius = 0.08;
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    
    const ballMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      emissive: 0xAAAAAA,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.2
    });
    
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;
    
    // Add highlight for visibility
    const highlightGeometry = new THREE.SphereGeometry(ballRadius * 0.2, 16, 16);
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.7
    });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.position.set(ballRadius * 0.4, ballRadius * 0.4, ballRadius * 0.4);
    ballMesh.add(highlight);
    
    scene.add(ballMesh);
    
    console.log("Creating ball at position:", {x, y, z});
    
    // Create ball physics material
    const ballPhysMaterial = new CANNON.Material('ballMaterial');
    
    // Physics body with improved parameters
    const ballBody = new CANNON.Body({ 
      mass: 0.15,
      linearDamping: 0.7,
      angularDamping: 0.8,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 1,
      material: ballPhysMaterial
    });
    
    ballBody.addShape(new CANNON.Sphere(ballRadius));
    
    // KEY CHANGE: Position the ball much higher above the ground (3.0 units instead of 1.0)
    ballBody.position.set(x, y + 3.0, z);
    
    world.addBody(ballBody);
    
    // Explicitly set the mesh position to match the physics body position
    ballMesh.position.copy(ballBody.position);
    
    // Create contact materials
    const groundMaterial = new CANNON.Material('groundMaterial');
    const ballGroundContact = new CANNON.ContactMaterial(
      ballPhysMaterial,
      groundMaterial,
      {
        friction: 0.3,
        restitution: 0.2,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3
      }
    );
    world.addContactMaterial(ballGroundContact);
    
    // Add debug sphere to visualize physics position
    const debugGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
    const debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
    scene.add(debugSphere);
    
    // Store in window to update in animation loop
    window.debugSphere = debugSphere;
    
    // Store references
    window.ballMesh = ballMesh;
    window.ballBody = ballBody;
    window.ballRadius = ballRadius;
    
    console.log("Ball created with physics position:", ballBody.position);
  } */

    function createBall(x, y, z) {
      const ballRadius = 0.08;
      const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
      
      const ballMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF,
        emissive: 0xAAAAAA,
        emissiveIntensity: 0.2,
        roughness: 0.3,
        metalness: 0.2
      });
      
      const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
      ballMesh.castShadow = true;
      ballMesh.receiveShadow = true;
      
      scene.add(ballMesh);
      
      // Physics body with REDUCED damping for better movement
      const ballBody = new CANNON.Body({ 
        mass: 0.15,
        linearDamping: 0.2,  // Reduced from 0.7
        angularDamping: 0.3, // Reduced from 0.8
        allowSleep: true,
        sleepSpeedLimit: 0.05,
        sleepTimeLimit: 1
      });
      
      ballBody.addShape(new CANNON.Sphere(ballRadius));
      ballBody.position.set(x, y + 0.5, z);  // Start just above the ground
      world.addBody(ballBody);
      
      // Add debug sphere to visualize physics position
      const debugGeometry = new THREE.SphereGeometry(0.02, 16, 16);
      const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
      const debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
      scene.add(debugSphere);
      
      // Store references
      window.ballMesh = ballMesh;
      window.ballBody = ballBody;
      window.ballRadius = ballRadius;
      window.debugSphere = debugSphere;
  }


  function addSimpleObstacles(courseNumber, courseSize) {
    const numObstacles = Math.min(courseNumber + 1, 3); // Reduced number of obstacles
    
    for (let i = 0; i < numObstacles; i++) {
      // Position obstacles on sides, away from the center path
      const x = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2);
      const z = -courseSize.length/4 + (Math.random() * courseSize.length/2);
      
      // Only use simple barriers
      createSimpleBarrier(x, z, 0.8);
    }
  }
  
  // Create a simple barrier
  function createSimpleBarrier(x, z, width) {
    const height = 0.2;
    const depth = 0.1;
    
    // Determine orientation
    const isVertical = Math.random() > 0.5;
    const barrierGeometry = new THREE.BoxGeometry(
      isVertical ? depth : width, 
      height, 
      isVertical ? width : depth
    );
    
    const barrierMesh = new THREE.Mesh(barrierGeometry, roughMaterial);
    barrierMesh.position.set(x, height/2, z);
    barrierMesh.castShadow = true;
    barrierMesh.receiveShadow = true;
    scene.add(barrierMesh);
    
    // Physics body
    const barrierBody = new CANNON.Body({ mass: 0 });
    barrierBody.addShape(new CANNON.Box(new CANNON.Vec3(
      (isVertical ? depth : width) / 2,
      height / 2,
      (isVertical ? width : depth) / 2
    )));
    barrierBody.position.set(x, height/2, z);
    world.addBody(barrierBody);
  }

  function addFlatGround(courseSize) {
    // Create a physics-only plane at y=0 as a reliable collision surface
    const groundBody = new CANNON.Body({ mass: 0 });
    const groundShape = new CANNON.Plane();
    groundBody.addShape(groundShape);
    
    // Position at exactly y=0, facing up
    groundBody.position.set(0, 0, 0);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    
    // Add material
    groundBody.material = new CANNON.Material('flatGroundMaterial');
    
    world.addBody(groundBody);
    console.log("Added flat ground plane at y=0");
    
    // Create contact material if ball exists
    if (window.ballBody && window.ballBody.material) {
      const ballFlatGroundContact = new CANNON.ContactMaterial(
        window.ballBody.material,
        groundBody.material,
        {
          friction: 0.3,
          restitution: 0.2,
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3
        }
      );
      world.addContactMaterial(ballFlatGroundContact);
    }
  }

// Create multiple safety floors at different heights
function createSafetyFloor(courseSize) {
  // Create multiple safety floors at different heights to catch the ball
  const createFloorAtHeight = (height) => {
    const floorGeometry = new THREE.PlaneGeometry(courseSize.width * 3, courseSize.length * 3);
    const floorMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x355E3B, 
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = height;
    scene.add(floorMesh);
    
    // Physics body for the floor
    const floorBody = new CANNON.Body({ mass: 0 });
    const floorShape = new CANNON.Plane();
    floorBody.addShape(floorShape);
    floorBody.position.set(0, height, 0);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    
    // Add special properties to identify safety floors
    floorBody.isSafetyFloor = true;
    
    // Create floor material
    floorBody.material = new CANNON.Material('safetyFloorMaterial');
    world.addBody(floorBody);
    
    // Create contact material for the ball and safety floor
    if (window.ballBody && window.ballBody.material) {
      const ballFloorContact = new CANNON.ContactMaterial(
        window.ballBody.material,
        floorBody.material,
        {
          friction: 0.3,
          restitution: 0.5,
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3
        }
      );
      world.addContactMaterial(ballFloorContact);
    }
  };
  
  // Create safety floors at multiple heights
  createFloorAtHeight(-0.5);  // Just below the main terrain
  createFloorAtHeight(-2);    // Further down
  createFloorAtHeight(-5);    // Even further
}

// Improved ball reset detection
function checkBallReset() {
  // Make sure ball exists
  if (!window.ballBody) return;
  
  const pos = window.ballBody.position;
  const vel = window.ballBody.velocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  
  // Only reset if the ball has clearly fallen through the terrain
  // or is very far out of bounds
  if (pos.y < -20 || pos.x < -50 || pos.x > 50 || pos.z < -50 || pos.z > 50) {
    console.log("Ball completely out of bounds, resetting:", pos);
    resetBall();
    
    if (strokeCount > 0) {
      strokeCount++;
      updateStrokeDisplay();
      puttFeedback.textContent = 'Out of bounds! +1 stroke penalty';
    }
  } 
  // If the ball is just slightly below the terrain, push it back up
  else if (pos.y < -2 && pos.y > -10) {
    console.log("Ball slightly below terrain, pushing back up");
    window.ballBody.position.y = 0.5;
    window.ballBody.velocity.y = Math.abs(window.ballBody.velocity.y); // Reverse vertical velocity
  }
  // Check if the ball has stopped
  else if (speed < 0.1 && ballInMotion && Date.now() - lastPuttTime > 2000) {
    ballInMotion = false;
    puttFeedback.textContent = 'Ready for next shot';
    
    // If the ball is slightly embedded in the ground, lift it a bit
    if (pos.y < 0.1) {
      window.ballBody.position.y = Math.max(pos.y, 0.05);
    }
  }
}

// Improve the createBoundaries function for stronger collision detection
function createBoundaries(courseSize) {
  const boundaryHeight = 0.5;
  const boundaryThickness = 0.4;
  
  // Create a boundary helper function
  function createBoundary(x, y, z, width, depth) {
    const boundaryGeom = new THREE.BoxGeometry(width, boundaryHeight, depth);
    const boundaryMesh = new THREE.Mesh(boundaryGeom, roughMaterial);
    boundaryMesh.position.set(x, y + boundaryHeight/2, z);
    boundaryMesh.castShadow = true;
    boundaryMesh.receiveShadow = true;
    scene.add(boundaryMesh);
    
    // Physics body with material properties
    const boundaryBody = new CANNON.Body({ 
      mass: 0,
      material: new CANNON.Material('boundaryMaterial') 
    });
    
    boundaryBody.addShape(new CANNON.Box(new CANNON.Vec3(width/2, boundaryHeight/2, depth/2)));
    boundaryBody.position.set(x, y + boundaryHeight/2, z);
    world.addBody(boundaryBody);
    
    // Create contact material between ball and boundary
    if (window.ballBody && window.ballBody.material) {
      const ballBoundaryContact = new CANNON.ContactMaterial(
        window.ballBody.material,
        boundaryBody.material,
        {
          friction: 0.3,
          restitution: 0.5,
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3
        }
      );
      world.addContactMaterial(ballBoundaryContact);
    }
  }
  
  // Create the boundaries as before
  const extraPadding = 0.1;
  
  // Left boundary
  createBoundary(-courseSize.width/2 - boundaryThickness/2, 0, 0, 
                boundaryThickness, courseSize.length + boundaryThickness*2 + extraPadding);
  
  // Right boundary
  createBoundary(courseSize.width/2 + boundaryThickness/2, 0, 0, 
                boundaryThickness, courseSize.length + boundaryThickness*2 + extraPadding);
  
  // Top boundary
  createBoundary(0, 0, courseSize.length/2 + boundaryThickness/2, 
                courseSize.width + boundaryThickness*2 + extraPadding, boundaryThickness);
  
  // Bottom boundary
  createBoundary(0, 0, -courseSize.length/2 - boundaryThickness/2, 
                courseSize.width + boundaryThickness*2 + extraPadding, boundaryThickness);
  
  // Create invisible ceiling to prevent ball from jumping too high - INCREASED HEIGHT
  const ceilingBody = new CANNON.Body({ mass: 0 });
  const ceilingShape = new CANNON.Plane();
  ceilingBody.addShape(ceilingShape);
  ceilingBody.position.set(0, 10, 0); // Increased from 3 to 10 units
  ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI); // Flip to face down
  world.addBody(ceilingBody);
}

// Add obstacles based on course number
function addObstacles(courseNumber, courseSize) {
  const numObstacles = Math.min(courseNumber + 1, 5);
  
  for (let i = 0; i < numObstacles; i++) {
    // Determine obstacle type based on index and course
    const obstacleType = (i + courseNumber) % 3;
    
    // Calculate a position that's not too close to the tee or hole
    let x, z;
    let validPosition = false;
    
    while (!validPosition) {
      x = (Math.random() - 0.5) * (courseSize.width - 1);
      z = (Math.random() - 0.5) * (courseSize.length - 2);
      
      // Check distance from tee and hole
      const distToTee = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (-courseSize.length/2 + 1), 2));
      const distToHole = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (courseSize.length/2 - 1), 2));
      
      if (distToTee > 1.5 && distToHole > 1.5) {
        validPosition = true;
      }
    }
    
    // Create obstacle based on type
    switch (obstacleType) {
      case 0: // Sand trap
        createSandTrap(x, z, 0.6 + Math.random() * 0.4);
        break;
      case 1: // Small hill
        createHill(x, z, 0.3 + Math.random() * 0.2);
        break;
      case 2: // Barrier
        createBarrier(x, z, 0.8 + Math.random() * 0.6);
        break;
    }
  }
}

function isInSandTrap(ballBody, sandX, sandZ, sandSize) {
    const pos = ballBody.position;
    const dx = pos.x - sandX;
    const dz = pos.z - sandZ;
    const distanceSquared = dx * dx + dz * dz;
    
    // Check if ball's center is within the sand trap radius
    return distanceSquared < sandSize * sandSize;
  }
  
  // Apply drag force to ball when in sand trap
  function applyDragForce(ballBody) {
    const velocity = ballBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    
    if (speed > 0.1) {
      // Calculate drag force (opposite to velocity direction)
      const dragFactor = 0.15; // Adjust as needed
      const dragForce = new CANNON.Vec3(
        -velocity.x * dragFactor,
        0, // No vertical drag
        -velocity.z * dragFactor
      );
      
      // Apply the drag force at the center of the ball
      ballBody.applyForce(dragForce, ballBody.position);
    }
  }

// Create a sand trap
function createSandTrap(x, z, size) {
    // Visual representation - keep this the same
    const sandGeometry = new THREE.CylinderGeometry(size, size, 0.05, 32);
    const sandMesh = new THREE.Mesh(sandGeometry, sandMaterial);
    sandMesh.position.set(x, 0.025, z);
    sandMesh.receiveShadow = true;
    scene.add(sandMesh);
    
    // Create a physics material for the sand
    const sandPhysicsMaterial = new CANNON.Material('sandMaterial');
    
    // CHANGE: Instead of a solid cylinder, create a trigger zone
    const sandBody = new CANNON.Body({
      mass: 0,
      collisionResponse: true, // Allow collision response
      type: CANNON.Body.STATIC,
      material: sandPhysicsMaterial
    });
    
    // Use a cylinder shape but with very small height to act as a zone
    const sandShape = new CANNON.Cylinder(size, size, 0.01, 16);
    sandBody.addShape(sandShape);
    sandBody.position.set(x, 0.005, z); // Place it just above ground level
    
    // Add to physics world
    world.addBody(sandBody);
    
    // Mark this body as a sand trap for collision detection
    sandBody.isSandTrap = true;
    
    // Create contact material between ball and sand with high friction but allowing passage
    if (window.ballBody && window.ballBody.material) {
      const ballSandContactMaterial = new CANNON.ContactMaterial(
        window.ballBody.material,
        sandPhysicsMaterial,
        {
          friction: 0.9,       // High friction to slow the ball
          restitution: 0.1,    // Low bounce
          contactEquationStiffness: 1e6,  // Lower stiffness than normal ground
          contactEquationRelaxation: 5    // More relaxation for smoother interaction
        }
      );
      world.addContactMaterial(ballSandContactMaterial);
    }
    
    // Add event listener to apply drag force to ball when in sand trap
    world.addEventListener('postStep', function() {
      if (window.ballBody && isInSandTrap(window.ballBody, x, z, size)) {
        applyDragForce(window.ballBody);
      }
    });
  }

// Create a hill obstacle
function createHill(x, z, height) {
  // Visual - we'll use a hemisphere for the hill
  const hillGeometry = new THREE.SphereGeometry(height * 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillMesh = new THREE.Mesh(hillGeometry, greenMaterial);
  hillMesh.position.set(x, 0, z);
  hillMesh.receiveShadow = true;
  hillMesh.castShadow = true;
  scene.add(hillMesh);
  
  // Physics - use a sphere shape with a smoother collision response
  const hillBody = new CANNON.Body({ 
    mass: 0,
    material: new CANNON.Material('hillMaterial')
  });
  
  // Use a smaller collision shape than the visual one
  const hillShape = new CANNON.Sphere(height * 1.5); // Reduced from height * 2
  
  // Position the sphere so more of it is below the ground
  hillBody.addShape(hillShape);
  hillBody.position.set(x, -height * 0.7, z); // More embedded in ground (was -height)
  world.addBody(hillBody);
  
  // Create contact material that allows smoother rolling over the hill
  if (window.ballBody && window.ballBody.material) {
    const ballHillContact = new CANNON.ContactMaterial(
      window.ballBody.material,
      hillBody.material,
      {
        friction: 0.2,        // Lower friction for smoother rolling
        restitution: 0.3,     // Moderate bounce
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4
      }
    );
    world.addContactMaterial(ballHillContact);
  }
}

// Create a barrier (wall obstacle)
function createBarrier(x, z, width) {
  // Visual
  const height = 0.3;
  const depth = 0.1;
  
  // Determine orientation (random)
  const isVertical = Math.random() > 0.5;
  const barrierGeometry = new THREE.BoxGeometry(
    isVertical ? depth : width, 
    height, 
    isVertical ? width : depth
  );
  
  const barrierMesh = new THREE.Mesh(barrierGeometry, roughMaterial);
  barrierMesh.position.set(x, height/2, z);
  barrierMesh.castShadow = true;
  barrierMesh.receiveShadow = true;
  scene.add(barrierMesh);
  
  // Physics body
  const barrierBody = new CANNON.Body({ mass: 0 });
  barrierBody.addShape(new CANNON.Box(new CANNON.Vec3(
    (isVertical ? depth : width) / 2,
    height / 2,
    (isVertical ? width : depth) / 2
  )));
  barrierBody.position.set(x, height/2, z);
  world.addBody(barrierBody);
}

// Clear existing course elements
function clearCourse() {
  // Remove all meshes except the camera
  while(scene.children.length > 0) {
    const object = scene.children[0];
    if (object.type === 'PerspectiveCamera') {
      scene.remove(object);
      scene.add(object); // Re-add the camera
    } else {
      scene.remove(object);
    }
  }
  
  // Remove all physics bodies except the ball
  const bodiesToRemove = [];
  for (let i = 0; i < world.bodies.length; i++) {
    bodiesToRemove.push(world.bodies[i]);
  }
  
  for (let i = 0; i < bodiesToRemove.length; i++) {
    world.removeBody(bodiesToRemove[i]);
  }
  
  // Re-add lights
  scene.add(ambientLight);
  scene.add(directionalLight);
}

// Update stroke counter display
function updateStrokeDisplay() {
  const strokeFeedback = document.getElementById('strokeFeedback') || createStrokeFeedback();
  strokeFeedback.textContent = `Strokes: ${strokeCount} / Par: ${par}`;
}

// Create stroke feedback element if it doesn't exist
function createStrokeFeedback() {
  const strokeFeedback = document.createElement('div');
  strokeFeedback.id = 'strokeFeedback';
  strokeFeedback.style.position = 'absolute';
  strokeFeedback.style.top = '50px';
  strokeFeedback.style.right = '20px';
  strokeFeedback.style.color = 'white';
  strokeFeedback.style.fontSize = '18px';
  strokeFeedback.style.fontFamily = 'Arial, sans-serif';
  strokeFeedback.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  strokeFeedback.style.padding = '10px';
  strokeFeedback.style.borderRadius = '5px';
  document.body.appendChild(strokeFeedback);
  return strokeFeedback;
}

// Update course info display
function updateCourseInfo(current, total, par) {
  const courseInfo = document.getElementById('courseInfo') || createCourseInfo();
  courseInfo.textContent = `Hole ${current} of ${total} - Par ${par}`;
}

// Create course info element if it doesn't exist
function createCourseInfo() {
  const courseInfo = document.createElement('div');
  courseInfo.id = 'courseInfo';
  courseInfo.style.position = 'absolute';
  courseInfo.style.top = '10px';
  courseInfo.style.left = '20px';
  courseInfo.style.color = 'white';
  courseInfo.style.fontSize = '18px';
  courseInfo.style.fontFamily = 'Arial, sans-serif';
  courseInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  courseInfo.style.padding = '10px';
  courseInfo.style.borderRadius = '5px';
  document.body.appendChild(courseInfo);
  return courseInfo;
}

// Show score for the current hole
function showHoleComplete(strokesTaken, parValue) {
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
  
  const scorePopup = document.createElement('div');
  scorePopup.style.position = 'absolute';
  scorePopup.style.top = '50%';
  scorePopup.style.left = '50%';
  scorePopup.style.transform = 'translate(-50%, -50%)';
  scorePopup.style.color = scoreColor;
  scorePopup.style.fontSize = '36px';
  scorePopup.style.fontWeight = 'bold';
  scorePopup.style.fontFamily = 'Arial, sans-serif';
  scorePopup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  scorePopup.style.padding = '20px 40px';
  scorePopup.style.borderRadius = '10px';
  scorePopup.style.textAlign = 'center';
  scorePopup.style.zIndex = '1000';
  
  scorePopup.innerHTML = `
    <div>Hole Complete!</div>
    <div style="font-size: 48px; margin: 10px 0;">${scoreName}</div>
    <div>Strokes: ${strokesTaken} / Par: ${parValue}</div>
    <div style="font-size: 20px; margin-top: 20px;">Next hole loading...</div>
  `;
  
  document.body.appendChild(scorePopup);
  
  // Remove after a delay
  setTimeout(() => {
    document.body.removeChild(scorePopup);
  }, 3000);
}


// Handle hole completion
function holeComplete() {
  courseCompleted = true;
  
  // Show hole complete message
  showHoleComplete(strokeCount, par);
  
  // Add to total score
  totalScore += strokeCount;
  
  // Stop the ball
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  
  // Move to next course after a delay
  setTimeout(() => {
    currentCourse++;
    if (currentCourse < totalCourses) {
      createCourse(currentCourse);
    } else {
      showGameComplete();
    }
  }, 3000);
}

// Show game complete screen
function showGameComplete() {
  // Calculate final score (difference from par)
  const totalPar = 2 * (1 + totalCourses) / 2 * totalCourses; // Sum of pars for all courses
  const scoreVsPar = totalScore - totalPar;
  
  const gameComplete = document.createElement('div');
  gameComplete.style.position = 'absolute';
  gameComplete.style.top = '0';
  gameComplete.style.left = '0';
  gameComplete.style.width = '100%';
  gameComplete.style.height = '100%';
  gameComplete.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  gameComplete.style.color = 'white';
  gameComplete.style.display = 'flex';
  gameComplete.style.flexDirection = 'column';
  gameComplete.style.justifyContent = 'center';
  gameComplete.style.alignItems = 'center';
  gameComplete.style.fontFamily = 'Arial, sans-serif';
  gameComplete.style.fontSize = '24px';
  gameComplete.style.zIndex = '2000';
  
  gameComplete.innerHTML = `
    <h1 style="font-size: 48px; margin-bottom: 30px;">Game Complete!</h1>
    <div style="font-size: 36px; margin-bottom: 20px;">Final Score: ${scoreVsPar > 0 ? '+' + scoreVsPar : scoreVsPar}</div>
    <div style="margin-bottom: 10px;">Total Strokes: ${totalScore}</div>
    <div style="margin-bottom: 30px;">Course Par: ${totalPar}</div>
    <button id="restartButton" style="padding: 15px 30px; font-size: 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Play Again</button>
  `;
  
  document.body.appendChild(gameComplete);
  
  // Add restart button functionality
  document.getElementById('restartButton').addEventListener('click', () => {
    document.body.removeChild(gameComplete);
    
    // Reset game state
    currentCourse = 0;
    totalScore = 0;
    createCourse(currentCourse);
  });
}

// Direction indicator
let directionArrow;
function createDirectionIndicator() {
  // Remove any existing direction arrow
  if (directionArrow) {
    scene.remove(directionArrow);
    directionArrow = null;
  }
  
  // Create arrow components
  const arrowLength = 1;
  const arrowHeadSize = 0.2;
  
  // Create arrow body
  const bodyGeometry = new THREE.CylinderGeometry(0.02, 0.02, arrowLength, 8);
  bodyGeometry.rotateX(Math.PI / 2); // Make it point forward (z-axis)
  bodyGeometry.translate(0, 0, arrowLength/2); // Move center to base of arrow
  
  // Create arrow head
  const headGeometry = new THREE.ConeGeometry(arrowHeadSize, arrowHeadSize*1.5, 8);
  headGeometry.rotateX(Math.PI / 2); // Make it point forward
  headGeometry.translate(0, 0, arrowLength); // Position at end of body
  
  // Create simple arrow without BufferGeometryUtils dependency
  const arrowMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.7
  });
  
  try {
    // First try to create arrow with merged geometry if BufferGeometryUtils is available
    if (typeof THREE.BufferGeometryUtils !== 'undefined' && 
        typeof THREE.BufferGeometryUtils.mergeBufferGeometries === 'function') {
      
      const combinedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries([
        bodyGeometry, 
        headGeometry
      ]);
      
      directionArrow = new THREE.Mesh(combinedGeometry, arrowMaterial);
    } else {
      // If BufferGeometryUtils is not available, create a group
      directionArrow = new THREE.Group();
      
      const bodyMesh = new THREE.Mesh(bodyGeometry, arrowMaterial);
      const headMesh = new THREE.Mesh(headGeometry, arrowMaterial);
      
      directionArrow.add(bodyMesh);
      directionArrow.add(headMesh);
    }
    
    directionArrow.visible = false; // Initially hidden
    scene.add(directionArrow);
    
    console.log("Direction indicator created successfully");
  } catch (error) {
    console.error("Error creating direction indicator:", error);
    
    // Basic fallback arrow
    const basicArrowGeometry = new THREE.CylinderGeometry(0.02, 0.02, arrowLength, 8);
    basicArrowGeometry.rotateX(Math.PI / 2);
    directionArrow = new THREE.Mesh(basicArrowGeometry, arrowMaterial);
    directionArrow.visible = false;
    scene.add(directionArrow);
  }
}

// Add better camera info display
function addCameraInfo() {
  // Remove any existing camera info
  const existingInfo = document.getElementById('cameraInfo');
  if (existingInfo && existingInfo.parentNode) {
    existingInfo.parentNode.removeChild(existingInfo);
  }

  const cameraInfo = document.createElement('div');
  cameraInfo.id = 'cameraInfo';
  cameraInfo.style.position = 'absolute';
  cameraInfo.style.bottom = '20px';
  cameraInfo.style.left = '50%';
  cameraInfo.style.transform = 'translateX(-50%)';
  cameraInfo.style.color = 'white';
  cameraInfo.style.fontSize = '14px';
  cameraInfo.style.fontFamily = 'Arial, sans-serif';
  cameraInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  cameraInfo.style.padding = '8px 16px';
  cameraInfo.style.borderRadius = '5px';
  cameraInfo.style.textAlign = 'center';
  cameraInfo.style.zIndex = '1000';
  cameraInfo.innerHTML = `
    <div>Camera Controls:</div>
    <div>Mouse: Click & Drag to rotate | Scroll to zoom | Right-click & drag to pan</div>
  `;
  
  document.body.appendChild(cameraInfo);
  
  // Keep the info visible for 30 seconds before fading (up from 10)
  setTimeout(() => {
    cameraInfo.style.opacity = '0';
    cameraInfo.style.transition = 'opacity 2s';
    
    // Remove after fade
    setTimeout(() => {
      if (cameraInfo.parentNode) {
        cameraInfo.parentNode.removeChild(cameraInfo);
      }
    }, 2000);
  }, 30000);
  
  // Also add a permanent camera help button
  addCameraHelpButton();
}

// Add a permanent help button for camera controls
function addCameraHelpButton() {
  // Check if button already exists
  if (document.getElementById('cameraHelpButton')) return;
  
  const helpButton = document.createElement('button');
  helpButton.id = 'cameraHelpButton';
  helpButton.textContent = '?';
  helpButton.style.position = 'absolute';
  helpButton.style.bottom = '10px';
  helpButton.style.right = '10px';
  helpButton.style.width = '30px';
  helpButton.style.height = '30px';
  helpButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  helpButton.style.color = 'white';
  helpButton.style.border = 'none';
  helpButton.style.borderRadius = '50%';
  helpButton.style.fontSize = '16px';
  helpButton.style.fontWeight = 'bold';
  helpButton.style.cursor = 'pointer';
  helpButton.style.zIndex = '1000';
  
  helpButton.addEventListener('click', function() {
    // Show camera info when help button is clicked
    addCameraInfo();
  });
  
  document.body.appendChild(helpButton);
}

// Update camera in the animation loop
function updateCamera() {
  // Only follow if mode is enabled and ball exists
  if (window.followBallMode && window.ballBody && window.controls) {
    // Set the controls target to the ball position
    window.controls.target.copy(window.ballBody.position);
    
    // Update controls after changing target
    window.controls.update();
  }
}

let lastDirectionData = null;
function updateDirectionArrow(directionData) {
  // Make sure direction arrow exists
  if (!directionArrow) {
    createDirectionIndicator();
  }
  
  // Only proceed if the arrow exists and the ball is not in motion
  if (!directionArrow || ballInMotion || courseCompleted) return;
  
  // Store this data for use when actually putting
  lastDirectionData = directionData;
  
  if (!window.ballBody) return;
  
  // Position arrow at the ball's current position
  const ballPos = window.ballBody.position;
  directionArrow.position.set(ballPos.x, 0.1, ballPos.z); // Slightly above ground
  
  // IMPORTANT CHANGE: Use raw orientation data from controller
  // This allows aiming in any direction regardless of ball position
  const angle = Math.atan2(directionData.x, directionData.z);
  directionArrow.rotation.y = angle;
  
  // Scale arrow based on power
  const magnitude = Math.sqrt(
    directionData.x * directionData.x + 
    directionData.y * directionData.y + 
    directionData.z * directionData.z
  );
  
  // Map power to arrow length (scale)
  const minScale = 0.5;
  const maxScale = 2.0;
  const powerScale = minScale + (Math.min(magnitude / 30, 1) * (maxScale - minScale)); // Adjusted to match new power settings
  
  // Apply scale
  if (directionArrow instanceof THREE.Group) {
    directionArrow.scale.set(1, 1, powerScale);
  } else {
    directionArrow.scale.z = powerScale;
  }
  
  // Make arrow visible with higher opacity
  directionArrow.visible = true;
  if (directionArrow.material) {
    directionArrow.material.opacity = 0.9;
  } else if (directionArrow.children) {
    directionArrow.children.forEach(child => {
      if (child.material) {
        child.material.opacity = 0.9;
      }
    });
  }
}
// Socket.io connection
const socket = io();
const connectionStatus = document.getElementById('connectionStatus');
const roomIdElement = document.getElementById('roomId');
const controllerLinkElement = document.getElementById('controllerLink');
const qrCodeContainer = document.getElementById('qrCodeContainer');

// UI elements
document.getElementById('closeInfo').addEventListener('click', function() {
  document.getElementById('gameInfo').classList.add('hidden');
});

// Visual feedback element for putting
const puttFeedback = document.createElement('div');
puttFeedback.style.position = 'absolute';
puttFeedback.style.bottom = '50px';
puttFeedback.style.left = '20px';
puttFeedback.style.color = 'white';
puttFeedback.style.fontSize = '16px';
puttFeedback.style.fontFamily = 'Arial, sans-serif';
puttFeedback.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
puttFeedback.style.padding = '5px';
puttFeedback.style.borderRadius = '5px';
document.body.appendChild(puttFeedback);

// Ball state tracker
let ballInMotion = false;
let lastPuttTime = 0;
const resetDelay = 8000; // 8 seconds before ball auto-resets if stuck

// Function to reset the ball to the tee
function resetBall() {
  if (!window.ballBody) {
    console.error("Cannot reset ball: Ball physics body doesn't exist");
    return;
  }
  
  if (!window.teePosition) {
    console.error("Cannot reset ball: Tee position is undefined");
    return;
  }
  
  console.log("Resetting ball to:", window.teePosition);
  
  // Stop any motion and mark as not in motion
  ballInMotion = false;
  
  // Reset position, velocity, and wake the body
  try {
    // Reset position with extra height to avoid terrain penetration
    window.ballBody.position.set(window.teePosition.x, 1.0, window.teePosition.z);
    window.ballBody.velocity.set(0, 0, 0);
    window.ballBody.angularVelocity.set(0, 0, 0);
    
    // Make sure it's awake
    window.ballBody.wakeUp();
    
    // Reset any scale changes that might have been applied
    if (window.ballMesh) {
      window.ballMesh.scale.set(1, 1, 1);
    }
    
    // Update visual mesh position to match physics body
    if (window.ballMesh) {
      window.ballMesh.position.copy(window.ballBody.position);
    }
    
    // Update UI
    if (puttFeedback) {
      puttFeedback.textContent = 'Ball reset. Ready for next shot';
    }
    
    // Reset hole in progress flag if it was set
    window.holeInProgress = false;
    
    console.log("Ball reset complete");
  } catch (error) {
    console.error("Error resetting ball:", error);
  }
}
// Function to reset the ball to its current position (stop it without moving it)
function stopBall() {
  ballInMotion = false;
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  puttFeedback.textContent = 'Ready for next shot';
}

// Socket.io event handlers
socket.on('connect', () => {
  console.log('Connected to server, joining room:', roomId);
  connectionStatus.textContent = 'Connected';
  connectionStatus.classList.remove('disconnected');
  connectionStatus.classList.add('connected');
  
  // Join the specific room
  socket.emit('joinRoom', roomId);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  connectionStatus.textContent = 'Disconnected';
  connectionStatus.classList.remove('connected');
  connectionStatus.classList.add('disconnected');
});

socket.on('roomJoined', (data) => {
  console.log('Joined room:', data.roomId);
  roomIdElement.textContent = data.roomId;
  
  // Generate controller URL
  const domain = 'putt.futurepr0n.com';
  const controllerUrl = `https://${domain}/controller.html?room=${data.roomId}`;
  
  // Display controller link
  controllerLinkElement.textContent = controllerUrl;
  
  // Generate QR Code
  if (qrCodeContainer) {
    qrCodeContainer.innerHTML = '';
    new QRCode(qrCodeContainer, {
      text: controllerUrl,
      width: 128,
      height: 128,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
  
  // Initialize first course
  createCourse(currentCourse);
  
  // Hide loading overlay once the course is created
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    loadingOverlay.style.transition = 'opacity 0.5s';
    setTimeout(function() {
      loadingOverlay.style.display = 'none';
    }, 500);
  }
});

socket.on('roomError', (data) => {
  console.error('Room error:', data.message);
  alert(`Error: ${data.message}. Redirecting to home page...`);
  window.location.href = '/';
});

// Handle orientation data from controller
socket.on('orientation', (data) => {
  if (!ballInMotion && !courseCompleted) {
    updateDirectionArrow(data);
  }
});

// Handle putt event from phone
socket.on('throw', (velocityDevice) => {
  // Rename throw event to putt for golf
  handlePutt(velocityDevice);
});

// Refined putting mechanics - improved for golf-like behavior
function handlePutt(velocityDevice) {
  console.log('Received putt data:', velocityDevice);
  
  // Only allow putting if the ball is not in motion
  if (ballInMotion || courseCompleted) {
    puttFeedback.textContent = 'Wait for the ball to stop moving!';
    return;
  }
  
  // Make sure the ball exists
  if (!window.ballBody) {
    console.error("Ball doesn't exist yet!");
    return;
  }
  
  // Calculate the magnitude of the input velocity
  const velocityMagnitude = Math.sqrt(
    velocityDevice.x * velocityDevice.x + 
    velocityDevice.y * velocityDevice.y + 
    velocityDevice.z * velocityDevice.z
  );
  
  // Use the direction arrow data if available
  let direction = { x: 0, y: 0, z: 1 }; // Default direction (forward)
  
  if (lastDirectionData) {
    // Normalize the direction
    const dirMagnitude = Math.sqrt(
      lastDirectionData.x * lastDirectionData.x + 
      lastDirectionData.z * lastDirectionData.z
    );
    
    if (dirMagnitude > 0) {
      direction.x = lastDirectionData.x / dirMagnitude;
      direction.z = lastDirectionData.z / dirMagnitude;
    }
  }
  
  // MODIFIED POWER SCALING - more gentle and predictable
  const minForce = 0.5;  // Lower minimum force
  const maxForce = 3.0;  // Lower maximum force
  
  // Use a smoothed curve for power control
  const normalizedMagnitude = Math.min(velocityMagnitude / 30, 1);
  // Apply a power curve: slower at low power, more responsive at mid power
  const powerCurve = normalizedMagnitude < 0.5 ? 
    normalizedMagnitude * normalizedMagnitude * 2 : // Quadratic for low values
    normalizedMagnitude; // Linear for higher values
  
  const forceMagnitude = minForce + powerCurve * (maxForce - minForce);
  
  console.log("Applying putt with force magnitude:", forceMagnitude);
  console.log("Based on velocity magnitude:", velocityMagnitude);
  
  // Create the final velocity vector with reduced force
  const vGame = new CANNON.Vec3(
    direction.x * forceMagnitude,
    0.05, // Small upward component for flatter shots
    direction.z * forceMagnitude
  );
  
  console.log("Final velocity vector:", vGame);
  
  // Clear any existing velocity
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  
  // Make sure the ball is awake
  window.ballBody.wakeUp();
  
  // Apply impulse at the center of the ball
  window.ballBody.applyImpulse(vGame, window.ballBody.position);
  
  // Hide the direction arrow
  if (directionArrow) {
    directionArrow.visible = false;
  }
  
  // Visual feedback
  puttFeedback.textContent = `Putt power: ${Math.round(normalizedMagnitude * 100)}%`;
  
  // Update ball state and stroke count
  ballInMotion = true;
  lastPuttTime = Date.now();
  strokeCount++;
  updateStrokeDisplay();
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Step the physics simulation
  world.step(1/60);

  // Sync ball mesh with physics body
  if (window.ballMesh && window.ballBody) {
    window.ballMesh.position.copy(window.ballBody.position);
    window.ballMesh.quaternion.copy(window.ballBody.quaternion);
    
    // Update debug sphere position
    if (window.debugSphere) {
      window.debugSphere.position.copy(window.ballBody.position);
      
      // Only show debug sphere if debug mode is on
      window.debugSphere.visible = window.showPhysicsDebug || false;
    }
    
    // Log position for debugging
    if (window.showPhysicsDebug) {
      console.log("Ball position:", window.ballBody.position);
      console.log("Ball velocity:", window.ballBody.velocity);
    }
  }
  
  // Update camera to follow ball if enabled
  updateCamera();
  
  // Check if ball needs reset
  checkBallReset();
  
  // Check if ball is in hole
  checkBallInHole();

  // Update controls if they exist
  if (typeof window.controls !== 'undefined') {
    window.controls.update();
  }

  renderer.render(scene, camera);
}

// Start the animation
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});