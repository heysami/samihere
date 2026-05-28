// hero-computer.js — Three.js scene for the composite hero slot.
// A faithful late-90s beige CRT all-in-one computer (iMac-G3 / boxy-CRT energy),
// 3/4 front view, screen reading "Sami here,". Sits ON the B&W sofa photo behind
// it (transparent clear), with a slow idle float + gentle turntable rock.
//
// Self-initializing ES module: queries #hero-computer, builds the scene, renders
// into the CSS-sized canvas, handles resize, pauses RAF when offscreen, and
// respects prefers-reduced-motion.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.querySelector('#hero-computer');
if (!canvas) {
  console.warn('[hero-computer] canvas #hero-computer not found — scene not mounted.');
} else {
  initScene(canvas);
}

function initScene(canvas) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Renderer (transparent so the sofa photo shows through) ----
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0); // fully transparent clear
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---- Outline pass: a black silhouette of the computer rendered to a SECOND canvas that
  // sits BEHIND the sofa (z-index 0 in the DOM). The sofa hides its lower part, so the black
  // outline is only visible where the CRT rises above the sofa, against the white page. ----
  const outlineCanvas = document.querySelector('#hero-computer-outline');
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const OUTLINE_SCALE = 1.035; // enlarge the silhouette so a thin black rim peeks past the body
  let outlineRenderer = null;
  if (outlineCanvas) {
    outlineRenderer = new THREE.WebGLRenderer({ canvas: outlineCanvas, alpha: true, antialias: true });
    outlineRenderer.setClearColor(0x000000, 0);
    outlineRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  // ---- Scene + camera ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  // 3/4 front view, pulled back a touch so the whole CRT (incl. its top) stays in frame.
  camera.position.set(0.6, 0.45, 7.4);
  camera.lookAt(0, 0.06, 0);

  // ---- Palette: clean old-school Mac OFF-WHITE plastic (white — not grey, not sepia) ----
  const C = {
    body:    0xffffff, // pure white plastic — matches the page background
    bodyDk:  0xf4f4f4, // barely-shaded side
    bezel:   0xffffff, // white front bezel
    glass:   0x23241f, // dark inset screen glass (kept dark for contrast)
    vent:    0xe2e2e2, // soft recessed vents/slot
    foot:    0xdadada, // soft feet
    phosphor:0xf7f7f7, // pale phosphor (screen background)
  };

  // ---- Materials ----
  const matBody  = new THREE.MeshStandardMaterial({ color: C.body,   roughness: 0.82, metalness: 0.03 });
  const matBezel = new THREE.MeshStandardMaterial({ color: C.bezel,  roughness: 0.78, metalness: 0.03 });
  const matBodyDk= new THREE.MeshStandardMaterial({ color: C.bodyDk, roughness: 0.85, metalness: 0.03 });
  const matGlass = new THREE.MeshStandardMaterial({ color: C.glass,  roughness: 0.35, metalness: 0.10 });
  const matVent  = new THREE.MeshStandardMaterial({ color: C.vent,   roughness: 0.9,  metalness: 0.02 });
  const matFoot  = new THREE.MeshStandardMaterial({ color: C.foot,   roughness: 0.7,  metalness: 0.05 });

  // ---- The computer (grouped so we can float/rock the whole thing) ----
  const computer = new THREE.Group();
  scene.add(computer);

  // Helper: rounded box via small bevel-ish geometry (cheap — use BoxGeometry with
  // segment subdivision is enough; for true rounded corners we nudge with a tapered shape).
  function roundedBox(w, h, d, r = 0.08, mat) {
    // Build an extruded rounded-rectangle profile for soft front corners.
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
      curveSegments: 6,
    });
    geo.translate(0, 0, -d / 2);
    return new THREE.Mesh(geo, mat);
  }

  // --- Main CRT body: deep, slightly tapering toward the back ---
  // Front face is the big rounded box; the back is narrower to read as a deep CRT.
  const front = roundedBox(2.5, 2.2, 0.7, 0.18, matBody);
  front.position.set(0, 0.15, 0.55);
  computer.add(front);

  // Tapered rear hull (the deep "tube" housing) — a box scaled down toward the back.
  const rearGeo = new THREE.BoxGeometry(2.2, 1.9, 1.5);
  // taper: move back vertices inward
  const rp = rearGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const z = rp.getZ(i);
    if (z < 0) { // back side
      rp.setX(i, rp.getX(i) * 0.62);
      rp.setY(i, rp.getY(i) * 0.7 + 0.05);
    }
  }
  rearGeo.computeVertexNormals();
  const rear = new THREE.Mesh(rearGeo, matBodyDk);
  rear.position.set(0, 0.15, -0.45);
  computer.add(rear);

  // --- Front bezel ring (a slightly raised lighter frame around the screen) ---
  const bezel = roundedBox(2.34, 2.04, 0.12, 0.22, matBezel);
  bezel.position.set(0, 0.22, 0.94);
  computer.add(bezel);

  // --- Inset dark screen glass (recessed, curved-corner) ---
  const glass = roundedBox(1.78, 1.5, 0.06, 0.16, matGlass);
  glass.position.set(0, 0.32, 0.97);
  computer.add(glass);

  // --- The phosphor display plane (canvas texture with "Sami here,") ---
  const screenTex = makeScreenTexture();
  const matScreen = new THREE.MeshStandardMaterial({
    map: screenTex,
    roughness: 0.5,
    metalness: 0.0,
    emissive: 0xbcbcbe,        // gentle neutral phosphor self-glow
    emissiveMap: screenTex,
    emissiveIntensity: 0.55,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.38), matScreen);
  screen.position.set(0, 0.32, 1.005);
  computer.add(screen);

  // --- Lower front control strip: recessed band holding vents + disk slot ---
  const strip = roundedBox(2.5, 0.62, 0.66, 0.14, matBodyDk);
  strip.position.set(0, -1.18, 0.55);
  computer.add(strip);

  // Disk-drive slot (thin dark recess)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.05), matVent);
  slot.position.set(-0.15, -1.02, 0.92);
  computer.add(slot);

  // Vent grille (a row of thin recessed lines on the lower front)
  const ventGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.035, 0.04), matVent);
    v.position.set(-0.1, -1.26 - i * 0.075, 0.9);
    ventGroup.add(v);
  }
  computer.add(ventGroup);

  // Small power LED dot
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 16),
    new THREE.MeshStandardMaterial({ color: 0x6f7468, emissive: 0x3a3f34, emissiveIntensity: 0.6, roughness: 0.4 })
  );
  led.position.set(0.78, -1.0, 0.93);
  computer.add(led);

  // --- Small feet ---
  const footGeo = new THREE.BoxGeometry(0.3, 0.16, 0.5);
  [-0.85, 0.85].forEach((fx) => {
    const f = new THREE.Mesh(footGeo, matFoot);
    f.position.set(fx, -1.6, 0.35);
    computer.add(f);
  });

  // Lift the whole thing so it sits centered & resting in the slot, and scale it
  // down slightly so there's headroom above the CRT (no top crop).
  computer.position.y = 0.25;
  computer.scale.setScalar(0.88);
  computer.rotation.y = 0.22; // rest at the default right tilt for the first/static frame

  // ---- Lighting: soft studio — key + fill + subtle rim + gentle ambient ----
  // Bright, white, near-uniform studio so the plastic renders essentially #fff (as white as
  // the page background); the dark screen + contact shadow are what define the form.
  const ambient = new THREE.AmbientLight(0xffffff, 2.3);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.9); // white key, upper-left
  key.position.set(-3, 4, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5); // white fill, lower-right
  fill.position.set(3.5, -1, 3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.5);   // subtle rim from behind
  rim.position.set(1.5, 2.5, -4);
  scene.add(rim);

  // ---- Resize handling driven by the CSS-sized canvas ----
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (outlineRenderer) {
      outlineRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      outlineRenderer.setSize(w, h, false);
    }
  }

  // Render the black outline silhouette (behind the sofa) + the normal computer on top.
  function renderAll() {
    if (outlineRenderer) {
      const s = computer.scale.x;
      computer.scale.setScalar(s * OUTLINE_SCALE);
      scene.overrideMaterial = outlineMat;
      outlineRenderer.render(scene, camera);
      scene.overrideMaterial = null;
      computer.scale.setScalar(s);
    }
    renderer.render(scene, camera);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- Animation: gentle float + subtle turntable rock, offscreen-paused ----
  let rafId = null;
  let running = false;
  const start = performance.now();

  // Default pose: facing straight forward. A subtle pointer-follow makes the
  // computer "look" toward the cursor — cursor to the right turns the screen a
  // touch to the right, cursor high tips it up — layered over a faint idle drift.
  const BASE_YAW = 0.22; // default rest pose — tilted toward its right (~ +12.5°)
  const YAW_AMP = 0.26;   // ~15° max horizontal turn toward the pointer (left/right ONLY)
  let targetYaw = 0;   // pointer-driven horizontal offset (0 = rest at BASE_YAW)
  let curYaw = 0;      // eased toward the target each frame

  window.addEventListener('mousemove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;   // -1 (left) … +1 (right)
    targetYaw = nx * YAW_AMP;    // screen turns left/right to face the pointer's side
  });

  function frame(now) {
    const t = (now - start) / 1000;
    // Lazily ease the live yaw toward the pointer target — horizontal only.
    curYaw += (targetYaw - curYaw) * 0.07;
    if (!reduceMotion) {
      // default right tilt + horizontal pointer-follow + a faint idle sway (no mouse pitch)
      computer.rotation.y = BASE_YAW + curYaw + Math.sin(t * 0.35) * 0.025;
      computer.rotation.x = Math.sin(t * 0.45) * 0.01; // faint idle breathing only
      computer.position.y = 0.25 + Math.sin(t * 0.6) * 0.03;
    } else {
      computer.rotation.y = BASE_YAW;
      computer.rotation.x = 0;
    }
    renderAll();
    if (running) rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Render one static frame immediately (so reduced-motion users see it too).
  resize();
  renderAll();

  // Pause RAF when the canvas scrolls offscreen.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (reduceMotion) { resize(); renderAll(); }
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

// ---- CanvasTexture: pale phosphor screen with chunky retro "Sami here," + scanlines ----
function makeScreenTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = Math.round(S * 0.83); // match screen plane aspect (1.66/1.38)
  const g = c.getContext('2d');
  const W = c.width, H = c.height;

  // Pale phosphor background with a soft vignette glow.
  const grad = g.createRadialGradient(W * 0.5, H * 0.45, W * 0.1, W * 0.5, H * 0.5, W * 0.75);
  grad.addColorStop(0, '#eef0ef');
  grad.addColorStop(1, '#d7d8da');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Dark phosphor text — chunky monospace, two lines, left-aligned like the reference.
  g.fillStyle = '#26272b';
  g.textBaseline = 'alphabetic';
  const fontPx = Math.round(H * 0.26);
  g.font = `700 ${fontPx}px "Courier New", "Courier", monospace`;
  // slight letter weight by drawing a faint shadow twice
  const x = W * 0.16;
  g.fillText('Sami', x, H * 0.46);
  g.fillText('here,', x, H * 0.46 + fontPx * 1.12);

  // Faint scanlines for the CRT feel (cheap horizontal stripes).
  g.globalAlpha = 0.06;
  g.fillStyle = '#000000';
  for (let y = 0; y < H; y += 3) {
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;

  // Subtle screen sheen / curvature highlight in the upper-left.
  const sheen = g.createLinearGradient(0, 0, W * 0.7, H * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
