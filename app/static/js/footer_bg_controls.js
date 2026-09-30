// Footer background controls on Design → Footer (_footer_bg_controls.html).
// The live preview beside them shows the real footer, so this only keeps
// the controls themselves in step: the style tabs, the particle fields,
// slider readouts, the Solid color's "picked" flag and the sinewave's
// Random and Reset buttons. Programmatic changes dispatch `input` so the
// save bar and the preview notice them.
(function () {
  'use strict';
  var editor = document.querySelector('[data-footer-bg-editor]');
  if (!editor) return;

  function dirty(el) { (el || editor).dispatchEvent(new Event('input', { bubbles: true })); }
  function style() {
    var r = editor.querySelector('[name="footer_bg_style"]:checked');
    return r ? r.value : 'frosty';
  }
  function showPanels() {
    var v = style();
    editor.querySelectorAll('[data-bg-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-bg-panel') !== v;
    });
  }
  editor.querySelectorAll('[data-bg-style-radio]').forEach(function (r) {
    r.addEventListener('change', showPanels);
  });
  showPanels();

  var partToggle = editor.querySelector('[data-bg-particle-toggle]');
  var partFields = editor.querySelector('[data-bg-particle-fields]');
  if (partToggle && partFields) {
    var syncPart = function () { partFields.hidden = !partToggle.checked; };
    partToggle.addEventListener('change', syncPart);
    syncPart();
  }

  editor.querySelectorAll('[data-slider-input]').forEach(function (inp) {
    var lbl = inp.closest('label, .nav-megalink-field');
    var out = lbl && lbl.querySelector('[data-slider-out]');
    if (!out) return;
    var show = function () { out.textContent = inp.value; };
    inp.addEventListener('input', show);
    show();
  });

  // An empty Solid color means the theme's footer color; the flag says
  // the admin really picked one (see blocks.parse_footer_bg).
  editor.addEventListener('input', function (e) {
    if (e.target && e.target.name === 'footer_bg_color') {
      var flag = editor.querySelector('[data-bg-color-custom]');
      if (flag) flag.value = '1';
    }
  });

  function ensureSinewave() {
    var r = editor.querySelector('[name="footer_bg_style"][value="sinewave"]');
    if (r && !r.checked) { r.checked = true; showPanels(); }
  }
  var waveInp = editor.querySelector('[data-sinewave-wave-input]');
  var colorInputs = function () { return editor.querySelectorAll('input[data-sinewave-input]'); };
  var btn = function (sel, fn) {
    var b = editor.querySelector(sel);
    if (b) b.addEventListener('click', function (e) { e.preventDefault(); fn(); ensureSinewave(); dirty(); });
  };
  btn('[data-sinewave-randomize]', function () {
    if (!window.loginFxUtils) return;
    var palette = window.loginFxUtils.randomPalette(4);
    colorInputs().forEach(function (inp, i) { if (palette[i]) inp.value = palette[i]; });
  });
  btn('[data-sinewave-randomize-wave]', function () {
    if (!window.loginFxUtils || !waveInp) return;
    waveInp.value = JSON.stringify(window.loginFxUtils.randomWaveParams());
  });
  btn('[data-sinewave-reset]', function () {
    var defaults = ['#16c2ba', '#1883d5', '#5a1ce5', '#0a3eb5'];
    colorInputs().forEach(function (inp, i) { inp.value = defaults[i] || '#000000'; });
    if (waveInp) waveInp.value = '';
    ['[data-sinewave-randomize-colors-toggle]', '[data-sinewave-randomize-wave-toggle]'].forEach(function (s) {
      var t = editor.querySelector(s);
      if (t) t.checked = false;
    });
  });
})();
