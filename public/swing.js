// Putting-stroke analysis from gyroscope samples. Pure functions: no DOM, no sockets.
// Samples: { t: ms, x, y, z } angular velocity in deg/s on the phone's axes
// (x = short edge, y = long edge / putter shaft, z = out of the screen).
(function (root) {
  const SWING = {
    fullBackswingDeg: 40, // Backswing that gives full power from its length share
    minBackswingDeg: 3,
    pendulumGain: 5.2, // Natural stroke: peak speed (deg/s) ≈ gain × backswing (deg), ~1.2 s cycle
    // Pace = backswing size and speed through the ball, equally. A natural stroke scores the same on both.
    lengthWeight: 0.5,
    speedWeight: 0.5,
    faceSign: 1, // Flip if twisting the phone clockwise sends the ball left
    faceWeight: 0.8, // Share of face angle that becomes start direction (real putts ≈ 0.8)
    maxFaceDeg: 15,
    joltAccel: 25, // m/s² of linear acceleration that means the phone was bumped
    stillRate: 15, // deg/s: below this the golfer is holding still at address
    stillMs: 300,
    followThroughMs: 180, // Auto-finish this long after impact
    impactWindowMs: 40
  };

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => {
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  };

  // Dominant rotation axis (principal eigenvector of the rate covariance)
  function swingAxis(samples) {
    const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const s of samples) {
      const v = [s.x, s.y, s.z];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += v[i] * v[j];
    }
    let v = [1, 0.3, 0.2];
    for (let k = 0; k < 40; k++) {
      v = norm([dot(c[0], v), dot(c[1], v), dot(c[2], v)]);
    }
    const total = c[0][0] + c[1][1] + c[2][2] || 1;
    const along = dot(v, [dot(c[0], v), dot(c[1], v), dot(c[2], v)]);
    return { axis: v, confidence: along / total };
  }

  // Integrate a rate series to an angle series (trapezoid), degrees
  function integrate(samples, rateOf) {
    const out = [0];
    for (let i = 1; i < samples.length; i++) {
      const dt = (samples[i].t - samples[i - 1].t) / 1000;
      out.push(out[i - 1] + 0.5 * (rateOf(samples[i]) + rateOf(samples[i - 1])) * dt);
    }
    return out;
  }

  // Finds apex and the moment the putter returns through the address position
  function findStroke(theta) {
    let apex = 0;
    for (let i = 1; i < theta.length; i++) {
      if (theta[i] > theta[apex]) apex = i;
      if (theta[apex] >= SWING.minBackswingDeg && theta[i] <= 0) {
        return { apex, impact: i };
      }
    }
    return { apex, impact: -1 };
  }

  function analyzeStroke(samples, opts = {}) {
    const scale = opts.powerScale || 1;
    if (!samples || samples.length < 6) return { ok: false, reason: 'No motion data - check sensor permission' };

    if (opts.maxAccel && opts.maxAccel > SWING.joltAccel) {
      return { ok: false, reason: 'Phone was bumped - try a smoother stroke' };
    }

    // Measure from when the stroke starts moving, not from the button press:
    // any pause before the swing would otherwise accumulate gyro drift
    const onset = samples.findIndex(s => Math.hypot(s.x, s.z) > SWING.stillRate);
    if (onset > 3) samples = samples.slice(onset - 3);

    // Twist about the long axis is the putter face turning, not the stroke itself
    const strokeSamples = samples.map(s => ({ t: s.t, x: s.x, y: s.y * 0.15, z: s.z }));
    const { axis, confidence } = swingAxis(strokeSamples);
    let theta = integrate(samples, s => s.x * axis[0] + s.y * axis[1] + s.z * axis[2]);

    // Backswing is whichever way the putter moved first
    const firstBig = theta.find(v => Math.abs(v) >= SWING.minBackswingDeg);
    if (firstBig === undefined) return { ok: false, reason: 'Backswing too small - swing bigger' };
    if (firstBig < 0) theta = theta.map(v => -v);

    const { apex, impact } = findStroke(theta);
    const backswing = theta[apex];
    if (impact < 0) {
      return { ok: false, reason: 'Swing through the ball', backswing, trace: downsample(samples, theta) };
    }

    // Interpolate the crossing for impact time and speed
    const a = theta[impact - 1], b = theta[impact];
    const f = a === b ? 0 : a / (a - b);
    const t0 = samples[impact - 1].t, t1 = samples[impact].t;
    const impactT = t0 + (t1 - t0) * f;
    // Peak stroke speed through the hitting zone: robust to a single noisy sample
    const rate = (s) => Math.abs(s.x * axis[0] + s.y * axis[1] + s.z * axis[2]);
    let impactSpeed = 0;
    for (let i = apex; i < samples.length; i++) {
      if (Math.abs(samples[i].t - impactT) <= SWING.impactWindowMs) impactSpeed = Math.max(impactSpeed, rate(samples[i]));
    }

    // Face: twist about the shaft from address to impact
    const twist = integrate(samples, s => s.y);
    const faceAtImpact = twist[impact - 1] + (twist[impact] - twist[impact - 1]) * f;
    const face = Math.max(-SWING.maxFaceDeg, Math.min(SWING.maxFaceDeg, faceAtImpact * SWING.faceSign * SWING.faceWeight));

    const lengthPower = backswing / SWING.fullBackswingDeg;
    const speedPower = impactSpeed / (SWING.pendulumGain * SWING.fullBackswingDeg);
    // Tempo: speed through the ball relative to a natural pendulum of this length (display/logging)
    const tempo = impactSpeed / (SWING.pendulumGain * backswing);
    const raw = SWING.lengthWeight * lengthPower + SWING.speedWeight * speedPower;
    const power = Math.max(0, Math.min(1, raw * scale));

    return {
      ok: true,
      power,
      face,
      backswing,
      impactSpeed,
      tempo,
      confidence,
      apexT: samples[apex].t,
      impactT,
      trace: downsample(samples, theta)
    };
  }

  // Live backswing size during the stroke (for the TV power preview):
  // angle travelled along the stroke's initial direction, peak so far
  function liveBackswing(samples) {
    const first = samples.find(s => Math.hypot(s.x, s.z) > SWING.stillRate);
    if (!first) return 0;
    const m = Math.hypot(first.x, first.z);
    const ux = first.x / m, uz = first.z / m;
    let angle = 0, peak = 0;
    for (let i = 1; i < samples.length; i++) {
      const dt = (samples[i].t - samples[i - 1].t) / 1000;
      angle += (samples[i].x * ux + samples[i].z * uz) * dt;
      peak = Math.max(peak, angle);
    }
    return peak;
  }

  function predictedPower(backswingDeg, scale = 1) {
    return Math.max(0, Math.min(1, (backswingDeg / SWING.fullBackswingDeg) * scale));
  }

  // Has the golfer held still long enough to set up at address?
  function isStill(samples, now) {
    const recent = samples.filter(s => now - s.t <= SWING.stillMs);
    if (recent.length < 3 || now - recent[0].t < SWING.stillMs * 0.8) return false;
    return recent.every(s => Math.hypot(s.x, s.y, s.z) < SWING.stillRate);
  }

  function downsample(samples, theta, n = 60) {
    const step = Math.max(1, Math.floor(samples.length / n));
    const out = [];
    for (let i = 0; i < samples.length; i += step) out.push([Math.round(samples[i].t - samples[0].t), +theta[i].toFixed(1)]);
    return out;
  }

  const api = { SWING, analyzeStroke, liveBackswing, predictedPower, isStill, swingAxis };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Swing = api;
})(typeof window !== 'undefined' ? window : globalThis);
