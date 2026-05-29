// Serverless endpoint: email a one-time link to a skill's prompt (Vercel, Node runtime).
//
// Flow: visitor submits their email -> we mint a random token, stash it in Redis,
// and email a link to /skill.html?token=... . The prompt itself is NOT in the email.
// When the link is first opened (see api/skill-open.js) a 5-minute countdown starts;
// after that the link is dead and they have to request it again.
//
// Env vars (same ones api/chat.js already uses):
//   RESEND_API_KEY            Resend key (required to send)
//   RESEND_FROM               sender, default "Sami <onboarding@resend.dev>"
//   UPSTASH_REDIS_REST_URL    required — holds the link tokens
//   UPSTASH_REDIS_REST_TOKEN  required
//   CONTACT_EMAIL             optional — pinged when someone grabs a skill (lead capture)
// Optional:
//   SKILL_MAX_PER_DAY         default "10" requests per IP per day
//   SKILL_LINK_TTL_SEC        default "604800" (7 days) — how long an unopened link lives

const crypto = require('crypto');

const RESEND_FROM = process.env.RESEND_FROM || 'Sami <onboarding@resend.dev>';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const MAX_PER_DAY = parseInt(process.env.SKILL_MAX_PER_DAY || '10', 10);
const LINK_TTL_SEC = parseInt(process.env.SKILL_LINK_TTL_SEC || '604800', 10);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Maps the command the browser sends → the static .md file + a human name.
// Keep this in sync with the SKILLS list in index.html and api/skill-open.js.
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
    res.status(503).json({ error: 'Email isn’t set up yet. Try again later.' });
    return;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    res.status(503).json({ error: 'Link store isn’t set up yet. Try again later.' });
    return;
  }

  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || 'unknown';

  // Per-IP daily cap (fail open if Redis read fails — don't block real visitors).
  try {
    const day = new Date().toISOString().slice(0, 10);
    const capKey = `skill:req:${ip}:${day}`;
    const count = parseInt(await redis(['INCR', capKey]), 10);
    if (count === 1) await redis(['EXPIRE', capKey, 172800]);
    if (count > MAX_PER_DAY) {
      res.status(429).json({ error: 'You’ve requested a lot today. Try again tomorrow.' });
      return;
    }
  } catch (e) {
    // ignore — fail open
  }

  // Mint a single-use token and store what it unlocks. openedAt:0 = not opened yet;
  // the 5-minute countdown only begins on first open (handled in api/skill-open.js).
  const token = crypto.randomBytes(24).toString('hex');
  try {
    const record = JSON.stringify({ skill, file: meta.file, name: meta.name, email, openedAt: 0 });
    await redis(['SET', `skill:tok:${token}`, record, 'EX', String(LINK_TTL_SEC)]);
  } catch (e) {
    res.status(502).json({ error: 'Couldn’t create your link. Try again in a moment.' });
    return;
  }

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const link = `${proto}://${host}/skill.html?token=${token}`;

  // Email the link (not the prompt itself).
  try {
    await sendEmail({
      from: RESEND_FROM,
      to: email,
      subject: `Your link to the ${skill} prompt`,
      text:
        `Here’s your link to the ${skill} (${meta.name}) prompt:\n\n` +
        `${link}\n\n` +
        `Heads up: the moment you open it, a 5-minute timer starts. Once it runs out ` +
        `the link expires and you’ll need to request it again, so have a copy ready when you open it.\n\n` +
        `Cheers,\nSami`,
    });
  } catch (e) {
    res.status(502).json({ error: 'Couldn’t send the email. Try again in a moment.' });
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
