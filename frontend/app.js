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
  stylePreset: '',
  chatMode: 'chat',
  theme: localStorage.getItem('magai_theme') || 'doodle',
  currentImageTool: 'generate',
  currentVideoTool: 'text',
  editSourceUrl: null,
  i2vSourceUrl: null,
  currentEditModel: 'fal-ai/nano-banana-2/edit',
  editPanelSourceUrl: null,
  mediaFilter: 'all',
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
  State.credits = balance;

  const dropVal = document.getElementById('udrop-credits-val');
  if (dropVal) dropVal.textContent = balance.toFixed(0);

  const fill = document.getElementById('udrop-credits-fill');
  if (fill) {
    const max = Math.max(State.maxCredits || 20, balance, 20);
    fill.style.width = Math.min(100, (balance / max) * 100).toFixed(1) + '%';
  }
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
  const selId = tool === 'image' ? 'i2v-model' : 'video-model';
  const sel = document.getElementById(selId);
  if (sel) { sel.value = modelId; sel.dispatchEvent(new Event('change')); }
}

function selectEditModel(modelId) {
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
  const promptSection = document.getElementById('edit-panel-prompt-section');
  if (promptSection) promptSection.style.display = isBgRemove ? 'none' : '';
  const costBadge = document.getElementById('edit-panel-cost-badge');
  if (costBadge) costBadge.textContent = (item.dataset.cost || '5') + '⚡';
  dropdown.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function switchPanel(panelId) {
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
  State.currentVideoTool = toolId === 'image' ? 'image' : 'text';
  document.querySelectorAll('#video-tool-picker .img-tool-card').forEach(card => {
    card.classList.toggle('active', card.dataset.videoTool === State.currentVideoTool);
  });
  ['vid-panel-text', 'vid-panel-image'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === `vid-panel-${State.currentVideoTool}`);
  });
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
      container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted);">Henüz sohbet yok</div>';
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
        if (confirm('Bu sohbeti silmek istediğinize emin misiniz?')) {
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
            console.error('Silme hatası detaylı:', err);
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
};

function updateImageCostLabel() {
  const model = document.getElementById('image-model').value;
  const count = parseInt(document.getElementById('image-count').value) || 1;
  const cost = (IMAGE_COSTS[model] || 3) * count;
  document.getElementById('image-cost-label').textContent = `${cost}⚡`;
}

/* ── Generation placeholder helpers ── */
const GEN_MESSAGES = [
  ['Generating...', 'Raiko is working on it'],
  ['Processing...', 'This takes 1–3 minutes'],
  ['Almost there...', 'Applying final details'],
];

function showGenPlaceholder(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const panel = container.closest('.panel');
  if (panel) panel.classList.add('has-result');
  container.style.display = 'flex';

  let idx = 0;
  container.innerHTML = `
    <div class="gen-placeholder-wrap">
      <div class="gen-placeholder-inner">
        <div class="gen-ring"></div>
        <p class="gen-placeholder-headline" id="gen-ph-headline">${GEN_MESSAGES[0][0]}</p>
        <p class="gen-placeholder-sub" id="gen-ph-sub">${GEN_MESSAGES[0][1]}</p>
      </div>
    </div>
  `;

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
  grid.className = 'result-grid';

  for (const url of urls) {
    const wrap = document.createElement('div');
    wrap.className = 'result-img-wrap';
    wrap.innerHTML = `
      <img src="${url}" alt="Generated image" loading="lazy" />
      <div class="result-img-actions">
        <button class="result-action-btn" onclick="window.open('${url}', '_blank')">Open</button>
        <a class="result-action-btn" href="${url}" download="raiko_image.png">Download</a>
      </div>
    `;
    grid.appendChild(wrap);
  }

  container.appendChild(grid);
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
  const btn       = document.getElementById('btn-generate-image');

  btn.disabled = true;
  showGenPlaceholder('image-results');

  const fullPrompt = State.stylePreset ? `${prompt}, ${State.stylePreset}` : prompt;

  try {
    const res = await API.ai.generateImage(model, fullPrompt, {
      negative_prompt: negPrompt,
      width, height,
      num_images: count,
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
};

function updateVideoCostLabel() {
  const model = document.getElementById('video-model').value;
  const cost = VIDEO_COSTS[model] || 12;
  document.getElementById('video-cost-label').textContent = `${cost}⚡`;
}

function updateI2VCostLabel() {
  const model = document.getElementById('i2v-model')?.value;
  const cost = VIDEO_COSTS[model] || 15;
  const lbl = document.getElementById('i2v-cost-label');
  if (lbl) lbl.textContent = `${cost}⚡`;
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

function setupImageUpload(inputId, previewId, stateKey) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const dataUrl = await fileToDataURL(file);
    State[stateKey] = dataUrl;
    preview.src = dataUrl;
    preview.classList.remove('hidden');
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
  const prompt = isBgRemove ? '' : (document.getElementById('edit-panel-prompt')?.value.trim() || '');
  if (!isBgRemove && !prompt) { toast('Enter an edit prompt', 'error'); return; }

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
    const label = isBgRemove ? 'Background removed' : prompt;
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
  if (!container) return;
  container.innerHTML = '';
  if (zone) zone.classList.remove('hidden');

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
    switchPanel('media');
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
      const videoTool = item.dataset.videoTool || 'text';
      if (panelId === 'image') {
        selectImageModel(modelId);
        switchPanel('image');
      } else if (panelId === 'video') {
        switchPanel('video');
        setTimeout(() => selectVideoModel(modelId, videoTool), 50);
      } else if (panelId === 'edit') {
        switchPanel('edit');
        setTimeout(() => selectEditModel(modelId), 50);
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

  // Image generate
  document.getElementById('btn-generate-image')?.addEventListener('click', generateImage);
  document.getElementById('image-model')?.addEventListener('change', updateImageCostLabel);
  document.getElementById('image-count')?.addEventListener('change', updateImageCostLabel);

  // Image size select → update hidden width/height inputs
  document.getElementById('image-size-select')?.addEventListener('change', (e) => {
    const parts = e.target.value.split('x');
    const w = parseInt(parts[0]) || 1024;
    const h = parseInt(parts[1]) || 1024;
    const wEl = document.getElementById('image-width');
    const hEl = document.getElementById('image-height');
    if (wEl) wEl.value = w;
    if (hEl) hEl.value = h;
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
    if (inner) inner.style.display = 'none';
    if (removeBtn) removeBtn.classList.remove('hidden');
    if (uploadCard) uploadCard.classList.add('has-image');
  });

  // Edit panel remove uploaded image (top-right X)
  document.getElementById('edit-panel-remove-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    State.editPanelSourceUrl = null;

    const input = document.getElementById('edit-panel-source-input');
    const preview = document.getElementById('edit-panel-source-preview');
    const inner = document.getElementById('edit-upload-inner');
    const removeBtn = document.getElementById('edit-panel-remove-btn');
    const uploadCard = document.querySelector('.edit-upload-card');
    const resultZone = document.getElementById('edit-result-zone');
    const resultArea = document.getElementById('edit-result-area');

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
  });

  // Edit panel generate button
  document.getElementById('btn-run-edit-panel')?.addEventListener('click', runEditPanel);

  // Video
  document.getElementById('btn-generate-video')?.addEventListener('click', generateVideo);
  document.getElementById('video-model')?.addEventListener('change', updateVideoCostLabel);
  document.getElementById('btn-generate-i2v')?.addEventListener('click', generateVideoFromImage);
  document.getElementById('i2v-model')?.addEventListener('change', updateI2VCostLabel);

  // Video tool picker
  document.getElementById('video-tool-picker')?.addEventListener('click', (e) => {
    const card = e.target.closest('.img-tool-card');
    if (card && card.dataset.videoTool) switchVideoTool(card.dataset.videoTool);
  });

  // I2V image upload
  setupImageUpload('i2v-source-input', 'i2v-source-preview', 'i2vSourceUrl');

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
    State.attachedFiles = [...State.attachedFiles, ...newFiles];
    renderAllFilePreviews();
    updateSendButtonsState();
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
