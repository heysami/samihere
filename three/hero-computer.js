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

  // --- The phosphor display: a redrawable canvas texture. Default shows
  // "Sami here,"; once the Spotify glue calls window.heroScreen.enable() it
  // becomes a mini-player (album art + play/pause/prev/next icons). ---
  const SCW = 512, SCH = Math.round(512 * 0.83);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SCW; screenCanvas.height = SCH;
  const sctx = screenCanvas.getContext('2d');

  const player = { mode: 'idle', art: null, playing: false };

  // Control hit-regions (canvas px) — shared by the icon drawing and click test.
  const BAR_H = SCH * 0.26;
  const BAR_Y = SCH - BAR_H;
  const BTN_GAP = SCW * 0.2;
  const BTN_R = BAR_H * 0.3;
  const BTN = {
    prev:   { x: SCW / 2 - BTN_GAP, y: BAR_Y + BAR_H / 2 },
    toggle: { x: SCW / 2,           y: BAR_Y + BAR_H / 2 },
    next:   { x: SCW / 2 + BTN_GAP, y: BAR_Y + BAR_H / 2 },
  };

  function scanlinesAndSheen() {
    const g = sctx, W = SCW, H = SCH;
    // Just a soft corner sheen — no scanlines (they moiré badly on album-art
    // photos once the texture is minified onto the small CRT screen).
    const sheen = g.createLinearGradient(0, 0, W * 0.7, H * 0.7);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  }

  function drawDefault() {
    const g = sctx, W = SCW, H = SCH;
    const grad = g.createRadialGradient(W * 0.5, H * 0.45, W * 0.1, W * 0.5, H * 0.5, W * 0.75);
    grad.addColorStop(0, '#eef0ef'); grad.addColorStop(1, '#d7d8da');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#26272b'; g.textBaseline = 'alphabetic';
    const fontPx = Math.round(H * 0.26);
    g.font = `700 ${fontPx}px "Courier New", "Courier", monospace`;
    const x = W * 0.16;
    g.fillText('Sami', x, H * 0.46);
    g.fillText('here,', x, H * 0.46 + fontPx * 1.12);
    scanlinesAndSheen();
  }

  function drawCover(img) {
    const W = SCW, H = BAR_Y; // art fills the area above the control bar
    const ir = img.width / img.height, ar = W / H;
    let dw, dh;
    if (ir > ar) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    sctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  function icon(name, x, y) {
    const g = sctx, r = BTN_R;
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.97)';
    if (name === 'next' || name === 'prev') {
      const s = name === 'prev' ? -1 : 1;
      const tw = r * 0.78, th = r * 0.9;
      for (const off of [-tw * 0.5, tw * 0.45]) {
        g.beginPath();
        g.moveTo(x + s * (off - tw / 2), y - th / 2);
        g.lineTo(x + s * (off + tw / 2), y);
        g.lineTo(x + s * (off - tw / 2), y + th / 2);
        g.closePath(); g.fill();
      }
      g.fillRect(x + s * (tw * 0.95), y - th / 2, Math.max(2, r * 0.18), th);
    } else if (name === 'play') {
      const s = r * 0.95;
      g.beginPath();
      g.moveTo(x - s * 0.42, y - s * 0.62);
      g.lineTo(x + s * 0.72, y);
      g.lineTo(x - s * 0.42, y + s * 0.62);
      g.closePath(); g.fill();
    } else if (name === 'pause') {
      const bw = r * 0.34, bh = r * 1.25, gap = r * 0.32;
      g.fillRect(x - gap - bw, y - bh / 2, bw, bh);
      g.fillRect(x + gap, y - bh / 2, bw, bh);
    }
    g.restore();
  }

  function drawPlayer() {
    const g = sctx, W = SCW, H = SCH;
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    if (player.art) { try { drawCover(player.art); } catch (e) {} }
    const sh = g.createLinearGradient(0, BAR_Y - BAR_H * 0.5, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.74)');
    g.fillStyle = sh; g.fillRect(0, BAR_Y - BAR_H * 0.5, W, H - (BAR_Y - BAR_H * 0.5));
    icon('prev', BTN.prev.x, BTN.prev.y);
    icon(player.playing ? 'pause' : 'play', BTN.toggle.x, BTN.toggle.y);
    icon('next', BTN.next.x, BTN.next.y);
    scanlinesAndSheen();
  }

  // The 512-px screen canvas is minified ~5-6× onto the small CRT plane, which is
  // also viewed at an angle. Without mipmaps + anisotropy the high-contrast album
  // art aliases into a dark cross-hatch/halftone moiré (the "glitch"). Trilinear
  // mipmapping + max anisotropy gives a clean, properly downsampled image.
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  function makeScreenTexture() {
    const t = new THREE.CanvasTexture(screenCanvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = MAX_ANISO;
    return t;
  }

  function refresh() {
    if (player.mode === 'player') drawPlayer(); else drawDefault();
    // Recreate the texture so the GPU re-uploads reliably across the dual-renderer
    // scene (main + outline contexts).
    const t = makeScreenTexture();
    if (screenTex) screenTex.dispose();
    screenTex = t;
    matScreen.map = t;
    matScreen.needsUpdate = true;
  }

  drawDefault();
  let screenTex = makeScreenTexture();

  // Unlit so the screen is self-illuminated (a real display), showing album art
  // at full brightness/colour instead of being darkened by scene lighting.
  // polygonOffset biases the screen toward the camera in depth so it never
  // z-fights with the dark glass just behind it (z=0.97) — that fight was the
  // "glitch": the glass punching through the album art in a hatched pattern as
  // the computer tilts.
  const matScreen = new THREE.MeshBasicMaterial({
    map: screenTex, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.38), matScreen);
  screen.position.set(0, 0.32, 1.03);
  computer.add(screen);

  // TEMP DEBUG — read-only accessor to inspect the screen texture source. Remove after diagnosing.
  window.__heroSrc = function () {
    let grid = null, err = null;
    try {
      const cols = 6, rows = 5, g = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          const x = Math.round((c + 0.5) / cols * SCW);
          const y = Math.round((r + 0.5) / rows * SCH);
          const p = sctx.getImageData(x, y, 1, 1).data;
          row.push([p[0], p[1], p[2]]);
        }
        g.push(row);
      }
      grid = g;
    } catch (e) { err = String(e); }
    return { mode: player.mode, hasArt: !!player.art,
      artNatural: player.art ? [player.art.naturalWidth, player.art.naturalHeight] : null,
      artSrc: player.art ? player.art.src.slice(-24) : null,
      size: [screenCanvas.width, screenCanvas.height], err, grid };
  };

  // TEMP DEBUG — render via the MAIN renderer only (no outline pass) and read back
  // the framebuffer to get ground-truth rendered pixels. Remove after diagnosing.
  window.__heroRender = function () {
    const gl = renderer.getContext();
    renderer.render(scene, camera);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const x0 = Math.floor(W * 0.30), x1 = Math.floor(W * 0.72);
    const y0 = Math.floor(H * 0.22), y1 = Math.floor(H * 0.66);
    const cols = 30, rows = 22, grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const px = Math.floor(x0 + (c + 0.5) / cols * (x1 - x0));
        const pyTop = Math.floor(y0 + (r + 0.5) / rows * (y1 - y0));
        const py = H - 1 - pyTop; // flip: readPixels is bottom-left
        const i = (py * W + px) * 4;
        row.push(Math.round(0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]));
      }
      grid.push(row.join(','));
    }
    return { size: [W, H], glError: gl.getError(), rows: grid,
      cfg: {
        outputColorSpace: renderer.outputColorSpace,
        toneMapping: renderer.toneMapping,
        isWebGL2: renderer.capabilities.isWebGL2,
        maxAniso: MAX_ANISO,
        mapColorSpace: matScreen.map ? matScreen.map.colorSpace : null,
        mapMinFilter: matScreen.map ? matScreen.map.minFilter : null,
        mapMagFilter: matScreen.map ? matScreen.map.magFilter : null,
        mapGenMips: matScreen.map ? matScreen.map.generateMipmaps : null,
        mapFlipY: matScreen.map ? matScreen.map.flipY : null,
        mapAniso: matScreen.map ? matScreen.map.anisotropy : null,
        matColor: matScreen.color.getHex(),
        matToneMapped: matScreen.toneMapped,
        matTransparent: matScreen.transparent,
        matOpacity: matScreen.opacity,
      } };
  };

  // TEMP DEBUG — read back the average brightness of EACH mip level of the screen
  // texture. If coarse mips are dark, that's why the minified screen renders dark.
  window.__heroTex = function () {
    renderer.render(scene, camera); // ensure current texture is uploaded
    const tex = matScreen.map;
    const gl = renderer.getContext();
    const glTex = renderer.properties.get(tex).__webglTexture;
    if (!glTex) return { glTexExists: false };
    const W0 = tex.image.width, H0 = tex.image.height;
    const levels = [];
    for (let lvl = 0; lvl < 10; lvl++) {
      const w = Math.max(1, W0 >> lvl), h = Math.max(1, H0 >> lvl);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, lvl);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      let avg = null;
      if (ok) {
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let sum = 0, n = 0;
        for (let i = 0; i < buf.length; i += 4) {
          sum += 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++;
        }
        avg = Math.round(sum / n);
      }
      levels.push({ lvl, w, h, ok, avgLuma: avg });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      if (w === 1 && h === 1) break;
    }
    if (renderer.resetState) renderer.resetState();
    return { glTexExists: true, texSize: [W0, H0], levels };
  };

  // TEMP DEBUG — reconstruct the main-renderer framebuffer as a PNG dataURL (flipped,
  // composited over white) so the true render can be viewed. Remove after diagnosing.
  window.__heroRenderImg = function () {
    const gl = renderer.getContext();
    renderer.render(scene, camera);
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const o = out.getContext('2d');
    const img = o.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const sy = H - 1 - y;
      for (let x = 0; x < W; x++) {
        const si = (sy * W + x) * 4, di = (y * W + x) * 4;
        const a = buf[si + 3] / 255;
        img.data[di]     = Math.round(buf[si]     * a + 255 * (1 - a));
        img.data[di + 1] = Math.round(buf[si + 1] * a + 255 * (1 - a));
        img.data[di + 2] = Math.round(buf[si + 2] * a + 255 * (1 - a));
        img.data[di + 3] = 255;
      }
    }
    o.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  };

  // ---- Pointer picking: map a screen-space click onto the CRT plane's UV,
  // then to a control icon. Works regardless of DOM stacking (listens on window). ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let controlCb = null;

  function pickControl(clientX, clientY) {
    if (player.mode !== 'player') return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(screen, false)[0];
    if (!hit || !hit.uv) return null;
    const px = hit.uv.x * SCW;
    const py = (1 - hit.uv.y) * SCH;
    let best = null, bestD = BTN_R * 1.7;
    for (const k of ['prev', 'toggle', 'next']) {
      const d = Math.hypot(px - BTN[k].x, py - BTN[k].y);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  window.addEventListener('mousemove', (e) => {
    if (player.mode === 'player') canvas.style.cursor = pickControl(e.clientX, e.clientY) ? 'pointer' : '';
  });
  window.addEventListener('click', (e) => {
    const ctrl = pickControl(e.clientX, e.clientY);
    if (ctrl && controlCb) controlCb(ctrl);
  });

  // ---- Public API for the Spotify glue (spotify-player.js) ----
  window.heroScreen = {
    enable() { player.mode = 'player'; refresh(); },
    disable() { player.mode = 'idle'; refresh(); },
    setArt(url) {
      if (!url) { player.art = null; refresh(); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { player.art = img; refresh(); };
      img.onerror = () => { player.art = null; refresh(); };
      img.src = url;
    },
    setPlaying(b) { player.playing = !!b; refresh(); },
    onControl(cb) { controlCb = cb; },
  };

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
