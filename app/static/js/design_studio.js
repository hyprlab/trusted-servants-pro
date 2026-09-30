// SPDX-License-Identifier: AGPL-3.0-or-later
// Design page (Web Frontend → Design): tabbed token controls beside a
// live preview.
//
// Each token is a `.ds-ctl[data-key]` in frontend_design.html. The named
// form inputs inside it are the only state: `design_<key>` holds the
// override (empty = theme default) and colors also carry the
// `design_<key>_enabled` checkbox the save endpoint requires. This file
// drives the visible control (slider, segments, switch, swatch), keeps
// the override dot and reset button honest, and repaints the preview,
// which lives in a shadow root so the admin theme's CSS can't leak in.
(function () {
  'use strict';
  var studio = document.querySelector('[data-ds-studio]');
  var dataEl = document.getElementById('ds-data');
  if (!studio || !dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var DEFAULTS = DATA.defaults, SCALES = DATA.scales, SHADOW_PARTS = DATA.shadow_parts;

  var HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  function normHex(v) {
    var m = String(v || '').trim().match(HEX_RE);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return ('#' + h).toLowerCase();
  }
  // Programmatic value changes don't fire events; the save bar and the
  // preview both listen for them, so raise them by hand.
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function stored(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  var ctls = {};
  // Mirrors (data-mirror) are unnamed second copies of a color shown on
  // another tab; `ctls` holds only the originals, which carry the inputs.
  var mirrors = {};
  studio.querySelectorAll('.ds-ctl[data-key]').forEach(function (el) {
    var key = el.getAttribute('data-key');
    if (el.hasAttribute('data-mirror')) (mirrors[key] = mirrors[key] || []).push(el);
    else ctls[key] = el;
  });

  // ── Reading values ──────────────────────────────────────────────────
  function override(el) {
    if (el.dataset.kind === 'color') {
      return el.querySelector('.ds-on').checked ? el.querySelector('.ds-picker').value : null;
    }
    var inp = el.querySelector('input[name^="design_"]');
    var v = inp ? inp.value.trim() : '';
    return v === '' ? null : v;
  }
  function val(key) {
    var el = ctls[key];
    var o = el ? override(el) : null;
    return o != null ? o : DEFAULTS[key];
  }

  // ── Keeping each control's visible part in step ─────────────────────
  // Parse a CSS length into a number in `unit` for the length sliders;
  // null when it can't be expressed there (the text box still wins).
  function lengthIn(v, unit) {
    var m = String(v || '').trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    if (!m) return null;
    var n = parseFloat(m[1]), u = m[2].toLowerCase();
    if (u === unit) return n;
    if (unit === 'px' && u === 'rem') return n * 16;
    if (unit === 'px' && u === '' && n === 0) return 0;
    return null;
  }
  function fmtNum(n) { return String(Math.round(n * 1000) / 1000); }

  function sync(el) {
    var key = el.dataset.key, kind = el.dataset.kind, v = val(key);
    var custom = override(el) != null;
    el.classList.toggle('is-custom', custom);
    if (kind === 'color') {
      var picker = el.querySelector('.ds-picker'), hex = el.querySelector('.ds-hex');
      var n = normHex(picker.value);
      el.style.setProperty('--ds-sw', n || picker.value);
      if (hex && document.activeElement !== hex) hex.value = picker.value;
      (mirrors[key] || []).forEach(function (m) {
        var mp = m.querySelector('.ds-picker'), mh = m.querySelector('.ds-hex');
        m.classList.toggle('is-custom', custom);
        mp.value = picker.value;
        m.style.setProperty('--ds-sw', n || picker.value);
        if (document.activeElement !== mh) mh.value = picker.value;
      });
      return;
    }
    var range = el.querySelector('.ds-range');
    if (el.classList.contains('ds-slider')) {
      var out = el.querySelector('.ds-readout');
      if (kind === 'int') {
        range.value = v;
        out.textContent = v + (el.dataset.unit || '');
      } else {
        var stops = JSON.parse(el.dataset.stops), reads = JSON.parse(el.dataset.readouts);
        var i = Math.max(0, stops.indexOf(String(v)));
        range.value = i;
        out.textContent = reads[i];
      }
      var pct = (range.value - range.min) / ((range.max - range.min) || 1) * 100;
      range.style.setProperty('--ds-fill', pct + '%');
      return;
    }
    if (el.classList.contains('ds-seg')) {
      el.querySelectorAll('[data-value]').forEach(function (b) {
        b.setAttribute('aria-checked', b.getAttribute('data-value') === String(v) ? 'true' : 'false');
      });
      return;
    }
    if (el.classList.contains('ds-switch')) {
      el.querySelector('.ds-switch-input').checked = v !== 'off';
      return;
    }
    if (kind === 'text' && range) {
      var num = lengthIn(v, el.dataset.unit || '');
      el.classList.toggle('is-off-scale', num == null);
      if (num != null) range.value = num;
      var p = (range.value - range.min) / ((range.max - range.min) || 1) * 100;
      range.style.setProperty('--ds-fill', p + '%');
    }
  }

  function setOverride(el, v) {
    if (el.dataset.kind === 'color') {
      var on = el.querySelector('.ds-on'), picker = el.querySelector('.ds-picker');
      if (v == null) {
        on.checked = false;
        picker.value = normHex(el.dataset.default) || picker.value;
      } else {
        on.checked = true;
        picker.value = v;
      }
      // Fire on the checkbox, not the picker: the picker's own input
      // handler would switch the override straight back on.
      fire(on);
    } else {
      var inp = el.querySelector('input[name^="design_"]');
      inp.value = v == null ? '' : v;
      fire(inp);
    }
    sync(el);
  }

  // ── Wiring each kind of control ─────────────────────────────────────
  Object.keys(ctls).forEach(function (key) {
    var el = ctls[key], kind = el.dataset.kind;
    var resetBtn = el.querySelector('[data-ds-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () { setOverride(el, null); });

    if (kind === 'color') {
      var on = el.querySelector('.ds-on'), picker = el.querySelector('.ds-picker');
      var hex = el.querySelector('.ds-hex');
      var n0 = normHex(picker.getAttribute('value'));
      if (n0) picker.value = n0;
      picker.addEventListener('input', function () { on.checked = true; sync(el); });
      picker.addEventListener('change', function () { sync(el); });
      var commit = function () {
        var n = normHex(hex.value);
        if (!n) return false;
        if (picker.value.toLowerCase() !== n || !on.checked) setOverride(el, n);
        return true;
      };
      hex.addEventListener('input', function () { if (normHex(hex.value)) commit(); });
      hex.addEventListener('change', function () { if (!commit()) hex.value = picker.value; });
      hex.addEventListener('blur', function () { hex.value = picker.value; });
      hex.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!commit()) hex.value = picker.value;
        hex.blur();
      });
    } else if (el.classList.contains('ds-slider')) {
      var range = el.querySelector('.ds-range');
      range.addEventListener('input', function () {
        if (kind === 'int') setOverride(el, String(range.value));
        else setOverride(el, JSON.parse(el.dataset.stops)[range.value]);
      });
    } else if (el.classList.contains('ds-seg')) {
      el.querySelectorAll('[data-value]').forEach(function (b) {
        b.addEventListener('click', function () { setOverride(el, b.getAttribute('data-value')); });
      });
    } else if (el.classList.contains('ds-switch')) {
      var cb = el.querySelector('.ds-switch-input');
      cb.addEventListener('change', function () { setOverride(el, cb.checked ? 'on' : 'off'); });
    } else if (kind === 'text') {
      var txt = el.querySelector('.ds-text-input'), r = el.querySelector('.ds-range');
      txt.addEventListener('input', function () { sync(el); });
      if (r) {
        r.addEventListener('input', function () {
          setOverride(el, fmtNum(parseFloat(r.value)) + (el.dataset.unit || ''));
        });
      }
    }
    sync(el);
  });

  // A mirror edits its original, which then repaints every copy.
  Object.keys(mirrors).forEach(function (key) {
    var el = ctls[key];
    if (!el) return;
    mirrors[key].forEach(function (m) {
      var mp = m.querySelector('.ds-picker'), mh = m.querySelector('.ds-hex');
      mp.addEventListener('input', function () { setOverride(el, mp.value); });
      mh.addEventListener('input', function () {
        var n = normHex(mh.value);
        if (n) setOverride(el, n);
      });
      mh.addEventListener('blur', function () { mh.value = mp.value; });
      mh.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); mh.blur(); }
      });
      m.querySelector('[data-ds-reset]').addEventListener('click', function () { setOverride(el, null); });
    });
    sync(el);
  });

  // ── Mega menu panel settings ────────────────────────────────────────
  // Plain named inputs (SiteSetting columns): no override state, so no
  // dot or reset; the controls only need their readouts kept current.
  var form = studio.closest('form');
  function fv(name) {
    var el = form.elements[name];
    if (!el) return null;
    return el.type === 'checkbox' ? el.checked : el.value;
  }
  studio.querySelectorAll('.ds-pcolor').forEach(function (el) {
    var picker = el.querySelector('.ds-picker'), hex = el.querySelector('.ds-hex');
    var n0 = normHex(picker.getAttribute('value'));
    if (n0) picker.value = n0;
    function show() {
      el.style.setProperty('--ds-sw', picker.value);
      if (document.activeElement !== hex) hex.value = picker.value;
    }
    picker.addEventListener('input', show);
    hex.addEventListener('input', function () {
      var n = normHex(hex.value);
      if (n && n !== picker.value) { picker.value = n; fire(picker); }
    });
    hex.addEventListener('blur', function () { hex.value = picker.value; });
    hex.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); hex.blur(); }
    });
    show();
  });
  var FMT = {
    pct: function (v) { return v + '%' + (+v === 100 ? ", the style's size" : ''); },
    ms: function (v) { return v + ' ms'; },
    px: function (v) { return v + 'px'; },
    percent: function (v) { return v + '%'; },
  };
  studio.querySelectorAll('.ds-prange').forEach(function (row) {
    var r = row.querySelector('.ds-range'), out = row.querySelector('.ds-readout');
    var f = FMT[row.getAttribute('data-fmt')] || String;
    function show() {
      out.textContent = f(r.value);
      r.style.setProperty('--ds-fill', (r.value - r.min) / ((r.max - r.min) || 1) * 100 + '%');
    }
    r.addEventListener('input', show);
    show();
  });
  // Speed rows only show while their switch is on.
  studio.querySelectorAll('[data-requires]').forEach(function (row) {
    var sw = form.elements[row.getAttribute('data-requires')];
    if (!sw) return;
    function show() { row.hidden = !sw.checked; }
    sw.addEventListener('change', show);
    show();
  });

  // ── Tabs, style switch, preview mode ────────────────────────────────
  var tabs = studio.querySelectorAll('[data-ds-tab]');
  var panels = studio.querySelectorAll('[data-ds-panel]');
  var host = studio.querySelector('[data-ds-stage]');
  var tpl = document.getElementById('ds-stage-template');
  var root = host.attachShadow({ mode: 'open' });
  root.appendChild(tpl.content.cloneNode(true));
  var pv = root.querySelector('.pv');

  var state = {
    tab: stored('ds-tab') || 'colors',
    kind: { cards: stored('ds-kind-cards') || 'primary', buttons: stored('ds-kind-buttons') || 'primary' },
    mode: stored('ds-mode') ||
      (['dark', 'neobrutal-dark', 'cyberpunk'].indexOf(
        document.documentElement.getAttribute('data-theme')) !== -1 ? 'dark' : 'light'),
  };
  // A link such as Design#megamenu opens that tab.
  var hashTab = (window.location.hash || '').slice(1);
  var fromHash = !!(hashTab && studio.querySelector('[data-ds-panel="' + hashTab + '"]'));
  if (fromHash) state.tab = hashTab;
  if (!studio.querySelector('[data-ds-panel="' + state.tab + '"]')) state.tab = 'colors';

  function showTab(id) {
    state.tab = id; store('ds-tab', id);
    tabs.forEach(function (t) {
      t.setAttribute('aria-selected', t.getAttribute('data-ds-tab') === id ? 'true' : 'false');
      t.tabIndex = t.getAttribute('data-ds-tab') === id ? 0 : -1;
    });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-ds-panel') !== id; });
    root.querySelectorAll('[data-pane]').forEach(function (p) {
      p.hidden = p.getAttribute('data-pane') !== id;
    });
    paint();
    if (id === 'megamenu') replayMega();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { showTab(t.getAttribute('data-ds-tab')); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus(); next.click();
    });
  });

  // Tab strip: fade the edge that has tabs out of view, let a vertical
  // wheel scroll it sideways, and keep the selected tab in view.
  var tabsWrap = studio.querySelector('[data-ds-tabs-wrap]');
  var tabStrip = tabsWrap && tabsWrap.querySelector('.ds-tabs');
  function fadeTabs() {
    if (!tabStrip) return;
    var max = tabStrip.scrollWidth - tabStrip.clientWidth;
    tabsWrap.toggleAttribute('data-fade-start', tabStrip.scrollLeft > 1);
    tabsWrap.toggleAttribute('data-fade-end', tabStrip.scrollLeft < max - 1);
  }
  if (tabStrip) {
    tabStrip.addEventListener('scroll', fadeTabs, { passive: true });
    tabStrip.addEventListener('wheel', function (e) {
      if (tabStrip.scrollWidth <= tabStrip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      tabStrip.scrollLeft += e.deltaY;
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(fadeTabs).observe(tabStrip);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    });
    fadeTabs();
  }

  function showKind(panel, kind) {
    state.kind[panel] = kind; store('ds-kind-' + panel, kind);
    var p = studio.querySelector('[data-ds-panel="' + panel + '"]');
    p.querySelectorAll('[data-ds-kind-for] [data-kind]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-kind') === kind ? 'true' : 'false');
    });
    p.querySelectorAll('[data-ds-kind-only]').forEach(function (g) {
      g.hidden = g.getAttribute('data-ds-kind-only') !== kind;
    });
    var pane = root.querySelector('[data-pane="' + panel + '"]');
    pane.querySelectorAll('[data-kindrow]').forEach(function (r) {
      r.classList.toggle('is-editing', r.getAttribute('data-kindrow') === kind);
    });
  }
  studio.querySelectorAll('[data-ds-kind-for]').forEach(function (sw) {
    var panel = sw.getAttribute('data-ds-kind-for');
    sw.querySelectorAll('[data-kind]').forEach(function (b) {
      b.addEventListener('click', function () { showKind(panel, b.getAttribute('data-kind')); });
    });
    showKind(panel, state.kind[panel]);
  });

  var modeBtns = studio.querySelectorAll('.ds-mode [data-mode]');
  function showMode(mode) {
    state.mode = mode; store('ds-mode', mode);
    modeBtns.forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
    studio.setAttribute('data-mode', mode);
    pv.setAttribute('data-mode', mode);
    paint();
  }
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { showMode(b.getAttribute('data-mode')); });
  });

  // Each preview part names what drives it: data-goto="tab:primary|
  // secondary" is a card or button style, "tab:<key>" one setting. While
  // the preview shows dark mode, a key with a `<key>_dark` sibling on
  // that tab means the sibling, since that is the color on screen
  // (data-goto-exact opts out, for the light/dark halves of a chip).
  function gotoTarget(t) {
    var parts = t.getAttribute('data-goto').split(':');
    var tab = parts[0], what = parts[1];
    if (what === 'primary' || what === 'secondary') return { tab: tab, kind: what };
    function find(key) {
      // Prefer the copy on that tab (a mirror or the original).
      return studio.querySelector('[data-ds-panel="' + tab + '"] .ds-ctl[data-key="' + key + '"]') ||
        studio.querySelector('[data-ds-panel="' + tab + '"] [name="' + key + '"]') || ctls[key];
    }
    var el = null;
    if (state.mode === 'dark' && !t.hasAttribute('data-goto-exact')) {
      el = find(what + '_dark');
      if (el) what += '_dark';
    }
    return { tab: tab, key: what, el: el || find(what) };
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto]');
    if (!t) return;
    var g = gotoTarget(t), target;
    if (g.tab !== state.tab) showTab(g.tab);
    if (g.kind) {
      showKind(g.tab, g.kind);
      target = studio.querySelector('[data-ds-panel="' + g.tab + '"] [data-ds-kind-only="' + g.kind + '"]');
    } else if (g.el) {
      var only = g.el.closest('[data-ds-kind-only]');
      if (only && only.hidden) showKind(g.tab, only.getAttribute('data-ds-kind-only'));
      target = g.el.closest('.ds-row') || g.el;
    }
    if (!target) return;
    var r = target.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
  });

  // Hover tooltip: the setting's name, its group and the token key,
  // read from the control the part would highlight.
  function ownText(el) {
    if (!el) return '';
    var out = '';
    el.childNodes.forEach(function (n) { if (n.nodeType === 3) out += n.textContent; });
    return out.trim();
  }
  var KIND_NAMES = { cards: 'card', buttons: 'button' };
  function tipFor(t) {
    var g = gotoTarget(t);
    if (g.kind) {
      var noun = KIND_NAMES[g.tab] || g.tab;
      var name = g.kind.charAt(0).toUpperCase() + g.kind.slice(1) + ' ' + noun;
      return { name: name, group: 'Every ' + g.kind + ' ' + noun + ' setting' };
    }
    if (!g.el) return null;
    var row = g.el.closest('.ds-row');
    var label = ownText(row && row.querySelector('.ds-label'));
    var cap = g.el.closest('.ds-color') && g.el.closest('.ds-color').querySelector('.ds-cap');
    var groupTitle = g.el.closest('.ds-group');
    return {
      name: label + (cap ? ', ' + ownText(cap).toLowerCase() : ''),
      group: ownText(groupTitle && groupTitle.querySelector('.ds-group-title')),
      key: g.key,
    };
  }
  var tip = document.createElement('div');
  tip.className = 'pv-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  root.appendChild(tip);
  var tipFrom = null;
  function placeTip(e) {
    var pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - pad - w;
    if (y + h > window.innerHeight - 8) y = e.clientY - pad - h;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  root.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-goto]');
    if (!t) { tip.hidden = true; tipFrom = null; return; }
    if (t !== tipFrom) {
      tipFrom = t;
      var info = tipFor(t);
      if (!info) { tip.hidden = true; return; }
      tip.innerHTML = '';
      var b = document.createElement('b'); b.textContent = info.name; tip.appendChild(b);
      if (info.group) { var sm = document.createElement('span'); sm.textContent = info.group; tip.appendChild(sm); }
      if (info.key) { var c = document.createElement('code'); c.textContent = info.key; tip.appendChild(c); }
      tip.hidden = false;
    }
    placeTip(e);
  });
  host.addEventListener('pointerleave', function () { tip.hidden = true; tipFrom = null; });
  window.addEventListener('scroll', function () { tip.hidden = true; tipFrom = null; }, { passive: true });

  // ── Preview ─────────────────────────────────────────────────────────
  function shadow(scaleKey, tint) {
    var parts = SHADOW_PARTS[scaleKey];
    if (!parts) return 'none';
    var h = normHex(tint);
    if (!h) return SCALES.shadow[scaleKey] || 'none';
    var n = parseInt(h.slice(1), 16);
    return parts[0] + ' rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + parts[1] + ')';
  }
  // Computed colors come back as rgb() or color(srgb …); hex for display.
  function toHex(c) {
    var m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return c;
    var scale = c.indexOf('color(') === 0 ? 255 : 1;
    return '#' + m.slice(0, 3).map(function (x) {
      return ('0' + Math.round(parseFloat(x) * scale).toString(16)).slice(-2);
    }).join('');
  }
  function deco(v) { return v === 'dotted' ? 'underline dotted' : v; }
  // Port of colors.dark_variant: the mega menu's dark-mode link colors.
  function darkVariant(hex) {
    var h = normHex(hex);
    if (!h) return hex;
    var n = parseInt(h.slice(1), 16);
    var r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hue = 0;
    if (mx !== mn) {
      var dd = mx - mn;
      s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      hue = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      hue /= 6;
    }
    l = Math.max(0.70, Math.min(0.92, l > 0.70 ? l : 0.70));
    s = Math.min(0.75, s);
    function f(t) {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var out = s === 0 ? [l, l, l] : [f(hue + 1 / 3), f(hue), f(hue - 1 / 3)];
    return '#' + out.map(function (c) {
      return ('0' + Math.round(c * 255).toString(16)).slice(-2);
    }).join('');
  }
  function mix(a, pct, b) { return 'color-mix(in srgb, ' + a + ' ' + pct + '%, ' + b + ')'; }

  function vars(dark) {
    var V = {}, d = dark ? '_dark' : '';
    var surface = val(dark ? 'color_surface_dark' : 'color_surface');
    var text = val(dark ? 'color_text_dark' : 'color_text');
    V.brand = val('color_brand');
    V.accent = val('color_accent');
    V.surface = surface;
    // Dark mode has no alternate-surface, border or muted token; the
    // public site derives them from the dark surface and text.
    V['surface-alt'] = dark ? mix(surface, 94, '#ffffff') : val('color_surface_alt');
    V.border = dark ? mix(text, 16, surface) : val('color_border');
    V.text = text;
    V.muted = dark ? mix(text, 68, surface) : val('color_text_soft');
    V.link = val('color_link');
    V['link-hover'] = val('color_link_hover');
    V['link-deco'] = deco(val('link_decoration'));
    V['link-deco-hover'] = deco(val('link_decoration_hover'));
    V.nav = val('color_nav_link');
    V['nav-hover'] = val('color_nav_link_hover');
    V.mm = val('color_megamenu_link');
    V['mm-hover'] = val('color_megamenu_link_hover');
    V['mm-deco'] = deco(val('megamenu_link_decoration'));
    V['mm-deco-hover'] = deco(val('megamenu_link_decoration_hover'));
    V['text-size'] = val('text_size_base');
    V['line-height'] = val('text_line_height');
    V['card-radius'] = SCALES.radius[val('card_radius')] || '16px';
    V['panel-shadow'] = SCALES.shadow[val('card_shadow')] || 'none';
    ['primary', 'secondary'].forEach(function (k) {
      var c = 'card-' + k + '-', tint = val('card_' + k + '_shadow_color' + d);
      V[c + 'bg'] = val('color_card_' + k + '_bg' + d);
      V[c + 'border'] = val('color_card_' + k + '_border' + d);
      V[c + 'hover-border'] = val('color_card_' + k + '_hover_border');
      V[c + 'bw'] = SCALES.border_width[val('card_' + k + '_border_width')] || '1px';
      V[c + 'shadow'] = shadow(val('card_' + k + '_shadow'), tint);
      V[c + 'hover-shadow'] = shadow(val('card_' + k + '_hover_shadow'), tint);
      V[c + 'lift'] = SCALES.transform[val('card_' + k + '_hover_transform')] || 'none';
      V[c + 'transition'] = SCALES.transition[val('card_' + k + '_transition')] || 'none';
      var b = 'btn-' + k + '-';
      V[b + 'bg'] = val('color_btn_' + k + '_bg');
      V[b + 'hover-bg'] = val('color_btn_' + k + '_hover_bg');
      V[b + 'text'] = val('color_btn_' + k + '_text');
      V[b + 'border'] = val('color_btn_' + k + '_border');
      V[b + 'hover-border'] = val('color_btn_' + k + '_hover_border');
      V[b + 'bw'] = SCALES.border_width[val('btn_' + k + '_border_width')] || '1px';
      V[b + 'hover-bw'] = SCALES.border_width[val('btn_' + k + '_hover_border_width')] || '1px';
    });
    V['btn-radius'] = SCALES.radius[val('btn_radius')] || '8px';
    V['btn-pad-x'] = val('btn_padding_x');
    V['btn-pad-y'] = val('btn_padding_y');
    V['btn-weight'] = val('btn_weight');
    V['btn-case'] = val('btn_text_transform');
    V['btn-deco'] = deco(val('btn_decoration'));
    // Same recipes as design.design_css_vars.
    V['btn-shadow'] = val('btn_shadow') === 'off' ? 'none' : '0 8px 20px rgba(15, 23, 42, 0.18)';
    V['btn-lift'] = val('btn_hover_transform') === 'off' ? 'none' : 'translateY(-1px)';
    V['btn-glow'] = val('btn_hover_glow') === 'off' ? 'none' : '0 10px 28px rgba(81, 100, 255, 0.32)';
    if (dark) {
      // What frontend.css does in dark mode: themed-header links take
      // the dark body text, mega-menu links a brightened variant, and
      // button colors are fixed (only shape and effects follow tokens).
      V.nav = V['nav-hover'] = text;
      V.mm = darkVariant(V.mm);
      V['mm-hover'] = darkVariant(V['mm-hover']);
      V['btn-primary-bg'] = '#052566';
      V['btn-primary-hover-bg'] = mix('#052566', 80, '#ffffff');
      V['btn-primary-text'] = text;
      V['btn-secondary-bg'] = 'transparent';
      V['btn-secondary-hover-bg'] = '#1e293b';
      V['btn-secondary-text'] = text;
      V['btn-secondary-border'] = '#334155';
      V['btn-secondary-hover-border'] = '#94a3b8';
    }
    return V;
  }

  // Container maths for the layout pane: .fe-container is
  // `max-width: <max>; margin: 0 auto; padding: 0 <pad>` (border-box),
  // with the mobile padding at 768px and below.
  function toPx(v, vw) {
    var m = String(v || '').trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    if (!m) return 0;
    var n = parseFloat(m[1]), u = m[2].toLowerCase();
    if (u === 'vw' || u === '%') return n * vw / 100;
    if (u === 'rem' || u === 'em') return n * 16;
    return n;
  }
  var VIEWPORTS = { desktop: 1920, laptop: 1280, mobile: 390 };
  function paintLayout() {
    var max = parseInt(val('container_max_px'), 10) || 1400;
    Object.keys(VIEWPORTS).forEach(function (name) {
      var vw = VIEWPORTS[name];
      var vp = root.querySelector('[data-vp="' + name + '"]');
      if (!vp) return;
      var pad = toPx(val(name === 'mobile' ? 'container_pad_mobile' : 'container_pad_desktop'), vw);
      var box = name === 'mobile' ? vw : Math.min(max, vw);
      pad = Math.max(0, Math.min(pad, box / 2 - 20));
      var content = box - pad * 2;
      var s = vp.style;
      s.setProperty('--vp-w', vw);
      s.setProperty('--box-w', box);
      s.setProperty('--pad', pad);
      var dim = root.querySelector('[data-dim="' + name + '"]');
      if (dim) {
        dim.textContent = (name === 'mobile' ? '' : 'Container ' + Math.round(box) + 'px, ') +
          'content ' + Math.round(content) + 'px, padding ' + Math.round(pad) + 'px each side';
      }
    });
  }

  // Mega menu pane. Classic and Recovery Blue paint the panel from the
  // panel settings and color every link with its text color; the
  // theme-styled menus take their colors from the theme and the link
  // color tokens. Base sizes match each style's --fe-mm-*-base in rem.
  var MM_BASE = { classic: [0.875, 0.9375], 'recovery-blue': [2, 1.2], themed: [1.5, 1.05] };
  function paintMega(dark, V) {
    var wrap = root.querySelector('[data-mm-kind]');
    if (!wrap) return;
    var kind = wrap.getAttribute('data-mm-kind'), themed = kind === 'themed';
    var s = wrap.style, bg, fg, link, hover;
    if (themed) {
      bg = mix(V.brand, 30, '#0b1026'); fg = '#ffffff';
      link = V.mm; hover = V['mm-hover'];
    } else {
      bg = fv(dark ? 'frontend_mega_bg_color_dark' : 'frontend_mega_bg_color');
      fg = fv(dark ? 'frontend_mega_text_color_dark' : 'frontend_mega_text_color');
      link = hover = fg;
    }
    s.setProperty('--mm-bg', bg);
    s.setProperty('--mm-fg', fg);
    s.setProperty('--mm-link', link);
    s.setProperty('--mm-link-hover', hover);
    s.setProperty('--mm-bl', (fv('frontend_mega_radius_bl') || 0) + 'px');
    s.setProperty('--mm-br', (fv('frontend_mega_radius_br') || 0) + 'px');
    var base = MM_BASE[kind] || MM_BASE.themed;
    var hs = themed ? 1 : (parseInt(fv('frontend_megamenu_heading_size'), 10) || 100) / 100;
    var ls = themed ? 1 : (parseInt(fv('frontend_megamenu_subheading_size'), 10) || 100) / 100;
    s.setProperty('--mm-h', base[0] * hs);
    s.setProperty('--mm-l', base[1] * ls);
    // Off, the panel snaps in and the stagger is suppressed with it.
    var fade = fv('frontend_megamenu_panel_fade');
    s.setProperty('--mm-fade', fade ? (fv('frontend_megamenu_panel_fade_ms') || 0) + 'ms' : '0ms');
    s.setProperty('--mm-reveal', (fv('frontend_megamenu_animate_ms') || 320) + 'ms');
    wrap.classList.toggle('is-stagger', !!(fade && kind === 'recovery-blue' && fv('frontend_megamenu_animate')));
    var badge = root.querySelector('[data-mm-dynbg]');
    if (badge) badge.hidden = !fv('frontend_mega_bg_dynamic_key');
  }
  function replayMega() {
    var panel = root.querySelector('[data-mm-panel]');
    if (!panel) return;
    panel.classList.remove('is-opening');
    void panel.offsetWidth;
    panel.classList.add('is-opening');
  }
  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-mm-replay]')) replayMega();
  });
  studio.addEventListener('change', function (e) {
    var n = e.target.name || '';
    if (/^frontend_megamenu_(panel_fade|animate)(_ms)?$/.test(n)) {
      requestAnimationFrame(replayMega);
    }
  });

  function paint() {
    var dark = state.mode === 'dark';
    var V = vars(dark);
    Object.keys(V).forEach(function (k) { pv.style.setProperty('--pv-' + k, V[k]); });
    // Palette chips show both modes whichever one the preview is in.
    var both = { light: dark ? vars(false) : V, dark: dark ? V : vars(true) };
    root.querySelectorAll('[data-swatch]').forEach(function (el) {
      var role = el.getAttribute('data-swatch');
      ['light', 'dark'].forEach(function (mode) {
        var v = both[mode][role] || '';
        var half = el.querySelector('[data-half="' + mode + '"]');
        half.style.backgroundColor = v;
        var out = el.querySelector('[data-val="' + mode + '"] span');
        var derived = v.indexOf('color-mix') === 0;
        out.textContent = derived ? toHex(getComputedStyle(half).backgroundColor) : v;
        if (derived) out.insertAdjacentHTML('beforeend', '<small>auto</small>');
        out.title = derived ? 'Derived from the dark page background and text' : '';
      });
    });
    var m = root.querySelector('[data-measure="type"]');
    if (m) m.textContent = 'Base size ' + V['text-size'] + ', line height ' + V['line-height'];
    paintLayout();
    paintMega(dark, V);
    // Tab counts: how many tokens in each tab carry an override.
    tabs.forEach(function (t) {
      var id = t.getAttribute('data-ds-tab');
      var n = studio.querySelectorAll('[data-ds-panel="' + id + '"] .ds-ctl.is-custom').length;
      var badge = t.querySelector('.ds-tab-count');
      badge.hidden = !n;
      badge.textContent = n;
      badge.title = n + ' overridden';
    });
  }

  var queued = false;
  function queuePaint() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; paint(); });
  }
  studio.addEventListener('input', queuePaint);
  studio.addEventListener('change', queuePaint);

  showMode(state.mode);
  showTab(state.tab);
  if (fromHash) studio.scrollIntoView({ block: 'start' });
})();

// Default appearance: the checked radio's segment reads as selected.
(function () {
  var opts = document.querySelectorAll('.ds-appearance-opts input[type="radio"]');
  function sync() {
    opts.forEach(function (r) { r.closest('label').classList.toggle('is-active', r.checked); });
  }
  opts.forEach(function (r) { r.addEventListener('change', sync); });
  sync();
})();
