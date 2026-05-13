/* page-dashboard.js — Dashboard/Explore page event binding for Raiko. */
(function () {
  function bindDashboardPageEvents(pagePanel) {
    document.getElementById('btn-new-chat-sidebar')?.addEventListener('click', () => {
      switchPanel('chat');
      startNewChat();
    });
    document.getElementById('btn-new-chat-inner')?.addEventListener('click', startNewChat);

    document.getElementById('model-selector-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = document.getElementById('model-dropdown');
      dd?.classList.contains('hidden') ? openModelDropdown() : closeModelDropdown();
    });
    document.getElementById('model-search-input')?.addEventListener('input', (e) => renderModelList(e.target.value));
    document.addEventListener('click', (e) => {
      if (!document.getElementById('model-selector-wrap')?.contains(e.target)) closeModelDropdown();
    });

    if (shouldInitChat(pagePanel)) {
      bindChatInputEvents();
      bindFileInput('chat-file-input');
      bindFileInput('hero-file-input');
      bindVoiceButtons();
      bindModeButtons();
      updateSendButtonsState();
      bindChipEvents();
    }

    document.getElementById('qc-new-chat')?.addEventListener('click', () => {
      switchPanel('chat');
      startNewChat();
    });
    document.getElementById('qc-new-chat-2')?.addEventListener('click', () => {
      switchPanel('chat');
      startNewChat();
    });
    document.getElementById('qc-new-image')?.addEventListener('click', () => switchPanel('image'));
    document.getElementById('qc-new-video')?.addEventListener('click', () => switchPanel('video'));
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.dashboard = bindDashboardPageEvents;
})();
