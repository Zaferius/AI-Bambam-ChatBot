# 🧠 Bambam AI → MagAI-Style Platform Transformation Plan

## 🎯 Goal

Transform the existing **AI Bambam ChatBot system** into a **unified AI platform (MagAI-style)** that provides:

* Multi-model LLM access (via OpenRouter)
* AI image/video tools (via fal.ai)
* Unified chat + generation interface
* Credit-based + subscription monetization
* Clean, simple UX (no agent complexity for end user)

---

## ⚠️ Key Strategic Change

We are **REMOVING complexity** and focusing on:

❌ AI Teams / multi-agent system (advanced feature → remove from MVP)
❌ Project file generation system (keep internally, hide from UI)

✅ Single powerful AI workspace
✅ Multi-model selection
✅ Tool-based AI actions (chat, image, video, edit)

---

## 🧱 Phase 1 — Core Refactor (Backend)

### 1. Simplify Architecture

Refactor backend into 3 main domains:

* `chat/` → LLM chat system
* `tools/` → AI tools (image, video, editing)
* `billing/` → credits + subscriptions

Remove or isolate:

* team_endpoints.py (disable for now)
* agentic run logic (keep but unused)

---

### 2. Model Routing Layer (CRITICAL)

Replace current model system with:

```python
class ModelRouter:
    def route(request):
        if request.provider == "openrouter":
            return OpenRouterClient()
        elif request.provider == "fal":
            return FalAIClient()
```

Unify all providers under ONE interface:

* OpenRouter → text models
* fal.ai → image/video/edit

---

### 3. Unified AI Endpoint

Create:

```
POST /ai/generate
```

Request:

```json
{
  "type": "chat | image | video | edit",
  "model": "gpt-4o-mini | qwen | flux | etc",
  "prompt": "...",
  "options": {}
}
```

Response:

```json
{
  "output": "...",
  "credits_used": 3
}
```

---

### 4. Credit System

Add:

* user_credits table
* transactions table

Logic:

* each request consumes credits
* map cost per model:

  * LLM → per token
  * fal.ai → per request

---

## 🎨 Phase 2 — Frontend Transformation

### 1. Kill Current UI Complexity

Remove:

* Teams page
* Agent workspace
* File system UI

---

### 2. New UI Structure

Single page:

```
[ Sidebar ]
- Chat
- Image Generator
- Video Generator
- AI Tools

[ Main Area ]
Dynamic based on selected tool
```

---

### 3. Chat UI (Core)

Features:

* model selector (OpenRouter models)
* streaming responses
* message history

---

### 4. Image / Video UI

* prompt input
* style presets
* result preview grid

---

## 💰 Phase 3 — Monetization

### 1. Credit Packs

* 20 credits
* 50 credits
* 100 credits

---

### 2. Subscription

* monthly unlimited (fair usage)
* or monthly credit refill

---

### 3. Tracking

Store:

* usage per user
* cost per request
* profit margin

---

## ⚙️ Phase 4 — Integration Layer

### OpenRouter

* dynamic model list fetch
* allow user to select any model

---

### fal.ai

Wrap endpoints:

* image generation
* image editing
* face swap
* video generation

---

## 🧠 Phase 5 — UX Philosophy

We are NOT building:

❌ developer tool
❌ agent framework

We ARE building:

✅ "AI App Store in one place"
✅ simple, fast, clean experience

---

## 🔥 Phase 6 — Branding

Rename internally:

* Bambam → Engine (internal)
* Public product → PyroArt AI (or new brand)

---

## 📦 Phase 7 — Deployment

* Dockerized backend (already done)
* Deploy via Coolify
* Frontend static → Vercel

---

## 🚀 Final Product Vision

A single platform where users can:

* Chat with any AI model
* Generate images/videos
* Use AI tools
* Pay once, access everything

---

## 🧩 Notes from Existing System

We are REUSING:

* FastAPI backend ✔
* Auth system ✔
* Model integrations ✔
* Streaming system ✔

We are REMOVING:

* AI Teams complexity ❌
* Project file system UI ❌

---

## 🏁 MVP Definition

Ship when:

* Chat works with OpenRouter
* Image generation works (fal.ai)
* Credits system works
* Simple UI is usable

---

## ⚡ Future (Post-MVP)

* Reintroduce AI Teams as premium feature
* Add workflow automation
* Add API access for users

---

END OF PLAN
