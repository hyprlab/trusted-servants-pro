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
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
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
    tree.addEventListener('dragover', e => {
      const kind = dragKind(e);
      if (!kind) return;
      const res = computeTarget(e);
      tree.querySelectorAll('.is-drop-into').forEach(el => el.classList.remove('is-drop-into'));
      tree.classList.remove('is-drop-root');
      if (!res || !validTarget(res.target, kind === 'move' ? dragBlock : null)) {
        dropTarget = null;
        dropLine.classList.remove('is-on');
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = kind === 'move' ? 'move' : 'copy';
      dropTarget = res.target;
      if (res.into) { dropLine.classList.remove('is-on'); res.into.classList.add('is-drop-into'); }
      else if (res.line) showLine(res.line[0], res.line[1], res.line[2]);
      else { dropLine.classList.remove('is-on'); tree.classList.add('is-drop-root'); }
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
