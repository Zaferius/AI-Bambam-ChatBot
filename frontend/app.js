// DOM Elements
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatArea = document.getElementById("chatArea");
const chatList = document.getElementById("chatList");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const composerWrap = document.getElementById("composerWrap");
const offlineBanner = document.getElementById("offlineBanner");
const retryButton = document.getElementById("retryButton");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const attachmentPreview = document.getElementById("attachmentPreview");
const searchOverlay = document.getElementById("searchOverlay");
const searchOverlayInput = document.getElementById("searchOverlayInput");
const searchResultsList = document.getElementById("searchResultsList");
const searchNewChatBtn = document.getElementById("searchNewChatBtn");
const refreshModelsBtn = { disabled: true };
const twAttachBtn = document.getElementById("twAttachBtn");
const twFileInput = document.getElementById("twFileInput");
const twAttachmentPreview = document.getElementById("twAttachmentPreview");
const twMasterInputEl = document.getElementById("twMasterInput");

// State Variables
let thinkingLevel = "medium";
let attachedFiles = [];
let isSending = false;
let chats = JSON.parse(localStorage.getItem("chats") || "{}");
let currentChatId = "chat-1";
let isBackendOnline = true;
let connectivityInterval = null;
const CONNECTIVITY_INTERVAL_MS = 5000;
let activeTeamMember = null; // { teamId, memberId, roleName, icon, model, chatId }

// Chat Management Functions
function generateChatId() {
  return "chat-" + Date.now();
}

function generateChatTitle(message) {
  return message.length > 30 ? message.substring(0, 30) + "..." : message;
}

function saveChats() {
  localStorage.setItem("chats", JSON.stringify(chats));
}

async function createNewChat() {
  const chatId = generateChatId();
  
  // Backend'e kaydet
  const backendChat = await api.createChat("New Chat");
  
  if (backendChat) {
    // Backend başarılı, backend'den gelen ID'yi kullan
    chats[backendChat.id] = {
      id: backendChat.id,
      title: backendChat.title,
      messages: [],
      createdAt: backendChat.created_at
    };
  } else {
    // Backend offline, LocalStorage fallback
    chats[chatId] = {
      id: chatId,
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString()
    };
  }
  
  saveChats();
  switchToChat(backendChat ? backendChat.id : chatId);
  updateChatList();
}

function switchToChat(chatId) {
  if (!chats[chatId]) return;
  currentChatId = chatId;

  // Team member panelini kapat
  if (activeTeamMember) {
    closeMemberChat();
  }

  chatMessages.innerHTML = "";
  const chat = chats[chatId];
  chat.messages.forEach(msg => {
    createMessageElement(msg.text, msg.sender, false, msg.images || [], msg.modelName || null);
  });
  updateChatAreaState();
  updateChatList();
}

function twAutoResizeTextarea() {
  if (!twMasterInputEl) return;
  twMasterInputEl.style.height = "auto";
  const nextHeight = Math.min(Math.max(twMasterInputEl.scrollHeight, 52), 240);
  twMasterInputEl.style.height = nextHeight + "px";
  twMasterInputEl.style.overflowY = twMasterInputEl.scrollHeight > 240 ? "auto" : "hidden";
}

async function deleteChat(chatId, event) {
  event.stopPropagation();
  if (Object.keys(chats).length <= 1) return;
  
  // Backend'den sil
  await api.deleteChat(chatId);
  
  delete chats[chatId];
  saveChats();
  if (currentChatId === chatId) {
    const remainingChats = Object.keys(chats);
    if (remainingChats.length > 0) {
      switchToChat(remainingChats[0]);
    }
  }
  updateChatList();
}

function updateChatList() {
  if (!chatList) return;
  chatList.innerHTML = "";
  Object.values(chats).forEach(chat => {
    const chatItem = document.createElement("div");
    chatItem.className = `chat-item ${chat.id === currentChatId ? "active" : ""}`;
    chatItem.onclick = () => switchToChat(chat.id);
    chatItem.innerHTML = `
      <span class="chat-item-title">${chat.title}</span>
      <button class="chat-item-delete" onclick="deleteChat('${chat.id}', event)">×</button>
    `;
    chatList.appendChild(chatItem);
  });
}

// Sidebar Functions
function toggleSidebar() {
  const willOpen = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", willOpen);
  mainContent.classList.toggle("sidebar-open", willOpen);
}

function handleNavClick(action) {
  if (!sidebar.classList.contains("open")) {
    sidebar.classList.add("open");
    mainContent.classList.add("sidebar-open");
    if (action) {
      setTimeout(() => action(), 300);
    }
  } else {
    if (action) action();
  }
}

function updateChatTitle(chatId, firstMessage) {
  if (chats[chatId] && chats[chatId].title === "New Chat") {
    chats[chatId].title = generateChatTitle(firstMessage);
    saveChats();
    updateChatList();
  }
}

// UI Helper Functions
function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
}

function getModelShortName() {
  const name = (document.getElementById("selectedModelName").textContent || "").replace(/\bPro\b/g, '').trim();
  const parts = name.replace("Bambam", "").trim().split(" ");
  return parts.length > 0 ? parts.join(" ") : "Lite";
}

function getCurrentModelDisplayMeta(modelName = null) {
  const raw = String(modelName || (document.getElementById("selectedModelName")?.textContent || "Bambam 1.2 Lite")).replace(/\s+/g, ' ').trim();
  const clean = raw.replace(/\bPro\b/g, '').trim();
  const isPro = /Bambam 1\.2(?: Max)?$/i.test(clean);
  return {
    fullName: clean,
    badge: isPro ? 'Pro' : 'Lite'
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseAgentResponse(rawText) {
  const source = String(rawText || "");
  const normalizedSource = normalizeInlineFileMarkers(source);
  const codeBlocks = [];
  const codeRegex = /```([a-zA-Z0-9_+\-]*)?(?::([^\n`]+))?\n([\s\S]*?)```/g;

  let text = normalizedSource.replace(codeRegex, (_, lang = "", path = "", code = "") => {
    const cleanLang = (lang || "text").trim() || "text";
    const cleanPath = (path || "").trim();
    codeBlocks.push({
      lang: cleanLang,
      path: cleanPath,
      code: String(code || "").replace(/\s+$/, "")
    });
    return "\n";
  });

  let brainstorm = "";
  const brainstormMatch = text.match(
    /(?:^|\n)\s*(?:\*\*)?\s*(Brainstorming|Beyin\s*F[ıi]rt[ıi]nas[ıi]|D[üu]s[üu]nce(?:\s*Notu)?|Yaklasim|Yaklaşım)\s*:?\s*(?:\*\*)?\s*([\s\S]*?)(?=\n\s*(?:\*\*)?\s*(?:Deliverable|Teslim|Sonu[cç]|Output)\s*:|$)/i
  );

  if (brainstormMatch) {
    brainstorm = brainstormMatch[2].trim();
    text = text.replace(brainstormMatch[0], "\n");
  }

  text = text.replace(/(?:^|\n)\s*(?:\*\*)?\s*(Deliverable|Teslim|Sonu[cç]|Output)\s*:?\s*(?:\*\*)?/gi, "\n");
  text = text.replace(/(?:^|\n)\s*(?:\*\*)?\s*Durum\s*:?\s*(?:\*\*)?/gi, "\n");

  const narrative = text.replace(/\n{3,}/g, "\n\n").trim();
  const publicSummary = extractPublicSummary(normalizedSource, narrative);

  if (!brainstorm) {
    const fallback = extractLiveProgressText(normalizedSource, 180);
    if (fallback) {
      brainstorm = fallback;
    } else if (codeBlocks.length > 0) {
      brainstorm = "Gorev adimlari tamamlandi, kod degisiklikleri dosyalara aktariyorum.";
    }
  }

  return { brainstorm, narrative: publicSummary || narrative, codeBlocks };
}

function normalizeInlineFileMarkers(rawText) {
  const lines = String(rawText || "").split("\n");
  const markerRegex = /^\s*`?([a-zA-Z0-9_+\-]+):([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)`?\s*$/;
  const out = [];

  let i = 0;
  while (i < lines.length) {
    const marker = lines[i].match(markerRegex);
    if (!marker) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const lang = marker[1];
    const filePath = marker[2];
    let j = i + 1;
    while (j < lines.length && !lines[j].match(markerRegex)) {
      j += 1;
    }

    const codeContent = lines
      .slice(i + 1, j)
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");

    out.push("");
    out.push("```" + lang + ":" + filePath);
    out.push(codeContent);
    out.push("```");
    out.push("");

    i = j;
  }

  return out.join("\n");
}

function extractDraftFilesFromRaw(rawText) {
  const source = String(rawText || '');
  const files = [];
  const seen = new Map();

  const fencedRegex = /```([a-zA-Z0-9_+\-]*)?(?::([^\n`]+))?\n([\s\S]*?)(```|$)/g;
  let match;
  while ((match = fencedRegex.exec(source)) !== null) {
    const path = String(match[2] || '').trim();
    const content = String(match[3] || '').replace(/\s+$/, '');
    if (!path || !content) continue;
    seen.set(path, { path, content, complete: match[4] === '```' });
  }

  const lines = source.split('\n');
  const markerRegex = /^\s*`?([a-zA-Z0-9_+\-]+):([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)`?\s*$/;
  let i = 0;
  while (i < lines.length) {
    const marker = lines[i].match(markerRegex);
    if (!marker) {
      i += 1;
      continue;
    }

    const path = marker[2].trim();
    let j = i + 1;
    let nextMarkerFound = false;
    while (j < lines.length) {
      if (lines[j].match(markerRegex)) {
        nextMarkerFound = true;
        break;
      }
      j += 1;
    }

    const content = lines.slice(i + 1, j).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (path && content) {
      seen.set(path, { path, content, complete: nextMarkerFound });
    }

    i = j;
  }

  seen.forEach((value) => files.push(value));
  return files;
}

function extractLiveProgressText(rawText, maxLen = 260) {
  const normalized = normalizeInlineFileMarkers(rawText);
  let text = String(normalized || "");

  text = text.replace(/```[a-zA-Z0-9_+\-]*(?::[^\n`]+)?\n[\s\S]*?```/g, "\n");
  text = text.replace(/(?:^|\n)\s*(?:\*\*)?\s*(Deliverable|Teslim|Sonu[cç]|Output|Durum)\s*:?\s*(?:\*\*)?/gi, "\n");
  text = text.replace(/(?:^|\n)\s*#{1,6}\s+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (!text) return "";

  const stepMatch = text.match(/Ad[ıi]m\s*\d+\s*:[^\n.]*/i);
  if (stepMatch && stepMatch[0]) {
    const s = stepMatch[0].replace(/\s+/g, " ").trim();
    return s.length > maxLen ? `${s.slice(0, maxLen).trim()}...` : s;
  }

  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? `${compact.slice(0, maxLen).trim()}...` : compact;
}

function extractPublicSummary(rawText, fallback = "") {
  const normalized = normalizeInlineFileMarkers(rawText);
  let text = String(normalized || "");

  text = text.replace(/```[a-zA-Z0-9_+\-]*(?::[^\n`]+)?\n[\s\S]*?```/g, "\n");
  text = text.replace(/\r/g, "");

  const preferred = text.match(/(Bu g[üu]ncellemeler(?:le)? birlikte[\s\S]*)/i);
  if (preferred && preferred[1]) {
    return preferred[1].replace(/\n{3,}/g, "\n\n").trim();
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((p) => !/^(Brainstorming|Durum|Deliverable|Ad[ıi]m\s*\d+|#+\s|G[üu]ncellenmi[sş])/i.test(p));

  if (paragraphs.length > 0) return paragraphs[paragraphs.length - 1];
  return String(fallback || "").trim();
}

function getBrainstormSummary(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Brainstorming";
  return normalized.length > 96 ? `${normalized.slice(0, 96).trim()}...` : normalized;
}

function renderAgentStructuredContent(container, rawText, collapsed = true) {
  if (!container) return;
  const parsed = parseAgentResponse(rawText);
  container.textContent = "";

  if (parsed.brainstorm && !parsed.narrative) {
    const brainstormDetails = document.createElement("details");
    brainstormDetails.className = "agent-brainstorm-details";
    if (!collapsed) brainstormDetails.open = true;

    const brainstormSummary = document.createElement("summary");
    brainstormSummary.className = "agent-brainstorm-summary";
    brainstormSummary.textContent = `Brainstorming: ${getBrainstormSummary(parsed.brainstorm)}`;

    const brainstormBody = document.createElement("div");
    brainstormBody.className = "agent-brainstorm-body";
    brainstormBody.textContent = parsed.brainstorm;

    brainstormDetails.appendChild(brainstormSummary);
    brainstormDetails.appendChild(brainstormBody);
    container.appendChild(brainstormDetails);
  }

  if (parsed.narrative) {
    const narrativeEl = document.createElement("div");
    narrativeEl.className = "agent-narrative";
    narrativeEl.textContent = parsed.narrative;
    container.appendChild(narrativeEl);
  }

  if (parsed.codeBlocks.length > 0) {
    const group = document.createElement("div");
    group.className = "agent-code-group";

    parsed.codeBlocks.forEach((block, idx) => {
      const details = document.createElement("details");
      details.className = "agent-code-details";
      if (!collapsed) details.open = true;

      const summary = document.createElement("summary");
      summary.className = "agent-code-summary";

      const summaryTitle = document.createElement("span");
      summaryTitle.className = "agent-code-title";
      summaryTitle.textContent = block.path || `Kod Bloğu ${idx + 1}`;

      const summaryMeta = document.createElement("span");
      summaryMeta.className = "agent-code-meta";
      summaryMeta.textContent = block.lang;

      summary.appendChild(summaryTitle);
      summary.appendChild(summaryMeta);

      const panel = document.createElement("div");
      panel.className = "agent-code-panel";
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.code;
      pre.appendChild(code);
      panel.appendChild(pre);

      details.appendChild(summary);
      details.appendChild(panel);
      group.appendChild(details);
    });

    container.appendChild(group);
  }

  if (!parsed.brainstorm && !parsed.narrative && parsed.codeBlocks.length === 0) {
    container.textContent = String(rawText || "");
  }
}

function createMessageElement(text, sender, isTyping = false, images = [], modelName = null) {
  const row = document.createElement("div");
  row.className = `message-row ${sender === "user" ? "user-row" : "bot-row"}`;

  const msg = document.createElement("div");
  msg.className = `message ${sender} ${isTyping ? "typing" : ""}`;

  // Bot header with model name
  if (sender === "bot") {
    const header = document.createElement("div");
    header.className = "bot-header";
    const meta = getCurrentModelDisplayMeta(modelName);
    header.innerHTML = `
      <img src="b-icon.png" alt="Bambam Logo" class="bot-header-logo">
      <span class="bot-header-name">Bambam</span>
      <span class="bot-header-badge">${meta.badge}</span>
    `;
    msg.appendChild(header);
  }

  if (images && images.length > 0) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "message-images";
    images.forEach(imageData => {
      const img = document.createElement("img");
      img.className = "message-image";
      img.src = imageData;
      img.alt = "Uploaded image";
      img.onclick = function() {
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(`<!DOCTYPE html><html><head><title>Image</title><style>body{margin:0;padding:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${imageData}" alt="Image"></body></html>`);
          newWindow.document.close();
        }
      };
      imagesContainer.appendChild(img);
    });
    msg.appendChild(imagesContainer);
  }

  if (text) {
    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.textContent = text;
    msg.appendChild(textDiv);
  }

  row.appendChild(msg);
  chatMessages.appendChild(row);
  updateChatAreaState();
  scrollToBottom();
  return msg;
}

function createStandaloneMessageRow(text, sender, images = [], modelName = null) {
  const row = document.createElement("div");
  row.className = `message-row ${sender === "user" ? "user-row" : "bot-row"}`;

  const msg = document.createElement("div");
  msg.className = `message ${sender}`;

  if (sender === "bot") {
    const header = document.createElement("div");
    header.className = "bot-header";
    const meta = getCurrentModelDisplayMeta(modelName);
    header.innerHTML = `
      <img src="b-icon.png" alt="Bambam Logo" class="bot-header-logo">
      <span class="bot-header-name">Bambam</span>
      <span class="bot-header-badge">${meta.badge}</span>
    `;
    msg.appendChild(header);
  }

  if (images && images.length > 0) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "message-images";
    images.forEach((imageData) => {
      const img = document.createElement("img");
      img.className = "message-image";
      img.src = imageData;
      img.alt = "Uploaded image";
      imagesContainer.appendChild(img);
    });
    msg.appendChild(imagesContainer);
  }

  if (text) {
    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    if (sender === 'bot') {
      renderAgentStructuredContent(textDiv, text, true);
    } else {
      textDiv.textContent = text;
    }
    msg.appendChild(textDiv);
  }

  row.appendChild(msg);
  return row;
}

function addWelcomeMessage() {}

function updateChatAreaState() {
  const heroSection = document.getElementById("heroSection");
  const mainChatLeft = document.getElementById("mainChatLeft");
  const hasMessages = chatMessages.children.length > 0;
  if (hasMessages) {
    chatArea.classList.add("has-messages");
    heroSection.classList.add("hidden");
    composerWrap.classList.remove("centered");
    if (mainChatLeft) mainChatLeft.classList.remove("initial-state");
  } else {
    chatArea.classList.remove("has-messages");
    heroSection.classList.remove("hidden");
    composerWrap.classList.add("centered");
    if (mainChatLeft) mainChatLeft.classList.add("initial-state");
  }
}

// Message Sending
async function sendMessage() {
  if (!isBackendOnline) {
    alert("Backend is not connected. Please start the server.");
    return;
  }
  const text = messageInput.value.trim();
  if ((!text && attachedFiles.length === 0) || isSending) return;

  isSending = true;
  sendBtn.disabled = true;

  const userImages = [];
  for (const file of attachedFiles) {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      const imageDataPromise = new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      userImages.push(await imageDataPromise);
    }
  }

  chats[currentChatId].messages.push({ text, sender: "user", images: userImages });
  updateChatTitle(currentChatId, text || "Image");
  saveChats();
  createMessageElement(text, "user", false, userImages);

  const filesToSend = [...attachedFiles];
  messageInput.value = "";
  attachedFiles = [];
  updateAttachmentPreview();
  autoResizeTextarea();

  const currentModelName = getModelShortName();
  const botMessage = createMessageElement("Thinking...", "bot", true, [], currentModelName);

  try {
    // Use API client for backend communication
    const response = await api.sendMessage(text, selectedModelId, currentChatId, thinkingLevel, filesToSend);

    if (!response.ok) {
      const errorText = "Server returned an error.";
      botMessage.querySelector(".message-text").textContent = errorText;
      chats[currentChatId].messages.push({ text: errorText, sender: "bot", modelName: currentModelName });
      saveChats();
      botMessage.classList.remove("typing");
      isSending = false;
      sendBtn.disabled = false;
      return;
    }
    setConnectionState(true);

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const textEl = botMessage.querySelector(".message-text");
    textEl.textContent = "";
    botMessage.classList.remove("typing");

    let fullResponse = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      textEl.textContent += chunk;
      fullResponse += chunk;
      scrollToBottom();
    }

    chats[currentChatId].messages.push({ text: fullResponse, sender: "bot", modelName: currentModelName });
    saveChats();

  } catch (error) {
    const errorText = "An error occurred. Check if backend is running.";
    botMessage.querySelector(".message-text").textContent = errorText;
    chats[currentChatId].messages.push({ text: errorText, sender: "bot", modelName: currentModelName });
    saveChats();
    botMessage.classList.remove("typing");
    console.error(error);
    setConnectionState(false);
  } finally {
    isSending = false;
    sendBtn.disabled = !isBackendOnline;
    messageInput.focus();
  }
}


async function resetChat() {
  try {
    await fetch("http://127.0.0.1:8000/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: currentChatId })
    });
    chats[currentChatId].messages = [];
    saveChats();
    chatMessages.innerHTML = "";
    addWelcomeMessage();
    setConnectionState(true);
  } catch (error) {
    console.error(error);
    setConnectionState(false);
  }
}

// Model Management
let allModelsData = null;
let selectedModelId = "bambam:lite";
let advancedModelsExpanded = false;

function toggleModelDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("modelDropdown");
  const btn = document.getElementById("modelSelectorBtn");
  dropdown.classList.toggle("active");
  btn.classList.toggle("active");
}

function selectModel(modelId, modelName) {
  selectedModelId = modelId;
  document.getElementById("selectedModelName").innerHTML = formatModelLabelHtml(modelName);
  const twSelected = document.getElementById("twSelectedModelName");
  if (twSelected) twSelected.innerHTML = formatModelLabelHtml(modelName);
  renderModelDropdown();
  renderTwModelDropdown();
  const dropdown = document.getElementById("modelDropdown");
  const btn = document.getElementById("modelSelectorBtn");
  if (dropdown) dropdown.classList.remove("active");
  if (btn) btn.classList.remove("active");
}

function formatModelLabelHtml(modelName) {
  const raw = String(modelName || "");
  if (/Bambam 1\.2 Max$/i.test(raw) || /^Bambam 1\.2$/i.test(raw)) {
    return `${escapeHtml(raw)} <span class="model-pro-badge">Pro</span>`;
  }
  if (/Bambam 1\.2 Lite$/i.test(raw)) {
    return escapeHtml(raw);
  }
  return escapeHtml(raw);
}

function toggleAdvancedModels() {
  advancedModelsExpanded = !advancedModelsExpanded;
  const list = document.getElementById("advancedModelsList");
  const btn = document.getElementById("advancedModelsBtn");
  if (advancedModelsExpanded) {
    list.classList.add("expanded");
    btn.classList.add("expanded");
  } else {
    list.classList.remove("expanded");
    btn.classList.remove("expanded");
  }
}

function createModelOption(model) {
  const option = document.createElement("div");
  option.className = "model-option";
  option.setAttribute("data-model-id", model.id);
  option.dataset.modelName = model.name;

  const contentDiv = document.createElement("div");
  contentDiv.className = "model-option-content";

  const header = document.createElement("div");
  header.className = "model-option-header";

  const name = document.createElement("span");
  name.className = "model-option-name";
  name.innerHTML = formatModelLabelHtml(model.name);
  header.appendChild(name);

  if (model.badge && !/Bambam 1\.2(?: Max)?$/i.test(model.name || '')) {
    const badge = document.createElement("span");
    badge.className = "model-option-badge";
    badge.textContent = model.badge;
    header.appendChild(badge);
  }

  contentDiv.appendChild(header);

  if (model.description) {
    const desc = document.createElement("div");
    desc.className = "model-option-desc";
    desc.textContent = model.description;
    contentDiv.appendChild(desc);
  }

  option.appendChild(contentDiv);

  if (model.id === selectedModelId) {
    const check = document.createElement("span");
    check.className = "model-option-check";
    check.textContent = "✓";
    option.appendChild(check);
  }

  return option;
}

function renderModelDropdown() {
  if (!allModelsData) return;
  const content = document.getElementById("modelDropdownContent");
  content.innerHTML = "";

  const bambamModels = allModelsData.models.filter(m => m.is_bambam && !m.is_group);
  const otherModels = allModelsData.models.filter(m => !m.is_bambam && !m.is_group);

  bambamModels.forEach(model => { content.appendChild(createModelOption(model)); });

  if (otherModels.length > 0) {
    const divider = document.createElement("div");
    divider.className = "model-dropdown-divider";
    content.appendChild(divider);

    const sectionBtn = document.createElement("button");
    sectionBtn.className = "model-dropdown-section-btn" + (advancedModelsExpanded ? " expanded" : "");
    sectionBtn.id = "advancedModelsBtn";
    sectionBtn.innerHTML = `<span>Advanced Models</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    sectionBtn.onclick = (e) => { e.stopPropagation(); toggleAdvancedModels(); };
    content.appendChild(sectionBtn);

    const advList = document.createElement("div");
    advList.className = "advanced-models-list" + (advancedModelsExpanded ? " expanded" : "");
    advList.id = "advancedModelsList";
    otherModels.forEach(model => { advList.appendChild(createModelOption(model)); });
    content.appendChild(advList);
  }
}

function toggleTwModelDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("twModelDropdown");
  const btn = document.getElementById("twModelSelectorBtn");
  if (!dropdown || !btn) return;
  dropdown.classList.toggle("active");
  btn.classList.toggle("active");
}

function twSelectModel(modelId, modelName) {
  selectedModelId = modelId;
  const mainSelected = document.getElementById("selectedModelName");
  const twSelected = document.getElementById("twSelectedModelName");
  if (mainSelected) mainSelected.innerHTML = formatModelLabelHtml(modelName);
  if (twSelected) twSelected.innerHTML = formatModelLabelHtml(modelName);
  renderModelDropdown();
  renderTwModelDropdown();
  const dropdown = document.getElementById("twModelDropdown");
  const btn = document.getElementById("twModelSelectorBtn");
  if (dropdown) dropdown.classList.remove("active");
  if (btn) btn.classList.remove("active");
}

function renderTwModelDropdown() {
  if (!allModelsData) return;
  const content = document.getElementById("twModelDropdownContent");
  if (!content) return;
  content.innerHTML = "";
  const bambamModels = allModelsData.models.filter(m => m.is_bambam && !m.is_group);
  bambamModels.forEach((model) => {
    const option = document.createElement("div");
    option.className = "model-option";
    option.dataset.modelName = model.name;

    const contentDiv = document.createElement("div");
    contentDiv.className = "model-option-content";
    const header = document.createElement("div");
    header.className = "model-option-header";
    const name = document.createElement("span");
    name.className = "model-option-name";
    name.innerHTML = formatModelLabelHtml(model.name);
    header.appendChild(name);
    if (model.badge && !/Bambam 1\.2(?: Max)?$/i.test(model.name || '')) {
      const badge = document.createElement("span");
      badge.className = "model-option-badge";
      badge.textContent = model.badge;
      header.appendChild(badge);
    }
    contentDiv.appendChild(header);
    if (model.description) {
      const desc = document.createElement("div");
      desc.className = "model-option-desc";
      desc.textContent = model.description;
      contentDiv.appendChild(desc);
    }
    option.appendChild(contentDiv);
    if (model.id === selectedModelId) {
      const check = document.createElement("span");
      check.className = "model-option-check";
      check.textContent = "✓";
      option.appendChild(check);
    }
    content.appendChild(option);
  });
}

document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("twModelDropdown");
  const btn = document.getElementById("twModelSelectorBtn");
  if (!dropdown || !btn) return;
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.remove("active");
    btn.classList.remove("active");
  }
});

document.addEventListener('click', (e) => {
  const option = e.target.closest('#modelDropdown .model-option');
  if (option) {
    e.stopPropagation();
    selectModel(option.dataset.modelId, option.dataset.modelName || option.textContent || '');
    return;
  }
  const twOption = e.target.closest('#twModelDropdown .model-option');
  if (twOption) {
    e.stopPropagation();
    twSelectModel(twOption.dataset.modelId, twOption.dataset.modelName || twOption.textContent || '');
  }
});

document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("modelDropdown");
  const btn = document.getElementById("modelSelectorBtn");
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.remove("active");
    btn.classList.remove("active");
  }
});

function useSuggestion(text) {
  messageInput.value = text;
  messageInput.focus();
  autoResizeTextarea();
  setTimeout(() => sendMessage(), 100);
}

// Search Overlay
let searchActive = false;

function toggleSearch(forceState = null) {
  const nextState = forceState === null ? !searchActive : forceState;
  searchActive = nextState;
  if (searchActive) {
    searchOverlay.classList.add("active");
    searchOverlayInput.value = "";
    renderSearchResults("");
    setTimeout(() => searchOverlayInput.focus(), 80);
  } else {
    searchOverlay.classList.remove("active");
    searchOverlayInput.value = "";
    searchResultsList.innerHTML = "";
  }
}

function renderSearchResults(query) {
  const normalized = query.toLowerCase().trim();
  const sortedChats = Object.values(chats).sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  let filtered;
  if (!normalized) {
    filtered = sortedChats;
  } else {
    filtered = sortedChats.filter(chat => {
      if (chat.title && chat.title.toLowerCase().includes(normalized)) return true;
      return (chat.messages || []).some(msg => msg.text && msg.text.toLowerCase().includes(normalized));
    });
  }

  searchResultsList.innerHTML = "";

  if (filtered.length === 0) {
    searchResultsList.innerHTML = '<div style="padding:20px 12px;text-align:center;color:var(--muted);font-size:13px">Sonuç bulunamadı</div>';
    return;
  }

  const today = new Date().toDateString();
  let todayLabelShown = false;
  let earlierLabelShown = false;

  filtered.forEach(chat => {
    const isToday = new Date(chat.createdAt || Date.now()).toDateString() === today;

    if (isToday && !todayLabelShown) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:12px;color:var(--muted);padding:8px 12px 4px;font-weight:600";
      label.textContent = "Bugün";
      searchResultsList.appendChild(label);
      todayLabelShown = true;
    } else if (!isToday && !earlierLabelShown) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:12px;color:var(--muted);padding:8px 12px 4px;font-weight:600";
      label.textContent = "Önceki sohbetler";
      searchResultsList.appendChild(label);
      earlierLabelShown = true;
    }

    const row = document.createElement("button");
    row.className = "search-result-row";
    row.onclick = () => { switchToChat(chat.id); toggleSearch(false); };
    row.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      <span class="title">${chat.title || "Untitled Chat"}</span>
    `;
    searchResultsList.appendChild(row);
  });
}

searchOverlayInput.addEventListener("input", (e) => {
  renderSearchResults(e.target.value);
});

searchNewChatBtn.addEventListener("click", () => {
  createNewChat();
  toggleSearch(false);
});

searchOverlay.addEventListener("click", (event) => {
  if (event.target === searchOverlay) {
    toggleSearch(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchActive) {
    toggleSearch(false);
  }
});

// File Attachments
attachBtn.addEventListener("click", () => { fileInput.click(); });

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    if (!attachedFiles.find(f => f.name === file.name)) {
      attachedFiles.push(file);
    }
  });
  updateAttachmentPreview();
  fileInput.value = "";
});

function updateAttachmentPreview() {
  if (attachedFiles.length === 0) {
    attachmentPreview.classList.remove("has-files");
    attachmentPreview.innerHTML = "";
    return;
  }
  attachmentPreview.classList.add("has-files");
  attachmentPreview.innerHTML = "";
  attachedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    if (file.type.startsWith("image/")) {
      item.className = "attachment-item image-item";
      const reader = new FileReader();
      reader.onload = (e) => {
        item.innerHTML = `
          <img src="${e.target.result}" class="attachment-image-preview" alt="${file.name}">
          <div class="attachment-item-actions">
            <button class="attachment-item-btn attachment-item-remove" onclick="removeAttachment(${index})" title="Remove">×</button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else {
      item.className = "attachment-item file-item";
      item.innerHTML = `
        <span>📄</span>
        <span class="attachment-item-name" title="${file.name}">${file.name}</span>
        <button class="attachment-item-btn attachment-item-remove" onclick="removeAttachment(${index})">×</button>
      `;
    }
    attachmentPreview.appendChild(item);
  });
}

function removeAttachment(index) {
  attachedFiles.splice(index, 1);
  updateAttachmentPreview();
}

// Connection & Models
function getModelById(modelId) {
  if (!allModelsData) return null;
  return allModelsData.models.find(model => model.id === modelId && !model.is_group) || null;
}

function setConnectionState(isOnline) {
  isBackendOnline = isOnline;
  if (isOnline) {
    if (statusDot) { statusDot.classList.remove("offline"); statusDot.classList.add("online"); }
    if (statusText) { statusText.textContent = "Connected"; }
    composerWrap.style.display = "block";
    offlineBanner.style.display = "none";
    sendBtn.disabled = false;
    messageInput.disabled = false;
    retryButton.disabled = true;
    messageInput.placeholder = "Type your message...";
    stopConnectivityPolling();
  } else {
    if (statusDot) { statusDot.classList.remove("online"); statusDot.classList.add("offline"); }
    if (statusText) { statusText.textContent = "Not Connected"; }
    composerWrap.style.display = "none";
    offlineBanner.style.display = "flex";
    sendBtn.disabled = true;
    messageInput.disabled = true;
    retryButton.disabled = false;
    messageInput.placeholder = "Backend is offline";
    startConnectivityPolling();
  }
}

function startConnectivityPolling() {
  if (connectivityInterval) return;
  connectivityInterval = setInterval(async () => {
    if (!isBackendOnline) { await loadAvailableModels(true); }
    else { stopConnectivityPolling(); }
  }, CONNECTIVITY_INTERVAL_MS);
}

function stopConnectivityPolling() {
  if (!connectivityInterval) return;
  clearInterval(connectivityInterval);
  connectivityInterval = null;
}

async function attemptReconnect() {
  if (retryButton.disabled) return;
  retryButton.textContent = "Trying...";
  retryButton.disabled = true;
  await loadAvailableModels(true);
  if (isBackendOnline) {
    retryButton.textContent = "Connected";
    setTimeout(() => { retryButton.textContent = "Retry Connection"; }, 1500);
  } else {
    retryButton.textContent = "Retry Connection";
    retryButton.disabled = false;
  }
}

async function loadAvailableModels(silent = false) {
  try {
    const data = await api.getModels();
    allModelsData = data;
    setConnectionState(true);
    if (!getModelById(selectedModelId)) {
      const firstModel = data.models.find(model => !model.is_group);
      if (firstModel) {
        selectedModelId = firstModel.id;
        document.getElementById("selectedModelName").innerHTML = formatModelLabelHtml(firstModel.name);
        const twSelected = document.getElementById("twSelectedModelName");
        if (twSelected) twSelected.innerHTML = formatModelLabelHtml(firstModel.name);
      }
    }
    renderModelDropdown();
    renderTwModelDropdown();
    if (!silent) { console.log("Models loaded:", data.models.length); }
  } catch (error) {
    if (!silent) { console.error("Failed to load models:", error); }
    setConnectionState(false);
  }
}

async function refreshModels() {
  try {
    const data = await api.refreshModels();
    await loadAvailableModels();
    console.log("Models refreshed:", data.message);
    setConnectionState(true);
  } catch (error) {
    console.error("Failed to refresh models:", error);
    setConnectionState(false);
  }
}

// Initialization
async function initializeApp() {
  // Auth guard - login kontrolü (dev bypass: token yoksa dummy token set et)
  if (!api.isLoggedIn()) {
    localStorage.setItem('bambam_token', 'dev-bypass-token');
    localStorage.setItem('bambam_user', JSON.stringify({ id: 'dev-bypass', username: 'dev', email: 'dev@bambam.local' }));
  }

  // Sidebar default açık
  sidebar.classList.add('open');
  mainContent.classList.add('sidebar-open');

  // User menu göster
  const username = api.getUsername();
  if (username) {
    const userMenu = document.getElementById('userMenu');
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userMenu && userNameDisplay) {
      userNameDisplay.textContent = username;
      userMenu.style.display = 'flex';
    }
  }
  
  // Backend'den chat listesini yükle
  const backendChats = await api.listChats();
  
  if (backendChats && backendChats.length > 0) {
    // Backend'den gelen chatları kullan
    chats = {};
    backendChats.forEach(chat => {
      chats[chat.id] = {
        id: chat.id,
        title: chat.title,
        messages: [],
        createdAt: chat.created_at,
        updatedAt: chat.updated_at
      };
    });
    saveChats(); // LocalStorage'a da kaydet (fallback için)
    switchToChat(backendChats[0].id);
  } else if (Object.keys(chats).length === 0) {
    // Backend boş ve LocalStorage da boş, yeni chat oluştur
    await createNewChat();
  } else {
    // Backend offline ama LocalStorage'da chat var
    switchToChat(Object.keys(chats)[0]);
  }
  
  updateChatList();
  await loadAvailableModels();
  loadTeamList();
}

messageInput.addEventListener("input", autoResizeTextarea);
messageInput.addEventListener("keydown", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

initializeApp();
autoResizeTextarea();

// ===== TEAM WORKSPACE =====
let twCurrentTeam = null;
let twSending = false;
let twCurrentRunId = null;
let twCollabPanelOpen = false;
let twCurrentProject = null;
let twProjectsManagerOpen = false;
let twAttachedFiles = [];
let twWorkspaceHideTimer = null;
let twProjectHideTimer = null;
let twOpenMemberModalId = null;
let twSidebarCollapsed = false;
let twChatState = []; // Array of chat message objects for persistence
let twTodoItems = []; // [{id, memberId, text, done}]
let twTodoExpanded = true;

// Member color palette
const TW_MEMBER_COLORS = [
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ef4444', // red
  '#14b8a6', // teal
  '#a855f7', // violet
];
let twMemberColorMap = {}; // memberId -> color

function twWorkspaceStateStorageKey(teamId) {
  return `tw-workspace-state:${teamId}`;
}

function twLoadWorkspaceState(teamId) {
  if (!teamId) return null;
  try {
    const raw = localStorage.getItem(twWorkspaceStateStorageKey(teamId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function twSaveWorkspaceState(teamId, state) {
  if (!teamId) return;
  try {
    localStorage.setItem(twWorkspaceStateStorageKey(teamId), JSON.stringify(state));
  } catch {}
}

// ===== TEAM CHAT MESSAGE RENDERING SYSTEM =====

function twGetMemberColor(memberId) {
  if (twMemberColorMap[memberId]) return twMemberColorMap[memberId];
  const idx = Object.keys(twMemberColorMap).length % TW_MEMBER_COLORS.length;
  twMemberColorMap[memberId] = TW_MEMBER_COLORS[idx];
  return twMemberColorMap[memberId];
}

function twAssignMemberColors(members) {
  twMemberColorMap = {};
  (members || []).forEach((m, i) => {
    twMemberColorMap[m.id] = TW_MEMBER_COLORS[i % TW_MEMBER_COLORS.length];
  });
}

function twGetChatInner() {
  const scroll = document.getElementById('twChatMessages');
  if (!scroll) return null;
  let inner = scroll.querySelector('.tw-chat-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'tw-chat-inner';
    scroll.appendChild(inner);
  }
  return inner;
}

function twHideWelcome() {
  const welcome = document.getElementById('twChatWelcome');
  if (welcome) welcome.style.display = 'none';
}

function twChatAutoScroll() {
  const scroll = document.getElementById('twChatMessages');
  if (!scroll) return;
  const threshold = 80;
  const isNearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < threshold;
  if (isNearBottom) scroll.scrollTop = scroll.scrollHeight;
}

function twAddUserMessage(text) {
  twHideWelcome();
  const inner = twGetChatInner();
  if (!inner) return;
  const row = document.createElement('div');
  row.className = 'tw-msg-user';
  const bubble = document.createElement('div');
  bubble.className = 'tw-msg-user-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  inner.appendChild(row);
  twChatAutoScroll();
}

function twAddSystemMessage(text, type) {
  const inner = twGetChatInner();
  if (!inner) return;
  const row = document.createElement('div');
  row.className = 'tw-msg-system';
  const bubble = document.createElement('div');
  bubble.className = 'tw-msg-system-bubble';
  if (type === 'error') bubble.style.borderColor = 'rgba(239,68,68,0.3)';
  if (type === 'success') bubble.style.borderColor = 'rgba(34,197,94,0.3)';
  bubble.textContent = text;
  row.appendChild(bubble);
  inner.appendChild(row);
  twChatAutoScroll();
}

function twGetOrCreateMemberMsg(memberId, memberInfo) {
  const inner = twGetChatInner();
  if (!inner) return null;
  let existing = inner.querySelector(`.tw-msg-member[data-member-id="${memberId}"]`);
  if (existing) return existing;

  twHideWelcome();
  const color = twGetMemberColor(memberId);
  const info = memberInfo || {};

  const msg = document.createElement('div');
  msg.className = 'tw-msg-member';
  msg.dataset.memberId = memberId;

  const header = document.createElement('div');
  header.className = 'tw-msg-member-header';

  const iconEl = document.createElement('div');
  iconEl.className = 'tw-msg-member-icon';
  iconEl.textContent = info.icon || '🤖';

  const nameEl = document.createElement('span');
  nameEl.className = 'tw-msg-member-name';
  nameEl.style.color = color;
  nameEl.textContent = info.role_name || 'Agent';

  const badge = document.createElement('span');
  badge.className = 'tw-msg-member-badge';
  badge.textContent = 'çalışıyor...';

  header.appendChild(iconEl);
  header.appendChild(nameEl);
  header.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'tw-msg-member-body';

  msg.appendChild(header);
  msg.appendChild(body);
  inner.appendChild(msg);
  twChatAutoScroll();
  return msg;
}

function twSetMemberMsgBadge(memberId, text) {
  const inner = twGetChatInner();
  if (!inner) return;
  const msg = inner.querySelector(`.tw-msg-member[data-member-id="${memberId}"]`);
  if (!msg) return;
  const badge = msg.querySelector('.tw-msg-member-badge');
  if (badge) badge.textContent = text;
}

function twAddMemberText(memberId, text, memberInfo) {
  const msg = twGetOrCreateMemberMsg(memberId, memberInfo);
  if (!msg) return;
  const body = msg.querySelector('.tw-msg-member-body');
  if (!body) return;
  const textEl = document.createElement('div');
  textEl.className = 'tw-msg-member-text';
  textEl.textContent = text;
  body.appendChild(textEl);
  twChatAutoScroll();
}

function twAddMemberStatusLine(memberId, icon, shortText, memberInfo) {
  const msg = twGetOrCreateMemberMsg(memberId, memberInfo);
  if (!msg) return;
  const body = msg.querySelector('.tw-msg-member-body');
  if (!body) return;
  const line = document.createElement('div');
  line.className = 'tw-msg-member-status-line';
  line.innerHTML = `<span class="status-icon">${icon}</span> <span>${shortText}</span>`;
  body.appendChild(line);
  twChatAutoScroll();
}

function twAddMemberPlanSection(memberId, steps, memberInfo) {
  const msg = twGetOrCreateMemberMsg(memberId, memberInfo);
  if (!msg) return;
  const body = msg.querySelector('.tw-msg-member-body');
  if (!body) return;

  const section = document.createElement('div');
  section.className = 'tw-msg-section open';
  section.dataset.sectionType = 'plan';

  const header = document.createElement('div');
  header.className = 'tw-msg-section-header';
  header.onclick = () => section.classList.toggle('open');

  const check = document.createElement('div');
  check.className = 'tw-msg-section-check';
  check.innerHTML = '✓';
  const title = document.createElement('div');
  title.className = 'tw-msg-section-title';
  title.textContent = `Plan (${steps.length} adım)`;
  const arrow = document.createElement('div');
  arrow.className = 'tw-msg-section-arrow';
  arrow.textContent = '▸';

  header.appendChild(check);
  header.appendChild(title);
  header.appendChild(arrow);

  const sBody = document.createElement('div');
  sBody.className = 'tw-msg-section-body';
  const sInner = document.createElement('div');
  sInner.className = 'tw-msg-section-body-inner';

  steps.forEach((stepText, i) => {
    const task = document.createElement('div');
    task.className = 'tw-msg-task';
    const tIcon = document.createElement('div');
    tIcon.className = 'tw-msg-task-icon';
    tIcon.textContent = `${i + 1}`;
    const tLabel = document.createElement('div');
    tLabel.className = 'tw-msg-task-label';
    tLabel.textContent = stepText;
    task.appendChild(tIcon);
    task.appendChild(tLabel);
    sInner.appendChild(task);
  });

  sBody.appendChild(sInner);
  section.appendChild(header);
  section.appendChild(sBody);
  body.appendChild(section);
  twChatAutoScroll();
}

function twGetOrCreateStepSection(memberId, stepNum, total, desc, memberInfo) {
  const msg = twGetOrCreateMemberMsg(memberId, memberInfo);
  if (!msg) return null;
  const body = msg.querySelector('.tw-msg-member-body');
  if (!body) return null;

  let section = body.querySelector(`.tw-msg-section[data-step="${stepNum}"]`);
  if (section) return section;

  section = document.createElement('div');
  section.className = 'tw-msg-section running';
  section.dataset.step = stepNum;

  const header = document.createElement('div');
  header.className = 'tw-msg-section-header';
  header.onclick = () => section.classList.toggle('open');

  const check = document.createElement('div');
  check.className = 'tw-msg-section-check';
  check.innerHTML = '✓';
  const title = document.createElement('div');
  title.className = 'tw-msg-section-title';
  title.textContent = desc || `Adım ${stepNum}/${total}`;
  const arrow = document.createElement('div');
  arrow.className = 'tw-msg-section-arrow';
  arrow.textContent = '▸';

  header.appendChild(check);
  header.appendChild(title);
  header.appendChild(arrow);

  const sBody = document.createElement('div');
  sBody.className = 'tw-msg-section-body';
  const sInner = document.createElement('div');
  sInner.className = 'tw-msg-section-body-inner';
  const content = document.createElement('div');
  content.className = 'tw-msg-section-content';
  content.dataset.raw = '';
  content.textContent = 'Çıktı hazırlanıyor...';
  sInner.appendChild(content);
  sBody.appendChild(sInner);

  section.appendChild(header);
  section.appendChild(sBody);
  body.appendChild(section);
  twChatAutoScroll();
  return section;
}

function twUpdateStepDelta(memberId, stepNum, deltaText) {
  const inner = twGetChatInner();
  if (!inner) return;
  const msg = inner.querySelector(`.tw-msg-member[data-member-id="${memberId}"]`);
  if (!msg) return;
  const section = msg.querySelector(`.tw-msg-section[data-step="${stepNum}"]`);
  if (!section) return;
  const content = section.querySelector('.tw-msg-section-content');
  if (!content) return;
  const prevRaw = content.dataset.raw || '';
  const nextRaw = prevRaw + (deltaText || '');
  content.dataset.raw = nextRaw;
  const liveText = extractLiveProgressText(nextRaw, 160);
  content.textContent = liveText ? `Thinking... ${liveText}` : 'Thinking...';
  twChatAutoScroll();
}

function twSetStepDone(memberId, stepNum) {
  const inner = twGetChatInner();
  if (!inner) return;
  const msg = inner.querySelector(`.tw-msg-member[data-member-id="${memberId}"]`);
  if (!msg) return;
  const section = msg.querySelector(`.tw-msg-section[data-step="${stepNum}"]`);
  if (!section) return;
  section.classList.remove('running');
  section.classList.add('done');
  const content = section.querySelector('.tw-msg-section-content');
  if (content) {
    const raw = content.dataset.raw || content.textContent || '';
    renderAgentStructuredContent(content, raw, true);
  }
}

function twSetStepError(memberId, stepNum, errorText) {
  const inner = twGetChatInner();
  if (!inner) return;
  const msg = inner.querySelector(`.tw-msg-member[data-member-id="${memberId}"]`);
  if (!msg) return;
  const section = msg.querySelector(`.tw-msg-section[data-step="${stepNum}"]`);
  if (!section) return;
  section.classList.remove('running');
  section.classList.add('error');
  const content = section.querySelector('.tw-msg-section-content');
  if (content) content.textContent += '\n❌ ' + (errorText || 'Hata');
}

function twAddMemberFiles(memberId, files, memberInfo) {
  const msg = twGetOrCreateMemberMsg(memberId, memberInfo);
  if (!msg) return;
  const body = msg.querySelector('.tw-msg-member-body');
  if (!body) return;

  const filesWrap = document.createElement('div');
  filesWrap.className = 'tw-msg-files';
  (files || []).forEach(f => {
    const fObj = typeof f === 'string' ? { path: f, status: 'added' } : f;
    const badge = document.createElement('div');
    badge.className = 'tw-msg-file-badge' + (fObj.status === 'updated' ? ' updated' : '');
    badge.textContent = `${fObj.status === 'updated' ? '~' : '+'} ${fObj.path}`;
    filesWrap.appendChild(badge);
  });
  body.appendChild(filesWrap);
  twChatAutoScroll();
}

function twSetSidebarMemberStatus(memberId, status) {
  const el = document.querySelector(`#twMembersList .tw-member-item[data-member-id="${memberId}"] .tw-member-item-status`);
  if (!el) return;
  el.className = 'tw-member-item-status';
  if (status === 'working') el.classList.add('working');
  else if (status === 'done') el.classList.add('done');
  else if (status === 'error') el.classList.add('error');
}

function twToggleSidebar(forceState) {
  const sidebar = document.getElementById('twMembersSidebar');
  if (!sidebar) return;
  const shouldCollapse = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('collapsed');
  twSidebarCollapsed = shouldCollapse;
  if (shouldCollapse) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.remove('collapsed');
  }
}

function twAddCoordinatorMessage(text) {
  twHideWelcome();
  const inner = twGetChatInner();
  if (!inner) return;
  const row = document.createElement('div');
  row.className = 'tw-msg-coordinator';

  const header = document.createElement('div');
  header.className = 'tw-msg-coordinator-header';
  const meta = getCurrentModelDisplayMeta();
  header.innerHTML = `<img src="b-icon.png" alt="Bambam"><span class="coord-name">Bambam</span><span class="coord-badge">${meta.badge}</span>`;

  const textEl = document.createElement('div');
  textEl.className = 'tw-msg-coordinator-text';
  textEl.textContent = text;

  row.appendChild(header);
  row.appendChild(textEl);
  inner.appendChild(row);
  twChatAutoScroll();
}

// ===== TODO PANEL =====
function twToggleTodoPanel() {
  const panel = document.getElementById('twTodoPanel');
  if (!panel) return;
  twTodoExpanded = !twTodoExpanded;
  if (twTodoExpanded) {
    panel.classList.remove('collapsed');
  } else {
    panel.classList.add('collapsed');
  }
}

function twShowTodoPanel() {
  const panel = document.getElementById('twTodoPanel');
  if (panel) panel.style.display = '';
}

function twHideTodoPanel() {
  const panel = document.getElementById('twTodoPanel');
  if (panel) panel.style.display = 'none';
  twTodoItems = [];
}

function twAddTodoItems(memberId, steps) {
  const color = twGetMemberColor(memberId);
  const memberInfo = twCurrentTeam?.members?.find(m => m.id === memberId);
  const roleName = memberInfo?.role_name || 'Üye';
  steps.forEach((step, i) => {
    twTodoItems.push({
      id: `${memberId}-${i}`,
      memberId,
      text: typeof step === 'string' ? step : (step.description || step.title || `Adım ${i + 1}`),
      done: false,
      color,
      roleName
    });
  });
  twRenderTodoList();
  twShowTodoPanel();
}

function twMarkTodoDone(memberId, stepIndex) {
  const id = `${memberId}-${stepIndex - 1}`;
  const item = twTodoItems.find(t => t.id === id);
  if (item) item.done = true;
  twRenderTodoList();
}

function twMarkMemberTodosDone(memberId) {
  twTodoItems.forEach(t => {
    if (t.memberId === memberId) t.done = true;
  });
  twRenderTodoList();
}

function twRenderTodoList() {
  const list = document.getElementById('twTodoList');
  const countEl = document.getElementById('twTodoCount');
  if (!list) return;
  list.innerHTML = '';
  const total = twTodoItems.length;
  const doneCount = twTodoItems.filter(t => t.done).length;
  if (countEl) countEl.textContent = `${doneCount}/${total}`;

  twTodoItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'tw-todo-item' + (item.done ? ' done' : '');
    row.style.color = item.color;

    const circle = document.createElement('div');
    circle.className = 'tw-todo-circle';
    circle.style.borderColor = item.done ? item.color : item.color;

    const text = document.createElement('span');
    text.className = 'tw-todo-item-text';
    text.textContent = item.text;

    const member = document.createElement('span');
    member.className = 'tw-todo-item-member';
    member.textContent = item.roleName;

    row.appendChild(circle);
    row.appendChild(text);
    row.appendChild(member);
    list.appendChild(row);
  });
}

function twGetTodoSummary() {
  const done = twTodoItems.filter(t => t.done);
  const members = [...new Set(done.map(t => t.roleName))];
  return members;
}

function twRenderMembersSidebar(team) {
  const list = document.getElementById('twMembersList');
  if (!list || !team) return;
  list.innerHTML = '';
  (team.members || []).forEach(m => {
    const color = twGetMemberColor(m.id);
    const item = document.createElement('div');
    item.className = 'tw-member-item';
    item.dataset.memberId = m.id;
    item.onclick = () => twOpenMemberChatModal(m.id);

    const icon = document.createElement('div');
    icon.className = 'tw-member-item-icon';
    icon.style.borderLeft = `3px solid ${color}`;
    icon.textContent = m.icon || '🤖';

    const info = document.createElement('div');
    info.className = 'tw-member-item-info';
    const name = document.createElement('div');
    name.className = 'tw-member-item-name';
    name.style.color = color;
    name.textContent = m.role_name;
    const desc = document.createElement('div');
    desc.className = 'tw-member-item-desc';
    desc.textContent = m.description || 'Takım üyesi';
    info.appendChild(name);
    info.appendChild(desc);

    const status = document.createElement('div');
    status.className = 'tw-member-item-status';

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(status);
    list.appendChild(item);
  });
}

function twOpenMemberChatModal(memberId) {
  if (!twCurrentTeam || !memberId) return;
  twOpenMemberModalId = memberId;
  const member = (twCurrentTeam.members || []).find((m) => m.id === memberId);
  const overlay = document.getElementById('twMemberChatOverlay');
  const content = document.getElementById('twMemberModalContent');
  const input = document.getElementById('twMemberModalInput');
  if (!overlay || !content || !member) return;
  document.getElementById('twMemberModalIcon').textContent = member.icon || '🤖';
  document.getElementById('twMemberModalTitle').textContent = member.role_name;
  document.getElementById('twMemberModalDesc').textContent = member.description || member.model || '';
  content.innerHTML = '<div class="tw-member-chat-messages"><div class="tw-modal-placeholder" style="color:var(--muted);text-align:center;padding:20px;">Mesajlar yükleniyor...</div></div>';
  // Load member messages from API
  api.getMemberMessages(twCurrentTeam.id, memberId).then(messages => {
    const wrap = document.createElement('div');
    wrap.className = 'tw-member-chat-messages';
    content.innerHTML = '';
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        wrap.appendChild(createStandaloneMessageRow(msg.content, msg.role === 'user' ? 'user' : 'bot', [], msg.modelName || member.model));
      });
      content.appendChild(wrap);
      twAutoScroll(content);
    } else {
      wrap.innerHTML = '<div class="tw-modal-placeholder" style="color:var(--muted);text-align:center;padding:20px;">Henüz mesaj yok.</div>';
      content.appendChild(wrap);
    }
  }).catch(() => {
    content.innerHTML = '<div class="tw-member-chat-messages"><div class="tw-modal-placeholder" style="color:var(--muted);text-align:center;padding:20px;">Henüz mesaj yok.</div></div>';
  });
  overlay.classList.add('active');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function twGetMemberChatWrap() {
  const content = document.getElementById('twMemberModalContent');
  if (!content) return null;
  let wrap = content.querySelector('.tw-member-chat-messages');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'tw-member-chat-messages';
    content.innerHTML = '';
    content.appendChild(wrap);
  }
  return wrap;
}

function twCloseMemberChatModal() {
  twOpenMemberModalId = null;
  const overlay = document.getElementById('twMemberChatOverlay');
  if (overlay) overlay.classList.remove('active');
}

function twResetWorkspaceForProjectChange() {
  if (!twCurrentTeam) return;
  twCurrentRunId = null;
  twChatState = [];

  // Reset chat area
  const scroll = document.getElementById('twChatMessages');
  if (scroll) {
    scroll.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'tw-chat-inner';
    const welcome = document.createElement('div');
    welcome.className = 'tw-chat-welcome';
    welcome.id = 'twChatWelcome';
    welcome.innerHTML = '<div class="tw-chat-welcome-icon">🚀</div><div class="tw-chat-welcome-title">Takıma görev verin</div><div class="tw-chat-welcome-sub">Ne yapmalarını istediğinizi yazın, takım hemen çalışmaya başlasın.</div>';
    inner.appendChild(welcome);
    scroll.appendChild(inner);
  }

  // Reset sidebar member statuses
  (twCurrentTeam.members || []).forEach(m => {
    twSetSidebarMemberStatus(m.id, 'idle');
  });

  const projectPanel = document.getElementById('twProjectPanel');
  const preview = document.getElementById('twPreviewFrame');
  const editorBtn = document.getElementById('twEditorBtn');
  if (projectPanel) {
    projectPanel.classList.remove('tw-open');
    projectPanel.style.display = 'none';
  }
  if (preview) preview.src = 'about:blank';
  if (editorBtn) {
    editorBtn.style.background = 'var(--bg)';
    editorBtn.style.color = 'var(--text)';
  }

  twEditorCleanup();
  twClearRuntimeDraftFiles();
  twAttachedFiles = [];
  twUpdateAttachmentPreview();
  twPersistCurrentWorkspaceState();
}

function twPersistCurrentWorkspaceState() {
  if (!twCurrentTeam) return;
  const scroll = document.getElementById('twChatMessages');
  const panel = document.getElementById('twProjectPanel');

  twSaveWorkspaceState(twCurrentTeam.id, {
    version: 3,
    runId: twCurrentRunId || null,
    chatHtml: scroll ? scroll.innerHTML : '',
    memberColors: twMemberColorMap,
    projectPanelOpen: panel ? panel.style.display === 'flex' : false,
    currentProjectId: twCurrentProject?.id || null,
    savedAt: Date.now()
  });
}

function twRestoreWorkspaceState(team) {
  const state = twLoadWorkspaceState(team?.id);
  if (!state || state.version < 3) return false;

  const scroll = document.getElementById('twChatMessages');
  if (scroll && state.chatHtml) {
    scroll.innerHTML = state.chatHtml;
    // Re-attach section toggle handlers
    scroll.querySelectorAll('.tw-msg-section-header').forEach(header => {
      header.onclick = () => header.parentElement.classList.toggle('open');
    });
  }

  if (state.memberColors) {
    twMemberColorMap = state.memberColors;
  }

  twCurrentRunId = state.runId || null;
  if (state.projectPanelOpen && twCurrentProject) {
    const projectPanel = document.getElementById('twProjectPanel');
    if (projectPanel) {
      clearTimeout(twProjectHideTimer);
      projectPanel.style.display = 'flex';
      requestAnimationFrame(() => projectPanel.classList.add('tw-open'));
    }
    const editorBtn = document.getElementById('twEditorBtn');
    if (editorBtn) {
      editorBtn.style.background = 'var(--accent)';
      editorBtn.style.color = '#fff';
    }
    twSchedulePreviewRefresh();
  }

  return true;
}

async function loadTeamList() {
  const list = document.getElementById('teamList');
  if (!list) return;
  try {
    const teams = await api.listTeams();
    if (!teams || teams.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = teams.map(t => `
      <div class="team-group" id="tg-${t.id}">
        <div class="chat-item" title="${t.description || t.name}" style="justify-content:space-between;gap:8px;">
          <button onclick="openTeamWorkspace('${t.id}')" style="flex:1;background:none;border:none;color:inherit;text-align:left;font:inherit;cursor:pointer;padding:0;overflow:hidden;">
            <span class="chat-item-title">${t.name}</span>
          </button>
          <button onclick="toggleTeamMembers('${t.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:0 2px;display:flex;align-items:center;">
            <span class="team-arrow" id="ta-${t.id}" style="font-size:10px;transition:transform 0.2s;">▶</span>
          </button>
        </div>
        <div class="team-members-list" id="tm-${t.id}" style="display:none;padding-left:12px;">
          ${(t.members||[]).map(m => `
            <button class="chat-item team-member-btn" id="tmb-${m.id}" onclick="switchToMemberChat('${t.id}','${m.id}')" style="font-size:12px;padding:7px 10px;background:transparent;border:none;gap:6px;align-items:center;">
              <span style="font-size:14px;">${m.icon||'🤖'}</span>
              <span class="chat-item-title" style="font-size:12px;flex:1;">${m.role_name}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Load team list error:', e);
  }
}

function toggleTeamMembers(teamId) {
  const membersList = document.getElementById(`tm-${teamId}`);
  const arrow = document.getElementById(`ta-${teamId}`);
  if (!membersList) return;
  const isOpen = membersList.style.display !== 'none';
  membersList.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function twRenderProjectGate(projects = [], activeProject = null) {
  const gate = document.getElementById('twProjectGate');
  const list = document.getElementById('twProjectSelectList');
  const label = document.getElementById('twProjectName');
  const hint = document.getElementById('twProjectGateHint');
  const projectBtn = document.getElementById('twProjectBtn');
  if (!gate || !list) return;

  twCurrentProject = activeProject || null;
  label.textContent = twCurrentProject ? `/ ${twCurrentProject.name}` : '/ Proje seçilmedi';
  if (hint) {
    hint.textContent = twCurrentProject
      ? 'Bu takım için projeleri yönetebilir, aktif projeyi değiştirebilir veya silebilirsin.'
      : 'Workspace kullanmadan önce bu takım için bir proje seç veya oluştur.';
  }
  gate.style.display = (!twCurrentProject || twProjectsManagerOpen) ? 'flex' : 'none';
  if (projectBtn) {
    projectBtn.style.background = twProjectsManagerOpen ? 'var(--accent)' : 'var(--bg)';
    projectBtn.style.color = twProjectsManagerOpen ? '#fff' : 'var(--text)';
  }
  if (!projects.length) {
    list.innerHTML = '<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);font-size:13px;">Henüz proje yok. Aşağıdan ilk projeni oluştur.</div>';
    return;
  }

  list.innerHTML = projects.map((project) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--sidebar-bg);">
      <div>
        <div style="font-weight:600;font-size:13px;">${project.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">${project.is_active ? 'Aktif proje' : 'Projeyi workspace için seçebilirsin'}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="twSelectProject('${project.id}')" style="padding:8px 12px;background:var(--accent);border:none;border-radius:8px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;">Projeye Gir</button>
        <button onclick="twDeleteProject('${project.id}')" style="padding:8px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;font-family:inherit;font-size:12px;">Sil</button>
      </div>
    </div>
  `).join('');
}

function twToggleProjectsManager(forceOpen) {
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !twProjectsManagerOpen;
  if (!twCurrentProject && !nextOpen) return;
  twProjectsManagerOpen = nextOpen;
  twRenderProjectGate(twCurrentTeam?.projects || [], twCurrentProject);
}

async function twLoadProjectGate() {
  if (!twCurrentTeam) return;
  const result = await api.listTeamProjects(twCurrentTeam.id);
  if (!result.active_project && (result.projects || []).length > 0) {
    const activated = await api.activateTeamProject(twCurrentTeam.id, result.projects[0].id);
    twCurrentTeam.projects = activated.projects || [];
    twCurrentTeam.active_project = activated.project || null;
    twRenderProjectGate(twCurrentTeam.projects, twCurrentTeam.active_project);
    return;
  }
  twCurrentTeam.projects = result.projects || [];
  twCurrentTeam.active_project = result.active_project || null;
  twRenderProjectGate(twCurrentTeam.projects, twCurrentTeam.active_project);
}

async function twCreateProject() {
  if (!twCurrentTeam) return;
  const input = document.getElementById('twNewProjectInput');
  const name = input.value.trim();
  if (!name) return;
  const result = await api.createTeamProject(twCurrentTeam.id, name);
  twCurrentTeam.projects = result.projects || [];
  twCurrentProject = result.project || null;
  twCurrentTeam.active_project = twCurrentProject;
  twProjectsManagerOpen = false;
  input.value = '';
  twResetWorkspaceForProjectChange();
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
  twSchedulePreviewRefresh();
}

async function twSelectProject(projectId) {
  if (!twCurrentTeam) return;
  if (twCurrentProject && twCurrentProject.id === projectId) return;
  const result = await api.activateTeamProject(twCurrentTeam.id, projectId);
  twCurrentTeam.projects = result.projects || [];
  twCurrentProject = result.project || null;
  twCurrentTeam.active_project = twCurrentProject;
  twProjectsManagerOpen = false;
  twResetWorkspaceForProjectChange();
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
  twSchedulePreviewRefresh();
}

async function twDeleteProject(projectId) {
  if (!twCurrentTeam) return;
  const result = await api.deleteTeamProject(twCurrentTeam.id, projectId);
  twCurrentTeam.projects = result.projects || [];
  twCurrentProject = result.active_project || null;
  twCurrentTeam.active_project = twCurrentProject;
  twProjectsManagerOpen = !twCurrentProject;
  twResetWorkspaceForProjectChange();
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
  if (twCurrentProject) twSchedulePreviewRefresh();
}

if (twAttachBtn && twFileInput) {
  twAttachBtn.addEventListener("click", () => twFileInput.click());
  twFileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!twAttachedFiles.find((f) => f.name === file.name && f.size === file.size)) {
        twAttachedFiles.push(file);
      }
    });
    twUpdateAttachmentPreview();
    twFileInput.value = "";
  });
}

if (twMasterInputEl) {
  twMasterInputEl.addEventListener("input", twAutoResizeTextarea);
  twMasterInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMasterPrompt();
    }
  });
  twAutoResizeTextarea();
}

function twUpdateAttachmentPreview() {
  if (!twAttachmentPreview) return;
  if (twAttachedFiles.length === 0) {
    twAttachmentPreview.classList.remove("has-files");
    twAttachmentPreview.innerHTML = "";
    return;
  }

  twAttachmentPreview.classList.add("has-files");
  twAttachmentPreview.innerHTML = "";
  twAttachedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    if (file.type.startsWith("image/")) {
      item.className = "attachment-item image-item";
      const reader = new FileReader();
      reader.onload = (e) => {
        item.innerHTML = `
          <img src="${e.target.result}" class="attachment-image-preview" alt="${file.name}">
          <div class="attachment-item-actions">
            <button class="attachment-item-btn attachment-item-remove" onclick="twRemoveAttachment(${index})" title="Remove">×</button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else {
      item.className = "attachment-item file-item";
      item.innerHTML = `
        <span>📄</span>
        <span class="attachment-item-name" title="${file.name}">${file.name}</span>
        <button class="attachment-item-btn attachment-item-remove" onclick="twRemoveAttachment(${index})">×</button>
      `;
    }
    twAttachmentPreview.appendChild(item);
  });
}

function twRemoveAttachment(index) {
  twAttachedFiles.splice(index, 1);
  twUpdateAttachmentPreview();
}

async function twBuildAttachmentsPayload() {
  const payload = [];
  for (const file of twAttachedFiles) {
    if (file.type.startsWith("image/")) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result || "");
        reader.readAsDataURL(file);
      });
      payload.push({ name: file.name, type: file.type, content: String(dataUrl || "") });
    } else {
      const text = await file.text().catch(() => "");
      payload.push({ name: file.name, type: file.type || "application/octet-stream", content: text });
    }
  }
  return payload;
}

async function switchToMemberChat(teamId, memberId) {
  let team;
  try { team = await api.getTeam(teamId); } catch(e) { console.error(e); return; }
  const member = (team.members||[]).find(m => m.id === memberId);
  if (!member) return;

  activeTeamMember = {
    teamId: team.id,
    teamName: team.name,
    memberId: member.id,
    roleName: member.role_name,
    icon: member.icon || '🤖',
    model: member.model || 'gpt-4o-mini',
    chatId: member.chat_id,
    description: member.description || ''
  };

  // Sidebar active state
  document.querySelectorAll('.team-member-btn').forEach(b => b.style.background = 'transparent');
  const btn = document.getElementById(`tmb-${memberId}`);
  if (btn) btn.style.background = 'rgba(139,92,246,0.15)';

  const overlay = document.getElementById('memberSettingsOverlay');
  if (overlay) overlay.classList.add('active');
  document.getElementById('memberChatIcon').textContent = member.icon || '🤖';
  document.getElementById('memberChatName').textContent = member.role_name;
  document.getElementById('memberChatDesc').textContent = member.description || member.model || '';
  renderMemberSettings(member, team.members || []);
  const roleInput = document.getElementById('memberSettingsRole');
  if (roleInput) roleInput.focus();
}

function closeMemberChat() {
  activeTeamMember = null;
  const overlay = document.getElementById('memberSettingsOverlay');
  if (overlay) overlay.classList.remove('active');
  document.querySelectorAll('.team-member-btn').forEach(b => b.style.background = 'transparent');
}

function renderMemberSettings(member, members) {
  const roleEl = document.getElementById('memberSettingsRole');
  const iconEl = document.getElementById('memberSettingsIcon');
  const descEl = document.getElementById('memberSettingsDesc');
  const promptEl = document.getElementById('memberSettingsPrompt');
  const depsEl = document.getElementById('memberSettingsDeps');
  if (!roleEl || !depsEl) return;

  roleEl.value = member.role_name || '';
  iconEl.value = member.icon || '🤖';
  descEl.value = member.description || '';
  promptEl.value = member.system_prompt || '';
  const selected = new Set(member.depends_on || []);
  const options = (members || []).filter((m) => m.id !== member.id);
  depsEl.innerHTML = options.length ? options.map((m) => `
    <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:rgba(255,255,255,0.03);font-size:12px;">
      <input type="checkbox" value="${m.id}" ${selected.has(m.id) ? 'checked' : ''}>
      ${m.icon || '🤖'} ${m.role_name}
    </label>
  `).join('') : '<div style="font-size:12px;color:var(--muted);">Bu üye için seçilebilir bağımlılık yok.</div>';
}

async function saveMemberSettings() {
  if (!activeTeamMember) return;
  const payload = {
    role_name: document.getElementById('memberSettingsRole').value.trim(),
    icon: document.getElementById('memberSettingsIcon').value.trim() || '🤖',
    description: document.getElementById('memberSettingsDesc').value.trim(),
    system_prompt: document.getElementById('memberSettingsPrompt').value.trim(),
  };
  const depends_on = [...document.querySelectorAll('#memberSettingsDeps input:checked')].map((el) => el.value);
  try {
    const updated = await api.updateMemberModel(activeTeamMember.teamId, activeTeamMember.memberId, undefined, depends_on, payload);
    activeTeamMember.roleName = updated.role_name;
    activeTeamMember.icon = updated.icon;
    activeTeamMember.description = updated.description || '';
    document.getElementById('memberChatIcon').textContent = updated.icon || '🤖';
    document.getElementById('memberChatName').textContent = updated.role_name;
    document.getElementById('memberChatDesc').textContent = updated.description || updated.model || '';
    await loadTeamsToSidebar();
    await switchToMemberChat(activeTeamMember.teamId, activeTeamMember.memberId);
  } catch (e) {
    console.error('Save member settings error:', e);
  }
}

(function initMemberSettingsOverlayHandlers() {
  const overlay = document.getElementById('memberSettingsOverlay');
  if (!overlay) return;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeMemberChat();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('active')) {
      closeMemberChat();
    }
  });
})();

(function initWorkspaceMemberModalHandlers() {
  const overlay = document.getElementById('twMemberChatOverlay');
  const input = document.getElementById('twMemberModalInput');
  if (!overlay) return;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) twCloseMemberChatModal();
  });
  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (twOpenMemberModalId) twSendMemberChat(twOpenMemberModalId, true);
      }
    });
  }
})();

async function openTeamWorkspace(teamId) {
  try {
    closeMemberChat();
    const team = await api.getTeam(teamId);
    if (!team) return;
    twCurrentTeam = team;
    twCurrentProject = team.active_project || null;
    twCurrentRunId = null;
    twToggleCollabPanel(false);
    twProjectsManagerOpen = !twCurrentProject;

    // Assign member colors
    twAssignMemberColors(team.members);

    // Update header info
    document.getElementById('twTeamName').textContent = team.name;
    const twSelected = document.getElementById('twSelectedModelName');
    const selectedModel = getModelById(selectedModelId);
    if (twSelected) twSelected.innerHTML = formatModelLabelHtml(selectedModel?.name || 'Bambam 1.2 Lite');
    renderTwModelDropdown();
    document.getElementById('twProjectName').textContent = team.active_project ? `/ ${team.active_project.name}` : '/ Proje seç';
    document.getElementById('twTeamDesc').textContent = team.description || '';
    document.getElementById('twMasterInput').value = '';
    if (twMasterInputEl) twAutoResizeTextarea();
    twAttachedFiles = [];
    twUpdateAttachmentPreview();

    // Render members sidebar
    twRenderMembersSidebar(team);

    // Show workspace
    const ws = document.getElementById('teamWorkspace');
    clearTimeout(twWorkspaceHideTimer);
    ws.style.display = 'flex';
    requestAnimationFrame(() => ws.classList.add('tw-visible'));

    await twLoadProjectGate();

    // Restore previous state or show welcome
    const restored = twRestoreWorkspaceState(team);
    if (!restored) {
      twResetWorkspaceForProjectChange();
    }

  } catch(e) { console.error('[TW] openTeamWorkspace error:', e); }
}

function closeTeamWorkspace() {
  const ws = document.getElementById('teamWorkspace');
  const body = document.getElementById('twBody');
  twPersistCurrentWorkspaceState();
  clearTimeout(twWorkspaceHideTimer);
  ws.classList.remove('tw-visible');
  if (body) body.classList.remove('tw-code-open');
  twWorkspaceHideTimer = setTimeout(() => {
    ws.style.display = 'none';
  }, 220);
  twCurrentTeam = null;
  twCurrentProject = null;
  twCurrentRunId = null;
  twProjectsManagerOpen = false;
  twAttachedFiles = [];
  twUpdateAttachmentPreview();
  twToggleCollabPanel(false);
}

async function twSendMemberChat(memberId, useModal = false) {
  if (!twCurrentTeam) return;
  const input = document.getElementById('twMemberModalInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  const content = document.getElementById('twMemberModalContent');
  if (!content) return;
  const wrap = twGetMemberChatWrap();
  if (!wrap) return;

  // Clear placeholder text
  const placeholder = content.querySelector('.tw-modal-placeholder');
  if (placeholder) placeholder.remove();

  const userRow = createStandaloneMessageRow(message, 'user');
  wrap.appendChild(userRow);

  const botRowWrap = createStandaloneMessageRow('Thinking...', 'bot', [], getModelById(selectedModelId)?.name || null);
  const botRow = botRowWrap.querySelector('.message.bot');
  wrap.appendChild(botRowWrap);
  twAutoScroll(content);

  const model = selectedModelId || 'bambam:lite';

  try {
    const response = await api.sendTeamChat(twCurrentTeam.id, memberId, message, model);
    if (!response.ok) {
      const textEl = botRow.querySelector('.message-text');
      if (textEl) textEl.textContent = 'Hata: ' + (await response.text());
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const textEl = botRow.querySelector('.message-text');
    if (textEl) textEl.textContent = 'Thinking...';
    let fullResponse = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      const live = extractLiveProgressText(fullResponse, 140);
      if (textEl) textEl.textContent = live ? `Thinking... ${live}` : 'Thinking...';
      twAutoScroll(content);
    }
    if (textEl) renderAgentStructuredContent(textEl, fullResponse, true);
  } catch (e) {
    const textEl = botRow.querySelector('.message-text');
    if (textEl) textEl.textContent = 'Hata: ' + e.message;
  }
}

// Helper: smart auto-scroll — sadece kullanıcı en alttaysa scroll yap
function twAutoScroll(el) {
  if (!el) return;
  const threshold = 60;
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  if (isNearBottom) el.scrollTop = el.scrollHeight;
}


function twSetCollabEmpty(containerId, text) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="tw-collab-empty">${text}</div>`;
}

function twRenderCollabCards(containerId, items, mapper) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<div class="tw-collab-empty">Kayıt yok.</div>';
    return;
  }
  el.innerHTML = items.map(mapper).join('');
}

async function twHandleProposalAction(action, proposalId) {
  if (!twCurrentTeam || !proposalId) return;
  try {
    if (action === 'approve') {
      await api.approveProposal(twCurrentTeam.id, proposalId);
      twAddSystemMessage(`✅ Proposal onaylandı: ${proposalId.slice(0, 8)}`, 'success');
    } else {
      await api.rejectProposal(twCurrentTeam.id, proposalId);
      twAddSystemMessage(`🗑️ Proposal reddedildi: ${proposalId.slice(0, 8)}`);
    }
    await twRefreshCollabPanel();
    twSchedulePreviewRefresh();
  } catch (error) {
    twAddSystemMessage(`❌ ${error.message}`, 'error');
  }
}

function twToggleCollabPanel(forceOpen) {
  const panel = document.getElementById('twCollabPanel');
  if (!panel) return;
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !twCollabPanelOpen;
  twCollabPanelOpen = nextOpen;
  panel.style.display = nextOpen ? 'flex' : 'none';
  if (nextOpen) {
    twRefreshCollabPanel();
  }
}

async function twRefreshCollabPanel() {
  if (!twCurrentTeam) return;
  if (!twCurrentRunId) {
    document.getElementById('twCollabMeta').textContent = 'Henüz run yok.';
    twSetCollabEmpty('twCollabMemory', 'Master prompt çalıştırıldığında shared memory burada görünecek.');
    twSetCollabEmpty('twCollabMessages', 'Agent handoff mesajları burada görünecek.');
    twSetCollabEmpty('twCollabDeps', 'Dependency graph burada görünecek.');
    twSetCollabEmpty('twCollabProposals', 'File proposal kayıtları burada görünecek.');
    return;
  }

  try {
    const run = await api.getTeamRun(twCurrentTeam.id, twCurrentRunId);
    document.getElementById('twCollabMeta').textContent = `Run ${String(run.id || '').slice(0, 8)} • ${run.status || 'running'}`;

    twRenderCollabCards('twCollabMemory', run.memory || [], (item) => `
      <div class="tw-collab-card">
        <div class="tw-collab-card-head">
          <span class="tw-collab-card-title">${item.title || item.memory_type || 'Not'}</span>
          <span class="tw-collab-badge">${item.memory_type || 'memory'}</span>
        </div>
        <div class="tw-collab-card-body">${escapeHtml(item.content || '')}</div>
      </div>
    `);

    twRenderCollabCards('twCollabMessages', run.messages || [], (item) => `
      <div class="tw-collab-card">
        <div class="tw-collab-card-head">
          <span class="tw-collab-card-title">${escapeHtml(item.subject || item.message_type || 'Mesaj')}</span>
          <span class="tw-collab-badge">${escapeHtml(item.message_type || 'message')}</span>
        </div>
        <div class="tw-collab-card-body">${escapeHtml(item.content || '')}</div>
      </div>
    `);

    twRenderCollabCards('twCollabDeps', run.dependencies || [], (item) => {
      const task = (run.tasks || []).find((t) => t.id === item.task_id);
      const dep = (run.tasks || []).find((t) => t.id === item.depends_on_task_id);
      return `
        <div class="tw-collab-card">
          <div class="tw-collab-card-head">
            <span class="tw-collab-card-title">${escapeHtml(task?.title || 'Task')}</span>
            <span class="tw-collab-badge">${escapeHtml(item.dependency_type || 'hard')}</span>
          </div>
          <div class="tw-collab-card-meta">Bekliyor: ${escapeHtml(dep?.title || item.depends_on_task_id || '-')}</div>
        </div>
      `;
    });

    twRenderCollabCards('twCollabProposals', run.proposals || [], (item) => `
      <div class="tw-collab-card">
        <div class="tw-collab-card-head">
          <span class="tw-collab-card-title">${escapeHtml(item.file_path || 'Dosya')}</span>
          <span class="tw-collab-badge ${item.status === 'conflict' ? 'conflict' : item.status === 'applied' ? 'applied' : ''}">${escapeHtml(item.status || 'pending')}</span>
        </div>
        <div class="tw-collab-card-meta">Task: ${escapeHtml(item.task_id ? item.task_id.slice(0, 8) : '-')}</div>
        ${['pending', 'conflict'].includes(item.status) ? `
          <div class="tw-collab-card-actions">
            <button class="approve" onclick="twHandleProposalAction('approve','${item.id}')">Approve</button>
            <button class="reject" onclick="twHandleProposalAction('reject','${item.id}')">Reject</button>
          </div>
        ` : ''}
      </div>
    `);
  } catch (error) {
    document.getElementById('twCollabMeta').textContent = `Run verisi yüklenemedi: ${error.message}`;
  }
}

async function sendMasterPrompt() {
  if (twSending || !twCurrentTeam) return;
  if (!twCurrentProject) {
    twRenderProjectGate(twCurrentTeam.projects || [], null);
    return;
  }
  const input = document.getElementById('twMasterInput');
  const message = input.value.trim();
  if (!message) return;

  twSending = true;
  stopConnectivityPolling();
  const btn = document.getElementById('twSendBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="arrow">…</span>';
  const attachmentPayload = await twBuildAttachmentsPayload();
  input.value = '';
  twAutoResizeTextarea();

  const teamRef = twCurrentTeam;

  // Add user message to chat
  twAddUserMessage(message);

  // Mark all members as working
  (teamRef.members || []).forEach(m => {
    twSetSidebarMemberStatus(m.id, 'working');
  });
  twPersistCurrentWorkspaceState();

  // Cache member info
  const memberInfo = {};
  (teamRef.members || []).forEach(m => {
    memberInfo[m.id] = { role_name: m.role_name, icon: m.icon || '🤖' };
  });

  let hasExtracted = false;
  let hasPlanned = false;
  const workingMembers = new Set();
  twHideTodoPanel();

  try {
    const response = await api.sendMasterPromptStream(teamRef.id, message, selectedModelId, attachmentPayload);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        const mid = event.member_id;
        const info = mid ? memberInfo[mid] : null;

        switch (event.type) {
          case 'start':
            (event.members || []).forEach(m => {
              memberInfo[m.id] = { role_name: m.role_name, icon: m.icon || '🤖' };
            });
            twCurrentRunId = event.run_id || null;
            twAddCoordinatorMessage(event.coordinator_message || 'Projenizi inceliyorum, hemen başlıyorum...');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'planning':
            if (!hasPlanned) {
              hasPlanned = true;
              twAddCoordinatorMessage('Görevleri planlıyorum ve takıma dağıtıyorum...');
            }
            break;

          case 'task_blocked':
            if (info) twSetMemberMsgBadge(mid, 'bekliyor');
            twSetSidebarMemberStatus(mid, 'idle');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'task_unblocked':
            if (info) twSetMemberMsgBadge(mid, 'çalışıyor...');
            twSetSidebarMemberStatus(mid, 'working');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'agent_message':
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'task_started':
            twSetSidebarMemberStatus(mid, 'working');
            break;

          case 'skipped':
            if (info) twSetMemberMsgBadge(mid, 'atlandı');
            twSetSidebarMemberStatus(mid, 'done');
            break;

          case 'plan':
            if (info) {
              workingMembers.add(mid);
              twGetOrCreateMemberMsg(mid, info);
              twAddMemberPlanSection(mid, event.steps || [], info);
              twSetMemberMsgBadge(mid, `0/${event.total}`);
              twAddTodoItems(mid, event.steps || []);
            }
            break;

          case 'step_start':
            if (info) {
              twGetOrCreateStepSection(mid, event.step, event.total, event.description, info);
              twSetMemberMsgBadge(mid, `${event.step}/${event.total}`);
            }
            break;

          case 'delta':
            twUpdateStepDelta(mid, event.step, event.content || '');
            break;

          case 'step_done':
            twSetStepDone(mid, event.step);
            twMarkTodoDone(mid, event.step);
            if (info) {
              twSetMemberMsgBadge(mid, event.step === event.total ? 'tamamlandı ✓' : `${event.step}/${event.total}`);
            }
            break;

          case 'step_error':
            twSetStepError(mid, event.step, event.error);
            break;

          case 'files':
            if (event.files && event.files.length > 0) {
              const appliedFiles = event.files.filter(f => f.status !== 'conflict');
              const conflictedFiles = event.files.filter(f => f.status === 'conflict');
              if (appliedFiles.length > 0) {
                hasExtracted = true;
                twCommitAppliedDraftFiles(appliedFiles);
                if (info) twAddMemberFiles(mid, appliedFiles, info);
              }
              if (conflictedFiles.length > 0 && info) {
                twAddMemberText(mid, `⚠️ Conflict: ${conflictedFiles.map(f => f.path).join(', ')}`, info);
              }
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            if (document.getElementById('twProjectPanel')?.style.display === 'flex') {
              twEditorRefreshTree();
            }
            break;

          case 'file_conflict':
            if (info) twAddMemberText(mid, `🔒 ${event.path || 'Dosya'} başka bir görev tarafından kilitli.`, info);
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'member_done':
            twSetSidebarMemberStatus(mid, 'done');
            twMarkMemberTodosDone(mid);
            if (info) {
              twSetMemberMsgBadge(mid, 'tamamlandı ✓');
              if (workingMembers.has(mid)) {
                twAddCoordinatorMessage(`${info.role_name} görevini tamamladı. ✓`);
              }
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'error':
            twSetSidebarMemberStatus(mid, 'error');
            if (info) {
              twAddMemberText(mid, `❌ Hata: ${event.error || 'Bilinmeyen hata'}`, info);
              twSetMemberMsgBadge(mid, 'hata');
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'run_error':
            twAddSystemMessage(`❌ ${event.error || 'Run hatası'}`, 'error');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'all_done': {
            const completedMembers = twGetTodoSummary();
            const total = twTodoItems.length;
            const doneCount = twTodoItems.filter(t => t.done).length;
            let summary = `Tüm görevler tamamlandı!`;
            if (completedMembers.length > 0) {
              summary += ` ${completedMembers.join(', ')} başarıyla çalıştı.`;
            }
            if (total > 0) {
              summary += ` Toplam ${doneCount}/${total} adım tamamlandı.`;
            }
            summary += ' Projeniz hazır, inceleyebilirsiniz.';
            twAddCoordinatorMessage(summary);
            if (hasExtracted) twShowProjectPanel();
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;
          }

          case 'heartbeat':
            break;
        }

        twPersistCurrentWorkspaceState();
      }
    }
  } catch (error) {
    twAddSystemMessage(`❌ Bağlantı Hatası: ${error.message}`, 'error');
    (teamRef.members || []).forEach(m => {
      twSetSidebarMemberStatus(m.id, 'error');
    });
    twPersistCurrentWorkspaceState();
  } finally {
    twSending = false;
    btn.disabled = false;
    btn.innerHTML = '<span class="arrow">↑</span>';
    twAttachedFiles = [];
    twUpdateAttachmentPreview();
    twPersistCurrentWorkspaceState();
  }
}

// ===== MANUS-STYLE CODE EDITOR =====

let twEditorInstance = null;
let twEditorTabs = [];
let twEditorActiveTab = null;
let twEditorFiles = [];
let twEditorMonacoReady = false;
let twEditorSaveTimer = null;
let twEditorCurrentView = 'split';
let twRuntimeDraftFiles = {};
let twEditorHighlightDecorations = [];
let twPreviewRefreshTimer = null;

const TW_LANG_MAP = {
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.js': 'javascript', '.mjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.json': 'json',
  '.md': 'markdown', '.markdown': 'markdown',
  '.py': 'python',
  '.xml': 'xml', '.svg': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.sh': 'shell', '.bash': 'shell',
  '.sql': 'sql',
  '.php': 'php',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.txt': 'plaintext',
};

const TW_ICON_MAP = {
  '.html': '🌐', '.htm': '🌐',
  '.css': '🎨', '.scss': '🎨', '.less': '🎨',
  '.js': '📜', '.mjs': '📜', '.jsx': '⚛️',
  '.ts': '📘', '.tsx': '⚛️',
  '.json': '📋',
  '.md': '📝', '.markdown': '📝',
  '.py': '🐍',
  '.svg': '🖼️', '.png': '🖼️', '.jpg': '🖼️', '.gif': '🖼️',
  '.txt': '📄',
};

function twGetFileExt(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.substring(dot).toLowerCase() : '';
}
function twGetFileLang(path) { return TW_LANG_MAP[twGetFileExt(path)] || 'plaintext'; }
function twGetFileIcon(path) { return TW_ICON_MAP[twGetFileExt(path)] || '📄'; }
function twGetFileName(path) { return path.split('/').pop(); }

function twClearRuntimeDraftFiles() {
  twRuntimeDraftFiles = {};
}

function twIsPreviewReadyDraft(path, entry) {
  if (!entry || !entry.content) return false;
  if (entry.complete) return true;

  const content = String(entry.content || '');
  const lowerPath = String(path || '').toLowerCase();

  if (lowerPath.endsWith('.html')) {
    return /<body|<main|<div|<section|<header|<footer/i.test(content) && content.length > 120;
  }
  if (lowerPath.endsWith('.css')) {
    return /\{[^}]*$/m.test(content) || /\{[\s\S]*\}/m.test(content);
  }
  if (lowerPath.endsWith('.js')) {
    return content.length > 40 && /[;)}]$/.test(content.trim());
  }

  return content.length > 80;
}

function twShouldPromoteDraftToEditor(path, entry) {
  if (!entry || !entry.content) return false;
  return !!entry.complete;
}

function twBuildEffectiveEditorFiles(serverFiles = []) {
  const fileMap = new Map((serverFiles || []).map((file) => [file.path, file]));
  Object.keys(twRuntimeDraftFiles).forEach((path) => {
    if (!fileMap.has(path)) fileMap.set(path, { path, type: 'file' });
  });
  return Array.from(fileMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function twApplyRuntimeDrafts(rawText) {
  return;
}

function twBuildPreviewHtmlFromDrafts() {
  const htmlEntry = twRuntimeDraftFiles['index.html'];
  if (!htmlEntry || !htmlEntry.previewReady) return '';
  let output = htmlEntry.content;
  Object.entries(twRuntimeDraftFiles).forEach(([path, entry]) => {
    if (!entry || !entry.previewReady) return;
    const content = entry.content;
    if (path.endsWith('.css')) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp(`<link([^>]*href=["']${escaped}["'][^>]*)>`, 'gi'), `<style>\n${content}\n</style>`);
    }
    if (path.endsWith('.js')) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp(`<script([^>]*src=["']${escaped}["'][^>]*)><\\/script>`, 'gi'), `<script>\n${content}\n<\/script>`);
    }
  });
  return output;
}

function twCommitAppliedDraftFiles(files) {
  const applied = (files || []).filter((file) => file && file.path && file.status !== 'conflict');
  if (!applied.length) return;
  const latestPath = applied[applied.length - 1].path;

  twRuntimeDraftFiles = {};
  applied.forEach((file) => {
    const tab = twEditorTabs.find((entry) => entry.path === file.path && !entry.modified);
    if (tab) {
      tab.originalContent = tab.content;
    }
  });

  twEditorRefreshTree();
  if (latestPath) {
    setTimeout(() => twEditorOpenFile(latestPath), 0);
  }
  twSchedulePreviewRefresh();
}

// --- Monaco Init ---
function twInitMonaco(cb) {
  if (twEditorMonacoReady) { cb && cb(); return; }
  if (typeof require === 'undefined' || !require.config) {
    console.warn('[Editor] Monaco loader not available');
    return;
  }
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    twEditorMonacoReady = true;
    cb && cb();
  });
}

function twCreateEditor() {
  if (twEditorInstance) return;
  const container = document.getElementById('twEditorMonaco');
  if (!container) return;
  const welcome = container.querySelector('.tw-editor-welcome');
  if (welcome) welcome.style.display = 'none';

  twEditorInstance = monaco.editor.create(container, {
    value: '',
    language: 'plaintext',
    theme: 'vs-dark',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: true, maxColumn: 80 },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    padding: { top: 8 },
    lineNumbers: 'on',
    roundedSelection: true,
    renderLineHighlight: 'all',
  });

  twEditorInstance.onDidChangeModelContent(() => {
    if (!twEditorActiveTab) return;
    const tab = twEditorTabs.find(t => t.path === twEditorActiveTab);
    if (tab && !tab.modified) {
      tab.modified = true;
      twRenderEditorTabs();
    }
    twUpdateStatusBar();
    clearTimeout(twEditorSaveTimer);
    twEditorSaveTimer = setTimeout(() => twEditorSaveActive(), 2000);
  });

  twEditorInstance.onDidChangeCursorPosition((e) => {
    const pos = e.position;
    const el = document.getElementById('twEditorStatusCursor');
    if (el) el.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
  });

  twEditorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    twEditorSaveActive();
  });
}

// --- File Tree ---
async function twEditorRefreshTree() {
  if (!twCurrentTeam) return;
  try {
    const files = await api.listProjectFiles(twCurrentTeam.id);
    twEditorFiles = twBuildEffectiveEditorFiles(files || []);
    twRenderFileTree();
  } catch (e) {
    console.error('[Editor] File tree refresh error:', e);
  }
}

function twBuildFileTree(files) {
  const root = { name: '/', children: {}, files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children[dir]) node.children[dir] = { name: dir, children: {}, files: [] };
      node = node.children[dir];
    }
    node.files.push(f);
  }
  return root;
}

function twRenderFileTree() {
  const container = document.getElementById('twEditorFileTree');
  if (!container) return;
  container.innerHTML = '';
  const tree = twBuildFileTree(twEditorFiles);
  twRenderTreeNode(container, tree, 0, true);
}

function twRenderTreeNode(parent, node, depth, isRoot) {
  const sortedDirs = Object.keys(node.children).sort();
  const sortedFiles = [...node.files].sort((a, b) => twGetFileName(a.path).localeCompare(twGetFileName(b.path)));

  for (const dirName of sortedDirs) {
    const dir = node.children[dirName];
    const dirEl = document.createElement('div');
    const itemEl = document.createElement('div');
    itemEl.className = 'tw-ft-item folder';
    itemEl.style.paddingLeft = `${12 + depth * 16}px`;
    itemEl.innerHTML = `<span class="tw-ft-icon">▶</span><span class="tw-ft-name">${dirName}</span>`;
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tw-ft-children';

    itemEl.addEventListener('click', () => {
      const isOpen = childrenEl.classList.contains('open');
      childrenEl.classList.toggle('open');
      itemEl.querySelector('.tw-ft-icon').textContent = isOpen ? '▶' : '▼';
    });

    dirEl.appendChild(itemEl);
    dirEl.appendChild(childrenEl);
    parent.appendChild(dirEl);
    twRenderTreeNode(childrenEl, dir, depth + 1, false);
  }

  for (const file of sortedFiles) {
    const itemEl = document.createElement('div');
    itemEl.className = 'tw-ft-item';
    if (twEditorActiveTab === file.path) itemEl.classList.add('active');
    itemEl.style.paddingLeft = `${12 + depth * 16}px`;
    const icon = twGetFileIcon(file.path);
    const name = twGetFileName(file.path);
    itemEl.innerHTML = `<span class="tw-ft-icon">${icon}</span><span class="tw-ft-name">${name}</span><div class="tw-ft-item-actions"><button class="tw-ft-action-btn" title="Sil" data-delete="${file.path}">✕</button></div>`;

    itemEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete]')) {
        e.stopPropagation();
        twEditorDeleteFile(e.target.closest('[data-delete]').dataset.delete);
        return;
      }
      twEditorOpenFile(file.path);
    });

    parent.appendChild(itemEl);
  }

  if (isRoot && sortedDirs.length === 0 && sortedFiles.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px 12px;color:#858585;font-size:12px;text-align:center;';
    empty.textContent = 'Henüz dosya yok';
    parent.appendChild(empty);
  }
}

// --- Tabs ---
function twRenderEditorTabs() {
  const container = document.getElementById('twEditorTabs');
  if (!container) return;
  container.innerHTML = '';
  for (const tab of twEditorTabs) {
    const el = document.createElement('div');
    el.className = 'tw-etab' + (tab.path === twEditorActiveTab ? ' active' : '') + (tab.modified ? ' modified' : '');
    const icon = twGetFileIcon(tab.path);
    const name = twGetFileName(tab.path);
    el.innerHTML = `<span class="tw-etab-icon">${icon}</span><span class="tw-etab-name">${name}</span><span class="tw-etab-modified"></span><button class="tw-etab-close" data-close="${tab.path}">×</button>`;

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        e.stopPropagation();
        twEditorCloseTab(e.target.closest('[data-close]').dataset.close);
        return;
      }
      twEditorActivateTab(tab.path);
    });
    container.appendChild(el);
  }
}

async function twEditorOpenFile(path) {
  let tab = twEditorTabs.find(t => t.path === path);
  if (!tab) {
    try {
      const runtimeContent = twRuntimeDraftFiles[path];
      const data = runtimeContent && typeof runtimeContent.content === 'string'
        ? { content: runtimeContent.content }
        : await api.readProjectFile(twCurrentTeam.id, path);
      tab = { path, content: data.content || '', originalContent: data.content || '', modified: false };
      twEditorTabs.push(tab);
    } catch (e) {
      console.error('[Editor] Open file error:', e);
      return;
    }
  }
  twEditorActivateTab(path);
}

function twEditorActivateTab(path, options = {}) {
  const tab = twEditorTabs.find(t => t.path === path);
  if (!tab) return;

  if (twEditorActiveTab && twEditorActiveTab !== path) {
    const prev = twEditorTabs.find(t => t.path === twEditorActiveTab);
    if (prev && twEditorInstance) {
      prev.content = twEditorInstance.getValue();
      prev.viewState = twEditorInstance.saveViewState();
    }
  }

  twEditorActiveTab = path;
  twRenderEditorTabs();
  twHighlightActiveTreeItem();

  if (!twEditorInstance) {
    twInitMonaco(() => {
      twCreateEditor();
      twSetEditorContent(tab, options);
    });
  } else {
    twSetEditorContent(tab, options);
  }
  twUpdateStatusBar();
}

function twSetEditorContent(tab, options = {}) {
  if (!twEditorInstance) return;
  const lang = twGetFileLang(tab.path);
  const model = twEditorInstance.getModel();
  monaco.editor.setModelLanguage(model, lang);
  twEditorInstance.setValue(tab.content);
  if (tab.viewState) twEditorInstance.restoreViewState(tab.viewState);
  if (options.highlightLatest) {
    twHighlightLatestDraft(tab.content);
  } else {
    twClearEditorDraftHighlights();
  }
  twEditorInstance.focus();
}

function twClearEditorDraftHighlights() {
  if (!twEditorInstance) return;
  twEditorHighlightDecorations = twEditorInstance.deltaDecorations(twEditorHighlightDecorations, []);
}

function twHighlightLatestDraft(content) {
  if (!twEditorInstance || typeof monaco === 'undefined') return;
  const lines = String(content || '').split('\n');
  const startLine = Math.max(1, lines.length - 8);
  const endLine = Math.max(startLine, lines.length);
  twEditorHighlightDecorations = twEditorInstance.deltaDecorations(twEditorHighlightDecorations, [
    {
      range: new monaco.Range(startLine, 1, endLine, Math.max((lines[endLine - 1] || '').length + 1, 1)),
      options: {
        isWholeLine: true,
        className: 'tw-editor-live-line',
        linesDecorationsClassName: 'tw-editor-live-gutter'
      }
    }
  ]);
  twEditorInstance.revealLineInCenter(endLine);
}

function twEditorCloseTab(path) {
  const idx = twEditorTabs.findIndex(t => t.path === path);
  if (idx < 0) return;
  const tab = twEditorTabs[idx];
  if (tab.modified) {
    if (!confirm(`"${twGetFileName(path)}" kaydedilmemiş değişiklikler içeriyor. Kapatılsın mı?`)) return;
  }
  twEditorTabs.splice(idx, 1);

  if (twEditorActiveTab === path) {
    if (twEditorTabs.length > 0) {
      const next = twEditorTabs[Math.min(idx, twEditorTabs.length - 1)];
      twEditorActivateTab(next.path);
    } else {
      twEditorActiveTab = null;
      if (twEditorInstance) {
        twEditorInstance.setValue('');
        twEditorInstance.dispose();
        twEditorInstance = null;
      }
      const container = document.getElementById('twEditorMonaco');
      if (container) {
        const welcome = container.querySelector('.tw-editor-welcome');
        if (!welcome) {
          container.innerHTML = `<div class="tw-editor-welcome"><div style="font-size:28px;margin-bottom:8px;">◇</div><div style="font-size:14px;font-weight:600;">Bambam Code Editor</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Sol panelden bir dosya seçin veya yeni dosya oluşturun</div></div>`;
        } else {
          welcome.style.display = '';
        }
      }
      twUpdateStatusBar();
    }
  }
  twRenderEditorTabs();
}

function twHighlightActiveTreeItem() {
  const tree = document.getElementById('twEditorFileTree');
  if (!tree) return;
  tree.querySelectorAll('.tw-ft-item').forEach(el => el.classList.remove('active'));
  if (!twEditorActiveTab) return;
  tree.querySelectorAll('.tw-ft-item').forEach(el => {
    const nameEl = el.querySelector('.tw-ft-name');
    if (nameEl && !el.classList.contains('folder')) {
      const delBtn = el.querySelector('[data-delete]');
      if (delBtn && delBtn.dataset.delete === twEditorActiveTab) {
        el.classList.add('active');
      }
    }
  });
}

// --- Save ---
async function twEditorSaveActive() {
  if (!twEditorActiveTab || !twEditorInstance || !twCurrentTeam) return;
  const tab = twEditorTabs.find(t => t.path === twEditorActiveTab);
  if (!tab) return;

  const content = twEditorInstance.getValue();
  tab.content = content;
  const saveEl = document.getElementById('twEditorStatusSave');

  try {
    if (saveEl) saveEl.textContent = 'Kaydediliyor...';
    await api.writeProjectFile(twCurrentTeam.id, tab.path, content);
    tab.originalContent = content;
    tab.modified = false;
    twRenderEditorTabs();
    if (saveEl) saveEl.textContent = 'Kaydedildi ✓';
    twSchedulePreviewRefresh();
  } catch (e) {
    console.error('[Editor] Save error:', e);
    if (saveEl) saveEl.textContent = 'Kayıt hatası!';
  }
}

// --- Delete file ---
async function twEditorDeleteFile(path) {
  if (!twCurrentTeam) return;
  if (!confirm(`"${twGetFileName(path)}" dosyası silinecek. Emin misiniz?`)) return;
  try {
    await api.deleteProjectFile(twCurrentTeam.id, path);
    const tabIdx = twEditorTabs.findIndex(t => t.path === path);
    if (tabIdx >= 0) twEditorCloseTab(path);
    await twEditorRefreshTree();
    twSchedulePreviewRefresh();
  } catch (e) {
    console.error('[Editor] Delete error:', e);
    alert('Silme hatası: ' + e.message);
  }
}

// --- New file ---
function twEditorNewFile() {
  const panel = document.getElementById('twProjectPanel');
  if (!panel) return;
  let overlay = panel.querySelector('.tw-editor-newfile-overlay');
  if (overlay) { overlay.remove(); return; }

  overlay = document.createElement('div');
  overlay.className = 'tw-editor-newfile-overlay';
  overlay.innerHTML = `
    <div class="tw-editor-newfile-dialog">
      <div style="font-size:14px;font-weight:600;color:#cccccc;">Yeni Dosya Oluştur</div>
      <input type="text" id="twNewFilePathInput" placeholder="Dosya yolu (ör: src/app.js)" autocomplete="off" />
      <div class="tw-editor-newfile-actions">
        <button onclick="this.closest('.tw-editor-newfile-overlay').remove()">İptal</button>
        <button class="primary" onclick="twEditorCreateFile()">Oluştur</button>
      </div>
    </div>
  `;
  panel.appendChild(overlay);

  const input = overlay.querySelector('#twNewFilePathInput');
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); twEditorCreateFile(); }
    if (e.key === 'Escape') overlay.remove();
  });
}

async function twEditorCreateFile() {
  const input = document.getElementById('twNewFilePathInput');
  if (!input) return;
  const path = input.value.trim();
  if (!path) return;

  const overlay = input.closest('.tw-editor-newfile-overlay');
  try {
    await api.writeProjectFile(twCurrentTeam.id, path, '');
    if (overlay) overlay.remove();
    await twEditorRefreshTree();
    twEditorOpenFile(path);
  } catch (e) {
    alert('Dosya oluşturma hatası: ' + e.message);
  }
}

// --- View switch (code / preview) ---
function twEditorSwitchView(view) {
  twEditorCurrentView = view;
  const sidebar = document.getElementById('twEditorSidebar');
  const sidebarResize = document.getElementById('twEditorSidebarResize');
  const main = document.querySelector('.tw-editor-main');
  const splitResize = document.getElementById('twEditorSplitResize');
  const preview = document.getElementById('twEditorPreview');

  document.querySelectorAll('.tw-editor-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  if (view === 'split') {
    if (sidebar) sidebar.style.display = '';
    if (sidebarResize) sidebarResize.style.display = '';
    if (main) main.style.display = '';
    if (splitResize) splitResize.style.display = '';
    if (preview) { preview.style.display = ''; preview.style.width = '45%'; }
    twRefreshPreview();
  } else if (view === 'code') {
    if (sidebar) sidebar.style.display = '';
    if (sidebarResize) sidebarResize.style.display = '';
    if (main) main.style.display = '';
    if (splitResize) splitResize.style.display = 'none';
    if (preview) { preview.style.display = 'none'; preview.style.width = '0'; }
  } else {
    if (sidebar) sidebar.style.display = 'none';
    if (sidebarResize) sidebarResize.style.display = 'none';
    if (main) main.style.display = 'none';
    if (splitResize) splitResize.style.display = 'none';
    if (preview) { preview.style.display = ''; preview.style.width = '100%'; }
    twRefreshPreview();
  }
}

// --- Status bar ---
function twUpdateStatusBar() {
  const fileEl = document.getElementById('twEditorStatusFile');
  const langEl = document.getElementById('twEditorStatusLang');
  const saveEl = document.getElementById('twEditorStatusSave');
  if (!twEditorActiveTab) {
    if (fileEl) fileEl.textContent = 'Dosya seçilmedi';
    if (langEl) langEl.textContent = '—';
    if (saveEl) saveEl.textContent = '—';
    return;
  }
  if (fileEl) fileEl.textContent = twEditorActiveTab;
  if (langEl) langEl.textContent = twGetFileLang(twEditorActiveTab).toUpperCase();
  const tab = twEditorTabs.find(t => t.path === twEditorActiveTab);
  if (tab && tab.modified) {
    if (saveEl) saveEl.textContent = '● Değiştirildi';
  } else {
    if (saveEl) saveEl.textContent = 'Kaydedildi ✓';
  }
}

// --- Resize handles ---
function twInitEditorResizeHandles() {
  // Sidebar resize
  const sidebarResize = document.getElementById('twEditorSidebarResize');
  const sidebar = document.getElementById('twEditorSidebar');
  if (sidebarResize && sidebar) {
    let startX, startW;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      const newW = Math.max(140, Math.min(400, startW + dx));
      sidebar.style.width = newW + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    sidebarResize.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Split resize (code <-> preview)
  const splitResize = document.getElementById('twEditorSplitResize');
  const preview = document.getElementById('twEditorPreview');
  const editorBody = document.querySelector('.tw-editor-body');
  if (splitResize && preview && editorBody) {
    let startX2, startW2;
    const onMove2 = (e) => {
      const dx = startX2 - e.clientX;
      const bodyW = editorBody.offsetWidth;
      const newW = Math.max(200, Math.min(bodyW * 0.7, startW2 + dx));
      preview.style.width = newW + 'px';
    };
    const onUp2 = () => {
      document.removeEventListener('mousemove', onMove2);
      document.removeEventListener('mouseup', onUp2);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    splitResize.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX2 = e.clientX;
      startW2 = preview.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove2);
      document.addEventListener('mouseup', onUp2);
    });
  }
}

// --- Panel toggle ---
function twToggleProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twEditorBtn');
  const body = document.getElementById('twBody');
  if (!panel) return;
  const isOpen = panel.style.display === 'flex';
  if (isOpen) {
    clearTimeout(twProjectHideTimer);
    panel.classList.remove('tw-open');
    if (body) body.classList.remove('tw-code-open');
    twProjectHideTimer = setTimeout(() => { panel.style.display = 'none'; }, 350);
    btn.style.background = 'var(--bg)';
    btn.style.color = 'var(--text)';
    // Restore sidebar if user hadn't manually collapsed it
    if (!twSidebarCollapsed) twToggleSidebar(false);
  } else {
    clearTimeout(twProjectHideTimer);
    panel.style.display = 'flex';
    requestAnimationFrame(() => {
      if (body) body.classList.add('tw-code-open');
      panel.classList.add('tw-open');
    });
    btn.style.background = 'var(--accent)';
    btn.style.color = '#fff';
    // Auto-collapse sidebar
    twToggleSidebar(true);
    twInitMonaco(() => {
      twEditorSwitchView('split');
      twEditorRefreshTree();
      twSchedulePreviewRefresh();
      twInitEditorResizeHandles();
    });
  }
}

async function twShowProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twEditorBtn');
  const body = document.getElementById('twBody');
  if (!panel) return;
  clearTimeout(twProjectHideTimer);
  panel.style.display = 'flex';
  requestAnimationFrame(() => {
    if (body) body.classList.add('tw-code-open');
    panel.classList.add('tw-open');
  });
  btn.style.background = 'var(--accent)';
  btn.style.color = '#fff';
  twToggleSidebar(true);
  twInitMonaco(() => {
    twEditorSwitchView('split');
    twEditorRefreshTree();
    twSchedulePreviewRefresh();
    twInitEditorResizeHandles();
  });
}

function twRefreshPreview() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const frame = document.getElementById('twPreviewFrame');
  if (!frame) return;
  frame.classList.add('is-refreshing');
  const runtimeHtml = twBuildPreviewHtmlFromDrafts();
  if (runtimeHtml) {
    frame.srcdoc = runtimeHtml;
    setTimeout(() => frame.classList.remove('is-refreshing'), 120);
    return;
  }
  frame.removeAttribute('srcdoc');
  frame.src = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
  setTimeout(() => frame.classList.remove('is-refreshing'), 180);
}

function twSchedulePreviewRefresh() {
  clearTimeout(twPreviewRefreshTimer);
  twPreviewRefreshTimer = setTimeout(() => {
    twRefreshPreview();
  }, 120);
}

function twOpenFullPreview() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const url = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
  window.open(url, '_blank');
}

async function twDownloadProject() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const btn = document.getElementById('twDownloadBtn');
  btn.textContent = '⏳ ...';
  btn.disabled = true;
  try {
    const token = localStorage.getItem('bambam_token');
    const response = await fetch(`${api.baseUrl}/api/projects/${twCurrentTeam.id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      const err = await response.json();
      alert(err.detail || 'İndirme hatası');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (twCurrentTeam.name || 'project').replace(/\s+/g, '_') + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    alert('İndirme hatası: ' + e.message);
  } finally {
    btn.textContent = '📥 İndir';
    btn.disabled = false;
  }
}

// --- Cleanup when switching projects ---
function twEditorCleanup() {
  if (twEditorInstance) {
    twEditorInstance.dispose();
    twEditorInstance = null;
  }
  twEditorTabs = [];
  twEditorActiveTab = null;
  twEditorFiles = [];
  twClearRuntimeDraftFiles();
  clearTimeout(twEditorSaveTimer);
  const container = document.getElementById('twEditorMonaco');
  if (container) {
    container.innerHTML = `<div class="tw-editor-welcome"><div style="font-size:28px;margin-bottom:8px;">◇</div><div style="font-size:14px;font-weight:600;">Bambam Code Editor</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Sol panelden bir dosya seçin veya yeni dosya oluşturun</div></div>`;
  }
  const tabs = document.getElementById('twEditorTabs');
  if (tabs) tabs.innerHTML = '';
  const tree = document.getElementById('twEditorFileTree');
  if (tree) tree.innerHTML = '';
  twEditorCurrentView = 'split';
  document.querySelectorAll('.tw-editor-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === 'split');
  });
}
