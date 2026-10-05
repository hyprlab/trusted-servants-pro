// SPDX-License-Identifier: AGPL-3.0-or-later
// Zooming a photo, in two places that share one zoom (zoomer, below):
//
// 1. The photo lightbox. Every <img> inside a [data-lightbox-scope]
//    (other than one inside a link) opens full screen on click, with
//    the scope's other photos a step away (Zoom Tech Training).
// 2. In place: an image in a [data-zoom-stage] zooms where it is (a
//    File Browser file's own view), with the stage's [data-zoom]
//    buttons. The stage may come in with a page swapped in place
//    (tspSwapPage), so it's set up on every page.
//
//   Zoom    a click (or double-tap) on the photo, wheel or pinch, all
//           toward the pointer; + and - buttons or keys; 0 or the
//           percentage button fits it again.
//   Pan     drag when zoomed in.
// The lightbox also has:
//   Move    arrow buttons, ← and → keys, or a swipe at fit size.
//   Close   Esc, the close button, or a click on the dark backdrop.
// In place, Esc fits a zoomed image again.
(function () {
  'use strict';

  // ── The zoom: an image (`view`) in a box that clips it (`stage`) ──
  // The image is placed by transform from the stage's centre. Options:
  //   fitArea()       the room the image fits into at fit size
  //                   (default: the whole stage)
  //   onPaint(z)      after each change
  //   onTap(onImg)    a click or tap that isn't a zoom (default: none)
  //   onSwipe(dir)    a sideways swipe at fit size, -1 or 1
  // A mouse click zooms; a touch, a double tap.
  function zoomer(stage, view, o) {
    o = o || {};
    var z = { nw: 1, nh: 1, fit: 1, scale: 1, x: 0, y: 0 };
    function area() {
      var r = stage.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }
    function fitArea() { return o.fitArea ? o.fitArea() : area(); }
    function maxScale() { return Math.max(4, z.fit * 6); }
    z.zoomed = function () { return z.scale > z.fit * 1.01; };
    function clamp() {
      var a = area(), sw = z.nw * z.scale, sh = z.nh * z.scale;
      var mx = Math.max(0, (sw - a.w) / 2), my = Math.max(0, (sh - a.h) / 2);
      z.x = Math.min(mx, Math.max(-mx, z.x));
      z.y = Math.min(my, Math.max(-my, z.y));
    }
    function paint() {
      clamp();
      view.style.transform = 'translate(-50%, -50%) translate(' + z.x + 'px, ' + z.y + 'px) scale(' + z.scale + ')';
      if (o.onPaint) o.onPaint(z);
    }
    // Zoom to `next`, keeping the point (px, py) from the stage's centre
    // where it is.
    z.zoomTo = function (next, px, py) {
      next = Math.min(maxScale(), Math.max(z.fit, next));
      var k = next / z.scale;
      z.x = (px || 0) - ((px || 0) - z.x) * k;
      z.y = (py || 0) - ((py || 0) - z.y) * k;
      z.scale = next;
      paint();
    };
    z.zoomIn = function () { z.zoomTo(z.scale * 1.4); };
    z.zoomOut = function () { z.zoomTo(z.scale / 1.4); };
    z.reset = function () {
      var a = fitArea();
      z.fit = Math.min(1, a.w / z.nw, a.h / z.nh);
      z.scale = z.fit; z.x = 0; z.y = 0;
      paint();
    };
    // The image's own size, once it has loaded.
    z.load = function () {
      z.nw = view.naturalWidth || 1; z.nh = view.naturalHeight || 1;
      view.style.width = z.nw + 'px';
      view.style.height = z.nh + 'px';
      z.reset();
    };
    // The stage changed size: stay at fit if it was, else keep the zoom.
    z.refit = function () {
      var was = !z.zoomed(), a = fitArea();
      z.fit = Math.min(1, a.w / z.nw, a.h / z.nh);
      if (was || z.scale < z.fit) { z.scale = z.fit; z.x = 0; z.y = 0; }
      paint();
    };
    function fromCentre(clientX, clientY) {
      var r = stage.getBoundingClientRect();
      return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)];
    }
    function toggleAt(clientX, clientY) {
      var p = fromCentre(clientX, clientY);
      if (z.zoomed()) z.reset();
      else z.zoomTo(Math.max(1, z.fit * 2.5), p[0], p[1]);
    }

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = fromCentre(e.clientX, e.clientY);
      z.zoomTo(z.scale * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p[0], p[1]);
    }, { passive: false });

    // Drag to pan, pinch to zoom, swipe, tap.
    var pointers = {}, start = null, pinch = null, lastTap = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-zoom], [data-ilb]')) return;
      stage.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        start = { cx: e.clientX, cy: e.clientY, x: z.x, y: z.y, moved: 0, onImg: e.target === view };
      } else if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: z.scale, mx: mid[0], my: mid[1] };
        start = null;
      }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        z.zoomTo(pinch.scale * d / pinch.d, pinch.mx, pinch.my);
      } else if (start) {
        var dx = e.clientX - start.cx, dy = e.clientY - start.cy;
        start.moved = Math.max(start.moved, Math.hypot(dx, dy));
        if (z.zoomed()) { z.x = start.x + dx; z.y = start.y + dy; paint(); }
      }
    });
    function lift(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (!start || Object.keys(pointers).length) return;
      var dx = e.clientX - start.cx, dy = e.clientY - start.cy;
      if (start.moved < 6) {
        var now = Date.now();
        if (!start.onImg) { if (o.onTap) o.onTap(false); }
        else if (e.pointerType === 'mouse') toggleAt(e.clientX, e.clientY);
        else if (now - lastTap < 300) { toggleAt(e.clientX, e.clientY); lastTap = 0; }
        else lastTap = now;
      } else if (!z.zoomed() && o.onSwipe && Math.abs(dx) > 60 && Math.abs(dy) < 60) {
        o.onSwipe(dx < 0 ? 1 : -1);
      }
      start = null;
    }
    stage.addEventListener('pointerup', lift);
    stage.addEventListener('pointercancel', lift);
    return z;
  }

  // ── 1. The photo lightbox ─────────────────────────────────────────
  function photos(scope) {
    return Array.prototype.filter.call(scope.querySelectorAll('img'), function (img) {
      return !img.closest('a') && img.getAttribute('src');
    });
  }
  function markPhotos() {
    document.querySelectorAll('[data-lightbox-scope]').forEach(function (scope) {
      photos(scope).forEach(function (img) {
        if (img.classList.contains('ilb-zoomable')) return;
        img.classList.add('ilb-zoomable');
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        if (!img.title) img.title = 'Click to enlarge';
      });
    });
  }

  function svg(path) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  // The overlay, built the first time a photo opens.
  var lb = null;
  function lightbox() {
    if (lb) return lb;
    var box = document.createElement('div');
    box.className = 'ilb';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Photo');
    box.innerHTML =
      '<div class="ilb-stage"><img class="ilb-img" alt="" draggable="false"></div>' +
      '<div class="ilb-bar">' +
        '<span class="ilb-count" aria-live="polite"></span>' +
        '<div class="ilb-tools">' +
          '<button type="button" class="ilb-btn" data-ilb="out" title="Zoom out (-)" aria-label="Zoom out">' + svg('<path d="M5 12h14"/>') + '</button>' +
          '<button type="button" class="ilb-zoom" data-ilb="fit" title="Fit to the screen (0)" aria-label="Fit to the screen">100%</button>' +
          '<button type="button" class="ilb-btn" data-ilb="in" title="Zoom in (+)" aria-label="Zoom in">' + svg('<path d="M12 5v14M5 12h14"/>') + '</button>' +
          '<a class="ilb-btn" data-ilb="open" target="_blank" rel="noopener" title="Open the photo on its own" aria-label="Open the photo on its own">' +
            svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>') + '</a>' +
          '<button type="button" class="ilb-btn" data-ilb="close" title="Close (Esc)" aria-label="Close">' + svg('<path d="M18 6 6 18M6 6l12 12"/>') + '</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="ilb-nav ilb-prev" data-ilb="prev" title="Previous (←)" aria-label="Previous photo">' + svg('<path d="m15 18-6-6 6-6"/>') + '</button>' +
      '<button type="button" class="ilb-nav ilb-next" data-ilb="next" title="Next (→)" aria-label="Next photo">' + svg('<path d="m9 18 6-6-6-6"/>') + '</button>' +
      '<p class="ilb-caption"></p>';
    document.body.appendChild(box);
    var stage = box.querySelector('.ilb-stage');
    var view = box.querySelector('.ilb-img');
    var zoomEl = box.querySelector('.ilb-zoom');
    lb = {
      box: box, view: view,
      countEl: box.querySelector('.ilb-count'),
      capEl: box.querySelector('.ilb-caption'),
      openEl: box.querySelector('[data-ilb="open"]'),
      prevEl: box.querySelector('.ilb-prev'),
      nextEl: box.querySelector('.ilb-next'),
      list: [], index: 0, lastFocus: null,
    };
    // The stage is the whole screen, so a zoomed photo can use all of
    // it; at fit size the photo keeps clear of the bar, arrows and caption.
    lb.z = zoomer(stage, view, {
      fitArea: function () {
        var r = stage.getBoundingClientRect(), small = r.width <= 640;
        return { w: r.width - (small ? 16 : 144), h: r.height - (small ? 112 : 128) };
      },
      onPaint: function (z) {
        zoomEl.textContent = Math.round(z.scale * 100) + '%';
        box.classList.toggle('is-zoomed', z.zoomed());
      },
      onTap: function () { close(); },
      onSwipe: function (dir) { if (lb.list.length > 1) show(lb.index + dir); },
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ilb]');
      if (!b) return;
      var act = b.getAttribute('data-ilb');
      if (act === 'open') return;
      if (act === 'close') close();
      else if (act === 'prev') show(lb.index - 1);
      else if (act === 'next') show(lb.index + 1);
      else if (act === 'in') lb.z.zoomIn();
      else if (act === 'out') lb.z.zoomOut();
      else if (act === 'fit') lb.z.reset();
    });
    window.addEventListener('resize', function () { if (!box.hidden) lb.z.refit(); });
    return lb;
  }

  function caption(img) {
    var fig = img.closest('figure');
    var fc = fig && fig.querySelector('figcaption');
    return (fc && fc.textContent.trim()) || (img.getAttribute('alt') || '').trim();
  }
  function show(i) {
    var list = lb.list;
    lb.index = (i + list.length) % list.length;
    var src = list[lb.index].currentSrc || list[lb.index].getAttribute('src');
    lb.view.classList.remove('is-ready');
    lb.view.onload = function () {
      lb.z.load();
      lb.view.classList.add('is-ready');
    };
    lb.view.src = src;
    lb.view.alt = list[lb.index].getAttribute('alt') || '';
    lb.openEl.href = src;
    var cap = caption(list[lb.index]);
    lb.capEl.textContent = cap;
    lb.capEl.hidden = !cap;
    lb.countEl.textContent = list.length > 1 ? (lb.index + 1) + ' / ' + list.length : '';
    lb.prevEl.hidden = lb.nextEl.hidden = list.length < 2;
    // Load the neighbours ahead.
    [lb.index - 1, lb.index + 1].forEach(function (j) {
      var n = list[(j + list.length) % list.length];
      if (n) { var pre = new Image(); pre.src = n.currentSrc || n.getAttribute('src'); }
    });
  }
  function open(img) {
    lightbox();
    lb.list = photos(img.closest('[data-lightbox-scope]'));
    lb.lastFocus = document.activeElement;
    lb.box.hidden = false;
    document.documentElement.classList.add('ilb-open');
    requestAnimationFrame(function () { lb.box.classList.add('is-open'); });
    show(Math.max(0, lb.list.indexOf(img)));
    lb.box.querySelector('[data-ilb="close"]').focus({ preventScroll: true });
  }
  function close() {
    lb.box.classList.remove('is-open', 'is-zoomed');
    lb.box.hidden = true;
    document.documentElement.classList.remove('ilb-open');
    lb.view.removeAttribute('src');
    if (lb.lastFocus && lb.lastFocus.focus) lb.lastFocus.focus({ preventScroll: true });
  }
  function lbOpen() { return lb && !lb.box.hidden; }

  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.ilb-zoomable');
    if (img && !(lb && lb.box.contains(img))) { e.preventDefault(); open(img); }
  });

  // ── 2. In place ───────────────────────────────────────────────────
  function setupStage(stage) {
    if (stage._zoom) return;
    var view = stage.querySelector('img');
    if (!view) return;
    var label = stage.querySelector('[data-zoom="fit"]');
    var tools = stage.querySelector('[data-zoom-tools]');
    function start() {
      if (stage._zoom || !view.naturalWidth) return;
      stage.classList.add('is-zoomable');
      view.draggable = false;
      stage._zoom = zoomer(stage, view, {
        onPaint: function (z) {
          if (label) label.textContent = Math.round(z.scale * 100) + '%';
          stage.classList.toggle('is-zoomed', z.zoomed());
        },
      });
      stage._zoom.load();
      if (tools) tools.hidden = false;
      // The stage follows the window and the layout (the details
      // column, a phone turned sideways).
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () {
          if (!stage.isConnected) { ro.disconnect(); return; }
          stage._zoom.refit();
        });
        ro.observe(stage);
      }
    }
    if (view.complete) start();
    view.addEventListener('load', start);
  }
  function setupStages() {
    markPhotos();
    document.querySelectorAll('[data-zoom-stage]').forEach(setupStage);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-zoom]');
    var stage = b && b.closest('[data-zoom-stage]');
    if (!stage || !stage._zoom) return;
    var act = b.getAttribute('data-zoom');
    if (act === 'in') stage._zoom.zoomIn();
    else if (act === 'out') stage._zoom.zoomOut();
    else if (act === 'fit') stage._zoom.reset();
  });

  // ── Keys, for whichever is showing ────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var img = e.target.closest && e.target.closest('.ilb-zoomable');
    if (img && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(img); return; }
    if (lbOpen()) {
      var n = lb.list.length;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft' && n > 1) show(lb.index - 1);
      else if (e.key === 'ArrowRight' && n > 1) show(lb.index + 1);
      else if (e.key === '+' || e.key === '=') lb.z.zoomIn();
      else if (e.key === '-' || e.key === '_') lb.z.zoomOut();
      else if (e.key === '0') lb.z.reset();
      else if (e.key === 'Tab') {
        // Keep focus inside the overlay.
        var f = Array.prototype.filter.call(lb.box.querySelectorAll('button, a'), function (b) { return !b.hidden; });
        var at = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
      return;
    }
    var stage = document.querySelector('[data-zoom-stage].is-zoomable');
    if (!stage || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.modal.open')) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var z = stage._zoom;
    if (e.key === '+' || e.key === '=') z.zoomIn();
    else if (e.key === '-' || e.key === '_') z.zoomOut();
    else if (e.key === '0') z.reset();
    else if (e.key === 'Escape' && z.zoomed()) z.reset();
    else return;
    e.preventDefault();
  });

  if (window.tspOnEachPage) window.tspOnEachPage(setupStages);
  else setupStages();
})();
