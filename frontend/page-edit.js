/* page-edit.js — Edit page event binding for Raiko. */
(function () {
  const EDIT_TOOL_SCREENS = {
    edit: {
      model: 'fal-ai/nano-banana-2/edit', icon: '🍌', name: 'NB 2 Edit', cost: 5,
      badge: 'IMAGE EDIT', title: 'EDIT IMAGE',
      subtitle: 'Upload an image, describe the change, and generate a new edited result.',
      cta: '↥ Upload image', button: 'Edit', resultTag: 'EDIT RESULT',
      hero: 'dashboard-showcase/seedream-explore/item-08/image.jpg',
      steps: ['01 Upload image', '02 Describe edit', '03 Generate result'],
    },
    'bg-remove': {
      model: 'fal-ai/bria/background/remove', icon: '✂', name: 'BG Remove', cost: 3,
      badge: 'BACKGROUND TOOL', title: 'REMOVE BACKGROUND',
      subtitle: 'Upload an image and remove the background automatically. No prompt needed.',
      cta: '↥ Upload image for BG Remove', button: 'Remove BG', resultTag: 'TRANSPARENT RESULT',
      hero: 'dashboard-showcase/gpt-image-2-explore/2/image.jpg',
      steps: ['01 Upload image', '02 AI isolates subject', '03 Download cutout'],
    },
    'image-upscale': {
      model: 'fal-ai/seedvr/upscale/image', icon: '⤢', name: 'SeedVR Image Upscale', cost: 8,
      badge: 'UPSCALE TOOL', title: 'UPSCALE IMAGE',
      subtitle: 'Upload an image and enhance it with SeedVR upscaling. No prompt needed.',
      cta: '↥ Upload image to upscale', button: 'Upscale', resultTag: 'UPSCALED RESULT',
      hero: 'dashboard-showcase/nano-banana-pro-explore/3/image.webp',
      steps: ['01 Upload image', '02 SeedVR enhances detail', '03 Save upscaled image'],
    },
  };

  function selectEditModel(modelId, resetWorkspace = false) {
    const dropdown = document.getElementById('edit-model-dropdown');
    if (!dropdown) {
      storePageHandoff('raiko:edit-model', { modelId, resetWorkspace });
      navigateToPanelPage('edit', { model: modelId });
      return;
    }
    const item = dropdown.querySelector(`.imd-item[data-model="${modelId}"]`);
    if (!item) return;
    dropdown.querySelectorAll('.imd-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const icon = document.getElementById('edit-imt-icon');
    const name = document.getElementById('edit-imt-name');
    const cost = document.getElementById('edit-imt-cost');
    if (icon) icon.textContent = item.dataset.icon || '';
    if (name) name.textContent = item.querySelector('.imd-name').textContent;
    if (cost) cost.textContent = item.dataset.cost + '⚡';
    State.currentEditModel = modelId;
    const isBgRemove = modelId === 'fal-ai/bria/background/remove';
    const isImageUpscale = modelId === 'fal-ai/seedvr/upscale/image';
    const promptSection = document.getElementById('edit-panel-prompt-section');
    if (promptSection) promptSection.style.display = (isBgRemove || isImageUpscale) ? 'none' : '';
    const costBadge = document.getElementById('edit-panel-cost-badge');
    if (costBadge) setAnimatedCostLabel(costBadge, Number(item.dataset.cost || '5'));
    dropdown.classList.add('hidden');
    const toolId = modelId === 'fal-ai/bria/background/remove' ? 'bg-remove' : (modelId === 'fal-ai/seedvr/upscale/image' ? 'image-upscale' : 'edit');
    setEditToolScreen(toolId, modelId);
    if (resetWorkspace) resetEditPanelWorkspace();
  }

  function setEditToolScreen(toolId = 'edit', modelId = null) {
    const nextTool = EDIT_TOOL_SCREENS[toolId] ? toolId : 'edit';
    const cfg = EDIT_TOOL_SCREENS[nextTool];
    State.currentEditTool = nextTool;
    const resolvedModel = modelId || cfg.model;
    State.currentEditModel = resolvedModel;
    const title = document.getElementById('edit-tool-title');
    const subtitle = document.getElementById('edit-tool-subtitle');
    const badge = document.getElementById('edit-tool-badge');
    const cta = document.getElementById('edit-upload-cta');
    const hero = document.getElementById('edit-tool-hero-img');
    const steps = document.getElementById('edit-tool-steps');
    const resultTag = document.querySelector('#edit-result-zone .edit-result-tag');
    const promptSection = document.getElementById('edit-panel-prompt-section');
    const btn = document.getElementById('btn-run-edit-panel');
    if (title) title.textContent = cfg.title;
    if (subtitle) subtitle.textContent = cfg.subtitle;
    if (badge) badge.textContent = cfg.badge;
    if (cta) cta.textContent = cfg.cta;
    if (hero) hero.src = cfg.hero;
    if (steps) steps.innerHTML = cfg.steps.map(step => `<span>${step}</span>`).join('');
    if (resultTag) resultTag.textContent = cfg.resultTag;
    if (promptSection) promptSection.style.display = nextTool === 'edit' ? '' : 'none';
    if (btn) {
      const badgeHtml = `<span class="img-cost-badge" id="edit-panel-cost-badge">${cfg.cost}⚡</span>`;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>${cfg.button} ${badgeHtml}`;
    }
    const iconEl = document.getElementById('edit-imt-icon');
    const nameEl = document.getElementById('edit-imt-name');
    const costEl = document.getElementById('edit-imt-cost');
    if (iconEl) iconEl.textContent = cfg.icon;
    if (nameEl) nameEl.textContent = cfg.name;
    if (costEl) costEl.textContent = `${cfg.cost}⚡`;
    document.querySelectorAll('#edit-model-dropdown .imd-item').forEach(item => {
      item.classList.toggle('active', item.dataset.model === resolvedModel);
    });
  }

  function resetEditPanelWorkspace() {
    State.editPanelSourceUrl = null;
    const input = document.getElementById('edit-panel-source-input');
    const preview = document.getElementById('edit-panel-source-preview');
    const inner = document.getElementById('edit-upload-inner');
    const removeBtn = document.getElementById('edit-panel-remove-btn');
    const uploadCard = document.querySelector('.edit-upload-card');
    const resultZone = document.getElementById('edit-result-zone');
    const resultArea = document.getElementById('edit-result-area');
    const editBar = document.getElementById('edit-bar');
    const panel = document.getElementById('panel-edit');
    const prompt = document.getElementById('edit-panel-prompt');
    if (input) input.value = '';
    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (inner) inner.style.display = '';
    if (removeBtn) removeBtn.classList.add('hidden');
    if (uploadCard) uploadCard.classList.remove('has-image');
    if (resultZone) resultZone.classList.add('hidden');
    if (resultArea) resultArea.innerHTML = '';
    if (editBar) editBar.classList.add('hidden');
    if (panel) panel.classList.remove('has-source', 'has-result');
    if (prompt) prompt.value = '';
  }

  async function runEditPanel() {
    if (!requireAuth()) return;
    if (!State.editPanelSourceUrl) { toast('Upload an image first', 'error'); return; }
    const isBgRemove = State.currentEditModel === 'fal-ai/bria/background/remove';
    const isImageUpscale = State.currentEditModel === 'fal-ai/seedvr/upscale/image';
    const prompt = (isBgRemove || isImageUpscale) ? '' : (document.getElementById('edit-panel-prompt')?.value.trim() || '');
    if (!isBgRemove && !isImageUpscale && !prompt) { toast('Enter an edit prompt', 'error'); return; }
    const strength = 0.75;
    const btn = document.getElementById('btn-run-edit-panel');
    const status = document.getElementById('edit-panel-status');
    btn.disabled = true;
    status.classList.remove('hidden');
    try {
      const res = await API.ai.editImage(State.currentEditModel, prompt, State.editPanelSourceUrl, strength);
      const urls = Array.isArray(res.output) ? res.output : [res.output];
      renderEditPanelResults(urls);
      updateCreditsUI(res.credits_remaining);
      const label = isBgRemove ? 'Background removed' : (isImageUpscale ? 'Upscaled image' : prompt);
      urls.forEach(url => saveMediaItem('image', url, label, State.currentEditModel));
      toast(`Done! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      toast(err.message || 'Edit failed', 'error');
    } finally {
      btn.disabled = false;
      status.classList.add('hidden');
    }
  }

  function renderEditPanelResults(urls) {
    const zone = document.getElementById('edit-result-zone');
    const container = document.getElementById('edit-result-area');
    const panel = document.getElementById('panel-edit');
    if (!container) return;
    container.innerHTML = '';
    if (zone) zone.classList.remove('hidden');
    if (panel) panel.classList.add('has-result');
    for (const url of urls) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;';
      wrap.innerHTML = `
        <img src="${url}" alt="Edited image" style="max-width:100%;max-height:100%;object-fit:contain;border:2px solid var(--black);" loading="lazy" />
        <div style="display:flex;gap:6px;">
          <button class="result-action-btn" onclick="window.open('${url}', '_blank')">Open</button>
          <a class="result-action-btn" href="${url}" download="raiko_edit.png">Download</a>
        </div>
      `;
      container.appendChild(wrap);
    }
  }

  function bindEditPageEvents() {
    const editModelTrigger = document.getElementById('edit-model-trigger');
    const editModelDropdown = document.getElementById('edit-model-dropdown');
    if (editModelTrigger && editModelDropdown) {
      editModelTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !editModelDropdown.classList.contains('hidden');
        editModelDropdown.classList.toggle('hidden', open);
        editModelTrigger.setAttribute('aria-expanded', String(!open));
      });
      editModelDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.imd-item');
        if (!item) return;
        selectEditModel(item.dataset.model);
        editModelTrigger.setAttribute('aria-expanded', 'false');
      });
      document.addEventListener('click', (e) => {
        if (!document.getElementById('edit-model-picker-wrap')?.contains(e.target)) {
          editModelDropdown.classList.add('hidden');
          editModelTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    setupImageUpload('edit-panel-source-input', 'edit-panel-source-preview', 'editPanelSourceUrl');
    document.getElementById('edit-panel-source-input')?.addEventListener('change', () => {
      const inner = document.getElementById('edit-upload-inner');
      const removeBtn = document.getElementById('edit-panel-remove-btn');
      const uploadCard = document.querySelector('.edit-upload-card');
      const editBar = document.getElementById('edit-bar');
      const panel = document.getElementById('panel-edit');
      if (inner) inner.style.display = 'none';
      if (removeBtn) removeBtn.classList.remove('hidden');
      if (uploadCard) uploadCard.classList.add('has-image');
      if (editBar) editBar.classList.remove('hidden');
      if (panel) panel.classList.add('has-source');
    });
    document.getElementById('edit-panel-remove-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetEditPanelWorkspace();
    });
    document.getElementById('btn-run-edit-panel')?.addEventListener('click', runEditPanel);
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.edit = bindEditPageEvents;
})();
