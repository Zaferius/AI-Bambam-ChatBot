"""
ai_router.py — Unified AI generation endpoint.

POST /ai/generate  →  chat | image | video | edit
All requests:
  • require valid JWT
  • deduct credits automatically
  • return credits_used + credits_remaining in every response
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal, Optional, Any
import json
import os

from auth import get_current_user

# These will be injected via init_ai_router()
_db = None
_memory_manager = None
_openai_client = None
_groq_client = None
_openrouter_client = None
_gemini_client = None

router = APIRouter(prefix="/ai", tags=["AI"])


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────────────────────
class AIGenerateRequest(BaseModel):
    type: Literal["chat", "image", "video", "edit", "image_to_video"] = "chat"
    model: str = "openai/gpt-4o-mini"
    prompt: str
    # Chat specific
    chat_id: Optional[str] = None
    system_prompt: Optional[str] = None
    attachments: list[dict] = Field(default_factory=list)
    # Image specific
    negative_prompt: Optional[str] = None
    width: int = Field(default=1024, ge=128, le=2048)
    height: int = Field(default=1024, ge=128, le=2048)
    num_images: int = Field(default=1, ge=1, le=4)
    # Video specific
    duration: str = "5"
    # Edit
    image_url: Optional[str] = None
    strength: float = Field(default=0.75, ge=0.0, le=1.0)
    # Extra fal.ai params
    options: dict = Field(default_factory=dict)


class AIGenerateResponse(BaseModel):
    output: Any               # str for chat/video, list[str] for image
    credits_used: float
    credits_remaining: float
    model: str
    type: str


# ─────────────────────────────────────────────────────────────────────────────
# Init (called from main.py)
# ─────────────────────────────────────────────────────────────────────────────
def init_ai_router(db, memory_manager, openai_client=None, groq_client=None,
                    openrouter_client=None, gemini_client=None):
    global _db, _memory_manager, _openai_client, _groq_client
    global _openrouter_client, _gemini_client
    _db = db
    _memory_manager = memory_manager
    _openai_client = openai_client
    _groq_client = groq_client
    _openrouter_client = openrouter_client
    _gemini_client = gemini_client


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _resolve_openrouter_model(model_id: str) -> str:
    """Strip provider prefix if present (e.g. 'openrouter/...' → '...')"""
    if model_id.startswith("openrouter/"):
        return model_id[len("openrouter/"):]
    return model_id


def _get_chat_client_and_model(model_id: str):
    """Return (client, bare_model_name) for text chat."""
    bare = _resolve_openrouter_model(model_id)
        
    # FORCE everything through OpenRouter if available (since the platform relies on OpenRouter pricing/credits)
    if _openrouter_client:
        return _openrouter_client, bare
        
    # Fallbacks if openrouter is not configured
    if bare.startswith("groq/") and _groq_client:
        return _groq_client, bare[5:]
    if bare.startswith("openai/") and _openai_client:
        return _openai_client, bare[7:]
        
    return _openai_client, bare


def _memory_chat_key(user_id: str, chat_id: Optional[str]) -> Optional[str]:
    if not chat_id:
        return None
    return f"{user_id}:{chat_id}"


def _build_chat_messages(req: AIGenerateRequest, user_id: str) -> list:
    system = req.system_prompt or (
        "You are a helpful, smart AI assistant. Be concise and accurate."
    )
    messages = [{"role": "system", "content": system}]

    if req.chat_id and _db:
        db_memory = _db.get_long_term_memory(req.chat_id)
        if db_memory and db_memory.get("important_topics"):
            topics = ", ".join(db_memory["important_topics"][:20])
            messages.append({
                "role": "system",
                "content": f"Relevant long-term context from earlier conversation: {topics}",
            })

    memory_key = _memory_chat_key(user_id, req.chat_id)
    if _memory_manager and memory_key:
        history = _memory_manager.get_chat_history_for_llm(memory_key)
        messages.extend(history[:-1] if history else [])

    user_parts = []
    prompt_text = (req.prompt or "").strip()
    if prompt_text:
        user_parts.append({"type": "text", "text": prompt_text})

    for attachment in req.attachments or []:
        mime_type = (attachment.get("mime_type") or "").lower()
        data_url = attachment.get("data_url")
        text_content = attachment.get("text_content")
        name = attachment.get("name") or "attachment"

        if mime_type.startswith("image/") and data_url:
            user_parts.append({"type": "image_url", "image_url": {"url": data_url}})
        elif text_content:
            user_parts.append({
                "type": "text",
                "text": f"[Attachment: {name}]\n{text_content}",
            })
        else:
            user_parts.append({
                "type": "text",
                "text": f"[Attachment: {name}] (binary file attached; no text extracted)",
            })

    if not user_parts:
        user_parts.append({"type": "text", "text": "[Empty message]"})

    if len(user_parts) == 1 and user_parts[0]["type"] == "text":
        messages.append({"role": "user", "content": user_parts[0]["text"]})
    else:
        messages.append({"role": "user", "content": user_parts})
    return messages


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/generate")
async def ai_generate(
    req: AIGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    from model_costs import get_fal_cost
    from fal_client import get_fal_client

    # ── Credit pre-check ────────────────────────────────────────────
    user_id = current_user["id"]
    balance = _db.get_credits(user_id)

    MIN_REQUIRED = {
        "chat": 0.01,
        "image": 1.0,
        "video": 5.0,
        "edit": 1.0,
        "image_to_video": 5.0,
    }
    if balance < MIN_REQUIRED.get(req.type, 0.01):
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Balance: {balance:.2f}. Required: {MIN_REQUIRED[req.type]} minimum."
        )

    # ── Route by type ────────────────────────────────────────────────
    if req.type == "chat":
        return _handle_chat_stream(req, user_id, balance)

    elif req.type == "image":
        fal = get_fal_client()
        cost = get_fal_cost(req.model) * max(req.num_images, 1)
        urls = await fal.generate_image(
            model=req.model,
            prompt=req.prompt,
            negative_prompt=req.negative_prompt or "",
            width=req.width,
            height=req.height,
            num_images=req.num_images,
            extra=req.options or None,
        )
        ok = _db.deduct_credits(user_id, cost, "Image generation", req.model)
        if not ok:
            raise HTTPException(402, "Could not deduct credits — insufficient balance.")
        new_balance = _db.get_credits(user_id)
        return AIGenerateResponse(
            output=urls,
            credits_used=cost,
            credits_remaining=new_balance,
            model=req.model,
            type="image",
        )

    elif req.type == "video":
        fal = get_fal_client()
        cost = get_fal_cost(req.model)
        url = await fal.generate_video(
            model=req.model,
            prompt=req.prompt,
            duration=req.duration,
            extra=req.options or None,
        )
        ok = _db.deduct_credits(user_id, cost, "Video generation", req.model)
        if not ok:
            raise HTTPException(402, "Could not deduct credits.")
        new_balance = _db.get_credits(user_id)
        return AIGenerateResponse(
            output=url,
            credits_used=cost,
            credits_remaining=new_balance,
            model=req.model,
            type="video",
        )

    elif req.type == "edit":
        if not req.image_url:
            raise HTTPException(400, "image_url is required for edit type.")
        fal = get_fal_client()
        model_id = req.model or "fal-ai/flux/dev/image-to-image"
        cost = get_fal_cost(model_id)
        if model_id == "fal-ai/bria/background/remove":
            urls = await fal.remove_background(
                model=model_id,
                image_url=req.image_url,
                extra=req.options or None,
            )
        else:
            urls = await fal.image_to_image(
                model=model_id,
                prompt=req.prompt,
                image_url=req.image_url,
                strength=req.strength,
                extra=req.options or None,
            )
        ok = _db.deduct_credits(user_id, cost, "Image edit", model_id)
        if not ok:
            raise HTTPException(402, "Could not deduct credits.")
        new_balance = _db.get_credits(user_id)
        return AIGenerateResponse(
            output=urls,
            credits_used=cost,
            credits_remaining=new_balance,
            model=model_id,
            type="edit",
        )

    elif req.type == "image_to_video":
        if not req.image_url:
            raise HTTPException(400, "image_url is required for image_to_video type.")
        fal = get_fal_client()
        default_model = "fal-ai/kling-video/v1/standard/image-to-video"
        model_id = req.model or default_model
        cost = get_fal_cost(model_id)
        url = await fal.generate_video_from_image(
            model=model_id,
            prompt=req.prompt,
            image_url=req.image_url,
            duration=req.duration,
            extra=req.options or None,
        )
        ok = _db.deduct_credits(user_id, cost, "Image to video", model_id)
        if not ok:
            raise HTTPException(402, "Could not deduct credits.")
        new_balance = _db.get_credits(user_id)
        return AIGenerateResponse(
            output=url,
            credits_used=cost,
            credits_remaining=new_balance,
            model=model_id,
            type="image_to_video",
        )

    raise HTTPException(400, f"Unknown type: {req.type}")


# ─────────────────────────────────────────────────────────────────────────────
# Chat streaming (SSE / plain text)
# ─────────────────────────────────────────────────────────────────────────────
def _handle_chat_stream(req: AIGenerateRequest, user_id: str, balance: float):
    """Return StreamingResponse for chat. Credits deducted after stream."""
    from model_costs import get_llm_cost

    if req.chat_id:
        existing_chat = _db.get_chat(req.chat_id)
        if existing_chat and existing_chat.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You do not have access to this chat")

    messages = _build_chat_messages(req, user_id)
    client, bare_model = _get_chat_client_and_model(req.model)

    if client is None:
        raise HTTPException(status_code=400, detail="No API client configured for this model. Please check your .env file.")

    def generate():
        full_reply = ""
        token_count = 0

        kwargs = {
            "model": bare_model,
            "messages": messages,
            "stream": True,
        }

        # Automatically enable OpenRouter's internal web search plugin
        # We use plugins via extra_body because some upstream providers (like OpenAI) 
        # strictly reject function names with colons (like 'openrouter:web_search').
        if client == _openrouter_client:
            kwargs["extra_body"] = {
                "plugins": [
                    {
                        "id": "web",
                        "max_results": 5
                    }
                ]
            }

        try:
            stream = client.chat.completions.create(**kwargs)
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    token_count += len(delta.split())
                    yield delta

        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"
            return

        # ── Post-stream: save memory + deduct credits ─────────────
        if req.chat_id:
            memory_key = _memory_chat_key(user_id, req.chat_id)
            if _memory_manager:
                _memory_manager.add_message(memory_key, req.prompt, "user", persist=False)
                _memory_manager.add_message(memory_key, full_reply, "assistant")

                memory_record = _memory_manager.long_term_memory.get(memory_key, {})
                try:
                    _db.save_long_term_memory(
                        req.chat_id,
                        memory_record.get("user_info", {}),
                        memory_record.get("preferences", {}),
                        memory_record.get("important_topics", []),
                    )
                except Exception:
                    pass
            
            # Save to SQLite Database
            if not _db.get_chat(req.chat_id):
                title = req.prompt[:30] + "..." if len(req.prompt) > 30 else req.prompt
                _db.create_chat(req.chat_id, title, user_id)
            
            try:
                _db.add_message(
                    req.chat_id,
                    "user",
                    req.prompt,
                    req.model,
                    attachments=req.attachments,
                )
                _db.add_message(req.chat_id, "assistant", full_reply, req.model)
            except Exception as e:
                print(f"Error saving chat to DB: {e}")

        cost_per_1k = get_llm_cost(req.model)
        estimated_tokens = max(token_count * 1.3, 50)  # rough estimate
        credits_used = round((estimated_tokens / 1000) * cost_per_1k, 4)
        credits_used = max(credits_used, 0.01)

        deducted = _db.deduct_credits(user_id, credits_used, "Chat", req.model)
        new_balance = _db.get_credits(user_id)

        # Send credit info as final SSE metadata line
        meta = json.dumps({
            "credits_used": credits_used if deducted else 0,
            "credits_remaining": new_balance,
            "deduction_failed": not deducted,
        })
        yield f"\n\n__CREDITS__{meta}"

    return StreamingResponse(generate(), media_type="text/plain")


# ─────────────────────────────────────────────────────────────────────────────
# Patch: inject real auth dependency at startup
# ─────────────────────────────────────────────────────────────────────────────
def patch_auth_dependency(get_current_user_fn):
    """Call this from main.py after auth is initialized."""
    global router
    # Re-register the route with the real dependency
    for route in router.routes:
        if hasattr(route, "endpoint") and route.endpoint.__name__ == "ai_generate":
            route.dependencies = [Depends(get_current_user_fn)]
            break
