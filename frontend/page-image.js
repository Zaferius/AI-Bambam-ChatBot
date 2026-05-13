/* page-image.js — Image page event binding for Raiko. */
(function () {
  const IMAGE_COSTS = {
    'fal-ai/flux/schnell':                                  2,
    'fal-ai/flux/dev':                                      5,
    'fal-ai/flux-pro':                                      8,
    'fal-ai/flux-2-pro':                                   10,
    'fal-ai/nano-banana':                                   3,
    'fal-ai/nano-banana-2':                                 4,
    'fal-ai/nano-banana-pro':                               6,
    'fal-ai/bytedance/seedream/v4/text-to-image':           5,
    'fal-ai/bytedance/seedream/v4.5/text-to-image':         6,
    'fal-ai/bytedance/seedream/v5/lite/text-to-image':      5,
    'openai/gpt-image-2':                                  10,
    'fal-ai/seedvr/upscale/image':                          8,
  };

  const IMAGE_SIZE_PRESETS = {
    '1k': {
      '1:1': [1024, 1024], '4:5': [896, 1120], '3:4': [896, 1195], '2:3': [832, 1248], '9:16': [768, 1344],
      '5:4': [1120, 896], '4:3': [1195, 896], '3:2': [1248, 832], '16:9': [1344, 768], '21:9': [1344, 576],
    },
    '2k': {
      '1:1': [2048, 2048], '4:5': [1638, 2048], '3:4': [1536, 2048], '2:3': [1365, 2048], '9:16': [1152, 2048],
      '5:4': [2048, 1638], '4:3': [2048, 1536], '3:2': [2048, 1365], '16:9': [2048, 1152], '21:9': [2048, 878],
    },
  };

  const IMAGE_SETTING_LABELS = {
    quality: { standard: 'Standard', high: 'High', ultra: 'Ultra' },
    resolution: { '1k': '1K', '2k': '2K' },
    batch: { '1': '1', '2': '2', '3': '3', '4': '4' },
  };

  let uploadProgressTimer = null;

  function updateImageCostLabel() {
    const model = document.getElementById('image-model').value;
    const count = parseInt(document.getElementById('image-count').value) || 1;
    const cost = (IMAGE_COSTS[model] || 3) * count;
    setAnimatedCostLabel('image-cost-label', cost);
  }

  function closeImageSettingMenus(exceptSetting = null) {
    document.querySelectorAll('.image-setting-menu').forEach(menu => {
      if (!exceptSetting || menu.dataset.settingMenu !== exceptSetting) menu.classList.add('hidden');
    });
  }

  function updateImageSettingLabels() {
    const quality = document.getElementById('image-quality-select')?.value || 'standard';
    const resolution = document.getElementById('image-resolution-select')?.value || '1k';
    const aspect = document.getElementById('image-aspect-select')?.value || '1:1';
    const batch = document.getElementById('image-batch-select')?.value || '1';
    const qLabel = document.getElementById('image-quality-label');
    const rLabel = document.getElementById('image-resolution-label');
    const aLabel = document.getElementById('image-aspect-label');
    const bLabel = document.getElementById('image-batch-label');
    if (qLabel) qLabel.textContent = IMAGE_SETTING_LABELS.quality[quality] || quality;
    if (rLabel) rLabel.textContent = IMAGE_SETTING_LABELS.resolution[resolution] || resolution.toUpperCase();
    if (aLabel) aLabel.textContent = aspect;
    if (bLabel) bLabel.textContent = IMAGE_SETTING_LABELS.batch[batch] || batch;
  }

  function findClosestImageAspect(width, height) {
    const ratio = width / height;
    const aspects = Object.keys(IMAGE_SIZE_PRESETS['1k']);
    let best = '1:1';
    let bestDiff = Infinity;
    aspects.forEach(aspect => {
      const [aw, ah] = aspect.split(':').map(Number);
      const diff = Math.abs((aw / ah) - ratio);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = aspect;
      }
    });
    return best;
  }

  function syncImageQuickControls() {
    const qualityEl = document.getElementById('image-quality-select');
    const resolutionEl = document.getElementById('image-resolution-select');
    const aspectEl = document.getElementById('image-aspect-select');
    const batchEl = document.getElementById('image-batch-select');
    const quality = qualityEl?.value || 'standard';
    const resolution = resolutionEl?.value || '1k';
    const aspect = aspectEl?.value || '1:1';
    const batch = Math.max(1, Math.min(4, parseInt(batchEl?.value || '1', 10) || 1));
    const [width, height] = IMAGE_SIZE_PRESETS[resolution]?.[aspect] || IMAGE_SIZE_PRESETS['1k']['1:1'];
    const size = `${width}x${height}`;
    const countEl = document.getElementById('image-count');
    const widthEl = document.getElementById('image-width');
    const heightEl = document.getElementById('image-height');
    const sizeEl = document.getElementById('image-size-select');
    const negEl = document.getElementById('image-neg-prompt');
    if (batchEl) batchEl.value = String(batch);
    if (countEl) countEl.value = String(batch);
    if (widthEl) widthEl.value = String(width);
    if (heightEl) heightEl.value = String(height);
    if (sizeEl) sizeEl.value = size;
    if (negEl) negEl.dataset.quality = quality;
    updateImageSettingLabels();
    document.querySelectorAll('#ratio-picker .ratio-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size || btn.querySelector('span')?.textContent === aspect);
    });
    updateImageCostLabel();
  }

  function getImageQualityPrompt(quality) {
    if (quality === 'high') return 'high quality, detailed, sharp focus';
    if (quality === 'ultra') return 'ultra high quality, highly detailed, crisp details, professional lighting';
    return '';
  }

  function renderImageReferencePreviews() {
    const wrap = document.getElementById('image-reference-preview');
    if (!wrap) return;
    wrap.innerHTML = '';
    State.imageReferenceUrls.forEach((url, index) => {
      const item = document.createElement('div');
      item.className = 'image-reference-thumb';
      item.innerHTML = `
        <img src="${url}" alt="Reference image ${index + 1}" />
        <button type="button" aria-label="Remove reference image">×</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        State.imageReferenceFiles.splice(index, 1);
        State.imageReferenceUrls.splice(index, 1);
        renderImageReferencePreviews();
      });
      wrap.appendChild(item);
    });
  }

  function showUploadProgress(label = 'Preparing your media') {
    const overlay = document.getElementById('upload-progress-overlay');
    const fill = document.getElementById('upload-progress-fill');
    const sub = document.getElementById('upload-progress-sub');
    if (!overlay || !fill) return;
    if (sub) sub.textContent = label;
    fill.style.width = '8%';
    overlay.classList.remove('hidden');
    let progress = 8;
    if (uploadProgressTimer) clearInterval(uploadProgressTimer);
    uploadProgressTimer = setInterval(() => {
      progress = Math.min(92, progress + Math.max(2, (92 - progress) * 0.12));
      fill.style.width = `${progress.toFixed(0)}%`;
    }, 120);
  }

  function hideUploadProgress() {
    const overlay = document.getElementById('upload-progress-overlay');
    const fill = document.getElementById('upload-progress-fill');
    if (uploadProgressTimer) { clearInterval(uploadProgressTimer); uploadProgressTimer = null; }
    if (fill) fill.style.width = '100%';
    setTimeout(() => {
      if (overlay) overlay.classList.add('hidden');
      if (fill) fill.style.width = '0%';
    }, 180);
  }

  async function addImageReferenceFiles(files) {
    const imageFiles = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    const remaining = Math.max(0, 10 - State.imageReferenceFiles.length);
    const accepted = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) toast('You can upload up to 10 reference images.', 'info');
    if (!accepted.length) return;
    showUploadProgress(`Uploading ${accepted.length} reference image${accepted.length > 1 ? 's' : ''}`);
    try {
      const urls = await Promise.all(accepted.map(file => fileToDataURL(file)));
      State.imageReferenceFiles.push(...accepted);
      State.imageReferenceUrls.push(...urls);
      renderImageReferencePreviews();
    } finally {
      hideUploadProgress();
    }
  }

  function renderImageResults(urls) {
    const container = document.getElementById('image-results');
    container.style.display = 'flex';
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'result-grid result-grid--single';
    for (const url of urls) {
      const wrap = document.createElement('div');
      wrap.className = 'result-img-wrap';
      wrap.innerHTML = `
        <img src="${url}" alt="Generated image" loading="lazy" />
        <div class="result-img-actions">
          <a class="result-action-btn" href="${url}" download="raiko_image.png">Save</a>
          <button class="result-action-btn" onclick="navigator.share ? navigator.share({ url: '${url}' }) : navigator.clipboard.writeText('${url}')">Share</button>
        </div>
      `;
      grid.appendChild(wrap);
    }
    container.appendChild(grid);
    closeMediaDrawer();
  }

  async function generateImage() {
    if (!requireAuth()) return;
    const prompt = document.getElementById('image-prompt').value.trim();
    if (!prompt) { toast('Please enter a prompt', 'error'); return; }
    const model = document.getElementById('image-model').value;
    const count = parseInt(document.getElementById('image-count').value) || 1;
    const width = parseInt(document.getElementById('image-width').value) || 1024;
    const height = parseInt(document.getElementById('image-height').value) || 1024;
    const negPrompt = document.getElementById('image-neg-prompt').value.trim();
    const quality = document.getElementById('image-quality-select')?.value || 'standard';
    const btn = document.getElementById('btn-generate-image');
    btn.disabled = true;
    showGenPlaceholder('image-results');
    const promptParts = [prompt, State.stylePreset, getImageQualityPrompt(quality)].filter(Boolean);
    const fullPrompt = promptParts.join(', ');
    try {
      const res = await API.ai.generateImage(model, fullPrompt, {
        negative_prompt: negPrompt,
        width, height,
        num_images: count,
        extra: State.imageReferenceUrls.length ? {
          image_urls: State.imageReferenceUrls,
          reference_image_urls: State.imageReferenceUrls,
        } : {},
      });
      clearGenPlaceholder('image-results');
      const urls = Array.isArray(res.output) ? res.output : [res.output];
      renderImageResults(urls);
      urls.forEach(url => saveMediaItem('image', url, fullPrompt, model));
      updateCreditsUI(res.credits_remaining);
      toast(`Generated ${urls.length} image${urls.length > 1 ? 's' : ''}! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      clearGenPlaceholder('image-results');
      resetPanelToEmpty('panel-image');
      toast(err.message || 'Generation failed', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function bindImagePageEvents() {
    document.getElementById('btn-generate-image')?.addEventListener('click', generateImage);
    document.getElementById('image-model')?.addEventListener('change', updateImageCostLabel);
    document.getElementById('image-count')?.addEventListener('change', updateImageCostLabel);
    ['image-quality-select', 'image-resolution-select', 'image-aspect-select', 'image-batch-select'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', syncImageQuickControls);
    });
    document.querySelectorAll('.image-setting-trigger').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const setting = trigger.dataset.settingTrigger;
        const menu = document.querySelector(`.image-setting-menu[data-setting-menu="${setting}"]`);
        if (!menu) return;
        const willOpen = menu.classList.contains('hidden');
        closeImageSettingMenus(setting);
        menu.classList.toggle('hidden', !willOpen);
      });
    });
    document.querySelectorAll('.image-setting-menu').forEach(menu => {
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        const setting = menu.dataset.settingMenu;
        const selectIdMap = {
          quality: 'image-quality-select',
          resolution: 'image-resolution-select',
          aspect: 'image-aspect-select',
          batch: 'image-batch-select',
        };
        const selectEl = document.getElementById(selectIdMap[setting]);
        if (!selectEl) return;
        selectEl.value = btn.dataset.value;
        selectEl.dispatchEvent(new Event('change'));
        closeImageSettingMenus();
      });
    });
    document.addEventListener('click', () => closeImageSettingMenus());
    syncImageQuickControls();

    const imageRefInput = document.getElementById('image-reference-input');
    document.getElementById('img-reference-plus-btn')?.addEventListener('click', () => imageRefInput?.click());
    imageRefInput?.addEventListener('change', async (e) => {
      await addImageReferenceFiles(e.target.files);
      e.target.value = '';
    });

    document.getElementById('image-size-select')?.addEventListener('change', (e) => {
      const parts = e.target.value.split('x');
      const w = parseInt(parts[0]) || 1024;
      const h = parseInt(parts[1]) || 1024;
      const wEl = document.getElementById('image-width');
      const hEl = document.getElementById('image-height');
      if (wEl) wEl.value = w;
      if (hEl) hEl.value = h;
      const aspectEl = document.getElementById('image-aspect-select');
      const resolutionEl = document.getElementById('image-resolution-select');
      if (aspectEl) aspectEl.value = findClosestImageAspect(w, h);
      if (resolutionEl) resolutionEl.value = Math.max(w, h) > 1536 ? '2k' : '1k';
    });

    document.getElementById('image-style-select')?.addEventListener('change', (e) => {
      State.stylePreset = e.target.value;
    });

    const imgModelTrigger = document.getElementById('img-model-trigger');
    const imgModelDropdown = document.getElementById('img-model-dropdown');
    if (imgModelTrigger && imgModelDropdown) {
      imgModelTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !imgModelDropdown.classList.contains('hidden');
        imgModelDropdown.classList.toggle('hidden', open);
        imgModelTrigger.setAttribute('aria-expanded', String(!open));
      });
      imgModelDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.imd-item');
        if (!item) return;
        if (item.dataset.model === 'fal-ai/seedvr/upscale/image') {
          imgModelDropdown.classList.add('hidden');
          imgModelTrigger.setAttribute('aria-expanded', 'false');
          selectEditModel(item.dataset.model, true);
          switchPanel('edit');
          return;
        }
        imgModelDropdown.querySelectorAll('.imd-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('imt-icon').textContent = item.dataset.icon || '';
        document.getElementById('imt-name').textContent = item.querySelector('.imd-name').textContent;
        document.getElementById('imt-cost').textContent = item.dataset.cost + '⚡';
        const sel = document.getElementById('image-model');
        if (sel) { sel.value = item.dataset.model; sel.dispatchEvent(new Event('change')); }
        imgModelDropdown.classList.add('hidden');
        imgModelTrigger.setAttribute('aria-expanded', 'false');
      });
      document.addEventListener('click', (e) => {
        if (!document.getElementById('img-model-picker-wrap')?.contains(e.target)) {
          imgModelDropdown.classList.add('hidden');
          imgModelTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.getElementById('ratio-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.ratio-btn');
      if (!btn) return;
      document.querySelectorAll('#ratio-picker .ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const [w, h] = btn.dataset.size.split('x').map(Number);
      const wEl = document.getElementById('image-width');
      const hEl = document.getElementById('image-height');
      const sizeEl = document.getElementById('image-size-select');
      if (wEl) wEl.value = w;
      if (hEl) hEl.value = h;
      if (sizeEl) sizeEl.value = btn.dataset.size;
      const aspectEl = document.getElementById('image-aspect-select');
      const resolutionEl = document.getElementById('image-resolution-select');
      const aspect = findClosestImageAspect(w, h);
      if (aspectEl) aspectEl.value = aspect;
      if (resolutionEl) resolutionEl.value = Math.max(w, h) > 1536 ? '2k' : '1k';
    });

    document.getElementById('style-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.style-chip');
      if (!chip) return;
      document.querySelectorAll('#style-chips .style-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const sel = document.getElementById('image-style-select');
      if (sel) { sel.value = chip.dataset.style; sel.dispatchEvent(new Event('change')); }
    });

    document.getElementById('img-tool-picker')?.addEventListener('click', (e) => {
      const card = e.target.closest('.img-tool-card');
      if (card && card.dataset.imageTool) switchImageTool(card.dataset.imageTool);
    });

    document.getElementById('btn-edit-image')?.addEventListener('click', runEditImage);
    setupImageUpload('edit-source-input', 'edit-source-preview', 'editSourceUrl');
    document.getElementById('edit-strength')?.addEventListener('input', (e) => {
      document.getElementById('edit-strength-val').textContent = e.target.value;
    });
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.image = bindImagePageEvents;
})();
