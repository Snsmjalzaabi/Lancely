# RevenueCat Webhook — Drop-In for Shared Lancely Backend

Paste this into the **web project's** FastAPI backend (where `freelancer-hub-47.preview.emergentagent.com` is hosted) so subscription state syncs from Apple/Google → RevenueCat → your shared database.

---

## 1. Add env var

In the web backend's `.env`:

```
REVENUECAT_WEBHOOK_SECRET=<paste the same random string you set in RevenueCat dashboard>
```

Generate a fresh one with: `openssl rand -hex 32`, then prefix with `lcl_whk_`.

---

## 2. Add the endpoint to `server.py`

```python
import os
from fastapi import APIRouter, HTTPException, Header, Request
from typing import Optional
from datetime import datetime, timezone

REVENUECAT_WEBHOOK_SECRET = os.environ.get("REVENUECAT_WEBHOOK_SECRET", "")

_RC_GRANT_EVENTS = {
    "INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE",
    "UNCANCELLATION", "NON_RENEWING_PURCHASE", "TRANSFER",
}
_RC_REVOKE_EVENTS = {
    "CANCELLATION", "EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED",
}

@api_router.post("/webhooks/revenuecat")
async def revenuecat_webhook(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Sync subscription state from RevenueCat into the users collection."""
    if not REVENUECAT_WEBHOOK_SECRET or authorization != REVENUECAT_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    event = (payload or {}).get("event", {}) or {}
    event_type = event.get("type")
    # IMPORTANT: app_user_id = the value the mobile app passes to
    # Purchases.configure({ appUserID }) — Lancely passes the user's id.
    app_user_id = event.get("app_user_id") or event.get("original_app_user_id")
    product_id = event.get("product_id")

    if not event_type or not app_user_id:
        return {"ok": True, "ignored": True}

    now = datetime.now(timezone.utc)
    if event_type in _RC_GRANT_EVENTS:
        await db.users.update_one(
            {"id": app_user_id},
            {"$set": {
                "is_pro": True,
                "pro_since": now,
                "pro_product_id": product_id,
                "pro_source": "revenuecat",
                "updated_at": now,
            }},
        )
    elif event_type in _RC_REVOKE_EVENTS:
        await db.users.update_one(
            {"id": app_user_id},
            {"$set": {"is_pro": False, "updated_at": now}},
        )

    return {"ok": True, "event": event_type}
```

---

## 3. Configure in RevenueCat dashboard

1. RevenueCat → **Project Settings → Integrations → + New → Webhook**
2. **URL**: `https://freelancer-hub-47.preview.emergentagent.com/api/webhooks/revenuecat`  
   (use your production domain when deployed)
3. **Authorization Header Value**: paste the same secret you put in `.env`
4. Save → click **Send Test Event** → expect HTTP 200

---

## 4. Update the User model

Add these optional fields to the User Pydantic model on the web backend (mongo will accept them as-is, but the model should advertise them):

```python
is_pro: bool = False
pro_since: Optional[datetime] = None
pro_product_id: Optional[str] = None
pro_source: Optional[str] = None  # "revenuecat" | "manual"
```

---

## 5. Expose `is_pro` on `/api/auth/me`

The mobile app reads `user.is_pro` from `/api/auth/me`. Make sure the response includes it (already will if added to the User model).

---

That's it — Pro state then syncs across all devices automatically.
