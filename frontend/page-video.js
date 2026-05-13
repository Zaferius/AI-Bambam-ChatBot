/* page-video.js — Video page event binding for Raiko. */
(function () {
  const VIDEO_COSTS = {
    'fal-ai/kling-video/v1/standard/text-to-video':         12,
    'fal-ai/kling-video/v1/pro/text-to-video':              20,
    'fal-ai/kling-video/v3/pro/text-to-video':              28,
    'fal-ai/wan/v2.7/text-to-video':                        15,
    'fal-ai/bytedance/seedance/v1.5/pro/text-to-video':     20,
    'fal-ai/bytedance/seedance-2.0/text-to-video':          25,
    'fal-ai/sora-2/text-to-video':                          35,
    'fal-ai/veo3.1':                                        30,
    'xai/grok-imagine-video/text-to-video':                 22,
    'fal-ai/stable-video':                                  10,
    'fal-ai/kling-video/v1/standard/image-to-video':        15,
    'fal-ai/kling-video/v1/pro/image-to-video':             22,
    'fal-ai/seedvr/upscale/video':                          18,
  };

  function updateVideoCostLabel() {
    const model = document.getElementById('video-model').value;
    const cost = VIDEO_COSTS[model] || 12;
    setAnimatedCostLabel('video-cost-label', cost);
  }

  function updateI2VCostLabel() {
    const model = document.getElementById('i2v-model')?.value;
    const cost = VIDEO_COSTS[model] || 15;
    setAnimatedCostLabel('i2v-cost-label', cost);
  }

  function updateVideoUpscaleCostLabel() {
    const model = document.getElementById('video-upscale-model')?.value || 'fal-ai/seedvr/upscale/video';
    const cost = VIDEO_COSTS[model] || 18;
    setAnimatedCostLabel('video-upscale-cost-label', cost);
  }

  async function generateVideo() {
    if (!requireAuth()) return;
    const prompt = document.getElementById('video-prompt').value.trim();
    if (!prompt) { toast('Please enter a prompt', 'error'); return; }
    const model = document.getElementById('video-model').value;
    const duration = document.getElementById('video-duration').value;
    const btn = document.getElementById('btn-generate-video');
    btn.disabled = true;
    showGenPlaceholder('video-result-area');
    try {
      const res = await API.ai.generateVideo(model, prompt, duration);
      const url = res.output;
      clearGenPlaceholder('video-result-area');
      document.getElementById('video-result-area').innerHTML = `
        <video class="result-video" src="${url}" controls autoplay loop></video>
        <div style="margin-top:12px; display:flex; gap:8px; justify-content:center;">
          <a href="${url}" target="_blank" class="result-action-btn">Open</a>
          <a href="${url}" download="raiko_video.mp4" class="result-action-btn">Download</a>
        </div>
      `;
      saveMediaItem('video', url, prompt, model);
      updateCreditsUI(res.credits_remaining);
      toast(`Video ready! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      clearGenPlaceholder('video-result-area');
      resetPanelToEmpty('panel-video');
      toast(err.message || 'Video generation failed', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function generateVideoFromImage() {
    if (!requireAuth()) return;
    const prompt = document.getElementById('i2v-prompt')?.value.trim();
    if (!prompt) { toast('Please enter a prompt', 'error'); return; }
    if (!State.i2vSourceUrl) { toast('Please upload a source image', 'error'); return; }
    const model = document.getElementById('i2v-model')?.value || 'fal-ai/kling-video/v1/standard/image-to-video';
    const duration = document.getElementById('i2v-duration')?.value || '5';
    const btn = document.getElementById('btn-generate-i2v');
    btn.disabled = true;
    showGenPlaceholder('video-result-area');
    try {
      const res = await API.ai.generateVideoFromImage(model, prompt, State.i2vSourceUrl, duration);
      const url = res.output;
      clearGenPlaceholder('video-result-area');
      document.getElementById('video-result-area').innerHTML = `
        <video class="result-video" src="${url}" controls autoplay loop></video>
        <div style="margin-top:12px; display:flex; gap:8px; justify-content:center;">
          <a href="${url}" target="_blank" class="result-action-btn">Open</a>
          <a href="${url}" download="raiko_video.mp4" class="result-action-btn">Download</a>
        </div>
      `;
      saveMediaItem('video', url, prompt, model);
      updateCreditsUI(res.credits_remaining);
      toast(`Video ready! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      clearGenPlaceholder('video-result-area');
      resetPanelToEmpty('panel-video');
      toast(err.message || 'Video generation failed', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function upscaleVideo() {
    if (!requireAuth()) return;
    if (!State.videoUpscaleSourceUrl) { toast('Please upload a video to upscale', 'error'); return; }
    const model = document.getElementById('video-upscale-model')?.value || 'fal-ai/seedvr/upscale/video';
    const mode = document.getElementById('video-upscale-mode')?.value || 'factor';
    const factor = Number(document.querySelector('#vup-factor-buttons .upscale-factor-btn.active')?.dataset.factor || '2');
    const target = document.getElementById('video-upscale-resolution')?.value || '1080p';
    const format = document.getElementById('video-upscale-format')?.value || 'X264 (.mp4)';
    const btn = document.getElementById('btn-upscale-video');
    const status = document.getElementById('video-upscale-status');
    const resultZone = document.getElementById('vup-result-zone');
    const resultArea = document.getElementById('video-upscale-result-area');
    if (btn) btn.disabled = true;
    if (status) status.classList.remove('hidden');
    if (resultZone) resultZone.classList.remove('hidden');
    if (resultArea) {
      resultArea.innerHTML = `
        <div class="upscale-result-placeholder">
          <div class="upscale-result-placeholder-frame"></div>
          <div class="upscale-result-placeholder-text">Generating…</div>
        </div>
      `;
    }
    try {
      const res = await API.ai.generateVideo(model, 'Upscale video', '5', {
        extra: {
          video_url: State.videoUpscaleSourceUrl,
          upscale_mode: mode,
          upscale_factor: factor,
          target_resolution: target,
          noise_scale: 0.1,
          output_format: format,
          output_quality: 'high',
          output_write_mode: 'balanced',
        },
      });
      const url = res.output;
      if (resultArea) {
        resultArea.innerHTML = `
          <video class="upscale-result-media" src="${url}" controls autoplay loop></video>
          <a href="${url}" download="raiko_upscaled_video.mp4" class="upscale-download-btn">↓ Download</a>
        `;
      }
      saveMediaItem('video', url, 'Upscaled video', model);
      updateCreditsUI(res.credits_remaining);
      toast(`Video upscaled! ⚡ ${res.credits_used} used`, 'success');
    } catch (err) {
      if (resultZone) resultZone.classList.add('hidden');
      toast(err.message || 'Video upscale failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
      if (status) status.classList.add('hidden');
    }
  }

  function initVideoUpscaleTab() {
    const input = document.getElementById('video-upscale-source-input');
    const preview = document.getElementById('video-upscale-source-preview');
    const uploadBtn = document.getElementById('btn-vid-upscale-upload');
    const uploadCard = document.getElementById('vup-upload-card');
    const controls = document.getElementById('vup-controls');
    const canvas = document.getElementById('vup-canvas');
    const removeBtn = document.getElementById('btn-vup-remove');
    const previewCard = document.getElementById('vup-preview-card');
    const resultZone = document.getElementById('vup-result-zone');
    const resultArea = document.getElementById('video-upscale-result-area');
    if (!input) return;
    uploadBtn?.addEventListener('click', () => input.click());
    const vupFactorWrap = document.getElementById('vup-factor-buttons');
    vupFactorWrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('.upscale-factor-btn');
      if (!btn) return;
      vupFactorWrap.querySelectorAll('.upscale-factor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) { toast('Please upload a video file', 'error'); return; }
      if (file.size > 50 * 1024 * 1024) { toast('Video size must be 50MB or less', 'error'); return; }
      showUploadProgress('Uploading video');
      try {
        const dataUrl = await fileToDataURL(file);
        State.videoUpscaleSourceUrl = dataUrl;
        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove('hidden');
        }
        if (previewCard) previewCard.classList.add('has-image');
        if (removeBtn) removeBtn.classList.remove('hidden');
        if (uploadCard) uploadCard.classList.add('hidden');
        if (controls) controls.classList.remove('hidden');
        if (canvas) canvas.classList.remove('hidden');
        const explainer = document.getElementById('video-explainer');
        if (explainer) explainer.classList.add('hidden');
        const videoResultArea = document.getElementById('video-result-area');
        if (videoResultArea) videoResultArea.classList.add('hidden');
        if (resultZone) resultZone.classList.add('hidden');
        if (resultArea) resultArea.innerHTML = '';
      } finally {
        hideUploadProgress();
      }
    });
    removeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetVideoUpscaleTab();
    });
    document.getElementById('btn-vid-upscale-replace')?.addEventListener('click', () => resetVideoUpscaleTab());
  }

  function resetVideoUpscaleTab() {
    State.videoUpscaleSourceUrl = null;
    const input = document.getElementById('video-upscale-source-input');
    const preview = document.getElementById('video-upscale-source-preview');
    const uploadCard = document.getElementById('vup-upload-card');
    const controls = document.getElementById('vup-controls');
    const canvas = document.getElementById('vup-canvas');
    const removeBtn = document.getElementById('btn-vup-remove');
    const previewCard = document.getElementById('vup-preview-card');
    const resultZone = document.getElementById('vup-result-zone');
    const resultArea = document.getElementById('video-upscale-result-area');
    if (input) input.value = '';
    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (previewCard) previewCard.classList.remove('has-image');
    if (removeBtn) removeBtn.classList.add('hidden');
    if (uploadCard) uploadCard.classList.remove('hidden');
    if (controls) controls.classList.add('hidden');
    if (canvas) canvas.classList.add('hidden');
    if (resultZone) resultZone.classList.add('hidden');
    if (resultArea) resultArea.innerHTML = '';
    const explainer = document.getElementById('video-explainer');
    if (explainer) explainer.classList.remove('hidden');
    const videoResultArea = document.getElementById('video-result-area');
    if (videoResultArea) videoResultArea.classList.remove('hidden');
    const vupFactorWrap = document.getElementById('vup-factor-buttons');
    if (vupFactorWrap) {
      vupFactorWrap.querySelectorAll('.upscale-factor-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    }
  }

  function bindVideoPageEvents() {
    document.getElementById('motion-presets-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.motion-preset-card');
      if (!card) return;
      document.querySelectorAll('#motion-presets-grid .motion-preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
    document.getElementById('btn-generate-video')?.addEventListener('click', generateVideo);
    document.getElementById('video-model')?.addEventListener('change', updateVideoCostLabel);
    document.getElementById('btn-generate-i2v')?.addEventListener('click', generateVideoFromImage);
    document.getElementById('i2v-model')?.addEventListener('change', updateI2VCostLabel);
    document.getElementById('btn-upscale-video')?.addEventListener('click', upscaleVideo);
    document.getElementById('video-upscale-model')?.addEventListener('change', updateVideoUpscaleCostLabel);
    document.getElementById('video-tool-picker')?.addEventListener('click', (e) => {
      const card = e.target.closest('.img-tool-card');
      if (card && card.dataset.videoTool) switchVideoTool(card.dataset.videoTool);
    });
    setupImageUpload('i2v-source-input', 'i2v-source-preview', 'i2vSourceUrl');
    initVideoUpscaleTab();
  }

  window.RAIKO_PAGE_BINDERS = window.RAIKO_PAGE_BINDERS || {};
  window.RAIKO_PAGE_BINDERS.video = bindVideoPageEvents;
})();
