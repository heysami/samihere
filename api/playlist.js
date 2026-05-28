// Serverless playlist reader (Vercel, Node runtime).
//
// Uses Spotify's Client-Credentials flow (your app's id/secret, server-side —
// no visitor login) to read a public playlist and return each track's URI,
// title, artist, and album-art URL. The CRT player uses this for artwork and
// for next/previous. Set in Vercel → Settings → Environment Variables:
//   SPOTIFY_CLIENT_ID       from developer.spotify.com/dashboard
//   SPOTIFY_CLIENT_SECRET   from the same app's settings
// Optional:
//   SPOTIFY_PLAYLIST_ID     defaults to the playlist below

const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID || '2KOwOAsQJBEwu4xKscduEq';
const MAX_TRACKS = 200;

let tokenCache = { value: null, exp: 0 };
let listCache = { value: null, exp: 0 };

async function getToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.exp) return tokenCache.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('missing Spotify credentials');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error_description || j.error || 'token error'));
  tokenCache = { value: j.access_token, exp: now + (j.expires_in - 60) * 1000 };
  return tokenCache.value;
}

async function getTracks() {
  const now = Date.now();
  if (listCache.value && now < listCache.exp) return listCache.value;
  const token = await getToken();
  const fields = 'items(track(uri,name,artists(name),album(images))),next';
  let url =
    'https://api.spotify.com/v1/playlists/' +
    PLAYLIST_ID +
    '/tracks?limit=100&fields=' +
    encodeURIComponent(fields);
  const out = [];
  while (url && out.length < MAX_TRACKS) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'playlist error');
    for (const it of j.items || []) {
      const t = it && it.track;
      if (!t || !t.uri || t.uri.startsWith('spotify:local')) continue;
      const imgs = (t.album && t.album.images) || [];
      out.push({
        uri: t.uri,
        name: t.name || '',
        artist: (t.artists || []).map((a) => a.name).join(', '),
        art: (imgs[0] && imgs[0].url) || '',
      });
    }
    url = j.next;
  }
  listCache = { value: out, exp: now + 10 * 60 * 1000 }; // 10-minute cache
  return out;
}

module.exports = async (req, res) => {
  try {
    const tracks = await getTracks();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    res.status(200).json({ tracks });
  } catch (e) {
    res.status(500).json({ error: 'playlist unavailable', tracks: [] });
  }
};
