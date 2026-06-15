from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from fastapi.responses import FileResponse, HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lancely")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ------------------------- Helpers -------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = ensure_aware(session.get("expires_at"))
    if expires_at and expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ------------------------- Models -------------------------

class SessionExchangeIn(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_pro: bool = False


class SessionOut(BaseModel):
    user: UserOut
    session_token: str
    expires_at: datetime


# Clients
class ClientIn(BaseModel):
    name: str
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    notes: Optional[str] = ""


class ClientOut(ClientIn):
    id: str
    created_at: datetime


# Quotes
class QuoteLineItem(BaseModel):
    service: str
    description: Optional[str] = ""
    price: float


class QuoteIn(BaseModel):
    client_id: str
    title: Optional[str] = ""
    items: List[QuoteLineItem] = []
    notes: Optional[str] = ""


class QuoteOut(BaseModel):
    id: str
    quote_number: str
    client_id: str
    title: str
    items: List[QuoteLineItem]
    notes: str
    amount: float
    status: Literal["draft", "sent", "accepted", "rejected"]
    created_at: datetime


# Projects
ProjectStatus = Literal["lead", "proposal_sent", "in_progress", "review", "completed"]


class ProjectIn(BaseModel):
    name: str
    client_id: str
    value: float = 0
    status: ProjectStatus = "lead"
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = ""


class ProjectOut(ProjectIn):
    id: str
    created_at: datetime


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus


# Invoices
InvoiceStatus = Literal["pending", "paid", "partial", "overdue"]


# Settings
SUPPORTED_CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "INR", "EGP", "MAD", "SGD", "CAD"]


class UserSettings(BaseModel):
    currency: str = "AED"
    timezone: str = "device"  # "device" or IANA tz id
    accent_color: Optional[str] = None  # hex like "#A855F7"; None = follow theme
    logo_base64: Optional[str] = None  # data URI or raw base64
    business_name: Optional[str] = ""  # shown on PDFs alongside the logo
    # Persisted column choices per CSV dataset, e.g. {"invoices": ["invoice_number","amount",...]}
    report_columns: Optional[dict] = None


class InvoiceIn(BaseModel):
    client_id: str
    project_id: Optional[str] = None
    amount: float
    due_date: datetime
    notes: Optional[str] = ""


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    client_id: str
    project_id: Optional[str]
    amount: float
    paid_amount: float
    status: InvoiceStatus
    due_date: datetime
    paid_date: Optional[datetime]
    notes: str
    created_at: datetime


class InvoicePayment(BaseModel):
    amount: float


# ------------------------- Auth -------------------------

@api_router.post("/auth/session", response_model=SessionOut)
async def exchange_session(payload: SessionExchangeIn):
    async with httpx.AsyncClient(timeout=15) as h:
        r = await h.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = r.json()
    email = data["email"]
    name = data.get("name", email.split("@")[0])
    picture = data.get("picture")
    session_token = data["session_token"]

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "updated_at": now_utc()}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
        # Seed a couple of demo records for the new user to make the app feel alive
        await seed_demo_data(user_id)

    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "expires_at": expires_at,
                "created_at": now_utc(),
            }
        },
        upsert=True,
    )

    return SessionOut(
        user=UserOut(user_id=user_id, email=email, name=name, picture=picture, is_pro=bool(existing.get("is_pro", False)) if existing else False),
        session_token=session_token,
        expires_at=expires_at,
    )


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return UserOut(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        picture=user.get("picture"),
        is_pro=bool(user.get("is_pro", False)),
    )


@api_router.post("/me/upgrade", response_model=UserOut)
async def upgrade_to_pro(authorization: Optional[str] = Header(None)):
    """Mock upgrade endpoint — flips is_pro=true without real payment.
    Replace with Stripe/Razorpay when ready."""
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_pro": True, "pro_since": now_utc(), "updated_at": now_utc()}},
    )
    return UserOut(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        picture=user.get("picture"),
        is_pro=True,
    )


@api_router.post("/me/downgrade", response_model=UserOut)
async def downgrade_from_pro(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_pro": False, "updated_at": now_utc()}},
    )
    return UserOut(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        picture=user.get("picture"),
        is_pro=False,
    )


@api_router.post("/auth/demo-session", response_model=SessionOut)
async def demo_session():
    """Create a demo user + session so testers and onboarding visitors can preview the app
    without going through Google OAuth. Each call returns a fresh disposable account."""
    suffix = uuid.uuid4().hex[:6]
    email = f"demo_{suffix}@lancely.app"
    name = "Demo Freelancer"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": None,
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
    )
    await seed_demo_data(user_id)
    session_token = f"demo_{uuid.uuid4().hex}"
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": now_utc(),
        }
    )
    return SessionOut(
        user=UserOut(user_id=user_id, email=email, name=name, picture=None),
        session_token=session_token,
        expires_at=expires_at,
    )


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ------------------------- One-off Asset Downloads -------------------------

@api_router.get("/downloads/screenshots.zip")
async def download_screenshots():
    """Serve the App Store screenshots zip for one-click download."""
    p = Path("/app/screenshots/lancely_appstore_screenshots.zip")
    if not p.exists():
        raise HTTPException(status_code=404, detail="Screenshots archive not found")
    return FileResponse(
        path=str(p),
        media_type="application/zip",
        filename="lancely_appstore_screenshots.zip",
    )


@api_router.get("/legal/privacy", response_class=HTMLResponse)
async def privacy_policy():
    """Serve the Lancely privacy policy as a public HTML page (for App Store Connect)."""
    p = Path(__file__).parent / "legal" / "privacy_policy.html"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Privacy policy not found")
    return HTMLResponse(content=p.read_text(encoding="utf-8"), status_code=200)




# ------------------------- Demo Seeder -------------------------

async def seed_demo_data(user_id: str):
    """Seed a few records so a new user immediately sees a populated dashboard."""
    c1 = {
        "id": make_id("cli"),
        "user_id": user_id,
        "name": "Layla Ahmed",
        "company": "Crescent Studios",
        "email": "layla@crescent.ae",
        "phone": "+971 50 123 4567",
        "notes": "Repeat client. Prefers WhatsApp updates.",
        "created_at": now_utc(),
    }
    c2 = {
        "id": make_id("cli"),
        "user_id": user_id,
        "name": "Omar Khalid",
        "company": "Dune Logistics",
        "email": "omar@dunelog.ae",
        "phone": "+971 55 998 1234",
        "notes": "Needs monthly reports.",
        "created_at": now_utc(),
    }
    c3 = {
        "id": make_id("cli"),
        "user_id": user_id,
        "name": "Sara Mansoor",
        "company": "Mansoor & Co",
        "email": "sara@mansoor.ae",
        "phone": "+971 52 444 5566",
        "notes": "Referral from Layla.",
        "created_at": now_utc(),
    }
    await db.clients.insert_many([c1, c2, c3])

    proj = {
        "id": make_id("prj"),
        "user_id": user_id,
        "name": "Crescent Website Redesign",
        "client_id": c1["id"],
        "value": 8500,
        "status": "in_progress",
        "start_date": now_utc() - timedelta(days=10),
        "due_date": now_utc() + timedelta(days=12),
        "notes": "Phase 2 of brand revamp.",
        "created_at": now_utc(),
    }
    proj2 = {
        "id": make_id("prj"),
        "user_id": user_id,
        "name": "Dune Logistics Dashboard",
        "client_id": c2["id"],
        "value": 14000,
        "status": "proposal_sent",
        "start_date": None,
        "due_date": now_utc() + timedelta(days=30),
        "notes": "",
        "created_at": now_utc(),
    }
    await db.projects.insert_many([proj, proj2])

    quote_num = f"Q-{datetime.now().strftime('%Y%m')}-001"
    q1 = {
        "id": make_id("qte"),
        "user_id": user_id,
        "quote_number": quote_num,
        "client_id": c3["id"],
        "title": "Brand identity package",
        "items": [
            {"service": "Logo design", "description": "Primary + responsive marks", "price": 1800},
            {"service": "Brand guidelines", "description": "16-page PDF", "price": 1500},
        ],
        "notes": "Valid for 14 days.",
        "amount": 3300,
        "status": "sent",
        "created_at": now_utc(),
    }
    await db.quotes.insert_one(q1)

    inv1 = {
        "id": make_id("inv"),
        "user_id": user_id,
        "invoice_number": "INV-1001",
        "client_id": c1["id"],
        "project_id": proj["id"],
        "amount": 4250,
        "paid_amount": 4250,
        "status": "paid",
        "due_date": now_utc() - timedelta(days=5),
        "paid_date": now_utc() - timedelta(days=2),
        "notes": "Milestone 1",
        "created_at": now_utc() - timedelta(days=15),
    }
    inv2 = {
        "id": make_id("inv"),
        "user_id": user_id,
        "invoice_number": "INV-1002",
        "client_id": c1["id"],
        "project_id": proj["id"],
        "amount": 4250,
        "paid_amount": 0,
        "status": "pending",
        "due_date": now_utc() + timedelta(days=8),
        "paid_date": None,
        "notes": "Milestone 2",
        "created_at": now_utc() - timedelta(days=2),
    }
    inv3 = {
        "id": make_id("inv"),
        "user_id": user_id,
        "invoice_number": "INV-1003",
        "client_id": c2["id"],
        "project_id": None,
        "amount": 1800,
        "paid_amount": 0,
        "status": "overdue",
        "due_date": now_utc() - timedelta(days=4),
        "paid_date": None,
        "notes": "Consulting retainer",
        "created_at": now_utc() - timedelta(days=20),
    }
    await db.invoices.insert_many([inv1, inv2, inv3])


# ------------------------- Clients -------------------------

@api_router.get("/clients", response_model=List[ClientOut])
async def list_clients(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.clients.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/clients", response_model=ClientOut)
async def create_client(body: ClientIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "id": make_id("cli"),
        "user_id": user["user_id"],
        "created_at": now_utc(),
        **body.dict(),
    }
    await db.clients.insert_one(doc)
    doc.pop("user_id", None)
    doc.pop("_id", None)
    return doc


@api_router.get("/clients/{client_id}", response_model=ClientOut)
async def get_client(client_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = await db.clients.find_one({"id": client_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return doc


@api_router.put("/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, body: ClientIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.clients.update_one(
        {"id": client_id, "user_id": user["user_id"]}, {"$set": body.dict()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    doc = await db.clients.find_one({"id": client_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.clients.delete_one({"id": client_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}


# ------------------------- Projects -------------------------

@api_router.get("/projects", response_model=List[ProjectOut])
async def list_projects(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.projects.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/projects", response_model=ProjectOut)
async def create_project(body: ProjectIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "id": make_id("prj"),
        "user_id": user["user_id"],
        "created_at": now_utc(),
        **body.dict(),
    }
    await db.projects.insert_one(doc)
    doc.pop("user_id", None)
    doc.pop("_id", None)
    return doc


@api_router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = await db.projects.find_one({"id": project_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


@api_router.put("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, body: ProjectIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.projects.update_one(
        {"id": project_id, "user_id": user["user_id"]}, {"$set": body.dict()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    doc = await db.projects.find_one({"id": project_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc


@api_router.patch("/projects/{project_id}/status", response_model=ProjectOut)
async def update_project_status(project_id: str, body: ProjectStatusUpdate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.projects.update_one(
        {"id": project_id, "user_id": user["user_id"]}, {"$set": {"status": body.status}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    doc = await db.projects.find_one({"id": project_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.projects.delete_one({"id": project_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


# ------------------------- Quotes -------------------------

async def _next_quote_number(user_id: str) -> str:
    prefix = f"Q-{datetime.now().strftime('%Y%m')}-"
    count = await db.quotes.count_documents({"user_id": user_id, "quote_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:03d}"


@api_router.get("/quotes", response_model=List[QuoteOut])
async def list_quotes(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.quotes.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/quotes", response_model=QuoteOut)
async def create_quote(body: QuoteIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    amount = sum(item.price for item in body.items)
    doc = {
        "id": make_id("qte"),
        "user_id": user["user_id"],
        "quote_number": await _next_quote_number(user["user_id"]),
        "client_id": body.client_id,
        "title": body.title or "Quote",
        "items": [i.dict() for i in body.items],
        "notes": body.notes or "",
        "amount": amount,
        "status": "sent",
        "created_at": now_utc(),
    }
    await db.quotes.insert_one(doc)
    doc.pop("user_id", None)
    doc.pop("_id", None)
    return doc


@api_router.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote(quote_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = await db.quotes.find_one({"id": quote_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    return doc


@api_router.patch("/quotes/{quote_id}/status", response_model=QuoteOut)
async def set_quote_status(
    quote_id: str,
    status: Literal["draft", "sent", "accepted", "rejected"],
    authorization: Optional[str] = Header(None),
):
    user = await get_current_user(authorization)
    res = await db.quotes.update_one(
        {"id": quote_id, "user_id": user["user_id"]}, {"$set": {"status": status}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    doc = await db.quotes.find_one({"id": quote_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.quotes.delete_one({"id": quote_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}


# ------------------------- Invoices -------------------------

async def _next_invoice_number(user_id: str) -> str:
    count = await db.invoices.count_documents({"user_id": user_id})
    return f"INV-{1000 + count + 1}"


def _invoice_status(amount: float, paid: float, due: Optional[datetime]) -> InvoiceStatus:
    if paid >= amount and amount > 0:
        return "paid"
    if paid > 0:
        return "partial"
    if due and ensure_aware(due) < now_utc():
        return "overdue"
    return "pending"


@api_router.get("/invoices", response_model=List[InvoiceOut])
async def list_invoices(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.invoices.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(1000)
    # auto-mark overdue at read time
    out = []
    for it in items:
        new_status = _invoice_status(it["amount"], it.get("paid_amount", 0), it.get("due_date"))
        if new_status != it.get("status"):
            await db.invoices.update_one(
                {"id": it["id"], "user_id": user["user_id"]}, {"$set": {"status": new_status}}
            )
            it["status"] = new_status
        out.append(it)
    return out


@api_router.post("/invoices", response_model=InvoiceOut)
async def create_invoice(body: InvoiceIn, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "id": make_id("inv"),
        "user_id": user["user_id"],
        "invoice_number": await _next_invoice_number(user["user_id"]),
        "client_id": body.client_id,
        "project_id": body.project_id,
        "amount": body.amount,
        "paid_amount": 0,
        "status": _invoice_status(body.amount, 0, body.due_date),
        "due_date": body.due_date,
        "paid_date": None,
        "notes": body.notes or "",
        "created_at": now_utc(),
    }
    await db.invoices.insert_one(doc)
    doc.pop("user_id", None)
    doc.pop("_id", None)
    return doc


@api_router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = await db.invoices.find_one({"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return doc


@api_router.post("/invoices/{invoice_id}/pay", response_model=InvoiceOut)
async def pay_invoice(invoice_id: str, body: InvoicePayment, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = await db.invoices.find_one({"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    new_paid = round(doc.get("paid_amount", 0) + body.amount, 2)
    paid_date = now_utc() if new_paid >= doc["amount"] else doc.get("paid_date")
    new_status = _invoice_status(doc["amount"], new_paid, doc.get("due_date"))
    await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["user_id"]},
        {"$set": {"paid_amount": new_paid, "paid_date": paid_date, "status": new_status}},
    )
    doc["paid_amount"] = new_paid
    doc["paid_date"] = paid_date
    doc["status"] = new_status
    return doc


@api_router.patch("/invoices/{invoice_id}/status", response_model=InvoiceOut)
async def set_invoice_status(
    invoice_id: str,
    status: InvoiceStatus,
    authorization: Optional[str] = Header(None),
):
    user = await get_current_user(authorization)
    update = {"status": status}
    if status == "paid":
        doc_now = await db.invoices.find_one({"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0})
        if doc_now:
            update["paid_amount"] = doc_now["amount"]
            update["paid_date"] = now_utc()
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["user_id"]}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    doc = await db.invoices.find_one({"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.invoices.delete_one({"id": invoice_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}


# ------------------------- Dashboard & Notifications -------------------------

@api_router.get("/dashboard")
async def dashboard(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["user_id"]

    active_clients = await db.clients.count_documents({"user_id": uid})
    active_projects = await db.projects.count_documents(
        {"user_id": uid, "status": {"$in": ["lead", "proposal_sent", "in_progress", "review"]}}
    )

    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(2000)
    pending_total = 0.0
    overdue_total = 0.0
    total_earned = 0.0
    outstanding = 0.0
    revenue_month = 0.0
    month_start = now_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    for inv in invoices:
        amount = inv["amount"]
        paid = inv.get("paid_amount", 0)
        remaining = max(amount - paid, 0)
        status = _invoice_status(amount, paid, inv.get("due_date"))
        if status == "overdue":
            overdue_total += remaining
        elif status in ("pending", "partial"):
            pending_total += remaining
        total_earned += paid
        outstanding += remaining
        paid_date = ensure_aware(inv.get("paid_date"))
        if paid_date and paid_date >= month_start:
            revenue_month += paid

    return {
        "active_clients": active_clients,
        "active_projects": active_projects,
        "pending_invoices_amount": round(pending_total, 2),
        "overdue_invoices_amount": round(overdue_total, 2),
        "revenue_this_month": round(revenue_month, 2),
        "total_earned": round(total_earned, 2),
        "outstanding_balance": round(outstanding, 2),
    }


@api_router.get("/reports/summary")
async def reports_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Aggregated analytics for the Advanced Reports screen (Pro feature)."""
    user = await get_current_user(authorization)
    uid = user["user_id"]

    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    quotes = await db.quotes.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    clients = await db.clients.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    invoices = _filter_by_status(invoices, status)
    invoices = _filter_by_date(invoices, "due_date", date_from, date_to)
    client_map = {c["id"]: c for c in clients}

    # Monthly revenue for the last 6 months (based on paid_date).
    now = now_utc()
    months: List[dict] = []
    for i in range(5, -1, -1):
        # compute first day of month i months ago
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append({"y": y, "m": m, "key": f"{y}-{m:02d}", "label": f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} {str(y)[-2:]}", "total": 0.0})

    for inv in invoices:
        pd = ensure_aware(inv.get("paid_date"))
        if not pd:
            continue
        for mb in months:
            if pd.year == mb["y"] and pd.month == mb["m"]:
                mb["total"] += inv.get("paid_amount", 0)
                break

    # Top clients by total paid.
    paid_by_client: dict = {}
    for inv in invoices:
        amt = inv.get("paid_amount", 0)
        if amt <= 0:
            continue
        paid_by_client[inv["client_id"]] = paid_by_client.get(inv["client_id"], 0) + amt
    top_clients = sorted(paid_by_client.items(), key=lambda x: x[1], reverse=True)[:5]
    top_clients_out = [
        {
            "client_id": cid,
            "name": client_map.get(cid, {}).get("name", "Unknown"),
            "company": client_map.get(cid, {}).get("company", ""),
            "total": round(total, 2),
        }
        for cid, total in top_clients
    ]

    # Average invoice value (paid invoices).
    paid_invs = [i for i in invoices if i.get("status") == "paid"]
    avg_invoice = round(sum(i["amount"] for i in paid_invs) / len(paid_invs), 2) if paid_invs else 0.0

    # Quote acceptance rate (accepted / (accepted + rejected + sent considered closed?)).
    accepted = sum(1 for q in quotes if q.get("status") == "accepted")
    rejected = sum(1 for q in quotes if q.get("status") == "rejected")
    total_closed = accepted + rejected
    acceptance_rate = round(accepted / total_closed * 100, 1) if total_closed else 0.0

    # Outstanding aging buckets (unpaid amounts grouped by overdue days).
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    for inv in invoices:
        remaining = max(inv["amount"] - inv.get("paid_amount", 0), 0)
        if remaining <= 0:
            continue
        due = ensure_aware(inv.get("due_date"))
        if not due or due >= now:
            buckets["current"] += remaining
            continue
        days = (now - due).days
        if days <= 30:
            buckets["1_30"] += remaining
        elif days <= 60:
            buckets["31_60"] += remaining
        elif days <= 90:
            buckets["61_90"] += remaining
        else:
            buckets["90_plus"] += remaining

    total_invoiced = sum(i["amount"] for i in invoices)
    total_paid = sum(i.get("paid_amount", 0) for i in invoices)

    return {
        "monthly_revenue": [{"label": m["label"], "total": round(m["total"], 2)} for m in months],
        "top_clients": top_clients_out,
        "avg_invoice_value": avg_invoice,
        "quote_acceptance_rate": acceptance_rate,
        "quotes_accepted": accepted,
        "quotes_rejected": rejected,
        "quotes_sent": sum(1 for q in quotes if q.get("status") == "sent"),
        "aging": {k: round(v, 2) for k, v in buckets.items()},
        "total_invoiced": round(total_invoiced, 2),
        "total_paid": round(total_paid, 2),
        "collection_rate": round(total_paid / total_invoiced * 100, 1) if total_invoiced else 0.0,
    }


@api_router.get("/reports/invoices.csv")
async def reports_invoices_csv(
    cols: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Download invoices as CSV. ?cols=invoice_number,client,amount,... to pick & reorder columns."""
    user = await get_current_user(authorization)
    uid = user["user_id"]
    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    clients = await db.clients.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    client_map = {c["id"]: c for c in clients}
    invoices = _filter_by_status(invoices, status)
    invoices = _filter_by_date(invoices, "due_date", date_from, date_to)

    def row_for(inv):
        c = client_map.get(inv["client_id"], {})
        paid = inv.get("paid_amount", 0)
        amount = inv.get("amount", 0)
        due = ensure_aware(inv.get("due_date"))
        paid_d = ensure_aware(inv.get("paid_date"))
        created = ensure_aware(inv.get("created_at"))
        return {
            "invoice_number": inv.get("invoice_number", ""),
            "client": c.get("name", ""),
            "company": c.get("company", ""),
            "amount": f"{amount:.2f}",
            "paid": f"{paid:.2f}",
            "outstanding": f"{max(amount - paid, 0):.2f}",
            "status": inv.get("status", ""),
            "due_date": due.strftime("%Y-%m-%d") if due else "",
            "paid_date": paid_d.strftime("%Y-%m-%d") if paid_d else "",
            "issued": created.strftime("%Y-%m-%d") if created else "",
            "notes": (inv.get("notes") or "").replace("\n", " "),
        }

    all_cols = [
        ("invoice_number", "Invoice #"),
        ("client", "Client"),
        ("company", "Company"),
        ("amount", "Amount"),
        ("paid", "Paid"),
        ("outstanding", "Outstanding"),
        ("status", "Status"),
        ("due_date", "Due date"),
        ("paid_date", "Paid date"),
        ("issued", "Issued"),
        ("notes", "Notes"),
    ]
    return _csv_response(invoices, row_for, all_cols, cols, "lancely-invoices.csv")


@api_router.get("/reports/clients.csv")
async def reports_clients_csv(
    cols: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    user = await get_current_user(authorization)
    uid = user["user_id"]
    clients = await db.clients.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    clients = _filter_by_date(clients, "created_at", date_from, date_to)
    projects = await db.projects.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    paid_by = {}
    out_by = {}
    proj_by = {}
    for inv in invoices:
        paid_by[inv["client_id"]] = paid_by.get(inv["client_id"], 0) + inv.get("paid_amount", 0)
        out_by[inv["client_id"]] = out_by.get(inv["client_id"], 0) + max(inv["amount"] - inv.get("paid_amount", 0), 0)
    for p in projects:
        proj_by[p["client_id"]] = proj_by.get(p["client_id"], 0) + 1

    def row_for(c):
        created = ensure_aware(c.get("created_at"))
        return {
            "name": c.get("name", ""),
            "company": c.get("company", ""),
            "email": c.get("email", ""),
            "phone": c.get("phone", ""),
            "projects": str(proj_by.get(c["id"], 0)),
            "total_paid": f"{paid_by.get(c['id'], 0):.2f}",
            "outstanding": f"{out_by.get(c['id'], 0):.2f}",
            "created": created.strftime("%Y-%m-%d") if created else "",
            "notes": (c.get("notes") or "").replace("\n", " "),
        }

    all_cols = [
        ("name", "Name"),
        ("company", "Company"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("projects", "Projects"),
        ("total_paid", "Total paid"),
        ("outstanding", "Outstanding"),
        ("created", "Created"),
        ("notes", "Notes"),
    ]
    return _csv_response(clients, row_for, all_cols, cols, "lancely-clients.csv")


@api_router.get("/reports/payments.csv")
async def reports_payments_csv(
    cols: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    user = await get_current_user(authorization)
    uid = user["user_id"]
    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    clients = await db.clients.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    client_map = {c["id"]: c for c in clients}
    # A "payment" row exists for every invoice where paid_amount > 0.
    payments = [i for i in invoices if i.get("paid_amount", 0) > 0]
    payments = _filter_by_date(payments, "paid_date", date_from, date_to)

    def row_for(inv):
        c = client_map.get(inv["client_id"], {})
        paid_d = ensure_aware(inv.get("paid_date"))
        return {
            "invoice_number": inv.get("invoice_number", ""),
            "client": c.get("name", ""),
            "company": c.get("company", ""),
            "amount": f"{inv.get('paid_amount', 0):.2f}",
            "total_invoice": f"{inv.get('amount', 0):.2f}",
            "status": inv.get("status", ""),
            "paid_date": paid_d.strftime("%Y-%m-%d") if paid_d else "",
        }

    all_cols = [
        ("paid_date", "Paid date"),
        ("invoice_number", "Invoice #"),
        ("client", "Client"),
        ("company", "Company"),
        ("amount", "Amount paid"),
        ("total_invoice", "Invoice total"),
        ("status", "Status"),
    ]
    return _csv_response(payments, row_for, all_cols, cols, "lancely-payments.csv")


def _csv_response(rows, row_for, all_cols, cols_query, filename):
    import csv
    import io
    from fastapi.responses import Response

    col_keys_all = [k for k, _ in all_cols]
    label_map = dict(all_cols)
    chosen = col_keys_all
    if cols_query:
        requested = [c.strip() for c in cols_query.split(",") if c.strip()]
        valid = [c for c in requested if c in label_map]
        if valid:
            chosen = valid
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([label_map[k] for k in chosen])
    for r in rows:
        d = row_for(r)
        writer.writerow([d.get(k, "") for k in chosen])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _filter_by_status(rows, status):
    if not status:
        return rows
    wanted = {s.strip() for s in status.split(",") if s.strip()}
    return [r for r in rows if r.get("status") in wanted]


def _filter_by_date(rows, field, date_from, date_to):
    if not (date_from or date_to):
        return rows
    from datetime import datetime as _dt
    def parse(s):
        if not s:
            return None
        try:
            return _dt.fromisoformat(s).replace(tzinfo=timezone.utc)
        except Exception:
            return None
    a = parse(date_from)
    b = parse(date_to)
    out = []
    for r in rows:
        v = ensure_aware(r.get(field))
        if a and (not v or v < a):
            continue
        if b and (not v or v > b):
            continue
        out.append(r)
    return out


@api_router.get("/reports/export-options")
async def reports_export_options(authorization: Optional[str] = Header(None)):
    """Returns the available columns for each CSV dataset so the UI can render a column picker."""
    await get_current_user(authorization)
    return {
        "invoices": [
            {"key": "invoice_number", "label": "Invoice #"},
            {"key": "client", "label": "Client"},
            {"key": "company", "label": "Company"},
            {"key": "amount", "label": "Amount"},
            {"key": "paid", "label": "Paid"},
            {"key": "outstanding", "label": "Outstanding"},
            {"key": "status", "label": "Status"},
            {"key": "due_date", "label": "Due date"},
            {"key": "paid_date", "label": "Paid date"},
            {"key": "issued", "label": "Issued"},
            {"key": "notes", "label": "Notes"},
        ],
        "clients": [
            {"key": "name", "label": "Name"},
            {"key": "company", "label": "Company"},
            {"key": "email", "label": "Email"},
            {"key": "phone", "label": "Phone"},
            {"key": "projects", "label": "Projects"},
            {"key": "total_paid", "label": "Total paid"},
            {"key": "outstanding", "label": "Outstanding"},
            {"key": "created", "label": "Created"},
            {"key": "notes", "label": "Notes"},
        ],
        "payments": [
            {"key": "paid_date", "label": "Paid date"},
            {"key": "invoice_number", "label": "Invoice #"},
            {"key": "client", "label": "Client"},
            {"key": "company", "label": "Company"},
            {"key": "amount", "label": "Amount paid"},
            {"key": "total_invoice", "label": "Invoice total"},
            {"key": "status", "label": "Status"},
        ],
    }


@api_router.get("/notifications")
async def notifications(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["user_id"]
    now = now_utc()
    soon = now + timedelta(days=3)

    out = []
    invoices = await db.invoices.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    for inv in invoices:
        due = ensure_aware(inv.get("due_date"))
        status = inv.get("status")
        if status in ("paid",):
            continue
        if due and due < now:
            out.append({
                "id": f"inv-overdue-{inv['id']}",
                "type": "invoice_overdue",
                "title": f"Invoice {inv['invoice_number']} is overdue",
                "subtitle": f"AED {inv['amount'] - inv.get('paid_amount', 0):.0f} outstanding",
                "ref_id": inv["id"],
                "created_at": due.isoformat(),
            })
        elif due and due <= soon:
            out.append({
                "id": f"inv-due-{inv['id']}",
                "type": "invoice_due_soon",
                "title": f"Invoice {inv['invoice_number']} due soon",
                "subtitle": f"Due {due.strftime('%d %b %Y')}",
                "ref_id": inv["id"],
                "created_at": due.isoformat(),
            })

    projects = await db.projects.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    for prj in projects:
        if prj.get("status") == "completed":
            continue
        due = ensure_aware(prj.get("due_date"))
        if due and due <= soon and due >= now:
            out.append({
                "id": f"prj-due-{prj['id']}",
                "type": "project_due_soon",
                "title": f"Project '{prj['name']}' is due soon",
                "subtitle": f"Due {due.strftime('%d %b %Y')}",
                "ref_id": prj["id"],
                "created_at": due.isoformat(),
            })

    quotes = await db.quotes.find({"user_id": uid, "status": "sent"}, {"_id": 0}).to_list(1000)
    for q in quotes:
        created = ensure_aware(q.get("created_at"))
        if created and (now - created).days >= 7:
            out.append({
                "id": f"qte-stale-{q['id']}",
                "type": "quote_awaiting",
                "title": f"Quote {q['quote_number']} awaiting response",
                "subtitle": f"Sent {(now - created).days} days ago",
                "ref_id": q["id"],
                "created_at": created.isoformat(),
            })

    out.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": out}


@api_router.get("/")
async def root():
    return {"app": "Lancely", "status": "ok"}


# ------------------------- Settings -------------------------

DEFAULT_SETTINGS = UserSettings().dict()


@api_router.get("/me/settings", response_model=UserSettings)
async def get_settings(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    s = user.get("settings") or {}
    merged = {**DEFAULT_SETTINGS, **s}
    return UserSettings(**merged)


@api_router.put("/me/settings", response_model=UserSettings)
async def update_settings(body: UserSettings, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    # validate currency
    cur = body.currency.upper().strip() if body.currency else "AED"
    if cur not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported currency '{cur}'")
    # validate accent color (basic)
    accent = body.accent_color
    if accent:
        accent = accent.strip()
        if not re.match(r"^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$", accent):
            raise HTTPException(status_code=400, detail="accent_color must be a hex like #A855F7")
    # logo size guard (allow up to ~2 MB base64)
    logo = body.logo_base64
    if logo and len(logo) > 3_000_000:
        raise HTTPException(status_code=400, detail="Logo is too large (max ~2MB)")
    payload = {
        "currency": cur,
        "timezone": body.timezone or "device",
        "accent_color": accent,
        "logo_base64": logo,
        "business_name": (body.business_name or "").strip()[:80],
        "report_columns": body.report_columns or {},
    }
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"settings": payload, "updated_at": now_utc()}}
    )
    return UserSettings(**payload)


@api_router.get("/settings/options")
async def settings_options():
    return {
        "currencies": SUPPORTED_CURRENCIES,
        "timezones": [
            "device",
            "UTC",
            "Asia/Dubai",
            "Asia/Riyadh",
            "Asia/Kolkata",
            "Asia/Singapore",
            "Europe/London",
            "Europe/Berlin",
            "America/New_York",
            "America/Los_Angeles",
        ],
        "accent_swatches": [
            "#0F172A", "#2563EB", "#A855F7", "#10B981",
            "#F97316", "#EF4444", "#EC4899", "#14B8A6",
        ],
    }


# ------------------------- App setup -------------------------

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.clients.create_index([("user_id", 1), ("created_at", -1)])
    await db.projects.create_index([("user_id", 1), ("status", 1)])
    await db.quotes.create_index([("user_id", 1), ("created_at", -1)])
    await db.invoices.create_index([("user_id", 1), ("due_date", 1)])
    logger.info("Lancely indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
