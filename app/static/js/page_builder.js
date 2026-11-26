// SPDX-License-Identifier: AGPL-3.0-or-later
/* The page builder (_page_builder.html): the page full screen with the
   block library on the left, the structure on the right and a toolbar
   along the top.

   It is a layer over the edit screen, not another page: both edit the
   one page form, so going in and out keeps unsaved changes and the
   save is the edit screen's own (its yellow bar's Save draft / Publish
   buttons, which the toolbar's buttons press). While it is open:
     • the edit screen under it is display:none, so its preview stops
       re-rendering;
     • a block's settings drawer docks in the left panel, over the
       library (app.css, body.pb-on);
     • the address carries #builder, so a reload comes back to it.
   Blocks are picked and moved only here: the edit screen's preview is
   for looking, and its links go nowhere.
   Keyboard: ⌘/Ctrl+S saves (a draft when the page is published),
   ⌘/Ctrl+Z / ⇧⌘Z undo and redo outside text fields. */
(function () {
  'use strict';
  var pb = document.querySelector('[data-pb]');
  if (!pb) return;

  var form = document.getElementById('page-edit-form');
  var drawer = document.getElementById('page-layout-edit-modal');
  var canvasLp = pb.querySelector('[data-live-preview]');
  var editLp = document.querySelector('.fe-admin-main [data-live-preview]');
  var nav = pb.querySelector('[data-fe-layers]');
  var PANELS_KEY = 'tsp.pageBuilder.panels';
  var REOPEN_KEY = 'tsp.pageBuilder.reopen';
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var isOpen = false;
  var returnFocus = null;

  function $(sel, root) { return (root || pb).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || pb).querySelectorAll(sel)); }
  function lpApi() { return window.FeLivePreview; }

  // ── Open / close ──────────────────────────────────────────────────
  function open() {
    if (isOpen) return;
    isOpen = true;
    returnFocus = document.activeElement;
    pb.hidden = false;
    document.body.classList.add('pb-on');
    if (location.hash !== '#builder') {
      try { history.replaceState(history.state, '', location.pathname + location.search + '#builder'); } catch (_) {}
    }
    // The canvas renders now that it shows, whatever it last showed.
    if (lpApi() && canvasLp) lpApi().refresh(canvasLp);
    syncPanels();
    syncSave();
    requestAnimationFrame(function () {
      var first = $('[data-pb-toggle="add"]');
      if (first && !drawerOpen()) first.focus({ preventScroll: true });
    });
  }
  function close() {
    if (!isOpen) return;
    if (drawerOpen()) closeDrawer();
    isOpen = false;
    pb.hidden = true;
    document.body.classList.remove('pb-on');
    if (location.hash === '#builder') {
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
    }
    // Saved here and nothing since: reload, so the edit screen shows
    // the page as saved (its draft notice, its status).
    if (savedHere && !dirty()) { location.reload(); return; }
    // The edit screen's preview catches up with what was built.
    if (lpApi() && editLp) lpApi().refresh(editLp);
    var back = returnFocus && document.contains(returnFocus) && !pb.contains(returnFocus)
      ? returnFocus : document.querySelector('[data-pb-open]');
    if (back) back.focus({ preventScroll: true });
  }
  window.tspBuilder = { open: open, close: close, isOpen: function () { return isOpen; } };

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-pb-open]')) { e.preventDefault(); open(); }
  });
  $('[data-pb-exit]').addEventListener('click', close);

  // ── Panels ────────────────────────────────────────────────────────
  // Add (left) and Structure (right) show or hide; the choice is the
  // viewer's own. A block's settings take the left panel's place while
  // they are open, and Add closes them.
  var panels = { add: true, structure: true };
  try {
    var saved = JSON.parse(localStorage.getItem(PANELS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      panels.add = saved.add !== false;
      panels.structure = saved.structure !== false;
    }
  } catch (_) { /* private window */ }
  function drawerOpen() { return !!drawer && drawer.classList.contains('open'); }
  function closeDrawer() {
    var x = drawer && drawer.querySelector('.modal-head [data-close]');
    if (x) x.click();
  }
  function syncPanels() {
    var inspecting = drawerOpen();
    pb.classList.toggle('is-add-hidden', !panels.add);
    pb.classList.toggle('is-structure-hidden', !panels.structure);
    pb.classList.toggle('is-inspecting', inspecting);
    document.body.classList.toggle('pb-left-open', panels.add || inspecting);
    $$('[data-pb-toggle="add"]').forEach(function (b) {
      b.setAttribute('aria-pressed', panels.add && !inspecting ? 'true' : 'false');
    });
    $$('[data-pb-toggle="structure"]').forEach(function (b) {
      b.setAttribute('aria-pressed', panels.structure ? 'true' : 'false');
    });
  }
  function savePanels() {
    try { localStorage.setItem(PANELS_KEY, JSON.stringify(panels)); } catch (_) {}
  }
  pb.addEventListener('click', function (e) {
    var t = e.target.closest('[data-pb-toggle]');
    if (!t) return;
    var which = t.dataset.pbToggle;
    if (which === 'add' && drawerOpen()) {
      closeDrawer();
      panels.add = true;
    } else {
      panels[which] = !panels[which];
    }
    savePanels();
    syncPanels();
    if (which === 'add' && panels.add) {
      var search = $('[data-fe-block-search]');
      if (search) search.focus({ preventScroll: true });
    }
  });
  if (drawer) {
    new MutationObserver(function () {
      syncPanels();
      syncCrumbs();
    }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }
  // The canvas keeps its size when a panel opens or closes: the preview
  // refits itself on its own resize.

  // ── Undo / redo: the structure's own buttons ─────────────────────
  function navBtn(act) { return nav && nav.querySelector('[data-fe-layers-act="' + act + '"]'); }
  ['undo', 'redo'].forEach(function (act) {
    var mine = $('[data-pb-proxy="' + act + '"]');
    var theirs = navBtn(act);
    if (!mine || !theirs) return;
    var sync = function () {
      mine.disabled = theirs.disabled;
      if (theirs.title) mine.title = theirs.title;
    };
    sync();
    new MutationObserver(sync).observe(theirs, { attributes: true, attributeFilter: ['disabled', 'title'] });
    mine.addEventListener('click', function () { if (!theirs.disabled) theirs.click(); });
  });

  // ── Screen size, color mode, refresh ──────────────────────────────
  function setSeg(attr, value) {
    $$('[' + attr + ']').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute(attr) === value ? 'true' : 'false');
    });
  }
  // The screen size is also the device every settings form edits
  // (static/js/responsive.js): the toolbar and the settings panel's
  // own switch both set it, and both follow it.
  var RS = window.tspResponsive;
  if (RS) RS.enable();
  function showDevice(d) {
    setSeg('data-pb-device', d);
    pb.setAttribute('data-pb-device-now', d);
    if (lpApi()) lpApi().setDevice(canvasLp, d);
    deviceBadges();
  }
  $$('[data-pb-device]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = b.getAttribute('data-pb-device');
      if (RS) RS.setDevice(d); else showDevice(d);
    });
  });
  document.addEventListener('tsp:device', function (e) { showDevice(e.detail.device); });
  // Each setting in a block's dialog that can differ by device shows
  // the device beside its heading. The field names are the block's
  // keys (the hero's with a frontend_hero_ prefix).
  function markDialog(m, dev) {
    if (!RS) return;
    var items = $$('[data-hero-field], [data-meetings-field], [data-events-field], [data-features-field], [data-faq-field]', m)
      .map(function (f) {
        var a = Array.prototype.find.call(f.attributes, function (x) { return /^data-[a-z]+-field$/.test(x.name); });
        var key = (a ? a.value : '').replace(/^frontend_hero_/, '').replace(/^frontend_/, '');
        return { el: f, keys: key ? [key] : [] };
      });
    RS.mark(items, dev);
    RS.markDialogReverts(m, dev);
  }
  $$('.modal[id^="page-"][id$="-edit-modal"]', document).forEach(function (m) {
    if (m.id === 'page-layout-edit-modal') return;
    var queued = false;
    var again = function () {
      if (queued || !m.classList.contains('open')) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; markDialog(m, RS ? RS.current() : 'desktop'); });
    };
    new MutationObserver(again).observe(m, { attributes: true, attributeFilter: ['class'] });
    // Each edit can make a setting differ from its default, or not.
    m.addEventListener('input', again);
    m.addEventListener('change', again);
    m.addEventListener('click', again);
  });
  // A block's own dialog (hero, FAQ, …) edits the device too: its
  // header says which one.
  function deviceBadges() {
    var dev = RS ? RS.current() : 'desktop';
    $$('.modal[id^="page-"][id$="-edit-modal"]', document).forEach(function (m) {
      if (m.id === 'page-layout-edit-modal') return;
      var title = m.querySelector('.modal-panel .card-head h2, .modal-panel h2');
      if (!title) return;
      var badge = title.querySelector('.pb-device-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge badge-muted pb-device-badge';
        title.appendChild(badge);
      }
      markDialog(m, dev);
      badge.hidden = dev === 'desktop';
      badge.textContent = dev === 'desktop' ? '' : RS.NAMES[dev] + ' · ' + RS.WIDTHS[dev] + 'px and narrower';
    });
  }
  $$('[data-pb-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      var m = b.getAttribute('data-pb-mode');
      setSeg('data-pb-mode', m);
      if (lpApi()) lpApi().setMode(canvasLp, m);
    });
  });
  (function initMode() {
    var st = lpApi() && lpApi().state(canvasLp);
    if (st) setSeg('data-pb-mode', st.mode);
  })();
  var refreshBtn = $('[data-pb-refresh]');
  if (refreshBtn) refreshBtn.addEventListener('click', function () { if (lpApi()) lpApi().refresh(canvasLp); });

  if (editLp) {
    editLp.addEventListener('lp:load', function (e) {
      var d = e.detail && e.detail.doc;
      if (!d) return;
      d.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('a[href]')) ev.preventDefault();
      });
    });
  }

  // The canvas is for building: the editor's preview strip goes, and a
  // click that isn't on a block (a menu link, a footer link) does nothing.
  if (canvasLp) {
    canvasLp.addEventListener('lp:load', function (e) {
      var d = e.detail && e.detail.doc;
      if (!d) return;
      if (RS) RS.readSkips(d);
      var st = d.createElement('style');
      st.textContent = '.fe-preview-banner{display:none!important}';
      (d.head || d.documentElement).appendChild(st);
      d.addEventListener('click', function (ev) {
        var a = ev.target.closest && ev.target.closest('a[href], button[type="submit"]');
        if (a && !(a.closest('[data-pb-id]'))) ev.preventDefault();
      });
      // Shortcuts work with the pointer on the page too.
      d.defaultView.addEventListener('keydown', onKey);
    });
  }

  // ── History, preview in a tab ─────────────────────────────────────
  function press(id) {
    var el = document.getElementById(id);
    if (el) el.click();
    return !!el;
  }
  var hist = $('[data-pb-history]');
  if (hist) {
    if (!document.getElementById('page-history-btn')) hist.hidden = true;
    hist.addEventListener('click', function () { press('page-history-btn'); });
  }
  var prev = $('[data-pb-preview]');
  if (prev) prev.addEventListener('click', function () { press('page-preview-btn'); });

  // ── Saving ────────────────────────────────────────────────────────
  // The yellow save bar knows what is unsaved and does the saving; the
  // toolbar shows its state and presses its buttons.
  var bar = document.getElementById('fe-save-bar');
  var stateEl = $('[data-pb-state]');
  var draftBtn = $('[data-pb-save="draft"]');
  var publishBtn = $('[data-pb-save="publish"]');
  var publishDraftBtn = $('[data-pb-publish-draft]');
  var hasDraft = !!publishDraftBtn && publishDraftBtn.dataset.pbHasDraft === '1';
  var saving = null;        // 'draft' | 'publish' while a save runs
  var savedHere = false;    // something was saved since the builder opened
  function dirty() { return !!bar && !bar.hidden && !bar.classList.contains('is-leaving'); }
  function barMsg() {
    var m = bar && bar.querySelector('.fe-save-bar-msg');
    return m ? m.textContent.trim() : '';
  }
  function syncSave() {
    var d = dirty();
    if (saving) {
      if (/fail/i.test(barMsg())) saving = null;
      else if (!d) {
        hasDraft = saving === 'draft';
        saving = null;
        savedHere = true;
        if (stateEl) stateEl.dataset.saved = '1';
      }
    }
    pb.classList.toggle('is-dirty', d);
    if (stateEl) {
      stateEl.textContent = saving ? 'Saving…'
        : d ? (/fail/i.test(barMsg()) ? 'Save failed, try again' : 'Unsaved changes')
        : (stateEl.dataset.saved ? (hasDraft ? 'Draft saved' : 'Saved') : '');
      stateEl.classList.toggle('is-unsaved', d && !saving);
    }
    [draftBtn, publishBtn].forEach(function (b) { if (b) b.disabled = !d || !!saving; });
    // A clean page with a saved draft offers to publish it as it is.
    var offerDraft = !!publishDraftBtn && hasDraft && !d && !saving;
    if (publishDraftBtn) publishDraftBtn.hidden = !offerDraft;
    if (publishBtn) publishBtn.hidden = offerDraft;
  }
  if (bar) {
    new MutationObserver(syncSave).observe(bar, { attributes: true, attributeFilter: ['hidden', 'class'],
                                                  childList: true, subtree: true, characterData: true });
  }
  function save(kind) {
    if (!dirty() || saving) return;
    saving = kind;
    if (stateEl) delete stateEl.dataset.saved;
    syncSave();
    if (kind === 'draft' && press('fe-save-bar-draft-btn')) return;
    press('fe-save-bar-btn');
  }
  if (draftBtn) draftBtn.addEventListener('click', function () { save('draft'); });
  if (publishBtn) publishBtn.addEventListener('click', function () { save('publish'); });
  // Publishing a draft as it stands is a plain submit of the form as a
  // publish; the page reloads and comes back to the builder.
  if (publishDraftBtn) publishDraftBtn.addEventListener('click', function () {
    var sa = document.getElementById('page-save-action');
    if (!form || !sa) return;
    sa.value = 'publish';
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else { remember(); form.submit(); }
  });
  function remember() {
    try { sessionStorage.setItem(REOPEN_KEY, location.pathname); } catch (_) {}
  }
  // A save that reloads the page (a plain form submit) comes back here.
  if (form) form.addEventListener('submit', function () { if (isOpen) remember(); });
  syncSave();

  // ── Settings panel: where the block is, and its quick actions ─────
  var crumbs = drawer && drawer.querySelector('[data-pb-crumbs]');
  var trail = crumbs && crumbs.querySelector('[data-pb-crumbs-trail]');
  function focusedId() {
    if (!drawerOpen() || !drawer.classList.contains('is-focus-mode')) return null;
    var el = drawer.querySelector('.be-block-focused');
    return el ? el.dataset.id : null;
  }
  function syncCrumbs() {
    if (!crumbs || !trail) return;
    var id = focusedId();
    var api = window.tspPageNav;
    if (!id || !api) { crumbs.hidden = true; return; }
    var list = api.crumbs(id);
    trail.textContent = '';
    list.forEach(function (c, i) {
      if (i) {
        var sep = document.createElement('span');
        sep.className = 'pb-crumbs-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '›';
        trail.appendChild(sep);
      }
      var last = i === list.length - 1;
      var el = document.createElement(last ? 'span' : 'button');
      el.className = 'pb-crumb' + (last ? ' is-current' : '');
      el.textContent = c.name;
      if (last) el.setAttribute('aria-current', 'true');
      else {
        el.type = 'button';
        el.title = 'Edit ' + c.name;
        el.addEventListener('click', function () { api.choose(c.id); });
      }
      trail.appendChild(el);
    });
    crumbs.hidden = false;
  }
  if (crumbs) {
    crumbs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pb-block-act]');
      var id = focusedId();
      if (!b || !id || !window.tspPageNav) return;
      if (b.dataset.pbBlockAct === 'delete') window.tspPageNav.remove(id);
      else window.tspPageNav.duplicate(id);
    });
  }
  // The drawer re-renders on every block it opens.
  if (typeof window.focusPageBlock === 'function') {
    var orig = window.focusPageBlock;
    window.focusPageBlock = function (id) {
      var r = orig.apply(this, arguments);
      syncCrumbs();
      return r;
    };
  }

  // ── Keyboard ──────────────────────────────────────────────────────
  function typing(t) {
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  }
  function onKey(e) {
    if (!isOpen) return;
    var mod = MAC ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey) return;
    var k = (e.key || '').toLowerCase();
    if (k === 's') {
      e.preventDefault();
      save(draftBtn ? 'draft' : 'publish');
      return;
    }
    if (typing(e.target) || document.querySelector('.modal.open:not(#page-layout-edit-modal)')) return;
    if (k === 'z' || k === 'y') {
      var redo = k === 'y' || e.shiftKey;
      var b = navBtn(redo ? 'redo' : 'undo');
      // The structure's tree handles its own keys.
      if (nav && nav.contains(e.target)) return;
      e.preventDefault();
      if (b && !b.disabled) b.click();
    }
  }
  document.addEventListener('keydown', onKey);

  // ── Back to the builder after a reload ────────────────────────────
  var reopen = false;
  try {
    reopen = sessionStorage.getItem(REOPEN_KEY) === location.pathname;
    sessionStorage.removeItem(REOPEN_KEY);
  } catch (_) {}
  if (reopen || location.hash === '#builder') open();
  syncPanels();
})();
