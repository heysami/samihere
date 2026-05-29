// Serverless endpoint: open a skill link (Vercel, Node runtime).
//
// The browser (skill.html) POSTs { token }. The first time a token is opened we
// stamp openedAt = now and start a 5-minute window; within that window the prompt
// is returned (so refreshes still work). After 5 minutes the token is treated as
// expired and the visitor must request a fresh link.
//
// Env vars (shared with api/send-skill.js):
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   required — holds the tokens
//
// Response shapes (always HTTP 200 so the client can render a friendly state):
//   { status: 'ok', name, skill, content, expiresAt }   // expiresAt = epoch ms
//   { status: 'expired' }                                 // opened too long ago / link is dead
//   { status: 'invalid' }                                 // no/garbage token

const WINDOW_MS = parseInt(process.env.SKILL_WINDOW_MS || '300000', 10); // 5 minutes
const TOKEN_RE = /^[a-f0-9]{16,96}$/;

async function redis(command) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

// Drop a leading YAML front-matter block (--- ... ---) so the prompt reads clean.
function stripFrontmatter(md) {
  return md.replace(/^﻿?\s*---\n[\s\S]*?\n---\n?/, '').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    res.status(503).json({ status: 'invalid', error: 'Not configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!TOKEN_RE.test(token)) {
    res.status(200).json({ status: 'invalid' });
    return;
  }

  const key = `skill:tok:${token}`;
  let rec;
  try {
    const raw = await redis(['GET', key]);
    if (!raw) { res.status(200).json({ status: 'expired' }); return; }
    rec = JSON.parse(raw);
  } catch (e) {
    res.status(502).json({ status: 'invalid', error: 'Lookup failed' });
    return;
  }

  const now = Date.now();
  let openedAt = Number(rec.openedAt) || 0;

  if (openedAt === 0) {
    // First open — start the countdown now and shrink the TTL to the window
    // (plus a small buffer) so the token cleans itself up shortly after expiry.
    openedAt = now;
    rec.openedAt = openedAt;
    try {
      const ttl = Math.ceil(WINDOW_MS / 1000) + 60;
      await redis(['SET', key, JSON.stringify(rec), 'EX', String(ttl)]);
    } catch (e) {
      res.status(502).json({ status: 'invalid', error: 'Update failed' });
      return;
    }
  }

  const expiresAt = openedAt + WINDOW_MS;
  if (now >= expiresAt) {
    res.status(200).json({ status: 'expired' });
    return;
  }

  // Still inside the window — fetch the prompt from the site's own static file.
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  let content = '';
  try {
    const r = await fetch(`${proto}://${host}/skills/${rec.file}`);
    if (!r.ok) throw new Error('fetch ' + r.status);
    content = stripFrontmatter(await r.text());
  } catch (e) {
    res.status(502).json({ status: 'invalid', error: 'Could not load the prompt' });
    return;
  }

  res.status(200).json({ status: 'ok', name: rec.name, skill: rec.skill, content, expiresAt });
};
