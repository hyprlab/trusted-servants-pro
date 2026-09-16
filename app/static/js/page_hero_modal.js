// SPDX-License-Identifier: AGPL-3.0-or-later
/* Per-page hero edit modal — two-way binding between the modal's
   inputs (verbatim copy of the homepage hero modal markup) and the
   active Hero block's data inside the page-edit form's
   blocks_json hidden input.

   Flow:
     1. Admin clicks a Hero pill in the structure card. The pill
        carries `data-page-block-id` (the block's UUID) and
        `data-block-payload` (the block's current JSON).
     2. Existing `[data-open-modal]` handler opens
        `#page-hero-edit-modal`. Our `click` interceptor captures
        the block id, parses the payload, and writes every field
        into the matching `[data-hero-field]` input.
     3. Admin edits anything. Our `input`/`change` listener at the
        modal level reads every `[data-hero-field]`, rebuilds the
        block's data, walks the hidden input's blocks_json to
        replace the matching block, and writes back. Bubbling
        `input` event on the form/save-bar marks it dirty.

   Buttons + file uploads handled by their own helpers below.

   The IIFE body is wrapped in a DOMContentLoaded run-once because
   the page-edit template loads `page_hero_modal.js` BEFORE the
   `_page_hero_modal.html` include further down the document body,
   so an immediate `getElementById('page-hero-edit-modal')` returns
   null and the wiring silently bails. Deferring to DOMContentLoaded
   guarantees the modal element exists before we look it up.
*/
(function () {
  function init() {
    const modal = document.getElementById('page-hero-edit-modal');
    if (!modal) return;
    const hidden = document.getElementById('page-blocks-json');
    if (!hidden) return;
    const form = document.getElementById('page-edit-form');

    // ── Radio grouping fix ─────────────────────────────────────
    // The partial uses `data-hero-field` for our JS hook but
    // dropped the `name` attribute when copying the homepage's
    // markup. Without `name`, radios with the same data-hero-field
    // don't form a group → clicking Sinewave doesn't uncheck
    // Frosty, etc., so `:checked` queries return stale state and
    // the live preview never reflects the new selection. Stamp a
    // synthetic name on each radio to restore the grouping.
    modal.querySelectorAll('input[type="radio"][data-hero-field]').forEach(r => {
      if (!r.name) r.name = 'be-hero-' + r.dataset.heroField;
    });

    // ── Dynbg trigger field plumbing ───────────────────────────
    // The `dynbg_trigger` macro emits hidden inputs by NAME
    // (bg_dynamic_key + bg_dynbg_config_json__modes / __animate_off /
    // __knobs) because the
    // homepage-style admin save handler consumes them by name.
    // Per-block hero saves through blocks_json, so we need to tag
    // the key input with `data-hero-field` so readModal picks it
    // up, AND we need to fold the config sub-inputs into the single
    // `bg_dynbg_config_json` string the public renderer reads. The collection happens inside readDynbgFields
    // below; the dynbg picker already dispatches a bubbling
    // `change` event on the trigger inputs after Save, so our
    // document-level listener picks up the edit automatically.
    const dynKeyInp = modal.querySelector('input[name="bg_dynamic_key"]');
    if (dynKeyInp) dynKeyInp.setAttribute('data-hero-field', 'frontend_hero_bg_dynamic_key');

  // ── Active block tracking ─────────────────────────────────────
  let activeBlockId = null;
  // Per-block latest data, populated on every hero-modal edit.
  // The BlockEditor (in `#page-layout-edit-modal`) auto-mounts on
  // every pill click — even when the click opens OUR modal — and
  // its form-submit handler in `frontend_page_edit.html` writes
  // `editor.serialize()` over `hidden.value` right before submit.
  // For hero blocks that bypass the BlockEditor's UI entirely,
  // `editor.serialize()` returns stale data (the original
  // server-loaded values), wiping our edits. We track every hero
  // edit here and patch it back into `hidden.value` in a late-fire
  // submit listener (registered in init, runs after the inline
  // serializer because external scripts attach first / inline
  // scripts attach second).
  const heroEdits = new Map();   // blockId → latest data object

  // ── Field name mapping ────────────────────────────────────────
  // The modal's inputs carry `data-hero-field="<name>"` matching
  // the homepage's SiteSetting column names. Strip the
  // `frontend_hero_` / `frontend_tagline` prefix to land on the
  // block-data key. A handful of names don't follow the strip
  // pattern and live in the map below.
  const FIELD_OVERRIDES = {
    'frontend_tagline':         'eyebrow',
    'frontend_tagline_enabled': 'tagline_enabled',
    'heading':                  'heading',
    'subheading':               'subheading',
  };
  const SIZE_FIELDS = new Set([
    'frontend_hero_heading_size', 'frontend_hero_subheading_size',
  ]);
  const NUM_FIELDS = new Set([
    'frontend_hero_heading_size', 'frontend_hero_subheading_size',
    'frontend_hero_height_vh_desktop', 'frontend_hero_height_vh_mobile',
    'frontend_hero_bg_gradient_angle', 'frontend_hero_bg_image_scale',
    'frontend_hero_bg_hue', 'frontend_hero_bg_hue_2',
    'frontend_hero_bg_blur', 'frontend_hero_bg_opacity',
    'frontend_hero_bg_video_speed',
    'frontend_hero_particle_speed', 'frontend_hero_particle_size',
    'frontend_hero_particle_opacity', 'frontend_hero_particle_opacity_dark',
  ]);
  // Map from modal field name → block.data key.
  function blockKey(fieldName) {
    if (FIELD_OVERRIDES[fieldName]) return FIELD_OVERRIDES[fieldName];
    let k = fieldName;
    if (k.startsWith('frontend_hero_')) k = k.slice('frontend_hero_'.length);
    if (k.startsWith('frontend_')) k = k.slice('frontend_'.length);
    // Rename to match the block schema (which uses `_pct` suffix
    // for size %, no `frontend_` prefix, etc.).
    if (k === 'heading_size') return 'heading_size_pct';
    if (k === 'subheading_size') return 'subheading_size_pct';
    if (k === 'bg_image_filename') return 'bg_image_src';
    if (k === 'bg_video_filename') return 'bg_video_src';
    return k;
  }

  // ── Read all modal inputs into a block-data shape ─────────────
  function readModal() {
    const data = {};
    modal.querySelectorAll('[data-hero-field]').forEach(inp => {
      const name = inp.dataset.heroField;
      if (!name) return;
      const key = blockKey(name);
      if (inp.type === 'checkbox') {
        // Skip radio-like checkboxes; just plain on/off toggles here.
        data[key] = !!inp.checked;
      } else if (inp.type === 'radio') {
        if (inp.checked) data[key] = inp.value;
      } else if (inp.type === 'range' || inp.type === 'number'
                 || NUM_FIELDS.has(name)) {
        const n = parseInt(inp.value, 10);
        data[key] = isNaN(n) ? 0 : n;
      } else {
        data[key] = inp.value;
      }
    });
    // Dynbg config — combine the picker macro's hidden sub-inputs
    // (`bg_dynbg_config_json__modes` / `__animate_off` / `__knobs`)
    // into the single JSON string the
    // public renderer expects in `bg_dynbg_config_json`. Mirrors
    // `_dynbg_config_from_form` in routes.py. Drops empty values so
    // the JSON stays minimal.
    function _dyn(name) {
      const inp = modal.querySelector('input[name="bg_dynbg_config_json__' + name + '"]');
      return inp ? (inp.value || '').trim() : '';
    }
    const _dynCfg = {};
    // Per-mode block (light/dark colours, randomise-colours,
    // saturation, intensity, texture) arrives as one JSON blob.
    const _dynModes = _dyn('modes');
    if (_dynModes) {
      try {
        const m = JSON.parse(_dynModes);
        if (m && typeof m === 'object' && Object.keys(m).length) _dynCfg.modes = m;
      } catch (_) { /* malformed → ignore */ }
    }
    if (_dyn('animate_off') === '1') _dynCfg.animate = false;
    // Per-preset knobs (motion speed, dot size/gap, …) arrive as one
    // JSON blob in the `__knobs` input.
    const _dynKnobs = _dyn('knobs');
    if (_dynKnobs) {
      try {
        const k = JSON.parse(_dynKnobs);
        if (k && typeof k === 'object' && Object.keys(k).length) _dynCfg.knobs = k;
      } catch (_) { /* malformed → ignore */ }
    }
    data.bg_dynbg_config_json = Object.keys(_dynCfg).length
      ? JSON.stringify(_dynCfg) : '';

    // Sinewave colours collapse 4 separate hex inputs into a single
    // array matching the block schema. Empty / invalid hexes are
    // dropped so the public renderer's fallback engages naturally.
    // The keys in `data` are `sinewave_c1`..`sinewave_c4` (blockKey
    // strips the `frontend_hero_` prefix from the input's
    // data-hero-field but leaves the rest of the name intact —
    // there's no `bg_` segment to strip). Earlier code looked for
    // `bg_sinewave_c1` and silently produced an empty array, which
    // made the public renderer skip its dynamic-text-lightness
    // computation for sinewave bgs (empty list is Python-falsy)
    // and fall back to `fe-hero-text-dark`, so the preview and the
    // frontend disagreed on heading colour. Match the actual key
    // names readModal produces.
    const sw = [];
    for (let i = 1; i <= 4; i++) {
      const k = 'sinewave_c' + i;
      const v = (data[k] || '').trim();
      delete data[k];
      if (/^#[0-9a-fA-F]{6}$/.test(v)) sw.push(v);
    }
    data.bg_sinewave_colors = sw;
    // Buttons live in their own JS-driven list; pull from the
    // current activeBlock if we have one — they don't ride
    // through [data-hero-field] inputs.
    const active = findActiveBlock();
    if (active) data.buttons = active.data.buttons || [];
    return data;
  }

  // ── Walk blocks_json + find / replace the active block ────────
  function readSections() {
    try { return JSON.parse(hidden.value || '[]') || []; }
    catch (_) { return []; }
  }
  function writeSections(sections) {
    hidden.value = JSON.stringify(sections);
    // Mirror the same triple-dispatch page_structure.js uses so the
    // save bar / form-level dirty trackers all light up.
    try { hidden.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    if (form) {
      try { form.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    }
    setTimeout(() => {
      const bar = document.getElementById('fe-save-bar');
      if (bar && bar.hasAttribute('hidden')) {
        bar.hidden = false;
        const m = bar.querySelector('.fe-save-bar-msg');
        if (m) m.textContent = 'Unsaved changes';
      }
    }, 50);
  }
  function walkBlocks(blocks, cb) {
    for (const b of (blocks || [])) {
      if (!b || typeof b !== 'object') continue;
      cb(b);
      if (b.type === 'container' && b.data && Array.isArray(b.data.blocks)) {
        walkBlocks(b.data.blocks, cb);
      }
    }
  }
  function findBlock(blockId) {
    const sections = readSections();
    let found = null;
    for (const sec of sections) {
      walkBlocks(sec.blocks || [], (b) => {
        if (!found && b.id === blockId) found = b;
      });
      if (found) break;
    }
    return found;
  }
  function findActiveBlock() {
    return activeBlockId ? findBlock(activeBlockId) : null;
  }
  // Mutate the hidden JSON in place — find the active block and
  // replace its `data` with the freshly-read modal values.
  function persistModalToBlock() {
    if (!activeBlockId) return;
    const modalData = readModal();
    // Record the latest edit so the submit-restore handler can
    // re-apply it even if the BlockEditor's submit serializer
    // overwrites `hidden.value` with stale state.
    heroEdits.set(activeBlockId, modalData);
    const sections = readSections();
    let touched = false;
    let touchedBlock = null;
    for (const sec of sections) {
      walkBlocks(sec.blocks || [], (b) => {
        if (b.id === activeBlockId) {
          b.data = Object.assign({}, b.data || {}, modalData);
          touched = true;
          touchedBlock = b;
        }
      });
    }
    if (touched) {
      writeSections(sections);
      // Mirror the new payload into the structure-card pill so a
      // later drag-drop (e.g. moving the hero out of a container)
      // doesn't rebuild sections from the stale pre-edit DOM
      // attribute and clobber the work.
      if (touchedBlock && typeof window.tspSyncStructurePayloadOne === 'function') {
        try { window.tspSyncStructurePayloadOne(activeBlockId, touchedBlock); }
        catch (_) {}
      }
    }
  }

  // ── Populate modal inputs from a block's data ─────────────────
  function populateModalFromBlock(block) {
    if (!block || !block.data) return;
    const data = block.data;
    modal.querySelectorAll('[data-hero-field]').forEach(inp => {
      const name = inp.dataset.heroField;
      if (!name) return;
      const key = blockKey(name);
      const v = data[key];
      if (inp.type === 'checkbox') {
        inp.checked = !!v;
      } else if (inp.type === 'radio') {
        inp.checked = (String(inp.value) === String(v));
      } else if (v != null) {
        inp.value = v;
      }
    });
    // Sinewave colours fan out from the array back into 4 inputs.
    const sw = Array.isArray(data.bg_sinewave_colors) ? data.bg_sinewave_colors : [];
    const swDefaults = ['#16c2ba', '#1883d5', '#5a1ce5', '#0a3eb5'];
    for (let i = 1; i <= 4; i++) {
      const inp = modal.querySelector('[data-hero-field="frontend_hero_sinewave_c' + i + '"]');
      if (inp) inp.value = sw[i - 1] || swDefaults[i - 1];
    }
    // Trigger the homepage's slider / panel / preview JS by
    // dispatching input/change events on each control so its
    // visible state (slider readouts, hidden bg-panels) reflects
    // the freshly-populated values.
    modal.querySelectorAll('[data-slider-input], [data-hero-height-input], [data-bg-style-radio]')
      .forEach(inp => {
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      });
    // Colour inputs were just set in code, which fires no event — tell
    // the shared design-token picker to re-read them so each hex caption
    // and "◈ token" badge describes THIS block rather than whatever the
    // modal was server-rendered with.
    try {
      if (window.tspDesignTokenPicker) window.tspDesignTokenPicker.refresh(modal);
    } catch (_) {}
    // Buttons editor
    renderButtonsList(data.buttons || []);
    // Image / video previews
    syncImagePreview(data.bg_image_src || '');
    syncVideoPreview(data.bg_video_src || '');
    // Dynbg trigger — the partial server-renders the trigger ONCE
    // with the default proxy (empty key + config), so when the
    // admin opens a hero block that has a saved dynbg preset, the
    // trigger UI (button label, thumbnail, hidden inputs that the
    // picker modal reads on next open) still shows "Choose…" and
    // every config sub-field reads as empty. Reapply the saved
    // state through the picker's own update function so the
    // trigger reflects what's actually in the block.
    if (window.applyDynbgTrigger) {
      const dynTrigger = modal.querySelector('[data-dynbg-trigger]');
      if (dynTrigger) {
        let cfg = {};
        try { cfg = JSON.parse(data.bg_dynbg_config_json || '{}') || {}; }
        catch (_) { cfg = {}; }
        // Per-mode block; configs saved before the light/dark split
        // carry flat keys instead — expand them so the picker opens
        // with both modes populated.
        const modes = window.dynbgModesFromConfig ? window.dynbgModesFromConfig(cfg)
          : ((cfg.modes && typeof cfg.modes === 'object') ? cfg.modes : null);
        window.applyDynbgTrigger(dynTrigger, {
          key: data.bg_dynamic_key || '',
          modes: modes || '',
          animateOff: cfg.animate === false,
          knobs: (cfg.knobs && typeof cfg.knobs === 'object') ? cfg.knobs : {},
        });
      }
    }
    // Sync the live preview pane from the freshly-populated inputs.
    syncPreview();
  }

  // ── Preview synchronisation (ported from homepage heroFullPreview) ──
  // Reads CURRENT input values out of the modal and stamps them onto
  // the preview elements (#hero-preview-*). Called from
  // populateModalFromBlock (after inputs are set) AND on every
  // input/change event the admin makes, so the preview tracks edits
  // live without the admin needing to save first.
  const preview = {
    section: modal.querySelector('#hero-preview-section'),
    bg: modal.querySelector('#hero-preview-bg'),
    eyebrow: modal.querySelector('#hero-preview-eyebrow'),
    heading: modal.querySelector('#hero-preview-heading'),
    sub: modal.querySelector('#hero-preview-sub'),
    particles: modal.querySelector('#hero-preview-particles'),
    video: modal.querySelector('#hero-preview-video'),
    cta: modal.querySelector('#hero-preview-cta'),
    inner: modal.querySelector('#hero-preview-section .fe-hero-inner'),
  };
  // ── Contain-fit the preview content ────────────────────────────
  // The clip is a fixed 400px frame. A long heading wraps to three
  // lines and pushes the CTA row out of it, so the admin can't see the
  // buttons they're editing. Scale `.fe-hero-inner` down until the
  // whole hero fits — which is what the public hero does anyway at a
  // smaller viewport. Only ever scales DOWN: content that already fits
  // renders 1:1 so the preview isn't lying about size.
  //
  // Transform is visual only, so the element's layout box (and the
  // ResizeObserver below) is unaffected by the scale we apply — no
  // feedback loop.
  const FIT_INSET = 24;         // px of breathing room, top + bottom
  let _fitScale = 1, _fitRaf = 0;
  function fitPreviewContent() {
    const sec = preview.section, inner = preview.inner;
    if (!sec || !inner) return;
    cancelAnimationFrame(_fitRaf);
    _fitRaf = requestAnimationFrame(() => {
      const availH = sec.clientHeight - FIT_INSET;
      const availW = sec.clientWidth;
      const needH = inner.scrollHeight;
      const needW = inner.scrollWidth;
      if (availH <= 0 || needH <= 0 || needW <= 0) return;
      const k = Math.min(1, availH / needH, availW / needW);
      if (Math.abs(k - _fitScale) < 0.002) return;
      _fitScale = k;
      inner.style.transform = k < 1 ? ('scale(' + k.toFixed(4) + ')') : '';
    });
  }
  // Re-fit whenever the content reflows for a reason the sync doesn't
  // see: web fonts landing, an image decoding, a markdown subheading
  // growing a line, the modal being resized.
  try {
    if (window.ResizeObserver && preview.inner) {
      new ResizeObserver(() => fitPreviewContent()).observe(preview.inner);
      if (preview.section) new ResizeObserver(() => fitPreviewContent()).observe(preview.section);
    }
  } catch (_) { /* no RO — the per-edit sync still re-fits */ }
  // The admin shell fetches Fraunces / Inter lazily, so the first paint
  // of a freshly-opened preview can land in the Georgia fallback — which
  // is wider, wraps the heading a line earlier than the real page, and
  // would otherwise bake that wrong height into the fit. Re-fit once the
  // webfonts settle.
  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitPreviewContent());
    }
  } catch (_) { /* fine — the RO above catches the reflow anyway */ }

  function _val(name) {
    const inp = modal.querySelector('[data-hero-field="' + name + '"]');
    return inp ? inp.value : '';
  }
  function _checkedVal(name) {
    const inp = modal.querySelector('[data-hero-field="' + name + '"]:checked');
    return inp ? inp.value : '';
  }
  function _checkedBool(name) {
    const inp = modal.querySelector('[data-hero-field="' + name + '"]');
    return inp ? !!inp.checked : false;
  }
  function _hexLightness(h) {
    h = (h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const bv = parseInt(h.slice(4, 6), 16) / 255;
    return (Math.max(r, g, bv) + Math.min(r, g, bv)) / 2;
  }
  function _avgLightness(values) {
    const v = values.filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  // Button icons, rendered the way the public hero renders them rather
  // than as a `[name]` placeholder: a custom icon is an <img> off
  // /pub/icon/<id>, a built-in is the Lucide SVG looked up in the same
  // catalog (and same cache) the block editor's icon preview uses. The
  // wrapper carries the same `--fe-btn-icon-color` / `--icon-size` vars
  // the server emits, so colour and size preview truthfully too.
  const _LUCIDE_SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  function _btnIconEl(name, color, size) {
    if (!name) return null;
    const span = document.createElement('span');
    span.className = 'fe-btn-icon';
    const vars = [];
    if (color) vars.push('--fe-btn-icon-color: ' + color);
    const px = parseInt(size, 10);
    if (!isNaN(px)) vars.push('--icon-size: ' + px + 'px');
    if (vars.length) span.setAttribute('style', vars.join('; ') + ';');
    if (String(name).indexOf('custom:') === 0) {
      const cid = String(name).split(':', 2)[1] || '';
      const img = document.createElement('img');
      img.className = 'icon icon-custom';
      img.alt = '';
      img.src = '/pub/icon/' + encodeURIComponent(cid);
      span.appendChild(img);
      return span;
    }
    const api = window.BlockEditor;
    if (!api || !api.iconCatalog || !api.iconPaths) return span;
    api.iconCatalog().then(catalog => {
      const paths = api.iconPaths(catalog, name);
      // Unknown ref (renamed / removed icon): leave the wrapper empty
      // rather than printing the raw name into the button, which is
      // what the public page does too.
      if (paths) span.innerHTML = '<svg class="icon" ' + _LUCIDE_SVG_ATTRS + '>' + paths + '</svg>';
    }).catch(() => {});
    return span;
  }

  // The subheading accepts markdown + inline HTML (the server renders it
  // through `markdown_inline`, which sanitises via nh3). `marked` is the
  // same vendored parser the meeting modal previews with; without it the
  // preview falls back to plain text rather than injecting raw markup.
  function _setSubHtml(el, value) {
    const v = value || '';
    if (typeof marked === 'undefined') { el.textContent = v; return; }
    try {
      marked.setOptions({ breaks: true, gfm: true });
      el.innerHTML = marked.parse(v);
    } catch (_) { el.textContent = v; }
  }
  let _partFx = null;
  function _destroyPart() {
    if (_partFx) { try { _partFx.destroy(); } catch (_) {} _partFx = null; }
  }
  // Particle ink for whichever theme the preview pane is showing, so
  // flipping the pane's Light / Dark radio re-tints the layer the same
  // way the public hero does when the visitor toggles theme.
  function _partInk() {
    const f = previewTheme() === 'dark'
      ? 'frontend_hero_particle_color_dark' : 'frontend_hero_particle_color';
    return _val(f) || '#ffffff';
  }
  function _partOpacity() {
    const light = parseInt(_val('frontend_hero_particle_opacity'), 10);
    const v = previewTheme() === 'dark'
      ? parseInt(_val('frontend_hero_particle_opacity_dark'), 10)
      : light;
    if (!isNaN(v)) return v;
    return isNaN(light) ? 100 : light;   // dark unset → follow light
  }
  // Some effects ignore the size multiplier entirely — `waves` paints
  // full-width bands rather than discrete particles, so the slider would
  // sit there doing nothing. Grey it out and say why, rather than hide
  // it: the stored value still applies the moment another effect is
  // picked. The effect list lives on the field in markup.
  function _syncParticleSizeState() {
    const field = modal.querySelector('[data-particle-size-field]');
    if (!field) return;
    const effect = _val('frontend_hero_particle_effect') || 'stars';
    const off = (field.dataset.nosizeEffects || '').split(',')
      .filter(Boolean).indexOf(effect) !== -1;
    field.classList.toggle('is-off', off);
    const input = field.querySelector('input[type="range"]');
    const label = effect.charAt(0).toUpperCase() + effect.slice(1);
    if (input) {
      input.disabled = off;
      input.title = off ? (label + ' draws full-width bands rather than individual '
        + 'particles, so size has nothing to scale. Pick another effect to use it.') : '';
    }
    const note = field.querySelector('[data-particle-size-note]');
    if (note) {
      note.textContent = off ? ('— not used by ' + label) : '';
      note.hidden = !off;
    }
  }
  function _buildPart() {
    _destroyPart();
    if (!preview.particles || !window.initLoginFX) return;
    preview.particles.hidden = false;
    try {
      _partFx = window.initLoginFX(preview.particles, {
        effect: _val('frontend_hero_particle_effect') || 'stars',
        speed: parseInt(_val('frontend_hero_particle_speed'), 10) || 100,
        size: parseInt(_val('frontend_hero_particle_size'), 10) || 100,
        color: _partInk(),
        opacity: _partOpacity(),
      });
    } catch (_) { _partFx = null; }
  }

  function syncPreview() {
    try { _syncPreviewInner(); }
    catch (err) { console.warn('[page-hero-modal] syncPreview failed', err); }
  }
  // Which theme the preview pane is showing. The public hero renders
  // differently in dark mode — its own backdrop and heading gradient,
  // plus the dynamic background's dark-mode palette / tone / texture —
  // so the pane can be flipped independently of the admin's own theme.
  function previewTheme() {
    const r = modal.querySelector('[data-hero-preview-theme]:checked');
    return r && r.value === 'dark' ? 'dark' : 'light';
  }
  function _syncPreviewInner() {
    if (!preview.section) return;
    // `.fe-hero--force-dark` applies the hero's dark cluster from
    // frontend.css to this one section; `.fe-megamenu-force-dark` does
    // the same for the dynbg recipes' dark rules.
    const dark = previewTheme() === 'dark';
    preview.section.classList.toggle('fe-hero--force-dark', dark);
    preview.section.classList.toggle('fe-megamenu-force-dark', dark);
    // ── Text content ───────────────────────────────────────────
    const heading = _val('heading') || 'You are not alone.';
    const sub = _val('subheading') || 'Find meetings, connect with your community.';
    const eyebrowText = _val('frontend_tagline') || '';
    const eyebrowOn = _checkedBool('frontend_tagline_enabled');
    if (preview.heading) preview.heading.textContent = heading;
    if (preview.sub) _setSubHtml(preview.sub, sub);
    // Toggling "Show tagline" on with an empty Tagline field renders
    // nothing (the public hero needs both), which reads as a dead
    // switch. Surface the reason next to the toggle.
    const taglineNote = modal.querySelector('[data-tagline-empty-note]');
    if (taglineNote) taglineNote.hidden = !(eyebrowOn && !eyebrowText.trim());
    if (preview.eyebrow) {
      preview.eyebrow.textContent = eyebrowText;
      preview.eyebrow.hidden = !(eyebrowOn && eyebrowText.trim());
    }

    // ── Typography ─────────────────────────────────────────────
    const hFont = _checkedVal('frontend_hero_heading_font') || 'fraunces';
    const sFont = _checkedVal('frontend_hero_subheading_font') || 'inter';
    if (preview.heading) {
      preview.heading.classList.remove('fe-hero-heading-fraunces', 'fe-hero-heading-inter');
      preview.heading.classList.add('fe-hero-heading-' + hFont);
      const hSize = parseInt(_val('frontend_hero_heading_size'), 10) || 100;
      preview.heading.style.setProperty('--fe-hero-h-size', (hSize / 100).toString());
      preview.heading.style.setProperty('--fe-hero-h-grad-s', _val('frontend_hero_heading_grad_start') || '#0f172a');
      preview.heading.style.setProperty('--fe-hero-h-grad-e', _val('frontend_hero_heading_grad_end') || '#374151');
      // Dark-mode gradient — only visible in the preview when the admin
      // is editing under the dark theme. The rule still emits so a quick
      // theme toggle from elsewhere reflects the live colour without
      // re-opening the modal.
      const hGradSDark = _val('frontend_hero_heading_grad_start_dark');
      const hGradEDark = _val('frontend_hero_heading_grad_end_dark');
      if (hGradSDark) preview.heading.style.setProperty('--fe-hero-h-grad-s-dark', hGradSDark);
      else preview.heading.style.removeProperty('--fe-hero-h-grad-s-dark');
      if (hGradEDark) preview.heading.style.setProperty('--fe-hero-h-grad-e-dark', hGradEDark);
      else preview.heading.style.removeProperty('--fe-hero-h-grad-e-dark');
    }
    if (preview.sub) {
      preview.sub.classList.remove('fe-hero-sub-fraunces', 'fe-hero-sub-inter');
      preview.sub.classList.add('fe-hero-sub-' + sFont);
      const sSize = parseInt(_val('frontend_hero_subheading_size'), 10) || 100;
      preview.sub.style.setProperty('--fe-hero-sub-size', (sSize / 100).toString());
      const sColor = _val('frontend_hero_subheading_color');
      if (sColor) preview.sub.style.setProperty('--fe-hero-sub-color', sColor);
      else preview.sub.style.removeProperty('--fe-hero-sub-color');
      // Dark-mode sub colour — same flow as the heading gradient above.
      const sColorDark = _val('frontend_hero_subheading_color_dark');
      if (sColorDark) preview.sub.style.setProperty('--fe-hero-sub-color-dark', sColorDark);
      else preview.sub.style.removeProperty('--fe-hero-sub-color-dark');
    }

    // ── Background ─────────────────────────────────────────────
    const style = _checkedVal('frontend_hero_bg_style') || 'frosty';
    preview.section.classList.remove(
      'fe-hero-bg-frosty', 'fe-hero-bg-solid', 'fe-hero-bg-gradient',
      'fe-hero-bg-image', 'fe-hero-bg-sinewave', 'fe-hero-bg-video',
      'fe-hero-bg-dynamic');
    preview.section.classList.add('fe-hero-bg-' + style);
    preview.section.classList.toggle('fe-dynbg-host', style === 'dynamic');
    if (preview.bg) preview.bg.hidden = (style !== 'frosty');
    if (preview.video) preview.video.hidden = (style !== 'video');

    // Dynbg preview — clone the picker modal's card markup for the
    // active preset and inject it as the section's first child. The
    // picker's cards include the exact `<div class="fe-dynbg
    // fe-dynbg-<key>">…</div>` structure the public renderer emits
    // (via `frontend/_dynbg.html`), so the preset's CSS recipe
    // (animated blobs, conic gradients, etc.) paints automatically.
    // Saved palette colours land on `--fe-dynbg-c1/-c2/-c3`; random
    // positions stay at the preset's hand-tuned defaults for the
    // preview pane (the per-refresh randomisation only matters on
    // the public render and is impractical to mirror live in JS).
    (function applyDynbgPreview() {
      // Remove any existing injected dynbg from a prior sync.
      const stale = preview.section.querySelector(':scope > .fe-dynbg');
      if (stale) stale.remove();
      // Same for the overlay we may inject.
      const staleOverlay = preview.section.querySelector(':scope > .fe-dynbg-overlay');
      if (staleOverlay) staleOverlay.remove();
      if (style !== 'dynamic') return;
      const active = findActiveBlock();
      const blockData = (active && active.data) || {};
      const key = blockData.bg_dynamic_key || '';
      if (!key) return;
      const card = document.querySelector(
        '#dynbg-picker-modal [data-dynbg-modal-card][data-dynbg-key="' +
        CSS.escape(key) + '"]');
      if (!card) return;
      const cardDynbg = card.querySelector('.fe-dynbg-picker-thumb .fe-dynbg');
      if (!cardDynbg) return;
      const clone = cardDynbg.cloneNode(true);
      preview.section.insertBefore(clone, preview.section.firstChild);
      // Apply saved palette colours (when not randomised, or as a
      // representative seed when randomised — the user still sees a
      // realistic coloured preview, just not the exact per-refresh
      // shuffle).
      let cfg = {};
      try { cfg = JSON.parse(blockData.bg_dynbg_config_json || '{}') || {}; }
      catch (_) { cfg = {}; }
      // Preview the block for the pane's selected theme (palette,
      // saturation, colour fill, texture, pattern settings) exactly
      // like the public render + picker preview for that mode.
      // Configs saved before the light/dark split carry flat keys —
      // expand them.
      const modes = window.dynbgModesFromConfig ? window.dynbgModesFromConfig(cfg)
        : ((cfg.modes && typeof cfg.modes === 'object') ? cfg.modes : null);
      const pm = previewTheme();
      const L = (modes && modes[pm] && typeof modes[pm] === 'object') ? modes[pm] : {};
      let colors = Array.isArray(L.colors) ? L.colors : [];
      // Random / unset palette: the card's server-rendered
      // `.fe-dynbg-picker-thumb` wrapper carries a sample
      // `--fe-dynbg-cN` palette inline (dynbg_thumb_style). Use it
      // as the seed so it flows through the same tone path below —
      // mirrors the public render, where resolve_colors() rolls a
      // random palette and re-saturates it. Without this the preview
      // fell back to the preset's brand colours, which the sliders
      // can't touch, so it looked dead whenever "random colours" was on.
      if (L.randomize_colors || !colors.some(Boolean)) {
        const thumb = card.querySelector('.fe-dynbg-picker-thumb');
        colors = [1, 2, 3, 4, 5, 6].map(i => thumb ? (thumb.style.getPropertyValue('--fe-dynbg-c' + i) || '').trim() : '');
      }
      // Missing keys = 100 (full vivid).
      const satL = isFinite(parseInt(L.sat, 10)) ? Math.max(0, Math.min(100, parseInt(L.sat, 10))) : 100;
      const brightL = isFinite(parseInt(L.bright, 10)) ? Math.max(0, Math.min(200, parseInt(L.bright, 10))) : 100;
      const fillL = isFinite(parseInt(L.fill, 10)) ? Math.max(0, Math.min(100, parseInt(L.fill, 10))) : 0;
      const soften = window.dynbgSaturateHex ? c => window.dynbgSaturateHex(c, satL, brightL) || c : c => c;
      preview.section.style.setProperty('--fe-dynbg-fill', String(fillL / 100));
      // Pattern-tile per-mode settings for light mode (the admin shell).
      ['--fe-dynbg-pat-opacity', '--fe-dynbg-pat-bg2', '--fe-dynbg-pat-bg-angle']
        .forEach(v => preview.section.style.removeProperty(v));
      if (key === 'pattern-tile') {
        if (L.pat_opacity != null && L.pat_opacity !== 100) preview.section.style.setProperty('--fe-dynbg-pat-opacity', String(L.pat_opacity / 100));
        if (L.pat_bg === 'gradient') preview.section.style.setProperty('--fe-dynbg-pat-bg2', 'var(--fe-dynbg-c6, var(--fe-dynbg-c5, #e2e8f0))');
        if (L.pat_bg_angle != null && L.pat_bg_angle !== 135) preview.section.style.setProperty('--fe-dynbg-pat-bg-angle', L.pat_bg_angle + 'deg');
      }
      // Per-preset knobs (motion speed, dot size/gap, …). These are
      // shared across modes and live at the config's top level. Clear
      // the preset's whole var set first so a knob returned to its
      // default doesn't linger from a previous sync.
      if (window.dynbgKnobVarNames) {
        window.dynbgKnobVarNames(key).forEach(v => preview.section.style.removeProperty(v));
      }
      if (window.dynbgKnobVars && cfg.knobs && typeof cfg.knobs === 'object') {
        window.dynbgKnobVars(key, cfg.knobs).forEach(decl => {
          const i = decl.indexOf(':');
          if (i > 0) preview.section.style.setProperty(decl.slice(0, i).trim(),
                                                       decl.slice(i + 1).replace(/;$/, '').trim());
        });
      }
      for (let i = 0; i < 6; i++) {
        if (colors[i]) {
          preview.section.style.setProperty('--fe-dynbg-c' + (i + 1), soften(colors[i]));
        } else {
          preview.section.style.removeProperty('--fe-dynbg-c' + (i + 1));
        }
      }
      // The catalog thumb we cloned carries whatever motif the server
      // randomly drew for the tile — rebuild the pattern preset's
      // layers for the motif THIS block actually saved.
      if (key === 'pattern-tile' && window.dynbgPatternLayers) {
        clone.innerHTML = '';
        // The thumb we cloned carries ITS motif's tile size inline; it
        // would outrank anything set on the section, so the chosen
        // motif's size goes on the clone itself.
        clone.removeAttribute('style');
        const kn = (cfg.knobs && typeof cfg.knobs === 'object') ? cfg.knobs : {};
        window.dynbgPatternLayers(kn.pattern || 'random', kn.weight != null ? kn.weight : 2)
          .then(pat => {
            if (!clone.isConnected) return;  // a later sync replaced us
            if (pat.w) {
              clone.style.setProperty('--fe-dynbg-pat-w', pat.w + 'px');
              clone.style.setProperty('--fe-dynbg-pat-h', pat.h + 'px');
            }
            pat.urls.forEach((u, i) => {
              const sp = document.createElement('span');
              sp.className = 'fe-dynbg-pattern';
              sp.style.setProperty('--_db-pat-url', "url('" + u + "')");
              sp.style.setProperty('--_db-pat-ink', 'var(--_db-ink' + (i + 1) + ')');
              clone.appendChild(sp);
            });
          });
      }
      // Inject the light-mode overlay layer (noise-grain / scanlines /
      // linen / etc.) when the admin picked one. The picker's overlay
      // strip holds the exact markup the public renderer would emit.
      if (L.overlay) {
        const oCard = document.querySelector(
          '#dynbg-picker-modal [data-dynbg-mode-overlay-card][data-dynbg-overlay-key="' +
          CSS.escape(L.overlay) + '"]');
        if (oCard) {
          const oThumb = oCard.querySelector('.fe-dynbg-picker-thumb .fe-dynbg-overlay');
          if (oThumb) {
            const oClone = oThumb.cloneNode(true);
            if (L.overlay_scope === 'bg') oClone.classList.add('fe-dynbg-overlay--bg-only');
            preview.section.appendChild(oClone);
          }
        }
      }
    })();
    // Reset bg props before per-style application.
    preview.section.style.background = '';
    preview.section.style.backgroundImage = '';
    preview.section.style.backgroundSize = '';
    preview.section.style.backgroundRepeat = '';
    preview.section.style.backgroundColor = '';
    if (style === 'solid') {
      const c = _val('frontend_hero_bg_color');
      if (c) preview.section.style.background = c;
    } else if (style === 'gradient') {
      const g1 = _val('frontend_hero_bg_color') || '#ffffff';
      const g2 = _val('frontend_hero_bg_color_2') || '#e0e7ff';
      const ang = parseInt(_val('frontend_hero_bg_gradient_angle'), 10) || 180;
      preview.section.style.background = 'linear-gradient(' + ang + 'deg, ' + g1 + ', ' + g2 + ')';
    } else if (style === 'image') {
      const active = findActiveBlock();
      const src = (active && active.data && active.data.bg_image_src) || '';
      if (src) {
        const mode = _checkedVal('frontend_hero_bg_image_mode') || 'cover';
        if (mode === 'tile') {
          const sc = parseInt(_val('frontend_hero_bg_image_scale'), 10) || 100;
          preview.section.style.background = 'url("' + src + '") repeat';
          preview.section.style.backgroundSize = sc + 'px ' + sc + 'px';
        } else {
          preview.section.style.background = 'url("' + src + '") center/cover no-repeat';
        }
      }
    } else if (style === 'sinewave' && window.loginFxUtils) {
      const palette = [];
      for (let i = 1; i <= 4; i++) {
        const v = _val('frontend_hero_sinewave_c' + i);
        if (/^#[0-9a-fA-F]{6}$/.test((v || '').trim())) palette.push(v);
      }
      if (palette.length) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const adj = window.loginFxUtils.adjustPaletteForTheme(palette, isDark);
        window.loginFxUtils.applyBackground(preview.section, adj);
      }
    } else if (style === 'video' && preview.video) {
      const active = findActiveBlock();
      const src = (active && active.data && active.data.bg_video_src) || '';
      const cur = preview.video.querySelector('source');
      if (src) {
        if (!cur || cur.getAttribute('src') !== src) {
          preview.video.innerHTML = '<source src="' + src + '">';
          try { preview.video.load(); } catch (_) {}
        }
        const spd = parseInt(_val('frontend_hero_bg_video_speed'), 10) || 100;
        try { preview.video.playbackRate = spd / 100; } catch (_) {}
        preview.video.play().catch(() => {});
      }
    }

    // ── Frosty blob CSS vars ──────────────────────────────────
    if (style === 'frosty' && preview.bg) {
      preview.bg.style.setProperty('--fe-blob-hue-a', _val('frontend_hero_bg_hue') || '225');
      preview.bg.style.setProperty('--fe-blob-hue-b', _val('frontend_hero_bg_hue_2') || '170');
      preview.bg.style.setProperty('--fe-blob-blur', (_val('frontend_hero_bg_blur') || '80') + 'px');
      const op = parseInt(_val('frontend_hero_bg_opacity'), 10) || 45;
      preview.bg.style.setProperty('--fe-blob-op', (op / 100).toString());
    }

    // ── Dynamic-text contrast ─────────────────────────────────
    preview.section.classList.remove('fe-hero-text-light', 'fe-hero-text-dark');
    if (_checkedBool('frontend_hero_text_dynamic')) {
      let l = 0.95;
      if (style === 'solid') {
        l = _hexLightness(_val('frontend_hero_bg_color')) ?? 0.95;
      } else if (style === 'gradient') {
        l = _avgLightness([_hexLightness(_val('frontend_hero_bg_color')),
                          _hexLightness(_val('frontend_hero_bg_color_2'))]) ?? 0.95;
      } else if (style === 'sinewave') {
        const cs = [];
        for (let i = 1; i <= 4; i++) cs.push(_hexLightness(_val('frontend_hero_sinewave_c' + i)));
        l = _avgLightness(cs) ?? 0.55;
      }
      preview.section.classList.add(l < 0.55 ? 'fe-hero-text-light' : 'fe-hero-text-dark');
    }

    // ── CTA buttons ───────────────────────────────────────────
    // Mirror the public renderer's button markup so the preview is
    // a faithful representation of what `hero_block.html` will emit
    // when the page saves. Reads from the live block data (which
    // the right-column editor mutates in place via
    // updateActiveButtons) so add / remove / reorder updates show
    // immediately. Empty array → no buttons rendered in the
    // preview, matching what the public render would do.
    if (preview.cta) {
      preview.cta.innerHTML = '';
      const activeBlock = findActiveBlock();
      const buttons = (activeBlock && activeBlock.data && activeBlock.data.buttons) || [];
      buttons.forEach(btn => {
        const bstyle = (btn.style === 'ghost' || btn.style === 'yellow'
                        || btn.style === 'green' || btn.style === 'blue')
          ? btn.style : 'primary';
        const a = document.createElement('a');
        a.className = 'fe-btn fe-btn-' + bstyle;
        const vars = [];
        if (bstyle === 'primary') {
          if (btn.custom_bg_color) vars.push('--fe-btn-bg: ' + btn.custom_bg_color);
          if (btn.custom_text_color) vars.push('--fe-btn-text: ' + btn.custom_text_color);
          if (btn.custom_hover_bg_color) vars.push('--fe-btn-hover-bg: ' + btn.custom_hover_bg_color);
          if (btn.custom_hover_text_color) vars.push('--fe-btn-hover-text: ' + btn.custom_hover_text_color);
        }
        if (vars.length) a.setAttribute('style', vars.join('; ') + ';');
        const before = _btnIconEl(btn.icon_before, btn.icon_before_color, btn.icon_before_size);
        if (before) a.appendChild(before);
        const label = document.createElement('span');
        label.textContent = btn.label || '';
        a.appendChild(label);
        const after = _btnIconEl(btn.icon_after, btn.icon_after_color, btn.icon_after_size);
        if (after) a.appendChild(after);
        preview.cta.appendChild(a);
      });
    }

    // ── Particle overlay ──────────────────────────────────────
    _syncParticleSizeState();
    if (_checkedBool('frontend_hero_particle_enabled')) {
      const effect = _val('frontend_hero_particle_effect') || 'stars';
      if (!_partFx || _partFx._effect !== effect) {
        _buildPart();
        if (_partFx) _partFx._effect = effect;
      } else {
        const spd = parseInt(_val('frontend_hero_particle_speed'), 10) || 100;
        const sz = parseInt(_val('frontend_hero_particle_size'), 10) || 100;
        try { _partFx.setSpeed(spd); } catch (_) {}
        try { _partFx.setSize(sz); } catch (_) {}
        try { _partFx.setInk(_partInk()); } catch (_) {}
        try { _partFx.setOpacity(_partOpacity()); } catch (_) {}
      }
    } else {
      _destroyPart();
      if (preview.particles) preview.particles.hidden = true;
    }

    // Everything above may have changed the content's height (a longer
    // heading, another button row, a markdown list in the subheading).
    fitPreviewContent();
  }

  // ── Buttons list editor ──────────────────────────────────────
  const buttonsList = modal.querySelector('#hero-buttons-list');
  function renderButtonsList(buttons) {
    if (!buttonsList) return;
    buttonsList.innerHTML = '';
    if (!buttons.length) {
      const empty = document.createElement('p');
      empty.className = 'be-hero-buttons-empty muted smaller';
      empty.textContent = 'No buttons yet — click "+ Add button" above.';
      buttonsList.appendChild(empty);
      return;
    }
    (buttons || []).forEach((btn, idx) => {
      const row = document.createElement('div');
      row.className = 'be-hero-button-row';

      // ── Row header: index chip + reorder + remove ──────────
      const head = document.createElement('div');
      head.className = 'be-hero-button-head';
      const idx_chip = document.createElement('span');
      idx_chip.className = 'be-hero-button-idx';
      idx_chip.textContent = String(idx + 1);
      const label_chip = document.createElement('span');
      label_chip.className = 'be-hero-button-name';
      label_chip.textContent = btn.label || '(unnamed)';
      label_chip.dataset.role = 'name';   // updated live on label-input
      head.appendChild(idx_chip);
      head.appendChild(label_chip);
      const head_actions = document.createElement('div');
      head_actions.className = 'be-hero-button-head-actions';
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'icon-btn'; up.title = 'Move up';
      up.innerHTML = '↑';
      up.onclick = () => {
        if (idx > 0) {
          const t = buttons[idx]; buttons[idx] = buttons[idx - 1]; buttons[idx - 1] = t;
          updateActiveButtons(buttons);
        }
      };
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'icon-btn'; down.title = 'Move down';
      down.innerHTML = '↓';
      down.onclick = () => {
        if (idx < buttons.length - 1) {
          const t = buttons[idx]; buttons[idx] = buttons[idx + 1]; buttons[idx + 1] = t;
          updateActiveButtons(buttons);
        }
      };
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'icon-btn be-hero-button-remove';
      rm.title = 'Remove this button';
      rm.innerHTML = '×';
      rm.onclick = () => {
        buttons.splice(idx, 1);
        updateActiveButtons(buttons);
      };
      head_actions.appendChild(up);
      head_actions.appendChild(down);
      head_actions.appendChild(rm);
      head.appendChild(head_actions);
      row.appendChild(head);

      // ── Field helpers ──────────────────────────────────────
      // `persistButtons` writes to blocks_json + refreshes the
      // preview WITHOUT re-rendering this list, so the input keeps
      // its focus + cursor position between keystrokes.
      function textField(key, lblText, ph, type) {
        const wrap = document.createElement('label');
        wrap.className = 'be-hero-button-field';
        const span = document.createElement('span');
        span.className = 'be-hero-button-field-lbl';
        span.textContent = lblText;
        const inp = document.createElement('input');
        inp.type = type || 'text';
        inp.value = btn[key] != null ? String(btn[key]) : '';
        inp.placeholder = ph || '';
        inp.oninput = () => {
          btn[key] = inp.value;
          // Live-update the row's header chip when editing the
          // button's label so the admin sees the name change
          // without the row losing focus.
          if (key === 'label') label_chip.textContent = inp.value || '(unnamed)';
          persistButtons(buttons);
        };
        wrap.appendChild(span);
        wrap.appendChild(inp);
        return wrap;
      }
      function selectField(key, lblText, options) {
        const wrap = document.createElement('label');
        wrap.className = 'be-hero-button-field';
        const span = document.createElement('span');
        span.className = 'be-hero-button-field-lbl';
        span.textContent = lblText;
        const sel = document.createElement('select');
        options.forEach(([v, l]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = l;
          if ((btn[key] || options[0][0]) === v) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = () => {
          btn[key] = sel.value;
          persistButtons(buttons);
        };
        wrap.appendChild(span);
        wrap.appendChild(sel);
        return wrap;
      }
      function toggleField(key, lblText) {
        const wrap = document.createElement('label');
        wrap.className = 'be-hero-button-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!btn[key];
        cb.onchange = () => {
          btn[key] = cb.checked;
          persistButtons(buttons);
        };
        const span = document.createElement('span');
        span.textContent = lblText;
        wrap.appendChild(cb);
        wrap.appendChild(span);
        return wrap;
      }
      // Icon-picker trigger + hidden input + clear, styled like the
      // features-card icon trigger. The shared icon picker is a global
      // delegated handler (see app.js), wired via [data-open-icon-picker]
      // with `data-icon-target` pointing at the hidden input we mint
      // here. We listen for `input` on the hidden input — that's the
      // event the picker dispatches after writing — and use it to
      // update btn[key] + persist + repaint the preview.
      function iconField(key, lblText) {
        const wrap = document.createElement('div');
        wrap.className = 'be-hero-button-field be-hero-button-icon-field';
        wrap.dataset.iconField = '';
        if (btn[key]) wrap.classList.add('has-icon');
        const lbl = document.createElement('span');
        lbl.className = 'be-hero-button-field-lbl';
        lbl.textContent = lblText;
        wrap.appendChild(lbl);
        const row2 = document.createElement('div');
        row2.className = 'be-hero-button-icon-row';
        // Unique id so the picker's `data-icon-target` selector can
        // find the right hidden input when the trigger is clicked.
        const hiddenId = 'hero-btn-' + key + '-' + idx + '-' +
                          Math.floor(Math.random() * 1e9).toString(36);
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'icon-picker-trigger be-hero-button-icon-trigger';
        trigger.setAttribute('data-open-icon-picker', '');
        trigger.setAttribute('data-icon-target', '#' + hiddenId);
        trigger.title = 'Choose icon';
        const preview = document.createElement('span');
        preview.className = 'icon-picker-preview';
        preview.setAttribute('data-icon-preview', '');
        if (btn[key] && window.tspRenderIconHtml) {
          preview.innerHTML = window.tspRenderIconHtml(btn[key]);
        }
        const empty = document.createElement('span');
        empty.className = 'icon-picker-trigger-empty';
        empty.setAttribute('data-icon-empty', '');
        empty.textContent = 'Choose…';
        trigger.appendChild(preview);
        trigger.appendChild(empty);
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = hiddenId;
        hidden.value = btn[key] || '';
        hidden.setAttribute('data-icon-input', '');
        hidden.addEventListener('input', () => {
          btn[key] = hidden.value;
          if (hidden.value) {
            wrap.classList.add('has-icon');
            if (window.tspRenderIconHtml) {
              preview.innerHTML = window.tspRenderIconHtml(hidden.value);
            }
          } else {
            wrap.classList.remove('has-icon');
            preview.innerHTML = '';
          }
          persistButtons(buttons);
        });
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'icon-picker-clear be-hero-button-icon-clear';
        clear.setAttribute('data-icon-clear', '');
        clear.title = 'Clear icon';
        clear.innerHTML = '×';
        row2.appendChild(trigger);
        row2.appendChild(hidden);
        row2.appendChild(clear);
        wrap.appendChild(row2);
        return wrap;
      }
      // Colour cluster: native swatch + editable hex text input + the
      // auto-attached 🎨 token-palette button + read-only hex caption +
      // matched-token chip (the latter three come for free from the
      // global `_design_token_picker.html` MutationObserver — every
      // <input type="color"> in the DOM gets the chrome injected). Hex
      // text input ↔ swatch are two-way bound; persisting writes the
      // hex string into btn[key] on every input.
      function colorField(key, lblText, ph) {
        const wrap = document.createElement('div');
        wrap.className = 'be-hero-button-field be-hero-button-color-field';
        const lbl = document.createElement('span');
        lbl.className = 'be-hero-button-field-lbl';
        lbl.textContent = lblText;
        wrap.appendChild(lbl);
        const cluster = document.createElement('div');
        cluster.className = 'be-hero-button-color-cluster';
        const initial = btn[key] || '';
        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'be-hero-button-color-text';
        hex.value = initial;
        hex.placeholder = ph || '#000000';
        hex.maxLength = 9;
        hex.spellcheck = false;
        hex.autocomplete = 'off';
        const swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'be-hero-button-color-swatch';
        // Native swatch needs a 6-digit hex; fall back to a sensible
        // default colour when btn[key] is empty so the dialog still
        // opens on a visible value.
        const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
        function expand(v) {
          if (v && v.length === 4 && v[0] === '#') {
            return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
          }
          return v;
        }
        swatch.value = HEX_RE.test(initial) ? expand(initial).slice(0, 7) : '#000000';
        swatch.addEventListener('input', () => {
          hex.value = swatch.value;
          btn[key] = swatch.value;
          persistButtons(buttons);
        });
        hex.addEventListener('input', () => {
          let v = (hex.value || '').trim();
          if (!v) {
            btn[key] = '';
            persistButtons(buttons);
            return;
          }
          if (v[0] !== '#') v = '#' + v;
          if (HEX_RE.test(v)) {
            swatch.value = expand(v).slice(0, 7);
            btn[key] = v;
            persistButtons(buttons);
          }
          // Invalid hex → don't commit; admin can keep typing.
        });
        cluster.appendChild(hex);
        cluster.appendChild(swatch);
        wrap.appendChild(cluster);
        return wrap;
      }

      // ── Main grid: Label + URL side by side ─────────────────
      const main = document.createElement('div');
      main.className = 'be-hero-button-grid';
      main.appendChild(textField('label', 'Label', 'Find a Meeting'));
      main.appendChild(textField('url', 'URL', '/meetings or https://…'));
      row.appendChild(main);

      // ── Style + new-tab toggle row ─────────────────────────
      const opts = document.createElement('div');
      opts.className = 'be-hero-button-grid be-hero-button-grid--opts';
      opts.appendChild(selectField('style', 'Style', [
        ['primary', 'Primary (filled)'],
        ['ghost',   'Ghost (outline)'],
        ['yellow',  'Yellow (high-contrast)'],
        ['green',   'Green (filled)'],
        ['blue',    'Blue (filled)'],
      ]));
      opts.appendChild(toggleField('open_in_new_tab', 'Open in new tab'));
      row.appendChild(opts);

      // ── Advanced (collapsed): icons + custom colours ────────
      const adv = document.createElement('details');
      adv.className = 'be-hero-button-advanced';
      const sum = document.createElement('summary');
      sum.className = 'muted smaller';
      sum.textContent = 'Advanced — icons + custom colours';
      adv.appendChild(sum);
      const advGrid = document.createElement('div');
      advGrid.className = 'be-hero-button-grid';
      advGrid.appendChild(iconField('icon_before', 'Icon before'));
      advGrid.appendChild(colorField('icon_before_color', 'Before-icon colour', '#ffffff'));
      advGrid.appendChild(textField('icon_before_size', 'Before-icon size (px)', '20', 'number'));
      advGrid.appendChild(iconField('icon_after', 'Icon after'));
      advGrid.appendChild(colorField('icon_after_color', 'After-icon colour', '#ffffff'));
      advGrid.appendChild(textField('icon_after_size', 'After-icon size (px)', '20', 'number'));
      advGrid.appendChild(colorField('custom_bg_color', 'Background (primary only)', '#1d4ed8'));
      advGrid.appendChild(colorField('custom_text_color', 'Text colour (primary only)', '#ffffff'));
      advGrid.appendChild(colorField('custom_hover_bg_color', 'Hover background (primary only)', '#163e9e'));
      advGrid.appendChild(colorField('custom_hover_text_color', 'Hover text colour (primary only)', '#ffffff'));
      adv.appendChild(advGrid);
      row.appendChild(adv);

      buttonsList.appendChild(row);
    });
  }
  // Persist + preview without rebuilding the editor list. Used by
  // text / URL / select / toggle field handlers — typing into a
  // text input MUST NOT re-render the row, otherwise the input
  // (and its DOM focus) gets destroyed between keystrokes and the
  // admin can only type one character at a time before being
  // booted out of the field.
  function persistButtons(buttons) {
    if (!activeBlockId) return;
    const prior = heroEdits.get(activeBlockId) || {};
    prior.buttons = buttons;
    heroEdits.set(activeBlockId, prior);
    const sections = readSections();
    let touched = false;
    for (const sec of sections) {
      walkBlocks(sec.blocks || [], (b) => {
        if (b.id === activeBlockId) {
          b.data = b.data || {};
          b.data.buttons = buttons;
          touched = true;
        }
      });
    }
    if (touched) writeSections(sections);
    syncPreview();
  }
  // Structural changes (add / remove / reorder) — persist AND
  // rebuild the editor list so the order + count match the data.
  function updateActiveButtons(buttons) {
    persistButtons(buttons);
    renderButtonsList(buttons);
  }
  const addBtn = modal.querySelector('#hero-button-add');
  if (addBtn) addBtn.addEventListener('click', () => {
    const active = findActiveBlock();
    if (!active) return;
    active.data = active.data || {};
    if (!Array.isArray(active.data.buttons)) active.data.buttons = [];
    active.data.buttons.push({
      id: Math.random().toString(36).slice(2, 10),
      label: 'Click here', url: '', style: 'primary', open_in_new_tab: false,
    });
    updateActiveButtons(active.data.buttons);
  });

  // ── Image + video upload ─────────────────────────────────────
  function csrfToken() {
    const inp = document.querySelector('input[name="csrf_token"]');
    return inp ? inp.value : '';
  }
  function syncImagePreview(url) {
    const wrap = modal.querySelector('#hero-image-preview');
    const img = modal.querySelector('#hero-image-preview-img');
    if (!wrap || !img) return;
    if (url) { img.src = url; wrap.hidden = false; }
    else { img.src = ''; wrap.hidden = true; }
  }
  function syncVideoPreview(url) {
    const wrap = modal.querySelector('#hero-video-preview');
    const vid = modal.querySelector('#hero-video-preview-video');
    if (!wrap || !vid) return;
    if (url) { vid.src = url; wrap.hidden = false; }
    else { vid.src = ''; wrap.hidden = true; }
  }
  function setActiveField(key, value) {
    const active = findActiveBlock();
    if (!active) return;
    const sections = readSections();
    let touched = false;
    for (const sec of sections) {
      walkBlocks(sec.blocks || [], (b) => {
        if (b.id === activeBlockId) {
          b.data = b.data || {};
          b.data[key] = value;
          touched = true;
        }
      });
    }
    if (touched) writeSections(sections);
  }
  const imgUpload = modal.querySelector('#hero-image-upload');
  if (imgUpload) imgUpload.addEventListener('change', () => {
    const f = imgUpload.files && imgUpload.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('csrf_token', csrfToken());
    fetch('/tspro/files/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(r => r.json()).then(data => {
        if (data && data.item && data.item.original_filename) {
          const url = '/pub/' + data.item.original_filename;
          setActiveField('bg_image_src', url);
          syncImagePreview(url);
        }
      }).catch(err => console.warn('hero bg upload failed', err));
  });
  const imgClear = modal.querySelector('#hero-image-clear');
  if (imgClear) imgClear.addEventListener('click', () => {
    setActiveField('bg_image_src', '');
    syncImagePreview('');
  });
  const vidUpload = modal.querySelector('#hero-video-upload');
  if (vidUpload) vidUpload.addEventListener('change', () => {
    const f = vidUpload.files && vidUpload.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('csrf_token', csrfToken());
    fetch('/tspro/files/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(r => r.json()).then(data => {
        if (data && data.item && data.item.original_filename) {
          const url = '/pub/' + data.item.original_filename;
          setActiveField('bg_video_src', url);
          syncVideoPreview(url);
        }
      }).catch(err => console.warn('hero bg video upload failed', err));
  });
  const vidClear = modal.querySelector('#hero-video-clear');
  if (vidClear) vidClear.addEventListener('click', () => {
    setActiveField('bg_video_src', '');
    syncVideoPreview('');
  });

  // ── Pill click → populate + open ──────────────────────────────
  // Capture phase so we run BEFORE the generic [data-open-modal]
  // handler binds the modal-open animation; we just identify the
  // block to populate and let the open proceed normally.
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-block-type="hero"][data-page-block-id]');
    if (!pill) return;
    // Ignore clicks on the remove × button inside the pill — that
    // path should still work for delete.
    if (e.target.closest('[data-be-remove-block]')) return;
    activeBlockId = pill.dataset.pageBlockId;
    console.debug('[page-hero-modal] active block:', activeBlockId);
    let payload = null;
    try { payload = JSON.parse(pill.getAttribute('data-block-payload') || 'null'); }
    catch (_) {}
    if (!payload) payload = findBlock(activeBlockId);
    console.debug('[page-hero-modal] payload found:', !!payload, payload && Object.keys(payload.data || {}).length, 'keys');
    if (payload) populateModalFromBlock(payload);
  }, true);

  // ── Two-way binding: any input in the modal → persist ─────────
  // Document-level listener so we can't miss the event bubble even
  // if the modal element gets re-parented or restyled. Filtered to
  // events whose `target` is inside the modal so it only fires when
  // the admin is actually editing hero fields. Always dirty the
  // page-edit form regardless of whether `persistModalToBlock`
  // found the block — decouples user-visible feedback ("yes,
  // something changed") from the data-persistence path so edge
  // cases (fresh-drop race, missing block id, etc.) don't silently
  // swallow the dirty signal.
  function flagDirty() {
    if (form) {
      try { form.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      try { form.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
    const bar = document.getElementById('fe-save-bar');
    if (bar) {
      // Both attribute removal AND idl prop write — different code
      // paths read different forms, so cover both.
      bar.removeAttribute('hidden');
      bar.hidden = false;
      const m = bar.querySelector('.fe-save-bar-msg');
      if (m) m.textContent = 'Unsaved changes';
      document.body.classList.add('has-fe-save-bar');
    }
  }
  function isInModal(target) {
    return target && target.closest && target.closest('#page-hero-edit-modal');
  }
  // The preview theme switch is view-only: repaint, but never persist
  // or dirty the page for it.
  const isPreviewControl = (t) => t && t.matches && t.matches('[data-hero-preview-theme]');
  document.addEventListener('input', (e) => {
    if (!isInModal(e.target)) return;
    if (isPreviewControl(e.target)) { syncPreview(); return; }
    persistModalToBlock();
    flagDirty();
    syncPreview();
  }, true);
  document.addEventListener('change', (e) => {
    if (!isInModal(e.target)) return;
    if (isPreviewControl(e.target)) { syncPreview(); return; }
    persistModalToBlock();
    flagDirty();
    syncPreview();
  }, true);

  // ── Late-fire submit listener ────────────────────────────────
  // Runs AFTER the inline submit handler in `frontend_page_edit.html`
  // (which writes `editor.serialize()` over hidden.value). We walk
  // the just-written JSON, find every hero block we've edited, and
  // patch its data back in. Belt-and-braces guard against the
  // BlockEditor's stale-state serialize wiping our work.
  if (form) {
    form.addEventListener('submit', () => {
      if (heroEdits.size === 0) return;
      let sections;
      try { sections = JSON.parse(hidden.value || '[]') || []; }
      catch (_) { return; }
      let touched = false;
      for (const sec of sections) {
        walkBlocks(sec.blocks || [], (b) => {
          if (heroEdits.has(b.id)) {
            b.data = Object.assign({}, b.data || {}, heroEdits.get(b.id));
            touched = true;
          }
        });
      }
      if (touched) hidden.value = JSON.stringify(sections);
    });
    // `formdata` fires when the browser actually builds the form
    // body for submit. Same patch — covers fetch-based saves
    // (the save-bar's POST uses `new FormData(form)`, which fires
    // formdata under the hood for our handler to capture).
    form.addEventListener('formdata', (e) => {
      if (heroEdits.size === 0) return;
      let sections;
      try { sections = JSON.parse(hidden.value || '[]') || []; }
      catch (_) { return; }
      let touched = false;
      for (const sec of sections) {
        walkBlocks(sec.blocks || [], (b) => {
          if (heroEdits.has(b.id)) {
            b.data = Object.assign({}, b.data || {}, heroEdits.get(b.id));
            touched = true;
          }
        });
      }
      if (touched) {
        const json = JSON.stringify(sections);
        hidden.value = json;
        try { e.formData.set('blocks_json', json); } catch (_) {}
      }
    });
  }
  }   // ── close init() ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
