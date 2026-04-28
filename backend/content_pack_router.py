"""FastAPI router for Raiko's One Click Content Machine."""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from content_pack_engine import (
    ContentPackMachine,
    ContentPackRequest,
    ContentPackResponse,
    estimate_content_pack_cost,
)
from fal_client import get_fal_client


router = APIRouter(prefix="/content-packs", tags=["Content Packs"])

_db = None
_openrouter_client = None
_openai_client = None


def init_content_pack_router(db, openrouter_client=None, openai_client=None):
    global _db, _openrouter_client, _openai_client
    _db = db
    _openrouter_client = openrouter_client
    _openai_client = openai_client


@router.post("/generate", response_model=ContentPackResponse)
async def generate_content_pack(
    req: ContentPackRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=500, detail="Content Pack router is not initialized.")

    user_id = current_user["id"]
    estimated_cost = estimate_content_pack_cost(req)
    balance = _db.get_credits(user_id)
    if balance < estimated_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Balance: {balance:.2f}. Required: {estimated_cost:.2f}.",
        )

    machine = ContentPackMachine(
        fal=get_fal_client(),
        openrouter_client=_openrouter_client,
        openai_client=_openai_client,
    )
    response = await machine.generate(user_id, req)

    ok = _db.deduct_credits(user_id, estimated_cost, "One Click Content Pack", "raiko/content-machine")
    if not ok:
        raise HTTPException(status_code=402, detail="Could not deduct credits.")

    response.credits_used = estimated_cost
    response.credits_remaining = _db.get_credits(user_id)
    return response
