/* page-media.js — Media page event binding for Raiko. */
(function () {
  const MEDIA_KEY = 'raiko_media';

  function loadMedia() {
    try { return JSON.parse(localStorage.getItem(MEDIA_KEY) || '[]'); }
    catch { return []; }
  }

  function saveMedia(items) {
    localStorage.setItem(MEDIA_KEY, JSON.stringify(items));
  }

  function renderMediaDrawer(activePlaceholder = false, forceOpen = false) {
    const drawer = document.getElementById('media-drawer');
    const grid = document.getElementById('media-drawer-grid');
    const filter = State.mediaFilter || 'all';
    if (!grid || !drawer) return;
    const shouldOpen = !!activePlaceholder || !!forceOpen || drawer.classList.contains('open');
    drawer.classList.toggle('open', shouldOpen);
    drawer.setAttribute('aria-hidden', String(!shouldOpen));
    const all = loadMedia();
    const filtered = filter === 'all' ? all : all.filter(m => m.type === filter);
    const cards = [];
    if (activePlaceholder) {
      cards.push(`
        <div class="media-drawer-card media-drawer-card--placeholder">
          <div class="media-drawer-thumb media-drawer-thumb--placeholder">
            <div class="media-drawer-glow"></div>
            <div class="media-drawer-shine"></div>
            <span>Generating</span>
          </div>
        </div>
      `);
    }
    filtered.forEach(item => {
      const thumb = item.type === 'video'
        ? `<video src="${escapeHtml(item.url)}" muted preload="metadata"></video>`
        : `<img src="${escapeHtml(item.url)}" alt="Media" loading="lazy" />`;
      cards.push(`
        <div class="media-drawer-card" data-id="${escapeHtml(item.id)}">
          <div class="media-drawer-thumb">${thumb}</div>
        </div>
      `);
    });
    grid.innerHTML = cards.length ? cards.join('') : '<div class="media-drawer-empty">No media yet</div>';
  }

  function closeMediaDrawer() {
    const drawer = document.getElementById('media-drawer');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  function openMediaDrawer(activePlaceholder = false) {
    renderMediaDrawer(activePlaceholder, true);
  }

  function saveMediaItem(type, url, prompt, model) {
    const items = loadMedia();
    items.unshift({
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      url,
      prompt: prompt || '',
      model: model || '',
      created_at: new Date().toISOString(),
    });
    saveMedia(items.slice(0, 200));
    if (type === 'image') openMediaDrawer(false);
    if (document.getElementById('media-grid')) loadMediaPanel();
  }

  function loadMediaPanel() {
    const filter = State.mediaFilter || 'all';
    const items = loadMedia();
    const filtered = filter === 'all' ? items : items.filter(item => item.type === filter);
    const grid = document.getElementById('media-grid');
    const empty = document.getElementById('media-empty-state');
    const count = document.getElementById('media-count-badge');
    if (count) count.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
    if (!grid) return;
    if (!filtered.length) {
      grid.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    grid.innerHTML = filtered.map(item => {
      const thumb = item.type === 'video'
        ? `<video src="${escapeHtml(item.url)}" controls preload="metadata"></video>`
        : `<img src="${escapeHtml(item.url)}" alt="Saved media" loading="lazy" />`;
      return `
        <article class="media-card" data-media-id="${escapeHtml(item.id)}">
          <div class="media-card-thumb">${thumb}</div>
          <div class="media-card-body">
            <span class="media-type-badge">${item.type}</span>
            <p class="media-prompt">${escapeHtml(item.prompt || 'Untitled')}</p>
            <div class="media-meta">${escapeHtml(item.model || '')}</div>
            <div class="media-actions">
              <a class="result-action-btn" href="${item.url}" target="_blank">Open</a>
              <a class="result-action-btn" href="${item.url}" download>Save</a>
              <button class="result-action-btn" type="button" data-delete-media="${escapeHtml(item.id)}">Delete</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
    grid.querySelectorAll('[data-delete-media]').forEach(btn => {
      btn.addEventListener('click', () => {
        saveMedia(loadMedia().filter(item => item.id !== btn.dataset.deleteMedia));
        loadMediaPanel();
        renderMediaDrawer(document.getElementById('media-drawer')?.classList.contains('open'));
      });
    });
  }

  function bindMediaPageEvents() {
    document.getElementById('media-drawer-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      document.querySelectorAll('#media-drawer-filters button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.mediaFilter = btn.dataset.filter;
      renderMediaDrawer(document.getElementById('media-drawer')?.classList.contains('open'));
    });
    document.getElementById('media-drawer-close')?.addEventListener('click', closeMediaDrawer);
    document.getElementById('media-drawer-fullview')?.addEventListener('click', () => {
      closeMediaDrawer();
      switchPanel('media');
    });
    document.getElementById('media-filter-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.media-filter-btn');
      if (!btn) return;
      document.querySelectorAll('.media-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.mediaFilter = btn.dataset.filter;
      loadMediaPanel();
    });
  }

  function bindGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        switchPanel('chat');
        startNewChat();
      }
    });
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.media = bindMediaPageEvents;
  window.RAIKO_PAGE_BINDERS.media.refresh = loadMediaPanel;
})();
