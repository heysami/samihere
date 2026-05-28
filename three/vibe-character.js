// vibe-character.js — Three.js scene for the "vibe character" bento card.
// A cute mauworld "mau" mascot seen FROM BEHIND, leaning into the scene as if
// striding away into the canvas, leaving a soft cloud-puff trail behind it, while
// folded-paper confetti streams past. Everything sits inside the small wide card.
//
// Self-initializing ES module: queries #vibe-character, builds the scene, renders into
// the CSS-sized canvas, handles resize (ResizeObserver), pauses RAF when offscreen
// (IntersectionObserver), and respects prefers-reduced-motion.
//
// Pointer interaction: while the pointer is over the canvas the mascot translates
// HORIZONTALLY ONLY toward the cursor's x (eased, clamped to the frame); on leave it
// eases back to center. Pointer events are never consumed, so the card's own click
// handler (overlay) keeps working.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.querySelector('#vibe-character');
if (!canvas) {
  console.warn('[vibe-character] canvas #vibe-character not found — scene not mounted.');
} else {
  initScene(canvas);
}

function initScene(canvas) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- mauworld WORLD_STYLE palette ----
  const ACCENTS = ['#ff4fa8', '#2dd8ff', '#ffd84d', '#7ce85b', '#ff9548', '#7ed7ff'];
  const INK = '#33407a';     // outline / eye ink
  const WHITE = '#ffffff';
  const PRIMARY = ACCENTS[0];   // '#ff4fa8'
  const SECONDARY = ACCENTS[1]; // '#2dd8ff'

  // ---- Renderer (transparent so the white card shows through) ----
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ---- Scene + camera (wide-but-short card; ~2.7:1) ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 2.7, 0.1, 200);
  // Pulled back so the whole mascot (ears + halo to feet) stays in frame with margin,
  // and lifted a touch so the camera looks slightly DOWN at the character.
  camera.position.set(0, 7.0, 34);
  camera.lookAt(0, 6.2, 0);

  // ---- Outline-shell helper (cartoon ink rim behind a mesh) ----
  function outlineShell(geometry, color = INK, scale = 1.12) {
    const m = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide, transparent: true, fog: false })
    );
    m.scale.setScalar(scale);
    return m;
  }

  // ---- Shared materials ----
  const matWhiteToon = new THREE.MeshToonMaterial({ color: WHITE });
  const matEarPrimary = new THREE.MeshToonMaterial({ color: new THREE.Color(PRIMARY) });
  const matEarSecondary = new THREE.MeshToonMaterial({ color: new THREE.Color(SECONDARY) });
  const matEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK) });

  // ---- Mascot ("mau") ----
  // outer group → poseRoot (lean + translate live here so we can lean & move the mascot)
  const mascot = new THREE.Group();
  const poseRoot = new THREE.Group();
  mascot.add(poseRoot);
  scene.add(mascot);

  // body
  const bodyGeo = new THREE.CapsuleGeometry(1.45, 2.4, 6, 16);
  const body = new THREE.Mesh(bodyGeo, matWhiteToon);
  body.position.y = 4.2;
  body.add(outlineShell(bodyGeo));
  poseRoot.add(body);

  // head
  const headGeo = new THREE.SphereGeometry(2.15, 24, 24);
  const head = new THREE.Mesh(headGeo, matWhiteToon);
  head.position.y = 8.3;
  head.add(outlineShell(headGeo));
  poseRoot.add(head);

  // ears (±1)
  const earGeo = new THREE.ConeGeometry(0.8, 1.9, 16);
  [1, -1].forEach((side) => {
    const ear = new THREE.Mesh(earGeo, side > 0 ? matEarPrimary : matEarSecondary);
    ear.position.set(side * 1.45, 11, 0);
    ear.rotation.z = side * 0.36;
    ear.add(outlineShell(earGeo));
    poseRoot.add(ear);
  });

  // arms (±1)
  const armGeo = new THREE.CapsuleGeometry(0.38, 1.3, 4, 10);
  [1, -1].forEach((side) => {
    const arm = new THREE.Mesh(armGeo, side > 0 ? matEarPrimary : matEarSecondary);
    arm.position.set(side * 2.25, 4.9, 0.1);
    arm.rotation.z = side * 0.84;
    poseRoot.add(arm);
  });

  // eyes (±1)
  const eyeGeo = new THREE.SphereGeometry(0.25, 10, 10);
  [1, -1].forEach((side) => {
    const eye = new THREE.Mesh(eyeGeo, matEye);
    eye.position.set(side * 0.72, 8.45, 1.92);
    poseRoot.add(eye);
  });

  // cheeks (±1) — small semi-transparent accent spheres
  const cheekGeo = new THREE.SphereGeometry(0.3, 10, 10);
  [1, -1].forEach((side) => {
    const cheek = new THREE.Mesh(
      cheekGeo,
      new THREE.MeshToonMaterial({
        color: new THREE.Color(side > 0 ? PRIMARY : SECONDARY),
        transparent: true,
        opacity: 0.82,
      })
    );
    cheek.position.set(side * 1.2, 7.65, 1.8);
    poseRoot.add(cheek);
  });

  // halo ring above the shoulders
  const haloGeo = new THREE.TorusGeometry(2.9, 0.2, 10, 42);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshToonMaterial({ color: new THREE.Color(PRIMARY) }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 5.6;
  poseRoot.add(halo);

  // Center the mascot vertically in frame and scale to fit the short card.
  mascot.position.set(0, 0, 0);
  mascot.scale.setScalar(0.84);
  // Turn its BACK to the camera so it reads as heading away into the scene.
  mascot.rotation.y = Math.PI;

  // Lean into the travel direction (top tips away from us, into the canvas).
  // With the 180° yaw above, a positive poseRoot tip leans the mascot into -Z (away).
  const LEAN_X = 0.22;
  poseRoot.rotation.x = LEAN_X;

  // ---- Soft radial ground shadow (subtle) ----
  const shadowTex = groundShadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 7.5),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.18, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 1.2, 0);
  mascot.add(shadow);

  // ---- Lights (mauworld) — MeshToonMaterial needs these ----
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffffff'), new THREE.Color('#ffe8f8'), 1.48);
  hemi.position.set(0, 180, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(new THREE.Color('#fff4be'), 1.16);
  dir.position.set(120, 280, 80);
  scene.add(dir);

  // ---- Confetti: forward-streaming folded-paper Points cloud ----
  const CONFETTI_COUNT = 300;
  // Volume bounds (in the mascot's local-ish world). Particles travel +Z toward camera.
  const X_RANGE = 18;   // total width (±9)
  const Y_MIN = 1.0, Y_MAX = 13.0;
  const Z_FAR = -10;    // far end / behind the mascot (spawn / recycle target)
  const Z_NEAR = 30;    // just past the camera plane (recycle trigger)

  const positions = new Float32Array(CONFETTI_COUNT * 3);
  const colors = new Float32Array(CONFETTI_COUNT * 3);
  const speeds = new Float32Array(CONFETTI_COUNT);     // +Z forward speed
  const swayPhase = new Float32Array(CONFETTI_COUNT);  // x/y sway phase
  const swayAmp = new Float32Array(CONFETTI_COUNT);

  const tmpColor = new THREE.Color();
  const whiteCol = new THREE.Color('#ffffff');
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * X_RANGE;
    positions[i * 3 + 1] = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
    positions[i * 3 + 2] = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);

    tmpColor.set(ACCENTS[(Math.random() * ACCENTS.length) | 0]);
    tmpColor.lerp(whiteCol, 0.03 + Math.random() * 0.08);
    colors[i * 3 + 0] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;

    speeds[i] = 6.5 + Math.random() * 5.0;      // calm, pleasant flow
    swayPhase[i] = Math.random() * Math.PI * 2;
    swayAmp[i] = 0.15 + Math.random() * 0.35;
  }

  const confettiGeo = new THREE.BufferGeometry();
  confettiGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  confettiGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const confettiMat = new THREE.PointsMaterial({
    map: confettiTexture(),
    size: 0.9,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.12,
    blending: THREE.NormalBlending,
    vertexColors: true,
  });

  const confetti = new THREE.Points(confettiGeo, confettiMat);
  scene.add(confetti);

  // ---- Cloud-puff trail: soft clouds left behind as the mascot strides into the scene ----
  // Puffs spawn just behind the mascot (toward the camera), then drift back toward the
  // viewer while rising, growing and fading — the dust it leaves as it heads away.
  const cloudMap = cloudTexture();
  const CLOUD_POOL = 28;
  const clouds = [];
  for (let i = 0; i < CLOUD_POOL; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudMap,
      color: new THREE.Color('#c3d2f0'), // soft periwinkle so it reads on the white card
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 1;
    scene.add(sp);
    clouds.push({ sp, mat, active: false, life: 0, max: 1, driftZ: 0, rise: 0, s0: 1, s1: 2 });
  }
  let cloudCursor = 0;
  let cloudTimer = 0;
  const CLOUD_INTERVAL = 0.16; // seconds between puffs
  const CLOUD_PEAK = 0.46;     // max opacity
  function spawnCloud() {
    const c = clouds[cloudCursor];
    cloudCursor = (cloudCursor + 1) % CLOUD_POOL;
    c.active = true;
    c.life = 0;
    c.max = 1.25 + Math.random() * 0.65;
    c.driftZ = 5.5 + Math.random() * 2.5;  // toward the camera (left behind)
    c.rise = 0.7 + Math.random() * 0.8;
    c.s0 = 1.7 + Math.random() * 0.6;
    c.s1 = c.s0 + 2.4 + Math.random() * 1.6;
    c.x = mascot.position.x + (Math.random() - 0.5) * 1.7; // follows horizontal movement
    c.y = 1.1 + Math.random() * 0.8;
    c.z = 2.8 + Math.random() * 1.6; // just behind the mascot, toward the viewer
    c.sp.position.set(c.x, c.y, c.z);
    c.sp.scale.setScalar(c.s0);
    c.sp.visible = true;
  }
  function updateClouds(dt) {
    cloudTimer += dt;
    while (cloudTimer >= CLOUD_INTERVAL) { cloudTimer -= CLOUD_INTERVAL; spawnCloud(); }
    for (const c of clouds) {
      if (!c.active) continue;
      c.life += dt;
      const t = c.life / c.max;
      if (t >= 1) { c.active = false; c.sp.visible = false; c.mat.opacity = 0; continue; }
      c.z += c.driftZ * dt;
      c.y += c.rise * dt;
      c.sp.position.z = c.z;
      c.sp.position.y = c.y;
      c.sp.scale.setScalar(c.s0 + (c.s1 - c.s0) * t);
      c.mat.opacity = t < 0.18 ? (t / 0.18) * CLOUD_PEAK : CLOUD_PEAK * (1 - (t - 0.18) / 0.82);
    }
  }

  // ---- Pointer interaction: horizontal-only follow, tracked across the whole page ----
  // The mascot lines its horizontal position up UNDER the cursor, mapping the cursor x to
  // the world-x at the mascot's depth. It follows the cursor ANYWHERE on the page (not just
  // over the card), but is clamped to a maximum horizontal position so it can't travel past
  // the card's frame. It eases slowly toward the target, and slowly back to centre when the
  // pointer leaves the page. Clicks bubble freely (no preventDefault / stopPropagation).
  const VFOV = 35 * Math.PI / 180;          // matches the camera's vertical fov
  const FOLLOW_DEPTH = camera.position.z;   // mascot sits at z ≈ 0
  const FOLLOW_HALF_H = Math.tan(VFOV / 2) * FOLLOW_DEPTH;
  const FOLLOW_RATE = 0.5;                  // smaller = slower glide (≈2s time constant — 4× slower)
  const FOLLOW_MARGIN = 2.5;                // world units kept clear so the whole mascot stays in frame
  let targetX = 0;

  function pointerToTargetX(clientX) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) { targetX = 0; return; }
    const span = FOLLOW_HALF_H * camera.aspect;              // visible half-width at the mascot's depth
    const maxX = Math.max(0, span - FOLLOW_MARGIN);          // maximum horizontal position
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1; // may exceed ±1 when the cursor is off the card
    targetX = Math.max(-maxX, Math.min(maxX, nx * span));    // world-x under the cursor, clamped to the frame
  }

  window.addEventListener('mousemove', (e) => pointerToTargetX(e.clientX));
  document.addEventListener('mouseleave', () => { targetX = 0; }); // pointer left the page → re-centre

  // ---- Resize (ResizeObserver on the CSS box) ----
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); });
    ro.observe(canvas);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Animation loop (offscreen-paused) ----
  let rafId = null;
  let running = false;
  let last = performance.now();
  const start = last;

  function updateConfetti(dt) {
    const pos = confettiGeo.attributes.position.array;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const ix = i * 3;
      // forward stream toward camera
      pos[ix + 2] += speeds[i] * dt;
      // gentle x/y sway + spin-ish drift
      const ph = swayPhase[i] + last * 0.0011;
      pos[ix + 0] += Math.sin(ph) * swayAmp[i] * dt;
      pos[ix + 1] += Math.cos(ph * 0.7) * swayAmp[i] * 0.5 * dt;
      // recycle once it passes the camera plane → back to the far end at a fresh x/y
      if (pos[ix + 2] > Z_NEAR) {
        pos[ix + 2] = Z_FAR - Math.random() * 4;
        pos[ix + 0] = (Math.random() - 0.5) * X_RANGE;
        pos[ix + 1] = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
      }
    }
    confettiGeo.attributes.position.needsUpdate = true;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = (now - start) / 1000;

    // Horizontal-only pointer follow — slow, frame-rate-independent easing toward the
    // cursor's column (and slowly back to centre when the cursor leaves).
    mascot.position.x += (targetX - mascot.position.x) * (1 - Math.exp(-FOLLOW_RATE * dt));

    if (!reduceMotion) {
      // idle bob + a little press-forward pulse on the lean
      mascot.position.y = Math.sin(t * 1.4) * 0.18;
      poseRoot.rotation.x = LEAN_X + Math.sin(t * 1.4 + 0.5) * 0.02;
      updateConfetti(dt);
      updateClouds(dt);
    }

    renderer.render(scene, camera);
    if (running) rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Static first frame (covers reduced-motion users too).
  renderer.render(scene, camera);

  // Pause RAF when the canvas scrolls offscreen.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (reduceMotion) { resize(); renderer.render(scene, camera); }
          else play();
        } else {
          pause();
        }
      }
    }, { threshold: 0.05 });
    io.observe(canvas);
  } else if (!reduceMotion) {
    play();
  }
}

// ---- CanvasTexture: mauworld folded-paper confetti sprite ----
function confettiTexture() {
  const size = 160, c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), w = size * 0.23, h = size * 0.42;
  x.translate(size / 2, size / 2); x.rotate(Math.PI / 4);
  x.beginPath(); x.moveTo(-w, -h * 0.78); x.lineTo(w, -h); x.lineTo(w * 1.06, h * 0.82); x.lineTo(-w * 0.94, h); x.closePath();
  x.fillStyle = 'rgba(255,255,255,0.98)'; x.fill();
  x.lineWidth = size * 0.028; x.strokeStyle = 'rgba(255,255,255,0.46)'; x.stroke();
  x.beginPath(); x.moveTo(-w * 0.7, -h * 0.16); x.lineTo(w * 0.74, h * 0.1); x.lineWidth = size * 0.02; x.strokeStyle = 'rgba(255,255,255,0.3)'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- CanvasTexture: fluffy cartoon cloud puff (white lobes; tinted by the sprite) ----
function cloudTexture() {
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const lobes = [[0.5, 0.6, 0.32], [0.34, 0.56, 0.24], [0.66, 0.56, 0.24], [0.5, 0.44, 0.27]];
  for (const [cx, cy, r] of lobes) {
    const grad = g.createRadialGradient(cx * size, cy * size, 1, cx * size, cy * size, r * size);
    grad.addColorStop(0, 'rgba(255,255,255,0.96)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx * size, cy * size, r * size, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- CanvasTexture: soft radial ground shadow ----
function groundShadowTexture() {
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(31,47,104,0.55)');
  grad.addColorStop(0.55, 'rgba(31,47,104,0.18)');
  grad.addColorStop(1, 'rgba(31,47,104,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
