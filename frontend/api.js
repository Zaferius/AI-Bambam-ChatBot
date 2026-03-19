// Backend API Client
// Handles all communication with the backend server

const API_BASE_URL = "http://127.0.0.1:8000";

class BambamAPI {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  getAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const token = localStorage.getItem('bambam_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  getUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('bambam_user'));
      return user ? user.id : 'default';
    } catch {
      return 'default';
    }
  }

  getUsername() {
    try {
      const user = JSON.parse(localStorage.getItem('bambam_user'));
      return user ? user.username : null;
    } catch {
      return null;
    }
  }

  isLoggedIn() {
    return !!localStorage.getItem('bambam_token');
  }

  logout() {
    localStorage.removeItem('bambam_token');
    localStorage.removeItem('bambam_user');
    window.location.href = 'login.html';
  }

  // ===== CHAT OPERATIONS =====

  async createChat(title = "New Chat", userId = null) {
    try {
      const uid = userId || this.getUserId();
      const response = await fetch(`${this.baseUrl}/api/chats`, {
        method: "POST",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title, user_id: uid })
      });
      if (!response.ok) throw new Error("Failed to create chat");
      return await response.json();
    } catch (error) {
      console.error("Create chat error:", error);
      return null;
    }
  }

  async listChats(userId = null, limit = 100) {
    try {
      const uid = userId || this.getUserId();
      const response = await fetch(`${this.baseUrl}/api/chats?user_id=${uid}&limit=${limit}`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to list chats");
      return await response.json();
    } catch (error) {
      console.error("List chats error:", error);
      return [];
    }
  }

  async getChat(chatId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chats/${chatId}`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to get chat");
      return await response.json();
    } catch (error) {
      console.error("Get chat error:", error);
      return null;
    }
  }

  async updateChatTitle(chatId, title) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chats/${chatId}`, {
        method: "PUT",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error("Failed to update chat");
      return await response.json();
    } catch (error) {
      console.error("Update chat error:", error);
      return null;
    }
  }

  async deleteChat(chatId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chats/${chatId}`, {
        method: "DELETE",
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to delete chat");
      return await response.json();
    } catch (error) {
      console.error("Delete chat error:", error);
      return null;
    }
  }

  // ===== MESSAGE OPERATIONS =====

  async getMessages(chatId, limit = null, offset = 0) {
    try {
      let url = `${this.baseUrl}/api/chats/${chatId}/messages?offset=${offset}`;
      if (limit) url += `&limit=${limit}`;
      
      const response = await fetch(url, { headers: this.getAuthHeaders() });
      if (!response.ok) throw new Error("Failed to get messages");
      return await response.json();
    } catch (error) {
      console.error("Get messages error:", error);
      return [];
    }
  }

  async sendMessage(message, model, chatId, thinkingLevel = "medium", files = []) {
    if (files.length > 0) {
      const formData = new FormData();
      formData.append("message", message);
      formData.append("model", model);
      formData.append("chat_id", chatId);
      formData.append("thinking_level", thinkingLevel);
      files.forEach((file) => { formData.append("files", file); });
      
      return await fetch(`${this.baseUrl}/chat/stream`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: formData
      });
    } else {
      return await fetch(`${this.baseUrl}/chat/stream`, {
        method: "POST",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message,
          model,
          chat_id: chatId,
          thinking_level: thinkingLevel
        })
      });
    }
  }

  // ===== MODEL OPERATIONS =====

  async getModels() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to get models");
      return await response.json();
    } catch (error) {
      console.error("Get models error:", error);
      return { models: [] };
    }
  }

  async refreshModels() {
    try {
      const response = await fetch(`${this.baseUrl}/models/refresh`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Failed to refresh models");
      return await response.json();
    } catch (error) {
      console.error("Refresh models error:", error);
      return null;
    }
  }

  // ===== STATS & CLEANUP =====

  async getStats() {
    try {
      const response = await fetch(`${this.baseUrl}/api/stats`);
      if (!response.ok) throw new Error("Failed to get stats");
      return await response.json();
    } catch (error) {
      console.error("Get stats error:", error);
      return null;
    }
  }

  async cleanup(days = 30, userId = "default") {
    try {
      const response = await fetch(`${this.baseUrl}/api/cleanup?days=${days}&user_id=${userId}`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Failed to cleanup");
      return await response.json();
    } catch (error) {
      console.error("Cleanup error:", error);
      return null;
    }
  }

  // ===== TEAM OPERATIONS =====

  async createTeam(name, description, members) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams`, {
        method: "POST",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, description, members })
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || "Failed"); }
      return await response.json();
    } catch (error) {
      console.error("Create team error:", error);
      throw error;
    }
  }

  async listTeams() {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to list teams");
      return await response.json();
    } catch (error) {
      console.error("List teams error:", error);
      return [];
    }
  }

  async getTeam(teamId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to get team");
      return await response.json();
    } catch (error) {
      console.error("Get team error:", error);
      return null;
    }
  }

  async deleteTeam(teamId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}`, {
        method: "DELETE",
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to delete team");
      return await response.json();
    } catch (error) {
      console.error("Delete team error:", error);
      return null;
    }
  }

  async addTeamMember(teamId, member) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}/members`, {
        method: "POST",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(member)
      });
      if (!response.ok) throw new Error("Failed to add member");
      return await response.json();
    } catch (error) {
      console.error("Add member error:", error);
      return null;
    }
  }

  async removeTeamMember(teamId, memberId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to remove member");
      return await response.json();
    } catch (error) {
      console.error("Remove member error:", error);
      return null;
    }
  }

  async getMemberMessages(teamId, memberId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}/members/${memberId}/messages`, {
        headers: this.getAuthHeaders()
      });
      if (!response.ok) throw new Error("Failed to get messages");
      return await response.json();
    } catch (error) {
      console.error("Get member messages error:", error);
      return [];
    }
  }

  async sendTeamChat(teamId, memberId, message, model = "gpt-4o-mini") {
    return await fetch(`${this.baseUrl}/api/teams/${teamId}/members/${memberId}/chat`, {
      method: "POST",
      headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, model })
    });
  }

  async sendMasterPrompt(teamId, message, model = "gpt-4o-mini") {
    try {
      const response = await fetch(`${this.baseUrl}/api/teams/${teamId}/master`, {
        method: "POST",
        headers: this.getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message, model })
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.detail || "Failed"); }
      return await response.json();
    } catch (error) {
      console.error("Master prompt error:", error);
      throw error;
    }
  }

  // ===== CONNECTIVITY =====

  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Export API instance
const api = new BambamAPI();
