# Raiko — Current App State (Agent Handover Doc)

This README is the **source of truth for the current product behavior** so the next AI agent can continue work safely.

Last updated: **2026-04-28 (My Media avatar drawer + footer update)**

---

## 1) Product Overview

Raiko is a FastAPI + Vanilla JS single-page app for:

- Authenticated AI chat (streaming)
- AI image generation
- AI video generation (text-to-video + image-to-video)
- AI image editing — **dedicated Edit panel** (separate from Image panel)
- AI background removal (BRIA)
- My Media library (all generated images & videos, localStorage-backed)
- Credit-based usage tracking

Core UX principle: one app shell, **top horizontal navbar** navigation, persistent user-isolated chat history.

---

## 2) Important Current Decisions (Do Not Revert)

These were intentionally changed and should stay as-is unless explicitly requested:

1. **Top navbar** replaces the old left sidebar. Navigation is now a horizontal bar at the top of every page.
2. **Chat history sidebar** lives *inside* the Chat panel as a 220px left sub-panel (not in the top navbar).
3. **+ New Chat button** is only inside the chat panel's left sub-panel — it is NOT in the top navbar.
4. **Quick Actions removed** — `+ More` button and dropdown were removed from navbar.
5. **Doodle / Thunder toggle buttons removed from UI**.
6. **My Media moved to user avatar dropdown** — removed from top navbar nav links; accessible only via the user avatar dropdown menu.
7. **User avatar dropdown** — clicking the avatar/name in the top navbar opens a dropdown with: user name + "Free Plan" label, credits bar (green fill, live balance), Go Premium/Upgrade button, View profile, Manage account, Join our community, My Media, Sign out.
8. **Logo yellow border removed** — `.navbar-orb` has `border: none`, only the "R" initial is shown in the navbar logo area.
9. **Image Edit moved into Images panel** (Generate/Edit switch inside Images tab) — AND has a separate dedicated Edit panel in the navbar.
10. **FaceSwap removed completely** (frontend + backend contracts).
11. **Image & Video panels — new layout**:
    - **Images panel**: Dark hero-style landing state with centered mosaic preview art + compact bottom composer. Prompt field sits above a quick control row. Quick controls include Model, Quality, Resolution, Aspect Ratio, Batch Size, and Generate. After generation, a dark framed placeholder appears first, then the generated image is shown centered with **Save** and **Share** actions.
    - **Video panel**: Two-column layout — left sidebar (290px) with all controls + right main area with explainer before generation and canvas after.
    - **Edit panel**: Dark centered upload card in initial state. Only upload card is visible before source selection. After upload, a compact Image-style composer appears at the bottom. Uploaded preview is larger and centered; result zone still appears on generation.
12. **Generation placeholder**: pressing Generate shows the canvas area with a dark framed placeholder, glow/shimmer loading effect, and cycling text. Uses `showGenPlaceholder(containerId)` / `clearGenPlaceholder(containerId)`. Video panel uses `.has-result` class on `#panel-video` to toggle between explainer and canvas.
13. **My Media panel** (sidebar nav item `data-panel="media"`, panel id `panel-media`):
    - Shows all generated images and videos from localStorage (`raiko_media` key).
    - Filter tabs: All / Images / Videos.
    - Each card: thumbnail/video preview, type badge, prompt, date, model, Open / Save / Delete actions.
    - `saveMediaItem(type, url, prompt, model)` is called automatically after every successful image or video generation.
14. **My Media drawer**:
    - `#media-drawer` is a right-side drawer, not a bottom drawer.
    - Clicking **My Media** in the user avatar dropdown opens the drawer directly.
    - Image generation still opens it automatically with a generation-in-progress placeholder.
    - Drawer includes **All / Image / Video** filters, a placeholder card during active generation, a **Full View** button that opens the full My Media panel, and a close `✕` button.
15. **Video panel has two tabs** (tool picker `#video-tool-picker`):
    - **Text to Video** (`vid-panel-text`): prompt → motion preset → model → duration → Generate.
    - **Image to Video** (`vid-panel-image`): upload image + prompt → model → duration → Generate.
16. **Black & Yellow Brutalist Design** — see Section 3A. Do not regress.
17. **All UI text is English** — no Turkish strings in user-facing output.
18. **Navbar labels/actions update**:
    - `Dashboard` label renamed to `Explore`.
    - Right-side credit mini badge replaced with `PRO` CTA (same visual slot), opens pricing/credits modal.
19. **Explore showcase data moved out of hardcoded HTML**:
    - GPT Image 2 showcase grid now renders from `frontend/explore-data.js` via runtime renderer in `frontend/app.js`.
    - Image paths now use `frontend/dashboard-showcase/gpt-image-2-explore/...`.
20. **Footer added**:
    - The app shell now ends with a black footer inspired by the provided reference image.
    - Footer uses the Raiko logo large on the left and grouped Products / Legal Links / Company links on the right.

If you reintroduce gradients, soft shadows, pill-shaped buttons, lavender/purple colors, or standalone info "ⓘ" icons, you are regressing the product.

---

## 3) Current Frontend UX Map

Main UI file: `frontend/index.html`

### Top Navbar

- Black background (`#0A0A0A`), 2px yellow bottom border
- **Left section**: Raiko logo → vertical divider → nav links: **Explore | Image | Video | Edit | Chats**
- **Right section**: **PRO** CTA button (opens pricing/credits modal) → User avatar + name
- Active nav link: yellow text (`#FFE400`), bold
- **Edit nav button** — hovering opens a mega-dropdown with 7 edit models in 2 columns:
  - Left col: Nano Banana group (NB Flash Edit / NB 2 Edit / NB Pro Edit) + Tools (BG Remove)
  - Right col: OpenAI (GPT Image 2 Edit) + Seedream (Seedream 4.5 Edit) + xAI (Grok Imagine Edit)
  - Clicking a model calls `selectEditModel(modelId)` then `switchPanel('edit')`
- **Image nav button** — hovering opens a mega-dropdown with all image models in 2 columns:
  - Left col: Flux group (Schnell/Dev/Pro/2 Pro) + OpenAI (GPT Image 2)
  - Right col: Nano Banana group (Flash/2/Pro) + Seedream group (4/4.5/5 Lite)
  - Clicking a model calls `selectImageModel(modelId)` then `switchPanel('image')`
- **Video nav button** — hovering opens a mega-dropdown with all video models in 2 columns:
  - Left col: Kling (v1 Standard / v1 Pro / v3 Pro) + Seedance (1.5 Pro / 2.0)
  - Right col: Premium (Sora 2 / Veo 3.1 / Grok Video / WAN v2.7 / Stable Video) + Image to Video (Kling Standard / Kling Pro)
  - Clicking a model calls `selectVideoModel(modelId, tool)` then `switchPanel('video')`
- **Mega-dropdown implementation**: `position: fixed`, JS-positioned via `getBoundingClientRect()` on mouseenter; `.open` class toggles `display: flex`; 120ms close delay on mouseleave
- User avatar click opens **user dropdown** anchored below the avatar trigger.

### Dashboard Panel

Full-width showcase/discovery page — scrollable, no fixed columns. Four sections stacked vertically:

**1. Featured Showcase Strip** (`.dash-featured-strip`):
- Horizontal row of 4 oversized cards, horizontal scroll, left/right fade masks, and explicit `<` / `>` scroll buttons.
- Card 1 (GPT Image 2) → `selectImageModel('openai/gpt-image-2')` + `switchPanel('image')`
- Card 2 (Seedance 2.0 / Video) → `selectVideoModel('fal-ai/bytedance/seedance-2.0/text-to-video','text')` + `switchPanel('video')`
- Card 3 (Nano Banana Pro) → `selectImageModel('fal-ai/nano-banana-pro')` + `switchPanel('image')`
- Card 4 (Seedream 4.5) → `selectImageModel('fal-ai/bytedance/seedream/v4.5/text-to-image')` + `switchPanel('image')`
- Card visuals now use top-showcase assets under `frontend/dashboard-showcase/top-showcase/...`

**2. Mid Row** (`.dash-mid-row`): two-column layout:
- **Left: Feature Tiles Grid** (3×2 CSS grid):
  - Generate Image → `switchPanel('image')`
  - Seedream 5 (NEW badge) → selects Seedream 5 Lite + image panel
  - Nano Banana Pro (UNLIMITED badge) → selects Nano Banana Pro + image panel
  - Generate Video (NEW badge) → `switchPanel('video')`
  - Image Edit → `switchPanel('image')` + `switchImageTool('edit')`
  - AI Chat (`id="qc-new-chat"`) → `switchPanel('chat')` + `startNewChat()`
- **Right: Recent Chats sidebar** (`.dash-recent-wrap`, 260px) — `#dash-chat-list`

**3, 4 & 5. Showcase Sections** (`.dash-showcase`):
- Showcase 1: "Meet GPT Image 2" → real images from `dashboard-showcase/gpt-image-2-explore/`, custom `.gp2-grid` two-row layout rendered from external data (`frontend/explore-data.js`) into `#gp2-grid`; all images are `.gallery-item` (open Gallery Preview Modal on click)
- Showcase 2: "Nano Banana Pro Image Generator" → real images from `dashboard-showcase/nano-banana-pro-explore/`, custom `.gp2-grid` two-row layout rendered from external data (`frontend/explore-data.js`) into `#nbp-grid`; every gallery item includes its prompt and uses Nano Banana Pro when "Use This Prompt" is clicked
- Showcase 3: "Seedream 4.5" → real images from `dashboard-showcase/seedream-explore/`, rendered into `#sd45-grid`

**Gallery Preview Modal** (`#gallery-preview-overlay`, `.gp-overlay`):
- Opened by `openGalleryPreview(el)` — reads `data-src`, `data-prompt`, `data-res`, `data-model`
- Action buttons: **✦ Use This Prompt** (selects GPT Image 2 + switches panel + pre-fills prompt) + **↓ Download**
- Box shadow: `8px 8px 0 var(--yellow)` brutalist style

### Chat Panel

Two-column layout: left sub-sidebar (220px) + right chat area.

### Images Panel

**Dark hero landing layout**:
- Center hero art + headline before results
- Compact bottom composer (`img-controls-sidebar`) on dark surface
- Tool picker is hidden in landing generate state and still supports `Generate` / `Edit`

**Generate tab:**
- Default model: `fal-ai/nano-banana-pro`
- Prompt field supports up to **10 reference images** via left `+` upload button
- Uploads show a global upload progress overlay with spinner + progress bar
- Quick control row includes:
  - **Model** custom dropdown
  - **Quality**: Standard / High / Ultra
  - **Resolution**: 1K / 2K
  - **Aspect Ratio**: 1:1 / 4:5 / 3:4 / 2:3 / 9:16 / 5:4 / 4:3 / 3:2 / 16:9 / 21:9
  - **Batch Size**: 1 / 2 / 3 / 4
- Batch size is fully wired: request uses `num_images`, frontend cost label multiplies by batch count, backend credit deduction multiplies by `num_images`
- Result actions are **Save** and **Share**

**Edit tab (inside Images panel — legacy):**
- Upload source image, edit prompt + strength slider, Edit button
- Uses `fal-ai/flux/dev/image-to-image` as default model

### Edit Panel (`#panel-edit`) — NEW

**Dedicated panel accessed via "Edit" navbar item.**

**Layout**: Dark centered upload card initially; after upload, compact composer-style control box pinned at bottom.

**Canvas area** (`.edit-canvas`, flex row):
- **Initial state**: only the centered upload card is shown.
- **Upload state**: uploaded preview becomes larger and centered; outer card keeps black outline + yellow offset shadow.
- **Result state**: right result zone appears and panel enters `.has-result`.

**Bottom controls** (`.edit-bar` + `.edit-bar-inner`):
- **Model picker** (`.edit-bar-model`, 210px) — dropdown opens **upward** (`.edit-model-drop-up`, `bottom: calc(100% + 4px)`) to avoid clipping. 7 models in groups:
  - Nano Banana (Google): NB Flash Edit 4⚡ / NB 2 Edit 5⚡ / NB Pro Edit 7⚡
  - OpenAI: GPT Image 2 Edit 12⚡
  - Seedream (Bytedance): Seedream 4.5 Edit 7⚡
  - xAI: Grok Imagine Edit 8⚡
  - Tools: BG Remove (BRIA) 3⚡
- **Middle** (`.edit-bar-middle`, `flex: 1`): prompt textarea only. Hidden entirely when BG Remove model is selected.
- **Right** (`.edit-bar-right`): Edit button + status spinner
- Hidden by default; revealed only after source upload.

**State:**
- `State.currentEditModel` — default `'fal-ai/nano-banana-2/edit'`
- `State.editPanelSourceUrl` — base64 data URL of uploaded image

**Key functions:**
- `selectEditModel(modelId)` — updates trigger label/cost, toggles prompt section visibility for BG Remove, stores to `State.currentEditModel`. **Must stay global** (called from inline onclick and nmd-item handler).
- `runEditPanel()` — validates inputs, calls `API.ai.editImage(model, prompt, imageUrl, strength)` with fixed `strength=0.75`, then calls `renderEditPanelResults()`
- `renderEditPanelResults(urls)` — unhides `#edit-result-zone`, fills `#edit-result-area` with result image + Open/Download actions

**BG Remove special case:**
- Model: `fal-ai/bria/background/remove`
- No prompt required → frontend sends `prompt: ""`, backend detects model ID and calls `fal.remove_background()` instead of `fal.image_to_image()`
- Prompt + strength section hidden in UI

### Video Panel

**Two-column layout** (`video-layout`): Left sidebar (290px) + right main area.

**Text to Video tab (`#vid-panel-text`):**
- Prompt textarea, Motion Presets grid (8 presets)
- Model select — **10 models**: Kling v1 Standard / Kling v1 Pro / Kling v3 Pro / WAN v2.7 / Seedance 1.5 Pro / Seedance 2.0 / Sora 2 / Veo 3.1 / Grok Video / Stable Video
- Duration select (5s / 10s)
- Generate button

**Image to Video tab (`#vid-panel-image`):**
- Upload source image, prompt textarea, model select (Kling Standard / Kling Pro), duration select
- Generate button

**Right main area:**
- Before generation: `#video-explainer` (how-it-works steps + example output placeholders)
- After generation: `.has-result` on `#panel-video` → `#video-result-area` fills right area

### My Media Panel

Accessed via user avatar dropdown only. Grid of media cards, filter tabs (All / Images / Videos).

### Login Page

Two-column split layout: left (form, yellow dot-grid overlay) + right (`beer-cat.jpg`, full-bleed, yellow left border). Responsive: right panel hidden below 820px.

---

## 3A) Design System — Black & Yellow Brutalist

**Color Palette:**
- Background: `#FAFAF8` | Navbar: `#0A0A0A` | Surface: `#FFFFFF` | Surface alt: `#F0EFEC`
- Accent: `#FFE400` (yellow) | Text main: `#0A0A0A` | Text muted: `#3A3835`

**Shadows** — hard offset, zero blur: `--shadow-sm: 4px 4px 0 #0A0A0A`, etc.

**Radius**: Max `2px` — essentially square corners throughout.

**Typography**: UI font `Space Grotesk`, mono font `JetBrains Mono` (labels, badges, dates, model names).

**Interaction**: Hover → `translate(-1px, -1px)` + larger shadow. No scale transforms.

---

## 4) Frontend Logic Summary

Main logic: `frontend/app.js` | Explore showcase data: `frontend/explore-data.js` | API wrapper: `frontend/api.js` | Styles: `frontend/styles.css`

### Key State (`State` object)

| Field | Default | Notes |
|-------|---------|-------|
| `currentPanel` | `'dashboard'` | |
| `currentModel` | `'anthropic/claude-3.5-sonnet'` | chat model |
| `chatId` | generated | |
| `currentImageTool` | `'generate'` | `'generate'` \| `'edit'` |
| `currentVideoTool` | `'text'` | `'text'` \| `'image'` |
| `currentEditModel` | `'fal-ai/nano-banana-2/edit'` | Edit panel model |
| `imageReferenceFiles` | `[]` | Image panel reference upload file list |
| `imageReferenceUrls` | `[]` | Base64 data URLs for image reference uploads |
| `editSourceUrl` | `null` | Image panel Edit tab source |
| `editPanelSourceUrl` | `null` | Dedicated Edit panel source |
| `i2vSourceUrl` | `null` | Image-to-video source |
| `stylePreset` | `''` | appended to image prompt |
| `mediaFilter` | `'all'` | My Media filter |

### Key Functions

**Global (called from inline `onclick` — must not be renamed or made non-global):**
`selectImageModel(modelId)`, `selectVideoModel(modelId, tool)`, `selectEditModel(modelId)`, `switchPanel(panelId)`, `startNewChat()`, `switchImageTool(toolId)`, `switchVideoTool(toolId)`, `showGenPlaceholder(containerId)`, `clearGenPlaceholder(containerId)`, `saveMediaItem(type, url, prompt, model)`, `loadMediaPanel()`, `openGalleryPreview(el)`, `closeGalleryPreview()`, `useGalleryPrompt()`

**Core flows:**
- `switchPanel(panelId)` — switches active nav + panel; loads media/dashboard on enter
- `selectEditModel(modelId)` — updates Edit panel trigger label/cost, toggles prompt section for BG Remove, stores to `State.currentEditModel`
- `runEditPanel()` → `API.ai.editImage(model, prompt, imageUrl, strength)` → `renderEditPanelResults()`
- `renderEditPanelResults(urls)` — unhides `#edit-result-zone`, fills `#edit-result-area`
- `generateImage()` → `API.ai.generateImage()` → `renderImageResults()` + `saveMediaItem()`
- `renderMediaDrawer(activePlaceholder, forceOpen)` / `openMediaDrawer(activePlaceholder)` — controls the right-side My Media drawer opened from the avatar dropdown or during image generation
- `runEditImage()` → `API.ai.editImage()` (image panel Edit tab, legacy)
- `generateVideo()` → `API.ai.generateVideo()` → `saveMediaItem()`
- `generateVideoFromImage()` → `API.ai.generateVideoFromImage()` → `saveMediaItem()`

### Visual Control Sync (Image Panel)

| Visual Element | Updates Hidden Element |
|---|---|
| `#img-model-dropdown .imd-item` | `#image-model` select |
| `#ratio-picker .ratio-btn` | `#image-width`, `#image-height`, `#image-size-select` |
| `#style-chips .style-chip` | `#image-style-select` |
| `#motion-presets-grid .motion-preset-card` | fills `#video-prompt` textarea |

---

## 5) Backend Architecture

### Core Files

- `backend/main.py` — FastAPI app, router init, model listing, legacy chat endpoints
- `backend/ai_router.py` — Unified `/ai/generate` endpoint. Supported types: `chat`, `image`, `video`, `edit`, `image_to_video`. Edit handler dispatches: if model is `fal-ai/bria/background/remove` → calls `fal.remove_background()`, otherwise → `fal.image_to_image()`.
- `backend/fal_client.py` — fal.ai queue wrapper. Methods: `generate_image()`, `image_to_image()`, `generate_video()`, `generate_video_from_image()`, `remove_background()`. Special routing: `_ASPECT_RATIO_MODELS` (nano-banana family uses `aspect_ratio` string), `_IMAGE_SIZE_PRESET_MODELS` (Seedream uses `image_size` enum preset).
- `backend/model_costs.py` — per-model credit costs (LLM + fal)
- `backend/credits_router.py` — balance, transactions, purchase packs, manual add (dev-flag)
- `backend/auth.py` — signup/login/JWT
- `backend/database.py` — SQLite manager (`bambam_chats.db`)

### Chat CRUD

- `GET /api/chats`
- `GET /api/chats/{chat_id}/messages`
- `POST /api/chats/{chat_id}/messages`
- `DELETE /api/chats/{chat_id}`

---

## 6) Active API Contracts

### Auth
- `POST /auth/signup` | `POST /auth/login` | `GET /auth/me` | `POST /auth/verify`

### Credits
- `GET /credits/balance` | `GET /credits/transactions` | `GET /credits/packs`
- `POST /credits/purchase` | `POST /credits/add` (dev-flag only)

### Unified AI — `POST /ai/generate`

| `type` | Required extra fields | Backend handler |
|--------|----------------------|-----------------|
| `chat` | `model`, `prompt`, optional `chat_id` | streaming SSE |
| `image` | `model`, `prompt`, `width`, `height` | `fal.generate_image()` |
| `video` | `model`, `prompt`, `duration` | `fal.generate_video()` |
| `edit` | `model`, `image_url`, `prompt` (empty ok for BG Remove), `strength` | `fal.remove_background()` or `fal.image_to_image()` |
| `image_to_video` | `model`, `image_url`, `prompt`, `duration` | `fal.generate_video_from_image()` |

**Edit type dispatch logic** (`ai_router.py`):
```python
if model_id == "fal-ai/bria/background/remove":
    urls = await fal.remove_background(model=model_id, image_url=req.image_url)
else:
    urls = await fal.image_to_image(model=model_id, prompt=req.prompt, ...)
```

### Legacy (kept for compatibility)
- `POST /chat/stream` | `POST /chat`

---

## 7) Credits + Cost Model Snapshot

### Image — Flux
| Model | Cost |
|-------|------|
| `fal-ai/flux/schnell` | 2⚡ |
| `fal-ai/flux/dev` | 5⚡ |
| `fal-ai/flux-pro` | 8⚡ |
| `fal-ai/flux-2-pro` | 10⚡ |

### Image — Nano Banana (Google Gemini, `aspect_ratio` param)
| Model | Cost |
|-------|------|
| `fal-ai/nano-banana` | 3⚡ |
| `fal-ai/nano-banana-2` | 4⚡ |
| `fal-ai/nano-banana-pro` | 6⚡ |

### Image — Seedream (Bytedance, `image_size` enum preset)
| Model | Cost |
|-------|------|
| `fal-ai/bytedance/seedream/v4/text-to-image` | 5⚡ |
| `fal-ai/bytedance/seedream/v4.5/text-to-image` | 6⚡ |
| `fal-ai/bytedance/seedream/v5/lite/text-to-image` | 5⚡ |

### Image — OpenAI
| Model | Cost |
|-------|------|
| `openai/gpt-image-2` | 10⚡ |

### Edit (dedicated Edit panel — `type: "edit"`)
| Model | Cost | Note |
|-------|------|------|
| `fal-ai/nano-banana/edit` | 4⚡ | |
| `fal-ai/nano-banana-2/edit` | 5⚡ | default |
| `fal-ai/nano-banana-pro/edit` | 7⚡ | |
| `openai/gpt-image-2/edit` | 12⚡ | |
| `fal-ai/bytedance/seedream/v4.5/edit` | 7⚡ | |
| `xai/grok-imagine-image/edit` | 8⚡ | |
| `fal-ai/bria/background/remove` | 3⚡ | no prompt required |

### Edit (Image panel legacy)
| Model | Cost |
|-------|------|
| `fal-ai/flux/dev/image-to-image` | 4⚡ |
| `fal-ai/sd-inpainting` | 3⚡ |

### Video — Text to Video
| Model | Cost |
|-------|------|
| `fal-ai/kling-video/v1/standard/text-to-video` | 12⚡ |
| `fal-ai/kling-video/v1/pro/text-to-video` | 20⚡ |
| `fal-ai/kling-video/v3/pro/text-to-video` | 28⚡ |
| `fal-ai/wan/v2.7/text-to-video` | 15⚡ |
| `fal-ai/bytedance/seedance/v1.5/pro/text-to-video` | 20⚡ |
| `fal-ai/bytedance/seedance-2.0/text-to-video` | 25⚡ |
| `fal-ai/sora-2/text-to-video` | 35⚡ |
| `fal-ai/veo3.1` | 30⚡ |
| `xai/grok-imagine-video/text-to-video` | 22⚡ |
| `fal-ai/stable-video` | 10⚡ |

### Video — Image to Video
| Model | Cost |
|-------|------|
| `fal-ai/kling-video/v1/standard/image-to-video` | 15⚡ |
| `fal-ai/kling-video/v1/pro/image-to-video` | 22⚡ |

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
2. Some legacy routes remain for backward compatibility (`/chat`, `/chat/stream`).
3. `main.py` includes older/extended logic; unified flow should prioritize `/ai/generate`.
4. Team/project infrastructure exists in DB schema but is disabled at router level for MVP.
5. `frontend/teams.html` exists but is not linked from the main app.
6. `#udrop-profile`, `#udrop-account` — rendered in user dropdown but no click handlers wired.
7. Old sidebar CSS (`.sidebar`, `.sidebar-nav`, `.sidebar-toggle`) — dead code.
8. My Media is localStorage-only — no backend sync (future: `/api/media` endpoints).
9. Edit panel: `fal-ai/bria/background/remove` result field may vary by API version (`image` vs `images`). `fal_client.remove_background()` handles both.
10. Explore GPT and Nano Banana Pro showcases now use frontend data file + runtime render (`frontend/explore-data.js` + `renderGp2Showcase()` / `renderNanoBananaProShowcase()` in `frontend/app.js`); keep data/schema aligned when adding cards.
