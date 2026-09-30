// Live preview of the public site with unsaved settings applied.
//
// Markup (see _live_preview.html):
//   <div class="lp" data-live-preview
//        data-lp-url="/tspro/frontend/preview"   staged-render endpoint
//        data-lp-path="/meetings"                 public page to show
//        data-lp-forms="#a, #b"                   forms whose values apply
//        data-lp-focus="footer"                   optional: scroll to this
//        data-lp-width="1280">                    desktop render width
//
// Any input in a watched form re-renders after a short pause. The server
// runs each form through its own save route inside a transaction it rolls
// back (app/staged_preview.py), so the preview is the real template and
// nothing is saved. File inputs are never sent.
//
// window.FeLivePreview.refresh(el) forces a render; setPath(el, path)
// switches the page shown; a 'lp:refresh' event on document refreshes
// every preview on the page.
(function () {
  'use strict';
  var DEBOUNCE_MS = 450;

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.content : '';
  }

  function formPairs(form) {
    var pairs = [];
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (typeof v === 'string') pairs.push([k, v]);
    });
    return pairs;
  }

  function Preview(root) {
    this.root = root;
    this.frame = root.querySelector('iframe');
    this.stage = root.querySelector('[data-lp-stage]');
    this.status = root.querySelector('[data-lp-status]');
    this.mode = root.getAttribute('data-lp-mode') || (
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    this.device = 'desktop';
    this.timer = null;
    this.seq = 0;
    this.scrollY = null;
    this.bind();
    this.render();
  }

  Preview.prototype.forms = function () {
    var sel = this.root.getAttribute('data-lp-forms') || '';
    if (!sel) return [];
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };

  Preview.prototype.bind = function () {
    var self = this;
    var sched = function () { self.schedule(); };
    this.forms().forEach(function (f) {
      f.addEventListener('input', sched);
      f.addEventListener('change', sched);
      // Rows added, removed or dragged into a new order fire no input
      // event; any change to the form's fields does.
      if (window.MutationObserver) {
        new MutationObserver(function (recs) {
          for (var i = 0; i < recs.length; i++) {
            var nodes = Array.prototype.slice.call(recs[i].addedNodes)
              .concat(Array.prototype.slice.call(recs[i].removedNodes));
            for (var j = 0; j < nodes.length; j++) {
              var n = nodes[j];
              if (n.nodeType === 1 && (n.matches('input, select, textarea') ||
                  n.querySelector('input, select, textarea'))) { sched(); return; }
            }
          }
        }).observe(f, { childList: true, subtree: true });
      }
    });
    this.root.querySelectorAll('[data-lp-mode-btn]').forEach(function (b) {
      b.addEventListener('click', function () {
        self.mode = b.getAttribute('data-lp-mode-btn');
        self.syncButtons();
        self.applyMode();
      });
    });
    this.root.querySelectorAll('[data-lp-device-btn]').forEach(function (b) {
      b.addEventListener('click', function () {
        self.device = b.getAttribute('data-lp-device-btn');
        self.syncButtons();
        self.fit();
      });
    });
    var rb = this.root.querySelector('[data-lp-refresh]');
    if (rb) rb.addEventListener('click', function () { self.render(); });
    this.frame.addEventListener('load', function () { self.onLoad(); });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { self.fit(); }).observe(this.root);
    } else {
      window.addEventListener('resize', function () { self.fit(); });
    }
    this.syncButtons();
  };

  Preview.prototype.syncButtons = function () {
    var self = this;
    this.root.querySelectorAll('[data-lp-mode-btn]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-lp-mode-btn') === self.mode ? 'true' : 'false');
    });
    this.root.querySelectorAll('[data-lp-device-btn]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-lp-device-btn') === self.device ? 'true' : 'false');
    });
    this.root.setAttribute('data-lp-device', this.device);
  };

  Preview.prototype.schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.render(); }, DEBOUNCE_MS);
  };

  Preview.prototype.setStatus = function (text) {
    if (this.status) this.status.textContent = text || '';
  };

  Preview.prototype.render = function () {
    var self = this;
    // Hidden (another tab is open): render when it next shows.
    if (!this.root.offsetParent) { this.pending = true; return; }
    this.pending = false;
    var seq = ++this.seq;
    var forms = this.forms().map(function (f) {
      return { action: f.getAttribute('action') || '', fields: formPairs(f) };
    });
    // Editors that save JSON rather than a form (the mega menu) add
    // themselves with FeLivePreview.addSource(fn -> {action, json}).
    sources.forEach(function (fn) {
      try { var x = fn(); if (x && x.action) forms.push(x); } catch (_) {}
    });
    try {
      var doc = this.frame.contentDocument;
      if (doc && doc.scrollingElement) this.scrollY = doc.scrollingElement.scrollTop;
    } catch (_) { /* not loaded yet */ }
    this.root.classList.add('is-loading');
    this.setStatus('Updating…');
    fetch(this.root.getAttribute('data-lp-url'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
      body: JSON.stringify({ path: this.root.getAttribute('data-lp-path') || '/', forms: forms,
                             overlays: this.root.hasAttribute('data-lp-overlays') })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (html) {
      if (seq !== self.seq) return;
      // Links open in a new tab so the preview stays on the page it shows.
      html = html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
      self.frame.srcdoc = html;
    }).catch(function () {
      if (seq !== self.seq) return;
      self.root.classList.remove('is-loading');
      self.setStatus('Preview unavailable');
    });
  };

  Preview.prototype.applyMode = function () {
    try {
      var d = this.frame.contentDocument;
      if (!d || !d.documentElement) return;
      d.documentElement.setAttribute('data-theme', this.mode);
    } catch (_) { /* cross-origin never happens with srcdoc */ }
  };

  Preview.prototype.onLoad = function () {
    this.root.classList.remove('is-loading');
    this.setStatus('');
    this.applyMode();
    var d = this.frame.contentDocument;
    if (!d) return;
    // The preview is for looking; forms inside it must not submit.
    d.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    var focus = this.root.getAttribute('data-lp-focus');
    var se = d.scrollingElement || d.documentElement;
    if (this.scrollY !== null) {
      se.scrollTop = this.scrollY;
    } else if (focus) {
      var el = d.querySelector(focus);
      if (el) se.scrollTop = Math.max(0, el.getBoundingClientRect().top + se.scrollTop - 12);
    }
    this.fit();
  };

  // Render at a real viewport width and scale it down to the column.
  Preview.prototype.fit = function () {
    if (!this.stage) return;
    var w = this.device === 'phone' ? 390 : parseInt(this.root.getAttribute('data-lp-width') || '1280', 10);
    var avail = this.stage.clientWidth || w;
    var scale = Math.min(1, avail / w);
    var h = parseInt(this.root.getAttribute('data-lp-height') || '640', 10);
    this.frame.style.width = w + 'px';
    this.frame.style.height = Math.round(h / scale) + 'px';
    this.frame.style.transform = 'scale(' + scale + ')';
    this.stage.style.height = h + 'px';
  };

  var all = [];
  var sources = [];
  function init(scope) {
    (scope || document).querySelectorAll('[data-live-preview]').forEach(function (el) {
      if (el._lp) return;
      el._lp = new Preview(el);
      all.push(el._lp);
    });
  }

  // Render previews that were skipped while hidden once they show.
  function wake() { all.forEach(function (p) { if (p.pending && p.root.offsetParent) p.render(); }); }
  document.addEventListener('studio:tab', function () { setTimeout(wake, 0); });
  document.addEventListener('ds:tab', function () { setTimeout(wake, 0); });

  window.FeLivePreview = {
    init: init,
    addSource: function (fn) { sources.push(fn); },
    wake: wake,
    refresh: function (el) { if (el && el._lp) el._lp.render(); },
    setPath: function (el, path) {
      if (!el || !el._lp) return;
      el.setAttribute('data-lp-path', path);
      el._lp.scrollY = null;
      el._lp.render();
    }
  };
  document.addEventListener('lp:refresh', function () { all.forEach(function (p) { p.schedule(); }); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();
