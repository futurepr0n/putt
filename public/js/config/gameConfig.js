export const gameConfig = {
  // Game settings
  totalCourses: 5,
  resetDelay: 8000, // 8 seconds before ball auto-resets if stuck

  // Multiplayer
  players: {
    maxStrokes: 8, // Pick up at this many strokes
    disconnectGraceMs: 60000, // Picked up for the hole after being away this long
    minShotMs: 600, // A shot can't end sooner than this (lets the ball get moving)
    holeResultsMs: 5000, // How long hole results show before the next hole
    colors: [0xffffff, 0xff4d4d, 0x4da6ff, 0xffd633, 0xb366ff, 0xff9933, 0x33ddaa, 0xff66cc]
  },

  // Course settings
  courseSize: {
    width: 8,
    length: 16
  },

  // Par for each course (index 0 to 4)
  coursePars: [3, 3, 4, 3, 5],

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
    timeStep: 1 / 120,
    groundFriction: 0.3
  },

  // Putt settings
  // Launch speed in m/s: speed = minSpeed + (maxSpeed - minSpeed) * power^powerExponent
  putt: {
    minSpeed: 0.3,
    maxSpeed: 7,
    powerExponent: 1.2
  },

  // Green deceleration while rolling (m/s^2); roll distance ≈ v² / (2 * rollingDecel)
  green: {
    rollingDecel: 0.8,
    stopSpeed: 0.04,
    // Measured average deceleration incl. friction (sim: power 0.6/0.75/0.8 -> 6.5/9.9/10.9 m); used for path preview
    effectiveDecel: 1.3
  },

  // Extra deceleration while in a sand trap (m/s^2)
  sand: {
    decel: 4.0
  },

  // Hole settings
  hole: {
    radius: 0.1875, // Increased by 1.25x for easier putting
    depth: 0.1,
    animationDuration: 1000,
    maxCaptureSpeed: 2.6, // Faster than this lips out instead of dropping
    assistRadiusFactor: 1.6, // Gentle pull toward the cup within this many hole radii
    assistMaxSpeed: 1.0
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