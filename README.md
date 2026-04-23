# MagAI — Current App State (Agent Handover Doc)

This README is the **source of truth for the current product behavior** so the next AI agent can continue work safely.

Last updated: **2026-04-24 (UI/UX Overhaul)**

---

## 1) Product Overview

MagAI is a FastAPI + Vanilla JS single-page app for:

- Authenticated AI chat (streaming)
- AI image generation
- AI video generation
- AI image edit (img2img)
- Credit-based usage tracking

Core UX principle: one app shell, sidebar navigation, quick actions, and persistent user-isolated chat history.

---

## 2) Important Current Decisions (Do Not Revert)

These were intentionally changed and should stay as-is unless explicitly requested:

1. **New Chat button added above chat history** in sidebar.
2. **Quick Actions** button opens menu with exactly:
   - Chat
   - Image Generation
   - Video Generation
3. **Doodle / Thunder toggle buttons removed from UI**.
4. **Image Edit moved into Images panel** (Generate/Edit switch inside Images tab).
5. **FaceSwap removed completely** (frontend + backend contracts).
6. **UI/UX Redesigned with Lavender & Mint Doodle Theme** (2026-04-24):
   - Soft lavender (#EDE9FF) sidebar with subtle dot pattern
   - Purple accent (#7C5CFC) with mint secondary (#4ECDC4)
   - Pill-shaped buttons and nav items with smooth animations
   - Gradient text on headings and branding
   - Message bubbles: user = purple gradient pill, AI = white card with left accent bar
   - Dashboard quick-create cards with colorful top borders
   - Rounded corners (16-24px) throughout for modern, friendly feel
   - Custom scrollbars and focus states with purple glow
   - Micro-animations: hover translate, scale, shadow lift

If you reintroduce old "tools", FaceSwap, or revert the UI to flat colors, you are regressing the product.

---

## 3) Current Frontend UX Map

Main UI file: `frontend/index.html`

### Sidebar

- Panels: `Dashboard`, `Chats`, `Images`, `Video`
- Credits mini badge
- `+ New Chat` button (with `Ctrl+N` shortcut hint)
- Chat history list (recent chats)
- `+ Quick Actions` menu:
  - Chat
  - Image Generation
  - Video Generation
- User block + logout

### Dashboard Panel

- Quick Create cards:
  - Start a New Chat
  - Generate an Image
  - Generate a Video
- Recent chats list
- Announcement cards

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

### Images Panel

- Left: result canvas/grid
- Right: control sidebar with tool picker:
  - `Generate`
  - `Edit`

Generate tab:
- Prompt
- Model select (`fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/flux-pro`)
- Size presets
- Style presets
- Generate button + credit label

Edit tab:
- Upload source image
- Edit prompt
- Strength slider
- Edit button
- Output is rendered in the same image results canvas

### Video Panel

- Prompt
- Model select (`Kling Standard`, `Stable Video`)
- Duration select
- Generate button + credit label
- Video result with Open/Download actions

### Removed UI

- No `Tools` panel
- No FaceSwap cards/forms/buttons
- No theme switch buttons in sidebar

---

## 3A) Design System — Lavender & Mint Doodle

**Color Palette** (CSS variables in `frontend/styles.css`):
- Background: `#F7F5FF` (light lavender)
- Sidebar: `#EDE9FF` (soft lavender)
- Surface: `#FFFFFF` (white cards/panels)
- Border: `#DDD6FE` (soft lavender border)
- Text main: `#2D2B55` (deep navy-purple)
- Text muted: `#7C6FA0` (muted purple-gray)
- **Accent**: `#7C5CFC` (vibrant purple)
- **Secondary**: `#4ECDC4` (mint/teal)
- Alert: `#FF7757` (coral)

**Gradients**:
- Primary: Purple → Mint (used for buttons, logo, user bubbles)
- Chat: Coral → Purple (user message gradient)
- Image: Purple → Mint (generate button)
- Video: Mint → Cyan (video generate button)

**Shadows**: Soft purple-tinted shadows (rgba(124,92,252,xx)) at multiple depths

**Radius**: Pill buttons (50px), cards (16px), inputs (12px), modals (20px)

**Subtle Doodle Elements**:
- Sidebar: 18px dotted pattern overlay (3-5% opacity)
- Buttons: Smooth translate/scale on hover
- Message bubbles: Smooth slide-up animation
- Focus states: Purple glow (0 0 0 3px)

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

- `startNewChat()` resets active chat UI and creates new `chatId`
- `switchImageTool()` toggles Generate/Edit inside Images panel
- `generateImage()` -> `API.ai.generateImage(...)`
- `runEditImage()` -> `API.ai.editImage(...)`
- `generateVideo()` -> `API.ai.generateVideo(...)`
- `sendChatMessage()` handles chat stream and inline mode switching

### Quick Actions Behavior

- Chat -> switches to chat and starts a new chat
- Image Generation -> switches to image panel and opens Generate tab
- Video Generation -> switches to video panel

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

- Routes are wired via `backend/chat_endpoints.py`
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

1. Theme code (`applyTheme`, theme classes) still exists in JS/CSS although theme buttons are removed from UI.
2. Some legacy routes and structures remain for backward compatibility.
3. `main.py` includes older/extended logic; unified flow should continue to prioritize `/ai/generate`.
4. Team/project infrastructure exists in DB schema but is currently disabled at router level for MVP.

---

## 11) Guardrails for Future Changes

- Keep `/ai/generate` as the primary generation contract.
- Keep FaceSwap removed unless explicitly requested.
- Keep Image Edit inside Images panel.
- Keep New Chat button above chat history and Quick Actions menu behavior.
- Preserve user-isolated chat history and credit deduction semantics.

**UI/UX Design Guardrails** (Lavender & Mint Doodle):
- Maintain the soft lavender sidebar (`#EDE9FF`) and purple accent (`#7C5CFC`)
- Keep pill-shaped buttons and nav items with hover animations
- Preserve gradient text on headings and branding
- Keep message bubble styling: user = gradient pill, AI = white card with accent bar
- Do NOT reintroduce flat, corporate-looking colors (blues, grays)
- Do NOT remove rounded corners or animations — maintain modern feel
- All color changes must go through CSS `:root` variables (centralized in `styles.css`)
- Maintain contrast ratios for WCAG accessibility

---

## 12) Quick File Reference

**Frontend (All styling in `frontend/styles.css`):**
- Shell/layout: `frontend/index.html`
- App logic: `frontend/app.js`
- API wrapper: `frontend/api.js`
- **Design tokens & all styles**: `frontend/styles.css` (colors, shadows, radius, animations — all `:root` CSS variables)

**Backend:**
- Unified AI endpoint: `backend/ai_router.py`
- FAL client: `backend/fal_client.py`
- Costs: `backend/model_costs.py`
- Credits router: `backend/credits_router.py`
- Auth router: `backend/auth.py`
- App bootstrap: `backend/main.py`
- DB manager: `backend/database.py`

---

MagAI is currently a focused chat + image + video + image-edit platform with credits, strong sidebar UX, and streamlined generation paths.
