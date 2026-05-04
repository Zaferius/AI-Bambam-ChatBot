"""
credits_router.py — Credit balance & transaction endpoints.

GET  /credits/balance        -> { balance }
GET  /credits/transactions   -> [ ...transactions ]
POST /credits/add            -> admin/test: add credits manually
POST /credits/purchase       -> demo purchase (no real payment)
GET  /credits/packs          -> list available packs
GET  /credits/subscriptions  -> list subscription plans
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import os

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
    pack: str  # "60" | "160" | "500" | "1200"


class SubscribeRequest(BaseModel):
    plan: str  # "basic" | "creator" | "pro" | "studio"
    billing: str = "monthly"  # "monthly" | "annual"


CREDIT_PACKS = {
    "60":  {"name": "Quick Boost", "credits": 60,  "price_usd": 6.0,  "description": "One-off credits for tests, edits, and light image sessions."},
    "150": {"name": "Creator Top-Up", "credits": 150, "price_usd": 15.0, "description": "A flexible top-up for image, edit, and standard video workflows."},
    "400": {"name": "Power Pack", "credits": 400, "price_usd": 35.0, "description": "Extra room for batches, Content Machine runs, and occasional premium generations."},
    "900": {"name": "Studio Pack", "credits": 900, "price_usd": 69.0, "description": "High-volume one-off credits for heavy creative sessions without a subscription upgrade."},
}


SUBSCRIPTION_PLANS = {
    "basic": {
        "name": "Basic",
        "monthly_price_usd": 4.0,
        "annual_monthly_price_usd": 3.0,
        "monthly_credits": 30,
        "annual_bonus_percent": 10,
        "description": "Low-cost entry subscription for trying Raiko every month without exposing expensive premium video risk.",
        "features": [
            "30 credits per month",
            "Standard image and edit tools",
            "Buy extra credit packs any time",
            "Premium video models locked",
        ],
    },
    "creator": {
        "name": "Creator",
        "monthly_price_usd": 19.0,
        "annual_monthly_price_usd": 15.0,
        "monthly_credits": 180,
        "annual_bonus_percent": 10,
        "badge": "Most Popular",
        "description": "Balanced plan for consistent solo content creation with safer premium video exposure.",
        "features": [
            "180 credits per month",
            "All standard image, edit, restyler, and standard video tools",
            "Content Machine access",
            "Premium video available only at higher credit burn",
        ],
    },
    "pro": {
        "name": "Pro",
        "monthly_price_usd": 39.0,
        "annual_monthly_price_usd": 32.0,
        "monthly_credits": 420,
        "annual_bonus_percent": 10,
        "badge": "Best Value",
        "description": "For creators mixing frequent video, upscale, and content packs without exposing the platform to runaway loss.",
        "features": [
            "420 credits per month",
            "Premium model access",
            "Priority queue simulation",
            "Safer but still strong premium video budget",
        ],
    },
    "studio": {
        "name": "Studio",
        "monthly_price_usd": 79.0,
        "annual_monthly_price_usd": 65.0,
        "monthly_credits": 1400,
        "annual_bonus_percent": 10,
        "description": "Heavy solo creator plan before moving into team workflows.",
        "hidden": True,
        "features": [
            "1,400 credits per month",
            "Highest priority simulation",
            "Premium video-heavy workflows",
            "Early-access creative tools",
        ],
    },
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


@router.get("/subscriptions")
async def get_subscription_plans():
    """Return available subscription plans (no auth required)."""
    return {"plans": [
        {"id": k, **v} for k, v in SUBSCRIPTION_PLANS.items()
    ]}


@router.post("/add")
async def add_credits_manual(
    req: AddCreditsRequest,
    current_user: dict = Depends(get_current_user),
):
    """DEV ONLY — manually add credits."""
    if os.getenv("ALLOW_MANUAL_CREDIT_ADD", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Manual credit add is disabled")

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


@router.post("/subscribe")
async def subscribe_plan(
    req: SubscribeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Stub endpoint — demo subscription checkout. Adds the plan's first-month credits immediately."""
    plan = SUBSCRIPTION_PLANS.get(req.plan)
    if not plan:
        raise HTTPException(400, f"Unknown plan: {req.plan}. Valid: {list(SUBSCRIPTION_PLANS.keys())}")
    if req.billing not in {"monthly", "annual"}:
        raise HTTPException(400, "billing must be 'monthly' or 'annual'")

    credits = plan["monthly_credits"]
    if req.billing == "annual":
        credits = round(credits * (1 + (plan.get("annual_bonus_percent", 0) / 100)))

    user_id = current_user["id"]
    new_balance = _db.add_credits(
        user_id,
        credits,
        f"Subscribed to {plan['name']} ({req.billing}) — first month credits"
    )
    return {
        "plan": req.plan,
        "plan_name": plan["name"],
        "billing": req.billing,
        "credits_added": credits,
        "new_balance": round(new_balance, 2),
        "message": "Subscription activated! (Stripe integration coming soon)",
    }
