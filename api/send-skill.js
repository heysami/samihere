// Serverless endpoint: email a skill's full prompt to a visitor (Vercel, Node runtime).
//
// Reuses the same env vars as api/chat.js — nothing new to configure if chat works:
//   RESEND_API_KEY            Resend key (required to actually send)
//   RESEND_FROM               sender, default "Sami <onboarding@resend.dev>"
//   CONTACT_EMAIL             optional — also pinged when someone grabs a skill (lead capture)
//   UPSTASH_REDIS_REST_URL    optional — per-IP daily cap so the form can't be abused
//   UPSTASH_REDIS_REST_TOKEN  optional
// Optional:
//   SKILL_MAX_PER_DAY         default "10" requests per IP per day

const RESEND_FROM = process.env.RESEND_FROM || 'Sami <onboarding@resend.dev>';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const MAX_PER_DAY = parseInt(process.env.SKILL_MAX_PER_DAY || '10', 10);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Maps the command the browser sends → the static .md file + a human name.
// Keep this in sync with the SKILLS list in index.html.
const SKILL_FILES = {
  '/prototype':  { file: 'prototype.md',  name: 'Draw the interface' },
  '/wow-me':     { file: 'wow-me.md',      name: 'Design brief that wows' },
  '/vibe-check': { file: 'vibe-check.md',  name: 'Name the vibe' },
};

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

async function sendEmail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error('resend ' + r.status + ' ' + detail);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = body && typeof body.email === 'string' ? body.email.trim() : '';
  const skill = body && typeof body.skill === 'string' ? body.skill.trim() : '';
  const meta = SKILL_FILES[skill];

  if (!EMAIL_RE.test(email) || !meta) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    res.status(503).json({ error: 'Email isn’t set up yet — try again later.' });
    return;
  }

  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || 'unknown';

  // Per-IP daily cap (fail open if Redis is unavailable — don't block real visitors).
  try {
    if (process.env.UPSTASH_REDIS_REST_URL) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `skill:req:${ip}:${day}`;
      const count = parseInt(await redis(['INCR', key]), 10);
      if (count === 1) await redis(['EXPIRE', key, 172800]);
      if (count > MAX_PER_DAY) {
        res.status(429).json({ error: 'You’ve requested a lot today — try again tomorrow.' });
        return;
      }
    }
  } catch (e) {
    // ignore — fail open
  }

  // Read the prompt text from the site's own static file.
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  let md = '';
  try {
    const r = await fetch(`${proto}://${host}/skills/${meta.file}`);
    if (!r.ok) throw new Error('fetch ' + r.status);
    md = await r.text();
  } catch (e) {
    res.status(502).json({ error: 'Couldn’t load the prompt — try again in a moment.' });
    return;
  }

  // Email the full prompt to the visitor.
  try {
    await sendEmail({
      from: RESEND_FROM,
      to: email,
      subject: `Your ${skill} prompt`,
      text:
        `Here’s the full prompt for ${skill} (${meta.name}).\n\n` +
        `Drop it into Claude Code as a skill, or adapt it however you like.\n\n` +
        `----------------------------------------\n\n` +
        `${md}\n\n` +
        `----------------------------------------\n\n` +
        `— Sami`,
    });
  } catch (e) {
    res.status(502).json({ error: 'Couldn’t send the email — try again in a moment.' });
    return;
  }

  // Lead capture: let the owner know someone grabbed a skill (best-effort).
  try {
    if (CONTACT_EMAIL) {
      await sendEmail({
        from: RESEND_FROM,
        to: CONTACT_EMAIL,
        subject: `Someone grabbed ${skill}`,
        text: `${email} requested the ${skill} (${meta.name}) prompt from your portfolio.\n\n(from IP ${ip})`,
      });
    }
  } catch (e) {
    // don't fail the visitor's request over the owner notification
  }

  res.status(200).json({ ok: true });
};
