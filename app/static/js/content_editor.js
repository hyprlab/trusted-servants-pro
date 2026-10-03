// Shared by the announcement / event, story and blog post editors
// (post_edit.html, story_edit.html, blog_edit.html). The page's form
// carries data-content-editor; its yellow save bar is the element
// with data-editor-save-bar.
//
//   1. Title → URL: the slug field follows the title until someone
//      types a URL of their own (or the item already has one).
//   2. The save bar: shows once the form has unsaved edits and saves
//      it through fetch (X-Requested-With: fetch, answered with JSON),
//      so the page keeps its scroll position, then reconciles the few
//      fields the server can rewrite: the slug, the featured image and
//      (on announcements and events) the gallery.
(function () {
  'use strict';
  var form = document.querySelector('form[data-content-editor]');
  if (!form) return;

  // ── 1. Title → URL ───────────────────────────────────────────────
  // Mirrors `_normalize_slug` in app/routes.py: lowercase, runs of
  // anything else become one hyphen, no hyphen at either end, at most
  // 200 characters. Once the URL is the editor's own, it stays put
  // through title edits, so a draft publishes at exactly that URL;
  // clearing the field hands it back to the title.
  (function () {
    var titleInput = form.querySelector('input[name="title"]');
    var slugInput = form.querySelector('input[name="slug"]');
    if (!titleInput || !slugInput) return;
    function slugify(v) {
      return String(v || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200);
    }
    var slugEdited = slugInput.value.trim() !== '';
    slugInput.addEventListener('input', function () {
      slugEdited = slugInput.value.trim() !== '';
    });
    var highlightTimer = null;
    titleInput.addEventListener('input', function () {
      if (slugEdited) return;
      var next = slugify(titleInput.value);
      if (slugInput.value === next) return;
      slugInput.value = next;
      // Restart the highlight on every keystroke: the forced reflow
      // commits the removal before the class goes back on.
      slugInput.classList.remove('slug-input-field--synced');
      void slugInput.offsetWidth;
      slugInput.classList.add('slug-input-field--synced');
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(function () {
        slugInput.classList.remove('slug-input-field--synced');
      }, 1400);
    });
  })();

  // ── 2. The save bar ──────────────────────────────────────────────
  // Only routine saves go through it; Publish, Move to Drafts and the
  // first save of a new item stay native submits at the top of the
  // page, because those navigate somewhere.
  var bar = document.querySelector('[data-editor-save-bar]');
  if (!bar) return;
  var msg = bar.querySelector('.fe-save-bar-msg');
  var btn = bar.querySelector('.fe-save-bar-btn');
  var idleLabel = btn ? btn.textContent.trim() : 'Save';
  var dirty = false;
  var toast = function (m, kind) { (window.tspShowToast || function () {})(m, kind); };

  function show() {
    if (dirty) return;
    dirty = true;
    bar.hidden = false;
    bar.classList.remove('is-leaving');
    if (msg) msg.textContent = 'Unsaved changes';
    if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
  }

  form.addEventListener('input', show);
  form.addEventListener('change', show);
  // Script-built edits fire neither event: added link rows and
  // gallery tiles. A widget that builds its own fields and reports its
  // edits itself (the blog's block editor) is marked
  // data-editor-own-changes and skipped here.
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.target.closest && r.target.closest('[data-editor-own-changes]')) continue;
        var nodes = r.addedNodes.length ? r.addedNodes : r.removedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType === 1 && (
              (n.matches && n.matches('input, select, textarea')) ||
              (n.querySelector && n.querySelector('input, select, textarea')))) {
            show();
            return;
          }
        }
      }
    }).observe(form, { childList: true, subtree: true });
  }
  // The blog's block editor sets its hidden field's value by script,
  // which fires nothing, so it announces its edits with this event.
  form.addEventListener('editor:changed', show);

  form.addEventListener('submit', function () {
    if (msg) msg.textContent = 'Saving…';
    if (btn) btn.disabled = true;
  });

  function syncSlug(data) {
    var input = form.querySelector('input[name="slug"]');
    if (!input || data.slug_field === undefined) return;
    // Blank means "keep deriving from the title": the effective URL
    // moves to the placeholder, as on a freshly rendered page.
    if (input.value !== data.slug_field) input.value = data.slug_field;
    if (data.slug) input.placeholder = data.slug;
  }

  function syncFeatured(data) {
    var section = form.querySelector('[data-post-featured-image]');
    if (!section || data.featured_image === undefined) return;
    var img = section.querySelector('[data-featured-preview-img]');
    var empty = section.querySelector('[data-featured-preview-empty]');
    var clearBox = section.querySelector('input[name="clear_featured_image"]');
    var upload = section.querySelector('[data-featured-upload]');
    var mediaId = section.querySelector('[data-featured-media-id]');
    var picked = section.querySelector('[data-featured-picked-label]');
    if (img) {
      if (data.featured_image) {
        img.src = data.featured_image;
        img.hidden = false;
      } else {
        img.removeAttribute('src');
        img.hidden = true;
      }
      img.classList.remove('is-cleared');
    }
    if (empty) empty.hidden = !!data.featured_image;
    var clearPill = section.querySelector('[data-featured-clear]');
    if (clearPill) clearPill.hidden = !data.featured_image;
    // The upload, pick and clear have all been used by this save;
    // left armed they would apply again on the next one.
    if (clearBox) clearBox.checked = false;
    if (upload) upload.value = '';
    if (mediaId) mediaId.value = '';
    if (picked) { picked.hidden = true; picked.textContent = ''; }
  }

  function syncGallery(data) {
    var section = form.querySelector('[data-post-gallery]');
    if (!section || !data.gallery) return;
    var list = section.querySelector('[data-gallery-list]');
    var upload = section.querySelector('[data-gallery-upload]');
    var picks = section.querySelector('[data-gallery-picks]');
    if (list) {
      // Rebuilt from the stored filenames: uploads land, removed tiles
      // go, and the thumbnail URLs' indices stay in step with the row.
      // Per-tile remove is delegated from the section, so it still works.
      list.textContent = '';
      data.gallery.forEach(function (item, i) {
        var li = document.createElement('li');
        li.className = 'post-gallery-tile';
        li.setAttribute('data-gallery-tile', '');
        var img = document.createElement('img');
        img.src = item.url;
        img.alt = 'Gallery image ' + (i + 1);
        img.loading = 'lazy';
        var hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'gallery_existing';
        hidden.value = item.name;
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn-sm btn-danger post-gallery-remove';
        rm.setAttribute('data-gallery-remove', '');
        rm.title = 'Remove from gallery';
        rm.textContent = '×';
        li.appendChild(img);
        li.appendChild(hidden);
        li.appendChild(rm);
        list.appendChild(li);
      });
    }
    if (upload) upload.value = '';
    if (picks) picks.textContent = '';
    if (typeof section.__galleryRefresh === 'function') section.__galleryRefresh();
  }

  function settle() {
    dirty = false;
    if (msg) msg.textContent = 'Saved';
    var finish = function () {
      if (dirty) return;
      bar.hidden = true;
      bar.classList.remove('is-leaving');
      if (msg) msg.textContent = 'Unsaved changes';
      if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    };
    bar.addEventListener('animationend', finish, { once: true });
    bar.classList.add('is-leaving');
    // For reduced motion and background tabs, where animationend
    // never fires.
    setTimeout(finish, 360);
  }

  function fail(message) {
    if (msg) msg.textContent = 'Save failed, try again';
    if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    toast(message || 'Save failed, try again', 'error');
  }

  if (btn) btn.addEventListener('click', function () {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    if (msg) msg.textContent = 'Saving…';
    var fd = new FormData(form);
    // A plain button adds nothing to FormData; the bar's own action
    // (keep it a draft) goes in by hand.
    if (btn.dataset.saveAction) fd.append('action', btn.dataset.saveAction);
    // getAttribute, not form.action: the top-of-page buttons named
    // "action" belong to this form and shadow that property.
    fetch(form.getAttribute('action'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch' },
      body: fd
    }).then(function (r) {
      return r.json().catch(function () { return null; })
        .then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      var data = res.data;
      (data && data.flashes || []).forEach(function (f) {
        toast(f.message, (f.category === 'danger' || f.category === 'error') ? 'error' : '');
      });
      if (!res.ok || !data || !data.ok) {
        fail(data && data.flashes && data.flashes.length ? null : 'Save failed, try again');
        return;
      }
      if (data.redirect) { window.location.assign(data.redirect); return; }
      syncSlug(data);
      syncFeatured(data);
      syncGallery(data);
      settle();
    }).catch(function () { fail(); });
  });
})();
