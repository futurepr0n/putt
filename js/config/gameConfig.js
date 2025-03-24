export const gameConfig = {
    // Game settings
    totalCourses: 5,
    resetDelay: 8000, // 8 seconds before ball auto-resets if stuck
    
    // Course settings
    courseSize: {
      width: 8,
      length: 16
    },
    
    // Ball settings
    ballSettings: {
      radius: 0.08,
      mass: 0.15,
      linearDamping: 0.2,
      angularDamping: 0.3,
      friction: 0.3,
      restitution: 0.2
    },
    
    // Physics settings
    physics: {
      gravity: -9.82,
      iterations: 20,
      timeStep: 1/120,
      groundFriction: 0.3
    },
    
    // Putt settings
    putt: {
      minForce: 0.5,
      maxForce: 3.0,
      upwardComponent: 0.05
    },
    
    // Hole settings
    hole: {
      radius: 0.15,
      depth: 0.1,
      animationDuration: 1000
    },
    
    // Materials
    materials: {
      green: 0x228B22,
      rough: 0x355E3B,
      sand: 0xE3C587,
      hole: 0x000000,
      flag: 0xFF0000,
      pole: 0xCCCCCC
    },
    
    // Debug settings
    debug: {
      enabled: false,
      showPhysics: false,
      showObstacles: false
    }
  };