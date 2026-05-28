// Serverless playlist reader (Vercel, Node runtime) — no credentials needed.
//
// Spotify's Web API refuses public playlists via app tokens (403), so instead
// we read the SAME public data Spotify's own embed serves: the playlist embed
// page carries the track list + 30s preview MP3s, and each track's oEmbed gives
// its album art. The CRT player streams the preview MP3s directly, so it works
// for every visitor (no login / Premium needed).
//
// Optional env: SPOTIFY_PLAYLIST_ID (defaults to the playlist below).

const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID || '2KOwOAsQJBEwu4xKscduEq';
const MAX_TRACKS = 100;
const MAX_ART = 60; // per-track art lookups on a cache miss
const UA = 'Mozilla/5.0 (compatible; PortfolioPlayer/1.0)';

let listCache = { value: null, exp: 0 };

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

function findTrackList(o) {
  if (o && typeof o === 'object') {
    if (Array.isArray(o.trackList)) return o.trackList;
    for (const k in o) {
      const r = findTrackList(o[k]);
      if (r) return r;
    }
  }
  return null;
}

function findCover(o) {
  if (o && typeof o === 'object') {
    if (o.coverArt && o.coverArt.sources && o.coverArt.sources[0]) return o.coverArt.sources[0].url;
    for (const k in o) {
      const r = findCover(o[k]);
      if (r) return r;
    }
  }
  return null;
}

// Normalize any Spotify image URL to the CORS-enabled i.scdn.co host so the
// art can be drawn into the WebGL canvas without tainting it.
function toScdn(url) {
  if (!url) return '';
  const m = url.match(/image\/([a-zA-Z0-9]+)/);
  return m ? 'https://i.scdn.co/image/' + m[1] : '';
}

async function artForTrack(trackId, fallback) {
  try {
    const r = await fetch('https://open.spotify.com/oembed?url=https://open.spotify.com/track/' + trackId, {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    return toScdn(j.thumbnail_url) || fallback;
  } catch (e) {
    return fallback;
  }
}

async function getTracks() {
  const now = Date.now();
  if (listCache.value && now < listCache.exp) return listCache.value;

  const r = await fetch('https://open.spotify.com/embed/playlist/' + PLAYLIST_ID, {
    headers: { 'User-Agent': UA },
  });
  if (!r.ok) throw new Error('embed ' + r.status);
  const data = nextData(await r.text());
  if (!data) throw new Error('no embed data (Spotify markup changed?)');

  const tl = findTrackList(data) || [];
  const cover = toScdn(findCover(data));

  let tracks = tl
    .filter((t) => t && t.uri && t.audioPreview && t.audioPreview.url)
    .slice(0, MAX_TRACKS)
    .map((t) => ({
      uri: t.uri,
      id: t.uri.split(':').pop(),
      title: t.title || '',
      artist: t.subtitle || '',
      preview: t.audioPreview.url,
      art: cover,
    }));

  if (!tracks.length) throw new Error('no playable tracks (previews unavailable)');

  // Per-track album art (parallel, capped). Falls back to the playlist cover.
  const head = tracks.slice(0, MAX_ART);
  const arts = await Promise.all(head.map((t) => artForTrack(t.id, cover)));
  head.forEach((t, i) => { t.art = arts[i] || cover; });

  listCache = { value: tracks, exp: now + 10 * 60 * 1000 };
  return tracks;
}

module.exports = async (req, res) => {
  try {
    const tracks = await getTracks();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
    res.status(200).json({ tracks });
  } catch (e) {
    res.status(200).json({ error: String((e && e.message) || e), tracks: [] });
  }
};
