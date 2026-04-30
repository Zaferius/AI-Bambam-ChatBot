"""
fal_client.py — Async wrapper around fal.ai REST API.

Uses fal's queue-based REST API directly via httpx (no fal-client SDK needed).
Docs: https://fal.ai/docs/model-endpoints/queue
"""
import os
import asyncio
import httpx
from typing import Optional

FAL_KEY = os.getenv("FAL_KEY", "")
FAL_BASE = "https://queue.fal.run"

# Models that expect `aspect_ratio` string instead of `image_size` object
_ASPECT_RATIO_MODELS = frozenset({
    "fal-ai/nano-banana",
    "fal-ai/nano-banana-2",
    "fal-ai/nano-banana-pro",
})

# Models that require image_size as an enum preset name (min resolution constraints)
_IMAGE_SIZE_PRESET_MODELS = frozenset({
    "fal-ai/bytedance/seedream/v4/text-to-image",
    "fal-ai/bytedance/seedream/v4.5/text-to-image",
    "fal-ai/bytedance/seedream/v5/lite/text-to-image",
})

def _dims_to_aspect_ratio(width: int, height: int) -> str:
    ratio = width / height
    if ratio >= 1.5:
        return "16:9"
    elif ratio <= 0.67:
        return "9:16"
    return "1:1"

def _dims_to_size_preset(width: int, height: int) -> str:
    ratio = width / height
    if ratio >= 1.5:
        return "landscape_16_9"
    elif ratio <= 0.67:
        return "portrait_16_9"
    return "square_hd"


class FalAIClient:
    def __init__(self):
        self.key = FAL_KEY
        self.headers = {
            "Authorization": f"Key {self.key}",
            "Content-Type": "application/json",
        }

    def _enabled(self) -> bool:
        return bool(self.key)

    # ─────────────────────────────────────────────────────────────────
    # Internal: submit → poll → result
    # ─────────────────────────────────────────────────────────────────
    async def _submit(self, model_id: str, payload: dict) -> dict:
        """Submit a job to fal queue and return the request_id."""
        url = f"{FAL_BASE}/{model_id}"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload, headers=self.headers)
            r.raise_for_status()
            return r.json()

    async def _poll(self, model_id: str, request_id: str, max_wait: int = 120) -> dict:
        """Poll fal queue until the job finishes or times out."""
        status_url = f"{FAL_BASE}/{model_id}/requests/{request_id}/status"
        result_url  = f"{FAL_BASE}/{model_id}/requests/{request_id}"
        elapsed = 0
        backoff = 2  # seconds

        async with httpx.AsyncClient(timeout=30) as client:
            while elapsed < max_wait:
                await asyncio.sleep(backoff)
                elapsed += backoff
                backoff = min(backoff + 2, 10)

                r = await client.get(status_url, headers=self.headers)
                r.raise_for_status()
                data = r.json()
                status = data.get("status")

                if status in ("completed", "COMPLETED"):
                    result = await client.get(result_url, headers=self.headers)
                    result.raise_for_status()
                    return result.json()
                elif status in ("failed", "FAILED"):
                    raise RuntimeError(f"fal.ai job failed: {data.get('error')}")

        raise TimeoutError("fal.ai job timed out")

    async def _run(self, model_id: str, payload: dict) -> dict:
        """Full lifecycle: submit → poll → return results."""
        if not self._enabled():
            raise ValueError("FAL_KEY is not set. Please configure FAL_KEY in .env")
        submitted = await self._submit(model_id, payload)
        request_id = submitted.get("request_id")
        if not request_id:
            # Some fal endpoints respond immediately (synchronous mode)
            return submitted
        return await self._poll(model_id, request_id)

    # ─────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────
    async def generate_image(
        self,
        model: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        num_images: int = 1,
        extra: Optional[dict] = None,
    ) -> list[str]:
        """
        Generate image(s) and return list of URLs.
        Default model: fal-ai/flux/schnell
        """
        model = model or "fal-ai/flux/schnell"
        if model in _ASPECT_RATIO_MODELS:
            payload = {
                "prompt": prompt,
                "aspect_ratio": _dims_to_aspect_ratio(width, height),
                "num_images": num_images,
            }
        elif model in _IMAGE_SIZE_PRESET_MODELS:
            payload = {
                "prompt": prompt,
                "image_size": _dims_to_size_preset(width, height),
                "num_images": num_images,
            }
        else:
            payload = {
                "prompt": prompt,
                "image_size": {"width": width, "height": height},
                "num_images": num_images,
            }
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        if extra:
            payload.update(extra)

        result = await self._run(model, payload)
        images = result.get("images", [])
        return [img["url"] if isinstance(img, dict) else img for img in images]

    async def image_to_image(
        self,
        model: str,
        prompt: str,
        image_url: str,
        strength: float = 0.75,
        extra: Optional[dict] = None,
    ) -> list[str]:
        """Image-to-image / inpainting."""
        model = model or "fal-ai/flux/dev/image-to-image"
        payload = {
            "prompt": prompt,
            "image_url": image_url,
            "strength": strength,
        }
        if extra:
            payload.update(extra)
        result = await self._run(model, payload)
        images = result.get("images", [])
        return [img["url"] if isinstance(img, dict) else img for img in images]

    async def upscale_image(
        self,
        model: str,
        image_url: str,
        extra: Optional[dict] = None,
    ) -> list[str]:
        """Upscale an image and return list of URLs."""
        model = model or "fal-ai/seedvr/upscale/image"
        payload = {
            "image_url": image_url,
            "upscale_mode": "factor",
            "upscale_factor": 2,
            "target_resolution": "1080p",
            "noise_scale": 0.1,
            "output_format": "jpg",
        }
        if extra:
            payload.update(extra)
        result = await self._run(model, payload)
        images = result.get("images") or []
        if not images:
            image = result.get("image")
            if image:
                images = [image]
        return [img["url"] if isinstance(img, dict) else img for img in images]

    async def generate_video(
        self,
        model: str,
        prompt: str,
        duration: str = "5",
        extra: Optional[dict] = None,
    ) -> str:
        """Generate a video from text and return the URL."""
        model = model or "fal-ai/kling-video/v1/standard/text-to-video"
        if model == "fal-ai/seedvr/upscale/video":
            payload = {
                "video_url": (extra or {}).get("video_url", ""),
                "upscale_mode": (extra or {}).get("upscale_mode", "factor"),
                "upscale_factor": (extra or {}).get("upscale_factor", 2),
                "target_resolution": (extra or {}).get("target_resolution", "1080p"),
                "noise_scale": (extra or {}).get("noise_scale", 0.1),
                "output_format": (extra or {}).get("output_format", "X264 (.mp4)"),
                "output_quality": (extra or {}).get("output_quality", "high"),
                "output_write_mode": (extra or {}).get("output_write_mode", "balanced"),
            }
        else:
            payload = {
                "prompt": prompt,
                "duration": duration,
            }
        if extra:
            payload.update(extra)
        result = await self._run(model, payload)
        video = result.get("video", {})
        if isinstance(video, dict):
            return video.get("url", "")
        return str(video)

    async def remove_background(
        self,
        model: str,
        image_url: str,
        extra: Optional[dict] = None,
    ) -> list[str]:
        """Remove background from an image and return list of URLs."""
        model = model or "fal-ai/bria/background/remove"
        payload = {"image_url": image_url}
        if extra:
            payload.update(extra)
        result = await self._run(model, payload)
        images = result.get("images") or []
        if not images:
            img = result.get("image")
            if img:
                images = [img]
        return [img["url"] if isinstance(img, dict) else img for img in images]

    async def generate_video_from_image(
        self,
        model: str,
        prompt: str,
        image_url: str,
        duration: str = "5",
        extra: Optional[dict] = None,
    ) -> str:
        """Generate a video from an image + prompt and return the URL."""
        model = model or "fal-ai/kling-video/v1/standard/image-to-video"
        payload = {
            "prompt": prompt,
            "image_url": image_url,
            "duration": duration,
        }
        if extra:
            payload.update(extra)
        result = await self._run(model, payload)
        video = result.get("video", {})
        if isinstance(video, dict):
            return video.get("url", "")
        return str(video)


# Module-level singleton (lazy init)
_fal_client: Optional[FalAIClient] = None


def get_fal_client() -> FalAIClient:
    global _fal_client
    if _fal_client is None:
        _fal_client = FalAIClient()
    return _fal_client
