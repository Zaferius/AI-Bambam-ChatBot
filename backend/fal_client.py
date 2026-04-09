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

    async def face_swap(
        self,
        source_image_url: str,
        target_image_url: str,
    ) -> str:
        """Swap face from source onto target. Returns result URL."""
        model = "fal-ai/face-swap"
        payload = {
            "source_image_url": source_image_url,
            "target_image_url": target_image_url,
        }
        result = await self._run(model, payload)
        images = result.get("images", [])
        if images:
            img = images[0]
            return img["url"] if isinstance(img, dict) else img
        return result.get("image", {}).get("url", "")

    async def generate_video(
        self,
        model: str,
        prompt: str,
        duration: str = "5",
        extra: Optional[dict] = None,
    ) -> str:
        """Generate a video and return the URL."""
        model = model or "fal-ai/kling-video/v1/standard/text-to-video"
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


# Module-level singleton (lazy init)
_fal_client: Optional[FalAIClient] = None


def get_fal_client() -> FalAIClient:
    global _fal_client
    if _fal_client is None:
        _fal_client = FalAIClient()
    return _fal_client
