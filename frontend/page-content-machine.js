/* page-content-machine.js — Content Machine page event binding for Raiko. */
(function () {
  const CONTENT_PREF_KEY = 'raiko_content_machine_prefs';

  function loadContentMachinePrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem(CONTENT_PREF_KEY) || '{}');
      const map = { style: 'ocm-style', tone: 'ocm-tone', variations: 'ocm-variations' };
      Object.entries(map).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el && prefs[key]) el.value = prefs[key];
      });
      const savedPlatforms = prefs.platforms || (prefs.platform ? [prefs.platform] : null);
      if (savedPlatforms?.length) {
        document.querySelectorAll('input[name="ocm-platform"]').forEach(input => {
          input.checked = savedPlatforms.includes(input.value);
        });
      }
      if (prefs.output_types) {
        document.getElementById('ocm-output-image').checked = !!prefs.output_types.image;
        document.getElementById('ocm-output-video').checked = !!prefs.output_types.video;
        document.getElementById('ocm-output-caption').checked = !!prefs.output_types.caption;
        document.getElementById('ocm-output-hashtags').checked = !!prefs.output_types.hashtags;
      }
    } catch {}
    updateContentCostEstimate();
  }

  function getSelectedContentPlatforms() {
    const platforms = Array.from(document.querySelectorAll('input[name="ocm-platform"]:checked')).map(input => input.value);
    return platforms.length ? platforms : ['Instagram'];
  }

  function switchContentMachineTab(tabId) {
    const next = tabId || 'compose';
    document.querySelectorAll('[data-ocm-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ocmTab === next);
    });
    document.querySelectorAll('[data-ocm-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.ocmPanel === next);
    });
  }

  function initContentMachineUI() {
    document.getElementById('ocm-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ocm-tab]');
      if (!btn) return;
      switchContentMachineTab(btn.dataset.ocmTab);
    });
    document.querySelectorAll('[data-ocm-accordion] .ocm-accordion-head').forEach(head => {
      head.addEventListener('click', () => {
        const card = head.closest('[data-ocm-accordion]');
        card?.classList.toggle('open');
      });
    });
    document.querySelectorAll('input[name="ocm-platform"], #ocm-output-image, #ocm-output-video, #ocm-output-caption, #ocm-output-hashtags, #ocm-variations')
      .forEach(el => el.addEventListener('change', updateContentCostEstimate));
  }

  function buildContentMachinePayload(remixPack = null) {
    const topic = document.getElementById('ocm-topic')?.value.trim() || '';
    return {
      platform: getSelectedContentPlatforms()[0] || 'Instagram',
      platforms: getSelectedContentPlatforms(),
      style: document.getElementById('ocm-style')?.value || 'Cinematic',
      tone: document.getElementById('ocm-tone')?.value || 'Viral',
      topic,
      output_types: {
        image: !!document.getElementById('ocm-output-image')?.checked,
        video: !!document.getElementById('ocm-output-video')?.checked,
        caption: !!document.getElementById('ocm-output-caption')?.checked,
        hashtags: !!document.getElementById('ocm-output-hashtags')?.checked,
      },
      variations: parseInt(document.getElementById('ocm-variations')?.value || '3', 10),
      remix_of: remixPack?.id || null,
      remix_instruction: remixPack ? `Create a slight variation of pack ${remixPack.id} with a fresh hook, composition, and CTA while keeping the same brand style.` : null,
      use_memory: true,
      save_preferences: true,
    };
  }

  function persistContentMachinePrefs(payload) {
    localStorage.setItem(CONTENT_PREF_KEY, JSON.stringify({
      platform: payload.platform,
      platforms: payload.platforms,
      style: payload.style,
      tone: payload.tone,
      variations: payload.variations,
      output_types: payload.output_types,
    }));
  }

  function estimateContentPackCredits(payload = buildContentMachinePayload()) {
    const perPack =
      (payload.output_types.image ? 6 : 0) +
      (payload.output_types.video ? 12 : 0) +
      ((payload.output_types.caption || payload.output_types.hashtags) ? 0.01 : 0);
    return Math.round(perPack * payload.variations * Math.max(payload.platforms.length, 1) * 100) / 100;
  }

  function updateContentCostEstimate() {
    const el = document.getElementById('ocm-cost-estimate');
    if (!el) return;
    const payload = buildContentMachinePayload();
    setAnimatedCostLabel(el, estimateContentPackCredits(payload), 2);
  }

  async function generateContentPack(remixPack = null) {
    if (!requireAuth()) return;
    switchContentMachineTab('compose');
    const payload = buildContentMachinePayload(remixPack);
    if (!payload.topic) { toast('Please enter a topic', 'error'); return; }
    if (!payload.platforms.length) { toast('Select at least one platform', 'error'); return; }
    if (!Object.values(payload.output_types).some(Boolean)) { toast('Select at least one output type', 'error'); return; }
    const btn = document.getElementById('btn-generate-content-pack');
    const status = document.getElementById('ocm-status');
    if (btn) btn.disabled = true;
    status?.classList.remove('hidden');
    persistContentMachinePrefs(payload);
    State.lastContentPayload = payload;
    try {
      const res = await generateContentPackRequest(payload);
      State.contentPacks = res.packs || [];
      renderContentPacks(State.contentPacks);
      updateCreditsUI(res.credits_remaining);
      toast(`Content packs ready! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      toast(err.message || 'Content pack generation failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
      status?.classList.add('hidden');
    }
  }

  async function generateContentPackRequest(payload) {
    if (API.contentPacks?.generate) return API.contentPacks.generate(payload);
    return apiFetch('/content-packs/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  function renderContentPacks(packs) {
    const empty = document.getElementById('ocm-empty');
    const grid = document.getElementById('ocm-pack-grid');
    const explainer = document.getElementById('ocm-video-explainer');
    if (!grid) return;
    grid.innerHTML = '';
    if (empty) empty.classList.toggle('hidden', packs.length > 0);
    if (explainer) explainer.classList.toggle('hidden', packs.length > 0);
    packs.forEach(pack => {
      const card = document.createElement('article');
      card.className = 'ocm-pack-card';
      const hashtags = Array.isArray(pack.hashtags) ? pack.hashtags : [];
      card.innerHTML = `
        <div class="ocm-pack-top"><span>Pack ${escapeHtml(pack.id)}</span><button type="button" data-remix="${escapeHtml(pack.id)}">Remix</button></div>
        ${pack.platform ? `<div class="ocm-platform-badge">${escapeHtml(pack.platform)}</div>` : ''}
        ${pack.image_url ? `<img class="ocm-pack-media" src="${pack.image_url}" alt="Generated image for pack ${escapeHtml(pack.id)}" />` : ''}
        ${pack.video_url ? `<video class="ocm-pack-media" src="${pack.video_url}" controls loop></video>` : ''}
        <div class="ocm-pack-tabs" role="tablist">
          <button class="active" type="button" data-pack-tab="caption">Caption</button>
          <button type="button" data-pack-tab="prompts">Prompts</button>
          <button type="button" data-pack-tab="json">JSON</button>
        </div>
        <div class="ocm-pack-panel active" data-pack-panel="caption">
          <div class="ocm-pack-block"><strong>Caption</strong><p>${escapeHtml(pack.caption || '')}</p><button type="button" data-copy="caption">Copy caption</button></div>
          <div class="ocm-pack-block"><strong>Hashtags</strong><p>${escapeHtml(hashtags.join(' '))}</p><button type="button" data-copy="hashtags">Copy hashtags</button></div>
        </div>
        <div class="ocm-pack-panel" data-pack-panel="prompts">
          <div class="ocm-pack-block"><strong>Image Prompt</strong><p>${escapeHtml(pack.image_prompt || '')}</p></div>
          <div class="ocm-pack-block"><strong>Video Prompt</strong><p>${escapeHtml(pack.video_prompt || '')}</p></div>
        </div>
        <div class="ocm-pack-panel" data-pack-panel="json">
          <pre class="ocm-json">${escapeHtml(JSON.stringify({ id: pack.id, image_prompt: pack.image_prompt, video_prompt: pack.video_prompt, caption: pack.caption, hashtags }, null, 2))}</pre>
        </div>
      `;
      card.querySelector('[data-copy="caption"]')?.addEventListener('click', () => copyText(pack.caption || '', 'Caption copied'));
      card.querySelector('[data-copy="hashtags"]')?.addEventListener('click', () => copyText(hashtags.join(' '), 'Hashtags copied'));
      card.querySelector('[data-remix]')?.addEventListener('click', () => generateContentPack(pack));
      card.querySelector('.ocm-pack-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pack-tab]');
        if (!btn) return;
        card.querySelectorAll('[data-pack-tab]').forEach(tab => tab.classList.toggle('active', tab === btn));
        card.querySelectorAll('[data-pack-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.packPanel === btn.dataset.packTab));
      });
      grid.appendChild(card);
    });
  }

  async function copyText(text, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast(message, 'success', 1800);
    } catch {
      toast('Copy failed', 'error');
    }
  }

  function copyContentPacksJson() {
    const strict = { packs: State.contentPacks.map(pack => ({
      id: pack.id,
      image_prompt: pack.image_prompt || '',
      video_prompt: pack.video_prompt || '',
      caption: pack.caption || '',
      hashtags: Array.isArray(pack.hashtags) ? pack.hashtags : [],
    })) };
    copyText(JSON.stringify(strict, null, 2), 'Content pack JSON copied');
  }

  function bindContentMachinePageEvents() {
    document.getElementById('btn-generate-content-pack')?.addEventListener('click', () => generateContentPack());
    document.getElementById('btn-copy-content-json')?.addEventListener('click', copyContentPacksJson);
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.content = bindContentMachinePageEvents;
})();
