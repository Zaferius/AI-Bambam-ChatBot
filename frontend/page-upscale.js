/* page-upscale.js — Upscale page event binding for Raiko. */
(function () {
  function bindUpscalePageEvents() {
    const sharedUpscaleInput = document.getElementById('upscale-source-input');
    sharedUpscaleInput?.addEventListener('change', async (e) => {
      await handleUpscalerFile(e.target.files?.[0]);
    });
    document.getElementById('upscale-reset-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetUpscaler(true);
    });
    document.getElementById('btn-run-upscale')?.addEventListener('click', runSharedUpscaler);
    initUpscaleFactorButtons();
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.upscale = bindUpscalePageEvents;
})();
