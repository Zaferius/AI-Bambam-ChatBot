# MagAI — Your AI Universe 🚀

MagAI is a premium, high-performance generative AI platform that consolidates the world's most powerful models into a single, seamless experience. Built with a focus on speed, aesthetics, and user privacy, MagAI provides a unified ecosystem for text, image, and video generation backed by a robust credit-based economy.

## ✨ Key Features

### 🧠 Intelligence & Chat
*   **Unified AI Router**: Access GPT-4o, Claude 3.5 Sonnet, Llama 3.1, and more through a single orchestration layer (`/ai/generate`).
*   **Web Search Integration**: All chat models are equipped with real-time internet access via OpenRouter Server Tools for up-to-the-minute accuracy.
*   **Persistent Chat History**: Secure, user-isolated chat sessions stored in a local SQLite database. Manage your history with intuitive sidebar controls and easy deletion.
*   **Context-Aware Memory**: Long-term conversation persistence ensures the AI remembers your project details across sessions.

### 🎨 Multimedia & Tools
*   **Image Generation**: Powered by fal.ai (Flux, SDXL) for stunning high-resolution visuals.
*   **Cinematic Video**: Create high-quality AI videos and animations from simple prompts.
*   **Face Swap & Editing**: Advanced image-to-image tools and professional face swapping capabilities.
*   **Rich File System**: Attach and preview documents (PDF, DOCX) and images directly in the chat interface with professional iconography.

### 💎 Premium Experience
*   **Dynamic Visual Branding**: Automatic provider logo integration (OpenAI, Anthropic, Meta, Google) in model selectors and chat avatars for a "Pro" feel.
*   **Credit-Based Economy**: Real-time credit tracking and transaction logging. No subscriptions required—only pay for what you generate.
*   **Premium SPA**: A lightning-fast Single Page Application built with Vanilla JS and CSS, optimized for zero-latency interactions and sleek dark/light mode aesthetics.

## 🛠️ Architecture

### Backend (FastAPI & Python 3.10+)
- **`ai_router.py`**: The "brain" of MagAI. Handles SSE streaming, tool calls, and credit orchestration.
- **`database.py`**: High-efficiency SQLite manager for user data, persistent memories, and session history.
- **`credits_router.py`**: Secure ledger system for balance management and credit pack processing.
- **`auth.py`**: Industrial-grade JWT authentication with user-specific data isolation.

### Frontend (Modern Vanilla JS)
- **`app.js`**: Adaptive application logic managing state, chat streams, and UI updates.
- **`api.js`**: Reliable service layer for backend communication with automatic cache-busting.
- **`styles.css`**: Scalable design system using modern CSS properties and responsive layouts.

## ⚙️ Quick Start

1.  **Configure Environment**:
    Create `backend/.env`:
    ```env
    OPENROUTER_API_KEY=your_key
    FAL_KEY=your_key
    JWT_SECRET_KEY=your_secret
    ```

2.  **Install & Run**:
    ```bash
    pip install -r backend/requirements.txt
    cd backend
    python -m uvicorn main:app --reload
    ```

3.  **Launch**:
    Visit `http://localhost:8000` to start your journey into the AI Universe.

## 📌 Roadmap
- [x] Persistent Chat History & User Isolation
- [x] OpenRouter Web Search Integration
- [x] Aesthetic Model Branding & Icons
- [ ] Stripe Payment Gateway
- [ ] Multi-User Organization Workspaces
- [ ] API Access for Developers

---
*MagAI — Powering the next generation of human-AI collaboration.*
