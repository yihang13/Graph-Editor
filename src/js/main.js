/* Graph Editor - boot */
(function (GE) {
  'use strict';

  function boot() {
    try {
      GE.App.init();
      GE.Interaction.attach(GE.App);
    } catch (err) {
      console.error(err);
      const box = document.createElement('pre');
      box.className = 'boot-error';
      box.textContent = '启动失败：' + (err && err.stack ? err.stack : err);
      document.body.appendChild(box);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(globalThis.GE = globalThis.GE || {});
