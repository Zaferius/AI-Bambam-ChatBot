/*
 * routes.js — shared multi-page route configuration for Raiko.
 * Keep route constants here so navbar, page bootstrap, and backend aliases stay aligned.
 */
(function () {
  const PAGE_PANEL_ROUTES = {
    dashboard: '/index.html',
    image: '/image.html',
    video: '/video.html',
    audio: '/audio.html',
    edit: '/edit.html',
    restyler: '/restyler.html',
    upscale: '/upscale.html',
    expand: '/expand.html',
    angles: '/angles.html',
    shots: '/shots.html',
    media: '/media.html',
    'explore-gallery': '/explore-gallery.html',
  };

  const PANEL_CLEAN_ROUTES = {
    dashboard: '/',
    image: '/image',
    video: '/video',
    audio: '/audio',
    edit: '/edit',
    restyler: '/restyler',
    upscale: '/upscale',
    expand: '/expand',
    angles: '/angles',
    shots: '/shots',
    media: '/media',
    'explore-gallery': '/explore-gallery',
  };

  const PANEL_ALIASES = {
    dashboard: 'dashboard',
  };

  const NAV_ACTIVE_PANELS = {
    dashboard: 'dashboard',
    'explore-gallery': 'dashboard',
    image: 'image',
    expand: 'image',
    angles: 'image',
    shots: 'image',
    restyler: 'restyler',
    video: 'video',
    audio: 'audio',
    edit: 'edit',
    upscale: 'edit',
    media: '',
  };

  const PAGE_PATH_PANELS = Object.fromEntries(
    [
      ...Object.entries(PAGE_PANEL_ROUTES),
      ...Object.entries(PANEL_CLEAN_ROUTES),
    ].map(([panel, route]) => [route, panel])
  );

  function normalizePanel(panelId) {
    return PANEL_ALIASES[panelId] || panelId;
  }

  function getPagePanel(pathname = window.location.pathname) {
    if (pathname === '/' || pathname.endsWith('/')) return 'dashboard';
    return PAGE_PATH_PANELS[pathname] || window.RAIKO_INITIAL_PANEL || 'dashboard';
  }

  function makePanelHref(panelId, params = {}) {
    const normalizedPanel = normalizePanel(panelId);
    const route = PANEL_CLEAN_ROUTES[normalizedPanel] || PAGE_PANEL_ROUTES[normalizedPanel] || PANEL_CLEAN_ROUTES.dashboard;
    const url = new URL(route, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    return url.pathname + url.search;
  }

  function navigateToPanelPage(panelId, params = {}) {
    window.location.href = makePanelHref(panelId, params);
  }

  function samePanelPage(panelId) {
    return getPagePanel() === normalizePanel(panelId);
  }

  function getActiveNavPanel(panelId) {
    const normalizedPanel = normalizePanel(panelId);
    return NAV_ACTIVE_PANELS[normalizedPanel] ?? normalizedPanel;
  }

  window.RAIKO_ROUTES = Object.freeze({
    PAGE_PANEL_ROUTES: Object.freeze(PAGE_PANEL_ROUTES),
    PANEL_CLEAN_ROUTES: Object.freeze(PANEL_CLEAN_ROUTES),
    PANEL_ALIASES: Object.freeze(PANEL_ALIASES),
    NAV_ACTIVE_PANELS: Object.freeze(NAV_ACTIVE_PANELS),
  });

  window.RAIKO_NAV = Object.freeze({
    getPagePanel,
    makePanelHref,
    navigateToPanelPage,
    samePanelPage,
    getActiveNavPanel,
    normalizePanel,
  });
})();
