from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Response
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import csv
import io
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
import uuid
import bcrypt
import jwt
import resend
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from collections import defaultdict

from pdf_generator import generate_invoice_pdf, generate_quotation_pdf

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'lancely-dev-secret-change-in-prod-please')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev').strip()
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Supported currencies
CURRENCIES = [
    {"code": "AED", "symbol": "د.إ", "name": "UAE Dirham", "locale": "en-AE"},
    {"code": "USD", "symbol": "$", "name": "US Dollar", "locale": "en-US"},
    {"code": "EUR", "symbol": "€", "name": "Euro", "locale": "en-GB"},
    {"code": "GBP", "symbol": "£", "name": "British Pound", "locale": "en-GB"},
    {"code": "SAR", "symbol": "﷼", "name": "Saudi Riyal", "locale": "en-SA"},
    {"code": "INR", "symbol": "₹", "name": "Indian Rupee", "locale": "en-IN"},
]
CURRENCY_CODES = {c["code"] for c in CURRENCIES}

app = FastAPI(title="Lancely API")
api_router = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# -----------------------
# Helpers
# -----------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'exp': now_utc() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('sub')
    except Exception:
        return None

def serialize_doc(doc):
    """Recursively convert datetime/date to ISO string and remove _id."""
    if isinstance(doc, dict):
        out = {}
        for k, v in doc.items():
            if k == '_id':
                continue
            out[k] = serialize_doc(v)
        return out
    if isinstance(doc, list):
        return [serialize_doc(x) for x in doc]
    if isinstance(doc, (datetime, date)):
        return doc.isoformat()
    return doc

def to_mongo(doc: dict) -> dict:
    """Convert datetime fields to ISO strings for Mongo storage."""
    out = {}
    for k, v in doc.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = to_mongo(v)
        elif isinstance(v, list):
            out[k] = [to_mongo(x) if isinstance(x, dict) else (x.isoformat() if isinstance(x, (datetime, date)) else x) for x in v]
        else:
            out[k] = v
    return out

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return serialize_doc(user)

VAT_RATE = 0.05

def compute_totals(items: List[dict]) -> dict:
    subtotal = 0.0
    for it in items:
        qty = float(it.get('quantity', 0) or 0)
        rate = float(it.get('rate', 0) or 0)
        subtotal += qty * rate
    subtotal = round(subtotal, 2)
    vat = round(subtotal * VAT_RATE, 2)
    total = round(subtotal + vat, 2)
    return {"subtotal": subtotal, "vat": vat, "total": total, "vat_rate": VAT_RATE}

# -----------------------
# Models
# -----------------------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    business_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    trn: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    currency: Optional[str] = None
    theme: Optional[str] = None

class ClientIn(BaseModel):
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    trn: Optional[str] = None
    notes: Optional[str] = None

class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    description: str
    quantity: float = 1.0
    rate: float = 0.0

class QuotationIn(BaseModel):
    client_id: str
    title: Optional[str] = None
    issue_date: Optional[str] = None
    valid_until: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "draft"  # draft|sent|accepted|rejected
    items: List[LineItem] = []
    currency: Optional[str] = None

class InvoiceIn(BaseModel):
    client_id: str
    title: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "unpaid"  # unpaid|paid|overdue
    items: List[LineItem] = []
    project_id: Optional[str] = None
    currency: Optional[str] = None

class InvoiceStatusUpdate(BaseModel):
    status: str
    payment_date: Optional[str] = None

class ProjectIn(BaseModel):
    name: str
    client_id: Optional[str] = None
    status: Optional[str] = "active"  # active|on_hold|completed|cancelled
    deadline: Optional[str] = None
    value: Optional[float] = 0.0
    notes: Optional[str] = None

# -----------------------
# Auth
# -----------------------
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": new_id(),
        "email": data.email.lower(),
        "name": data.name.strip(),
        "business_name": (data.business_name or "").strip(),
        "trn": "",
        "address": "",
        "phone": "",
        "website": "",
        "currency": "AED",
        "theme": "dark",
        "password_hash": hash_password(data.password),
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_doc["id"])
    safe = {k: v for k, v in user_doc.items() if k not in ('password_hash', '_id')}
    return {"token": token, "user": serialize_doc(safe)}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    safe = {k: v for k, v in user.items() if k != 'password_hash'}
    return {"token": token, "user": safe}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    safe = {k: v for k, v in current_user.items() if k != 'password_hash'}
    return safe

@api_router.put("/auth/me")
async def update_me(data: UserUpdate, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if 'currency' in updates and updates['currency'] not in CURRENCY_CODES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if 'theme' in updates and updates['theme'] not in ('light', 'dark'):
        raise HTTPException(status_code=400, detail="Invalid theme")
    if updates:
        await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password_hash": 0})
    return serialize_doc(user)

# -----------------------
# Clients CRUD
# -----------------------
@api_router.post("/clients")
async def create_client(data: ClientIn, current_user: dict = Depends(get_current_user)):
    doc = data.model_dump()
    doc.update({
        "id": new_id(),
        "user_id": current_user["id"],
        "created_at": now_utc().isoformat(),
    })
    await db.clients.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/clients")
async def list_clients(current_user: dict = Depends(get_current_user)):
    items = await db.clients.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": client_id, "user_id": current_user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return serialize_doc(doc)

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientIn, current_user: dict = Depends(get_current_user)):
    res = await db.clients.update_one(
        {"id": client_id, "user_id": current_user["id"]},
        {"$set": data.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return serialize_doc(doc)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}

# -----------------------
# Quotations CRUD
# -----------------------
@api_router.post("/quotations")
async def create_quotation(data: QuotationIn, current_user: dict = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"id": data.client_id, "user_id": current_user["id"]})
    if not client_doc:
        raise HTTPException(status_code=400, detail="Invalid client_id")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    totals = compute_totals(items)
    count = await db.quotations.count_documents({"user_id": current_user["id"]})
    number = f"QTN-{str(count + 1).zfill(4)}"
    currency = (data.currency or current_user.get('currency') or 'AED').upper()
    if currency not in CURRENCY_CODES:
        currency = 'AED'
    doc = {
        "id": new_id(),
        "user_id": current_user["id"],
        "number": number,
        "client_id": data.client_id,
        "title": data.title or "Quotation",
        "issue_date": data.issue_date or now_utc().date().isoformat(),
        "valid_until": data.valid_until,
        "notes": data.notes,
        "status": data.status or "draft",
        "items": items,
        "subtotal": totals["subtotal"],
        "vat": totals["vat"],
        "total": totals["total"],
        "vat_rate": totals["vat_rate"],
        "currency": currency,
        "created_at": now_utc().isoformat(),
        "converted_invoice_id": None,
    }
    await db.quotations.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/quotations")
async def list_quotations(current_user: dict = Depends(get_current_user)):
    items = await db.quotations.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api_router.get("/quotations/{qid}")
async def get_quotation(qid: str, current_user: dict = Depends(get_current_user)):
    doc = await db.quotations.find_one({"id": qid, "user_id": current_user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return serialize_doc(doc)

@api_router.put("/quotations/{qid}")
async def update_quotation(qid: str, data: QuotationIn, current_user: dict = Depends(get_current_user)):
    existing = await db.quotations.find_one({"id": qid, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Quotation not found")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    totals = compute_totals(items)
    updates = {
        "client_id": data.client_id,
        "title": data.title or "Quotation",
        "issue_date": data.issue_date or existing.get("issue_date"),
        "valid_until": data.valid_until,
        "notes": data.notes,
        "status": data.status or existing.get("status", "draft"),
        "items": items,
        "subtotal": totals["subtotal"],
        "vat": totals["vat"],
        "total": totals["total"],
        "vat_rate": totals["vat_rate"],
    }
    if data.currency:
        cc = data.currency.upper()
        if cc in CURRENCY_CODES:
            updates["currency"] = cc
    await db.quotations.update_one({"id": qid}, {"$set": updates})
    doc = await db.quotations.find_one({"id": qid}, {"_id": 0})
    return serialize_doc(doc)

@api_router.delete("/quotations/{qid}")
async def delete_quotation(qid: str, current_user: dict = Depends(get_current_user)):
    res = await db.quotations.delete_one({"id": qid, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return {"ok": True}

@api_router.post("/quotations/{qid}/convert")
async def convert_quotation_to_invoice(qid: str, current_user: dict = Depends(get_current_user)):
    q = await db.quotations.find_one({"id": qid, "user_id": current_user["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.get("converted_invoice_id"):
        existing_inv = await db.invoices.find_one({"id": q["converted_invoice_id"]}, {"_id": 0})
        if existing_inv:
            return serialize_doc(existing_inv)
    count = await db.invoices.count_documents({"user_id": current_user["id"]})
    inv_id = new_id()
    number = f"INV-{str(count + 1).zfill(4)}"
    issue = now_utc().date().isoformat()
    due = (now_utc() + timedelta(days=14)).date().isoformat()
    doc = {
        "id": inv_id,
        "user_id": current_user["id"],
        "number": number,
        "client_id": q["client_id"],
        "title": q.get("title", "Invoice"),
        "issue_date": issue,
        "due_date": due,
        "notes": q.get("notes"),
        "status": "unpaid",
        "items": q.get("items", []),
        "subtotal": q.get("subtotal", 0),
        "vat": q.get("vat", 0),
        "total": q.get("total", 0),
        "vat_rate": q.get("vat_rate", VAT_RATE),
        "currency": q.get("currency", "AED"),
        "payment_date": None,
        "created_at": now_utc().isoformat(),
        "project_id": None,
        "from_quotation_id": qid,
    }
    await db.invoices.insert_one(doc)
    await db.quotations.update_one({"id": qid}, {"$set": {"converted_invoice_id": inv_id, "status": "accepted"}})
    return serialize_doc(doc)

# -----------------------
# Invoices CRUD
# -----------------------
async def auto_overdue(invoices: List[dict]) -> List[dict]:
    """Mark invoices as overdue if due_date < today and status == unpaid (in-memory display only)."""
    today = now_utc().date().isoformat()
    out = []
    for inv in invoices:
        if inv.get("status") == "unpaid" and inv.get("due_date") and inv["due_date"] < today:
            inv = {**inv, "status": "overdue"}
        out.append(inv)
    return out

@api_router.post("/invoices")
async def create_invoice(data: InvoiceIn, current_user: dict = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"id": data.client_id, "user_id": current_user["id"]})
    if not client_doc:
        raise HTTPException(status_code=400, detail="Invalid client_id")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    totals = compute_totals(items)
    count = await db.invoices.count_documents({"user_id": current_user["id"]})
    number = f"INV-{str(count + 1).zfill(4)}"
    currency = (data.currency or current_user.get('currency') or 'AED').upper()
    if currency not in CURRENCY_CODES:
        currency = 'AED'
    doc = {
        "id": new_id(),
        "user_id": current_user["id"],
        "number": number,
        "client_id": data.client_id,
        "title": data.title or "Invoice",
        "issue_date": data.issue_date or now_utc().date().isoformat(),
        "due_date": data.due_date or (now_utc() + timedelta(days=14)).date().isoformat(),
        "notes": data.notes,
        "status": data.status or "unpaid",
        "items": items,
        "subtotal": totals["subtotal"],
        "vat": totals["vat"],
        "total": totals["total"],
        "vat_rate": totals["vat_rate"],
        "currency": currency,
        "payment_date": None,
        "created_at": now_utc().isoformat(),
        "project_id": data.project_id,
    }
    await db.invoices.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/invoices")
async def list_invoices(current_user: dict = Depends(get_current_user)):
    items = await db.invoices.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    items = [serialize_doc(x) for x in items]
    items = await auto_overdue(items)
    return items

@api_router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.invoices.find_one({"id": inv_id, "user_id": current_user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    doc = serialize_doc(doc)
    today = now_utc().date().isoformat()
    if doc.get("status") == "unpaid" and doc.get("due_date") and doc["due_date"] < today:
        doc["status"] = "overdue"
    return doc

@api_router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, data: InvoiceIn, current_user: dict = Depends(get_current_user)):
    existing = await db.invoices.find_one({"id": inv_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    totals = compute_totals(items)
    updates = {
        "client_id": data.client_id,
        "title": data.title or existing.get("title", "Invoice"),
        "issue_date": data.issue_date or existing.get("issue_date"),
        "due_date": data.due_date or existing.get("due_date"),
        "notes": data.notes,
        "status": data.status or existing.get("status", "unpaid"),
        "items": items,
        "subtotal": totals["subtotal"],
        "vat": totals["vat"],
        "total": totals["total"],
        "vat_rate": totals["vat_rate"],
        "project_id": data.project_id,
    }
    if data.currency:
        cc = data.currency.upper()
        if cc in CURRENCY_CODES:
            updates["currency"] = cc
    await db.invoices.update_one({"id": inv_id}, {"$set": updates})
    doc = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    return serialize_doc(doc)

@api_router.patch("/invoices/{inv_id}/status")
async def update_invoice_status(inv_id: str, data: InvoiceStatusUpdate, current_user: dict = Depends(get_current_user)):
    if data.status not in ("paid", "unpaid", "overdue"):
        raise HTTPException(status_code=400, detail="Invalid status")
    updates = {"status": data.status}
    if data.status == "paid":
        updates["payment_date"] = data.payment_date or now_utc().date().isoformat()
    else:
        updates["payment_date"] = None
    res = await db.invoices.update_one({"id": inv_id, "user_id": current_user["id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    doc = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    return serialize_doc(doc)

@api_router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": inv_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}

# -----------------------
# Projects CRUD
# -----------------------
@api_router.post("/projects")
async def create_project(data: ProjectIn, current_user: dict = Depends(get_current_user)):
    if data.client_id:
        c = await db.clients.find_one({"id": data.client_id, "user_id": current_user["id"]})
        if not c:
            raise HTTPException(status_code=400, detail="Invalid client_id")
    doc = data.model_dump()
    doc.update({
        "id": new_id(),
        "user_id": current_user["id"],
        "created_at": now_utc().isoformat(),
    })
    await db.projects.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/projects")
async def list_projects(current_user: dict = Depends(get_current_user)):
    items = await db.projects.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(x) for x in items]

@api_router.get("/projects/{pid}")
async def get_project(pid: str, current_user: dict = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": current_user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return serialize_doc(doc)

@api_router.put("/projects/{pid}")
async def update_project(pid: str, data: ProjectIn, current_user: dict = Depends(get_current_user)):
    res = await db.projects.update_one(
        {"id": pid, "user_id": current_user["id"]},
        {"$set": data.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    return serialize_doc(doc)

@api_router.delete("/projects/{pid}")
async def delete_project(pid: str, current_user: dict = Depends(get_current_user)):
    res = await db.projects.delete_one({"id": pid, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}

# -----------------------
# Payments / Reminders
# -----------------------
@api_router.get("/payments/reminders")
async def payments_reminders(current_user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(2000)
    invoices = [serialize_doc(x) for x in invoices]
    today = now_utc().date().isoformat()
    in_7_days = (now_utc() + timedelta(days=7)).date().isoformat()
    upcoming, overdue, paid = [], [], []
    clients_map = {}
    client_docs = await db.clients.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(2000)
    for c in client_docs:
        clients_map[c["id"]] = c
    for inv in invoices:
        inv["client"] = clients_map.get(inv.get("client_id"))
        if inv.get("status") == "paid":
            paid.append(inv)
        else:
            due = inv.get("due_date")
            if due and due < today:
                inv["status"] = "overdue"
                overdue.append(inv)
            elif due and due <= in_7_days:
                upcoming.append(inv)
            else:
                upcoming.append(inv)
    upcoming.sort(key=lambda x: x.get("due_date") or "")
    overdue.sort(key=lambda x: x.get("due_date") or "")
    paid.sort(key=lambda x: x.get("payment_date") or "", reverse=True)
    return {"upcoming": upcoming, "overdue": overdue, "paid": paid}

# -----------------------
# Analytics
# -----------------------
@api_router.get("/analytics/dashboard")
async def analytics_dashboard(current_user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(5000)
    invoices = [serialize_doc(x) for x in invoices]
    projects = await db.projects.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(5000)
    projects = [serialize_doc(x) for x in projects]
    clients = await db.clients.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(5000)

    today = now_utc().date().isoformat()
    total_revenue = 0.0
    unpaid_count = 0
    unpaid_amount = 0.0
    overdue_count = 0
    overdue_amount = 0.0
    active_projects = 0

    monthly = defaultdict(float)
    for inv in invoices:
        status_v = inv.get("status")
        total = float(inv.get("total", 0) or 0)
        if status_v == "paid":
            total_revenue += total
            pd = inv.get("payment_date") or inv.get("issue_date") or inv.get("created_at")
            if pd:
                month_key = pd[:7]
                monthly[month_key] += total
        else:
            due = inv.get("due_date")
            if due and due < today:
                overdue_count += 1
                overdue_amount += total
            else:
                unpaid_count += 1
                unpaid_amount += total

    for p in projects:
        if p.get("status") == "active":
            active_projects += 1

    months_series = []
    now_dt = now_utc()
    for i in range(5, -1, -1):
        y = now_dt.year
        m = now_dt.month - i
        while m <= 0:
            m += 12
            y -= 1
        key = f"{y:04d}-{m:02d}"
        months_series.append({"month": key, "label": datetime(y, m, 1).strftime('%b'), "earnings": round(monthly.get(key, 0.0), 2)})

    recent_invoices = sorted(invoices, key=lambda x: x.get("created_at") or "", reverse=True)[:5]

    return {
        "total_revenue": round(total_revenue, 2),
        "unpaid_count": unpaid_count,
        "unpaid_amount": round(unpaid_amount, 2),
        "overdue_count": overdue_count,
        "overdue_amount": round(overdue_amount, 2),
        "active_projects": active_projects,
        "total_clients": len(clients),
        "monthly_earnings": months_series,
        "recent_invoices": recent_invoices,
    }

# -----------------------
# PDFs
# -----------------------
@api_router.get("/invoices/{inv_id}/pdf")
async def invoice_pdf(inv_id: str, token: Optional[str] = None):
    user_id = decode_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Auth token required")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    inv = await db.invoices.find_one({"id": inv_id, "user_id": user_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    client_doc = await db.clients.find_one({"id": inv.get("client_id")}, {"_id": 0})
    pdf_bytes = generate_invoice_pdf(inv, client_doc or {}, user)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={inv.get('number','invoice')}.pdf"
    })

@api_router.get("/quotations/{qid}/pdf")
async def quotation_pdf(qid: str, token: Optional[str] = None):
    user_id = decode_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Auth token required")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    q = await db.quotations.find_one({"id": qid, "user_id": user_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    client_doc = await db.clients.find_one({"id": q.get("client_id")}, {"_id": 0})
    pdf_bytes = generate_quotation_pdf(q, client_doc or {}, user)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename={q.get('number','quotation')}.pdf"
    })

# -----------------------
# Currencies
# -----------------------
@api_router.get("/currencies")
async def list_currencies():
    return CURRENCIES

# -----------------------
# CSV Exports
# -----------------------
def _csv_response(rows: List[dict], headers: List[str], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return Response(
        content=buf.getvalue(),
        media_type='text/csv; charset=utf-8',
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

async def _resolve_user_from_token(token: Optional[str]) -> dict:
    user_id = decode_token(token) if token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Auth token required")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return serialize_doc(user)

@api_router.get("/export/clients.csv")
async def export_clients_csv(token: Optional[str] = None):
    user = await _resolve_user_from_token(token)
    rows = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    rows = [serialize_doc(r) for r in rows]
    headers = ["name", "company", "email", "phone", "address", "trn", "notes", "created_at"]
    return _csv_response(rows, headers, "lancely-clients.csv")

@api_router.get("/export/invoices.csv")
async def export_invoices_csv(token: Optional[str] = None):
    user = await _resolve_user_from_token(token)
    invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
    invs = [serialize_doc(i) for i in invs]
    cli_map = {c["id"]: c for c in await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)}
    rows = []
    for i in invs:
        c = cli_map.get(i.get("client_id")) or {}
        rows.append({
            "number": i.get("number"),
            "title": i.get("title"),
            "client_name": c.get("name"),
            "client_company": c.get("company"),
            "client_trn": c.get("trn"),
            "issue_date": i.get("issue_date"),
            "due_date": i.get("due_date"),
            "status": i.get("status"),
            "currency": i.get("currency", "AED"),
            "subtotal": i.get("subtotal"),
            "vat": i.get("vat"),
            "total": i.get("total"),
            "payment_date": i.get("payment_date"),
        })
    headers = ["number","title","client_name","client_company","client_trn","issue_date","due_date","status","currency","subtotal","vat","total","payment_date"]
    return _csv_response(rows, headers, "lancely-invoices.csv")

@api_router.get("/export/quotations.csv")
async def export_quotations_csv(token: Optional[str] = None):
    user = await _resolve_user_from_token(token)
    qts = await db.quotations.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
    qts = [serialize_doc(i) for i in qts]
    cli_map = {c["id"]: c for c in await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)}
    rows = []
    for i in qts:
        c = cli_map.get(i.get("client_id")) or {}
        rows.append({
            "number": i.get("number"),
            "title": i.get("title"),
            "client_name": c.get("name"),
            "issue_date": i.get("issue_date"),
            "valid_until": i.get("valid_until"),
            "status": i.get("status"),
            "currency": i.get("currency", "AED"),
            "subtotal": i.get("subtotal"),
            "vat": i.get("vat"),
            "total": i.get("total"),
        })
    headers = ["number","title","client_name","issue_date","valid_until","status","currency","subtotal","vat","total"]
    return _csv_response(rows, headers, "lancely-quotations.csv")

@api_router.get("/export/projects.csv")
async def export_projects_csv(token: Optional[str] = None):
    user = await _resolve_user_from_token(token)
    prs = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
    prs = [serialize_doc(i) for i in prs]
    cli_map = {c["id"]: c for c in await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)}
    rows = []
    for p in prs:
        c = cli_map.get(p.get("client_id")) or {}
        rows.append({
            "name": p.get("name"),
            "client_name": c.get("name"),
            "status": p.get("status"),
            "deadline": p.get("deadline"),
            "value": p.get("value"),
            "notes": p.get("notes"),
        })
    headers = ["name","client_name","status","deadline","value","notes"]
    return _csv_response(rows, headers, "lancely-projects.csv")

# -----------------------
# Recurring Invoices
# -----------------------
FREQUENCIES = {"weekly": 7, "monthly": 30, "quarterly": 91, "yearly": 365}

class RecurringIn(BaseModel):
    client_id: str
    title: Optional[str] = None
    notes: Optional[str] = None
    frequency: str = "monthly"  # weekly|monthly|quarterly|yearly
    next_run_date: Optional[str] = None  # ISO date; default today
    is_active: Optional[bool] = True
    currency: Optional[str] = None
    items: List[LineItem] = []
    due_days: Optional[int] = 14

def _advance_date(d: str, frequency: str) -> str:
    base = datetime.fromisoformat(d).date() if d else now_utc().date()
    if frequency == "monthly":
        month = base.month + 1
        year = base.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        try:
            return date(year, month, base.day).isoformat()
        except ValueError:
            # Handle Feb 30 etc.
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            return date(year, month, last_day).isoformat()
    if frequency == "quarterly":
        month = base.month + 3
        year = base.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        try:
            return date(year, month, base.day).isoformat()
        except ValueError:
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            return date(year, month, last_day).isoformat()
    if frequency == "yearly":
        try:
            return date(base.year + 1, base.month, base.day).isoformat()
        except ValueError:
            return date(base.year + 1, base.month, 28).isoformat()
    # weekly default
    return (base + timedelta(days=FREQUENCIES.get(frequency, 7))).isoformat()

@api_router.post("/recurring-invoices")
async def create_recurring(data: RecurringIn, current_user: dict = Depends(get_current_user)):
    if data.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid frequency")
    c = await db.clients.find_one({"id": data.client_id, "user_id": current_user["id"]})
    if not c:
        raise HTTPException(status_code=400, detail="Invalid client_id")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    currency = (data.currency or current_user.get('currency') or 'AED').upper()
    if currency not in CURRENCY_CODES:
        currency = 'AED'
    doc = {
        "id": new_id(),
        "user_id": current_user["id"],
        "client_id": data.client_id,
        "title": data.title or "Recurring Invoice",
        "notes": data.notes,
        "frequency": data.frequency,
        "next_run_date": data.next_run_date or now_utc().date().isoformat(),
        "is_active": True if data.is_active is None else bool(data.is_active),
        "currency": currency,
        "items": items,
        "due_days": int(data.due_days or 14),
        "last_generated_at": None,
        "generated_count": 0,
        "created_at": now_utc().isoformat(),
    }
    await db.recurring_invoices.insert_one(doc)
    return serialize_doc(doc)

@api_router.get("/recurring-invoices")
async def list_recurring(current_user: dict = Depends(get_current_user)):
    items = await db.recurring_invoices.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_doc(x) for x in items]

@api_router.get("/recurring-invoices/{rid}")
async def get_recurring(rid: str, current_user: dict = Depends(get_current_user)):
    d = await db.recurring_invoices.find_one({"id": rid, "user_id": current_user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_doc(d)

@api_router.put("/recurring-invoices/{rid}")
async def update_recurring(rid: str, data: RecurringIn, current_user: dict = Depends(get_current_user)):
    existing = await db.recurring_invoices.find_one({"id": rid, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if data.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid frequency")
    items = [i.model_dump() for i in data.items]
    for it in items:
        it["amount"] = round(float(it.get('quantity', 0) or 0) * float(it.get('rate', 0) or 0), 2)
    updates = {
        "client_id": data.client_id,
        "title": data.title or existing.get("title", "Recurring Invoice"),
        "notes": data.notes,
        "frequency": data.frequency,
        "next_run_date": data.next_run_date or existing.get("next_run_date"),
        "is_active": True if data.is_active is None else bool(data.is_active),
        "items": items,
        "due_days": int(data.due_days or existing.get("due_days", 14)),
    }
    if data.currency:
        cc = data.currency.upper()
        if cc in CURRENCY_CODES:
            updates["currency"] = cc
    await db.recurring_invoices.update_one({"id": rid}, {"$set": updates})
    d = await db.recurring_invoices.find_one({"id": rid}, {"_id": 0})
    return serialize_doc(d)

@api_router.delete("/recurring-invoices/{rid}")
async def delete_recurring(rid: str, current_user: dict = Depends(get_current_user)):
    res = await db.recurring_invoices.delete_one({"id": rid, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

async def _generate_invoice_from_recurring(rec: dict) -> dict:
    """Internal: generate one invoice instance and advance next_run_date."""
    items = rec.get("items", [])
    totals = compute_totals(items)
    count = await db.invoices.count_documents({"user_id": rec["user_id"]})
    number = f"INV-{str(count + 1).zfill(4)}"
    issue = now_utc().date().isoformat()
    due = (now_utc() + timedelta(days=int(rec.get("due_days", 14)))).date().isoformat()
    inv = {
        "id": new_id(),
        "user_id": rec["user_id"],
        "number": number,
        "client_id": rec["client_id"],
        "title": rec.get("title", "Invoice"),
        "issue_date": issue,
        "due_date": due,
        "notes": rec.get("notes"),
        "status": "unpaid",
        "items": items,
        "subtotal": totals["subtotal"],
        "vat": totals["vat"],
        "total": totals["total"],
        "vat_rate": totals["vat_rate"],
        "currency": rec.get("currency", "AED"),
        "payment_date": None,
        "created_at": now_utc().isoformat(),
        "project_id": None,
        "from_recurring_id": rec["id"],
    }
    await db.invoices.insert_one(inv)
    new_next = _advance_date(rec.get("next_run_date") or now_utc().date().isoformat(), rec.get("frequency", "monthly"))
    await db.recurring_invoices.update_one({"id": rec["id"]}, {"$set": {
        "next_run_date": new_next,
        "last_generated_at": now_utc().isoformat(),
        "generated_count": rec.get("generated_count", 0) + 1,
    }})
    return serialize_doc(inv)

@api_router.post("/recurring-invoices/{rid}/generate")
async def generate_recurring_now(rid: str, current_user: dict = Depends(get_current_user)):
    rec = await db.recurring_invoices.find_one({"id": rid, "user_id": current_user["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    inv = await _generate_invoice_from_recurring(rec)
    return inv

@api_router.post("/recurring-invoices/run-due")
async def run_due_recurring(current_user: dict = Depends(get_current_user)):
    """Generate invoices for all active recurring templates whose next_run_date <= today."""
    today = now_utc().date().isoformat()
    recs = await db.recurring_invoices.find({"user_id": current_user["id"], "is_active": True}, {"_id": 0}).to_list(500)
    generated = []
    for rec in recs:
        # Generate until next_run_date is in the future
        guard = 0
        while rec.get("next_run_date") and rec["next_run_date"] <= today and guard < 24:
            inv = await _generate_invoice_from_recurring(rec)
            generated.append(inv["id"])
            rec = await db.recurring_invoices.find_one({"id": rec["id"]}, {"_id": 0})
            guard += 1
    return {"generated": generated, "count": len(generated)}

# -----------------------
# Email Reminders (Resend)
# -----------------------
class EmailSendIn(BaseModel):
    to: EmailStr
    subject: str
    html: str
    invoice_id: Optional[str] = None
    cc: Optional[List[EmailStr]] = None

@api_router.get("/email/status")
async def email_status(current_user: dict = Depends(get_current_user)):
    return {
        "configured": bool(RESEND_API_KEY),
        "sender": SENDER_EMAIL,
        "provider": "resend",
        "note": ("Email sending is active." if RESEND_API_KEY else
                 "Email sending is NOT configured. Add RESEND_API_KEY to backend .env to enable real sending. The compose UI will still generate a preview."),
    }

@api_router.post("/email/send")
async def send_email(data: EmailSendIn, current_user: dict = Depends(get_current_user)):
    log_doc = {
        "id": new_id(),
        "user_id": current_user["id"],
        "to": str(data.to),
        "subject": data.subject,
        "html": data.html,
        "invoice_id": data.invoice_id,
        "status": "pending",
        "provider_id": None,
        "error": None,
        "created_at": now_utc().isoformat(),
    }
    if not RESEND_API_KEY:
        log_doc["status"] = "not_configured"
        await db.email_logs.insert_one(log_doc)
        return {"ok": False, "status": "not_configured", "message": "Email service not configured. Add RESEND_API_KEY to backend .env to enable real sending."}
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [str(data.to)],
            "subject": data.subject,
            "html": data.html,
        }
        if data.cc:
            params["cc"] = [str(x) for x in data.cc]
        result = await asyncio.to_thread(resend.Emails.send, params)
        log_doc["status"] = "sent"
        log_doc["provider_id"] = result.get("id") if isinstance(result, dict) else None
        await db.email_logs.insert_one(log_doc)
        return {"ok": True, "status": "sent", "provider_id": log_doc["provider_id"]}
    except Exception as e:
        err = str(e)
        log_doc["status"] = "failed"
        log_doc["error"] = err
        await db.email_logs.insert_one(log_doc)
        logger.error("Email send failed: %s", err)
        raise HTTPException(status_code=502, detail=f"Email send failed: {err}")

# -----------------------
# Root
# -----------------------
@api_router.get("/")
async def root():
    return {"message": "Lancely API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
