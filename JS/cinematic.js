/* ==========================================================================
   RMACE — Cinematic scroll frame-sequence engine (ramw.html hero)
   ---------------------------------------------------------------------------
   Scrubs the Unreal Engine WebP frame sequence across the hero section's
   scroll range:

       frames/frame_0001.webp … frames/frame_1438.webp   (FRAME_COUNT = 1438)

   Rules enforced by this engine:
   · progress  = (scrollY - sectionTop) / (sectionHeight - viewportHeight)
                 clamped to [0, 1]
   · frameIndex = floor(progress × (FRAME_COUNT - 1)), clamped to [0, 1437]
     → top of section = frame 1 · bottom of section = frame 1438
   · scroll position is the ONLY driver — no autoplay, fully reversible
   · ONE <canvas> (cover-fit, aspect preserved) — no 1438 <img> elements
   · progressive chunked preloading prioritised around the scroll position,
     concurrency-limited, with a memory cap + distance-based eviction
     (no duplicate Image objects — one slot per frame)
   · nearest-ready frame rendering: slow networks never flash black
   · render loop = requestAnimationFrame; scroll handler only marks dirty
   ========================================================================== */

(function () {
  "use strict";

  var section = document.querySelector(".cinematic-scroll-section");
  var canvas = document.getElementById("cinematicCanvas");
  if (!section || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var stage = canvas.parentElement || section;

  /* ---------- Configuration ---------- */
  var FRAME_COUNT = 1438;        // frame_0001.webp … frame_1438.webp
  var LOAD_CONCURRENCY = 8;      // simultaneous image downloads
  var INITIAL_CHUNK = 24;        // frames requested immediately on load
  var PRIORITY_WINDOW = 90;      // preloading ring around the scroll position
  var MAX_CACHED = 280;          // in-memory Image cap (LRU-style eviction)
  var EVICT_DISTANCE = 320;      // never evict within ±this range of current
  var NEAR_SEARCH = 160;         // nearest-ready fallback search radius
  var END_FADE_START = 0.92;     // progress where the cinematic fade-out begins
  var LOADER_TARGET = 60;        // "enough frames" threshold for the loader

  var loader = document.getElementById("cinematicLoader");
  var loaderPct = document.getElementById("cinematicLoaderPct");

  /* ---------- State ---------- */
  var states = new Array(FRAME_COUNT);  // 0 idle · 1 loading · 2 ready · 3 failed
  var images = new Array(FRAME_COUNT);  // one Image slot per frame (reused)
  var retries = new Array(FRAME_COUNT);
  var readyCount = 0;
  var activeLoads = 0;
  var bgCursor = 0;                     // sequential background sweep position
  var current = 0;                      // target frame index (from scroll)
  var drawn = -1;                       // index actually painted on the canvas
  var lastOpacity = -1;
  var hasDrawn = false;
  var repaint = false;                  // force a repaint (resize / better frame)
  var loaderHidden = false;
  var startedAt = new Date().getTime();

  function now() { return new Date().getTime(); }

  function frameUrl(i) {
    var n = String(i + 1);
    while (n.length < 4) n = "0" + n;
    return "frames/frame_" + n + ".webp";
  }

  /* ---------- Loading ---------- */
  function requestFrame(i) {
    if (i < 0 || i >= FRAME_COUNT) return;
    if (states[i] || activeLoads >= LOAD_CONCURRENCY) return;
    states[i] = 1;
    activeLoads++;

    var img = new Image();
    images[i] = img;
    img.__fpFrame = i;
    img.decoding = "async";

    img.onload = function () {
      activeLoads--;
      if (states[i] === 1) {
        states[i] = 2;
        readyCount++;
        /* Warm the decoded bitmap for frames close to the scroll position so
           scrubbing stays smooth (browser-managed decode cache). */
        if (img.decode && Math.abs(i - current) <= 45) {
          try { img.decode().catch(function () {}); } catch (e) {}
        }
        if (Math.abs(i - current) <= NEAR_SEARCH) repaint = true;
      }
    };

    img.onerror = function () {
      activeLoads--;
      retries[i] = (retries[i] || 0) + 1;
      if (retries[i] <= 2) {
        states[i] = 0;            /* let the scheduler try again later */
      } else {
        states[i] = 3;            /* permanent failure — nearest-ready covers it */
      }
    };

    img.src = frameUrl(i);
  }

  /* Progressive scheduler: priority ring around the scroll position first,
     then a gentle sequential background sweep (memory-cap aware). */
  function pumpLoads() {
    var d;
    for (d = 0; d <= PRIORITY_WINDOW && activeLoads < LOAD_CONCURRENCY; d++) {
      requestFrame(current + d);
      if (d > 0) requestFrame(current - d);
    }
    var guard = 0;
    while (
      activeLoads < LOAD_CONCURRENCY &&
      guard < FRAME_COUNT &&
      (readyCount + activeLoads) < MAX_CACHED
    ) {
      var i = bgCursor;
      bgCursor = (bgCursor + 1) % FRAME_COUNT;
      guard++;
      if (!states[i]) requestFrame(i);
    }
  }

  /* Free the farthest-away ready frames when the cache overflows. */
  function evictIfNeeded() {
    var guard = 0;
    while (readyCount > MAX_CACHED && guard < 400) {
      guard++;
      var far = -1;
      var farDist = EVICT_DISTANCE;
      for (var i = 0; i < FRAME_COUNT; i++) {
        if (states[i] !== 2 || i === drawn) continue;
        var dist = Math.abs(i - current);
        if (dist > farDist) { farDist = dist; far = i; }
      }
      if (far < 0) break;          /* nothing evictable right now */
      states[far] = 0;
      images[far] = null;          /* HTTP cache serves it again if needed */
      readyCount--;
    }
  }

  /* Nearest ready frame (spiral search) — never flash black. */
  function nearestReady(i) {
    if (states[i] === 2) return images[i];
    for (var d = 1; d <= NEAR_SEARCH; d++) {
      if (i - d >= 0 && states[i - d] === 2) return images[i - d];
      if (i + d < FRAME_COUNT && states[i + d] === 2) return images[i + d];
    }
    return null;
  }

  /* ---------- Rendering (cover-fit — aspect ratio preserved) ---------- */
  function paint(img) {
    var fw = img.naturalWidth;
    var fh = img.naturalHeight;
    if (!fw || !fh) return;
    var cw = canvas.width;
    var ch = canvas.height;
    var s = Math.max(cw / fw, ch / fh);
    var dw = fw * s;
    var dh = fh * s;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    drawn = img.__fpFrame;
    hasDrawn = true;
  }

  /* ---------- Progress: normalized scroll → frame index ---------- */
  function computeProgress() {
    var rect = section.getBoundingClientRect();
    var viewH = window.innerHeight || document.documentElement.clientHeight;
    var scrollable = section.offsetHeight - viewH;
    if (scrollable <= 0) return 0;
    var p = -rect.top / scrollable;      /* == (scrollY - sectionTop) / scrollable */
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    return p;
  }

  /* ---------- Loader ---------- */
  function updateLoader() {
    if (loaderHidden || !loader) return;
    if (loaderPct) {
      var pct = Math.min(100, Math.round((readyCount / LOADER_TARGET) * 100));
      loaderPct.textContent = pct + "%";
    }
    var enough = readyCount >= LOADER_TARGET;
    var drawnAndSteady = hasDrawn && readyCount >= 6 && now() - startedAt > 6000;
    var gaveUp = now() - startedAt > 10000;   /* offline / all-failed safety */
    if (enough || drawnAndSteady || gaveUp) hideLoader();
  }

  function hideLoader() {
    if (loaderHidden || !loader) return;
    loaderHidden = true;
    loader.classList.add("is-done");
    window.setTimeout(function () { loader.hidden = true; }, 700);
  }

  /* ---------- Canvas sizing (high-DPI aware) ---------- */
  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || window.innerHeight;
    var pw = Math.max(1, Math.round(w * dpr));
    var ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      repaint = true;              /* re-render at the new resolution */
    }
  }

  /* ---------- Render loop ---------- */
  function tickBody() {
    var p = computeProgress();
    var idx = Math.floor(p * (FRAME_COUNT - 1));
    if (idx < 0) idx = 0;
    if (idx > FRAME_COUNT - 1) idx = FRAME_COUNT - 1;

    pumpLoads();
    evictIfNeeded();
    updateLoader();

    if (idx !== current || repaint) {
      current = idx;
      repaint = false;
      var img = nearestReady(idx);
      if (img && img.__fpFrame !== drawn) paint(img);
    }

    /* Load-in fade + end-of-section fade-out (smooth handoff to next section) */
    var fade = 1;
    if (p > END_FADE_START) {
      fade = 1 - (p - END_FADE_START) / (1 - END_FADE_START);
      if (fade < 0) fade = 0;
    }
    var target = hasDrawn ? fade : 0;
    if (target !== lastOpacity) {
      lastOpacity = target;
      canvas.style.opacity = String(target);
    }
  }

  function tick() {
    window.requestAnimationFrame(tick);
    tickBody();
  }

  /* ---------- Events ---------- */
  var resizeTimer = 0;
  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      sizeCanvas();
    }, 120);
  }

  window.addEventListener("scroll", function () {
    /* Intentionally lightweight — the rAF loop reads the scroll position. */
  }, { passive: true });

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  /* Debug/verification hook (harmless in production) */
  window.__cinematic = {
    get current() { return current; },
    get drawn() { return drawn; },
    get ready() { return readyCount; },
    get loading() { return activeLoads; },
    update: tickBody              /* run one engine step synchronously */
  };

  /* ---------- Init ---------- */
  if (loader) loader.hidden = false;   /* JS is active — show the loader */
  sizeCanvas();

  var i;
  for (i = 0; i < INITIAL_CHUNK; i++) requestFrame(i);   /* frame 1 first */

  window.requestAnimationFrame(tick);
})();