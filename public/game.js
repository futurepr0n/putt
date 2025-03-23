// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (!roomId) {
  alert('Room ID is missing. Redirecting to home page...');
  window.location.href = '/';
}

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, -7);
camera.lookAt(0, 0, 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

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
world.solver.iterations = 10; // More iterations for stable physics

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

// Create a course with terrain features
function createCourse(courseNumber) {
    // Clear existing course
    clearCourse();
    
    // Reset course state
    courseCompleted = false;
    strokeCount = 0;
    
    // Set par based on course difficulty
    par = 2 + Math.floor(courseNumber / 2);
    
    // Create the base green
    const courseSize = { width: 8, length: 16 };
    const groundGeometry = new THREE.PlaneGeometry(courseSize.width, courseSize.length, 64, 128);
    const groundMesh = new THREE.Mesh(groundGeometry, greenMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    
    // Apply random terrain deformations based on course number
    const terrainComplexity = 0.1 + (courseNumber * 0.05); // Increase complexity with course number
    const vertices = groundGeometry.attributes.position.array;
    
    // Create a different seed for each course
    const seed = courseNumber * 1000;
    
    // Apply terrain deformations
    for (let i = 0; i < vertices.length; i += 3) {
      if (i % 3 === 1) { // Only modify y values (height)
        // Create several noise functions for more varied terrain
        const noise1 = simplex(vertices[i-1] * 0.1 + seed, vertices[i+1] * 0.1 + seed) * terrainComplexity;
        const noise2 = simplex(vertices[i-1] * 0.2 + seed + 100, vertices[i+1] * 0.2 + seed + 100) * terrainComplexity * 0.5;
        
        // Keep the starting and hole areas flatter
        const distFromStart = Math.sqrt(Math.pow(vertices[i-1] - 0, 2) + Math.pow(vertices[i+1] - (-courseSize.length/2 + 1), 2));
        const distFromHole = Math.sqrt(Math.pow(vertices[i-1] - 0, 2) + Math.pow(vertices[i+1] - (courseSize.length/2 - 1), 2));
        
        // Apply less deformation near the start and hole
        let deformation = noise1 + noise2;
        if (distFromStart < 1.5) {
          deformation *= distFromStart / 1.5;
        }
        if (distFromHole < 1) {
          deformation *= distFromHole;
        }
        
        vertices[i] = deformation;
      }
    }
    
    // Update the geometry to reflect the terrain changes
    groundGeometry.attributes.position.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    
    // Create heightfield shape for physics based on the deformed geometry
    const heightfieldData = [];
    const heightfieldShape = createHeightfieldFromGeometry(groundGeometry, courseSize);
    
    // Create the physics body for the ground
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(heightfieldShape);
    world.addBody(groundBody);



    
    // Add the hole (cup)
    createHole(0, courseSize.length/2 - 2);
    
    // Add tee marker
    createTeeMarker(0, -courseSize.length/2 + 3);
    
    // Add boundaries
    createBoundaries(courseSize);
    
    // Create ball at the tee position (IMPORTANT: Create ball before obstacles that need to reference it)
    createBall(0, 0.5, -courseSize.length/2 + 3);
    
    // Add obstacles based on course number (Now the ball exists when this runs)
    addObstacles(courseNumber, courseSize);
    
    // Update stroke counter display
    updateStrokeDisplay();
    
    // Update the course info
    updateCourseInfo(courseNumber + 1, totalCourses, par);

    createDirectionIndicator();
  }

// Simplified Perlin Noise function for terrain generation
function simplex(x, y) {
  // Simple pseudo-noise function
  return Math.sin(x * 0.1) * Math.cos(y * 0.1) * 2 +
         Math.sin(x * 0.4 + 0.5) * Math.cos(y * 0.3) * 0.8;
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
      // This is a simplification - proper sampling would require more complex interpolation
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

// Create ball
// Modify the createBall function to ensure the ball is visible
// Fix ball physics initialization
function createBall(x, y, z) {
    // Visual representation
    const ballRadius = 0.05;
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      emissive: 0x222222
    });
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;
    scene.add(ballMesh);
    
    console.log("Creating ball at position:", {x, y, z});
    
    // Physics body - increase starting height to prevent falling through
    const ballBody = new CANNON.Body({ 
      mass: 0.045,
      linearDamping: 0.5,
      angularDamping: 0.5,
      allowSleep: false
    });
    ballBody.addShape(new CANNON.Sphere(ballRadius));
    ballBody.position.set(x, y + 0.2, z); // Raise position to prevent ground clipping
    world.addBody(ballBody);
    
    // Create specific ground contact material to prevent falling through
    const groundContact = new CANNON.ContactMaterial(
      ballBody.material = new CANNON.Material('ballMaterial'),
      new CANNON.Material('groundMaterial'),
      {
        friction: 0.2,
        restitution: 0.5,
        contactEquationStiffness: 1e8, // Stiffer contact
        contactEquationRelaxation: 3   // More stable contact
      }
    );
    world.addContactMaterial(groundContact);
    
    // Store references to the ball objects
    window.ballMesh = ballMesh;
    window.ballBody = ballBody;
    window.ballRadius = ballRadius;
  }

// Create boundaries for the course
function createBoundaries(courseSize) {
    const boundaryHeight = 0.3;
    const boundaryThickness = 0.2;
    
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
    createBoundary(-courseSize.width/2 - boundaryThickness/2, 0, 0, boundaryThickness, courseSize.length + boundaryThickness*2);
    
    // Right boundary
    createBoundary(courseSize.width/2 + boundaryThickness/2, 0, 0, boundaryThickness, courseSize.length + boundaryThickness*2);
    
    // Top boundary
    createBoundary(0, 0, courseSize.length/2 + boundaryThickness/2, courseSize.width + boundaryThickness*2, boundaryThickness);
    
    // Bottom boundary
    createBoundary(0, 0, -courseSize.length/2 - boundaryThickness/2, courseSize.width + boundaryThickness*2, boundaryThickness);
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
  
  // Create a sand trap
  function createSandTrap(x, z, size) {
    // Visual
    const sandGeometry = new THREE.CylinderGeometry(size, size, 0.05, 32);
    const sandMesh = new THREE.Mesh(sandGeometry, sandMaterial);
    sandMesh.position.set(x, 0.025, z);
    sandMesh.receiveShadow = true;
    scene.add(sandMesh);
    
    // Create a physics material for the sand (Define it here instead of reusing a variable)
    const sandPhysicsMaterial = new CANNON.Material({
      friction: 0.9, // High friction to slow ball
      restitution: 0.1 // Low bounce
    });
    
    // Create a trigger for the sand trap
    const sandBody = new CANNON.Body({
      mass: 0
    });
    
    // Use a cylinder shape
    const sandShape = new CANNON.Cylinder(size, size, 0.1, 16);
    sandBody.addShape(sandShape);
    sandBody.position.set(x, 0.05, z);
    sandBody.material = sandPhysicsMaterial;
    world.addBody(sandBody);
    
    // Create contact material between ball and sand
    if (window.ballBody && window.ballBody.material) {
      const ballSandContactMaterial = new CANNON.ContactMaterial(
        window.ballBody.material,
        sandPhysicsMaterial,
        {
          friction: 0.9,
          restitution: 0.1
        }
      );
      world.addContactMaterial(ballSandContactMaterial);
    }
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
    
    // Physics - use a sphere shape cut in half
    const hillBody = new CANNON.Body({ mass: 0 });
    const hillShape = new CANNON.Sphere(height * 2);
    
    // Position the sphere so half of it is below the ground
    hillBody.addShape(hillShape);
    hillBody.position.set(x, -height, z);
    world.addBody(hillBody);
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
  
  // Check if ball is in hole
  function checkBallInHole() {
    if (courseCompleted || !window.ballBody || window.holeCenterX === undefined || window.holeCenterZ === undefined) return;
    
    const ballPos = window.ballBody.position;
    const holeX = window.holeCenterX;
    const holeZ = window.holeCenterZ;
    
    // Calculate distance from ball to hole center
    const dx = ballPos.x - holeX;
    const dz = ballPos.z - holeZ;
    const distance = Math.sqrt(dx*dx + dz*dz);
    
    // Check if ball is close enough to hole center and moving slowly
    const velocity = window.ballBody.velocity;
    const speed = Math.sqrt(velocity.x*velocity.x + velocity.y*velocity.y + velocity.z*velocity.z);
    
    if (distance < 0.15 && ballPos.y < 0.1 && speed < 0.5) {
      holeComplete();
    }
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
  
  // Reset ball if it gets stuck
  function checkBallReset() {
    // Make sure ball exists
    if (!window.ballBody) return;
    
    const pos = window.ballBody.position;
    const vel = window.ballBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    
    // ONLY check for out of bounds on Y axis (falling through floor)
    // or extremely far from course
    if (pos.y < -5 || pos.x < -20 || pos.x > 20 || pos.z < -20 || pos.z > 20) {
      console.log("Ball out of bounds, resetting:", pos);
      resetBall();
      
      if (strokeCount > 0) {
        strokeCount++;
        updateStrokeDisplay();
        puttFeedback.textContent = 'Out of bounds! +1 stroke penalty';
      }
    } 
    // Don't do anything else here - just let the ball stop naturally
    else if (speed < 0.1 && ballInMotion && Date.now() - lastPuttTime > 2000) {
      ballInMotion = false;
      puttFeedback.textContent = 'Ready for next shot';
    }
  }
  

  let directionArrow;
function createDirectionIndicator() {
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
  
  // Combine geometries
  const arrowGeometry = new THREE.BufferGeometry();
  const bodyBuffer = new THREE.BufferGeometry().fromGeometry(bodyGeometry);
  const headBuffer = new THREE.BufferGeometry().fromGeometry(headGeometry);
  
  // Combine the geometries
  const combinedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries([bodyBuffer, headBuffer]);
  
  // Create material and mesh
  const arrowMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff0000,
    transparent: true,
    opacity: 0.7
  });
  
  directionArrow = new THREE.Mesh(combinedGeometry, arrowMaterial);
  directionArrow.visible = false; // Initially hidden
  scene.add(directionArrow);
}


let lastDirectionData = null;
function updateDirectionArrow(directionData) {
  // Only proceed if the arrow exists and the ball is not in motion
  if (!directionArrow || ballInMotion) return;
  
  // Store this data for use when actually putting
  lastDirectionData = directionData;
  
  if (!window.ballBody) return;
  
  // Position arrow at the ball's current position (not at the tee)
  const ballPos = window.ballBody.position;
  directionArrow.position.set(ballPos.x, 0.1, ballPos.z); // Slightly above ground
  
  // Calculate direction based on controller data
  const angle = Math.atan2(directionData.x, directionData.z);
  
  // Rotate arrow to point in the direction of the putt
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
  const powerScale = minScale + (Math.min(magnitude / 20, 1) * (maxScale - minScale));
  
  directionArrow.scale.z = powerScale;
  
  // Make arrow visible
  directionArrow.visible = true;
}

socket.on('orientation', (data) => {
    if (!ballInMotion && !courseCompleted) {
      updateDirectionArrow(data);
    }
  });
  

  // Function to reset the ball to the tee
  function resetBall() {
    ballInMotion = false;
    window.ballBody.position.set(window.teePosition.x, 0.5, window.teePosition.z);
    window.ballBody.velocity.set(0, 0, 0);
    window.ballBody.angularVelocity.set(0, 0, 0);
    puttFeedback.textContent = 'Ball reset. Ready for next shot';
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
  
  // Handle putt event from phone
  socket.on('throw', (velocityDevice) => {
    // Rename throw event to putt for golf
    handlePutt(velocityDevice);
  });
  
  // Handle putt action with phone motion
  function handlePutt(velocityDevice) {
    console.log('Received putt:', velocityDevice);
    
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
    
    // Convert device motion to appropriate putting force
    const velocityMagnitude = Math.sqrt(
      velocityDevice.x * velocityDevice.x + 
      velocityDevice.y * velocityDevice.y + 
      velocityDevice.z * velocityDevice.z
    );
    
    // Use higher scale factor to make movement more visible
    let scaleFactor = 0.8;
    
    // Create velocity vector - emphasize Z direction for forward motion
    const vGame = new CANNON.Vec3(
      velocityDevice.x * scaleFactor * 0.5,  // Side-to-side movement
      0.1, // Very small upward component 
      Math.max(3, velocityDevice.z * scaleFactor)  // Ensure minimum forward motion
    );
    
    console.log("Applying putt with velocity:", vGame);
    
    // Clear any existing velocity
    window.ballBody.velocity.set(0, 0, 0);
    window.ballBody.angularVelocity.set(0, 0, 0);
    
    // Apply strong impulse directly
    window.ballBody.applyImpulse(
      new CANNON.Vec3(vGame.x, vGame.y, vGame.z),
      window.ballBody.position
    );
    
    // Visual feedback
    puttFeedback.textContent = `Putt power: ${Math.round(velocityMagnitude)}`;
    
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
    }
    
    // Check if ball needs reset
    checkBallReset();
    
    // Check if ball is in hole
    checkBallInHole();
  
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