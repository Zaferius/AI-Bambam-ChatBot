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

  // Team member modundan çık
  if (activeTeamMember) {
    activeTeamMember = null;
    document.querySelectorAll('.team-member-btn').forEach(b => b.style.background = 'transparent');
    messageInput.placeholder = 'Type your message...';
    // Model selector'ı geri yükle
    const model = getModelById(selectedModelId);
    if (model) document.getElementById('selectedModelName').textContent = model.name;
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

  // Team member chat modu
  if (activeTeamMember) {
    return sendTeamMemberMessage(text);
  }

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

async function sendTeamMemberMessage(text) {
  if (!activeTeamMember || isSending) return;

  isSending = true;
  sendBtn.disabled = true;
  messageInput.value = "";
  autoResizeTextarea();

  // Kullanıcı mesaj balonu
  createMessageElement(text, "user");

  // Bot mesaj balonu (typing)
  const modelTag = activeTeamMember.model || 'gpt-4o-mini';
  const botMessage = createMessageElement("Thinking...", "bot", true, [], `${activeTeamMember.icon} ${activeTeamMember.roleName}`);

  try {
    const response = await api.sendTeamChat(
      activeTeamMember.teamId,
      activeTeamMember.memberId,
      text,
      activeTeamMember.model
    );

    if (!response.ok) {
      botMessage.querySelector(".message-text").textContent = "Hata: " + (await response.text());
      botMessage.classList.remove("typing");
      return;
    }

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
  } catch (error) {
    botMessage.querySelector(".message-text").textContent = "Bağlantı hatası: " + error.message;
    botMessage.classList.remove("typing");
    console.error(error);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
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
            <button class="chat-item team-member-btn" id="tmb-${m.id}" onclick="switchToMemberChat('${t.id}','${m.id}')" style="font-size:12px;padding:7px 10px;background:transparent;border:none;gap:6px;">
              <span style="font-size:14px;">${m.icon||'🤖'}</span>
              <span class="chat-item-title" style="font-size:12px;">${m.role_name}</span>
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
  // Takım verisini al
  let team;
  try { team = await api.getTeam(teamId); } catch(e) { console.error(e); return; }
  const member = (team.members||[]).find(m => m.id === memberId);
  if (!member) return;

  // State ayarla
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

  // Chat list active state temizle
  document.querySelectorAll('#chatList .chat-item').forEach(b => b.classList.remove('active'));

  // Topbar'ı güncelle — model adı yerine üye bilgisi
  document.getElementById('selectedModelName').textContent = `${member.icon||'🤖'} ${member.role_name}`;

  // Hero'yu gizle, mesajları temizle
  chatMessages.innerHTML = '';
  const heroSection = document.getElementById('heroSection');
  if (heroSection) heroSection.classList.add('hidden');
  chatArea.classList.add('has-messages');

  // Mesajları API'den yükle
  try {
    const messages = await api.getMemberMessages(teamId, memberId);
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        const sender = msg.role === 'user' ? 'user' : 'bot';
        const modelTag = msg.role === 'assistant' ? (member.model || 'gpt-4o-mini') : null;
        createMessageElement(msg.content, sender, false, [], modelTag);
      });
    }
  } catch(e) { console.error('Load member messages error:', e); }

  // Composer'ı aç
  composerWrap.style.display = 'block';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.placeholder = `${member.role_name} ile sohbet et...`;
  messageInput.focus();
}

function exitMemberChat() {
  if (!activeTeamMember) return;
  activeTeamMember = null;
  document.querySelectorAll('.team-member-btn').forEach(b => b.style.background = 'transparent');
  // Normal chat'e geri dön
  if (currentChatId && chats[currentChatId]) {
    switchToChat(currentChatId);
  }
  messageInput.placeholder = 'Type your message...';
}

async function openTeamWorkspace(teamId) {
  try {
  console.log('[TW] openTeamWorkspace called, teamId:', teamId);
  const team = await api.getTeam(teamId);
  console.log('[TW] team data:', team);
  if (!team) { console.error('[TW] team is null'); return; }
  twCurrentTeam = team;

  document.getElementById('twTeamName').textContent = team.name;
  document.getElementById('twTeamDesc').textContent = team.description || '';
  document.getElementById('twMasterInput').value = '';
  document.getElementById('twCombined').style.display = 'none';

  // Üye panellerini oluştur
  const modelOptions = `
    <option value="gpt-4o-mini">GPT-4o Mini</option>
    <option value="gpt-4o">GPT-4o</option>
    <option value="groq:llama-3.1-8b-instant">Groq Llama 3.1 8B</option>
    <option value="groq:llama-3.3-70b-versatile">Groq Llama 3.3 70B</option>
    <option value="groq:mixtral-8x7b-32768">Groq Mixtral 8x7B</option>
    <option value="openrouter:anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
    <option value="openrouter:google/gemini-pro-1.5">Gemini Pro 1.5</option>`;
  const panels = document.getElementById('twPanels');
  panels.innerHTML = (team.members || []).map(m => `
    <div id="tw-panel-${m.id}" style="background:var(--bg);display:flex;flex-direction:column;min-height:200px;">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--sidebar-bg);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:18px;">${m.icon || '🤖'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${m.role_name}</div>
          <div style="font-size:11px;color:var(--muted);">${m.description || ''}</div>
        </div>
        <select id="tw-model-${m.id}" onchange="twChangeMemberModel('${m.id}',this.value)" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;outline:none;cursor:pointer;">
          ${modelOptions.replace(`value="${m.model || 'gpt-4o-mini'}"`, `value="${m.model || 'gpt-4o-mini'}" selected`)}
        </select>
      </div>
      <div id="tw-content-${m.id}" style="flex:1;padding:14px;font-size:13px;line-height:1.6;color:var(--muted);overflow-y:auto;white-space:pre-wrap;">
        Bekleniyor...
      </div>
      <div style="padding:8px 10px;border-top:1px solid var(--border);background:var(--sidebar-bg);display:flex;gap:6px;">
        <input id="tw-input-${m.id}" type="text" placeholder="Mesaj yaz..." onkeydown="if(event.key==='Enter'){event.preventDefault();twSendMemberChat('${m.id}');}" style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;outline:none;font-family:inherit;">
        <button onclick="twSendMemberChat('${m.id}')" style="padding:6px 12px;background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;font-family:inherit;">↑</button>
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
        content.textContent = 'Henüz mesaj yok. Master prompt gönderin veya aşağıdan yazın.';
      }
    } catch(e) { console.error('Load member messages error:', e); }
  }

  console.log('[TW] workspace opened, members:', (team.members||[]).length);
  } catch(e) { console.error('[TW] openTeamWorkspace error:', e); }
}

function closeTeamWorkspace() {
  document.getElementById('teamWorkspace').style.display = 'none';
  twCurrentTeam = null;
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

async function sendMasterPrompt() {
  console.log('[TW] sendMasterPrompt called, twSending:', twSending, 'twCurrentTeam:', twCurrentTeam?.id);
  if (twSending || !twCurrentTeam) { console.warn('[TW] blocked: twSending=',twSending,'team=',!!twCurrentTeam); return; }
  const input = document.getElementById('twMasterInput');
  const message = input.value.trim();
  console.log('[TW] message:', message);
  if (!message) { console.warn('[TW] empty message'); return; }

  twSending = true;
  stopConnectivityPolling();
  const btn = document.getElementById('twSendBtn');
  btn.disabled = true;
  btn.textContent = 'Çalışıyor...';

  const teamRef = twCurrentTeam;

  // Tüm panelleri "çalışıyor" yap
  (teamRef.members || []).forEach(m => {
    const content = document.getElementById(`tw-content-${m.id}`);
    if (content) {
      content.textContent = '⏳ Çalışıyor...';
      content.style.color = 'var(--muted)';
    }
  });

  try {
    console.log('[TW] sending master prompt to API...');
    const data = await api.sendMasterPrompt(teamRef.id, message);
    console.log('[TW] master prompt response:', data);

    // Her üyenin sonucunu paneline yaz
    (data.results || []).forEach(r => {
      const content = document.getElementById(`tw-content-${r.member_id}`);
      if (content) {
        content.textContent = r.content;
        content.style.color = r.error ? 'var(--danger)' : 'var(--text)';
      }
    });

    // Birleştirilmiş sonucu göster
    if (data.combined) {
      document.getElementById('twCombinedContent').textContent = data.combined;
      document.getElementById('twCombined').style.display = 'block';
    }

    // Dosya çıkarıldıysa proje panelini aç
    if (data.extracted_files && data.extracted_files.length > 0) {
      twShowProjectPanel();
    }
  } catch (error) {
    console.error('[TW] master prompt error:', error);
    (teamRef.members || []).forEach(m => {
      const content = document.getElementById(`tw-content-${m.id}`);
      if (content) {
        content.textContent = 'Hata: ' + error.message;
        content.style.color = 'var(--danger)';
      }
    });
  } finally {
    twSending = false;
    btn.disabled = false;
    btn.textContent = 'Hepsine Gönder ↑';
  }
}

// ===== PROJECT FILES & PREVIEW =====
let twPreviewMode = false;
let twSelectedFile = null;

function twToggleProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twProjectBtn');
  const isOpen = panel.style.display === 'flex';
  if (isOpen) {
    panel.style.display = 'none';
    btn.style.background = 'var(--bg)';
    btn.style.color = 'var(--text)';
  } else {
    panel.style.display = 'flex';
    btn.style.background = 'var(--accent)';
    btn.style.color = '#fff';
    twRefreshFiles();
  }
}

async function twShowProjectPanel() {
  const panel = document.getElementById('twProjectPanel');
  const btn = document.getElementById('twProjectBtn');
  panel.style.display = 'flex';
  btn.style.background = 'var(--accent)';
  btn.style.color = '#fff';
  await twRefreshFiles();
}

async function twRefreshFiles() {
  if (!twCurrentTeam) return;
  const files = await api.listProjectFiles(twCurrentTeam.id);
  const tree = document.getElementById('twFileTree');
  
  if (!files || files.length === 0) {
    tree.innerHTML = '<div style="color:var(--muted);padding:12px;">Henüz dosya yok.</div>';
    return;
  }

  // Dosyaları klasör yapısına dönüştür
  const folders = {};
  const rootFiles = [];
  files.forEach(f => {
    const parts = f.path.split('/');
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/');
      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(f);
    } else {
      rootFiles.push(f);
    }
  });

  let html = '';
  // Root dosyalar
  rootFiles.forEach(f => {
    const icon = getFileIcon(f.ext);
    const active = twSelectedFile === f.path ? 'background:rgba(100,108,255,0.15);' : '';
    html += `<div onclick="twSelectFile('${f.path}')" style="padding:5px 8px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:6px;${active}" onmouseover="this.style.background='rgba(100,108,255,0.1)'" onmouseout="this.style.background='${active ? 'rgba(100,108,255,0.15)' : 'transparent'}'">${icon} ${f.path}</div>`;
  });
  // Klasörler
  Object.keys(folders).sort().forEach(folder => {
    html += `<div style="padding:5px 8px;color:var(--muted);font-weight:600;margin-top:6px;">📂 ${folder}/</div>`;
    folders[folder].forEach(f => {
      const name = f.path.split('/').pop();
      const icon = getFileIcon(f.ext);
      const active = twSelectedFile === f.path ? 'background:rgba(100,108,255,0.15);' : '';
      html += `<div onclick="twSelectFile('${f.path}')" style="padding:4px 8px 4px 20px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:6px;${active}" onmouseover="this.style.background='rgba(100,108,255,0.1)'" onmouseout="this.style.background='${active ? 'rgba(100,108,255,0.15)' : 'transparent'}'">${icon} ${name}</div>`;
    });
  });

  tree.innerHTML = html;

  // index.html varsa otomatik preview aç
  const hasIndex = files.some(f => f.path === 'index.html');
  if (hasIndex && !twSelectedFile) {
    twSelectFile('index.html');
    if (!twPreviewMode) twTogglePreview();
  }
}

function getFileIcon(ext) {
  const icons = {
    '.html': '🌐', '.css': '🎨', '.js': '⚡',
    '.json': '📋', '.py': '🐍', '.md': '📝',
    '.ts': '💠', '.jsx': '⚛️', '.tsx': '⚛️',
    '.svg': '🖼️', '.png': '🖼️', '.jpg': '🖼️',
    '.txt': '📄'
  };
  return icons[ext] || '📄';
}

async function twSelectFile(filePath) {
  if (!twCurrentTeam) return;
  twSelectedFile = filePath;
  
  try {
    const data = await api.readProjectFile(twCurrentTeam.id, filePath);
    const contentEl = document.getElementById('twFileContent');
    contentEl.textContent = data.content;
    
    // Dosya ağacını güncelle (active state)
    twRefreshFiles();
  } catch(e) {
    document.getElementById('twFileContent').textContent = 'Dosya okunamadı: ' + e.message;
  }
}

function twTogglePreview() {
  twPreviewMode = !twPreviewMode;
  const frame = document.getElementById('twPreviewFrame');
  const content = document.getElementById('twFileContent');
  const toggleBtn = document.getElementById('twPreviewToggle');
  
  if (twPreviewMode) {
    frame.style.display = 'block';
    content.style.display = 'none';
    toggleBtn.textContent = '📝 Kod';
    // iframe'e preview URL yükle
    if (twCurrentTeam) {
      frame.src = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
    }
  } else {
    frame.style.display = 'none';
    content.style.display = 'block';
    toggleBtn.textContent = '👁 Preview';
    frame.src = 'about:blank';
  }
}

async function twExtractFiles() {
  if (!twCurrentTeam) return;
  try {
    const data = await api.extractProjectFiles(twCurrentTeam.id);
    alert(`${data.extracted} dosya çıkarıldı!`);
    await twRefreshFiles();
    // Preview varsa yenile
    if (twPreviewMode) {
      const frame = document.getElementById('twPreviewFrame');
      frame.src = api.getPreviewUrl(twCurrentTeam.id, 'index.html');
    }
  } catch(e) {
    alert('Dosya çıkarma hatası: ' + e.message);
  }
}
