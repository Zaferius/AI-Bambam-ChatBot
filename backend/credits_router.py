"""
credits_router.py — Credit balance & transaction endpoints.

GET  /credits/balance        -> { balance }
GET  /credits/transactions   -> [ ...transactions ]
POST /credits/add            -> admin/test: add credits manually
POST /credits/purchase       -> demo purchase (no real payment)
GET  /credits/packs          -> list available packs
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user

_db = None

router = APIRouter(prefix="/credits", tags=["Credits"])


def init_credits_router(db):
    global _db
    _db = db


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class AddCreditsRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Credits to add (positive number)")
    description: str = "Manual top-up"


class PurchaseRequest(BaseModel):
    pack: str  # "20" | "50" | "100" | "250"


CREDIT_PACKS = {
    "20":  {"credits": 20,  "price_usd": 2.99},
    "50":  {"credits": 50,  "price_usd": 5.99},
    "100": {"credits": 100, "price_usd": 9.99},
    "250": {"credits": 250, "price_usd": 19.99},
}


# ---------------------------------------------------------------------------
# Routes  (auth dependency injected at startup in main.py)
# ---------------------------------------------------------------------------
@router.get("/balance")
async def get_balance(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    balance = _db.get_credits(user_id)
    return {"balance": round(balance, 2), "user_id": user_id}


@router.get("/transactions")
async def get_transactions(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    txs = _db.get_transactions(user_id, limit=limit)
    return {"transactions": txs}


@router.get("/packs")
async def get_credit_packs():
    """Return available credit purchase packs (no auth required)."""
    return {"packs": [
        {"id": k, **v} for k, v in CREDIT_PACKS.items()
    ]}


@router.post("/add")
async def add_credits_manual(
    req: AddCreditsRequest,
    current_user: dict = Depends(get_current_user),
):
    """DEV ONLY — manually add credits."""
    user_id = current_user["id"]
    new_balance = _db.add_credits(user_id, req.amount, req.description)
    return {
        "added": req.amount,
        "balance": round(new_balance, 2),
        "message": f"Added {req.amount} credits successfully.",
    }


@router.post("/purchase")
async def purchase_pack(
    req: PurchaseRequest,
    current_user: dict = Depends(get_current_user),
):
    """Stub endpoint — demo mode (no real Stripe). Adds credits immediately."""
    pack = CREDIT_PACKS.get(req.pack)
    if not pack:
        raise HTTPException(400, f"Unknown pack: {req.pack}. Valid: {list(CREDIT_PACKS.keys())}")

    user_id = current_user["id"]
    new_balance = _db.add_credits(
        user_id,
        pack["credits"],
        f"Purchased {req.pack}-credit pack (${pack['price_usd']})"
    )
    return {
        "pack": req.pack,
        "credits_added": pack["credits"],
        "price_usd": pack["price_usd"],
        "new_balance": round(new_balance, 2),
        "message": "Credits added! (Stripe integration coming soon)",
    }
