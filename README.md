# Raiko — Current App State (Agent Handover Doc)

This README is the **source of truth for the current product behavior** so the next AI agent can continue work safely.

Last updated: **2026-05-05 (Seedance 2.0 Explore showcase + richer video/source previews + showcase reorder)**

---

## 1) Product Overview

Raiko is a FastAPI + Vanilla JS single-page app for:

- AI image generation
- AI video generation (text-to-video + image-to-video)
- One Click Content Machine — multi-platform social content packs
- AI image editing — **dedicated Edit panel** (separate from Image panel)
- AI background removal (BRIA)
- AI portrait restyling — **Image Restyler** presets from `frontend/image-restyler/`
- AI image/video upscaling (SeedVR)
- My Media library (all generated images & videos, localStorage-backed)
- Credit-based usage tracking

Core UX principle: one app shell, **top horizontal navbar** navigation, guest-browsable Explore-first discovery, and black/yellow brutalist presentation.

---

## 2) Important Current Decisions (Do Not Revert)

These were intentionally changed and should stay as-is unless explicitly requested:

0. **Navbar nav link order**: **Explore | Image | Video | Edit | Restyler | Content Machine**.

1. **Top navbar** replaces the old left sidebar. Navigation is now a horizontal bar at the top of every page.
2. **AI Chat removed from visible product UI** — no top navbar entry, no Explore tile, no footer shortcut, and no usable Chat panel in the frontend.
3. **Guest browsing enabled** — if not authenticated, the top-right navbar shows a **Sign In** CTA that routes to the dedicated login page.
4. **Quick Actions removed** — `+ More` button and dropdown were removed from navbar.
5. **Doodle / Thunder toggle buttons removed from UI**.
6. **My Media moved to user avatar dropdown** — removed from top navbar nav links; accessible only via the user avatar dropdown menu.
7. **User avatar area behavior changed** — authenticated users still get the dropdown, but guests now see a brutalist **Sign In** CTA in the same top-right slot instead of a fake user identity.
8. **Logo yellow border removed** — `.navbar-orb` has `border: none`, only the "R" initial is shown in the navbar logo area.
9. **Image Edit moved into Images panel** (Generate/Edit switch inside Images tab) — AND has a separate dedicated Edit panel in the navbar.
10. **FaceSwap removed completely** (frontend + backend contracts).
11. **Image & Video panels — new layout**:
    - **Images panel**: Dark hero-style landing state with centered mosaic preview art (`.ilh-mosaic`: 880px × 340px, enlarged from 700px × 252px) + compact bottom composer. Prompt field sits above a quick control row. Quick controls include Model, Quality, Resolution, Aspect Ratio, Batch Size, and Generate. After generation, a dark framed placeholder appears first, then the generated image is shown centered with **Save** and **Share** actions. Generated result grid uses `minmax(300px, 1fr)` columns (enlarged from 220px).
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
15. **Video panel has three tabs** (tool picker `#video-tool-picker`):
    - **Text to Video** (`vid-panel-text`): prompt → motion preset → model → duration → Generate.
    - **Image to Video** (`vid-panel-image`): upload image + prompt → model → duration → Generate.
    - **Upscale** (`vid-panel-upscale`): upload video → SeedVR model → factor/format → Upscale.
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
21. **Explore featured showcase navigation restored**:
    - The top Explore showcase strip has explicit `<` / `>` buttons again.
    - Left button and left fade are hidden while the strip is at the far left; right button and right fade are hidden while the strip is at the far right.
    - Navigation is JS-managed in `frontend/app.js` via `syncFeaturedStripNav()`, `scrollFeaturedStrip(direction)`, and `initFeaturedStripNav()`.
22. **Video Generate button style**:
    - Text-to-video and image-to-video Generate buttons use yellow background with black text and **no shadow**, including hover state.
23. **Content Machine panel added**:
    - New top navbar item: **Content Machine**.
    - `#panel-content` uses a Video-panel-inspired dark two-column layout: left sidebar controls + right explainer/results area.
    - Left sidebar width matches Video sidebar style (`330px`), dark surface, yellow right border, internal scroll.
    - Right side has Video-style hero/explainer before generation and switches to generated content pack cards after generation.
    - Do not reintroduce a top standalone Content Machine header above the two-column layout; it was intentionally removed.
24. **Content Machine generation behavior**:
    - Users can generate **1–5 content packs per selected platform**.
    - Platform selection is multi-select: Instagram, TikTok, YouTube Shorts, Twitter.
    - Outputs can be toggled independently: Image, Video, Caption, Hashtags.
    - Estimated total credit cost updates live before generation.
    - Generated packs include platform metadata and per-pack tabs: Caption / Prompts / JSON.
25. **Credit balance animation**:
    - Credit balance updates use a slot-machine-style animation with light blur.
    - `updateCreditsUI(balance)` animates the user dropdown credit value and shows a floating credit delta overlay.
26. **Shared Upscaler panel (`#panel-upscale`) behavior changed**:
    - **Mode** and **Target** controls were removed from the shared upscaler UI.
    - Upscaling now runs as **factor-only** (`2× / 3× / 4×`) with hover tooltip on factor buttons.
    - **Estimated output** helper text was removed.
    - After upload, upscaler uses upload-state layout and shows a **right-side result panel**.
    - On run, result panel first shows a framed **Generating…** placeholder card, then final media replaces it.
    - Result panel includes a working **Download** action under the generated media.
    - **Post-upload visual style now matches Edit panel**: large centered source preview, compact bottom control bar, right-side result zone, and polished single-row controls (Detected / Format / Factor / Upscale).
27. **Video Upscale tab (`#vid-panel-upscale`) layout changed**:
    - Sidebar keeps upload/replace workflow and lightweight tool state.
    - After video upload, a dedicated right-side upscale canvas (`#vup-canvas`) appears in Video main area.
    - Canvas uses Edit-style composition: large centered source preview, right result zone, and compact bottom bar (Factor / Format / Upscale).
    - Switching away from Upscale tab hides `#vup-canvas`; switching back restores it if source media still exists.
28. **Image Restyler panel (`#panel-restyler`) added and polished**:
    - Top navbar item: **Restyler**.
    - Uses black/yellow brutalist layout with **left upload/control sidebar** and **right persistent style catalog**.
    - Source assets live under `frontend/image-restyler/<style_slug>/` with `<style_slug>_before.jpg`, `<style_slug>_after.jpg`, and optional `prompt.txt`.
    - `prompt.txt` supports first-line `ai_model: ...`; frontend maps `nano_banana_edit` to `fal-ai/nano-banana-2/edit` and `seedream_4` to `fal-ai/bytedance/seedream/v4/edit`.
    - Missing `prompt.txt` files use a safe fallback prompt that preserves identity and applies the style name.
    - Uploading a portrait shows a **large left-sidebar preview** constrained to sidebar bounds (no overflow).
    - Style cards are shown as a scrollable multi-column catalog (currently 5 columns on desktop, responsive down on smaller widths).
    - Selected style card uses active state styling and a **small yellow `Selected` chip**; non-selected cards show hover CTA.
    - `Selected` chip must appear **only** on the active card. Non-active cards must never show the chip.
    - `Selected` chip text style is plain black text (no decorative shadow/spacing effects).
    - Generation is triggered from the **left sidebar** after upload + style selection (not from a bottom global bar).
    - Upload trigger was changed from `label[for]` to button-driven click flow to avoid double-opening file chooser.
29. **Image mega-menu Tools includes Restyler shortcut**:
    - Inside Image navbar mega-dropdown Tools list, a **Restyler** item exists.
    - Clicking it routes directly to `switchPanel('restyler')`.
30. **Explore Mid Row feature tiles updated**:
    - The tile grid now includes **Image Restyle**, **Content Machine**, **Image Upscale**, and **Video Upscale**.
    - AI Chat tile was removed.
    - Non-video tiles now use faded random image artwork from `frontend/dashboard-showcase/bottom-tools/`.
    - Video-related tiles now use looped video artwork from `frontend/dashboard-showcase/bottom-tools/s-video1.mp4`.
31. **Explore Gallery Preview prompt readability fix**:
    - Long prompts inside `#gallery-preview-overlay` now scroll within the prompt block (`.gp-prompt`) so full prompt text is always readable.
32. **Explore Featured Showcase Strip includes Restyler card**:
    - Featured strip now includes a 5th card: **Image Restyle**.
    - The Restyler featured card uses assets from `frontend/dashboard-showcase/top-showcase/image-restyle/`.
    - Card media auto-rotates with smooth infinite fade loop in CSS (`.dft-restyle-slide` + `@keyframes dft-restyle-fade`).
33. **Seedance featured card upgraded to looped preview media**:
    - The Seedance card title is now **Seedance 2.0** with subtitle **TEXT TO VIDEO**.
    - The card cycles through looped videos from `frontend/dashboard-showcase/top-showcase/seedance-explore/`.
34. **Explore model showcases now have floating `View all` CTA inside each showcase preview area**:
    - Buttons are positioned on top of showcase media (not between sections).
    - Trigger function: `openModelGalleryPage(key)`.
35. **`View all` now opens a dedicated Explore Gallery page panel (not modal, not in-place section)**:
    - New panel: `#panel-explore-gallery`.
    - Back action returns to Explore via `closeModelGalleryPage()` → `switchPanel('dashboard')`.
36. **Explore Gallery content is data-driven and orientation-aware**:
    - Data source: `window.EXPLORE_MODEL_GALLERIES` in `frontend/explore-data.js`.
    - Items support `shape: 'wide' | 'tall' | 'square'` and render with corresponding classes.
37. **Explore Gallery layout switched to masonry-style columns with preserved orientation feel**:
    - Uses `.emg-grid` column flow and `break-inside: avoid` cards.
    - Avoids rigid grid dead zones / black gaps from track-based CSS grid packing.
38. **Explore Gallery vertical scrolling fixed**:
    - Dedicated panel `#panel-explore-gallery` explicitly uses `overflow-y: auto`.
39. **Branding assets updated**:
    - Navbar/auth logo image now uses `frontend/raiko-logo-trans.png`.
    - Footer logos now use `frontend/raiko-logo-trans-w.png`.
    - Navbar text label `Raiko` removed; icon-only brand mark remains.
40. **Favicon stack wired to root assets**:
    - `frontend/index.html` now links to root `favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png`, and `site.webmanifest`.
    - `site.webmanifest` updated from placeholder app name/colors to `Raiko` and dark theme colors.
41. **Pricing system overhauled to safer economics**:
    - Pricing modal supports **Subscriptions** and **Credit Packs** views.
    - Subscription billing supports **Monthly** and **Yearly** toggle states.
    - Current public subscription plans are Basic / Creator / Pro; Studio is hidden in config.
    - Credits and pack pricing were recalibrated conservatively around higher-cost video risk.
42. **Login page redesigned**:
    - `frontend/login.html` now uses the Raiko logo without the yellow boxed orb treatment.
    - Left side uses a subtle yellow dot-grid pattern instead of square tile lines.
    - Right preview area now has a 2-stage progress bar and randomly selects between two preview sets:
      - cat image + Seedance video
      - girlcat image + `s-video10.mp4`
    - Login page includes a lower-right **Explore** escape button for browsing without signing in.
43. **Explore now includes a dedicated Seedance 2.0 showcase section**:
    - Showcase order is now **GPT Image 2 → Seedance 2.0 → Nano Banana Pro → Seedream 4.5**.
    - Seedance showcase assets live under `frontend/dashboard-showcase/seedance20-explore/`.
    - Showcase uses looping video cards, including text-to-video and image-to-video examples.
    - Seedance showcase rows are taller than default image showcase rows for a stronger video presentation.
44. **Gallery Preview modal now supports video + source-image previews**:
    - `openGalleryPreview(el)` supports both image and video media inside the same modal.
    - Video showcase items render in a dedicated `<video>` preview area instead of forcing media into an `<img>`.
    - Image-to-video items can include a `sourceImage`, shown in the right info sidebar under the model badges and above the prompt.
    - Clicking the source image opens a larger overlay preview above the gallery modal.
45. **Model dropdown close flow hardened**:
    - `closeModelDropdown()` now safely no-ops if `#model-dropdown` is not present, preventing null `.classList` runtime errors triggered during gallery interactions.

If you reintroduce gradients, soft shadows, pill-shaped buttons, lavender/purple colors, or standalone info "ⓘ" icons, you are regressing the product.

---

## 3) Current Frontend UX Map

Main UI file: `frontend/index.html`

### Top Navbar

- Black background (`#0A0A0A`), 2px yellow bottom border
- **Left section**: Raiko logo → vertical divider → nav links: **Explore | Image | Video | Edit | Restyler | Chats | Content Machine**
- Brand text next to logo was removed; navbar brand is icon-only.
- **Right section**: **PRO** CTA button (opens pricing/credits modal) → User avatar + name
- Active nav link: yellow text (`#FFE400`), bold
- **Edit nav button** — hovering opens a mega-dropdown with edit models in 2 columns:
  - Left col: Nano Banana group (NB Flash Edit / NB 2 Edit / NB Pro Edit) + Tools (BG Remove / SeedVR Image Upscale)
  - Right col: OpenAI (GPT Image 2 Edit) + Seedream (Seedream 4.5 Edit) + xAI (Grok Imagine Edit)
  - Clicking a model calls `selectEditModel(modelId)` then `switchPanel('edit')`
- **Image nav button** — hovering opens a mega-dropdown with all image models in 2 columns:
  - Left col: **Tools** (Create Image, Restyler, Image Upscale) + Flux group (Schnell/Dev/Pro/2 Pro) + OpenAI (GPT Image 2)
  - Right col: Nano Banana group (Flash/2/Pro) + Seedream group (4/4.5/5 Lite)
  - Clicking a model calls `selectImageModel(modelId)` then `switchPanel('image')`
  - Clicking **Restyler** tool item routes to `switchPanel('restyler')`
- **Video nav button** — hovering opens a mega-dropdown with all video models/tools in 2 columns:
  - Left col: Kling (v1 Standard / v1 Pro / v3 Pro) + Seedance (1.5 Pro / 2.0)
  - Right col: Premium (Sora 2 / Veo 3.1 / Grok Video / WAN v2.7 / Stable Video) + Image to Video (Kling Standard / Kling Pro) + SeedVR Video Upscale
  - Clicking a model calls `selectVideoModel(modelId, tool)` then `switchPanel('video')`
- **Mega-dropdown implementation**: `position: fixed`, JS-positioned via `getBoundingClientRect()` on mouseenter; `.open` class toggles `display: flex`; 120ms close delay on mouseleave
- User avatar click opens **user dropdown** anchored below the avatar trigger.

### Dashboard Panel

Full-width showcase/discovery page — scrollable, no fixed columns. Four sections stacked vertically:

**1. Featured Showcase Strip** (`.dash-featured-strip`):
- Horizontal row of 5 oversized cards, horizontal scroll, scroll snap, left/right fade masks, and explicit `<` / `>` scroll buttons.
- The `<` button and left fade hide at the left edge; the `>` button and right fade hide at the right edge.
- Scroll buttons are initialized by `initFeaturedStripNav()` and move by one card width via `scrollFeaturedStrip(direction)`.
- Card 1 (GPT Image 2) → `selectImageModel('openai/gpt-image-2')` + `switchPanel('image')`
- Card 2 (Seedance 2.0 / Video) → `selectVideoModel('fal-ai/bytedance/seedance-2.0/text-to-video','text')` + `switchPanel('video')`
- Card 3 (Nano Banana Pro) → `selectImageModel('fal-ai/nano-banana-pro')` + `switchPanel('image')`
- Card 4 (Seedream 4.5) → `selectImageModel('fal-ai/bytedance/seedream/v4.5/text-to-image')` + `switchPanel('image')`
- Card 5 (Image Restyle) → `switchPanel('restyler')`
- Card visuals now use top-showcase assets under `frontend/dashboard-showcase/top-showcase/...`
- Restyler featured card cycles images from `frontend/dashboard-showcase/top-showcase/image-restyle/` with smooth infinite fade loop.

**2. Mid Row** (`.dash-mid-row`): two-column layout:
- **Left: Feature Tiles Grid** (3-column grid, currently 7 tiles):
  - Generate Image → `switchPanel('image')`
  - Seedream 5 (NEW badge) → selects Seedream 5 Lite + image panel
  - Image Restyle → `switchPanel('restyler')`
  - Nano Banana Pro (UNLIMITED badge) → selects Nano Banana Pro + image panel
  - Generate Video (NEW badge) → `switchPanel('video')`
  - Image Edit → `switchPanel('image')` + `switchImageTool('edit')`
  - AI Chat (`id="qc-new-chat"`) → `switchPanel('chat')` + `startNewChat()`
- **Right: Recent Chats sidebar** (`.dash-recent-wrap`, 260px) — `#dash-chat-list`

**3, 4, 5 & 6. Showcase Sections** (`.dash-showcase`):
- Showcase 1: "Meet GPT Image 2" → real images from `dashboard-showcase/gpt-image-2-explore/`, custom `.gp2-grid` two-row layout rendered from external data (`frontend/explore-data.js`) into `#gp2-grid`; all images are `.gallery-item` (open Gallery Preview Modal on click)
- Showcase 2: "Seedance 2.0" → looping video previews from `dashboard-showcase/seedance20-explore/`, rendered into `#seedance20-grid`; includes both text-to-video and image-to-video examples, and image-to-video entries can expose a source image in preview
- Showcase 3: "Nano Banana Pro Image Generator" → real images from `dashboard-showcase/nano-banana-pro-explore/`, custom `.gp2-grid` two-row layout rendered from external data (`frontend/explore-data.js`) into `#nbp-grid`; every gallery item includes its prompt and uses Nano Banana Pro when "Use This Prompt" is clicked
- Showcase 4: "Seedream 4.5" → real images from `dashboard-showcase/seedream-explore/`, rendered into `#sd45-grid`
- Each showcase now has an in-card floating **View all** button that routes to the dedicated Explore Gallery panel.

**Explore Gallery Panel** (`#panel-explore-gallery`):
- Opened from showcase `View all` buttons through `openModelGalleryPage(key)`.
- Header shows `Model Name + Gallery` title.
- Grid is masonry-style column layout (`.emg-grid`) with orientation-aware card variants (`.emg-item--wide`, `.emg-item--tall`, `.emg-item--square`).
- Gallery panel scrolls vertically (`overflow-y: auto`) so all items are reachable.

**Gallery Preview Modal** (`#gallery-preview-overlay`, `.gp-overlay`):
- Opened by `openGalleryPreview(el)` — reads `data-src`, `data-prompt`, `data-res`, `data-model`, `data-media-type`, and optional `data-source-image`
- Supports both image and video preview media in the left preview area
- For image-to-video showcase items, a **Source image** card appears in the right sidebar above the prompt and can be opened larger in a foreground overlay
- Prompt block (`.gp-prompt`) has internal vertical scrolling for long prompt text.
- Action buttons: **✦ Use This Prompt** (selects GPT Image 2 + switches panel + pre-fills prompt) + **↓ Download**
- Box shadow: `8px 8px 0 var(--yellow)` brutalist style

### Chat Panel

Two-column layout: left sub-sidebar (220px) + right chat area.

### Images Panel

**Dark hero landing layout**:
- Center hero art (`.ilh-mosaic`: 880px × 340px grid with 5 preview images) + headline before results
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
- Result grid uses `minmax(300px, 1fr)` columns (enlarged from 220px) for bigger generated image previews
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

**SeedVR Image Upscale special case:**
- Model: `fal-ai/seedvr/upscale/image`
- No prompt required → frontend sends `prompt: ""`, backend detects model ID and calls `fal.upscale_image()`.
- Default fal payload: `upscale_mode: "factor"`, `upscale_factor: 2`, `target_resolution: "1080p"`, `noise_scale: 0.1`, `output_format: "jpg"`.
- Prompt section is hidden in the dedicated Edit panel.

### Video Panel

**Two-column layout** (`video-layout`): Left sidebar (290px) + right main area.

**Text to Video tab (`#vid-panel-text`):**
- Prompt textarea, Motion Presets grid (8 presets)
- Model select — **10 models**: Kling v1 Standard / Kling v1 Pro / Kling v3 Pro / WAN v2.7 / Seedance 1.5 Pro / Seedance 2.0 / Sora 2 / Veo 3.1 / Grok Video / Stable Video
- Duration select (5s / 10s)
- Generate button — yellow background, black text, no shadow; same hover state remains shadowless.

**Image to Video tab (`#vid-panel-image`):**
- Upload source image, prompt textarea, model select (Kling Standard / Kling Pro), duration select
- Generate button — yellow background, black text, no shadow; same hover state remains shadowless.

**Upscale tab (`#vid-panel-upscale`):**
- Upload source video from sidebar card; then upscale workspace opens in right main area (`#vup-canvas`).
- Controls are shown in compact bottom bar: factor (`2× / 3× / 4×`) + output format + Upscale.
- Effective upscale flow is factor-first (`upscale_mode: "factor"`), with defaults: `upscale_factor: 2`, `target_resolution: "1080p"`, `noise_scale: 0.1`, `output_format: "X264 (.mp4)"`, `output_quality: "high"`, `output_write_mode: "balanced"`.
- Generate action calls `upscaleVideo()` → `API.ai.generateVideo()` with SeedVR-specific `options.extra.video_url`; output renders in-tab result zone and is saved to My Media as video.

### Shared Upscaler Panel (`#panel-upscale`)

- Single shared entry for image/video upscaling (auto-detect media type after upload).
- Post-upload state mirrors Edit panel composition: large centered source preview + right result zone + compact bottom bar.
- Bottom bar shows: detected type, factor controls (`2× / 3× / 4×`), output format, and Upscale action.
- Factor controls include native hover tooltips.
- Run flow: right result panel opens with **Generating…** placeholder, then renders image/video result with a **Download** button.

**Right main area:**
- Before generation: `#video-explainer` (how-it-works steps + example output placeholders)
- After generation: `.has-result` on `#panel-video` → `#video-result-area` fills right area

### Image Restyler Panel (`#panel-restyler`) — NEW

**Purpose:** Users upload a portrait and apply ready-made style presets from `frontend/image-restyler/`.

**Layout:**
- Left sidebar (`.restyler-sidebar`): title/subtitle, upload card, uploaded portrait preview, selected style summary, and **Restyle** action.
- Right main area (`.restyler-main`): persistent scrollable style catalog (`#restyler-style-grid`) that remains visible after upload.
- Result area renders in a compact right-side result panel (`#restyler-result-zone`) under the catalog.

**Style folder contract:**
- Folder: `frontend/image-restyler/<style_slug>/`
- Preview files: `<style_slug>_before.jpg` and `<style_slug>_after.jpg`
- Optional prompt file: `prompt.txt`
- First prompt line can be `ai_model: nano_banana_edit` or `ai_model: seedream_4`; remaining lines are sent as the edit prompt.

**Frontend flow:**
- `initRestylerPanel()` loads known style slugs and fetches each `prompt.txt`.
- `selectRestylerStyle(slug)` updates active style state and sidebar model/cost labels.
- `handleRestylerUpload(file)` stores the uploaded portrait as a base64 data URL in `State.restylerSourceUrl`.
- `runImageRestyler()` calls `API.ai.editImage(style.modelId, style.prompt, State.restylerSourceUrl, 0.75)`, renders output via `renderRestylerResults()`, saves to My Media, and updates credits.

### Content Machine Panel (`#panel-content`) — NEW

**Purpose:** One Click Content Machine generates cohesive, ready-to-post social content packs from one brief.

**Layout:** Video-tab-inspired dark two-column layout.

- **Left sidebar** (`.ocm-controls`): dark fixed-width control sidebar (`330px`) with yellow right border, internal scroll.
- **Right main area** (`.ocm-results`): dark radial background matching Video panel main area.
- Before generation: `.ocm-video-explainer` shows:
  - Large hero card: “MAKE CONTENT IN ONE CLICK / RAIKO CONTENT STUDIO”
  - Three step cards: Write your brief / Choose outputs / Get content packs
  - Example pack type cards: Image / Video / Caption / Hashtags
- After generation: explainer is hidden and `#ocm-pack-grid` shows generated pack cards.

**Left sidebar workflow tabs** (`#ocm-tabs`):

1. **Compose**
   - Creative Brief accordion: topic textarea only.
   - Brand Style accordion: Style and Tone selects.
2. **Outputs**
   - Platforms accordion: multi-select platform cards for Instagram, TikTok, YouTube Shorts, Twitter.
   - Output Mix accordion: Image / Video / Caption / Hashtags toggles + Variations per platform selector.
   - Variations range: **1–5 packs per selected platform**.
3. **Memory**
   - Explains saved preferences and remix behavior.

**Generate dock:**

- Shows live estimated total credits (`#ocm-cost-estimate`).
- Generate button calls `generateContentPack()`.
- Frontend estimate currently assumes default Content Machine models:
  - Image: 6⚡ (`fal-ai/nano-banana-pro`)
  - Video: 12⚡ (`fal-ai/kling-video/v1/standard/text-to-video`)
  - Caption/hashtags text: 0.01⚡
  - Total = per-pack cost × selected platforms × variations.

**Generated pack card behavior:**

- Each pack includes a platform badge.
- Each pack has internal tabs:
  - Caption — caption + hashtags + copy buttons
  - Prompts — image/video prompts
  - JSON — strict pack JSON
- Each pack has a **Remix** button that regenerates a slight variation while keeping style/tone/platform context.
- Global **Copy JSON** copies strict output format:

```json
{
  "packs": [
    {
      "id": "Instagram-A",
      "image_prompt": "...",
      "video_prompt": "...",
      "caption": "...",
      "hashtags": ["..."],
      "platform": "Instagram"
    }
  ]
}
```

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

**Interaction**: Hover → `translate(-1px, -1px)` + larger shadow. No scale transforms. Exception: Video panel Generate buttons stay shadowless and do not translate on hover.

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
| `currentVideoTool` | `'text'` | `'text'` \| `'image'` \| `'upscale'` |
| `currentEditModel` | `'fal-ai/nano-banana-2/edit'` | Edit panel model |
| `imageReferenceFiles` | `[]` | Image panel reference upload file list |
| `imageReferenceUrls` | `[]` | Base64 data URLs for image reference uploads |
| `editSourceUrl` | `null` | Image panel Edit tab source |
| `editPanelSourceUrl` | `null` | Dedicated Edit panel source |
| `restylerSourceUrl` | `null` | Image Restyler uploaded portrait |
| `restylerStyles` | `[]` | Loaded Image Restyler preset metadata |
| `currentRestylerStyle` | `null` | Selected Image Restyler preset |
| `i2vSourceUrl` | `null` | Image-to-video source |
| `videoUpscaleSourceUrl` | `null` | SeedVR video upscale source |
| `stylePreset` | `''` | appended to image prompt |
| `mediaFilter` | `'all'` | My Media filter |
| `contentPacks` | `[]` | Last generated Content Machine packs |
| `lastContentPayload` | `null` | Last Content Machine request payload |

### Key Functions

**Global (called from inline `onclick` — must not be renamed or made non-global):**
`selectImageModel(modelId)`, `selectVideoModel(modelId, tool)`, `selectEditModel(modelId)`, `switchPanel(panelId)`, `startNewChat()`, `switchImageTool(toolId)`, `switchVideoTool(toolId)`, `showGenPlaceholder(containerId)`, `clearGenPlaceholder(containerId)`, `saveMediaItem(type, url, prompt, model)`, `loadMediaPanel()`, `openGalleryPreview(el)`, `closeGalleryPreview()`, `openGallerySourcePreview()`, `closeGallerySourcePreview()`, `useGalleryPrompt()`, `syncFeaturedStripNav()`, `scrollFeaturedStrip(direction)`, `initFeaturedStripNav()`

**Core flows:**
- `switchPanel(panelId)` — switches active nav + panel; loads media/dashboard on enter
- `selectEditModel(modelId)` — updates Edit panel trigger label/cost, toggles prompt section for BG Remove, stores to `State.currentEditModel`
- `runEditPanel()` → `API.ai.editImage(model, prompt, imageUrl, strength)` → `renderEditPanelResults()`
- `renderEditPanelResults(urls)` — unhides `#edit-result-zone`, fills `#edit-result-area`
- `generateImage()` → `API.ai.generateImage()` → `renderImageResults()` + `saveMediaItem()`
- `renderMediaDrawer(activePlaceholder, forceOpen)` / `openMediaDrawer(activePlaceholder)` — controls the right-side My Media drawer opened from the avatar dropdown or during image generation
- `syncFeaturedStripNav()` / `scrollFeaturedStrip(direction)` / `initFeaturedStripNav()` — control Explore featured strip button visibility and one-card scroll navigation
- `renderSeedance20Showcase()` — renders the Seedance 2.0 Explore video showcase from `frontend/explore-data.js`
- `runEditImage()` → `API.ai.editImage()` (image panel Edit tab, legacy)
- `generateVideo()` → `API.ai.generateVideo()` → `saveMediaItem()`
- `generateVideoFromImage()` → `API.ai.generateVideoFromImage()` → `saveMediaItem()`
- `upscaleVideo()` → `API.ai.generateVideo('fal-ai/seedvr/upscale/video', ..., options.extra.video_url)` → `saveMediaItem()`
- `runSharedUpscaler()` → image: `API.ai.editImage('fal-ai/seedvr/upscale/image', ...)`; video: `API.ai.generateVideo('fal-ai/seedvr/upscale/video', ..., options.extra.video_url)`; then right result panel render + download action + `saveMediaItem()`
- `initRestylerPanel()` / `selectRestylerStyle()` / `runImageRestyler()` → loads `frontend/image-restyler` presets, applies selected prompt/model to uploaded portrait via `API.ai.editImage()`, then saves result to My Media.
- `generateContentPack()` → `generateContentPackRequest()` → `POST /content-packs/generate` → `renderContentPacks()`
- `initContentMachineUI()` — wires Content Machine workflow tabs and accordion toggles.
- `updateContentCostEstimate()` — updates live estimated total credits.
- `animateCreditValue()` / `showCreditSlotOverlay()` — slot-machine-style credit balance animation.

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
- `backend/ai_router.py` — Unified `/ai/generate` endpoint. Supported types: `chat`, `image`, `video`, `edit`, `image_to_video`. Edit handler dispatches: if model is `fal-ai/bria/background/remove` → calls `fal.remove_background()`; if model is `fal-ai/seedvr/upscale/image` → calls `fal.upscale_image()`; otherwise → `fal.image_to_image()`.
- `backend/fal_client.py` — fal.ai queue wrapper. Methods: `generate_image()`, `image_to_image()`, `upscale_image()`, `generate_video()`, `generate_video_from_image()`, `remove_background()`. Special routing: `_ASPECT_RATIO_MODELS` (nano-banana family uses `aspect_ratio` string), `_IMAGE_SIZE_PRESET_MODELS` (Seedream uses `image_size` enum preset). `generate_video()` has special payload handling for `fal-ai/seedvr/upscale/video`.
- `backend/model_costs.py` — per-model credit costs (LLM + fal)
- `backend/credits_router.py` — balance, transactions, purchase packs, manual add (dev-flag)
- `backend/content_pack_engine.py` — One Click Content Machine modules: prompt builder, viral hook generator, generation engine, assembler, preference memory, cost estimator.
- `backend/content_pack_router.py` — `/content-packs/generate` route with auth, credit pre-check, async generation, and credit deduction.
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
| `edit` | `model`, `image_url`, `prompt` (empty ok for BG Remove / SeedVR Image Upscale), `strength` | `fal.remove_background()`, `fal.upscale_image()`, or `fal.image_to_image()` |
| `image_to_video` | `model`, `image_url`, `prompt`, `duration` | `fal.generate_video_from_image()` |

**Edit type dispatch logic** (`ai_router.py`):
```python
if model_id == "fal-ai/bria/background/remove":
    urls = await fal.remove_background(model=model_id, image_url=req.image_url)
elif model_id == "fal-ai/seedvr/upscale/image":
    urls = await fal.upscale_image(model=model_id, image_url=req.image_url)
else:
    urls = await fal.image_to_image(model=model_id, prompt=req.prompt, ...)
```

### Legacy (kept for compatibility)
- `POST /chat/stream` | `POST /chat`

### Content Packs — `POST /content-packs/generate`

Requires JWT auth. Generates cohesive social content packs.

**Request fields:**

| Field | Type | Notes |
|-------|------|-------|
| `platform` | string | Backward-compatible primary platform; first selected platform is sent here. |
| `platforms` | list[string] | Multi-select platforms. Supported: Instagram, TikTok, YouTube Shorts, Twitter. |
| `style` | string | Cinematic, Minimal, Anime, Dark, Product Showcase, etc. |
| `tone` | string | Viral, Funny, Emotional, Motivational, Educational. |
| `topic` | string | Required user brief/topic. |
| `output_types` | object | Booleans: `image`, `video`, `caption`, `hashtags`. |
| `variations` | int | 1–5 packs per selected platform. |
| `remix_of` | string/null | Optional pack id to remix. |
| `remix_instruction` | string/null | Optional remix direction. |
| `use_memory` | bool | Reuse saved preferences when applicable. |
| `save_preferences` | bool | Save preferences for future generations. |

**Response shape:**

```json
{
  "packs": [
    {
      "id": "Instagram-A",
      "platform": "Instagram",
      "image_prompt": "...",
      "video_prompt": "...",
      "caption": "...",
      "hashtags": ["..."],
      "image_url": "...",
      "video_url": "..."
    }
  ],
  "preferences": {},
  "credits_used": 18.01,
  "credits_remaining": 42
}
```

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
| `fal-ai/seedvr/upscale/image` | 8⚡ |

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
| `fal-ai/bytedance/seedream/v4/edit` | 7⚡ | used by Image Restyler `seedream_4` presets |
| `fal-ai/bytedance/seedream/v4.5/edit` | 7⚡ | |
| `xai/grok-imagine-image/edit` | 8⚡ | |
| `fal-ai/bria/background/remove` | 3⚡ | no prompt required |
| `fal-ai/seedvr/upscale/image` | 8⚡ | no prompt required; SeedVR upscale |

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

### Video — Upscale
| Model | Cost |
|-------|------|
| `fal-ai/seedvr/upscale/video` | 18⚡ |

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
11. Watch for accidental leading characters in `frontend/app.js` (e.g., stray `e` before the file header comment) — this causes immediate runtime boot errors like `ReferenceError` before app initialization.
