/* page-restyler.js — Restyler page event binding for Raiko. */
(function () {
  const RESTYLER_STYLE_SLUGS = [
    'anime', 'barbie', 'business_ceo', 'bw_profile_studio_portrait', 'bw_studio_portrait',
    'cartoon_style', 'chibi', 'cinematic_portrait', 'creative_gel_light_headshot', 'cyberpunk',
    'dark_angel', 'digital_camera_flash_portrait', 'executive_studio_headshot', 'ghostface_mirror',
    'golden_hour_coffee_portrait', 'gothic_style', 'hollywood_star', 'lego', 'line_to_image',
    'magazine_wall_flash_portrait', 'medieval_knight', 'minecraft', 'monochrome_drama_headshot',
    'moody_studio_portrait', 'muscler_body', 'natural_light_headshot', 'olympus_god',
    'personal_brand_headshot', 'photo_grid_pose', 'pixar', 'pokemon_trainer', 'royal_fantasy',
    'royal_fashion', 'sailor_moon', 'samurai_legends', 'simpsons_style', 'sixteen_bit_character',
    'snow_magic', 'snowy_times', 'south_park_style', 'spec_ops', 'studio_clean_headshot',
    'ufc', 'underwater_half_face_portrait', 'viking_berserker', 'winter_flake', 'winter_time',
  ];

  async function initRestylerPanel() {
    const grid = document.getElementById('restyler-style-grid');
    if (!grid || State.restylerStyles.length) return;
    const styles = [];
    for (const slug of RESTYLER_STYLE_SLUGS) {
      const base = `image-restyler/${slug}`;
      const before = `${base}/${slug}_before.jpg`;
      const after = `${base}/${slug}_after.jpg`;
      let prompt = `Preserve identity, face structure, expression, and framing while applying the ${slug.replace(/_/g, ' ')} style in a polished, professional way.`;
      let modelId = 'fal-ai/nano-banana-2/edit';
      try {
        const res = await fetch(`${base}/prompt.txt`);
        if (res.ok) {
          const txt = (await res.text()).trim();
          const lines = txt.split(/\r?\n/);
          if (/^ai_model:/i.test(lines[0] || '')) {
            const alias = lines.shift().split(':')[1]?.trim();
            if (alias === 'nano_banana_edit') modelId = 'fal-ai/nano-banana-2/edit';
            if (alias === 'seedream_4') modelId = 'fal-ai/bytedance/seedream/v4/edit';
          }
          if (lines.join('\n').trim()) prompt = lines.join('\n').trim();
        }
      } catch {}
      styles.push({ slug, name: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), before, after, prompt, modelId });
    }
    State.restylerStyles = styles;
    grid.innerHTML = styles.map(style => `
      <button type="button" class="restyler-style-card" data-style="${style.slug}">
        <span class="restyler-selected-badge">Selected</span>
        <div class="restyler-style-preview">
          <img src="${style.after}" alt="${style.name} styled preview" loading="lazy" />
        </div>
        <div class="restyler-style-overlay">
          <span>${style.name}</span>
          <em>Use style</em>
        </div>
      </button>
    `).join('');
    if (styles[0]) selectRestylerStyle(styles[0].slug);
  }

  function selectRestylerStyle(slug) {
    const style = State.restylerStyles.find(item => item.slug === slug) || State.restylerStyles[0];
    if (!style) return;
    State.currentRestylerStyle = style;
    document.querySelectorAll('.restyler-style-card').forEach(card => {
      const active = card.dataset.style === style.slug;
      card.classList.toggle('active', active);
    });
    const activeName = document.getElementById('restyler-active-name');
    const activeModel = document.getElementById('restyler-active-model');
    const costBadge = document.getElementById('restyler-cost-badge');
    if (activeName) activeName.textContent = style.name;
    if (activeModel) activeModel.textContent = style.modelId.includes('seedream') ? 'Seedream 4 Edit · 7⚡' : 'NB 2 Edit · 5⚡';
    if (costBadge) costBadge.textContent = style.modelId.includes('seedream') ? '7⚡' : '5⚡';
  }

  async function handleRestylerUpload(file) {
    if (!file || !file.type.startsWith('image/')) return;
    showUploadProgress('Uploading portrait');
    try {
      State.restylerSourceUrl = await fileToDataURL(file);
      const emptyState = document.getElementById('restyler-upload-empty');
      const sidebarPreview = document.getElementById('restyler-sidebar-preview');
      const replaceBtn = document.getElementById('btn-restyler-replace');
      const selectedCard = document.getElementById('restyler-selected-card');
      const sideGenerate = document.getElementById('restyler-side-generate');
      const selectedLabel = document.getElementById('restyler-selected-label');
      if (sidebarPreview) { sidebarPreview.src = State.restylerSourceUrl; sidebarPreview.classList.remove('hidden'); }
      if (emptyState) emptyState.classList.add('hidden');
      if (replaceBtn) replaceBtn.classList.remove('hidden');
      if (selectedCard) selectedCard.classList.remove('hidden');
      if (sideGenerate) sideGenerate.classList.remove('hidden');
      if (selectedLabel) selectedLabel.textContent = file.name || 'Portrait selected';
    } finally {
      hideUploadProgress();
    }
  }

  function resetRestylerWorkspace() {
    State.restylerSourceUrl = null;
    const input = document.getElementById('restyler-source-input');
    const emptyState = document.getElementById('restyler-upload-empty');
    const sidebarPreview = document.getElementById('restyler-sidebar-preview');
    const replaceBtn = document.getElementById('btn-restyler-replace');
    const selectedCard = document.getElementById('restyler-selected-card');
    const sideGenerate = document.getElementById('restyler-side-generate');
    const selectedLabel = document.getElementById('restyler-selected-label');
    const resultZone = document.getElementById('restyler-result-zone');
    const resultArea = document.getElementById('restyler-result-area');
    if (input) input.value = '';
    if (sidebarPreview) { sidebarPreview.src = ''; sidebarPreview.classList.add('hidden'); }
    if (emptyState) emptyState.classList.remove('hidden');
    if (replaceBtn) replaceBtn.classList.add('hidden');
    if (selectedCard) selectedCard.classList.add('hidden');
    if (sideGenerate) sideGenerate.classList.add('hidden');
    if (selectedLabel) selectedLabel.textContent = 'No portrait selected';
    if (resultZone) resultZone.classList.add('hidden');
    if (resultArea) resultArea.innerHTML = '';
  }

  async function runImageRestyler() {
    if (!requireAuth()) return;
    const style = State.currentRestylerStyle;
    if (!style) { toast('Select a style', 'error'); return; }
    if (!State.restylerSourceUrl) { toast('Upload a portrait first', 'error'); return; }
    const btn = document.getElementById('btn-run-restyler');
    const status = document.getElementById('restyler-status');
    const zone = document.getElementById('restyler-result-zone');
    const area = document.getElementById('restyler-result-area');
    if (btn) btn.disabled = true;
    status?.classList.remove('hidden');
    zone?.classList.remove('hidden');
    if (area) area.innerHTML = '<div class="upscale-result-placeholder"><div class="upscale-result-placeholder-frame"></div><div class="upscale-result-placeholder-text">Restyling…</div></div>';
    try {
      const res = await API.ai.editImage(style.modelId, style.prompt, State.restylerSourceUrl, 0.75);
      const urls = Array.isArray(res.output) ? res.output : [res.output];
      renderRestylerResults(urls);
      updateCreditsUI(res.credits_remaining);
      urls.forEach(url => saveMediaItem('image', url, `${style.name}: ${style.prompt}`, style.modelId));
      toast(`Portrait restyled! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      toast(err.message || 'Restyle failed', 'error');
      if (area) area.innerHTML = '';
    } finally {
      if (btn) btn.disabled = false;
      status?.classList.add('hidden');
    }
  }

  function renderRestylerResults(urls) {
    const area = document.getElementById('restyler-result-area');
    if (!area) return;
    area.innerHTML = '';
    urls.forEach(url => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;';
      wrap.innerHTML = `
        <img src="${url}" alt="Restyled portrait" style="max-width:100%;max-height:100%;object-fit:contain;border:2px solid var(--black);" loading="lazy" />
        <div style="display:flex;gap:6px;">
          <button class="result-action-btn" onclick="window.open('${url}', '_blank')">Open</button>
          <a class="result-action-btn" href="${url}" download="raiko_restyle.png">Download</a>
        </div>
      `;
      area.appendChild(wrap);
    });
  }

  function bindRestylerPageEvents() {
    document.getElementById('btn-restyler-upload')?.addEventListener('click', () => document.getElementById('restyler-source-input')?.click());
    document.getElementById('btn-restyler-replace')?.addEventListener('click', () => document.getElementById('restyler-source-input')?.click());
    document.getElementById('restyler-source-input')?.addEventListener('change', async (e) => handleRestylerUpload(e.target.files?.[0]));
    document.getElementById('restyler-style-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.restyler-style-card');
      if (card) selectRestylerStyle(card.dataset.style);
    });
    document.getElementById('btn-run-restyler')?.addEventListener('click', runImageRestyler);
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.restyler = bindRestylerPageEvents;
  window.RAIKO_PAGE_BINDERS.restyler.init = initRestylerPanel;
})();
