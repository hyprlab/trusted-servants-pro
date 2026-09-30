// Tabs for the Web Frontend studio pages (Header, Footer, Page templates,
// Forms, Pages). Same look as the Design page's tabs, without its token
// machinery.
//
//   <section data-studio="header">
//     <nav role="tablist"><button data-studio-tab="menu">…</button>…</nav>
//     <div data-studio-panel="menu">…</div>…
//   </section>
//
// The open tab follows the URL hash (#menu) and is remembered per studio,
// so the reload after a save returns to it. A tab button may carry
// data-studio-path="/x": opening it points the page's live preview at /x.
// While the save bar shows unsaved changes, leaving the page asks first.
(function () {
  'use strict';

  function store(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function stored(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  function setup(root) {
    var key = 'fe-studio-tab:' + (root.getAttribute('data-studio') || location.pathname);
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-studio-tab]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-studio-panel]'));
    if (!tabs.length) return;

    function show(name, fromUser) {
      var found = tabs.some(function (t) { return t.getAttribute('data-studio-tab') === name; });
      if (!found) name = tabs[0].getAttribute('data-studio-tab');
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-studio-tab') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on) {
          var path = t.getAttribute('data-studio-path');
          var lp = document.querySelector('[data-live-preview]');
          if (path && lp && window.FeLivePreview && lp.getAttribute('data-lp-path') !== path) {
            window.FeLivePreview.setPath(lp, path);
          }
          var focus = t.getAttribute('data-studio-focus');
          if (focus !== null && lp) lp.setAttribute('data-lp-focus', focus);
        }
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-studio-panel') !== name; });
      root.setAttribute('data-studio-open', name);
      store(key, name);
      if (fromUser && history.replaceState) history.replaceState(null, '', '#' + name);
      document.dispatchEvent(new CustomEvent('studio:tab', { detail: { studio: root, tab: name } }));
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t.getAttribute('data-studio-tab'), true); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus(); show(n.getAttribute('data-studio-tab'), true);
      });
    });
    var hash = (location.hash || '').slice(1);
    show(hash || stored(key) || tabs[0].getAttribute('data-studio-tab'), false);
    root._studioShow = show;
  }

  function init() {
    document.querySelectorAll('[data-studio]').forEach(setup);
    // Any element with data-studio-goto="tab" opens that tab.
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-studio-goto]');
      if (!g) return;
      // A control inside the element (a pill's remove button) keeps its
      // own job.
      var ctl = e.target.closest('button, a, input, select, label');
      if (ctl && ctl !== g && g.contains(ctl)) return;
      var root = document.querySelector('[data-studio]');
      if (root && root._studioShow) { e.preventDefault(); root._studioShow(g.getAttribute('data-studio-goto'), true); }
    });
    // A form posting normally is the save itself, not leaving.
    var submitting = false;
    document.addEventListener('submit', function () { submitting = true; }, true);
    window.addEventListener('beforeunload', function (e) {
      var bar = document.getElementById('fe-save-bar');
      if (!submitting && bar && !bar.hidden && !bar.classList.contains('is-leaving')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
