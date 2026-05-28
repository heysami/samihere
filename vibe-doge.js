// vibe-doge.js — animated ASCII-shader doge meme for the Vibe-Code top-right card.
// Classic block-character doge (twitchquotes) rendered glyph-by-glyph on a canvas, each cell
// coloured by an animated rainbow "plasma" shader with a gentle per-column wave, plus a few
// floating Comic-Sans doge phrases. Clipped to the card; clicks bubble (the card opens Skills).
(function () {
  const canvas = document.getElementById('vibe-doge');
  if (!canvas) { console.warn('[vibe-doge] canvas #vibe-doge not found — not mounted.'); return; }
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Classic doge ASCII (block shading). '░' is the faint backdrop; the rest is the pup.
  const ART = [
    '░░░░░░░▐█▀█▄░░░░░░░░░░▄█▀█▌',
    '░░░░░░░█▐▓░█▄░░░░░░░▄█▀▄▓▐█',
    '░░░░░░░█▐▓▓░████▄▄▄█▀▄▓▓▓▌█',
    '░░░░░▄█▌▀▄▓▓▄▄▄▄▀▀▀▄▓▓▓▓▓▌█',
    '░░░▄█▀▀▄▓█▓▓▓▓▓▓▓▓▓▓▓▓▀░▓▌█',
    '░░█▀▄▓▓▓███▓▓▓███▓▓▓▄░░▄▓▐█▌',
    '░█▌▓▓▓▀▀▓▓▓▓███▓▓▓▓▓▓▓▄▀▓▓▐█',
    '▐█▐██▐░▄▓▓▓▓▓▀▄░▀▓▓▓▓▓▓▓▓▓▌█▌',
    '█▌███▓▓▓▓▓▓▓▓▐░░▄▓▓███▓▓▓▄▀▐█',
    '█▐█▓▀░░▀▓▓▓▓▓▓▓▓▓██████▓▓▓▓▐█▌',
    '▓▄▌▀░▀░▐▀█▄▓▓██████████▓▓▓▌█',
  ];
  const ROWS = ART.length;
  const COLS = ART.reduce((m, l) => Math.max(m, l.length), 0);

  // Doge "speak" — sarcastic jabs at the whole LLM-skills/prompt-engineering scene.
  const PHRASES = [
    { t: 'wow',          h: 50  },
    { t: 'such skill',   h: 130 },
    { t: 'very 10x',     h: 280 },
    { t: 'much prompt',  h: 200 },
    { t: 'so agentic',   h: 340 },
  ];
  PHRASES.forEach((p, i) => { p.fx = [0.07, 0.80, 0.10, 0.78, 0.46][i]; p.fy = [0.16, 0.20, 0.82, 0.80, 0.06][i]; p.phase = i * 1.3; });

  let W = 1, H = 1, dpr = 1, F = 14, cellW = 9, cellH = 14, x0 = 0, y0 = 0;
  function layout() {
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 200;
    W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the art within ~88% of the card on both axes.
    F = Math.max(7, Math.floor(Math.min((W * 0.9) / (COLS * 0.62), (H * 0.86) / ROWS)));
    ctx.font = F + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    cellW = ctx.measureText('█').width || F * 0.6;
    cellH = F * 0.92;
    x0 = (W - cellW * COLS) / 2;
    y0 = (H - cellH * ROWS) / 2;
  }
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(canvas);
  window.addEventListener('resize', layout);
  layout();

  // Hover scramble — while the cursor is over the card the doge's glyphs flicker through a
  // glitchy character set (the shape + faint/bright layout are preserved); it snaps back on leave.
  const SCRAMBLE = '01<>/\\|*+=-#%&$@!?ΨΔΣ▚▞▛▜▟▙█▓▒░▌▐▀▄';
  const randGlyph = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
  let hovering = false, scramble = null, lastScramble = -1;
  canvas.addEventListener('mouseenter', () => { hovering = true; });
  canvas.addEventListener('mouseleave', () => { hovering = false; });

  function draw(time) {
    ctx.clearRect(0, 0, W, H);

    // Refresh the scramble buffer (throttled) while hovering.
    if (hovering) {
      if (!scramble || time - lastScramble > 0.055) {
        scramble = ART.map(line => { let s = ''; for (let i = 0; i < line.length; i++) s += (line[i] === ' ' ? ' ' : randGlyph()); return s; });
        lastScramble = time;
      }
    }

    // Doge glyphs — animated rainbow plasma shader + gentle per-column wave.
    ctx.font = F + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let r = 0; r < ROWS; r++) {
      const line = ART[r];
      const sline = (hovering && scramble) ? scramble[r] : line;   // scrambled glyphs on hover
      const wobble = Math.sin(time * 1.4 + r * 0.5) * (cellH * 0.06);
      for (let c = 0; c < line.length; c++) {
        const base = line[c];
        if (base === ' ') continue;
        const ch = sline[c];
        const faint = base === '░';   // keep the original faint/bright layout (preserves the shape)
        const hue = ((c * 9 - r * 7) + time * 70) % 360;
        const light = 56 + Math.sin((c * 0.5 + r * 0.45) - time * 2.3) * 12;
        const colWave = Math.sin(c * 0.55 + time * 3.0) * (cellH * 0.10);
        ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ', 92%, ' + light.toFixed(0) + '%, ' + (faint ? 0.1 : 1) + ')';
        ctx.fillText(ch, x0 + c * cellW, y0 + r * cellH + wobble + colWave);
      }
    }

    // Floating Comic-Sans doge phrases — bob + alpha shimmer, in the doge rainbow.
    const pf = Math.max(11, Math.min(20, H * 0.085));
    ctx.font = 'italic 700 ' + pf + 'px "Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const p of PHRASES) {
      const bob = Math.sin(time * 1.8 + p.phase) * 4;
      const a = 0.7 + Math.sin(time * 2.4 + p.phase) * 0.3;
      ctx.fillStyle = 'hsla(' + p.h + ', 95%, 58%, ' + a.toFixed(2) + ')';
      ctx.fillText(p.t, p.fx * W, p.fy * H + bob);
    }
  }

  let raf = null, running = false, t0 = 0;
  function frame(now) { draw((now - t0) / 1000); if (running) raf = requestAnimationFrame(frame); }
  function play() { if (running || reduceMotion) return; running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  if (reduceMotion) { draw(0.6); return; } // static rainbow frame
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) play(); else pause(); } }, { threshold: 0.05 }).observe(canvas);
  } else { play(); }
})();
