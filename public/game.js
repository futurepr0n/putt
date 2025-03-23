// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (!roomId) {
  alert('Room ID is missing. Redirecting to home page...');
  window.location.href = '/';
}

// Scene setup with better initial constants
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, -12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Initialize orbit controls directly (they're preloaded in the HTML)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 1.5;
controls.minDistance = 3;
controls.maxDistance = 30;
controls.target.set(0, 0, 0);
controls.update();

// Add camera controls UI
addCameraControls();

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Physics world setup
const world = new CANNON.World();
world.gravity.set(0, -9.0, 0); // Slightly reduced gravity
world.solver.iterations = 25;
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.2;
world.defaultContactMaterial.contactEquationStiffness = 1e8;
world.defaultContactMaterial.contactEquationRelaxation = 3;

// Game state
let currentCourse = 0;
const totalCourses = 5;
let courseCompleted = false;
let strokeCount = 0;
let totalScore = 0;
let par = 2;
let ballInMotion = false;
let lastPuttTime = 0;

// Materials
const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const roughMaterial = new THREE.MeshStandardMaterial({ color: 0x355E3B });
const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xE3C587 });
const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
const flagMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xCCCCCC });

// Initialize references
window.ballMesh = null;
window.ballBody = null;
let directionArrow = null;
let lastDirectionData = null;

// Create UI elements
const puttFeedback = document.createElement('div');
puttFeedback.style.position = 'absolute';
puttFeedback.style.bottom = '50px';
puttFeedback.style.left = '20px';
puttFeedback.style.color = 'white';
puttFeedback.style.fontSize = '16px';
puttFeedback.style.fontFamily = 'Arial, sans-serif';
puttFeedback.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
puttFeedback.style.padding = '10px';
puttFeedback.style.borderRadius = '5px';
puttFeedback.style.zIndex = '100';
puttFeedback.textContent = 'Waiting for game to start...';
document.body.appendChild(puttFeedback);

// Set up Socket.io
const socket = io();
const connectionStatus = document.getElementById('connectionStatus');
const roomIdElement = document.getElementById('roomId');
const controllerLinkElement = document.getElementById('controllerLink');
const qrCodeContainer = document.getElementById('qrCodeContainer');

// Close info button
document.getElementById('closeInfo').addEventListener('click', function() {
  document.getElementById('gameInfo').classList.add('hidden');
});

// -------------------- MAIN FUNCTIONS --------------------

// Create a new course
function createCourse(courseNumber) {
  // Clear any existing course
  clearCourse();
  
  // Reset state
  courseCompleted = false;
  strokeCount = 0;
  
  // Set par based on course difficulty
  par = 2 + Math.floor(courseNumber / 2);
  
  // Create the course elements
  const courseSize = { width: 8, length: 16 };
  
  // 1. Create a solid, flat ground first as the base
  createFlatGround(courseSize);
  
  // 2. Create a visual putting green with optional terrain
  createPuttingGreen(courseSize, courseNumber);
  
  // 3. Add the hole
  createHole(0, courseSize.length/2 - 2);
  
  // 4. Add tee marker
  createTeeMarker(0, -courseSize.length/2 + 3);
  
  // 5. Add boundaries
  createBoundaries(courseSize);
  
  // 6. Add safety floor below (as backup)
  createSafetyFloor(courseSize);
  
  // 7. Create the ball (MUST be created AFTER the ground)
  createBall(0, 3.0, -courseSize.length/2 + 3); // Start at height 3.0
  
  // 8. Add obstacles
  addObstacles(courseNumber, courseSize);
  
  // 9. Create direction indicator
  createDirectionIndicator();
  
  // 10. Update displays
  updateStrokeDisplay();
  updateCourseInfo(courseNumber + 1, totalCourses, par);
  
  // Display info
  puttFeedback.textContent = 'Course ready. Position your shot using the controller.';
  console.log(`Created course ${courseNumber + 1} (par ${par})`);
}

// Create a flat ground plane as the main collision surface
function createFlatGround(courseSize) {
  // 1. Visual representation
  const groundGeometry = new THREE.PlaneGeometry(courseSize.width, courseSize.length);
  const groundMesh = new THREE.Mesh(groundGeometry, greenMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  
  // 2. Physics body - simple plane
  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.material = new CANNON.Material('groundMaterial');
  
  // Create a simple plane shape
  const groundShape = new CANNON.Plane();
  groundBody.addShape(groundShape);
  
  // Position and rotate to face up
  groundBody.position.set(0, 0, 0);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  
  world.addBody(groundBody);
  console.log("Created flat ground plane for reliable collision");
}

// Create the visual putting green with optional terrain deformations
function createPuttingGreen(courseSize, courseNumber) {
  // Create a slightly more detailed visual surface (just for visuals)
  const greenGeometry = new THREE.PlaneGeometry(
    courseSize.width - 0.2, 
    courseSize.length - 0.2, 
    64, 128
  );
  
  // Optional terrain deformations for advanced courses
  if (courseNumber > 0) {
    const terrainComplexity = 0.08 * courseNumber;
    const seed = courseNumber * 1000;
    const vertices = greenGeometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      if (i % 3 === 1) { // y-axis values
        // Apply simple noise
        const x = vertices[i-1], z = vertices[i+1];
        
        // Calculate distances from tee and hole for flatter areas
        const distFromStart = Math.sqrt(x*x + Math.pow(z-(-courseSize.length/2 + 3), 2));
        const distFromHole = Math.sqrt(x*x + Math.pow(z-(courseSize.length/2 - 2), 2));
        
        // Apply mild deformation with falloff near tee and hole
        let deformation = (Math.sin(x * 0.5 + seed) * Math.cos(z * 0.5) * 0.05 * terrainComplexity);
        
        // Keep flat areas near start and hole
        if (distFromStart < 2) deformation *= (distFromStart / 2);
        if (distFromHole < 2) deformation *= (distFromHole / 2);
        
        // Apply deformation
        vertices[i] = deformation;
      }
    }
    
    // Update the geometry
    greenGeometry.attributes.position.needsUpdate = true;
    greenGeometry.computeVertexNormals();
  }
  
  // Create the mesh
  const greenMesh = new THREE.Mesh(greenGeometry, greenMaterial);
  greenMesh.rotation.x = -Math.PI / 2;
  greenMesh.position.y = 0.01; // Slightly above ground to avoid z-fighting
  greenMesh.receiveShadow = true;
  scene.add(greenMesh);
}

// Create the hole
function createHole(x, z) {
  const holeRadius = 0.15;
  const holeDepth = 0.1;
  
  // Create hole (black circle)
  const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 32);
  const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
  holeMesh.position.set(x, 0.02, z); // Slightly above ground
  holeMesh.receiveShadow = true;
  scene.add(holeMesh);
  
  // Create flag pole
  const poleGeometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 8);
  const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
  poleMesh.position.set(x, 0.5, z);
  poleMesh.castShadow = true;
  scene.add(poleMesh);
  
  // Create flag
  const flagGeometry = new THREE.PlaneGeometry(0.3, 0.2);
  const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
  flagMesh.position.set(x + 0.15, 0.8, z);
  flagMesh.castShadow = true;
  scene.add(flagMesh);
  
  // Physics trigger for hole
  const holeBody = new CANNON.Body({
    mass: 0,
    collisionResponse: false,
    isTrigger: true
  });
  
  // Create a slightly larger cylinder shape for easier detection
  const holeShape = new CANNON.Cylinder(holeRadius * 1.2, holeRadius * 1.2, holeDepth * 2, 8);
  holeBody.addShape(holeShape);
  holeBody.position.set(x, 0, z);
  world.addBody(holeBody);
  
  // Store references for collision detection
  window.holeMesh = holeMesh;
  window.holeBody = holeBody;
  window.holeCenterX = x;
  window.holeCenterZ = z;
}

// Create tee marker
function createTeeMarker(x, z) {
  // Visual tee marker
  const teeGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
  const teeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    emissive: 0x333333
  });
  const teeMesh = new THREE.Mesh(teeGeometry, teeMaterial);
  teeMesh.position.set(x, 0.05, z);
  teeMesh.receiveShadow = true;
  scene.add(teeMesh);
  
  // Tee area indicator
  const teeAreaGeometry = new THREE.CircleGeometry(0.4, 32);
  const teeAreaMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x90EE90,
    transparent: true,
    opacity: 0.7
  });
  const teeAreaMesh = new THREE.Mesh(teeAreaGeometry, teeAreaMaterial);
  teeAreaMesh.rotation.x = -Math.PI / 2;
  teeAreaMesh.position.set(x, 0.02, z);
  scene.add(teeAreaMesh);
  
  // Store tee position for ball reset
  window.teePosition = { x, z };
}

// Create the golf ball
function createBall(x, y, z) {
  // Visual representation
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
  
  // Add highlight for better visibility
  const highlightGeometry = new THREE.SphereGeometry(ballRadius * 0.2, 16, 16);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.7
  });
  const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
  highlight.position.set(ballRadius * 0.4, ballRadius * 0.4, ballRadius * 0.4);
  ballMesh.add(highlight);
  
  // Physics body
  const ballPhysMaterial = new CANNON.Material('ballMaterial');
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
  ballBody.position.set(x, y, z); // Use the provided height
  world.addBody(ballBody);
  
  // Create ground contact material
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
  
  // Store references
  window.ballMesh = ballMesh;
  window.ballBody = ballBody;
  window.ballRadius = ballRadius;
  
  console.log(`Ball created at position: x=${x}, y=${y}, z=${z}`);
}

// Create boundaries
function createBoundaries(courseSize) {
  const boundaryHeight = 0.5;
  const boundaryThickness = 0.4;
  
  // Create boundary helper
  function createBoundary(x, y, z, width, depth) {
    const boundaryGeom = new THREE.BoxGeometry(width, boundaryHeight, depth);
    const boundaryMesh = new THREE.Mesh(boundaryGeom, roughMaterial);
    boundaryMesh.position.set(x, y + boundaryHeight/2, z);
    boundaryMesh.castShadow = true;
    boundaryMesh.receiveShadow = true;
    scene.add(boundaryMesh);
    
    // Physics body
    const boundaryBody = new CANNON.Body({ 
      mass: 0,
      material: new CANNON.Material('boundaryMaterial')
    });
    
    boundaryBody.addShape(new CANNON.Box(new CANNON.Vec3(width/2, boundaryHeight/2, depth/2)));
    boundaryBody.position.set(x, y + boundaryHeight/2, z);
    world.addBody(boundaryBody);
    
    // Create contact material with ball if it exists
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
  
  // Add padding to ensure no gaps
  const extraPadding = 0.1;
  
  // Left boundary
  createBoundary(
    -courseSize.width/2 - boundaryThickness/2, 
    0, 
    0, 
    boundaryThickness, 
    courseSize.length + boundaryThickness*2 + extraPadding
  );
  
  // Right boundary
  createBoundary(
    courseSize.width/2 + boundaryThickness/2, 
    0, 
    0, 
    boundaryThickness, 
    courseSize.length + boundaryThickness*2 + extraPadding
  );
  
  // Top boundary
  createBoundary(
    0, 
    0, 
    courseSize.length/2 + boundaryThickness/2, 
    courseSize.width + boundaryThickness*2 + extraPadding, 
    boundaryThickness
  );
  
  // Bottom boundary
  createBoundary(
    0, 
    0, 
    -courseSize.length/2 - boundaryThickness/2, 
    courseSize.width + boundaryThickness*2 + extraPadding, 
    boundaryThickness
  );
  
  // Ceiling to prevent high jumps
  const ceilingBody = new CANNON.Body({ mass: 0 });
  const ceilingShape = new CANNON.Plane();
  ceilingBody.addShape(ceilingShape);
  ceilingBody.position.set(0, 5, 0); // 5 units above ground
  ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI); // Face down
  world.addBody(ceilingBody);
}

// Create safety floor below course (as backup)
function createSafetyFloor(courseSize) {
  const floorBody = new CANNON.Body({ mass: 0 });
  const floorShape = new CANNON.Plane();
  floorBody.addShape(floorShape);
  floorBody.position.set(0, -2, 0); // 2 units below main ground
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  floorBody.isSafetyFloor = true; // Flag for identification
  world.addBody(floorBody);
}

// Add obstacles based on course number
function addObstacles(courseNumber, courseSize) {
  // Skip obstacles on first course
  if (courseNumber === 0) return;
  
  const numObstacles = Math.min(courseNumber + 1, 5);
  
  for (let i = 0; i < numObstacles; i++) {
    // Determine obstacle type
    const obstacleType = (i + courseNumber) % 3;
    
    // Find valid position
    let x, z;
    let validPosition = false;
    
    while (!validPosition) {
      x = (Math.random() - 0.5) * (courseSize.width - 1);
      z = (Math.random() - 0.5) * (courseSize.length - 2);
      
      // Check distances
      const distToTee = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (-courseSize.length/2 + 3), 2));
      const distToHole = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(z - (courseSize.length/2 - 2), 2));
      
      if (distToTee > 2 && distToHole > 2) {
        validPosition = true;
      }
    }
    
    // Create obstacle
    switch (obstacleType) {
      case 0: // Sand trap
        createSandTrap(x, z, 0.6 + Math.random() * 0.4);
        break;
      case 1: // Hill
        createHill(x, z, 0.3 + Math.random() * 0.2);
        break;
      case 2: // Barrier
        createBarrier(x, z, 0.8 + Math.random() * 0.6);
        break;
    }
  }
}

// Create sand trap
function createSandTrap(x, z, size) {
  // Visual
  const sandGeometry = new THREE.CylinderGeometry(size, size, 0.05, 32);
  const sandMesh = new THREE.Mesh(sandGeometry, sandMaterial);
  sandMesh.position.set(x, 0.03, z); // Slightly above ground
  sandMesh.receiveShadow = true;
  scene.add(sandMesh);
  
  // Physics
  const sandPhysMaterial = new CANNON.Material({
    friction: 0.9,
    restitution: 0.1
  });
  
  const sandBody = new CANNON.Body({ mass: 0 });
  const sandShape = new CANNON.Cylinder(size, size, 0.1, 16);
  sandBody.addShape(sandShape);
  sandBody.position.set(x, 0.05, z);
  sandBody.material = sandPhysMaterial;
  world.addBody(sandBody);
  
  // Create contact material
  if (window.ballBody && window.ballBody.material) {
    const ballSandContactMaterial = new CANNON.ContactMaterial(
      window.ballBody.material,
      sandPhysMaterial,
      {
        friction: 0.9,
        restitution: 0.1
      }
    );
    world.addContactMaterial(ballSandContactMaterial);
  }
}

// Create hill
function createHill(x, z, height) {
  // Visual
  const hillGeometry = new THREE.SphereGeometry(height * 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillMesh = new THREE.Mesh(hillGeometry, greenMaterial);
  hillMesh.position.set(x, 0, z);
  hillMesh.receiveShadow = true;
  hillMesh.castShadow = true;
  scene.add(hillMesh);
  
  // Physics
  const hillBody = new CANNON.Body({ mass: 0 });
  const hillShape = new CANNON.Sphere(height * 2);
  hillBody.addShape(hillShape);
  hillBody.position.set(x, -height, z);
  world.addBody(hillBody);
}

// Create barrier
function createBarrier(x, z, width) {
  // Visual
  const height = 0.3;
  const depth = 0.1;
  
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
  
  // Physics
  const barrierBody = new CANNON.Body({ mass: 0 });
  barrierBody.addShape(new CANNON.Box(new CANNON.Vec3(
    (isVertical ? depth : width) / 2,
    height / 2,
    (isVertical ? width : depth) / 2
  )));
  barrierBody.position.set(x, height/2, z);
  world.addBody(barrierBody);
}

// Create direction indicator arrow
function createDirectionIndicator() {
  // Check if we already have an arrow
  if (directionArrow) {
    scene.remove(directionArrow);
  }

  // Create a simple red arrow
  const arrowGroup = new THREE.Group();
  
  // Arrow body (cylinder)
  const bodyGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
  bodyGeometry.rotateX(Math.PI / 2);
  bodyGeometry.translate(0, 0, 0.5);
  
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.7
  });
  
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  arrowGroup.add(body);
  
  // Arrow head (cone)
  const headGeometry = new THREE.ConeGeometry(0.05, 0.1, 8);
  headGeometry.rotateX(Math.PI / 2);
  headGeometry.translate(0, 0, 1.05);
  
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  arrowGroup.add(head);
  
  // Add to scene
  arrowGroup.visible = false;
  scene.add(arrowGroup);
  
  directionArrow = arrowGroup;
}

// Update the direction arrow based on controller input
function updateDirectionArrow(data) {
  if (!directionArrow || !window.ballBody || ballInMotion) return;
  
  // Store the direction data
  lastDirectionData = data;
  
  // Position the arrow at the ball
  const ballPos = window.ballBody.position;
  directionArrow.position.set(ballPos.x, 0.1, ballPos.z);
  
  // Calculate the angle
  const angle = Math.atan2(data.x, data.z);
  directionArrow.rotation.y = angle;
  
  // Scale based on power
  const magnitude = Math.sqrt(
    data.x * data.x + 
    data.y * data.y + 
    data.z * data.z
  );
  
  const minScale = 0.5;
  const maxScale = 2.0;
  const powerScale = minScale + (Math.min(magnitude / 20, 1) * (maxScale - minScale));
  
  directionArrow.scale.z = powerScale;
  directionArrow.visible = true;
}

// Clear course
function clearCourse() {
  // Remember camera
  const cameraPos = camera.position.clone();
  const cameraTarget = controls.target.clone();
  
  // Remove all scene objects
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
  
  // Remove all physics bodies
  while (world.bodies.length > 0) {
    world.removeBody(world.bodies[0]);
  }
  
  // Re-add lights
  scene.add(ambientLight);
  scene.add(directionalLight);
  
  // Restore camera
  camera.position.copy(cameraPos);
  controls.target.copy(cameraTarget);
}

// -------------------- UI FUNCTIONS --------------------

// Add camera control elements
function addCameraControls() {
  // Add camera help button
  const helpButton = document.createElement('button');
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
  helpButton.style.zIndex = '100';
  
  helpButton.addEventListener('click', function() {
    showCameraInfo();
  });
  
  document.body.appendChild(helpButton);
  
  // Show info immediately
  showCameraInfo();
  
  // Add camera presets
  const presets = [
    { name: 'Top', position: [0, 15, 0], target: [0, 0, 0] },
    { name: 'Side', position: [15, 5, 0], target: [0, 0, 0] },
    { name: 'Follow', position: [0, 5, -8], target: [0, 0, 4] }
  ];
  
  const presetContainer = document.createElement('div');
  presetContainer.style.position = 'absolute';
  presetContainer.style.top = '10px';
  presetContainer.style.right = '120px';
  presetContainer.style.display = 'flex';
  presetContainer.style.gap = '10px';
  presetContainer.style.zIndex = '100';
  
  presets.forEach(preset => {
    const button = document.createElement('button');
    button.textContent = preset.name;
    button.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.padding = '5px 10px';
    button.style.cursor = 'pointer';
    
    button.addEventListener('click', function() {
      // Animate to preset
      animateCameraMove(
        camera.position.clone(),
        controls.target.clone(),
        new THREE.Vector3(...preset.position),
        new THREE.Vector3(...preset.target),
        1000
      );
    });
    
    presetContainer.appendChild(button);
  });
  
  document.body.appendChild(presetContainer);
  
  // Add follow ball toggle
  const followButton = document.createElement('button');
  followButton.textContent = 'Follow Ball: OFF';
  followButton.style.position = 'absolute';
  followButton.style.top = '50px';
  followButton.style.right = '120px';
  followButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  followButton.style.color = 'white';
  followButton.style.border = 'none';
  followButton.style.borderRadius = '5px';
  followButton.style.padding = '5px 10px';
  followButton.style.cursor = 'pointer';
  followButton.style.zIndex = '100';
  
  let followMode = false;
  
  followButton.addEventListener('click', function() {
    followMode = !followMode;
    followButton.textContent = `Follow Ball: ${followMode ? 'ON' : 'OFF'}`;
    followButton.style.backgroundColor = followMode ? 
      'rgba(0, 128, 0, 0.7)' : 'rgba(0, 0, 0, 0.7)';
  });
  
  document.body.appendChild(followButton);
  
  // Add updateFollowCamera to animation loop
  window.updateFollowCamera = function() {
    if (followMode && window.ballBody) {
      controls.target.copy(window.ballBody.position);
    }
  };
}

// Show camera info
function showCameraInfo() {
  // Remove existing info
  const oldInfo = document.getElementById('cameraInfo');
  if (oldInfo) oldInfo.remove();
  
  const info = document.createElement('div');
  info.id = 'cameraInfo';
  info.style.position = 'absolute';
  info.style.bottom = '50px';
  info.style.left = '50%';
  info.style.transform = 'translateX(-50%)';
  info.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  info.style.color = 'white';
  info.style.padding = '15px';
  info.style.borderRadius = '10px';
  info.style.textAlign = 'center';
  info.style.zIndex = '100';
  info.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px;">Camera Controls</div>
    <div>Left Click + Drag: Rotate View</div>
    <div>Right Click + Drag: Pan View</div>
    <div>Scroll: Zoom In/Out</div>
  `;
  
  document.body.appendChild(info);
  
  // Fade out after 15 seconds
  setTimeout(() => {
    info.style.transition = 'opacity 1s';
    info.style.opacity = '0';
    setTimeout(() => info.remove(), 1000);
  }, 15000);
}

// Animate camera movement
function animateCameraMove(startPos, startTarget, endPos, endTarget, duration) {
  const startTime = Date.now();
  
  function updateCamera() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease function
    const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const t = ease(progress);
    
    // Update position and target
    camera.position.lerpVectors(startPos, endPos, t);
    controls.target.lerpVectors(startTarget, endTarget, t);
    controls.update();
    
    if (progress < 1) {
      requestAnimationFrame(updateCamera);
    }
  }
  
  updateCamera();
}

// Update stroke counter
function updateStrokeDisplay() {
  const strokeCounter = document.getElementById('strokeCounter') || createStrokeCounter();
  strokeCounter.textContent = `Strokes: ${strokeCount} / Par: ${par}`;
}

// Create stroke counter
function createStrokeCounter() {
  const counter = document.createElement('div');
  counter.id = 'strokeCounter';
  counter.style.position = 'absolute';
  counter.style.bottom = '10px';
  counter.style.left = '10px';
  counter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  counter.style.color = 'white';
  counter.style.padding = '10px';
  counter.style.borderRadius = '5px';
  counter.style.fontWeight = 'bold';
  counter.style.zIndex = '100';
  
  document.body.appendChild(counter);
  return counter;
}

// Update course info
function updateCourseInfo(current, total, par) {
  const courseInfo = document.getElementById('courseInfo') || createCourseInfo();
  courseInfo.textContent = `Hole ${current} of ${total} - Par ${par}`;
}

// Create course info
function createCourseInfo() {
  const info = document.createElement('div');
  info.id = 'courseInfo';
  info.style.position = 'absolute';
  info.style.top = '50px';
  info.style.left = '10px';
  info.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  info.style.color = 'white';
  info.style.padding = '10px';
  info.style.borderRadius = '5px';
  info.style.zIndex = '100';
  
  document.body.appendChild(info);
  return info;
}

// Show hole complete
function showHoleComplete(strokesTaken, parValue) {
  let scoreName, scoreColor;
  
  if (strokesTaken < parValue - 1) {
    scoreName = 'Eagle';
    scoreColor = '#FFD700';
  } else if (strokesTaken === parValue - 1) {
    scoreName = 'Birdie';
    scoreColor = '#00FF00';
  } else if (strokesTaken === parValue) {
    scoreName = 'Par';
    scoreColor = '#FFFFFF';
  } else if (strokesTaken === parValue + 1) {
    scoreName = 'Bogey';
    scoreColor = '#FFA500';
  } else {
    scoreName = `+${strokesTaken - parValue}`;
    scoreColor = '#FF0000';
  }
  
  const popup = document.createElement('div');
  popup.style.position = 'absolute';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  popup.style.color = scoreColor;
  popup.style.padding = '30px';
  popup.style.borderRadius = '15px';
  popup.style.textAlign = 'center';
  popup.style.zIndex = '1000';
  
  popup.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">Hole Complete!</div>
    <div style="font-size: 48px; font-weight: bold; margin: 20px 0;">${scoreName}</div>
    <div style="font-size: 20px;">Strokes: ${strokesTaken} / Par: ${parValue}</div>
    <div style="margin-top: 20px; font-size: 16px; color: #AAAAAA;">Next hole loading...</div>
  `;
  
  document.body.appendChild(popup);
  
  setTimeout(() => {
    popup.style.transition = 'opacity 0.5s';
    popup.style.opacity = '0';
    setTimeout(() => popup.remove(), 500);
  }, 3000);
}

// Show game complete
function showGameComplete() {
  const totalPar = 2 * (1 + totalCourses) / 2 * totalCourses;
  const scoreVsPar = totalScore - totalPar;
  
  const popup = document.createElement('div');
  popup.style.position = 'absolute';
  popup.style.top = '0';
  popup.style.left = '0';
  popup.style.width = '100%';
  popup.style.height = '100%';
  popup.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  popup.style.color = 'white';
  popup.style.display = 'flex';
  popup.style.flexDirection = 'column';
  popup.style.justifyContent = 'center';
  popup.style.alignItems = 'center';
  popup.style.zIndex = '2000';
  
  popup.innerHTML = `
    <h1 style="font-size: 48px; margin-bottom: 30px;">Game Complete!</h1>
    <div style="font-size: 36px; margin-bottom: 20px;">Final Score: ${scoreVsPar > 0 ? '+' + scoreVsPar : scoreVsPar}</div>
    <div style="margin-bottom: 10px;">Total Strokes: ${totalScore}</div>
    <div style="margin-bottom: 30px;">Course Par: ${totalPar}</div>
    <button id="restartButton" style="padding: 15px 30px; font-size: 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Play Again</button>
  `;
  
  document.body.appendChild(popup);
  
  document.getElementById('restartButton').addEventListener('click', () => {
    popup.remove();
    currentCourse = 0;
    totalScore = 0;
    createCourse(currentCourse);
  });
}

// -------------------- GAMEPLAY FUNCTIONS --------------------

// Check if ball is in hole
function checkBallInHole() {
  if (courseCompleted || !window.ballBody || !window.holeCenterX) return;
  
  const ballPos = window.ballBody.position;
  const dx = ballPos.x - window.holeCenterX;
  const dz = ballPos.z - window.holeCenterZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  const velocity = window.ballBody.velocity;
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
  
  if (distance < 0.15 && ballPos.y < 0.5 && speed < 0.5) {
    holeComplete();
  }
}

// Handle hole completion
function holeComplete() {
  courseCompleted = true;
  
  // Stop the ball
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  
  // Show completion message
  showHoleComplete(strokeCount, par);
  
  // Add to total score
  totalScore += strokeCount;
  
  // Move to next course
  setTimeout(() => {
    currentCourse++;
    if (currentCourse < totalCourses) {
      createCourse(currentCourse);
    } else {
      showGameComplete();
    }
  }, 3000);
}

// Reset ball to tee
function resetBall() {
  ballInMotion = false;
  
  // Position ball above tee
  if (window.ballBody && window.teePosition) {
    window.ballBody.position.set(window.teePosition.x, 3.0, window.teePosition.z);
    window.ballBody.velocity.set(0, 0, 0);
    window.ballBody.angularVelocity.set(0, 0, 0);
    window.ballBody.wakeUp();
    
    puttFeedback.textContent = 'Ball reset. Ready for next shot';
  }
}

// Handle putting action
function handlePutt(velocityData) {
  console.log('Received putt data:', velocityData);
  
  // Validation checks
  if (ballInMotion || courseCompleted) {
    puttFeedback.textContent = 'Wait for the ball to stop moving';
    return;
  }
  
  if (!window.ballBody) {
    console.error("Ball doesn't exist");
    return;
  }
  
  // Calculate magnitude
  const magnitude = Math.sqrt(
    velocityData.x * velocityData.x + 
    velocityData.y * velocityData.y + 
    velocityData.z * velocityData.z
  );
  
  // Get direction from arrow or default
  let direction = { x: 0, y: 0, z: 1 };
  
  if (lastDirectionData) {
    const dirMagnitude = Math.sqrt(
      lastDirectionData.x * lastDirectionData.x + 
      lastDirectionData.z * lastDirectionData.z
    );
    
    if (dirMagnitude > 0) {
      direction.x = lastDirectionData.x / dirMagnitude;
      direction.z = lastDirectionData.z / dirMagnitude;
    }
  }
  
  // Map input to putting force (mild non-linear mapping)
  const minForce = 1.0;
  const maxForce = 4.0;
  const normalizedMagnitude = Math.min(magnitude / 20, 1);
  const forceMagnitude = minForce + (normalizedMagnitude * normalizedMagnitude) * (maxForce - minForce);
  
  // Create velocity vector
  const vGame = new CANNON.Vec3(
    direction.x * forceMagnitude,
    0.1, // Small upward component
    direction.z * forceMagnitude
  );
  
  // Clear existing velocity
  window.ballBody.velocity.set(0, 0, 0);
  window.ballBody.angularVelocity.set(0, 0, 0);
  window.ballBody.wakeUp();
  
  // Apply impulse
  window.ballBody.applyImpulse(vGame, window.ballBody.position);
  
  // Hide direction arrow
  if (directionArrow) {
    directionArrow.visible = false;
  }
  
  // Update UI
  puttFeedback.textContent = `Putt power: ${Math.round(forceMagnitude * 25)}%`;
  
  // Update game state
  ballInMotion = true;
  lastPuttTime = Date.now();
  strokeCount++;
  updateStrokeDisplay();
}

// -------------------- SOCKET.IO HANDLERS --------------------

// Socket.io connection events
socket.on('connect', () => {
  console.log('Connected to server');
  connectionStatus.textContent = 'Connected';
  connectionStatus.classList.remove('disconnected');
  connectionStatus.classList.add('connected');
  
  // Join room
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
  
  // Update UI
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
  
  // Create course
  createCourse(currentCourse);
  
  // Hide loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    loadingOverlay.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 500);
  }
});

socket.on('roomError', (data) => {
  console.error('Room error:', data.message);
  alert(`Error: ${data.message}. Redirecting to home page...`);
  window.location.href = '/';
});

socket.on('orientation', (data) => {
  if (!ballInMotion && !courseCompleted) {
    updateDirectionArrow(data);
  }
});

socket.on('throw', (velocityData) => {
  handlePutt(velocityData);
});

// -------------------- ANIMATION LOOP --------------------

// Main animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Physics step
  world.step(1/60);
  
  // Sync ball mesh with physics body
  if (window.ballMesh && window.ballBody) {
    window.ballMesh.position.copy(window.ballBody.position);
    window.ballMesh.quaternion.copy(window.ballBody.quaternion);
  }
  
  // Check for various conditions
  if (window.ballBody) {
    // Check if ball has fallen off or stopped
    const pos = window.ballBody.position;
    const vel = window.ballBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    
    // Reset if far out of bounds
    if (pos.y < -10 || Math.abs(pos.x) > 50 || Math.abs(pos.z) > 50) {
      resetBall();
      if (strokeCount > 0) {
        strokeCount++;
        updateStrokeDisplay();
      }
    }
    
    // Update ball state
    if (speed < 0.05 && ballInMotion && Date.now() - lastPuttTime > 2000) {
      ballInMotion = false;
      puttFeedback.textContent = 'Ready for next shot';
    }
  }
  
  // Check if ball is in hole
  checkBallInHole();
  
  // Update camera follow if function exists
  if (typeof updateFollowCamera === 'function') {
    updateFollowCamera();
  }
  
  // Update controls
  controls.update();
  
  // Render scene
  renderer.render(scene, camera);
}

// Start animation loop
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Console log to confirm initialization
console.log("Mini Golf Game initialized successfully!");