// vibe-graph.js — VentureLab "cockpit" node graph for the Vibe-Code top-left card.
// A faithful, compact port of atventure's src/canvas-views.jsx: opportunity nodes load in
// (glow + glossy white disk + coloured ring), agent hex markers orbit and attach to them via
// thin tethers, and curved bezier links to other items carry flowing particles. Everything is
// clipped to the card. Clicks bubble to the card (which opens the VentureLab project).
(function () {
  const canvas = document.getElementById('vibe-graph');
  if (!canvas) { console.warn('[vibe-graph] canvas #vibe-graph not found — not mounted.'); return; }
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── atventure palette (oklch) ──
  const PALETTE = {
    lead: 'oklch(58% 0.16 252)', active: 'oklch(58% 0.16 252)', advanced: 'oklch(58% 0.14 145)',
    held: 'oklch(58% 0.04 250)', discounted: 'oklch(64% 0.13 75)', cleared: 'oklch(58% 0.10 25)',
    queued: 'oklch(58% 0.04 250)', thinking: 'oklch(58% 0.16 252)', reading: 'oklch(58% 0.16 252)',
    drafting: 'oklch(64% 0.14 60)', auditing: 'oklch(60% 0.14 95)', responding: 'oklch(60% 0.14 30)',
  };
  const nodeColor = (s) => PALETTE[s] || 'oklch(58% 0.04 250)';
  function alphaHex(n) { return Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0'); }
  function withAlpha(color, a) {
    a = Math.max(0, Math.min(1, a));
    if (color.startsWith('oklch(') && color.endsWith(')')) return color.slice(0, -1) + ' / ' + a.toFixed(3) + ')';
    return color + alphaHex(a);
  }
  function bezierAt(t, p0, p1, p2, p3) { const m = 1 - t; return m*m*m*p0 + 3*m*m*t*p1 + 3*m*t*t*p2 + t*t*t*p3; }
  function computeCp(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1, curv = dist * 0.18;
    const px = -dy / dist * curv, py = dx / dist * curv;
    return { cp1x: from.x + dx*0.30 + px, cp1y: from.y + dy*0.30 + py, cp2x: from.x + dx*0.70 + px, cp2y: from.y + dy*0.70 + py };
  }
  function hexPath(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i, px = x + Math.cos(a)*r, py = y + Math.sin(a)*r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  }

  // ── Graph data (fractions of the card; states chosen to show the palette + activity) ──
  const NODES = [
    { fx: 0.32, fy: 0.13, state: 'lead',       agents: ['thinking', 'reading'], code: 'OPP·07' },
    { fx: 0.71, fy: 0.27, state: 'advanced',   agents: ['auditing'],            code: 'OPP·03' },
    { fx: 0.26, fy: 0.45, state: 'active',     agents: ['drafting'],            code: 'OPP·11' },
    { fx: 0.69, fy: 0.58, state: 'held',       agents: [],                      code: 'OPP·05' },
    { fx: 0.37, fy: 0.74, state: 'discounted', agents: [],                      code: 'OPP·09' },
    { fx: 0.63, fy: 0.88, state: 'queued',     agents: [],                      code: 'OPP·14' },
  ];
  const LINKS = [[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5]];
  // particles ride a subset of links toward the destination
  const PARTICLES = [[0,1],[0,2],[2,4],[3,5]].map(([a,b]) => ({ a, b, t: Math.random(), speed: 0.22 + Math.random()*0.12 }));

  NODES.forEach((n, i) => { n.phase = i * 1.27; n.drift = 0.6 + Math.random()*0.5; n.appear = i * 0.22; });

  let W = 1, H = 1, R = 15, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 400;
    W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.max(11, Math.min(18, Math.min(w, h) * 0.05));
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  // Hover focus: zoom one circle (nearest the cursor) to centre, fade the rest, and label it.
  let hovering = false, zoom = 0, focusIdx = 0, curX = -1, curY = -1;
  const setCur = (e) => { const r = canvas.getBoundingClientRect(); curX = e.clientX - r.left; curY = e.clientY - r.top; };
  canvas.addEventListener('mouseenter', (e) => { hovering = true; setCur(e); });
  canvas.addEventListener('mousemove', setCur);
  canvas.addEventListener('mouseleave', () => { hovering = false; });

  function nodePos(n, time) {
    return {
      x: n.fx * W + Math.sin(time * 0.5 + n.phase) * (R * 0.18 * n.drift),
      y: n.fy * H + Math.cos(time * 0.42 + n.phase) * (R * 0.18 * n.drift),
    };
  }

  function drawNode(n, p, time, alpha, rScale, hideLabel) {
    const r = R * (1 + Math.sin(time * 1.6 + n.phase) * 0.05) * rScale;
    const color = nodeColor(n.state);
    // glow
    const glowR = r * 2.8;
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, glowR);
    g.addColorStop(0, withAlpha(color, 0.42 * alpha)); g.addColorStop(0.55, withAlpha(color, 0.14 * alpha)); g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI*2); ctx.fill();
    // glossy white disk
    const dg = ctx.createRadialGradient(p.x - r*0.25, p.y - r*0.25, r*0.1, p.x, p.y, r);
    dg.addColorStop(0, withAlpha('oklch(99.4% 0.004 80)', alpha)); dg.addColorStop(0.65, withAlpha('oklch(98.5% 0.006 80)', alpha)); dg.addColorStop(1, withAlpha(color, 0.22 * alpha));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
    // ring
    ctx.strokeStyle = withAlpha(color, alpha); ctx.lineWidth = 2;
    if (n.state === 'cleared' || n.state === 'queued') ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    // orbiting status dots (active items)
    if (['thinking','auditing','responding','lead','reading','drafting','active','advanced'].includes(n.state)) {
      const count = n.state === 'lead' ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const a = time * 1.4 + (i / count) * Math.PI * 2 + n.phase;
        ctx.fillStyle = withAlpha(color, 0.85 * alpha);
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a)*(r+7), p.y + Math.sin(a)*(r+7), 1.7 * rScale, 0, Math.PI*2); ctx.fill();
      }
    }
    // expanding "loading" pulse rings (queued / held)
    if (['queued','held'].includes(n.state)) {
      for (let i = 0; i < 2; i++) {
        const ph = ((time * 0.55 + i * 0.5) % 1.0), rr = r + 3 + ph * 20, al = (1 - ph) * 0.32 * alpha;
        ctx.strokeStyle = withAlpha(color, al); ctx.lineWidth = 1.2 * (1 - ph);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI*2); ctx.stroke();
      }
    }
    // tiny code label
    if (!hideLabel) {
      ctx.fillStyle = withAlpha('oklch(48% 0.01 250)', alpha);
      ctx.font = Math.max(8, Math.round(8 * rScale)) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(n.code, p.x, p.y + r + 4);
    }
  }

  function drawAgent(p, r, agentState, slot, total, time, appearK) {
    const color = nodeColor(agentState);
    const startA = -Math.PI / 3, span = (2 * Math.PI) / 3;
    const a = startA + (total > 1 ? (slot / (total - 1)) * span : span / 2);
    const orbitR = r + 13;
    const cx = p.x + Math.cos(a) * orbitR, cy = p.y + Math.sin(a) * orbitR;
    const hr = (5 + Math.sin(time * 4.2 + slot) * 0.7) * appearK;
    // tether
    ctx.strokeStyle = withAlpha(color, 0.45 * appearK); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a)*r, p.y + Math.sin(a)*r); ctx.lineTo(cx, cy); ctx.stroke();
    // hex marker
    hexPath(cx, cy, hr); ctx.fillStyle = withAlpha(color, 0.95 * appearK); ctx.fill();
    hexPath(cx, cy, hr); ctx.strokeStyle = withAlpha(color, appearK); ctx.lineWidth = 1; ctx.stroke();
    // pulse
    const pr = hr + 3 + Math.sin(time * 4.2 + slot) * 1.4;
    ctx.strokeStyle = withAlpha(color, 0.35 * appearK); ctx.lineWidth = 0.8; hexPath(cx, cy, pr); ctx.stroke();
  }

  let raf = null, running = false, last = 0, t0 = 0;
  function render(now) {
    const time = (now - t0) / 1000;
    let dt = (now - last) / 1000; if (!(dt > 0) || dt > 0.05) dt = 1 / 60; last = now;

    ctx.clearRect(0, 0, W, H);
    const pos = NODES.map(n => nodePos(n, time));
    const appear = NODES.map(n => Math.max(0, Math.min(1, (time - n.appear) / 0.7)));

    // Ease zoom toward hover state; while hovering, focus the circle nearest the cursor.
    zoom += ((hovering ? 1 : 0) - zoom) * (1 - Math.exp(-6 * dt));
    if (hovering && curX >= 0) {
      let best = Infinity;
      for (let i = 0; i < NODES.length; i++) { if (appear[i] <= 0) continue; const dx = pos[i].x - curX, dy = pos[i].y - curY, d = dx*dx + dy*dy; if (d < best) { best = d; focusIdx = i; } }
    }
    const fade = 1 - zoom;
    // Size the big stacked verdict, then centre the whole (circle + text) group vertically.
    const VERDICT = ['your', 'business', 'idea', 'sucks', '😞'];
    const vfs = Math.max(13, Math.min((H * 0.5) / (VERDICT.length * 1.08), W * 0.12));
    const vlh = vfs * 1.08;                                  // tight line spacing
    const blockH = VERDICT.length * vlh;
    const fRfull = R * 1.05 * 2.1;                           // approx zoomed circle radius
    const vgap = Math.max(8, vfs * 0.4);
    const groupTop = (H - (2 * fRfull + vgap + blockH)) / 2;
    const center = { x: W / 2, y: groupTop + fRfull };
    const fPos = { x: pos[focusIdx].x + (center.x - pos[focusIdx].x) * zoom, y: pos[focusIdx].y + (center.y - pos[focusIdx].y) * zoom };
    const fRScale = (appear[focusIdx] || 1) * (1 + zoom * 1.1);
    const fR = R * (1 + Math.sin(time * 1.6 + NODES[focusIdx].phase) * 0.05) * fRScale;

    // links (curved, faint) + cache control points
    const cps = LINKS.map(([a, b]) => {
      const cp = computeCp(pos[a], pos[b]);
      const k = Math.min(appear[a], appear[b]);
      const dashed = NODES[b].state === 'queued' || NODES[b].state === 'cleared';
      ctx.strokeStyle = withAlpha('oklch(60% 0.04 250)', 0.30 * k * fade); ctx.lineWidth = 1.1;
      if (dashed) ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(pos[a].x, pos[a].y); ctx.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, pos[b].x, pos[b].y); ctx.stroke();
      ctx.setLineDash([]);
      return cp;
    });

    // particles flowing toward the destination item
    for (const pa of PARTICLES) {
      pa.t += pa.speed * dt; if (pa.t > 1) pa.t = 0;
      const li = LINKS.findIndex(([a, b]) => a === pa.a && b === pa.b);
      const cp = li >= 0 ? cps[li] : null; if (!cp) continue;
      const from = pos[pa.a], to = pos[pa.b], color = nodeColor(NODES[pa.b].state);
      const k = Math.min(appear[pa.a], appear[pa.b]);
      for (let i = 6; i >= 0; i--) {
        const tt = Math.max(0, pa.t - i * 0.038);
        const xx = bezierAt(tt, from.x, cp.cp1x, cp.cp2x, to.x), yy = bezierAt(tt, from.y, cp.cp1y, cp.cp2y, to.y);
        ctx.fillStyle = withAlpha(color, ((6 - i) / 6) * 0.55 * k * fade);
        ctx.beginPath(); ctx.arc(xx, yy, 1.7 * ((6 - i + 1) / 7), 0, Math.PI*2); ctx.fill();
      }
    }

    // nodes + agents — the focused circle zooms to centre at full opacity; the rest fade out.
    NODES.forEach((n, i) => {
      if (appear[i] <= 0) return;
      const focused = i === focusIdx;
      const alpha = focused ? appear[i] : appear[i] * fade;
      if (alpha <= 0.005) return;
      const rScale = focused ? fRScale : appear[i];
      const dp = focused ? fPos : pos[i];
      const r = R * (1 + Math.sin(time * 1.6 + n.phase) * 0.05) * rScale;
      drawNode(n, dp, time, alpha, rScale, focused && zoom > 0.3);
      const aAlpha = appear[i] * fade;   // agents fade out as we zoom in
      if (aAlpha > 0.01) n.agents.forEach((ag, s) => drawAgent(dp, r, ag, s, n.agents.length, time, aAlpha));
    });

    // verdict on the zoomed-in idea — one big word per line, stacked under the centred circle
    if (zoom > 0.02) {
      ctx.fillStyle = 'rgba(24,24,27,' + Math.min(1, zoom).toFixed(2) + ')';
      ctx.font = '800 ' + vfs + 'px Onest, ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const startY = fPos.y + fR + vgap;
      VERDICT.forEach((ln, i) => ctx.fillText(ln, fPos.x, startY + i * vlh));
    }

    if (running) raf = requestAnimationFrame(render);
  }
  function play() { if (running || reduceMotion) return; running = true; t0 = performance.now(); last = t0; raf = requestAnimationFrame(render); }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  if (reduceMotion) { t0 = performance.now(); last = t0; render(t0 + 3000); return; } // static settled frame

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) play(); else pause(); } }, { threshold: 0.05 }).observe(canvas);
  } else { play(); }
})();
