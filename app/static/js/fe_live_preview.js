// Live preview of the public site with unsaved settings applied.
//
// Markup (see _live_preview.html):
//   <div class="lp" data-live-preview
//        data-lp-url="/tspro/frontend/preview"   staged-render endpoint
//        data-lp-path="/meetings"                 public page to show
//        data-lp-forms="#a, #b"                   forms whose values apply
//        data-lp-focus="footer"                   optional: scroll to this
//        data-lp-width="1280"                     desktop render width
//        data-lp-only=".fe-footer"                optional: show only these
//        data-lp-fit>                             optional: height follows them
//
// With data-lp-only the frame hides everything else on the page before it
// paints; with data-lp-fit the stage grows or shrinks to what is left.
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

  // Runs inside the preview frame, before first paint: keep only the
  // elements matching ``sel`` (and the elements that contain them), hide
  // everything around them and drop the spacing of their containers.
  function isolate(sel, pad) {
    var found = Array.prototype.slice.call(document.querySelectorAll(sel));
    var keep = found.filter(function (el) {
      return !found.some(function (o) { return o !== el && o.contains(el); });
    });
    if (!keep.length) return;
    var chain = new Set();
    keep.forEach(function (el) {
      for (var n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) chain.add(n);
    });
    chain.forEach(function (n) {
      var p = n.parentElement;
      if (!p) return;
      Array.prototype.forEach.call(p.children, function (c) {
        if (!chain.has(c) && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(c.tagName)) {
          c.style.setProperty('display', 'none', 'important');
        }
      });
      if (keep.indexOf(n) === -1) {
        ['padding', 'margin', 'min-height', 'border'].forEach(function (k) {
          n.style.setProperty(k, '0', 'important');
        });
        n.style.setProperty('display', 'block', 'important');
      }
    });
    // With space around them (a form), center what is shown.
    if (pad) keep.forEach(function (el) {
      el.style.setProperty('margin-left', 'auto', 'important');
      el.style.setProperty('margin-right', 'auto', 'important');
    });
    var b = document.body.style;
    b.setProperty('margin', '0', 'important');
    b.setProperty('min-height', '0', 'important');
    b.setProperty('padding', (pad || 0) + 'px', 'important');
    document.documentElement.setAttribute('data-lp-only', '');
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
    if (root.hasAttribute('data-lp-watch')) this.watch();
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

  // Editors that change fields from script (the page builder writes its
  // blocks into a hidden input) fire no event: notice those by comparing
  // what the forms would post every couple of seconds.
  Preview.prototype.snapshot = function () {
    return JSON.stringify(this.forms().map(function (f) { return formPairs(f); }));
  };
  Preview.prototype.watch = function () {
    var self = this;
    setInterval(function () {
      if (!self.root.offsetParent || !self.loaded) return;
      var now = self.snapshot();
      if (self.lastSnap !== undefined && now !== self.lastSnap) self.schedule();
      self.lastSnap = now;
    }, 2000);
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
    var over = {};
    try { over = JSON.parse(this.root.getAttribute('data-lp-overrides') || '{}'); } catch (_) {}
    var forms = this.forms().map(function (f) {
      var pairs = formPairs(f).filter(function (p) { return !(p[0] in over); });
      Object.keys(over).forEach(function (k) { pairs.push([k, String(over[k])]); });
      return { action: f.getAttribute('action') || '', fields: pairs };
    });
    // Editors that save JSON rather than a form (the mega menu) add
    // themselves with FeLivePreview.addSource(fn -> {action, json}).
    sources.forEach(function (fn) {
      try { var x = fn(); if (x && x.action) forms.push(x); } catch (_) {}
    });
    // Keep the reader's place across re-renders, once a page has shown.
    try {
      var doc = this.frame.contentDocument;
      if (this.loaded && doc && doc.scrollingElement) this.scrollY = doc.scrollingElement.scrollTop;
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
      var only = self.root.getAttribute('data-lp-only');
      if (only) {
        var call = '<script>(' + isolate.toString() + ')(' + JSON.stringify(only) + ',' +
          (parseInt(self.root.getAttribute('data-lp-pad') || '0', 10) || 0) + ');<\/script>';
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, call + '</body>') : html + call;
      }
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
    if (!this.frame.srcdoc) return;  // the initial blank frame
    this.loaded = true;
    this.root.classList.remove('is-loading');
    this.setStatus('');
    this.applyMode();
    var d = this.frame.contentDocument;
    if (!d) return;
    // The preview is for looking; forms inside it must not submit.
    d.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    var focus = this.root.getAttribute('data-lp-focus');
    var se = d.scrollingElement || d.documentElement;
    var self = this;
    if (this.root.hasAttribute('data-lp-fit')) {
      var measure = function () { self.contentH = self.measure(d); self.fit(); };
      measure();
      setTimeout(measure, 350);
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(measure);
      var RO = d.defaultView && d.defaultView.ResizeObserver;
      if (RO) {
        var ro = new RO(function () { measure(); });
        d.querySelectorAll(this.root.getAttribute('data-lp-only') || 'body').forEach(function (el) { ro.observe(el); });
      }
      return;
    }
    this.fit();
    var place = function () {
      if (self.scrollY !== null) {
        se.scrollTop = self.scrollY;
      } else if (focus) {
        var el = d.querySelector(focus);
        if (el) se.scrollTop = Math.max(0, el.getBoundingClientRect().top + se.scrollTop - 12);
      }
    };
    place();
    // Images and fonts can move things after load; settle once more.
    setTimeout(place, 350);
  };

  // The bottom edge of what is showing: the kept elements and anything
  // inside them that is visible, such as an open mega menu panel.
  Preview.prototype.measure = function (d) {
    var sel = this.root.getAttribute('data-lp-only') || 'body';
    var win = d.defaultView;
    var top = (d.scrollingElement || d.documentElement).scrollTop;
    var max = 0;
    var pad = parseInt(this.root.getAttribute('data-lp-pad') || '0', 10) || 0;
    d.querySelectorAll(sel).forEach(function (el) {
      var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
      all.forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (!r.height || !r.width) return;
        // Closed panels are usually see-through or hidden on an ancestor.
        if (n.checkVisibility) {
          if (!n.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
        } else {
          var cs = win.getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.opacity === '0') return;
        }
        max = Math.max(max, r.bottom + top);
      });
    });
    return Math.ceil(max + pad);
  };

  // Render at a real viewport width and scale it down to the column.
  // A fitted preview keeps a realistic viewport height (so vh units hold)
  // and crops the stage to the content.
  Preview.prototype.fit = function () {
    if (!this.stage) return;
    var phone = this.device === 'phone';
    var w = phone ? 390 : parseInt(this.root.getAttribute('data-lp-width') || '1280', 10);
    var avail = this.stage.clientWidth || w;
    var scale = Math.min(1, avail / w);
    var h = parseInt(this.root.getAttribute('data-lp-height') || '640', 10);
    this.frame.style.width = w + 'px';
    this.frame.style.transform = 'scale(' + scale + ')';
    if (this.root.hasAttribute('data-lp-fit')) {
      var content = this.contentH || h / scale;
      var view = phone ? 844 : 900;
      this.frame.style.height = Math.max(view, content) + 'px';
      this.stage.style.height = Math.max(40, Math.round(content * scale)) + 'px';
      return;
    }
    this.frame.style.height = Math.round(h / scale) + 'px';
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
      el._lp.loaded = false;
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
