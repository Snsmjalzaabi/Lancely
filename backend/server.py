"""Lancely mobile — full backend.

Self-contained FastAPI + MongoDB backend powering the Lancely Expo app.
All routes are mounted under /api so that the platform ingress proxies them
correctly. Auth is JWT (Bearer); persistence is MongoDB via Motor.
"""
from __future__ import annotations

import csv
import io
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, List, Dict

import bcrypt
import httpx
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import (
    Body,
    Depends,
    FastAPI,
    HTTPException,
    Header,
    Query,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "lancely")
JWT_SECRET = os.environ.get("JWT_SECRET", "lancely-dev-secret")
JWT_ALGO = os.environ.get("JWT_ALGO", "HS256")
JWT_TTL_DAYS = int(os.environ.get("JWT_TTL_DAYS", "30"))
APPLE_BUNDLE_ID = os.environ.get("APPLE_BUNDLE_ID", "com.lancely.app")
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

DEMO_EMAIL = "demo@lancely.app"
DEMO_PASSWORD = "lancely-demo-fixed-pw"
REVIEW_EMAIL = "review@lancely.com"
REVIEW_PASSWORD = "Review123!"

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Lancely mobile backend", version="1.0.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def clean(doc: Optional[dict], *, drop: List[str] | None = None) -> Optional[dict]:
    """Strip Mongo _id and any internal fields before returning to the client."""
    if not doc:
        return None
    out: Dict[str, Any] = {}
    drop_set = set(drop or [])
    drop_set.add("_id")
    for k, v in doc.items():
        if k in drop_set:
            continue
        if isinstance(v, datetime):
            out[k] = iso(v)
        else:
            out[k] = v
    return out


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return str(payload.get("sub")) if payload.get("sub") else None
    except Exception:
        return None


async def current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    doc = await db.users.find_one({"id": user_id})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return doc


def public_user(doc: dict) -> dict:
    return clean(doc, drop=["password_hash"]) or {}


# ---------------------------------------------------------------------------
# Models (request bodies only — responses are plain dicts)
# ---------------------------------------------------------------------------
class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    business_name: Optional[str] = ""


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class AppleSignInBody(BaseModel):
    identity_token: str
    authorization_code: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    apple_user: Optional[str] = None


class UpdateMeBody(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    currency: Optional[str] = None
    theme: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    trn: Optional[str] = None


class ClientBody(BaseModel):
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    trn: Optional[str] = None
    notes: Optional[str] = None


class ProjectBody(BaseModel):
    name: str
    client_id: Optional[str] = None
    status: Optional[str] = "active"
    deadline: Optional[str] = None
    value: Optional[float] = 0
    notes: Optional[str] = None


class ProjectStatusBody(BaseModel):
    status: str


class LineItemBody(BaseModel):
    description: str = ""
    quantity: float = 1
    rate: float = 0


class QuotationBody(BaseModel):
    client_id: str
    title: Optional[str] = None
    issue_date: Optional[str] = None
    valid_until: Optional[str] = None
    notes: Optional[str] = None
    items: List[LineItemBody] = []
    status: Optional[str] = "draft"
    vat: Optional[float] = 0


class InvoiceBody(BaseModel):
    client_id: str
    project_id: Optional[str] = None
    title: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[LineItemBody] = []
    status: Optional[str] = "unpaid"
    vat: Optional[float] = 0


class InvoiceStatusBody(BaseModel):
    status: str
    payment_date: Optional[str] = None


class PaymentBody(BaseModel):
    amount: float
    method: Optional[str] = None
    payment_date: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Compute helpers (totals / status)
# ---------------------------------------------------------------------------
def compute_items_totals(items: List[dict], vat: float = 0.0) -> tuple[float, float, float]:
    subtotal = sum(float(it.get("quantity", 1)) * float(it.get("rate", 0)) for it in items)
    vat_amount = round(subtotal * (float(vat or 0.0) / 100.0), 2)
    total = round(subtotal + vat_amount, 2)
    return round(subtotal, 2), vat_amount, total


def derive_invoice_status(inv: dict) -> str:
    total = float(inv.get("total") or 0)
    paid = float(inv.get("paid_amount") or 0)
    if paid >= total and total > 0:
        return "paid"
    due_str = inv.get("due_date")
    if due_str:
        try:
            due = datetime.fromisoformat(str(due_str).replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due < now_utc():
                return "overdue"
        except Exception:
            pass
    return "unpaid"


async def next_number(user_id: str, prefix: str, kind: str) -> str:
    """Allocate sequential numbers per user, per kind. Stored in `counters`."""
    key = f"{user_id}:{kind}"
    doc = await db.counters.find_one_and_update(
        {"key": key},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    n = (doc or {}).get("value", 1)
    if kind == "invoice":
        return f"INV-{1000 + int(n)}"
    if kind == "quotation":
        ym = now_utc().strftime("%Y%m")
        return f"{prefix}-{ym}-{int(n):03d}"
    return f"{prefix}-{int(n):03d}"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    try:
        await db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "app": "lancely-mobile-backend",
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.3",
        "db": db_ok,
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def _normalize_email(e: str) -> str:
    return (e or "").strip().lower()


async def _create_user(*, email: str, password: Optional[str], name: str,
                       business_name: str = "", auth_provider: str = "password",
                       apple_sub: Optional[str] = None) -> dict:
    user_id = str(uuid.uuid4())
    now = now_utc()
    doc = {
        "id": user_id,
        "email": email,
        "name": name,
        "business_name": business_name or "",
        "currency": "AED",
        "theme": "dark",
        "auth_provider": auth_provider,
        "created_at": now,
    }
    if password:
        doc["password_hash"] = hash_pw(password)
    if apple_sub:
        doc["apple_sub"] = apple_sub
    await db.users.insert_one(doc)
    return doc


@app.post("/api/auth/register")
async def register(body: RegisterBody):
    email = _normalize_email(body.email)
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = await _create_user(
        email=email,
        password=body.password,
        name=body.name.strip() or email.split("@")[0],
        business_name=(body.business_name or "").strip(),
    )
    return {"token": make_token(user["id"]), "user": public_user(user)}


@app.post("/api/auth/login")
async def login(body: LoginBody):
    email = _normalize_email(body.email)
    doc = await db.users.find_one({"email": email})
    if not doc or not doc.get("password_hash") or not verify_pw(body.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"token": make_token(doc["id"]), "user": public_user(doc)}


@app.post("/api/auth/demo-session")
async def demo_session():
    """Auto-login to the shared demo account. Reseeds if data has been wiped.

    Always returns a valid Lancely JWT for the shared demo user.
    """
    demo = await db.users.find_one({"email": DEMO_EMAIL})
    if not demo:
        demo = await _create_user(
            email=DEMO_EMAIL,
            password=DEMO_PASSWORD,
            name="Demo Freelancer",
            business_name="Lancely Demo Studio",
            auth_provider="demo",
        )
        await seed_user_data(demo["id"], profile="demo")
    else:
        # Ensure demo data exists; if empty, reseed.
        client_count = await db.clients.count_documents({"user_id": demo["id"]})
        if client_count == 0:
            await seed_user_data(demo["id"], profile="demo")
    return {"token": make_token(demo["id"]), "user": public_user(demo)}


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(current_user)):
    return public_user(user)


@app.put("/api/auth/me")
async def update_me(body: UpdateMeBody, user: dict = Depends(current_user)):
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if patch:
        patch["updated_at"] = now_utc()
        await db.users.update_one({"id": user["id"]}, {"$set": patch})
    fresh = await db.users.find_one({"id": user["id"]})
    return public_user(fresh or user)


@app.delete("/api/auth/me", status_code=204)
async def delete_me(user: dict = Depends(current_user)):
    uid = user["id"]
    # Hard-delete all owned data so we honor Apple's account-deletion requirement.
    for coll in ("clients", "projects", "quotations", "invoices", "counters"):
        await db[coll].delete_many({"user_id": uid} if coll != "counters" else {"key": {"$regex": f"^{uid}:"}})
    await db.users.delete_one({"id": uid})
    return Response(status_code=204)


# ---- Sign in with Apple ----
async def _fetch_apple_jwks() -> dict:
    async with httpx.AsyncClient(timeout=8.0) as cli:
        r = await cli.get(APPLE_JWKS_URL)
        r.raise_for_status()
        return r.json()


def _decode_apple_token(identity_token: str, jwks: dict) -> dict:
    try:
        header = pyjwt.get_unverified_header(identity_token)
        kid = header.get("kid")
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(status_code=401, detail="Apple key not found")
        public_key = pyjwt.PyJWK(key).key
        return pyjwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_BUNDLE_ID,
            issuer="https://appleid.apple.com",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Apple token: {e}")


@app.post("/api/auth/apple")
async def apple_sign_in(body: AppleSignInBody):
    if not body.identity_token:
        raise HTTPException(status_code=400, detail="identity_token required")
    try:
        jwks = await _fetch_apple_jwks()
    except Exception:
        raise HTTPException(status_code=503, detail="Could not reach Apple to verify token.")
    claims = _decode_apple_token(body.identity_token, jwks)
    apple_sub = claims.get("sub")
    email = (claims.get("email") or body.email
             or f"apple_{(apple_sub or '')[:10]}@privaterelay.appleid.com").lower()
    existing = await db.users.find_one({"$or": [{"apple_sub": apple_sub}, {"email": email}]})
    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"apple_sub": apple_sub, "updated_at": now_utc()}},
        )
        user_doc = await db.users.find_one({"id": existing["id"]})
    else:
        user_doc = await _create_user(
            email=email,
            password=None,
            name=body.full_name or email.split("@")[0],
            auth_provider="apple",
            apple_sub=apple_sub,
        )
    return {"token": make_token(user_doc["id"]), "user": public_user(user_doc)}


# ---------------------------------------------------------------------------
# Currencies
# ---------------------------------------------------------------------------
CURRENCIES = [
    {"code": "AED", "symbol": "د.إ", "name": "UAE Dirham", "locale": "en-AE"},
    {"code": "USD", "symbol": "$", "name": "US Dollar", "locale": "en-US"},
    {"code": "EUR", "symbol": "€", "name": "Euro", "locale": "de-DE"},
    {"code": "GBP", "symbol": "£", "name": "British Pound", "locale": "en-GB"},
    {"code": "SAR", "symbol": "﷼", "name": "Saudi Riyal", "locale": "ar-SA"},
    {"code": "INR", "symbol": "₹", "name": "Indian Rupee", "locale": "en-IN"},
    {"code": "CAD", "symbol": "$", "name": "Canadian Dollar", "locale": "en-CA"},
    {"code": "AUD", "symbol": "$", "name": "Australian Dollar", "locale": "en-AU"},
]


@app.get("/api/currencies")
async def get_currencies():
    return CURRENCIES


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
@app.get("/api/clients")
async def list_clients(user: dict = Depends(current_user)):
    rows = await db.clients.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=500)
    return [clean(r) for r in rows]


@app.post("/api/clients")
async def create_client(body: ClientBody, user: dict = Depends(current_user)):
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": now_utc(),
    })
    await db.clients.insert_one(doc)
    return clean(doc)


@app.get("/api/clients/{client_id}")
async def get_client(client_id: str, user: dict = Depends(current_user)):
    doc = await db.clients.find_one({"id": client_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return clean(doc)


@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, body: ClientBody, user: dict = Depends(current_user)):
    patch = body.model_dump(exclude_unset=True)
    patch["updated_at"] = now_utc()
    res = await db.clients.update_one({"id": client_id, "user_id": user["id"]}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    doc = await db.clients.find_one({"id": client_id, "user_id": user["id"]})
    return clean(doc)


@app.delete("/api/clients/{client_id}", status_code=204)
async def delete_client(client_id: str, user: dict = Depends(current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
@app.get("/api/projects")
async def list_projects(user: dict = Depends(current_user)):
    rows = await db.projects.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=500)
    return [clean(r) for r in rows]


@app.post("/api/projects")
async def create_project(body: ProjectBody, user: dict = Depends(current_user)):
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "value": float(doc.get("value") or 0),
        "status": doc.get("status") or "active",
        "created_at": now_utc(),
    })
    await db.projects.insert_one(doc)
    return clean(doc)


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(current_user)):
    doc = await db.projects.find_one({"id": project_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return clean(doc)


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, body: ProjectBody, user: dict = Depends(current_user)):
    patch = body.model_dump(exclude_unset=True)
    patch["updated_at"] = now_utc()
    res = await db.projects.update_one({"id": project_id, "user_id": user["id"]}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return clean(await db.projects.find_one({"id": project_id, "user_id": user["id"]}))


@app.patch("/api/projects/{project_id}/status")
async def set_project_status(project_id: str, body: ProjectStatusBody,
                             user: dict = Depends(current_user)):
    res = await db.projects.update_one(
        {"id": project_id, "user_id": user["id"]},
        {"$set": {"status": body.status, "updated_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return clean(await db.projects.find_one({"id": project_id, "user_id": user["id"]}))


@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, user: dict = Depends(current_user)):
    res = await db.projects.delete_one({"id": project_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Quotations
# ---------------------------------------------------------------------------
async def _build_quotation_doc(body: QuotationBody, user_id: str) -> dict:
    items = [it.model_dump() for it in body.items]
    subtotal, vat_amt, total = compute_items_totals(items, body.vat or 0)
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "number": await next_number(user_id, "Q", "quotation"),
        "client_id": body.client_id,
        "title": body.title or "",
        "issue_date": body.issue_date or now_utc().date().isoformat(),
        "valid_until": body.valid_until,
        "notes": body.notes or "",
        "items": items,
        "status": body.status or "draft",
        "subtotal": subtotal,
        "vat": vat_amt,
        "total": total,
        "currency": "AED",
        "created_at": now_utc(),
    }


@app.get("/api/quotations")
async def list_quotations(user: dict = Depends(current_user)):
    rows = await db.quotations.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=500)
    return [clean(r) for r in rows]


@app.post("/api/quotations")
async def create_quotation(body: QuotationBody, user: dict = Depends(current_user)):
    doc = await _build_quotation_doc(body, user["id"])
    await db.quotations.insert_one(doc)
    return clean(doc)


@app.get("/api/quotations/{qid}")
async def get_quotation(qid: str, user: dict = Depends(current_user)):
    doc = await db.quotations.find_one({"id": qid, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    return clean(doc)


@app.put("/api/quotations/{qid}")
async def update_quotation(qid: str, body: QuotationBody, user: dict = Depends(current_user)):
    items = [it.model_dump() for it in body.items]
    subtotal, vat_amt, total = compute_items_totals(items, body.vat or 0)
    patch = {
        "client_id": body.client_id,
        "title": body.title,
        "issue_date": body.issue_date,
        "valid_until": body.valid_until,
        "notes": body.notes,
        "items": items,
        "status": body.status,
        "subtotal": subtotal,
        "vat": vat_amt,
        "total": total,
        "updated_at": now_utc(),
    }
    patch = {k: v for k, v in patch.items() if v is not None or k in ("notes", "title")}
    res = await db.quotations.update_one({"id": qid, "user_id": user["id"]}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return clean(await db.quotations.find_one({"id": qid, "user_id": user["id"]}))


@app.patch("/api/quotes/{qid}/status")
async def quote_set_status(qid: str, status: str = Query(...), user: dict = Depends(current_user)):
    if status not in ("draft", "sent", "accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.quotations.update_one(
        {"id": qid, "user_id": user["id"]},
        {"$set": {"status": status, "updated_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return clean(await db.quotations.find_one({"id": qid, "user_id": user["id"]}))


@app.delete("/api/quotes/{qid}", status_code=204)
@app.delete("/api/quotations/{qid}", status_code=204)
async def delete_quotation(qid: str, user: dict = Depends(current_user)):
    res = await db.quotations.delete_one({"id": qid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------
async def _build_invoice_doc(body: InvoiceBody, user_id: str) -> dict:
    items = [it.model_dump() for it in body.items]
    subtotal, vat_amt, total = compute_items_totals(items, body.vat or 0)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "number": await next_number(user_id, "INV", "invoice"),
        "client_id": body.client_id,
        "project_id": body.project_id,
        "title": body.title or "",
        "issue_date": body.issue_date or now_utc().date().isoformat(),
        "due_date": body.due_date,
        "notes": body.notes or "",
        "items": items,
        "status": body.status or "unpaid",
        "subtotal": subtotal,
        "vat": vat_amt,
        "total": total,
        "paid_amount": 0.0,
        "payment_date": None,
        "payments": [],
        "currency": "AED",
        "created_at": now_utc(),
    }
    doc["status"] = derive_invoice_status(doc)
    return doc


@app.get("/api/invoices")
async def list_invoices(user: dict = Depends(current_user)):
    rows = await db.invoices.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=500)
    out = []
    for r in rows:
        r["status"] = derive_invoice_status(r)
        out.append(clean(r))
    return out


@app.post("/api/invoices")
async def create_invoice(body: InvoiceBody, user: dict = Depends(current_user)):
    doc = await _build_invoice_doc(body, user["id"])
    await db.invoices.insert_one(doc)
    return clean(doc)


@app.get("/api/invoices/{inv_id}")
async def get_invoice(inv_id: str, user: dict = Depends(current_user)):
    doc = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    doc["status"] = derive_invoice_status(doc)
    return clean(doc)


@app.put("/api/invoices/{inv_id}")
async def update_invoice(inv_id: str, body: InvoiceBody, user: dict = Depends(current_user)):
    items = [it.model_dump() for it in body.items]
    subtotal, vat_amt, total = compute_items_totals(items, body.vat or 0)
    patch = {
        "client_id": body.client_id,
        "project_id": body.project_id,
        "title": body.title,
        "issue_date": body.issue_date,
        "due_date": body.due_date,
        "notes": body.notes,
        "items": items,
        "subtotal": subtotal,
        "vat": vat_amt,
        "total": total,
        "updated_at": now_utc(),
    }
    res = await db.invoices.update_one({"id": inv_id, "user_id": user["id"]}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    fresh = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    fresh["status"] = derive_invoice_status(fresh)
    await db.invoices.update_one({"id": inv_id}, {"$set": {"status": fresh["status"]}})
    return clean(fresh)


@app.patch("/api/invoices/{inv_id}/status")
async def invoice_set_status(inv_id: str, body: InvoiceStatusBody, user: dict = Depends(current_user)):
    if body.status not in ("paid", "unpaid", "overdue"):
        raise HTTPException(status_code=400, detail="Invalid status")
    doc = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    patch: dict[str, Any] = {"status": body.status, "updated_at": now_utc()}
    if body.status == "paid":
        patch["paid_amount"] = float(doc.get("total") or 0)
        patch["payment_date"] = body.payment_date or now_utc().date().isoformat()
        payments = list(doc.get("payments") or [])
        remaining = float(doc.get("total") or 0) - float(doc.get("paid_amount") or 0)
        if remaining > 0:
            payments.append({
                "id": str(uuid.uuid4()),
                "amount": round(remaining, 2),
                "method": "manual",
                "payment_date": patch["payment_date"],
                "notes": "Marked paid",
            })
            patch["payments"] = payments
    elif body.status == "unpaid":
        patch["paid_amount"] = 0.0
        patch["payment_date"] = None
        patch["payments"] = []
    await db.invoices.update_one({"id": inv_id, "user_id": user["id"]}, {"$set": patch})
    fresh = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    fresh["status"] = derive_invoice_status(fresh)
    return clean(fresh)


@app.post("/api/invoices/{inv_id}/payments")
async def record_payment(inv_id: str, body: PaymentBody, user: dict = Depends(current_user)):
    doc = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment must be > 0")
    payments = list(doc.get("payments") or [])
    payments.append({
        "id": str(uuid.uuid4()),
        "amount": round(float(body.amount), 2),
        "method": body.method or "manual",
        "payment_date": body.payment_date or now_utc().date().isoformat(),
        "notes": body.notes or "",
    })
    paid_total = round(sum(float(p.get("amount") or 0) for p in payments), 2)
    total = float(doc.get("total") or 0)
    patch = {
        "payments": payments,
        "paid_amount": paid_total,
        "updated_at": now_utc(),
    }
    if paid_total >= total > 0:
        patch["status"] = "paid"
        patch["payment_date"] = body.payment_date or now_utc().date().isoformat()
    await db.invoices.update_one({"id": inv_id, "user_id": user["id"]}, {"$set": patch})
    fresh = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]})
    fresh["status"] = derive_invoice_status(fresh)
    return clean(fresh)


@app.delete("/api/invoices/{inv_id}", status_code=204)
async def delete_invoice(inv_id: str, user: dict = Depends(current_user)):
    res = await db.invoices.delete_one({"id": inv_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Dashboard / Analytics
# ---------------------------------------------------------------------------
@app.get("/api/analytics/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    uid = user["id"]
    invoices = await db.invoices.find({"user_id": uid}).to_list(length=1000)
    for r in invoices:
        r["status"] = derive_invoice_status(r)
    clients_n = await db.clients.count_documents({"user_id": uid})
    active_projects = await db.projects.count_documents({"user_id": uid, "status": {"$in": ["active"]}})

    unpaid = [i for i in invoices if i.get("status") in ("unpaid", "overdue")]
    overdue = [i for i in invoices if i.get("status") == "overdue"]
    paid_amount = sum(float(i.get("paid_amount") or 0) for i in invoices)
    unpaid_amount = sum(max(float(i.get("total") or 0) - float(i.get("paid_amount") or 0), 0) for i in unpaid)
    overdue_amount = sum(max(float(i.get("total") or 0) - float(i.get("paid_amount") or 0), 0) for i in overdue)

    # Monthly earnings — last 6 months
    now = now_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months: List[dict] = []
    for i in range(5, -1, -1):
        m = (now - timedelta(days=30 * i)).replace(day=1)
        label = m.strftime("%b")
        earned = 0.0
        for inv in invoices:
            for p in inv.get("payments") or []:
                try:
                    pd = datetime.fromisoformat(str(p.get("payment_date")))
                except Exception:
                    continue
                if pd.year == m.year and pd.month == m.month:
                    earned += float(p.get("amount") or 0)
        months.append({"month": label, "label": label, "earnings": round(earned, 2), "amount": round(earned, 2)})

    recent = sorted(invoices, key=lambda x: x.get("created_at") or now_utc(), reverse=True)[:8]
    return {
        "total_clients": clients_n,
        "active_projects": active_projects,
        "unpaid_count": len(unpaid),
        "unpaid_amount": round(unpaid_amount, 2),
        "overdue_count": len(overdue),
        "overdue_amount": round(overdue_amount, 2),
        "total_revenue": round(paid_amount, 2),
        "monthly_earnings": months,
        "recent_invoices": [clean(i) for i in recent],
    }


@app.get("/api/reports/pl")
async def reports_pl(date_from: Optional[str] = None, date_to: Optional[str] = None,
                     user: dict = Depends(current_user)):
    invoices = await db.invoices.find({"user_id": user["id"]}).to_list(length=2000)
    # Build last 6 month series of paid income.
    now = now_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    series = []
    total_income = 0.0
    for i in range(5, -1, -1):
        m = (now - timedelta(days=30 * i)).replace(day=1)
        label = m.strftime("%b %Y")
        income = 0.0
        for inv in invoices:
            for p in inv.get("payments") or []:
                try:
                    pd = datetime.fromisoformat(str(p.get("payment_date")))
                except Exception:
                    continue
                if pd.year == m.year and pd.month == m.month:
                    income += float(p.get("amount") or 0)
        total_income += income
        series.append({"month": label, "income": round(income, 2), "expense": 0.0, "net": round(income, 2)})
    return {
        "income": round(total_income, 2),
        "expense": 0.0,
        "net": round(total_income, 2),
        "series": series,
    }


# ---------------------------------------------------------------------------
# Notifications / reminders
# ---------------------------------------------------------------------------
@app.get("/api/payments/reminders")
async def reminders(user: dict = Depends(current_user)):
    uid = user["id"]
    invoices = await db.invoices.find({"user_id": uid}).to_list(length=500)
    quotes = await db.quotations.find({"user_id": uid}).to_list(length=500)
    projects = await db.projects.find({"user_id": uid}).to_list(length=500)

    items: List[dict] = []
    now = now_utc()

    for inv in invoices:
        inv_status = derive_invoice_status(inv)
        if inv_status == "overdue":
            items.append({
                "id": f"inv-overdue-{inv['id']}",
                "type": "invoice_overdue",
                "title": f"{inv.get('number') or 'Invoice'} is overdue",
                "subtitle": f"Total AED {float(inv.get('total') or 0):.2f}",
                "ref_id": inv["id"],
                "created_at": iso(now),
            })
        elif inv.get("due_date"):
            try:
                due = datetime.fromisoformat(str(inv["due_date"]))
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                delta = (due - now).days
                if 0 <= delta <= 3 and inv_status == "unpaid":
                    items.append({
                        "id": f"inv-due-{inv['id']}",
                        "type": "invoice_due_soon",
                        "title": f"{inv.get('number') or 'Invoice'} due in {delta}d",
                        "subtitle": f"Total AED {float(inv.get('total') or 0):.2f}",
                        "ref_id": inv["id"],
                        "created_at": iso(now),
                    })
            except Exception:
                pass

    for p in projects:
        if not p.get("deadline"):
            continue
        try:
            due = datetime.fromisoformat(str(p["deadline"]))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            delta = (due - now).days
            if 0 <= delta <= 3 and p.get("status") == "active":
                items.append({
                    "id": f"proj-due-{p['id']}",
                    "type": "project_due_soon",
                    "title": f"{p.get('name')} due in {delta}d",
                    "subtitle": "Keep momentum!",
                    "ref_id": p["id"],
                    "created_at": iso(now),
                })
        except Exception:
            pass

    for q in quotes:
        if q.get("status") == "sent":
            created = q.get("created_at")
            if isinstance(created, datetime):
                age_days = (now - created.replace(tzinfo=created.tzinfo or timezone.utc)).days
                if age_days >= 7:
                    items.append({
                        "id": f"quote-await-{q['id']}",
                        "type": "quote_awaiting",
                        "title": f"{q.get('number') or 'Quote'} awaiting response",
                        "subtitle": f"Sent {age_days}d ago",
                        "ref_id": q["id"],
                        "created_at": iso(now),
                    })

    return {"items": items, "rows": items}


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------
def _csv_response(filename: str, headers: List[str], rows: List[List[Any]]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        w.writerow(r)
    data = buf.getvalue().encode("utf-8")
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/invoices.csv")
async def export_invoices(user: dict = Depends(current_user),
                          date_from: Optional[str] = None,
                          date_to: Optional[str] = None,
                          status: Optional[str] = None):
    invoices = await db.invoices.find({"user_id": user["id"]}).to_list(length=2000)
    rows = []
    for inv in invoices:
        inv["status"] = derive_invoice_status(inv)
        if status and inv["status"] not in [s.strip() for s in status.split(",") if s.strip()]:
            continue
        rows.append([
            inv.get("number"),
            inv.get("issue_date"),
            inv.get("due_date"),
            inv.get("status"),
            inv.get("total"),
            inv.get("paid_amount"),
            inv.get("client_id"),
        ])
    return _csv_response("lancely-invoices.csv",
                         ["Number", "Issue Date", "Due Date", "Status", "Total", "Paid", "Client ID"],
                         rows)


@app.get("/api/export/clients.csv")
async def export_clients(user: dict = Depends(current_user)):
    rows = await db.clients.find({"user_id": user["id"]}).to_list(length=2000)
    return _csv_response("lancely-clients.csv",
                         ["Name", "Company", "Email", "Phone", "Address", "TRN"],
                         [[c.get("name"), c.get("company"), c.get("email"),
                           c.get("phone"), c.get("address"), c.get("trn")] for c in rows])


@app.get("/api/export/payments.csv")
async def export_payments(user: dict = Depends(current_user)):
    invoices = await db.invoices.find({"user_id": user["id"]}).to_list(length=2000)
    rows = []
    for inv in invoices:
        for p in inv.get("payments") or []:
            rows.append([
                inv.get("number"),
                p.get("payment_date"),
                p.get("amount"),
                p.get("method"),
                p.get("notes"),
            ])
    return _csv_response("lancely-payments.csv",
                         ["Invoice", "Date", "Amount", "Method", "Notes"], rows)


# ---------------------------------------------------------------------------
# RevenueCat webhook (no-op store, public)
# ---------------------------------------------------------------------------
@app.post("/api/webhooks/revenuecat")
async def revenuecat_webhook(payload: dict = Body(default={})):
    try:
        await db.revenuecat_events.insert_one({
            "id": str(uuid.uuid4()),
            "received_at": now_utc(),
            "payload": payload,
        })
    except Exception:
        pass
    return {"received": True}


# ---------------------------------------------------------------------------
# Seeding (demo + review)
# ---------------------------------------------------------------------------
SAMPLE_CLIENTS = [
    {"name": "Layla Hassan", "company": "Falcon Logistics LLC", "email": "layla@falconlogistics.ae", "phone": "+971 50 123 4567", "address": "Marina Plaza, Dubai", "trn": "100123456789003"},
    {"name": "Omar Rashid", "company": "Rashid Architecture", "email": "omar@rashidarch.com", "phone": "+971 55 987 6543", "address": "Sheikh Zayed Rd, Dubai"},
    {"name": "Sara Al Marzooqi", "company": "Marzooqi Boutique", "email": "sara@marzooqi.ae", "phone": "+971 52 555 1212"},
    {"name": "Yusuf Ibrahim", "company": "Ibrahim Tech FZE", "email": "yusuf@ibrahimtech.io", "phone": "+971 50 999 1111"},
    {"name": "Aisha Khan", "company": "Saffron Restaurants", "email": "aisha@saffrongroup.ae", "phone": "+971 56 444 2200"},
    {"name": "Khalid Nasser", "company": "Nasser Trading", "email": "khalid@nassertrade.ae", "phone": "+971 50 222 3344"},
    {"name": "Mira Joseph", "company": "Joseph Creative Studio", "email": "mira@josephstudio.com", "phone": "+971 54 110 8800"},
    {"name": "Hamad Al Suwaidi", "company": "Suwaidi Real Estate", "email": "hamad@suwaidire.ae", "phone": "+971 50 700 8800"},
    {"name": "Noor Abdullah", "company": "Noor Wellness Spa", "email": "noor@noorwellness.com", "phone": "+971 55 660 7700"},
    {"name": "Daniel Schmidt", "company": "Schmidt Consulting", "email": "daniel@schmidt-co.de", "phone": "+49 30 12345678"},
]

PROJECT_TEMPLATES = [
    {"name": "Website Redesign", "value": 12000, "status": "active", "days": 14},
    {"name": "Logo & Brand Pack", "value": 4800, "status": "active", "days": 7},
    {"name": "Mobile App MVP", "value": 35000, "status": "active", "days": 30},
    {"name": "Annual Maintenance", "value": 9600, "status": "active", "days": 60},
    {"name": "Marketing Landing Page", "value": 5200, "status": "completed", "days": -10},
    {"name": "E-commerce Integration", "value": 18000, "status": "active", "days": 21},
    {"name": "SEO Audit + Report", "value": 2800, "status": "on_hold", "days": 14},
    {"name": "Photography Day", "value": 3400, "status": "completed", "days": -20},
]

INVOICE_ITEMS = [
    [("Discovery & wireframes", 1, 1500), ("Design system", 1, 2200)],
    [("Mobile app sprint", 2, 4500)],
    [("Logo concepts", 1, 1800), ("Brand guidelines PDF", 1, 1200)],
    [("Maintenance retainer (Q3)", 1, 2400)],
    [("Marketing landing build", 1, 2600), ("Copywriting", 1, 600)],
    [("E-commerce integration", 1, 6800)],
    [("Consulting hours", 6, 350)],
    [("Photography day", 1, 3400)],
    [("API development", 1, 5400), ("QA & deploy", 1, 900)],
    [("Monthly retainer", 1, 1800)],
    [("Strategy session", 2, 750)],
    [("Custom dashboard", 1, 4200)],
    [("Brand refresh", 1, 2600)],
    [("Setup + onboarding", 1, 1100)],
    [("Performance audit", 1, 1900)],
]


async def seed_user_data(user_id: str, *, profile: str = "demo"):
    """Idempotent: only seeds if user has no clients yet."""
    if await db.clients.count_documents({"user_id": user_id}) > 0:
        return
    now = now_utc()

    # Clients (10)
    sample_clients = SAMPLE_CLIENTS[: 10 if profile == "review" else 6]
    client_ids: List[str] = []
    for i, c in enumerate(sample_clients):
        cid = str(uuid.uuid4())
        client_ids.append(cid)
        await db.clients.insert_one({
            "id": cid,
            "user_id": user_id,
            "name": c["name"],
            "company": c.get("company"),
            "email": c.get("email"),
            "phone": c.get("phone"),
            "address": c.get("address"),
            "trn": c.get("trn"),
            "notes": "Imported from review seed" if profile == "review" else "Demo data",
            "created_at": now - timedelta(days=30 + i),
        })

    # Projects (8 for review, 4 for demo)
    project_count = 8 if profile == "review" else 4
    for i in range(project_count):
        t = PROJECT_TEMPLATES[i % len(PROJECT_TEMPLATES)]
        await db.projects.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": t["name"],
            "client_id": client_ids[i % len(client_ids)],
            "status": t["status"],
            "deadline": (now + timedelta(days=t["days"])).date().isoformat(),
            "value": float(t["value"]),
            "notes": "",
            "created_at": now - timedelta(days=20 - i),
        })

    # Quotations (3)
    for i in range(3):
        items = INVOICE_ITEMS[i]
        items_doc = [{"description": d, "quantity": q, "rate": r} for (d, q, r) in items]
        subtotal, vat_amt, total = compute_items_totals(items_doc, 5.0)
        ym = now.strftime("%Y%m")
        await db.quotations.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "number": f"Q-{ym}-{i+1:03d}",
            "client_id": client_ids[i % len(client_ids)],
            "title": f"Proposal #{i+1}",
            "issue_date": (now - timedelta(days=3 * i)).date().isoformat(),
            "valid_until": (now + timedelta(days=30)).date().isoformat(),
            "notes": "",
            "items": items_doc,
            "status": ["sent", "accepted", "draft"][i],
            "subtotal": subtotal, "vat": vat_amt, "total": total,
            "currency": "AED",
            "created_at": now - timedelta(days=10 + i),
        })

    # Invoices (15 for review, 6 for demo)
    inv_count = 15 if profile == "review" else 6
    counter = 0
    for i in range(inv_count):
        items = INVOICE_ITEMS[i % len(INVOICE_ITEMS)]
        items_doc = [{"description": d, "quantity": q, "rate": r} for (d, q, r) in items]
        subtotal, vat_amt, total = compute_items_totals(items_doc, 5.0)
        # Mix of statuses: 5 paid, 5 unpaid, 3 overdue, 2 partial (for review profile)
        bucket = i % 5
        issue = now - timedelta(days=15 + i * 3)
        due = issue + timedelta(days=14)
        paid_amount = 0.0
        payments: List[dict] = []
        if bucket == 0:  # paid
            paid_amount = total
            payments = [{
                "id": str(uuid.uuid4()),
                "amount": total,
                "method": "bank_transfer",
                "payment_date": (issue + timedelta(days=7)).date().isoformat(),
                "notes": "Paid in full",
            }]
        elif bucket == 1:  # paid recent
            paid_amount = total
            payments = [{
                "id": str(uuid.uuid4()),
                "amount": total,
                "method": "card",
                "payment_date": (now - timedelta(days=2)).date().isoformat(),
                "notes": "",
            }]
        elif bucket == 2:  # overdue
            due = now - timedelta(days=5 + i)
        elif bucket == 3:  # partial
            paid_amount = round(total / 2, 2)
            payments = [{
                "id": str(uuid.uuid4()),
                "amount": paid_amount,
                "method": "bank_transfer",
                "payment_date": (issue + timedelta(days=3)).date().isoformat(),
                "notes": "Deposit",
            }]
        # bucket == 4 → unpaid (no payments)

        counter += 1
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "number": f"INV-{1000 + counter}",
            "client_id": client_ids[i % len(client_ids)],
            "project_id": None,
            "title": "",
            "issue_date": issue.date().isoformat(),
            "due_date": due.date().isoformat(),
            "notes": "",
            "items": items_doc,
            "subtotal": subtotal, "vat": vat_amt, "total": total,
            "paid_amount": paid_amount,
            "payment_date": payments[0]["payment_date"] if payments else None,
            "payments": payments,
            "currency": "AED",
            "created_at": issue,
            "status": "unpaid",
        }
        doc["status"] = derive_invoice_status(doc)
        await db.invoices.insert_one(doc)

    # Seed the counter so future invoice numbers continue from here.
    await db.counters.update_one(
        {"key": f"{user_id}:invoice"},
        {"$set": {"value": counter}},
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Startup: ensure indexes + seed review + demo accounts
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    # Useful indexes
    try:
        await db.users.create_index("email", unique=True)
    except Exception:
        pass
    for coll in ("clients", "projects", "quotations", "invoices"):
        try:
            await db[coll].create_index([("user_id", 1), ("created_at", -1)])
        except Exception:
            pass

    # Seed REVIEW account for App Store reviewers.
    review = await db.users.find_one({"email": REVIEW_EMAIL})
    if not review:
        review = await _create_user(
            email=REVIEW_EMAIL,
            password=REVIEW_PASSWORD,
            name="App Reviewer",
            business_name="Lancely Review Studio",
            auth_provider="password",
        )
    await seed_user_data(review["id"], profile="review")

    # Seed DEMO account used by "Try with demo data".
    demo = await db.users.find_one({"email": DEMO_EMAIL})
    if not demo:
        demo = await _create_user(
            email=DEMO_EMAIL,
            password=DEMO_PASSWORD,
            name="Demo Freelancer",
            business_name="Lancely Demo Studio",
            auth_provider="demo",
        )
    await seed_user_data(demo["id"], profile="demo")


@app.get("/api/")
async def api_root():
    return {"app": "lancely-mobile-backend", "version": "1.0.3"}
