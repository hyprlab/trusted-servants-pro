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
    'sticky', 'particle_effect', 'stagger_ms',
  ]);
  const SHARED_RE = /^(bg_|particle_)|_(id|ids|url|src|text|md|html|title|caption|label|items)$/;

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

  let device = 'desktop';
  let available = false;
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
    view(d, type, dev) {
      dev = dev || api.current();
      if (!d || dev === 'desktop') return d;
      return new Proxy(d, {
        get(t, k) { return typeof k === 'string' ? get(t, k, dev, type) : t[k]; },
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

    // "padding_top" → "Padding top".
    keyName(key) {
      const s = String(key).replace(/_/g, ' ').replace(/\bvh\b/, '').replace(/\s+/g, ' ').trim();
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  };
  window.tspResponsive = api;
})();
