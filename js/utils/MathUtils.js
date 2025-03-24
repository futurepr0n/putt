export class MathUtils {
    /**
     * Map a value from one range to another
     * @param {number} value - The input value
     * @param {number} inMin - Input range minimum
     * @param {number} inMax - Input range maximum
     * @param {number} outMin - Output range minimum
     * @param {number} outMax - Output range maximum
     * @returns {number} Mapped value
     */
    static map(value, inMin, inMax, outMin, outMax) {
      return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }
    
    /**
     * Clamp a value between min and max
     * @param {number} value - The input value
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    static clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
    
    /**
     * Calculate distance between two 2D points
     * @param {number} x1 - First point x coordinate
     * @param {number} z1 - First point z coordinate 
     * @param {number} x2 - Second point x coordinate
     * @param {number} z2 - Second point z coordinate
     * @returns {number} Distance between points
     */
    static distance2D(x1, z1, x2, z2) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      return Math.sqrt(dx * dx + dz * dz);
    }
    
    /**
     * Calculate distance between two 3D points
     * @param {Object} p1 - First point with x, y, z properties
     * @param {Object} p2 - Second point with x, y, z properties
     * @returns {number} Distance between points
     */
    static distance3D(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    /**
     * Linear interpolation between two values
     * @param {number} a - Start value
     * @param {number} b - End value
     * @param {number} t - Interpolation factor (0-1)
     * @returns {number} Interpolated value
     */
    static lerp(a, b, t) {
      return a + (b - a) * t;
    }
    
    /**
     * Ease in-out function
     * @param {number} t - Input value (0-1)
     * @returns {number} Eased value
     */
    static easeInOut(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    
    /**
     * Convert degrees to radians
     * @param {number} degrees - Angle in degrees
     * @returns {number} Angle in radians
     */
    static degToRad(degrees) {
      return degrees * Math.PI / 180;
    }
    
    /**
     * Convert radians to degrees
     * @param {number} radians - Angle in radians
     * @returns {number} Angle in degrees
     */
    static radToDeg(radians) {
      return radians * 180 / Math.PI;
    }
    
    /**
     * Generate a random number between min and max
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random value
     */
    static random(min, max) {
      return Math.random() * (max - min) + min;
    }
    
    /**
     * Generate a random integer between min and max (inclusive)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random integer
     */
    static randomInt(min, max) {
      min = Math.ceil(min);
      max = Math.floor(max);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * Calculate magnitude of a 3D vector
     * @param {Object} vector - Vector with x, y, z properties
     * @returns {number} Vector magnitude
     */
    static magnitude(vector) {
      return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    }
    
    /**
     * Normalize a 3D vector
     * @param {Object} vector - Vector with x, y, z properties
     * @returns {Object} Normalized vector
     */
    static normalize(vector) {
      const mag = this.magnitude(vector);
      if (mag === 0) return { x: 0, y: 0, z: 0 };
      
      return {
        x: vector.x / mag,
        y: vector.y / mag,
        z: vector.z / mag
      };
    }
  }