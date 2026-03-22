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

  // Sağ paneli aç
  const panel = document.getElementById('memberChatPanel');
  panel.style.display = 'flex';
  document.getElementById('memberChatIcon').textContent = member.icon || '🤖';
  document.getElementById('memberChatName').textContent = member.role_name;
  document.getElementById('memberChatDesc').textContent = member.description || member.model || '';

  // Mesajları temizle ve yükle
  const msgContainer = document.getElementById('memberChatMessages');
  msgContainer.innerHTML = '';

  try {
    const messages = await api.getMemberMessages(teamId, memberId);
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        createMemberBubble(msg.content, msg.role === 'user' ? 'user' : 'bot');
      });
    } else {
      msgContainer.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;font-size:13px;">Henüz mesaj yok. Aşağıdan yazın.</div>';
    }
  } catch(e) { console.error('Load member messages error:', e); }

  document.getElementById('memberChatInput').focus();
}

function closeMemberChat() {
  activeTeamMember = null;
  document.getElementById('memberChatPanel').style.display = 'none';
  document.querySelectorAll('.team-member-btn').forEach(b => b.style.background = 'transparent');
}

function createMemberBubble(text, sender) {
  const msgContainer = document.getElementById('memberChatMessages');
  // Placeholder mesajı varsa kaldır
  const placeholder = msgContainer.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const row = document.createElement('div');
  row.style.cssText = `display:flex;${sender === 'user' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}`;

  const bubble = document.createElement('div');
  bubble.style.cssText = `max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;${
    sender === 'user'
      ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px;'
      : 'background:var(--sidebar-bg);color:var(--text);border-bottom-left-radius:4px;border:1px solid var(--border);'
  }`;
  bubble.textContent = text;

  row.appendChild(bubble);
  msgContainer.appendChild(row);
  msgContainer.scrollTop = msgContainer.scrollHeight;
  return bubble;
}

let memberSending = false;
async function sendMemberChatMsg() {
  if (!activeTeamMember || memberSending) return;
  const input = document.getElementById('memberChatInput');
  const text = input.value.trim();
  if (!text) return;

  memberSending = true;
  input.value = '';

  // Kullanıcı balonu
  createMemberBubble(text, 'user');

  // Bot balonu (typing)
  const botBubble = createMemberBubble('⏳ Düşünüyor...', 'bot');

  try {
    const response = await api.sendTeamChat(
      activeTeamMember.teamId,
      activeTeamMember.memberId,
      text,
      activeTeamMember.model
    );

    if (!response.ok) {
      botBubble.textContent = 'Hata: ' + (await response.text());
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    botBubble.textContent = '';

    let fullResponse = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      botBubble.textContent += chunk;
      fullResponse += chunk;
      document.getElementById('memberChatMessages').scrollTop = document.getElementById('memberChatMessages').scrollHeight;
    }
  } catch (error) {
    botBubble.textContent = 'Bağlantı hatası: ' + error.message;
    console.error(error);
  } finally {
    memberSending = false;
    input.focus();
  }
}

// Resize handle for member chat panel
(function initMemberResize() {
  const handle = document.getElementById('memberResizeHandle');
  const panel = document.getElementById('memberChatPanel');
  if (!handle || !panel) return;
  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const mainWrap = document.getElementById('mainChatWrap');
    const wrapRect = mainWrap.getBoundingClientRect();
    let newWidth = wrapRect.right - e.clientX;
    newWidth = Math.max(280, Math.min(newWidth, wrapRect.width * 0.7));
    panel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
})();

async function openTeamWorkspace(teamId) {
  try {
  const team = await api.getTeam(teamId);
  if (!team) return;
  twCurrentTeam = team;

  document.getElementById('twTeamName').textContent = team.name;
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

  // Her üyenin önceki mesajlarını yükle
  for (const m of (team.members || [])) {
    try {
      const messages = await api.getMemberMessages(team.id, m.id);
      const content = document.getElementById(`tw-content-${m.id}`);
      if (content && messages && messages.length > 0) {
        content.style.color = 'var(--text)';
        content.textContent = messages.map(msg =>
          (msg.role === 'user' ? '👤 ' : '🤖 ') + msg.content
        ).join('\n\n');
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

function twAddFlowMessage(icon, title, content, type) {
  const flow = document.getElementById('twFlowMessages');
  // İlk placeholder'ı kaldır
  const placeholder = flow.querySelector('div[style*="text-align:center"]');
  if (placeholder) placeholder.remove();

  const colors = { info: 'var(--accent)', success: '#22c55e', error: 'var(--danger)', result: 'var(--text)' };
  const borderColor = colors[type] || 'var(--border)';

  const msg = document.createElement('div');
  msg.style.cssText = `padding:12px 16px;border-left:3px solid ${borderColor};background:var(--sidebar-bg);border-radius:0 8px 8px 0;font-size:13px;line-height:1.6;`;
  msg.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
    <span style="font-size:14px;">${icon}</span>
    <span style="font-weight:600;font-size:12px;">${title}</span>
    <span style="font-size:10px;color:var(--muted);margin-left:auto;">${new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
  </div>
  <div style="white-space:pre-wrap;word-break:break-word;color:var(--text);font-size:12px;">${content}</div>`;
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

  card.innerHTML = `
    <div class="tw-flow-card-header" onclick="document.getElementById('${cardId}').classList.toggle('open')">
      <span style="font-size:14px;">${icon}</span>
      <span style="font-weight:600;font-size:12px;flex:1;">${roleName} — Dosyalar</span>
      <span style="font-size:10px;color:var(--muted);">${summary.join(' · ')}${stepLabel}</span>
      <span style="font-size:10px;color:var(--muted);margin-left:4px;">${new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span>
      <span style="font-size:10px;color:var(--muted);margin-left:4px;">▶</span>
    </div>
    <div class="tw-flow-card-body" id="${cardId}">
      ${added.map(f => `<div class="tw-flow-file-row"><span class="file-badge added">+ yeni</span><span style="font-family:monospace;">${f.path}</span></div>`).join('')}
      ${updated.map(f => `<div class="tw-flow-file-row"><span class="file-badge updated">~ güncellendi</span><span style="font-family:monospace;">${f.path}</span></div>`).join('')}
    </div>`;

  // Toggle arrow on click
  const header = card.querySelector('.tw-flow-card-header');
  const arrow = header.querySelector('span:last-child');
  header.addEventListener('click', () => { arrow.textContent = arrow.textContent === '▶' ? '▼' : '▶'; });

  flow.appendChild(card);
  flow.scrollTop = flow.scrollHeight;
}

function closeTeamWorkspace() {
  document.getElementById('teamWorkspace').style.display = 'none';
  twCurrentTeam = null;
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
  
  // Mevcut içeriğe kullanıcı mesajını ekle
  const prev = content.textContent === 'Bekleniyor...' ? '' : content.textContent;
  content.style.color = 'var(--text)';
  content.textContent = prev + (prev ? '\n\n' : '') + '👤 ' + message + '\n\n🤖 ';

  const member = (twCurrentTeam.members || []).find(x => x.id === memberId);
  const model = member?.model || 'gpt-4o-mini';

  try {
    const response = await api.sendTeamChat(twCurrentTeam.id, memberId, message, model);
    if (!response.ok) {
      content.textContent += 'Hata: ' + (await response.text());
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      content.textContent += decoder.decode(value, { stream: true });
      content.scrollTop = content.scrollHeight;
    }
  } catch (e) {
    content.textContent += 'Hata: ' + e.message;
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
    stepEl.innerHTML = `
      <div class="tw-step-header">
        <span class="tw-spinner" style="width:10px;height:10px;border-width:1.5px;"></span>
        <span>Adım ${stepNum}/${totalSteps}: ${desc || ''}</span>
      </div>
      <div class="tw-step-content" id="tw-step-text-${memberId}-${stepNum}"></div>`;
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

async function sendMasterPrompt() {
  if (twSending || !twCurrentTeam) return;
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
      content.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:4px 0;">🧠 Plan oluşturuluyor...</div>';
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
            break;

          case 'planning':
            // Zaten "Plan oluşturuluyor" yazıyor
            break;

          case 'skipped': {
            const content = document.getElementById(`tw-content-${mid}`);
            if (content) {
              content.innerHTML = `<div style="padding:8px;color:var(--muted);font-size:11px;">⏭ Atlandı: ${event.reason || 'Bu görev benim rolümle ilgili değil.'}</div>`;
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
              content.innerHTML = '';
              // Plan özeti göster
              const planDiv = document.createElement('div');
              planDiv.style.cssText = 'padding:4px 0;margin-bottom:6px;';
              planDiv.innerHTML = `<div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">📋 Plan (${event.total} adım):</div>` +
                (event.steps || []).map((s, i) => `<div style="font-size:11px;color:var(--muted);padding:1px 0;">  ${i+1}. ${s}</div>`).join('');
              content.appendChild(planDiv);
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
              textEl.textContent += event.content;
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
              hasExtracted = true;
              if (info) twAddFlowFileCard(info.icon, info.role_name, event.files, event.step);
            }
            break;

          case 'member_done':
            twSetMemberWorking(mid, false);
            if (info) twAddFlowMessage(info.icon, info.role_name, 'Tamamlandı ✓', 'result');
            break;

          case 'error': {
            twSetMemberWorking(mid, false);
            const statusEl = document.getElementById(`tw-status-${mid}`);
            if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = '✕'; }
            const taskBadge = document.getElementById(`tw-tasks-${mid}`);
            if (taskBadge) { taskBadge.className = 'tw-task-badge error'; }
            const errContent = document.getElementById(`tw-content-${mid}`);
            if (errContent) errContent.innerHTML = `<div style="color:var(--danger);padding:8px;">❌ ${event.error || 'Hata'}</div>`;
            if (info) twAddFlowMessage('❌', info.role_name, event.error || 'Hata', 'error');
            break;
          }

          case 'all_done':
            twAddFlowMessage('🎉', 'Tamamlandı', 'Tüm takım üyeleri görevlerini bitirdi.', 'success');
            if (hasExtracted) twShowProjectPanel();
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
  if (!twCurrentTeam) return;
  const frame = document.getElementById('twPreviewFrame');
  frame.src = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
}

function twOpenFullPreview() {
  if (!twCurrentTeam) return;
  const url = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
  window.open(url, '_blank');
}

async function twDownloadProject() {
  if (!twCurrentTeam) return;
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
