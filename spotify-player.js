// Drives the 3D CRT screen (window.heroScreen) as a music player.
// Track list, album art, and 30s preview MP3s come from /api/playlist; audio
// plays through a plain <audio> element, so play/pause/next/prev all work for
// every visitor — no Spotify login, Premium, or iframe required.
//
// Degrades silently: if /api/playlist returns nothing, the CRT keeps showing
// "Sami here," and nothing breaks.
(function () {
  function waitFor(cond, cb, tries) {
    tries = tries == null ? 100 : tries;
    if (cond()) return cb();
    if (tries <= 0) return;
    setTimeout(function () { waitFor(cond, cb, tries - 1); }, 50);
  }

  waitFor(function () { return !!window.heroScreen; }, init);

  function init() {
    var tracks = [];
    var index = 0;
    var audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', function () { load(index + 1, true); });
    audio.addEventListener('play', function () { window.heroScreen.setPlaying(true); showNowPlaying(true); });
    audio.addEventListener('pause', function () { window.heroScreen.setPlaying(false); showNowPlaying(false); });

    fetch('/api/playlist')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        tracks = (d && d.tracks) || [];
        if (!tracks.length) return;
        window.heroScreen.enable();
        load(0, false); // show first track's art, ready to play on click
      })
      .catch(function () {});

    function load(i, playNow) {
      index = (i + tracks.length) % tracks.length;
      var t = tracks[index];
      window.heroScreen.setArt(t.art);
      setNowPlaying(t.title, t.artist);
      audio.src = t.preview;
      if (playNow) audio.play().catch(function () {});
    }

    function setNowPlaying(title, artist) {
      var t = document.getElementById('np-title');
      var a = document.getElementById('np-artist');
      if (t) t.textContent = title || '';
      if (a) a.textContent = artist || '';
    }

    // Title/artist are only shown while audio is actually playing.
    function showNowPlaying(show) {
      var wrap = document.getElementById('hero-nowplaying');
      if (wrap) wrap.style.opacity = show ? '1' : '0';
    }

    window.heroScreen.onControl(function (action) {
      if (action === 'toggle') {
        if (audio.paused) audio.play().catch(function () {});
        else audio.pause();
      } else if (action === 'next') {
        load(index + 1, true);
      } else if (action === 'prev') {
        load(index - 1, true);
      }
    });
  }
})();
