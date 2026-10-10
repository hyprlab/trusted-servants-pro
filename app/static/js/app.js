// SPDX-License-Identifier: AGPL-3.0-or-later
(function installCsrfFetch() {
  // Auto-attach X-CSRFToken header to all same-origin state-changing fetches.
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) return;
  const token = meta.content;
  const safe = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
  const orig = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    const method = String(init.method || (input && input.method) || "GET").toUpperCase();
    if (!safe.has(method)) {
      init.headers = new Headers(init.headers || {});
      if (!init.headers.has("X-CSRFToken")) init.headers.set("X-CSRFToken", token);
    }
    return orig.call(this, input, init);
  };
})();

(function () {
  // ── Light or dark ──
  // Each account chooses Follow system, Light or Dark (Settings →
  // Appearance, or the sidebar's sun/moon button); it's saved to the
  // account (/tspro/account/theme) and kept in localStorage for the
  // signed-out pages. The <head> script has already applied it.
  const root = document.documentElement;
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const PREFS = ["system", "light", "dark"];
  const fromBrowser = () => {
    let t = null;
    try { t = localStorage.getItem("tsp-theme"); } catch (_) {}
    if (!t) return "system";
    if (PREFS.includes(t)) return t;
    return /dark|cyberpunk/.test(t) ? "dark" : "light";  // the old theme names
  };
  let themePref = root.dataset.themePref || fromBrowser();
  const resolveTheme = p => (p === "dark" || (p === "system" && darkQuery && darkQuery.matches)) ? "dark" : "light";
  function applyTheme() {
    root.setAttribute("data-theme", resolveTheme(themePref));
    document.querySelectorAll("[data-theme-pref-value]").forEach(b => {
      b.setAttribute("aria-checked", b.dataset.themePrefValue === themePref ? "true" : "false");
    });
  }
  function saveTheme(p) {
    if (!PREFS.includes(p)) return;
    themePref = p;
    root.dataset.themePref = p;
    try { localStorage.setItem("tsp-theme", p); } catch (_) {}
    applyTheme();
    if (window.tspUser && window.tspUser.role) {
      fetch("/tspro/account/theme", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ pref: p }),
      }).catch(() => {});
    }
  }
  if (darkQuery) {
    const onDevice = () => { if (themePref === "system") applyTheme(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onDevice);
    else if (darkQuery.addListener) darkQuery.addListener(onDevice);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-theme-pref-value]");
    if (b) saveTheme(b.dataset.themePrefValue);
  });
  const sidebarToggle = document.getElementById("theme-toggle");
  if (sidebarToggle) sidebarToggle.addEventListener("click", () => {
    saveTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
  // Signed in but never chosen on the account: keep what this browser
  // had (an old theme becomes light or dark) by saving it once.
  if (!root.dataset.themePref && window.tspUser && window.tspUser.role) {
    try { if (localStorage.getItem("tsp-theme")) saveTheme(themePref); } catch (_) {}
  }
  applyTheme();

  const menu = document.getElementById("menu-toggle");
  const side = document.querySelector(".sidebar");
  if (menu && side) {
    menu.addEventListener("click", e => {
      e.stopPropagation();
      side.classList.toggle("open");
    });
    document.addEventListener("click", e => {
      if (!side.classList.contains("open")) return;
      if (side.contains(e.target) || (menu && menu.contains(e.target))) return;
      side.classList.remove("open");
    });
    side.querySelectorAll("nav a").forEach(a =>
      a.addEventListener("click", () => {
        // Auto-hide context (body.fe-admin-autohide): when the click
        // is leaving the Web Frontend admin entirely (i.e. the link
        // does not go to another /frontend/… page), keep the sidebar
        // open through the navigation. The destination page won't
        // carry the auto-hide body class so its own sidebar will be
        // statically visible anyway — sliding the current one away
        // before the reload only produces a distracting flash.
        if (document.body.classList.contains("fe-admin-autohide")) {
          const href = a.getAttribute("href") || "";
          if (href && !href.includes("/frontend/")) return;
        }
        side.classList.remove("open");
      }));
  }

  // ── Sidebar section collapse/expand ───────────────────────────────
  // The labelled sections in #sidebar-nav (Intergroup / External /
  // Admin) render with a toggle button as their divider. Click flips
  // aria-expanded + hides the items wrapper; per-section state is
  // persisted in localStorage so it survives reloads and the AJAX
  // nav refresh fired after Settings saves.
  const SIDEBAR_COLLAPSE_KEY = "tsp-sidebar-collapsed";
  function readCollapsed() {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === "object") ? v : {};
    } catch (_) { return {}; }
  }
  function writeCollapsed(map) {
    try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(map)); }
    catch (_) {}
  }
  function applySidebarSectionState() {
    const state = readCollapsed();
    document.querySelectorAll(".sidebar-section-toggle").forEach(btn => {
      const key = btn.dataset.sidebarSection;
      if (!key) return;
      const collapsed = !!state[key];
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const items = document.getElementById(btn.getAttribute("aria-controls"));
      if (items) items.hidden = collapsed;
    });
    // The pre-paint preload <style> (injected in <head> to stop collapsed
    // sections flashing open on load) has done its job now that the
    // `hidden` attributes carry the same state — drop it so toggling a
    // section open isn't blocked by a lingering `display:none` rule.
    const preload = document.getElementById("tsp-sidebar-collapse-preload");
    if (preload) preload.remove();
  }
  document.addEventListener("click", e => {
    const btn = e.target.closest(".sidebar-section-toggle");
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.sidebarSection;
    if (!key) return;
    const state = readCollapsed();
    const nowCollapsed = !state[key];
    if (nowCollapsed) state[key] = true; else delete state[key];
    writeCollapsed(state);
    applySidebarSectionState();
  });
  applySidebarSectionState();

  // A tooltip that a scrolling or clipping box would cut off (a list
  // page's sidebar, a card) floats instead: moved to <body>, fixed beside
  // its button, and put back when it closes. Scrolling closes it, since
  // it no longer moves with the page.
  function clipsTip(tip) {
    const r = tip.getBoundingClientRect();
    for (let el = tip.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = el.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) return true;
    }
    return false;
  }
  function floatTip(wrap, tip) {
    const btnR = wrap.querySelector(".help-btn").getBoundingClientRect();
    tip._home = wrap;
    tip.classList.add("is-floating");
    document.body.appendChild(tip);
    const pad = 8, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = Math.min(btnR.left, window.innerWidth - pad - w);
    left = Math.max(pad, left);
    let top = btnR.bottom + 6;
    if (top + h > window.innerHeight - pad && btnR.top - 6 - h >= pad) top = btnR.top - 6 - h;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }
  function closeTips() {
    document.querySelectorAll(".help-tooltip.is-floating").forEach(tip => {
      tip.classList.remove("is-floating");
      tip.style.left = tip.style.top = "";
      if (tip._home && tip._home.isConnected) tip._home.appendChild(tip); else tip.remove();
    });
    document.querySelectorAll(".heading-help.open").forEach(el => el.classList.remove("open"));
  }
  window.addEventListener("scroll", () => {
    if (document.querySelector(".help-tooltip.is-floating")) closeTips();
  }, true);
  window.addEventListener("resize", () => {
    if (document.querySelector(".help-tooltip.is-floating")) closeTips();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-btn");
    if (btn) {
      const wrap = btn.closest(".heading-help");
      const wasOpen = wrap.classList.contains("open");
      closeTips();
      if (!wasOpen) {
        wrap.classList.add("open");
        // Inline field chips sit wherever their label does, including
        // the right-hand column of a two-up row and, on a phone, a spot
        // where a 360px panel can't fit on either side of the anchor.
        // So nudge rather than flip: measure once opened, then slide the
        // panel back inside the viewport. Right edge first, left second,
        // so a tooltip wider than the gap lands flush left rather than
        // half off-screen.
        const tip = wrap.querySelector(".help-tooltip");
        if (tip) {
          tip.style.transform = "";
          const r = tip.getBoundingClientRect();
          const pad = 8;
          let shift = 0;
          if (r.right > window.innerWidth - pad) shift = window.innerWidth - pad - r.right;
          if (r.left + shift < pad) shift = pad - r.left;
          if (shift) tip.style.transform = "translateX(" + Math.round(shift) + "px)";
          if (clipsTip(tip)) { tip.style.transform = ""; floatTip(wrap, tip); }
        }
      }
      // Chips live inside <label> and <summary> elements; without this
      // the click would also focus the field or collapse the section.
      e.preventDefault();
      e.stopPropagation();
    } else if (!e.target.closest(".help-tooltip")) {
      closeTips();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTips();
  });

  // Branding: live-preview footer logo width + selected file
  const bWidth = document.getElementById("branding-width-slider");
  const bValue = document.getElementById("branding-width-value");
  const bImg = document.getElementById("branding-preview-img");
  const bFile = document.getElementById("branding-file-input");
  if (bWidth && bImg && bValue) {
    const sync = () => {
      bImg.style.width = bWidth.value + "px";
      bValue.textContent = bWidth.value + "px";
    };
    bWidth.addEventListener("input", sync);
    sync();
  }
  if (bFile && bImg) {
    bFile.addEventListener("change", () => {
      const f = bFile.files && bFile.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      bImg.src = url;
      bImg.hidden = false;
      const emptyLabel = document.querySelector(".appearance-branding-form .branding-preview-empty");
      if (emptyLabel) emptyLabel.hidden = true;
    });
  }

  const bForm = document.querySelector("form.appearance-branding-form");
  if (bForm) {
    bForm.addEventListener("settings:saved", (e) => {
      const d = e.detail;
      if (!d) return;
      const sidebarImg = document.getElementById("sidebar-footer-logo");
      const sidebarLink = document.getElementById("sidebar-footer-link");
      if (sidebarImg) {
        sidebarImg.src = d.footer_logo_src || "";
        if (d.footer_logo_width) sidebarImg.style.width = d.footer_logo_width + "px";
      }
      if (sidebarLink) {
        sidebarLink.href = d.footer_logo_link || "#";
        sidebarLink.hidden = !d.has_custom_logo;
      }
      if (bImg) {
        bImg.src = d.footer_logo_src || "";
        bImg.hidden = !d.has_custom_logo;
      }
      const emptyLabel = bForm.querySelector(".branding-preview-empty");
      if (emptyLabel) emptyLabel.hidden = !!d.has_custom_logo;
      if (bFile) bFile.value = "";
      const clearLabel = bForm.querySelector(".branding-clear-label");
      if (clearLabel) {
        const cb = clearLabel.querySelector('input[name="clear_logo"]');
        if (cb) cb.checked = false;
        clearLabel.hidden = !d.has_custom_logo;
      }
    });
  }

  // Modal open/close
  function openModal(id, srcOverride, titleOverride) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // Lazy-load any iframe inside the modal whose source we can
    // resolve. `srcOverride` (from the trigger's `data-modal-src`)
    // wins; otherwise we fall back to the iframe's `data-src`. Any
    // iframe with no resolvable target stays untouched. This lets the
    // same modal be repointed at different URLs by different triggers
    // — e.g. + New story vs. per-row Edit on the stories list.
    m.querySelectorAll("iframe").forEach(f => {
      const target = srcOverride || f.dataset.src;
      if (!target) return;
      if (!f.src || f.src === "about:blank" || f.src === window.location.href || (srcOverride && f.src !== target)) {
        f.src = target;
      }
    });
    // Optional dynamic title — used by triggers that share a modal but
    // need a different head label (e.g. "New story" vs. "Edit story").
    if (titleOverride) {
      const head = m.querySelector(".modal-head h2");
      if (head) head.textContent = titleOverride;
    }
  }
  function closeModal(m) {
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    // When the closed modal hosts a lazy-loaded iframe, blank it out so
    // the next open starts a clean wizard / form session — otherwise
    // the iframe would resume on whatever step it last landed on.
    // Match by id, not by [data-src].
    m.querySelectorAll("iframe").forEach(f => {
      if (f.id === "wp-import-frame"
          || f.id === "backup-wizard-frame" || f.id === "backups-frame"
          || f.id === "ts-import-frame") {
        f.src = "about:blank";
      }
    });
  }
  // Page setup that must run again when the page behind an open modal is
  // replaced (tspSwapPage, below): each runs once now and again on the
  // new content. Bindings mark their element so none is bound twice.
  const pageSetups = [];
  function onEachPage(fn) { pageSetups.push(fn); fn(); }
  window.tspRunPageSetups = () => pageSetups.forEach(fn => {
    try { fn(); } catch (err) { console.error(err); }
  });
  window.tspOnEachPage = onEachPage;

  // Replace the page with another without reloading (window.tspSwapPage):
  // the page behind Settings when a module is turned off, links in a
  // [data-swap-nav] (Watchtower's sections) and links marked data-swap
  // (the File Browser's files). It swaps the heading, its actions,
  // messages and content (in an embedded page, all of it), the
  // sidebar's pinned buttons, the tab title and the address. The page's app.js setups then run again
  // (tspRunPageSetups). Scripts inside the new content are not run, so
  // this suits pages whose behavior lives in app.js, as the Dashboard's
  // does.
  function swapParts(doc, sels) {
    sels.forEach(sel => {
      const now = document.querySelector(sel), next = doc.querySelector(sel);
      if (now && next) now.replaceWith(document.importNode(next, true));
    });
  }
  // The rows at the top of the sidebar (Dashboard, Watchtower, Web
  // Frontend) follow the modules that are on and which page is open.
  function swapPinned(doc) {
    swapParts(doc, [".sidebar > .side-top"]);
  }
  async function fetchPage(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return { url: r.url, doc: new DOMParser().parseFromString(await r.text(), "text/html") };
  }
  let swapped = false;
  // A [data-swap-nav] that the new page has too (matched by aria-label)
  // stays the same element: its links and current mark take the new
  // page's, so its sliding highlight moves rather than being redrawn.
  function keepNavs(doc) {
    const kept = [];
    document.querySelectorAll("[data-swap-nav][aria-label]").forEach(nav => {
      const twin = doc.querySelector('[data-swap-nav][aria-label="' + CSS.escape(nav.getAttribute("aria-label")) + '"]');
      if (!twin) return;
      const mine = nav.querySelectorAll("a[href]"), theirs = twin.querySelectorAll("a[href]");
      if (mine.length !== theirs.length) return;
      mine.forEach((a, i) => {
        a.innerHTML = theirs[i].innerHTML;
        if (theirs[i].hasAttribute("aria-current")) a.setAttribute("aria-current", theirs[i].getAttribute("aria-current"));
        else a.removeAttribute("aria-current");
      });
      const slot = doc.createElement("span");
      slot.setAttribute("data-swap-keep", String(kept.length));
      twin.replaceWith(slot);
      kept.push(nav);
    });
    return kept;
  }
  // A nav's current part, scrolled to the middle of the strip it sits in
  // when that strip scrolls sideways (Watchtower's tabs on a phone).
  function revealCurrent(nav, smooth) {
    const on = nav.querySelector('[aria-current="page"]');
    if (!on) return;
    let strip = on.parentElement;
    while (strip && strip !== nav.parentElement && strip.scrollWidth <= strip.clientWidth) strip = strip.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const s = strip.getBoundingClientRect(), a = on.getBoundingClientRect();
    strip.scrollTo({ left: strip.scrollLeft + (a.left - s.left) - (s.width - a.width) / 2,
                     behavior: smooth ? "smooth" : "auto" });
  }
  async function swapPage(url, opts) {
    const { url: landed, doc } = await fetchPage(url);
    // Moving a kept nav out and back in resets its strip's sideways
    // scroll: note it, to put it back.
    const scrolls = [];
    document.querySelectorAll("[data-swap-nav]").forEach(nav => {
      [nav, ...nav.querySelectorAll("*")].forEach(el => { if (el.scrollLeft) scrolls.push([el, el.scrollLeft]); });
    });
    const kept = keepNavs(doc);
    swapParts(doc, [".topbar > h1", ".topbar > .top-actions",
                    "main.content > .flashes", "main.content > section.page", "main.embed-content"]);
    kept.forEach((nav, i) => {
      const slot = document.querySelector('[data-swap-keep="' + i + '"]');
      if (slot) slot.replaceWith(nav);
    });
    scrolls.forEach(([el, left]) => { if (el.isConnected) el.scrollLeft = left; });
    kept.forEach(nav => revealCurrent(nav, true));
    swapPinned(doc);
    document.title = doc.title;
    document.body.classList.toggle("fe-admin-autohide", doc.body.classList.contains("fe-admin-autohide"));
    document.querySelector(".sidebar")?.classList.remove("open");
    if ((!opts || opts.push !== false) && landed !== location.href) history.pushState(null, "", landed);
    swapped = true;
    (document.scrollingElement || document.documentElement).scrollTop = 0;
    runScripts(document.querySelector("main.content > section.page, main.embed-content"));
    window.tspRunPageSetups();
  }
  // Scripts in swapped-in content don't run on their own: run each
  // inline one, and load each external one this document hasn't yet.
  function runScripts(root) {
    if (!root) return;
    const loaded = new Set(Array.from(document.scripts)
      .filter(sc => sc.src && !root.contains(sc)).map(sc => sc.src));
    root.querySelectorAll("script").forEach(old => {
      if (old.src && loaded.has(old.src)) return;
      const sc = document.createElement("script");
      Array.from(old.attributes).forEach(a => sc.setAttribute(a.name, a.value));
      if (!old.src) sc.textContent = old.textContent;
      old.replaceWith(sc);
    });
  }
  // Back or Forward after a swap: the address changed without its page,
  // so bring in the page it names the same way.
  window.addEventListener("popstate", () => {
    if (swapped) swapPage(location.href, { push: false }).catch(() => window.location.reload());
  });
  window.tspSwapPage = swapPage;
  // Links in a [data-swap-nav], and links marked data-swap, load in
  // place: a plain click swaps the page (a nav's clicked part turns
  // current at once); anything else, or a failed fetch, is an ordinary
  // navigation.
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-swap-nav] a[href], a[data-swap][href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    if (url.href === location.href) return;
    const nav = a.closest("[data-swap-nav]");
    if (nav) {
      nav.querySelectorAll('[aria-current="page"]').forEach(x => x.removeAttribute("aria-current"));
      a.setAttribute("aria-current", "page");
      revealCurrent(nav, true);
    }
    document.documentElement.classList.add("is-live-loading");
    swapPage(url.href).catch(() => location.assign(url.href))
      .finally(() => document.documentElement.classList.remove("is-live-loading"));
  });

  onEachPage(() => document.querySelectorAll("[data-open-modal]").forEach(el => {
    if (el._tspOpener) return;
    el._tspOpener = true;
    el.addEventListener("click", (e) => {
      // Allow data-settings-tab="<key>" alongside data-open-modal to
      // deep-link a specific tab inside the settings modal — e.g. the
      // dashboard role widget links to its full Your Access view.
      const targetId = el.dataset.openModal;
      const tab = el.dataset.settingsTab;
      if (tab && targetId === "settings-modal" && el.tagName === "A") {
        e.preventDefault();
      }
      // Optional `data-close-modal="<id>"` companion — the trigger
      // closes a sibling modal before opening the target. Used by the
      // WordPress importer launch button to dismiss the Settings
      // modal so the wizard isn't stacked on top of it.
      const closeId = el.dataset.closeModal;
      if (closeId) {
        const toClose = document.getElementById(closeId);
        if (toClose && toClose.classList.contains("open")) closeModal(toClose);
      }
      openModal(targetId, el.dataset.modalSrc, el.dataset.modalTitle);
      if (tab && targetId === "settings-modal") {
        const modal = document.getElementById("settings-modal");
        const tabBtn = modal && modal.querySelector('.settings-tab[data-tab="' + tab + '"]');
        if (tabBtn) tabBtn.click();
      }
    });
  }));

  // Live character counter for summary textareas on library-item
  // forms. Counts down from the textarea's `maxlength` (500) so the
  // operator sees how many characters they have left to spend. The
  // `is-empty` class flips on when 0 remain so the counter reads in
  // red — matches the `maxlength` cap the browser enforces. Works
  // for any textarea carrying `[data-summary-input]` paired with a
  // sibling `[data-summary-counter]` wrapper (and a nested
  // `[data-summary-count]` for the live number).
  document.querySelectorAll("[data-summary-input]").forEach(input => {
    const label = input.closest("label");
    if (!label) return;
    const counter = label.querySelector("[data-summary-counter]");
    const count = counter && counter.querySelector("[data-summary-count]");
    if (!counter || !count) return;
    const max = parseInt(input.getAttribute("maxlength") || "500", 10);
    function update() {
      const remaining = Math.max(0, max - input.value.length);
      count.textContent = remaining;
      counter.classList.toggle("is-empty", remaining <= 0);
    }
    input.addEventListener("input", update);
    update();
  });

  // Content-mode segmented control for library-item forms. Three
  // exclusive modes: upload | paste | link. Each mode-button maps to
  // one `[data-content-panel=...]` block in the form — only the
  // active panel is shown; the others are hidden + their inputs are
  // `disabled` so the browser doesn't submit their values. The
  // chosen mode rides in the hidden `content_mode` input so the
  // server can branch on it. Falls back to the legacy 2-mode toggle
  // shape (`[data-content-mode-check]` + `[data-content-mode-label]`)
  // for any form that still uses it — keeps older templates working.
  document.querySelectorAll("[data-content-mode-toggle]").forEach(toggle => {
    const form = toggle.closest("form");
    if (!form) return;
    const hidden = toggle.querySelector("[data-content-mode-input]");
    const buttons = toggle.querySelectorAll("[data-content-mode-option]");
    const check = toggle.querySelector("[data-content-mode-check]");
    const labels = toggle.querySelectorAll("[data-content-mode-label]");
    const panels = form.querySelectorAll("[data-content-panel]");
    function apply(mode) {
      if (hidden) hidden.value = mode;
      buttons.forEach(b => {
        const on = b.dataset.contentModeOption === mode;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      // Legacy 2-mode toggle support — preserved verbatim so any
      // template still using the checkbox flavour keeps working.
      if (check) check.checked = (mode === "paste");
      labels.forEach(l => l.classList.toggle("active", l.dataset.contentModeLabel === mode));
      panels.forEach(p => {
        const match = p.dataset.contentPanel === mode;
        p.hidden = !match;
        p.querySelectorAll("input, textarea, select").forEach(el => {
          el.disabled = !match;
        });
      });
    }
    buttons.forEach(b => b.addEventListener("click", () => {
      apply(b.dataset.contentModeOption);
      // An editor's save bar listens for edits.
      if (hidden) hidden.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    if (check) check.addEventListener("change", () => apply(check.checked ? "paste" : "upload"));
    apply((hidden && hidden.value) || "upload");
  });

  // Markdown editor tab switcher + debounced live preview via /markdown-preview.
  // `data-md-live="1"` swaps tabbed UX for a side-by-side editor that renders
  // the preview unconditionally on every keystroke (still debounced) — both
  // panes stay visible at once, no tabs needed.
  // Exposed as window.tspInitMdEditors(root) so dynamically inserted editors
  // (e.g. features cards added via the "Add card" button) can be wired up.
  function initMdEditor(editor) {
    if (editor.__tspMdInited) return;
    editor.__tspMdInited = true;
    const isLive = editor.getAttribute("data-md-live") === "1";
    const mode = editor.getAttribute("data-md-mode") || "";
    const tabs = editor.querySelectorAll(".md-editor-tab");
    const writePane = editor.querySelector(".md-editor-pane-write");
    const previewPane = editor.querySelector(".md-editor-pane-preview");
    const previewEl = editor.querySelector(".md-editor-preview");
    const textarea = editor.querySelector("textarea");
    if (!writePane || !previewPane || !textarea) return;
    if (!isLive && !tabs.length) return;

    // `data-md-event-tokens` (the announcement / event body) resolves
    // {event_*} tags against the form's Starts / Ends inputs as typed,
    // so the preview matches what the public page will print.
    const eventTokens = editor.hasAttribute("data-md-event-tokens");
    const hostForm = textarea.form || editor.closest("form");
    function eventWindow() {
      if (!eventTokens || !hostForm) return null;
      const s = hostForm.querySelector("[data-event-start]");
      const e = hostForm.querySelector("[data-event-end]");
      return { start: (s && s.value) || "", end: (e && e.value) || "" };
    }

    let lastRendered = null;
    let pending = null;
    async function renderPreview() {
      const content = textarea.value || "";
      const win = eventWindow();
      const key = content + (win ? "\u0000" + win.start + "\u0000" + win.end : "");
      if (key === lastRendered) return;
      if (!content.trim()) {
        previewEl.innerHTML = '<p class="muted smaller">Nothing to preview yet.</p>';
        lastRendered = key;
        return;
      }
      const fd = new FormData();
      fd.append("body", content);
      if (mode) fd.append("mode", mode);
      if (win) {
        fd.append("event_tokens", "1");
        fd.append("event_start", win.start);
        fd.append("event_end", win.end);
      }
      try {
        const r = await fetch("/tspro/markdown-preview", {
          method: "POST", body: fd, credentials: "same-origin",
          headers: { "X-Requested-With": "fetch" },
        });
        if (!r.ok) return;
        const data = await r.json();
        previewEl.innerHTML = data.html || '<p class="muted smaller">(empty)</p>';
        lastRendered = key;
      } catch (_) {}
    }

    if (!isLive) {
      function activate(tabName) {
        tabs.forEach(t => t.classList.toggle("active", t.dataset.mdTab === tabName));
        writePane.classList.toggle("active", tabName === "write");
        previewPane.classList.toggle("active", tabName === "preview");
        if (tabName === "preview") renderPreview();
      }
      tabs.forEach(t => t.addEventListener("click", () => activate(t.dataset.mdTab)));
    }

    textarea.addEventListener("input", () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (isLive || previewPane.classList.contains("active")) renderPreview();
      }, 250);
    });

    // Event-tag editors re-render when Starts / Ends change, so the
    // resolved dates in the preview follow the fields.
    if (eventTokens && hostForm) {
      hostForm.querySelectorAll("[data-event-start], [data-event-end]").forEach(inp => {
        inp.addEventListener("change", () => {
          if (isLive || previewPane.classList.contains("active")) renderPreview();
        });
      });
    }

    // Initial paint for live editors so the user sees what's saved before
    // touching the textarea (tabbed editors render lazily on tab click).
    if (isLive) renderPreview();
  }
  function initMdEditors(root) {
    (root || document).querySelectorAll("[data-md-editor]").forEach(initMdEditor);
  }
  window.tspInitMdEditors = initMdEditors;
  initMdEditors();

  // Reading lightbox: click on [data-reading-lightbox] shows the rendered
  // body content in a paper-styled modal, with a Download PDF button.
  (function initReadingLightbox(){
    const modal = document.getElementById("reading-lightbox");
    if (!modal) return;
    const titleEl = modal.querySelector("[data-reading-lightbox-title]");
    const docTitleEl = modal.querySelector("[data-reading-lightbox-doc-title]");
    const contentEl = modal.querySelector("[data-reading-lightbox-content]");
    const pdfLink = modal.querySelector("[data-reading-lightbox-pdf]");
    // Delegated, so links a live search brings in work too.
    document.addEventListener("click", e => {
        const link = e.target.closest && e.target.closest("[data-reading-lightbox]");
        if (!link) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
        e.preventDefault();
        const rid = link.dataset.readingLightbox;
        const title = link.dataset.readingTitle || "";
        const tmpl = document.querySelector(`template[data-reading-content="${rid}"]`);
        titleEl.textContent = title;
        docTitleEl.textContent = title;
        contentEl.innerHTML = tmpl ? tmpl.innerHTML : "";
        pdfLink.href = "/tspro/readings/" + rid + "/pdf";
        openModal("reading-lightbox");
        const body = modal.querySelector(".reading-lightbox-body");
        if (body) body.scrollTop = 0;
    });
  })();

  // About pane: animated pale sine-wave gradient behind the grey hero.
  // Wave parameters and gradient angle are randomized on each page load, so
  // every visit gets a different polished look. Runs only while the canvas
  // is visible via IntersectionObserver so the settings modal being closed
  // or the About tab being inactive stops the loop.
  (function initAboutHeroBg(){
    const canvas = document.querySelector(".about-hero-bg");
    if (!canvas) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const W = 200, H = 120;
    canvas.width = W; canvas.height = H;
    const cctx = canvas.getContext("2d");

    const hslToRgb = (h, s, l) => {
      h /= 360;
      const a = s * Math.min(l, 1 - l);
      const f = n => {
        const k = (n + h * 12) % 12;
        const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(v * 255);
      };
      return [f(0), f(8), f(4)];
    };

    // Triadic palette: a random base hue plus the two other vertices of an
    // equilateral triangle on the color wheel (120° apart). Small per-stop
    // jitter and a randomized starting vertex keep runs visually distinct.
    const rand = (a, b) => a + Math.random() * (b - a);
    const hueBase = Math.random() * 360;
    const triad = [0, 120, 240].map(d => (hueBase + d + rand(-8, 8) + 360) % 360);
    // Shuffle so the ordering across the gradient axis varies.
    for (let i = triad.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [triad[i], triad[j]] = [triad[j], triad[i]];
    }
    const rgb = triad.map(h => hslToRgb(h, 1, 0.55));
    const n = rgb.length;

    // Randomize wave shape + drift speed (both slow).
    const freq1 = rand(2.2, 4.0);
    const freq2 = rand(5.0, 8.0);
    const amp1 = rand(0.16, 0.28);
    const amp2 = rand(0.06, 0.12);
    const phaseSpeed1 = rand(0.05, 0.12) * (Math.random() < 0.5 ? 1 : -1);
    const phaseSpeed2 = rand(0.06, 0.14) * (Math.random() < 0.5 ? 1 : -1);
    const phaseOffset = Math.random() * Math.PI * 2;

    // Randomize the gradient angle by rotating the sampling coordinates.
    const rotRad = Math.random() * Math.PI * 2;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const maxDim = Math.max(W, H);

    const img = cctx.createImageData(W, H);
    const d = img.data;
    let running = false;
    let start = 0;
    function frame(now){
      if (!running) return;
      const t = (now - start) / 1000;
      const p1 = t * phaseSpeed1;
      const p2 = t * phaseSpeed2 + phaseOffset;
      for (let y = 0; y < H; y++){
        for (let x = 0; x < W; x++){
          // Rotate coordinates around center so the gradient axis is at rotRad.
          const cx = x - W / 2, cy = y - H / 2;
          const rx = cx * cosR - cy * sinR;
          const ry = cx * sinR + cy * cosR;
          const nx = (rx + maxDim / 2) / maxDim;
          const ny = (ry + maxDim / 2) / maxDim;
          const wave = Math.sin(nx * freq1 + p1) * amp1
                     + Math.sin(nx * freq2 + p2 + 1.3) * amp2;
          let tt = ny + wave;
          if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
          const p = tt * (n - 1);
          const i = Math.floor(p);
          const f = p - i;
          const u = f * f * (3 - 2 * f);
          const a = rgb[i], b = rgb[Math.min(n - 1, i + 1)];
          const idx = (y * W + x) * 4;
          d[idx]   = a[0] + (b[0] - a[0]) * u;
          d[idx+1] = a[1] + (b[1] - a[1]) * u;
          d[idx+2] = a[2] + (b[2] - a[2]) * u;
          d[idx+3] = 255;
        }
      }
      cctx.putImageData(img, 0, 0);
      requestAnimationFrame(frame);
    }
    function startLoop(){
      if (running) return;
      running = true; start = performance.now();
      requestAnimationFrame(frame);
    }
    function stopLoop(){ running = false; }
    const io = new IntersectionObserver(entries => {
      const visible = entries[0] && entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      if (visible) startLoop(); else stopLoop();
    }, { threshold: 0.01 });
    io.observe(canvas);
  })();

  // Access Requests → Create User: open Settings → Users with the iframe
  // reloaded against query params so the Create User form arrives
  // pre-populated. Email seeds username + email; name and phone are
  // forwarded so the admin doesn't have to retype anything from the
  // request row they just clicked.
  onEachPage(() => document.querySelectorAll("[data-create-user-from-request]").forEach(btn => {
    if (btn._tspCreateUser) return;
    btn._tspCreateUser = true;
    btn.addEventListener("click", () => {
      const email = btn.dataset.email || "";
      const name = btn.dataset.name || "";
      const phone = btn.dataset.phone || "";
      const rid = btn.dataset.rid || "";
      const modal = document.getElementById("settings-modal");
      if (!modal) return;
      openModal("settings-modal");
      const usersTab = modal.querySelector('[data-tab="users"]');
      if (usersTab) usersTab.click();
      const pane = modal.querySelector('[data-pane="users"]');
      const iframe = pane && pane.querySelector("iframe.settings-frame");
      if (iframe) {
        const base = iframe.dataset.src || "";
        const params = new URLSearchParams();
        if (email) params.set("prefill", email);
        if (name)  params.set("prefill_name", name);
        if (phone) params.set("prefill_phone", phone);
        // Carry the originating access-request id so creating the user
        // auto-marks that request handled + archived (see auth.users_create).
        if (rid)   params.set("prefill_rid", rid);
        params.set("_", Date.now().toString());
        const sep = base.includes("?") ? "&" : "?";
        iframe.src = base + sep + params.toString();
      }
    });
  }));
  onEachPage(() => document.querySelectorAll(".modal").forEach(m => {
    m.querySelectorAll("[data-close]").forEach(el => {
      // A dialog inside another (the Sidebar section's link dialogs sit
      // in Settings) closes only itself.
      if (el._tspCloser || el.closest(".modal") !== m) return;
      el._tspCloser = true;
      el.addEventListener("click", () => closeModal(m));
    });
  }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal.open").forEach(closeModal);
    }
  });

  // Day-of-week checkbox toggles enable/disable of the row's fields
  function wireDayRow(row) {
    const toggle = row.querySelector(".day-toggle");
    const fields = row.querySelectorAll(".day-field, .day-hidden");
    if (!toggle) return;
    const sync = () => {
      fields.forEach(f => { f.disabled = !toggle.checked; });
      row.classList.toggle("on", toggle.checked);
    };
    toggle.addEventListener("change", sync);
    sync();
  }
  document.querySelectorAll(".day-row").forEach(wireDayRow);

  // Meeting form: type radios show/hide Zoom fields; location select toggles custom input
  document.querySelectorAll("[data-meeting-form]").forEach(form => {
    const radios = form.querySelectorAll(".meeting-type-radio");
    const applyType = () => {
      const val = (form.querySelector(".meeting-type-radio:checked") || {}).value || "in_person";
      form.classList.toggle("hide-zoom", val === "in_person");
    };
    radios.forEach(r => r.addEventListener("change", applyType));
    applyType();

    const sel = form.querySelector(".location-select");
    const wrap = form.querySelector(".location-custom-wrap");
    if (sel && wrap) {
      const syncLoc = () => { wrap.style.display = sel.value === "__custom__" ? "" : "none"; };
      sel.addEventListener("change", syncLoc);
      syncLoc();
    }
  });

  // Settings modal tabs (lazy-load iframes)
  const settingsModal = document.getElementById("settings-modal");
  if (settingsModal) {
    const tabs = settingsModal.querySelectorAll(".settings-tab");
    const panes = settingsModal.querySelectorAll(".settings-pane");
    const paneTitle = settingsModal.querySelector(".settings-pane-title");
    const activate = name => {
      tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        if (on && paneTitle) {
          const label = t.querySelector(".settings-tab-label");
          paneTitle.textContent = (label || t).textContent.trim();
        }
      });
      // Phones show the nav and the pane as two screens; picking a
      // section moves to its pane.
      settingsModal.classList.add("settings-show-pane");
      panes.forEach(p => {
        const on = p.dataset.pane === name;
        p.classList.toggle("active", on);
        if (on) {
          const f = p.querySelector("iframe.settings-frame");
          if (f && !f.src && f.dataset.src) f.src = f.dataset.src;
        }
      });
      // Re-probe the email relay each time the Email tab is opened so its
      // status pill reflects the live connection, not just the value
      // persisted at last test. No-op unless relay creds are configured.
      if (name === "email") {
        const rc = settingsModal.querySelector(".relay-conn");
        if (rc && rc._relayRefresh) rc._relayRefresh();
      }
    };
    tabs.forEach(t => t.addEventListener("click", () => activate(t.dataset.tab)));
    const backBtn = settingsModal.querySelector(".settings-back");
    if (backBtn) backBtn.addEventListener("click", () => {
      settingsModal.classList.remove("settings-show-pane");
      const cur = settingsModal.querySelector(".settings-tab.active");
      if (cur) cur.focus();
    });
    // A plain open lands on the section list on phones. Deep links
    // (data-settings-tab) click a tab right after opening, which moves
    // to that pane again.
    new MutationObserver(() => {
      // Guarded: classList.remove writes the attribute even when the
      // class is absent, which would re-trigger this observer forever.
      if (!settingsModal.classList.contains("open")
          && settingsModal.classList.contains("settings-show-pane")) {
        settingsModal.classList.remove("settings-show-pane");
      }
    }).observe(settingsModal, { attributes: true, attributeFilter: ["class"] });

    // Submit top-level settings forms via fetch so the page never reloads.
    // Forms inside iframes are untouched (they already reload only the iframe).
    // Any form marked data-no-ajax="1" still performs a normal submit (e.g. data import).
    function showSettingsToast(msg, kind){
      let t = document.getElementById("settings-toast");
      if (!t){
        t = document.createElement("div");
        t.id = "settings-toast";
        t.className = "settings-toast";
        settingsModal.querySelector(".modal-panel").appendChild(t);
      }
      t.className = "settings-toast flash-" + (kind || "success") + " show";
      t.textContent = msg;
      clearTimeout(showSettingsToast._h);
      showSettingsToast._h = setTimeout(() => t.classList.remove("show"), 2200);
    }
    // Exposed so the frontend-sync wizard (a separate IIFE) can surface its
    // own AJAX results in the same in-modal toast.
    window.showSettingsToast = showSettingsToast;

    // Shared AJAX submit for any settings-modal form. Returns a promise
    // that resolves with the parsed JSON body (if any) on success and
    // rejects on HTTP/network failure. Always dispatches `settings:saved`
    // on success so downstream listeners (sidebar refresh) fire whether
    // the form was committed via Enter, the per-form submit handler, or
    // the batched save bar.
    async function submitSettingsForm(f) {
      const r = await fetch(f.action, {
        method: (f.method || "POST").toUpperCase(),
        body: new FormData(f),
        headers: { "X-Requested-With": "fetch" },
        credentials: "same-origin",
        redirect: "follow",
      });
      // The save went through and sent us back to this page, which the
      // change has closed (a module turned off while on one of its
      // pages): it saved, and the page to leave for is the dashboard.
      if (!r.ok && r.redirected && r.status === 404) {
        f.dispatchEvent(new CustomEvent("settings:saved", { bubbles: true, detail: null }));
        return { pageGone: true };
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      let data = null;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try { data = await r.json(); } catch (_) {}
      }
      f.dispatchEvent(new CustomEvent("settings:saved", { bubbles: true, detail: data }));
      return data;
    }


    // Email transport toggle: the <select> is the SMTP-vs-relay switch.
    // Show only the field group for the chosen transport — relay fields
    // in relay mode, the SMTP host/port/auth fields otherwise.
    (function () {
      const sel = document.getElementById("mailTransportSelect");
      const relayFields = document.getElementById("relayFields");
      const smtpFields = document.getElementById("smtpFields");
      if (!sel || (!relayFields && !smtpFields)) return;
      const sync = () => {
        const relay = sel.value === "relay";
        if (relayFields) relayFields.style.display = relay ? "" : "none";
        if (smtpFields) smtpFields.style.display = relay ? "none" : "";
      };
      sel.addEventListener("change", sync);
      sync();
    })();

    // API-relay connection test + status pill (Settings → Domain / Email).
    // The pill server-renders the last persisted /api/health outcome; this
    // wires the "Test connection" button (validates the URL + key typed
    // above, before they're saved) and a re-probe whenever the tab opens.
    (function () {
      const wrap = settingsModal.querySelector(".relay-conn");
      if (!wrap) return;
      const pill = wrap.querySelector("[data-relay-pill]");
      const detail = wrap.querySelector("[data-relay-detail]");
      const btn = wrap.querySelector("[data-relay-test]");
      const testUrl = wrap.dataset.relayTestUrl;
      const relayForm = settingsModal.querySelector('form[action$="/settings/email-save"]');

      function setPill(state, label) {
        pill.className = "backup-status-pill " + (
          state === "ok" ? "backup-status-ok" :
          state === "fail" ? "backup-status-failed" :
          state === "checking" ? "backup-status-running" :
          "backup-status-never_run");
        pill.textContent = label;
      }
      function setDetail(msg, isFail) {
        if (msg) {
          detail.textContent = msg;
          detail.hidden = false;
          detail.classList.toggle("relay-conn-fail", !!isFail);
        } else {
          detail.hidden = true;
          detail.textContent = "";
          detail.classList.remove("relay-conn-fail");
        }
      }

      // POST the relay form (relay_url + relay_api_key, falling back to the
      // stored key when the write-only field is blank) to /settings/relay-test
      // and reflect the result in the pill. `silent` keeps the prior detail
      // text visible while a background re-probe is in flight.
      async function runTest(opts) {
        opts = opts || {};
        setPill("checking", "Checking…");
        if (!opts.silent) setDetail("", false);
        if (btn) btn.disabled = true;
        try {
          const fd = relayForm ? new FormData(relayForm) : new FormData();
          const r = await fetch(testUrl, {
            method: "POST", body: fd,
            headers: { "X-Requested-With": "fetch" },
            credentials: "same-origin",
          });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const data = await r.json();
          if (data.ok) {
            setPill("ok", "Connected");
            setDetail(data.message || "", false);
          } else {
            setPill("fail", "Not connected");
            setDetail(data.message || "Connection failed.", true);
          }
        } catch (err) {
          setPill("fail", "Not connected");
          setDetail("Couldn't run the test: " + err.message, true);
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      if (btn) btn.addEventListener("click", () => runTest());

      // Called by the tab-activate hook. Only re-probes when relay mode is
      // the active transport and credentials are stored — otherwise the pill
      // (hidden in SMTP mode, or meaningless with no creds) is left as-is.
      wrap._relayRefresh = function () {
        const sel = document.getElementById("mailTransportSelect");
        const relayActive = !sel || sel.value === "relay";
        if (relayActive && wrap.dataset.relayConfigured === "1") runTest({ silent: true });
      };
    })();

    settingsModal.querySelectorAll("form").forEach(f => {
      if (f.closest(".settings-frame")) return;
      if (f.dataset.noAjax === "1") return;
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = f.querySelector('button[type="submit"], button:not([type])');
        const orig = btn ? btn.textContent : null;
        // Test buttons (e.g. Send Test on Email) hijack the verb so the
        // disabled-state text reads "Sending…" instead of "Saving…" — a
        // misleading label was a major part of the original bug report.
        const isTestForm = f.matches("[data-email-test-form]");
        const busyLabel = isTestForm ? "Sending…" : "Saving…";
        if (btn){ btn.disabled = true; btn.textContent = busyLabel; }
        try {
          // For the email-test form: if the SMTP settings form sitting
          // above it is dirty (admin typed new SMTP host/port/etc. but
          // hasn't clicked the yellow Save bar yet), persist that first
          // so the test runs against the values the admin just typed
          // rather than stale DB state. Without this the test can
          // succeed-or-fail based on settings the admin hasn't saved.
          if (isTestForm) {
            const smtpForm = settingsModal.querySelector(
              'form[action$="/settings/email-save"]'
            );
            if (smtpForm && sbDirty.has(smtpForm)) {
              await submitSettingsForm(smtpForm);
              sbDirty.delete(smtpForm);
              sbShow();
            }
          }
          const data = await submitSettingsForm(f);
          // A module turned off: its pages are gone, so the page behind
          // Settings becomes the Dashboard, which is always on (fetched
          // afresh if it is already there, so its widgets follow).
          // Settings stays open.
          // Otherwise, if the endpoint returned JSON with a `message`,
          // surface it verbatim. ``ok: false`` is treated as a soft
          // error and shown via the danger toast even though the HTTP
          // status is 200 — matches the pattern used by email-test,
          // where an SMTP failure isn't an HTTP failure.
          const moduleOff = f.matches(".special-page-toggle-form") &&
            !f.querySelector('input[type="checkbox"]:checked');
          if (moduleOff || (data && data.pageGone)) {
            showSettingsToast("Saved");
            swapPage("/tspro/").catch(() => { window.location.href = "/tspro/"; });
          } else if (data && typeof data.message === "string") {
            showSettingsToast(data.message, data.ok === false ? "danger" : "success");
          } else {
            showSettingsToast(isTestForm ? "Test sent" : "Saved");
          }
          // Saved from a dialog: back to the section it opened from.
          const dlg = f.closest(".modal");
          if (dlg && dlg !== settingsModal && !(data && data.pageGone)) {
            if (/-new-/.test(dlg.id)) f.reset();
            if (dlg.classList.contains("open")) closeModal(dlg);
          }
          // A module turned on: this page stays; the pinned buttons
          // (Web, View) follow.
          if (f.matches(".special-page-toggle-form") && !moduleOff && !(data && data.pageGone)) {
            fetchPage(window.location.href).then(({ doc }) => swapPinned(doc)).catch(() => {});
          }
        } catch (err) {
          showSettingsToast(
            (isTestForm ? "Test failed: " : "Save failed: ") + err.message,
            "danger"
          );
        } finally {
          if (btn){ btn.disabled = false; btn.textContent = orig; }
        }
      });
    });

    // Rewire any element that does `this.form.submit()` on change — that
    // bypasses the submit event so our AJAX handler never sees it (the
    // modal would close on the resulting full-page redirect). Replace
    // with requestSubmit() which DOES fire the event. Covers both
    // checkboxes (toggles) and selects (the per-module role picker).
    settingsModal.querySelectorAll(
      'input[onchange*="this.form.submit()"], select[onchange*="this.form.submit()"]'
    ).forEach(el => {
      el.setAttribute("onchange", "this.form.requestSubmit()");
    });

    // Live sidebar refresh — forms tagged with data-refresh-sidebar
    // (module toggles, role pickers, and the sidebar-order form) trigger
    // a fetch of the rendered nav fragment after a successful save and
    // swap it into the live sidebar. The Sidebar tab's manual reorder
    // list is also swapped so its Main/Admin partitioning mirrors the
    // current role-based section placement. No reload, modal stays open.
    let _sidebarRefreshing = false;
    settingsModal.addEventListener("settings:saved", e => {
      const f = e.target;
      if (!f || !(f instanceof HTMLFormElement)) return;
      if (f.dataset.refreshSidebar !== "1") return;
      if (_sidebarRefreshing) return;
      _sidebarRefreshing = true;
      // Skip refreshing the manual section if THIS form IS the
      // sidebar-order form — replacing the very form the admin just
      // submitted would obliterate any in-flight UI state. The role-
      // based section placement still applies on the next load.
      const refreshManual = f.id !== "sidebar-order-form";
      Promise.all([
        fetch("/tspro/_sidebar/nav", {
          credentials: "same-origin",
          headers: { "X-Requested-With": "fetch" },
        }).then(r => r.ok ? r.text() : Promise.reject(r))
          .then(html => {
            const nav = document.getElementById("sidebar-nav");
            const scroller = document.getElementById("sidebar-scroll") || nav;
            // Replacing the nav's content can move the sidebar's
            // scroll — keep the admin's place across the refresh (see
            // initSidebarScrollMemory).
            const keepScroll = scroller ? scroller.scrollTop : 0;
            if (nav) nav.innerHTML = html;
            applySidebarSectionState();
            if (scroller) {
              const max = scroller.scrollHeight - scroller.clientHeight;
              if (max > 0) scroller.scrollTop = Math.min(keepScroll, max);
            }
          }),
        refreshManual ? fetch("/tspro/_sidebar/order-manual", {
          credentials: "same-origin",
          headers: { "X-Requested-With": "fetch" },
        }).then(r => r.ok ? r.text() : null)
          .then(html => {
            if (!html) return;
            const wrap = document.querySelector("[data-sidebar-manual]");
            if (wrap) wrap.innerHTML = html;
          }) : Promise.resolve(),
      ]).catch(() => {}).finally(() => { _sidebarRefreshing = false; });
    });

    // ── Settings save bar ────────────────────────────────────────────
    // One yellow bar pinned to the bottom-left of the modal panel that
    // batches saves across every tracked top-level form. Shows when any
    // tracked form becomes dirty; click commits each dirty form via the
    // shared AJAX path. Per-form save buttons are hidden so the bar is
    // the canonical commit affordance — auto-submit toggles (modules
    // pane, role pickers) keep their existing on-change behavior since
    // they never had a save button to replace.
    //
    // sbDirty / sbBar / sbShow are declared at the settings-modal scope
    // so the per-form submit handler above (which runs for the email
    // Send Test button) can peek into the dirty set and auto-save the
    // SMTP form before issuing the test request.
    const sbBar = document.getElementById("settings-save-bar");
    const sbBtn = document.getElementById("settings-save-bar-btn");
    const sbMsg = sbBar && sbBar.querySelector(".fe-save-bar-msg");
    const sbDirty = new Set();
    // Panes that are pages of their own (Users, Global, in iframes)
    // report unsaved changes here through window.tspSettingsHost, with
    // the function that saves them: "<pane>:<key>" → save().
    const sbPanes = new Map();
    const sbCount = () => sbDirty.size + sbPanes.size;
    function sbHide() {
      if (sbBar) { sbBar.hidden = true; sbBar.classList.remove("is-leaving"); }
    }
    function sbShow() {
      if (!sbBar || !sbMsg || !sbBtn) return;
      if (!sbCount()) { sbHide(); return; }
      sbBar.hidden = false;
      sbBar.classList.remove("is-leaving");
      sbMsg.textContent = sbCount() > 1
        ? "Unsaved changes (" + sbCount() + " sections)"
        : "Unsaved changes";
      sbBtn.disabled = false;
      sbBtn.textContent = "Save";
    }
    // The bar is the foot of the section list; on a phone, where the
    // list and the open pane are separate screens, it moves to the pane.
    if (sbBar && window.matchMedia) {
      const phone = window.matchMedia("(max-width: 720px)");
      const nav = settingsModal.querySelector(".settings-nav");
      const main = settingsModal.querySelector(".settings-main");
      const place = () => { const to = phone.matches ? main : nav; if (to && sbBar.parentElement !== to) to.appendChild(sbBar); };
      place();
      if (phone.addEventListener) phone.addEventListener("change", place);
    }
    window.tspSettingsHost = {
      dirty(pane, key, on, save) {
        const id = pane + ":" + key;
        if (on) sbPanes.set(id, save); else sbPanes.delete(id);
        sbShow();
      },
    };
    if (sbBar && sbBtn) {

      function sbTrackable(form) {
        if (form.closest(".settings-frame")) return false;
        // A dialog's form (a page slid in over the section) keeps its
        // own button.
        if (form.closest(".modal") !== settingsModal) return false;
        if (form.dataset.noAjax === "1") return false;
        if (form.dataset.savebarSkip === "1") return false;
        if (form.querySelector('[onchange*="this.form."]')) return false;
        // Require an explicit primary save button — that's what the bar
        // replaces. Forms without one (e.g. the "Send Test" email action
        // which uses `.btn`, not `.btn-primary`) keep their own button.
        return !!form.querySelector("button.btn-primary");
      }

      function sbHideAfterSave() {
        sbMsg.textContent = "Saved";
        sbBar.classList.add("is-leaving");
        setTimeout(() => {
          sbBar.style.width = "";  // release the locked width set on click
          sbDirty.clear();
          if (!sbCount()) sbHide(); else sbShow();
        }, 320);
      }

      settingsModal.querySelectorAll("form").forEach(f => {
        if (!sbTrackable(f)) return;
        // Hide the form's primary save button (and its wrapper, if any)
        // so the bar becomes the only commit path. Wrappers handled:
        // .form-actions (most forms), .branding-save-row (logo form).
        // Bare buttons (e.g. inside .sidebar-order-head) hide themselves.
        f.querySelectorAll("button.btn-primary").forEach(b => {
          const wrap = b.closest(".form-actions, .branding-save-row");
          (wrap || b).classList.add("savebar-hidden");
        });
        const onChange = () => { sbDirty.add(f); sbShow(); };
        f.addEventListener("input", onChange);
        f.addEventListener("change", onChange);
      });

      sbBtn.addEventListener("click", async () => {
        if (!sbCount()) { sbHide(); return; }
        // Pin the bar's current pixel width before changing the message
        // so it doesn't shrink leftward as text moves "Unsaved changes
        // (N sections)" → "Saving…" → "Saved". Width is released in
        // sbHideAfterSave so the next dirty cycle re-measures.
        sbBar.style.width = sbBar.offsetWidth + "px";
        sbBtn.disabled = true;
        sbBtn.textContent = "Saving…";
        sbMsg.textContent = "Saving…";
        const forms = [...sbDirty];
        const panes = [...sbPanes.entries()];
        const failures = [];
        for (const f of forms) {
          try { await submitSettingsForm(f); }
          catch (err) { failures.push(err); }
        }
        // Each pane saves its own changes in the background; one that
        // saves drops out of the list (it reports again if edited).
        for (const [id, save] of panes) {
          try { await save(); sbPanes.delete(id); }
          catch (err) { failures.push(err); }
        }
        if (!failures.length) {
          sbHideAfterSave();
        } else {
          sbBtn.disabled = false;
          sbBtn.textContent = "Save";
          sbMsg.textContent = failures.length === 1
            ? "Save failed — try again"
            : "Some changes failed — try again";
        }
      });
    }
  }

  // Library picker in meeting modal: toggle expansion and granular readings
  document.querySelectorAll(".library-row").forEach(row => {
    const include = row.querySelector(".library-include");
    const detail = row.querySelector(".library-detail");
    const readings = row.querySelector(".library-readings");
    const syncInclude = () => { if (detail) detail.style.display = include.checked ? "" : "none"; };
    const modeSwitch = row.querySelector(".library-mode-switch");
    const syncMode = () => {
      const granular = !!(modeSwitch && modeSwitch.checked);
      if (readings) readings.style.display = granular ? "" : "none";
      row.classList.toggle("is-granular", granular);
    };
    if (include) include.addEventListener("change", syncInclude);
    if (modeSwitch) modeSwitch.addEventListener("change", syncMode);
    syncInclude(); syncMode();
  });

  // Location type toggle (show/hide address fields)
  document.querySelectorAll("[data-location-form]").forEach(form => {
    const fields = form.querySelector(".loc-in-person-fields");
    if (!fields) return;
    form.querySelectorAll(".loc-type-radio").forEach(r => {
      r.addEventListener("change", () => {
        const val = form.querySelector(".loc-type-radio:checked")?.value;
        fields.style.display = val === "online" ? "none" : "";
      });
    });
  });

  // File add inline accordion (animated)
  document.querySelectorAll("[data-file-add-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = document.getElementById(btn.dataset.fileAddToggle);
      if (!f) return;
      f.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-file-add-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = document.getElementById(btn.dataset.fileAddCancel);
      if (f) { f.classList.add("collapsed"); f.reset(); }
    });
  });

  // Per-row "Public" toggle in the meeting modal's file list. Posts to a
  // JSON endpoint so the row can flip without closing the modal.
  document.querySelectorAll("[data-file-public-toggle]").forEach(input => {
    input.addEventListener("change", async () => {
      const fid = input.dataset.filePublicToggle;
      const fd = new FormData();
      fd.append("public_visible", input.checked ? "1" : "0");
      input.disabled = true;
      try {
        const r = await fetch(`/tspro/files/${fid}/public-toggle`, {
          method: "POST", body: fd, credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!r.ok) throw new Error("toggle failed");
        const data = await r.json();
        // Reflect the canonical value the server saw.
        input.checked = !!data.public_visible;
      } catch (err) {
        // Roll back the visual state if the request failed.
        input.checked = !input.checked;
        console.error(err);
      } finally {
        input.disabled = false;
      }
    });
  });

  // Media library: upload input. Delegated, so the list brought back in
  // from a file's own view (tspSwapPage) still uploads.
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "media-upload-input") return;
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/tspro/files/upload", {
          method: "POST", body: fd, credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) throw new Error("upload failed");
        const data = await res.json();
        if (window.parent !== window && window.parent.postMessage) {
          // inside picker: hand the item to parent
          window.parent.postMessage({ type: "media-uploaded", item: data.item }, window.location.origin);
        }
      } catch (err) { alert("Upload failed: " + err.message); }
    }
    // refresh listing
    window.location.reload();
  });

  // Media library: rename. Delegated, so rows a live search swaps in
  // still answer.
  document.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest(".media-rename");
    if (!btn || btn.disabled) return;
    (async () => {
      // In a file's own view the menu is in the top bar.
      const row = btn.closest("[data-media-id]") || document.querySelector("[data-fb-file]");
      const id = row?.dataset.mediaId;
      const current = row?.dataset.original || "";
      const next = prompt("Rename file:", current);
      if (!next || next === current) return;
      const fd = new FormData();
      fd.append("name", next);
      const res = await fetch(`/tspro/files/${id}/rename`, {
        method: "POST", body: fd, credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        // The view shows the name in its heading and path: bring it in again.
        if (row.matches("[data-fb-file]")) { window.tspSwapPage(location.href, { push: false }); return; }
        row.dataset.original = data.original_filename;
        const nameEl = row.querySelector(".media-name, strong");
        if (nameEl) { nameEl.textContent = data.original_filename; nameEl.title = data.original_filename; }
      }
    })();
  });

  // Media library: select (inside picker iframe). Two modes:
  //   • Single-select (default) — clicking the per-item Select
  //     button immediately posts ``media-selected`` to the parent.
  //     Used by the meeting + library file pickers + the featured-
  //     image picker.
  //   • Multi-select (``picker_multi`` flag from the route) — the
  //     Select button instead toggles the item into a running
  //     ``selected`` set; a fixed bottom bar shows the count and a
  //     "Done — add N" button posts a single ``media-selected-batch``
  //     message back with the array of items.
  //
  // ``closest('[data-media-id]')`` walks UP to either the card
  // article OR the table row, fixing the prior bug where only card
  // view worked — list view rows are <tr>, not .media-card.
  // The picked set outlives the page: a file's own view and the list
  // swap in and out (tspSwapPage), so the bar and buttons are looked up
  // each time and marked again on every page.
  (function () {
    function bar() { return document.querySelector('[data-media-multi-bar]'); }
    var selected = new Map();  // id → {id, stored_filename, original_filename}
    function captureItem(host) {
      return {
        id: host.dataset.mediaId,
        stored_filename: host.dataset.stored,
        original_filename: host.dataset.original,
      };
    }
    function refreshBar() {
      var multiBar = bar();
      if (!multiBar) return;
      var count = selected.size;
      multiBar.hidden = count === 0;
      var countEl = multiBar.querySelector('[data-multi-count]');
      if (countEl) countEl.textContent = count;
      var doneBtn = multiBar.querySelector('[data-multi-done]');
      if (doneBtn) doneBtn.textContent = count === 1
        ? 'Add 1 item'
        : ('Add ' + count + ' items');
    }
    function mark(host, on) {
      host.classList.toggle('is-selected', on);
      // Update the Select button label so the operator can see
      // what state each row is in at a glance.
      host.querySelectorAll('.media-select').forEach(function (btn) {
        btn.textContent = on ? 'Selected ✓' : 'Select';
      });
    }
    function setSelected(host, on) {
      if (!host) return;
      var id = host.dataset.mediaId;
      if (!id) return;
      if (on) selected.set(id, captureItem(host));
      else selected.delete(id);
      mark(host, on);
      refreshBar();
    }
    function markAll() {
      selected.forEach(function (_v, id) {
        var host = document.querySelector('[data-media-id="' + id + '"]');
        if (host) mark(host, true);
      });
      refreshBar();
    }
    // Delegated, so rows a live search swaps in still answer.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.media-select');
      if (btn) {
        var host = btn.closest('[data-media-id]');
        if (!host) return;
        if (bar()) {
          var id = host.dataset.mediaId;
          setSelected(host, !selected.has(id));
          return;
        }
        // Single-select: post + done.
        var payload = { type: 'media-selected', item: captureItem(host) };
        if (window.parent !== window) {
          window.parent.postMessage(payload, window.location.origin);
        }
        return;
      }
      if (e.target.closest && e.target.closest('[data-multi-done]')) {
        if (!selected.size) return;
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: 'media-selected-batch', items: Array.from(selected.values()) },
            window.location.origin
          );
        }
        return;
      }
      if (e.target.closest && e.target.closest('[data-multi-clear]')) {
        selected.forEach(function (_v, id) {
          var host = document.querySelector('[data-media-id="' + id + '"]');
          if (host) mark(host, false);
        });
        selected.clear();
        refreshBar();
      }
    });
    document.addEventListener('live:updated', markAll);
    onEachPage(markAll);
  })();

  // A file's own view (media_file.html): Left and Right step to the
  // previous and next file and Esc goes back to the files, by clicking
  // the view's own links. Back in the list, the file just seen is
  // scrolled into view.
  (function () {
    let lastFile = null;
    const KEYS = { ArrowLeft: "[data-fb-prev]", ArrowRight: "[data-fb-next]", Escape: "[data-fb-back]" };
    document.addEventListener("keydown", e => {
      const sel = KEYS[e.key];
      if (!sel || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!document.querySelector("[data-fb-file]") || document.querySelector(".modal.open, .row-menu.is-open")) return;
      // Esc on a zoomed image fits it again (image_lightbox.js) first.
      if (e.key === "Escape" && document.querySelector("[data-zoom-stage].is-zoomed")) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(t.tagName))) return;
      const link = document.querySelector(sel);
      if (!link) return;
      e.preventDefault();
      link.click();
    });
    onEachPage(() => {
      const view = document.querySelector("[data-fb-file]");
      if (view) { lastFile = view.dataset.mediaId; return; }
      if (!lastFile) return;
      const host = document.querySelector('.fb [data-media-id="' + CSS.escape(lastFile) + '"]');
      lastFile = null;
      if (host) host.scrollIntoView({ block: "center" });
    });
  })();

  // Auto-dismiss flash toasts after 3s
  document.querySelectorAll(".flashes .flash").forEach(el => {
    setTimeout(() => {
      el.classList.add("flash-hide");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }, 3000);
  });

  // WordPress importer iframe → parent: close the wizard modal. Sent
  // from inside the iframe by the wizard's Cancel / Close buttons so
  // the user doesn't have to mouse to the modal's X.
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "wp-import-close") return;
    const m = document.getElementById("wp-import-modal");
    if (m && m.classList.contains("open")) closeModal(m);
  });

  // Off-site backup wizard iframe → parent: close the wizard modal.
  // When the backups admin modal is also open, just reload its iframe
  // so the new target appears without disturbing the settings overlay
  // underneath. Otherwise (wizard was opened straight from the Data
  // tab), reload the page so the Data-tab chip refreshes.
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "backups-modal-close") return;
    const wiz = document.getElementById("backup-wizard-modal");
    if (wiz && wiz.classList.contains("open")) closeModal(wiz);
    if (!e.data.reload) return;
    const adm = document.getElementById("backups-modal");
    if (adm && adm.classList.contains("open")) {
      const f = document.getElementById("backups-frame");
      if (f && f.dataset.src) {
        f.src = "about:blank";
        setTimeout(() => { f.src = f.dataset.src; }, 50);
      }
    } else {
      setTimeout(() => { window.location.reload(); }, 50);
    }
  });

  // Backups admin iframe → parent: open the wizard modal alongside.
  // Lets "Add backup target" inside the admin modal stack a wizard
  // modal on top without losing the admin context behind it.
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "backups-open-wizard") return;
    openModal("backup-wizard-modal");
  });

  // Backups admin iframe → parent: close the admin modal. Sent by the
  // "← Back to Settings" button inside the embedded list so the X
  // isn't the only escape hatch.
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "backups-admin-close") return;
    const m = document.getElementById("backups-modal");
    if (m && m.classList.contains("open")) closeModal(m);
  });

  // Trusted-Servants CSV-import wizard iframe → parent: close the
  // wizard modal. When the import committed rows, reload the parent
  // (the /email-list list) so the new entries appear without
  // a manual refresh. Cancel sends reload=false so the list isn't
  // disturbed for a no-op cancel.
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "ts-import-modal-close") return;
    const m = document.getElementById("ts-import-wizard-modal");
    if (m && m.classList.contains("open")) closeModal(m);
    if (e.data.reload) {
      setTimeout(() => { window.location.reload(); }, 50);
    }
  });

  // Live-update sidebar custom nav links when edited in Settings
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "nav-links-updated") return;
    const container = document.getElementById("sidebar-custom-nav");
    const divider = document.getElementById("sidebar-custom-nav-divider");
    if (!container) return;
    container.innerHTML = "";
    const links = e.data.links || [];
    links.forEach(n => {
      const a = document.createElement("a");
      a.href = n.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("data-nav-custom", "");
      a.textContent = n.title + " ↗";
      container.appendChild(a);
    });
    if (divider) divider.hidden = links.length === 0;
  });

  // Media picker modal: open on [data-media-picker] buttons
  let currentMediaTarget = null;
  // Mode flag — when a picker is opened for the post-edit featured
  // image, the postMessage handler routes the picked item into the
  // dedicated preview area instead of the generic "set media_id on
  // form" path used by the library + meeting modals.
  let currentMediaMode = null;
  // Point the shared picker frame at the File Browser for this kind of
  // pick: single or multi-select, and any file or images only (the
  // sidebar's Kind filter, which the writer can still change). Reopened
  // for the same kind of pick, it keeps its place (search, page).
  function pointPicker(multi, kind) {
    const frame = document.getElementById("media-picker-frame");
    if (!frame) return;
    const key = (multi ? "multi" : "single") + ":" + (kind || "any");
    if (frame.dataset.pickerKey === key && frame.getAttribute("src") !== "about:blank") return;
    frame.dataset.pickerKey = key;
    frame.src = "/tspro/files?picker=1&embed=1" + (multi ? "&multi=1" : "") + (kind ? "&kind=" + kind : "");
  }

  document.querySelectorAll("[data-media-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentMediaTarget = btn.dataset.mediaPicker;
      currentMediaMode = "form";
      pointPicker(false, "");
      openModal("media-picker-modal");
    });
  });
  // Post edit page — Featured image "Choose from File Browser" button.
  // Opens the same media picker modal but routes the result into the
  // post-edit form's hidden media-id input + preview swap instead of
  // the generic form/media_id handler used by library + meeting forms.
  document.querySelectorAll("[data-post-featured-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentMediaTarget = null;
      currentMediaMode = "post-featured";
      pointPicker(false, "img");
      openModal("media-picker-modal");
    });
  });

  // Post edit page — Gallery "Choose from File Browser" button. Same
  // picker modal as the featured-image one but the selected item
  // gets appended to the gallery list (up to the 10-image cap)
  // instead of replacing a single field. The picked id rides via a
  // hidden ``gallery_media_id`` input which the server save handler
  // resolves to a MediaItem.stored_filename.
  document.querySelectorAll("[data-post-gallery-picker]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentMediaTarget = null;
      currentMediaMode = "post-gallery";
      // Multi-select, so several images come back in one go: the
      // iframe shows a bottom bar and Select toggles items into a set,
      // handed back as one batch message (handled below).
      pointPicker(true, "img");
      openModal("media-picker-modal");
    });
  });

  // Markdown toolbar "Image" button: the same picker, single-select;
  // the pick is written into the editor as ![name](/pub/file).
  let currentMdTextarea = null;
  window.tspMdPickImage = function (textarea) {
    currentMediaTarget = null;
    currentMediaMode = "md-image";
    currentMdTextarea = textarea;
    pointPicker(false, "img");
    openModal("media-picker-modal");
  };

  // Gallery — per-tile remove buttons + upload tally so the
  // 10-image cap is reflected live. Uploads count as soon as the
  // file picker dialog returns since the form submit hasn't yet
  // happened; admins see the chip increase immediately.
  (function () {
    var section = document.querySelector("[data-post-gallery]");
    if (!section) return;
    var max = parseInt(section.dataset.galleryMax, 10) || 10;
    var list = section.querySelector("[data-gallery-list]");
    var picks = section.querySelector("[data-gallery-picks]");
    var upload = section.querySelector("[data-gallery-upload]");
    var label = section.querySelector("[data-gallery-count-label]");
    function tally() {
      var existing = section.querySelectorAll('input[name="gallery_existing"]').length;
      var picked = section.querySelectorAll('input[name="gallery_media_id"]').length;
      var pending = upload && upload.files ? upload.files.length : 0;
      return Math.min(existing + picked + pending, max);
    }
    function refresh() {
      var total = tally();
      section.dataset.galleryCount = String(total);
      if (label) label.textContent = "(" + total + " / " + max + ")";
    }
    function canAdd(n) { return (tally() + (n || 0)) <= max; }
    section.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-gallery-remove]");
      if (!btn) return;
      var tile = btn.closest("[data-gallery-tile]");
      if (!tile) return;
      tile.remove();
      refresh();
    });
    if (upload) {
      upload.addEventListener("change", function () {
        // If the multi-file selection would exceed the cap, drop the
        // overflow by re-creating a DataTransfer with the allowed
        // slice. Older browsers without DataTransfer just truncate
        // server-side.
        if (!upload.files) return;
        var allowed = max - tally() + upload.files.length;
        if (allowed < upload.files.length) {
          try {
            var dt = new DataTransfer();
            for (var i = 0; i < allowed && i < upload.files.length; i++) {
              dt.items.add(upload.files[i]);
            }
            upload.files = dt.files;
            (window.tspShowToast || (() => {}))(
              "Gallery is capped at " + max + " images — extras dropped.",
              "warn"
            );
          } catch (_) { /* DataTransfer unsupported — server enforces */ }
        }
        refresh();
      });
    }
    // Expose a setter the postMessage handler below uses when a
    // gallery picker selection comes back from the File Browser.
    section.__galleryAddPicked = function (item) {
      if (!canAdd(1)) {
        (window.tspShowToast || (() => {}))(
          "Gallery is full (" + max + " images).", "warn");
        return;
      }
      if (!picks) return;
      var hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "gallery_media_id";
      hidden.value = item.id;
      picks.appendChild(hidden);
      // Optimistic preview tile so the operator sees their pick
      // without saving + reloading. The tile holds the
      // ``gallery_media_id`` hidden input (moved from the hidden
      // ``picks`` container so a per-tile remove takes the pick
      // out of the form too). The save handler resolves the
      // media-id into a stored filename and appends it to the
      // gallery list.
      if (list && item.original_filename) {
        var li = document.createElement("li");
        li.className = "post-gallery-tile";
        li.setAttribute("data-gallery-tile", "");
        var img = document.createElement("img");
        img.src = "/pub/" + encodeURIComponent(item.original_filename);
        img.alt = "Gallery image";
        img.loading = "lazy";
        li.appendChild(img);
        li.appendChild(hidden);  // re-parent the media-id input
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn-sm btn-danger post-gallery-remove";
        rm.setAttribute("data-gallery-remove", "");
        rm.title = "Remove from gallery";
        rm.textContent = "×";
        li.appendChild(rm);
        list.appendChild(li);
      }
      refresh();
    };
    // The post editor's save bar rebuilds the tile list from the
    // server's response after an AJAX save; it needs the tally re-run
    // so the "(n / 6)" chip matches the tiles that are actually there.
    section.__galleryRefresh = refresh;
    refresh();
  })();
  // Featured image — instant local preview when a file is chosen via
  // the upload input, so the admin sees their pick without saving
  // first. Mirrors the preview swap the File Browser path already
  // does below.
  (function () {
    var section = document.querySelector("[data-post-featured-image]");
    if (!section) return;
    var upload = section.querySelector("[data-featured-upload]");
    var img = section.querySelector("[data-featured-preview-img]");
    if (!upload || !img) return;
    var lastUrl = null;
    upload.addEventListener("change", function () {
      var file = upload.files && upload.files[0];
      if (!file) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(file);
      img.src = lastUrl;
      img.hidden = false;
      var empty = section.querySelector("[data-featured-preview-empty]");
      if (empty) empty.hidden = true;
      // An upload beats a prior File-Browser pick at save time —
      // drop the stale pick + label so the UI matches what will save.
      var hidden = section.querySelector("[data-featured-media-id]");
      if (hidden) hidden.value = "";
      var label = section.querySelector("[data-featured-picked-label]");
      if (label) { label.hidden = true; label.textContent = ""; }
      // Uncheck "Remove current image" — choosing a new file means
      // swap, not clear.
      var clear = section.querySelector('input[name="clear_featured_image"]');
      if (clear) clear.checked = false;
      img.classList.remove("is-cleared");
    });
    // "Remove current image" — hide the thumbnail the moment the box
    // is armed so the admin sees the removal before saving. Unchecking
    // (or picking a new upload above) brings it back. The actual delete
    // still happens server-side on save via clear_featured_image.
    var clearBox = section.querySelector('input[name="clear_featured_image"]');
    if (clearBox) {
      clearBox.addEventListener("change", function () {
        img.classList.toggle("is-cleared", clearBox.checked);
      });
    }
  })();
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    // Multi-select batch — the picker iframe sends one message
    // with the full items array on Done. Route it through the same
    // gallery handler one item at a time so the existing per-pick
    // optimistic-tile logic + count cap still apply.
    if (e.data && e.data.type === "media-picker-close") {
      const mb = document.getElementById("media-picker-modal");
      if (mb) closeModal(mb);
      return;
    }
    if (e.data && e.data.type === "media-selected-batch") {
      if (currentMediaMode === "post-gallery") {
        const gallerySection = document.querySelector("[data-post-gallery]");
        const adder = gallerySection && gallerySection.__galleryAddPicked;
        (e.data.items || []).forEach((item) => {
          if (typeof adder === "function") adder(item);
        });
      }
      const mb = document.getElementById("media-picker-modal");
      if (mb) closeModal(mb);
      currentMediaMode = null;
      return;
    }
    if (!e.data || e.data.type !== "media-selected") return;
    const item = e.data.item;
    if (currentMediaMode === "md-image") {
      const ta = currentMdTextarea;
      currentMdTextarea = null;
      const mi = document.getElementById("media-picker-modal");
      if (mi) closeModal(mi);
      currentMediaMode = null;
      if (ta && item && item.original_filename && window.tspMdInsertImage) {
        window.tspMdInsertImage(ta, item.original_filename);
      }
      return;
    }
    if (currentMediaMode === "post-gallery") {
      const gallerySection = document.querySelector("[data-post-gallery]");
      if (gallerySection && typeof gallerySection.__galleryAddPicked === "function") {
        gallerySection.__galleryAddPicked(item);
      }
      const mg = document.getElementById("media-picker-modal");
      if (mg) closeModal(mg);
      currentMediaMode = null;
      return;
    }
    if (currentMediaMode === "post-featured") {
      const section = document.querySelector("[data-post-featured-image]");
      if (section) {
        const hidden = section.querySelector("[data-featured-media-id]");
        if (hidden) {
          hidden.value = item.id;
          // A script-set value fires nothing; tell the page's save bar.
          hidden.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Clear any pending file-upload selection so the browser-picked
        // item is what actually gets saved (uploads otherwise win on
        // the server side).
        const upload = section.querySelector("[data-featured-upload]");
        if (upload) upload.value = "";
        // Uncheck the "Remove current image" box if it's there — the
        // admin clearly wants to swap, not clear.
        const clear = section.querySelector('input[name="clear_featured_image"]');
        if (clear) clear.checked = false;
        // Swap the preview image. Public file route resolves by
        // original filename, which the picker hands us in the
        // postMessage payload.
        const img = section.querySelector("[data-featured-preview-img]");
        if (img && item.original_filename) {
          img.src = "/pub/" + encodeURIComponent(item.original_filename);
          img.hidden = false;
        }
        const empty = section.querySelector("[data-featured-preview-empty]");
        if (empty) empty.hidden = true;
        const label = section.querySelector("[data-featured-picked-label]");
        if (label) {
          label.textContent = "Selected from File Browser: " + item.original_filename;
          label.hidden = false;
        }
      }
      const m = document.getElementById("media-picker-modal");
      if (m) closeModal(m);
      currentMediaMode = null;
      return;
    }
    if (!currentMediaTarget) return;
    const form = document.getElementById(currentMediaTarget);
    if (!form) return;
    let hidden = form.querySelector('input[name="media_id"]');
    if (!hidden) {
      hidden = document.createElement("input");
      hidden.type = "hidden"; hidden.name = "media_id";
      form.appendChild(hidden);
    }
    hidden.value = item.id;
    let label = form.querySelector(".media-picked-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "media-picked-label muted small";
      form.insertBefore(label, form.querySelector(".form-actions") || null);
    }
    label.textContent = "Selected from library: " + item.original_filename;
    // An editor's save bar listens for edits.
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    // Close modal
    const m = document.getElementById("media-picker-modal");
    if (m) closeModal(m);
    currentMediaMode = null;
  });

  // Drag-and-drop reorder for .file-list-sortable
  // Works with <ul><li>, <tbody><tr>, or any parent with direct-child
  // [data-item-id] elements. Detects horizontal vs. vertical layout
  // automatically so it can handle flex-row column editors.
  //
  // Save firing: the order snapshot from dragstart is compared against the
  // post-drag order on `dragend` and the save (or `reorder-changed` event)
  // fires whenever they differ. This used to live in `drop`, but `drop`
  // only fires when the user releases ON a valid drop target — releasing
  // in the gap between rows or just outside the list silently dropped the
  // reorder and snapped the row back on next refresh.
  function initSortable(list) {
    if (list.__tspSortableInit) return;
    list.__tspSortableInit = true;
    const url = list.dataset.reorderUrl;
    const category = list.dataset.reorderCategory || null;
    let dragging = null;
    let originalOrder = null;
    const isHorizontal = () => {
      const first = list.querySelector(":scope > [data-item-id]");
      const second = first?.nextElementSibling;
      if (!first || !second) return false;
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return Math.abs(b.left - a.left) > Math.abs(b.top - a.top);
    };
    const clearMarkers = () => {
      list.querySelectorAll(":scope > .drop-before, :scope > .drop-after, :scope > .drag-over")
        .forEach(x => x.classList.remove("drop-before", "drop-after", "drag-over"));
    };
    const snapshotOrder = () => Array.from(list.querySelectorAll(":scope > [data-item-id]"))
      .map(x => x.dataset.itemId);
    const orderEqual = (a, b) => a && b && a.length === b.length &&
      a.every((id, i) => id === b[i]);

    async function commitImmediate(order) {
      const payload = category ? { order, category } : { order };
      const label = list.dataset.reorderToast;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showToast(label ? (label + " saved") : "Order saved");
          // A live preview on the page shows the new order.
          document.dispatchEvent(new Event("lp:refresh"));
        }
        else showToast("Save failed — retry", "error");
      } catch (_) {
        showToast("Save failed — retry", "error");
      }
    }

    const bindItem = (item) => {
      if (item.__tspSortableBound) return;
      item.__tspSortableBound = true;
      // Toggle `draggable` synchronously on mousedown so the browser only
      // starts a drag when the press began on the handle. Leaving the
      // row permanently draggable=true breaks text-input behaviour
      // inside the row — the browser races the input for the mouse,
      // which prevents click-to-position-cursor, double/triple-click
      // selection, and drag-to-select within fields. dragstart
      // preventDefault runs too late: native text selection has already
      // been cancelled by the time it fires. Setting draggable=false at
      // the start gives inputs first claim on the cursor; we flip it
      // true only when the press lands on the .drag-handle, which is
      // before the browser decides whether a drag should happen.
      item.draggable = false;
      let mousedownOnHandle = false;
      item.addEventListener("mousedown", (e) => {
        const onHandle = !!e.target.closest?.(".drag-handle");
        mousedownOnHandle = onHandle;
        item.draggable = onHandle;
      });
      // mouseup clears the flag in case the user pressed the handle but
      // released without dragging — keeps the next click on a sibling
      // input from being intercepted.
      item.addEventListener("mouseup", () => { item.draggable = false; });
      item.addEventListener("dragstart", (e) => {
        if (!mousedownOnHandle) {
          e.preventDefault();
          return;
        }
        dragging = item;
        item.classList.add("dragging");
        originalOrder = snapshotOrder();
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", item.dataset.itemId || ""); } catch (_) {}
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        item.draggable = false;
        clearMarkers();
        const currentOrder = snapshotOrder();
        const changed = originalOrder && !orderEqual(originalOrder, currentOrder);
        dragging = null;
        mousedownOnHandle = false;
        const wasOriginal = originalOrder;
        originalOrder = null;
        if (!changed || !url) return;
        if (list.dataset.reorderManual === "1") {
          list.dispatchEvent(new CustomEvent("reorder-changed", { bubbles: true }));
        } else {
          commitImmediate(currentOrder);
        }
      });
      item.addEventListener("dragover", (e) => {
        if (!dragging || dragging === item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = item.getBoundingClientRect();
        const after = isHorizontal()
          ? (e.clientX - rect.left) > rect.width / 2
          : (e.clientY - rect.top) > rect.height / 2;
        // Tighten the drop indicator: show an inserting line on the
        // exact edge of the target instead of a full-row tint, so the
        // user can see precisely where the row will land.
        clearMarkers();
        item.classList.add(after ? "drop-after" : "drop-before");
        if (after) item.parentNode.insertBefore(dragging, item.nextSibling);
        else item.parentNode.insertBefore(dragging, item);
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drop-before", "drop-after", "drag-over");
      });
      // `drop` is intentionally a no-op for the reorder save path — `dragend`
      // is the canonical commit point because it always fires regardless of
      // whether the cursor was over a valid target on release.
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        clearMarkers();
      });
    };
    list.__tspBindItem = bindItem;
    list.querySelectorAll(":scope > [draggable='true'][data-item-id]").forEach(bindItem);
  }
  document.querySelectorAll(".file-list-sortable").forEach(initSortable);
  window.tspInitSortable = initSortable;

  // Minimal toast helper — one element reused for every save.
  function ensureToastHost() {
    let host = document.getElementById("tsp-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "tsp-toast-host";
      host.className = "tsp-toast-host";
      document.body.appendChild(host);
    }
    return host;
  }
  function showToast(msg, kind) {
    const host = ensureToastHost();
    const el = document.createElement("div");
    el.className = "tsp-toast" + (kind === "error" ? " tsp-toast-error" : "");
    el.textContent = msg;
    host.appendChild(el);
    // Trigger transition next frame.
    requestAnimationFrame(() => el.classList.add("tsp-toast-in"));
    setTimeout(() => {
      el.classList.remove("tsp-toast-in");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
      // Fallback cleanup in case transitionend doesn't fire.
      setTimeout(() => el.remove(), 500);
    }, 1600);
  }
  // Expose for manual "Save order" button and other callers.
  window.tspShowToast = showToast;

  // Manual "Save order" buttons for data-reorder-manual sortables.
  document.querySelectorAll("[data-save-reorder-for]").forEach(btn => {
    const sel = btn.dataset.saveReorderFor;
    const list = document.querySelector(sel);
    if (!list) return;
    btn.dataset.labelIdle = btn.textContent.trim();
    list.addEventListener("reorder-changed", () => {
      btn.classList.add("is-dirty");
      btn.textContent = "Save order *";
    });
    btn.addEventListener("click", async () => {
      const url = list.dataset.reorderUrl;
      if (!url) return;
      const order = Array.from(list.querySelectorAll(":scope > [data-item-id]"))
        .map(x => x.dataset.itemId);
      const category = list.dataset.reorderCategory || null;
      const payload = category ? { order, category } : { order };
      btn.disabled = true;
      const orig = btn.dataset.labelIdle;
      btn.textContent = "Saving…";
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Save failed");
        btn.textContent = "Saved ✓";
        btn.classList.remove("is-dirty");
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1400);
      } catch (_) {
        btn.textContent = "Failed — retry";
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
      }
    });
  });

  // Yellow save-bar wireup for any data-reorder-manual + data-reorder-savebar
  // sortable list. Matches the Web Frontend admin's save-bar pattern: drag a
  // row, the bar fades in at the bottom-left of the viewport, click Save to
  // commit the order and reload so the rendered list matches the saved one.
  // Used on the library detail page so admins reorder readings without
  // each individual drop firing a save.
  (function reorderSaveBar(){
    const bar = document.getElementById('library-reorder-save-bar');
    const btn = document.getElementById('library-reorder-save-btn');
    if (!bar || !btn) return;
    const msg = bar.querySelector('.fe-save-bar-msg');
    const idle = btn.textContent;
    let dirtyList = null;

    // Delegated: the list may arrive later, from a live search.
    document.addEventListener('reorder-changed', (e) => {
      const list = e.target.closest && e.target.closest('[data-reorder-savebar="1"]');
      if (!list) return;
      dirtyList = list;
      bar.hidden = false;
      bar.classList.remove('is-leaving');
      if (msg) msg.textContent = 'Unsaved changes';
      btn.disabled = false;
      btn.textContent = idle;
    });

    btn.addEventListener('click', async () => {
      if (!dirtyList) { bar.hidden = true; return; }
      const url = dirtyList.dataset.reorderUrl;
      if (!url) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const order = Array.from(dirtyList.querySelectorAll(':scope > [data-item-id]'))
        .map(x => x.dataset.itemId);
      const category = dirtyList.dataset.reorderCategory || null;
      const payload = category ? { order, category } : { order };
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error('save failed: ' + r.status);
        if (msg) msg.textContent = 'Saved';
        const reload = () => window.location.reload();
        bar.addEventListener('animationend', reload, { once: true });
        bar.classList.add('is-leaving');
        setTimeout(reload, 360);
      } catch (_) {
        btn.disabled = false;
        btn.textContent = idle;
        if (msg) msg.textContent = 'Save failed — try again';
      }
    });
  })();

  // Inline save for per-file edit accordions (keep modal open)
  document.querySelectorAll("form[data-inline-save]").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("Save failed (" + res.status + ")");
        // Update the displayed title with the new value
        const li = form.closest("li");
        const fileMain = li?.querySelector(".file-main");
        const newTitle = form.querySelector('input[name="title"]')?.value?.trim();
        const titleLink = fileMain?.querySelector("a");
        if (titleLink && newTitle) titleLink.textContent = newTitle;
        // Update displayed filename if a new file was uploaded or removed
        const fileInput = form.querySelector('input[type="file"][name="file"]');
        const removeFile = form.querySelector('input[name="remove_file"]:checked');
        let subtitle = fileMain?.querySelector(".muted.smaller");
        if (fileInput?.files?.length) {
          const name = fileInput.files[0].name;
          if (!subtitle) {
            subtitle = document.createElement("div");
            subtitle.className = "muted smaller";
            fileMain.appendChild(subtitle);
          }
          subtitle.textContent = name;
        } else if (removeFile && subtitle) {
          subtitle.remove();
        }
        // Close the host modal if the form lives inside one (per-row
        // edit forms on the library detail page now open as popups
        // rather than inline accordions). Falls back to the legacy
        // ``collapsed`` toggle for callers still using the accordion
        // pattern (e.g. the meeting modal's per-file edit forms).
        const hostModal = form.closest(".modal");
        if (hostModal) {
          hostModal.classList.remove("open");
          hostModal.setAttribute("aria-hidden", "true");
          document.body.style.overflow = "";
        } else {
          form.classList.add("collapsed");
        }
        // Show an inline success message in the row that auto-fades
        let msg = li.querySelector(".inline-save-msg");
        if (!msg) {
          msg = document.createElement("div");
          msg.className = "inline-save-msg flash flash-success";
          li.querySelector(".file-main").appendChild(msg);
        }
        msg.textContent = "Saved";
        clearTimeout(msg._t);
        msg._t = setTimeout(() => msg.remove(), 2500);
      } catch (err) {
        alert(err.message || "Save failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });

  // Password reveal toggles (auto-hide after 10s)
  document.querySelectorAll(".reveal-btn").forEach(btn => {
    let hideTimer = null;
    const hide = (pwEl) => {
      pwEl.textContent = "••••••••";
      pwEl.dataset.revealed = "0";
      btn.textContent = "Reveal";
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    };
    btn.addEventListener("click", async () => {
      const pwEl = btn.parentElement.querySelector(".pw-field");
      if (!pwEl) return;
      if (pwEl.dataset.revealed === "1") { hide(pwEl); return; }
      let value = pwEl.dataset.pw || pwEl.dataset.copy;
      if (!value && btn.dataset.revealUrl) {
        try {
          const r = await fetch(btn.dataset.revealUrl);
          const j = await r.json();
          value = j.password || "";
          pwEl.dataset.copy = value;
        } catch (e) { return; }
      }
      if (!value) return;
      pwEl.textContent = value;
      pwEl.dataset.revealed = "1";
      btn.textContent = "Hide";
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => hide(pwEl), 10000);
    });
  });

  // Click-to-copy buttons. Delegated, so chips on a page swapped in
  // (a File Browser file's path) copy too. copyText (below) falls back
  // to a hidden textarea where the clipboard API is off (plain http).
  document.addEventListener("click", async e => {
    const btn = e.target.closest && e.target.closest(".copy-btn");
    if (!btn) return;
    try {
      let value = btn.dataset.copy;
      if (!value && btn.dataset.copyUrl) {
        const r = await fetch(btn.dataset.copyUrl);
        const j = await r.json();
        value = j.password || j.value || "";
      }
      if (!value || !(await copyText(value))) throw new Error("not copied");
      const original = btn.dataset.tip;
      btn.dataset.tip = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => { btn.dataset.tip = original; btn.classList.remove("copied"); }, 1200);
    } catch (err) { btn.dataset.tip = "Copy failed"; }
  });

  // Reveal Zoom password
  document.querySelectorAll("[data-reveal]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.reveal;
      const target = document.getElementById("pw-" + id);
      if (target.textContent) { target.textContent = ""; btn.textContent = "Show password"; return; }
      try {
        const url = btn.dataset.revealUrl || `/zoom-accounts/${id}/reveal`;
        const r = await fetch(url);
        const j = await r.json();
        target.textContent = j.password;
        btn.textContent = "Hide";
      } catch (e) { target.textContent = "(error)"; }
    });
  });

  // ── Guided Zoom launcher wizard ──────────────────────────────────
  // Stepped modal that walks a host through sign-in → OTP → start.
  // Lives on the backend meeting detail page (online/hybrid meetings).
  (function initZoomGuide() {
    const modal = document.getElementById("zoom-guide-modal");
    if (!modal) return;
    const panels = Array.from(modal.querySelectorAll(".zg-panel"));
    const dots = Array.from(modal.querySelectorAll("[data-step-dot]"));
    const total = panels.length;
    const backBtn = modal.querySelector("[data-zg-back]");
    const nextBtn = modal.querySelector("[data-zg-next]");
    const skipBtn = modal.querySelector("[data-zg-skip]");
    const finishBtn = modal.querySelector("[data-zg-finish]");
    const body = modal.querySelector(".zoom-guide-body");
    let step = 1;

    function render() {
      panels.forEach(p => p.classList.toggle("is-active", +p.dataset.step === step));
      dots.forEach(d => {
        const n = +d.dataset.stepDot;
        d.classList.toggle("is-active", n === step);
        d.classList.toggle("is-done", n < step);
      });
      backBtn.hidden = step === 1;
      nextBtn.hidden = step === total;
      finishBtn.hidden = step !== total;
      // "Skip" only on the optional OTP step (step 2).
      skipBtn.hidden = step !== 2;
      if (body) body.scrollTop = 0;
    }
    function go(n) { step = Math.min(total, Math.max(1, n)); render(); }

    nextBtn && nextBtn.addEventListener("click", () => go(step + 1));
    skipBtn && skipBtn.addEventListener("click", () => go(step + 1));
    backBtn && backBtn.addEventListener("click", () => go(step - 1));
    finishBtn && finishBtn.addEventListener("click", () => closeModal(modal));

    // Clickable stepper circles — jump straight to any step. Keyboard
    // accessible (Enter/Space) since the <li>s carry role="button".
    dots.forEach(d => {
      const target = +d.dataset.stepDot;
      d.addEventListener("click", () => go(target));
      d.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(target); }
      });
    });

    // Reset to step 1 each time the launcher is opened.
    document.querySelectorAll('[data-open-modal="zoom-guide-modal"]').forEach(btn =>
      btn.addEventListener("click", () => { go(1); }));

    // OTP "Retrieve code" buttons (in the wizard AND inline on the meeting
    // detail page) are wired globally by initOtpFetch() below.

    // ── Webmail fallback disclosure (step 2) ──
    const wmWrap = modal.querySelector("[data-zg-webmail]");
    const wmToggle = modal.querySelector("[data-zg-webmail-toggle]");
    if (wmWrap && wmToggle) {
      wmToggle.addEventListener("click", () => {
        const open = wmWrap.classList.toggle("is-open");
        wmToggle.setAttribute("aria-expanded", String(open));
      });
    }

    render();
  })();

  // ── Image lightbox ([data-lightbox] → #zoom-guide-lightbox) ──────
  (function initGuideLightbox() {
    const box = document.getElementById("zoom-guide-lightbox");
    if (!box) return;
    const img = box.querySelector(".zg-lightbox-img");
    const cap = box.querySelector(".zg-lightbox-caption");
    document.querySelectorAll("[data-lightbox]").forEach(el => {
      el.addEventListener("click", () => {
        if (img) { img.src = el.getAttribute("src"); img.alt = el.getAttribute("alt") || ""; }
        if (cap) cap.textContent = el.dataset.lightboxCaption || "";
        openModal("zoom-guide-lightbox");
      });
    });
  })();

  // ── OTP "Retrieve code" buttons ([data-otp-fetch]) ───────────────
  // Shared by the guided wizard (Step 2) and the inline OTP Email section
  // on the meeting detail page, so seasoned users can pull the latest
  // code without opening the wizard. Each button lives inside a
  // [data-otp-widget] that carries the fetch URL and the result/error/
  // code/meta targets.
  (function initOtpFetch() {
    // Zoom is slow to send the passcode email, so a single check usually
    // comes up empty. On click we poll the inbox for up to 3 minutes,
    // every few seconds, until a code lands — showing a spinner the whole
    // time. We stop early on a configuration/login error (retryable:false)
    // since retrying that would never succeed.
    const POLL_MS = 6000;          // gap between checks
    const DEADLINE_MS = 3 * 60 * 1000;  // give up after 3 minutes
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll("[data-otp-fetch]").forEach(btn => {
      const scope = btn.closest("[data-otp-widget]") || document;
      const fetchUrl = scope.dataset ? scope.dataset.fetchUrl : null;
      if (!fetchUrl) return;
      const result = scope.querySelector("[data-otp-result]");
      const codeEl = scope.querySelector("[data-otp-code]");
      const metaEl = scope.querySelector("[data-otp-meta]");
      const errEl = scope.querySelector("[data-otp-error]");
      const countdownEl = scope.querySelector("[data-otp-countdown]");
      const label = btn.querySelector("[data-otp-fetch-label], .zg-otp-fetch-label");
      const setLabel = (t) => { if (label) label.textContent = t; };

      // Live "expires in m:ss" countdown — Zoom codes die 10 minutes after
      // the email is sent, so the server hands us the seconds remaining at
      // fetch time and we tick it down once a second.
      let countdownTimer = null;
      const stopCountdown = () => {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      };
      function startCountdown(seconds) {
        stopCountdown();
        if (!countdownEl || typeof seconds !== "number") return;
        let remaining = Math.max(0, Math.floor(seconds));
        const tick = () => {
          if (remaining <= 0) {
            countdownEl.innerHTML = "<strong>Code expired</strong> — request a new code from Zoom.";
            countdownEl.classList.add("is-expired");
            countdownEl.classList.remove("is-warning");
            countdownEl.hidden = false;
            stopCountdown();
            return;
          }
          const m = Math.floor(remaining / 60);
          const s = String(remaining % 60).padStart(2, "0");
          countdownEl.innerHTML = `Expires in <strong>${m}:${s}</strong>`;
          countdownEl.classList.toggle("is-warning", remaining <= 60);
          countdownEl.classList.remove("is-expired");
          countdownEl.hidden = false;
          remaining -= 1;
        };
        tick();
        countdownTimer = setInterval(tick, 1000);
      }
      // Spinner is injected (not in markup) so all three call sites get it
      // without template edits; CSS reveals it while .is-loading is set.
      const spinner = document.createElement("span");
      spinner.className = "otp-spinner";
      spinner.setAttribute("aria-hidden", "true");
      btn.insertBefore(spinner, btn.firstChild);

      let polling = false;
      btn.addEventListener("click", async () => {
        if (polling) return;
        polling = true;
        const deadline = Date.now() + DEADLINE_MS;
        btn.disabled = true;
        btn.classList.add("is-loading");
        if (result) result.hidden = true;
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        if (countdownEl) { stopCountdown(); countdownEl.hidden = true; }
        setLabel("Checking for code…");
        try {
          while (true) {
            let j;
            try {
              const r = await fetch(fetchUrl, { headers: { "X-Requested-With": "fetch" } });
              j = await r.json();
            } catch (e) {
              j = { ok: false, retryable: true, error: "Network error" };
            }
            if (j.ok) {
              if (codeEl) { codeEl.textContent = j.code; codeEl.dataset.copy = j.code; }
              if (metaEl) metaEl.innerHTML = `Received <strong>${j.sent_at}</strong> · ${j.age_label}`;
              if (result) result.hidden = false;
              startCountdown(j.expires_in_seconds);
              setLabel("Retrieve again");
              break;
            }
            // Hard error (no IMAP, bad login) — retrying won't help.
            if (!j.retryable) {
              if (errEl) { errEl.textContent = j.error || "Could not retrieve a code."; errEl.hidden = false; }
              setLabel("Retrieve code");
              break;
            }
            // Retryable: keep checking until the 3-minute deadline.
            if (Date.now() + POLL_MS >= deadline) {
              if (errEl) {
                errEl.textContent = "No code arrived after 3 minutes. Make sure you triggered the Zoom passcode, then try again.";
                errEl.hidden = false;
              }
              setLabel("Retrieve code");
              break;
            }
            await wait(POLL_MS);
          }
        } finally {
          btn.disabled = false;
          btn.classList.remove("is-loading");
          polling = false;
        }
      });
    });
  })();

  // Clampable text with show-more toggle
  document.querySelectorAll("[data-clampable]").forEach(wrap => {
    const body = wrap.querySelector(".clamp-body");
    const btn = wrap.querySelector("[data-clamp-toggle]");
    if (!body || !btn) return;
    const overflows = body.scrollHeight > body.clientHeight + 1;
    if (!overflows) return;
    btn.hidden = false;
    btn.addEventListener("click", () => {
      const expanded = wrap.classList.toggle("expanded");
      btn.textContent = expanded ? "Show less" : "Show more…";
    });
  });

  // Copy-to-clipboard buttons: <button data-copy-url="/pub/..."> or
  // <button data-copy-text="imap.example.com">
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch(e) {}
    document.body.removeChild(ta);
    return ok;
  }
  document.addEventListener("click", e => {
    // data-copy-url copies a full address; data-copy-text, the text as is.
    const btn = e.target.closest("[data-copy-url], [data-copy-text]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const value = btn.hasAttribute("data-copy-text") ? btn.dataset.copyText
      : new URL(btn.dataset.copyUrl, window.location.origin).href;
    copyText(value).then(ok => {
      // Swap only the label, never the button's whole textContent: a
      // copy control inside a row-actions menu is `<svg> + <span>`, and
      // setting textContent on the button would delete the icon and the
      // span for good (the restore below only puts text back). Plain
      // text-only copy buttons have no inner span, so they fall through
      // to the button itself and behave exactly as before.
      const label = btn.querySelector("span") || btn;
      const orig = label.textContent;
      label.textContent = ok ? "Copied!" : "Failed";
      setTimeout(() => { label.textContent = orig; }, 1500);
    });
  });

  // Dashboard reorder. Drag a widget by its head (any spot that isn't a
  // link or button) or by its grip: the card lifts and follows the
  // pointer, a dashed placeholder holds its place, and the others slide
  // to make room (the masonry re-packs at once and each card animates
  // from where it was). Dropping glides the card into the placeholder;
  // Escape puts it back. With the grip focused, the arrow keys move the
  // widget one place. The order is saved when it changes.
  onEachPage(function initDashboardReorder(){
    const grid = document.querySelector("[data-dashboard-reorder]");
    if (!grid || grid._tspReorder) return;
    grid._tspReorder = true;
    const url = grid.dataset.orderUrl;
    const HEADS = ".dash-widget-head, .user-log-online > .card-head";
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const widgets = () => Array.from(grid.querySelectorAll(":scope > .dash-widget"));
    const order = () => Array.from(grid.querySelectorAll(":scope > .dash-widget[data-widget-key]")).map(x => x.dataset.widgetKey);
    const relayout = () => { if (typeof window.__tspDashLayout === "function") window.__tspDashLayout(); };

    async function commit(before) {
      const now = order();
      if (!url || now.join("|") === before.join("|")) return;
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
          credentials: "same-origin",
          body: JSON.stringify({ order: now }),
        });
      } catch (_) {}
    }

    // Move cards with a FLIP animation: note where each is, change the
    // DOM, re-pack, then slide each from its old spot to its new one.
    function animated(change, skip) {
      const before = new Map();
      widgets().forEach(el => { if (el !== skip) before.set(el, el.getBoundingClientRect()); });
      change();
      relayout();
      if (reduced) return;
      widgets().forEach(el => {
        const a = before.get(el);
        if (!a || el === skip) return;
        const b = el.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (!dx && !dy) return;
        el.style.transition = "none";
        el.style.transform = "translate(" + dx + "px," + dy + "px)";
        el.getBoundingClientRect();
        el.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "";
        el.addEventListener("transitionend", function done() {
          el.style.transition = ""; el.removeEventListener("transitionend", done);
        });
      });
    }

    let drag = null;
    function begin(e) {
      const w = drag.w, r = w.getBoundingClientRect();
      drag.started = true;
      drag.before = order();
      drag.offX = drag.x0 - r.left;
      drag.offY = drag.y0 - r.top;
      drag.home = w.nextElementSibling;
      const ph = document.createElement("div");
      ph.className = "dash-widget dash-placeholder" + (w.classList.contains("dash-widget-wide") ? " dash-widget-wide" : "");
      ph.style.height = r.height + "px";
      ph.style.gridRowEnd = w.style.gridRowEnd;
      drag.ph = ph;
      grid.insertBefore(ph, w);
      Object.assign(w.style, { position: "fixed", left: r.left + "px", top: r.top + "px",
                               width: r.width + "px", height: r.height + "px", margin: "0" });
      w.classList.add("is-lifted");
      document.body.classList.add("dash-dragging");
      relayout();
    }
    function moveTo(e) {
      const w = drag.w;
      w.style.left = (e.clientX - drag.offX) + "px";
      w.style.top = (e.clientY - drag.offY) + "px";
      // Scroll when near the top or bottom of the window.
      const edge = 60;
      if (e.clientY < edge) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
      // Where the slot goes: the masonry packs widgets into whichever gap
      // fits, so "after the card under the pointer" can land in the other
      // column. Instead, try the placeholder at each place in the order
      // (no paint happens in between), keep the one whose slot sits
      // nearest the lifted card, and slide everything there. At most
      // every 90ms, and only once the card has moved a little.
      const now = performance.now();
      const lr = w.getBoundingClientRect();
      const cx = lr.left + lr.width / 2, cy = lr.top + lr.height / 2;
      if (now - (drag.lastTry || 0) < 90 || Math.hypot(cx - (drag.lastX || 0), cy - (drag.lastY || 0)) < 12) return;
      drag.lastTry = now; drag.lastX = cx; drag.lastY = cy;
      const ph = drag.ph;
      const others = widgets().filter(el => el !== ph && el !== w);
      const start = ph.nextElementSibling;
      const dist = () => {
        const r = ph.getBoundingClientRect();
        return Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      };
      let best = start, bestD = dist();
      others.concat([null]).forEach(ref => {
        if (ref === start) return;
        grid.insertBefore(ph, ref);
        const d = dist();
        if (d < bestD - 4) { best = ref; bestD = d; }
      });
      grid.insertBefore(ph, start);
      if (best !== start) animated(() => grid.insertBefore(ph, best), w);
    }
    function settle(cancel) {
      const d = drag; drag = null;
      if (!d || !d.started) return;
      const w = d.w, ph = d.ph;
      if (cancel) {
        animated(() => { if (d.home && d.home.parentElement === grid) grid.insertBefore(ph, d.home); else grid.appendChild(ph); }, w);
      }
      const target = ph.getBoundingClientRect();
      const land = () => {
        w.classList.remove("is-lifted", "is-landing");
        ["position", "left", "top", "width", "height", "margin", "transition"].forEach(k => { w.style[k] = ""; });
        grid.insertBefore(w, ph);
        ph.remove();
        document.body.classList.remove("dash-dragging");
        relayout();
        if (!cancel) commit(d.before);
      };
      if (reduced) { land(); return; }
      w.classList.add("is-landing");
      w.style.transition = "left 180ms ease, top 180ms ease";
      w.style.left = target.left + "px";
      w.style.top = target.top + "px";
      setTimeout(land, 190);
    }

    grid.addEventListener("pointerdown", e => {
      if (e.button !== 0 || drag) return;
      const grip = e.target.closest(".dash-drag-handle");
      const head = e.target.closest(HEADS);
      if (!grip && !head) return;
      // Touch drags only from the grip, so swiping a head still scrolls.
      if (!grip && e.pointerType === "touch") return;
      if (!grip && e.target.closest("a, button, input, select, textarea, label, .heading-help")) return;
      const w = e.target.closest(".dash-widget");
      if (!w || w.parentElement !== grid) return;
      e.preventDefault();
      drag = { w, x0: e.clientX, y0: e.clientY, started: false };
    });
    window.addEventListener("pointermove", e => {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        begin(e);
      }
      moveTo(e);
    });
    window.addEventListener("pointerup", () => settle(false));
    window.addEventListener("pointercancel", () => settle(true));
    window.addEventListener("keydown", e => { if (e.key === "Escape" && drag && drag.started) settle(true); });

    // Keyboard: arrow keys on a grip move its widget one place.
    grid.addEventListener("keydown", e => {
      const grip = e.target.closest(".dash-drag-handle");
      if (!grip) return;
      const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      if (!back && !fwd) return;
      e.preventDefault();
      const w = grip.closest(".dash-widget");
      const before = order();
      const sib = back ? w.previousElementSibling : w.nextElementSibling;
      if (!sib || !sib.classList.contains("dash-widget")) return;
      animated(() => grid.insertBefore(w, back ? sib : sib.nextElementSibling));
      grip.focus();
      commit(before);
    });
  });

  // Dashboard masonry layout. Companion to the CSS-Grid setup in
  // `.dash-grid` (app.css). The grid uses fine 8px row tracks plus
  // `grid-auto-flow: row dense`; here we measure each widget's
  // rendered outer height and assign `grid-row: span N` so the grid
  // engine packs widgets against each other with no awkward gaps
  // when one column's content is much taller than the other's.
  //
  // The vertical visual gap between widgets is folded INTO the span
  // (not implemented as a row-gap) because row-gap would multiply
  // across every fine row track and explode the layout. Instead the
  // span calculation adds `VISUAL_GAP` worth of empty tracks below
  // each widget's content — those tracks remain unfilled because
  // dense auto-flow only back-fills tracks that fit an entire item.
  //
  // Recompute triggers:
  //   * initial load (DOMContentLoaded — this IIFE runs at that point)
  //   * window resize (debounced)
  //   * ResizeObserver on each widget (server-metrics sparkline
  //     redraws change height; currently-online widget grows/shrinks
  //     as users sign in/out; visitor-metrics sparkline animates in)
  //   * after a drag/drop reorder commits (wired in the reorder block
  //     above via window.__tspDashLayout).
  onEachPage(function initDashboardMasonry(){
    const grid = document.querySelector(".dash-grid");
    if (!grid || grid._tspMasonry) return;
    grid._tspMasonry = true;
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      // Single-column layout — CSS handles spacing via normal row-gap.
      // Still expose the layout function so the resize handler can
      // re-enable masonry if the viewport widens past the breakpoint.
    }
    const ROW_HEIGHT = 8;
    const VISUAL_GAP = 16;

    function layout() {
      const single = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
      grid.querySelectorAll(".dash-widget").forEach(w => {
        if (single) { w.style.gridRowEnd = ""; return; }
        // Reset before measuring so a previously-set span from a
        // shorter render doesn't clip the new measurement.
        w.style.gridRowEnd = "";
        const h = w.getBoundingClientRect().height;
        if (!h) return;
        const span = Math.max(1, Math.ceil((h + VISUAL_GAP) / ROW_HEIGHT));
        w.style.gridRowEnd = "span " + span;
      });
    }

    window.__tspDashLayout = layout;
    // First measurement: defer one frame so the browser has applied
    // the initial CSS spans + computed each widget's natural height
    // before we read getBoundingClientRect.
    requestAnimationFrame(layout);
    // Re-run after window.load so late-arriving fonts / images / lazy
    // SVG icons can't leave a widget with a stale-tall span (icon
    // swap can shrink card-head height; we want masonry to repack).
    window.addEventListener("load", () => requestAnimationFrame(layout));

    // Debounced resize.
    let rt = null;
    window.addEventListener("resize", () => {
      if (rt) cancelAnimationFrame(rt);
      rt = requestAnimationFrame(layout);
    });

    // Per-widget ResizeObserver — covers widgets whose content height
    // changes after first render (live polling widgets, image lazy
    // loads, fonts swapping in). Coalesce into one rAF so a burst of
    // observer callbacks doesn't trigger N layouts in one frame.
    if (typeof ResizeObserver !== "undefined") {
      let pending = false;
      const ro = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; layout(); });
      });
      grid.querySelectorAll(".dash-widget").forEach(w => ro.observe(w));
    }
  });

  // Server metrics widget
  onEachPage(function initServerMetrics(){
    const widget = document.getElementById("server-metrics-widget");
    if (!widget || widget._tspMetrics) return;
    widget._tspMetrics = true;
    if (!widget.querySelector(".server-metrics-column")) return;
    const endpoint = widget.dataset.endpoint;
    const MAX_SAMPLES = 60;
    const series = { cpu: [], mem: [], disk: [] };
    const DISK_ALERT_PCT = 85;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#0b5cff";

    function fmtBytes(n) {
      if (!n || n < 0) return "0 B";
      const units = ["B","KB","MB","GB","TB"];
      let i = 0, v = n;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return v.toFixed(v >= 10 ? 0 : 1) + " " + units[i];
    }
    function fmtUptime(sec) {
      if (sec < 60) return sec + "s";
      const days = Math.floor(sec / 86400); sec %= 86400;
      const hours = Math.floor(sec / 3600); sec %= 3600;
      const mins = Math.floor(sec / 60);
      if (days) return days + "d " + hours + "h";
      if (hours) return hours + "h " + mins + "m";
      return mins + "m";
    }

    function drawSpark(canvas, values) {
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || canvas.width;
      const cssH = canvas.clientHeight || canvas.height;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (!values.length) return;
      const n = values.length;
      const step = n > 1 ? cssW / (MAX_SAMPLES - 1) : 0;
      const startX = cssW - (n - 1) * step;
      const y = v => cssH - (Math.max(0, Math.min(100, v)) / 100) * cssH;
      const path = new Path2D();
      path.moveTo(startX, y(values[0]));
      for (let i = 1; i < n; i++) path.lineTo(startX + i * step, y(values[i]));
      const fill = new Path2D();
      fill.moveTo(startX, cssH);
      fill.lineTo(startX, y(values[0]));
      for (let i = 1; i < n; i++) fill.lineTo(startX + i * step, y(values[i]));
      fill.lineTo(startX + (n - 1) * step, cssH);
      fill.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      grad.addColorStop(0, accent + "40");
      grad.addColorStop(1, accent + "00");
      ctx.fillStyle = grad;
      ctx.fill(fill);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }

    function setField(name, value) {
      widget.querySelectorAll('[data-field="' + name + '"]').forEach(el => { el.textContent = value; });
    }

    async function tick() {
      // Replaced along with the page: stop polling for it.
      if (!widget.isConnected) { clearInterval(h); return; }
      try {
        const r = await fetch(endpoint, { credentials: "same-origin", headers: { "X-Requested-With": "fetch" }});
        if (!r.ok) return;
        const d = await r.json();
        series.cpu.push(d.cpu_percent);
        series.mem.push(d.memory_percent);
        series.disk.push(d.disk_percent);
        if (series.cpu.length > MAX_SAMPLES) series.cpu.shift();
        if (series.mem.length > MAX_SAMPLES) series.mem.shift();
        if (series.disk.length > MAX_SAMPLES) series.disk.shift();
        setField("os", d.os + (d.host_mode ? "" : " (container)"));
        setField("cpu_percent", d.cpu_percent.toFixed(0));
        setField("memory_percent", d.memory_percent.toFixed(0));
        setField("memory_detail", fmtBytes(d.memory_used) + " / " + fmtBytes(d.memory_total));
        setField("disk_percent", (d.disk_percent || 0).toFixed(0));
        setField("disk_detail", fmtBytes(d.disk_used) + " / " + fmtBytes(d.disk_total));
        const diskTile = document.getElementById("disk-metric-tile");
        if (diskTile) diskTile.classList.toggle("metric-tile-alert", (d.disk_percent || 0) >= DISK_ALERT_PCT);
        setField("load_1", d.load_avg[0].toFixed(2));
        setField("load_rest", "5m " + d.load_avg[1].toFixed(2) + " · 15m " + d.load_avg[2].toFixed(2));
        setField("uptime", fmtUptime(d.uptime_seconds));
        setField("cpu_count", d.cpu_count + " core" + (d.cpu_count === 1 ? "" : "s") + " · " + d.hostname);
        widget.querySelectorAll(".metric-spark").forEach(c => {
          drawSpark(c, series[c.dataset.series] || []);
        });
      } catch (_) {}
    }

    const h = setInterval(tick, 5000);
    tick();
    window.addEventListener("beforeunload", () => clearInterval(h));
  });

  onEachPage(function initOnlineUsers(){
    const tile = document.getElementById("online-users-tile");
    if (!tile || tile._tspOnline) return;
    tile._tspOnline = true;
    const endpoint = tile.dataset.endpoint;
    const countEl = tile.querySelector('[data-field="online_count"]');
    const labelEl = tile.querySelector('[data-field="online_label"]');

    function render(count, users) {
      if (countEl) countEl.textContent = count;
      if (labelEl) labelEl.textContent = (count === 1 ? "user" : "users") + " · last 5 min";
      tile.title = users.length
        ? users.map(u => u.username + " (" + u.role + ")").join(", ")
        : "No one online right now.";
    }

    async function tick() {
      if (!tile.isConnected) { clearInterval(h); return; }
      try {
        const r = await fetch(endpoint, { credentials: "same-origin", headers: { "X-Requested-With": "fetch" }});
        if (!r.ok) return;
        const d = await r.json();
        render(d.count || 0, d.users || []);
      } catch (_) {}
    }

    const h = setInterval(tick, 30000);
    window.addEventListener("beforeunload", () => clearInterval(h));
  });
})();

// ── LIVE ATTENTION CHIPS ────────────────────────────────────────────────────
// Poll /tspro/_live/counts and reconcile every [data-live-chip] number chip in
// place — sidebar nav badges, the Watchtower quicknav chips, the Notifications
// bell, and the dashboard widget badges — so new access requests / submissions
// / locked accounts surface their counts without a page reload. Chips always
// exist in the DOM (hidden at 0); we only flip the number + the hidden flag,
// never replacing elements, so bound listeners (dashboard drag handles, the
// notifications button's open handler) stay intact.
(function () {
  if (!document.querySelector("[data-live-chip]")) return;
  const POLL_MS = 20000;
  // Ask for the dashboard-only chips (failed backups, forms attention) only
  // while the dashboard grid is on screen, so every other page's poll stays
  // cheap.
  // Checked on every poll: the page behind a modal can become the
  // dashboard (tspSwapPage).
  const endpoint = () => "/tspro/_live/counts" +
    (document.querySelector(".dash-widget[data-widget-key]") ? "?dash=1" : "");

  function setChip(el, n) {
    el.textContent = n;
    el.hidden = !n;
  }
  function apply(counts) {
    if (!counts || typeof counts !== "object") return;
    Object.keys(counts).forEach(key => {
      const n = counts[key] | 0;
      document.querySelectorAll('[data-live-chip="' + key + '"]')
              .forEach(el => setChip(el, n));
    });
    // Group wrappers (the Watchtower quicknav chips) reveal themselves when the
    // sum of their listed keys is non-zero and mirror that total in aria-label.
    document.querySelectorAll("[data-live-chip-group]").forEach(group => {
      const keys = (group.getAttribute("data-live-chip-group") || "")
                     .split(/\s+/).filter(Boolean);
      const total = keys.reduce((s, k) => s + (counts[k] | 0), 0);
      group.hidden = !total;
      group.setAttribute("aria-label",
        total + (total === 1 ? " item" : " items") + " need attention");
    });
  }

  async function tick() {
    if (document.hidden) return;
    try {
      const r = await fetch(endpoint(), {
        credentials: "same-origin",
        headers: { "X-Requested-With": "fetch" },
      });
      if (!r.ok) return;
      apply(await r.json());
    } catch (_) {}
  }

  const h = setInterval(tick, POLL_MS);
  window.addEventListener("beforeunload", () => clearInterval(h));
  // Reconcile the moment a backgrounded tab regains focus, so the operator
  // doesn't wait up to POLL_MS to see counts that changed while they were away.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
})();

// ── MEGA MENU AJAX (ADD BLOCK / ADD COLUMN / DELETE) ────────────────────────
// Keep the admin on the page so in-progress edits aren't lost. The server
// returns rendered HTML for add operations and {ok} for deletes; JS splices
// the DOM directly.
(function () {
  const toast = (msg, kind) => (window.tspShowToast || (() => {}))(msg, kind);

  async function postForm(form, extraHeaders) {
    const r = await fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      headers: Object.assign(
        { "X-Requested-With": "fetch", "Accept": "application/json" },
        extraHeaders || {}
      ),
      body: new FormData(form),
    });
    if (!r.ok) throw new Error("request failed");
    return r.json();
  }

  function htmlToNode(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = (html || "").trim();
    return tmp.firstElementChild;
  }

  // Rebind any .file-list-sortable containers introduced by a newly-added
  // column so drag-and-drop works on their nested items.
  function rebindSortable(root) {
    root.querySelectorAll?.(".file-list-sortable").forEach((list) => {
      if (list.__tspSortableHost) return;
      // Skip — handled by the DOMContentLoaded binder below. But for nodes
      // added after DOMContentLoaded, we simulate the same binding by
      // triggering our sortable init pass on this element.
    });
  }

  // Add block (+ Link / + Title / + Button / + Section)
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.("form[data-add-block-target]");
    if (!form) return;
    e.preventDefault();
    const target = document.querySelector(form.getAttribute("data-add-block-target"));
    if (!target) return;
    const btn = form.querySelector("button");
    if (btn) btn.disabled = true;
    try {
      const data = await postForm(form);
      const node = htmlToNode(data && data.html);
      if (!node) throw new Error("empty html");
      target.appendChild(node);
      if (typeof target.__tspBindItem === "function") target.__tspBindItem(node);
      const menu = form.closest("details");
      if (menu) menu.open = false;
      const empty = target.parentElement && target.parentElement.querySelector(".nav-megacol-empty");
      if (empty) empty.remove();
      // A compact row (fe_rows.js) opens straight to its fields.
      if (window.FeRows && node.hasAttribute("data-ol-row")) { window.FeRows.init(target); window.FeRows.open(node); }
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const labelInput = node.querySelector('input[data-block-field="label"]');
      if (labelInput && !labelInput.disabled && labelInput.offsetParent) { labelInput.focus(); labelInput.select(); }
    } catch (_) {
      toast("Could not add block — retry", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Add column
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.("form[data-add-column-form]");
    if (!form) return;
    e.preventDefault();
    const target = document.querySelector(form.getAttribute("data-target"));
    if (!target) return;
    const btn = form.querySelector("button");
    if (btn) btn.disabled = true;
    try {
      const data = await postForm(form);
      const node = htmlToNode(data && data.html);
      if (!node) throw new Error("empty html");
      target.appendChild(node);
      // Bind drag on the new column itself (sibling of existing columns)
      if (typeof target.__tspBindItem === "function") target.__tspBindItem(node);
      // The new column contains its own .file-list-sortable <ul> for blocks;
      // initialise it so future block adds / drags work.
      if (typeof window.tspInitSortable === "function") {
        node.querySelectorAll(".file-list-sortable").forEach(window.tspInitSortable);
      }
      rebindSortable(node);
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_) {
      toast("Could not add column — retry", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Delete block / delete column (shared)
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.("form[data-delete-block-form], form[data-delete-column-form]");
    if (!form) return;
    e.preventDefault();
    // The existing inline onsubmit="return confirm(...)" was bypassed by our
    // preventDefault; ask here instead.
    const isCol = form.hasAttribute("data-delete-column-form");
    const msg = isCol ? "Delete this column and all its links?" : "Delete this block?";
    if (!window.confirm(msg)) return;
    const targetSel = form.getAttribute("data-target-item");
    const targetNode = targetSel ? document.querySelector(targetSel) : null;
    try {
      const r = await fetch(form.action, {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "fetch", "Accept": "application/json" },
        body: new FormData(form),
      });
      if (!r.ok) throw new Error("delete failed");
      if (targetNode) targetNode.remove();
      toast(isCol ? "Column removed" : "Block removed", "success");
    } catch (_) {
      toast("Could not delete — retry", "error");
    }
  });
})();

// ── MEGA MENU BULK SAVE ─────────────────────────────────────────────────────
// Gather all block inputs inside an editor and POST them as one JSON payload.
// Hooked into the shared `#fe-save-bar` (yellow): editing any field flips
// the bar into "Unsaved changes"; clicking Save runs collectBlocks() and
// POSTs to the editor's `data-bulk-save-url`. The standard form-saver
// also wires the same button — we intercept in the capture phase via
// `bar.dataset.megamenuDirty` so bulk-save fires instead of (and
// stopPropagation prevents) the form-saver's hide-empty-bar fallback.
(function () {
  function collectBlocks(editor) {
    const out = [];
    editor.querySelectorAll("li.nav-megalink[data-item-id]").forEach((li) => {
      const id = li.getAttribute("data-item-id");
      const kind = li.getAttribute("data-block-kind") || "link";
      const block = { id, kind };
      li.querySelectorAll("[data-block-field]").forEach((el) => {
        const name = el.getAttribute("data-block-field");
        if (el.type === "checkbox") block[name] = el.checked;
        else if (el.type === "radio") {
          if (el.checked) block[name] = el.value;
          else if (!(name in block)) block[name] = "";
        }
        else block[name] = el.value;
      });
      out.push(block);
    });
    return out;
  }

  // The Header page's live preview renders unsaved mega menu text too.
  window.tspMegaCollect = collectBlocks;

  function activeEditor() {
    return document.querySelector("[data-bulk-save-url]");
  }
  function saveBar() { return document.getElementById("fe-save-bar"); }
  function saveBarBtn() { return document.getElementById("fe-save-bar-btn"); }
  function saveBarMsg() {
    const bar = saveBar();
    return bar && bar.querySelector(".fe-save-bar-msg");
  }

  function markDirty() {
    const bar = saveBar();
    if (!bar) return;
    bar.dataset.megamenuDirty = "1";
    bar.hidden = false;
    document.body.classList.add("has-fe-save-bar");
    const msg = saveBarMsg();
    if (msg) msg.textContent = "Unsaved changes";
  }

  async function save() {
    const editor = activeEditor();
    const url = editor && editor.getAttribute("data-bulk-save-url");
    if (!editor || !url) return;
    const bar = saveBar();
    const btn = saveBarBtn();
    const msg = saveBarMsg();
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ blocks: collectBlocks(editor) }),
      });
      if (!r.ok) throw new Error("save failed");
      editor.querySelectorAll(".nav-megalink.is-dirty").forEach((el) =>
        el.classList.remove("is-dirty"));
      if (msg) msg.textContent = "Saved";
      if (bar) bar.dataset.megamenuDirty = "";
      // Reload so the freshly-saved values render server-side. Same
      // animate-out + reload pattern as the standard form-saver.
      const reload = () => window.location.reload();
      if (bar) {
        bar.addEventListener("animationend", reload, { once: true });
        bar.classList.add("is-leaving");
      }
      setTimeout(reload, 360);
    } catch (_) {
      if (btn) { btn.disabled = false; btn.textContent = "Save"; }
      if (msg) msg.textContent = "Save failed — try again";
      (window.tspShowToast || (() => {}))("Save failed — retry", "error");
    }
  }

  // Capture-phase click on the bar's Save button. Runs before the
  // standard feSaveBar IIFE's bubbling handler. If a megamenu editor is
  // dirty, intercept and run our bulk save; stopImmediatePropagation
  // keeps the standard handler from running its empty-Set "hide" path.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#fe-save-bar-btn");
    if (!btn) return;
    const bar = saveBar();
    if (!bar || bar.dataset.megamenuDirty !== "1") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    save();
  }, true);

  // Override-color toggle: enable/disable the color picker inline.
  document.addEventListener("change", (e) => {
    const toggle = e.target.closest("[data-color-override-toggle]");
    if (!toggle) return;
    const field = toggle.closest("[data-color-override-field]");
    if (!field) return;
    const picker = field.querySelector('input[type="color"][data-block-field="custom_color"]');
    field.classList.toggle("is-on", toggle.checked);
    if (picker) picker.disabled = !toggle.checked;
  });

  // Per-link size-override toggle: enable/disable the percentage
  // slider inline. Mirrors the override-color pattern above.
  document.addEventListener("change", (e) => {
    const toggle = e.target.closest("[data-size-override-toggle]");
    if (!toggle) return;
    const field = toggle.closest("[data-size-override-field]");
    if (!field) return;
    const slider = field.querySelector("[data-size-override-input]");
    field.classList.toggle("is-on", toggle.checked);
    if (slider) slider.disabled = !toggle.checked;
  });
  // Live "X%" readout for the per-link size slider.
  document.addEventListener("input", (e) => {
    const slider = e.target.closest("[data-size-override-input]");
    if (!slider) return;
    const out = slider.parentElement.querySelector("[data-size-override-out]");
    if (out) out.textContent = (slider.value || "100") + "%";
  });

  // Any field change inside the editor flips the row to `.is-dirty`
  // (visible per-row indicator) and shows the global yellow save bar.
  function onDirty(e) {
    const el = e.target.closest("[data-block-field]");
    if (!el) return;
    const li = el.closest("li.nav-megalink");
    if (li) li.classList.add("is-dirty");
    if (el.closest("[data-bulk-save-url]")) markDirty();
  }
  document.addEventListener("input", onDirty);
  document.addEventListener("change", onDirty);

  // Auto-select-all on focus for text fields inside the mega-menu /
  // bulk-save editor rows. Mega-menu admins typically click into a
  // label or URL to overwrite it wholesale — defaulting the cursor
  // to "everything selected" lets them just type the replacement.
  // Native triple-click + drag-to-position-cursor still work because
  // they happen in a later mouse event sequence; this only fires on
  // the first focus-in. requestAnimationFrame defers the select() so
  // the browser's own click→position-cursor handling doesn't immediately
  // clobber our selection.
  const SELECTABLE_TYPES = new Set([
    "text", "url", "email", "search", "tel", "number", "password", "",
  ]);
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    const isInput = el instanceof HTMLInputElement;
    const isTextArea = el instanceof HTMLTextAreaElement;
    if (!isInput && !isTextArea) return;
    if (isInput && !SELECTABLE_TYPES.has((el.type || "").toLowerCase())) return;
    // Only inside a mega-menu/bulk-save row — leaves every other admin
    // field unchanged so we don't surprise users elsewhere in the app.
    if (!el.closest("li.nav-megalink") && !el.closest("[data-bulk-save-url]")) return;
    if (!el.value) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      try { el.select(); } catch (_) {}
    });
  });
})();

// ── VERSION WATCHER ─────────────────────────────────────────────────────────
// Polls /api/version once a minute. If the deployed APP_VERSION has moved
// past the version this page was served with, a non-blocking banner appears
// offering a reload. We never auto-reload — the user clicks Reload when
// they're at a safe stopping point.
(function () {
  const meta = document.querySelector('meta[name="app-version"]');
  const bootVersion = meta ? (meta.content || "").trim() : "";
  const bootBuildId = meta ? (meta.getAttribute("data-build-id") || "").trim() : "";
  const checkUrl = meta ? (meta.getAttribute("data-check-url") || "/api/version") : "/api/version";
  if (!bootVersion) return;

  const CHECK_INTERVAL_MS = 60 * 1000;
  const REPROMPT_AFTER_MS = 10 * 60 * 1000;
  let bannerShown = false;

  async function check() {
    if (bannerShown) return;
    try {
      const r = await fetch(checkUrl, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return;
      const data = await r.json();
      const serverVersion = (data && data.version) || "";
      const serverBuildId = (data && data.build_id) || "";
      const versionChanged = serverVersion && serverVersion !== bootVersion;
      const buildChanged = serverBuildId && bootBuildId && serverBuildId !== bootBuildId;
      if (versionChanged || buildChanged) showBanner(serverVersion);
    } catch (_) { /* silent — try again next tick */ }
  }

  function showBanner(newVersion) {
    if (bannerShown) return;
    bannerShown = true;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
      {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]
    ));
    const el = document.createElement("div");
    el.id = "tsp-version-banner";
    el.className = "version-update-banner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="version-update-banner-main">' +
        '<div class="version-update-banner-title">Update available — v' + esc(newVersion) + '</div>' +
        '<div class="version-update-banner-sub">Reload when you’re at a stopping point to pick up the latest changes.</div>' +
      '</div>' +
      '<div class="version-update-banner-actions">' +
        '<button type="button" class="btn btn-sm" data-version-dismiss>Later</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-version-reload>Reload now</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector("[data-version-dismiss]").addEventListener("click", () => {
      el.remove();
      setTimeout(() => { bannerShown = false; check(); }, REPROMPT_AFTER_MS);
    });
    el.querySelector("[data-version-reload]").addEventListener("click", () => {
      window.location.reload();
    });
  }

  setTimeout(check, 10000);
  setInterval(check, CHECK_INTERVAL_MS);
})();

// ── LAYOUT BUILDER (drag-and-drop block composer) ─────────────────────────
// Library blocks are drag-sources; the canvas is the drop-zone. Canvas
// blocks themselves are re-orderable via the same dragstart/dragover
// handlers. Save POSTs the resulting block sequence to the backend.
(function feLayoutBuilder() {
  document.querySelectorAll(".fe-layout-builder-modal").forEach(modal => {
    // Footer modals run a separate IIFE (feFooterLayoutBuilder) that
    // manages multi-row, multi-column canvases. Skip those here so the
    // flat-list logic below doesn't fight the row/column DOM structure.
    if ((modal.dataset.layoutKind || "homepage") === "footer") return;
    const canvas = modal.querySelector("[data-builder-canvas]");
    const library = modal.querySelector("[data-builder-library]");
    const saveBtn = modal.querySelector("[data-builder-save]");
    const nameInp = modal.querySelector("[data-builder-name]");
    const titleEl = modal.querySelector("[data-builder-title]");
    const saveUrl = modal.dataset.saveLayoutUrl;
    const updateUrlTpl = modal.dataset.updateLayoutUrl;     // contains __KEY__
    const deleteUrlTpl = modal.dataset.deleteLayoutUrl;     // contains __KEY__
    const activateUrl = modal.dataset.activateUrl;
    const activateField = modal.dataset.activateField;
    const layoutKind = modal.dataset.layoutKind || "homepage";
    const csrf = modal.dataset.csrfToken;
    if (!canvas || !library || !saveBtn) return;

    const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true";';

    function refreshEmpty() {
      const hasBlocks = !!canvas.querySelector(".fe-builder-canvas-block");
      let empty = canvas.querySelector(".fe-builder-empty");
      if (!hasBlocks && !empty) {
        empty = document.createElement("div");
        empty.className = "fe-builder-empty muted small";
        empty.textContent = "Drag a block here to start.";
        canvas.appendChild(empty);
      } else if (hasBlocks && empty) {
        empty.remove();
      }
    }
    function makeCanvasBlock(type, name, iconHtml, opts) {
      const el = document.createElement("div");
      el.draggable = true;
      el.dataset.blockType = type;
      // Preserve split-level settings (width / margin / padding) on the
      // DOM node so the round-trip through the builder doesn't blow away
      // values the homepage admin's split settings card has written. The
      // builder itself doesn't expose UI for these — they're stored, not
      // shown — but they MUST survive serialize → save unchanged.
      if (type === "split" && opts) {
        if (opts.width)   el.dataset.splitWidth   = opts.width;
        if (opts.margin)  el.dataset.splitMargin  = opts.margin;
        if (opts.padding) el.dataset.splitPadding = opts.padding;
      }
      if (type === "split") {
        el.className = "fe-builder-canvas-block fe-builder-split";
        el.innerHTML =
          '<div class="fe-builder-split-head">' +
            '<div class="fe-builder-block-icon">' + (iconHtml || '') + '</div>' +
            '<div class="fe-builder-block-meta"><div class="fe-builder-block-name">' +
            escapeHtml(name) + '</div><div class="fe-builder-block-desc muted smaller">' +
            'Two side-by-side panels — drag blocks into each.</div></div>' +
            '<button type="button" class="fe-builder-canvas-remove" title="Remove">&times;</button>' +
          '</div>' +
          '<div class="fe-builder-split-cols">' +
            '<div class="fe-builder-split-col" data-split-side="left">' +
              '<div class="fe-builder-empty muted smaller">Left panel</div>' +
            '</div>' +
            '<div class="fe-builder-split-col" data-split-side="right">' +
              '<div class="fe-builder-empty muted smaller">Right panel</div>' +
            '</div>' +
          '</div>';
      } else if (type === "container") {
        // Containers carry a single nested drop zone so the admin can
        // compose a container block + its children inside the layout
        // builder. Same chrome shape as split (head + drop-zone) so
        // styling stays consistent.
        el.className = "fe-builder-canvas-block fe-builder-container";
        el.innerHTML =
          '<div class="fe-builder-split-head">' +
            '<div class="fe-builder-block-icon">' + (iconHtml || '') + '</div>' +
            '<div class="fe-builder-block-meta"><div class="fe-builder-block-name">' +
            escapeHtml(name) + '</div><div class="fe-builder-block-desc muted smaller">' +
            'Drop other blocks inside to nest them in this container.</div></div>' +
            '<button type="button" class="fe-builder-canvas-remove" title="Remove">&times;</button>' +
          '</div>' +
          '<div class="fe-builder-container-drop" data-container-drop>' +
            '<div class="fe-builder-empty muted smaller">Drag blocks here</div>' +
          '</div>';
      } else {
        el.className = "fe-builder-canvas-block";
        el.innerHTML =
          '<div class="fe-builder-block-icon">' + (iconHtml || '') + '</div>' +
          '<div class="fe-builder-block-meta"><div class="fe-builder-block-name">' +
          escapeHtml(name) + '</div></div>' +
          '<button type="button" class="fe-builder-canvas-remove" title="Remove">&times;</button>';
      }
      return el;
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }

    // Library blocks: drag → set type, on drop in canvas → append.
    library.querySelectorAll(".fe-builder-block").forEach(block => {
      block.addEventListener("dragstart", e => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-fe-block-type", block.dataset.blockType);
        e.dataTransfer.setData("application/x-fe-block-name", block.dataset.blockName);
        e.dataTransfer.setData("text/plain", block.dataset.blockName);
      });
    });

    // Canvas drag handlers: accept new blocks from library, reorder existing.
    // Both the top-level canvas AND each .fe-builder-split-col panel are
    // valid drop zones; we look up the closest such zone on dragover/drop.
    let dragging = null;
    function dropZoneFor(target) {
      return target.closest(".fe-builder-split-col")
          || target.closest(".fe-builder-container-drop")
          || target.closest("[data-builder-canvas]");
    }
    function isNestedZone(zone) {
      return zone && (zone.classList.contains("fe-builder-split-col")
                   || zone.classList.contains("fe-builder-container-drop"));
    }
    function handleDragOver(e) {
      const zone = dropZoneFor(e.target);
      if (!zone) return;
      e.preventDefault();
      e.stopPropagation();
      // Highlight only the active zone.
      modal.querySelectorAll(".is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
      zone.classList.add("is-drop-target");
      if (dragging) {
        // Don't allow nesting splits inside splits — too much complexity.
        // Splits inside containers are also blocked; stick to leaf-only
        // children inside container drop-zones (containers can still
        // nest containers though).
        if (dragging.dataset.blockType === "split" && isNestedZone(zone)) return;
        const after = [...zone.querySelectorAll(":scope > .fe-builder-canvas-block:not(.dragging)")]
          .find(b => e.clientY < b.getBoundingClientRect().top + b.offsetHeight / 2);
        if (after) zone.insertBefore(dragging, after);
        else zone.appendChild(dragging);
      }
    }
    function handleDrop(e) {
      const zone = dropZoneFor(e.target);
      if (!zone) return;
      e.preventDefault();
      e.stopPropagation();
      modal.querySelectorAll(".is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
      if (dragging) { return; }   // reorder case is handled by dragover
      const type = e.dataTransfer.getData("application/x-fe-block-type");
      const name = e.dataTransfer.getData("application/x-fe-block-name");
      if (!type) return;
      // Block split from being placed inside another split's panel OR
      // inside a container's drop zone (keeps the tree shallow).
      if (type === "split" && isNestedZone(zone)) return;
      const libBlock = library.querySelector(
        '.fe-builder-block[data-block-type="' + CSS.escape(type) + '"]');
      const iconHtml = libBlock ? libBlock.querySelector(".fe-builder-block-icon").innerHTML : '';
      // Drop the placeholder if present.
      zone.querySelectorAll(":scope > .fe-builder-empty").forEach(el => el.remove());
      zone.appendChild(makeCanvasBlock(type, name, iconHtml));
      refreshEmpty();
    }
    canvas.addEventListener("dragover", handleDragOver);
    canvas.addEventListener("dragleave", e => {
      const zone = dropZoneFor(e.target);
      if (zone) zone.classList.remove("is-drop-target");
    });
    canvas.addEventListener("drop", handleDrop);

    canvas.addEventListener("dragstart", e => {
      const block = e.target.closest(".fe-builder-canvas-block");
      if (!block) return;
      dragging = block;
      block.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    canvas.addEventListener("dragend", () => {
      if (dragging) dragging.classList.remove("dragging");
      dragging = null;
      modal.querySelectorAll(".is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
      refreshEmpty();
    });
    canvas.addEventListener("click", e => {
      const rm = e.target.closest(".fe-builder-canvas-remove");
      if (!rm) return;
      const block = rm.closest(".fe-builder-canvas-block");
      if (block) block.remove();
      refreshEmpty();
    });

    function serializeBlocks(zone) {
      // Walk direct children of `zone` and capture nested split panels
      // and container drop-zones so the tree round-trips intact.
      return [...zone.querySelectorAll(":scope > .fe-builder-canvas-block")].map(b => {
        const t = b.dataset.blockType;
        if (t === "split") {
          const left = b.querySelector('.fe-builder-split-col[data-split-side="left"]');
          const right = b.querySelector('.fe-builder-split-col[data-split-side="right"]');
          const out = {
            type: "split",
            left: left ? serializeBlocks(left) : [],
            right: right ? serializeBlocks(right) : [],
          };
          // Round-trip width / margin / padding stashed in the dataset
          // when this block was hydrated from an existing layout, so
          // editing the structure doesn't drop spacing settings the
          // homepage admin's split card has written.
          if (b.dataset.splitWidth)   out.width   = b.dataset.splitWidth;
          if (b.dataset.splitMargin)  out.margin  = b.dataset.splitMargin;
          if (b.dataset.splitPadding) out.padding = b.dataset.splitPadding;
          return out;
        }
        if (t === "container") {
          const drop = b.querySelector(":scope > .fe-builder-container-drop");
          return {
            type: "container",
            blocks: drop ? serializeBlocks(drop) : [],
          };
        }
        return { type: t };
      });
    }

    // Restore the canvas to its empty state (drop placeholder only).
    function clearCanvas() {
      canvas.innerHTML = '<div class="fe-builder-empty muted small">Drag a block here to start.</div>';
    }

    // Inverse of serializeBlocks: takes a [{type, left?, right?}, …] list
    // and rebuilds DOM nodes inside the given drop-zone. Used for Edit
    // mode so the canvas reflects the layout being modified.
    function blockNameForType(type) {
      const lib = library.querySelector(
        '.fe-builder-block[data-block-type="' + CSS.escape(type) + '"]');
      return lib ? lib.dataset.blockName : type;
    }
    function blockIconForType(type) {
      const lib = library.querySelector(
        '.fe-builder-block[data-block-type="' + CSS.escape(type) + '"]');
      return lib ? lib.querySelector(".fe-builder-block-icon").innerHTML : '';
    }
    function hydrateZone(zone, blocks) {
      zone.querySelectorAll(":scope > .fe-builder-empty").forEach(el => el.remove());
      (blocks || []).forEach(b => {
        const t = b && b.type;
        if (!t) return;
        const splitOpts = (t === "split")
          ? { width: b.width, margin: b.margin, padding: b.padding }
          : null;
        const node = makeCanvasBlock(t, blockNameForType(t), blockIconForType(t), splitOpts);
        zone.appendChild(node);
        if (t === "split") {
          const left = node.querySelector('.fe-builder-split-col[data-split-side="left"]');
          const right = node.querySelector('.fe-builder-split-col[data-split-side="right"]');
          if (left) {
            left.querySelectorAll(":scope > .fe-builder-empty").forEach(el => el.remove());
            hydrateZone(left, b.left || []);
          }
          if (right) {
            right.querySelectorAll(":scope > .fe-builder-empty").forEach(el => el.remove());
            hydrateZone(right, b.right || []);
          }
          // Re-add empty placeholders if a side ended up empty.
          [left, right].forEach(side => {
            if (side && !side.querySelector(":scope > .fe-builder-canvas-block")) {
              const ph = document.createElement("div");
              ph.className = "fe-builder-empty muted smaller";
              ph.textContent = side.dataset.splitSide === "left" ? "Left panel" : "Right panel";
              side.appendChild(ph);
            }
          });
        } else if (t === "container") {
          const drop = node.querySelector(":scope > .fe-builder-container-drop");
          if (drop) {
            drop.querySelectorAll(":scope > .fe-builder-empty").forEach(el => el.remove());
            hydrateZone(drop, b.blocks || []);
            if (!drop.querySelector(":scope > .fe-builder-canvas-block")) {
              const ph = document.createElement("div");
              ph.className = "fe-builder-empty muted smaller";
              ph.textContent = "Drag blocks here";
              drop.appendChild(ph);
            }
          }
        }
      });
      refreshEmpty();
    }

    // Edit mode is signaled by setting modal.dataset.editKey before opening.
    // The picker macro stores the layout's blocks JSON + name on each card;
    // the click handler below copies them into the modal before opening.
    function enterCreateMode() {
      delete modal.dataset.editKey;
      if (titleEl) titleEl.textContent = "Build a custom layout";
      if (nameInp) nameInp.value = "";
      saveBtn.textContent = "Save layout";
      clearCanvas();
    }
    function enterEditMode(key, name, blocks) {
      modal.dataset.editKey = key;
      if (titleEl) titleEl.textContent = "Edit layout";
      if (nameInp) nameInp.value = name || "";
      saveBtn.textContent = "Save changes";
      clearCanvas();
      hydrateZone(canvas, blocks);
    }

    // Wire the edit / delete icon buttons on each non-prebuilt layout card
    // in the picker grid (not inside the modal — these live in the picker
    // modal that opens this builder modal). We use document-level
    // delegation so only the builder modal whose data-builder-modal id
    // matches reacts.
    const builderModalId = modal.id;
    document.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit-layout]");
      if (editBtn && editBtn.getAttribute("data-builder-modal") === builderModalId) {
        e.preventDefault(); e.stopPropagation();
        // Edit button can either live inside a picker `.template-card`
        // (carrying data-layout-* attrs on the card) OR be standalone
        // (the structure-card "Edit layout" shortcut, which carries
        // those attrs on the button itself). Fall back to the button's
        // own dataset when no card ancestor is present so both shapes
        // hydrate the builder canvas.
        const card = editBtn.closest(".template-card");
        const data = card ? card.dataset : editBtn.dataset;
        let blocks = [];
        try { blocks = JSON.parse(data.layoutBlocks || "[]"); } catch (_) {}
        enterEditMode(data.layoutKey, data.layoutName, blocks);
        // Close the picker modal and open the builder modal.
        const pickerModal = card && card.closest(".fe-layout-picker-modal");
        if (pickerModal) {
          pickerModal.classList.remove("open");
          pickerModal.setAttribute("aria-hidden", "true");
        }
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        return;
      }
      const delBtn = e.target.closest("[data-delete-layout]");
      if (delBtn) {
        // Only the matching modal should handle this — but since there's
        // typically just one builder modal per page, all instances will
        // see the click. Guard by checking the URL template exists.
        if (!deleteUrlTpl) return;
        e.preventDefault(); e.stopPropagation();
        const key = delBtn.getAttribute("data-delete-layout");
        const card = delBtn.closest(".template-card");
        if (!confirm("Delete this layout? Any page currently using it will fall back to the Classic layout.")) return;
        try {
          const url = deleteUrlTpl.replace("__KEY__", encodeURIComponent(key));
          const fd = new FormData(); fd.append("csrf_token", csrf);
          const r = await fetch(url, { method: "POST", credentials: "same-origin", body: fd });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error(data.error || "Delete failed");
          if (card && card.classList.contains("active")) {
            // The active layout was deleted; reload so the picker reflects
            // the fallback the server picked (classic).
            window.location.reload();
          } else if (card) {
            card.remove();
          }
        } catch (err) {
          (window.tspShowToast || alert)("Could not delete layout: " + (err.message || ""));
        }
        return;
      }
      const newBtn = e.target.closest("[data-builder-mode-create]");
      if (newBtn && newBtn.getAttribute("data-open-modal") === builderModalId) {
        // Reset to create mode every time the "+ Custom layout" tile is
        // clicked, so editing then bailing then creating doesn't smuggle
        // the prior layout's state into a new save.
        enterCreateMode();
      }
    });

    saveBtn.addEventListener("click", async () => {
      const blocks = serializeBlocks(canvas);
      if (!blocks.length) {
        (window.tspShowToast || alert)("Add at least one block before saving.");
        return;
      }
      const name = (nameInp && nameInp.value.trim()) || "Custom layout";
      const editKey = modal.dataset.editKey;
      saveBtn.disabled = true;
      const orig = saveBtn.textContent;
      saveBtn.textContent = "Saving…";
      try {
        const url = editKey
          ? updateUrlTpl.replace("__KEY__", encodeURIComponent(editKey))
          : saveUrl;
        const r = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
          body: JSON.stringify({ name, blocks, kind: layoutKind }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error || "Save failed");
        // Auto-activate: tell the picker form to use the saved layout for
        // this page. Skip when editing the layout that's already active
        // (a re-POST of the same value would just be a no-op).
        if (activateUrl && activateField && data.key) {
          const fd = new FormData();
          fd.append("csrf_token", csrf);
          fd.append(activateField, data.key);
          await fetch(activateUrl, {
            method: "POST", credentials: "same-origin", body: fd,
          }).catch(() => {});
        }
        window.location.reload();
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = orig;
        (window.tspShowToast || alert)("Could not save layout: " + (e.message || ""));
      }
    });
  });
})();

// ── FOOTER LAYOUT BUILDER (rows + columns) ─────────────────────────────────
// Footer custom layouts have a richer shape than homepage layouts: each
// top-level entry is a "row" with 1-4 columns; blocks live inside a
// specific column. This IIFE manages the multi-row canvas (add/remove,
// per-row column-count selector, drag library blocks into row columns,
// drag blocks between columns/rows) and serializes the rows+cols
// structure on save. Triggered only when the modal carries
// data-layout-kind="footer".
(function feFooterLayoutBuilder() {
  document.querySelectorAll('.fe-layout-builder-modal').forEach(modal => {
    if ((modal.dataset.layoutKind || 'homepage') !== 'footer') return;
    const canvas = modal.querySelector('[data-builder-canvas]');
    const library = modal.querySelector('[data-builder-library]');
    const saveBtn = modal.querySelector('[data-builder-save]');
    const nameInp = modal.querySelector('[data-builder-name]');
    const titleEl = modal.querySelector('[data-builder-title]');
    const saveUrl = modal.dataset.saveLayoutUrl;
    const updateUrlTpl = modal.dataset.updateLayoutUrl;
    const deleteUrlTpl = modal.dataset.deleteLayoutUrl;
    const activateUrl = modal.dataset.activateUrl;
    const activateField = modal.dataset.activateField;
    const csrf = modal.dataset.csrfToken;
    if (!canvas || !library || !saveBtn) return;

    // Mark the modal so CSS can widen it (the panel default is too narrow
    // to comfortably show 4 column drop zones side-by-side).
    modal.classList.add('fe-layout-builder-modal--wide');
    canvas.classList.add('fe-footer-builder-canvas');

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function blockNameForType(type) {
      const lib = library.querySelector(
        '.fe-builder-block[data-block-type="' + CSS.escape(type) + '"]');
      return lib ? lib.dataset.blockName : type;
    }
    function blockIconForType(type) {
      const lib = library.querySelector(
        '.fe-builder-block[data-block-type="' + CSS.escape(type) + '"]');
      return lib ? lib.querySelector('.fe-builder-block-icon').innerHTML : '';
    }

    function makeBlockNode(type) {
      const el = document.createElement('div');
      el.className = 'fe-builder-canvas-block';
      el.draggable = true;
      el.dataset.blockType = type;
      el.innerHTML =
        '<div class="fe-builder-block-icon">' + blockIconForType(type) + '</div>' +
        '<div class="fe-builder-block-meta"><div class="fe-builder-block-name">' +
        escapeHtml(blockNameForType(type)) + '</div></div>' +
        '<button type="button" class="fe-builder-canvas-remove" title="Remove">&times;</button>';
      return el;
    }

    function makeRowNode(cols, rowIndex) {
      cols = Math.max(1, Math.min(4, cols || 1));
      const row = document.createElement('div');
      row.className = 'fe-footer-builder-row';
      row.dataset.cols = String(cols);
      row.innerHTML =
        '<div class="fe-footer-builder-row-head">' +
          '<div class="fe-footer-builder-row-handle" title="Drag to reorder row" aria-hidden="true">⋮⋮</div>' +
          '<span class="fe-footer-builder-row-label">Row <span data-row-num>' + (rowIndex + 1) + '</span></span>' +
          '<label class="fe-footer-builder-row-cols">' +
            '<span class="muted smaller">Columns</span>' +
            '<select data-row-cols-select>' +
              [1, 2, 3, 4].map(n =>
                '<option value="' + n + '"' + (n === cols ? ' selected' : '') + '>' + n + '</option>').join('') +
            '</select>' +
          '</label>' +
          '<button type="button" class="fe-footer-builder-row-remove" title="Remove row" aria-label="Remove row">&times;</button>' +
        '</div>' +
        '<div class="fe-footer-builder-row-cols-wrap fe-footer-builder-cols-' + cols + '" data-row-cols></div>';
      const colsWrap = row.querySelector('[data-row-cols]');
      for (let i = 0; i < cols; i++) {
        colsWrap.appendChild(makeColumnNode(i));
      }
      return row;
    }

    function makeColumnNode(index) {
      const col = document.createElement('div');
      col.className = 'fe-footer-builder-col';
      col.dataset.colIndex = String(index);
      col.innerHTML =
        '<div class="fe-footer-builder-col-head muted smaller">Col ' + (index + 1) + '</div>' +
        '<div class="fe-footer-builder-col-drop" data-col-drop>' +
          '<div class="fe-builder-empty muted smaller">Drop blocks here</div>' +
        '</div>';
      return col;
    }

    function refreshRowNumbers() {
      canvas.querySelectorAll('.fe-footer-builder-row').forEach((row, i) => {
        const num = row.querySelector('[data-row-num]');
        if (num) num.textContent = String(i + 1);
      });
      const empty = canvas.querySelector(':scope > .fe-builder-empty');
      const hasRows = !!canvas.querySelector('.fe-footer-builder-row');
      if (!hasRows && !empty) {
        const ph = document.createElement('div');
        ph.className = 'fe-builder-empty muted small';
        ph.textContent = 'Click "+ Add row" to start.';
        canvas.appendChild(ph);
      } else if (hasRows && empty) {
        empty.remove();
      }
    }

    function refreshColEmpty(col) {
      const drop = col.querySelector('[data-col-drop]');
      if (!drop) return;
      const hasBlocks = !!drop.querySelector('.fe-builder-canvas-block');
      const empty = drop.querySelector('.fe-builder-empty');
      if (!hasBlocks && !empty) {
        const ph = document.createElement('div');
        ph.className = 'fe-builder-empty muted smaller';
        ph.textContent = 'Drop blocks here';
        drop.appendChild(ph);
      } else if (hasBlocks && empty) {
        empty.remove();
      }
    }

    function refreshAllColEmpty() {
      canvas.querySelectorAll('.fe-footer-builder-col').forEach(refreshColEmpty);
    }

    function changeRowCols(row, newCols) {
      newCols = Math.max(1, Math.min(4, newCols));
      const oldCols = parseInt(row.dataset.cols || '1', 10);
      if (newCols === oldCols) return;
      const colsWrap = row.querySelector('[data-row-cols]');
      const cols = colsWrap.querySelectorAll('.fe-footer-builder-col');
      if (newCols > oldCols) {
        // Add new empty columns
        for (let i = oldCols; i < newCols; i++) {
          colsWrap.appendChild(makeColumnNode(i));
        }
      } else {
        // Move blocks from removed columns into the first column,
        // then remove the trailing column nodes.
        const firstDrop = cols[0].querySelector('[data-col-drop]');
        for (let i = oldCols - 1; i >= newCols; i--) {
          const drop = cols[i].querySelector('[data-col-drop]');
          drop.querySelectorAll('.fe-builder-canvas-block').forEach(b => firstDrop.appendChild(b));
          cols[i].remove();
        }
      }
      row.dataset.cols = String(newCols);
      colsWrap.classList.remove('fe-footer-builder-cols-1', 'fe-footer-builder-cols-2',
        'fe-footer-builder-cols-3', 'fe-footer-builder-cols-4');
      colsWrap.classList.add('fe-footer-builder-cols-' + newCols);
      refreshAllColEmpty();
    }

    function clearCanvas() {
      canvas.querySelectorAll('.fe-footer-builder-row').forEach(r => r.remove());
      canvas.querySelectorAll(':scope > .fe-builder-empty').forEach(e => e.remove());
      refreshRowNumbers();
    }

    // ── Add row button (inserted into the canvas footer area) ──
    let addRowBtn = canvas.parentElement.querySelector('[data-footer-add-row]');
    if (!addRowBtn) {
      addRowBtn = document.createElement('button');
      addRowBtn.type = 'button';
      addRowBtn.className = 'btn btn-sm fe-footer-builder-add-row';
      addRowBtn.dataset.footerAddRow = '1';
      addRowBtn.textContent = '+ Add row';
      canvas.parentElement.insertBefore(addRowBtn, canvas.nextSibling);
    }
    addRowBtn.addEventListener('click', e => {
      e.preventDefault();
      const rowCount = canvas.querySelectorAll('.fe-footer-builder-row').length;
      const row = makeRowNode(1, rowCount);
      canvas.appendChild(row);
      refreshRowNumbers();
      refreshAllColEmpty();
    });

    // ── Library → drop zone drag/drop ──
    library.querySelectorAll('.fe-builder-block').forEach(block => {
      block.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-fe-block-type', block.dataset.blockType);
        e.dataTransfer.setData('application/x-fe-source', 'library');
        e.dataTransfer.setData('text/plain', block.dataset.blockName);
      });
    });

    // Within-canvas drag — block dragged out of one drop zone (move).
    canvas.addEventListener('dragstart', e => {
      const block = e.target.closest('.fe-builder-canvas-block');
      if (!block) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-fe-block-type', block.dataset.blockType);
      e.dataTransfer.setData('application/x-fe-source', 'canvas');
      block.dataset.dragging = '1';
      setTimeout(() => block.classList.add('is-dragging'), 0);
    });
    canvas.addEventListener('dragend', e => {
      const block = e.target.closest('.fe-builder-canvas-block');
      if (block) {
        block.classList.remove('is-dragging');
        delete block.dataset.dragging;
      }
      refreshAllColEmpty();
    });

    // Drop zones (column drops + row reorder)
    function getDropTarget(e) {
      // 1) Try a column drop zone.
      const drop = e.target.closest('[data-col-drop]');
      return drop;
    }

    canvas.addEventListener('dragover', e => {
      const drop = getDropTarget(e);
      if (drop) {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
        drop.classList.add('is-dragover');
        // Compute insertion point based on cursor Y vs existing blocks.
        const blocks = drop.querySelectorAll(':scope > .fe-builder-canvas-block:not(.is-dragging)');
        let inserted = false;
        for (const b of blocks) {
          const r = b.getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) {
            drop.dataset.insertBefore = b.dataset.blockType + ':' + Array.from(b.parentElement.children).indexOf(b);
            inserted = true;
            break;
          }
        }
        if (!inserted) drop.dataset.insertBefore = '__end__';
      }
    });
    canvas.addEventListener('dragleave', e => {
      const drop = e.target.closest('[data-col-drop]');
      if (drop) drop.classList.remove('is-dragover');
    });
    canvas.addEventListener('drop', e => {
      const drop = getDropTarget(e);
      if (!drop) return;
      e.preventDefault();
      drop.classList.remove('is-dragover');
      const type = e.dataTransfer.getData('application/x-fe-block-type');
      const source = e.dataTransfer.getData('application/x-fe-source');
      if (!type) return;
      let node;
      if (source === 'canvas') {
        // Move existing block (find the one currently being dragged)
        node = canvas.querySelector('.fe-builder-canvas-block[data-dragging="1"]');
        if (!node) return;
        delete node.dataset.dragging;
        node.classList.remove('is-dragging');
      } else {
        node = makeBlockNode(type);
      }
      // Insert at computed position
      const sibs = drop.querySelectorAll(':scope > .fe-builder-canvas-block:not(.is-dragging)');
      let placed = false;
      for (const s of sibs) {
        const r = s.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          drop.insertBefore(node, s);
          placed = true; break;
        }
      }
      if (!placed) drop.appendChild(node);
      refreshAllColEmpty();
    });

    // Click handlers (delegated): remove block, remove row, change cols
    canvas.addEventListener('click', e => {
      const rmBlock = e.target.closest('.fe-builder-canvas-remove');
      if (rmBlock) {
        e.preventDefault();
        rmBlock.closest('.fe-builder-canvas-block').remove();
        refreshAllColEmpty();
        return;
      }
      const rmRow = e.target.closest('.fe-footer-builder-row-remove');
      if (rmRow) {
        e.preventDefault();
        rmRow.closest('.fe-footer-builder-row').remove();
        refreshRowNumbers();
        return;
      }
    });
    canvas.addEventListener('change', e => {
      const sel = e.target.closest('[data-row-cols-select]');
      if (!sel) return;
      const row = sel.closest('.fe-footer-builder-row');
      const newCols = parseInt(sel.value, 10);
      if (row) changeRowCols(row, newCols);
    });

    // ── Row drag-reorder via the row handle ──
    let draggingRow = null;
    canvas.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.fe-footer-builder-row-handle');
      if (!handle) return;
      const row = handle.closest('.fe-footer-builder-row');
      if (!row) return;
      draggingRow = row;
      row.classList.add('is-dragging');
      handle.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!draggingRow) return;
      const sibs = Array.from(canvas.querySelectorAll('.fe-footer-builder-row:not(.is-dragging)'));
      for (const s of sibs) {
        const r = s.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          canvas.insertBefore(draggingRow, s);
          refreshRowNumbers();
          return;
        }
      }
      canvas.appendChild(draggingRow);
      refreshRowNumbers();
    });
    function endRowDrag() {
      if (!draggingRow) return;
      draggingRow.classList.remove('is-dragging');
      draggingRow = null;
    }
    canvas.addEventListener('pointerup', endRowDrag);
    canvas.addEventListener('pointercancel', endRowDrag);

    // ── Serialize: walk the rows → cols → blocks ──
    function serialize() {
      const rows = [];
      canvas.querySelectorAll(':scope > .fe-footer-builder-row').forEach(row => {
        const cols = parseInt(row.dataset.cols || '1', 10);
        const columns = [];
        row.querySelectorAll('.fe-footer-builder-col').forEach(col => {
          const blocks = [];
          col.querySelectorAll('[data-col-drop] > .fe-builder-canvas-block').forEach(b => {
            blocks.push({ type: b.dataset.blockType });
          });
          columns.push(blocks);
        });
        rows.push({ type: 'row', cols, columns });
      });
      return rows;
    }

    // ── Edit mode rehydration ──
    function enterCreateMode() {
      delete modal.dataset.editKey;
      if (titleEl) titleEl.textContent = 'Build a footer layout';
      if (nameInp) nameInp.value = '';
      saveBtn.textContent = 'Save layout';
      clearCanvas();
      // Seed an initial row so the admin sees a drop zone immediately.
      canvas.appendChild(makeRowNode(1, 0));
      refreshRowNumbers();
      refreshAllColEmpty();
    }
    function enterEditMode(key, name, layout) {
      modal.dataset.editKey = key;
      if (titleEl) titleEl.textContent = 'Edit footer layout';
      if (nameInp) nameInp.value = name || '';
      saveBtn.textContent = 'Save changes';
      clearCanvas();
      // `layout` may be the new rows+cols shape or a legacy flat list;
      // wrap a flat list in a single 1-col row to keep editing painless.
      let rows = layout;
      if (Array.isArray(rows) && rows.length && rows[0].type !== 'row') {
        rows = [{ type: 'row', cols: 1, columns: [rows] }];
      }
      (rows || []).forEach((row, ri) => {
        const cols = row.cols || 1;
        const node = makeRowNode(cols, ri);
        canvas.appendChild(node);
        const colNodes = node.querySelectorAll('.fe-footer-builder-col');
        (row.columns || []).forEach((blocks, ci) => {
          const drop = colNodes[ci] && colNodes[ci].querySelector('[data-col-drop]');
          if (!drop) return;
          (blocks || []).forEach(b => {
            const t = b && b.type;
            if (!t) return;
            drop.appendChild(makeBlockNode(t));
          });
        });
      });
      refreshRowNumbers();
      refreshAllColEmpty();
    }

    // Document-level click delegation for the picker's Edit / Delete /
    // "+ Custom layout" buttons. Mirrors the homepage flat-list IIFE
    // patterns exactly — only routes when the button targets THIS modal.
    const builderModalId = modal.id;
    document.addEventListener('click', async e => {
      const editBtn = e.target.closest('[data-edit-layout]');
      if (editBtn && editBtn.getAttribute('data-builder-modal') === builderModalId) {
        e.preventDefault(); e.stopPropagation();
        // The button can either live inside a picker `.template-card`
        // (which carries data-layout-* attrs) OR be standalone (e.g. the
        // "Edit layout" shortcut on the Footer admin's Active layout
        // structure card). Fall back to the button's own dataset when
        // no card ancestor is present.
        const card = editBtn.closest('.template-card');
        const data = card ? card.dataset : editBtn.dataset;
        let blocks = [];
        try { blocks = JSON.parse(data.layoutBlocks || '[]'); } catch (_) {}
        enterEditMode(data.layoutKey, data.layoutName, blocks);
        const pickerModal = card && card.closest('.fe-layout-picker-modal');
        if (pickerModal) {
          pickerModal.classList.remove('open');
          pickerModal.setAttribute('aria-hidden', 'true');
        }
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        return;
      }
      const delBtn = e.target.closest('[data-delete-layout]');
      if (delBtn) {
        if (!deleteUrlTpl) return;
        e.preventDefault(); e.stopPropagation();
        const key = delBtn.getAttribute('data-delete-layout');
        const card = delBtn.closest('.template-card');
        if (!confirm('Delete this layout? Any page currently using it will fall back to the Classic layout.')) return;
        try {
          const url = deleteUrlTpl.replace('__KEY__', encodeURIComponent(key));
          const fd = new FormData(); fd.append('csrf_token', csrf);
          const r = await fetch(url, { method: 'POST', credentials: 'same-origin', body: fd });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error(data.error || 'Delete failed');
          if (card && card.classList.contains('active')) window.location.reload();
          else if (card) card.remove();
        } catch (err) {
          (window.tspShowToast || alert)('Could not delete layout: ' + (err.message || ''));
        }
        return;
      }
      const newBtn = e.target.closest('[data-builder-mode-create]');
      if (newBtn && newBtn.getAttribute('data-open-modal') === builderModalId) {
        enterCreateMode();
      }
    });

    // ── Save ──
    saveBtn.addEventListener('click', async () => {
      const blocks = serialize();
      // Drop empty rows (no columns, or all columns empty)
      const nonEmpty = blocks.filter(r =>
        (r.columns || []).some(c => (c || []).length > 0));
      if (!nonEmpty.length) {
        (window.tspShowToast || alert)('Add at least one block before saving.');
        return;
      }
      const name = (nameInp && nameInp.value.trim()) || 'Custom footer layout';
      const editKey = modal.dataset.editKey;
      saveBtn.disabled = true;
      const orig = saveBtn.textContent;
      saveBtn.textContent = 'Saving…';
      try {
        const url = editKey
          ? updateUrlTpl.replace('__KEY__', encodeURIComponent(editKey))
          : saveUrl;
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          body: JSON.stringify({ name, blocks: nonEmpty, kind: 'footer' }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error || 'Save failed');
        if (activateUrl && activateField && data.key) {
          const fd = new FormData();
          fd.append('csrf_token', csrf);
          fd.append(activateField, data.key);
          await fetch(activateUrl, { method: 'POST', credentials: 'same-origin', body: fd })
            .catch(() => {});
        }
        window.location.reload();
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = orig;
        (window.tspShowToast || alert)('Could not save layout: ' + (e.message || ''));
      }
    });

    // Initial empty state
    refreshRowNumbers();
  });
})();

// ── COLLAPSIBLE CARDS (Web Frontend admin) ─────────────────────────────────
// Adds a chevron toggle to every .card inside .fe-admin-main. Clicking the
// chevron OR anywhere on the .card-head (excluding nested buttons / links /
// inputs) toggles the .is-collapsed class. State is remembered per-page in
// localStorage so cards stay collapsed across reloads.
(function feCollapsibleCards() {
  const main = document.querySelector(".fe-admin-main");
  if (!main) return;
  // Page-level opt-out: a [data-no-collapse] main column keeps every card
  // permanently expanded (no chevron, no click-to-collapse) — e.g. the
  // custom-form edit page, where collapsing the settings/fields cards just
  // gets in the way of building the form.
  if (main.hasAttribute("data-no-collapse")) return;

  const STORAGE_KEY = "fe-card-collapse:" + window.location.pathname;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) {}

  // Each card needs a stable id so we can persist its state across reloads.
  // Use the heading text as the key; it's stable per-page.
  function cardKey(card) {
    const h = card.querySelector(".card-head h2");
    return h ? h.textContent.trim() : null;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (_) {}
  }

  // Lucide chevron-up SVG paths; matches the rest of the icon set.
  const CHEVRON_SVG =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m18 15-6-6-6 6"/></svg>';

  function decorate(card) {
    if (card.__feCollapseInit) return;
    // Explicit opt-out — cards carrying ``data-no-collapse`` are
    // never made collapsible (e.g. the Templates page's "Reusable
    // templates" intro card, which is pure legend copy that should
    // always read in full).
    if (card.hasAttribute("data-no-collapse")) {
      card.__feCollapseInit = true;
      card.classList.remove("is-collapsed");
      return;
    }
    // Cards rendered inside a modal panel (homepage / footer block-edit
    // popups) shouldn't be collapsible — the modal IS the disclosure;
    // a nested expand/collapse layer just gets in the user's way and
    // can rehydrate as collapsed from stale localStorage state.
    if (card.closest(".modal")) {
      card.__feCollapseInit = true;
      card.classList.remove("is-collapsed");
      return;
    }
    card.__feCollapseInit = true;
    const head = card.querySelector(".card-head");
    if (!head) return;

    // Inject the chevron toggle button at the end of card-head.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fe-card-toggle";
    btn.setAttribute("aria-label", "Toggle section");
    btn.innerHTML = CHEVRON_SVG;
    head.appendChild(btn);

    // Restore persisted state.
    const key = cardKey(card);
    if (key && stored[key]) card.classList.add("is-collapsed");
    btn.setAttribute("aria-expanded", card.classList.contains("is-collapsed") ? "false" : "true");

    function toggle() {
      card.classList.toggle("is-collapsed");
      const isCollapsed = card.classList.contains("is-collapsed");
      btn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      const k = cardKey(card);
      if (k) {
        if (isCollapsed) stored[k] = 1; else delete stored[k];
        persist();
      }
    }

    // Click handler bound to the card itself so the entire card surface is
    // clickable when collapsed. When expanded the click zone extends from
    // the top of the card down through the heading's bottom edge — the
    // strip of padding above the heading is included so the title row
    // doesn't have a dead zone above it. Clicks inside the body still
    // interact with form fields normally instead of collapsing the card.
    card.addEventListener("click", (e) => {
      const interactive = e.target.closest(
        "button, a, input, select, textarea, label, .row-actions, [data-page-block-id], [data-open-modal]");
      if (interactive && interactive !== btn) return;
      const isCollapsed = card.classList.contains("is-collapsed");
      if (isCollapsed) { toggle(); return; }
      // Expanded: only toggle if the click is at or above the heading's
      // bottom edge (i.e. inside the head row OR in the card padding
      // above it).
      const headRect = head.getBoundingClientRect();
      if (e.clientY <= headRect.bottom) toggle();
    });
  }

  main.querySelectorAll(".card").forEach(decorate);

  // Pick up cards added later (modal-rendered, fetch-injected, etc).
  const mo = new MutationObserver(records => {
    for (const r of records) {
      r.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.classList && n.classList.contains("card")) decorate(n);
        n.querySelectorAll && n.querySelectorAll(".card").forEach(decorate);
      });
    }
  });
  mo.observe(main, { childList: true, subtree: true });
})();

// ── TEMPLATE-PICKER LIVE HIGHLIGHT ─────────────────────────────────────────
// When the user picks a different template radio inside a .template-library
// -grid the visual .active class needs to follow so they can confirm which
// card will be submitted. Server only marks the originally-active one.
(function () {
  document.addEventListener("change", (e) => {
    const inp = e.target;
    if (!inp || inp.type !== "radio") return;
    const grid = inp.closest(".template-library-grid");
    if (!grid) return;
    const newCard = inp.closest(".template-card");
    grid.querySelectorAll(".template-card.active").forEach(c => c.classList.remove("active"));
    if (newCard) newCard.classList.add("active");
  });
})();

// ── FRONTEND-ADMIN SAVE BAR ────────────────────────────────────────────────
// One yellow bar pinned to the sidebar that batches saves across every
// tracked form on the page. Show + bounce when anything becomes dirty;
// click to POST every dirty form sequentially, then reload so the freshly
// rendered admin sees its own values.
(function feSaveBar(){
  const bar = document.getElementById('fe-save-bar');
  const main = document.querySelector('.fe-admin-main');
  if (!bar || !main) return;
  const btn = document.getElementById('fe-save-bar-btn');
  const msg = bar.querySelector('.fe-save-bar-msg');
  const dirty = new Set();

  document.body.classList.add('has-fe-save-bar');

  function show() {
    bar.hidden = false;
    msg.textContent = dirty.size > 1
      ? 'Unsaved changes (' + dirty.size + ' sections)'
      : 'Unsaved changes';
  }
  function hide() {
    bar.hidden = true;
    dirty.clear();
  }

  function trackable(form) {
    if (!form.method || form.method.toLowerCase() !== 'post') return false;
    if (form.matches('[data-fe-skip-save-bar]')) return false;
    // Modal forms opt-in via [data-fe-savebar]. Most modals carry
    // their own Save/Cancel chrome and shouldn't fight the global
    // yellow bar — but a few (e.g. the homepage hero modal) are tall,
    // setting-dense, and rely on the global bar so the visitor isn't
    // forced to scroll to the bottom for the Save button.
    if (form.closest('.modal') && !form.matches('[data-fe-savebar]')) return false;
    // Skip the dashboard's auto-submitting toggle (clicking it navigates the
    // page itself; nothing for us to track).
    if (form.matches('[data-fe-auto-submit]')) return false;
    return true;
  }

  function instrument(form) {
    if (form.__feSaveBound) return;
    form.__feSaveBound = true;
    const onChange = () => { dirty.add(form); show(); };
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);
    // Adding or removing form fields inside the form (clicking × on a
    // row, "+ Add column", "+ Add link", etc.) is a meaningful "unsaved
    // change" too — but those interactions only fire `click` events,
    // which the form's input/change listeners never see. A MutationObserver
    // on the form's subtree catches childList changes that add or remove
    // anything containing `input`/`select`/`textarea` and treats them as
    // a dirty event. Filtered to field-bearing mutations so style/class
    // toggles + transient JS chrome don't flap the bar.
    if (window.MutationObserver) {
      const mo = new MutationObserver(records => {
        for (const r of records) {
          for (const n of r.addedNodes) {
            if (n.nodeType === 1 &&
                (n.matches && n.matches('input, select, textarea') ||
                 n.querySelector && n.querySelector('input, select, textarea'))) {
              onChange(); return;
            }
          }
          for (const n of r.removedNodes) {
            if (n.nodeType === 1 &&
                (n.matches && n.matches('input, select, textarea') ||
                 n.querySelector && n.querySelector('input, select, textarea'))) {
              onChange(); return;
            }
          }
        }
      });
      mo.observe(form, { childList: true, subtree: true });
    }
  }
  main.querySelectorAll('form').forEach(f => { if (trackable(f)) instrument(f); });

  // Opt-in: a form marked [data-fe-savebar-force] surfaces the save bar on
  // load, before any edit — e.g. a freshly-created form stub the operator
  // should be able to save straight away. We seed it into the dirty set so
  // the Save click actually POSTs it (an empty dirty set would just hide).
  main.querySelectorAll('form[data-fe-savebar-force]').forEach(f => {
    if (trackable(f)) { dirty.add(f); show(); }
  });

  // Some forms are spliced in later (e.g. mega menu blocks via fetch); pick
  // them up via a MutationObserver so they participate too.
  const mo = new MutationObserver(records => {
    for (const r of records) {
      r.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'FORM' && trackable(n)) instrument(n);
        n.querySelectorAll && n.querySelectorAll('form').forEach(f => {
          if (trackable(f)) instrument(f);
        });
      });
    }
  });
  mo.observe(main, { childList: true, subtree: true });

  btn && btn.addEventListener('click', async () => {
    if (!dirty.size) { hide(); return; }
    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = 'Saving…';
    const forms = [...dirty];
    // When every dirty form lives inside a modal we skip the post-save
    // reload — the visitor opened the modal to edit one block and would
    // be jarred by it disappearing on save. Bar just animates out and
    // the modal stays in front, so they can keep tweaking and re-save.
    // Also stay open when ANY modal is currently visible — the page
    // builder's Edit-layout modal re-dispatches its block-editor inputs
    // onto the outer page form (so the form itself looks "non-modal"
    // even though the visitor is actively working inside a modal panel).
    const stayOpen = forms.every(f => f.closest('.modal')) ||
                     !!document.querySelector('.modal.open');
    try {
      for (const f of forms) {
        const fd = new FormData(f);
        const r = await fetch(f.action || window.location.href, {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        });
        if (!r.ok) throw new Error('save failed: ' + r.status);
      }
      msg.textContent = 'Saved';
      if (stayOpen) {
        // Drop the dirty set + reset the bar's chrome BEFORE the
        // animation runs so the next field change immediately re-arms
        // the bar (rather than the user finding themselves stuck on
        // "Saved" with the button disabled).
        dirty.clear();
        const finish = () => {
          bar.hidden = true;
          bar.classList.remove('is-leaving');
          msg.textContent = 'Unsaved changes';
          btn.disabled = false;
          btn.textContent = origLabel;
        };
        bar.addEventListener('animationend', finish, { once: true });
        bar.classList.add('is-leaving');
        // Safety net for reduced-motion / hidden-tab cases where
        // animationend never fires.
        setTimeout(finish, 360);
      } else {
        // Non-modal forms reload so server-normalised values (clamps,
        // sanitisation, redirects) flow back into the rendered fields.
        const reload = () => window.location.reload();
        bar.addEventListener('animationend', reload, { once: true });
        bar.classList.add('is-leaving');
        setTimeout(reload, 360);
      }
    } catch (_) {
      btn.disabled = false;
      btn.textContent = origLabel;
      msg.textContent = 'Save failed — try again';
    }
  });
})();


// ── SAVE BAR ⇄ OPEN MODAL DOCKING ──────────────────────────────────────────
// The frontend admin's yellow bar is fixed to the subnav column, which is
// exactly where you're NOT looking while a block-editor modal is open —
// and it sits behind the backdrop blur besides. While a modal is open
// and the bar is showing, pin it to the modal panel's lower-left corner
// instead. Coordinates are written inline from the panel's rect (rather
// than reparenting the bar into the modal) so the feSaveBar handler,
// the is-leaving animation, and the `hidden` toggling all keep working
// on the same element. Re-placed on: modal open/close, bar show/hide,
// window resize, and the panel changing size as its content loads.
(function feSaveBarModalDock(){
  const bar = document.getElementById('fe-save-bar') || document.getElementById('footer-save-bar');
  if (!bar) return;
  const PAD = 16;
  let ro = null, watched = null;

  // Modals that carry their own Done/Cancel footer AND sit on top of a
  // modal that owns the save (the dynbg picker opens from the hero /
  // block modal, and its Done hands the config back to that modal's
  // form). Showing the yellow bar there offers a second, redundant
  // save affordance for a dialog the visitor hasn't finished with, so
  // the bar is suppressed for as long as one is on top.
  const SUPPRESS_IN = '#dynbg-picker-modal';
  function topModal(){
    const open = document.querySelectorAll('.modal.open');
    // Last opened wins — pickers (icon / media) open on top of block modals.
    return open[open.length - 1] || null;
  }
  function openPanel(){
    const m = topModal();
    return m ? m.querySelector('.modal-panel') : null;
  }
  function suppressed(){
    const m = topModal();
    return !!(m && m.matches(SUPPRESS_IN));
  }
  function watch(panel){
    if (watched === panel) return;
    if (ro) { ro.disconnect(); ro = null; }
    if (watched) watched.removeEventListener('transitionend', place);
    watched = panel;
    if (!panel) return;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(place);
      ro.observe(panel);
    }
    // The panel slides in on a transform transition when the modal
    // opens; a rect read mid-slide lands the bar a few px low. Neither
    // observer sees a transform settle, so re-place on transitionend
    // (with a timer fallback for reduced-motion / no-transition cases).
    panel.addEventListener('transitionend', place);
    setTimeout(place, 260);
  }
  function undock(){
    watch(null);
    if (!bar.classList.contains('is-in-modal')) return;
    bar.classList.remove('is-in-modal');
    bar.style.left = '';
    bar.style.bottom = '';
  }
  function place(){
    // Hide (don't clear) the bar while a self-saving picker is on top;
    // the dirty state is preserved, so it reappears intact on close.
    const hide = suppressed();
    if (bar.classList.contains('is-suppressed') !== hide) {
      bar.classList.toggle('is-suppressed', hide);
    }
    if (hide) { undock(); return; }
    const panel = openPanel();
    if (!panel || bar.hidden) { undock(); return; }
    const r = panel.getBoundingClientRect();
    if (!r.width) { undock(); return; }
    watch(panel);
    // Only write when something actually changes. classList.add() of a
    // token that's already present still rewrites the attribute — and
    // that fires a mutation record — so an unconditional add here would
    // re-trigger the observer below in a microtask loop and hang the
    // page.
    if (!bar.classList.contains('is-in-modal')) bar.classList.add('is-in-modal');
    const left = Math.round(r.left + PAD) + 'px';
    const bottom = Math.round(window.innerHeight - r.bottom + PAD) + 'px';
    if (bar.style.left !== left) bar.style.left = left;
    if (bar.style.bottom !== bottom) bar.style.bottom = bottom;
  }

  // Modal open/close is a class flip on the .modal; bar show/hide is the
  // `hidden` attribute (plus is-leaving). One observer covers both.
  const mo = new MutationObserver(records => {
    for (const rec of records) {
      const t = rec.target;
      if (t === bar || (t.classList && t.classList.contains('modal'))) { place(); return; }
    }
  });
  mo.observe(document.body, { attributes: true, subtree: true,
                              attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', place);
  place();
})();

// ── ICON PICKER MODAL ───────────────────────────────────────────────────────
// Triggered by any button with [data-open-icon-picker]. The trigger stores
// selector strings pointing at the hidden icon-name, color, and size inputs
// it should write back into. Two sources feed the grid: the Lucide catalog
// JSON (bundled, fetched once and cached) and the user's Custom icons
// (server-backed list plus upload/delete endpoints).
(function () {
  const modal = document.getElementById("icon-picker-modal");
  if (!modal) return;

  const DEFAULT_SIZE = 20;
  const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  let catalog = null;             // Lucide JSON
  let catalogPromise = null;
  let customIcons = [];           // array of {id, name, url, ref}
  let customPromise = null;

  let activeTrigger = null;
  let activeField = null;
  let activeIconInput = null;
  let activeColorInput = null;
  let activeSizeInput = null;
  let activePreview = null;
  let pendingRef = "";   // deferred-commit: icon ref currently highlighted in the grid

  const catalogUrl = modal.getAttribute("data-catalog-url");
  const customListUrl = modal.getAttribute("data-custom-list-url");
  const customUploadUrl = modal.getAttribute("data-custom-upload-url");
  const customDeleteUrlTpl = modal.getAttribute("data-custom-delete-url"); // ends with /0/delete
  const csrfToken = modal.getAttribute("data-csrf-token");

  const searchEl = modal.querySelector("[data-icon-search]");
  const catalogEl = modal.querySelector("[data-icon-catalog]");
  const modalSizeEl = modal.querySelector("[data-icon-modal-size]");
  const modalSizeOut = modal.querySelector("[data-icon-size-out]");
  const uploadInput = modal.querySelector("[data-icon-upload]");
  const removeBtn = modal.querySelector("[data-icon-picker-remove]");
  const saveBtn = modal.querySelector("[data-icon-picker-save]");

  function renderSvg(paths) {
    return '<svg class="icon" ' + SVG_ATTRS + '>' + paths + '</svg>';
  }
  function renderCustom(ci) {
    return '<img class="icon icon-custom" src="' + escapeAttr(ci.url) +
           '" alt="' + escapeAttr(ci.name) + '">';
  }

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch(catalogUrl, { credentials: "same-origin" })
      .then(r => r.json())
      .then(data => { catalog = data; return data; })
      .catch(() => null);
    return catalogPromise;
  }

  function loadCustom() {
    if (customPromise) return customPromise;
    customPromise = fetch(customListUrl, { credentials: "same-origin" })
      .then(r => r.json())
      .then(data => { customIcons = data.icons || []; return customIcons; })
      .catch(() => { customIcons = []; return customIcons; });
    return customPromise;
  }

  function findIcon(ref) {
    if (!ref) return null;
    if (ref.indexOf("custom:") === 0) {
      const ci = customIcons.find(x => x.ref === ref);
      return ci ? { kind: "custom", data: ci } : null;
    }
    for (const cat of (catalog && catalog.categories) || []) {
      for (const ic of cat.icons || []) {
        if (ic.name === ref) return { kind: "lucide", data: ic };
      }
    }
    return null;
  }

  function renderIconHtml(found) {
    if (!found) return "";
    return found.kind === "custom" ? renderCustom(found.data) : renderSvg(found.data.paths);
  }
  // Public helper: given an icon ref ("calendar", "custom:my-logo", etc.),
  // return the SVG HTML that the icon picker's preview would show.
  // Useful for re-painting previews when a host (page_features_modal.js etc.)
  // populates icon hidden-input values from saved data — the hidden input
  // alone can't render an SVG, but this helper resolves the ref against
  // the live picker catalog (Lucide + admin uploads) and hands back the
  // exact markup. Returns empty string for unknown refs.
  window.tspRenderIconHtml = function (ref) {
    return renderIconHtml(findIcon(ref));
  };

  function buildGrid(filter) {
    const q = (filter || "").trim().toLowerCase();
    const html = [];

    function cellSelectedCls(ref) {
      return ref && ref === pendingRef ? " is-selected" : "";
    }

    // Custom icons first (so uploads are easy to find).
    const customMatching = customIcons.filter(ic =>
      !q || ic.name.toLowerCase().indexOf(q) !== -1);
    if (customMatching.length) {
      html.push('<div class="icon-picker-group">');
      html.push('<div class="icon-picker-group-title">Your uploads</div>');
      html.push('<div class="icon-picker-grid">');
      for (const ci of customMatching) {
        html.push(
          '<div class="icon-picker-cell is-custom' + cellSelectedCls(ci.ref) +
          '" data-icon-ref="' + escapeAttr(ci.ref) +
          '" title="' + escapeAttr(ci.name) + '">' +
          '<button type="button" class="icon-picker-cell-del" data-custom-delete="' +
          ci.id + '" title="Delete">&times;</button>' +
          renderCustom(ci) +
          '<span class="icon-picker-cell-label">' + escapeHtml(ci.name) + '</span>' +
          '</div>'
        );
      }
      html.push('</div></div>');
    }

    // Built-in Lucide icons by category.
    for (const cat of (catalog && catalog.categories) || []) {
      const matching = [];
      for (const ic of (cat.icons || [])) {
        const hay = (ic.name + " " + (ic.keywords || "")).toLowerCase();
        if (!q || hay.indexOf(q) !== -1) matching.push(ic);
      }
      if (!matching.length) continue;
      html.push('<div class="icon-picker-group">');
      html.push('<div class="icon-picker-group-title">' + escapeHtml(cat.name) + '</div>');
      html.push('<div class="icon-picker-grid">');
      for (const ic of matching) {
        html.push(
          '<button type="button" class="icon-picker-cell' + cellSelectedCls(ic.name) +
          '" data-icon-ref="' +
          escapeAttr(ic.name) + '" title="' + escapeAttr(ic.name) + '">' +
          renderSvg(ic.paths) +
          '<span class="icon-picker-cell-label">' + escapeHtml(ic.name) + '</span>' +
          '</button>'
        );
      }
      html.push('</div></div>');
    }

    if (!html.length) {
      catalogEl.innerHTML = '<p class="muted smaller" style="padding: 16px;">No icons match “' +
        escapeHtml(q) + '”.</p>';
    } else {
      catalogEl.innerHTML = html.join("");
    }
    applyModalSize();
  }

  function applyModalSize() {
    const s = modalSizeEl && parseInt(modalSizeEl.value, 10);
    if (modalSizeOut) modalSizeOut.textContent = s || DEFAULT_SIZE;
    if (!catalogEl) return;
    catalogEl.style.setProperty("--icon-size", (s || DEFAULT_SIZE) + "px");
  }

  function refreshSelectedCell(newRef) {
    // Update cell highlight in the grid without rebuilding the whole thing.
    catalogEl.querySelectorAll(".icon-picker-cell.is-selected").forEach(el =>
      el.classList.remove("is-selected"));
    if (newRef) {
      const cell = catalogEl.querySelector(
        '.icon-picker-cell[data-icon-ref="' + CSS.escape(newRef) + '"]');
      if (cell) cell.classList.add("is-selected");
    }
    pendingRef = newRef || "";
    if (saveBtn) saveBtn.disabled = !pendingRef;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function openPicker(trigger) {
    activeTrigger = trigger;
    activeField = trigger.closest("[data-icon-field]");
    const iconSel = trigger.getAttribute("data-icon-target");
    const colorSel = trigger.getAttribute("data-color-target");
    const sizeSel = trigger.getAttribute("data-size-target");
    activeIconInput = iconSel ? document.querySelector(iconSel) : null;
    activeColorInput = colorSel ? document.querySelector(colorSel) : null;
    activeSizeInput = sizeSel ? document.querySelector(sizeSel) : null;
    // Fallback: when a trigger has no `data-icon-target` (e.g. cloned
    // utility-bar rows that can't carry stable global IDs), the hidden
    // input lives inside the same [data-icon-field] wrapper and is
    // tagged with [data-icon-input]. This keeps the picker generic
    // without forcing every host template to mint unique IDs.
    if (!activeIconInput && activeField) {
      activeIconInput = activeField.querySelector("[data-icon-input]");
    }
    activePreview = trigger.querySelector("[data-icon-preview]");

    const storedSize = activeSizeInput && parseInt(activeSizeInput.value, 10);
    modalSizeEl.value = (storedSize && storedSize > 0) ? storedSize : DEFAULT_SIZE;
    pendingRef = (activeIconInput && activeIconInput.value) || "";
    if (saveBtn) saveBtn.disabled = !pendingRef;
    applyModalSize();
    searchEl.value = "";

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    searchEl.focus();

    Promise.all([loadCatalog(), loadCustom()]).then(() => buildGrid(""));
  }

  function closePicker() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    activeTrigger = null;
    activeField = null;
    activeIconInput = null;
    activeColorInput = null;
    activeSizeInput = null;
    activePreview = null;
  }

  function dispatchChange(el) {
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyIconSelection(ref, found, opts) {
    opts = opts || {};
    if (activeIconInput) {
      activeIconInput.value = ref || "";
      dispatchChange(activeIconInput);
    }
    // Color is no longer chosen here — the picker always clears the hidden
    // color field so the rendered icon inherits whatever colour the
    // surrounding theme/CSS dictates (currentColor on Lucide SVGs). Per-link
    // color overrides that live OUTSIDE the picker (e.g. nav-link
    // override_color / custom_color) are unaffected.
    if (activeColorInput) {
      activeColorInput.value = "";
      dispatchChange(activeColorInput);
    }
    if (activeSizeInput) {
      if (opts.clear || !ref) {
        activeSizeInput.value = "";
      } else {
        activeSizeInput.value = (modalSizeEl && modalSizeEl.value) || DEFAULT_SIZE;
      }
      dispatchChange(activeSizeInput);
    }
    if (activePreview) {
      activePreview.innerHTML = ref ? renderIconHtml(found) : "";
      activePreview.style.color = "";
      const storedSize = activeSizeInput && activeSizeInput.value;
      if (storedSize) activePreview.style.setProperty("--icon-size", storedSize + "px");
      else activePreview.style.removeProperty("--icon-size");
    }
    if (activeField) {
      activeField.classList.toggle("has-icon", !!ref);
    }
  }

  // Wire triggers (event delegation so templates added via AJAX still work).
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-open-icon-picker]");
    if (trigger) { e.preventDefault(); openPicker(trigger); return; }
    const clear = e.target.closest("[data-icon-clear]");
    if (clear) {
      e.preventDefault();
      const fieldWrap = clear.closest("[data-icon-field]");
      if (!fieldWrap) return;
      // Two ways the inputs can be located: (1) the original nav-link
      // shape uses block-field-named hidden inputs co-located in the
      // wrapper, (2) other call sites just provide a sibling
      // [data-open-icon-picker] trigger whose target selectors point
      // at hidden inputs anywhere in the form. Resolve via the trigger
      // first, then fall back to the wrapper-local lookup.
      const trigger = fieldWrap.querySelector("[data-open-icon-picker]");
      let iconHidden = null, colorHidden = null, sizeHidden = null;
      if (trigger) {
        const iconSel = trigger.getAttribute("data-icon-target");
        const colorSel = trigger.getAttribute("data-color-target");
        const sizeSel = trigger.getAttribute("data-size-target");
        if (iconSel) iconHidden = document.querySelector(iconSel);
        if (colorSel) colorHidden = document.querySelector(colorSel);
        if (sizeSel) sizeHidden = document.querySelector(sizeSel);
      }
      if (!iconHidden) {
        iconHidden = fieldWrap.querySelector("[data-icon-input]")
                  || fieldWrap.querySelector('input[type="hidden"][data-block-field="icon_before"], input[type="hidden"][data-block-field="icon_after"]');
      }
      if (!colorHidden) {
        colorHidden = fieldWrap.querySelector('input[type="hidden"][data-block-field$="_color"]');
      }
      if (!sizeHidden) {
        sizeHidden = fieldWrap.querySelector('input[type="hidden"][data-block-field$="_size"]');
      }
      const preview = fieldWrap.querySelector("[data-icon-preview]");
      if (iconHidden) { iconHidden.value = ""; dispatchChange(iconHidden); }
      if (colorHidden) { colorHidden.value = ""; dispatchChange(colorHidden); }
      if (sizeHidden) { sizeHidden.value = ""; dispatchChange(sizeHidden); }
      if (preview) {
        preview.innerHTML = "";
        preview.style.color = "";
        preview.style.removeProperty("--icon-size");
      }
      fieldWrap.classList.remove("has-icon");
      return;
    }
  });

  // Modal internals.
  catalogEl.addEventListener("click", async (e) => {
    const delBtn = e.target.closest("[data-custom-delete]");
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cid = delBtn.getAttribute("data-custom-delete");
      if (!confirm("Delete this custom icon? It will be removed from every link that uses it.")) return;
      const url = customDeleteUrlTpl.replace(/\/0\/delete$/, "/" + cid + "/delete");
      try {
        const r = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-CSRFToken": csrfToken },
        });
        if (!r.ok) throw new Error("delete failed");
        customIcons = customIcons.filter(ci => String(ci.id) !== String(cid));
        buildGrid(searchEl.value);
      } catch (_) {
        (window.tspShowToast || alert)("Could not delete icon");
      }
      return;
    }
    const cell = e.target.closest("[data-icon-ref]");
    if (!cell) return;
    // Deferred commit: clicking a cell only highlights it. The color and size
    // sliders update the grid preview live but don't touch the nav-link field
    // until the user clicks Save.
    refreshSelectedCell(cell.getAttribute("data-icon-ref"));
  });

  searchEl.addEventListener("input", () => buildGrid(searchEl.value));
  modalSizeEl.addEventListener("input", () => applyModalSize());

  // Upload flow — POST the chosen file, splice into `customIcons`, redraw grid.
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("icon", file);
    fd.append("csrf_token", csrfToken);
    try {
      const r = await fetch(customUploadUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRFToken": csrfToken },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        (window.tspShowToast || alert)(data.error || "Upload failed");
      } else {
        customIcons.unshift(data.icon);
        buildGrid(searchEl.value);
        // Broadcast so pages that show the icon library (e.g. Fonts & Icons)
        // can refresh their tile grid without depending on this module's state.
        document.dispatchEvent(new CustomEvent("frontend-icon:uploaded", { detail: data.icon }));
      }
    } catch (_) {
      (window.tspShowToast || alert)("Upload failed");
    } finally {
      uploadInput.value = "";
    }
  });

  removeBtn.addEventListener("click", () => {
    applyIconSelection("", null, { clear: true });
    closePicker();
  });

  if (saveBtn) saveBtn.addEventListener("click", () => {
    if (!pendingRef) return;
    applyIconSelection(pendingRef, findIcon(pendingRef));
    closePicker();
  });

  modal.querySelectorAll("[data-close]").forEach(el =>
    el.addEventListener("click", closePicker));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closePicker();
    }
  });
})();


// ── SIDEBAR ORDER (Settings → Appearance) ────────────────────────────
// Mode radio toggles the manual drag-drop panel's visibility. Inside
// manual mode, two drag scopes: sections (whole groups) and items
// inside Main/Admin. After every drop, serialize the current order
// into the hidden JSON input so the form save persists exactly what
// the admin sees.
(function feSidebarOrder() {
  const form = document.getElementById("sidebar-order-form");
  if (!form) return;

  const manualWrap = form.querySelector("[data-sidebar-manual]");
  const sectionList = form.querySelector("[data-sidebar-section-list]");
  const orderInput = form.querySelector("[data-sidebar-order-json]");
  if (!manualWrap || !sectionList || !orderInput) return;

  // Mode radios — show/hide the manual panel.
  form.querySelectorAll('input[name="sidebar_sort_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      manualWrap.hidden = r.value !== "manual";
    });
  });

  // Helpers ----------------------------------------------------------
  // Seed pass writes the canonical JSON shape into the hidden input
  // without dispatching an event, so the settings modal's save bar
  // doesn't latch dirty before any user interaction. Subsequent calls
  // (after dragstart/dragover/drop) DO dispatch when the value moves.
  let _seeded = false;
  function serialize() {
    const sections = [...sectionList.querySelectorAll(":scope > .sidebar-order-section")]
      .map(sec => sec.getAttribute("data-section-key"));
    const out = { sections };
    ["main", "intergroup"].forEach(scope => {
      const ul = sectionList.querySelector('[data-section-items="' + scope + '"]');
      if (!ul) return;
      out[scope] = [...ul.querySelectorAll(':scope > .sidebar-order-item')]
        .map(li => li.getAttribute("data-item-key"));
    });
    const next = JSON.stringify(out);
    if (orderInput.value !== next) {
      orderInput.value = next;
      // Programmatic value writes don't fire input/change — dispatch one
      // so the settings modal's save bar picks up the new dirty state.
      // Skipped on the initial seed: the rendered hidden value rarely
      // matches what serialize() rebuilds from the DOM (different key
      // ordering / missing keys), so dispatching on the seed would
      // make the bar appear the moment the modal opens.
      if (_seeded) {
        orderInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
  // Seed once on load so the hidden input is in sync with the rendered
  // list even before the admin drags anything.
  serialize();
  _seeded = true;

  // Generic drag-drop wiring for sections + items. Browsers won't let
  // you mix two scopes by default; here `dragging` carries the active
  // scope so we know which targets accept the drop.
  let dragging = null;
  function within(el, selector) { return el.closest(selector); }

  sectionList.addEventListener("dragstart", e => {
    const item = within(e.target, ".sidebar-order-item");
    const sec = within(e.target, ".sidebar-order-section");
    if (item) {
      dragging = { kind: "item", el: item, scope: item.parentElement.getAttribute("data-section-items") };
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "item:" + item.getAttribute("data-item-key"));
    } else if (sec) {
      dragging = { kind: "section", el: sec };
      sec.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "section:" + sec.getAttribute("data-section-key"));
    }
  });

  sectionList.addEventListener("dragend", () => {
    if (dragging && dragging.el) dragging.el.classList.remove("dragging");
    dragging = null;
    serialize();
  });

  sectionList.addEventListener("dragover", e => {
    if (!dragging) return;
    if (dragging.kind === "item") {
      const ul = within(e.target, '[data-section-items="' + dragging.scope + '"]');
      if (!ul) return;
      e.preventDefault();
      const after = [...ul.querySelectorAll(':scope > .sidebar-order-item:not(.dragging)')]
        .find(li => e.clientY < li.getBoundingClientRect().top + li.offsetHeight / 2);
      if (after) ul.insertBefore(dragging.el, after);
      else ul.appendChild(dragging.el);
    } else if (dragging.kind === "section") {
      // Section-level drag: the only valid drop targets are other
      // sections at the top level of the section list.
      const sec = within(e.target, ".sidebar-order-section");
      if (!sec || sec === dragging.el) return;
      e.preventDefault();
      const after = e.clientY < sec.getBoundingClientRect().top + sec.offsetHeight / 2;
      if (after) sectionList.insertBefore(dragging.el, sec);
      else sectionList.insertBefore(dragging.el, sec.nextSibling);
    }
  });

  sectionList.addEventListener("drop", e => {
    if (!dragging) return;
    e.preventDefault();
    serialize();
  });

  // Re-serialize on every input event in case the admin uses keyboard
  // reordering in a future iteration; harmless either way.
  form.addEventListener("submit", serialize);
})();

// Category editor on a library's settings page: row
// add/remove. New rows are cloned from a hidden template element so
// the markup stays in the Jinja template.
(function () {
  document.querySelectorAll("[data-ig-cat-editor]").forEach(editor => {
    const rows = editor.querySelector("[data-ig-cat-rows]");
    const tmpl = editor.querySelector("[data-ig-cat-template]");
    const addBtn = editor.querySelector("[data-ig-cat-add]");
    if (!rows || !tmpl || !addBtn) return;
    // Native <template> stores parsed children inside .content (a
    // DocumentFragment) where they're inert — required fields inside
    // it don't block form submit. Fall back to direct querySelector
    // for older bespoke setups that wrap the proto in a plain div.
    const source = tmpl.content || tmpl;
    const protoRow = source.querySelector("[data-ig-cat-row]");
    if (!protoRow) return;

    function bindRemove(row) {
      const rm = row.querySelector("[data-ig-cat-remove]");
      if (!rm) return;
      rm.addEventListener("click", () => row.remove());
    }

    rows.querySelectorAll("[data-ig-cat-row]").forEach(bindRemove);

    addBtn.addEventListener("click", () => {
      const fresh = protoRow.cloneNode(true);
      // Defensive clear — the template ships with empty values, but
      // cloneNode preserves whatever live state the source happens to
      // hold (older HTML editors sometimes prefill text inputs).
      fresh.querySelectorAll("input").forEach(i => {
        if (i.type === "hidden" || i.type === "text") i.value = "";
      });
      rows.appendChild(fresh);
      bindRemove(fresh);
      const text = fresh.querySelector("input[type='text']");
      if (text) text.focus();
    });
  });
})();


// ── Dynamic-background picker (shared admin modal) ─────────────────
//
// One global modal lives in base.html (`#dynbg-picker-modal`). Any
// admin form that wants a dynbg control drops in the
// `dynbg_trigger(...)` macro, which renders a hidden input + a
// trigger button. The handler below pairs trigger clicks with the
// modal: it copies the trigger's current selection into the modal's
// radios on open, then writes the chosen key back to the trigger's
// hidden input on Save (and updates the trigger's preview thumbnail
// + name so the form reflects the new state without a reload).
//
// One trigger is "active" at a time — the handler stashes a ref to
// the trigger in modal-scoped state on open and consumes it on Save
// / Clear / Cancel. Multiple triggers on the same page work without
// any extra wiring; each trigger carries `data-dynbg-trigger-input`
// pointing at its own hidden input, so the modal always knows which
// field to update.
(function dynbgPickerHandler () {
  // Lazy DOM lookup. The modal markup lives near the bottom of
  // <body> — AFTER the <script src="app.js"> tag — so caching at
  // script-load time would resolve to null. Every reference is
  // re-fetched inside the click handlers so the IIFE is order-
  // independent.
  function getModal () { return document.getElementById('dynbg-picker-modal'); }
  function $$  (sel)  { const m = getModal(); return m ? m.querySelectorAll(sel) : []; }
  function $   (sel)  { const m = getModal(); return m ? m.querySelector(sel) : null; }

  // The trigger currently bound to the modal. Reset on close.
  let activeTrigger = null;
  // Modal-internal listeners (Save / Clear / X / backdrop / cards /
  // tabs / colours) bind on first open so the modal element is
  // guaranteed to be in the DOM by then.
  let wired = false;

  // ── Background grid ────────────────────────────────────────────
  // Knob values pending for the NEXT setSelectedKey render — set by the
  // open handler from the trigger's saved knobs, consumed once so a
  // later manual card click rebuilds knobs at their defaults.
  let _pendingKnobs = null;
  function setSelectedKey (key) {
    $$('[data-dynbg-modal-card]').forEach(card => {
      const isMatch = (card.dataset.dynbgKey || '') === (key || '');
      card.classList.toggle('active', isMatch);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isMatch;
    });
    // Show the Freeze-movement toggle only when the active preset
    // actually animates. Static presets (dotted-grid, diagonal-lines)
    // hide the row entirely.
    syncAnimRowVisibility(key || '');
    // Per-preset capability gate: hide controls that don't apply, and
    // (re)build this preset's knob sliders.
    syncOptionVisibility(key || '');
    renderKnobs(key || '', _pendingKnobs);
    _pendingKnobs = null;
    updatePreview();
  }
  // Currently-selected base preset key (the active card, '' for None).
  function selectedKey () {
    const c = $('[data-dynbg-modal-card].active');
    return c ? (c.dataset.dynbgKey || '') : '';
  }
  // ── Per-mode column helpers ────────────────────────────────────
  // Everything colour / tone / texture related lives twice in the
  // Options tab — once per mode column (`[data-dynbg-mode="light"]` /
  // `"dark"`). These helpers scope a lookup to one column.
  const MODES = ['light', 'dark'];
  // Palette width, mirroring dynbg.MAX_COLOR_SLOTS. Most presets show
  // 1-3; the pattern preset uses all five (three inks + backdrop pair).
  const SLOTS = [1, 2, 3, 4, 5, 6];
  // The `*-classic` catalog entries are the pre-rework recipes kept
  // under their own keys (see the "Classic recipes" block in
  // app/dynbg.py). They render the same inner shape as the preset they
  // mirror, so anything keyed off the SHAPE — random positions, the
  // knob-row legend — resolves through the family, while anything keyed
  // off the ENTRY (caps, catalog lookups, saved values) keeps the real
  // key. Mirrors the same suffix strip in dynbg.random_positions.
  function presetFamily (key) {
    return String(key || '').replace(/-classic$/, '');
  }
  function modeCol (mode) { return $('[data-dynbg-mode="' + mode + '"]'); }
  function m$ (mode, sel) { const c = modeCol(mode); return c ? c.querySelector(sel) : null; }
  function m$$ (mode, sel) { const c = modeCol(mode); return c ? c.querySelectorAll(sel) : []; }
  // Currently-selected overlay key for a mode ('' for None).
  function selectedOverlay (mode) {
    const c = m$(mode, '[data-dynbg-mode-overlay-card].active');
    return c ? (c.dataset.dynbgOverlayKey || '') : '';
  }
  // ── Classic-recipe fallback (JS twin of dynbg.render_key) ──────
  // A saved config with no version stamp and no per-mode block was
  // written before the light/dark rework, so it renders with the
  // `-classic` twin of whatever preset it names. Kept in step with the
  // Python side by construction: the twin only counts if the catalog
  // (rendered from dynbg.CATALOG) actually has a card for it.
  const CONFIG_VERSION = 2;
  function isLegacyConfig (raw) {
    if (!raw) return true;
    let o = raw;
    if (typeof o === 'string') {
      try { o = JSON.parse(o); } catch (_) { return true; }
    }
    if (!o || typeof o !== 'object') return true;
    // Accept both the config shape (`v` / `modes`) and the block-data
    // shape (`bg_dynbg_v` / `bg_dynbg_modes`) — same two facts, two
    // storage layouts.
    if (o.v || o.bg_dynbg_v) return false;
    let modes = o.modes || o.bg_dynbg_modes;
    if (typeof modes === 'string') {
      try { modes = JSON.parse(modes); } catch (_) { modes = null; }
    }
    return !(modes && typeof modes === 'object' && (modes.light || modes.dark));
  }
  function renderKeyFor (key, rawCfg) {
    key = String(key || '');
    if (!key) return '';
    const twin = key + '-classic';
    if (!document.querySelector('[data-dynbg-key="' + CSS.escape(twin) + '"]')) return key;
    return isLegacyConfig(rawCfg) ? twin : key;
  }

  function entryByKey (key) {
    if (!key) return null;
    const card = $('[data-dynbg-key="' + CSS.escape(key) + '"]');
    if (!card) return null;
    const name = card.querySelector('.fe-dynbg-picker-name');
    const thumb = card.querySelector('.fe-dynbg-picker-thumb');
    return {
      key,
      name: name ? name.textContent.trim() : key,
      thumbHtml: thumb ? thumb.innerHTML : '',
    };
  }

  // ── Per-preset capability spec + knob engine ───────────────────
  // The Options panel stamps two JSON blobs: the per-preset caps
  // (which controls apply to each background + each preset's knob
  // sliders) and the per-overlay Size/Intensity spec. Parsed once.
  let _caps = null, _ovKnobSpec = null;
  function caps () {
    if (_caps) return _caps;
    const p = $('[data-dynbg-modal-panel="options"]');
    try { _caps = p ? JSON.parse(p.dataset.dynbgPresetCaps || '{}') : {}; }
    catch (_) { _caps = {}; }
    return _caps;
  }
  function overlayKnobSpec () {
    if (_ovKnobSpec) return _ovKnobSpec;
    const p = $('[data-dynbg-modal-panel="options"]');
    try { _ovKnobSpec = p ? JSON.parse(p.dataset.dynbgOverlayKnobs || '{}') : {}; }
    catch (_) { _ovKnobSpec = {}; }
    return _ovKnobSpec;
  }
  function capFor (key) {
    return caps()[key] || { colors: 0, randomize_positions: false, animate: false, knobs: [] };
  }

  // Live per-preset knob VALUES for the active preset, keyed by knob
  // key. Rebuilt by renderKnobs() on selection; read by getKnobs().
  let _knobState = {};
  // Map a preset's knob VALUES onto its CSS custom properties, using the
  // same unit rules as dynbg.knobs_to_css_vars on the server (so a live
  // preview paints exactly what the saved render will). Returns an array
  // of "--var: value;" strings — shared by the picker's own preview and,
  // via window.dynbgKnobVars, by out-of-modal previews (the hero modal).
  function knobVarParts (key, values) {
    const spec = (capFor(key).knobs) || [];
    const out = [];
    spec.forEach(k => {
      if (!k.css_var) return;
      const v = values ? values[k.key] : null;
      if (v == null) return;
      // Enumerated knobs stamp whatever CSS their chosen option
      // declares (e.g. "gradient" supplies the second gradient stop).
      if (k.kind === 'select') {
        const opt = (k.options || []).find(o => o.value === v);
        if (opt && opt.css) out.push(k.css_var + ': ' + opt.css + ';');
        return;
      }
      if (isNaN(v)) return;
      if (k.unit === 'deg') out.push(k.css_var + ': ' + v + 'deg;');
      else if (k.unit === 'px') out.push(k.css_var + ': ' + v + 'px;');
      else if (k.unit === '%') out.push(k.css_var + ': ' + (v / 100) + ';');
      else out.push(k.css_var + ': ' + v + ';');
    });
    return out;
  }
  // All CSS custom properties a preset's knobs can stamp — lets a
  // consumer clear stale vars before re-applying.
  function knobVarNames (key) {
    return ((capFor(key).knobs) || []).map(k => k.css_var).filter(Boolean);
  }

  // Build a help chip matching _help_chip.html's `chip()` macro, for the
  // knob rows this file renders in JS. The Lucide `info` glyph is only
  // available server-side, so the button is cloned from a chip the
  // template already rendered into this modal; without one (shouldn't
  // happen — the tab strip has one) we fall back to the prose inline.
  function makeChip (label, html) {
    const proto = $('.heading-help .help-btn');
    if (!proto) return null;
    const wrap = document.createElement('span');
    wrap.className = 'heading-help field-help';
    const btn = proto.cloneNode(true);
    btn.setAttribute('aria-label', 'About ' + label);
    const tip = document.createElement('span');
    tip.className = 'help-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.innerHTML = html;
    wrap.appendChild(btn);
    wrap.appendChild(tip);
    return wrap;
  }
  // Rebuild the per-preset knob sliders for `key` from its spec, seeding
  // each from `values` (saved) or the spec default. Hides the fieldset
  // when the preset declares no knobs.
  function renderKnobs (key, values) {
    const row = $('#dynbg-picker-modal-knobs-row');
    const host = $('#dynbg-picker-modal-knobs');
    const legend = $('[data-dynbg-knobs-legend]');
    if (!row || !host) return;
    const spec = (capFor(key).knobs) || [];
    host.innerHTML = '';
    _knobState = {};
    if (!spec.length) { row.hidden = true; return; }
    row.hidden = false;
    if (legend) legend.textContent = (key === 'dotted-grid') ? 'Dot pattern'
      : (key === 'diagonal-lines') ? 'Line pattern'
      : (presetFamily(key) === 'aurora-blobs') ? 'Motion'
      : 'Pattern';
    spec.forEach(k => {
      // Enumerated knob (motif choice, background fill) → <select>.
      if (k.kind === 'select') {
        const sv = (values && k.key in values) ? String(values[k.key]) : k.default;
        const known = (k.options || []).some(o => o.value === sv)
          || (k.groups || []).some(g => (g.options || []).some(o => o.value === sv));
        _knobState[k.key] = known ? sv : k.default;
        // Knobs that declare `random_value` (the pattern motif) get the
        // same shape every other randomisable control in this modal
        // has: a checkbox for "shuffles per page load", and underneath
        // it one button that does the single useful thing for the
        // state you're in — preview another sample while randomising,
        // roll-and-keep while pinned. Burying "Random each load" as
        // entry #1 of a 330-option <select> made a pinned motif and a
        // shuffling one look identical.
        const rnd = k.random_value || '';
        const box = document.createElement('div');
        box.className = 'dynbg-modal-knob-group';
        box.dataset.dynbgKnob = k.key;
        // Every concrete (non-random) value the select offers — the
        // roll pool. Read off the spec, so no catalogue fetch needed.
        const pool = [];
        (k.options || []).forEach(o => { if (o.value !== rnd) pool.push(o.value); });
        (k.groups || []).forEach(g => (g.options || []).forEach(o => {
          if (o.value !== rnd) pool.push(o.value);
        }));
        const wrap = document.createElement('label');
        wrap.className = 'dynbg-modal-slider-row dynbg-modal-select-row';
        if (!rnd) wrap.dataset.dynbgKnob = k.key;
        const head = document.createElement('span');
        head.className = 'dynbg-modal-slider-label';
        head.textContent = k.label;
        const sel = document.createElement('select');
        const addOpt = (parent, o) => {
          // With a checkbox owning the randomise state, the "random"
          // entry would be a second, contradictable control for it.
          if (rnd && o.value === rnd) return;
          const opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          if (o.value === _knobState[k.key]) opt.selected = true;
          parent.appendChild(opt);
        };
        (k.options || []).forEach(o => addOpt(sel, o));
        // Grouped options (the 330-entry pattern catalogue by tag).
        (k.groups || []).forEach(g => {
          const og = document.createElement('optgroup');
          og.label = g.label;
          (g.options || []).forEach(o => addOpt(og, o));
          sel.appendChild(og);
        });
        sel.addEventListener('change', () => {
          _knobState[k.key] = sel.value;
          // A fresh "random" pick should actually re-roll, not reuse
          // whatever motif the last repaint happened to land on.
          _previewPattern = null;
          syncOptionVisibility(selectedKey());
          updatePreview();
        });
        wrap.appendChild(head);
        wrap.appendChild(sel);
        if (!rnd) { host.appendChild(wrap); return; }

        const rndLabel = document.createElement('label');
        rndLabel.className = 'check dynbg-modal-randomize';
        const rndBox = document.createElement('input');
        rndBox.type = 'checkbox';
        rndBox.checked = _knobState[k.key] === rnd;
        const rndText = document.createElement('span');
        const what = (k.random_label || k.label).toLowerCase();
        rndText.innerHTML = '<b>Randomize ' + what + '</b>';
        // Same treatment the template gives every other label in this
        // modal: the name on the row, the explanation one click away.
        const rndChip = makeChip('Randomize ' + what,
          'A different ' + what + ' on every page load. Off = the one chosen below, on every visit.');
        if (rndChip) rndText.appendChild(rndChip);
        else rndText.innerHTML += ' <span class="muted smaller">— a different ' + what
          + ' on every page load. Off = the one chosen below, on every visit.</span>';
        rndLabel.appendChild(rndBox);
        rndLabel.appendChild(rndText);

        const actions = document.createElement('div');
        actions.className = 'dynbg-modal-roll-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm dynbg-modal-roll';
        const note = document.createElement('span');
        note.className = 'muted smaller';
        actions.appendChild(btn);
        actions.appendChild(note);

        const syncRnd = () => {
          const on = _knobState[k.key] === rnd;
          rndBox.checked = on;
          wrap.hidden = on;
          btn.textContent = on ? 'Shuffle sample' : 'Roll';
          note.textContent = on
            ? 'Preview another of the ones visitors will get.'
            : 'Pick one at random and keep it.';
        };
        rndBox.addEventListener('change', () => {
          if (rndBox.checked) {
            _knobState[k.key] = rnd;
            _previewPattern = null;
          } else {
            // Switching randomise OFF keeps whatever the preview was
            // just showing (mirrors the colour / position toggles), so
            // the admin pins the one they liked rather than snapping to
            // the top of an alphabetical list.
            _knobState[k.key] = _previewPattern
              || (pool.length ? pool[Math.floor(Math.random() * pool.length)] : sel.value);
            sel.value = _knobState[k.key];
          }
          syncRnd();
          syncOptionVisibility(selectedKey());
          updatePreview();
        });
        btn.addEventListener('click', () => {
          if (_knobState[k.key] === rnd) {
            _previewPattern = null;          // re-roll the sample only
          } else if (pool.length) {
            let next = _knobState[k.key];
            for (let i = 0; i < 8 && next === _knobState[k.key]; i++) {
              next = pool[Math.floor(Math.random() * pool.length)];
            }
            _knobState[k.key] = next;
            sel.value = next;
          }
          syncRnd();
          syncOptionVisibility(selectedKey());
          updatePreview();
        });
        syncRnd();
        box.appendChild(rndLabel);
        box.appendChild(wrap);
        box.appendChild(actions);
        host.appendChild(box);
        return;
      }
      const saved = values && (k.key in values) ? Number(values[k.key]) : null;
      const val = (saved != null && !isNaN(saved)) ? saved : k.default;
      _knobState[k.key] = val;
      const label = document.createElement('label');
      label.className = 'dynbg-modal-slider-row';
      label.dataset.dynbgKnob = k.key;
      const headRow = document.createElement('span');
      headRow.className = 'dynbg-modal-slider-label';
      const out = document.createElement('output');
      out.textContent = val;
      headRow.textContent = k.label + ' ';
      headRow.appendChild(out);
      if (k.unit === 'deg') headRow.appendChild(document.createTextNode('°'));
      else if (k.unit === '%') headRow.appendChild(document.createTextNode('%'));
      else if (k.unit === 'px') headRow.appendChild(document.createTextNode('px'));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = k.min; input.max = k.max; input.step = k.step; input.value = val;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        _knobState[k.key] = v;
        out.textContent = v;
        updatePreview();
      });
      label.appendChild(headRow);
      label.appendChild(input);
      host.appendChild(label);
    });
  }
  // Current per-preset knob values, dropping any equal to the spec
  // default so the saved JSON stays minimal. Returns {} when none.
  function getKnobs (key) {
    const spec = (capFor(key).knobs) || [];
    const out = {};
    spec.forEach(k => {
      const v = _knobState[k.key];
      if (v == null) return;
      if (k.kind === 'select') {
        if (v !== k.default) out[k.key] = v;
        return;
      }
      if (isNaN(v)) return;
      if (Math.abs(v - k.default) < 1e-9) return;
      out[k.key] = v;
    });
    return out;
  }
  // Reset every knob slider to its spec default + repaint.
  function resetKnobs (key) {
    renderKnobs(key, {});
    updatePreview();
  }

  // Show/hide each Options control per the active preset's caps so we
  // never show settings that don't apply. Called from setSelectedKey.
  function syncOptionVisibility (key) {
    const cap = capFor(key);
    const hasBg = !!key;
    const setHidden = (sel, hide) => { const e = $(sel); if (e) e.hidden = hide; };
    const labels = cap.color_labels || null;
    // Per-mode columns: colours + tone need a preset with colours;
    // the positions toggle only for presets with movable parts.
    // Texture overlays apply to any surface (even with no base preset).
    MODES.forEach(mode => {
      const randRow = m$(mode, '[data-dynbg-mode-randomize-row]');
      if (randRow) randRow.hidden = !hasBg || ((cap.colors || 0) < 1 && !cap.randomize_positions);
      const rcLabel = m$(mode, '[data-dynbg-mode-randomize-colors-label]');
      if (rcLabel) rcLabel.hidden = (cap.colors || 0) < 1;
      const rpLabel = m$(mode, '[data-dynbg-mode-randomize-positions-label]');
      if (rpLabel) rpLabel.hidden = !cap.randomize_positions;
      // Shade lightness shapes what the colour roller produces, so it
      // shows wherever this preset has colour slots at all — it feeds
      // "Roll colours" as well as the per-page-load shuffle.
      const rndLightRow = m$(mode, '[data-dynbg-mode-rndlight-row]');
      if (rndLightRow) rndLightRow.hidden = (cap.colors || 0) < 1;
      const colorsRow = m$(mode, '[data-dynbg-mode-colors-row]');
      if (colorsRow) colorsRow.hidden = !hasBg || (cap.colors || 0) < 1;
      SLOTS.forEach(slot => {
        const rowEl = m$(mode, '[data-dynbg-mode-color-slot="' + slot + '"]');
        // Ink slots beyond the chosen motif's layer count don't apply.
        const spare = key === 'pattern-tile' && slot <= 4 && slot > patternInkCount();
        if (rowEl) rowEl.hidden = (cap.colors || 0) < slot || spare;
        // Per-preset colour labels (e.g. "Dots" / "Background" for the
        // pattern presets) replace the generic "Colour N" heading.
        const labelEl = m$(mode, '[data-dynbg-mode-color-label="' + slot + '"]');
        if (labelEl) labelEl.textContent = (labels && labels[slot - 1]) ? labels[slot - 1] : ('Colour ' + slot);
      });
      const blurb = m$(mode, '[data-dynbg-mode-colors-blurb]');
      if (blurb) {
        blurb.textContent = labels
          ? ('Set the ' + labels[0].toLowerCase() + ' colour and the ' + labels[1].toLowerCase()
             + ' colour. Leave a slot blank to fall through to the site default.')
          : 'Leave a slot blank to fall through to the brand accent. Colour 1 is the primary glow, 2 the secondary accent, 3 the tertiary highlight.';
      }
      // Presets can opt out of tone entirely (the pattern preset's
      // colours are picked literally, so tinting them is noise).
      const toneRow = m$(mode, '[data-dynbg-mode-tone-row]');
      if (toneRow) toneRow.hidden = !hasBg || (cap.colors || 0) < 1 || cap.tone === false;
      // Colour fill only for the soft blurred-layer recipes — dots /
      // lines set their own background colour slot instead.
      const fillField = m$(mode, '[data-dynbg-mode-tone-soft]');
      if (fillField) fillField.hidden = !cap.soft;
      // Pastel wash is the classic recipes' own control — the modern
      // presets express the same idea through Saturation / Brightness.
      const pastelField = m$(mode, '[data-dynbg-mode-tone-pastel]');
      if (pastelField) pastelField.hidden = !cap.pastel;
      const patRow = m$(mode, '[data-dynbg-mode-pat-row]');
      if (patRow) patRow.hidden = key !== 'pattern-tile';
      // The backdrop pair now lives inside the (always-present) Colours
      // fieldset, so it needs the preset gate the Pattern fieldset used
      // to give it for free.
      const colorsBg = m$(mode, '[data-dynbg-mode-colors-bg]');
      if (colorsBg) colorsBg.hidden = key !== 'pattern-tile';
      syncColorSlotsVisibility(mode);
    });
    // Line weight only applies to stroked motifs.
    if (key === 'pattern-tile') {
      const wrow = $('[data-dynbg-knob="weight"]');
      if (wrow) wrow.hidden = !patternUsesWeight();
    }
  }
  // "Random colours" on → the whole Colours fieldset is irrelevant;
  // hide it. The Shuffle-preview button shows while anything in the
  // column randomises.
  function syncColorSlotsVisibility (mode) {
    const row = m$(mode, '[data-dynbg-mode-colors-row]');
    const cap = capFor(selectedKey());
    if (row) row.hidden = !selectedKey() || (cap.colors || 0) < 1 || !!getRandomizeColors(mode);
    // The sample-palette shuffle belongs to the Colours toggle and is
    // only meaningful while that toggle is on.
    const colActions = m$(mode, '[data-dynbg-mode-colors-row-actions]');
    if (colActions) {
      colActions.hidden = !selectedKey() || (cap.colors || 0) < 1 || !getRandomizeColors(mode);
    }
    // Shade lightness is one value with two homes, and only one of them
    // is ever the live control: with Colours ON it limits the generator,
    // so the copy in the Randomize fieldset is editable and the Colours
    // fieldset (its twin included) is hidden; with Colours OFF the twin
    // under the chips drives them, and this one greys out rather than
    // vanishing — it still shows the value, it just isn't where you set
    // it. Two enabled sliders for one number would be the real trap.
    const rndLightRow = m$(mode, '[data-dynbg-mode-rndlight-row]');
    if (rndLightRow) {
      const live = !!getRandomizeColors(mode);
      rndLightRow.classList.toggle('is-disabled', !live);
      const input = rndLightRow.querySelector('input[type="range"]');
      if (input) input.disabled = !live;
    }
    syncPosRowActions(mode);
  }
  // The Positions row keeps its place; only the button inside it swaps,
  // because randomising and fixing are genuinely different actions.
  // Randomising → shuffle the sample the preview shows. Fixed → roll a
  // layout and keep it (Reset appears once one is being kept).
  function syncPosRowActions (mode) {
    const row = m$(mode, '[data-dynbg-mode-pos-row-actions]');
    if (!row) return;
    const cap = capFor(selectedKey());
    const supported = !!selectedKey() && !!cap.randomize_positions;
    const randomising = !!getRandomizePositions(mode);
    const kept = !!getKeptPositions(mode);
    row.hidden = !supported;
    const show = (sel, on) => { const el = m$(mode, sel); if (el) el.hidden = !on; };
    show('[data-dynbg-mode-pos-shuffle]', supported && randomising);
    show('[data-dynbg-mode-pos-shuffle-note]', supported && randomising);
    show('[data-dynbg-mode-pos-roll]', supported && !randomising);
    show('[data-dynbg-mode-pos-reset]', supported && !randomising && kept);
    show('[data-dynbg-mode-pos-note]', supported && !randomising && kept);
  }

  // ── Animation toggle ───────────────────────────────────────────
  // Only a subset of presets actually animate (aurora-blobs /
  // only). The toggle row is `hidden` for the others so the
  // admin never sees a useless checkbox. The `data-dynbg-animated-
  // keys` attribute on the row carries the comma-separated key set
  // so this JS doesn't need its own copy of the catalog.
  function getAnimatedKeys () {
    const row = $('#dynbg-picker-modal-anim-row');
    if (!row) return [];
    return (row.dataset.dynbgAnimatedKeys || '').split(',').filter(Boolean);
  }
  function syncAnimRowVisibility (activeKey) {
    const row = $('#dynbg-picker-modal-anim-row');
    if (!row) return;
    row.hidden = !getAnimatedKeys().includes(activeKey || '');
  }
  function setAnimateOff (on) {
    const el = $('#dynbg-picker-modal-animate-off');
    if (el) el.checked = !!on;
  }
  function getAnimateOff () {
    const el = $('#dynbg-picker-modal-animate-off');
    return el && el.checked ? '1' : '';
  }
  // Tone: Saturation + Colour fill sliders per mode column (0-100).
  // Sat defaults to 100 (full vivid); fill defaults to 0 (page white /
  // black shows through the recipe's base). Mirrors dynbg.TONE_DEFAULTS.
  const TONE_DEFAULT = 100;
  // `rnd_light` is the centre of the lightness band the RANDOM palette
  // is rolled from, and it is the one tone key whose default differs
  // per mode: dark mode is capped at deep shades so "random colours"
  // can't hand a dark section a light-mode-bright palette. Mirrors
  // dynbg.RND_LIGHT_DEFAULTS / RND_LIGHT_SPREAD.
  const RND_LIGHT_DEFAULTS = { light: 55, dark: 26 };
  const RND_LIGHT_SPREAD = 10, RND_LIGHT_MIN = 3, RND_LIGHT_MAX_L = 97;
  const TONE_DEFAULTS = { sat: 100, bright: 100, fill: 0, pastel: 0, rnd_light: RND_LIGHT_DEFAULTS.light };
  const TONE_MAX = { sat: 100, bright: 200, fill: 100, pastel: 100, rnd_light: 100 };
  const TONE_KEYS = Object.keys(TONE_DEFAULTS);
  function toneDefault (key, mode) {
    if (key === 'rnd_light') return RND_LIGHT_DEFAULTS[mode] != null ? RND_LIGHT_DEFAULTS[mode] : RND_LIGHT_DEFAULTS.light;
    return TONE_DEFAULTS[key] != null ? TONE_DEFAULTS[key] : TONE_DEFAULT;
  }
  function toneMax (key) { return TONE_MAX[key] != null ? TONE_MAX[key] : 100; }
  function toneSlider (mode, key) { return m$(mode, '[data-dynbg-mode-tone="' + key + '"]'); }
  // A tone key may be rendered TWICE in one column — `rnd_light` appears
  // in the Randomize fieldset (where it limits the generator) and again
  // under the colour chips (where it dims a fixed palette), because
  // which one is the live control depends on the randomise toggle. They
  // are one value, so every write goes to all of them.
  function toneSliders (mode, key) { return m$$(mode, '[data-dynbg-mode-tone="' + key + '"]'); }
  function toneVal (mode, key) {
    const el = toneSlider(mode, key);
    if (!el) return toneDefault(key, mode);
    const n = parseInt(el.value, 10);
    return isFinite(n) ? Math.max(0, Math.min(toneMax(key), n)) : toneDefault(key, mode);
  }
  function setToneVal (mode, key, v) {
    const els = toneSliders(mode, key);
    if (!els.length) return;
    const n = parseInt(v, 10);
    const val = String(isFinite(n) ? Math.max(0, Math.min(toneMax(key), n)) : toneDefault(key, mode));
    els.forEach(el => { el.value = val; });
    syncToneOuts();
  }
  // Colour as the mode displays it: saturation + brightness applied.
  // JS port of dynbg.pastelize — same lerp toward the pastel band, so
  // the modal preview and the server render agree colour for colour.
  function pastelizeHex (hex, strength) {
    const st = Math.max(0, Math.min(100, strength | 0));
    if (!st || !hex) return hex;
    const m = String(hex).trim().replace(/^#/, '');
    const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
    const r = parseInt(full.slice(0, 2), 16) / 255,
          g = parseInt(full.slice(2, 4), 16) / 255,
          b = parseInt(full.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
        : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
      h /= 6;
    }
    const t = st / 100;
    const legacyS = Math.min(s, 0.339);
    const legacyL = Math.max(0.69, Math.min(0.75, l * 0.24 + 0.53));
    const ns = s * (1 - t) + (legacyS * 0.5) * t;
    const nl = l * (1 - t) + (legacyL + (1 - legacyL) * 0.5) * t;
    const hue2rgb = (p, q, tt) => {
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns, p = 2 * nl - q;
    const out = [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
      .map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    return '#' + out;
  }
  function tonedHex (mode, hex) {
    const ps = toneVal(mode, 'pastel');
    const base = ps ? (pastelizeHex(hex, ps) || hex) : hex;
    return saturateHex(base, toneVal(mode, 'sat'), toneVal(mode, 'bright')) || base;
  }
  // Pattern-tile per-mode settings (opacity / backdrop / direction).
  const PAT_DEFAULTS = { opacity: 100, bg: 'solid', bg_angle: 135 };
  function patEl (mode, key) { return m$(mode, '[data-dynbg-mode-pat="' + key + '"]'); }
  function patVal (mode, key) {
    const el = patEl(mode, key);
    if (!el) return PAT_DEFAULTS[key];
    if (key === 'bg') return el.value === 'gradient' ? 'gradient' : 'solid';
    const n = parseInt(el.value, 10);
    return isFinite(n) ? n : PAT_DEFAULTS[key];
  }
  function setPatVal (mode, key, v) {
    const el = patEl(mode, key);
    if (!el) return;
    if (key === 'bg') el.value = (v === 'gradient') ? 'gradient' : 'solid';
    else { const n = parseInt(v, 10); el.value = String(isFinite(n) ? n : PAT_DEFAULTS[key]); }
    syncPatOuts(mode);
  }
  function syncPatOuts (mode) {
    const cols = mode ? [mode] : MODES;
    cols.forEach(m => {
      ['opacity', 'bg_angle'].forEach(k => {
        const el = patEl(m, k); const out = el && el.parentElement && el.parentElement.querySelector('output');
        if (out) out.textContent = el.value;
      });
      const angleField = m$(m, '[data-dynbg-mode-pat-angle]');
      if (angleField) angleField.hidden = patVal(m, 'bg') !== 'gradient';
    });
  }
  // CSS vars for one mode's pattern settings — the preview panes stamp
  // these directly; the server stamps the -light/-dark pair.
  function patVarParts (mode) {
    const out = [];
    const op = patVal(mode, 'opacity');
    if (op !== 100) out.push('--fe-dynbg-pat-opacity: ' + (op / 100) + ';');
    if (patVal(mode, 'bg') === 'gradient') out.push('--fe-dynbg-pat-bg2: var(--fe-dynbg-c6, var(--fe-dynbg-c5, #e2e8f0));');
    const ang = patVal(mode, 'bg_angle');
    if (ang !== 135) out.push('--fe-dynbg-pat-bg-angle: ' + ang + 'deg;');
    return out;
  }
  function syncToneOuts () {
    $$('[data-dynbg-mode-tone]').forEach(el => {
      const out = el.parentElement && el.parentElement.querySelector('output');
      if (out) out.textContent = el.value;
    });
  }

  // ── Overlay grid ───────────────────────────────────────────────
  // `snap` (manual card click) resets Size / Intensity to the NEW
  // overlay's defaults so values left over from a previous overlay
  // aren't silently persisted as custom; the programmatic seed path
  // (writeMode) leaves them for the saved values to land on.
  function setSelectedOverlay (mode, key, snap) {
    const changed = key !== selectedOverlay(mode);
    m$$(mode, '[data-dynbg-mode-overlay-card]').forEach(card => {
      const isMatch = (card.dataset.dynbgOverlayKey || '') === (key || '');
      card.classList.toggle('active', isMatch);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isMatch;
    });
    // Texture Size/Intensity + scope apply to EVERY overlay. Show the
    // subgroup whenever an overlay is active and set the sliders'
    // bounds / labels / defaults from that overlay's spec.
    applyOverlayKnobBounds(mode, key);
    if (snap && changed) {
      const def = activeOverlayDefaults(mode);
      setNoiseSize(mode, def.size); setNoiseIntensity(mode, def.intensity);
    }
    updatePreview();
  }

  // Configure a mode's overlay Size/Intensity sliders for `key` from
  // the per-overlay spec (different overlays have different ranges +
  // the noise overlay labels them Grain size / Intensity vs Scale /
  // Intensity for patterns). Hides the subgroup when no overlay.
  function applyOverlayKnobBounds (mode, key) {
    const sub = m$(mode, '[data-dynbg-mode-overlay-knobs]');
    if (!sub) return;
    const spec = overlayKnobSpec()[key];
    if (!key || !spec) { sub.hidden = true; return; }
    sub.hidden = false;
    const sizeEl = m$(mode, '[data-dynbg-mode-ovsize]');
    const intEl = m$(mode, '[data-dynbg-mode-ovint]');
    const sizeLab = m$(mode, '[data-dynbg-mode-ovsize-label]');
    const intLab = m$(mode, '[data-dynbg-mode-ovint-label]');
    const sizeHint = m$(mode, '[data-dynbg-mode-ovsize-hint]');
    const intHint = m$(mode, '[data-dynbg-mode-ovint-hint]');
    const sizeOut = m$(mode, '[data-dynbg-mode-ovsize-out]');
    const intOut = m$(mode, '[data-dynbg-mode-ovint-out]');
    if (sizeEl && spec.size) {
      sizeEl.min = spec.size.min; sizeEl.max = spec.size.max; sizeEl.step = spec.size.step;
      // Keep the current value if it's in-range, else snap to default.
      const cur = parseFloat(sizeEl.value);
      if (isNaN(cur) || cur < spec.size.min || cur > spec.size.max) sizeEl.value = spec.size.default;
      if (sizeOut) sizeOut.textContent = sizeEl.value;
    }
    if (intEl && spec.intensity) {
      intEl.min = spec.intensity.min; intEl.max = spec.intensity.max; intEl.step = spec.intensity.step;
      const cur = parseFloat(intEl.value);
      if (isNaN(cur) || cur < spec.intensity.min || cur > spec.intensity.max) intEl.value = spec.intensity.default;
      if (intOut) intOut.textContent = intEl.value;
    }
    if (sizeLab && spec.size) sizeLab.textContent = spec.size.label || 'Size';
    if (intLab && spec.intensity) intLab.textContent = spec.intensity.label || 'Intensity';
    if (sizeHint && spec.size) sizeHint.textContent = spec.size.min + ' = ' + (spec.size.lo || '') + ' · ' + spec.size.max + ' = ' + (spec.size.hi || '');
    if (intHint && spec.intensity) intHint.textContent = spec.intensity.min + ' = ' + (spec.intensity.lo || '') + ' · ' + spec.intensity.max + ' = ' + (spec.intensity.hi || '');
  }

  // ── Live preview (above the tabs) ──────────────────────────────
  // Rebuilds the preview surface from the modal's CURRENT state on
  // every change: base preset markup (cloned from the chosen card's
  // recipe), custom / randomised colours stamped as --fe-dynbg-cN,
  // an optional texture overlay (+scope), the freeze-animation flag,
  // and a live noise data-URL when the noise-grain knobs are tuned.
  // The recipes load in the admin via css/dynbg.css, so this paints
  // the genuine effect rather than a static image.
  function overlayNameByKey (key) {
    if (!key) return '';
    const c = $('[data-dynbg-mode-overlay-card][data-dynbg-overlay-key="' + CSS.escape(key) + '"]');
    const n = c && c.querySelector('.fe-dynbg-picker-name');
    return n ? n.textContent.trim() : key;
  }
  // JS port of dynbg.random_color_seed — the mode-independent half of
  // a random palette: hue, saturation, and a 0-1 position within
  // whatever lightness band the mode asks for. Rolled once so light and
  // dark show the SAME hues, each shaded into its own band.
  function previewRandomSeed (n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push([Math.random(), 0.55 + Math.random() * 0.35, Math.random()]);
    }
    return out;
  }
  // JS port of dynbg.random_colors — shade a seed into the lightness
  // band centred on `lightness` (0-100). Returns #rrggbb (not hsl()) so
  // saturateHex can retune the palette — the tone sliders must visibly
  // act on random colours too, exactly as the server does via
  // resolve_colors → saturate_hex.
  function previewShadeSeed (seed, lightness) {
    const lt = Math.max(0, Math.min(100, isFinite(+lightness) ? (lightness | 0) : RND_LIGHT_DEFAULTS.light));
    const lo = Math.max(RND_LIGHT_MIN, lt - RND_LIGHT_SPREAD) / 100;
    const hi = Math.min(RND_LIGHT_MAX_L, lt + RND_LIGHT_SPREAD) / 100;
    return seed.map(([h, s, t]) => {
      const l = lo + t * (hi - lo);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const pp = 2 * l - q;
      const ch = tt => {
        if (tt < 0) tt += 1; if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return pp + (q - pp) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return pp + (q - pp) * (2 / 3 - tt) * 6;
        return pp;
      };
      const hx = v => ('0' + Math.round(v * 255).toString(16)).slice(-2);
      return '#' + hx(ch(h + 1 / 3)) + hx(ch(h)) + hx(ch(h - 1 / 3));
    });
  }
  // The random roll is held stable for the life of a modal open
  // (reshuffled when "random colours" is switched on) so dragging the
  // tone / knob sliders shows their effect on ONE palette instead
  // of re-rolling the colours on every tick. Shading happens per call,
  // so the Shade-lightness slider repaints live off the same roll.
  let _previewRandSeed = null;
  function previewRandSeed () {
    if (!_previewRandSeed) _previewRandSeed = previewRandomSeed(SLOTS.length);
    return _previewRandSeed;
  }
  function previewRandPalette (mode) {
    return previewShadeSeed(previewRandSeed(), toneVal(mode || 'light', 'rnd_light'));
  }
  // ── Shade lightness over a FIXED palette ───────────────────────
  // While "random colours" is off the same rnd_light slider acts on the
  // chips directly. It shifts each one's HSL lightness by the distance
  // the slider has travelled since the palette was last rolled or typed
  // — not to an absolute value — so a hand-mixed palette keeps its
  // internal contrast, and returning the slider returns the colours.
  // (Setting every chip to one lightness would flatten the palette and
  // there'd be no way back.)
  const _shadeBase = { light: null, dark: null };
  function captureShadeBase (mode) {
    _shadeBase[mode] = { colors: getColors(mode), at: toneVal(mode, 'rnd_light') };
  }
  // hex (#rgb / #rrggbb, with or without alpha) → same hue + saturation,
  // lightness nudged by `delta` (-1..1) and clamped away from pure
  // black / white. Alpha rides along untouched. null on bad input.
  function shiftLightness (hex, delta) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace('#', '');
    let alpha = '';
    if (h.length === 4) { alpha = h[3] + h[3]; h = h.slice(0, 3); }
    else if (h.length === 8) { alpha = h.slice(6); h = h.slice(0, 6); }
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const r = parseInt(h.slice(0, 2), 16) / 255,
          g = parseInt(h.slice(2, 4), 16) / 255,
          b = parseInt(h.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const li = (mx + mn) / 2;
    let hue = 0, sat = 0;
    if (d) {
      sat = li > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) hue = ((b - r) / d + 2) / 6;
      else hue = ((r - g) / d + 4) / 6;
    }
    const l2 = Math.max(RND_LIGHT_MIN / 100, Math.min(RND_LIGHT_MAX_L / 100, li + delta));
    const q = l2 < 0.5 ? l2 * (1 + sat) : l2 + sat - l2 * sat;
    const pp = 2 * l2 - q;
    const ch = tt => {
      if (tt < 0) tt += 1; if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return pp + (q - pp) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return pp + (q - pp) * (2 / 3 - tt) * 6;
      return pp;
    };
    const hx = v => ('0' + Math.round(v * 255).toString(16)).slice(-2);
    return '#' + hx(ch(hue + 1 / 3)) + hx(ch(hue)) + hx(ch(hue - 1 / 3)) + alpha;
  }
  // Re-stamp the chips from the captured base at the slider's current
  // distance from it. No-op while the column randomises (the chips are
  // hidden and unused then) or before a base exists.
  function applyShade (mode) {
    const base = _shadeBase[mode];
    if (!base || getRandomizeColors(mode)) return;
    const delta = (toneVal(mode, 'rnd_light') - base.at) / 100;
    base.colors.forEach((c, i) => {
      if (!c) return;
      setColor(mode, i + 1, shiftLightness(c, delta) || c);
    });
  }
  // JS port of dynbg.random_positions — fresh coordinates / sizes for
  // the preset's movable parts, so the preview can show what "random
  // positions" will do. Held stable per open (keyed by preset) and
  // re-rolled by the Shuffle-preview button.
  // Motif library (vendored from Pattern Monster, MIT). It's ~1MB, so
  // it's fetched from /dynbg/patterns.json the first time a preview
  // needs it rather than stamped into every admin page. Until it
  // lands, patterns() returns [] and the preview repaints once it has.
  let _patterns = null, _patternModeAttrs = null, _patternsLoading = null;
  function patterns () {
    if (_patterns) return _patterns;
    if (!_patternsLoading) {
      const el = $('[data-dynbg-patterns-url]');
      const url = el ? el.dataset.dynbgPatternsUrl : '';
      _patternsLoading = (url ? fetch(url, { credentials: 'same-origin' }).then(r => r.json()) : Promise.resolve({}))
        .then(d => {
          _patterns = (d && d.patterns) || [];
          _patternModeAttrs = (d && d.mode_attrs) || {};
          syncOptionVisibility(selectedKey());
          updatePreview();
        })
        .catch(() => { _patterns = []; });
    }
    return [];
  }
  // Held stable between repaints so dragging a slider doesn't re-roll
  // a "random" motif on every frame; cleared on shuffle / re-pick.
  let _previewPattern = null;
  // Resolve the selected motif, holding a "random" pick steady between
  // repaints so dragging a slider doesn't re-roll it every frame.
  function previewPatternEntry (patternKey) {
    const lib = patterns();
    if (!lib.length) return null;
    const exact = lib.find(p => p.key === patternKey);
    if (exact) return exact;
    if (!_previewPattern || !lib.some(p => p.key === _previewPattern)) {
      _previewPattern = lib[Math.floor(Math.random() * lib.length)].key;
    }
    return lib.find(p => p.key === _previewPattern) || null;
  }
  // How many ink slots the current motif actually uses (4 for
  // "random", since any motif may spawn).
  function patternInkCount () {
    const chosen = _knobState && _knobState.pattern;
    if (!chosen || chosen === 'random') return 4;
    const e = (patterns() || []).find(p => p.key === chosen);
    return e ? (e.layers || []).length : 4;
  }
  // Does the chosen motif take a line weight at all? Filled motifs
  // ignore it, so the slider hides for them.
  function patternUsesWeight () {
    const chosen = _knobState && _knobState.pattern;
    if (!chosen || chosen === 'random') return true;
    const e = (patterns() || []).find(p => p.key === chosen);
    return !e || e.mode !== 'fill';
  }
  // Mirrors dynbg.pattern_mask_layers — one mask URL per ink layer,
  // plus the tile size for mask-size. Attributes are injected per the
  // motif's render mode exactly as the server does.
  function previewPatternLayers (patternKey, weight, scale) {
    const entry = previewPatternEntry(patternKey);
    if (!entry) return { urls: [], w: 0, h: 0 };
    const w = Math.max(0.5, Math.min(14, parseFloat(weight)));
    const wv = isFinite(w) ? (w === Math.round(w) ? String(Math.round(w)) : String(w)) : '2';
    // Scale rides inside the image now (see dynbg.pattern_mask_layers),
    // because the CSS tiling that used to apply it is what seamed.
    const sc0 = parseFloat(scale);
    const sc = isFinite(sc0) ? Math.max(0.25, Math.min(8, sc0)) : 1;
    const attrs = ((_patternModeAttrs || {})[entry.mode] || '').split('{w}').join(wv);
    // Mirrors dynbg.pattern_mask_layers' wrap step: a motif whose tile
    // was corrected to its own pitch (PATTERN_TILE_FIXES — the entry
    // carries `wrap_x` / `wrap_y` through /dynbg/patterns.json) is now
    // shorter than it was drawn for, so each layer is emitted once per
    // wrap step and what leaves one edge re-enters the other.
    const wx = entry.wrap_x || 0, wy = entry.wrap_y || 0;
    const REPS = 2;
    const urls = (entry.layers || []).map(body => {
      // Attributes go on before the copies, so every copy carries them.
      let node = body.replace('/>', attrs + '/>');
      if (wx || wy) {
        let acc = '';
        for (let k = -REPS; k <= REPS; k++) {
          acc += "<g transform='translate(" + (k * wx) + "," + (k * wy) + ")'>" + node + "</g>";
        }
        node = acc;
      }
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'>"
        + "<defs><pattern id='p' patternUnits='userSpaceOnUse' width='" + entry.w
        + "' height='" + entry.h + "' patternTransform='scale(" + sc + ")'>"
        + node + "</pattern></defs>"
        + "<rect width='100%' height='100%' fill='url(#p)'/></svg>";
      const enc = svg.replace(/%/g, '%25').replace(/#/g, '%23')
        .replace(/</g, '%3C').replace(/>/g, '%3E')
        .replace(/"/g, '%22').replace(/'/g, '%27');
      return "data:image/svg+xml;utf8," + enc;
    });
    return { urls, w: entry.w, h: entry.h, key: entry.key };
  }
  function previewRandomPositions (key) {
    const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const out = {};
    // A `*-classic` recipe is the same shape as the preset it mirrors,
    // so it randomises through the same vars (mirrors the server-side
    // branch in dynbg.random_positions).
    key = presetFamily(key);
    if (key === 'aurora-blobs') {
      ['a', 'b', 'c'].forEach(slot => {
        out['--fe-dynbg-blob-' + slot + '-top'] = ri(-30, 60) + '%';
        out['--fe-dynbg-blob-' + slot + '-left'] = ri(-30, 60) + '%';
        out['--fe-dynbg-blob-' + slot + '-bottom'] = 'auto';
        out['--fe-dynbg-blob-' + slot + '-right'] = 'auto';
        out['--fe-dynbg-blob-' + slot + '-size'] = ri(220, 460) + 'px';
      });
    } else if (key === 'mesh-gradient') {
      ['a', 'b', 'c'].forEach(slot => {
        out['--fe-dynbg-mesh-' + slot + '-x'] = ri(15, 85) + '%';
        out['--fe-dynbg-mesh-' + slot + '-y'] = ri(15, 85) + '%';
        out['--fe-dynbg-mesh-' + slot + '-angle'] = ri(0, 360) + 'deg';
      });
    } else if (key === 'aurora-bands') {
      ['a', 'b'].forEach(slot => {
        out['--fe-dynbg-band-' + slot + '-angle'] = ri(40, 160) + 'deg';
      });
    }
    return out;
  }
  // A layout the admin rolled and kept, per mode. Unlike the sample
  // palette / layout above (preview-only, re-rolled per open) this is
  // real config: it rides along in the mode block as `positions` and the
  // server stamps it for any mode that isn't randomising.
  const _modePositions = { light: null, dark: null };
  function getKeptPositions (mode) {
    const p = _modePositions[mode];
    return (p && Object.keys(p).length) ? p : null;
  }
  function setKeptPositions (mode, pos) {
    _modePositions[mode] = (pos && Object.keys(pos).length) ? pos : null;
  }
  let _previewRandPositions = null, _previewRandPositionsKey = '';
  function previewRandPositions (key) {
    if (!_previewRandPositions || _previewRandPositionsKey !== key) {
      _previewRandPositions = previewRandomPositions(key);
      _previewRandPositionsKey = key;
    }
    return _previewRandPositions;
  }
  // ── Per-concern actions ────────────────────────────────────────
  // Each of these touches exactly one thing. The old combined
  // "Shuffle preview" re-rolled the sample palette AND the sample
  // layout AND rewrote the fixed colour slots, so shuffling to see a
  // different layout silently threw away hand-picked colours.
  //
  // Randomising → shuffle the SAMPLE (preview-only; every page load
  // rolls its own anyway). Fixed → roll a value and KEEP it.
  function shuffleSamplePalette () {
    _previewRandSeed = null;
    updatePreview();
  }
  function shuffleSampleLayout () {
    _previewRandPositions = null;
    updatePreview();
  }
  // "Roll colours" (Colours fieldset, shown while the column is NOT
  // randomising): roll a palette and write it into the slots, so what
  // the preview shows is what every visitor gets.
  function rollColors (mode) {
    _previewRandSeed = null;
    seedColorsFromSample(mode);
    updatePreview();
  }
  function seedColorsFromSample (mode) {
    const seed = previewRandPalette(mode);
    const n = Math.min(SLOTS.length, capFor(selectedKey()).colors || 3);
    for (let slot = 1; slot <= n; slot++) {
      const c = seed[slot - 1] || '';
      setColor(mode, slot, c ? tonedHex(mode, c) : '');
    }
    // The freshly-rolled palette IS the new base, at the shade it was
    // rolled at — so the slider reads 0 distance and nudges from here.
    captureShadeBase(mode);
  }
  // JS port of dynbg.saturate_hex — rewrites a #rrggbb's HSL
  // saturation to `sat` (0-100) and scales its lightness by `bright`
  // (0-200, 100 = untouched; <100 toward black, >100 toward white),
  // keeping hue, so the live preview equals the saved render. Greys
  // stay grey. Returns #rrggbb or null on bad input.
  function saturateHex (hex, sat, bright) {
    if (typeof hex !== 'string') return null;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const target = Math.max(0, Math.min(100, sat | 0)) / 100;
    const r = parseInt(h.slice(0, 2), 16) / 255,
          g = parseInt(h.slice(2, 4), 16) / 255,
          b = parseInt(h.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hue = 0, srcS = 0; const li = (mx + mn) / 2;
    const d = mx - mn;
    if (d) {
      srcS = li > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) hue = ((b - r) / d + 2) / 6;
      else hue = ((r - g) / d + 4) / 6;
    }
    let li2 = li;
    const bt = Math.max(0, Math.min(200, (bright == null || !isFinite(+bright)) ? 100 : (bright | 0))) / 100;
    if (bt < 1) li2 = li * bt; else if (bt > 1) li2 = li + (1 - li) * (bt - 1);
    const tgt = srcS < 0.02 ? srcS : target;
    const hue2rgb = (p, q, tt) => {
      if (tt < 0) tt += 1; if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    let nr, ng, nb;
    if (tgt === 0) { nr = ng = nb = li2; }
    else {
      const q = li2 < 0.5 ? li2 * (1 + tgt) : li2 + tgt - li2 * tgt;
      const p = 2 * li2 - q;
      nr = hue2rgb(p, q, hue + 1 / 3);
      ng = hue2rgb(p, q, hue);
      nb = hue2rgb(p, q, hue - 1 / 3);
    }
    const x = v => ('0' + Math.round(v * 255).toString(16)).slice(-2);
    return '#' + x(nr) + x(ng) + x(nb);
  }
  function previewNoiseUrl (size, intensity) {
    const sz = (size === '' || size == null || isNaN(parseFloat(size))) ? 0.9 : parseFloat(size);
    const op = (intensity === '' || intensity == null || isNaN(parseFloat(intensity))) ? 0.03 : parseFloat(intensity);
    // Mirrors dynbg.noise_grain_data_url (apostrophes URL-encoded so
    // the data-URL survives inside url('...')).
    return "data:image/svg+xml;utf8," +
      "%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E" +
      "%3Cfilter id=%27noise%27%3E" +
      "%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27" + sz + "%27 " +
      "numOctaves=%274%27 stitchTiles=%27stitch%27/%3E" +
      "%3C/filter%3E" +
      "%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%27" + op + "%27/%3E" +
      "%3C/svg%3E";
  }
  // Paint the split preview: the light pane gets the Light-mode tone,
  // the dark pane (wrapped in .fe-megamenu-force-dark so the recipes'
  // dark rules fire) gets the Dark-mode tone. Each host is stamped
  // directly with the resolved per-mode colour + opacity vars, so no
  // theme swap rule is needed inside the admin shell.
  function updatePreview () {
    $$('[data-dynbg-preview]').forEach(host => {
      const mode = host.dataset.dynbgPreviewMode || 'light';
      const colors = getRandomizeColors(mode) ? previewRandPalette(mode) : getColors(mode);
      updatePreviewHost(host, mode, colors);
    });
  }
  function updatePreviewHost (host, mode, colors) {
    const key = selectedKey();
    const overlay = selectedOverlay(mode);
    // Strip prior injected layers (keep the empty placeholder + badge).
    host.querySelectorAll('.fe-dynbg, .fe-dynbg-overlay').forEach(e => e.remove());
    host.classList.remove('fe-dynbg-no-anim');
    host.removeAttribute('style');
    const badge = host.querySelector('[data-dynbg-preview-badge]');
    if (!key && !overlay) {
      host.removeAttribute('data-has-bg');
      if (badge) badge.textContent = '';
      return;
    }
    host.setAttribute('data-has-bg', '');
    // Colour vars: randomised palette when that toggle is on, else the
    // admin's custom slots (blank slots fall through to brand tokens),
    // re-saturated per this pane's mode. Base colour fill follows the
    // mode's Colour fill slider.
    const parts = [];
    (colors || []).forEach((c, i) => {
      if (!c) return;
      parts.push('--fe-dynbg-c' + (i + 1) + ': ' + tonedHex(mode, c) + ';');
    });
    parts.push('--fe-dynbg-fill: ' + (toneVal(mode, 'fill') / 100) + ';');
    if (key === 'pattern-tile') parts.push(...patVarParts(mode));
    // Random positions: stamp a sample layout so the pane shows the
    // preset's movable parts somewhere other than the hand-tuned default.
    if (key && getRandomizePositions(mode)) {
      const pos = previewRandPositions(key);
      Object.keys(pos).forEach(k => parts.push(k + ': ' + pos[k] + ';'));
    } else if (key && getKeptPositions(mode)) {
      // Mirrors dynbg.resolve_positions_css: only vars this preset can
      // actually use, so a layout kept under another preset doesn't
      // leak in after the admin switches backgrounds.
      const kept = getKeptPositions(mode);
      const usable = previewRandomPositions(key);
      Object.keys(kept).forEach(k => {
        if (k in usable) parts.push(k + ': ' + kept[k] + ';');
      });
    }
    // Per-preset knob vars (motion speed, dot size/gap, line angle, …).
    if (key) parts.push(...knobVarParts(key, _knobState));
    if (parts.length) host.setAttribute('style', parts.join(' '));
    // Base preset recipe (clone the chosen card's .fe-dynbg markup).
    if (key) {
      const entry = entryByKey(key);
      if (entry && entry.thumbHtml) {
        const tmp = document.createElement('div');
        tmp.innerHTML = entry.thumbHtml.trim();
        const node = tmp.querySelector('.fe-dynbg');
        if (node) {
          // The cloned thumb carries its own randomised inline vars;
          // strip them so the host's (tone-aware) vars win.
          node.removeAttribute('style');
          // The pattern preset's layers depend on the CHOSEN motif, so
          // rebuild them rather than reusing whatever the catalog thumb
          // was server-rendered with.
          if (key === 'pattern-tile') {
            node.innerHTML = '';
            const pat = previewPatternLayers(_knobState.pattern,
                                             _knobState.weight != null ? _knobState.weight : 2,
                                             _knobState.scale != null ? _knobState.scale : 1);
            if (pat.w) {
              host.style.setProperty('--fe-dynbg-pat-w', pat.w + 'px');
              host.style.setProperty('--fe-dynbg-pat-h', pat.h + 'px');
            }
            pat.urls.forEach((u, i) => {
              const sp = document.createElement('span');
              sp.className = 'fe-dynbg-pattern';
              sp.style.setProperty('--_db-pat-url', "url('" + u + "')");
              sp.style.setProperty('--_db-pat-ink', 'var(--_db-ink' + (i + 1) + ')');
              node.appendChild(sp);
            });
          }
          host.insertBefore(node, host.firstChild);
        }
      }
      if (getAnimateOff()) host.classList.add('fe-dynbg-no-anim');
    }
    // This mode's texture overlay layer (+scope, +live size/intensity).
    if (overlay) {
      const ov = document.createElement('div');
      ov.className = 'fe-dynbg-overlay fe-dynbg-overlay-' + overlay;
      if (getSelectedScope(mode) === 'bg') ov.classList.add('fe-dynbg-overlay--bg-only');
      const ovSize = getNoiseSize(mode);   // raw slider string ('' when default)
      const ovInt = getNoiseIntensity(mode);
      if (overlay === 'noise-grain') {
        ov.style.backgroundImage = "url('" + previewNoiseUrl(ovSize, ovInt) + "')";
      } else {
        // Pattern overlays consume scale + opacity CSS vars.
        if (ovSize !== '') ov.style.setProperty('--fe-dynbg-ov-scale', ovSize);
        if (ovInt !== '') ov.style.setProperty('--fe-dynbg-ov-opacity', ovInt);
      }
      host.appendChild(ov);
    }
    if (badge) {
      const entry = key ? entryByKey(key) : null;
      let label = entry ? entry.name : 'Overlay only';
      if (overlay) label += ' + ' + overlayNameByKey(overlay);
      badge.textContent = label;
    }
  }

  // ── Scope toggle (per mode) ────────────────────────────────────
  function setSelectedScope (mode, scope) {
    const value = scope === 'bg' ? 'bg' : 'all';
    m$$(mode, '[data-dynbg-mode-scope]').forEach(r => { r.checked = (r.dataset.dynbgModeScope === value); });
  }
  function getSelectedScope (mode) {
    const bg = m$(mode, '[data-dynbg-mode-scope="bg"]');
    return bg && bg.checked ? 'bg' : 'all';
  }

  // ── Overlay Size / Intensity knobs (per mode) ──────────────────
  // Defaults match dynbg.NOISE_*_DEFAULT — the modal's slider html
  // already initialises them with the same values, so leaving them
  // at default means we omit the values from the saved config (they
  // round-trip through dynbg.encode_config which strips defaults).
  const NOISE_DEFAULTS = { size: 0.9, intensity: 0.03 };
  function setNoiseSize (mode, v) {
    const el = m$(mode, '[data-dynbg-mode-ovsize]');
    const out = m$(mode, '[data-dynbg-mode-ovsize-out]');
    const numeric = (v === '' || v == null || isNaN(parseFloat(v)))
      ? NOISE_DEFAULTS.size : parseFloat(v);
    if (el) el.value = numeric;
    if (out) out.textContent = numeric;
  }
  function setNoiseIntensity (mode, v) {
    const el = m$(mode, '[data-dynbg-mode-ovint]');
    const out = m$(mode, '[data-dynbg-mode-ovint-out]');
    const numeric = (v === '' || v == null || isNaN(parseFloat(v)))
      ? NOISE_DEFAULTS.intensity : parseFloat(v);
    if (el) el.value = numeric;
    if (out) out.textContent = numeric.toFixed(3);
  }
  // Default-drop the overlay Size / Intensity against the ACTIVE
  // overlay's own default (noise-grain vs pattern overlays differ), so
  // a slider left at the default persists nothing. '' = use default.
  function activeOverlayDefaults (mode) {
    const spec = overlayKnobSpec()[selectedOverlay(mode)];
    return spec
      ? { size: spec.size.default, intensity: spec.intensity.default }
      : { size: NOISE_DEFAULTS.size, intensity: NOISE_DEFAULTS.intensity };
  }
  function getNoiseSize (mode) {
    const el = m$(mode, '[data-dynbg-mode-ovsize]');
    if (!el) return '';
    const v = parseFloat(el.value);
    if (isNaN(v) || Math.abs(v - activeOverlayDefaults(mode).size) < 1e-6) return '';
    return String(v);
  }
  function getNoiseIntensity (mode) {
    const el = m$(mode, '[data-dynbg-mode-ovint]');
    if (!el) return '';
    const v = parseFloat(el.value);
    if (isNaN(v) || Math.abs(v - activeOverlayDefaults(mode).intensity) < 1e-6) return '';
    return String(v);
  }

  // ── Randomize toggles (per mode) ───────────────────────────────
  // Colours re-tint that mode's palette per render; positions spawn
  // the preset's movable parts at fresh coordinates per render.
  function setRandomizeColors (mode, on) {
    const el = m$(mode, '[data-dynbg-mode-randomize-colors]');
    if (el) el.checked = !!on;
    syncColorSlotsVisibility(mode);
  }
  function getRandomizeColors (mode) {
    const el = m$(mode, '[data-dynbg-mode-randomize-colors]');
    return el && el.checked ? '1' : '';
  }
  function setRandomizePositions (mode, on) {
    const el = m$(mode, '[data-dynbg-mode-randomize-positions]');
    if (el) el.checked = !!on;
    syncColorSlotsVisibility(mode);
  }
  function getRandomizePositions (mode) {
    const el = m$(mode, '[data-dynbg-mode-randomize-positions]');
    return el && el.checked ? '1' : '';
  }

  // ── Colour inputs (per mode) ───────────────────────────────────
  // Each slot has a paired <input type=color> + <input type=text>.
  // The text input is the source-of-truth — admins can type a hex
  // (with or without alpha) or leave it blank to fall back to the
  // brand default. Setting either input syncs the other.
  //
  // Native <input type=color> can't be empty, so an UNSET slot is
  // shown by toggling the ∅ overlay (`.dynbg-modal-color-null`) over
  // the swatch instead of seeding the misleading brand-blue.
  // markChipUnset() keeps that overlay in sync.
  function markChipUnset (mode, slot, unset) {
    const nul = m$(mode, '[data-dynbg-mode-color-null="' + slot + '"]');
    if (nul) nul.classList.toggle('is-shown', !!unset);
  }
  function setColor (mode, slot, hex) {
    const colorEl = m$(mode, '[data-dynbg-mode-color="' + slot + '"]');
    const textEl  = m$(mode, '[data-dynbg-mode-color-text="' + slot + '"]');
    if (textEl) textEl.value = hex || '';
    const m = (hex || '').match(/^#([0-9a-fA-F]{6})$/);
    if (colorEl) {
      // When set, mirror the hex onto the native swatch; when unset,
      // leave a neutral grey under the ∅ overlay (never brand-blue).
      colorEl.value = m ? hex : '#cccccc';
    }
    markChipUnset(mode, slot, !m);
  }
  function getColor (mode, slot) {
    const textEl = m$(mode, '[data-dynbg-mode-color-text="' + slot + '"]');
    const v = textEl ? textEl.value.trim() : '';
    return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : '';
  }
  function getColors (mode) { return SLOTS.map(slot => getColor(mode, slot)); }

  // ── Whole-mode read / write ────────────────────────────────────
  // The trigger contract carries the per-mode state as ONE JSON blob
  // (`modes`), mirroring dynbg.normalize_modes(fill_defaults=False):
  // only non-default keys are present, empty mode blocks are dropped,
  // '' when nothing at all is configured.
  function readMode (mode) {
    const out = {};
    const cols = getColors(mode);
    while (cols.length && !cols[cols.length - 1]) cols.pop();
    if (cols.some(Boolean)) out.colors = cols;
    if (getRandomizeColors(mode)) out.randomize_colors = true;
    if (getRandomizePositions(mode)) out.randomize_positions = true;
    const kept = getKeptPositions(mode);
    if (kept) out.positions = kept;
    TONE_KEYS.forEach(k => { const v = toneVal(mode, k); if (v !== toneDefault(k, mode)) out[k] = v; });
    if (patVal(mode, 'opacity') !== 100) out.pat_opacity = patVal(mode, 'opacity');
    if (patVal(mode, 'bg') === 'gradient') out.pat_bg = 'gradient';
    if (patVal(mode, 'bg_angle') !== 135) out.pat_bg_angle = patVal(mode, 'bg_angle');
    const ov = selectedOverlay(mode);
    if (ov) {
      out.overlay = ov;
      if (getSelectedScope(mode) === 'bg') out.overlay_scope = 'bg';
      const sz = getNoiseSize(mode); if (sz !== '') out.overlay_size = parseFloat(sz);
      const it = getNoiseIntensity(mode); if (it !== '') out.overlay_intensity = parseFloat(it);
    }
    return out;
  }
  function getModesStr () {
    const out = {};
    MODES.forEach(mode => { const b = readMode(mode); if (Object.keys(b).length) out[mode] = b; });
    return Object.keys(out).length ? JSON.stringify(out) : '';
  }
  function parseModes (raw) {
    let t = raw;
    if (typeof t === 'string') { try { t = t ? JSON.parse(t) : {}; } catch (_) { t = {}; } }
    return (t && typeof t === 'object') ? t : {};
  }
  function writeMode (mode, block) {
    const b = (block && typeof block === 'object') ? block : {};
    const cols = Array.isArray(b.colors) ? b.colors : [];
    SLOTS.forEach(slot => setColor(mode, slot, cols[slot - 1] || ''));
    setRandomizeColors(mode, !!b.randomize_colors);
    setRandomizePositions(mode, !!b.randomize_positions);
    setKeptPositions(mode, (b.positions && typeof b.positions === 'object') ? b.positions : null);
    TONE_KEYS.forEach(k => setToneVal(mode, k, b[k]));
    setPatVal(mode, 'opacity', b.pat_opacity != null ? b.pat_opacity : 100);
    setPatVal(mode, 'bg', b.pat_bg || 'solid');
    setPatVal(mode, 'bg_angle', b.pat_bg_angle != null ? b.pat_bg_angle : 135);
    setSelectedOverlay(mode, b.overlay || '');
    setSelectedScope(mode, b.overlay_scope || 'all');
    // setSelectedOverlay configured the slider bounds; now seed the
    // saved values within those bounds ('' → overlay default).
    setNoiseSize(mode, b.overlay_size != null ? b.overlay_size : '');
    setNoiseIntensity(mode, b.overlay_intensity != null ? b.overlay_intensity : '');
    // Base the Shade-lightness nudge on the palette as saved, read
    // AFTER the tone sliders land so `at` is the value it was saved at.
    captureShadeBase(mode);
  }
  function setModes (raw) {
    const t = parseModes(raw);
    MODES.forEach(mode => writeMode(mode, t[mode]));
  }
  // Compact a modes object/JSON to the storage shape (non-default
  // keys only) — used when a trigger is applied from block data.
  function compactModes (raw) {
    const t = parseModes(raw);
    const out = {};
    MODES.forEach(mode => {
      const b = (t[mode] && typeof t[mode] === 'object') ? t[mode] : {};
      const keep = {};
      const cols = (Array.isArray(b.colors) ? b.colors : []).slice(0, SLOTS.length).map(c => (typeof c === 'string' && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c.trim())) ? c.trim() : '');
      while (cols.length && !cols[cols.length - 1]) cols.pop();
      if (cols.some(Boolean)) keep.colors = cols;
      if (b.randomize_colors) keep.randomize_colors = true;
      if (b.randomize_positions) keep.randomize_positions = true;
      if (b.positions && typeof b.positions === 'object' && Object.keys(b.positions).length) {
        keep.positions = b.positions;
      }
      TONE_KEYS.forEach(k => {
        const n = parseInt(b[k], 10);
        if (isFinite(n) && n !== toneDefault(k, mode)) keep[k] = Math.max(0, Math.min(toneMax(k), n));
      });
      const po = parseInt(b.pat_opacity, 10);
      if (isFinite(po) && po !== 100) keep.pat_opacity = Math.max(0, Math.min(100, po));
      if (b.pat_bg === 'gradient') keep.pat_bg = 'gradient';
      const pa = parseInt(b.pat_bg_angle, 10);
      if (isFinite(pa) && pa !== 135) keep.pat_bg_angle = Math.max(0, Math.min(355, pa));
      if (b.overlay) {
        keep.overlay = String(b.overlay);
        if (b.overlay_scope === 'bg') keep.overlay_scope = 'bg';
        if (b.overlay_size != null && b.overlay_size !== '' && isFinite(parseFloat(b.overlay_size))) keep.overlay_size = parseFloat(b.overlay_size);
        if (b.overlay_intensity != null && b.overlay_intensity !== '' && isFinite(parseFloat(b.overlay_intensity))) keep.overlay_intensity = parseFloat(b.overlay_intensity);
      }
      if (Object.keys(keep).length) out[mode] = keep;
    });
    return Object.keys(out).length ? JSON.stringify(out) : '';
  }
  // Resolve a config's per-mode block for seeding a trigger: the
  // `modes` object when present (with a transitional top-level
  // `randomize_positions` folded into any mode that doesn't set it),
  // else the legacy flat fields expanded into both modes, else null.
  function modesFromConfig (cfg) {
    cfg = cfg || {};
    if (cfg.modes && typeof cfg.modes === 'object') {
      const out = {};
      MODES.forEach(mode => {
        const b = Object.assign({}, (cfg.modes[mode] && typeof cfg.modes[mode] === 'object') ? cfg.modes[mode] : {});
        if ((cfg.randomize_positions || cfg.randomize) && b.randomize_positions == null) b.randomize_positions = true;
        out[mode] = b;
      });
      return out;
    }
    if (cfg.overlay || (cfg.colors || []).some(Boolean) || cfg.randomize_colors
        || cfg.randomize_positions || cfg.randomize || cfg.tone) {
      return legacyToModes(cfg);
    }
    return null;
  }
  // Legacy flat block / trigger data (single palette + overlay +
  // tone) → a modes object with both modes populated. Lets container
  // blocks and hero configs saved before the light/dark split open
  // in the picker unchanged.
  function legacyToModes (d) {
    d = d || {};
    const tone = (d.tone && typeof d.tone === 'object') ? d.tone : {};
    const base = {
      colors: d.colors || [], randomize_colors: !!(d.randomize_colors || d.randomize),
      randomize_positions: !!(d.randomize_positions || d.randomize),
      overlay: d.overlay || '', overlay_scope: d.overlay_scope || '',
      overlay_size: d.overlay_size, overlay_intensity: d.overlay_intensity,
    };
    const out = {};
    MODES.forEach(mode => {
      const t = (tone[mode] && typeof tone[mode] === 'object') ? tone[mode] : {};
      out[mode] = Object.assign({}, base, { sat: t.sat, bright: t.bright, fill: t.fill });
    });
    return out;
  }

  // ── Tab switching ──────────────────────────────────────────────
  function setActiveTab (key) {
    $$('[data-dynbg-modal-tab]').forEach(t => {
      const on = t.dataset.dynbgModalTab === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-dynbg-modal-tab-wrap]').forEach(w => {
      w.classList.toggle('is-active', w.dataset.dynbgModalTabWrap === key);
    });
    $$('[data-dynbg-modal-panel]').forEach(p => {
      p.classList.toggle('is-active', p.dataset.dynbgModalPanel === key);
    });
  }

  // Paint a trigger chip's thumbnail from a saved config, so the chip
  // shows the background the block actually has rather than the
  // catalogue card's random sample. Stamps the light-mode palette and
  // the preset's knob vars on the thumb; for the pattern preset it also
  // rebuilds the layers for the chosen motif and shrinks the tile so a
  // few repeats fit a 64px chip. Used by every trigger renderer.
  function decorateThumb (thumbEl, key, modesObj, knobsObj) {
    if (!thumbEl || !key) return;
    const light = (modesObj && modesObj.light && typeof modesObj.light === 'object') ? modesObj.light : {};
    ['--fe-dynbg-pat-opacity', '--fe-dynbg-pat-bg2', '--fe-dynbg-pat-bg-angle'].forEach(v => thumbEl.style.removeProperty(v));
    if (key === 'pattern-tile') {
      if (light.pat_opacity != null && light.pat_opacity !== 100) thumbEl.style.setProperty('--fe-dynbg-pat-opacity', String(light.pat_opacity / 100));
      if (light.pat_bg === 'gradient') thumbEl.style.setProperty('--fe-dynbg-pat-bg2', 'var(--fe-dynbg-c6, var(--fe-dynbg-c5, #e2e8f0))');
      if (light.pat_bg_angle != null && light.pat_bg_angle !== 135) thumbEl.style.setProperty('--fe-dynbg-pat-bg-angle', light.pat_bg_angle + 'deg');
    }
    // Randomised colours get a sample palette (as the previews do) so
    // the chip shows *a* real rendering rather than brand fallbacks.
    const cols = light.randomize_colors
      ? previewShadeSeed(previewRandSeed(), light.rnd_light != null ? light.rnd_light : RND_LIGHT_DEFAULTS.light)
      : (Array.isArray(light.colors) ? light.colors : []);
    SLOTS.forEach(i => {
      if (cols[i - 1]) thumbEl.style.setProperty('--fe-dynbg-c' + i, cols[i - 1]);
      else thumbEl.style.removeProperty('--fe-dynbg-c' + i);
    });
    knobVarNames(key).forEach(v => thumbEl.style.removeProperty(v));
    knobVarParts(key, knobsObj || {}).forEach(decl => {
      const i = decl.indexOf(':');
      if (i > 0) thumbEl.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).replace(/;$/, '').trim());
    });
    thumbEl.style.removeProperty('--fe-dynbg-pat-scale');
    if (key !== 'pattern-tile') return;
    const rec = thumbEl.querySelector('.fe-dynbg');
    if (!rec) return;
    const kn = knobsObj || {};
    const token = (thumbEl.__dynbgThumbToken = (thumbEl.__dynbgThumbToken || 0) + 1);
    // Chip-fit: show roughly two repeats of the tile whatever its native
    // size, so the motif is recognisable at 64x44. This is a scale, and
    // scale now lives inside the mask image, so the tile is resolved
    // first (a 'random' pick isn't known until then) and the layers are
    // rebuilt at the fitting scale — two string builds, no network.
    const wgt = kn.weight != null ? kn.weight : 2;
    window.dynbgPatternLayers(kn.pattern || 'random', wgt, 1)
      .then(probe => {
        const fit = probe.w ? Math.min(1, 26 / Math.max(probe.w, probe.h)) : 1;
        return fit === 1 ? probe
          : window.dynbgPatternLayers(probe.key || kn.pattern || 'random', wgt, fit);
      })
      .then(pat => {
      if (thumbEl.__dynbgThumbToken !== token || !rec.isConnected) return;  // superseded
      rec.innerHTML = '';
      if (pat.w) {
        rec.style.setProperty('--fe-dynbg-pat-w', pat.w + 'px');
        rec.style.setProperty('--fe-dynbg-pat-h', pat.h + 'px');
      }
      pat.urls.forEach((u, i) => {
        const sp = document.createElement('span');
        sp.className = 'fe-dynbg-pattern';
        sp.style.setProperty('--_db-pat-url', "url('" + u + "')");
        sp.style.setProperty('--_db-pat-ink', 'var(--_db-ink' + (i + 1) + ')');
        rec.appendChild(sp);
      });
    });
  }

  // ── Trigger sync ───────────────────────────────────────────────
  function applyToTrigger (trigger, payload) {
    if (!trigger) return;
    const key       = payload.key       || '';
    const animateOff      = payload.animateOff ? '1' : '';
    // Per-preset knobs as a JSON string ('' when none). Accept either a
    // pre-serialised string or an object.
    let knobsStr = '';
    if (payload.knobs) {
      if (typeof payload.knobs === 'string') knobsStr = payload.knobs;
      else if (typeof payload.knobs === 'object' && Object.keys(payload.knobs).length) {
        knobsStr = JSON.stringify(payload.knobs);
      }
    }
    // Per-mode block (object or JSON) → compact storage JSON ('' when
    // nothing is configured in either mode).
    const modesStr = compactModes(payload.modes);
    const modesObj = parseModes(modesStr);
    const inputBy = (camel) => {
      const sel = trigger.dataset[camel];
      return sel ? document.querySelector(sel) : null;
    };
    const baseInput      = inputBy('dynbgTriggerInput');
    const modesIn        = inputBy('dynbgTriggerModesInput');
    const animateOffIn   = inputBy('dynbgTriggerAnimateOffInput');
    const knobsIn        = inputBy('dynbgTriggerKnobsInput');
    if (baseInput)      baseInput.value      = key;
    if (modesIn)        modesIn.value        = modesStr;
    if (animateOffIn)   animateOffIn.value   = animateOff;
    if (knobsIn)        knobsIn.value        = knobsStr;
    trigger.dataset.dynbgCurrent = key;
    trigger.dataset.dynbgModes = modesStr;
    trigger.dataset.dynbgAnimateOff = animateOff;
    trigger.dataset.dynbgKnobs = knobsStr;
    paintTrigger(trigger, key, modesObj, knobsStr, !!animateOff);
    // Notify consumers (block editor uses change events to mark the
    // form dirty / re-serialise the block JSON). Fire on every input
    // we touched so listeners pick up the consolidated change.
    [baseInput, modesIn, animateOffIn, knobsIn].forEach(el => {
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // Paint a trigger's VISIBLE parts — name, status line, thumbnail —
  // from a resolved config. Split out of applyToTrigger so a
  // server-rendered trigger can be hydrated on load without touching
  // its hidden inputs or firing change events (see hydrateTriggers).
  function paintTrigger (trigger, key, modesObj, knobsStr, animateOff) {
    const entry = entryByKey(key);
    const nameEl = trigger.querySelector('[data-dynbg-trigger-name]');
    const statusEl = trigger.querySelector('[data-dynbg-trigger-status]');
    const thumbEl = trigger.querySelector('[data-dynbg-trigger-thumb]');
    if (nameEl) nameEl.textContent = entry ? entry.name : 'Choose…';
    if (statusEl) {
      let bits = [];
      if (entry) bits.push('Click to change or clear');
      else bits.push('No dynamic background — click to add');
      const extras = [];
      // One summary per mode, e.g. "light: random colours / Linen
      // overlay / 70% sat" — only modes with something configured.
      MODES.forEach(mode => {
        const b = modesObj[mode] || {};
        const mb = [];
        if (b.randomize_colors) mb.push('random colours');
        else if (Array.isArray(b.colors) && b.colors.filter(Boolean).length) {
          const n = b.colors.filter(Boolean).length;
          mb.push(n + ' colour' + (n === 1 ? '' : 's'));
        }
        if (b.randomize_positions) mb.push('random positions');
        else if (b.positions && Object.keys(b.positions).length) mb.push('kept layout');
        if (b.overlay) mb.push(overlayNameByKey(b.overlay) + ' overlay');
        if (b.sat != null) mb.push(b.sat + '% sat');
        if (b.bright != null) mb.push(b.bright + '% bright');
        // Present only when it differs from THIS mode's default (the
        // blob is the storage shape), so the chip stays quiet on the
        // dark-mode limiter everyone gets.
        if (b.rnd_light != null) mb.push(b.rnd_light + '% shade');
        if (b.fill != null) mb.push(b.fill + '% fill');
        if (b.pat_opacity != null) mb.push(b.pat_opacity + '% opacity');
        if (b.pat_bg === 'gradient') mb.push('gradient');
        if (mb.length) extras.push(mode + ': ' + mb.join(' / '));
      });
      if (animateOff) extras.push('static');
      if (extras.length) bits.push('· ' + extras.join(', '));
      statusEl.textContent = bits.join(' ');
    }
    if (thumbEl) {
      thumbEl.innerHTML = entry
        ? entry.thumbHtml
        : '<span class="fe-dynbg-trigger-thumb-none" aria-hidden="true">∅</span>';
      let knobsObj = {};
      try { knobsObj = knobsStr ? JSON.parse(knobsStr) : {}; } catch (_) { knobsObj = {}; }
      decorateThumb(thumbEl, key, modesObj, knobsObj);
    }
  }

  // Hydrate every server-rendered trigger on the page.
  //
  // The Jinja macro (_dynbg_picker.html) can only emit the preset's
  // BARE recipe — it has no palette maths, no motif resolution and no
  // access to the catalogue's sample thumbnails — so a trigger rendered
  // by a normal page load showed a washed-out brand-default chip (and,
  // for a randomised palette, nothing at all) until the admin opened
  // the picker once. The chips the page builder draws in JS
  // (block_editor.js) have always gone through decorateThumb and
  // therefore looked right, which is exactly the mismatch this closes:
  // same painter, same result, wherever the trigger came from.
  //
  // Deliberately does NOT write the hidden inputs or fire change
  // events — this is a repaint of what the server already rendered, and
  // a stray `change` here would mark every form on the page dirty.
  function hydrateTriggers (root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-dynbg-trigger]').forEach(trigger => {
      const key = trigger.dataset.dynbgCurrent || '';
      if (!key) return;
      paintTrigger(trigger, key,
                   parseModes(trigger.dataset.dynbgModes || ''),
                   trigger.dataset.dynbgKnobs || '',
                   trigger.dataset.dynbgAnimateOff === '1');
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrateTriggers());
  } else {
    hydrateTriggers();
  }

  function closeSelf () {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeTrigger = null;
  }

  function wireModalOnce () {
    if (wired) return;
    const modal = getModal();
    if (!modal) return;
    wired = true;
    const saveBtn = modal.querySelector('#dynbg-picker-modal-save');
    const clearBtn = modal.querySelector('#dynbg-picker-modal-clear');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const baseCard = modal.querySelector('[data-dynbg-modal-card].active');
      const key = baseCard ? baseCard.dataset.dynbgKey || '' : '';
      applyToTrigger(activeTrigger, {
        key,
        modes: getModesStr(),
        animateOff: !!getAnimateOff(),
        knobs: getKnobs(key),
      });
      closeSelf();
    });
    if (clearBtn) clearBtn.addEventListener('click', () => {
      applyToTrigger(activeTrigger, {
        key: '', modes: '', animateOff: false, knobs: {},
      });
      closeSelf();
    });
    // Shared toggles repaint the live preview.
    const animEl = $('#dynbg-picker-modal-animate-off');
    if (animEl) animEl.addEventListener('change', updatePreview);
    // Per-mode column wiring.
    MODES.forEach(mode => {
      const rc = m$(mode, '[data-dynbg-mode-randomize-colors]');
      if (rc) rc.addEventListener('change', () => {
        if (rc.checked) {
          // Re-roll the sample palette each time random colours is
          // switched ON so the admin sees a fresh shuffle; the slot
          // inputs hide while it's on.
          _previewRandSeed = null;
        } else if (!getColors(mode).some(Boolean)) {
          // Switched OFF with nothing in the slots: seed them with the
          // palette the preview was just showing, so the admin starts
          // mixing from the colours they liked rather than from blank /
          // brand defaults. Seeded AS DISPLAYED (sample re-saturated by
          // this mode's Saturation) so the preview doesn't shift —
          // saturateHex sets an absolute saturation, so re-applying it
          // to these values is a no-op.
          //
          // Slots that ALREADY hold colours are left alone: ticking a
          // randomise box and unticking it is not an instruction to
          // throw away a hand-picked palette. Use "Roll colours" to
          // overwrite them deliberately.
          seedColorsFromSample(mode);
        } else {
          captureShadeBase(mode);
        }
        syncColorSlotsVisibility(mode);
        updatePreview();
      });
      const rp = m$(mode, '[data-dynbg-mode-randomize-positions]');
      if (rp) rp.addEventListener('change', () => {
        if (rp.checked) _previewRandPositions = null;
        // Switching randomise OFF leaves the preview on the layout it
        // was just showing, so the admin keeps the one they liked
        // rather than snapping back to the preset's default.
        else if (!getKeptPositions(mode) && selectedKey()) {
          setKeptPositions(mode, previewRandPositions(selectedKey()));
        }
        syncColorSlotsVisibility(mode);
        updatePreview();
      });
      const colShuffle = m$(mode, '[data-dynbg-mode-colors-shuffle]');
      if (colShuffle) colShuffle.addEventListener('click', () => shuffleSamplePalette());
      const posShuffle = m$(mode, '[data-dynbg-mode-pos-shuffle]');
      if (posShuffle) posShuffle.addEventListener('click', () => shuffleSampleLayout());
      // "Roll colours" lives inside the Colours fieldset (on screen only
      // while this column is NOT randomising colours), so the admin can
      // audition palettes and keep the one they like as fixed slots.
      const roll = m$(mode, '[data-dynbg-mode-roll]');
      if (roll) roll.addEventListener('click', () => rollColors(mode));
      // Roll / reset a KEPT layout. Rolling writes concrete position
      // vars into this mode's config (the positional equivalent of
      // writing hexes into the colour slots), so what the preview shows
      // is what every visitor gets — not a fresh roll per page load.
      const posRoll = m$(mode, '[data-dynbg-mode-pos-roll]');
      if (posRoll) posRoll.addEventListener('click', () => {
        const key = selectedKey();
        if (!key) return;
        setKeptPositions(mode, previewRandomPositions(key));
        syncPosRowActions(mode);
        updatePreview();
      });
      const posReset = m$(mode, '[data-dynbg-mode-pos-reset]');
      if (posReset) posReset.addEventListener('click', () => {
        setKeptPositions(mode, null);
        syncPosRowActions(mode);
        updatePreview();
      });
      m$$(mode, '[data-dynbg-mode-scope]').forEach(r => r.addEventListener('change', updatePreview));
      // Colour input pairs — text input is canonical; <input type=color>
      // syncs on change. Per-slot Clear button blanks both inputs.
      SLOTS.forEach(slot => {
        const colorEl = m$(mode, '[data-dynbg-mode-color="' + slot + '"]');
        const textEl  = m$(mode, '[data-dynbg-mode-color-text="' + slot + '"]');
        const clearEl = m$(mode, '[data-dynbg-mode-color-clear="' + slot + '"]');
        if (colorEl) colorEl.addEventListener('input', () => {
          if (textEl) textEl.value = colorEl.value;
          markChipUnset(mode, slot, false);
          captureShadeBase(mode);
          updatePreview();
        });
        if (textEl) textEl.addEventListener('input', () => {
          const m = textEl.value.match(/^#([0-9a-fA-F]{6})$/);
          if (m && colorEl) colorEl.value = textEl.value;
          markChipUnset(mode, slot, !m);
          captureShadeBase(mode);
          updatePreview();
        });
        if (clearEl) clearEl.addEventListener('click', () => {
          setColor(mode, slot, '');
          captureShadeBase(mode);
          updatePreview();
        });
      });
      // Overlay Size / Intensity live readout + reset.
      const sizeEl = m$(mode, '[data-dynbg-mode-ovsize]');
      const sizeOut = m$(mode, '[data-dynbg-mode-ovsize-out]');
      if (sizeEl && sizeOut) sizeEl.addEventListener('input', () => { sizeOut.textContent = sizeEl.value; updatePreview(); });
      const intEl = m$(mode, '[data-dynbg-mode-ovint]');
      const intOut = m$(mode, '[data-dynbg-mode-ovint-out]');
      if (intEl && intOut) intEl.addEventListener('input', () => { intOut.textContent = parseFloat(intEl.value).toFixed(3); updatePreview(); });
      const ovReset = m$(mode, '[data-dynbg-mode-ovreset]');
      if (ovReset) ovReset.addEventListener('click', () => {
        const def = activeOverlayDefaults(mode);
        setNoiseSize(mode, def.size); setNoiseIntensity(mode, def.intensity);
        setSelectedScope(mode, 'all');
        updatePreview();
      });
      // Tone sliders — live numeric readout + repaint. `rnd_light` has
      // a twin in the other fieldset (see toneSliders) and, while the
      // column isn't randomising, drives the chips themselves.
      m$$(mode, '[data-dynbg-mode-tone]').forEach(el => {
        el.addEventListener('input', () => {
          const key = el.dataset.dynbgModeTone;
          toneSliders(mode, key).forEach(t => { if (t !== el) t.value = el.value; });
          if (key === 'rnd_light') applyShade(mode);
          syncToneOuts();
          updatePreview();
        });
      });
      // Pattern settings (opacity / backdrop / direction).
      m$$(mode, '[data-dynbg-mode-pat]').forEach(el => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { syncPatOuts(mode); updatePreview(); });
      });
    });
    // Card click -> mark active immediately on whichever grid the
    // click landed in. Delegated on the modal so we don't need to
    // re-bind if the catalogs ever change.
    //
    // A MANUAL background pick (vs the open-handler's programmatic
    // seed) defaults the randomize toggles ON for the dimensions that
    // apply to the chosen preset — admins asked for new backgrounds to
    // start randomised. We only flip a toggle ON (never off) and only
    // when switching to a DIFFERENT key, so re-clicking the current
    // card or opening a saved config never clobbers an explicit choice.
    modal.addEventListener('click', e => {
      const baseCard = e.target.closest('[data-dynbg-modal-card]');
      if (baseCard) {
        const newKey = baseCard.dataset.dynbgKey || '';
        const changed = newKey !== selectedKey();
        setSelectedKey(newKey);
        if (changed && newKey) {
          const cap = capFor(newKey);
          // Only auto-randomise presets that opt in (randomize_default).
          // The pattern presets (dots/lines) opt OUT — their point is a
          // deliberate fg/bg colour pair, which a random palette would
          // immediately override (the very bug this refactor fixes).
          MODES.forEach(mode => {
            if (cap.randomize_default) {
              if ((cap.colors || 0) >= 1) setRandomizeColors(mode, true);
              if (cap.randomize_positions) setRandomizePositions(mode, true);
            } else {
              setRandomizeColors(mode, false);
              setRandomizePositions(mode, false);
            }
          });
          updatePreview();
        }
      }
      const overlayCard = e.target.closest('[data-dynbg-mode-overlay-card]');
      if (overlayCard) {
        const col = overlayCard.closest('[data-dynbg-mode]');
        if (col) setSelectedOverlay(col.dataset.dynbgMode, overlayCard.dataset.dynbgOverlayKey || '', true);
      }
    });
    // Tab switching — the whole wrapper half is the click target,
    // except the help chip (which opens its tooltip instead).
    $$('[data-dynbg-modal-tab-wrap]').forEach(w => {
      w.addEventListener('click', e => {
        if (e.target.closest('.heading-help')) return;
        setActiveTab(w.dataset.dynbgModalTabWrap);
      });
    });
    // Per-preset knobs reset → spec defaults.
    const knobsReset = $('#dynbg-picker-modal-knobs-reset');
    if (knobsReset) knobsReset.addEventListener('click', () => resetKnobs(selectedKey()));
    // Close affordances — backdrop + X.
    modal.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', closeSelf);
    });
  }

  // Trigger -> open. Delegated so triggers added later in the page
  // lifecycle (e.g. by the block editor) still pair up automatically.
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-dynbg-trigger]');
    if (!trigger) return;
    const modal = getModal();
    if (!modal) return;  // template missing the global modal — no-op
    e.preventDefault();
    wireModalOnce();
    activeTrigger = trigger;
    // Seed the per-preset knob values BEFORE setSelectedKey so its
    // renderKnobs() call builds the sliders at the saved values. Parsed
    // from the trigger's `data-dynbg-knobs` JSON blob.
    try {
      const raw = trigger.dataset.dynbgKnobs || '';
      _pendingKnobs = raw ? JSON.parse(raw) : null;
      if (_pendingKnobs && typeof _pendingKnobs !== 'object') _pendingKnobs = null;
    } catch (_) { _pendingKnobs = null; }
    setSelectedKey(trigger.dataset.dynbgCurrent || '');
    setAnimateOff(trigger.dataset.dynbgAnimateOff === '1');
    _previewRandSeed = null;       // fresh sample palette / layout per open
    _previewRandPositions = null;
    setModes(trigger.dataset.dynbgModes || '');
    setActiveTab('background');
    updatePreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  // Esc closes whichever modal is currently open.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = getModal();
    if (modal && modal.classList.contains('open')) {
      e.preventDefault();
      closeSelf();
    }
  });

  // Surface `applyToTrigger` so consumers that don't go through the
  // picker modal (e.g. the per-page hero edit modal repopulating
  // its trigger from a block's persisted data on open) can update
  // a trigger's hidden inputs + visual state without duplicating
  // the lookup logic for the catalog entry + thumbnail HTML.
  window.applyDynbgTrigger = applyToTrigger;
  // Same for the saturation port so out-of-modal live previews (hero
  // modal) retune colours exactly like the picker preview + server.
  window.dynbgSaturateHex = saturateHex;
  // Legacy flat data → per-mode object, for consumers seeding a
  // trigger from pre-split block data.
  window.dynbgLegacyToModes = legacyToModes;
  window.dynbgModesFromConfig = modesFromConfig;
  window.dynbgDecorateThumb = decorateThumb;
  // Repaint server-rendered trigger chips inside a subtree that arrived
  // after load (an AJAX-loaded settings pane, say).
  window.dynbgHydrateTriggers = hydrateTriggers;
  // Classic-recipe fallback for consumers that build their own triggers
  // (the page builder's block editor) — keeps their chip showing the
  // same recipe the public page renders.
  window.dynbgRenderKey = renderKeyFor;
  window.dynbgConfigVersion = CONFIG_VERSION;
  // Per-preset knob CSS vars, for previews rendered outside this modal.
  window.dynbgKnobVars = knobVarParts;
  window.dynbgKnobVarNames = knobVarNames;
  // Pattern-tile layers for a SAVED config (hero modal preview). The
  // catalogue is lazy-loaded, so this resolves once it's available.
  // A 'random' choice is resolved fresh here, matching what a page
  // render would do.
  // Catalogue entry for a motif key (null while the library is still
  // loading, or for 'random'), so callers can size against its tile.
  window.dynbgPatternEntry = function (patternKey) {
    const lib = _patterns || [];
    return lib.find(p => p.key === patternKey) || null;
  };
  window.dynbgPatternLayers = function (patternKey, weight, scale) {
    const build = () => {
      const lib = patterns();
      let entry = lib.find(p => p.key === patternKey) || null;
      if (!entry && lib.length) entry = lib[Math.floor(Math.random() * lib.length)];
      if (!entry) return { urls: [], w: 0, h: 0 };
      return previewPatternLayers(entry.key, weight, scale);
    };
    if (_patterns) return Promise.resolve(build());
    patterns();  // kicks off the fetch
    return (_patternsLoading || Promise.resolve()).then(build);
  };
})();

// ── Expandable rank lists ─────────────────────────────────────────
// Generic "Show N more" expander for `.wt-rank-list--expandable`.
// Server pre-renders the full pool; rows past the initial cap carry
// `wt-rank-row--hidden`. Each button click strips that class from
// the next `data-step` rows and triggers a quick fade/slide keyframe.
// When no hidden rows remain, the button is removed.
//
// Markup contract:
//   <ul class="wt-rank-list wt-rank-list--expandable"
//       data-wt-expand="<key>" data-step="30" data-total="N">
//     <li class="wt-rank-row [wt-rank-row--hidden]"> ... </li>
//   </ul>
//   <button data-wt-expand-btn="<key>">Show 30 more</button>
//   <span data-wt-expand-meta="<key>">base · meta</span>   (optional)
// Runs again on a page brought in by tspSwapPage (Watchtower's tabs).
(window.tspOnEachPage || (f => f()))(function () {
  document.querySelectorAll('[data-wt-expand]').forEach(list => {
    if (list.dataset.wtExpandBound) return;
    list.dataset.wtExpandBound = '1';
    const key = list.dataset.wtExpand;
    const step = parseInt(list.dataset.step, 10) || 30;
    const total = parseInt(list.dataset.total, 10) || 0;
    const btn = document.querySelector(`[data-wt-expand-btn="${key}"]`);
    const meta = document.querySelector(`[data-wt-expand-meta="${key}"]`);
    if (!btn) return;
    const metaBase = meta ? meta.textContent : '';

    function updateMeta() {
      if (!meta) return;
      const shown = list.querySelectorAll('.wt-rank-row:not(.wt-rank-row--hidden)').length;
      meta.textContent = `${metaBase} · showing ${shown} of ${total}`;
    }
    updateMeta();

    btn.addEventListener('click', () => {
      const hidden = list.querySelectorAll('.wt-rank-row--hidden');
      const toReveal = Array.from(hidden).slice(0, step);
      toReveal.forEach((row, i) => {
        row.classList.remove('wt-rank-row--hidden');
        row.classList.add('wt-rank-row--revealing');
        // Tiny per-row stagger turns the batch reveal into a wave
        // rather than a single jarring jump.
        row.style.animationDelay = (i * 8) + 'ms';
        row.addEventListener('animationend', () => {
          row.classList.remove('wt-rank-row--revealing');
          row.style.animationDelay = '';
        }, { once: true });
      });
      updateMeta();
      const remaining = list.querySelectorAll('.wt-rank-row--hidden').length;
      if (remaining === 0) {
        btn.parentElement.remove();
      } else {
        // First text node holds the label; preserve the trailing icon.
        btn.firstChild.textContent = `Show ${Math.min(step, remaining)} more `;
      }
    });
  });
});

// ── Metric mode toggle (Unique visitors ⇄ Hits) ────────────────────
// Shared toggle for the Visitor Metrics + Watchtower Visitors pages.
// Page renders both metric sides (views + uniques); JS just flips a
// class on <html> and lets CSS show the right one. KPI tiles that
// only carry a single number swap can use `data-uniques="..."` +
// `data-views="..."` attributes — JS swaps textContent in place so
// the page doesn't have to render the same tile twice.
//
// Default mode = "uniques" (the more meaningful number for reach;
// hits are inflated by reloads and sub-resource navigations).
// Preference persists in localStorage so it sticks across pages and
// across sessions. The pre-paint apply (in the head of base.html)
// reads localStorage before any markup mounts so the page never
// flashes the wrong side.
(function () {
  const KEY = "tsp-metric-mode";
  function getMode() {
    const v = localStorage.getItem(KEY);
    return v === "views" ? "views" : "uniques";
  }
  function applyMode(mode) {
    document.documentElement.classList.toggle("metric-mode-views", mode === "views");
    // Tile swaps — element holds both values in data attrs; show the active one.
    document.querySelectorAll("[data-uniques][data-views]").forEach(el => {
      el.textContent = el.dataset[mode] || "";
    });
    // The chosen part of each toggle (the shared segmented control).
    document.querySelectorAll(".metric-toggle").forEach(group => {
      group.querySelectorAll("button[data-metric]").forEach(btn => {
        btn.setAttribute("aria-checked",
          btn.dataset.metric === mode ? "true" : "false");
      });
    });
  }

  // Delegated, and applied again to a page brought in by tspSwapPage.
  document.addEventListener("click", e => {
    const btn = e.target.closest(".metric-toggle button[data-metric]");
    if (!btn) return;
    localStorage.setItem(KEY, btn.dataset.metric);
    applyMode(btn.dataset.metric);
  });
  (window.tspOnEachPage || (f => f()))(() => {
    if (document.querySelector(".metric-toggle, [data-uniques][data-views]")) applyMode(getMode());
  });
})();

/* ── Frontend staging sync wizard ──────────────────────────────
   Drives the stepped pairing UI in the settings "Data" tab. The
   underlying forms still do full-page POSTs (data-no-ajax), so the
   wizard resumes on the right step after each reload:
     • A button with [data-fe-sync-land="N"] (a submit) records N as the
       step to show once the page comes back.
     • [data-fe-sync-go="N"] navigates in-page without submitting.
   Landing step is kept in sessionStorage so it survives the reload;
   the server-rendered data-start-step is the first-visit default. */
/* ── Frontend staging sync wizard ──────────────────────────────
   Role-aware setup flow that submits every action over AJAX so the
   settings modal never reloads (and so never closes mid-setup). The
   admin first declares whether this install is the Live site or the
   Staging copy; each role then shows only the fields it needs. */
(function feSyncWizard () {
  const STORE = "feSyncStepKey";

  // Ordered per-role flows. The "role" chooser is always step 1.
  const ROLE_STEP = { key: "role", label: "This install" };
  const FLOWS = {
    "": [],
    live: [
      { key: "live-token", label: "Token" },
      { key: "live-done",  label: "Finish" },
    ],
    staging: [
      { key: "stg-token", label: "Token" },
      { key: "stg-url",   label: "Live URL" },
      { key: "stg-test",  label: "Test" },
      { key: "stg-sync",  label: "Sync" },
    ],
  };

  function init() {
    const root = document.querySelector("[data-fe-sync-wizard]");
    if (!root) return;
    // Enables single-panel mode in CSS; without JS every panel stays visible.
    root.setAttribute("data-fe-sync-js", "1");

    const stepperOl = root.querySelector("[data-fe-sync-stepper]");
    const panels = Array.from(root.querySelectorAll("[data-fe-sync-panel]"));
    let role = root.dataset.selfRole || "";

    const flow = () => [ROLE_STEP].concat(FLOWS[role] || []);
    const inFlow = key => flow().some(s => s.key === key);

    function csrf() {
      const el = root.querySelector("[data-fe-sync-csrf]")
              || root.querySelector('input[name="csrf_token"]');
      return el ? el.value : "";
    }
    function saveAction() {
      const f = root.querySelector('form[data-fe-sync-action="save"]');
      return f ? f.action : "";
    }
    function toast(msg, kind) {
      if (window.showSettingsToast) window.showSettingsToast(msg, kind);
    }

    async function postFields(action, fields) {
      const fd = new FormData();
      fd.set("csrf_token", csrf());
      Object.keys(fields).forEach(k => fd.set(k, fields[k]));
      const r = await fetch(action, {
        method: "POST", body: fd,
        headers: { "X-Requested-With": "fetch" },
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    function buildStepper(activeKey) {
      const steps = flow();
      const activeIdx = steps.findIndex(s => s.key === activeKey);
      stepperOl.innerHTML = "";
      steps.forEach((s, i) => {
        const li = document.createElement("li");
        if (s.key === activeKey) li.className = "is-active";
        else if (i < activeIdx) li.className = "is-done";
        const btn = document.createElement("button");
        btn.type = "button";
        const num = document.createElement("span");
        num.className = "fe-sync-num";
        num.textContent = String(i + 1);
        const lbl = document.createElement("span");
        lbl.className = "fe-sync-step-label";
        lbl.textContent = s.label;
        btn.appendChild(num);
        btn.appendChild(lbl);
        btn.addEventListener("click", () => show(s.key));
        li.appendChild(btn);
        stepperOl.appendChild(li);
      });
    }

    function show(key) {
      if (!inFlow(key)) key = "role";
      panels.forEach(p => p.classList.toggle("is-active", p.dataset.feSyncPanel === key));
      buildStepper(key);
      try { sessionStorage.setItem(STORE, key); } catch (e) {}
    }

    function setRole(r) { role = r; root.dataset.selfRole = r; }

    // Reflect a save payload into the Live token boxes + Next button.
    function applyState(data) {
      if (data && data.token) {
        root.querySelectorAll("[data-fe-sync-token]").forEach(c => { c.textContent = data.token; });
        root.querySelectorAll("[data-fe-sync-tokenbox]").forEach(b => {
          b.hidden = false;
          const copyBtn = b.querySelector("[data-copy-text]");
          if (copyBtn && b.querySelector("[data-fe-sync-token]")) copyBtn.dataset.copyText = data.token;
        });
        const next = root.querySelector("[data-fe-sync-next]");
        if (next) next.removeAttribute("disabled");
        // The Generate button's "Regenerate" relabel is handled by the submit
        // handler's restoreLabel (the finally block would otherwise clobber it).
      }
      if (data && typeof data.has_url !== "undefined") {
        root.dataset.hasUrl = data.has_url ? "1" : "0";
      }
    }

    // ── Role selection (force Live first) ──
    root.querySelectorAll("[data-fe-sync-role]").forEach(card => {
      card.addEventListener("click", async () => {
        const r = card.dataset.feSyncRole;
        if (r === "staging") {
          const gate = root.querySelector("[data-fe-sync-gate]");
          if (gate) gate.hidden = false;   // gate: must confirm Live is done
          return;
        }
        setRole("live");
        try { await postFields(saveAction(), { self_role: "live" }); } catch (e) {}
        show("live-token");
      });
    });
    const gateCancel = root.querySelector("[data-fe-sync-gate-cancel]");
    if (gateCancel) gateCancel.addEventListener("click", () => {
      const gate = root.querySelector("[data-fe-sync-gate]");
      if (gate) gate.hidden = true;
    });
    const gateConfirm = root.querySelector("[data-fe-sync-role-confirm]");
    if (gateConfirm) gateConfirm.addEventListener("click", async () => {
      setRole("staging");
      try { await postFields(saveAction(), { self_role: "staging" }); } catch (e) {}
      const gate = root.querySelector("[data-fe-sync-gate]");
      if (gate) gate.hidden = true;
      show("stg-token");
    });

    // ── In-panel navigation ──
    root.querySelectorAll("[data-fe-sync-go]").forEach(btn => {
      btn.addEventListener("click", () => show(btn.dataset.feSyncGo));
    });

    // ── AJAX form submits — no reload, modal stays open ──
    root.querySelectorAll("form[data-fe-sync-action]").forEach(form => {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const action = form.dataset.feSyncAction;
        const submitter = e.submitter;
        const btn = submitter || form.querySelector('button[type="submit"], button:not([type])');
        const orig = btn ? btn.textContent : null;
        let restoreLabel = orig;   // finally restores this; success may change it
        const busy = action === "test" ? "Testing…"
                   : (action === "pull" || action === "push") ? "Working…" : "Saving…";
        if (btn) { btn.disabled = true; btn.textContent = busy; }
        try {
          const fd = new FormData(form);
          if (submitter && submitter.name) fd.set(submitter.name, submitter.value || "");
          const r = await fetch(form.action, {
            method: "POST", body: fd,
            headers: { "X-Requested-With": "fetch" },
            credentials: "same-origin",
          });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const data = await r.json();
          if (action === "save") {
            applyState(data);
            const generated = !!(submitter && submitter.dataset && "feSyncGenerate" in submitter.dataset);
            toast(data.message || "Saved", "success");
            // Generate keeps you on the token panel to copy the new value (and
            // its button now offers to mint a replacement); Save & continue
            // advances to the form's declared next step.
            if (generated) restoreLabel = "Regenerate token";
            else if (form.dataset.feSyncLand) show(form.dataset.feSyncLand);
          } else if (action === "test") {
            toast(data.message || (data.ok ? "Connected" : "Test failed"), data.ok ? "success" : "danger");
          } else if (action === "pull" || action === "push") {
            toast(data.message || (data.ok ? "Done" : "Failed"), data.ok ? "success" : "danger");
            if (data.ok) {
              const ts = root.querySelector("[data-fe-sync-timestamps]");
              if (ts && (data.last_pulled_at || data.last_pushed_at)) {
                const parts = [];
                if (data.last_pulled_at) parts.push("Last pulled " + data.last_pulled_at + " UTC.");
                if (data.last_pushed_at) parts.push("Last pushed " + data.last_pushed_at + " UTC.");
                if (parts.length) ts.textContent = parts.join(" ");
              }
              form.reset();
            }
          }
        } catch (err) {
          const pfx = action === "save" ? "Save failed: "
                    : action === "test" ? "Test failed: " : "Failed: ";
          toast(pfx + err.message, "danger");
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = restoreLabel; }
        }
      });
    });

    // ── Initial step ──
    function startKey() {
      let saved = null;
      try { saved = sessionStorage.getItem(STORE); } catch (e) {}
      if (saved && inFlow(saved)) return saved;
      const hasToken = root.dataset.hasToken === "1";
      const hasUrl = root.dataset.hasUrl === "1";
      if (role === "live") return hasToken ? "live-done" : "live-token";
      if (role === "staging") {
        if (hasToken && hasUrl) return "stg-sync";
        if (hasToken) return "stg-url";
        return "stg-token";
      }
      return "role";
    }
    show(startKey());
  }

  // Copy buttons: <button data-copy-text="…"> — mirrors the [data-copy-url]
  // helper's "Copied!" feedback but copies a literal string.
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-copy-text]");
    if (!btn) return;
    e.preventDefault();
    const text = btn.dataset.copyText || "";
    const done = ok => {
      const orig = btn.textContent;
      btn.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta);
      done(ok);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ── Staging Sync dashboard widget ─────────────────────────────
   One-click Pull/Push to the paired Live site from the dashboard,
   without opening Settings. Pings the peer for a live connection
   status on load, and arms each destructive action with a second
   click (sending the REPLACE confirm the routes require). All over
   AJAX — feedback shows inline in the widget. */
(function dashStagingSync () {
  function init() {
    const root = document.querySelector("[data-dash-sync]");
    if (!root) return;
    const pill = root.querySelector("[data-dash-sync-pill]");
    const msg = root.querySelector("[data-dash-sync-msg]");
    const whenEl = root.querySelector("[data-dash-sync-when]");
    const buttons = Array.from(root.querySelectorAll("[data-dash-sync-action]"));

    const csrf = () => {
      const el = root.querySelector("[data-dash-sync-csrf]");
      return el ? el.value : "";
    };
    function setPill(state, text, title) {
      // is-clickable is re-applied here because every state change rewrites
      // className, and the pill doubles as the re-check button.
      pill.className = "backup-status-pill backup-status-" + state + " is-clickable";
      pill.textContent = text;
      pill.title = (title ? title + " " : "") + "(click to re-check)";
    }
    function showMsg(text, ok) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = text;
      msg.className = "dash-sync-msg " + (ok ? "is-ok" : "is-err");
    }
    async function post(url, fields) {
      const fd = new FormData();
      fd.set("csrf_token", csrf());
      Object.keys(fields || {}).forEach(k => fd.set(k, fields[k]));
      const r = await fetch(url, {
        method: "POST", body: fd,
        headers: { "X-Requested-With": "fetch" },
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    // Live connection check on load (a real ping to the peer). A failure
    // states its reason inline — the pill alone can't say whether the URL
    // is wrong or the network just hiccuped — and the pill stays clickable
    // so a transient blip is one click to re-check.
    let checking = false;
    function check() {
      if (checking) return;
      checking = true;
      setPill("running", "Checking…");
      if (msg) msg.hidden = true;
      post(root.dataset.pingUrl)
        .then(d => {
          if (d.ok) { setPill("ok", "Connected", d.message); }
          else { setPill("failed", "Unreachable", d.message); showMsg(d.message, false); }
        })
        .catch(err => {
          setPill("failed", "Unreachable", err.message);
          showMsg("Connection check failed: " + err.message, false);
        })
        .finally(() => { checking = false; });
    }
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.addEventListener("click", check);
    pill.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); check(); }
    });
    check();

    // Arm-then-confirm: first click reveals the danger label, second runs it.
    let armed = null, armTimer = null;
    function labelOf(b) { return b.querySelector(".dash-sync-label"); }
    function disarm() {
      if (!armed) return;
      armed.classList.remove("btn-danger");
      labelOf(armed).textContent = armed.dataset.idleLabel;
      armed = null;
      clearTimeout(armTimer);
    }
    function arm(b) {
      disarm();
      armed = b;
      b.classList.add("btn-danger");
      labelOf(b).textContent = b.dataset.armLabel;
      armTimer = setTimeout(disarm, 4500);
    }
    async function run(b) {
      const action = b.dataset.dashSyncAction;
      const url = action === "pull" ? root.dataset.pullUrl : root.dataset.pushUrl;
      disarm();
      buttons.forEach(x => { x.disabled = true; });
      labelOf(b).textContent = b.dataset.busyLabel;
      if (msg) msg.hidden = true;
      try {
        const d = await post(url, { confirm: "REPLACE" });
        showMsg(d.message || (d.ok ? "Done." : "Failed."), !!d.ok);
        if (d.ok) {
          if (action === "pull" && d.last_pulled_at) root.dataset.lastPulled = d.last_pulled_at;
          if (action === "push" && d.last_pushed_at) root.dataset.lastPushed = d.last_pushed_at;
          if (whenEl) {
            const parts = [];
            if (root.dataset.lastPulled) parts.push("Pulled " + root.dataset.lastPulled + " UTC.");
            if (root.dataset.lastPushed) parts.push("Pushed " + root.dataset.lastPushed + " UTC.");
            whenEl.textContent = parts.join(" ");
          }
          setPill("ok", "Connected");   // a successful sync proves reachability
        }
      } catch (err) {
        showMsg("Failed: " + err.message, false);
      } finally {
        buttons.forEach(x => { x.disabled = false; });
        labelOf(b).textContent = b.dataset.idleLabel;
      }
    }

    buttons.forEach(b => {
      b.addEventListener("click", () => { (armed === b) ? run(b) : arm(b); });
    });
    // A click anywhere outside the action buttons cancels a pending confirm.
    document.addEventListener("click", e => {
      if (armed && !e.target.closest("[data-dash-sync-action]")) disarm();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ── Frontend rollback snapshots modal ─────────────────────────
   Shared by the Settings → Data staging-sync card and the Web Frontend
   overview Status card. Any [data-fe-snap-open] button opens the shared
   #fe-sync-snapshots-modal (app.js handles the open via data-open-modal)
   and (re)loads the bundle list on each click so it's current after a
   Pull/Push. The list is rendered as download rows from the JSON route. */
(function feSyncSnapshots () {
  function init() {
    const modal = document.getElementById("fe-sync-snapshots-modal");
    const openers = document.querySelectorAll("[data-fe-snap-open]");
    if (!modal || !openers.length) return;
    const list = modal.querySelector("[data-fe-snap-list]");
    const url = modal.dataset.snapshotsUrl;

    async function loadSnaps() {
      list.innerHTML = '<li class="fe-snap-empty muted small">Loading…</li>';
      try {
        const r = await fetch(url, { headers: { "X-Requested-With": "fetch" }, credentials: "same-origin" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json();
        const snaps = (data && data.snapshots) || [];
        if (!snaps.length) {
          list.innerHTML = '<li class="fe-snap-empty muted small">No snapshots yet — one is saved automatically before each sync.</li>';
          return;
        }
        list.innerHTML = "";
        snaps.forEach(s => {
          const li = document.createElement("li");
          li.className = "fe-snap-row";
          const info = document.createElement("div");
          info.className = "fe-snap-info";
          const date = document.createElement("span");
          date.className = "fe-snap-date";
          date.textContent = s.date || s.name;
          const meta = document.createElement("span");
          meta.className = "fe-snap-meta";
          meta.textContent = (s.size || "") + " · " + s.name;
          info.appendChild(date); info.appendChild(meta);
          const dl = document.createElement("a");
          dl.className = "btn btn-sm";
          dl.href = s.url;
          dl.setAttribute("download", "");
          dl.textContent = "Download";
          li.appendChild(info); li.appendChild(dl);
          list.appendChild(li);
        });
      } catch (err) {
        list.innerHTML = '<li class="fe-snap-empty is-err">Couldn’t load snapshots: ' + err.message + "</li>";
      }
    }

    openers.forEach(btn => btn.addEventListener("click", loadSnaps));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* Mobile swipe strips — the top-bar actions and the Watchtower tabs
   overflow into a horizontal swipe strip below 720px (scrollbar
   hidden), so without a cue there's no hint that more exists
   off-screen. Drive the CSS mask vars (--swipe-fade-l / -r) from the
   live scroll position: an edge only fades while content is actually
   hidden past it. */
(function topActionsSwipeFade() {
  const FADE = "28px";
  // Each strip once; the hook runs this again on a page brought in by
  // tspSwapPage (Watchtower's sections), whose strips are new elements.
  function init() {
    // Open a tab strip scrolled to the current tab, so arriving on
    // Requests doesn't leave it hidden past the right edge.
    document.querySelectorAll(".wt-tabs-track").forEach(track => {
      if (track._fadeCentered) return;
      track._fadeCentered = true;
      const active = track.querySelector('[aria-current="page"]');
      if (!active || track.scrollWidth <= track.clientWidth) return;
      const t = track.getBoundingClientRect(), a = active.getBoundingClientRect();
      track.scrollLeft += (a.left - t.left) - (t.width - a.width) / 2;
    });
    document.querySelectorAll(".top-actions, .wt-tabs-track").forEach(strip => {
      if (strip._swipeFade) return;
      const update = () => {
        const max = strip.scrollWidth - strip.clientWidth;
        strip.style.setProperty("--swipe-fade-l", max > 2 && strip.scrollLeft > 2 ? FADE : "0px");
        strip.style.setProperty("--swipe-fade-r", max > 2 && strip.scrollLeft < max - 2 ? FADE : "0px");
      };
      strip._swipeFade = update;
      strip.addEventListener("scroll", update, { passive: true });
      if (typeof ResizeObserver !== "undefined") {
        // The strip resizing, or anything inside it (a control appearing).
        const ro = new ResizeObserver(update);
        ro.observe(strip);
        Array.from(strip.children).forEach(c => ro.observe(c));
      } else {
        window.addEventListener("resize", update);
      }
      update();
    });
  }
  const run = window.tspOnEachPage || (fn => fn());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => run(init));
  else run(init);
})();

/* ── Click-to-reveal for abbreviated IPv6 in the Watchtower tables ──
   Markup comes from the ip_cell() macro (templates/watchtower/
   _ip_cell.html): the button carries the elided label and the full
   stored address, and this swaps between them.

   Delegated off the document so it covers every Watchtower view plus
   rows injected later (the 404 tab's fetch-rendered IP lists, the
   requests table's live row removal) without each page wiring its own
   listener. Toggles both ways so an expanded address can be collapsed
   again rather than leaving the column wide for the rest of the
   session. */
(function () {
  document.addEventListener("click", function (ev) {
    const btn = ev.target.closest && ev.target.closest("[data-ip-reveal]");
    if (!btn) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.textContent = open ? btn.dataset.ipShort : btn.dataset.ipFull;
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    btn.classList.toggle("is-open", !open);
    btn.title = open ? btn.dataset.ipFull + " — click to show in full"
                     : "Click to shorten";
  });
})();

/* ── Row actions dropdown (templates/_row_menu.html) ───────────────
   Collapses an admin table row's action buttons behind one trigger.
   The panel is `position: fixed` and placed here on open rather than
   absolutely positioned in the row: the card clips overflow, and below
   720px `.card .tbl { overflow-x: auto }` makes the table its own
   scroll container — either would cut an in-flow panel off.

   Delegated off the document so it covers rows the client-side column
   sort has re-ordered (the Pages list moves <tr> nodes around) and any
   table that adopts the macro later, without per-page wiring. */
/* ── Markdown toolbar ([data-md-toolbar] inside a [data-md-editor]) ──
   Each button writes Markdown into the editor's textarea at the caret
   or around the selection; pressing it again on already-formatted text
   takes the formatting off. Edits go through execCommand("insertText")
   where the browser has it, so Ctrl+Z undoes them like typing, and they
   fire "input", so the live preview and the save bar follow.
   Ctrl/Cmd+B, I and K are bold, italic and link. */
(function initMdToolbars() {
  function areaFor(el) {
    var ed = el.closest("[data-md-editor]");
    return ed && ed.querySelector(".md-editor-pane-write textarea, textarea");
  }

  // Replace [start, end) with text, then select [selStart, selEnd).
  function put(ta, start, end, text, selStart, selEnd) {
    ta.focus();
    ta.setSelectionRange(start, end);
    var done = false;
    try { done = document.execCommand("insertText", false, text); } catch (_) {}
    if (!done || ta.value.slice(start, start + text.length) !== text) {
      ta.setRangeText(text, start, end, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    ta.setSelectionRange(selStart, selEnd);
  }

  // Bold, italic and inline code: wrap the selection, or a placeholder.
  function wrap(ta, mark, placeholder) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    // A double-click can take the space after a word; leave it outside.
    while (e > s && /\s/.test(v[e - 1])) e--;
    while (s < e && /\s/.test(v[s])) s++;
    var sel = v.slice(s, e), n = mark.length;
    if (sel && v.slice(s - n, s) === mark && v.slice(e, e + n) === mark) {
      put(ta, s - n, e + n, sel, s - n, e - n);
    } else if (sel.length > 2 * n && sel.slice(0, n) === mark && sel.slice(-n) === mark) {
      var inner = sel.slice(n, -n);
      put(ta, s, e, inner, s, s + inner.length);
    } else if (sel) {
      put(ta, s, e, mark + sel + mark, s + n, e + n);
    } else {
      put(ta, s, e, mark + placeholder + mark, s + n, s + n + placeholder.length);
    }
  }

  // The whole lines the selection touches.
  function lineRange(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (e > s && v[e - 1] === "\n") e--;
    var ls = v.lastIndexOf("\n", s - 1) + 1;
    var le = v.indexOf("\n", e);
    if (le < 0) le = v.length;
    return [ls, le];
  }

  // Headings, lists and quotes: prefix every line, or take it off when
  // every line already has it. Python-Markdown needs a blank line
  // between a paragraph and a list, heading or quote, so one is added
  // on either side where the neighbouring line has text.
  var LINE = {
    heading: { re: /^#{1,6} /, add: function () { return "## "; } },
    ul: { re: /^[-*+] /, add: function () { return "- "; } },
    ol: { re: /^\d+\. /, add: function (i) { return (i + 1) + ". "; } },
    quote: { re: /^> ?/, add: function () { return "> "; } },
  };
  function prefixLines(ta, kind) {
    var spec = LINE[kind], v = ta.value, r = lineRange(ta);
    var lines = v.slice(r[0], r[1]).split("\n");
    var filled = lines.filter(function (l) { return l.trim(); });
    var off = filled.length && filled.every(function (l) { return spec.re.test(l); });
    var i = 0;
    var out = lines.map(function (l) {
      if (off) return l.replace(spec.re, "");
      if (!l.trim() && lines.length > 1) return l;
      // Switching list type (or heading level) replaces the old marker.
      var bare = l.replace(LINE.ul.re, "").replace(LINE.ol.re, "").replace(LINE.heading.re, "");
      return spec.add(i++) + bare;
    }).join("\n");
    var before = "", after = "";
    if (!off) {
      var prev = v.slice(0, r[0]);
      if (prev && !/\n\s*\n$/.test(prev) && prev.replace(/\n$/, "").split("\n").pop().trim()) before = prev.endsWith("\n") ? "\n" : "\n\n";
      var next = v.slice(r[1]);
      if (next && next.replace(/^\n/, "").split("\n")[0].trim() && !/^\n\s*\n/.test(next)) after = next.startsWith("\n") ? "\n" : "\n\n";
    }
    var text = before + out + after;
    var a = r[0] + before.length, b = a + out.length;
    if (lines.length === 1) a = b;   // one line: caret at its end
    put(ta, r[0], r[1], text, a, b);
  }

  function link(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e).trim();
    if (/^(https?:\/\/|\/|mailto:)\S*$/.test(sel)) {
      var t = "[link text](" + sel + ")";
      put(ta, s, e, t, s + 1, s + 10);
    } else if (sel) {
      var u = "[" + sel + "](https://)";
      put(ta, s, e, u, s + sel.length + 3, s + sel.length + 11);
    } else {
      var w = "[link text](https://)";
      put(ta, s, e, w, s + 1, s + 10);
    }
  }

  function code(ta) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = v.slice(s, e);
    if (sel.indexOf("\n") < 0) { wrap(ta, "`", "code"); return; }
    var lead = s && v[s - 1] !== "\n" ? "\n" : "";
    var t = lead + "```\n" + sel.replace(/\n$/, "") + "\n```\n";
    put(ta, s, e, t, s + lead.length + 4, s + lead.length + 4 + sel.replace(/\n$/, "").length);
  }

  // A block (divider, image) on lines of its own.
  function block(ta, body) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var prev = v.slice(0, s), next = v.slice(e);
    var lead = !prev || /\n\n$/.test(prev) ? "" : (prev.endsWith("\n") ? "\n" : "\n\n");
    var tail = /^\n\n/.test(next) ? "" : (next.startsWith("\n") ? "\n" : "\n\n");
    var t = lead + body + tail;
    put(ta, s, e, t, s + t.length, s + t.length);
  }

  window.tspMdInsertImage = function (ta, filename) {
    var sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    var alt = (sel || filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")).replace(/[\[\]]/g, "");
    block(ta, "![" + alt + "](/pub/" + encodeURIComponent(filename) + ")");
  };

  function run(cmd, ta, btn) {
    if (cmd === "bold") wrap(ta, "**", "bold text");
    else if (cmd === "italic") wrap(ta, "_", "italic text");
    else if (cmd === "code") code(ta);
    else if (cmd === "link") link(ta);
    else if (cmd === "hr") block(ta, "---");
    else if (cmd === "image") {
      if (window.tspMdPickImage) window.tspMdPickImage(ta);
      else block(ta, "![description](https://)");
    }
    else if (LINE[cmd]) prefixLines(ta, cmd);
  }

  // mousedown keeps the textarea's selection from being lost to the
  // button before the click runs.
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest && e.target.closest("[data-md-toolbar] [data-md-cmd]")) e.preventDefault();
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-md-toolbar] [data-md-cmd]");
    if (!btn) return;
    var ta = areaFor(btn);
    if (ta) run(btn.getAttribute("data-md-cmd"), ta, btn);
  });
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    var ta = e.target;
    if (!ta || ta.tagName !== "TEXTAREA") return;
    var ed = ta.closest("[data-md-editor]");
    if (!ed || !ed.querySelector("[data-md-toolbar]")) return;
    var k = (e.key || "").toLowerCase();
    var cmd = k === "b" ? "bold" : k === "i" ? "italic" : k === "k" ? "link" : null;
    if (!cmd) return;
    e.preventDefault();
    run(cmd, ta);
  });
})();

(function initRowMenus() {
  var GAP = 6;          // px between trigger and panel
  var VIEWPORT_PAD = 8; // keep the panel this far from the viewport edge
  var open = null;      // { menu, btn, panel }

  function place() {
    if (!open) return;
    var r = open.btn.getBoundingClientRect();
    var p = open.panel;
    // Measure with the panel laid out but before committing a position.
    var pw = p.offsetWidth, ph = p.offsetHeight;
    // Right-align to the trigger (actions live at the row's right edge),
    // then clamp so a narrow viewport can't push it off-screen.
    var left = r.right - pw;
    left = Math.max(VIEWPORT_PAD,
                    Math.min(left, document.documentElement.clientWidth - pw - VIEWPORT_PAD));
    // Below the trigger, flipping above when there isn't room.
    var top = r.bottom + GAP;
    if (top + ph > window.innerHeight - VIEWPORT_PAD && r.top - GAP - ph > VIEWPORT_PAD) {
      top = r.top - GAP - ph;
    }
    top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - ph - VIEWPORT_PAD));
    p.style.left = Math.round(left) + "px";
    p.style.top = Math.round(top) + "px";
  }

  function close(restoreFocus) {
    if (!open) return;
    var o = open;
    open = null;
    o.panel.hidden = true;
    o.menu.classList.remove("is-open");
    o.btn.setAttribute("aria-expanded", "false");
    if (restoreFocus) o.btn.focus();
  }

  function openFor(menu) {
    close(false);
    var btn = menu.querySelector("[data-row-menu-btn]");
    var panel = menu.querySelector("[data-row-menu-panel]");
    if (!btn || !panel) return;
    panel.hidden = false;
    menu.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    open = { menu: menu, btn: btn, panel: panel };
    place();
  }

  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("[data-row-menu-btn]");
    if (btn) {
      ev.preventDefault();
      var menu = btn.closest("[data-row-menu]");
      if (open && open.menu === menu) close(false);
      else openFor(menu);
      return;
    }
    // A click inside the open panel is an action (a link, a form submit,
    // or the Rename button's `data-open-modal` handler). Never
    // preventDefault it — just dismiss the menu so it isn't left hanging
    // open behind a modal or a confirm. Those handlers are bound to the
    // element itself, so they've already run by the time this
    // document-level listener sees the event.
    close(false);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && open) close(true);
  });

  // Any scroll (page or a scrollable ancestor) moves the trigger out
  // from under a fixed panel, so follow it. Capture phase catches
  // scrolls on inner containers, which don't bubble.
  window.addEventListener("scroll", function () { if (open) place(); }, true);
  window.addEventListener("resize", function () { if (open) close(false); });
})();

/* ── Sidebar scroll memory ──────────────────────────────────────────
   #sidebar-scroll (brand, top rows and nav) is its own scroll
   container and every admin navigation
   is a full page load, so the nav snapped back to the top on each one
   — anyone working in a section near the bottom had to re-scroll after
   every click. Persist the offset per tab (sessionStorage, so a new tab
   starts fresh) and put it back before paint.

   The nav is also re-rendered in place by the live-badge poller
   (`nav.innerHTML = html`), which resets scrollTop just as hard; that
   path calls save()/restore() around the swap via the hook below. */
(function initSidebarScrollMemory() {
  var KEY = "tsp-sidebar-scroll";
  function nav() { return document.getElementById("sidebar-scroll"); }

  function save() {
    var n = nav();
    if (!n) return;
    try { sessionStorage.setItem(KEY, String(n.scrollTop)); } catch (e) {}
  }
  function restore() {
    var n = nav();
    if (!n) return;
    var raw;
    try { raw = sessionStorage.getItem(KEY); } catch (e) { return; }
    if (raw == null) return;
    var want = parseFloat(raw) || 0;
    if (!want) return;
    // The nav's height varies between pages (collapsed sections, badges
    // appearing), so clamp rather than trusting the stored offset.
    var max = n.scrollHeight - n.clientHeight;
    if (max > 0) n.scrollTop = Math.min(want, max);
  }

  var pending = false;
  document.addEventListener("scroll", function (e) {
    if (!e.target || e.target.id !== "sidebar-scroll") return;
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; save(); });
  }, true);

  // Belt and braces: a click that navigates away may beat the rAF.
  window.addEventListener("pagehide", save);
  window.addEventListener("beforeunload", save);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restore);
  } else {
    restore();
  }
  // Section collapse state is applied after DOMContentLoaded and changes
  // the nav's height, so re-apply once everything has settled.
  window.addEventListener("load", restore);

  window.tspSidebarScroll = { save: save, restore: restore };
})();

/* ── Modal reopen memory ────────────────────────────────────────────
   Reloading the page — the browser's refresh, the update banner's
   reload, the save bar's post-save reload — used to drop you back on
   the bare page with whatever modal you were editing closed. That's
   the wrong side of the trade for a block editor you live inside.

   Remember which modal is open (per tab, via sessionStorage) and
   replay the open on the next load of the same URL. The replay goes
   through the ORIGINAL trigger — clicking the structure-card pill or
   the [data-open-modal] button — so every handler that normally runs
   on open (BlockEditor mount, hero-modal populate, dynbg trigger
   decoration) runs exactly as if the admin had clicked it.

   Cleared when the last open modal closes, so closing a modal and then
   reloading stays a plain reload. Nested pickers on top of a block
   modal (dynbg, icon, media) aren't remembered — they're transient. */
(function initModalReopenMemory() {
  var KEY = "tsp-reopen-modal";
  var MAX_AGE_MS = 12 * 60 * 60 * 1000;

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function write(state) {
    try {
      if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
      else sessionStorage.removeItem(KEY);
    } catch (e) {}
  }

  // Record the trigger that opened a modal. Capture phase so we see
  // the click before any handler that might stop propagation.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var pill = t.closest("[data-page-block-id]");
    if (pill && !t.closest("[data-be-remove-block], [data-be-remove-row], "
                           + "[data-be-duplicate-block], [data-be-duplicate-row]")) {
      write({ path: location.pathname, blockId: pill.dataset.pageBlockId, ts: Date.now() });
      return;
    }
    var trig = t.closest("[data-open-modal]");
    if (trig) {
      write({ path: location.pathname, modalId: trig.dataset.openModal,
              modalSrc: trig.dataset.modalSrc || "", ts: Date.now() });
    }
  }, true);

  // A modal's own form posting for real (not intercepted by a script)
  // finishes that modal: the page it lands on shouldn't open it again.
  // Bubble phase on window, so handlers that take the submit over have
  // already called preventDefault.
  window.addEventListener("submit", function (e) {
    if (e.defaultPrevented) return;
    var f = e.target;
    if (f && f.closest && f.closest(".modal")) write(null);
  });

  // Forget it once the last modal closes.
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var el = records[i].target;
        if (!el.classList || !el.classList.contains("modal")) continue;
        if (!el.classList.contains("open") && !document.querySelector(".modal.open")) {
          write(null);
          return;
        }
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"], subtree: true });
  }

  // Replay after everything that binds open handlers has run.
  function replay() {
    var state = read();
    if (!state || state.path !== location.pathname) return;
    if (!state.ts || Date.now() - state.ts > MAX_AGE_MS) { write(null); return; }
    if (document.querySelector(".modal.open")) return;  // something already open
    var target = null;
    if (state.blockId) {
      target = document.querySelector('[data-page-block-id="' + CSS.escape(state.blockId) + '"]');
    } else if (state.modalId) {
      var trigs = document.querySelectorAll('[data-open-modal="' + CSS.escape(state.modalId) + '"]');
      for (var i = 0; i < trigs.length; i++) {
        if (!state.modalSrc || (trigs[i].dataset.modalSrc || "") === state.modalSrc) { target = trigs[i]; break; }
      }
    }
    if (!target) { write(null); return; }
    // Dispatch a click carrying the trigger's real on-screen position.
    // A bare element.click() reports clientX/Y = 0, and handlers that
    // reason about where a click landed (the collapsible card's
    // "was that the header?" check) would misread it. The click
    // re-records the same state, which is what we want — the modal is
    // open again, so a further reload restores it again.
    var r = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true, view: window,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2),
    }));
  }
  window.addEventListener("load", function () {
    requestAnimationFrame(function () { requestAnimationFrame(replay); });
  });
})();

// ── Watchtower chart hover layer ──────────────────────────────────────
// Drives every chart rendered by templates/watchtower/_chart.html. The
// markup contract:
//
//   <figure class="wtc" data-wtc="line|bar" tabindex="0">
//     <svg class="wtc-svg" viewBox="0 0 W H"> … 
//       <line class="wtc-crosshair" hidden/>
//       <g class="wtc-focus-dots" hidden></g>
//       <rect class="wtc-hit" …/>            (line: one over the plot)
//       <rect class="wtc-hit--bar" data-i/>  (bar: one per bar)
//     </svg>
//     <div class="wtc-tooltip" hidden></div>
//     <script type="application/json" class="wtc-data">[…points…]</script>
//   </figure>
//
// Points carry their own SVG-space x, so finding the nearest is a scan
// over numbers rather than any hit-testing against the marks: the
// pointer only has to be *closest* to a date, never land on a 2px line.
//
// Keyboard gets the identical readout — arrow keys step the focus index,
// which matters because the tooltip is a value's second home (the table
// view under each chart is the first).
// Runs again on a page brought in by tspSwapPage (Watchtower's tabs).
(window.tspOnEachPage || (f => f()))(function () {
  const charts = Array.from(document.querySelectorAll('[data-wtc]')).filter(fig => !fig.dataset.wtcBound);
  if (!charts.length) return;

  const fmt = (n) => Number(n).toLocaleString();

  charts.forEach((fig) => {
    fig.dataset.wtcBound = '1';
    const svg = fig.querySelector('.wtc-svg');
    const dataEl = fig.querySelector('.wtc-data');
    const tip = fig.querySelector('.wtc-tooltip');
    const hair = fig.querySelector('.wtc-crosshair');
    const dots = fig.querySelector('.wtc-focus-dots');
    if (!svg || !dataEl || !tip) return;

    let points = [];
    try {
      points = JSON.parse(dataEl.textContent) || [];
    } catch (err) {
      return;
    }
    if (!points.length) return;

    // SVG elements don't implement HTMLElement's `hidden` IDL property, so
    // `el.hidden = false` silently sets a JS expando and leaves the
    // attribute (and the UA's display:none) in place. Toggle the
    // attribute directly.
    const svgShow = (el) => el && el.removeAttribute('hidden');
    const svgHide = (el) => el && el.setAttribute('hidden', '');

    const isBar = fig.dataset.wtc === 'bar';
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const vbW = vb[2] || 1;
    const bars = isBar ? Array.from(svg.querySelectorAll('.wtc-bar')) : [];
    let active = -1;

    // Client x -> viewBox x. The SVG scales uniformly (no
    // preserveAspectRatio="none"), so one ratio covers it.
    function toViewBoxX(clientX) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return 0;
      return (clientX - r.left) * (vbW / r.width);
    }

    function nearestIndex(vx) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].x - vx);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    // Labels come from logged request data (paths, hours, dates), so
    // every insertion is textContent — never innerHTML concatenation.
    function renderTip(p) {
      tip.textContent = '';
      const head = document.createElement('div');
      head.className = 'wtc-tt-label';
      head.textContent = p.label;
      tip.appendChild(head);
      (p.values || []).forEach((v) => {
        const row = document.createElement('div');
        row.className = 'wtc-tt-row';
        const key = document.createElement('span');
        key.className = 'wtc-tt-key';
        key.style.background = v.color || 'currentColor';
        const val = document.createElement('span');
        val.className = 'wtc-tt-value';
        val.textContent = fmt(v.v);
        const name = document.createElement('span');
        name.className = 'wtc-tt-name';
        name.textContent = v.name;
        row.appendChild(key); row.appendChild(val); row.appendChild(name);
        tip.appendChild(row);
      });
    }

    function show(i) {
      const p = points[i];
      if (!p) return;
      active = i;
      renderTip(p);
      tip.hidden = false;
      fig.classList.add('is-hovering');

      if (hair) { hair.setAttribute('x1', p.x); hair.setAttribute('x2', p.x); svgShow(hair); }
      if (bars.length) {
        bars.forEach((b) => b.classList.remove('is-active'));
        if (bars[i]) bars[i].classList.add('is-active');
      }
      // Dots mark where each series sits at the crosshair.
      if (dots) {
        dots.textContent = '';
        (p.values || []).forEach((v) => {
          if (v.y === undefined || v.y === null) return;
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', p.x); c.setAttribute('cy', v.y); c.setAttribute('r', 4);
          c.setAttribute('fill', v.color || 'currentColor');
          c.setAttribute('class', 'wtc-focus-dot');
          dots.appendChild(c);
        });
        svgShow(dots);
      }

      // Position the tooltip over the point, clamped inside the figure so
      // the first and last dates don't push it off the card.
      const r = svg.getBoundingClientRect();
      const figR = fig.getBoundingClientRect();
      const scale = r.width / vbW;
      let left = (r.left - figR.left) + p.x * scale;
      const halfW = tip.offsetWidth / 2;
      left = Math.max(halfW + 2, Math.min(left, figR.width - halfW - 2));
      tip.style.left = left + 'px';

      // Ride just above the topmost series value rather than pinning to
      // the top of the plot — a fixed-top tooltip drifts into the card
      // heading on tall cards and hides the title.
      const ys = (p.values || []).map((v) => v.y).filter((y) => typeof y === 'number');
      const topY = ys.length ? Math.min.apply(null, ys) : 0;
      const pointTop = (r.top - figR.top) + topY * scale;
      const above = pointTop - 12;
      if (above - tip.offsetHeight >= 0) {
        tip.style.top = above + 'px';
        tip.style.transform = 'translate(-50%, -100%)';
      } else {
        // Not enough headroom (a peak near the top of the plot) — flip
        // below the point so the tooltip never leaves the card.
        tip.style.top = (pointTop + 14) + 'px';
        tip.style.transform = 'translate(-50%, 0)';
      }
    }

    function hide() {
      active = -1;
      tip.hidden = true;
      fig.classList.remove('is-hovering');
      svgHide(hair);
      if (dots) { svgHide(dots); dots.textContent = ''; }
      bars.forEach((b) => b.classList.remove('is-active'));
    }

    svg.addEventListener('pointermove', (e) => show(nearestIndex(toViewBoxX(e.clientX))));
    svg.addEventListener('pointerleave', hide);
    fig.addEventListener('blur', hide);
    fig.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' &&
          e.key !== 'Home' && e.key !== 'End' && e.key !== 'Escape') return;
      e.preventDefault();
      if (e.key === 'Escape') return hide();
      let i = active < 0 ? 0 : active;
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowRight') i = Math.min(points.length - 1, i + 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = points.length - 1;
      show(i);
    });
  });
});

// Segmented controls (.st-seg, accent; .ds-seg-btns, raised chip): the
// chosen part's highlight is one shape that slides to whichever part is
// chosen, rather than each part lighting up on its own. It moves in both
// directions, since a control with many parts wraps onto a second row,
// and follows the parts when they resize or one is hidden. Whatever
// chooses the part (fe_studio.js, design_studio.js, a link, a radio)
// only has to mark it: aria-selected, aria-checked, aria-current, or a
// checked radio inside a label.
(function () {
  var CHOSEN = '[aria-selected="true"], [aria-checked="true"], [aria-current="page"], label:has(> input:checked)';
  function setup(nav) {
    if (nav._segThumb) return;
    var thumb = document.createElement('span');
    thumb.className = 'st-seg-thumb is-still';
    thumb.setAttribute('aria-hidden', 'true');
    nav.insertBefore(thumb, nav.firstChild);
    nav._segThumb = thumb;
    nav.classList.add('has-thumb');
    var shown = false;
    function place(animate) {
      var on = Array.prototype.find.call(nav.children, function (el) { return el !== thumb && el.matches(CHOSEN); });
      if (!on || on.hidden || !on.offsetWidth) { thumb.style.opacity = '0'; shown = false; return; }
      // The first placement (and one after a resize) lands without
      // sliding in from wherever the shape last was.
      var still = !animate || !shown;
      thumb.classList.toggle('is-still', still);
      thumb.style.width = on.offsetWidth + 'px';
      thumb.style.height = on.offsetHeight + 'px';
      thumb.style.transform = 'translate(' + on.offsetLeft + 'px, ' + on.offsetTop + 'px)';
      thumb.style.opacity = '1';
      shown = true;
      if (still) requestAnimationFrame(function () { thumb.classList.remove('is-still'); });
    }
    place(false);
    if (window.MutationObserver) {
      new MutationObserver(function () { place(true); })
        .observe(nav, { attributes: true, attributeFilter: ['aria-selected', 'aria-checked', 'aria-current', 'hidden'], subtree: true });
    }
    nav.addEventListener('change', function () { place(true); });
    if (window.ResizeObserver) new ResizeObserver(function () { place(false); }).observe(nav);
    window.addEventListener('load', function () { place(false); });
  }
  function init() { document.querySelectorAll('.st-seg, .ds-seg-btns').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Controls on a page brought in by tspSwapPage get theirs too.
  if (window.tspOnEachPage) window.tspOnEachPage(init);
})();

// Segmented controls that scroll sideways ([data-seg-scroll] around the
// .st-seg): fade the edge with parts out of view, let a vertical wheel
// scroll it, and keep the chosen part in view.
(function () {
  function setup(wrap) {
    var strip = wrap.querySelector('.st-seg');
    if (!strip) return;
    function fade() {
      var max = strip.scrollWidth - strip.clientWidth;
      wrap.toggleAttribute('data-fade-start', strip.scrollLeft > 1);
      wrap.toggleAttribute('data-fade-end', strip.scrollLeft < max - 1);
    }
    function reveal(behavior) {
      var on = strip.querySelector('[aria-selected="true"]');
      if (!on) return;
      var l = on.offsetLeft - strip.offsetLeft, r = l + on.offsetWidth, pad = 48;
      if (l < strip.scrollLeft + pad) strip.scrollTo({ left: l - pad, behavior: behavior });
      else if (r > strip.scrollLeft + strip.clientWidth - pad) strip.scrollTo({ left: r - strip.clientWidth + pad, behavior: behavior });
    }
    strip.addEventListener('scroll', fade, { passive: true });
    strip.addEventListener('wheel', function (e) {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    }, { passive: false });
    // However the part changes (a click on it, or a jump from elsewhere
    // on the page such as a preview's color swatch), slide it into view.
    if (window.MutationObserver) {
      new MutationObserver(function (recs) {
        if (recs.some(function (r) { return r.target.getAttribute('aria-selected') === 'true'; })) reveal('smooth');
      }).observe(strip, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    }
    if (window.ResizeObserver) new ResizeObserver(fade).observe(strip);
    reveal('auto');
    fade();
    // The page's own script may pick the remembered part after this runs.
    window.addEventListener('load', function () { reveal('auto'); fade(); });
  }
  function init() { document.querySelectorAll('[data-seg-scroll]').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ── Delete confirmation (_confirm_modal.html) ──────────────────────
// window.tspConfirm({title, message, confirmLabel, tone}) shows the
// dialog and resolves true (confirmed) or false; tone "neutral" is for
// a question that isn't a deletion. A form carrying
// data-confirm="<message>" asks first and submits only once confirmed
// (data-confirm-title / data-confirm-label set the heading and button).
(function () {
  const modal = document.getElementById("tsp-confirm");
  if (!modal) return;
  const title = modal.querySelector("#tsp-confirm-title");
  const msg = modal.querySelector("#tsp-confirm-msg");
  const ok = modal.querySelector("[data-confirm-ok]");
  let settle = null, lastFocus = null;

  function close(result) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.open")) document.body.style.overflow = "";
    const done = settle; settle = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (_) {} }
    if (done) done(result);
  }
  window.tspConfirm = function (opts) {
    opts = opts || {};
    if (settle) close(false);
    title.textContent = opts.title || "Delete this?";
    msg.textContent = opts.message || "This can't be undone.";
    ok.textContent = opts.confirmLabel || "Delete";
    const neutral = opts.tone === "neutral";
    modal.classList.toggle("is-neutral", neutral);
    ok.classList.toggle("btn-danger", !neutral);
    ok.classList.toggle("btn-primary", neutral);
    lastFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => ok.focus(), 30);
    return new Promise(resolve => { settle = resolve; });
  };
  ok.addEventListener("click", () => close(true));
  modal.querySelectorAll("[data-confirm-cancel]").forEach(el => el.addEventListener("click", () => close(false)));
  // Escape cancels this dialog only, not a modal open beneath it.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      e.stopImmediatePropagation();
      close(false);
    }
  }, true);

  document.addEventListener("submit", e => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || !f.hasAttribute("data-confirm")) return;
    if (f._tspConfirmed) { f._tspConfirmed = false; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    const submitter = e.submitter || null;
    window.tspConfirm({
      title: f.dataset.confirmTitle,
      message: f.dataset.confirm,
      confirmLabel: f.dataset.confirmLabel,
    }).then(yes => {
      if (!yes) return;
      f._tspConfirmed = true;
      if (f.requestSubmit) f.requestSubmit(submitter && submitter.form === f ? submitter : undefined);
      else f.submit();
    });
  }, true);
})();

// ── Settings panes that are pages of their own (Users, Global) ─────
// window.tspSettingsPane.dirty(key, on, save) tells the Settings save
// bar, in the page around this iframe, that this pane has unsaved
// changes and how to save them (save() resolves when saved, throws if
// not). .attached is false when the page isn't inside Settings; it then
// keeps its own save buttons.
(function () {
  let host = null, pane = "frame";
  try {
    if (window.frameElement && window.parent.tspSettingsHost) {
      host = window.parent.tspSettingsHost;
      const p = window.frameElement.closest("[data-pane]");
      if (p) pane = p.dataset.pane;
    }
  } catch (_) {}
  const reported = new Set();
  window.tspSettingsPane = {
    attached: !!host,
    dirty(key, on, save) {
      if (!host) return;
      if (on) reported.add(key); else reported.delete(key);
      host.dirty(pane, key, on, save);
    },
  };
  // A reload (after saving, or a dialog's own post) takes back what this
  // page reported: its unsaved edits go with it.
  window.addEventListener("pagehide", () => {
    if (host) reported.forEach(k => host.dirty(pane, k, false));
  });
})();


// ── Live search ─────────────────────────────────────────────────────
// A GET form marked data-live-search (the list pages' sidebar search)
// runs as its search box changes: the page is fetched with the form's
// values and every [data-live="<name>"] part is swapped for the same
// part of the answer, so the list and the sidebar's counts follow the
// typing while the box keeps focus. Enter runs it at once. Parts that
// are swapped lose listeners bound to their elements, so handlers for
// anything inside one are delegated; "live:updated" fires after each
// swap for anything that needs to look again.
// The filter sidebar on a phone (760px and under, where it stacks above
// the list): its groups fold away behind a Filters button beside the
// search, so the list comes first. The button counts the filters in
// use, and each shows as a chip that clears it. A filter in use is a
// group whose current link isn't its first (the group's "All" or
// default). Picking a filter loads the page folded again, showing the
// result. Desktop is unchanged: the bar is display: contents there and
// the button and chips are hidden.
(function initSideFold() {
  var tpl = document.getElementById("fb-side-fold-tpl");
  if (!tpl) return;
  function inUse(side) {
    var out = [];
    side.querySelectorAll(".fb-side-group").forEach(function (g) {
      var links = g.querySelectorAll(".fb-side-link");
      var cur = g.querySelector('.fb-side-link[aria-current="true"]');
      if (links.length < 2 || !cur || cur === links[0]) return;
      // The link's label: its first span with text (some lead with an
      // empty swatch), not the count.
      var span = Array.prototype.find.call(cur.querySelectorAll("span:not(.fb-side-count)"),
        function (el) { return el.textContent.trim(); });
      out.push({ label: (span || cur).textContent.trim(), href: links[0].getAttribute("href"),
                 group: g.getAttribute("aria-label") || "" });
    });
    return out;
  }
  function refresh(side) {
    var f = side._fold;
    if (!f) return;
    var used = inUse(side);
    f.n.textContent = used.length;
    f.n.hidden = !used.length;
    f.btn.setAttribute("aria-label", "Filters" + (used.length ? ", " + used.length + " in use" : ""));
    f.chips.textContent = "";
    used.forEach(function (u) {
      var a = document.createElement("a");
      a.className = "fb-side-chip";
      a.href = u.href;
      a.title = "Clear " + (u.group ? u.group + ": " : "") + u.label;
      var t = document.createElement("span");
      t.textContent = u.label;
      a.appendChild(t);
      a.appendChild(f.x.cloneNode(true));
      f.chips.appendChild(a);
    });
    f.chips.hidden = !used.length;
  }
  function setup(side) {
    if (side._fold || !side.querySelector(".fb-side-group:not(.fb-side-keep)")) return;
    var search = side.querySelector(".fb-search");
    var frag = tpl.content.cloneNode(true);
    var btn = frag.querySelector(".fb-side-fold");
    var bar = document.createElement("div");
    bar.className = "fb-side-bar";
    if (search) { search.parentNode.insertBefore(bar, search); bar.appendChild(search); }
    else side.insertBefore(bar, side.querySelector(".fb-side-group"));
    bar.appendChild(btn);
    var chips = document.createElement("div");
    chips.className = "fb-side-chips";
    chips.hidden = true;
    bar.parentNode.insertBefore(chips, bar.nextSibling);
    side.classList.add("is-foldable");
    side._fold = { btn: btn, n: btn.querySelector(".fb-side-fold-n"), chips: chips,
                   x: frag.querySelector(".fb-side-chip-x .icon") };
    btn.addEventListener("click", function () {
      var open = !side.classList.contains("is-open");
      side.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    refresh(side);
  }
  // Again after a live search, and on a list brought back in from a
  // file's own view (tspSwapPage).
  function setupAll() {
    document.querySelectorAll(".fb-side").forEach(function (side) { setup(side); refresh(side); });
  }
  window.tspOnEachPage(setupAll);
  document.addEventListener("live:updated", setupAll);
})();

(function initLiveSearch() {
  var DELAY = 200;
  function urlFor(form) {
    var url = new URL(form.getAttribute("action") || location.pathname, location.href);
    var params = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { if (v !== "") params.append(k, v); });
    url.search = params.toString();
    return url;
  }
  function run(form) {
    var url = urlFor(form);
    var seq = (form._liveSeq || 0) + 1;
    form._liveSeq = seq;
    if (form._liveCtl) form._liveCtl.abort();
    var ctl = window.AbortController ? new AbortController() : null;
    form._liveCtl = ctl;
    document.documentElement.classList.add("is-live-loading");
    fetch(url, { credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
      .then(function (html) {
        if (seq !== form._liveSeq) return;
        var doc = new DOMParser().parseFromString(html, "text/html");
        document.querySelectorAll("[data-live]").forEach(function (el) {
          var next = doc.querySelector('[data-live="' + el.getAttribute("data-live") + '"]');
          if (next) el.replaceWith(document.importNode(next, true));
        });
        if (history.replaceState) history.replaceState(history.state, "", url.pathname + url.search + location.hash);
        document.dispatchEvent(new CustomEvent("live:updated", { detail: { form: form } }));
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        location.assign(url.href);
      })
      .then(function () {
        if (seq === form._liveSeq) document.documentElement.classList.remove("is-live-loading");
      });
  }
  document.addEventListener("input", function (e) {
    var el = e.target, form = el && el.form;
    if (!form || el.type !== "search" || !form.hasAttribute("data-live-search")) return;
    clearTimeout(form._liveTimer);
    form._liveTimer = setTimeout(function () { run(form); }, DELAY);
  });
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-live-search")) return;
    e.preventDefault();
    clearTimeout(form._liveTimer);
    run(form);
  });
})();

// ── Ticking rows for a bulk action ──────────────────────────────────
// On a list page, [data-bulk-scope="<form id>"] holds the rows'
// checkboxes [data-bulk-check] (named ids, owned by that form through
// form="…"), a select-all [data-bulk-all] and the bar [data-bulk-bar],
// which shows while anything is ticked. A button [data-bulk="<action>"]
// in the bar posts the form with that action:
//   data-bulk-confirm   asks first, with this as the message; the title
//                       is data-bulk-title ("{n}" becomes "3 posts") or
//                       "<button text> 3 posts?"; data-bulk-noun /
//                       data-bulk-nouns name the rows.
//   data-bulk-needs=X   needs the menu [data-bulk-pick="X"] chosen; its
//                       value goes in the form's [data-bulk-value="X"].
// Delegated, so it survives a live search swapping the list.
(function initBulkSelect() {
  function scopeOf(el) { return el && el.closest && el.closest("[data-bulk-scope]"); }
  function checks(scope) { return Array.prototype.slice.call(scope.querySelectorAll("[data-bulk-check]")); }
  function refresh(scope) {
    var all = checks(scope), n = all.filter(function (c) { return c.checked; }).length;
    var bar = scope.querySelector("[data-bulk-bar]");
    var count = scope.querySelector("[data-bulk-count]");
    var sa = scope.querySelector("[data-bulk-all]");
    if (bar) bar.hidden = n === 0;
    if (count) count.textContent = n + " selected";
    if (sa) { sa.checked = n > 0 && n === all.length; sa.indeterminate = n > 0 && n < all.length; }
    all.forEach(function (c) {
      var host = c.closest("tr, .lst-card");
      if (host) host.classList.toggle("is-selected", c.checked);
    });
  }
  document.addEventListener("change", function (e) {
    var el = e.target, scope = scopeOf(el);
    if (!scope) return;
    if (el.hasAttribute("data-bulk-all")) {
      checks(scope).forEach(function (c) { c.checked = el.checked; });
      refresh(scope);
    } else if (el.hasAttribute("data-bulk-check")) {
      refresh(scope);
    }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-bulk], [data-bulk-clear]");
    var scope = scopeOf(t);
    if (!scope) return;
    if (t.hasAttribute("data-bulk-clear")) {
      checks(scope).forEach(function (c) { c.checked = false; });
      refresh(scope);
      return;
    }
    var form = document.getElementById(scope.getAttribute("data-bulk-scope"));
    var n = checks(scope).filter(function (c) { return c.checked; }).length;
    if (!form || !n) return;
    var needs = t.getAttribute("data-bulk-needs");
    if (needs) {
      var pick = scope.querySelector('[data-bulk-pick="' + needs + '"]');
      if (!pick || !pick.value) { if (pick) pick.focus(); return; }
      var field = form.querySelector('[data-bulk-value="' + needs + '"]');
      if (field) field.value = pick.value;
    }
    var noun = n === 1 ? (t.dataset.bulkNoun || "item")
      : (t.dataset.bulkNouns || (t.dataset.bulkNoun ? t.dataset.bulkNoun + "s" : "items"));
    var what = n + " " + noun;
    var go = function () {
      form.querySelector("[data-bulk-action-field]").value = t.getAttribute("data-bulk");
      form.submit();
    };
    if (!t.dataset.bulkConfirm) { go(); return; }
    var title = t.dataset.bulkTitle ? t.dataset.bulkTitle.replace("{n}", what)
      : t.textContent.trim() + " " + what + "?";
    var ask = window.tspConfirm
      ? window.tspConfirm({ title: title, message: t.dataset.bulkConfirm,
                            confirmLabel: t.dataset.bulkLabel || t.textContent.trim() })
      : Promise.resolve(window.confirm(title + " " + t.dataset.bulkConfirm));
    ask.then(function (yes) { if (yes) go(); });
  });
  // Going back to a list restores ticked boxes; show the bar for them.
  window.addEventListener("pageshow", function () {
    document.querySelectorAll("[data-bulk-scope]").forEach(refresh);
  });
})();

// A preview that follows a field as it is typed: [data-mirror="<name>"]
// shows the value of the same form's [data-mirror-source="<name>"], or its
// data-mirror-empty text while that is blank (the external-link dialog's
// sidebar row).
(function initMirrors() {
  function sync(src) {
    const form = src.form;
    if (!form) return;
    form.querySelectorAll('[data-mirror="' + src.dataset.mirrorSource + '"]').forEach(el => {
      const v = src.value.trim();
      el.textContent = v || el.dataset.mirrorEmpty || "";
      el.classList.toggle("is-empty", !v);
    });
  }
  document.addEventListener("input", e => {
    if (e.target.matches && e.target.matches("[data-mirror-source]")) sync(e.target);
  });
  // A form reset puts the values back after the event; follow them then.
  document.addEventListener("reset", e => {
    setTimeout(() => e.target.querySelectorAll("[data-mirror-source]").forEach(sync));
  }, true);
  document.querySelectorAll("[data-mirror-source]").forEach(sync);
})();

// Dialogs opened from Settings become pages, like a phone's settings app:
// the section and the page sit side by side on one strip that moves left
// to show the page and back again for Back, whose label names the page
// it returns to. In the Settings window a dialog qualifies while Settings
// is open; in a page shown in a section (html.in-settings) every dialog
// does. Each dialog keeps its own open and close code: this watches its
// .open class, adds .settings-sub, and Back presses the dialog's own
// close button. Confirmations and the pickers stay dialogs.
(function settingsSubpages() {
  const settings = document.getElementById("settings-modal");
  const tpl = document.getElementById("settings-sub-tpl");
  const inFrame = document.documentElement.classList.contains("in-settings");
  if (!tpl || (!inFrame && !settings)) return;
  const NOT_SUB = "#settings-modal, .confirm-modal, #search-modal, #media-picker-modal, "
                + "#dynbg-picker-modal, #icon-picker-modal";
  const SLIDE_MS = 380;  // --sub-ms in app.css
  // The strip: the surface that moves aside, and where the pages go
  // while open, beside it rather than inside it.
  const surface = inFrame ? document.documentElement : settings.querySelector(".settings-main");
  const pageHost = inFrame ? document.body : surface;
  const stack = [];

  const qualifies = () => inFrame || settings.classList.contains("open");
  const titleOf = m => {
    const h = m.querySelector(".modal-head h2");
    return h ? h.textContent.trim() : "";
  };
  // The page beneath the first dialog: the open section, or in a frame
  // the section or page the frame sits in.
  function baseLabel() {
    let host = settings;
    if (inFrame) {
      try { host = window.frameElement && window.frameElement.closest(".modal"); } catch (e) { host = null; }
    }
    if (host && host.id === "settings-modal") {
      const t = host.querySelector(".settings-pane-title");
      return (t && t.textContent.trim()) || "Settings";
    }
    return (host && titleOf(host)) || "Back";
  }

  function chrome(m) {
    if (m._subChrome) return m._subChrome;
    let head = m.querySelector(".modal-head");
    if (!head) {
      const panel = m.querySelector(".modal-panel") || m;
      head = document.createElement("div");
      head.className = "modal-head";
      const h = document.createElement("h2");
      h.textContent = panel.getAttribute("aria-label") || "";
      head.appendChild(h);
      panel.prepend(head);
    }
    const parts = tpl.content.cloneNode(true);
    const back = parts.querySelector(".settings-sub-back");
    head.prepend(back);
    back.addEventListener("click", () => dismiss(m));
    // On a phone the page covers the Settings head and its close button,
    // so it brings one (app.css shows it there only).
    if (!inFrame) {
      const close = parts.querySelector(".settings-sub-close");
      head.appendChild(close);
      close.addEventListener("click", () => {
        const x = settings.querySelector(".settings-main-head [data-close]");
        if (x) x.click();
      });
    }
    return (m._subChrome = { back, label: back.querySelector(".settings-sub-back-label") });
  }

  function dismiss(m) {
    const x = m.querySelector(".modal-head [data-close]") || m.querySelector("[data-close]");
    if (x) x.click();
    if (m.classList.contains("open")) {
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    }
  }

  // A dialog moves beside the surface while it is a page (a placeholder
  // keeps its place) and goes home once closed.
  function moveOut(m) {
    if (m.parentNode === pageHost) return;
    if (!m._subHome) {
      m._subHome = document.createComment("settings-sub");
      m.parentNode.insertBefore(m._subHome, m);
    }
    pageHost.appendChild(m);
  }
  function goHome(m) {
    if (m._subHome && m._subHome.parentNode) m._subHome.replaceWith(m);
    m._subHome = null;
  }
  function release(m) {
    m.classList.remove("settings-sub", "settings-sub-under");
    m.style.zIndex = "";
    goHome(m);
  }

  // Everything below the top page moves one width to the left.
  function shift(instant) {
    if (instant) {
      surface.classList.add("settings-sub-instant");
      stack.forEach(m => m.classList.add("settings-sub-instant"));
    }
    surface.classList.toggle("settings-pushed", stack.length > 0);
    stack.forEach((m, i) => m.classList.toggle("settings-sub-under", i < stack.length - 1));
    if (instant) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        surface.classList.remove("settings-sub-instant");
        document.querySelectorAll(".modal.settings-sub-instant")
          .forEach(m => m.classList.remove("settings-sub-instant"));
      }));
    }
    if (inFrame) {
      try { window.parent.postMessage({ type: "tsp-subpage" }, window.location.origin); } catch (e) {}
    }
  }

  function push(m) {
    const c = chrome(m);
    const under = stack[stack.length - 1];
    c.label.textContent = (under && titleOf(under)) || baseLabel();
    c.back.setAttribute("aria-label", "Back to " + c.label.textContent);
    clearTimeout(m._subT);
    m.classList.add("settings-sub");
    m.classList.remove("settings-sub-under");
    m.style.zIndex = String(101 + stack.length);
    moveOut(m);
    stack.push(m);
    shift();
    setTimeout(() => {
      if (m.classList.contains("open") && !m.contains(document.activeElement)) {
        c.back.focus({ preventScroll: true });
      }
    }, 80);
  }

  function drop(m, instant) {
    const i = stack.indexOf(m);
    if (i >= 0) stack.splice(i, 1);
    m.classList.remove("settings-sub-under");
    clearTimeout(m._subT);
    const settle = () => {
      if (m.classList.contains("open")) return;
      if (qualifies()) goHome(m); else release(m);
    };
    if (instant) settle(); else m._subT = setTimeout(settle, SLIDE_MS);
  }

  // Back to the section: every page closes, at once when Settings itself
  // is closing.
  function closeAll(instant) {
    stack.slice().reverse().forEach(m => {
      if (instant) m.classList.add("settings-sub-instant");
      if (m.classList.contains("open")) dismiss(m);
      drop(m, instant);
    });
    shift(instant);
  }
  window.tspCloseSubpages = closeAll;
  window.tspSubDepth = () => stack.length;

  function frames() {
    return settings ? Array.from(settings.querySelectorAll("iframe")) : [];
  }
  function closeFrames() {
    frames().forEach(f => {
      try { if (f.contentWindow.tspCloseSubpages) f.contentWindow.tspCloseSubpages(true); } catch (e) {}
    });
  }
  // On a phone the section's head (Back to the list) gives way while the
  // section's frame shows a page; that page has its own.
  function syncFrameSub() {
    const pane = settings.querySelector(".settings-pane.active");
    const f = pane && pane.querySelector("iframe");
    let depth = 0;
    try { depth = f && f.contentWindow.tspSubDepth ? f.contentWindow.tspSubDepth() : 0; } catch (e) {}
    const on = depth > 0 && settings.classList.contains("open");
    if (settings.classList.contains("settings-frame-sub") !== on) settings.classList.toggle("settings-frame-sub", on);
  }

  function settingsChanged() {
    if (settings.classList.contains("open")) return;
    closeAll(true);
    closeFrames();
    document.querySelectorAll(".modal.settings-sub:not(.open)").forEach(release);
    if (settings.classList.contains("settings-frame-sub")) settings.classList.remove("settings-frame-sub");
  }

  function sync(m) {
    if (m === settings) { settingsChanged(); return; }
    const open = m.classList.contains("open");
    const i = stack.indexOf(m);
    if (open && i < 0) {
      if (qualifies()) push(m);
      else if (m.classList.contains("settings-sub")) release(m);
    } else if (!open && i >= 0) {
      drop(m);
      shift();
    }
  }

  const watched = new WeakSet();
  const mo = new MutationObserver(recs => recs.forEach(r => sync(r.target)));
  function scan() {
    if (settings && !watched.has(settings)) {
      watched.add(settings);
      mo.observe(settings, { attributes: true, attributeFilter: ["class"] });
    }
    document.querySelectorAll(".modal").forEach(m => {
      if (watched.has(m) || m.matches(NOT_SUB)) return;
      watched.add(m);
      mo.observe(m, { attributes: true, attributeFilter: ["class"] });
      if (m.classList.contains("open")) sync(m);
    });
  }
  if (window.tspOnEachPage) window.tspOnEachPage(scan); else scan();
  shift(true);

  if (inFrame) return;
  // Picking another section leaves any page that was open.
  settings.querySelectorAll(".settings-tab").forEach(t => t.addEventListener("click", () => {
    closeAll(false);
    closeFrames();
    syncFrameSub();
  }));
  window.addEventListener("message", e => {
    if (e.origin === window.location.origin && e.data && e.data.type === "tsp-subpage") syncFrameSub();
  });
})();
