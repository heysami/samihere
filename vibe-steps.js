// vibe-steps.js — Matter.js physics for the Vibe-Code bottom-right card.
// Funny "step" nodes (diregram rounded-node style) are spawned at the BOTTOM and gently
// pushed UP in an endless rising column. They're rigid bodies under gravity, so a mouse
// collider that sweeps through them knocks them loose and they tumble/fall. Everything is
// clipped to the card. Clicks bubble to the card (which opens the dire selector).
(function () {
  const container = document.getElementById('vibe-steps');
  if (!container || typeof Matter === 'undefined') {
    if (!window.Matter) console.warn('[vibe-steps] Matter.js not loaded — sim not mounted.');
    return;
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STEPS = [
    'Snooze the alarm again', 'Make a strong coffee', 'Lose the other sock',
    'Reply "on my way" (not ready)', 'Pet a passing dog', 'Overthink the text back',
    'Find keys, lose phone', 'Open fridge, close fridge', 'Add to cart, don’t buy',
    'Water the sad plant', 'Take the scenic route', 'Queue for good coffee',
    'Fold laundry tomorrow', 'Microwave the tea twice', 'Plan a nap, skip it',
    'Walk in, forget why', 'Reorganise the junk drawer', 'Start a new hobby',
    'Win the shower argument', 'Doomscroll five minutes', 'Promise to sleep early',
  ];
  const pickStep = () => STEPS[(Math.random() * STEPS.length) | 0];
  const code2 = () => String(10 + ((Math.random() * 89) | 0));

  const M = Matter;
  const engine = M.Engine.create();
  engine.gravity.y = 1;        // downward — so knocked nodes "fall"
  engine.gravity.scale = 0.001;
  const world = engine.world;
  const G = engine.gravity.y * engine.gravity.scale;

  let W = container.clientWidth || 300;
  let H = container.clientHeight || 400;

  // Static side walls keep the column bounded horizontally; top & bottom stay open (cropped).
  let wallL, wallR;
  function buildWalls() {
    if (wallL) M.Composite.remove(world, [wallL, wallR]);
    wallL = M.Bodies.rectangle(-26, H / 2, 50, H * 4, { isStatic: true });
    wallR = M.Bodies.rectangle(W + 26, H / 2, 50, H * 4, { isStatic: true });
    M.Composite.add(world, [wallL, wallR]);
  }
  buildWalls();

  // Mouse collider — a static circle teleported to the cursor; sweeping it shoves nodes.
  const mouseBody = M.Bodies.circle(-1000, -1000, 17, { isStatic: true });
  M.Composite.add(world, mouseBody);
  let mouseOver = false, mx = -1000, my = -1000;
  window.addEventListener('mousemove', (e) => {
    const r = container.getBoundingClientRect();
    if (!r.width) return;
    mx = e.clientX - r.left; my = e.clientY - r.top;
    mouseOver = mx >= -20 && mx <= r.width + 20 && my >= -20 && my <= r.height + 20;
  });
  window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) mouseOver = false; });

  // Knock detection: nodes touched by the mouse stop being "lifted" for a moment, so
  // gravity pulls them down and they fall/tumble through the others.
  M.Events.on(engine, 'collisionStart', (ev) => {
    for (const p of ev.pairs) {
      const other = p.bodyA === mouseBody ? p.bodyB : (p.bodyB === mouseBody ? p.bodyA : null);
      if (other && other.plugin && other.plugin.el) {
        other.plugin.disturbedUntil = performance.now() + 1400;
        const dir = Math.sign(other.position.x - mx) || (Math.random() < 0.5 ? -1 : 1);
        M.Body.applyForce(other, other.position, { x: dir * 0.012 * other.mass, y: 0.02 * other.mass });
      }
    }
  });

  const nodes = [];
  const MAX_NODES = 9;
  const NODE_W = () => Math.round(Math.min(W - 14, 250));

  function spawnNode(atBottom = true) {
    const el = document.createElement('div');
    const dark = Math.random() < 0.22;
    el.className = 'dnode' + (dark ? ' is-dark' : '');
    el.innerHTML =
      '<div class="dnode-top"><span class="dnode-kind">PROCESS</span><span class="dnode-code">L:' + code2() + '</span></div>' +
      '<div class="dnode-title">' + pickStep() + '</div>';
    const w = NODE_W();
    el.style.width = w + 'px';
    container.appendChild(el);
    const h = Math.max(44, el.offsetHeight);

    const x = W / 2 + (Math.random() - 0.5) * Math.min(W * 0.14, 26);
    const y = atBottom ? (H + h * 0.6) : (H - 30 - nodes.length * (h + 8));
    const body = M.Bodies.rectangle(x, y, w, h, {
      chamfer: { radius: 10 },
      frictionAir: 0.05,
      friction: 0.35,
      restitution: 0.16,
      density: 0.0016,
    });
    body.plugin = { el, w, h, disturbedUntil: 0 };
    M.Composite.add(world, body);
    nodes.push(body);
  }

  function cull() {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const b = nodes[i];
      const { h, el } = b.plugin;
      if (b.position.y < -h * 1.2 || b.position.y > H + h * 2.2 || b.position.x < -W || b.position.x > W * 2) {
        el.remove();
        M.Composite.remove(world, b);
        nodes.splice(i, 1);
      }
    }
  }

  const MAXV = 16; // clamp so a fast swipe can't launch a node off to infinity
  function step(dtMs) {
    const now = performance.now();
    // Lift each undisturbed node so the column rises; disturbed ones fall under gravity.
    // Undisturbed nodes are also eased back upright, so they rise cleanly with no
    // auto-tumble — only a mouse hit makes them spin.
    for (const b of nodes) {
      if (now > b.plugin.disturbedUntil) {
        M.Body.applyForce(b, b.position, { x: 0, y: -b.mass * G * 1.45 });
        M.Body.setAngle(b, b.angle * 0.82);
        M.Body.setAngularVelocity(b, b.angularVelocity * 0.55);
      }
    }
    M.Body.setPosition(mouseBody, { x: mouseOver ? mx : -1000, y: mouseOver ? my : -1000 });
    M.Engine.update(engine, dtMs);
    for (const b of nodes) {
      const v = b.velocity, sp = Math.hypot(v.x, v.y);
      if (sp > MAXV) M.Body.setVelocity(b, { x: (v.x / sp) * MAXV, y: (v.y / sp) * MAXV });
      const p = b.plugin;
      p.el.style.transform =
        'translate3d(' + (b.position.x - p.w / 2).toFixed(1) + 'px,' + (b.position.y - p.h / 2).toFixed(1) + 'px,0) rotate(' + b.angle.toFixed(4) + 'rad)';
    }
    cull();
  }

  // ---- Loop + spawning (offscreen-paused) ----
  let raf = null, running = false, last = 0, spawnAcc = 0;
  const SPAWN_MS = 1050;
  function frame(now) {
    const dt = Math.min(now - last, 40); last = now;
    spawnAcc += dt;
    if (spawnAcc >= SPAWN_MS) { spawnAcc -= SPAWN_MS; if (nodes.length < MAX_NODES) spawnNode(true); }
    step(dt || 16.7);
    if (running) raf = requestAnimationFrame(frame);
  }
  function play() { if (running || reduceMotion) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  function resize() {
    W = container.clientWidth || W; H = container.clientHeight || H;
    buildWalls();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);

  if (reduceMotion) {
    // Static fallback: a small resting stack, no motion.
    for (let i = 0; i < 3; i++) spawnNode(false);
    step(16.7);
    return;
  }

  // Seed a couple so the card isn't empty on first paint, then animate when visible.
  spawnNode(false); spawnNode(false);
  step(16.7);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) play(); else pause(); }
    }, { threshold: 0.05 }).observe(container);
  } else {
    play();
  }
})();
