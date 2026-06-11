/* page-audio.js — Audio page event binding for Raiko. */
(function () {
  const AUDIO_COSTS = {
    'fal-ai/elevenlabs/tts/eleven-v3': 8,
    'fal-ai/elevenlabs/music': 14,
    'fal-ai/elevenlabs/voice-changer': 10,
  };

  const AUDIO_MODELS = {
    voiceover: 'fal-ai/elevenlabs/tts/eleven-v3',
    music: 'fal-ai/elevenlabs/music',
    'voice-changer': 'fal-ai/elevenlabs/voice-changer',
  };

  const AUDIO_LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
    { code: 'fr', label: 'French', flag: '🇫🇷' },
    { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'it', label: 'Italian', flag: '🇮🇹' },
    { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', label: 'Korean', flag: '🇰🇷' },
    { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru', label: 'Russian', flag: '🇷🇺' },
    { code: 'tr', label: 'Turkish', flag: '🇹🇷' },
    { code: 'es', label: 'Spanish', flag: '🇪🇸' },
    { code: 'de', label: 'German', flag: '🇩🇪' },
    { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
    { code: 'pl', label: 'Polish', flag: '🇵🇱' },
    { code: 'id', label: 'Indonesian', flag: '🇮🇩' },
    { code: 'fil', label: 'Filipino', flag: '🇵🇭' },
  ];

  function getCurrentAudioTool() {
    return window.State?.currentAudioTool || 'voiceover';
  }

  function setCurrentAudioTool(tool) {
    if (window.State) window.State.currentAudioTool = tool;
  }

  function getCurrentLanguage() {
    return window.State?.audioVoiceoverLanguage || AUDIO_LANGUAGES[0];
  }

  function setCurrentLanguage(code, label, flag) {
    const next = { code, label, flag };
    if (window.State) window.State.audioVoiceoverLanguage = next;
    const nameEl = document.getElementById('audio-language-name');
    const flagEl = document.getElementById('audio-language-flag');
    if (nameEl) nameEl.textContent = label;
    if (flagEl) flagEl.textContent = flag;
    document.querySelectorAll('.audio-language-card').forEach(card => {
      card.classList.toggle('active', card.dataset.langCode === code);
    });
  }

  function openAudioLanguageModal() {
    document.getElementById('audio-language-modal')?.classList.remove('hidden');
  }

  function closeAudioLanguageModal() {
    document.getElementById('audio-language-modal')?.classList.add('hidden');
  }

  function setCostLabel(id, cost) {
    if (typeof setAnimatedCostLabel === 'function') setAnimatedCostLabel(id, cost);
    else {
      const el = document.getElementById(id);
      if (el) el.textContent = `${cost}⚡`;
    }
  }

  function updateAudioCostLabels() {
    setCostLabel('audio-voiceover-cost-label', AUDIO_COSTS[AUDIO_MODELS.voiceover] || 8);
    setCostLabel('audio-music-cost-label', AUDIO_COSTS[AUDIO_MODELS.music] || 14);
    setCostLabel('audio-change-cost-label', AUDIO_COSTS[AUDIO_MODELS['voice-changer']] || 10);
  }

  function renderAudioResult({ url, prompt, model, title = 'Audio', meta = [], downloadName = 'raiko_audio.mp3' }) {
    const emptyState = document.getElementById('audio-empty-state');
    const zone = document.getElementById('audio-result-zone');
    const area = document.getElementById('audio-result-area');
    if (emptyState) emptyState.classList.add('hidden');
    if (zone) zone.classList.remove('hidden');
    if (!area) return;
    const metaHtml = meta.length ? `<div class="audio-result-detail-grid">${meta.map(item => `<div class="audio-result-detail"><span>${item.label}</span><strong>${item.value}</strong></div>`).join('')}</div>` : '';
    area.innerHTML = `
      <div class="audio-result-card">
        <div class="audio-result-meta">
          <span class="audio-result-badge">${title}</span>
          <span class="audio-result-model">${model}</span>
        </div>
        <audio controls src="${url}" class="audio-player"></audio>
        ${metaHtml}
        <p class="audio-result-prompt">${prompt}</p>
        <div class="audio-result-actions">
          <a href="${url}" target="_blank" class="result-action-btn">Open</a>
          <a href="${url}" download="${downloadName}" class="result-action-btn">Download</a>
        </div>
      </div>
    `;
  }

  function setAudioLoading(active, statusId, actionLabel = 'Generating…') {
    const btnMap = {
      'audio-voiceover-status': 'btn-generate-voiceover',
      'audio-music-status': 'btn-generate-music',
      'audio-change-status': 'btn-generate-voice-change',
    };
    const status = document.getElementById(statusId);
    const btn = document.getElementById(btnMap[statusId]);
    if (status) status.textContent = actionLabel;
    status?.classList.toggle('hidden', !active);
    if (btn) btn.disabled = active;
  }

  function showAudioLoadingPlaceholder() {
    const area = document.getElementById('audio-result-area');
    const zone = document.getElementById('audio-result-zone');
    const emptyState = document.getElementById('audio-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    if (zone) zone.classList.remove('hidden');
    if (area) area.innerHTML = '<div class="upscale-result-placeholder"><div class="upscale-result-placeholder-frame"></div><div class="upscale-result-placeholder-text">Generating…</div></div>';
  }

  async function generateVoiceover() {
    if (!requireAuth()) return;
    const text = document.getElementById('audio-voiceover-text')?.value.trim();
    if (!text) { toast('Please enter a voiceover script', 'error'); return; }
    const model = AUDIO_MODELS.voiceover;
    const voice = document.getElementById('audio-voiceover-voice')?.value || 'Aria';
    const stability = Number(document.getElementById('audio-voiceover-stability')?.value || '0.5');
    const language = getCurrentLanguage();
    const languageCode = language.code || 'en';
    const applyTextNormalization = document.getElementById('audio-voiceover-normalization')?.value || 'auto';
    const timestamps = !!document.getElementById('audio-voiceover-timestamps')?.checked;
    showAudioLoadingPlaceholder();
    setAudioLoading(true, 'audio-voiceover-status');
    try {
      const res = await API.ai.generateAudio(model, text, '0', {
        extra: {
          text,
          voice,
          stability,
          language_code: languageCode,
          apply_text_normalization: applyTextNormalization,
          timestamps,
        },
      });
      const url = res.output;
      renderAudioResult({
        url,
        prompt: text,
        model,
        title: 'Voiceover',
        downloadName: 'raiko_voiceover.mp3',
        meta: [
          { label: 'Voice', value: voice },
          { label: 'Stability', value: stability.toFixed(2) },
          { label: 'Language', value: language.label },
        ],
      });
      saveMediaItem('audio', url, text, model);
      updateCreditsUI(res.credits_remaining);
      toast(`Voiceover ready! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      document.getElementById('audio-result-zone')?.classList.add('hidden');
      document.getElementById('audio-empty-state')?.classList.remove('hidden');
      toast(err.message || 'Voiceover generation failed', 'error');
    } finally {
      setAudioLoading(false, 'audio-voiceover-status');
    }
  }

  async function generateMusic() {
    if (!requireAuth()) return;
    const prompt = document.getElementById('audio-music-prompt')?.value.trim();
    if (!prompt) { toast('Please enter a music prompt', 'error'); return; }
    const model = AUDIO_MODELS.music;
    const musicLengthMs = Number(document.getElementById('audio-music-length')?.value || '30000');
    const outputFormat = document.getElementById('audio-music-format')?.value || 'mp3_44100_128';
    const forceInstrumental = !!document.getElementById('audio-music-instrumental')?.checked;
    const respectSectionsDurations = !!document.getElementById('audio-music-respect-sections')?.checked;
    showAudioLoadingPlaceholder();
    setAudioLoading(true, 'audio-music-status');
    try {
      const res = await API.ai.generateAudio(model, prompt, String(Math.round(musicLengthMs / 1000)), {
        extra: {
          prompt,
          music_length_ms: musicLengthMs,
          output_format: outputFormat,
          force_instrumental: forceInstrumental,
          respect_sections_durations: respectSectionsDurations,
        },
      });
      const url = res.output;
      renderAudioResult({
        url,
        prompt,
        model,
        title: 'Music Creator',
        downloadName: 'raiko_music.mp3',
        meta: [
          { label: 'Length', value: `${Math.round(musicLengthMs / 1000)} sec` },
          { label: 'Format', value: outputFormat },
          { label: 'Instrumental', value: forceInstrumental ? 'Yes' : 'Optional' },
        ],
      });
      saveMediaItem('audio', url, prompt, model);
      updateCreditsUI(res.credits_remaining);
      toast(`Music ready! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      document.getElementById('audio-result-zone')?.classList.add('hidden');
      document.getElementById('audio-empty-state')?.classList.remove('hidden');
      toast(err.message || 'Music generation failed', 'error');
    } finally {
      setAudioLoading(false, 'audio-music-status');
    }
  }

  async function generateVoiceChange() {
    if (!requireAuth()) return;
    if (!window.State?.audioChangeSourceUrl) { toast('Please upload a source audio file', 'error'); return; }
    const model = AUDIO_MODELS['voice-changer'];
    const voice = document.getElementById('audio-change-voice')?.value || 'Aria';
    const outputFormat = document.getElementById('audio-change-format')?.value || 'mp3_44100_128';
    const seedRaw = document.getElementById('audio-change-seed')?.value;
    const removeBackgroundNoise = !!document.getElementById('audio-change-denoise')?.checked;
    showAudioLoadingPlaceholder();
    setAudioLoading(true, 'audio-change-status');
    try {
      const extra = {
        audio_url: window.State.audioChangeSourceUrl,
        voice,
        output_format: outputFormat,
        remove_background_noise: removeBackgroundNoise,
      };
      if (seedRaw !== '' && seedRaw != null) extra.seed = Number(seedRaw);
      const res = await API.ai.generateAudio(model, 'Voice conversion', '0', { extra });
      const url = res.output;
      renderAudioResult({
        url,
        prompt: `Voice changed to ${voice}`,
        model,
        title: 'Voice Changer',
        downloadName: 'raiko_voice_change.mp3',
        meta: [
          { label: 'Target voice', value: voice },
          { label: 'Format', value: outputFormat },
          { label: 'Denoise', value: removeBackgroundNoise ? 'On' : 'Off' },
        ],
      });
      saveMediaItem('audio', url, `Voice changed to ${voice}`, model);
      updateCreditsUI(res.credits_remaining);
      toast(`Voice changed! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      document.getElementById('audio-result-zone')?.classList.add('hidden');
      document.getElementById('audio-empty-state')?.classList.remove('hidden');
      toast(err.message || 'Voice conversion failed', 'error');
    } finally {
      setAudioLoading(false, 'audio-change-status');
    }
  }

  function switchAudioTool(tool) {
    setCurrentAudioTool(tool);
    document.querySelectorAll('#audio-tool-picker .img-tool-card').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.audioTool === tool);
    });
    document.querySelectorAll('.audio-sidebar-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `audio-panel-${tool}`);
    });
  }

  async function handleAudioChangeUpload(file) {
    if (!file || !file.type.startsWith('audio/')) return;
    showUploadProgress('Uploading audio');
    try {
      const dataUrl = await fileToDataURL(file);
      if (window.State) window.State.audioChangeSourceUrl = dataUrl;
      const preview = document.getElementById('audio-change-preview');
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove('hidden');
      }
      document.getElementById('audio-change-upload-zone')?.classList.add('has-file');
    } finally {
      hideUploadProgress();
    }
  }

  function bindAudioPageEvents() {
    document.getElementById('audio-tool-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-audio-tool]');
      if (btn) switchAudioTool(btn.dataset.audioTool);
    });
    document.getElementById('btn-generate-voiceover')?.addEventListener('click', generateVoiceover);
    document.getElementById('btn-generate-music')?.addEventListener('click', generateMusic);
    document.getElementById('btn-generate-voice-change')?.addEventListener('click', generateVoiceChange);
    document.getElementById('audio-voiceover-text')?.addEventListener('input', (e) => {
      if (typeof autoResize === 'function') autoResize(e.target);
    });
    document.getElementById('audio-music-prompt')?.addEventListener('input', (e) => {
      if (typeof autoResize === 'function') autoResize(e.target);
    });
    document.getElementById('audio-voiceover-stability')?.addEventListener('input', (e) => {
      const el = document.getElementById('audio-voiceover-stability-val');
      if (el) el.textContent = Number(e.target.value).toFixed(2);
    });
    document.getElementById('btn-audio-language-modal')?.addEventListener('click', openAudioLanguageModal);
    document.getElementById('audio-language-close')?.addEventListener('click', closeAudioLanguageModal);
    document.getElementById('audio-language-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'audio-language-modal') closeAudioLanguageModal();
    });
    document.getElementById('audio-language-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.audio-language-card');
      if (!card) return;
      setCurrentLanguage(card.dataset.langCode, card.dataset.langLabel, card.dataset.langFlag);
      closeAudioLanguageModal();
    });
    document.getElementById('btn-audio-change-upload')?.addEventListener('click', () => document.getElementById('audio-change-input')?.click());
    document.getElementById('audio-change-input')?.addEventListener('change', (e) => handleAudioChangeUpload(e.target.files?.[0]));
    updateAudioCostLabels();
    const currentLang = getCurrentLanguage();
    setCurrentLanguage(currentLang.code, currentLang.label, currentLang.flag);
    switchAudioTool(getCurrentAudioTool());
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.audio = bindAudioPageEvents;
})();
