from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Response
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
import uuid
import bcrypt
import jwt
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

class InvoiceIn(BaseModel):
    client_id: str
    title: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "unpaid"  # unpaid|paid|overdue
    items: List[LineItem] = []
    project_id: Optional[str] = None

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
