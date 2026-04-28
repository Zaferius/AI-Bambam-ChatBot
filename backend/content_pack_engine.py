"""
content_pack_engine.py — One Click Content Machine for Raiko.

Builds cohesive social content packs from saved user preferences, then generates
selected assets in parallel through Raiko's existing AI abstraction layer.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


SUPPORTED_PLATFORMS = {"Instagram", "TikTok", "YouTube Shorts", "Twitter"}
DEFAULT_OUTPUT_TYPES = {
    "image": True,
    "video": True,
    "caption": True,
    "hashtags": True,
}


class OutputTypes(BaseModel):
    image: bool = True
    video: bool = True
    caption: bool = True
    hashtags: bool = True


class ContentPackRequest(BaseModel):
    platform: str = "Instagram"
    platforms: list[str] = Field(default_factory=lambda: ["Instagram"])
    style: str = "Cinematic"
    tone: str = "Viral"
    topic: str = Field(..., min_length=2, max_length=800)
    output_types: OutputTypes = Field(default_factory=OutputTypes)
    variations: int = Field(default=1, ge=1, le=5)
    remix_of: Optional[str] = None
    remix_instruction: Optional[str] = None
    use_memory: bool = True
    save_preferences: bool = True
    image_model: str = "fal-ai/nano-banana-pro"
    video_model: str = "fal-ai/kling-video/v1/standard/text-to-video"
    image_width: int = Field(default=1024, ge=128, le=2048)
    image_height: int = Field(default=1024, ge=128, le=2048)
    video_duration: str = "5"

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, value: str) -> str:
        value = (value or "Instagram").strip()
        aliases = {
            "youtube": "YouTube Shorts",
            "shorts": "YouTube Shorts",
            "x": "Twitter",
            "x/twitter": "Twitter",
        }
        normalized = aliases.get(value.lower(), value)
        if normalized not in SUPPORTED_PLATFORMS:
            raise ValueError("Platform must be Instagram, TikTok, YouTube Shorts, or Twitter")
        return normalized

    @field_validator("platforms")
    @classmethod
    def normalize_platforms(cls, values: list[str]) -> list[str]:
        aliases = {
            "youtube": "YouTube Shorts",
            "shorts": "YouTube Shorts",
            "x": "Twitter",
            "x/twitter": "Twitter",
        }
        normalized = []
        for value in values or ["Instagram"]:
            item = aliases.get((value or "").strip().lower(), (value or "").strip())
            if item not in SUPPORTED_PLATFORMS:
                raise ValueError("Platforms must include only Instagram, TikTok, YouTube Shorts, or Twitter")
            if item not in normalized:
                normalized.append(item)
        return normalized or ["Instagram"]

    @field_validator("style", "tone")
    @classmethod
    def clean_short_text(cls, value: str) -> str:
        value = (value or "").strip()
        return value[:80] or "Viral"


class ContentPackPreferences(BaseModel):
    platform: str = "Instagram"
    platforms: list[str] = Field(default_factory=lambda: ["Instagram"])
    style: str = "Cinematic"
    tone: str = "Viral"
    output_types: OutputTypes = Field(default_factory=OutputTypes)
    variations: int = 1
    image_model: str = "fal-ai/nano-banana-pro"
    video_model: str = "fal-ai/kling-video/v1/standard/text-to-video"


class ContentPackResponse(BaseModel):
    packs: list[dict[str, Any]]
    preferences: ContentPackPreferences
    credits_used: float = 0
    credits_remaining: float = 0


@dataclass(frozen=True)
class PlatformProfile:
    aspect_ratio: str
    caption_length: str
    video_language: str
    hashtag_count: int
    native_behavior: str


PLATFORM_PROFILES = {
    "Instagram": PlatformProfile(
        aspect_ratio="4:5 feed-first with 9:16 Reels-safe framing",
        caption_length="2-5 short lines",
        video_language="Reels pacing, visual hook in the first second, loopable ending",
        hashtag_count=14,
        native_behavior="saveable, shareable, polished creator content",
    ),
    "TikTok": PlatformProfile(
        aspect_ratio="9:16 vertical full-screen",
        caption_length="1-3 punchy lines",
        video_language="fast TikTok pacing, pattern interrupt, trend-friendly movement",
        hashtag_count=10,
        native_behavior="raw viral energy, comment bait, quick payoff",
    ),
    "YouTube Shorts": PlatformProfile(
        aspect_ratio="9:16 vertical full-screen with safe title space",
        caption_length="title-like hook plus one CTA line",
        video_language="Shorts retention pacing, clear narrative arc, strong first frame",
        hashtag_count=8,
        native_behavior="searchable, clear value, repeatable series format",
    ),
    "Twitter": PlatformProfile(
        aspect_ratio="16:9 or 1:1 feed-safe composition",
        caption_length="one sharp post under 240 characters when possible",
        video_language="feed-stopping first frame, meme-aware concise motion",
        hashtag_count=4,
        native_behavior="conversation-starting, quote-tweet friendly, concise",
    ),
}


class UserPreferenceStore:
    """Small JSON-backed preference store keyed by authenticated user id."""

    def __init__(self, path: str = "content_pack_preferences.json"):
        self.path = path

    def _load_all(self) -> dict[str, Any]:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}
        except Exception:
            return {}

    def _save_all(self, data: dict[str, Any]) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get(self, user_id: str) -> Optional[ContentPackPreferences]:
        raw = self._load_all().get(user_id)
        if not raw:
            return None
        try:
            return ContentPackPreferences.model_validate(raw)
        except Exception:
            return None

    def save(self, user_id: str, prefs: ContentPackPreferences) -> None:
        data = self._load_all()
        data[user_id] = prefs.model_dump()
        self._save_all(data)


class ViralHookGenerator:
    HOOKS = {
        "Funny": [
            "POV: you just found the shortcut nobody told you about",
            "This should not work this well... but it does",
            "The internet is not ready for this version",
        ],
        "Emotional": [
            "This is for anyone who almost gave up too soon",
            "The quiet moment before everything changes",
            "You do not need a new life, just one brave next step",
        ],
        "Motivational": [
            "Your next level starts with one uncomfortable move",
            "Stop waiting for perfect. Start building momentum",
            "This is the sign to make the move today",
        ],
        "Educational": [
            "Most people miss this simple detail",
            "Here is the easiest way to understand it",
            "Save this before you need it later",
        ],
        "Viral": [
            "Nobody is talking about this, but they should be",
            "This one detail changes the whole result",
            "Watch what happens when the idea finally clicks",
        ],
    }

    @classmethod
    def get(cls, tone: str, index: int) -> str:
        options = cls.HOOKS.get(tone, cls.HOOKS["Viral"])
        return options[index % len(options)]


class PromptBuilder:
    def build_pack_plan(self, req: ContentPackRequest, index: int, platform: Optional[str] = None) -> dict[str, Any]:
        active_platform = platform or req.platform
        profile = PLATFORM_PROFILES[active_platform]
        pack_id = chr(ord("A") + index)
        hook = ViralHookGenerator.get(req.tone, index)
        angle = self._variation_angle(req.tone, index)
        remix_note = f" Remix direction: {req.remix_instruction}." if req.remix_instruction else ""
        base = (
            f"Topic: {req.topic}. Platform: {active_platform}. Style: {req.style}. Tone: {req.tone}. "
            f"Variation {pack_id}: {angle}.{remix_note}"
        )
        return {
            "id": pack_id if len(req.platforms) == 1 else f"{active_platform}-{pack_id}",
            "platform": active_platform,
            "hook": hook,
            "profile": profile,
            "angle": angle,
            "image_prompt": self.build_image_prompt(base, profile, hook),
            "video_prompt": self.build_video_prompt(base, profile, hook),
            "caption": self.build_caption(req, hook, angle, profile, active_platform),
            "hashtags": self.build_hashtags(req, profile, index, active_platform),
        }

    def build_image_prompt(self, base: str, profile: PlatformProfile, hook: str) -> str:
        return (
            f"{base} Create a highly detailed AI image for {profile.native_behavior}. "
            f"Composition: {profile.aspect_ratio}, platform-aware safe margins, instantly readable focal subject. "
            f"Visual hook concept: {hook}. Cinematic lighting, strong contrast, premium social ad quality, "
            f"sharp details, viral thumbnail clarity, no watermark, no distorted text, no extra logos."
        )

    def build_video_prompt(self, base: str, profile: PlatformProfile, hook: str) -> str:
        return (
            f"{base} Generate an AI video optimized for {profile.video_language}. "
            f"Opening frame must communicate: {hook}. Include dynamic camera motion, clear subject, "
            f"scroll-stopping first second, rhythmic cuts, cinematic depth, loopable final frame, "
            f"platform-safe framing: {profile.aspect_ratio}. No subtitles burned in unless visually essential."
        )

    def build_caption(self, req: ContentPackRequest, hook: str, angle: str, profile: PlatformProfile, platform: str) -> str:
        body = f"{angle} around {req.topic}. Built for {profile.native_behavior}."
        cta = "Save this and remix it for your next post." if platform != "Twitter" else "Reply with your take."
        return f"{hook}\n\n{body}\n\n{cta}"

    def build_hashtags(self, req: ContentPackRequest, profile: PlatformProfile, index: int, platform: str) -> list[str]:
        topic_tokens = [t for t in re.findall(r"[A-Za-z0-9]+", req.topic.title().replace(" ", "")) if t]
        topic_tag = "#" + ("".join(topic_tokens)[:28] or "RaikoAI")
        platform_tags = {
            "Instagram": ["#InstagramReels", "#ExplorePage", "#ContentCreator"],
            "TikTok": ["#TikTokMadeMe", "#ForYou", "#ViralVideo"],
            "YouTube Shorts": ["#Shorts", "#YouTubeShorts", "#CreatorTips"],
            "Twitter": ["#BuildInPublic", "#AIContent", "#CreatorEconomy"],
        }[platform]
        niche = [topic_tag, f"#{req.style.replace(' ', '')}", f"#{req.tone}Content", "#Raiko"]
        trending = ["#AI", "#AIGenerated", "#Viral", "#SocialMediaMarketing", "#ContentStrategy"]
        tags = []
        for tag in niche + platform_tags + trending:
            clean = re.sub(r"[^#A-Za-z0-9_]", "", tag)
            if clean and clean not in tags:
                tags.append(clean)
        rotate = index % max(len(tags), 1)
        tags = tags[rotate:] + tags[:rotate]
        return tags[: profile.hashtag_count]

    def _variation_angle(self, tone: str, index: int) -> str:
        angles = {
            "Funny": ["absurd contrast", "relatable pain point", "unexpected punchline"],
            "Emotional": ["personal transformation", "quiet vulnerability", "aspirational payoff"],
            "Motivational": ["discipline trigger", "before-after momentum", "bold challenge"],
            "Educational": ["step-by-step clarity", "myth-busting", "quick framework"],
            "Viral": ["pattern interrupt", "curiosity gap", "high-stakes reveal"],
        }
        options = angles.get(tone, angles["Viral"])
        return options[index % len(options)]


@dataclass
class ContentPackAssembler:
    output_types: OutputTypes

    def assemble(self, plan: dict[str, Any], generated: dict[str, Any]) -> dict[str, Any]:
        pack = {"id": plan["id"]}
        pack["platform"] = plan.get("platform")
        pack["image_prompt"] = plan["image_prompt"] if self.output_types.image else ""
        pack["video_prompt"] = plan["video_prompt"] if self.output_types.video else ""
        pack["caption"] = generated.get("caption", plan["caption"]) if self.output_types.caption else ""
        pack["hashtags"] = generated.get("hashtags", plan["hashtags"]) if self.output_types.hashtags else []
        if self.output_types.image:
            pack["image_url"] = generated.get("image_url")
        if self.output_types.video:
            pack["video_url"] = generated.get("video_url")
        return pack


@dataclass
class GenerationEngine:
    fal: Any
    openrouter_client: Any = None
    openai_client: Any = None
    llm_model: str = "openai/gpt-4o-mini"

    async def generate_assets(self, req: ContentPackRequest, plan: dict[str, Any]) -> dict[str, Any]:
        tasks = {}
        if req.output_types.image:
            tasks["image_url"] = self._generate_image(req, plan["image_prompt"])
        if req.output_types.video:
            tasks["video_url"] = self._generate_video(req, plan["video_prompt"])
        if req.output_types.caption or req.output_types.hashtags:
            tasks["text"] = self._enhance_text(req, plan)

        results = {}
        if tasks:
            names = list(tasks.keys())
            values = await asyncio.gather(*tasks.values())
            results = dict(zip(names, values))
        text = results.pop("text", {}) or {}
        results.update(text)
        return results

    async def _generate_image(self, req: ContentPackRequest, prompt: str) -> Optional[str]:
        urls = await self.fal.generate_image(
            model=req.image_model,
            prompt=prompt,
            width=req.image_width,
            height=req.image_height,
            num_images=1,
        )
        return urls[0] if urls else None

    async def _generate_video(self, req: ContentPackRequest, prompt: str) -> Optional[str]:
        return await self.fal.generate_video(
            model=req.video_model,
            prompt=prompt,
            duration=req.video_duration,
        )

    async def _enhance_text(self, req: ContentPackRequest, plan: dict[str, Any]) -> dict[str, Any]:
        client = self.openrouter_client or self.openai_client
        if client is None:
            return {"caption": plan["caption"], "hashtags": plan["hashtags"]}

        system = (
            "You are Raiko's social media strategist. Return only JSON with keys caption and hashtags. "
            "Caption must include hook, short body, and CTA. Hashtags must mix niche, trending, and platform-specific tags."
        )
        user = json.dumps({
            "platform": plan.get("platform") or req.platform,
            "style": req.style,
            "tone": req.tone,
            "topic": req.topic,
            "draft_caption": plan["caption"],
            "draft_hashtags": plan["hashtags"],
        })

        def call_llm() -> dict[str, Any]:
            completion = client.chat.completions.create(
                model=self.llm_model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_object"},
            )
            content = completion.choices[0].message.content or "{}"
            return json.loads(content)

        try:
            data = await asyncio.to_thread(call_llm)
            caption = data.get("caption") or plan["caption"]
            hashtags = data.get("hashtags") or plan["hashtags"]
            if isinstance(hashtags, str):
                hashtags = [tag for tag in hashtags.split() if tag.startswith("#")]
            active_platform = plan.get("platform") or req.platform
            return {"caption": caption, "hashtags": hashtags[: PLATFORM_PROFILES[active_platform].hashtag_count]}
        except Exception:
            return {"caption": plan["caption"], "hashtags": plan["hashtags"]}


@dataclass
class ContentPackMachine:
    fal: Any
    preference_store: UserPreferenceStore = field(default_factory=UserPreferenceStore)
    openrouter_client: Any = None
    openai_client: Any = None

    async def generate(self, user_id: str, req: ContentPackRequest) -> ContentPackResponse:
        req = self._merge_preferences(user_id, req)
        if not req.platforms:
            req.platforms = [req.platform]
        req.platform = req.platforms[0]
        prefs = ContentPackPreferences(
            platform=req.platform,
            platforms=req.platforms,
            style=req.style,
            tone=req.tone,
            output_types=req.output_types,
            variations=req.variations,
            image_model=req.image_model,
            video_model=req.video_model,
        )
        if req.save_preferences:
            self.preference_store.save(user_id, prefs)

        builder = PromptBuilder()
        engine = GenerationEngine(
            fal=self.fal,
            openrouter_client=self.openrouter_client,
            openai_client=self.openai_client,
        )
        assembler = ContentPackAssembler(req.output_types)
        plans = [
            builder.build_pack_plan(req, i, platform)
            for platform in req.platforms
            for i in range(req.variations)
        ]
        generated = await asyncio.gather(*(engine.generate_assets(req, plan) for plan in plans))
        packs = [assembler.assemble(plan, result) for plan, result in zip(plans, generated)]
        return ContentPackResponse(packs=packs, preferences=prefs)

    def _merge_preferences(self, user_id: str, req: ContentPackRequest) -> ContentPackRequest:
        if not req.use_memory:
            return req
        saved = self.preference_store.get(user_id)
        if not saved:
            return req
        data = req.model_dump()
        explicit_defaults = ContentPackRequest(topic=req.topic).model_dump()
        for key in ["platform", "platforms", "style", "tone", "variations", "image_model", "video_model"]:
            if data.get(key) == explicit_defaults.get(key):
                data[key] = getattr(saved, key)
        if data.get("output_types") == explicit_defaults.get("output_types"):
            data["output_types"] = saved.output_types.model_dump()
        return ContentPackRequest.model_validate(data)


def estimate_content_pack_cost(req: ContentPackRequest) -> float:
    from model_costs import get_fal_cost, get_llm_cost

    per_pack = 0.0
    if req.output_types.image:
        per_pack += get_fal_cost(req.image_model)
    if req.output_types.video:
        per_pack += get_fal_cost(req.video_model)
    if req.output_types.caption or req.output_types.hashtags:
        per_pack += max(get_llm_cost("openai/gpt-4o-mini") * 0.2, 0.01)
    return round(per_pack * req.variations * max(len(req.platforms or [req.platform]), 1), 4)
