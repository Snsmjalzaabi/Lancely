from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
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
logger = logging.getLogger("solvio")

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
        user=UserOut(user_id=user_id, email=email, name=name, picture=picture),
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
    )


@api_router.post("/auth/demo-session", response_model=SessionOut)
async def demo_session():
    """Create a demo user + session so testers and onboarding visitors can preview the app
    without going through Google OAuth. Each call returns a fresh disposable account."""
    suffix = uuid.uuid4().hex[:6]
    email = f"demo_{suffix}@solvio.app"
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
    return {"app": "Solvio", "status": "ok"}


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
    logger.info("Solvio indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
