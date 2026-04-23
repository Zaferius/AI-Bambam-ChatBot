# MagAI — Current App State (Agent Handover Doc)

This README is the **source of truth for the current product behavior** so the next AI agent can continue work safely.

Last updated: **2026-04-24 (Black & Yellow Brutalist Redesign)**

---

## 1) Product Overview

MagAI is a FastAPI + Vanilla JS single-page app for:

- Authenticated AI chat (streaming)
- AI image generation
- AI video generation
- AI image edit (img2img)
- Credit-based usage tracking

Core UX principle: one app shell, collapsible sidebar navigation, quick actions, and persistent user-isolated chat history.

---

## 2) Important Current Decisions (Do Not Revert)

These were intentionally changed and should stay as-is unless explicitly requested:

1. **New Chat button** in sidebar — clicking it switches to Chat panel AND starts a new chat.
2. **Quick Actions** button opens menu with exactly:
   - Chat
   - Image Generation
   - Video Generation
3. **Doodle / Thunder toggle buttons removed from UI**.
4. **Image Edit moved into Images panel** (Generate/Edit switch inside Images tab).
5. **FaceSwap removed completely** (frontend + backend contracts).
6. **Sidebar toggle (3-line hamburger)** collapses sidebar to 62px icon-only mode. Clicking again expands.
7. **Image & Video panels are vertical layout**: result canvas on top, controls centered below (max-width 680px).
8. **Black & Yellow Brutalist Design** (2026-04-24):
   - Black sidebar (`#0A0A0A`) with yellow (`#FFE400`) active nav and white muted text
   - Off-white (`#FAFAF8`) main panel background
   - Hard offset shadows (`4px 4px 0 #0A0A0A`) — no blur
   - `2px solid #0A0A0A` borders everywhere — sharp, clean lines
   - Border-radius max `2px` — no pill shapes, no rounded corners
   - Font: `Space Grotesk` (UI) + `JetBrains Mono` (labels, badges, dates)
   - Buttons: yellow fill (primary actions), black fill (video generate, AI avatar)
   - User message bubbles: black background, white text
   - AI message bubbles: white card with 4px yellow left border
   - Hard shadow hover effect: button shifts `translate(-1px, -1px)` on hover
   - Login page: black background with yellow grid overlay, yellow hard-shadow card

If you reintroduce gradients, soft shadows, pill-shaped buttons, lavender/purple colors, or the old doodle theme, you are regressing the product.

---

## 3) Current Frontend UX Map

Main UI file: `frontend/index.html`

### Sidebar

- Black background, yellow accents
- Panels: `Dashboard`, `Chats`, `Images`, `Video`
- Credits mini badge
- `+ New Chat` button (switches to Chat panel + starts new chat, with `Ctrl+N` shortcut hint)
- Chat history list (recent chats)
- `+ Quick Actions` menu:
  - Chat
  - Image Generation
  - Video Generation
- User block + logout
- **3-line toggle button** collapses/expands sidebar (62px collapsed, 256px expanded)

### Dashboard Panel

- Quick Create cards:
  - Start a New Chat
  - Generate an Image
  - Generate a Video
- Recent chats list
- Announcement cards
- Two-column layout (left: quick create + recent chats, right: announcements), separated by 2px border

### Chat Panel

- Model selector dropdown (provider-grouped)
- Hero input + sticky input
- Attachments (images/docs)
- Voice input button (speech-to-text)
- Prompt mode buttons:
  - Chat
  - Generate Image
  - Generate Video
- Welcome chips for quick prompt starts
- Welcome title has yellow highlight span on username

### Images Panel

- **Top**: result canvas / image grid
- **Bottom center** (max-width 680px): controls strip
  - Tool picker: `Generate` | `Edit`

Generate tab:
- Prompt textarea
- Model select (`fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/flux-pro`) — inline row, flex wrap
- Size select — inline row
- Style select — inline row
- Generate button (yellow) + credit label

Edit tab:
- Upload source image (left)
- Edit prompt + strength slider (right)
- Edit button

### Video Panel

- **Top**: result canvas / video player
- **Bottom center** (max-width 680px): controls strip
  - Prompt textarea
  - Model select (`Kling Standard`, `Stable Video`) — inline row
  - Duration select — inline row
  - Generate button (black/yellow) + credit label

### Login Page

- Black background with yellow grid pattern
- Yellow hard-shadow card (`8px 8px 0 yellow`)
- Sign In / Sign Up tabs
- Brutalist input fields with 2px borders

### Removed UI

- No `Tools` panel
- No FaceSwap cards/forms/buttons
- No theme switch buttons in sidebar
- No gradients anywhere
- No soft/blur shadows

---

## 3A) Design System — Black & Yellow Brutalist

**Color Palette** (CSS variables in `frontend/styles.css`):
- Background: `#FAFAF8` (off-white)
- Sidebar: `#0A0A0A` (black)
- Surface: `#FFFFFF` (white cards)
- Surface alt: `#F0EFEC`
- Border: `#0A0A0A` (black — all borders)
- Border light: `#E0DFDB`
- Text main: `#0A0A0A`
- Text muted: `#3A3835`
- Text light: `#7A7870`
- **Accent**: `#FFE400` (yellow)
- **Accent dark**: `#E6CE00`

**Shadows** — hard offset, zero blur:
- `--shadow-xs`: `3px 3px 0 #0A0A0A`
- `--shadow-sm`: `4px 4px 0 #0A0A0A`
- `--shadow-md`: `5px 5px 0 #0A0A0A`
- `--shadow-lg`: `6px 6px 0 #0A0A0A`

**Radius**: Max `2px` — essentially square corners throughout

**Typography**:
- UI font: `Space Grotesk` (400/500/600/700)
- Mono font: `JetBrains Mono` (labels, badges, dates, model names, code)

**Interaction pattern**: Hover → `translate(-1px, -1px)` + larger shadow (lifts toward top-left). No scale transforms.

**All color changes must go through CSS `:root` variables** (centralized in `styles.css`).

---

## 4) Frontend Logic Summary

Main logic: `frontend/app.js`
API wrapper: `frontend/api.js`
Styles: `frontend/styles.css`

### Key State

`State` currently includes:

- `currentPanel`, `chatId`, `currentModel`
- `chatMode` (`chat` | `image` | `video`)
- `currentImageTool` (`generate` | `edit`)
- `attachedFiles`
- `editSourceUrl`
- credits and streaming/listening flags

### Key Flows

- `startNewChat()` — resets active chat UI, creates new `chatId`; called after `switchPanel('chat')`
- `switchPanel()` — switches active nav item and panel
- `switchImageTool()` — toggles Generate/Edit inside Images panel
- `generateImage()` → `API.ai.generateImage(...)`
- `runEditImage()` → `API.ai.editImage(...)`
- `generateVideo()` → `API.ai.generateVideo(...)`
- `sendChatMessage()` — handles chat stream and inline mode switching
- Sidebar toggle: `.sidebar-toggle` click → toggles `sidebar.collapsed` class

### Quick Actions Behavior

- Chat → switches to chat panel and starts a new chat
- Image Generation → switches to image panel and opens Generate tab
- Video Generation → switches to video panel

---

## 5) Backend Architecture

### Core

- `backend/main.py`
  - FastAPI app setup
  - auth + credits + ai router init
  - model listing endpoint
  - legacy chat endpoints still present (`/chat`, `/chat/stream`)
- `backend/ai_router.py`
  - Unified `/ai/generate` endpoint
  - Supported types: `chat`, `image`, `video`, `edit`
  - Streaming chat with credits metadata trailer
- `backend/fal_client.py`
  - fal.ai queue wrapper
  - image generation, image-to-image edit, video generation
- `backend/model_costs.py`
  - per-model credit costs (LLM + fal)
- `backend/credits_router.py`
  - balance, transactions, purchase packs, manual add (dev-flag)
- `backend/auth.py`
  - signup/login/JWT verification
- `backend/database.py`
  - SQLite manager (`bambam_chats.db` default)

### Chat CRUD

- Routes wired via `backend/chat_endpoints.py`
- Main routes:
  - `GET /api/chats`
  - `GET /api/chats/{chat_id}/messages`
  - `POST /api/chats/{chat_id}/messages`
  - `DELETE /api/chats/{chat_id}`

---

## 6) Active API Contracts (What Frontend Uses)

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/verify`

### Models

- `GET /models`

### Credits

- `GET /credits/balance`
- `GET /credits/transactions`
- `GET /credits/packs`
- `POST /credits/purchase`
- `POST /credits/add` (guarded by env toggle)

### Unified AI

- `POST /ai/generate` with `type`:
  - `chat` (streaming)
  - `image`
  - `video`
  - `edit`

### Legacy (kept for compatibility)

- `POST /chat/stream`
- `POST /chat`

---

## 7) Credits + Cost Model Snapshot

Current notable fal costs in `backend/model_costs.py`:

- `fal-ai/flux/schnell`: 2
- `fal-ai/flux/dev`: 5
- `fal-ai/flux-pro`: 8
- `fal-ai/flux/dev/image-to-image`: 4
- `fal-ai/kling-video/v1/standard/text-to-video`: 12
- `fal-ai/stable-video`: 10

Default signup credit grant: **20 credits**.

---

## 8) Environment Configuration

Create `backend/.env`:

```env
# Core
OPENROUTER_API_KEY=your_key
FAL_KEY=your_key
JWT_SECRET_KEY=your_secret

# Optional
OPENAI_API_KEY=your_key
GROQ_API_KEY=your_key
GEMINI_API_KEY=your_key

# Runtime
APP_ENV=development
ALLOWED_ORIGINS=*

# Dev toggles
ALLOW_DEV_AUTH_BYPASS=false
ALLOW_MANUAL_CREDIT_ADD=false
```

---

## 9) Run Instructions

```bash
pip install -r backend/requirements.txt
cd backend
python -m uvicorn main:app --reload
```

Open: `http://localhost:8000`

---

## 10) Known Legacy / Technical Debt (For Next Agent)

1. Theme code (`applyTheme`, theme classes) still exists in JS although theme buttons are removed from UI — safe to remove.
2. Some legacy routes and structures remain for backward compatibility.
3. `main.py` includes older/extended logic; unified flow should continue to prioritize `/ai/generate`.
4. Team/project infrastructure exists in DB schema but is currently disabled at router level for MVP.
5. `frontend/teams.html` exists but is not linked from the main app.

---

## 11) Guardrails for Future Changes

- Keep `/ai/generate` as the primary generation contract.
- Keep FaceSwap removed unless explicitly requested.
- Keep Image Edit inside Images panel.
- Keep New Chat button wired to `switchPanel('chat') + startNewChat()`.
- Keep sidebar toggle functional (`.sidebar-toggle` → `.sidebar.collapsed`).
- Preserve user-isolated chat history and credit deduction semantics.

**UI/UX Design Guardrails** (Black & Yellow Brutalist):
- Maintain black sidebar (`#0A0A0A`) and yellow accent (`#FFE400`)
- Keep hard offset shadows — no blur, no soft box-shadows
- Keep `2px solid #0A0A0A` borders — do NOT soften to lighter colors
- Keep border-radius at max `2px` — no rounded corners, no pill shapes
- Do NOT reintroduce gradients (linear-gradient, radial-gradient on UI elements)
- Do NOT reintroduce purple, lavender, mint, or coral color schemes
- Do NOT add animations beyond the current `translate(-1px,-1px)` hover lift
- All color changes must go through CSS `:root` variables in `styles.css`
- Typography must stay `Space Grotesk` (UI) + `JetBrains Mono` (mono contexts)

---

## 12) Quick File Reference

**Frontend:**
- Shell/layout: `frontend/index.html`
- App logic: `frontend/app.js`
- API wrapper: `frontend/api.js`
- **All styles & design tokens**: `frontend/styles.css`
- Login page: `frontend/login.html`

**Backend:**
- Unified AI endpoint: `backend/ai_router.py`
- FAL client: `backend/fal_client.py`
- Costs: `backend/model_costs.py`
- Credits router: `backend/credits_router.py`
- Auth router: `backend/auth.py`
- App bootstrap: `backend/main.py`
- DB manager: `backend/database.py`

---

MagAI is a focused chat + image + video + image-edit platform with credits, collapsible sidebar, vertical image/video panel layout, and a strict Black & Yellow Brutalist design system.
