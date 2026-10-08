const THREE = window.THREE;
import { gameConfig } from '../config/gameConfig.js';

const MAX_PATH_DOTS = 80;
const PATH_SPACING = 0.22;
const TRAIL_LENGTH = 36;
const CONFETTI_COUNT = 160;

// Roll distance on the green for a given swing power (inverse of the putt speed curve)
export function predictedDistance(power) {
  const { minSpeed, maxSpeed, powerExponent } = gameConfig.putt;
  const p = Math.max(0, Math.min(power, 1));
  const v = minSpeed + (maxSpeed - minSpeed) * Math.pow(p, powerExponent);
  return (v * v) / (2 * gameConfig.green.effectiveDecel);
}

// Dotted aim/power path, rolling-ball trail and holed-out confetti
export class ShotEffects {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.dummy = new THREE.Object3D();
    this.confetti = null;
  }

  init() {
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.path = new THREE.InstancedMesh(new THREE.CircleGeometry(0.035, 12), dotMat, MAX_PATH_DOTS);
    this.path.count = 0;
    this.path.frustumCulled = false;
    this.sceneManager.add(this.path);

    const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
    this.trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), trailMat, TRAIL_LENGTH);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.sceneManager.add(this.trail);
    this.trailPoints = [];
  }

  // Dots from the ball along the aim angle, stopping at the course edge
  showPath(ballPos, angle, length, color) {
    if (!ballPos) return;
    const { width, length: courseLength } = gameConfig.courseSize;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const n = Math.min(MAX_PATH_DOTS, Math.floor(length / PATH_SPACING));
    let count = 0;
    for (let i = 1; i <= n; i++) {
      const x = ballPos.x + dx * i * PATH_SPACING;
      const z = ballPos.z + dz * i * PATH_SPACING;
      if (Math.abs(x) > width / 2 - 0.05 || Math.abs(z) > courseLength / 2 - 0.05) break;
      // Shrink dots toward the end so the predicted stop point reads clearly
      const s = 1 - 0.5 * (i / Math.max(n, 1));
      this.dummy.position.set(x, 0.006, z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.path.setMatrixAt(count++, this.dummy.matrix);
    }
    this.path.count = count;
    this.path.instanceMatrix.needsUpdate = true;
    this.path.material.color.setHex(color);
    this.path.visible = true;
  }

  hidePath() {
    this.path.visible = false;
  }

  startTrail(color) {
    this.trailPoints = [];
    this.trail.material.color.setHex(color);
    this.trail.count = 0;
    this.trail.visible = true;
  }

  updateTrail(pos) {
    const last = this.trailPoints[this.trailPoints.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.z - last.z) < 0.12) return;
    this.trailPoints.push({ x: pos.x, y: pos.y, z: pos.z });
    if (this.trailPoints.length > TRAIL_LENGTH) this.trailPoints.shift();
    const n = this.trailPoints.length;
    this.trailPoints.forEach((p, i) => {
      const s = 0.25 + 0.75 * (i / n);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.trail.setMatrixAt(i, this.dummy.matrix);
    });
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
  }

  fadeTrail() {
    this.trail.visible = false;
  }

  burstConfetti(x, z, colors) {
    this.clearConfetti();
    const positions = new Float32Array(CONFETTI_COUNT * 3);
    const colorArr = new Float32Array(CONFETTI_COUNT * 3);
    const velocities = [];
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      positions.set([x, 0.1, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = 2.5 + Math.random() * 2.5;
      const out = 0.6 + Math.random() * 1.4;
      velocities.push([Math.cos(a) * out, up, Math.sin(a) * out]);
      c.setHex(colors[i % colors.length]);
      colorArr.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    const mat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
    this.confetti = { points: new THREE.Points(geo, mat), velocities, age: 0 };
    this.sceneManager.add(this.confetti.points);
  }

  clearConfetti() {
    if (!this.confetti) return;
    this.sceneManager.remove(this.confetti.points);
    this.confetti = null;
  }

  update(dt) {
    if (!this.confetti || dt <= 0) return;
    const cf = this.confetti;
    cf.age += dt;
    const pos = cf.points.geometry.attributes.position;
    for (let i = 0; i < cf.velocities.length; i++) {
      const v = cf.velocities[i];
      v[1] -= 6 * dt;
      v[0] *= 0.985; v[2] *= 0.985;
      const y = Math.max(0.01, pos.getY(i) + v[1] * dt);
      pos.setXYZ(i, pos.getX(i) + v[0] * dt, y, pos.getZ(i) + v[2] * dt);
    }
    pos.needsUpdate = true;
    cf.points.material.opacity = Math.max(0, 1 - Math.max(0, cf.age - 1.8) / 0.8);
    if (cf.age > 2.6) this.clearConfetti();
  }
}
