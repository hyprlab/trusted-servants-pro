// Compact rows that open to edit, one at a time within their list.
//
//   <li data-ol-row data-ol-key="nav-12">          key: optional, keeps the
//     … <button data-ol-toggle>                       row open across the
//          <b data-ol-sum="[name=label]"               reload after a save
//             data-ol-empty="Untitled"></b>
//        </button> …
//     <div data-ol-body hidden>…fields…</div>
//   </li>
//
// data-ol-sum holds a selector list: the row's summary shows the values
// of the matching fields (enabled, non-empty, joined by a space), or the
// option text for a select, and follows them as they are typed. A new
// row can be opened from script with FeRows.open(row).
(function () {
  'use strict';
  var KEY = 'fe-rows-open:' + location.pathname;

  function openKeys() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
  }
  function saveKeys(keys) {
    try { sessionStorage.setItem(KEY, JSON.stringify(keys)); } catch (_) {}
  }

  function body(row) { return row.querySelector(':scope > [data-ol-body], :scope > * > [data-ol-body]'); }
  function toggle(row) { return row.querySelector(':scope [data-ol-toggle]'); }

  function fieldText(el) {
    if (el.disabled) return '';
    if (el.tagName === 'SELECT') {
      var o = el.options[el.selectedIndex];
      return o ? o.text.trim() : '';
    }
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.getAttribute('data-ol-label') || '') : '';
    return (el.value || '').trim();
  }

  function summarize(row) {
    row.querySelectorAll('[data-ol-sum]').forEach(function (out) {
      if (out.closest('[data-ol-row]') !== row) return;
      var parts = [];
      row.querySelectorAll(out.getAttribute('data-ol-sum')).forEach(function (el) {
        if (el.closest('[data-ol-row]') !== row) return;
        var t = fieldText(el);
        if (t) parts.push(t);
      });
      var text = parts.join(out.getAttribute('data-ol-join') || ' ');
      out.textContent = text || out.getAttribute('data-ol-empty') || '';
      out.classList.toggle('is-empty', !text);
    });
  }

  function setOpen(row, on, remember) {
    var b = body(row);
    if (!b) return;
    b.hidden = !on;
    row.classList.toggle('is-open', on);
    var t = toggle(row);
    if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
    var key = row.getAttribute('data-ol-key');
    if (key && remember !== false) {
      var keys = openKeys().filter(function (k) { return k !== key; });
      if (on) keys.push(key);
      saveKeys(keys);
    }
    if (on) {
      // One open row per list: close its siblings.
      Array.prototype.forEach.call(row.parentElement ? row.parentElement.children : [], function (sib) {
        if (sib !== row && sib.hasAttribute('data-ol-row') && sib.classList.contains('is-open')) setOpen(sib, false);
      });
    }
  }

  function open(row) {
    if (!row) return;
    setOpen(row, true);
    var first = body(row) && body(row).querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) { try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); } }
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function init(scope) {
    var keys = openKeys();
    (scope || document).querySelectorAll('[data-ol-row]').forEach(function (row) {
      if (row._ol) return;
      row._ol = true;
      summarize(row);
      var key = row.getAttribute('data-ol-key');
      setOpen(row, !!(key && keys.indexOf(key) !== -1), false);
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ol-toggle]');
    if (!t) return;
    var row = t.closest('[data-ol-row]');
    if (!row) return;
    e.preventDefault();
    setOpen(row, !row.classList.contains('is-open'));
  });
  // Any element with data-ol-goto="key" opens the row with that key (a
  // footer layout block opens its part). Controls inside it keep their job.
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-ol-goto]');
    if (!g) return;
    var ctl = e.target.closest('button, a, input, select, label');
    if (ctl && ctl !== g && g.contains(ctl)) return;
    var row = document.querySelector('[data-ol-row][data-ol-key="' + g.getAttribute('data-ol-goto') + '"]');
    if (!row) return;
    e.preventDefault();
    setOpen(row, true);
    row.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  function onEdit(e) {
    var row = e.target.closest && e.target.closest('[data-ol-row]');
    while (row) {
      summarize(row);
      row = row.parentElement && row.parentElement.closest('[data-ol-row]');
    }
  }
  document.addEventListener('input', onEdit);
  document.addEventListener('change', onEdit);

  // Rows added later (a new block, a new utility bar item) start closed
  // unless their script opens them.
  if (window.MutationObserver) {
    new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches('[data-ol-row]') || n.querySelector('[data-ol-row]')) init(n.parentElement || document);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.FeRows = { init: init, open: open, summarize: summarize };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
