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
  studio.querySelectorAll('.ds-ctl[data-key]').forEach(function (el) {
    ctls[el.getAttribute('data-key')] = el;
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

  // Clicking part of the preview opens the settings that drive it:
  // data-goto="tab:primary|secondary" picks a style, "tab:<key>" a token.
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto]');
    if (!t) return;
    var parts = t.getAttribute('data-goto').split(':');
    var tab = parts[0], what = parts[1];
    if (tab !== state.tab) showTab(tab);
    var target;
    if (what === 'primary' || what === 'secondary') {
      showKind(tab, what);
      target = studio.querySelector('[data-ds-panel="' + tab + '"] [data-ds-kind-only="' + what + '"]');
    } else {
      var el = ctls[what];
      if (el) {
        var only = el.closest('[data-ds-kind-only]');
        if (only && only.hidden) showKind(tab, only.getAttribute('data-ds-kind-only'));
        target = el.closest('.ds-row') || el;
      }
    }
    if (!target) return;
    var r = target.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
  });

  // ── Preview ─────────────────────────────────────────────────────────
  function shadow(scaleKey, tint) {
    var parts = SHADOW_PARTS[scaleKey];
    if (!parts) return 'none';
    var h = normHex(tint);
    if (!h) return SCALES.shadow[scaleKey] || 'none';
    var n = parseInt(h.slice(1), 16);
    return parts[0] + ' rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + parts[1] + ')';
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

  function paint() {
    var dark = state.mode === 'dark';
    var V = vars(dark);
    Object.keys(V).forEach(function (k) { pv.style.setProperty('--pv-' + k, V[k]); });
    root.querySelectorAll('[data-swatch]').forEach(function (el) {
      var role = el.getAttribute('data-swatch'), v = V[role] || '';
      el.textContent = v.indexOf('color-mix') === 0 ? 'derived' : v;
    });
    var m = root.querySelector('[data-measure="type"]');
    if (m) m.textContent = 'Base size ' + V['text-size'] + ', line height ' + V['line-height'];
    paintLayout();
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
