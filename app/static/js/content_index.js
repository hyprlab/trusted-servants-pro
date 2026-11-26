// SPDX-License-Identifier: AGPL-3.0-or-later
// Index screens of Pages, Popups, Forms and Page templates
// (frontend_content_index.html): Cards / List view, the filter box, and
// the card previews. A preview is the page rendered at desktop width in
// an iframe and scaled down to the card; it loads when the card scrolls
// near the window, a few at a time so the server isn't asked for every
// page at once.
(function () {
  "use strict";
  var root = document.querySelector("[data-ci]");
  if (!root) return;

  var KEY = "tsp.contentIndex.view";
  var PAGE_W = 1280;

  // ── View ───────────────────────────────────────────────────────────
  var buttons = root.querySelectorAll("[data-ci-view]");
  function setView(v) {
    v = v === "list" ? "list" : "cards";
    root.dataset.view = v;
    buttons.forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.ciView === v ? "true" : "false");
    });
    rescaleAll();
  }
  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      setView(b.dataset.ciView);
      try { localStorage.setItem(KEY, root.dataset.view); } catch (_) { /* private window */ }
    });
  });

  // ── Filter ─────────────────────────────────────────────────────────
  var filter = root.querySelector("[data-ci-filter]");
  var none = root.querySelector("[data-ci-none]");
  if (filter) {
    filter.addEventListener("input", function () {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      root.querySelectorAll("[data-ci-group]").forEach(function (g) {
        var n = 0;
        g.querySelectorAll("[data-ci-item]").forEach(function (it) {
          var hit = !q || it.dataset.ciText.indexOf(q) !== -1;
          it.hidden = !hit;
          if (hit) n++;
        });
        g.hidden = n === 0;
        shown += n;
      });
      if (none) none.hidden = shown !== 0;
      queueVisible();
    });
  }

  // ── Previews ───────────────────────────────────────────────────────
  var thumbs = Array.prototype.slice.call(root.querySelectorAll("[data-ci-thumb]"));
  function rescale(t) {
    var w = t.clientWidth;
    if (w) t.style.setProperty("--ci-scale", String(w / PAGE_W));
  }
  function rescaleAll() { thumbs.forEach(rescale); }
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { rescale(e.target); });
    });
    thumbs.forEach(function (t) { ro.observe(t); });
  } else {
    window.addEventListener("resize", rescaleAll);
  }

  var waiting = [];
  var busy = 0;
  var MAX = 3;
  function pump() {
    while (busy < MAX && waiting.length) {
      var t = waiting.shift();
      if (t.dataset.ciLoaded) continue;
      t.dataset.ciLoaded = "1";
      busy++;
      load(t);
    }
  }
  function load(t) {
    var f = document.createElement("iframe");
    f.className = "ci-frame";
    f.title = "";
    f.tabIndex = -1;
    f.setAttribute("aria-hidden", "true");
    f.setAttribute("scrolling", "no");
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      busy--;
      t.classList.add("is-loaded");
      pump();
    }
    f.addEventListener("load", finish);
    // A page that never finishes loading must not hold its slot.
    setTimeout(finish, 15000);
    f.src = t.dataset.ciThumb;
    rescale(t);
    t.appendChild(f);
  }
  function enqueue(t) {
    if (t.dataset.ciLoaded || waiting.indexOf(t) !== -1) return;
    waiting.push(t);
  }
  function queueVisible() {
    // The filter can bring cards into view without a scroll.
    if (io) return;
    thumbs.forEach(enqueue);
    pump();
  }
  var io = null;
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        enqueue(e.target);
      });
      pump();
    }, { rootMargin: "300px 0px" });
    thumbs.forEach(function (t) { io.observe(t); });
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) { /* private window */ }
  setView(saved || "cards");
  queueVisible();
})();
