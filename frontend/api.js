/**
 * api.js — Raiko backend API wrapper
 * All fetch calls go through these helpers.
 */

const BASE_URL = '';  // Same-origin; FastAPI serves frontend

// ── Token helpers ─────────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('magai_token'),
  setToken: (t) => localStorage.setItem('magai_token', t),
  clearToken: () => localStorage.removeItem('magai_token'),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('magai_user') || 'null'); }
    catch { return null; }
  },
  setUser: (u) => localStorage.setItem('magai_user', JSON.stringify(u)),
  clearUser: () => localStorage.removeItem('magai_user'),
  isLoggedIn: () => !!localStorage.getItem('magai_token'),
};

// ── Base fetch ────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE_URL + path, { ...options, headers });

  if (res.status === 401) {
    Auth.clearToken();
    Auth.clearUser();
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const json = await res.json(); detail = json.detail || detail; } catch {}
    throw new Error(detail);
  }

  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────
const API = {
  auth: {
    signup: (email, username, password) =>
      apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      }),

    login: (email, password) =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    me: () => apiFetch('/auth/me'),
    verify: () => apiFetch('/auth/verify', { method: 'POST' }),
  },

  // ── Models ──────────────────────────────────────────────────────────────
  models: {
    list: () => apiFetch('/models'),
  },

  // ── Credits ─────────────────────────────────────────────────────────────
  credits: {
    balance: () => apiFetch('/credits/balance'),
    transactions: (limit = 50) => apiFetch(`/credits/transactions?limit=${limit}`),
    packs: () => apiFetch('/credits/packs'),
    purchase: (pack) =>
      apiFetch('/credits/purchase', { method: 'POST', body: JSON.stringify({ pack }) }),
    add: (amount, description = 'Manual top-up') =>
      apiFetch('/credits/add', { method: 'POST', body: JSON.stringify({ amount, description }) }),
  },

  // ── AI Generate ──────────────────────────────────────────────────────────
  ai: {
    /**
     * Chat — returns a ReadableStream (text/plain).
     * The last line will be: \n\n__CREDITS__{"credits_used":..., "credits_remaining":...}
     */
    chatStream: async (model, prompt, chatId, systemPrompt, attachments, onChunk, onDone, onError) => {
      const token = Auth.getToken();
      const body = JSON.stringify({
        type: 'chat',
        model,
        prompt,
        chat_id: chatId,
        system_prompt: systemPrompt || null,
        attachments: attachments || [],
      });

      try {
        const res = await fetch(BASE_URL + '/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
        });

        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); detail = j.detail || detail; } catch {}
          onError(detail);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Check for credits metadata at end
          const creditsMarker = '__CREDITS__';
          const markerIdx = buffer.indexOf(creditsMarker);
          if (markerIdx !== -1) {
            const textPart = buffer.slice(0, markerIdx).replace(/\n\n$/, '');
            const metaPart = buffer.slice(markerIdx + creditsMarker.length);
            if (textPart) onChunk(textPart);
            try {
              const meta = JSON.parse(metaPart);
              onDone(meta);
            } catch { onDone(null); }
            return;
          }

          onChunk(buffer);
          buffer = '';
        }

        onDone(null);
      } catch (err) {
        onError(err.message || 'Network error');
      }
    },

    /**
     * Image generation — POST /ai/generate with type=image
     */
    generateImage: (model, prompt, options = {}) =>
      apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'image',
          model,
          prompt,
          negative_prompt: options.negative_prompt || '',
          width: options.width || 1024,
          height: options.height || 1024,
          num_images: options.num_images || 1,
          options: options.extra || {},
        }),
      }),

    /**
     * Video generation
     */
    generateVideo: (model, prompt, duration = '5') =>
      apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ type: 'video', model, prompt, duration }),
      }),

    /**
     * Image edit (img2img)
     */
    editImage: (model, prompt, imageUrl, strength = 0.75) =>
      apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'edit',
          model: model || 'fal-ai/flux/dev/image-to-image',
          prompt,
          image_url: imageUrl,
          strength,
        }),
      }),

    /**
     * Image to video generation
     */
    generateVideoFromImage: (model, prompt, imageUrl, duration = '5') =>
      apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'image_to_video',
          model: model || 'fal-ai/kling-video/v1/standard/image-to-video',
          prompt,
          image_url: imageUrl,
          duration,
        }),
      }),

  },

  // ── Legacy chat (backward-compat) ────────────────────────────────────────
  chat: {
    streamLegacy: async (message, model, chatId, files, onChunk, onDone, onError) => {
      const token = Auth.getToken();
      const formData = new FormData();
      formData.append('message', message);
      formData.append('model', model || 'gpt-4o-mini');
      formData.append('chat_id', chatId || 'default');

      if (files && files.length) {
        for (const f of files) formData.append('files', f);
      }

      try {
        const res = await fetch(BASE_URL + '/chat/stream', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          onError(j.detail || `HTTP ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          onChunk(chunk);
        }
        onDone();
      } catch (err) {
        onError(err.message || 'Network error');
      }
    },

    listChats: () => apiFetch('/api/chats'),
    getMessages: (chatId) => apiFetch(`/api/chats/${chatId}/messages`),
    addMessage: (chatId, role, content, model_name = null, images = null, attachments = null) =>
      apiFetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, role, content, model_name, images, attachments }),
      }),
    deleteChat: (chatId) => apiFetch(`/api/chats/${chatId}`, { method: 'DELETE' }),
  },

  // ── Utilities ────────────────────────────────────────────────────────────
  health: () => apiFetch('/health'),
};

/**
 * Upload an image File and return a temporary data: URL for sending to fal.ai.
 * For production: upload to S3/R2 and return the public URL.
 * Here we convert to base64 data URL as a dev fallback.
 */
async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

window.API = API;
window.Auth = Auth;
window.fileToDataURL = fileToDataURL;
