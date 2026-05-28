// Wires the 3D CRT screen (window.heroScreen) to a hidden Spotify embed.
// Album art + track list come from /api/playlist; play/pause/next/prev are the
// on-screen icons drawn by hero-computer.js. Playback runs through Spotify's
// IFrame API (full tracks for logged-in listeners, 30s previews otherwise).
//
// Degrades silently: if /api/playlist isn't configured, the CRT keeps showing
// "Sami here," and nothing breaks.
(function () {
  function waitFor(cond, cb, tries) {
    tries = tries == null ? 100 : tries;
    if (cond()) return cb();
    if (tries <= 0) return;
    setTimeout(function () { waitFor(cond, cb, tries - 1); }, 50);
  }

  waitFor(function () {
    return window.heroScreen && document.getElementById('spotify-embed');
  }, init);

  function init() {
    var tracks = [];
    var index = 0;
    var controller = null;
    var ready = false;
    var hasPlayed = false;
    var advancing = false;
    var pending = null;

    fetch('/api/playlist')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        tracks = (d && d.tracks) || [];
        if (!tracks.length) return;
        window.heroScreen.enable();
        window.heroScreen.setArt(tracks[0].art);
        loadIframeApi();
      })
      .catch(function () {});

    function loadIframeApi() {
      window.onSpotifyIframeApiReady = function (IFrameAPI) {
        var el = document.getElementById('spotify-embed');
        IFrameAPI.createController(el, { uri: tracks[0].uri, width: '100%', height: 80 }, function (ctrl) {
          controller = ctrl;
          ctrl.addListener('ready', function () {
            ready = true;
            if (pending) { var p = pending; pending = null; p(); }
          });
          ctrl.addListener('playback_update', function (e) {
            var d = e && e.data;
            if (!d) return;
            window.heroScreen.setPlaying(!d.isPaused);
            if (d.position < 1500) advancing = false;
            if (!advancing && d.duration > 0 && d.position >= d.duration - 800) {
              advancing = true;
              advance(1);
            }
          });
        });
      };
      var s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      document.body.appendChild(s);
    }

    // Run now if the controller is ready, else stash for the 'ready' event.
    function run(fn) {
      if (controller && ready) fn(); else pending = fn;
    }

    function advance(dir) {
      index = (index + dir + tracks.length) % tracks.length;
      window.heroScreen.setArt(tracks[index].art);
      hasPlayed = true;
      run(function () {
        controller.loadUri(tracks[index].uri);
        controller.play();
      });
    }

    window.heroScreen.onControl(function (action) {
      if (action === 'toggle') {
        run(function () {
          if (!hasPlayed) { controller.play(); hasPlayed = true; }
          else controller.togglePlay();
        });
      } else if (action === 'next') {
        advance(1);
      } else if (action === 'prev') {
        advance(-1);
      }
    });
  }
})();
