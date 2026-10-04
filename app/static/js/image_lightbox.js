// SPDX-License-Identifier: AGPL-3.0-or-later
// Zoomable photo lightbox. Every <img> inside a [data-lightbox-scope]
// (other than one inside a link) opens full screen on click, with the
// scope's other photos a step away.
//
//   Zoom    a click (or double-tap) on the photo, wheel or pinch, all
//           toward the pointer; + and - buttons or keys; 0 or the
//           percentage button fits it to the screen again.
//   Pan     drag when zoomed in.
//   Move    arrow buttons, ← and → keys, or a swipe at fit size.
//   Close   Esc, the close button, or a click on the dark backdrop.
(function () {
  'use strict';
  var scopes = document.querySelectorAll('[data-lightbox-scope]');
  if (!scopes.length) return;

  function photos(scope) {
    return Array.prototype.filter.call(scope.querySelectorAll('img'), function (img) {
      return !img.closest('a') && img.getAttribute('src');
    });
  }
  scopes.forEach(function (scope) {
    photos(scope).forEach(function (img) {
      img.classList.add('ilb-zoomable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      if (!img.title) img.title = 'Click to enlarge';
    });
  });

  // ── The overlay, built once ─────────────────────────────────────
  function svg(path) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
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
  var countEl = box.querySelector('.ilb-count');
  var zoomEl = box.querySelector('.ilb-zoom');
  var capEl = box.querySelector('.ilb-caption');
  var openEl = box.querySelector('[data-ilb="open"]');
  var prevEl = box.querySelector('.ilb-prev');
  var nextEl = box.querySelector('.ilb-next');

  var list = [], index = 0, lastFocus = null;
  var nw = 1, nh = 1;            // the photo's own size
  var fit = 1, scale = 1, x = 0, y = 0;

  function area() {
    var r = stage.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  // The stage is the whole screen, so a zoomed photo can use all of
  // it; at fit size the photo keeps clear of the bar, arrows and caption.
  function fitArea() {
    var a = area(), small = a.w <= 640;
    return { w: a.w - (small ? 16 : 144), h: a.h - (small ? 112 : 128) };
  }
  function maxScale() { return Math.max(4, fit * 6); }

  function clamp() {
    var a = area(), sw = nw * scale, sh = nh * scale;
    var mx = Math.max(0, (sw - a.w) / 2), my = Math.max(0, (sh - a.h) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }
  function paint() {
    clamp();
    view.style.transform = 'translate(-50%, -50%) translate(' + x + 'px, ' + y + 'px) scale(' + scale + ')';
    zoomEl.textContent = Math.round(scale * 100) + '%';
    box.classList.toggle('is-zoomed', scale > fit * 1.01);
  }
  // Zoom to `next`, keeping the point (px, py) from the stage's centre
  // where it is.
  function zoomTo(next, px, py) {
    next = Math.min(maxScale(), Math.max(fit, next));
    var k = next / scale;
    x = (px || 0) - ((px || 0) - x) * k;
    y = (py || 0) - ((py || 0) - y) * k;
    scale = next;
    paint();
  }
  function fromCentre(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)];
  }
  function reset() {
    var a = fitArea();
    fit = Math.min(1, a.w / nw, a.h / nh);
    scale = fit; x = 0; y = 0;
    paint();
  }

  function caption(img) {
    var fig = img.closest('figure');
    var fc = fig && fig.querySelector('figcaption');
    return (fc && fc.textContent.trim()) || (img.getAttribute('alt') || '').trim();
  }
  function show(i) {
    index = (i + list.length) % list.length;
    var src = list[index].currentSrc || list[index].getAttribute('src');
    view.classList.remove('is-ready');
    view.onload = function () {
      nw = view.naturalWidth || 1; nh = view.naturalHeight || 1;
      view.style.width = nw + 'px';
      view.style.height = nh + 'px';
      reset();
      view.classList.add('is-ready');
    };
    view.src = src;
    view.alt = list[index].getAttribute('alt') || '';
    openEl.href = src;
    var cap = caption(list[index]);
    capEl.textContent = cap;
    capEl.hidden = !cap;
    countEl.textContent = list.length > 1 ? (index + 1) + ' / ' + list.length : '';
    prevEl.hidden = nextEl.hidden = list.length < 2;
    // Load the neighbours ahead.
    [index - 1, index + 1].forEach(function (j) {
      var n = list[(j + list.length) % list.length];
      if (n) { var pre = new Image(); pre.src = n.currentSrc || n.getAttribute('src'); }
    });
  }
  function open(img) {
    list = photos(img.closest('[data-lightbox-scope]'));
    lastFocus = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add('ilb-open');
    requestAnimationFrame(function () { box.classList.add('is-open'); });
    show(Math.max(0, list.indexOf(img)));
    box.querySelector('[data-ilb="close"]').focus({ preventScroll: true });
  }
  function close() {
    box.classList.remove('is-open', 'is-zoomed');
    box.hidden = true;
    document.documentElement.classList.remove('ilb-open');
    view.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.ilb-zoomable');
    if (img && !box.contains(img)) { e.preventDefault(); open(img); }
  });
  document.addEventListener('keydown', function (e) {
    var img = e.target.closest && e.target.closest('.ilb-zoomable');
    if (img && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(img); return; }
    if (box.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && list.length > 1) show(index - 1);
    else if (e.key === 'ArrowRight' && list.length > 1) show(index + 1);
    else if (e.key === '+' || e.key === '=') zoomTo(scale * 1.4);
    else if (e.key === '-' || e.key === '_') zoomTo(scale / 1.4);
    else if (e.key === '0') reset();
    else if (e.key === 'Tab') {
      // Keep focus inside the overlay.
      var f = Array.prototype.filter.call(box.querySelectorAll('button, a'), function (b) { return !b.hidden; });
      var at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ilb]');
    if (!b) return;
    var act = b.getAttribute('data-ilb');
    if (act === 'open') return;
    if (act === 'close') close();
    else if (act === 'prev') show(index - 1);
    else if (act === 'next') show(index + 1);
    else if (act === 'in') zoomTo(scale * 1.4);
    else if (act === 'out') zoomTo(scale / 1.4);
    else if (act === 'fit') reset();
  });

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = fromCentre(e.clientX, e.clientY);
    zoomTo(scale * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p[0], p[1]);
  }, { passive: false });

  function toggleAt(clientX, clientY) {
    var p = fromCentre(clientX, clientY);
    if (scale > fit * 1.01) reset();
    else zoomTo(Math.max(1, fit * 2.5), p[0], p[1]);
  }

  // Drag to pan, pinch to zoom, swipe to move on, tap the backdrop to
  // close.
  var pointers = {}, start = null, pinch = null, lastTap = 0;
  stage.addEventListener('pointerdown', function (e) {
    stage.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) {
      start = { cx: e.clientX, cy: e.clientY, x: x, y: y, moved: 0, onImg: e.target === view, t: Date.now() };
    } else if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: scale, mx: mid[0], my: mid[1] };
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
      zoomTo(pinch.scale * d / pinch.d, pinch.mx, pinch.my);
    } else if (start) {
      var dx = e.clientX - start.cx, dy = e.clientY - start.cy;
      start.moved = Math.max(start.moved, Math.hypot(dx, dy));
      if (scale > fit * 1.01) { x = start.x + dx; y = start.y + dy; paint(); }
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
      if (!start.onImg) close();
      else if (e.pointerType === 'mouse') toggleAt(e.clientX, e.clientY);
      else if (now - lastTap < 300) { toggleAt(e.clientX, e.clientY); lastTap = 0; }
      else lastTap = now;
    } else if (scale <= fit * 1.01 && Math.abs(dx) > 60 && Math.abs(dy) < 60 && list.length > 1) {
      show(index + (dx < 0 ? 1 : -1));
    }
    start = null;
  }
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);

  window.addEventListener('resize', function () {
    if (box.hidden) return;
    var was = scale <= fit * 1.01;
    var a = fitArea();
    fit = Math.min(1, a.w / nw, a.h / nh);
    if (was || scale < fit) { scale = fit; x = 0; y = 0; }
    paint();
  });
})();
