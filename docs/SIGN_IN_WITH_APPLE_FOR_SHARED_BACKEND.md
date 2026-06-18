# Sign in with Apple — Drop-In for Shared Lancely Backend

The mobile app now sends Apple identity tokens to `POST /api/auth/apple`. The web backend must verify the token with Apple and return a Lancely JWT.

---

## 1. Add env vars to web backend `.env`
```
APPLE_BUNDLE_ID=com.lancely.app
```

## 2. Install dependency
```bash
pip install pyjwt[crypto] httpx
pip freeze > requirements.txt
```

## 3. Add endpoint to `server.py`
```python
import httpx, jwt as pyjwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid, os
from datetime import datetime, timezone

APPLE_BUNDLE_ID = os.environ.get("APPLE_BUNDLE_ID", "com.lancely.app")
APPLE_JWKS_URL  = "https://appleid.apple.com/auth/keys"

class AppleSignInBody(BaseModel):
    identity_token: str
    authorization_code: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    apple_user: Optional[str] = None

@api_router.post("/auth/apple")
async def apple_sign_in(body: AppleSignInBody):
    # 1) Fetch Apple JWKS and verify the identity_token
    async with httpx.AsyncClient(timeout=10.0) as client:
        jwks = (await client.get(APPLE_JWKS_URL)).json()
    try:
        kid = pyjwt.get_unverified_header(body.identity_token)["kid"]
        key = next(k for k in jwks["keys"] if k["kid"] == kid)
        public_key = pyjwt.PyJWK(key).key
        claims = pyjwt.decode(
            body.identity_token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_BUNDLE_ID,
            issuer="https://appleid.apple.com",
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"invalid Apple token: {e}")

    apple_sub = claims["sub"]                # stable Apple user id
    email = claims.get("email") or body.email or f"apple_{apple_sub[:10]}@privaterelay.appleid.com"

    # 2) Find or create user (upsert by apple_sub OR email)
    existing = await db.users.find_one({"$or": [{"apple_sub": apple_sub}, {"email": email}]})
    now = datetime.now(timezone.utc)
    if existing:
        user_id = existing["id"]
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"apple_sub": apple_sub, "updated_at": now}},
        )
    else:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "name": body.full_name or "Apple User",
            "business_name": "",
            "apple_sub": apple_sub,
            "auth_provider": "apple",
            "currency": "AED",
            "theme": "dark",
            "created_at": now,
        })

    # 3) Issue Lancely JWT (same shape your /auth/login returns)
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    token = create_access_token(user_id)  # reuse your existing helper
    return {"token": token, "user": user_doc}
```

## 4. Apple Developer Console
- Identifiers → your App ID (`com.lancely.app`) → **enable "Sign In with Apple"** capability → Save
- No additional service ID needed for native-only iOS apps

## 5. App.json (mobile — already set up)
The `expo-apple-authentication` plugin auto-adds the entitlement on next native build.

## Testing
On a real iPhone (won't work in Expo Go):
1. Tap "Sign in with Apple" on login screen
2. Native Apple sheet appears → Continue
3. App receives token → POSTs to `/auth/apple` → backend verifies → returns JWT
4. User signed in ✅
