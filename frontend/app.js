/**
 * app.js — Raiko SPA logic
 * Handles: navigation, chat, image gen, video gen, tools, credits, media
 */

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
const State = {
  currentPanel: 'dashboard',
  currentModel: 'anthropic/claude-3.5-sonnet',
  currentModelName: 'Claude 3.5 Sonnet',
  chatId: generateChatId(),
  credits: 0,
  maxCredits: 20,
  models: [],
  isStreaming: false,
  isListening: false,
  attachedFiles: [],     // Array of File objects
  imageReferenceFiles: [],
  imageReferenceUrls: [],
  stylePreset: '',
  chatMode: 'chat',
  theme: localStorage.getItem('magai_theme') || 'doodle',
  currentImageTool: 'generate',
  currentVideoTool: 'text',
  editSourceUrl: null,
  i2vSourceUrl: null,
  videoUpscaleSourceUrl: null,
  upscalerSourceUrl: null,
  upscalerSourceType: null,
  currentEditModel: 'fal-ai/nano-banana-2/edit',
  currentEditTool: 'edit',
  editPanelSourceUrl: null,
  restylerSourceUrl: null,
  restylerStyles: [],
  currentRestylerStyle: null,
  mediaFilter: 'all',
  contentPacks: [],
  lastContentPayload: null,
  isGuest: true,
  // active input context: 'hero' | 'sticky'
  activeInput: 'hero',
};

let speechRecognition = null;

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', duration = 3800) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '⚡' };
  el.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration + 300);
}

/* ══════════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════════ */
function generateChatId() {
  return 'chat_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

function getPrimaryTextarea() {
  const hero = document.getElementById('chat-textarea-hero');
  const sticky = document.getElementById('chat-textarea');
  if (hero && hero.offsetParent !== null) return hero;
  if (sticky) return sticky;
  return document.getElementById('chat-textarea');
}

function applyTheme(themeName) {
  const theme = themeName === 'doodle' ? 'doodle' : 'thunder';
  State.theme = theme;
  document.body.classList.remove('theme-doodle', 'theme-thunder');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('magai_theme', theme);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function setChatMode(mode) {
  const allowed = ['chat', 'image', 'video'];
  State.chatMode = allowed.includes(mode) ? mode : 'chat';
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === State.chatMode);
  });

  const labelMap = {
    chat: 'Send Prompt',
    image: 'Generate Image',
    video: 'Generate Video',
  };
  document.querySelectorAll('.send-label').forEach(el => {
    el.textContent = labelMap[State.chatMode];
  });
}

function escapeHtml(str) {
  str = String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function markdownToHtml(md) {
  // Code blocks first
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`
  );
  // Inline code
  md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  md = md.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  md = md.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Newlines to <br>
  md = md.replace(/\n/g, '<br>');
  return md;
}

function renderGp2Showcase() {
  const grid = document.getElementById('gp2-grid');
  const rows = window.EXPLORE_SHOWCASE_GP2;
  renderExploreShowcaseGrid(grid, rows, 'GPT Image 2');
}

function renderNanoBananaProShowcase() {
  const grid = document.getElementById('nbp-grid');
  const rows = window.EXPLORE_SHOWCASE_NANO_BANANA_PRO;
  renderExploreShowcaseGrid(grid, rows, 'Nano Banana Pro');
}

function renderSeedream45Showcase() {
  const grid = document.getElementById('sd45-grid');
  const rows = window.EXPLORE_SHOWCASE_SEEDREAM_45;
  renderExploreShowcaseGrid(grid, rows, 'Seedream 4.5');
}

function syncFeaturedStripNav() {
  const track = document.getElementById('dash-featured-track');
  const prevBtn = document.getElementById('dash-featured-prev');
  const nextBtn = document.getElementById('dash-featured-next');
  const leftFade = document.getElementById('dash-featured-fade-left');
  const rightFade = document.getElementById('dash-featured-fade-right');
  if (!track || !prevBtn || !nextBtn || !leftFade || !rightFade) return;

  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  const canScroll = maxScrollLeft > 2;
  const atStart = !canScroll || track.scrollLeft <= 2;
  const atEnd = !canScroll || track.scrollLeft >= (maxScrollLeft - 2);

  prevBtn.classList.toggle('is-hidden', atStart);
  leftFade.classList.toggle('is-hidden', atStart);
  nextBtn.classList.toggle('is-hidden', atEnd);
  rightFade.classList.toggle('is-hidden', atEnd);
}

function scrollFeaturedStrip(direction) {
  const track = document.getElementById('dash-featured-track');
  if (!track) return;

  const firstCard = track.querySelector('.dash-feat-card');
  const gap = parseFloat(getComputedStyle(track).gap) || 12;
  const cardStep = firstCard ? firstCard.getBoundingClientRect().width + gap : 700;

  track.scrollBy({
    left: direction * cardStep,
    behavior: 'smooth',
  });

  setTimeout(syncFeaturedStripNav, 260);
}

function initFeaturedStripNav() {
  const featuredTrack = document.getElementById('dash-featured-track');
  const prevBtn = document.getElementById('dash-featured-prev');
  const nextBtn = document.getElementById('dash-featured-next');
  if (!featuredTrack || !prevBtn || !nextBtn) return;

  featuredTrack.addEventListener('scroll', syncFeaturedStripNav, { passive: true });
  prevBtn.addEventListener('click', () => scrollFeaturedStrip(-1));
  nextBtn.addEventListener('click', () => scrollFeaturedStrip(1));
  window.addEventListener('resize', syncFeaturedStripNav);
  window.addEventListener('load', syncFeaturedStripNav);
  requestAnimationFrame(syncFeaturedStripNav);
  setTimeout(syncFeaturedStripNav, 250);
}

function renderExploreShowcaseGrid(grid, rows, fallbackModel) {
  if (!grid || !Array.isArray(rows)) return;

  grid.innerHTML = '';

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = row.rowClass || 'gp2-row';

    (row.items || []).forEach((item) => {
      const card = document.createElement('div');
      card.className = `${item.cellClass || 'gp2-cell'} gallery-item`;
      card.dataset.src = item.src || '';
      card.dataset.prompt = item.prompt || '';
      card.dataset.res = item.res || '';
      card.dataset.model = item.model || fallbackModel || 'GPT Image 2';
      card.dataset.modelId = item.modelId || '';
      card.addEventListener('click', () => openGalleryPreview(card));

      const img = document.createElement('img');
      img.src = item.src || '';
      img.alt = '';

      const badge = document.createElement('div');
      badge.className = 'gi-hover-badge';
      badge.textContent = 'View';

      card.appendChild(img);
      card.appendChild(badge);
      rowEl.appendChild(card);
    });

    grid.appendChild(rowEl);
  });
}

/* Lightbox Utils */
window.openLightbox = function(url) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = url;
    modal.classList.remove('hidden');
  }
};
window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.getElementById('lightbox-img').src = '';
  }
};

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recog = new SR();
  recog.lang = navigator.language || 'en-US';
  recog.continuous = false;
  recog.interimResults = true;

  recog.onresult = (event) => {
    const textarea = getPrimaryTextarea();
    if (!textarea) return;
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const prefix = textarea.value.trim() ? `${textarea.value.trim()} ` : '';
    textarea.value = `${prefix}${transcript}`;
    autoResize(textarea);
    updateSendButtonsState();
  };

  recog.onstart = () => {
    State.isListening = true;
    document.querySelectorAll('.mic-btn').forEach(btn => btn.classList.add('listening'));
  };

  recog.onend = () => {
    State.isListening = false;
    document.querySelectorAll('.mic-btn').forEach(btn => btn.classList.remove('listening'));
  };

  recog.onerror = () => {
    State.isListening = false;
    document.querySelectorAll('.mic-btn').forEach(btn => btn.classList.remove('listening'));
    toast('Voice input failed. Please try again.', 'error');
  };

  return recog;
}

function toggleVoiceInput() {
  if (!speechRecognition) {
    toast('Speech recognition is not supported in this browser.', 'error');
    return;
  }
  if (State.isListening) {
    speechRecognition.stop();
  } else {
    speechRecognition.start();
  }
}

/* ══════════════════════════════════════════════════════════
   CREDITS
══════════════════════════════════════════════════════════ */
function updateCreditsUI(balance) {
  const previous = Number(State.credits || 0);
  const next = Number(balance || 0);
  State.credits = next;

  const dropVal = document.getElementById('udrop-credits-val');
  if (dropVal) animateCreditValue(dropVal, previous, next);
  if (Math.round(previous) !== Math.round(next)) showCreditSlotOverlay(previous, next);

  const fill = document.getElementById('udrop-credits-fill');
  if (fill) {
    const max = Math.max(State.maxCredits || 20, next, 20);
    fill.style.width = Math.min(100, (next / max) * 100).toFixed(1) + '%';
  }
}

function animateCreditValue(el, from, to) {
  const start = Math.round(Number.isFinite(from) ? from : to);
  const end = Math.round(Number.isFinite(to) ? to : 0);
  if (el.dataset.creditAnimating === '1') {
    cancelAnimationFrame(Number(el.dataset.creditRaf || 0));
  }
  if (start === end && el.textContent) {
    el.textContent = String(end);
    return;
  }

  const duration = 850;
  const startTime = performance.now();
  el.dataset.creditAnimating = '1';
  el.classList.add('credit-slot-rolling');

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (end - start) * eased);
    const jitter = progress < 0.88 ? Math.floor(Math.random() * 10) : 0;
    el.textContent = String(progress < 0.88 ? Math.max(0, value + jitter) : value);
    if (progress < 1) {
      el.dataset.creditRaf = String(requestAnimationFrame(tick));
    } else {
      el.textContent = String(end);
      el.dataset.creditAnimating = '0';
      el.classList.remove('credit-slot-rolling');
      el.classList.add('credit-slot-settle');
      setTimeout(() => el.classList.remove('credit-slot-settle'), 260);
    }
  };

  el.dataset.creditRaf = String(requestAnimationFrame(tick));
}

function parseCreditLikeValue(text) {
  const n = Number(String(text || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function animateCostLabelValue(el, from, to, decimals = 0) {
  if (!el) return;
  const start = Number.isFinite(from) ? from : to;
  const end = Number.isFinite(to) ? to : 0;

  if (el.dataset.costAnimating === '1') {
    cancelAnimationFrame(Number(el.dataset.costRaf || 0));
  }

  if (Math.abs(start - end) < 0.0001 && el.textContent) {
    const settle = decimals > 0 ? end.toFixed(decimals) : String(Math.round(end));
    el.textContent = `${settle}⚡`;
    el.dataset.costValue = String(end);
    return;
  }

  const duration = 700;
  const startTime = performance.now();
  el.dataset.costAnimating = '1';
  el.classList.add('credit-slot-rolling');

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;
    const jitterBase = progress < 0.86 ? (Math.random() - 0.5) : 0;
    const jitter = decimals > 0 ? jitterBase * 0.2 : jitterBase * 3.5;
    const displayRaw = progress < 0.86 ? Math.max(0, value + jitter) : value;
    const display = decimals > 0 ? displayRaw.toFixed(decimals) : String(Math.round(displayRaw));
    el.textContent = `${display}⚡`;

    if (progress < 1) {
      el.dataset.costRaf = String(requestAnimationFrame(tick));
    } else {
      const finalVal = decimals > 0 ? end.toFixed(decimals) : String(Math.round(end));
      el.textContent = `${finalVal}⚡`;
      el.dataset.costValue = String(end);
      el.dataset.costAnimating = '0';
      el.classList.remove('credit-slot-rolling');
      el.classList.add('credit-slot-settle');
      setTimeout(() => el.classList.remove('credit-slot-settle'), 220);
    }
  };

  el.dataset.costRaf = String(requestAnimationFrame(tick));
}

function setAnimatedCostLabel(elOrId, nextValue, decimals = 0) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  const prev = Number.isFinite(Number(el.dataset.costValue))
    ? Number(el.dataset.costValue)
    : parseCreditLikeValue(el.textContent);
  animateCostLabelValue(el, prev, Number(nextValue || 0), decimals);
}

function showCreditSlotOverlay(from, to) {
  let overlay = document.getElementById('credit-slot-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'credit-slot-overlay';
    overlay.className = 'credit-slot-overlay hidden';
    overlay.innerHTML = `
      <span class="credit-slot-overlay-label">CREDITS</span>
      <strong id="credit-slot-overlay-value">0</strong>
      <span class="credit-slot-overlay-delta" id="credit-slot-overlay-delta"></span>
    `;
    document.body.appendChild(overlay);
  }

  const valueEl = document.getElementById('credit-slot-overlay-value');
  const deltaEl = document.getElementById('credit-slot-overlay-delta');
  const delta = Math.round(to - from);
  if (deltaEl) {
    deltaEl.textContent = delta > 0 ? `+${delta}⚡` : `${delta}⚡`;
    deltaEl.classList.toggle('is-positive', delta > 0);
    deltaEl.classList.toggle('is-negative', delta < 0);
  }

  overlay.classList.remove('hidden', 'credit-slot-overlay-hide');
  overlay.classList.add('credit-slot-overlay-show');
  if (valueEl) animateCreditValue(valueEl, from, to);

  clearTimeout(showCreditSlotOverlay.hideTimer);
  showCreditSlotOverlay.hideTimer = setTimeout(() => {
    overlay.classList.remove('credit-slot-overlay-show');
    overlay.classList.add('credit-slot-overlay-hide');
    setTimeout(() => overlay.classList.add('hidden'), 260);
  }, 1400);
}

async function refreshCredits() {
  try {
    const data = await API.credits.balance();
    updateCreditsUI(data.balance);
    State.maxCredits = Math.max(State.maxCredits, data.balance, 20);
  } catch (e) {
    console.warn('Credits fetch failed:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   MODEL SELECTION HELPERS
══════════════════════════════════════════════════════════ */
function selectImageModel(modelId) {
  if (modelId === 'fal-ai/seedvr/upscale/image') {
    selectEditModel(modelId, true);
    switchPanel('edit');
    return;
  }
  const dropdown = document.getElementById('img-model-dropdown');
  const sel = document.getElementById('image-model');
  if (!dropdown || !sel) return;
  const item = dropdown.querySelector(`.imd-item[data-model="${modelId}"]`);
  if (!item) return;
  dropdown.querySelectorAll('.imd-item').forEach(i => i.classList.remove('active'));
  item.classList.add('active');
  const icon = document.getElementById('imt-icon');
  const name = document.getElementById('imt-name');
  const cost = document.getElementById('imt-cost');
  if (icon) icon.textContent = item.dataset.icon || '';
  if (name) name.textContent = item.querySelector('.imd-name').textContent;
  if (cost) cost.textContent = item.dataset.cost + '⚡';
  sel.value = modelId;
  sel.dispatchEvent(new Event('change'));
}

function selectVideoModel(modelId, tool = 'text') {
  switchVideoTool(tool);
  const selId = tool === 'image' ? 'i2v-model' : (tool === 'upscale' ? 'video-upscale-model' : 'video-model');
  const sel = document.getElementById(selId);
  if (sel) { sel.value = modelId; sel.dispatchEvent(new Event('change')); }
}

function openUpscaler(entryType = 'auto') {
  resetUpscaler(false);
  switchPanel('upscale');
  const subtitle = document.getElementById('upscale-subtitle');
  if (subtitle) {
    subtitle.textContent = entryType === 'video'
      ? 'Upload a video. Raiko detects it automatically and shows SeedVR video upscale settings.'
      : (entryType === 'image'
        ? 'Upload an image. Raiko detects it automatically and shows SeedVR image upscale settings.'
        : 'Upload an image or video. Raiko detects the media type automatically and shows the right SeedVR upscale settings.');
  }
}

function selectEditModel(modelId, resetWorkspace = false) {
  const dropdown = document.getElementById('edit-model-dropdown');
  if (!dropdown) return;
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
  const toolId = modelId === 'fal-ai/bria/background/remove'
    ? 'bg-remove'
    : (modelId === 'fal-ai/seedvr/upscale/image' ? 'image-upscale' : 'edit');
  setEditToolScreen(toolId, modelId);
  if (resetWorkspace) resetEditPanelWorkspace();
}

const EDIT_TOOL_SCREENS = {
  edit: {
    model: 'fal-ai/nano-banana-2/edit',
    icon: '🍌',
    name: 'NB 2 Edit',
    cost: 5,
    badge: 'IMAGE EDIT',
    title: 'EDIT IMAGE',
    subtitle: 'Upload an image, describe the change, and generate a new edited result.',
    cta: '↥ Upload image',
    button: 'Edit',
    resultTag: 'EDIT RESULT',
    hero: 'dashboard-showcase/seedream-explore/item-08/image.jpg',
    steps: ['01 Upload image', '02 Describe edit', '03 Generate result'],
  },
  'bg-remove': {
    model: 'fal-ai/bria/background/remove',
    icon: '✂',
    name: 'BG Remove',
    cost: 3,
    badge: 'BACKGROUND TOOL',
    title: 'REMOVE BACKGROUND',
    subtitle: 'Upload an image and remove the background automatically. No prompt needed.',
    cta: '↥ Upload image for BG Remove',
    button: 'Remove BG',
    resultTag: 'TRANSPARENT RESULT',
    hero: 'dashboard-showcase/gpt-image-2-explore/2/image.jpg',
    steps: ['01 Upload image', '02 AI isolates subject', '03 Download cutout'],
  },
  'image-upscale': {
    model: 'fal-ai/seedvr/upscale/image',
    icon: '⤢',
    name: 'SeedVR Image Upscale',
    cost: 8,
    badge: 'UPSCALE TOOL',
    title: 'UPSCALE IMAGE',
    subtitle: 'Upload an image and enhance it with SeedVR upscaling. No prompt needed.',
    cta: '↥ Upload image to upscale',
    button: 'Upscale',
    resultTag: 'UPSCALED RESULT',
    hero: 'dashboard-showcase/nano-banana-pro-explore/3/image.webp',
    steps: ['01 Upload image', '02 SeedVR enhances detail', '03 Save upscaled image'],
  },
};

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
  if (preview) {
    preview.src = '';
    preview.classList.add('hidden');
  }
  if (inner) inner.style.display = '';
  if (removeBtn) removeBtn.classList.add('hidden');
  if (uploadCard) uploadCard.classList.remove('has-image');
  if (resultZone) resultZone.classList.add('hidden');
  if (resultArea) resultArea.innerHTML = '';
  if (editBar) editBar.classList.add('hidden');
  if (panel) panel.classList.remove('has-source', 'has-result');
  if (prompt) prompt.value = '';
}

/* ══════════════════════════════════════════════════════════
   IMAGE RESTYLER
══════════════════════════════════════════════════════════ */
const RESTYLER_STYLE_SLUGS = [
  'anime', 'barbie', 'business_ceo', 'bw_profile_studio_portrait', 'bw_studio_portrait',
  'cartoon_style', 'chibi', 'cinematic_portrait', 'creative_gel_light_headshot', 'cyberpunk',
  'dark_angel', 'digital_camera_flash_portrait', 'executive_studio_headshot', 'ghostface_mirror',
  'golden_hour_coffee_portrait', 'gothic_style', 'hollywood_star', 'lego', 'line_to_image',
  'magazine_wall_flash_portrait', 'medieval_knight', 'minecraft', 'monochrome_drama_headshot',
  'moody_studio_portrait', 'muscler_body', 'natural_light_headshot', 'olympus_god',
  'personal_brand_headshot', 'photo_grid_pose', 'pixar', 'pokemon_trainer', 'royal_fantasy',
  'royal_fashion', 'sailor_moon', 'samurai_legends', 'simpsons_style', 'sixteen_bit_character',
  'snow_magic', 'snowy_times', 'south_park_style', 'spec_ops', 'studio_clean_headshot', 'ufc',
  'underwater_half_face_portrait', 'viking_berserker', 'winter_flake', 'winter_time'
];

const RESTYLER_MODEL_MAP = {
  nano_banana_edit: { id: 'fal-ai/nano-banana-2/edit', label: 'Nano Banana 2 Edit', cost: 5 },
  nano_banana_pro_edit: { id: 'fal-ai/nano-banana-pro/edit', label: 'Nano Banana Pro Edit', cost: 7 },
  seedream_4: { id: 'fal-ai/bytedance/seedream/v4/edit', label: 'Seedream 4 Edit', cost: 7 },
  seedream_45: { id: 'fal-ai/bytedance/seedream/v4.5/edit', label: 'Seedream 4.5 Edit', cost: 7 },
};

const RESTYLER_PREVIEW_FILES = {
  anime: ['anime_before.jpg', 'anime_after.jpg'],
  barbie: ['barbie_before.jpg', 'barbie_after.jpg'],
  business_ceo: ['business_ceo_before.jpg', 'business_ceo_after.jpg'],
  bw_profile_studio_portrait: ['bw_profile_studio_portrait_before.jpg', 'bw_profile_studio_portrait_after.jpg'],
  bw_studio_portrait: ['bw_studio_portrait_before.jpg', 'bw_studio_portrait_after.jpg'],
  cartoon_style: ['cartoon_style_before.jpg', 'cartoon_style_after.jpg'],
  chibi: ['chibi_before.jpg', 'chibi_after.jpg'],
  cinematic_portrait: ['cinematic_portrait_before.jpg', 'cinematic_portrait_after.jpg'],
  creative_gel_light_headshot: ['creative_gel_light_headshot_before.jpg', 'creative_gel_light_headshot_after.jpg'],
  cyberpunk: ['cyberpunk_before.jpg', 'cyberpunk_after.jpg'],
  dark_angel: ['dark_angel_before.jpg', 'dark_angel_after.jpg'],
  digital_camera_flash_portrait: ['digital_camera_flash_portrait_before.jpg', 'digital_camera_flash_portrait_after.jpg'],
  executive_studio_headshot: ['executive_studio_headshot_before.jpg', 'executive_studio_headshot_after.jpg'],
  ghostface_mirror: ['ghostface_mirror_before.jpg', 'ghostface_mirror_after.jpg'],
  golden_hour_coffee_portrait: ['golden_hour_coffee_portrait_before.jpg', 'golden_hour_coffee_portrait_after.jpg'],
  gothic_style: ['gothic_style_before.jpg', 'gothic_style_after.jpg'],
  hollywood_star: ['hollywood_star_before.jpg', 'hollywood_star_after.jpg'],
  lego: ['lego_before.jpg', 'lego_after.jpg'],
  line_to_image: ['line_to_image_before.jpg', 'line_to_image_after.jpg'],
  magazine_wall_flash_portrait: ['magazine_wall_flash_portrait_before.jpg', 'magazine_wall_flash_portrait_after.jpg'],
  medieval_knight: ['medieval_knight_before.jpg', 'medieval_knight_after.jpg'],
  minecraft: ['minecraft_before.jpg', 'minecraft_after.jpg'],
  monochrome_drama_headshot: ['monochrome_drama_headshot_before.jpg', 'monochrome_drama_headshot_after.jpg'],
  moody_studio_portrait: ['moody_studio_portrait_before.jpg', 'moody_studio_portrait_after.jpg'],
  muscler_body: ['muscler_body_before.jpg', 'muscler_body_after.jpg'],
  natural_light_headshot: ['natural_light_headshot_before.jpg', 'natural_light_headshot_after.jpg'],
  olympus_god: ['olympus_god_before.jpg', 'olympus_god_after.jpg'],
  personal_brand_headshot: ['personal_brand_headshot_before.jpg', 'personal_brand_headshot_after.jpg'],
  photo_grid_pose: ['photo_grid_pose_before.jpg', 'photo_grid_pose_after.jpg'],
  pixar: ['pixar_before.jpg', 'pixar_after.jpg'],
  pokemon_trainer: ['pokemon_trainer_before.jpg', 'pokemon_trainer_after.jpg'],
  royal_fantasy: ['royal_fantasy_before.jpg', 'royal_fantasy_after.jpg'],
  royal_fashion: ['royal_fashion_before.jpg', 'royal_fashion_after.jpg'],
  sailor_moon: ['sailor_moon_before.jpg', 'sailor_moon_after.jpg'],
  samurai_legends: ['samurai_legends_before.jpg', 'samurai_legends_after.jpg'],
  simpsons_style: ['simpsons_style_before.jpg', 'simpsons_style_after.jpg'],
  sixteen_bit_character: ['sixteen_bit_character_before.jpg', 'sixteen_bit_character_after.jpg'],
  snow_magic: ['snow_magic_before.jpg', 'snow_magic_after.jpg'],
  snowy_times: ['snowy_times_before.jpg', 'snowy_times_after.jpg'],
  south_park_style: ['south_park_style_before.jpg', 'south_park_style_after.jpg'],
  spec_ops: ['spec_ops_before.jpg', 'spec_ops_after.jpg'],
  studio_clean_headshot: ['studio_clean_headshot_before.jpg', 'studio_clean_headshot_after.jpg'],
  ufc: ['ufc_before.jpg', 'ufc_after.jpg'],
  underwater_half_face_portrait: ['underwater_half_face_portrait_before.jpg', 'underwater_half_face_portrait_after.jpg'],
  viking_berserker: ['viking_berserker_before.jpg', 'viking_berserker_after.jpg'],
  winter_flake: ['winter_flake_before.jpg', 'winter_flake_after.jpg'],
  winter_time: ['winter_time_before.jpg', 'winter_time_after.jpg'],
};

function restylerTitle(slug) {
  return slug.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function parseRestylerPrompt(text, slug) {
  const raw = String(text || '').trim();
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let key = 'nano_banana_edit';
  if (lines[0]?.toLowerCase().startsWith('ai_model:')) {
    key = lines.shift().split(':').slice(1).join(':').trim() || key;
  }
  const model = RESTYLER_MODEL_MAP[key] || RESTYLER_MODEL_MAP.nano_banana_edit;
  const prompt = lines.join('\n').trim() || `Restyle the uploaded portrait as ${restylerTitle(slug)} while preserving identity, facial features, pose, and composition.`;
  return { aiModelKey: key, modelId: model.id, modelLabel: model.label, cost: model.cost, prompt };
}

async function loadRestylerStyles() {
  if (State.restylerStyles.length) return State.restylerStyles;
  const styles = await Promise.all(RESTYLER_STYLE_SLUGS.map(async slug => {
    let parsed = parseRestylerPrompt('', slug);
    try {
      const res = await fetch(`image-restyler/${slug}/prompt.txt`, { cache: 'no-store' });
      if (res.ok) parsed = parseRestylerPrompt(await res.text(), slug);
    } catch {}
    return {
      slug,
      name: restylerTitle(slug),
      before: `image-restyler/${slug}/${(RESTYLER_PREVIEW_FILES[slug] || [`${slug}_before.jpg`, `${slug}_after.jpg`])[0]}`,
      after: `image-restyler/${slug}/${(RESTYLER_PREVIEW_FILES[slug] || [`${slug}_before.jpg`, `${slug}_after.jpg`])[1]}`,
      ...parsed,
    };
  }));
  State.restylerStyles = styles;
  return styles;
}

async function initRestylerPanel() {
  const grid = document.getElementById('restyler-style-grid');
  if (!grid || grid.dataset.loaded === 'true') return;
  const styles = await loadRestylerStyles();
  grid.innerHTML = styles.map(style => `
    <button type="button" class="restyler-style-card" data-style="${style.slug}">
      <div class="restyler-style-preview">
        <img src="${style.after}" alt="${style.name} style preview" loading="lazy" onerror="this.onerror=null;this.src='${style.before}'" />
      </div>
      <span class="restyler-selected-badge">Selected</span>
      <div class="restyler-style-overlay">
        <span>${style.name}</span>
        <em>Use Style →</em>
      </div>
    </button>
  `).join('');
  grid.dataset.loaded = 'true';
  selectRestylerStyle(styles[0]?.slug || 'anime');
}

function selectRestylerStyle(slug) {
  const style = State.restylerStyles.find(item => item.slug === slug) || State.restylerStyles[0];
  if (!style) return;
  State.currentRestylerStyle = style;
  document.querySelectorAll('.restyler-style-card').forEach(card => card.classList.toggle('active', card.dataset.style === style.slug));
  const name = document.getElementById('restyler-active-name');
  const model = document.getElementById('restyler-active-model');
  const cost = document.getElementById('restyler-cost-badge');
  if (name) name.textContent = style.name;
  if (model) model.textContent = `${style.modelLabel} · ${style.cost}⚡`;
  if (cost) cost.textContent = `${style.cost}⚡`;
}

async function handleRestylerUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  showUploadProgress('Uploading portrait');
  try {
    const dataUrl = await fileToDataURL(file);
    State.restylerSourceUrl = dataUrl;
    const hero = document.getElementById('restyler-hero');
    const panel = document.getElementById('panel-restyler');
    const selected = document.getElementById('restyler-selected-card');
    const sideGenerate = document.getElementById('restyler-side-generate');
    const label = document.getElementById('restyler-selected-label');
    const remove = document.getElementById('restyler-remove-btn');
    const card = document.querySelector('#panel-restyler .restyler-upload-card');
    const sidePreview = document.getElementById('restyler-sidebar-preview');
    const empty = document.getElementById('restyler-upload-empty');
    if (sidePreview) { sidePreview.src = dataUrl; sidePreview.classList.remove('hidden'); }
    empty?.classList.add('hidden');
    panel?.classList.add('has-source');
    selected?.classList.remove('hidden');
    sideGenerate?.classList.remove('hidden');
    if (label) label.textContent = file.name || 'Portrait selected';
    remove?.classList.remove('hidden');
    card?.classList.add('has-image');
  } finally {
    hideUploadProgress();
  }
}

function resetRestylerWorkspace() {
  State.restylerSourceUrl = null;
  const input = document.getElementById('restyler-source-input');
  const hero = document.getElementById('restyler-hero');
  const panel = document.getElementById('panel-restyler');
  const selected = document.getElementById('restyler-selected-card');
  const sideGenerate = document.getElementById('restyler-side-generate');
  const result = document.getElementById('restyler-result-zone');
  const area = document.getElementById('restyler-result-area');
  const remove = document.getElementById('restyler-remove-btn');
  const card = document.querySelector('#panel-restyler .restyler-upload-card');
  const sidePreview = document.getElementById('restyler-sidebar-preview');
  const empty = document.getElementById('restyler-upload-empty');
  if (input) input.value = '';
  if (sidePreview) { sidePreview.src = ''; sidePreview.classList.add('hidden'); }
  empty?.classList.remove('hidden');
  panel?.classList.remove('has-source', 'has-result');
  selected?.classList.add('hidden');
  sideGenerate?.classList.add('hidden');
  result?.classList.add('hidden');
  if (area) area.innerHTML = '';
  remove?.classList.add('hidden');
  card?.classList.remove('has-image');
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function switchPanel(panelId) {
  const panel = document.getElementById(`panel-${panelId}`);

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === panelId);
  });

  // Update panels
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${panelId}`);
  });

  State.currentPanel = panelId;
  if (panelId === 'dashboard') loadDashboardChats();
  if (panelId === 'media') loadMediaPanel();
  if (panelId === 'restyler') initRestylerPanel();
  panel?.scrollTo?.({ top: 0, behavior: 'instant' });
}

function switchImageTool(toolId) {
  State.currentImageTool = toolId === 'edit' ? 'edit' : 'generate';
  document.querySelectorAll('.img-tool-card').forEach(card => {
    if (card.dataset.imageTool !== undefined) {
      card.classList.toggle('active', card.dataset.imageTool === State.currentImageTool);
    }
  });
  ['img-panel-generate', 'img-panel-edit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === `img-panel-${State.currentImageTool}`);
  });
}

function switchVideoTool(toolId) {
  State.currentVideoTool = ['image', 'upscale'].includes(toolId) ? toolId : 'text';
  document.querySelectorAll('#video-tool-picker .img-tool-card').forEach(card => {
    card.classList.toggle('active', card.dataset.videoTool === State.currentVideoTool);
  });
  ['vid-panel-text', 'vid-panel-image', 'vid-panel-upscale'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === `vid-panel-${State.currentVideoTool}`);
  });

  // Show/hide the vup-canvas in the right area
  const vupCanvas = document.getElementById('vup-canvas');
  const videoExplainer = document.getElementById('video-explainer');
  const videoResultArea = document.getElementById('video-result-area');
  if (State.currentVideoTool === 'upscale') {
    // Show vup-canvas only if a video is already loaded
    if (State.videoUpscaleSourceUrl && vupCanvas) {
      vupCanvas.classList.remove('hidden');
      if (videoExplainer) videoExplainer.classList.add('hidden');
      if (videoResultArea) videoResultArea.classList.add('hidden');
    }
  } else {
    // Hide vup-canvas when switching to other tools
    if (vupCanvas) vupCanvas.classList.add('hidden');
    if (videoExplainer) videoExplainer.classList.remove('hidden');
    if (videoResultArea) videoResultArea.classList.remove('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   MODEL SELECTOR
══════════════════════════════════════════════════════════ */
const FALLBACK_MODELS = [
  { group: 'OpenAI', models: [
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  ]},
  { group: 'Anthropic', models: [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  ]},
  { group: 'Meta Llama', models: [
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
    { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
  ]},
  { group: 'DeepSeek', models: [
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  ]},
  { group: 'Groq (fast)', models: [
    { id: 'groq/llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Groq)' },
    { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)' },
  ]},
];

function normalizeModels(raw) {
  /**
   * Backend returns IDs like:
   *   openai provider: "gpt-4o-mini"      → need "openai/gpt-4o-mini" for ai_router
   *   groq provider:   "groq:llama-3.1-70b-versatile" → need "groq/llama-3.1-70b-versatile"
   *   openrouter:      "openrouter:anthropic/claude-3.5-sonnet" → need "anthropic/claude-3.5-sonnet"
   *   bambam:          skip (not supported by ai_router yet)
   */
  const groups = {};

  for (const m of raw) {
    if (m.is_group) continue;
    const provider = (m.provider || 'other').toLowerCase();
    if (provider === 'bambam') continue; // skip meta-models

    let routerId = m.id;
    if (provider === 'openai' && !m.id.includes('/')) {
      routerId = `openai/${m.id}`;
    } else if (provider === 'groq') {
      // groq:llama-3.1-70b-versatile  →  groq/llama-3.1-70b-versatile
      routerId = m.id.replace('groq:', 'groq/');
    } else if (provider === 'openrouter') {
      // openrouter:anthropic/claude-3.5-sonnet  →  anthropic/claude-3.5-sonnet
      routerId = m.id.replace(/^openrouter:/, '');
    } else if (provider === 'gemini') {
      // skip gemini for now (different client)
      continue;
    }

    const groupName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const displayName = m.name || m.id;

    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({ id: routerId, name: displayName });
  }

  return Object.entries(groups).map(([group, models]) => ({ group, models }));
}

function getProviderIcon(group) {
  const map = {
    'OpenAI': 'openai',
    'Anthropic': 'anthropic',
    'Meta Llama': 'meta',
    'Google': 'google',
    'GoogleGemini': 'googlegemini',
    'DeepSeek': 'deepseek',
    'Groq (fast)': 'groq'
  };
  const iconId = map[group] || 'custom';
  
  // If we don't have a specific ID, use a generic spark or text
  if (iconId === 'custom') {
    return `<div style="width:16px; height:16px; border-radius:4px; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">${group.charAt(0)}</div>`;
  }
  
  // Try loading from simple-icons CDN
  return `<img src="https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/${iconId}.svg" width="16" height="16" style="filter: brightness(0) invert(0); opacity:0.8;" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:16px; height:16px; border-radius:4px; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;\\'>${group.charAt(0)}</div>'" />`;
}

function renderModelList(query = '') {
  const list = document.getElementById('model-list');
  if (!list) return;

  const groups = State.models.length ? normalizeModels(State.models) : FALLBACK_MODELS;
  const q = query.toLowerCase();

  list.innerHTML = '';
  let total = 0;

  for (const { group, models } of groups) {
    const filtered = models.filter(m =>
      !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
    if (!filtered.length) continue;

    const label = document.createElement('div');
    label.className = 'model-group-label';
    label.textContent = group;
    list.appendChild(label);

    for (const model of filtered) {
      const btn = document.createElement('button');
      btn.className = 'model-option' + (model.id === State.currentModel ? ' selected' : '');
      const iconHtml = getProviderIcon(group);
      btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;">${iconHtml} ${model.name}</span><span class="model-provider-badge">${group.slice(0, 6)}</span>`;
      btn.addEventListener('click', () => selectModel(model.id, model.name, group));
      list.appendChild(btn);
      total++;
    }
  }

  if (!total) {
    list.innerHTML = '<div class="model-group-label">No models found</div>';
  }
}

function selectModel(id, name, group = 'OpenAI') {
  State.currentModel = id;
  State.currentModelName = name;
  State.currentModelGroup = group;
  
  const labelEl = document.getElementById('model-selector-label');
  const badgeEl = document.getElementById('chat-model-label');
  if (labelEl) {
    const iconHtml = getProviderIcon(group);
    labelEl.innerHTML = `<span style="display:flex; align-items:center; gap:8px;">${iconHtml} ${name}</span>`;
  }
  if (badgeEl) badgeEl.textContent = '';
  
  // Replace the default static icon entirely for clarity
  const defaultIcon = document.querySelector('.model-icon-dark');
  if (defaultIcon) defaultIcon.style.display = 'none';

  closeModelDropdown();
  toast(`Model: ${name}`, 'info', 2000);
}

function openModelDropdown() {
  document.getElementById('model-dropdown').classList.remove('hidden');
  document.getElementById('model-search-input').focus();
  renderModelList();
}

function closeModelDropdown() {
  document.getElementById('model-dropdown').classList.add('hidden');
}

async function loadModels() {
  try {
    const data = await API.models.list();
    State.models = data.models || [];
    renderModelList();
  } catch {
    State.models = [];
    renderModelList();
  }
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
async function loadDashboardChats() {
  const container = document.getElementById('dash-chat-list');
  if (!container) return;
  container.innerHTML = '<div class="dash-chat-loading">Loading…</div>';
  try {
    const list = await API.chat.listChats();
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="dash-empty">No chats yet. Start a conversation!</div>';
      return;
    }
    const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#3b82f6','#f59e0b','#ef4444'];
    container.innerHTML = '';
    list.slice(0, 12).forEach((chat, i) => {
      const color = COLORS[i % COLORS.length];
      const words = (chat.title || 'Chat').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/);
      const initials = words.slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'AI';
      const rawDate = chat.updated_at || chat.created_at || '';
      const dateStr = rawDate ? formatDashDate(rawDate) : '';
      const item = document.createElement('div');
      item.className = 'dash-chat-item';
      item.innerHTML = `
        <div class="dash-chat-avatar" style="background:${color}">${initials}</div>
        <div class="dash-chat-info">
          <div class="dash-chat-title">${escapeHtml(chat.title || 'New Chat')}</div>
        </div>
        ${dateStr ? `<div class="dash-chat-date">${dateStr}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        switchPanel('chat');
        switchChat(chat.id, chat.title);
      });
      container.appendChild(item);
    });
  } catch (e) {
    container.innerHTML = '<div class="dash-empty">Could not load recent chats.</div>';
  }
}

function formatDashDate(str) {
  try {
    const d = new Date(str);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

/* ══════════════════════════════════════════════════════════
   CHAT
══════════════════════════════════════════════════════════ */
async function loadChatHistory() {
  try {
    console.log('[ChatHistory] Loading...');
    const list = await API.chat.listChats();
    console.log('[ChatHistory] Got', list.length, 'chats');
    const container = document.getElementById('chat-list-items');
    if (!container) {
      console.warn('[ChatHistory] #chat-list-items not found!');
      return;
    }
    container.innerHTML = '';

  if (list.length === 0) {
      container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted);">No chats yet</div>';
      return;
    }

    list.forEach(chat => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:2px; padding:2px; border-radius:6px; cursor:default; transition:background 0.2s;';
      if (chat.id === State.chatId) wrap.style.background = 'var(--surface-hover)';
      
      const btn = document.createElement('button');
      btn.textContent = chat.title || 'New Chat';
      btn.title = chat.title || 'New Chat';
      btn.style.cssText = 'flex:1; padding:6px 8px; font-size:13px; color:var(--text-main); font-weight:500; cursor:pointer; border:none; background:transparent; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
      btn.onclick = () => switchChat(chat.id, chat.title);
      
      wrap.onmouseover = () => wrap.style.background = 'var(--surface-hover)';
      wrap.onmouseout = () => wrap.style.background = chat.id === State.chatId ? 'var(--surface-hover)' : 'transparent';
      
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '×';
      delBtn.title = 'Delete';
      delBtn.style.cssText = 'width:24px; height:24px; border:none; background:transparent; color:var(--text-muted); cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; border-radius:4px; margin-right:4px;';
      delBtn.onmouseover = () => { delBtn.style.color = '#ef4444'; delBtn.style.background = '#fee2e2'; };
      delBtn.onmouseout = () => { delBtn.style.color = 'var(--text-muted)'; delBtn.style.background = 'transparent'; };
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this chat?')) {
          try {
            console.log('Sending DELETE request for chat:', chat.id);
            const res = await API.chat.deleteChat(chat.id);
            console.log('Delete response:', res);
            
            if (State.chatId === chat.id) {
              const newChatBtn = document.getElementById('btn-new-chat-sidebar');
              if (newChatBtn) newChatBtn.click();
            }
            loadChatHistory();
          } catch (err) {
            console.error('Delete error details:', err);
            toast('Could not delete chat: ' + err.message, 'error');
          }
        }
      };

      wrap.appendChild(btn);
      wrap.appendChild(delBtn);
      container.appendChild(wrap);
    });
    console.log('[ChatHistory] Rendered', list.length, 'items');
  } catch (err) {
    console.error('[ChatHistory] Error:', err);
  }
}

async function switchChat(chatId, title) {
  State.chatId = chatId;
  switchPanel('chat');
  document.getElementById('messages-inner').innerHTML = '';
  document.getElementById('welcome-screen')?.classList.add('hidden');
  document.getElementById('chat-input-wrap')?.classList.remove('hidden');
  document.getElementById('chat-input-wrap')?.classList.add('sticky');
  
  // Update sidebar active states
  document.querySelectorAll('.chat-history-item').forEach(el => {
    el.classList.toggle('active', el.textContent === title || el.textContent === 'New Chat' && title === undefined);
  });
  
  try {
    const msgs = await API.chat.getMessages(chatId);
    msgs.forEach(m => {
      let filesData = [];
      if (m.attachments && m.attachments.length > 0) {
        filesData = m.attachments.map((att, i) => {
          const isImage = (att.mime_type || '').startsWith('image/');
          const fallbackUrl = att.data_url || (att.base64 ? `data:${att.mime_type || 'image/png'};base64,${att.base64}` : '');
          return {
            isImage,
            url: fallbackUrl,
            name: att.name || `attachment-${i}`,
            ext: (att.name || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE',
            sizeKb: att.size_kb || '?',
          };
        });
      } else if (m.images && m.images.length > 0) {
        filesData = m.images.map((img, i) => {
          const url = typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:'))
            ? img
            : `data:image/png;base64,${img}`;
          return { isImage: true, url, name: `image-${i}.png` };
        });
      }
      const bubble = appendMessage(m.role, m.content, null, filesData);
      if (m.role === 'assistant' && bubble) {
        bubble.innerHTML = typeof markdownToHtml === 'function' ? markdownToHtml(m.content) : escapeHtml(m.content);
      }
    });
    scrollToBottom();
  } catch (err) {
    toast('Error loading messages', 'error');
  }
}

function scrollToBottom() {
  const wrap = document.getElementById('messages-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function appendMessage(role, content, creditsInfo = null, filesData = null) {
  const inner = document.getElementById('messages-inner');

  // Hide welcome screen
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  const el = document.createElement('div');
  el.className = `message ${role}`;

  const avatarContent = role === 'user'
    ? (Auth.getUser()?.username || 'U').charAt(0).toUpperCase()
    : getProviderIcon(State.currentModelGroup || 'OpenAI');

  const modelLabelHTML = role === 'assistant' 
    ? `<div class="msg-model-label">${State.currentModelName}</div>` 
    : '';

  let html = `
    <div class="msg-avatar" style="${role === 'assistant' ? 'background:transparent; border:none; border-radius:0;' : ''}">${avatarContent}</div>
    <div class="msg-body">
      ${modelLabelHTML}
  `;
      
  if (role === 'user' && filesData && filesData.length > 0) {
    let filesHtml = '<div class="msg-files-display" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">';
    for (const f of filesData) {
      if (f.isImage) {
        filesHtml += `<div class="msg-file is-image" style="cursor:zoom-in; border-radius:8px; overflow:hidden; display:flex;" onclick="openLightbox('${f.url}')"><img src="${f.url}" style="width:120px; height:120px; object-fit:cover; display:block;"/></div>`;
      } else {
        filesHtml += `<div class="msg-file is-doc" style="display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border); padding:8px 12px; border-radius:8px; font-size:12px; font-weight:500;">
          <span style="font-size:24px;">${getFileEmoji(f.ext)}</span>
          <div style="display:flex; flex-direction:column; overflow:hidden;">
            <span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
            <span style="font-size:10px; color:var(--text-muted);">${f.ext} · ${f.sizeKb}KB</span>
          </div>
        </div>`;
      }
    }
    filesHtml += '</div>';
    html += filesHtml;
  }

  html += `
      <div class="msg-bubble" id="msg-${Date.now()}">${role === 'assistant' ? '' : escapeHtml(content)}</div>
      ${creditsInfo ? `<div class="msg-credits">⚡ ${creditsInfo.credits_used.toFixed(3)} used · ${creditsInfo.credits_remaining.toFixed(1)} remaining</div>` : ''}
    </div>
  `;
  el.innerHTML = html;

  if (role === 'user') {
    el.querySelector('.msg-bubble').textContent = content;
  }

  inner.appendChild(el);
  scrollToBottom();
  return el.querySelector('.msg-bubble');
}

function appendTypingIndicator() {
  const inner = document.getElementById('messages-inner');
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = 'typing-indicator';
  
  const avatarContent = getProviderIcon(State.currentModelGroup || 'OpenAI');

  el.innerHTML = `
    <div class="msg-avatar" style="background:transparent; border:none; border-radius:0;">${avatarContent}</div>
    <div class="msg-body">
      <div class="msg-model-label">${State.currentModelName}</div>
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  inner.appendChild(el);
  scrollToBottom();
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function appendMediaAssistantMessage(type, prompt, output, creditsUsed, creditsRemaining) {
  const bubble = appendMessage('assistant', '');
  if (!bubble) return;

  if (type === 'image') {
    const urls = Array.isArray(output) ? output : [output];
    const safe = urls.filter(Boolean);
    bubble.innerHTML = `Generated image for: <em>${escapeHtml(prompt)}</em>`;
    if (safe.length) {
      const grid = document.createElement('div');
      grid.className = 'msg-files-display';
      grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;';
      safe.forEach((url) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<img src="${url}" style="width:140px;height:140px;object-fit:cover;border-radius:10px;cursor:zoom-in;" />`;
        wrap.onclick = () => openLightbox(url);
        grid.appendChild(wrap);
      });
      bubble.appendChild(grid);
    }
  } else if (type === 'video') {
    const url = output;
    bubble.innerHTML = `Generated video for: <em>${escapeHtml(prompt)}</em>${url ? `<div style="margin-top:10px;"><video src="${url}" controls style="max-width:100%;border-radius:10px;"></video></div>` : ''}`;
  }

  const creditsEl = document.createElement('div');
  creditsEl.className = 'msg-credits';
  creditsEl.textContent = `⚡ ${Number(creditsUsed || 0).toFixed(3)} used · ${Number(creditsRemaining || 0).toFixed(1)} remaining`;
  bubble.parentElement.appendChild(creditsEl);
}

async function sendChatMessage(textareaId = 'chat-textarea', sendBtnId = 'chat-send-btn') {
  if (!requireAuth()) return;
  const textarea = document.getElementById(textareaId);
  const msg = textarea.value.trim();
  if (!msg && State.attachedFiles.length === 0) return;
  if (State.isStreaming) return;

  // Build display text (include file names if no text)
  const displayMsg = msg || `[Attached ${State.attachedFiles.length} file(s)]`;

  State.isStreaming = true;
  const sendBtn = document.getElementById(sendBtnId);
  if(sendBtn) sendBtn.disabled = true;
  textarea.value = '';
  autoResize(textarea);
  
  // Toggle sticky input wrap to visible, hide hero
  document.getElementById('welcome-screen')?.classList.add('hidden');
  document.getElementById('chat-input-wrap')?.classList.remove('hidden');
  document.getElementById('chat-input-wrap')?.classList.add('sticky');

  // get files data representation to show inside message bubble
  let filesToRender = [];
  let attachmentsPayload = [];
  if (State.attachedFiles.length > 0) {
    filesToRender = await Promise.all(State.attachedFiles.map(async file => {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const dataUrl = await window.fileToDataURL(file);
        attachmentsPayload.push({
          name: file.name,
          mime_type: file.type || 'image/png',
          data_url: dataUrl,
          size_kb: Math.round(file.size / 1024),
        });
        return { isImage: true, url: dataUrl, name: file.name };
      } else {
        const ext = file.name.split('.').pop().toLowerCase();
        const isTextLike = (file.type && file.type.startsWith('text/')) || ['txt', 'md', 'json', 'csv', 'py', 'js', 'ts', 'html', 'css'].includes(ext);
        let textContent = null;
        if (isTextLike) {
          try {
            textContent = (await file.text()).slice(0, 12000);
          } catch {
            textContent = null;
          }
        }
        attachmentsPayload.push({
          name: file.name,
          mime_type: file.type || 'application/octet-stream',
          text_content: textContent,
          size_kb: Math.round(file.size / 1024),
        });
        return { isImage: false, name: file.name, ext: file.name.split('.').pop().toUpperCase().slice(0, 4), sizeKb: (file.size / 1024).toFixed(0) };
      }
    }));
  }

  appendMessage('user', displayMsg, null, filesToRender);
  appendTypingIndicator();

  if (State.chatMode === 'image' || State.chatMode === 'video') {
    try {
      let res;
      if (State.chatMode === 'image') {
        const imageModel = document.getElementById('image-model')?.value || 'fal-ai/flux/schnell';
        const width = parseInt(document.getElementById('image-width')?.value || '1024', 10);
        const height = parseInt(document.getElementById('image-height')?.value || '1024', 10);
        res = await API.ai.generateImage(imageModel, displayMsg, { width, height, num_images: 1 });
      } else {
        const videoModel = document.getElementById('video-model')?.value || 'fal-ai/kling-video/v1/standard/text-to-video';
        const duration = document.getElementById('video-duration')?.value || '5';
        res = await API.ai.generateVideo(videoModel, displayMsg, duration);
      }

      removeTypingIndicator();
      appendMediaAssistantMessage(State.chatMode, displayMsg, res.output, res.credits_used, res.credits_remaining);
      updateCreditsUI(res.credits_remaining);

      try {
        await API.chat.addMessage(State.chatId, 'user', displayMsg, `chat-${State.chatMode}`, null, attachmentsPayload);
        await API.chat.addMessage(State.chatId, 'assistant', `[${State.chatMode.toUpperCase()}] ${Array.isArray(res.output) ? res.output.join(', ') : res.output}`, `chat-${State.chatMode}`, Array.isArray(res.output) ? res.output : [res.output]);
      } catch {}
    } catch (err) {
      removeTypingIndicator();
      toast(err.message || 'Generation failed', 'error');
      const bubble = appendMessage('assistant', '');
      if (bubble) bubble.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message || 'Generation failed')}</span>`;
    } finally {
      State.isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      updateSendButtonsState();
      loadChatHistory();
    }
  } else {
    let assistantBubble = null;
    let fullText = '';

    API.ai.chatStream(
      State.currentModel,
      displayMsg,
      State.chatId,
      null,
      attachmentsPayload,
      (chunk) => {
        fullText += chunk;
        removeTypingIndicator();
        if (!assistantBubble) {
          assistantBubble = appendMessage('assistant', '');
        }
        assistantBubble.innerHTML = markdownToHtml(fullText);
        scrollToBottom();
      },
      (meta) => {
        State.isStreaming = false;
        if (sendBtn) sendBtn.disabled = false;
        if (meta) {
          updateCreditsUI(meta.credits_remaining);
          if (meta.deduction_failed) {
            toast('Credit deduction failed after generation. Please retry.', 'error');
          }
          if (assistantBubble) {
            const creditsEl = document.createElement('div');
            creditsEl.className = 'msg-credits';
            creditsEl.textContent = `⚡ ${meta.credits_used.toFixed(3)} used · ${meta.credits_remaining.toFixed(1)} remaining`;
            assistantBubble.parentElement.appendChild(creditsEl);
          }
        }
        loadChatHistory();
      },
      (err) => {
        State.isStreaming = false;
        if(sendBtn) sendBtn.disabled = false;
        removeTypingIndicator();
        toast(err, 'error');
        if (assistantBubble) {
          assistantBubble.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err)}</span>`;
        }
      }
    );
  }

  // Clear attachments
  State.attachedFiles = [];
  clearFilePreviews();
}

function updateSendButtonsState() {
  const tHero = document.getElementById('chat-textarea-hero');
  const bHero = document.getElementById('chat-send-btn-hero');
  const t = document.getElementById('chat-textarea');
  const b = document.getElementById('chat-send-btn');
  const hasFiles = State.attachedFiles.length > 0;

  if (tHero && bHero) {
    bHero.disabled = (!tHero.value.trim() && !hasFiles) || State.isStreaming;
  }
  if (t && b) {
    b.disabled = (!t.value.trim() && !hasFiles) || State.isStreaming;
  }
}

/* ══════════════════════════════════════════════════════════
   IMAGE GENERATION
══════════════════════════════════════════════════════════ */
const IMAGE_COSTS = {
  'fal-ai/flux/schnell':                                  2,
  'fal-ai/flux/dev':                                      5,
  'fal-ai/flux-pro':                                      8,
  'fal-ai/flux-2-pro':                                   10,
  'fal-ai/stable-diffusion-v3-medium':                    3,
  'fal-ai/nano-banana':                                   3,
  'fal-ai/nano-banana-2':                                 4,
  'fal-ai/nano-banana-pro':                               6,
  'fal-ai/bytedance/seedream/v4/text-to-image':           5,
  'fal-ai/bytedance/seedream/v4.5/text-to-image':         6,
  'fal-ai/bytedance/seedream/v5/lite/text-to-image':      5,
  'openai/gpt-image-2':                                  10,
  'fal-ai/seedvr/upscale/image':                          8,
};

function updateImageCostLabel() {
  const model = document.getElementById('image-model').value;
  const count = parseInt(document.getElementById('image-count').value) || 1;
  const cost = (IMAGE_COSTS[model] || 3) * count;
  setAnimatedCostLabel('image-cost-label', cost);
}

const IMAGE_SIZE_PRESETS = {
  '1k': {
    '1:1': [1024, 1024],
    '4:5': [896, 1120],
    '3:4': [896, 1195],
    '2:3': [832, 1248],
    '9:16': [768, 1344],
    '5:4': [1120, 896],
    '4:3': [1195, 896],
    '3:2': [1248, 832],
    '16:9': [1344, 768],
    '21:9': [1344, 576],
  },
  '2k': {
    '1:1': [2048, 2048],
    '4:5': [1638, 2048],
    '3:4': [1536, 2048],
    '2:3': [1365, 2048],
    '9:16': [1152, 2048],
    '5:4': [2048, 1638],
    '4:3': [2048, 1536],
    '3:2': [2048, 1365],
    '16:9': [2048, 1152],
    '21:9': [2048, 878],
  },
};

const IMAGE_SETTING_LABELS = {
  quality: { standard: 'Standard', high: 'High', ultra: 'Ultra' },
  resolution: { '1k': '1K', '2k': '2K' },
  batch: { '1': '1', '2': '2', '3': '3', '4': '4' },
};

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

let uploadProgressTimer = null;

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

/* ── Generation placeholder helpers ── */
const GEN_MESSAGES = [
  ['Generating...', 'Raiko is working on it'],
  ['Processing...', 'This takes 1–3 minutes'],
  ['Almost there...', 'Applying final details'],
];

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

function showGenPlaceholder(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const panel = container.closest('.panel');
  if (panel) panel.classList.add('has-result');
  container.style.display = 'flex';

  let idx = 0;
  container.innerHTML = `
    <div class="gen-placeholder-wrap gen-placeholder-wrap--image">
      <div class="gen-frame-shell">
        <div class="gen-frame-dark">
          <div class="gen-frame-glow"></div>
          <div class="gen-frame-shine"></div>
        </div>
      </div>
      <div class="gen-placeholder-inner">
        <div class="gen-ring"></div>
        <p class="gen-placeholder-headline" id="gen-ph-headline">${GEN_MESSAGES[0][0]}</p>
        <p class="gen-placeholder-sub" id="gen-ph-sub">${GEN_MESSAGES[0][1]}</p>
      </div>
    </div>
  `;

  if (containerId === 'image-results') renderMediaDrawer(true);

  const timer = setInterval(() => {
    idx = (idx + 1) % GEN_MESSAGES.length;
    const h = document.getElementById('gen-ph-headline');
    const s = document.getElementById('gen-ph-sub');
    if (h) h.textContent = GEN_MESSAGES[idx][0];
    if (s) s.textContent = GEN_MESSAGES[idx][1];
  }, 2800);

  container._genTimer = timer;
}

function clearGenPlaceholder(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container._genTimer) { clearInterval(container._genTimer); container._genTimer = null; }
  if (containerId === 'image-results') closeMediaDrawer();
}

function resetPanelToEmpty(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.remove('has-result');
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

  const model     = document.getElementById('image-model').value;
  const count     = parseInt(document.getElementById('image-count').value) || 1;
  const width     = parseInt(document.getElementById('image-width').value) || 1024;
  const height    = parseInt(document.getElementById('image-height').value) || 1024;
  const negPrompt = document.getElementById('image-neg-prompt').value.trim();
  const quality   = document.getElementById('image-quality-select')?.value || 'standard';
  const btn       = document.getElementById('btn-generate-image');

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

/* ══════════════════════════════════════════════════════════
   VIDEO GENERATION
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   ONE CLICK CONTENT MACHINE
══════════════════════════════════════════════════════════ */
const CONTENT_PREF_KEY = 'raiko_content_machine_prefs';

function loadContentMachinePrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(CONTENT_PREF_KEY) || '{}');
    const map = {
      style: 'ocm-style',
      tone: 'ocm-tone',
      variations: 'ocm-variations',
    };
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
  if (API.contentPacks?.generate) {
    return API.contentPacks.generate(payload);
  }
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

async function generateVideo() {
  if (!requireAuth()) return;
  const prompt = document.getElementById('video-prompt').value.trim();
  if (!prompt) { toast('Please enter a prompt', 'error'); return; }

  const model    = document.getElementById('video-model').value;
  const duration = document.getElementById('video-duration').value;
  const btn      = document.getElementById('btn-generate-video');

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

  const model    = document.getElementById('i2v-model')?.value || 'fal-ai/kling-video/v1/standard/image-to-video';
  const duration = document.getElementById('i2v-duration')?.value || '5';
  const btn      = document.getElementById('btn-generate-i2v');

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

  // Wire upload button
  uploadBtn?.addEventListener('click', () => input.click());

  // Wire factor buttons
  const vupFactorWrap = document.getElementById('vup-factor-buttons');
  vupFactorWrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('.upscale-factor-btn');
    if (!btn) return;
    vupFactorWrap.querySelectorAll('.upscale-factor-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  // Handle file selection
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast('Please upload a video file', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('Video size must be 50MB or less', 'error'); return; }

    showUploadProgress('Uploading video');
    try {
      const dataUrl = await fileToDataURL(file);
      State.videoUpscaleSourceUrl = dataUrl;

      // Show preview in canvas
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove('hidden');
      }
      if (previewCard) previewCard.classList.add('has-image');
      if (removeBtn) removeBtn.classList.remove('hidden');

      // Switch sidebar to controls state
      if (uploadCard) uploadCard.classList.add('hidden');
      if (controls) controls.classList.remove('hidden');

      // Show the upscale canvas in right area
      if (canvas) canvas.classList.remove('hidden');

      // Hide explainer, hide regular result area
      const explainer = document.getElementById('video-explainer');
      if (explainer) explainer.classList.add('hidden');
      const videoResultArea = document.getElementById('video-result-area');
      if (videoResultArea) videoResultArea.classList.add('hidden');

      // Reset result zone
      if (resultZone) resultZone.classList.add('hidden');
      if (resultArea) resultArea.innerHTML = '';
    } finally {
      hideUploadProgress();
    }
  });

  // Replace button
  removeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetVideoUpscaleTab();
  });

  // Replace button in sidebar controls
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

  // Restore explainer and result area
  const explainer = document.getElementById('video-explainer');
  if (explainer) explainer.classList.remove('hidden');
  const videoResultArea = document.getElementById('video-result-area');
  if (videoResultArea) videoResultArea.classList.remove('hidden');

  // Reset factor buttons
  const vupFactorWrap = document.getElementById('vup-factor-buttons');
  if (vupFactorWrap) {
    vupFactorWrap.querySelectorAll('.upscale-factor-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  }
}

function resetUpscaler(clearFile = true) {
  State.upscalerSourceUrl = null;
  State.upscalerSourceType = null;
  const panel = document.getElementById('panel-upscale');
  const input = document.getElementById('upscale-source-input');
  const img = document.getElementById('upscale-preview-image');
  const video = document.getElementById('upscale-preview-video');
  const bar = document.getElementById('upscale-bar');
  const resultPanel = document.getElementById('upscale-result-panel');
  const resultArea = document.getElementById('upscale-result-area');
  const badge = document.getElementById('upscale-media-badge');
  const title = document.getElementById('upscale-title');
  const subtitle = document.getElementById('upscale-subtitle');
  const detected = document.getElementById('upscale-detected-type');
  const cost = document.getElementById('upscale-cost-label');
  const format = document.getElementById('upscale-output-format');
  const uploadCard = document.getElementById('upscale-upload-card');
  const heroImg = document.getElementById('upscale-hero-img');
  const uploadInner = document.getElementById('upscale-upload-inner');
  const removeBtn = document.getElementById('upscale-reset-btn');

  if (clearFile && input) input.value = '';
  if (img) { img.src = ''; img.classList.add('hidden'); }
  if (video) { video.src = ''; video.classList.add('hidden'); }
  if (heroImg) { heroImg.src = 'dashboard-showcase/nano-banana-pro-explore/3/image.webp'; }
  if (uploadInner) uploadInner.classList.remove('hidden');
  if (uploadCard) uploadCard.classList.remove('has-image');
  if (removeBtn) removeBtn.classList.add('hidden');
  if (bar) bar.classList.add('hidden');
  if (resultPanel) resultPanel.classList.add('hidden');
  if (resultArea) resultArea.innerHTML = '';
  if (badge) badge.textContent = 'IMAGE / VIDEO UPSCALE';
  if (title) title.textContent = 'UPSCALE MEDIA';
  if (subtitle) subtitle.textContent = 'Upload an image or video. Raiko detects the media type automatically and applies SeedVR upscaling.';
  if (detected) detected.textContent = 'Detected: —';
  if (cost) cost.textContent = '8⚡';
  if (format) {
    format.innerHTML = '<option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WEBP</option>';
  }
  if (panel) panel.classList.remove('has-upload');
}

function configureUpscalerForType(type) {
  const isVideo = type === 'video';
  const panel = document.getElementById('panel-upscale');
  const badge = document.getElementById('upscale-media-badge');
  const title = document.getElementById('upscale-title');
  const subtitle = document.getElementById('upscale-subtitle');
  const detected = document.getElementById('upscale-detected-type');
  const cost = document.getElementById('upscale-cost-label');
  const format = document.getElementById('upscale-output-format');
  const resultTag = document.getElementById('upscale-result-tag');
  const bar = document.getElementById('upscale-bar');
  const uploadInner = document.getElementById('upscale-upload-inner');
  const uploadCard = document.getElementById('upscale-upload-card');
  const removeBtn = document.getElementById('upscale-reset-btn');

  if (badge) badge.textContent = isVideo ? 'VIDEO UPSCALE' : 'IMAGE UPSCALE';
  if (title) title.textContent = isVideo ? 'UPSCALE VIDEO' : 'UPSCALE IMAGE';
  if (subtitle) subtitle.textContent = isVideo
    ? 'Video detected. Choose SeedVR video upscale settings and export a sharper clip.'
    : 'Image detected. Choose SeedVR image upscale settings and export a sharper image.';
  if (detected) detected.textContent = `Detected: ${isVideo ? 'Video' : 'Image'}`;
  if (cost) cost.textContent = isVideo ? '18⚡' : '8⚡';
  if (resultTag) resultTag.textContent = isVideo ? 'UPSCALED VIDEO' : 'UPSCALED IMAGE';
  if (format) {
    format.innerHTML = isVideo
      ? '<option value="X264 (.mp4)">MP4 / X264</option><option value="VP9 (.webm)">WEBM / VP9</option><option value="PRORES4444 (.mov)">MOV / ProRes 4444</option><option value="GIF (.gif)">GIF</option>'
      : '<option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WEBP</option>';
  }
  // Hide the placeholder text, show the bottom bar
  if (uploadInner) uploadInner.classList.add('hidden');
  if (uploadCard) uploadCard.classList.add('has-image');
  if (removeBtn) removeBtn.classList.remove('hidden');
  if (bar) bar.classList.remove('hidden');
  if (panel) panel.classList.add('has-upload');
}

async function handleUpscalerFile(file) {
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    toast('Please upload an image or video file', 'error');
    return;
  }
  if (isVideo && file.size > 50 * 1024 * 1024) {
    toast('Video size must be 50MB or less', 'error');
    return;
  }
  showUploadProgress(`Uploading ${isVideo ? 'video' : 'image'}`);
  try {
    const dataUrl = await fileToDataURL(file);
    State.upscalerSourceUrl = dataUrl;
    State.upscalerSourceType = isVideo ? 'video' : 'image';
    const img = document.getElementById('upscale-preview-image');
    const video = document.getElementById('upscale-preview-video');
    if (isVideo) {
      if (img) img.classList.add('hidden');
      if (video) {
        video.src = dataUrl;
        video.classList.remove('hidden');
      }
    } else {
      if (video) {
        video.src = '';
        video.classList.add('hidden');
      }
      if (img) {
        img.src = dataUrl;
        img.classList.remove('hidden');
      }
    }
    configureUpscalerForType(State.upscalerSourceType);
  } finally {
    hideUploadProgress();
  }
}

function initUpscaleFactorButtons() {
  const wrap = document.getElementById('upscale-factor-buttons');
  if (!wrap) return;

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.upscale-factor-btn');
    if (!btn) return;
    wrap.querySelectorAll('.upscale-factor-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

async function runSharedUpscaler() {
  if (!requireAuth()) return;
  if (!State.upscalerSourceUrl || !State.upscalerSourceType) {
    toast('Upload an image or video first', 'error');
    return;
  }

  const isVideo = State.upscalerSourceType === 'video';
  const factor = Number(document.querySelector('#upscale-factor-buttons .upscale-factor-btn.active')?.dataset.factor || '2');
  const format = document.getElementById('upscale-output-format')?.value || (isVideo ? 'X264 (.mp4)' : 'jpg');
  const btn = document.getElementById('btn-run-upscale');
  const status = document.getElementById('upscale-status');
  const resultPanel = document.getElementById('upscale-result-panel');
  const resultArea = document.getElementById('upscale-result-area');

  if (btn) btn.disabled = true;
  status?.classList.remove('hidden');
  // Show result zone (edit-result-zone pattern)
  if (resultPanel) resultPanel.classList.remove('hidden');
  if (resultArea) {
    resultArea.innerHTML = `
      <div class="upscale-result-placeholder" id="upscale-result-placeholder">
        <div class="upscale-result-placeholder-frame"></div>
        <div class="upscale-result-placeholder-text">Generating…</div>
      </div>
    `;
  }
  try {
    let res;
    if (isVideo) {
      res = await API.ai.generateVideo('fal-ai/seedvr/upscale/video', 'Upscale video', '5', {
        extra: {
          video_url: State.upscalerSourceUrl,
          upscale_mode: 'factor',
          upscale_factor: factor,
          target_resolution: '1080p',
          noise_scale: 0.1,
          output_format: format,
          output_quality: 'high',
          output_write_mode: 'balanced',
        },
      });
    } else {
      res = await API.ai.editImage('fal-ai/seedvr/upscale/image', '', State.upscalerSourceUrl, 0.75);
    }
    const output = Array.isArray(res.output) ? res.output[0] : res.output;
    // Source preview stays as-is; result goes into the right result zone

    const formatExt = isVideo
      ? (format.includes('webm') ? 'webm' : (format.includes('mov') ? 'mov' : (format.includes('gif') ? 'gif' : 'mp4')))
      : (format || 'jpg').toLowerCase();
    if (resultArea) {
      resultArea.innerHTML = isVideo
        ? `
            <video src="${output}" controls class="upscale-result-media"></video>
            <a href="${output}" download="raiko_upscaled_video.${formatExt}" class="upscale-download-btn">Download</a>
          `
        : `
            <img src="${output}" alt="Upscaled output" class="upscale-result-media" />
            <a href="${output}" download="raiko_upscaled_image.${formatExt}" class="upscale-download-btn">Download</a>
          `;
    }

    saveMediaItem(isVideo ? 'video' : 'image', output, isVideo ? 'Upscaled video' : 'Upscaled image', isVideo ? 'fal-ai/seedvr/upscale/video' : 'fal-ai/seedvr/upscale/image');
    updateCreditsUI(res.credits_remaining);
    toast(`${isVideo ? 'Video' : 'Image'} upscaled! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message || 'Upscale failed', 'error');
  } finally {
    if (btn) btn.disabled = false;
    status?.classList.add('hidden');
  }
}

function setupImageUpload(inputId, previewId, stateKey) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    showUploadProgress(`Uploading ${file.type.startsWith('video/') ? 'video' : 'image'}`);
    try {
      const dataUrl = await fileToDataURL(file);
      State[stateKey] = dataUrl;
      preview.src = dataUrl;
      preview.classList.remove('hidden');
    } finally {
      hideUploadProgress();
    }
  });
}

async function runEditImage() {
  if (!requireAuth()) return;
  const prompt = document.getElementById('edit-prompt').value.trim();
  if (!prompt) { toast('Enter an edit prompt', 'error'); return; }
  if (!State.editSourceUrl) { toast('Upload an image to edit', 'error'); return; }

  const strength = parseFloat(document.getElementById('edit-strength').value) || 0.75;
  const btn = document.getElementById('btn-edit-image');
  const status = document.getElementById('edit-status');
  btn.disabled = true;
  status.classList.remove('hidden');

  try {
    const res = await API.ai.editImage(null, prompt, State.editSourceUrl, strength);
    const urls = Array.isArray(res.output) ? res.output : [res.output];
    renderImageResults(urls);
    updateCreditsUI(res.credits_remaining);
    toast(`Edit done! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   EDIT PANEL
══════════════════════════════════════════════════════════ */
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

async function runImageRestyler() {
  if (!requireAuth()) return;
  if (!State.restylerSourceUrl) { toast('Upload a portrait first', 'error'); return; }
  if (!State.currentRestylerStyle) { toast('Choose a style first', 'error'); return; }
  const btn = document.getElementById('btn-run-restyler');
  const status = document.getElementById('restyler-status');
  const zone = document.getElementById('restyler-result-zone');
  const area = document.getElementById('restyler-result-area');
  if (btn) btn.disabled = true;
  status?.classList.remove('hidden');
  zone?.classList.remove('hidden');
  document.getElementById('panel-restyler')?.classList.add('has-result');
  if (area) {
    area.innerHTML = '<div class="upscale-result-placeholder"><div class="upscale-result-placeholder-frame"></div><div class="upscale-result-placeholder-text">Restyling portrait…</div></div>';
  }
  try {
    const style = State.currentRestylerStyle;
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

/* ══════════════════════════════════════════════════════════
   MY MEDIA — localStorage helpers
══════════════════════════════════════════════════════════ */
const MEDIA_KEY = 'raiko_media';

function loadMedia() {
  try { return JSON.parse(localStorage.getItem(MEDIA_KEY) || '[]'); }
  catch { return []; }
}

function saveMedia(items) {
  localStorage.setItem(MEDIA_KEY, JSON.stringify(items));
}

/* ══════════════════════════════════════════════════════════
   GALLERY PREVIEW MODAL
══════════════════════════════════════════════════════════ */
let _galleryCurrentPrompt = '';
let _galleryCurrentModelId = '';

function openModelGalleryPage(key) {
  const galleries = window.EXPLORE_MODEL_GALLERIES || {};
  const gallery = galleries[key];
  const titleEl = document.getElementById('explore-model-gallery-title');
  const gridEl = document.getElementById('explore-model-gallery-grid');
  if (!gallery || !titleEl || !gridEl) return;

  titleEl.textContent = gallery.title || 'Model Gallery';
  gridEl.innerHTML = '';

  (gallery.items || []).forEach((item, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    const shapeClass = item.shape === 'wide'
      ? 'emg-item--wide'
      : item.shape === 'tall'
        ? 'emg-item--tall'
        : 'emg-item--square';
    card.className = `emg-item gallery-item ${shapeClass} ${index % 9 === 0 && item.shape === 'wide' ? 'emg-item--feature' : ''}`.trim();
    card.dataset.src = item.src || '';
    card.dataset.prompt = item.prompt || '';
    card.dataset.res = item.res || '';
    card.dataset.model = gallery.model || 'GPT Image 2';
    card.dataset.modelId = gallery.modelId || '';
    card.addEventListener('click', () => openGalleryPreview(card));

    const img = document.createElement('img');
    img.src = item.src || '';
    img.alt = '';

    const badge = document.createElement('div');
    badge.className = 'gi-hover-badge';
    badge.textContent = 'View';

    card.appendChild(img);
    card.appendChild(badge);
    gridEl.appendChild(card);
  });

  switchPanel('explore-gallery');
}

function closeModelGalleryPage() {
  switchPanel('dashboard');
}

function openGalleryPreview(el) {
  const src    = el.dataset.src;
  const prompt = el.dataset.prompt || '';
  const res    = el.dataset.res    || '';
  const model  = el.dataset.model  || 'GPT Image 2';
  const modelId = el.dataset.modelId || '';

  _galleryCurrentPrompt = prompt;
  _galleryCurrentModelId = modelId;

  document.getElementById('gp-img').src         = src;
  document.getElementById('gp-prompt').textContent = prompt || '(no prompt)';
  document.getElementById('gp-res').textContent  = res;
  document.getElementById('gp-model').textContent = model;

  const dl = document.getElementById('gp-download-link');
  dl.href = src;
  dl.download = src.split('/').pop();

  const overlay = document.getElementById('gallery-preview-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeGalleryPreview() {
  const overlay = document.getElementById('gallery-preview-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { document.getElementById('gp-img').src = ''; }, 250);
}

function useGalleryPrompt() {
  if (!_galleryCurrentPrompt) return;
  // Close modal
  document.getElementById('gallery-preview-overlay').classList.remove('open');
  document.body.style.overflow = '';
  // Switch to image panel with the prompt pre-filled
  selectImageModel(_galleryCurrentModelId || 'openai/gpt-image-2');
  switchPanel('image');
  switchImageTool('generate');
  const ta = document.getElementById('image-prompt');
  if (ta) {
    ta.value = _galleryCurrentPrompt;
    ta.dispatchEvent(new Event('input'));
  }
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (State.currentPanel === 'explore-gallery') {
      switchPanel('dashboard');
      return;
    }

    const overlay = document.getElementById('gallery-preview-overlay');
    if (overlay && overlay.classList.contains('open')) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }
});

function saveMediaItem(type, url, prompt, model) {
  const items = loadMedia();
  items.unshift({
    id: 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type,
    url,
    prompt: prompt || '',
    model: model || '',
    createdAt: new Date().toISOString(),
  });
  saveMedia(items);
}

function deleteMediaItem(id) {
  const items = loadMedia().filter(m => m.id !== id);
  saveMedia(items);
  loadMediaPanel();
  toast('Deleted', 'info', 2000);
}

function loadMediaPanel() {
  const filter   = State.mediaFilter || 'all';
  const all      = loadMedia();
  const filtered = filter === 'all' ? all : all.filter(m => m.type === filter);

  const grid      = document.getElementById('media-grid');
  const empty     = document.getElementById('media-empty-state');
  const countBadge = document.getElementById('media-count-badge');

  if (!grid) return;

  const imgCount = all.filter(m => m.type === 'image').length;
  const vidCount = all.filter(m => m.type === 'video').length;
  if (countBadge) countBadge.textContent = `${imgCount} image${imgCount !== 1 ? 's' : ''}, ${vidCount} video${vidCount !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = filtered.map(item => {
    const date = new Date(item.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const modelShort = (item.model || '').split('/').pop() || '';
    const thumbHtml = item.type === 'video'
      ? `<video src="${escapeHtml(item.url)}" muted preload="metadata"></video>`
      : `<img src="${escapeHtml(item.url)}" alt="Generated image" loading="lazy" />`;

    return `
      <div class="media-card" data-id="${escapeHtml(item.id)}">
        <div class="media-card-thumb" data-url="${escapeHtml(item.url)}" data-type="${item.type}">
          ${thumbHtml}
          <span class="media-card-type-badge">${item.type === 'video' ? '▶ Video' : '⬛ Image'}</span>
        </div>
        <div class="media-card-body">
          <div class="media-card-prompt">${escapeHtml(item.prompt)}</div>
          <div class="media-card-meta">${date}${modelShort ? ' · ' + escapeHtml(modelShort) : ''}</div>
        </div>
        <div class="media-card-actions">
          <a href="${escapeHtml(item.url)}" target="_blank" class="media-card-action">Open</a>
          <a href="${escapeHtml(item.url)}" download class="media-card-action">Save</a>
          <button class="media-card-action delete" data-delete="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind thumb click for lightbox / video preview
  grid.querySelectorAll('.media-card-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      if (thumb.dataset.type === 'image') {
        openLightbox(thumb.dataset.url);
      }
    });
  });

  // Bind delete buttons
  grid.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMediaItem(btn.dataset.delete);
    });
  });

  renderMediaDrawer(document.getElementById('media-drawer')?.classList.contains('open'));
}

/* ══════════════════════════════════════════════════════════
   CREDITS MODAL
══════════════════════════════════════════════════════════ */
function openCreditsModal() {
  document.getElementById('credits-modal').classList.remove('hidden');
}
function closeCreditsModal() {
  document.getElementById('credits-modal').classList.add('hidden');
}

async function purchasePack(pack) {
  try {
    const res = await API.credits.purchase(pack);
    updateCreditsUI(res.new_balance);
    toast(`${res.credits_added} credits added! 🎉`, 'success');
    closeCreditsModal();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   AUTH CHECK + INIT
══════════════════════════════════════════════════════════ */
async function checkAuth() {
  if (!Auth.isLoggedIn()) {
    State.isGuest = true;
    return false;
  }
  try {
    const user = await API.auth.me();
    Auth.setUser(user);
    State.isGuest = false;
    return true;
  } catch {
    Auth.clearToken();
    Auth.clearUser();
    State.isGuest = true;
    return false;
  }
}

function requireAuth() {
  if (State.isGuest) {
    toast('Please sign in to continue.', 'info');
    setTimeout(() => { window.location.href = '/login.html'; }, 1200);
    return false;
  }
  return true;
}

function startNewChat() {
  State.chatId = generateChatId();
  clearFilePreviews();
  document.querySelectorAll('.chat-history-item').forEach(el => el.classList.remove('active'));
  document.getElementById('messages-inner').innerHTML = `
    <div class="welcome-screen" id="welcome-screen">
      <h1 class="welcome-title">Hi, <span id="welcome-name">${Auth.getUser()?.username || 'User'}</span>! How can I help?</h1>
      <div class="chat-input-hero">
        <div class="chat-input-box hero-box" id="hero-box">
          <div class="file-attachments-preview hidden" id="hero-file-preview"></div>
          <input type="file" id="hero-file-input" class="hidden" multiple />
          <textarea id="chat-textarea-hero" class="chat-textarea" placeholder="Write a message or attach files..." rows="1"></textarea>
          <div class="chat-input-toolbar">
            <div class="toolbar-left">
              <label class="toolbar-btn" for="hero-file-input" title="Attach file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </label>
              <button class="toolbar-btn mic-btn" id="mic-btn-hero" title="Voice input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            </div>
            <div class="toolbar-right">
              <span class="send-label">Send Prompt</span>
              <button class="chat-send-btn hero-send" id="chat-send-btn-hero">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          <div class="prompt-mode-switch" id="prompt-mode-hero">
            <button class="mode-btn active" data-mode="chat">Chat</button>
            <button class="mode-btn" data-mode="image">Generate Image</button>
            <button class="mode-btn" data-mode="video">Generate Video</button>
          </div>
        </div>
      </div>
      <div class="welcome-chips">
        <button class="chip" data-prompt="Summarize a YouTube video for me.">📺 Summarize Video</button>
        <button class="chip" data-prompt="Brainstorm ideas for a new blog post.">💡 Brainstorm Ideas</button>
        <button class="chip" data-prompt="Surprise me with a random interesting fact.">🤩 Surprise me</button>
      </div>
    </div>
  `;
  document.getElementById('chat-input-wrap')?.classList.add('hidden');
  document.getElementById('chat-input-wrap')?.classList.remove('sticky');
  bindChatInputEvents();
  bindChipEvents();
  bindFileInput('hero-file-input');
  bindVoiceButtons();
  bindModeButtons();
  updateSendButtonsState();
}

function setupUserUI() {
  const user = Auth.getUser();
  const sidebarUser = document.getElementById('sidebar-user');

  if (State.isGuest || !user) {
    if (sidebarUser) {
      sidebarUser.innerHTML = `<a href="/login.html" class="btn-signin-guest">Sign In</a>`;
    }
    const welcomeNameEl = document.getElementById('welcome-name');
    if (welcomeNameEl) welcomeNameEl.textContent = 'there';
    return;
  }

  const initial = (user.username || user.email || 'U').charAt(0).toUpperCase();
  const userAvatarEl = document.getElementById('user-avatar');
  const userNameEl = document.getElementById('user-name');
  const welcomeNameEl = document.getElementById('welcome-name');

  if (userAvatarEl) userAvatarEl.textContent = initial;
  if (userNameEl) userNameEl.textContent = user.username || 'User';
  if (welcomeNameEl) welcomeNameEl.textContent = user.username || 'User';

  const udropAvatar = document.getElementById('udrop-avatar');
  const udropName = document.getElementById('udrop-name');
  if (udropAvatar) udropAvatar.textContent = initial;
  if (udropName) udropName.textContent = user.username || 'User';
}

/* ══════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════ */
function bindEvents() {
  // Sidebar nav
  document.getElementById('sidebar-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn) switchPanel(btn.dataset.panel);
  });

  // User dropdown toggle
  const userTrigger = document.getElementById('navbar-user-trigger');
  const userDropdown = document.getElementById('user-dropdown');
  if (userTrigger && userDropdown) {
    userTrigger.addEventListener('click', (e) => {
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

  // Dropdown — My Media
  document.getElementById('udrop-my-media')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    userTrigger?.setAttribute('aria-expanded', 'false');
    openMediaDrawer(false);
  });

  // Dropdown — premium (opens credits modal)
  document.getElementById('udrop-premium-btn')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    userTrigger?.setAttribute('aria-expanded', 'false');
    document.getElementById('credits-modal')?.classList.remove('hidden');
  });

  // New chat (navbar button)
  document.getElementById('btn-new-chat-sidebar')?.addEventListener('click', () => {
    switchPanel('chat');
    startNewChat();
  });

  // New chat (chat panel inner button)
  document.getElementById('btn-new-chat-inner')?.addEventListener('click', () => {
    startNewChat();
  });

  // Model selector
  document.getElementById('model-selector-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('model-dropdown');
    dd.classList.contains('hidden') ? openModelDropdown() : closeModelDropdown();
  });
  document.getElementById('model-search-input')?.addEventListener('input', (e) => {
    renderModelList(e.target.value);
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('model-selector-wrap')?.contains(e.target)) {
      closeModelDropdown();
    }
  });

  bindChatInputEvents();

  // File attach inputs
  bindFileInput('chat-file-input');
  bindFileInput('hero-file-input');
  bindVoiceButtons();
  bindModeButtons();
  updateSendButtonsState();

  // Welcome chips (delegated)
  bindChipEvents();

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    Auth.clearToken();
    Auth.clearUser();
    window.location.href = '/login.html';
  });

  // Navbar mega-dropdown hover (position: fixed, JS-positioned)
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

  // Navbar mega-dropdown model items
  document.querySelectorAll('.nmd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const modelId = item.dataset.model;
      const panelId = item.dataset.panel;
      const imageTool = item.dataset.imageTool || '';
      const videoTool = item.dataset.videoTool || 'text';

      if (panelId === 'image') {
        if (modelId) selectImageModel(modelId);
        // For tool-only entries (Create/Upscale), just open image workspace for now
        switchPanel('image');
      } else if (panelId === 'video') {
        switchPanel('video');
        // Always force the requested video generator tab first
        switchVideoTool(videoTool);
        // Tool-only items can switch workspace tab without forcing a model
        if (modelId) {
          setTimeout(() => selectVideoModel(modelId, videoTool), 50);
        }
      } else if (panelId === 'edit') {
        switchPanel('edit');
        const editTool = item.dataset.editTool || '';
        if (modelId) {
          setTimeout(() => selectEditModel(modelId, true), 50);
        } else if (editTool) {
          setTimeout(() => { setEditToolScreen(editTool); resetEditPanelWorkspace(); }, 50);
        }
      } else if (panelId === 'upscale') {
        openUpscaler(item.dataset.upscaleEntry || 'auto');
      } else if (panelId === 'restyler') {
        switchPanel('restyler');
      }
    });
  });

  // Dashboard Quick Create
  document.getElementById('qc-new-chat')?.addEventListener('click', () => {
    switchPanel('chat');
    startNewChat();
  });
  document.getElementById('qc-new-chat-2')?.addEventListener('click', () => {
    switchPanel('chat');
    startNewChat();
  });
  document.getElementById('qc-new-image')?.addEventListener('click', () => {
    switchPanel('image');
  });
  document.getElementById('qc-new-video')?.addEventListener('click', () => {
    switchPanel('video');
  });

  loadContentMachinePrefs();
  initContentMachineUI();
  initRestylerPanel();
  document.getElementById('btn-generate-content-pack')?.addEventListener('click', () => generateContentPack());
  document.getElementById('btn-copy-content-json')?.addEventListener('click', copyContentPacksJson);

  document.getElementById('btn-restyler-upload')?.addEventListener('click', () => document.getElementById('restyler-source-input')?.click());
  document.getElementById('btn-restyler-replace')?.addEventListener('click', () => document.getElementById('restyler-source-input')?.click());
  document.getElementById('restyler-source-input')?.addEventListener('change', async (e) => handleRestylerUpload(e.target.files?.[0]));
  document.getElementById('restyler-remove-btn')?.addEventListener('click', (e) => { e.preventDefault(); resetRestylerWorkspace(); });
  document.getElementById('restyler-style-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.restyler-style-card');
    if (card) selectRestylerStyle(card.dataset.style);
  });
  document.getElementById('btn-run-restyler')?.addEventListener('click', runImageRestyler);

  // Image generate
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
  document.querySelectorAll('.footer-pricing-trigger').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById('btn-buy-credits')?.click());
  });

  const imageRefInput = document.getElementById('image-reference-input');
  document.getElementById('img-reference-plus-btn')?.addEventListener('click', () => imageRefInput?.click());
  imageRefInput?.addEventListener('change', async (e) => {
    await addImageReferenceFiles(e.target.files);
    e.target.value = '';
  });

  // Image size select → update hidden width/height inputs
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

  // Image style select → update State.stylePreset
  document.getElementById('image-style-select')?.addEventListener('change', (e) => {
    State.stylePreset = e.target.value;
  });

  // Image model picker dropdown
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
      // Update active state
      imgModelDropdown.querySelectorAll('.imd-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      // Update trigger label
      document.getElementById('imt-icon').textContent = item.dataset.icon || '';
      document.getElementById('imt-name').textContent = item.querySelector('.imd-name').textContent;
      document.getElementById('imt-cost').textContent = item.dataset.cost + '⚡';
      // Sync hidden select
      const sel = document.getElementById('image-model');
      if (sel) { sel.value = item.dataset.model; sel.dispatchEvent(new Event('change')); }
      // Close dropdown
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

  // Aspect ratio picker → sync hidden width/height inputs
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

  // Style chips → sync hidden select + State.stylePreset
  document.getElementById('style-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.style-chip');
    if (!chip) return;
    document.querySelectorAll('#style-chips .style-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const sel = document.getElementById('image-style-select');
    if (sel) { sel.value = chip.dataset.style; sel.dispatchEvent(new Event('change')); }
  });

  // Motion preset cards → fill video prompt
  document.getElementById('motion-presets-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.motion-preset-card');
    if (!card) return;
    document.querySelectorAll('#motion-presets-grid .motion-preset-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const promptEl = document.getElementById('video-prompt');
    if (promptEl && card.dataset.preset) promptEl.value = card.dataset.preset;
  });

  // Edit panel model picker dropdown
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

  // Edit panel image upload — hide dotted placeholder when image is loaded
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

  // Edit panel remove uploaded image (top-right X)
  document.getElementById('edit-panel-remove-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetEditPanelWorkspace();
  });

  // Edit panel generate button
  document.getElementById('btn-run-edit-panel')?.addEventListener('click', runEditPanel);

  // Video
  document.getElementById('btn-generate-video')?.addEventListener('click', generateVideo);
  document.getElementById('video-model')?.addEventListener('change', updateVideoCostLabel);
  document.getElementById('btn-generate-i2v')?.addEventListener('click', generateVideoFromImage);
  document.getElementById('i2v-model')?.addEventListener('change', updateI2VCostLabel);
  document.getElementById('btn-upscale-video')?.addEventListener('click', upscaleVideo);
  document.getElementById('video-upscale-model')?.addEventListener('change', updateVideoUpscaleCostLabel);

  const sharedUpscaleInput = document.getElementById('upscale-source-input');
  sharedUpscaleInput?.addEventListener('change', async (e) => {
    await handleUpscalerFile(e.target.files?.[0]);
  });
  // ✕ remove btn on the preview card stops propagation so it doesn't re-open file picker
  document.getElementById('upscale-reset-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetUpscaler(true);
  });
  document.getElementById('btn-run-upscale')?.addEventListener('click', runSharedUpscaler);
  initUpscaleFactorButtons();

  // Video tool picker
  document.getElementById('video-tool-picker')?.addEventListener('click', (e) => {
    const card = e.target.closest('.img-tool-card');
    if (card && card.dataset.videoTool) switchVideoTool(card.dataset.videoTool);
  });

  // I2V image upload
  setupImageUpload('i2v-source-input', 'i2v-source-preview', 'i2vSourceUrl');

  // Video upscale tab — new edit-style layout
  initVideoUpscaleTab();

  // Image tools
  document.getElementById('img-tool-picker')?.addEventListener('click', (e) => {
    const card = e.target.closest('.img-tool-card');
    if (card && card.dataset.imageTool) switchImageTool(card.dataset.imageTool);
  });

  // Media filter tabs
  document.getElementById('media-filter-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.media-filter-btn');
    if (!btn) return;
    document.querySelectorAll('.media-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.mediaFilter = btn.dataset.filter;
    loadMediaPanel();
  });

  // Tool buttons
  document.getElementById('btn-edit-image')?.addEventListener('click', runEditImage);

  // Tool image uploads
  setupImageUpload('edit-source-input', 'edit-source-preview', 'editSourceUrl');

  // Edit strength slider
  document.getElementById('edit-strength')?.addEventListener('input', (e) => {
    document.getElementById('edit-strength-val').textContent = e.target.value;
  });

  // Credits modal
  document.getElementById('btn-buy-credits')?.addEventListener('click', openCreditsModal);
  document.getElementById('credits-modal-close')?.addEventListener('click', closeCreditsModal);
  document.getElementById('credits-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'credits-modal') closeCreditsModal();
  });
  
  // Lightbox
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') closeLightbox();
  });
  document.getElementById('credit-packs')?.addEventListener('click', (e) => {
    const pack = e.target.closest('.credit-pack');
    if (pack) purchasePack(pack.dataset.pack);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      switchPanel('chat');
      startNewChat();
    }
  });
}

function bindChatInputEvents() {
  const t_hero = document.getElementById('chat-textarea-hero');
  const b_hero = document.getElementById('chat-send-btn-hero');
  if(t_hero && b_hero) {
    t_hero.addEventListener('input', () => { autoResize(t_hero); updateSendButtonsState(); });
    t_hero.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(!b_hero.disabled) sendChatMessage('chat-textarea-hero', 'chat-send-btn-hero'); } });
    b_hero.addEventListener('click', () => sendChatMessage('chat-textarea-hero', 'chat-send-btn-hero'));
  }

  const t = document.getElementById('chat-textarea');
  const b = document.getElementById('chat-send-btn');
  if(t && b) {
    t.addEventListener('input', () => { autoResize(t); updateSendButtonsState(); });
    t.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(!b.disabled) sendChatMessage('chat-textarea', 'chat-send-btn'); } });
    b.addEventListener('click', () => sendChatMessage('chat-textarea', 'chat-send-btn'));
  }
}

function bindVoiceButtons() {
  ['mic-btn-hero', 'mic-btn-sticky'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.bound === 'true') return;
    btn.addEventListener('click', toggleVoiceInput);
    btn.dataset.bound = 'true';
  });
}

function bindModeButtons() {
  document.querySelectorAll('.prompt-mode-switch .mode-btn').forEach(btn => {
    if (btn.dataset.bound === 'true') return;
    btn.addEventListener('click', () => setChatMode(btn.dataset.mode));
    btn.dataset.bound = 'true';
  });
  setChatMode(State.chatMode);
}

function bindChipEvents() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      const t_hero = document.getElementById('chat-textarea-hero');
      const t = t_hero && !document.getElementById('welcome-screen').classList.contains('hidden') ? t_hero : document.getElementById('chat-textarea');
      
      if(t) {
        t.value = prompt;
        autoResize(t);
        const btnId = t.id === 'chat-textarea-hero' ? 'chat-send-btn-hero' : 'chat-send-btn';
        document.getElementById(btnId).disabled = false;
        sendChatMessage(t.id, btnId);
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════
   FILE ATTACHMENT PREVIEWS (ChatGPT-style)
══════════════════════════════════════════════════════════ */

/**
 * Render rich file previews in the given container element.
 * Images → thumbnail, others → file chip with icon.
 */
async function renderFilePreviews(files, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!files || files.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = '';
  container.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage = file.type.startsWith('image/');
    const item = document.createElement('div');
    item.className = 'file-attachment-item' + (isImage ? ' is-image' : '');
    item.dataset.index = i;

    if (isImage) {
      const dataUrl = await fileToDataURL(file);
      item.onclick = function(e) {
        if (!e.target.closest('.file-attachment-remove')) {
          openLightbox(dataUrl);
        }
      };
      item.innerHTML = `
        <img src="${dataUrl}" alt="${file.name}" />
        <span class="file-name">${file.name}</span>
        <button class="file-attachment-remove" title="Remove">✕</button>
      `;
    } else {
      const ext = file.name.split('.').pop().toUpperCase().slice(0, 4);
      const sizeKb = (file.size / 1024).toFixed(0);
      item.innerHTML = `
        <span style="font-size:20px;flex-shrink:0;">${getFileEmoji(ext)}</span>
        <div style="display:flex;flex-direction:column;gap:1px;overflow:hidden;">
          <span class="file-name">${file.name}</span>
          <span style="font-size:10px;color:var(--text-muted);">${ext} · ${sizeKb}KB</span>
        </div>
        <button class="file-attachment-remove" title="Remove">✕</button>
      `;
    }

    item.querySelector('.file-attachment-remove').addEventListener('click', () => {
      State.attachedFiles.splice(i, 1);
      renderAllFilePreviews();
    });

    container.appendChild(item);
  }
}

function getFileEmoji(ext) {
  const map = {
    PDF: '📄', DOC: '📝', DOCX: '📝', XLS: '📊', XLSX: '📊',
    PPT: '📋', PPTX: '📋', TXT: '📃', CSV: '📊',
    ZIP: '🗜️', RAR: '🗜️', MP3: '🎵', MP4: '🎬', MOV: '🎬',
    PY: '🐍', JS: '📜', TS: '📜', HTML: '🌐', CSS: '🎨',
  };
  return map[ext] || '📎';
}

function renderAllFilePreviews() {
  // Render in both hero and sticky containers, show whichever is active
  renderFilePreviews(State.attachedFiles, 'hero-file-preview');
  renderFilePreviews(State.attachedFiles, 'sticky-file-preview');
}

function clearFilePreviews() {
  State.attachedFiles = [];
  renderAllFilePreviews();
  updateSendButtonsState();
  // Reset file inputs so same file can be re-attached
  const inputs = ['chat-file-input', 'hero-file-input'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function bindFileInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length) showUploadProgress(`Uploading ${newFiles.length} file${newFiles.length > 1 ? 's' : ''}`);
    State.attachedFiles = [...State.attachedFiles, ...newFiles];
    renderAllFilePreviews();
    updateSendButtonsState();
    if (newFiles.length) hideUploadProgress();
    e.target.value = ''; // reset so same file triggers change again
  });
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
async function init() {
  speechRecognition = initSpeechRecognition();
  applyTheme('thunder');
  setChatMode('chat');
  renderGp2Showcase();
  renderNanoBananaProShowcase();
  renderSeedream45Showcase();

  initFeaturedStripNav();

  const authed = await checkAuth();

  // Always show app (guest or logged in)
  document.getElementById('app').classList.remove('hidden');
  setupUserUI();
  bindEvents();

  if (authed) {
    await Promise.all([
      loadModels(),
      refreshCredits(),
      loadChatHistory(),
      loadDashboardChats(),
    ]);
    selectModel(State.currentModel, State.currentModelName);
    setInterval(refreshCredits, 60000);
  } else {
    loadModels().catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
