/**
 * app.js — MagAI SPA logic
 * Handles: navigation, chat, image gen, video gen, tools, credits
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
  attachedFiles: [],     // Array of File objects
  stylePreset: '',
  currentTool: 'face-swap',
  // file URLs for tools
  faceSourceUrl: null,
  faceTargetUrl: null,
  editSourceUrl: null,
  styleSourceUrl: null,
  // active input context: 'hero' | 'sticky'
  activeInput: 'hero',
};

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

/* ══════════════════════════════════════════════════════════
   CREDITS
══════════════════════════════════════════════════════════ */
function updateCreditsUI(balance) {
  State.credits = balance;
  const miniBal = document.getElementById('credits-balance-mini');
  if (miniBal) miniBal.textContent = balance.toFixed(0);
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
            toast('Sohbet silinemedi: ' + err.message, 'error');
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
      if (m.images && m.images.length > 0) {
        filesData = m.images.map((b64, i) => ({ isImage: true, url: `data:image/png;base64,${b64}`, name: `image-${i}.png` }));
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

async function sendChatMessage(textareaId = 'chat-textarea', sendBtnId = 'chat-send-btn') {
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
  if (State.attachedFiles.length > 0) {
    filesToRender = await Promise.all(State.attachedFiles.map(async file => {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        return { isImage: true, url: await window.fileToDataURL(file), name: file.name };
      } else {
        return { isImage: false, name: file.name, ext: file.name.split('.').pop().toUpperCase().slice(0, 4), sizeKb: (file.size / 1024).toFixed(0) };
      }
    }));
  }

  appendMessage('user', displayMsg, null, filesToRender);
  appendTypingIndicator();

  let assistantBubble = null;
  let fullText = '';

  API.ai.chatStream(
    State.currentModel,
    displayMsg,
    State.chatId,
    null,
    // onChunk
    (chunk) => {
      fullText += chunk;
      removeTypingIndicator();
      if (!assistantBubble) {
        assistantBubble = appendMessage('assistant', '');
      }
      assistantBubble.innerHTML = markdownToHtml(fullText);
      scrollToBottom();
    },
    // onDone
    (meta) => {
      State.isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      if (meta) {
        updateCreditsUI(meta.credits_remaining);
        if (assistantBubble) {
          const creditsEl = document.createElement('div');
          creditsEl.className = 'msg-credits';
          creditsEl.textContent = `⚡ ${meta.credits_used.toFixed(3)} used · ${meta.credits_remaining.toFixed(1)} remaining`;
          assistantBubble.parentElement.appendChild(creditsEl);
        }
      }
      loadChatHistory(); // refresh the history list
    },
    // onError
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

  // Clear attachments
  State.attachedFiles = [];
  clearFilePreviews();
}

/* ══════════════════════════════════════════════════════════
   IMAGE GENERATION
══════════════════════════════════════════════════════════ */
const IMAGE_COSTS = {
  'fal-ai/flux/schnell': 2,
  'fal-ai/flux/dev': 5,
  'fal-ai/flux-pro': 8,
  'fal-ai/stable-diffusion-v3-medium': 3,
};

function updateImageCostLabel() {
  const model = document.getElementById('image-model').value;
  const count = parseInt(document.getElementById('image-count').value) || 1;
  const cost = (IMAGE_COSTS[model] || 3) * count;
  document.getElementById('image-cost-label').textContent = `${cost}⚡`;
}

function renderImageResults(urls) {
  const container = document.getElementById('image-results');
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
        <a class="result-action-btn" href="${url}" download="magai_image.png">Download</a>
      </div>
    `;
    grid.appendChild(wrap);
  }

  container.appendChild(grid);
}

async function generateImage() {
  const prompt = document.getElementById('image-prompt').value.trim();
  if (!prompt) { toast('Please enter a prompt', 'error'); return; }

  const model   = document.getElementById('image-model').value;
  const count   = parseInt(document.getElementById('image-count').value) || 1;
  const width   = parseInt(document.getElementById('image-width').value) || 1024;
  const height  = parseInt(document.getElementById('image-height').value) || 1024;
  const negPrompt = document.getElementById('image-neg-prompt').value.trim();

  const btn = document.getElementById('btn-generate-image');
  const status = document.getElementById('image-status');
  const statusText = document.getElementById('image-status-text');

  btn.disabled = true;
  status.classList.remove('hidden');
  statusText.textContent = `Generating ${count} image${count > 1 ? 's' : ''}…`;

  const fullPrompt = State.stylePreset ? `${prompt}, ${State.stylePreset}` : prompt;

  try {
    const res = await API.ai.generateImage(model, fullPrompt, {
      negative_prompt: negPrompt,
      width, height,
      num_images: count,
    });

    const urls = Array.isArray(res.output) ? res.output : [res.output];
    renderImageResults(urls);
    updateCreditsUI(res.credits_remaining);
    toast(`Generated ${urls.length} image${urls.length > 1 ? 's' : ''}! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message || 'Generation failed', 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   VIDEO GENERATION
══════════════════════════════════════════════════════════ */
const VIDEO_COSTS = {
  'fal-ai/kling-video/v1/standard/text-to-video': 12,
  'fal-ai/kling-video/v1/pro/text-to-video': 20,
  'fal-ai/stable-video': 10,
};

function updateVideoCostLabel() {
  const model = document.getElementById('video-model').value;
  const cost = VIDEO_COSTS[model] || 12;
  document.getElementById('video-cost-label').textContent = `${cost}⚡`;
}

async function generateVideo() {
  const prompt = document.getElementById('video-prompt').value.trim();
  if (!prompt) { toast('Please enter a prompt', 'error'); return; }

  const model    = document.getElementById('video-model').value;
  const duration = document.getElementById('video-duration').value;

  const btn = document.getElementById('btn-generate-video');
  const status = document.getElementById('video-status');
  const statusText = document.getElementById('video-status-text');
  const resultArea = document.getElementById('video-result-area');

  btn.disabled = true;
  status.classList.remove('hidden');
  statusText.textContent = 'Submitting to fal.ai queue…';

  try {
    statusText.textContent = 'Generating video (1–3 min)…';
    const res = await API.ai.generateVideo(model, prompt, duration);
    const url = res.output;

    resultArea.innerHTML = `
      <video class="result-video" src="${url}" controls autoplay loop></video>
      <div style="margin-top:12px; display:flex; gap:8px; justify-content:center;">
        <a href="${url}" target="_blank" class="result-action-btn" style="background:var(--accent); color:white; padding:8px 18px; border-radius:var(--r-lg); text-decoration:none; font-weight:600;">Open</a>
        <a href="${url}" download="magai_video.mp4" class="result-action-btn" style="background:var(--surface-2); color:var(--text-1); padding:8px 18px; border-radius:var(--r-lg); text-decoration:none; font-weight:600; border:1px solid var(--border);">Download</a>
      </div>
    `;

    updateCreditsUI(res.credits_remaining);
    toast(`Video ready! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message || 'Video generation failed', 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   TOOLS
══════════════════════════════════════════════════════════ */
function switchTool(toolId) {
  State.currentTool = toolId;
  document.querySelectorAll('.tool-card').forEach(c => {
    c.classList.toggle('active-tool', c.dataset.tool === toolId);
  });
  document.querySelectorAll('.tool-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tool-${toolId}`);
    p.classList.toggle('hidden', p.id !== `tool-${toolId}`);
  });
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

async function runFaceSwap() {
  if (!State.faceSourceUrl || !State.faceTargetUrl) {
    toast('Upload both source and target images', 'error'); return;
  }
  const btn = document.getElementById('btn-face-swap');
  const status = document.getElementById('face-swap-status');
  btn.disabled = true;
  status.classList.remove('hidden');

  try {
    const res = await API.ai.faceSwap(State.faceSourceUrl, State.faceTargetUrl);
    const url = res.output;
    document.getElementById('face-swap-output').innerHTML =
      `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
    updateCreditsUI(res.credits_remaining);
    toast(`Face swap done! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
}

async function runEditImage() {
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
    document.getElementById('edit-output').innerHTML =
      `<img src="${urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`;
    updateCreditsUI(res.credits_remaining);
    toast(`Edit done! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
}

async function runStyleTransfer() {
  const prompt = document.getElementById('style-prompt').value.trim();
  if (!prompt) { toast('Enter a style prompt', 'error'); return; }
  if (!State.styleSourceUrl) { toast('Upload a photo', 'error'); return; }

  const btn = document.getElementById('btn-style-transfer');
  const status = document.getElementById('style-status');
  btn.disabled = true;
  status.classList.remove('hidden');

  try {
    const res = await API.ai.editImage(null, prompt, State.styleSourceUrl, 0.85);
    const urls = Array.isArray(res.output) ? res.output : [res.output];
    document.getElementById('style-output').innerHTML =
      `<img src="${urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`;
    updateCreditsUI(res.credits_remaining);
    toast(`Style applied! ⚡ ${res.credits_used} used`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    status.classList.add('hidden');
  }
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
    window.location.href = '/login.html';
    return false;
  }
  try {
    const user = await API.auth.me();
    Auth.setUser(user);
    return true;
  } catch {
    Auth.clearToken();
    Auth.clearUser();
    window.location.href = '/login.html';
    return false;
  }
}

function setupUserUI() {
  const user = Auth.getUser();
  if (!user) return;
  const initial = (user.username || user.email || 'U').charAt(0).toUpperCase();
  const userNameEl = document.getElementById('user-name');
  const welcomeNameEl = document.getElementById('welcome-name');
  
  if(userNameEl) userNameEl.textContent = user.username || 'User';
  if(welcomeNameEl) welcomeNameEl.textContent = user.username || 'User';
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

  // New chat
  document.getElementById('btn-new-chat-sidebar')?.addEventListener('click', () => {
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
            <textarea id="chat-textarea-hero" class="chat-textarea" placeholder="Write a message or attach files\u2026" rows="1"></textarea>
            <div class="chat-input-toolbar">
              <div class="toolbar-left">
                <label class="toolbar-btn" for="hero-file-input" title="Attach file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </label>
              </div>
              <div class="toolbar-right">
                <span class="send-label">Send Prompt</span>
                <button class="chat-send-btn hero-send" id="chat-send-btn-hero">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
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

  // Welcome chips (delegated)
  bindChipEvents();

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    Auth.clearToken();
    Auth.clearUser();
    window.location.href = '/login.html';
  });

  // Dashboard Quick Create
  document.getElementById('qc-new-chat')?.addEventListener('click', () => {
    switchPanel('chat');
    document.getElementById('btn-new-chat-sidebar')?.click();
  });
  document.getElementById('qc-new-image')?.addEventListener('click', () => {
    switchPanel('image');
  });
  document.getElementById('qc-new-video')?.addEventListener('click', () => {
    switchPanel('video');
  });

  // Image Tool Picker — switch sidebar panels
  document.getElementById('img-tool-picker')?.addEventListener('click', (e) => {
    const card = e.target.closest('.img-tool-card');
    if (!card) return;
    const tool = card.dataset.tool;
    const isActive = card.classList.contains('active');

    document.querySelectorAll('#img-tool-picker .img-tool-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('#panel-image .img-sidebar-panel').forEach(p => p.classList.remove('active'));

    if (isActive) {
      document.getElementById('img-panel-generate')?.classList.add('active');
    } else {
      card.classList.add('active');
      document.getElementById(`img-panel-${tool}`)?.classList.add('active');
    }
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

  // Style presets
  document.getElementById('style-presets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.style-chip');
    if (!chip) return;
    document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    State.stylePreset = chip.dataset.style || '';
  });

  // Video
  document.getElementById('btn-generate-video')?.addEventListener('click', generateVideo);
  document.getElementById('video-model')?.addEventListener('change', updateVideoCostLabel);

  // Tools
  document.getElementById('tools-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.tool-card');
    if (card) switchTool(card.dataset.tool);
  });

  // Tool buttons
  document.getElementById('btn-face-swap')?.addEventListener('click', runFaceSwap);
  document.getElementById('btn-edit-image')?.addEventListener('click', runEditImage);
  document.getElementById('btn-style-transfer')?.addEventListener('click', runStyleTransfer);

  // Tool image uploads
  setupImageUpload('face-source-input', 'face-source-preview', 'faceSourceUrl');
  setupImageUpload('face-target-input', 'face-target-preview', 'faceTargetUrl');
  setupImageUpload('edit-source-input', 'edit-source-preview', 'editSourceUrl');
  setupImageUpload('style-source-input', 'style-source-preview', 'styleSourceUrl');

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
}

function bindChatInputEvents() {
  const t_hero = document.getElementById('chat-textarea-hero');
  const b_hero = document.getElementById('chat-send-btn-hero');
  if(t_hero && b_hero) {
    t_hero.addEventListener('input', () => { autoResize(t_hero); b_hero.disabled = !t_hero.value.trim() || State.isStreaming; });
    t_hero.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(!b_hero.disabled) sendChatMessage('chat-textarea-hero', 'chat-send-btn-hero'); } });
    b_hero.addEventListener('click', () => sendChatMessage('chat-textarea-hero', 'chat-send-btn-hero'));
  }

  const t = document.getElementById('chat-textarea');
  const b = document.getElementById('chat-send-btn');
  if(t && b) {
    t.addEventListener('input', () => { autoResize(t); b.disabled = !t.value.trim() || State.isStreaming; });
    t.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(!b.disabled) sendChatMessage('chat-textarea', 'chat-send-btn'); } });
    b.addEventListener('click', () => sendChatMessage('chat-textarea', 'chat-send-btn'));
  }
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
    e.target.value = ''; // reset so same file triggers change again
  });
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
async function init() {
  const authed = await checkAuth();
  if (!authed) return;

  // Show app
  document.getElementById('app').classList.remove('hidden');

  // Setup UI
  setupUserUI();
  bindEvents();

  // Load data
  await Promise.all([
    loadModels(),
    refreshCredits(),
    loadChatHistory(),
    loadDashboardChats(),
  ]);

  // Set default model label
  selectModel(State.currentModel, State.currentModelName);

  // Refresh credits every 60s
  setInterval(refreshCredits, 60000);
}

document.addEventListener('DOMContentLoaded', init);
