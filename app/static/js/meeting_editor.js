// The meeting editor (meeting_edit.html). Loaded before fe_studio.js
// and content_editor.js, which it hands work to:
//
//   · Moves the Files panel (written after the meeting form, because its
//     own forms can't nest inside it) into the settings column, so the
//     studio's tabs pick it up.
//   · The Online tab follows the meeting type: hidden for in-person.
//   · Extended content, platform switches, the public alert's expiry,
//     and the logo preview after a save.
//   · Scheduled changes: staged in the page and saved, before the
//     meeting itself, by the save bar (form.__editorBeforeSave).
(function () {
  'use strict';
  var form = document.getElementById('meeting-edit-form');
  if (!form) return;
  var me = document.currentScript;
  var DAY_NAMES = [];
  try { DAY_NAMES = JSON.parse(me.getAttribute('data-day-names') || '[]'); } catch (_) {}

  // ── Files panel into the settings column ─────────────────────────
  var filesPanel = document.querySelector('[data-meeting-files-panel]');
  var controls = form.querySelector('[data-studio="meeting"] .st-controls');
  if (filesPanel && controls) controls.appendChild(filesPanel);

  // ── The Online tab follows the type ──────────────────────────────
  var onlineTab = form.querySelector('[data-meeting-online-tab]');
  var studio = form.querySelector('[data-studio="meeting"]');
  function syncOnline(fromUser) {
    var checked = form.querySelector('.meeting-type-radio:checked');
    var inPerson = !checked || checked.value === 'in_person';
    if (onlineTab) onlineTab.hidden = inPerson;
    if (inPerson && studio && studio.getAttribute('data-studio-open') === 'online' && studio._studioShow) {
      studio._studioShow('meeting', fromUser);
    }
  }
  form.querySelectorAll('.meeting-type-radio').forEach(function (r) {
    r.addEventListener('change', function () { syncOnline(true); });
  });
  // After fe_studio.js has set the studio up (its listener runs first).
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { syncOnline(false); }, 0); });

  // ── Extended content ─────────────────────────────────────────────
  (function () {
    var toggle = form.querySelector('[data-extended-toggle]');
    var editor = form.querySelector('[data-extended-editor]');
    if (!toggle || !editor) return;
    var list = editor.querySelector('[data-extended-list]');
    var tpl = editor.querySelector('[data-extended-template]');
    var addBtn = editor.querySelector('[data-extended-add]');
    function sync() { editor.hidden = !toggle.checked; }
    toggle.addEventListener('change', sync);
    sync();
    var nextIdx = 0;
    list.querySelectorAll('[data-extended-item]').forEach(function (card) {
      var i = parseInt(card.dataset.itemIndex, 10);
      if (isFinite(i) && i >= nextIdx) nextIdx = i + 1;
    });
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-extended-remove]');
      var card = btn && btn.closest('[data-extended-item]');
      if (card) card.remove();
    });
    addBtn.addEventListener('click', function () {
      var wrap = document.createElement('div');
      wrap.innerHTML = tpl.innerHTML.replace(/__INDEX__/g, String(nextIdx++)).trim();
      var card = wrap.firstElementChild;
      list.appendChild(card);
      var title = card.querySelector('input[type="text"]');
      if (title) title.focus();
    });
  })();

  // ── Platform switches: a platform that's off folds to its switch ──
  form.querySelectorAll('[data-conf-toggle]').forEach(function (toggle) {
    var group = toggle.closest('fieldset');
    var fields = group && group.querySelector('[data-conf-fields]');
    if (!fields) return;
    function sync() {
      fields.hidden = !toggle.checked;
      group.classList.toggle('conf-off', !toggle.checked);
    }
    toggle.addEventListener('change', sync);
    sync();
  });

  // ── Public alert expiry: a week out when first switched on ─────────
  (function () {
    var toggle = form.querySelector('[data-public-alert-expiry-toggle]');
    var field = form.querySelector('[data-public-alert-expiry-field]');
    var input = form.querySelector('[data-public-alert-expiry-input]');
    if (!toggle || !field) return;
    function sync() {
      field.hidden = !toggle.checked;
      if (toggle.checked && input && !input.value) {
        var d = new Date();
        d.setDate(d.getDate() + 7);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        input.value = d.toISOString().slice(0, 16);
      }
    }
    toggle.addEventListener('change', sync);
    sync();
  })();

  // ── Logo: preview a pick, and show what the save stored ──────────
  (function () {
    var box = form.querySelector('[data-meeting-logo]');
    if (!box) return;
    var img = box.querySelector('[data-meeting-logo-img]');
    var clear = box.querySelector('[data-meeting-logo-clear]');
    var upload = box.querySelector('[data-meeting-logo-upload]');
    var clearBox = clear && clear.querySelector('input');
    if (upload) upload.addEventListener('change', function () {
      var f = upload.files && upload.files[0];
      if (!f || !img) return;
      img.src = URL.createObjectURL(f);
      img.hidden = false;
      if (clearBox) clearBox.checked = false;
    });
    form.addEventListener('editor:saved', function (e) {
      var logo = e.detail && e.detail.logo;
      if (img) {
        if (logo) { img.src = logo; img.hidden = false; }
        else { img.removeAttribute('src'); img.hidden = true; }
      }
      if (clear) clear.hidden = !logo;
      if (clearBox) clearBox.checked = false;
      if (upload) upload.value = '';
    });
  })();

  // ── A new address after a rename ─────────────────────────────────
  // The file forms, the file reorder and the page's links carry the
  // meeting's address; when a save changes it, they follow.
  function slugOf(action) {
    var m = /\/meetings\/([^/?#]+)\/edit/.exec(action || '');
    return m ? m[1] : null;
  }
  var currentSlug = slugOf(form.getAttribute('action'));
  form.addEventListener('editor:saved', function (e) {
    var next = slugOf(e.detail && e.detail.form_action);
    if (!next || !currentSlug || next === currentSlug) return;
    var re = new RegExp('/meetings/' + currentSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[/?#]|$)');
    document.querySelectorAll('[action], [href], [data-reorder-url]').forEach(function (el) {
      ['action', 'href', 'data-reorder-url'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && re.test(v)) el.setAttribute(attr, v.replace(re, '/meetings/' + next));
      });
    });
    currentSlug = next;
  });

  // ── Scheduled changes ────────────────────────────────────────────
  var fs = form.querySelector('[data-sched-chg]');
  if (!fs) return;

  function fmt12h(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
    if (!m) return hhmm || '?';
    var h = parseInt(m[1], 10);
    return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function fmtDate(iso) {
    var p = (iso || '').split('-');
    if (p.length !== 3) return iso || '?';
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function textBtn(label, title) {
    var b = el('button', 'btn btn-sm', label);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  }

  var list = fs.querySelector('[data-sched-chg-list]');
  var editor = fs.querySelector('[data-sched-chg-editor]');
  var summary = fs.querySelector('[data-sched-chg-summary]');
  var dateIn = fs.querySelector('[data-sched-chg-date]');
  var noteIn = fs.querySelector('[data-sched-chg-note]');
  var errEl = fs.querySelector('[data-sched-chg-error]');
  var queueBtn = fs.querySelector('[data-sched-chg-queue]');
  var discardBtn = fs.querySelector('[data-sched-chg-discard]');
  var dayRows = Array.prototype.slice.call(fs.querySelectorAll('[data-sched-chg-day]'));
  var items = [];
  var editing = null;   // the item in the editor, or null for a new change

  // Each item: { id (null until saved), effective_date, note, entries,
  // state: 'saved' | 'new' | 'edited' | 'deleted' }.
  function fromServer(changes) {
    return (changes || []).map(function (c) {
      return { id: c.id, effective_date: c.effective_date, note: c.note || '',
               entries: c.entries || [], state: 'saved' };
    });
  }
  try { items = fromServer(JSON.parse(fs.querySelector('[data-sched-chg-seed]').textContent)); }
  catch (_) { items = []; }

  function markDirty() {
    // The editor's inputs have no name; this tells the save bar.
    form.dispatchEvent(new CustomEvent('editor:changed'));
  }
  function showError(text) { errEl.textContent = text || ''; errEl.hidden = !text; }

  function readEditor() {
    var entries = [];
    dayRows.forEach(function (row) {
      if (!row.querySelector('.day-toggle').checked) return;
      entries.push({
        day: parseInt(row.getAttribute('data-sched-chg-day'), 10),
        start_time: row.querySelector('[data-sched-chg-start]').value,
        end_time: row.querySelector('[data-sched-chg-end]').value,
        opens_time: row.querySelector('[data-sched-chg-opens]').value
      });
    });
    return { effective_date: dateIn.value, note: noteIn.value.trim(), entries: entries };
  }
  function fillEditor(item) {
    dateIn.value = item ? item.effective_date : '';
    noteIn.value = item ? item.note : '';
    dayRows.forEach(function (row) {
      var day = parseInt(row.getAttribute('data-sched-chg-day'), 10);
      var e = null;
      (item ? item.entries : []).forEach(function (x) { if (x.day === day) e = x; });
      row.querySelector('[data-sched-chg-start]').value = e ? e.start_time : '';
      row.querySelector('[data-sched-chg-end]').value = e ? (e.end_time || '') : '';
      row.querySelector('[data-sched-chg-opens]').value = e ? (e.opens_time || '') : '';
      var t = row.querySelector('.day-toggle');
      if (t.checked !== !!e) {
        t.checked = !!e;
        // Not bubbling: app.js enables the row, but loading isn't an edit.
        t.dispatchEvent(new Event('change'));
      }
    });
  }
  function setEditing(item) {
    editing = item;
    fillEditor(item);
    showError('');
    summary.textContent = item ? 'Edit the change effective ' + fmtDate(item.effective_date)
                               : 'Schedule a future change';
    queueBtn.textContent = item ? 'Update queued change' : 'Queue schedule change';
    render();
  }
  function editorTouched() {
    if (editing) return true;
    var d = readEditor();
    return !!(d.effective_date || d.note || d.entries.length);
  }
  function validate(d) {
    if (!d.effective_date) return 'Pick the date the new schedule takes effect.';
    if (!d.entries.length) return 'Turn on at least one day for the new schedule.';
    for (var i = 0; i < d.entries.length; i++) {
      if (!d.entries[i].start_time) return 'Add a start time for ' + DAY_NAMES[d.entries[i].day] + '.';
    }
    return null;
  }
  // Moves the editor's contents into the list; returns an error string,
  // leaving the editor open, when the change is incomplete.
  function stage() {
    var d = readEditor();
    var err = validate(d);
    if (err) { editor.open = true; showError(err); return err; }
    if (editing) {
      editing.effective_date = d.effective_date;
      editing.note = d.note;
      editing.entries = d.entries;
      if (editing.state === 'saved') editing.state = 'edited';
    } else {
      items.push({ id: null, effective_date: d.effective_date, note: d.note,
                   entries: d.entries, state: 'new' });
    }
    items.sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0; });
    editor.open = false;
    setEditing(null);
    markDirty();
    return null;
  }

  function render() {
    list.textContent = '';
    list.hidden = !items.length;
    items.forEach(function (item) {
      var li = el('li', 'schedule-change-item');
      if (item.state === 'new' || item.state === 'edited') li.classList.add('is-staged');
      if (item.state === 'deleted') li.classList.add('is-removed');
      if (item === editing) li.classList.add('is-editing');
      var head = el('div', 'schedule-change-head');
      var info = el('div');
      var when = el('div', 'schedule-change-when');
      when.appendChild(document.createTextNode('Effective '));
      when.appendChild(el('strong', null, fmtDate(item.effective_date)));
      var badge = { 'new': 'New, not saved yet', 'edited': 'Edited, not saved yet',
                    'deleted': 'Cancelled when you save' }[item.state];
      if (badge) when.appendChild(el('span', 'schedule-change-badge', badge));
      info.appendChild(when);
      if (item.note) info.appendChild(el('div', 'muted small schedule-change-note', item.note));
      head.appendChild(info);
      var actions = el('div', 'schedule-change-actions');
      if (item.state === 'deleted') {
        var undo = textBtn('Undo');
        undo.addEventListener('click', function () { item.state = item.prevState || 'saved'; render(); });
        actions.appendChild(undo);
      } else {
        var edit = textBtn(item === editing ? 'Editing…' : 'Edit');
        edit.disabled = item === editing;
        edit.addEventListener('click', function () {
          setEditing(item);
          editor.open = true;
          editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        var cancel = textBtn('Cancel', 'Cancel this scheduled change when you save');
        cancel.addEventListener('click', function () {
          if (item === editing) { editor.open = false; setEditing(null); }
          if (item.state === 'new') items.splice(items.indexOf(item), 1);
          else { item.prevState = item.state; item.state = 'deleted'; }
          markDirty();
          render();
        });
        actions.appendChild(edit);
        actions.appendChild(cancel);
      }
      head.appendChild(actions);
      li.appendChild(head);
      if (item.entries.length) {
        var ul = el('ul', 'schedule-change-entries muted small');
        item.entries.forEach(function (e) {
          var row = el('li', null, (DAY_NAMES[e.day] || '?') + ' · ' + fmt12h(e.start_time)
            + (e.end_time ? ' to ' + fmt12h(e.end_time) : ''));
          if (e.opens_time) row.appendChild(el('span', 'muted smaller', ' · opens ' + fmt12h(e.opens_time)));
          ul.appendChild(row);
        });
        li.appendChild(ul);
      } else {
        li.appendChild(el('p', 'muted smaller', 'No days in this change: it clears the schedule on that date.'));
      }
      list.appendChild(li);
    });
  }

  queueBtn.addEventListener('click', stage);
  discardBtn.addEventListener('click', function () { editor.open = false; setEditing(null); });
  render();

  // Saved first by the save bar: the sync endpoint checks the whole
  // batch and says what's wrong, so a bad queued change stops the save
  // before the meeting is touched. A change typed into the editor but
  // never queued is queued here rather than dropped.
  form.__editorBeforeSave = function () {
    if (editorTouched()) {
      var err = stage();
      if (err) return Promise.reject(new Error(err));
    }
    var upserts = items.filter(function (i) { return i.state === 'new' || i.state === 'edited'; })
      .map(function (i) { return { id: i.id, effective_date: i.effective_date, note: i.note, entries: i.entries }; });
    var deletes = items.filter(function (i) { return i.state === 'deleted' && i.id; })
      .map(function (i) { return i.id; });
    if (!upserts.length && !deletes.length) return Promise.resolve();
    var type = form.querySelector('.meeting-type-radio:checked');
    var acct = form.querySelector('select[name="zoom_account_id"]');
    return fetch(fs.getAttribute('data-sync-url'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ upserts: upserts, deletes: deletes,
                             meeting_type: type ? type.value : null,
                             zoom_account_id: acct ? acct.value : null })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (data) {
        if (!r.ok || !data || !data.ok) {
          throw new Error((data && data.error) || 'The scheduled changes couldn’t be saved.');
        }
        items = fromServer(data.changes);
        setEditing(null);
      });
    });
  };
})();
