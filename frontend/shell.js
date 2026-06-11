/* shell.js — shared navbar, dropdown, pricing, and modal event bindings for Raiko. */
(function () {
  function bindShellNavigationEvents() {
    document.getElementById('sidebar-nav')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (btn) {
        e.preventDefault();
        switchPanel(btn.dataset.panel);
      }
    });

    const userTrigger = document.getElementById('navbar-user-trigger');
    const userDropdown = document.getElementById('user-dropdown');
    if (userTrigger && userDropdown) {
      userTrigger.addEventListener('click', (e) => {
        if (State.isGuest) {
          window.location.href = '/login.html';
          return;
        }
        e.stopPropagation();
        const isOpen = !userDropdown.classList.contains('hidden');
        userDropdown.classList.toggle('hidden', isOpen);
        userTrigger.setAttribute('aria-expanded', String(!isOpen));
      });
      document.addEventListener('click', (e) => {
        if (!document.getElementById('navbar-user-wrap')?.contains(e.target)) {
          userDropdown.classList.add('hidden');
          userTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.getElementById('udrop-my-media')?.addEventListener('click', () => {
      userDropdown?.classList.add('hidden');
      userTrigger?.setAttribute('aria-expanded', 'false');
      if (document.getElementById('media-drawer')) openMediaDrawer(false);
      else switchPanel('media');
    });

    document.getElementById('udrop-premium-btn')?.addEventListener('click', () => {
      userDropdown?.classList.add('hidden');
      userTrigger?.setAttribute('aria-expanded', 'false');
      document.getElementById('credits-modal')?.classList.remove('hidden');
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Auth.clearToken();
      Auth.clearUser();
      window.location.href = '/login.html';
    });
  }

  function bindMegaNavigationEvents() {
    document.querySelectorAll('.nav-mega-wrap').forEach(wrap => {
      const drop = wrap.querySelector('.nav-mega-drop');
      if (!drop) return;
      let closeTimer;

      function openDrop() {
        clearTimeout(closeTimer);
        const rect = wrap.getBoundingClientRect();
        drop.style.top  = rect.bottom + 'px';
        drop.style.left = rect.left + 'px';
        drop.classList.add('open');
      }
      function scheduleDrop() {
        closeTimer = setTimeout(() => drop.classList.remove('open'), 120);
      }

      wrap.addEventListener('mouseenter', openDrop);
      wrap.addEventListener('mouseleave', scheduleDrop);
      drop.addEventListener('mouseenter', () => clearTimeout(closeTimer));
      drop.addEventListener('mouseleave', scheduleDrop);
    });

    document.querySelectorAll('.nmd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const modelId = item.dataset.model;
        const panelId = item.dataset.panel;
        const imageTool = item.dataset.imageTool || '';
        const videoTool = item.dataset.videoTool || 'text';

        if (panelId === 'image') {
          if (!samePanelPage('image')) {
            navigateToPanelPage('image', { model: modelId, tool: imageTool || undefined });
            return;
          }
          if (modelId) selectImageModel(modelId);
          switchPanel('image');
        } else if (panelId === 'video') {
          if (!samePanelPage('video')) {
            navigateToPanelPage('video', { model: modelId, tool: videoTool });
            return;
          }
          switchPanel('video');
          switchVideoTool(videoTool);
          if (modelId) setTimeout(() => selectVideoModel(modelId, videoTool), 50);
        } else if (panelId === 'edit') {
          if (!samePanelPage('edit')) {
            navigateToPanelPage('edit', { model: modelId, tool: item.dataset.editTool || undefined });
            return;
          }
          switchPanel('edit');
          const editTool = item.dataset.editTool || '';
          if (modelId) {
            setTimeout(() => selectEditModel(modelId, true), 50);
          } else if (editTool) {
            setTimeout(() => { setEditToolScreen(editTool); resetEditPanelWorkspace(); }, 50);
          }
        } else if (panelId === 'upscale') {
          if (document.getElementById('panel-upscale')) openUpscaler(item.dataset.upscaleEntry || 'auto');
          else navigateToPanelPage('upscale', { type: item.dataset.upscaleEntry || 'auto' });
        } else if (panelId === 'restyler') {
          switchPanel('restyler');
        } else if (panelId === 'audio') {
          if (!samePanelPage('audio')) {
            navigateToPanelPage('audio');
            return;
          }
          switchPanel('audio');
        } else if (['expand', 'angles', 'shots'].includes(panelId)) {
          switchPanel(panelId);
        }
      });
    });
  }

  function bindSharedModalEvents() {
    document.querySelectorAll('.footer-pricing-trigger').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById('btn-buy-credits')?.click());
    });

    document.getElementById('btn-buy-credits')?.addEventListener('click', openCreditsModal);
    document.getElementById('credits-modal-close')?.addEventListener('click', closeCreditsModal);
    document.getElementById('credits-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'credits-modal') closeCreditsModal();
    });

    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'lightbox-modal') closeLightbox();
    });
    document.getElementById('credit-packs')?.addEventListener('click', (e) => {
      const pack = e.target.closest('.credit-pack');
      if (pack) purchasePack(pack.dataset.pack);
    });
    document.getElementById('subscription-plan-grid')?.addEventListener('click', (e) => {
      const plan = e.target.closest('.subscription-plan');
      if (plan) subscribePlan(plan.dataset.plan, plan.dataset.billing || 'monthly');
    });
    document.querySelectorAll('.pricing-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => switchPricingView(btn.dataset.pricingView));
    });
    document.querySelectorAll('.pricing-billing-btn').forEach(btn => {
      btn.addEventListener('click', () => switchPricingBilling(btn.dataset.billing));
    });
    switchPricingBilling(State.pricingBilling);
  }

  window.RAIKO_SHELL = Object.freeze({
    bindShellNavigationEvents,
    bindMegaNavigationEvents,
    bindSharedModalEvents,
  });
})();
