# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Raiko** is a credit-based AI content platform built with FastAPI (Python) + Vanilla JS (no frontend framework).

Features: streaming AI chat, image generation, video generation (text-to-video + image-to-video), image editing, and a localStorage-backed media library.

**Stack**: Python 3.11 / FastAPI / Uvicorn / SQLite / Vanilla JS / fal.ai (image+video) / OpenRouter (LLMs)

---

## Running the App

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run backend (serves frontend statically at http://localhost:8000)
cd backend
python -m uvicorn main:app --reload

# Docker
docker-compose up --build
```

**Required env vars** (`backend/.env`):
- `FAL_KEY`, `OPENROUTER_API_KEY` — required for generation
- `JWT_SECRET_KEY` — required in production
- `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` — optional

**Dev toggles** (set in `.env`):
- `ALLOW_DEV_AUTH_BYPASS=true` — skip auth
- `ALLOW_MANUAL_CREDIT_ADD=true` — enables `POST /credits/add`

---

## Architecture

```
backend/
  main.py             # FastAPI app, routers, rate limiting
  ai_router.py        # Unified POST /ai/generate (chat|image|video|edit|image_to_video)
  fal_client.py       # Async wrapper for fal.ai REST queue API
  model_costs.py      # Credit cost per model
  database.py         # SQLite manager — users, chats, messages, credits, memory
  auth.py             # JWT signup/login
  credits_router.py   # Balance, transactions, purchases
  chat_endpoints.py   # Chat CRUD

frontend/
  index.html          # App shell — all panels, navbar, auth gate
  app.js              # All SPA logic: nav, chat, image/video gen, media
  api.js              # Fetch wrappers around backend routes
  styles.css          # All CSS (Black & Yellow Brutalist design system)
  login.html          # Auth forms
```

### Request Flow

```
frontend (app.js) → api.js → POST /ai/generate { type, model, prompt, ... }
  → ai_router.py: deduct credits → fal_client.py (image/video) OR LLM API (chat)
  → response { output, credits_used, credits_remaining, model, type }
  → frontend: update UI + saveMediaItem() to localStorage
```

### Key Backend Modules

- **`ai_router.py`** — The single unified generation endpoint. `type` field dispatches to fal or LLM. Credit deduction is atomic and happens before generation (failures still deduct — prevents free abuse).
- **`fal_client.py`** — Handles async queue polling for fal.ai. Contains `_ASPECT_RATIO_MODELS` (Nano Banana uses `aspect_ratio` string, not `{width,height}`) and `_IMAGE_SIZE_PRESET_MODELS` (Seedream uses preset enum strings like `square_hd`). Do not bypass this routing.
- **`database.py`** — All DB operations. All chat/message queries are filtered by `user_id`.

### Frontend State

Single global `State` object in `app.js`. Key fields:
- `currentPanel`, `currentModel`, `chatId`, `credits`, `isStreaming`
- `currentImageTool` (`generate|edit`), `currentVideoTool` (`text|image`)
- `editSourceUrl`, `i2vSourceUrl` — source images for edit/i2v

**localStorage keys** (DO NOT RENAME — breaks existing users):
- `magai_token` — JWT
- `magai_user` — `{id, email, username}`
- `raiko_media` — array of generated media items

### Global Functions (Must Stay Global — Called from Inline `onclick`)

`selectImageModel(modelId)`, `selectVideoModel(modelId, tool)`, `switchPanel(panelId)`, `startNewChat()`, `switchImageTool(toolId)`, `switchVideoTool(toolId)`, `showGenPlaceholder(containerId)`, `clearGenPlaceholder(containerId)`, `saveMediaItem(type, url, prompt, model)`, `loadMediaPanel()`

---

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/signup` | Register |
| POST | `/auth/login` | Login → JWT |
| GET | `/auth/me` | Current user |
| POST | `/ai/generate` | Unified generation (chat/image/video/edit/image_to_video) |
| GET | `/models` | Available models |
| GET/POST | `/credits/*` | Balance, transactions, packs, purchase |
| GET/POST/DELETE | `/api/chats/*` | Chat CRUD + messages |

---

## Design System: Black & Yellow Brutalist

**This is intentional. Do not regress it.**

| Token | Value |
|-------|-------|
| `--black` | `#0A0A0A` |
| `--white` / `--bg` | `#FAFAF8` |
| `--yellow` / `--accent` | `#FFE400` |
| Shadows | `4px 4px 0 #0A0A0A` (hard offset, zero blur) |
| Borders | `2px solid #0A0A0A` |
| Border-radius | max `2px` |
| UI font | `Space Grotesk` |
| Mono font | `JetBrains Mono` (labels, badges, dates, model names) |
| Hover | `translate(-1px, -1px)` + larger shadow — no scale transforms |

**Never**: gradients, soft/blur shadows, pill buttons, rounded cards, purple/lavender/coral colors, standalone `ⓘ` icons.

---

## Critical Constraints

### Layout (DO NOT REVERT)
- Navigation is a **top horizontal navbar** (not a left sidebar)
- Chat history sidebar is a **220px left sub-panel inside the Chat panel**
- `+ New Chat` button lives only in the chat panel's left sidebar — NOT in the navbar
- **My Media** is accessible only via the user avatar dropdown — NOT as a nav link
- **Mega-dropdowns** (Image/Video nav buttons) use `position: fixed` + JS-positioning via `getBoundingClientRect()` — CSS-only solutions break them
- Video panel uses `.has-result` class on `#panel-video` to toggle between explainer and canvas

### Model Parameter Formats
- **Nano Banana** models: pass `aspect_ratio` as a string (e.g. `"16:9"`) — NOT `{width, height}`
- **Seedream** models: pass `image_size` as a preset string (`square_hd`, `portrait_16_9`, `landscape_16_9`) — NOT pixel dimensions

### Key Element IDs (DO NOT RENAME)
`#sidebar-nav`, `#nav-dashboard`, `#nav-chat`, `#nav-image`, `#nav-video`, `#navbar-user-wrap`, `#user-dropdown`, `#panel-video`, `#video-tool-picker`, `#vid-panel-text`, `#vid-panel-image`, `#image-results`, `#video-result-area`, `#video-explainer`, `#chat-list-items`, `#btn-new-chat-inner`

---

## Known Technical Debt

- Theme code (`applyTheme`, `.theme-doodle`, `.theme-thunder`) — buttons removed from UI, code is dead
- Old sidebar CSS (`.sidebar`, `.sidebar-nav`, `.sidebar-toggle`) — dead code
- Dashboard showcase images are static dark placeholders
- My Media is localStorage-only — no backend sync (future: `/api/media` endpoints)
- `#udrop-profile`, `#udrop-account` — rendered but no click handlers wired
- Teams/Projects: DB schema exists but router disabled for MVP
- Legacy endpoints `POST /chat/stream`, `POST /chat` — kept for compatibility, prefer `/ai/generate`

---

## Source of Truth

**`README.md` is the authoritative product spec.** It documents all intentional UX decisions, element IDs, design guardrails, and API contracts in detail. Read it before making structural changes.
