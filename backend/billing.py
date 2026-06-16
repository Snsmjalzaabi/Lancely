"""Lancely billing & subscription management — RevenueCat integration.

Single source of truth for plan tier resolution. The `plan_tier` field on
user documents is a denormalized cache of RevenueCat entitlements:

- "free"  → no active entitlement, trial expired (default after trial ends)
- "trial" → within 14-day trial of Pro (granted at registration)
- "pro"   → active "pro" entitlement on RevenueCat

Routes that require Pro should depend on `require_pro`. The dependency:
1. Treats `trial_ends_at > now` as Pro access (during trial).
2. Treats `plan_tier == "pro"` as Pro access (post-paid).
3. Otherwise raises 402 Payment Required with a useful payload.

Webhooks from RevenueCat update `plan_tier`, `rc_entitlements`, and
`current_period_end` so the cache stays in sync. A secret header on the
webhook authenticates the request.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ----- Configuration (env-driven) -----------------------------------------

RC_API_BASE = os.environ.get("RC_API_BASE_URL", "https://api.revenuecat.com/v1")
RC_SECRET_API_KEY = os.environ.get("RC_SECRET_API_KEY", "")
RC_WEBHOOK_AUTH_SECRET = os.environ.get("RC_WEBHOOK_AUTH_SECRET", "")
PRO_ENTITLEMENT_ID = os.environ.get("RC_PRO_ENTITLEMENT_ID", "pro")

# Free tier hard limits (per user)
FREE_LIMITS = {
    "max_clients": 1,
    "max_invoices_per_month": 3,
    "max_quotations_per_month": 3,
    "allow_ai": False,
    "allow_recurring": False,
    "allow_custom_templates": False,
    "pdf_watermark": True,
}

PRO_LIMITS = {
    "max_clients": None,  # unlimited
    "max_invoices_per_month": None,
    "max_quotations_per_month": None,
    "allow_ai": True,
    "allow_recurring": True,
    "allow_custom_templates": True,
    "pdf_watermark": False,
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_trial_active(user: dict) -> bool:
    """True iff the user is still within their 14-day trial window."""
    end = user.get("trial_ends_at")
    if not end:
        return False
    try:
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        return _now_utc() < end_dt
    except Exception:
        return False


def has_pro_access(user: dict) -> bool:
    """True iff user has Pro-level access right now (paid or in trial)."""
    if (user.get("plan_tier") or "free") == "pro":
        return True
    return is_trial_active(user)


def effective_plan_tier(user: dict) -> str:
    """Best-effort plan resolution for UI / API responses."""
    if (user.get("plan_tier") or "free") == "pro":
        return "pro"
    if is_trial_active(user):
        return "trial"
    return "free"


def plan_limits(user: dict) -> dict:
    return PRO_LIMITS if has_pro_access(user) else FREE_LIMITS


# ----- Plan-gating dependency ---------------------------------------------

def require_pro(get_current_user_dep):
    """Factory that returns a FastAPI dependency requiring Pro access.

    Usage:
        from billing import require_pro
        @router.post("/ai/parse-invoice", dependencies=[Depends(require_pro(get_current_user))])
        async def parse(...): ...
    """
    async def _dep(user: dict = Depends(get_current_user_dep)) -> dict:
        if has_pro_access(user):
            return user
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "PRO_REQUIRED",
                "message": "This feature is available on the Pro plan.",
                "plan_tier": effective_plan_tier(user),
                "trial_ends_at": user.get("trial_ends_at"),
            },
        )
    return _dep


# ----- Monthly usage helpers ----------------------------------------------

async def count_user_clients(db, user_id: str) -> int:
    return await db.clients.count_documents({"user_id": user_id})


async def count_user_docs_this_month(db, collection_name: str, user_id: str) -> int:
    now = _now_utc()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    return await db[collection_name].count_documents({
        "user_id": user_id,
        "created_at": {"$gte": start},
    })


async def assert_free_tier_quota(db, user: dict, kind: str):
    """Raise 402 if a Free user is over the limit for the given resource kind.

    kind: "clients" | "invoices" | "quotations"
    """
    if has_pro_access(user):
        return  # Pro users have no limits
    limits = FREE_LIMITS
    if kind == "clients":
        cap = limits["max_clients"]
        current = await count_user_clients(db, user["id"])
    elif kind == "invoices":
        cap = limits["max_invoices_per_month"]
        current = await count_user_docs_this_month(db, "invoices", user["id"])
    elif kind == "quotations":
        cap = limits["max_quotations_per_month"]
        current = await count_user_docs_this_month(db, "quotations", user["id"])
    else:
        return
    if cap is not None and current >= cap:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "FREE_LIMIT_REACHED",
                "kind": kind,
                "limit": cap,
                "current": current,
                "message": f"You've reached the Free plan limit for {kind}. Upgrade to Pro for unlimited.",
                "plan_tier": effective_plan_tier(user),
            },
        )


# ----- RevenueCat REST helpers --------------------------------------------

async def fetch_rc_subscriber(app_user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch canonical subscriber state from RevenueCat. Returns None on error
    so callers can fall back to the cached MongoDB state."""
    if not RC_SECRET_API_KEY:
        logger.warning("RC_SECRET_API_KEY not configured; skipping RevenueCat fetch")
        return None
    url = f"{RC_API_BASE}/subscribers/{app_user_id}"
    headers = {
        "Authorization": f"Bearer {RC_SECRET_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                # No subscriber record yet — user has never purchased
                return None
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning("RevenueCat fetch failed for %s: %s", app_user_id, e)
        return None


def derive_plan_from_subscriber(subscriber_json: dict) -> dict:
    """Compute {plan_tier, entitlements, current_period_end} from a v1 subscriber payload."""
    sub = (subscriber_json or {}).get("subscriber", {}) or {}
    ents = sub.get("entitlements", {}) or {}
    now_iso = _now_utc().isoformat()
    active = {}
    latest_expiry: Optional[str] = None
    for ent_id, ent in ents.items():
        expires = ent.get("expires_date")
        # is_active if no expiry (lifetime) or expiry in the future
        is_active = (expires is None) or (expires > now_iso)
        if is_active:
            active[ent_id] = ent
            if expires and (latest_expiry is None or expires > latest_expiry):
                latest_expiry = expires
    plan_tier = "pro" if PRO_ENTITLEMENT_ID in active else "free"
    return {
        "plan_tier": plan_tier,
        "rc_entitlements": ents,
        "current_period_end": latest_expiry,
    }


# ----- Billing router (mounted at /api) ------------------------------------

def build_billing_router(db, get_current_user_dep) -> APIRouter:
    r = APIRouter()

    @r.get("/billing/status")
    async def billing_status(user: dict = Depends(get_current_user_dep)):
        """Return the user's current plan + limits + usage."""
        tier = effective_plan_tier(user)
        is_pro = has_pro_access(user)
        # Compute current usage for free-tier visibility
        usage = {
            "clients_used": await count_user_clients(db, user["id"]),
            "invoices_used_this_month": await count_user_docs_this_month(db, "invoices", user["id"]),
            "quotations_used_this_month": await count_user_docs_this_month(db, "quotations", user["id"]),
        }
        return {
            "plan_tier": tier,
            "is_pro": is_pro,
            "is_trial": tier == "trial",
            "trial_ends_at": user.get("trial_ends_at"),
            "current_period_end": user.get("current_period_end"),
            "limits": plan_limits(user),
            "usage": usage,
            "rc_app_user_id": user["id"],  # for the web SDK to identify
            "rc_entitlements": user.get("rc_entitlements", {}),
        }

    @r.post("/billing/refresh")
    async def billing_refresh(user: dict = Depends(get_current_user_dep)):
        """Force a refresh of the user's plan state from RevenueCat.

        Useful immediately after a purchase so the UI sees Pro status without waiting
        for the webhook to arrive.
        """
        sub = await fetch_rc_subscriber(user["id"])
        if sub is None:
            return {"refreshed": False, "plan_tier": effective_plan_tier(user)}
        update = derive_plan_from_subscriber(sub)
        update["rc_last_event_type"] = "manual_refresh"
        update["rc_last_event_at"] = _now_utc().isoformat()
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        return {"refreshed": True, **update}

    @r.get("/billing/management-url")
    async def billing_management_url(user: dict = Depends(get_current_user_dep)):
        """Return the RevenueCat-issued customer management URL for self-service.

        Web Billing customers receive an email with a secure link to manage their
        subscription. We surface the latest known URL from RevenueCat.
        """
        sub = await fetch_rc_subscriber(user["id"])
        if not sub:
            raise HTTPException(404, "No active subscription found")
        # v1 surfaces management_url at subscriber.management_url for Web Billing customers
        url = (sub.get("subscriber") or {}).get("management_url")
        if not url:
            raise HTTPException(404, "No management URL available for this subscription")
        return {"url": url}

    @r.post("/webhooks/revenuecat")
    async def revenuecat_webhook(
        request: Request,
        authorization: Optional[str] = Header(None),
    ):
        """Receive RevenueCat webhooks. Authenticated via static header secret."""
        expected = f"Bearer {RC_WEBHOOK_AUTH_SECRET}" if RC_WEBHOOK_AUTH_SECRET else None
        if expected is None:
            logger.error("RC_WEBHOOK_AUTH_SECRET not configured — rejecting webhook for safety")
            raise HTTPException(401, "Webhook secret not configured")
        if authorization != expected:
            logger.warning("RevenueCat webhook auth mismatch")
            raise HTTPException(401, "Invalid webhook auth")
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")
        event = (payload or {}).get("event", {}) or {}
        app_user_id = event.get("app_user_id") or payload.get("app_user_id")
        event_type = event.get("type") or payload.get("type") or "UNKNOWN"
        if not app_user_id:
            logger.warning("RevenueCat webhook missing app_user_id; payload keys=%s", list(payload.keys()))
            return {"status": "ignored", "reason": "no_app_user_id"}
        # Always fetch canonical subscriber state to avoid drift between event types.
        sub = await fetch_rc_subscriber(app_user_id)
        if sub:
            update = derive_plan_from_subscriber(sub)
        else:
            # Fallback: trust the event minimally
            update = {"plan_tier": "free", "rc_entitlements": {}, "current_period_end": None}
        update["rc_last_event_type"] = event_type
        update["rc_last_event_at"] = _now_utc().isoformat()
        result = await db.users.update_one({"id": app_user_id}, {"$set": update})
        if result.matched_count == 0:
            logger.warning("RevenueCat webhook for unknown user_id=%s event=%s", app_user_id, event_type)
        else:
            logger.info("RevenueCat webhook processed: user=%s event=%s tier=%s",
                        app_user_id, event_type, update.get("plan_tier"))
        return {"status": "ok", "event_type": event_type, "plan_tier": update.get("plan_tier")}

    return r
