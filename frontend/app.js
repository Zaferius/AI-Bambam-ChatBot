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
  sidebar.classList.toggle("open");
  mainContent.classList.toggle("sidebar-open");
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
  const name = document.getElementById("selectedModelName").textContent || "";
  const parts = name.replace("Bambam", "").trim().split(" ");
  return parts.length > 0 ? parts.join(" ") : "Lite";
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
    const badge = modelName || getModelShortName();
    header.innerHTML = `
      <img src="b-icon.png" alt="Bambam Logo" class="bot-header-logo">
      <span class="bot-header-name">Bambam</span>
      <span class="bot-header-badge">${badge}</span>
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

function addWelcomeMessage() {}

function updateChatAreaState() {
  const heroSection = document.getElementById("heroSection");
  const hasMessages = chatMessages.children.length > 0;
  if (hasMessages) {
    chatArea.classList.add("has-messages");
    heroSection.classList.add("hidden");
    composerWrap.classList.remove("centered");
  } else {
    chatArea.classList.remove("has-messages");
    heroSection.classList.remove("hidden");
    composerWrap.classList.add("centered");
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

function toggleModelDropdown() {
  const dropdown = document.getElementById("modelDropdown");
  const btn = document.getElementById("modelSelectorBtn");
  dropdown.classList.toggle("active");
  btn.classList.toggle("active");
}

function selectModel(modelId, modelName) {
  selectedModelId = modelId;
  document.getElementById("selectedModelName").textContent = modelName;
  renderModelDropdown();
  toggleModelDropdown();
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
  option.onclick = () => selectModel(model.id, model.name);

  const contentDiv = document.createElement("div");
  contentDiv.className = "model-option-content";

  const header = document.createElement("div");
  header.className = "model-option-header";

  const name = document.createElement("span");
  name.className = "model-option-name";
  name.textContent = model.name;
  header.appendChild(name);

  if (model.badge) {
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
        document.getElementById("selectedModelName").textContent = firstModel.name;
      }
    }
    renderModelDropdown();
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
        <button class="chat-item" onclick="toggleTeamMembers('${t.id}')" title="${t.description || t.name}" style="justify-content:space-between;">
          <span class="chat-item-title">${t.name}</span>
          <span class="team-arrow" id="ta-${t.id}" style="font-size:10px;transition:transform 0.2s;">▶</span>
        </button>
        <div class="team-members-list" id="tm-${t.id}" style="display:none;padding-left:12px;">
          ${(t.members||[]).map(m => `
            <button class="chat-item team-member-btn" id="tmb-${m.id}" onclick="switchToMemberChat('${t.id}','${m.id}')" style="font-size:12px;padding:7px 10px;background:transparent;border:none;gap:6px;align-items:center;">
              <span style="font-size:14px;">${m.icon||'🤖'}</span>
              <span class="chat-item-title" style="font-size:12px;flex:1;">${m.role_name}</span>
              <span id="sb-spinner-${m.id}" class="tw-spinner" style="display:none;width:12px;height:12px;border-width:1.5px;"></span>
              <span id="sb-tasks-${m.id}" class="tw-task-badge" style="display:none;"></span>
            </button>
          `).join('')}
          <button class="chat-item" onclick="openTeamWorkspace('${t.id}')" style="font-size:11px;padding:6px 10px;color:var(--muted);background:transparent;border:none;">
            <span class="chat-item-title" style="font-size:11px;">⚡ Master Prompt</span>
          </button>
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
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
  twRefreshPreview();
}

async function twSelectProject(projectId) {
  if (!twCurrentTeam) return;
  const result = await api.activateTeamProject(twCurrentTeam.id, projectId);
  twCurrentTeam.projects = result.projects || [];
  twCurrentProject = result.project || null;
  twCurrentTeam.active_project = twCurrentProject;
  twProjectsManagerOpen = false;
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
  twRefreshPreview();
}

async function twDeleteProject(projectId) {
  if (!twCurrentTeam) return;
  const result = await api.deleteTeamProject(twCurrentTeam.id, projectId);
  twCurrentTeam.projects = result.projects || [];
  twCurrentProject = result.active_project || null;
  twCurrentTeam.active_project = twCurrentProject;
  twProjectsManagerOpen = !twCurrentProject;
  twRenderProjectGate(twCurrentTeam.projects, twCurrentProject);
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
  if (btn) btn.style.background = 'rgba(100,108,255,0.15)';

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
  const modelEl = document.getElementById('memberSettingsModel');
  const promptEl = document.getElementById('memberSettingsPrompt');
  const depsEl = document.getElementById('memberSettingsDeps');
  if (!roleEl || !depsEl) return;

  roleEl.value = member.role_name || '';
  iconEl.value = member.icon || '🤖';
  descEl.value = member.description || '';
  modelEl.value = member.model || 'gpt-4o-mini';
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
    model: document.getElementById('memberSettingsModel').value,
    system_prompt: document.getElementById('memberSettingsPrompt').value.trim(),
  };
  const depends_on = [...document.querySelectorAll('#memberSettingsDeps input:checked')].map((el) => el.value);
  try {
    const updated = await api.updateMemberModel(activeTeamMember.teamId, activeTeamMember.memberId, payload.model, depends_on, payload);
    activeTeamMember.roleName = updated.role_name;
    activeTeamMember.icon = updated.icon;
    activeTeamMember.model = updated.model;
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

  document.getElementById('twTeamName').textContent = team.name;
  document.getElementById('twProjectName').textContent = team.active_project ? `/ ${team.active_project.name}` : '/ Proje seç';
  document.getElementById('twTeamDesc').textContent = team.description || '';
  document.getElementById('twMasterInput').value = '';

  // Genel akış alanını sıfırla
  document.getElementById('twFlowMessages').innerHTML =
    '<div style="color:var(--muted);text-align:center;padding:40px 20px;font-size:13px;">Master prompt gönderin, sonuçlar burada görünecek.</div>';

  // Üye panellerini accordion olarak oluştur
  const modelOptions = `
    <option value="gpt-4o-mini">GPT-4o Mini</option>
    <option value="gpt-4o">GPT-4o</option>
    <option value="groq:llama-3.1-8b-instant">Groq Llama 3.1 8B</option>
    <option value="groq:llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
    <option value="groq:mixtral-8x7b-32768">Groq Mixtral 8x7B</option>
    <option value="openrouter:anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
    <option value="openrouter:google/gemini-pro-1.5">Gemini Pro 1.5</option>`;
  const panels = document.getElementById('twPanels');
  panels.innerHTML = (team.members || []).map((m, i) => `
    <div id="tw-panel-${m.id}" style="border-bottom:1px solid var(--border);display:flex;flex-direction:column;">
      <div onclick="twToggleMemberPanel('${m.id}')" style="padding:8px 12px;background:var(--sidebar-bg);display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
        <span style="font-size:10px;color:var(--muted);transition:transform 0.2s;" id="tw-arrow-${m.id}">${i === 0 ? '▼' : '▶'}</span>
        <span style="font-size:16px;">${m.icon || '🤖'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:12px;">${m.role_name}</div>
        </div>
        <span id="tw-spinner-${m.id}" style="display:none;" class="tw-spinner"></span>
        <span id="tw-tasks-${m.id}" class="tw-task-badge" style="display:none;"></span>
        <span id="tw-status-${m.id}" style="font-size:10px;color:var(--muted);">●</span>
        <select id="tw-model-${m.id}" onclick="event.stopPropagation()" onchange="twChangeMemberModel('${m.id}',this.value)" style="padding:2px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:10px;outline:none;cursor:pointer;">
          ${modelOptions.replace(`value="${m.model || 'gpt-4o-mini'}"`, `value="${m.model || 'gpt-4o-mini'}" selected`)}
        </select>
      </div>
      <div id="tw-body-${m.id}" style="display:${i === 0 ? 'flex' : 'none'};flex-direction:column;max-height:400px;">
        <div id="tw-content-${m.id}" style="flex:1;padding:8px 12px;font-size:12px;line-height:1.5;color:var(--muted);overflow-y:auto;min-height:60px;">
          Bekleniyor...
        </div>
        <div style="padding:6px 8px;border-top:1px solid var(--border);background:var(--sidebar-bg);display:flex;gap:4px;">
          <input id="tw-input-${m.id}" type="text" placeholder="Mesaj yaz..." onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();twSendMemberChat('${m.id}');}" style="flex:1;padding:5px 8px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;outline:none;font-family:inherit;">
          <button onclick="event.stopPropagation();twSendMemberChat('${m.id}')" style="padding:5px 10px;background:var(--accent);border:none;border-radius:5px;color:#fff;font-size:11px;cursor:pointer;font-family:inherit;">↑</button>
        </div>
      </div>
    </div>
  `).join('');

  const ws = document.getElementById('teamWorkspace');
  ws.style.display = 'flex';
  await twLoadProjectGate();

  // Her üyenin önceki mesajlarını yükle
  for (const m of (team.members || [])) {
    try {
      const messages = await api.getMemberMessages(team.id, m.id);
      const content = document.getElementById(`tw-content-${m.id}`);
      if (content && messages && messages.length > 0) {
        content.style.color = 'var(--text)';
        twRenderMemberHistory(content, messages);
        content.scrollTop = content.scrollHeight;
      } else if (content) {
        content.textContent = 'Henüz mesaj yok.';
      }
    } catch(e) { console.error('Load member messages error:', e); }
  }

  // Resize handle for members column
  twInitMembersResize();

  } catch(e) { console.error('[TW] openTeamWorkspace error:', e); }
}

function twToggleMemberPanel(memberId) {
  const body = document.getElementById(`tw-body-${memberId}`);
  const arrow = document.getElementById(`tw-arrow-${memberId}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'flex';
  if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
}

function twInitMembersResize() {
  const handle = document.getElementById('twMembersResizeHandle');
  const col = document.getElementById('twMembersCol');
  if (!handle || !col) return;
  let isResizing = false;

  handle.onmousedown = (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const bodyRect = document.getElementById('twBody').getBoundingClientRect();
    let newWidth = e.clientX - bodyRect.left;
    newWidth = Math.max(280, Math.min(newWidth, bodyRect.width * 0.5));
    col.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function twRenderMemberHistory(container, messages) {
  if (!container) return;
  container.textContent = '';

  messages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = `tw-inline-msg ${msg.role === 'user' ? 'user' : 'assistant'}`;

    if (msg.role === 'user') {
      row.textContent = msg.content;
    } else {
      renderAgentStructuredContent(row, msg.content, true);
    }

    container.appendChild(row);
  });
}

function twAddFlowMessage(icon, title, content, type) {
  const flow = document.getElementById('twFlowMessages');
  // İlk placeholder'ı kaldır
  const placeholder = flow.querySelector('div[style*="text-align:center"]');
  if (placeholder) placeholder.remove();

  const colors = { info: 'var(--accent)', success: '#22c55e', error: 'var(--danger)', result: 'var(--text)' };
  const borderColor = colors[type] || 'var(--border)';

  const msg = document.createElement('div');
  msg.style.cssText = `padding:12px 16px;border-left:3px solid ${borderColor};background:var(--sidebar-bg);border-radius:0 8px 8px 0;font-size:13px;line-height:1.6;`;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const iconEl = document.createElement('span');
  iconEl.style.fontSize = '14px';
  iconEl.textContent = icon;
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-weight:600;font-size:12px;';
  titleEl.textContent = title;
  const timeEl = document.createElement('span');
  timeEl.style.cssText = 'font-size:10px;color:var(--muted);margin-left:auto;';
  timeEl.textContent = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  header.appendChild(iconEl);
  header.appendChild(titleEl);
  header.appendChild(timeEl);

  const body = document.createElement('div');
  body.style.cssText = 'white-space:pre-wrap;word-break:break-word;color:var(--text);font-size:12px;';
  body.textContent = content;

  msg.appendChild(header);
  msg.appendChild(body);
  flow.appendChild(msg);
  flow.scrollTop = flow.scrollHeight;
}

function twAddFlowFileCard(icon, roleName, files, step) {
  const flow = document.getElementById('twFlowMessages');
  const placeholder = flow.querySelector('div[style*="text-align:center"]');
  if (placeholder) placeholder.remove();

  // Normalize files: support both string[] and {path,status}[]
  const normalized = files.map(f => typeof f === 'string' ? { path: f, status: 'added' } : f);
  const added = normalized.filter(f => f.status === 'added');
  const updated = normalized.filter(f => f.status === 'updated');

  const cardId = 'tw-fcard-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const card = document.createElement('div');
  card.className = 'tw-flow-card';
  card.style.borderLeftColor = '#22c55e';

  const summary = [];
  if (added.length) summary.push(`+${added.length} yeni`);
  if (updated.length) summary.push(`~${updated.length} güncelleme`);
  const stepLabel = step ? ` · Adım ${step}` : '';

  const header = document.createElement('div');
  header.className = 'tw-flow-card-header';
  const iconEl = document.createElement('span');
  iconEl.style.fontSize = '14px';
  iconEl.textContent = icon;
  const roleEl = document.createElement('span');
  roleEl.style.cssText = 'font-weight:600;font-size:12px;flex:1;';
  roleEl.textContent = `${roleName} — Dosyalar`;
  const summaryEl = document.createElement('span');
  summaryEl.style.cssText = 'font-size:10px;color:var(--muted);';
  summaryEl.textContent = `${summary.join(' · ')}${stepLabel}`;
  const timeEl = document.createElement('span');
  timeEl.style.cssText = 'font-size:10px;color:var(--muted);margin-left:4px;';
  timeEl.textContent = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  const arrow = document.createElement('span');
  arrow.style.cssText = 'font-size:10px;color:var(--muted);margin-left:4px;';
  arrow.textContent = '▶';
  header.appendChild(iconEl);
  header.appendChild(roleEl);
  header.appendChild(summaryEl);
  header.appendChild(timeEl);
  header.appendChild(arrow);

  const body = document.createElement('div');
  body.className = 'tw-flow-card-body';
  body.id = cardId;

  added.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'tw-flow-file-row';
    const badge = document.createElement('span');
    badge.className = 'file-badge added';
    badge.textContent = '+ yeni';
    const path = document.createElement('span');
    path.style.fontFamily = 'monospace';
    path.textContent = f.path;
    row.appendChild(badge);
    row.appendChild(path);
    body.appendChild(row);
  });

  updated.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'tw-flow-file-row';
    const badge = document.createElement('span');
    badge.className = 'file-badge updated';
    badge.textContent = '~ güncellendi';
    const path = document.createElement('span');
    path.style.fontFamily = 'monospace';
    path.textContent = f.path;
    row.appendChild(badge);
    row.appendChild(path);
    body.appendChild(row);
  });

  header.addEventListener('click', () => {
    body.classList.toggle('open');
    arrow.textContent = body.classList.contains('open') ? '▼' : '▶';
  });

  card.appendChild(header);
  card.appendChild(body);

  flow.appendChild(card);
  flow.scrollTop = flow.scrollHeight;
}

function closeTeamWorkspace() {
  document.getElementById('teamWorkspace').style.display = 'none';
  twCurrentTeam = null;
  twCurrentProject = null;
  twCurrentRunId = null;
  twProjectsManagerOpen = false;
  twToggleCollabPanel(false);
}

let twPromptExpanded = false;
function twToggleExpandPrompt() {
  const input = document.getElementById('twMasterInput');
  const btn = document.getElementById('twExpandBtn');
  twPromptExpanded = !twPromptExpanded;
  if (twPromptExpanded) {
    input.style.minHeight = '200px';
    input.rows = 10;
    btn.textContent = '⤡';
    btn.title = 'Daralt';
  } else {
    input.style.minHeight = '52px';
    input.rows = 2;
    btn.textContent = '⤢';
    btn.title = 'Genişlet';
  }
  input.focus();
}

async function twChangeMemberModel(memberId, newModel) {
  if (!twCurrentTeam) return;
  try {
    await api.updateMemberModel(twCurrentTeam.id, memberId, newModel);
    const m = (twCurrentTeam.members || []).find(x => x.id === memberId);
    if (m) m.model = newModel;
  } catch (e) {
    console.error('Model güncelleme hatası:', e);
  }
}

async function twSendMemberChat(memberId) {
  if (!twCurrentTeam) return;
  const input = document.getElementById(`tw-input-${memberId}`);
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  const content = document.getElementById(`tw-content-${memberId}`);

  if (content.textContent === 'Bekleniyor...' || content.textContent === 'Henüz mesaj yok.') {
    content.textContent = '';
  }

  const userRow = document.createElement('div');
  userRow.className = 'tw-inline-msg user';
  userRow.textContent = message;
  content.appendChild(userRow);

  const botRow = document.createElement('div');
  botRow.className = 'tw-inline-msg assistant';
  botRow.textContent = 'Düşünüyor...';
  content.appendChild(botRow);
  twAutoScroll(content);

  const member = (twCurrentTeam.members || []).find(x => x.id === memberId);
  const model = member?.model || 'gpt-4o-mini';

  try {
    const response = await api.sendTeamChat(twCurrentTeam.id, memberId, message, model);
    if (!response.ok) {
      botRow.textContent = 'Hata: ' + (await response.text());
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    botRow.textContent = 'Uye su an ciktiyi hazirliyor...';
    let fullResponse = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      const live = extractLiveProgressText(fullResponse, 140);
      botRow.textContent = live ? `Thinking... ${live}` : 'Thinking...';
      twAutoScroll(content);
    }
    renderAgentStructuredContent(botRow, fullResponse, true);
  } catch (e) {
    botRow.textContent = 'Hata: ' + e.message;
  }
}

// Helper: smart auto-scroll — sadece kullanıcı en alttaysa scroll yap
function twAutoScroll(el) {
  if (!el) return;
  const threshold = 60;
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  if (isNearBottom) el.scrollTop = el.scrollHeight;
}

// Helper: üye panelinde step block oluştur/güncelle
function twGetOrCreateStep(memberId, stepNum, totalSteps, desc) {
  const content = document.getElementById(`tw-content-${memberId}`);
  if (!content) return null;
  let stepEl = document.getElementById(`tw-step-${memberId}-${stepNum}`);
  if (!stepEl) {
    stepEl = document.createElement('div');
    stepEl.id = `tw-step-${memberId}-${stepNum}`;
    stepEl.className = 'tw-step running';

    const header = document.createElement('div');
    header.className = 'tw-step-header';
    const spinner = document.createElement('span');
    spinner.className = 'tw-spinner';
    spinner.style.width = '10px';
    spinner.style.height = '10px';
    spinner.style.borderWidth = '1.5px';
    const title = document.createElement('span');
    title.textContent = `Adım ${stepNum}/${totalSteps}: ${desc || ''}`;
    header.appendChild(spinner);
    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'tw-step-content';
    body.id = `tw-step-text-${memberId}-${stepNum}`;
    body.textContent = 'Cikti hazirlaniyor...';
    body.dataset.raw = '';

    stepEl.appendChild(header);
    stepEl.appendChild(body);
    content.appendChild(stepEl);
    twAutoScroll(content);
  }
  return stepEl;
}

function twSetMemberWorking(memberId, working) {
  // Workspace panel spinner
  const spinner = document.getElementById(`tw-spinner-${memberId}`);
  const status = document.getElementById(`tw-status-${memberId}`);
  if (spinner) spinner.style.display = working ? 'inline-block' : 'none';
  if (status) {
    status.style.display = working ? 'none' : '';
    if (!working) { status.style.color = '#22c55e'; status.textContent = '✓'; }
  }
  // Sidebar spinner
  const sbSpinner = document.getElementById(`sb-spinner-${memberId}`);
  if (sbSpinner) sbSpinner.style.display = working ? 'inline-block' : 'none';
}

function twUpdateTaskBadge(memberId, current, total, state) {
  // Workspace badge
  const badge = document.getElementById(`tw-tasks-${memberId}`);
  if (badge) {
    badge.style.display = 'inline';
    badge.textContent = `${current}/${total}`;
    badge.className = 'tw-task-badge ' + (state || 'active');
  }
  // Sidebar badge
  const sbBadge = document.getElementById(`sb-tasks-${memberId}`);
  if (sbBadge) {
    sbBadge.style.display = 'inline';
    sbBadge.textContent = `${current}/${total}`;
    sbBadge.className = 'tw-task-badge ' + (state || 'active');
  }
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
      twAddFlowMessage('✅', 'Reviewer', `Proposal onaylandı: ${proposalId.slice(0, 8)}`, 'success');
    } else {
      await api.rejectProposal(twCurrentTeam.id, proposalId);
      twAddFlowMessage('🗑️', 'Reviewer', `Proposal reddedildi: ${proposalId.slice(0, 8)}`, 'info');
    }
    await twRefreshCollabPanel();
    twRefreshPreview();
  } catch (error) {
    twAddFlowMessage('❌', 'Reviewer', error.message, 'error');
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
  btn.textContent = 'Çalışıyor...';
  input.value = '';

  const teamRef = twCurrentTeam;

  // Akışa prompt mesajı ekle
  twAddFlowMessage('📨', 'Master Prompt', message, 'info');

  // Tüm panelleri hazırla
  (teamRef.members || []).forEach(m => {
    const content = document.getElementById(`tw-content-${m.id}`);
    if (content) {
      content.textContent = 'Plan oluşturuluyor...';
      content.style.color = 'var(--muted)';
    }
    twSetMemberWorking(m.id, true);
    twUpdateTaskBadge(m.id, 0, '?', 'active');
  });

  // Üye bilgilerini cache'le (flow mesajları için)
  const memberInfo = {};
  (teamRef.members || []).forEach(m => {
    memberInfo[m.id] = { role_name: m.role_name, icon: m.icon || '🤖' };
  });

  let hasExtracted = false;

  try {
    const response = await api.sendMasterPromptStream(teamRef.id, message);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // son satır tamamlanmamış olabilir

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        const mid = event.member_id;
        const info = mid ? memberInfo[mid] : null;

        switch (event.type) {
          case 'start':
            // Üye bilgilerini güncelle
            (event.members || []).forEach(m => {
              memberInfo[m.id] = { role_name: m.role_name, icon: m.icon || '🤖' };
            });
            twCurrentRunId = event.run_id || null;
            if (event.run_id) {
              twAddFlowMessage('🧭', 'Coordinator', `Run başlatıldı: ${event.run_id.slice(0, 8)}`, 'info');
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'planning':
            // Zaten "Plan oluşturuluyor" yazıyor
            break;

          case 'task_blocked': {
            const content = document.getElementById(`tw-content-${mid}`);
            if (content) {
              content.textContent = `Waiting... ${event.blocked_reason || 'Bağımlılık bekleniyor.'}`;
              content.style.color = 'var(--muted)';
            }
            twSetMemberWorking(mid, false);
            twUpdateTaskBadge(mid, 0, 0, '');
            const statusEl = document.getElementById(`tw-status-${mid}`);
            if (statusEl) {
              statusEl.style.color = '#f59e0b';
              statusEl.textContent = '⏸';
            }
            if (info) twAddFlowMessage('⛔', info.role_name, event.blocked_reason || 'Bağımlılık bekleniyor', 'info');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;
          }

          case 'task_unblocked': {
            const content = document.getElementById(`tw-content-${mid}`);
            if (content) {
              content.textContent = 'Plan oluşturuluyor...';
              content.style.color = 'var(--muted)';
            }
            twSetMemberWorking(mid, true);
            const statusEl = document.getElementById(`tw-status-${mid}`);
            if (statusEl) {
              statusEl.style.color = 'var(--accent)';
              statusEl.textContent = '●';
            }
            if (info) twAddFlowMessage('🔓', info.role_name, 'Bağımlılık açıldı, görev başlıyor.', 'info');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;
          }

          case 'agent_message':
            if (info) {
              const fromInfo = event.from_member_id ? memberInfo[event.from_member_id] : null;
              const label = fromInfo ? `${fromInfo.role_name} -> ${info.role_name}` : info.role_name;
              twAddFlowMessage('📨', label, event.content || event.subject || 'Yeni iç mesaj', 'info');
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'task_started':
            twSetMemberWorking(mid, true);
            break;

          case 'skipped': {
            const content = document.getElementById(`tw-content-${mid}`);
            if (content) {
              content.textContent = '';
              const skipEl = document.createElement('div');
              skipEl.style.cssText = 'padding:8px;color:var(--muted);font-size:11px;';
              skipEl.textContent = `Atlandı: ${event.reason || 'Bu görev benim rolümle ilgili değil.'}`;
              content.appendChild(skipEl);
            }
            twSetMemberWorking(mid, false);
            const skipStatus = document.getElementById(`tw-status-${mid}`);
            if (skipStatus) { skipStatus.style.color = 'var(--muted)'; skipStatus.textContent = '—'; }
            twUpdateTaskBadge(mid, 0, 0, '');
            const skipBadge = document.getElementById(`tw-tasks-${mid}`);
            if (skipBadge) { skipBadge.textContent = 'atlandı'; skipBadge.style.display = 'inline'; skipBadge.className = 'tw-task-badge'; }
            const sbBadge = document.getElementById(`sb-tasks-${mid}`);
            if (sbBadge) { sbBadge.textContent = 'atlandı'; sbBadge.style.display = 'inline'; sbBadge.className = 'tw-task-badge'; }
            if (info) twAddFlowMessage('⏭', info.role_name, event.reason || 'Atlandı — rol ile ilgili değil', 'info');
            break;
          }

          case 'plan': {
            const content = document.getElementById(`tw-content-${mid}`);
            if (content) {
              content.textContent = '';
              // Plan özeti göster
              const planDiv = document.createElement('div');
              planDiv.style.cssText = 'padding:4px 0;margin-bottom:6px;';
              const head = document.createElement('div');
              head.style.cssText = 'font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;';
              head.textContent = `Plan (${event.total} adım):`;
              planDiv.appendChild(head);

              (event.steps || []).forEach((stepText, index) => {
                const stepLine = document.createElement('div');
                stepLine.style.cssText = 'font-size:11px;color:var(--muted);padding:1px 0;';
                stepLine.textContent = `${index + 1}. ${stepText}`;
                planDiv.appendChild(stepLine);
              });

              content.appendChild(planDiv);
              content.style.color = 'var(--text)';
            }
            twUpdateTaskBadge(mid, 0, event.total, 'active');
            if (info) twAddFlowMessage(info.icon, info.role_name + ' — Plan', (event.steps || []).map((s,i)=>`${i+1}. ${s}`).join('\n'), 'info');
            break;
          }

          case 'step_start': {
            twGetOrCreateStep(mid, event.step, event.total, event.description);
            twUpdateTaskBadge(mid, event.step, event.total, 'active');
            const content = document.getElementById(`tw-content-${mid}`);
            twAutoScroll(content);
            // Paneli aç (accordion)
            const body = document.getElementById(`tw-body-${mid}`);
            const arrow = document.getElementById(`tw-arrow-${mid}`);
            if (body && body.style.display === 'none') {
              body.style.display = 'flex';
              if (arrow) arrow.textContent = '▼';
            }
            break;
          }

          case 'delta': {
            const textEl = document.getElementById(`tw-step-text-${mid}-${event.step}`);
            if (textEl) {
              const prevRaw = textEl.dataset.raw || '';
              const nextRaw = prevRaw + (event.content || '');
              textEl.dataset.raw = nextRaw;
              const liveText = extractLiveProgressText(nextRaw, 160);
              textEl.textContent = liveText ? `Thinking... ${liveText}` : 'Thinking...';
              twAutoScroll(document.getElementById(`tw-content-${mid}`));
            }
            break;
          }

          case 'step_done': {
            const stepEl = document.getElementById(`tw-step-${mid}-${event.step}`);
            if (stepEl) {
              stepEl.className = 'tw-step done';
              const header = stepEl.querySelector('.tw-step-header');
              if (header) {
                const spinnerEl = header.querySelector('.tw-spinner');
                if (spinnerEl) spinnerEl.outerHTML = '<span style="color:#22c55e;font-size:10px;">✓</span>';
              }

              const textEl = stepEl.querySelector('.tw-step-content');
              if (textEl) {
                const raw = textEl.dataset.raw || textEl.textContent || '';
                renderAgentStructuredContent(textEl, raw, true);
              }
            }
            twUpdateTaskBadge(mid, event.step, event.total, event.step === event.total ? 'done' : 'active');
            break;
          }

          case 'step_error': {
            const stepEl = document.getElementById(`tw-step-${mid}-${event.step}`);
            if (stepEl) {
              stepEl.className = 'tw-step error';
              const textEl = stepEl.querySelector('.tw-step-content');
              if (textEl) textEl.textContent += '\n❌ ' + (event.error || 'Hata');
            }
            break;
          }

          case 'files':
            if (event.files && event.files.length > 0) {
              const appliedFiles = event.files.filter(f => f.status !== 'conflict');
              const conflictedFiles = event.files.filter(f => f.status === 'conflict');
              if (appliedFiles.length > 0) {
                hasExtracted = true;
                if (info) twAddFlowFileCard(info.icon, info.role_name, appliedFiles, event.step);
              }
              if (conflictedFiles.length > 0 && info) {
                twAddFlowMessage('⚠️', `${info.role_name} — Conflict`, conflictedFiles.map(f => `${f.path} kilitli`).join('\n'), 'error');
              }
            }
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'file_conflict':
            if (info) twAddFlowMessage('🔒', `${info.role_name} — Dosya Kilidi`, `${event.path || 'Dosya'} başka bir görev tarafından kilitli. Proposal kaydedildi.`, 'error');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'member_done':
            twSetMemberWorking(mid, false);
            if (info) twAddFlowMessage(info.icon, info.role_name, 'Tamamlandı ✓', 'result');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'error': {
            twSetMemberWorking(mid, false);
            const statusEl = document.getElementById(`tw-status-${mid}`);
            if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = '✕'; }
            const taskBadge = document.getElementById(`tw-tasks-${mid}`);
            if (taskBadge) { taskBadge.className = 'tw-task-badge error'; }
            const errContent = document.getElementById(`tw-content-${mid}`);
            if (errContent) {
              errContent.textContent = '';
              const errLine = document.createElement('div');
              errLine.style.cssText = 'color:var(--danger);padding:8px;';
              errLine.textContent = `Hata: ${event.error || 'Hata'}`;
              errContent.appendChild(errLine);
            }
            if (info) twAddFlowMessage('❌', info.role_name, event.error || 'Hata', 'error');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;
          }

          case 'run_error':
            twAddFlowMessage('❌', 'Coordinator', event.error || 'Run hatası', 'error');
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'all_done':
            twAddFlowMessage('🎉', 'Tamamlandı', 'Tüm takım üyeleri görevlerini bitirdi.', 'success');
            if (hasExtracted) twShowProjectPanel();
            if (twCollabPanelOpen) twRefreshCollabPanel();
            break;

          case 'heartbeat':
            break;
        }
      }
    }
  } catch (error) {
    twAddFlowMessage('❌', 'Bağlantı Hatası', error.message, 'error');
    (teamRef.members || []).forEach(m => {
      twSetMemberWorking(m.id, false);
      const status = document.getElementById(`tw-status-${m.id}`);
      if (status) { status.style.color = 'var(--danger)'; status.textContent = '✕'; }
    });
  } finally {
    twSending = false;
    btn.disabled = false;
    btn.textContent = 'Hepsine Gönder ↑';
  }
}

// ===== PROJECT PREVIEW & DOWNLOAD =====

function twToggleProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twProjectBtn');
  const isOpen = panel.style.display === 'flex';
  if (isOpen) {
    panel.style.display = 'none';
    btn.style.background = 'var(--bg)';
    btn.style.color = 'var(--text)';
    document.getElementById('twPreviewFrame').src = 'about:blank';
  } else {
    panel.style.display = 'flex';
    btn.style.background = 'var(--accent)';
    btn.style.color = '#fff';
    twRefreshPreview();
  }
}

async function twShowProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twProjectBtn');
  panel.style.display = 'flex';
  btn.style.background = 'var(--accent)';
  btn.style.color = '#fff';
  twRefreshPreview();
}

function twRefreshPreview() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const frame = document.getElementById('twPreviewFrame');
  frame.src = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
}

function twOpenFullPreview() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const url = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
  window.open(url, '_blank');
}

async function twDownloadProject() {
  if (!twCurrentTeam || !twCurrentProject) return;
  const btn = document.getElementById('twDownloadBtn');
  btn.textContent = '⏳ Hazırlanıyor...';
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
    btn.textContent = '📥 Projeyi İndir';
    btn.disabled = false;
  }
}
