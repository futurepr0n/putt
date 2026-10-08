const THREE = window.THREE;

// Procedural canvas textures: no image assets to host or load
function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function speckle(ctx, size, count, colors, maxR) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = Math.random() * maxR + 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// Putting green with alternating mowing stripes along the length of the course
export function grassTexture(stripes = 8) {
  return cached(`grass${stripes}`, () => {
    const size = 512;
    const [c, ctx] = canvas(size);
    const band = size / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#3f9b3a' : '#48a843';
      ctx.fillRect(0, i * band, size, band);
    }
    speckle(ctx, size, 9000, ['rgba(20,70,20,0.35)', 'rgba(120,200,90,0.25)', 'rgba(30,90,30,0.3)'], 1.6);
    return toTexture(c, 1, 1);
  });
}

// Rough/fringe grass for the surrounding park
export function roughTexture() {
  return cached('rough', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = '#2f6b2a';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 6000, ['rgba(15,50,15,0.5)', 'rgba(90,150,60,0.35)'], 2.2);
    return toTexture(c, 40, 40);
  });
}

export function woodTexture() {
  return cached('wood', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = '#9a6a3c';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) {
      const shade = Math.sin(y * 0.15 + Math.sin(y * 0.03) * 4) * 18;
      ctx.fillStyle = `rgba(${shade > 0 ? '255,220,170' : '60,30,10'},${Math.abs(shade) / 120})`;
      ctx.fillRect(0, y, size, 2);
    }
    speckle(ctx, size, 1200, ['rgba(60,30,10,0.25)'], 1.5);
    return toTexture(c, 4, 1);
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = '#e3c587';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 12000, ['rgba(160,120,60,0.35)', 'rgba(255,240,200,0.5)', 'rgba(120,90,50,0.25)'], 1.3);
    return toTexture(c, 2, 2);
  });
}

// Vertical sky gradient used as scene background
export function skyTexture() {
  return cached('sky', () => {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5c9ee6');
    g.addColorStop(0.55, '#a9d2f2');
    g.addColorStop(1, '#e8f3e0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  });
}
