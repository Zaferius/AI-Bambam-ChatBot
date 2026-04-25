# Raiko — Current App State (Agent Handover Doc)

This README is the **source of truth for the current product behavior** so the next AI agent can continue work safely.

Last updated: **2026-04-25 (Image model dropdown picker, Nano Banana naming, Seedream + new model additions)**

---

## 1) Product Overview

Raiko is a FastAPI + Vanilla JS single-page app for:

- Authenticated AI chat (streaming)
- AI image generation
- AI video generation (text-to-video + image-to-video)
- AI image edit (img2img)
- My Media library (all generated images & videos, localStorage-backed)
- Credit-based usage tracking

Core UX principle: one app shell, **top horizontal navbar** navigation, persistent user-isolated chat history.

---

## 2) Important Current Decisions (Do Not Revert)

These were intentionally changed and should stay as-is unless explicitly requested:

1. **Top navbar** replaces the old left sidebar. Navigation is now a horizontal bar at the top of every page.
2. **Chat history sidebar** lives *inside* the Chat panel as a 220px left sub-panel (not in the top navbar).
3. **+ New Chat button** is only inside the chat panel's left sub-panel — it is NOT in the top navbar.
4. **Quick Actions** (`+ More` button in navbar) opens a dropdown with: Chat, Image Generation, Video Generation.
5. **Doodle / Thunder toggle buttons removed from UI**.
6. **My Media moved to user avatar dropdown** — removed from top navbar nav links; accessible only via the user avatar dropdown menu.
7. **User avatar dropdown** — clicking the avatar/name in the top navbar opens a dropdown with: user name + "Free Plan" label, credits bar (green fill, live balance), Go Premium/Upgrade button, View profile, Manage account, Join our community, My Media, Sign out.
8. **Logo yellow border removed** — `.navbar-orb` has `border: none`, only the "R" initial is shown in the navbar logo area.
6. **Image Edit moved into Images panel** (Generate/Edit switch inside Images tab).
7. **FaceSwap removed completely** (frontend + backend contracts).
8. **Image & Video panels — new layout**:
   - **Images panel**: Left sidebar layout with controls always visible (not centered floating card). After generation canvas appears; on error canvas is hidden.
   - **Video panel**: Two-column layout — left sidebar (290px) with all controls + right main area with explainer before generation and canvas after generation.
9. **Generation placeholder**: pressing Generate shows the canvas area with a dual-ring spinner and cycling text. Uses `showGenPlaceholder(containerId)` / `clearGenPlaceholder(containerId)`. Video panel uses `.has-result` class on `#panel-video` to toggle between explainer and canvas.
10. **Dot-grid workspace background** on Image panel — SVG data-URL pattern, no CSS gradients.
11. **My Media panel** (sidebar nav item `data-panel="media"`, panel id `panel-media`):
    - Shows all generated images and videos from localStorage (`raiko_media` key).
    - Filter tabs: All / Images / Videos.
    - Each card: thumbnail/video preview, type badge, prompt, date, model, Open / Save / Delete actions.
    - `saveMediaItem(type, url, prompt, model)` is called automatically after every successful image or video generation.
12. **Video panel has two tabs** (tool picker `#video-tool-picker`):
    - **Text to Video** (`vid-panel-text`): prompt → motion preset → model → duration → Generate.
    - **Image to Video** (`vid-panel-image`): upload image + prompt → model → duration → Generate. Prompt noted as "auto-enhanced for video generation".
13. **Black & Yellow Brutalist Design**:
    - Black navbar (`#0A0A0A`) with yellow (`#FFE400`) active nav text and 2px yellow bottom border
    - Off-white (`#FAFAF8`) main panel background
    - Hard offset shadows (`4px 4px 0 #0A0A0A`) — no blur
    - `2px solid #0A0A0A` borders everywhere — sharp, clean lines
    - Border-radius max `2px` — no pill shapes, no rounded corners
    - Font: `Space Grotesk` (UI) + `JetBrains Mono` (labels, badges, dates)
    - Buttons: yellow fill (primary actions), black fill (video generate)
    - User message bubbles: black background, white text
    - AI message bubbles: white card with 4px yellow left border
    - Hard shadow hover effect: button shifts `translate(-1px, -1px)` on hover
    - Login page: black background with yellow grid overlay, yellow hard-shadow card
14. **All UI text is English** — no Turkish strings in user-facing output.

If you reintroduce gradients, soft shadows, pill-shaped buttons, lavender/purple colors, or standalone info "ⓘ" icons, you are regressing the product.

---

## 3) Current Frontend UX Map

Main UI file: `frontend/index.html`

### Top Navbar

- Black background (`#0A0A0A`), 2px yellow bottom border
- **Left section**: Raiko logo (no border, just "R" initial) → vertical divider → nav links (Dashboard | Chats | Images | Video)
- **Right section**: Credits badge (⚡ N) → `+ More` dropdown → User avatar + name (click opens user dropdown)
- Active nav link: yellow text (`#FFE400`), bold — no background fill
- Font: 13px, padding `6px 11px` per nav item
- `+ More` dropdown opens: Chat / Image Generation / Video Generation
- User avatar click opens **user dropdown** (`#user-dropdown`, class `.user-dropdown`) anchored below the avatar trigger (`#navbar-user-trigger`, `#navbar-user-wrap`):
  - Header: avatar initial + name (`#udrop-avatar`, `#udrop-name`) + "Free Plan"
  - Credits bar: `#udrop-credits-val` + `#udrop-credits-fill` (green fill, width = balance/maxCredits %)
  - Go Premium button (`#udrop-premium-btn`) → opens credits modal
  - View profile (`#udrop-profile`), Manage account (`#udrop-account`), Join our community (`#udrop-community`)
  - My Media (`#udrop-my-media`) → `switchPanel('media')`
  - Sign out (`#logout-btn`, `.udrop-signout`) → clears auth + redirects to login

### Dashboard Panel

- Quick Create cards: Start a New Chat / Generate an Image / Generate a Video
- Recent chats list
- Announcement cards
- Two-column layout (left: quick create + recent chats, right: announcements), separated by 2px border

### Chat Panel

Two-column layout inside the panel:

**Left sub-sidebar (220px, `chat-hsidebar`):**
- `+ New Chat` button (ID: `btn-new-chat-inner`)
- "Recent" label
- Scrollable chat history list (`#chat-list-items`)

**Right chat area (`chat-main-wrap`):**
- Model selector dropdown (provider-grouped)
- Hero input + sticky input
- Attachments (images/docs)
- Voice input button (speech-to-text)
- Prompt mode buttons: Chat / Generate Image / Generate Video
- Welcome chips for quick prompt starts
- Welcome title has yellow highlight span on username

### Images Panel

**Always-visible controls sidebar** (`img-controls-sidebar`), canvas area above.

Tool picker: `Generate` | `Edit`

Generate tab:
- **Model picker dropdown** (`#img-model-picker-wrap`): single trigger button (`#img-model-trigger`) shows selected model icon + name + cost. Clicking opens `#img-model-dropdown` with 11 models grouped by provider. Selecting updates hidden `#image-model` select + trigger label + cost badge. Closes on outside click.
  - **Flux group**: Flux Schnell ⚡ 2⚡ / Flux Dev ✦ 5⚡ / Flux Pro ★ 8⚡ / Flux 2 Pro ★★ 10⚡
  - **Nano Banana (Google) group**: Nano Banana Flash 🍌 3⚡ (`fal-ai/nano-banana`, Gemini 2.5 Flash) / Nano Banana 2 🍌 4⚡ (`fal-ai/nano-banana-2`, Gemini 3.1 Flash) / Nano Banana Pro 🍌 6⚡ (`fal-ai/nano-banana-pro`, Gemini 3 Pro)
  - **Seedream (Bytedance) group**: Seedream 4 🌱 5⚡ / Seedream 4.5 🌱 6⚡ / Seedream 5 Lite 🌱 5⚡
  - **OpenAI group**: GPT Image 2 ◈ 10⚡
- Prompt textarea
- **Aspect Ratio picker** (visual buttons): 1:1 / 9:16 / 16:9 — clicking updates hidden `#image-width` / `#image-height` inputs
- **Style chips** (visual tag buttons): None / Photo / Anime / Digital Art / Oil Paint / Watercolor — clicking updates hidden `#image-style-select`
- Generate button (yellow) + credit label

Edit tab:
- Upload source image (left)
- Edit prompt + strength slider (right)
- Edit button

### Video Panel

**Two-column layout** (`video-layout`):

**Left sidebar (290px, `video-sidebar`, always visible, scrollable):**
- Tool picker: `Text to Video` | `Image to Video`

Text to Video tab:
- Prompt textarea
- Motion Presets grid (4×2): Cinematic 🎬 / Action ⚡ / Drone 🚁 / Nature 🌿 / Time Lapse ⏱ / Slow Mo 🎞 / Portrait 👤 / Abstract 🔮 — clicking fills the prompt
- Model select (`Kling Standard`, `Stable Video`)
- Duration select (5s / 10s)
- Generate button

Image to Video tab:
- Upload source image
- Prompt textarea + auto-enhance hint
- Model select (`Kling Standard`, `Kling Pro`)
- Duration select (5s / 10s)
- Generate button

**Right main area (`video-main`):**
- **Before generation** (`video-explainer`): "MAKE VIDEOS IN ONE CLICK" hero → 3-step cards (Write Prompt / Choose Preset / Get Video) → 4 example output placeholders
- **After generation** (`.has-result` on `#panel-video`): `#video-result-area` canvas fills the right area; explainer is hidden

### My Media Panel

> **Accessed via user avatar dropdown only** — not in the top navbar nav links.

- Header: title + filter tabs (All / Images / Videos) + count badge
- Grid of media cards: thumbnail, type badge, prompt, date, model, Open/Save/Delete
- Empty state with instructions
- Clicking an image thumbnail opens the lightbox

### Login Page

- Black background with yellow grid pattern
- Yellow hard-shadow card (`8px 8px 0 yellow`)
- Sign In / Sign Up tabs
- Brutalist input fields with 2px borders

### Removed UI

- No left sidebar (replaced by top navbar)
- No `Tools` panel
- No FaceSwap cards/forms/buttons
- No theme switch buttons
- No gradients anywhere
- No soft/blur shadows
- No standalone info "ⓘ" icons

---

## 3A) Design System — Black & Yellow Brutalist

**Color Palette** (CSS variables in `frontend/styles.css`):
- Background: `#FAFAF8` (off-white)
- Navbar/Sidebar: `#0A0A0A` (black)
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

**Dot-grid pattern** (Image panel): SVG data-URL, 24×24px spacing, `#C0BEB8` at 55% opacity. No CSS gradients.

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
- `currentVideoTool` (`text` | `image`)
- `attachedFiles`
- `editSourceUrl` — source image URL for image-edit tool
- `i2vSourceUrl` — source image URL for image-to-video tool
- `mediaFilter` (`all` | `image` | `video`) — active My Media filter
- `stylePreset` — selected style string, prepended to image prompt
- credits and streaming/listening flags

### Key Flows

- `startNewChat()` — resets active chat UI, creates new `chatId`; called by `btn-new-chat-inner` (chat panel) and navbar `+ More → Chat`
- `switchPanel(panelId)` — switches active nav-link and panel; calls `loadMediaPanel()` when switching to `media`
- `switchImageTool(toolId)` — toggles Generate/Edit inside Images panel
- `switchVideoTool(toolId)` — toggles Text-to-Video/Image-to-Video inside Video panel
- `generateImage()` → `showGenPlaceholder('image-results')` → `API.ai.generateImage(...)` → `renderImageResults()` + `saveMediaItem()`
- `runEditImage()` → `API.ai.editImage(...)`
- `generateVideo()` → `showGenPlaceholder('video-result-area')` → `API.ai.generateVideo(...)` → `saveMediaItem()`
- `generateVideoFromImage()` → `showGenPlaceholder('video-result-area')` → `API.ai.generateVideoFromImage(...)` → `saveMediaItem()`
- `showGenPlaceholder(containerId)` — adds `.has-result` to panel, injects dual-ring spinner + cycling text into container
- `clearGenPlaceholder(containerId)` — clears the interval timer
- `resetPanelToEmpty(panelId)` — removes `.has-result` on error; for video panel this shows explainer again, for image panel returns controls to center
- `saveMediaItem(type, url, prompt, model)` — appends to `raiko_media` in localStorage
- `loadMediaPanel()` — reads localStorage, renders media grid with active filter
- `deleteMediaItem(id)` — removes from localStorage and re-renders
- `sendChatMessage()` — handles chat stream and inline mode switching
- Navbar nav: `#sidebar-nav` div with `.nav-item` buttons, click delegated to `switchPanel()` — My Media is NOT a `.nav-item` anymore
- User dropdown toggle: `#navbar-user-trigger` click toggles `.hidden` on `#user-dropdown`; closes on outside click

### Visual Control Sync (Image Panel)

The image panel uses visual pickers that update hidden `<select>` / `<input>` elements for backward-compat with existing JS:

| Visual Element | Updates Hidden Element | Event Dispatched |
|---|---|---|
| `#img-model-dropdown .imd-item` (dropdown picker) | `#image-model` select | `change` |
| `#ratio-picker .ratio-btn` | `#image-width`, `#image-height` inputs + `#image-size-select` | — |
| `#style-chips .style-chip` | `#image-style-select` select | `change` |
| `#motion-presets-grid .motion-preset-card` | fills `#video-prompt` textarea | — |

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
  - Supported types: `chat`, `image`, `video`, `edit`, **`image_to_video`**
  - Streaming chat with credits metadata trailer
- `backend/fal_client.py`
  - fal.ai queue wrapper
  - `generate_image()`, `image_to_image()`, `generate_video()`, **`generate_video_from_image()`**
  - `_ASPECT_RATIO_MODELS` — nano-banana models use `aspect_ratio` string instead of `image_size` object
  - `_IMAGE_SIZE_PRESET_MODELS` — Seedream models use `image_size` enum preset (e.g. `square_hd`) due to min-resolution constraints
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
  - `image_to_video` — requires `image_url` field; uses `fal.generate_video_from_image()`

### Legacy (kept for compatibility)

- `POST /chat/stream`
- `POST /chat`

---

## 7) Credits + Cost Model Snapshot

Current fal costs in `backend/model_costs.py`:

**Image — Flux:**
- `fal-ai/flux/schnell`: 2⚡
- `fal-ai/flux/dev`: 5⚡
- `fal-ai/flux-pro`: 8⚡
- `fal-ai/flux-2-pro`: 10⚡

**Image — Nano Banana (Google Gemini, `aspect_ratio` param):**
- `fal-ai/nano-banana`: 3⚡ (Gemini 2.5 Flash)
- `fal-ai/nano-banana-2`: 4⚡ (Gemini 3.1 Flash)
- `fal-ai/nano-banana-pro`: 6⚡ (Gemini 3 Pro)

**Image — Seedream (Bytedance, `image_size` enum preset param):**
- `fal-ai/bytedance/seedream/v4/text-to-image`: 5⚡
- `fal-ai/bytedance/seedream/v4.5/text-to-image`: 6⚡
- `fal-ai/bytedance/seedream/v5/lite/text-to-image`: 5⚡

**Image — OpenAI:**
- `openai/gpt-image-2`: 10⚡

**Image edit:**
- `fal-ai/flux/dev/image-to-image`: 4⚡

**Video (text-to-video):**
- `fal-ai/kling-video/v1/standard/text-to-video`: 12⚡
- `fal-ai/kling-video/v1/pro/text-to-video`: 20⚡
- `fal-ai/stable-video`: 10⚡

**Video (image-to-video):**
- `fal-ai/kling-video/v1/standard/image-to-video`: 15⚡
- `fal-ai/kling-video/v1/pro/image-to-video`: 22⚡

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
6. My Media is localStorage-only — no backend persistence. A future `generated_media` DB table + `/api/media` endpoint would enable cross-device sync.
7. Image-to-Video prompt enhancement is client-side hint only — backend passes prompt as-is to fal.ai. A real LLM enhancement step could be added in `ai_router.py` under `image_to_video` type.
8. Old sidebar CSS (`.sidebar`, `.sidebar-nav`, `.sidebar-toggle`, `.sidebar-collapsed` etc.) is still in `styles.css` as dead code — safe to remove in a cleanup pass.
9. `btn-new-chat-sidebar` ID still exists in `app.js` event binding but the element was removed from the navbar. The `?.addEventListener` call fails silently — safe to remove that binding.
10. `#udrop-profile` and `#udrop-account` dropdown items have no action wired yet — they are rendered but do nothing on click. Wire to profile/account pages when those features are built.

---

## 11) Guardrails for Future Changes

- Keep `/ai/generate` as the primary generation contract.
- Keep FaceSwap removed unless explicitly requested.
- Keep Image Edit inside Images panel.
- Keep `btn-new-chat-inner` wired to `startNewChat()` (chat panel left sub-sidebar).
- Preserve user-isolated chat history and credit deduction semantics.
- **Video panel uses `.has-result` class on `#panel-video`** to switch between explainer (right area) and video canvas — do not remove this pattern.
- **`#video-result-area`** is inside `.video-main` (the right column). `showGenPlaceholder` and `clearGenPlaceholder` still target this ID directly.
- **My Media `raiko_media` localStorage key** — do not rename; changing it loses all stored media for existing users.
- **Visual control pickers** (model dropdown, ratio buttons, style chips, motion presets) must keep their data attributes and update the corresponding hidden `<select>` / `<input>` elements — app.js reads those hidden elements directly.
- **Image model picker IDs**: `#img-model-picker-wrap`, `#img-model-trigger`, `#img-model-dropdown`, `#imt-icon`, `#imt-name`, `#imt-cost` — all referenced in `app.js`; do not rename.
- **Nano Banana display names**: `nano-banana` → "Nano Banana Flash", `nano-banana-2` → "Nano Banana 2", `nano-banana-pro` → "Nano Banana Pro" — keep this branding in UI labels.
- **Seedream models use `image_size` preset enum** (not `{width,height}` object) — handled by `_IMAGE_SIZE_PRESET_MODELS` in `fal_client.py`. Do not change this to object format; minimum resolution constraints on these models reject small dimensions like 1024x1024.
- **Nano Banana models use `aspect_ratio` string** (not `image_size`) — handled by `_ASPECT_RATIO_MODELS` in `fal_client.py`. Do not remove this routing.
- **My Media is dropdown-only** — do not add it back to the top navbar `.nav-item` list; it must stay inside the user avatar dropdown (`#udrop-my-media`).
- **User dropdown IDs** — `#navbar-user-wrap`, `#navbar-user-trigger`, `#user-dropdown`, `#udrop-avatar`, `#udrop-name`, `#udrop-credits-val`, `#udrop-credits-fill`, `#udrop-premium-btn`, `#udrop-my-media` — these are all referenced in `app.js`; do not rename.
- **Logo has no yellow border** — `.navbar-orb` has `border: none !important`; do not reintroduce a border on the navbar logo.

**UI/UX Design Guardrails** (Black & Yellow Brutalist):
- Maintain black navbar (`#0A0A0A`) with yellow accent (`#FFE400`) bottom border and active nav text
- Keep hard offset shadows — no blur, no soft box-shadows
- Keep `2px solid #0A0A0A` borders — do NOT soften to lighter colors
- Keep border-radius at max `2px` — no rounded corners, no pill shapes
- Do NOT reintroduce gradients (linear-gradient, radial-gradient on UI elements)
- Do NOT reintroduce purple, lavender, mint, or coral color schemes
- Do NOT add animations beyond the current `translate(-1px,-1px)` hover lift and the generation ring spinner
- Do NOT add standalone "ⓘ" info icons — use text hints or `✦` symbol instead
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

Raiko is a focused chat + image + video (text & image-to-video) + image-edit + media library platform with credits, **top horizontal navbar**, chat panel with inline history sidebar, visual model/ratio/style pickers for image generation, a video panel with left controls sidebar and right explainer/canvas area, and a strict Black & Yellow Brutalist design system.
