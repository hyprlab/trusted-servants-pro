// SPDX-License-Identifier: AGPL-3.0-or-later
/* Structure navigator for the page and popup builders.

   Draws the page's blocks as an indented tree (sections stay out of
   sight unless they carry a legacy heading) from the SAME `sections`
   array the settings drawer's BlockEditor edits, so there is one copy
   of the page and nothing to keep in step. Every structural change
   mutates that array, then `commit()` writes it to the hidden
   `#page-blocks-json` input the form saves and redraws the tree.

   Rows: click opens the block's settings, drag moves (a line shows
   before/after, a highlighted container takes it inside), the ⋯
   button or a right-click opens the rest of the actions. The tree is
   an ARIA tree with keyboard navigation and shortcuts. Undo / redo
   cover structure and content edits (grouped per burst of typing).

   Data conventions kept as before:
     • Untitled sections hold the page's top-level blocks; a block
       added at the top level gets its own untitled section.
     • A titled section (legacy) shows as a heading row with its
       blocks under it.
     • The `_orphans` section is the "Unplaced blocks" group.
     • A grid container with valid `data.cell_lengths` groups its
       children into columns; moves keep the counts right. */
(function () {
  'use strict';

  const NAV_MIME = 'application/x-tsp-nav-block';
  const NEW_MIME = 'application/x-fe-page-block';
  const CLIP_KEY = 'tsp-block-clipboard';
  const INDENT = 18;

  function boot() {
    const nav = document.querySelector('[data-fe-layers]');
    const hidden = document.getElementById('page-blocks-json');
    if (!nav || !hidden || typeof window.ensurePageBlockEditor !== 'function') return;
    const editor = window.ensurePageBlockEditor();
    if (!editor || typeof editor.getState !== 'function') return;
    const sections = editor.getState();
    const tree = nav.querySelector('[data-fe-layers-tree]');
    const filterInput = nav.querySelector('[data-fe-layers-filter]');
    const TYPES = readJson(nav, '[data-fe-layers-types]');
    const ICONS = readJson(nav, '[data-fe-layers-icons]');
    const modalId = nav.dataset.modalId;
    const DEDICATED = parseAttr(nav.dataset.dedicatedModals, {});
    const ALLOWED = nav.dataset.allowedTypes ? new Set(parseAttr(nav.dataset.allowedTypes, [])) : null;
    const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const MOD = MAC ? '⌘' : 'Ctrl+';
    const OPEN_KEY = 'fe-layers-open:' + location.pathname;

    let rows = [];               // visible row models, in order
    let selectedId = null;
    let filter = '';
    const openSet = loadOpen();

    // ── Small helpers ───────────────────────────────────────────────
    function uid() { return Math.random().toString(36).slice(2, 10); }
    function isContainer(b) { return !!b && b.type === 'container'; }
    function kids(b) {
      b.data = b.data || {};
      if (!Array.isArray(b.data.blocks)) b.data.blocks = [];
      return b.data.blocks;
    }
    function cellAware(b) {
      if (!isContainer(b)) return false;
      const d = b.data || {};
      const cl = d.cell_lengths;
      return (d.display === 'grid') && Array.isArray(cl) && cl.length > 1
        && cl.every(n => Number.isInteger(n) && n >= 0)
        && cl.reduce((a, n) => a + n, 0) === kids(b).length;
    }
    function colOf(container, index) {
      const cl = container.data.cell_lengths;
      let acc = 0;
      for (let c = 0; c < cl.length; c++) {
        if (index < acc + cl[c]) return c;
        acc += cl[c];
      }
      return cl.length - 1;
    }
    function isUntitled(sec) { return !sec._orphans && !(sec.title || '').trim(); }
    function orphanSection(create) {
      let sec = sections.find(s => s && s._orphans);
      if (!sec && create) {
        sec = { id: uid(), title: 'Unplaced blocks', _orphans: true, blocks: [] };
        sections.push(sec);
      }
      return sec || null;
    }

    function locate(id) {
      function find(list, owner) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (!b) continue;
          if (b.id === id) return { list, index: i, owner, block: b };
          if (isContainer(b)) {
            const hit = find(kids(b), { kind: 'container', block: b });
            if (hit) return hit;
          }
        }
        return null;
      }
      for (const sec of sections) {
        if (!sec || !Array.isArray(sec.blocks)) continue;
        const hit = find(sec.blocks, { kind: 'section', sec });
        if (hit) return hit;
      }
      return null;
    }
    // True when `inner` is `outer` or sits anywhere inside it.
    function within(inner, outer) {
      if (!inner || !outer) return false;
      if (inner === outer) return true;
      if (!isContainer(outer)) return false;
      return kids(outer).some(k => within(inner, k));
    }
    function ancestorsOf(id) {
      const out = [];
      function walk(list, trail) {
        for (const b of list) {
          if (!b) continue;
          if (b.id === id) { out.push(...trail); return true; }
          if (isContainer(b) && walk(kids(b), trail.concat(b))) return true;
        }
        return false;
      }
      for (const sec of sections) {
        if (sec && walk(sec.blocks || [], [])) break;
      }
      return out;
    }
    function freshIds(block) {
      const copy = JSON.parse(JSON.stringify(block));
      (function walk(b) {
        b.id = uid();
        if (isContainer(b)) kids(b).forEach(walk);
      })(copy);
      return copy;
    }
    function typesIn(block, acc) {
      acc = acc || new Set();
      acc.add(block.type);
      if (isContainer(block)) kids(block).forEach(k => typesIn(k, acc));
      return acc;
    }

    // ── Structure edits ─────────────────────────────────────────────
    // Take a block out of wherever it is, keeping column counts right
    // and dropping a section the move leaves empty.
    function detach(block) {
      const loc = locate(block.id);
      if (!loc) return null;
      if (loc.owner.kind === 'container' && cellAware(loc.owner.block)) {
        loc.owner.block.data.cell_lengths[colOf(loc.owner.block, loc.index)]--;
      }
      loc.list.splice(loc.index, 1);
      if (loc.owner.kind === 'section') pruneSection(loc.owner.sec);
      return loc;
    }
    function pruneSection(sec) {
      if (sec.blocks.length || (sec.title || '').trim() && !sec._orphans) return;
      const i = sections.indexOf(sec);
      if (i >= 0) sections.splice(i, 1);
    }
    function newSection(block) { return { id: uid(), title: '', blocks: [block] }; }
    function rootEnd(block) {
      const oi = sections.findIndex(s => s && s._orphans);
      if (oi < 0) sections.push(newSection(block));
      else sections.splice(oi, 0, newSection(block));
    }
    // Place `block` at `target`:
    //   {mode:'before'|'after', ref}      next to another block
    //   {mode:'inside', container, col?, atStart?}
    //   {mode:'section-start', sec} · {mode:'orphans'} · {mode:'root-end'}
    function insertAt(target, block) {
      const mode = target && target.mode;
      if (mode === 'before' || mode === 'after') {
        const loc = locate(target.ref.id);
        if (!loc) { rootEnd(block); return; }
        const after = mode === 'after';
        if (loc.owner.kind === 'section') {
          const sec = loc.owner.sec;
          if (isUntitled(sec)) {
            const si = sections.indexOf(sec);
            if (!after && loc.index === 0) { sections.splice(si, 0, newSection(block)); return; }
            if (after && loc.index === sec.blocks.length - 1) { sections.splice(si + 1, 0, newSection(block)); return; }
          }
          sec.blocks.splice(loc.index + (after ? 1 : 0), 0, block);
          return;
        }
        const c = loc.owner.block;
        if (cellAware(c)) c.data.cell_lengths[colOf(c, loc.index)]++;
        loc.list.splice(loc.index + (after ? 1 : 0), 0, block);
        return;
      }
      if (mode === 'inside') {
        const c = target.container;
        const list = kids(c);
        if (cellAware(c)) {
          const cl = c.data.cell_lengths;
          const col = target.col == null ? cl.length - 1 : target.col;
          const start = cl.slice(0, col).reduce((a, n) => a + n, 0);
          list.splice(target.atStart ? start : start + cl[col], 0, block);
          cl[col]++;
          return;
        }
        if (target.atStart) list.unshift(block); else list.push(block);
        return;
      }
      if (mode === 'section-start') { target.sec.blocks.unshift(block); return; }
      if (mode === 'orphans') { orphanSection(true).blocks.push(block); return; }
      rootEnd(block);
    }
    function validTarget(target, moving) {
      if (!target) return false;
      if (!moving) return true;
      if (target.mode === 'before' || target.mode === 'after') {
        return !within(target.ref, moving);
      }
      if (target.mode === 'inside') return !within(target.container, moving);
      return true;
    }

    // ── Undo / redo ─────────────────────────────────────────────────
    // `baseline` is the page as it stood after the last recorded step.
    // A structure edit pushes it before changing anything; a burst of
    // content edits (drawer typing, a dialog) pushes it once, at the
    // burst's first change.
    const undoStack = [];
    const redoStack = [];
    let baseline = JSON.stringify(sections);
    let burstTimer = null;
    function record() {
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
      undoStack.push(baseline);
      if (undoStack.length > 80) undoStack.shift();
      redoStack.length = 0;
    }
    // Runs a tick later, once the editor has applied the change, and
    // records only a real change: a `change` event from a field losing
    // focus would otherwise add an undo step that changes nothing.
    function contentEdited() {
      setTimeout(() => {
        if (!burstTimer && JSON.stringify(sections) === baseline) return;
        if (!burstTimer) record();
        else clearTimeout(burstTimer);
        burstTimer = setTimeout(() => {
          burstTimer = null;
          baseline = JSON.stringify(sections);
          updateTools();
        }, 900);
        updateTools();
      }, 0);
    }
    function restore(json) {
      const arr = JSON.parse(json);
      sections.splice(0, sections.length, ...arr);
      commit({ restored: true });
    }
    function undo() {
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
      if (!undoStack.length) return;
      redoStack.push(JSON.stringify(sections));
      restore(undoStack.pop());
    }
    function redo() {
      if (!redoStack.length) return;
      undoStack.push(JSON.stringify(sections));
      restore(redoStack.pop());
    }

    // ── Commit: write the page, redraw, keep the drawer honest ──────
    function writeHidden() {
      hidden.value = editor.serialize();
      try { hidden.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      const form = hidden.form;
      if (form) { try { form.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {} }
      setTimeout(() => {
        const bar = document.getElementById('fe-save-bar');
        if (bar && bar.hasAttribute('hidden')) {
          bar.hidden = false;
          const m = bar.querySelector('.fe-save-bar-msg');
          if (m) m.textContent = 'Unsaved changes';
        }
      }, 0);
    }
    function commit(opts) {
      opts = opts || {};
      writeHidden();
      baseline = JSON.stringify(sections);
      if (selectedId && !locate(selectedId)) selectedId = null;
      render();
      syncDrawer(!!opts.restored);
      updateTools();
    }
    function drawerFocusedId() {
      const m = document.getElementById(modalId);
      if (!m || !m.classList.contains('open') || !m.classList.contains('is-focus-mode')) return null;
      const el = m.querySelector('.be-block-focused');
      return el ? el.dataset.id : null;
    }
    function syncDrawer(restored) {
      const id = drawerFocusedId();
      if (!id) return;
      if (!locate(id)) {
        const m = document.getElementById(modalId);
        const closer = m && m.querySelector('[data-close]');
        if (closer) closer.click();
      } else if (restored && typeof window.focusPageBlock === 'function') {
        // Undo replaced the block objects; rebuild the drawer on them.
        window.focusPageBlock(id);
      }
    }

    // Content edits from the drawer (and BlockEditor's own events):
    // keep the hidden input current and the row text fresh.
    let syncTimer = null;
    let syncLast = 0;
    function scheduleHidden() {
      const since = Date.now() - syncLast;
      const run = () => { syncTimer = null; syncLast = Date.now(); hidden.value = editor.serialize(); };
      if (since >= 150 && !syncTimer) { run(); return; }
      if (!syncTimer) syncTimer = setTimeout(run, Math.max(0, 150 - since));
    }
    let renderTimer = null;
    function scheduleRender() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 180);
    }
    const drawer = document.getElementById(modalId);
    if (drawer) {
      const onEdit = () => { contentEdited(); scheduleHidden(); scheduleRender(); };
      drawer.addEventListener('input', onEdit, true);
      drawer.addEventListener('change', onEdit, true);
    }
    // The dedicated dialogs (hero, meetings, …) report their edits here.
    window.tspSyncStructurePayloadOne = function (blockId, payload) {
      if (!blockId || !payload) return;
      const loc = locate(blockId);
      if (!loc) return;
      const keep = isContainer(loc.block) ? kids(loc.block) : null;
      loc.block.data = Object.assign({}, payload.data || {});
      if (keep) loc.block.data.blocks = keep;
      contentEdited();
      scheduleRender();
    };

    // ── Labels ──────────────────────────────────────────────────────
    function plain(s) {
      return String(s || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`#>~]+/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ').trim();
    }
    function fileName(src) {
      const s = String(src || '').split('?')[0];
      return s ? decodeURIComponent(s.slice(s.lastIndexOf('/') + 1)) : '';
    }
    function typeName(t) { return (TYPES[t] && TYPES[t].name) || t; }
    function containerSummary(b) {
      const d = b.data || {};
      const n = kids(b).length;
      let shape;
      if (d.display === 'grid') {
        const m = /repeat\(\s*(\d+)/.exec(d.grid_columns || '');
        const cols = m ? parseInt(m[1], 10)
          : (d.grid_columns || '').trim().split(/\s+/).filter(Boolean).length;
        shape = cols > 1 ? 'Grid · ' + cols + ' columns' : 'Grid';
      } else {
        shape = (d.direction || 'column').indexOf('row') === 0 ? 'Row' : 'Stack';
      }
      return shape + ' · ' + n + (n === 1 ? ' item' : ' items');
    }
    function snippet(b) {
      const d = b.data || {};
      switch (b.type) {
        case 'heading': return d.text;
        case 'paragraph': return plain(d.md);
        case 'button': return d.label;
        case 'list': {
          const items = (d.items || []).filter(x => (x || '').trim());
          return items.length ? plain(items[0]) + (items.length > 1 ? '  +' + (items.length - 1) : '') : '';
        }
        case 'image': return d.alt || fileName(d.src);
        case 'video': case 'lottie': return fileName(d.src);
        case 'icon': return d.name;
        case 'callout': return d.title || plain(d.md);
        case 'code': return d.lang;
        case 'hero': case 'meetings': case 'events': case 'features': case 'faq':
          return d.heading;
        case 'library': case 'blog_list': return d.title;
        default: return '';
      }
    }
    function labelsFor(b) {
      if (isContainer(b)) {
        const lbl = ((b.data || {}).label || '').trim();
        return { name: lbl || 'Container', meta: containerSummary(b), named: !!lbl };
      }
      return { name: typeName(b.type), meta: (snippet(b) || '').trim(), named: true };
    }

    // ── Rows ────────────────────────────────────────────────────────
    function isOpen(id) { return filter ? true : openSet.has(id); }
    function loadOpen() {
      try {
        const raw = localStorage.getItem(OPEN_KEY);
        if (raw) return new Set(JSON.parse(raw));
      } catch (_) {}
      // First visit: top-level containers, legacy sections and the
      // unplaced group start open; everything deeper starts folded.
      const s = new Set();
      sections.forEach(sec => {
        if (!sec) return;
        if (!isUntitled(sec)) s.add(sec.id);
        (sec.blocks || []).forEach(b => { if (isContainer(b) && isUntitled(sec)) s.add(b.id); });
      });
      return s;
    }
    function saveOpen() {
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(Array.from(openSet))); } catch (_) {}
    }
    function matches(b) {
      const l = labelsFor(b);
      return (l.name + ' ' + l.meta + ' ' + typeName(b.type)).toLowerCase().indexOf(filter) !== -1;
    }
    function hasMatch(b) {
      if (matches(b)) return true;
      return isContainer(b) && kids(b).some(hasMatch);
    }
    function buildRows() {
      rows = [];
      function addBlock(b, depth, parentKey) {
        if (!b || !b.type) return;
        if (filter && !hasMatch(b)) return;
        const container = isContainer(b);
        rows.push({ kind: container ? 'container' : 'block', block: b, id: b.id, depth, parentKey });
        if (!container || !isOpen(b.id)) return;
        if (cellAware(b)) {
          const cl = b.data.cell_lengths;
          let at = 0;
          cl.forEach((n, c) => {
            rows.push({ kind: 'column', container: b, col: c, count: n,
                        id: b.id + ':col' + c, depth: depth + 1, parentKey: b.id });
            kids(b).slice(at, at + n).forEach(k => addBlock(k, depth + 2, b.id + ':' + c));
            at += n;
          });
        } else {
          kids(b).forEach(k => addBlock(k, depth + 1, b.id));
        }
      }
      sections.forEach(sec => {
        if (!sec || sec._orphans) return;
        if (!isUntitled(sec)) {
          if (filter && !(sec.blocks || []).some(hasMatch)) return;
          rows.push({ kind: 'section', sec, id: sec.id, depth: 0, parentKey: 'root' });
          if (isOpen(sec.id)) (sec.blocks || []).forEach(b => addBlock(b, 1, sec.id));
          return;
        }
        (sec.blocks || []).forEach(b => addBlock(b, 0, 'root'));
      });
      const orph = orphanSection(false);
      if (orph && orph.blocks.length) {
        rows.push({ kind: 'orphans', sec: orph, id: orph.id, depth: 0, parentKey: 'orphans-root' });
        if (isOpen(orph.id)) orph.blocks.forEach(b => addBlock(b, 1, orph.id));
      }
    }
    function rowById(id) { return rows.find(r => r.id === id) || null; }
    function rowEl(id) {
      const esc = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
      return tree.querySelector('.fe-layers-row[data-id="' + esc + '"]');
    }

    function h(tag, attrs, kidsList) {
      const n = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
      (kidsList || []).forEach(c => {
        if (c == null) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return n;
    }
    function iconSpan(svg, cls) { return h('span', { class: cls, 'aria-hidden': 'true', html: svg || '' }); }

    function render() {
      const hadFocus = tree.contains(document.activeElement);
      buildRows();
      tree.innerHTML = '';
      if (!rows.length) {
        tree.appendChild(h('div', { class: 'fe-layers-empty' }, [
          filter ? 'No block matches.' : 'No blocks yet. Click one in the list beside this, or drag it here.',
        ]));
      }
      rows.forEach(r => tree.appendChild(renderRow(r)));
      tree.appendChild(dropLine);
      const tabRow = (selectedId && rowEl(selectedId)) || tree.querySelector('.fe-layers-row');
      if (tabRow) tabRow.tabIndex = 0;
      if (hadFocus && tabRow) tabRow.focus({ preventScroll: true });
    }
    function renderRow(r) {
      const sel = r.id === selectedId;
      const attrs = {
        class: 'fe-layers-row fe-layers-row--' + r.kind + (sel ? ' is-selected' : ''),
        role: 'treeitem', 'aria-level': String(r.depth + 1),
        'aria-selected': sel ? 'true' : 'false',
        'data-id': r.id, 'data-kind': r.kind, tabindex: '-1',
        style: '--depth:' + r.depth,
      };
      let twisty = null;
      // An empty container has nothing to unfold; it still takes drops.
      const canOpen = (r.kind === 'container' && kids(r.block).length > 0)
        || r.kind === 'section' || r.kind === 'orphans';
      if (canOpen) {
        const open = isOpen(r.id);
        attrs['aria-expanded'] = open ? 'true' : 'false';
        twisty = h('span', { class: 'fe-layers-twisty' + (open ? ' is-open' : ''), 'data-nav-twisty': '',
                             'aria-hidden': 'true', html: ICONS['chevron-right'] || '' });
      } else {
        twisty = h('span', { class: 'fe-layers-twisty is-leaf', 'aria-hidden': 'true' });
      }
      let icon, name, meta, more = true;
      if (r.kind === 'block' || r.kind === 'container') {
        const b = r.block;
        attrs.draggable = 'true';
        attrs['data-page-block-id'] = b.id;
        attrs['data-block-type'] = b.type;
        const l = labelsFor(b);
        icon = (TYPES[b.type] && TYPES[b.type].icon) || ICONS.square;
        name = l.name;
        meta = l.meta;
        if (!l.named) attrs.class += ' is-unnamed';
      } else if (r.kind === 'column') {
        icon = ICONS.columns;
        name = 'Column ' + (r.col + 1);
        meta = r.count + (r.count === 1 ? ' item' : ' items');
        more = false;
      } else if (r.kind === 'section') {
        icon = ICONS.folder;
        name = (r.sec.title || '').trim();
        meta = 'Section heading';
        more = false;
      } else {
        icon = ICONS.inbox;
        name = 'Unplaced blocks';
        meta = 'Not on the page · ' + r.sec.blocks.length;
        more = false;
      }
      const el = h('div', attrs, [
        twisty,
        iconSpan(icon, 'fe-layers-icon'),
        h('span', { class: 'fe-layers-name' }, [name]),
        meta ? h('span', { class: 'fe-layers-meta' }, [meta]) : null,
        more ? h('button', { type: 'button', class: 'fe-layers-more', tabindex: '-1',
                             'aria-label': 'More actions for ' + name, title: 'More actions',
                             'data-nav-more': '', html: ICONS['more-horizontal'] || '…' }) : null,
      ]);
      el.setAttribute('aria-label', name + (meta ? ', ' + meta : ''));
      return el;
    }

    // ── Selection, opening, editing ─────────────────────────────────
    function select(id, opts) {
      opts = opts || {};
      selectedId = id;
      tree.querySelectorAll('.fe-layers-row.is-selected').forEach(el => {
        el.classList.remove('is-selected'); el.setAttribute('aria-selected', 'false');
      });
      tree.querySelectorAll('.fe-layers-row[tabindex="0"]').forEach(el => { el.tabIndex = -1; });
      const el = id && rowEl(id);
      if (!el) return;
      el.classList.add('is-selected');
      el.setAttribute('aria-selected', 'true');
      el.tabIndex = 0;
      if (opts.focus) el.focus({ preventScroll: true });
      if (opts.scroll) el.scrollIntoView({ block: 'nearest', behavior: opts.smooth ? 'smooth' : 'auto' });
      updateLibraryHint();
    }
    function reveal(id) {
      let changed = false;
      ancestorsOf(id).forEach(a => { if (!openSet.has(a.id)) { openSet.add(a.id); changed = true; } });
      const loc = locate(id);
      if (loc && loc.owner.kind === 'section' && !isUntitled(loc.owner.sec)
          && !openSet.has(loc.owner.sec.id)) { openSet.add(loc.owner.sec.id); changed = true; }
      if (changed) saveOpen();
      return changed;
    }
    function openModalEl(m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    // Opens a block's editor: its own dialog for hero / meetings / …,
    // otherwise the settings drawer focused on it. The dedicated
    // dialogs read the block from the clicked row in a capture-phase
    // listener, so this runs from the row's click.
    function openEditorFor(block) {
      const special = DEDICATED[block.type];
      const sm = special && document.getElementById(special);
      if (sm) { openModalEl(sm); return; }
      const m = document.getElementById(modalId);
      if (!m || typeof window.focusPageBlock !== 'function') return;
      openModalEl(m);
      window.focusPageBlock(block.id);
      preview.draw();
    }
    function edit(id) {
      const el = rowEl(id);
      if (el) el.click();
    }
    function toggle(id, force) {
      const open = force == null ? !openSet.has(id) : force;
      if (open) openSet.add(id); else openSet.delete(id);
      saveOpen();
      render();
    }

    // ── Actions ─────────────────────────────────────────────────────
    function blockOf(id) { const loc = locate(id); return loc ? loc.block : null; }
    function afterChange(id, opts) {
      opts = opts || {};
      if (id) { selectedId = id; reveal(id); }
      commit();
      if (id) {
        select(id, { focus: opts.focus !== false, scroll: true });
        const el = rowEl(id);
        if (el && opts.flash) {
          el.classList.add('is-just-added');
          setTimeout(() => el.classList.remove('is-just-added'), 1400);
        }
      }
    }
    function moveBlock(block, target) {
      if (!validTarget(target, block)) return false;
      if ((target.mode === 'before' || target.mode === 'after') && target.ref === block) return false;
      record();
      detach(block);
      insertAt(target, block);
      if (target.mode === 'inside') { openSet.add(target.container.id); saveOpen(); }
      afterChange(block.id);
      return true;
    }
    function remove(id) {
      const b = blockOf(id);
      if (!b) return;
      const name = labelsFor(b).name;
      const rowsNow = rows;
      const idx = rowsNow.findIndex(r => r.id === id);
      record();
      detach(b);
      // Select the row that takes its place, so Delete can repeat.
      let next = null;
      for (let i = idx + 1; i < rowsNow.length && !next; i++) {
        if (!within(rowsNow[i].block, b) && rowsNow[i].block && locate(rowsNow[i].id)) next = rowsNow[i].id;
      }
      for (let i = idx - 1; i >= 0 && !next; i--) {
        if (rowsNow[i].block && locate(rowsNow[i].id)) next = rowsNow[i].id;
      }
      selectedId = next;
      commit();
      if (next) select(next, { focus: true });
      else tree.focus();
      toast('Deleted ' + name, { label: 'Undo', run: undo });
    }
    function duplicate(id) {
      const b = blockOf(id);
      if (!b) return;
      record();
      const copy = freshIds(b);
      insertAt({ mode: 'after', ref: b }, copy);
      afterChange(copy.id, { flash: true });
    }
    function readClip() {
      try {
        const raw = localStorage.getItem(CLIP_KEY);
        const v = raw && JSON.parse(raw);
        return v && v.block && v.block.type ? v.block : null;
      } catch (_) { return null; }
    }
    function copy(id) {
      const b = blockOf(id);
      if (!b) return;
      try {
        localStorage.setItem(CLIP_KEY, JSON.stringify({ v: 1, block: b }));
        toast('Copied ' + labelsFor(b).name);
      } catch (_) { toast('Could not copy that block', null, 'error'); }
    }
    function paste(id, inside) {
      const clip = readClip();
      if (!clip) return;
      if (ALLOWED) {
        const bad = Array.from(typesIn(clip)).filter(t => !ALLOWED.has(t));
        if (bad.length) { toast(typeName(bad[0]) + ' blocks can’t go in a popup', null, 'error'); return; }
      }
      const block = freshIds(clip);
      const ref = id ? blockOf(id) : null;
      record();
      if (ref && inside && isContainer(ref)) {
        insertAt({ mode: 'inside', container: ref }, block);
        openSet.add(ref.id); saveOpen();
      } else if (ref) {
        insertAt({ mode: 'after', ref }, block);
      } else {
        insertAt({ mode: 'root-end' }, block);
      }
      afterChange(block.id, { flash: true });
    }
    function wrap(id) {
      const b = blockOf(id);
      const loc = b && locate(id);
      if (!loc) return;
      record();
      const c = window.BlockEditor.blankBlock('container');
      c.data.blocks = [b];
      loc.list[loc.index] = c;
      openSet.add(c.id); saveOpen();
      afterChange(c.id, { flash: true });
    }
    function unwrap(id) {
      const c = blockOf(id);
      const loc = c && locate(id);
      if (!loc || !isContainer(c)) return;
      const children = kids(c).slice();
      record();
      if (loc.owner.kind === 'section' && isUntitled(loc.owner.sec) && loc.owner.sec.blocks.length === 1) {
        // A top-level container on its own: each child gets its own
        // section, the way top-level blocks are kept.
        const si = sections.indexOf(loc.owner.sec);
        sections.splice(si, 1, ...children.map(newSection));
      } else {
        if (loc.owner.kind === 'container' && cellAware(loc.owner.block)) {
          loc.owner.block.data.cell_lengths[colOf(loc.owner.block, loc.index)] += children.length - 1;
        }
        loc.list.splice(loc.index, 1, ...children);
        if (loc.owner.kind === 'section') pruneSection(loc.owner.sec);
      }
      afterChange(children.length ? children[0].id : null);
    }
    function siblings(row) {
      return rows.filter(r => r.parentKey === row.parentKey && r.block);
    }
    function nudge(id, dir) {
      const row = rowById(id);
      if (!row || !row.block) return;
      const sib = siblings(row);
      const i = sib.indexOf(row);
      const other = sib[i + dir];
      if (!other) return;
      moveBlock(row.block, { mode: dir < 0 ? 'before' : 'after', ref: other.block });
    }
    function toEnd(id) {
      const b = blockOf(id);
      if (b) moveBlock(b, { mode: 'root-end' });
    }
    function rename(id) {
      const b = blockOf(id);
      const el = rowEl(id);
      if (!b || !isContainer(b) || !el) return;
      const nameEl = el.querySelector('.fe-layers-name');
      const input = h('input', { type: 'text', class: 'fe-layers-rename', value: (b.data.label || ''),
                                 placeholder: 'Container', 'aria-label': 'Container name' });
      nameEl.replaceWith(input);
      el.draggable = false;
      input.focus(); input.select();
      let done = false;
      function finish(save) {
        if (done) return;
        done = true;
        const v = input.value.trim();
        if (save && v !== (b.data.label || '')) {
          record();
          b.data.label = v;
          afterChange(id);
          if (drawerFocusedId() === id && typeof window.focusPageBlock === 'function') window.focusPageBlock(id);
        } else {
          render();
          select(id, { focus: true });
        }
      }
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', e => e.stopPropagation());
    }

    // ── New blocks (library) ────────────────────────────────────────
    function newBlock(type) {
      const BE = window.BlockEditor;
      const cols = type === 'split' ? 2 : (type === 'split3' ? 3 : 0);
      if (cols) {
        const outer = BE.blankBlock('container');
        Object.assign(outer.data, { display: 'grid', label: cols === 2 ? 'Two panels' : 'Three panels',
                                    grid_columns: 'repeat(' + cols + ', minmax(0, 1fr))',
                                    gap: '2rem', padding: '0' });
        outer.data.blocks = Array.from({ length: cols }, (_, i) => {
          const inner = BE.blankBlock('container');
          inner.data.label = 'Panel ' + (i + 1);
          inner.data.gap = '1rem';
          return inner;
        });
        return outer;
      }
      return BE.blankBlock(type);
    }
    // Where a library click puts a block: inside the selected
    // container, after the selected block, or at the end of the page.
    function libraryTarget() {
      const row = selectedId && rowById(selectedId);
      if (!row) return { mode: 'root-end' };
      if (row.kind === 'container') return { mode: 'inside', container: row.block };
      if (row.kind === 'column') return { mode: 'inside', container: row.container, col: row.col };
      if (row.kind === 'section') return { mode: 'section-start', sec: row.sec };
      if (row.kind === 'block') {
        const loc = locate(row.id);
        if (loc && loc.owner.kind === 'section' && loc.owner.sec._orphans) return { mode: 'root-end' };
        return { mode: 'after', ref: row.block };
      }
      return { mode: 'root-end' };
    }
    function addNew(type, target) {
      const block = newBlock(type);
      if (!block) return;
      record();
      insertAt(target || libraryTarget(), block);
      if (target && target.mode === 'inside') { openSet.add(target.container.id); }
      if (isContainer(block)) openSet.add(block.id);
      saveOpen();
      afterChange(block.id, { flash: true, focus: false });
      if (!isContainer(block)) edit(block.id);
    }
    function updateLibraryHint() {
      const hint = document.querySelector('[data-fe-block-hint]');
      if (!hint) return;
      const row = selectedId && rowById(selectedId);
      let where = 'at the end of the page';
      if (row && row.kind === 'container') where = 'inside “' + labelsFor(row.block).name + '”';
      else if (row && row.kind === 'column') where = 'in column ' + (row.col + 1);
      else if (row && row.kind === 'block') where = 'after the selected ' + typeName(row.block.type).toLowerCase();
      hint.textContent = 'Click to add ' + where + ', or drag onto the structure.';
    }

    // ── Toolbar ─────────────────────────────────────────────────────
    const undoBtn = nav.querySelector('[data-fe-layers-act="undo"]');
    const redoBtn = nav.querySelector('[data-fe-layers-act="redo"]');
    function updateTools() {
      if (undoBtn) {
        undoBtn.disabled = !undoStack.length && !burstTimer;
        undoBtn.title = 'Undo (' + MOD + 'Z)';
        undoBtn.setAttribute('aria-label', 'Undo');
      }
      if (redoBtn) {
        redoBtn.disabled = !redoStack.length;
        redoBtn.title = 'Redo (' + (MAC ? '⇧⌘Z' : 'Ctrl+Y') + ')';
        redoBtn.setAttribute('aria-label', 'Redo');
      }
    }
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-fe-layers-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.feLayersAct;
      if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'expand-all' || act === 'collapse-all') {
        const all = act === 'expand-all';
        openSet.clear();
        if (all) {
          (function walk(list) {
            list.forEach(b => { if (isContainer(b)) { openSet.add(b.id); walk(kids(b)); } });
          })(sections.flatMap(s => (s && s.blocks) || []));
          sections.forEach(s => { if (s && !isUntitled(s)) openSet.add(s.id); });
        }
        saveOpen();
        render();
      }
    });
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        filter = filterInput.value.trim().toLowerCase();
        render();
      });
      filterInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const first = tree.querySelector('.fe-layers-row');
          if (first) { select(first.dataset.id, { focus: true }); }
        }
      });
    }

    // ── Context menu ────────────────────────────────────────────────
    let menu = null;
    let menuRowId = null;
    function closeMenu(refocus) {
      if (!menu) return;
      menu.remove();
      menu = null;
      const id = menuRowId;
      menuRowId = null;
      if (refocus && id && rowEl(id)) rowEl(id).focus({ preventScroll: true });
    }
    function menuItems(row) {
      const b = row.block;
      const container = isContainer(b);
      const loc = locate(b.id);
      const orphan = loc && loc.owner.kind === 'section' && loc.owner.sec._orphans;
      const sib = siblings(row);
      const i = sib.indexOf(row);
      const clip = readClip();
      const items = [
        { label: 'Edit settings', key: '↵', run: () => edit(b.id) },
      ];
      if (container) items.push({ label: 'Rename', key: 'F2', run: () => rename(b.id) });
      items.push('-');
      if (container) {
        items.push({ label: 'Add a block inside', run: () => { select(b.id); focusLibrary(); } });
      }
      items.push({ label: 'Duplicate', key: MOD + 'D', run: () => duplicate(b.id) });
      items.push({ label: 'Copy', key: MOD + 'C', run: () => copy(b.id) });
      items.push({ label: 'Paste after', key: MOD + 'V', disabled: !clip, run: () => paste(b.id, false) });
      if (container) items.push({ label: 'Paste inside', disabled: !clip, run: () => paste(b.id, true) });
      items.push('-');
      items.push({ label: 'Wrap in a container', run: () => wrap(b.id) });
      if (container) {
        items.push({ label: 'Unwrap', title: 'Keep what is inside, remove the container',
                     disabled: !kids(b).length, run: () => unwrap(b.id) });
      }
      if (orphan) items.push({ label: 'Move to the end of the page', run: () => toEnd(b.id) });
      items.push({ label: 'Move up', key: MAC ? '⌥↑' : 'Alt+↑', disabled: i <= 0, run: () => nudge(b.id, -1) });
      items.push({ label: 'Move down', key: MAC ? '⌥↓' : 'Alt+↓', disabled: i < 0 || i >= sib.length - 1,
                   run: () => nudge(b.id, 1) });
      items.push('-');
      items.push({ label: 'Delete', key: MAC ? '⌫' : 'Del', danger: true, run: () => remove(b.id) });
      return items;
    }
    function openMenu(id, x, y) {
      closeMenu(false);
      const row = rowById(id);
      if (!row || !row.block) return;
      menuRowId = id;
      menu = h('div', { class: 'fe-layers-menu', role: 'menu', 'aria-label': 'Block actions' });
      menuItems(row).forEach(it => {
        if (it === '-') { menu.appendChild(h('div', { class: 'fe-layers-menu-sep', role: 'separator' })); return; }
        const btn = h('button', { type: 'button', role: 'menuitem',
                                  class: 'fe-layers-menu-item' + (it.danger ? ' is-danger' : ''),
                                  disabled: it.disabled ? true : null, title: it.title || null, tabindex: '-1' },
                      [h('span', {}, [it.label]), it.key ? h('kbd', {}, [it.key]) : null]);
        btn.addEventListener('click', () => { closeMenu(false); it.run(); });
        menu.appendChild(btn);
      });
      document.body.appendChild(menu);
      const r = menu.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - r.width - 8);
      const top = (y + r.height > window.innerHeight - 8) ? Math.max(8, y - r.height) : y;
      menu.style.left = Math.max(8, left) + 'px';
      menu.style.top = top + 'px';
      const first = menu.querySelector('.fe-layers-menu-item:not([disabled])');
      if (first) first.focus();
      menu.addEventListener('keydown', e => {
        const items = Array.from(menu.querySelectorAll('.fe-layers-menu-item:not([disabled])'));
        const at = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[at + 1] || items[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[at - 1] || items[items.length - 1]).focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Escape' || e.key === 'Tab') {
          // Closes only the menu, not the drawer behind it.
          e.preventDefault(); e.stopPropagation(); closeMenu(true);
        }
      });
    }
    document.addEventListener('mousedown', e => { if (menu && !menu.contains(e.target)) closeMenu(false); }, true);
    window.addEventListener('resize', () => closeMenu(false));
    window.addEventListener('scroll', () => closeMenu(false), true);
    function focusLibrary() {
      const search = document.querySelector('[data-fe-block-search]');
      const split = nav.closest('.fe-structure-split');
      if (split && split.classList.contains('is-lib-folded')) {
        const t = split.querySelector('[data-fe-block-library-toggle]');
        if (t) t.click();
      }
      if (search) { search.focus(); search.scrollIntoView({ block: 'nearest' }); }
    }

    // ── Pointer: click, double-click, context menu ──────────────────
    tree.addEventListener('click', e => {
      const el = e.target.closest('.fe-layers-row');
      if (!el) return;
      const row = rowById(el.dataset.id);
      if (!row) return;
      if (e.target.closest('[data-nav-more]')) {
        e.stopPropagation();
        select(row.id, { focus: false });
        const r = e.target.closest('[data-nav-more]').getBoundingClientRect();
        openMenu(row.id, r.left, r.bottom + 4);
        return;
      }
      if (e.target.closest('[data-nav-twisty]')) { toggle(row.id); select(row.id, { focus: true }); return; }
      select(row.id, { focus: true });
      if (row.block) openEditorFor(row.block);
      else if (row.kind !== 'block') toggle(row.id);
    });
    tree.addEventListener('dblclick', e => {
      const el = e.target.closest('.fe-layers-row--container');
      if (el && e.target.closest('.fe-layers-name')) rename(el.dataset.id);
    });
    tree.addEventListener('contextmenu', e => {
      const el = e.target.closest('.fe-layers-row');
      const row = el && rowById(el.dataset.id);
      if (!row || !row.block) return;
      e.preventDefault();
      select(row.id, { focus: false });
      openMenu(row.id, e.clientX, e.clientY);
    });

    // ── Keyboard ────────────────────────────────────────────────────
    tree.addEventListener('keydown', e => {
      if (e.target.closest('.fe-layers-rename')) return;
      const id = selectedId && rowById(selectedId) ? selectedId : null;
      const row = id ? rowById(id) : null;
      const i = row ? rows.indexOf(row) : -1;
      const mod = MAC ? e.metaKey : e.ctrlKey;
      const k = e.key;
      const go = j => {
        const r = rows[Math.max(0, Math.min(rows.length - 1, j))];
        if (r) select(r.id, { focus: true, scroll: true });
      };
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (!rows.length) return;
      if (!row) { if (/^Arrow|Home|End/.test(k)) { e.preventDefault(); go(0); } return; }
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        nudge(id, k === 'ArrowUp' ? -1 : 1);
        return;
      }
      switch (k) {
        case 'ArrowDown': e.preventDefault(); go(i + 1); return;
        case 'ArrowUp': e.preventDefault(); go(i - 1); return;
        case 'Home': e.preventDefault(); go(0); return;
        case 'End': e.preventDefault(); go(rows.length - 1); return;
        case 'ArrowRight': {
          e.preventDefault();
          const canOpen = ['container', 'section', 'orphans'].indexOf(row.kind) !== -1;
          if (canOpen && !isOpen(id)) toggle(id, true);
          else if (canOpen && rows[i + 1] && rows[i + 1].depth > row.depth) go(i + 1);
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const canOpen = ['container', 'section', 'orphans'].indexOf(row.kind) !== -1;
          if (canOpen && isOpen(id) && !filter) { toggle(id, false); select(id, { focus: true }); return; }
          for (let j = i - 1; j >= 0; j--) {
            if (rows[j].depth < row.depth) { go(j); return; }
          }
          return;
        }
        case 'Enter': case ' ':
          e.preventDefault();
          if (row.block) edit(id); else toggle(id);
          return;
        case 'F2': e.preventDefault(); rename(id); return;
        case 'Delete': case 'Backspace':
          if (row.block) { e.preventDefault(); remove(id); }
          return;
        case 'ContextMenu': {
          e.preventDefault();
          const r = rowEl(id).getBoundingClientRect();
          openMenu(id, r.left + 24, r.bottom);
          return;
        }
        default: break;
      }
      if (e.shiftKey && k === 'F10' && row.block) {
        e.preventDefault();
        const r = rowEl(id).getBoundingClientRect();
        openMenu(id, r.left + 24, r.bottom);
        return;
      }
      if (mod && row.block) {
        const lk = k.toLowerCase();
        if (lk === 'd') { e.preventDefault(); duplicate(id); }
        else if (lk === 'c') { e.preventDefault(); copy(id); }
        else if (lk === 'v') { e.preventDefault(); paste(id, false); }
      }
    });

    // ── Drag and drop ───────────────────────────────────────────────
    const dropLine = h('div', { class: 'fe-layers-drop-line', 'aria-hidden': 'true' });
    let dragBlock = null;
    let dropTarget = null;
    function clearDrop() {
      dropTarget = null;
      dropLine.classList.remove('is-on');
      tree.classList.remove('is-drop-root');
      tree.querySelectorAll('.is-drop-into').forEach(el => el.classList.remove('is-drop-into'));
    }
    function showLine(el, after, depth) {
      dropLine.style.top = (el.offsetTop + (after ? el.offsetHeight : 0) - 1) + 'px';
      dropLine.style.left = (8 + depth * INDENT + 20) + 'px';
      dropLine.classList.add('is-on');
    }
    function computeTarget(e) {
      const el = e.target.closest('.fe-layers-row');
      if (!el) {
        // Below the last row: the end of the page.
        const last = Array.from(tree.querySelectorAll('.fe-layers-row')).filter(r => r.dataset.kind !== 'orphans').pop();
        return { target: { mode: 'root-end' }, line: last ? [last, true, 0] : null };
      }
      const row = rowById(el.dataset.id);
      if (!row) return null;
      const rect = el.getBoundingClientRect();
      const f = (e.clientY - rect.top) / rect.height;
      switch (row.kind) {
        case 'block':
          return f < 0.5
            ? { target: { mode: 'before', ref: row.block }, line: [el, false, row.depth] }
            : { target: { mode: 'after', ref: row.block }, line: [el, true, row.depth] };
        case 'container': {
          if (f < 0.25) return { target: { mode: 'before', ref: row.block }, line: [el, false, row.depth] };
          const open = isOpen(row.id) && kids(row.block).length;
          if (f > 0.75 && open && !cellAware(row.block)) {
            return { target: { mode: 'inside', container: row.block, atStart: true }, line: [el, true, row.depth + 1] };
          }
          if (f > 0.75 && !open) return { target: { mode: 'after', ref: row.block }, line: [el, true, row.depth] };
          return { target: { mode: 'inside', container: row.block }, into: el };
        }
        case 'column':
          return { target: { mode: 'inside', container: row.container, col: row.col }, into: el };
        case 'section':
          return { target: { mode: 'section-start', sec: row.sec }, line: [el, true, row.depth + 1] };
        case 'orphans':
          return { target: { mode: 'orphans' }, into: el };
        default:
          return null;
      }
    }
    function dragKind(e) {
      const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
      if (types.indexOf(NAV_MIME) !== -1 && dragBlock) return 'move';
      if (types.indexOf(NEW_MIME) !== -1) return 'new';
      return null;
    }
    tree.addEventListener('dragstart', e => {
      const el = e.target.closest('.fe-layers-row');
      const row = el && rowById(el.dataset.id);
      if (!row || !row.block) { e.preventDefault(); return; }
      closeMenu(false);
      dragBlock = row.block;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(NAV_MIME, row.id);
      e.dataTransfer.setData('text/plain', labelsFor(row.block).name);
      requestAnimationFrame(() => el.classList.add('is-drag-source'));
    });
    tree.addEventListener('dragend', () => {
      dragBlock = null;
      clearDrop();
      tree.querySelectorAll('.is-drag-source').forEach(el => el.classList.remove('is-drag-source'));
    });
    // Shows where `res` (from computeTarget) would land a block;
    // false when it can't land there.
    function showTreeDrop(res, moving) {
      tree.querySelectorAll('.is-drop-into').forEach(el => el.classList.remove('is-drop-into'));
      tree.classList.remove('is-drop-root');
      if (!res || !validTarget(res.target, moving)) {
        dropTarget = null;
        dropLine.classList.remove('is-on');
        return false;
      }
      dropTarget = res.target;
      if (res.into) { dropLine.classList.remove('is-on'); res.into.classList.add('is-drop-into'); }
      else if (res.line) showLine(res.line[0], res.line[1], res.line[2]);
      else { dropLine.classList.remove('is-on'); tree.classList.add('is-drop-root'); }
      return true;
    }
    tree.addEventListener('dragover', e => {
      const kind = dragKind(e);
      if (!kind) return;
      if (!showTreeDrop(computeTarget(e), kind === 'move' ? dragBlock : null)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = kind === 'move' ? 'move' : 'copy';
    });
    tree.addEventListener('dragleave', e => {
      if (!tree.contains(e.relatedTarget)) clearDrop();
    });
    tree.addEventListener('drop', e => {
      const kind = dragKind(e);
      if (!kind || !dropTarget) { clearDrop(); return; }
      e.preventDefault();
      const target = dropTarget;
      clearDrop();
      if (kind === 'move') {
        const b = dragBlock;
        dragBlock = null;
        moveBlock(b, target);
      } else {
        addNew(e.dataTransfer.getData(NEW_MIME), target);
      }
    });

    // ── Block library beside the tree ───────────────────────────────
    const palette = document.querySelector('[data-be-palette]');
    let palDragging = false;
    if (palette) {
      palette.querySelectorAll('.fe-page-palette-tile').forEach(tile => {
        tile.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData(NEW_MIME, tile.dataset.beBlockType);
          e.dataTransfer.setData('text/plain', tile.dataset.beBlockName || tile.dataset.beBlockType);
          tile.classList.add('is-dragging');
          palDragging = true;
        });
        tile.addEventListener('dragend', () => {
          tile.classList.remove('is-dragging');
          setTimeout(() => { palDragging = false; }, 100);
        });
      });
      palette.addEventListener('click', e => {
        const tile = e.target.closest('.fe-page-palette-tile');
        if (!tile || palDragging) return;
        addNew(tile.dataset.beBlockType);
      });
      const search = document.querySelector('[data-fe-block-search]');
      if (search) search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        let any = false;
        palette.querySelectorAll('[data-fe-block-group]').forEach(g => {
          let shown = 0;
          g.querySelectorAll('.fe-page-palette-tile').forEach(t => {
            const hit = !q || (t.dataset.feBlockText || '').includes(q);
            t.hidden = !hit;
            if (hit) shown++;
          });
          g.hidden = !shown;
          if (shown) any = true;
        });
        const none = palette.querySelector('[data-fe-block-none]');
        if (none) none.hidden = any;
      });
    }

    // ── Live preview: point at a block, click to edit it ────────────
    // The editor's preview brackets every block with <!--pb:ID--> and
    // <!--/pb--> (frontend/page.html, _blocks.html); the elements
    // between them are that block. Hovering one outlines it with its
    // name, clicking opens its settings and right-clicking opens the
    // same menu as its row. While the settings drawer is open its
    // backdrop leaves the preview uncovered, so the next block can be
    // picked straight away. Each re-render is a fresh document, wired
    // again on its 'lp:load'.
    const preview = (function () {
      let lp = null;            // the [data-live-preview] whose page has marks
      let doc = null;
      let byId = new Map();     // block id -> its top-level elements
      let hoverId = null;
      let boxes = null;         // { hover, sel } outline elements in doc
      const SKIP = /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/;

      function index(d) {
        const map = new Map();
        const open = [];
        const walker = d.createTreeWalker(d.body || d.documentElement, NodeFilter.SHOW_COMMENT);
        let n;
        while ((n = walker.nextNode())) {
          const v = n.nodeValue || '';
          if (v.indexOf('pb:') === 0) { open.push(n); continue; }
          if (v !== '/pb' || !open.length) continue;
          const start = open.pop();
          const id = start.nodeValue.slice(3);
          if (!locate(id)) continue;
          const els = [];
          for (let s = start.nextSibling; s && s !== n; s = s.nextSibling) {
            if (s.nodeType === 1 && !SKIP.test(s.tagName)) { s.setAttribute('data-pb-id', id); els.push(s); }
          }
          if (els.length) map.set(id, els);
        }
        return map;
      }
      function frame() {
        if (!lp || !doc) return null;
        return Array.from(lp.querySelectorAll('iframe')).find(f => {
          try { return f.contentDocument === doc; } catch (_) { return false; }
        }) || null;
      }
      function scale() {
        const f = frame();
        return f && f.offsetWidth ? f.getBoundingClientRect().width / f.offsetWidth : 1;
      }
      function rectOf(id) {
        const els = byId.get(id);
        if (!els) return null;
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        els.forEach(el => {
          const x = el.getBoundingClientRect();
          if (!x.width && !x.height) return;
          l = Math.min(l, x.left); t = Math.min(t, x.top);
          r = Math.max(r, x.right); b = Math.max(b, x.bottom);
        });
        return l === Infinity ? null : { left: l, top: t, right: r, bottom: b };
      }
      function nameOf(id) {
        const blk = blockOf(id);
        return blk ? labelsFor(blk).name : '';
      }

      // Outlines live in the preview's own document, so they scroll and
      // scale with it. Sizes are divided by the preview's scale to read
      // the same on screen at any width.
      const CSS_TEXT =
        '.tsp-pick{all:unset;position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;' +
        'display:none;border:calc(var(--tsp-pick-s,1)*1px) solid var(--tsp-pick-c);' +
        'border-radius:calc(var(--tsp-pick-s,1)*3px)}' +
        '.tsp-pick.is-on{display:block}' +
        '.tsp-pick--sel{border-width:calc(var(--tsp-pick-s,1)*2px);' +
        'box-shadow:0 0 0 calc(var(--tsp-pick-s,1)*3px) var(--tsp-pick-ring)}' +
        '.tsp-pick-tag{all:unset;position:absolute;left:calc(var(--tsp-pick-s,1)*-1px);bottom:100%;' +
        'padding:calc(var(--tsp-pick-s,1)*3px) calc(var(--tsp-pick-s,1)*7px);white-space:nowrap;' +
        'border-radius:calc(var(--tsp-pick-s,1)*4px) calc(var(--tsp-pick-s,1)*4px) 0 0;' +
        'background:var(--tsp-pick-c);color:#fff;letter-spacing:.01em;' +
        'font:600 calc(var(--tsp-pick-s,1)*11px)/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
        '.tsp-pick.is-low .tsp-pick-tag{bottom:auto;top:0;' +
        'border-radius:0 0 calc(var(--tsp-pick-s,1)*4px) 0}' +
        'html.tsp-picking [data-pb-id],html.tsp-picking [data-pb-id] *{cursor:pointer!important}' +
        // The selected block's tag is its toolbar: drag handle and name,
        // then select parent, move, duplicate and delete.
        '.tsp-pick--sel .tsp-pick-tag{pointer-events:auto;display:flex;align-items:center;' +
        'gap:calc(var(--tsp-pick-s,1)*1px);padding:calc(var(--tsp-pick-s,1)*2px)}' +
        '.tsp-pick-name{all:unset;padding:0 calc(var(--tsp-pick-s,1)*5px)}' +
        '.tsp-pick--sel .tsp-pick-name{cursor:grab!important}' +
        '.tsp-pick-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;' +
        'width:calc(var(--tsp-pick-s,1)*22px);height:calc(var(--tsp-pick-s,1)*20px);' +
        'border-radius:calc(var(--tsp-pick-s,1)*3px);cursor:pointer!important;color:#fff}' +
        '.tsp-pick-btn:hover,.tsp-pick-btn:focus-visible{background:rgba(255,255,255,.22)}' +
        '.tsp-pick-btn[hidden]{display:none}' +
        '.tsp-pick-btn svg{width:calc(var(--tsp-pick-s,1)*13px);height:calc(var(--tsp-pick-s,1)*13px);pointer-events:none}' +
        '.tsp-pick-sep{all:unset;width:1px;align-self:stretch;margin:calc(var(--tsp-pick-s,1)*3px) calc(var(--tsp-pick-s,1)*2px);' +
        'background:rgba(255,255,255,.35)}' +
        // Where a dragged block will land: a line that glides from place
        // to place, or the container it goes into.
        '.tsp-drop{all:unset;position:fixed;z-index:2147483646;pointer-events:none;display:block;box-sizing:border-box;' +
        'opacity:0;background:var(--tsp-pick-c);border-radius:calc(var(--tsp-pick-s,1)*2px);' +
        'box-shadow:0 0 0 calc(var(--tsp-pick-s,1)*3px) var(--tsp-pick-ring);' +
        'transition:left .14s cubic-bezier(.2,.8,.2,1),top .14s cubic-bezier(.2,.8,.2,1),' +
        'width .14s cubic-bezier(.2,.8,.2,1),height .14s cubic-bezier(.2,.8,.2,1),opacity .12s ease}' +
        '.tsp-drop.is-on{opacity:1}' +
        '.tsp-drop.is-snap{transition:opacity .12s ease}' +
        '.tsp-drop::before,.tsp-drop::after{content:"";position:absolute;box-sizing:border-box;' +
        'width:calc(var(--tsp-pick-s,1)*9px);height:calc(var(--tsp-pick-s,1)*9px);border-radius:50%;' +
        'background:#fff;border:calc(var(--tsp-pick-s,1)*2px) solid var(--tsp-pick-c);' +
        'top:50%;left:0;transform:translate(-50%,-50%)}' +
        '.tsp-drop::after{left:100%}' +
        '.tsp-drop.is-row::before{top:0;left:50%}.tsp-drop.is-row::after{top:100%;left:50%}' +
        '.tsp-drop.is-into{background:var(--tsp-pick-ring);border:calc(var(--tsp-pick-s,1)*2px) dashed var(--tsp-pick-c);' +
        'border-radius:calc(var(--tsp-pick-s,1)*6px);box-shadow:none}' +
        '.tsp-drop.is-into::before,.tsp-drop.is-into::after{display:none}' +
        // Moving a block: it stays in place, faded, while a small copy
        // of it follows the pointer.
        'html.tsp-dragging,html.tsp-dragging *{cursor:grabbing!important;user-select:none!important}' +
        'html.tsp-dragging .tsp-pick{display:none!important}' +
        '[data-pb-lifted]{opacity:.28!important;filter:saturate(.5);transition:opacity .18s ease,filter .18s ease!important}' +
        '.tsp-ghost{all:unset;position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
        'will-change:transform;transform-origin:0 0}' +
        '.tsp-ghost-card{position:relative;overflow:hidden;box-sizing:border-box;pointer-events:none;' +
        'border-radius:calc(var(--tsp-pick-s,1)*8px);background:var(--tsp-ghost-bg,#fff);' +
        'box-shadow:0 calc(var(--tsp-pick-s,1)*14px) calc(var(--tsp-pick-s,1)*34px) rgba(15,23,42,.30),' +
        '0 0 0 calc(var(--tsp-pick-s,1)*2px) var(--tsp-pick-c);' +
        'animation:tsp-lift .18s cubic-bezier(.2,.8,.2,1)}' +
        '.tsp-ghost-card.is-cut::after{content:"";position:absolute;left:0;right:0;bottom:0;height:35%;' +
        'background:linear-gradient(transparent,var(--tsp-ghost-bg,#fff))}' +
        '.tsp-ghost-inner{transform-origin:0 0;pointer-events:none}' +
        '.tsp-ghost-name{position:absolute;left:0;top:100%;margin-top:calc(var(--tsp-pick-s,1)*7px);' +
        'display:flex;align-items:center;gap:calc(var(--tsp-pick-s,1)*5px);white-space:nowrap;' +
        'padding:calc(var(--tsp-pick-s,1)*3px) calc(var(--tsp-pick-s,1)*9px);border-radius:999px;' +
        'background:var(--tsp-pick-c);color:#fff;box-shadow:0 calc(var(--tsp-pick-s,1)*4px) calc(var(--tsp-pick-s,1)*12px) rgba(15,23,42,.25);' +
        'font:600 calc(var(--tsp-pick-s,1)*11px)/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
        'animation:tsp-lift .18s cubic-bezier(.2,.8,.2,1)}' +
        '.tsp-ghost-name svg{width:calc(var(--tsp-pick-s,1)*12px);height:calc(var(--tsp-pick-s,1)*12px)}' +
        '@keyframes tsp-lift{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}';

      function ensureBoxes() {
        if (boxes && boxes.doc === doc) return boxes;
        const st = doc.createElement('style');
        st.textContent = CSS_TEXT;
        (doc.head || doc.documentElement).appendChild(st);
        const make = (cls, tools) => {
          const el = doc.createElement('div');
          el.className = 'tsp-pick ' + cls;
          const tag = doc.createElement('span');
          tag.className = 'tsp-pick-tag';
          const name = doc.createElement('span');
          name.className = 'tsp-pick-name';
          tag.appendChild(name);
          if (tools) {
            name.title = 'Drag to move';
            tag.appendChild(Object.assign(doc.createElement('span'), { className: 'tsp-pick-sep' }));
            TOOLS.forEach(t => {
              const b = doc.createElement('button');
              b.type = 'button';
              b.className = 'tsp-pick-btn';
              b.dataset.act = t[0];
              b.title = t[1];
              b.setAttribute('aria-label', t[1]);
              b.innerHTML = ICONS[t[2]] || '';
              tag.appendChild(b);
            });
            wireTools(tag, name);
          } else {
            el.setAttribute('aria-hidden', 'true');
          }
          el.appendChild(tag);
          doc.documentElement.appendChild(el);
          return el;
        };
        const drop = doc.createElement('div');
        drop.className = 'tsp-drop';
        drop.setAttribute('aria-hidden', 'true');
        doc.documentElement.appendChild(drop);
        const root = getComputedStyle(document.documentElement);
        const c = root.getPropertyValue('--brand').trim() || '#0b5cff';
        doc.documentElement.style.setProperty('--tsp-pick-c', c);
        doc.documentElement.style.setProperty('--tsp-pick-ring', 'color-mix(in srgb, ' + c + ' 22%, transparent)');
        doc.documentElement.classList.add('tsp-picking');
        boxes = { doc, sel: make('tsp-pick--sel', true), hover: make('tsp-pick--hover'), drop };
        return boxes;
      }
      const TOOLS = [['parent', 'Select the container around it', 'arrow-up'],
                     ['up', 'Move up', 'chevron-up'], ['down', 'Move down', 'chevron-down'],
                     ['duplicate', 'Duplicate', 'copy'], ['delete', 'Delete', 'trash-2']];
      function wireTools(tag, name) {
        tag.addEventListener('mousedown', e => { if (e.target.closest('.tsp-pick-btn')) e.preventDefault(); });
        tag.addEventListener('click', e => {
          const b = e.target.closest('.tsp-pick-btn');
          const id = selId();
          if (!b || !id) return;
          e.preventDefault();
          e.stopPropagation();
          const act = b.dataset.act;
          if (act === 'parent') { const up = ancestorsOf(id).pop(); if (up) choose(up.id); }
          else if (act === 'up' || act === 'down') { if (rowFor(id)) nudge(id, act === 'up' ? -1 : 1); }
          else if (act === 'duplicate') { duplicate(id); keepEditing(selectedId); }
          else if (act === 'delete') remove(id);
        });
      }
      // A block dropped on the page becomes the one being edited, unless
      // it has a dialog of its own.
      function settle(id) {
        const blk = blockOf(id);
        if (!blk || DEDICATED[blk.type]) return;
        if (selId()) keepEditing(id); else choose(id);
      }
      // After a move or a copy, the drawer shows the block that was acted on.
      function keepEditing(id) {
        if (!id) return;
        const blk = blockOf(id);
        if (blk && !DEDICATED[blk.type] && typeof window.focusPageBlock === 'function') {
          window.focusPageBlock(id);
          draw();
        }
      }

      // ── Dropping on the page ──────────────────────────────────────
      // A block dragged from the library, the tree or its own tag lands
      // before or after the block under the pointer (beside it when its
      // siblings sit in a row), or inside the container under it.
      function besides(id) {
        const loc = locate(id);
        if (!loc) return false;
        const r = rectOf(id);
        return !!r && loc.list.some(o => {
          if (!o || o.id === id) return false;
          const q = rectOf(o.id);
          return q && q.top < r.bottom - 2 && q.bottom > r.top + 2;
        });
      }
      function canvasTarget(x, y) {
        const hit = doc.elementFromPoint(x, y);
        const el = hit && hit.closest ? hit.closest('[data-pb-id]') : null;
        if (!el) {
          const last = Array.from(byId.keys()).pop();
          const lr = last && rectOf(last);
          return lr && y > lr.bottom ? { target: { mode: 'root-end' }, line: { id: last, after: true } } : null;
        }
        const id = el.getAttribute('data-pb-id');
        const blk = blockOf(id);
        const r = rectOf(id);
        if (!blk || !r) return null;
        const row = besides(id);
        const pos = row ? (x - r.left) / Math.max(1, r.right - r.left) : (y - r.top) / Math.max(1, r.bottom - r.top);
        if (isContainer(blk)) {
          const edge = Math.min(0.2, 14 / Math.max(1, row ? r.right - r.left : r.bottom - r.top));
          if (pos < edge) return { target: { mode: 'before', ref: blk }, line: { id, after: false, row } };
          if (pos > 1 - edge) return { target: { mode: 'after', ref: blk }, line: { id, after: true, row } };
          // Between its children: before the first one past the pointer.
          const list = kids(blk);
          for (const k of list) {
            const q = k && rectOf(k.id);
            if (!q) continue;
            const kRow = besides(k.id);
            if ((kRow ? x < (q.left + q.right) / 2 && y < q.bottom : y < (q.top + q.bottom) / 2)) {
              return { target: { mode: 'before', ref: k }, line: { id: k.id, after: false, row: kRow } };
            }
          }
          return { target: { mode: 'inside', container: blk }, into: id };
        }
        return pos < 0.5
          ? { target: { mode: 'before', ref: blk }, line: { id, after: false, row } }
          : { target: { mode: 'after', ref: blk }, line: { id, after: true, row } };
      }
      let canvasDrop = null;
      function dropAt(res) {
        canvasDrop = res ? res.target : null;
        if (!boxes || boxes.doc !== doc) return;
        const d = boxes.drop;
        if (!res) { d.classList.remove('is-on'); return; }
        const s = 1 / (scale() || 1);
        const t = 3 * s;
        let box;
        if (res.into) {
          const r = rectOf(res.into);
          if (!r) return;
          box = { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top };
        } else {
          const r = rectOf(res.line.id);
          if (!r) return;
          if (res.line.row) {
            const x = res.line.after ? r.right : r.left;
            box = { left: x - t / 2, top: r.top, width: t, height: r.bottom - r.top };
          } else {
            const y = res.line.after ? r.bottom : r.top;
            box = { left: r.left, top: y - t / 2, width: r.right - r.left, height: t };
          }
        }
        // From hidden it appears in place; after that it glides.
        const fresh = !d.classList.contains('is-on');
        if (fresh) d.classList.add('is-snap');
        Object.keys(box).forEach(k => { d.style[k] = box[k] + 'px'; });
        d.classList.toggle('is-into', !!res.into);
        d.classList.toggle('is-row', !res.into && !!res.line.row);
        if (fresh) { void d.offsetWidth; d.classList.remove('is-snap'); }
        d.classList.add('is-on');
      }
      // ── Moving a block by dragging it on the page ─────────────────
      // Press on a block and move: the block fades where it is, a small
      // copy of it follows the pointer, and the drop line glides to
      // where it will land. Pressing inside the selected block moves
      // that block, so a container is moved by selecting it first; its
      // tag's name is a handle too. On release the page shifts to the
      // new order at once, the blocks around it sliding into place,
      // before the re-rendered page replaces it. Out over the structure
      // tree it drops there instead. Escape puts it back.
      const STILL = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const EASE = 'cubic-bezier(.2,.8,.2,1)';
      let press = null;   // a press that may become a drag
      let drag = null;
      let swallowClick = false;

      function pressAt(e, id) {
        press = { id, x: e.clientX, y: e.clientY, pid: e.pointerId, src: e.target };
      }
      function scrub(node) {
        node.querySelectorAll('iframe,video,audio,script,object,embed').forEach(n => n.remove());
        [node].concat(Array.from(node.querySelectorAll('[data-pb-id],[id]'))).forEach(n => {
          n.removeAttribute('data-pb-id');
          n.removeAttribute('id');
        });
      }
      function pageBg() {
        const win = doc.defaultView;
        for (const el of [doc.body, doc.documentElement]) {
          const c = el && win.getComputedStyle(el).backgroundColor;
          if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
        }
        return '#fff';
      }
      function startDrag() {
        const id = press.id;
        const blk = blockOf(id);
        const els = byId.get(id) || [];
        const r = rectOf(id);
        if (!blk || !els.length || !r) { press = null; return; }
        try { press.src.setPointerCapture(press.pid); } catch (_) {}
        const s = scale() || 1;
        const w = Math.max(1, r.right - r.left), hgt = Math.max(1, r.bottom - r.top);
        const k = Math.min(1, (260 / s) / w);
        const cardH = Math.min(hgt * k, 170 / s);
        const ghost = doc.createElement('div');
        ghost.className = 'tsp-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.setProperty('--tsp-ghost-bg', pageBg());
        const card = doc.createElement('div');
        card.className = 'tsp-ghost-card' + (cardH < hgt * k - 1 ? ' is-cut' : '');
        card.style.width = (w * k) + 'px';
        card.style.height = cardH + 'px';
        const inner = doc.createElement('div');
        inner.className = 'tsp-ghost-inner';
        inner.style.width = w + 'px';
        inner.style.transform = 'scale(' + k + ')';
        els.forEach(el => { const c = el.cloneNode(true); scrub(c); inner.appendChild(c); });
        card.appendChild(inner);
        const pill = doc.createElement('div');
        pill.className = 'tsp-ghost-name';
        pill.innerHTML = (TYPES[blk.type] && TYPES[blk.type].icon) || '';
        pill.appendChild(doc.createTextNode(nameOf(id)));
        ghost.append(card, pill);
        doc.body.appendChild(ghost);
        // Below and right of the pointer, clear of the line it places;
        // it glides there from the block's own corner.
        const offX = -16 / s, offY = -18 / s;
        drag = { blk, id, els, ghost, k, w: w * k, h: cardH, offX, offY,
                 x: press.x, y: press.y, gx: r.left, gy: r.top, tilt: 0,
                 target: null, onTree: false, raf: 0 };
        press = null;
        els.forEach(el => el.setAttribute('data-pb-lifted', ''));
        doc.documentElement.classList.add('tsp-dragging');
        if (window.FeLivePreview) window.FeLivePreview.hold(lp, true);
        hover(null);
        closeMenu(false);
        dragTo(drag.x, drag.y);
        drag.raf = doc.defaultView.requestAnimationFrame(frameTick);
      }
      // A drop that leaves the page as it is shows no line.
      function sameSpot(target, blk) {
        if (target.mode !== 'before' && target.mode !== 'after') return false;
        const a = locate(blk.id), b = locate(target.ref.id);
        if (!a || !b || a.list !== b.list) return false;
        return target.mode === 'before' ? b.index === a.index + 1 : b.index === a.index - 1;
      }
      function dragTo(x, y) {
        drag.x = x; drag.y = y;
        const win = doc.defaultView;
        const blk = drag.blk;
        const inside = x >= 0 && y >= 0 && x <= win.innerWidth && y <= win.innerHeight;
        if (!inside) {
          // Out over the structure tree?
          dropAt(null);
          drag.target = null;
          const f = frame();
          const s = scale() || 1;
          const fr = f ? f.getBoundingClientRect() : null;
          const px = fr ? fr.left + x * s : -1, py = fr ? fr.top + y * s : -1;
          const el = fr ? document.elementFromPoint(px, py) : null;
          drag.onTree = !!(el && tree.contains(el)) &&
            showTreeDrop(computeTarget({ target: el, clientY: py }), blk);
          if (!drag.onTree) clearDrop();
          return;
        }
        if (drag.onTree) { clearDrop(); drag.onTree = false; }
        const res = canvasTarget(x, y);
        const ok = res && validTarget(res.target, blk) && res.target.ref !== blk &&
          !(res.target.mode === 'inside' && res.target.container === blk) && !sameSpot(res.target, blk);
        drag.target = ok ? res.target : null;
        dropAt(ok ? res : null);
      }
      function frameTick() {
        if (!drag) return;
        const win = doc.defaultView;
        const s = scale() || 1;
        // The copy trails the pointer a touch and leans into the motion.
        const tx = drag.x - drag.offX, ty = drag.y - drag.offY;
        const f = STILL ? 1 : 0.38;
        const dx = tx - drag.gx;
        drag.gx += dx * f;
        drag.gy += (ty - drag.gy) * f;
        drag.tilt = STILL ? 0 : Math.max(-6, Math.min(6, drag.tilt * 0.8 + dx * s * 0.06));
        drag.ghost.style.transform = 'translate3d(' + drag.gx + 'px,' + drag.gy + 'px,0) rotate(' + drag.tilt.toFixed(2) + 'deg)';
        // Near the top or bottom edge the page scrolls, faster nearer it.
        const edge = 70 / s;
        const inX = drag.x >= 0 && drag.x <= win.innerWidth;
        let v = 0;
        if (inX && drag.y < edge) v = -Math.min(1, (edge - drag.y) / edge);
        else if (inX && drag.y > win.innerHeight - edge) v = Math.min(1, (drag.y - (win.innerHeight - edge)) / edge);
        if (v) {
          const se = doc.scrollingElement || doc.documentElement;
          const before = se.scrollTop;
          se.scrollTop += v * 16 / s;
          if (se.scrollTop !== before) dragTo(drag.x, drag.y);
        }
        drag.raf = win.requestAnimationFrame(frameTick);
      }
      // Ends a drag; `to` is where the copy settles before it goes.
      function endDrag(to) {
        const d = drag;
        drag = null;
        if (!d) return;
        d.ghost.ownerDocument.defaultView.cancelAnimationFrame(d.raf);
        d.ghost.ownerDocument.documentElement.classList.remove('tsp-dragging');
        d.els.forEach(el => el.removeAttribute('data-pb-lifted'));
        dropAt(null);
        // Let go once the drop has changed the page, so the render it
        // asks for is the one that runs.
        const root = lp;
        setTimeout(() => { if (window.FeLivePreview) window.FeLivePreview.hold(root, false); }, 0);
        swallowClick = true;
        setTimeout(() => { swallowClick = false; }, 60);
        const g = d.ghost;
        if (!to || STILL || !g.animate) { g.remove(); return; }
        const k = to.w ? Math.min(1.6, to.w / d.w) : 0.6;
        g.animate([
          { transform: g.style.transform, opacity: 1 },
          { transform: 'translate3d(' + to.left + 'px,' + to.top + 'px,0) scale(' + k + ')', opacity: 0 },
        ], { duration: 220, easing: EASE, fill: 'forwards' }).onfinish = () => g.remove();
      }
      function cancelDrag() {
        if (!drag) return;
        const r = rectOf(drag.id);
        clearDrop();
        endDrag(r ? { left: r.left, top: r.top, w: r.right - r.left } : null);
      }
      // The blocks beside the moved one, and those where it lands.
      function peerIds(id) {
        const loc = locate(id);
        if (!loc) return [];
        const list = loc.owner.kind === 'section' ? sections.flatMap(sec => sec.blocks) : loc.list;
        return list.filter(Boolean).map(b => b.id);
      }
      // Puts the block's elements where the drop will put it, so the
      // page shows the new order before the re-render arrives. False
      // when the spot has no element to sit beside.
      function domMove(blk, target) {
        const src = byId.get(blk.id);
        if (!src) return false;
        let anchor = null, after = true;
        if (target.mode === 'before' || target.mode === 'after') {
          const ref = byId.get(target.ref.id);
          if (!ref) return false;
          after = target.mode === 'after';
          anchor = after ? ref[ref.length - 1] : ref[0];
        } else if (target.mode === 'root-end' || (target.mode === 'inside' && !cellAware(target.container))) {
          const list = target.mode === 'root-end' ? sections.flatMap(sec => sec.blocks) : kids(target.container);
          const last = list.filter(b => b && b !== blk).pop();
          const els = last && byId.get(last.id);
          if (!els) return false;
          anchor = els[els.length - 1];
        }
        if (!anchor || src.indexOf(anchor) !== -1 || src.some(el => el.contains(anchor))) return false;
        if (after) anchor.after(...src); else anchor.before(...src);
        return true;
      }
      function dropDrag() {
        const d = drag;
        const blk = d.blk;
        if (d.onTree && dropTarget) {
          const target = dropTarget;
          clearDrop();
          endDrag(null);
          if (moveBlock(blk, target)) settle(blk.id);
          return;
        }
        const target = d.target;
        if (!target) { cancelDrag(); return; }
        // Where everything stands now, to slide it from there.
        const ids = peerIds(blk.id).concat(target.mode === 'inside' ? kids(target.container).filter(Boolean).map(b => b.id)
          : target.mode === 'root-end' ? [] : peerIds(target.ref.id));
        let els = [];
        ids.forEach(id => (byId.get(id) || []).forEach(el => { if (els.indexOf(el) === -1) els.push(el); }));
        els = els.filter(el => !els.some(o => o !== el && o.contains(el)));
        const from = new Map(els.map(el => [el, el.getBoundingClientRect()]));
        const line = boxes && boxes.doc === doc ? boxes.drop.getBoundingClientRect() : null;
        const moved = domMove(blk, target);
        const r = moved ? rectOf(blk.id) : null;
        endDrag(r ? { left: r.left, top: r.top, w: r.right - r.left }
          : line ? { left: line.left, top: line.top, w: 0 } : null);
        if (moved && !STILL) {
          els.forEach(el => {
            const a = from.get(el), b = el.getBoundingClientRect();
            const dx = a.left - b.left, dy = a.top - b.top;
            if (d.els.indexOf(el) !== -1) {
              el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }],
                { duration: 260, easing: EASE });
            } else if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
              el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
                { duration: 260, easing: EASE });
            }
          });
        }
        if (moveBlock(blk, target)) settle(blk.id);
      }
      function place(box, id) {
        const r = id && rectOf(id);
        if (!r) { box.classList.remove('is-on'); return; }
        const s = 1 / (scale() || 1);
        doc.documentElement.style.setProperty('--tsp-pick-s', String(s));
        const pad = 2 * s;
        box.style.left = (r.left - pad) + 'px';
        box.style.top = (r.top - pad) + 'px';
        box.style.width = (r.right - r.left + pad * 2) + 'px';
        box.style.height = Math.max(r.bottom - r.top + pad * 2, 6 * s) + 'px';
        box.classList.toggle('is-low', r.top < 24 * s);
        box.querySelector('.tsp-pick-name').textContent = nameOf(id);
        const up = box.querySelector('[data-act="parent"]');
        if (up) up.hidden = !ancestorsOf(id).length;
        box.classList.add('is-on');
      }
      function selId() {
        return drawer && drawer.classList.contains('open') ? drawerFocusedId() : null;
      }
      function draw() {
        if (!doc || !byId.size) return;
        const b = ensureBoxes();
        const sid = selId();
        place(b.sel, sid);
        place(b.hover, hoverId && hoverId !== sid ? hoverId : null);
      }
      function hover(id) {
        if (id === hoverId) return;
        hoverId = id || null;
        draw();
      }

      // Opens what clicking its row opens: the settings drawer, or the
      // block's own dialog (hero, meetings list, …) in its place.
      function rowFor(id) {
        if (filter && filterInput && !rowEl(id)) { filterInput.value = ''; filter = ''; }
        if (reveal(id) || !rowEl(id)) render();
        return rowEl(id);
      }
      function choose(id) {
        const blk = blockOf(id);
        if (!blk || !rowFor(id)) return;
        // Picked from the builder's structure tree or crumbs, the
        // builder is already open; anywhere else this opens it.
        if (window.tspBuilder) window.tspBuilder.open();
        if (DEDICATED[blk.type] && drawer && drawer.classList.contains('open')) {
          const x = drawer.querySelector('.modal-head [data-close]');
          if (x) x.click();
        }
        edit(id);
        draw();
      }
      // The visible part of the preview card, cut out of the backdrop.
      function cutout() {
        const bd = drawer && drawer.querySelector(':scope > .modal-backdrop');
        // Kept while the drawer fades out, so the preview never flashes dim.
        if (!bd || !drawer.classList.contains('open')) return;
        if (!lp || !byId.size) { bd.style.clipPath = ''; return; }
        const r = lp.getBoundingClientRect();
        const W = window.innerWidth, H = window.innerHeight;
        const P = 8;
        const l = r.left - P, t = r.top - P, R = r.right + P, B = r.bottom + P;
        const k = Math.min(12, (R - l) / 2, (B - t) / 2);
        bd.style.clipPath = 'path(evenodd, "M0 0H' + W + 'V' + H + 'H0Z' +
          'M' + (l + k) + ' ' + t + 'H' + (R - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + R + ' ' + (t + k) +
          'V' + (B - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (R - k) + ' ' + B +
          'H' + (l + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + l + ' ' + (B - k) +
          'V' + (t + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (l + k) + ' ' + t + 'Z")';
      }
      // Bring the block being edited into the preview's view when it
      // is wholly outside it (it was opened from the tree).
      function showSelected() {
        const sid = selId();
        const r = sid && doc && rectOf(sid);
        if (!r) return;
        const win = doc.defaultView;
        if (r.bottom > 0 && r.top < win.innerHeight) return;
        const se = doc.scrollingElement || doc.documentElement;
        se.scrollTo({ top: Math.max(0, se.scrollTop + r.top - win.innerHeight / 4), behavior: 'smooth' });
      }

      function wire(root, d) {
        const map = index(d);
        if (!map.size) {
          // An emptied page: nothing to point at until blocks come back.
          if (root === lp) { doc = null; byId = new Map(); hoverId = null; boxes = null; }
          return;
        }
        if (drag) endDrag(null);
        press = null;
        lp = root; doc = d; byId = map; hoverId = null; boxes = null;
        const win = d.defaultView;
        const target = e => {
          const el = e.target && e.target.closest ? e.target.closest('[data-pb-id]') : null;
          return el ? el.getAttribute('data-pb-id') : null;
        };
        // On the window, ahead of the page's own handlers: in the
        // preview a click picks a block, it never follows a link or
        // works a control.
        win.addEventListener('mouseover', e => hover(target(e)), true);
        d.addEventListener('mouseout', e => { if (!e.relatedTarget) hover(null); });
        win.addEventListener('mousedown', e => {
          closeMenu(false);
          if (target(e)) e.preventDefault();
        }, true);
        win.addEventListener('pointerdown', e => {
          if (e.button !== 0 || !e.isPrimary || drag) return;
          if (e.target.closest && e.target.closest('.tsp-pick-btn')) return;
          const sid = selId();
          if (e.target.closest && e.target.closest('.tsp-pick-name')) { if (sid) pressAt(e, sid); return; }
          const id = target(e);
          if (!id) return;
          const inSel = sid && (byId.get(sid) || []).some(el => el.contains(e.target));
          pressAt(e, inSel ? sid : id);
        }, true);
        win.addEventListener('pointermove', e => {
          if (drag) { dragTo(e.clientX, e.clientY); return; }
          if (!press || e.pointerId !== press.pid) return;
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) * (scale() || 1) > 5) startDrag();
        }, true);
        win.addEventListener('pointerup', e => {
          press = null;
          if (drag) { e.preventDefault(); dropDrag(); }
        }, true);
        win.addEventListener('pointercancel', () => { press = null; cancelDrag(); }, true);
        // Links and images in the page are never dragged on their own.
        win.addEventListener('dragstart', e => {
          if (e.target.closest && e.target.closest('[data-pb-id]')) e.preventDefault();
        }, true);
        ['click', 'auxclick', 'dblclick'].forEach(type => win.addEventListener(type, e => {
          if (swallowClick) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          const id = target(e);
          if (!id) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          if (type === 'click' && e.button === 0) choose(id);
        }, true));
        win.addEventListener('contextmenu', e => {
          const id = target(e);
          if (!id || !rowFor(id)) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          const f = frame();
          const fr = f ? f.getBoundingClientRect() : { left: 0, top: 0 };
          const s = scale();
          select(id, { focus: false });
          openMenu(id, fr.left + e.clientX * s, fr.top + e.clientY * s);
        }, true);
        // Focus can be in the preview; Escape still closes the drawer.
        win.addEventListener('keydown', e => {
          if (e.key !== 'Escape') return;
          if (drag) { cancelDrag(); return; }
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        win.addEventListener('dragover', e => {
          const kind = dragKind(e);
          if (!kind) return;
          const res = canvasTarget(e.clientX, e.clientY);
          if (!res || !validTarget(res.target, kind === 'move' ? dragBlock : null)
              || (kind === 'move' && res.target.ref === dragBlock)) { dropAt(null); return; }
          e.preventDefault();
          e.dataTransfer.dropEffect = kind === 'move' ? 'move' : 'copy';
          hover(null);
          dropAt(res);
          // Near the top or bottom edge the page scrolls.
          const edge = 60 / (scale() || 1);
          if (e.clientY < edge) win.scrollBy(0, -18 / (scale() || 1));
          else if (e.clientY > win.innerHeight - edge) win.scrollBy(0, 18 / (scale() || 1));
        });
        d.addEventListener('dragleave', e => { if (!e.relatedTarget) dropAt(null); });
        win.addEventListener('drop', e => {
          const kind = dragKind(e);
          const target = canvasDrop;
          dropAt(null);
          if (!kind || !target) return;
          e.preventDefault();
          if (kind === 'move') {
            const b = dragBlock;
            dragBlock = null;
            if (moveBlock(b, target)) keepEditing(b.id);
          } else {
            addNew(e.dataTransfer.getData(NEW_MIME), target);
          }
        });
        const redraw = () => draw();
        win.addEventListener('scroll', redraw, { passive: true, capture: true });
        win.addEventListener('resize', redraw);
        if (win.ResizeObserver && d.body) new win.ResizeObserver(redraw).observe(d.body);
        draw();
        cutout();
      }

      // Where there is a builder, blocks are picked and moved only in
      // it: the edit screen's own preview is just for looking.
      const builder = document.querySelector('[data-pb]');
      document.addEventListener('lp:load', e => {
        const root = e.target && e.target.closest && e.target.closest('[data-live-preview]');
        if (builder && root && !builder.contains(root)) return;
        if (root && e.detail && e.detail.doc) wire(root, e.detail.doc);
      });
      // Rows point at their block in the preview too.
      tree.addEventListener('mouseover', e => {
        const el = e.target.closest('.fe-layers-row[data-page-block-id]');
        hover(el ? el.dataset.id : null);
      });
      tree.addEventListener('mouseleave', () => hover(null));
      if (drawer) {
        new MutationObserver(() => {
          draw();
          cutout();
          if (drawer.classList.contains('open')) showSelected();
        }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
      }
      window.addEventListener('resize', cutout);
      // Escape with the focus outside the page puts a dragged block back.
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drag) { e.stopPropagation(); cancelDrag(); }
      }, true);
      return { draw, showSelected, choose };
    })();

    // The page builder's settings panel names the block being edited
    // and the containers around it, and selects them from there.
    window.tspPageNav = {
      crumbs(id) {
        return ancestorsOf(id).map(b => ({ id: b.id, name: labelsFor(b).name }))
          .concat(blockOf(id) ? [{ id, name: labelsFor(blockOf(id)).name }] : []);
      },
      icon(id) { const b = blockOf(id); return b && TYPES[b.type] ? TYPES[b.type].icon : ''; },
      choose: id => preview.choose(id),
      remove: id => remove(id),
      duplicate: id => { duplicate(id); keepFocus(selectedId); },
    };
    function keepFocus(id) {
      const blk = id && blockOf(id);
      if (blk && !DEDICATED[blk.type] && typeof window.focusPageBlock === 'function') window.focusPageBlock(id);
    }

    // ── Toast ───────────────────────────────────────────────────────
    function toast(msg, action, kind) {
      if (typeof window.tspShowToast === 'function') {
        window.tspShowToast(msg, kind || null, action ? { action } : {});
      }
    }

    // The tree is one tab stop; arrow keys move within it.
    tree.tabIndex = -1;
    tree.addEventListener('focus', () => {
      const r = (selectedId && rowEl(selectedId)) || tree.querySelector('.fe-layers-row');
      if (r) r.focus({ preventScroll: true });
    });
    render();
    updateTools();
    updateLibraryHint();
  }

  function readJson(root, sel) {
    const el = root.querySelector(sel);
    try { return el ? JSON.parse(el.textContent || '{}') : {}; } catch (_) { return {}; }
  }
  function parseAttr(v, fallback) {
    try { return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
