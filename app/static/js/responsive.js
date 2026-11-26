// SPDX-License-Identifier: AGPL-3.0-or-later
/* Per-device block settings, the editor half (app/responsive.py renders
   them).

   The page builder's Desktop / Tablet / Phone switch sets the device
   every settings form edits. On Tablet or Phone a style setting is
   kept in `data.responsive[device][key]` and applies at that width and
   below (tablet 1024px, phone 720px); content (text, links, items,
   which records a block lists, backgrounds) stays one value for every
   device. Phone falls back to Tablet, Tablet to Desktop.

   Nothing here knows a block's controls. `view(data)` gives a form the
   data as the current device sees it: a Proxy that reads through the
   fallbacks and routes writes to the right layer, so every control
   works unchanged. `merge(data, values)` does the same for the modals
   that write a whole set of values at once.

   A few blocks already had a phone-only field the page renders with
   its own rules (a container's mobile padding and direction, a hero's
   mobile height). On Phone those settings read and write that field,
   so its rendering stays as it was. */
(function () {
  'use strict';

  const DEVICES = ['tablet', 'phone'];
  const WIDTHS = { tablet: 1024, phone: 720 };
  const NAMES = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' };

  // The same on every device: what a block says, links to or lists,
  // how it behaves, and its background (images, video and animated
  // backgrounds are markup, not CSS).
  const SHARED = new Set([
    'responsive', 'blocks', 'cell_lengths', 'id', 'label',
    'text', 'md', 'html', 'code', 'title', 'subtitle', 'heading', 'subheading', 'eyebrow',
    'intro', 'caption', 'alt', 'name', 'items', 'item_ids', 'buttons', 'empty_message',
    'url', 'href', 'src', 'poster', 'new_tab', 'lang', 'text_dynamic', 'tagline_enabled',
    'category_id', 'library_id', 'officer_id', 'tag_id', 'filter', 'sort',
    'max_count', 'max_items', 'max_level', 'show_first_n',
    'show_email', 'show_name', 'show_phone', 'show_role',
    'level', 'ordered', 'display', 'display_style', 'bullet_style', 'style', 'variant',
    'card_style', 'mode', 'renderer', 'animation', 'playback', 'autoplay', 'loop', 'speed',
    'sticky', 'particle_effect', 'stagger_ms', 'tagline', 'cta_style', 'group_by_day',
  ]);
  const SHARED_RE = /^(bg_|sinewave_|particle_|show_|hide_)|_(id|ids|url|src|text|md|html|title|caption|label|items|new_tab)$/;

  // Phone-only fields the page already renders: on Phone, `key` reads
  // and writes `to`. `empty` is shown when `to` is blank; `inherit`
  // means blank falls back to the larger devices. A `group` is written
  // whole: the page draws a blank mobile padding side as 0 once any
  // side is set, so the other sides get their inherited value.
  const ALIASES = {
    container: {
      direction: { to: 'mobile_direction', empty: 'column' },
      padding_top: { to: 'padding_mobile_top', inherit: true, group: 'pad' },
      padding_right: { to: 'padding_mobile_right', inherit: true, group: 'pad' },
      padding_bottom: { to: 'padding_mobile_bottom', inherit: true, group: 'pad' },
      padding_left: { to: 'padding_mobile_left', inherit: true, group: 'pad' },
    },
    hero: {
      height_vh_desktop: { to: 'height_vh_mobile', inherit: true, blank: 0 },
    },
  };

  // Beside the heading of each setting that can differ by device, the
  // device being edited: muted when it shows a larger screen's value,
  // in the accent colour when this device sets its own.
  const ICONS = {
    desktop: '<rect width="20" height="14" x="2" y="3" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  };
  // A control's row, and the row's heading, in the shapes the
  // settings forms and the block dialogs use. A bare <label> counts
  // only outside those rows (a switch's or an option's own label is
  // not the setting's heading).
  const ROWS = '.be-container-row, .nav-megalink-field, .special-page-row, .be-button-color-row, .be-field';
  const HEADS = '.be-container-row-lbl, .nav-megalink-field-lbl, .u-name, .be-button-color-lbl, .field-label-row';
  // A label's own wording (its first text), in a span so an icon can
  // sit right after it rather than after the control it holds.
  function labelText(lbl) {
    const own = lbl.querySelector(':scope > .rs-lbl-text');
    if (own) return own;
    const t = Array.prototype.find.call(lbl.childNodes, n => n.nodeType === 3 && n.nodeValue.trim());
    if (!t) return lbl;
    const span = document.createElement('span');
    span.className = 'rs-lbl-text';
    t.replaceWith(span);
    span.appendChild(t);
    // A help chip right after the wording stays with it.
    const next = span.nextSibling;
    if (next && next.nodeType === 1 && next.classList.contains('nowrap')) span.appendChild(next);
    return span;
  }
  function headingOf(control) {
    const row = control.closest(ROWS);
    if (row) return row.matches('.be-field') ? row.querySelector(':scope > span') : row.querySelector(HEADS);
    if (/^(radio|checkbox)$/.test(control.type || '')) return null;
    // The nearest label with wording of its own (a colour field's
    // swatch is a label with none).
    const first = control.closest('label:not(.mode-toggle)');
    let lbl = first;
    while (lbl && !lbl.querySelector(HEADS) && !hasText(lbl)) {
      lbl = lbl.parentElement && lbl.parentElement.closest('label:not(.mode-toggle)');
    }
    lbl = lbl || first;
    if (!lbl) return null;
    return lbl.querySelector(HEADS) || labelText(lbl);
  }
  function hasText(lbl) {
    return !!lbl.querySelector(':scope > .rs-lbl-text')
      || Array.prototype.some.call(lbl.childNodes, n => n.nodeType === 3 && n.nodeValue.trim());
  }
  // Where a setting's revert button goes: its heading, or for a switch
  // or tick box, after its own wording.
  function revertHeadingOf(control) {
    const h = headingOf(control);
    if (h || control.type !== 'checkbox') return h;
    const lbl = control.closest('label');
    return lbl ? labelText(lbl) : null;
  }

  // What a block says or holds rather than how it looks or behaves:
  // these never get a revert button (it would wipe the content).
  const CONTENT = new Set([
    'responsive', 'blocks', 'cell_lengths', 'id', 'label',
    'text', 'md', 'html', 'code', 'title', 'subtitle', 'heading', 'subheading', 'eyebrow',
    'intro', 'caption', 'alt', 'name', 'items', 'item_ids', 'buttons', 'empty_message',
    'url', 'href', 'src', 'poster', 'tagline', 'text_dynamic',
  ]);
  const CONTENT_RE = /_(text|md|html|title|subtitle|caption|label|alt|heading|subheading|eyebrow|intro|tagline)$/;
  const NOT_CONTENT = new Set(['hover_text']);  // a colour
  const REVERT_ICON = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>';

  let device = 'desktop';
  let available = false;
  // What the larger screen shows for each block type the last time a
  // dialog read a block (read()), for its revert buttons on Tablet or
  // Phone.
  const inheritedFor = {};
  // Keys the last preview found it couldn't apply per device:
  // { blockId: { tablet: [keys], phone: [keys] } } ('*' = unnamed).
  let skipped = {};

  function isShared(key, value) {
    if (SHARED.has(key) || SHARED_RE.test(key)) return true;
    return value !== null && typeof value === 'object';
  }
  function same(a, b) {
    return String(a == null ? '' : a) === String(b == null ? '' : b);
  }
  function blank(v) { return v == null || v === '' || v === 0 || v === '0'; }
  function chain(dev) { return dev === 'phone' ? ['phone', 'tablet'] : dev === 'tablet' ? ['tablet'] : []; }
  function aliasFor(type, key, dev) {
    return dev === 'phone' && type && ALIASES[type] ? ALIASES[type][key] || null : null;
  }
  function aliasTargets(type) {
    const m = type && ALIASES[type];
    return m ? Object.keys(m).map(k => m[k].to) : [];
  }
  function layer(d, dev, create) {
    let r = d.responsive;
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      if (!create) return null;
      r = d.responsive = {};
    }
    if (!r[dev] || typeof r[dev] !== 'object') {
      if (!create) return null;
      r[dev] = {};
    }
    return r[dev];
  }
  function prune(d) {
    const r = d.responsive;
    if (!r || typeof r !== 'object') return;
    DEVICES.forEach(dev => { if (r[dev] && !Object.keys(r[dev]).length) delete r[dev]; });
    if (!Object.keys(r).length) delete d.responsive;
  }
  // The value `dev` gets from the devices larger than it.
  function inherited(d, key, dev) {
    const larger = dev === 'phone' ? ['tablet'] : [];
    for (const lv of larger) {
      const l = layer(d, lv);
      if (l && Object.prototype.hasOwnProperty.call(l, key)) return l[key];
    }
    return d[key];
  }

  function get(d, key, dev, type) {
    if (dev === 'desktop' || isShared(key, d[key])) return d[key];
    const a = aliasFor(type, key, dev);
    if (a) {
      const v = d[a.to];
      if (!blank(v) || (!a.inherit && v != null && v !== '')) return v;
      return a.inherit ? inherited(d, key, dev) : a.empty;
    }
    for (const lv of chain(dev)) {
      const l = layer(d, lv);
      if (l && Object.prototype.hasOwnProperty.call(l, key)) return l[key];
    }
    return d[key];
  }
  function set(d, key, value, dev, type) {
    if (dev === 'desktop' || isShared(key, value === undefined ? d[key] : value)) {
      d[key] = value;
      return;
    }
    // The phone-only fields are this device's value already.
    if (aliasTargets(type).indexOf(key) >= 0) return;
    const a = aliasFor(type, key, dev);
    if (a && a.group) {
      const m = ALIASES[type];
      const sibs = Object.keys(m).filter(k => m[k].group === a.group);
      const vals = {};
      sibs.forEach(k => { vals[k] = blank(d[m[k].to]) ? inherited(d, k, dev) : d[m[k].to]; });
      vals[key] = value;
      const plain = sibs.every(k => same(vals[k], inherited(d, k, dev)));
      sibs.forEach(k => { d[m[k].to] = plain ? '' : vals[k]; });
      return;
    }
    if (a) {
      d[a.to] = a.inherit && same(value, inherited(d, key, dev))
        ? (a.blank !== undefined ? a.blank : '') : value;
      return;
    }
    const l = layer(d, dev, true);
    if (value === undefined || same(value, inherited(d, key, dev))) delete l[key];
    else l[key] = value;
    prune(d);
  }
  function remove(d, key, dev, type) {
    if (dev === 'desktop' || isShared(key, d[key])) { delete d[key]; return; }
    const a = aliasFor(type, key, dev);
    if (a && a.group) { set(d, key, inherited(d, key, dev), dev, type); return; }
    if (a) { d[a.to] = a.blank !== undefined ? a.blank : ''; return; }
    const l = layer(d, dev);
    if (l) { delete l[key]; prune(d); }
  }

  const api = {
    DEVICES, WIDTHS, NAMES,
    get device() { return device; },
    // Device editing is on only where something offers the switch
    // (the page builder); elsewhere every form edits Desktop.
    get available() { return available; },
    enable() { available = true; },
    setDevice(dev) {
      const next = dev === 'tablet' || dev === 'phone' ? dev : 'desktop';
      if (next === device) return;
      device = next;
      document.dispatchEvent(new CustomEvent('tsp:device', { detail: { device } }));
    },
    current() { return available ? device : 'desktop'; },
    isShared,

    // The block's data as `dev` (default: the current device) sees it,
    // for a form to read and write.
    // `onRead(key)`, when given, hears every key the form reads, so a
    // control can be matched to the keys it edits.
    view(d, type, dev, onRead) {
      dev = dev || api.current();
      if (!d || (dev === 'desktop' && !onRead)) return d;
      return new Proxy(d, {
        get(t, k) {
          if (typeof k !== 'string') return t[k];
          if (onRead) onRead(k);
          return get(t, k, dev, type);
        },
        set(t, k, v) {
          if (typeof k === 'string') set(t, k, v, dev, type);
          else t[k] = v;
          return true;
        },
        deleteProperty(t, k) {
          if (typeof k === 'string') remove(t, k, dev, type);
          else delete t[k];
          return true;
        },
      });
    },
    // A plain copy of what `dev` sees: for forms that fill themselves
    // from an object.
    read(d, type, dev) {
      dev = dev || api.current();
      if (type) {
        inheritedFor[type] = d && dev !== 'desktop'
          ? Object.assign({}, api.read(d, type, dev === 'phone' ? 'tablet' : 'desktop')) : null;
      }
      if (!d || dev === 'desktop') return d;
      const out = Object.assign({}, d);
      Object.keys(d).forEach(k => { out[k] = get(d, k, dev, type); });
      for (const lv of chain(dev).slice().reverse()) {
        const l = layer(d, lv);
        if (l) Object.keys(l).forEach(k => { out[k] = get(d, k, dev, type); });
      }
      if (type && ALIASES[type] && dev === 'phone') {
        Object.keys(ALIASES[type]).forEach(k => { out[k] = get(d, k, dev, type); });
      }
      return out;
    },
    // A copy of `d` with `values` written as `dev` would.
    merge(d, values, type, dev) {
      dev = dev || api.current();
      const out = JSON.parse(JSON.stringify(d || {}));
      Object.keys(values || {}).forEach(k => set(out, k, values[k], dev, type));
      return out;
    },

    // What `merge` wrote, for a modal to apply again over a stale copy:
    // the given keys' stored values, the phone-only fields and the
    // per-device map.
    written(d, values, type) {
      const out = {};
      Object.keys(values || {}).concat(aliasTargets(type)).forEach(k => {
        if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
      });
      out.responsive = d.responsive ? JSON.parse(JSON.stringify(d.responsive)) : undefined;
      return out;
    },

    // The keys `dev` sets itself, for the settings panel to list.
    overrides(d, type, dev) {
      dev = dev || api.current();
      if (!d || dev === 'desktop') return [];
      const keys = Object.keys(layer(d, dev) || {});
      if (dev === 'phone' && type && ALIASES[type]) {
        Object.keys(ALIASES[type]).forEach(k => {
          const a = ALIASES[type][k];
          const v = d[a.to];
          if (a.inherit ? !blank(v) && !same(v, inherited(d, k, dev)) : (v != null && v !== '')) keys.push(k);
        });
      }
      return keys;
    },
    reset(d, type, dev, key) {
      dev = dev || api.current();
      (key ? [key] : api.overrides(d, type, dev)).forEach(k => remove(d, k, dev, type));
    },

    // Keys the preview couldn't apply, from its <!--rs-skip--> notes.
    readSkips(doc) {
      const out = {};
      if (doc && doc.createTreeWalker) {
        const w = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
        let n;
        while ((n = w.nextNode())) {
          const m = /^rs-skip:([^:]+):([a-z]+):(.*)$/.exec(n.nodeValue || '');
          if (!m) continue;
          (out[m[1]] = out[m[1]] || {})[m[2]] = m[3].split(',').filter(Boolean);
        }
      }
      skipped = out;
      document.dispatchEvent(new CustomEvent('tsp:rs-skips'));
    },
    skips(id, dev) {
      dev = dev || api.current();
      return (skipped[id] && skipped[id][dev]) || [];
    },

    // Put the device icon beside the heading of each control in
    // `items` ([{ el, keys, own }]) that edits a per-device key; `own`
    // when the device sets one of them itself.
    mark(items, dev) {
      dev = dev || api.current();
      const heads = new Map();
      (items || []).forEach(it => {
        if (!it.el || !(it.keys || []).some(k => !isShared(k))) return;
        const h = headingOf(it.el);
        if (h) heads.set(h, heads.get(h) || !!it.own);
      });
      heads.forEach((own, h) => {
        let ic = h.querySelector('.rs-dev-icon');
        if (!ic) {
          ic = document.createElement('span');
          const help = h.querySelector('.heading-help');
          if (help) help.before(ic);
          else h.appendChild(ic);
        }
        ic.className = 'rs-dev-icon' + (own ? ' is-own' : '');
        ic.title = dev === 'desktop' ? 'Desktop: every screen size, unless Tablet or Phone set their own'
          : NAMES[dev] + ', ' + WIDTHS[dev] + 'px and narrower' + (own ? ': set for this screen' : ': same as the larger screen');
        ic.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[dev] + '</svg>';
      });
    },

    headingOf,
    revertHeadingOf,
    isContent(key) { return !NOT_CONTENT.has(key) && (CONTENT.has(key) || CONTENT_RE.test(key)); },

    // Show (or take away) the revert button in a setting's heading.
    // `onclick` puts the setting back.
    setRevert(head, on, onclick, title) {
      let btn = head && head.querySelector('.rs-revert');
      if (!on) { if (btn) btn.remove(); return; }
      if (!head) return;
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rs-revert';
        btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + REVERT_ICON + '</svg>';
        const after = head.querySelector('.rs-dev-icon');
        const help = head.querySelector('.heading-help');
        if (after) after.after(btn);
        else if (help) help.before(btn);
        else head.appendChild(btn);
      }
      btn.title = title || 'Revert to default';
      btn.setAttribute('aria-label', btn.title);
      btn.onclick = e => { e.preventDefault(); e.stopPropagation(); onclick(); };
    },

    // Revert buttons for a block dialog's fields ([data-<type>-field]).
    // On Desktop a field goes back to the value its markup starts with;
    // on Tablet or Phone to what the larger screen shows.
    markDialogReverts(m, dev) {
      dev = dev || api.current();
      const byKey = new Map();
      m.querySelectorAll('[data-hero-field], [data-meetings-field], [data-events-field], [data-features-field], [data-faq-field]')
        .forEach(f => {
          const a = Array.prototype.find.call(f.attributes, x => /^data-[a-z]+-field$/.test(x.name));
          if (!a || f.type === 'file') return;
          const type = /^data-([a-z]+)-field$/.exec(a.name)[1];
          const key = a.value.replace(/^frontend_hero_/, '').replace(/^frontend_/, '');
          if (!key || api.isContent(key)) return;
          const id = type + ':' + key;
          if (!byKey.has(id)) byKey.set(id, { type, key, els: [] });
          byKey.get(id).els.push(f);
        });
      const kind = it => it.els[0].type === 'radio' ? 'radio' : it.els[0].type === 'checkbox' ? 'check' : 'value';
      const val = it => {
        const k = kind(it);
        if (k === 'radio') { const c = it.els.find(f => f.checked); return c ? c.value : ''; }
        return k === 'check' ? it.els[0].checked : it.els[0].value;
      };
      const start = it => {
        const k = kind(it), f = it.els[0];
        if (k === 'radio') { const c = it.els.find(x => x.defaultChecked); return c ? c.value : ''; }
        if (k === 'check') return f.defaultChecked;
        if (f.tagName === 'SELECT') {
          const o = Array.prototype.find.call(f.options, x => x.defaultSelected) || f.options[0];
          return o ? o.value : '';
        }
        return f.defaultValue;
      };
      const target = it => {
        if (dev === 'desktop' || isShared(it.key)) return start(it);
        const inh = inheritedFor[it.type];
        // A field saved under another name (the hero's sizes) can't be
        // matched to the larger screen's value: no button.
        if (!inh || !Object.prototype.hasOwnProperty.call(inh, it.key)) return null;
        const v = inh[it.key];
        return kind(it) === 'check' ? !!v && v !== '0' && v !== 'false' : (v == null ? '' : String(v));
      };
      const put = (it, t) => {
        const k = kind(it);
        let f = it.els[0];
        if (k === 'radio') {
          f = it.els.find(x => x.value === String(t));
          if (!f) return;
          f.checked = true;
        } else if (k === 'check') f.checked = !!t;
        else f.value = t;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const heads = new Map();
      byKey.forEach(it => {
        const anchor = it.els[0].type === 'radio' ? it.els[0].closest(ROWS) : it.els[0];
        const h = anchor && revertHeadingOf(anchor);
        if (!h) return;
        if (!heads.has(h)) heads.set(h, []);
        heads.get(h).push(it);
      });
      heads.forEach((items, h) => {
        const off = items.filter(it => { const t = target(it); return t !== null && String(val(it)) !== String(t); });
        api.setRevert(h, off.length > 0, () => {
          off.forEach(it => put(it, target(it)));
          api.markDialogReverts(m, dev);
        }, dev !== 'desktop' && off.some(it => !isShared(it.key)) ? 'Use the larger screen\'s value' : 'Revert to default');
      });
    },

    // "padding_top" → "Padding top".
    keyName(key) {
      const s = String(key).replace(/_/g, ' ').replace(/\bvh\b/, '').replace(/\s+/g, ' ').trim();
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  };
  window.tspResponsive = api;
})();
