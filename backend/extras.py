"""Lancely Phase 5 — extra endpoints.

Holds the new feature endpoints separated from server.py to keep concerns small:
- Expenses CRUD
- Partial payments on invoices
- Reports: P&L, Aging, Cash Flow, Client Profitability
- Document templates
- Bulk actions on invoices
- Public client portal (tokenized)
- Auto reminder settings
- Activity feed
- Backup / restore
- AI invoice generator (Emergent universal key)
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone, date
import uuid
import io
import csv
import json
import os
import asyncio
import logging
import secrets


logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


# Activity logger ---------------------------------------------------------

async def log_activity(db, user_id: str, entity_type: str, entity_id: Optional[str], action: str, details: Optional[dict] = None):
    try:
        await db.activity_log.insert_one({
            "id": new_id(),
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "details": details or {},
            "created_at": now_utc().isoformat(),
        })
    except Exception as e:
        logger.warning("activity log failed: %s", e)


# ---------- Models ----------

class ExpenseIn(BaseModel):
    date: Optional[str] = None
    category: str = "general"
    vendor: Optional[str] = None
    amount: float = 0.0
    currency: Optional[str] = None
    notes: Optional[str] = None
    project_id: Optional[str] = None


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    date: Optional[str] = None
    method: Optional[str] = None
    note: Optional[str] = None


class TemplateIn(BaseModel):
    name: str
    notes: Optional[str] = None
    items: list = []


class BulkActionIn(BaseModel):
    ids: List[str]
    action: str  # "mark_paid" | "mark_unpaid" | "delete"


class ReminderSettingsIn(BaseModel):
    auto_reminders_enabled: Optional[bool] = None
    remind_days_before_due: Optional[List[int]] = None
    remind_days_after_due: Optional[List[int]] = None


class AIParseIn(BaseModel):
    text: str
    currency: Optional[str] = "AED"


class AIComposeEmailIn(BaseModel):
    invoice_id: Optional[str] = None
    flavor: str = "gentle"  # gentle | firm | overdue | follow_up_quote | thank_you | project_update
    extra_context: Optional[str] = None


class AICategorizeIn(BaseModel):
    vendor: Optional[str] = None
    notes: Optional[str] = None
    amount: Optional[float] = None


# ---------- Router builder ----------

def build_extras_router(
    db,
    get_current_user,
    serialize_doc,
    CURRENCY_CODES,
    api_base_for_links,
):
    """Returns an APIRouter wired to the main app's dependencies."""
    r = APIRouter()

    # =====================================================================
    # Expenses
    # =====================================================================
    @r.post("/expenses")
    async def create_expense(data: ExpenseIn, user: dict = Depends(get_current_user)):
        currency = (data.currency or user.get("currency") or "AED").upper()
        if currency not in CURRENCY_CODES:
            currency = "AED"
        doc = {
            "id": new_id(),
            "user_id": user["id"],
            "date": data.date or now_utc().date().isoformat(),
            "category": (data.category or "general").strip(),
            "vendor": data.vendor or "",
            "amount": round(float(data.amount or 0), 2),
            "currency": currency,
            "notes": data.notes,
            "project_id": data.project_id,
            "created_at": now_utc().isoformat(),
        }
        await db.expenses.insert_one(doc)
        await log_activity(db, user["id"], "expense", doc["id"], "created", {"amount": doc["amount"], "category": doc["category"]})
        return serialize_doc(doc)

    @r.get("/expenses")
    async def list_expenses(user: dict = Depends(get_current_user)):
        items = await db.expenses.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
        return [serialize_doc(x) for x in items]

    @r.put("/expenses/{eid}")
    async def update_expense(eid: str, data: ExpenseIn, user: dict = Depends(get_current_user)):
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "currency" in updates:
            updates["currency"] = updates["currency"].upper() if updates["currency"].upper() in CURRENCY_CODES else "AED"
        if "amount" in updates:
            updates["amount"] = round(float(updates["amount"]), 2)
        res = await db.expenses.update_one({"id": eid, "user_id": user["id"]}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Expense not found")
        doc = await db.expenses.find_one({"id": eid}, {"_id": 0})
        await log_activity(db, user["id"], "expense", eid, "updated", updates)
        return serialize_doc(doc)

    @r.delete("/expenses/{eid}")
    async def delete_expense(eid: str, user: dict = Depends(get_current_user)):
        res = await db.expenses.delete_one({"id": eid, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Expense not found")
        await log_activity(db, user["id"], "expense", eid, "deleted")
        return {"ok": True}

    # =====================================================================
    # Partial payments on invoices
    # =====================================================================
    @r.post("/invoices/{inv_id}/payments")
    async def add_payment(inv_id: str, data: PaymentIn, user: dict = Depends(get_current_user)):
        inv = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        payments = inv.get("payments") or []
        payment = {
            "id": new_id(),
            "amount": round(float(data.amount), 2),
            "date": data.date or now_utc().date().isoformat(),
            "method": data.method,
            "note": data.note,
        }
        payments.append(payment)
        paid_amount = round(sum(float(p.get("amount", 0)) for p in payments), 2)
        total = float(inv.get("total", 0) or 0)
        new_status = inv.get("status", "unpaid")
        payment_date = inv.get("payment_date")
        if paid_amount + 0.005 >= total > 0:
            new_status = "paid"
            payment_date = payment["date"]
        elif inv.get("status") == "paid" and paid_amount + 0.005 < total:
            new_status = "unpaid"
            payment_date = None
        updates = {
            "payments": payments,
            "paid_amount": paid_amount,
            "status": new_status,
            "payment_date": payment_date,
        }
        await db.invoices.update_one({"id": inv_id}, {"$set": updates})
        await log_activity(db, user["id"], "invoice", inv_id, "payment_added", {"amount": payment["amount"], "paid_amount": paid_amount})
        doc = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
        return serialize_doc(doc)

    @r.delete("/invoices/{inv_id}/payments/{pay_id}")
    async def delete_payment(inv_id: str, pay_id: str, user: dict = Depends(get_current_user)):
        inv = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        payments = [p for p in (inv.get("payments") or []) if p.get("id") != pay_id]
        paid_amount = round(sum(float(p.get("amount", 0)) for p in payments), 2)
        total = float(inv.get("total", 0) or 0)
        new_status = "paid" if (total > 0 and paid_amount + 0.005 >= total) else "unpaid"
        await db.invoices.update_one({"id": inv_id}, {"$set": {
            "payments": payments,
            "paid_amount": paid_amount,
            "status": new_status,
            "payment_date": None if new_status != "paid" else inv.get("payment_date"),
        }})
        await log_activity(db, user["id"], "invoice", inv_id, "payment_removed", {"paid_amount": paid_amount})
        doc = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
        return serialize_doc(doc)

    # =====================================================================
    # Reports
    # =====================================================================
    def _between(d: Optional[str], start: str, end: str) -> bool:
        return bool(d and start <= d <= end)

    @r.get("/reports/pl")
    async def pl_report(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(get_current_user)):
        today = now_utc().date()
        end = end or today.isoformat()
        start = start or (today.replace(day=1) - timedelta(days=365)).isoformat()
        invs = await db.invoices.find({"user_id": user["id"], "status": "paid"}, {"_id": 0}).to_list(5000)
        exps = await db.expenses.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        income = 0.0
        expense = 0.0
        by_month_income, by_month_expense = {}, {}
        for inv in invs:
            d = inv.get("payment_date") or inv.get("issue_date")
            if _between(d, start, end):
                amt = float(inv.get("total", 0) or 0)
                income += amt
                by_month_income[d[:7]] = by_month_income.get(d[:7], 0) + amt
        for e in exps:
            d = e.get("date")
            if _between(d, start, end):
                amt = float(e.get("amount", 0) or 0)
                expense += amt
                by_month_expense[d[:7]] = by_month_expense.get(d[:7], 0) + amt
        months = sorted(set(list(by_month_income.keys()) + list(by_month_expense.keys())))
        series = [{
            "month": m,
            "income": round(by_month_income.get(m, 0), 2),
            "expense": round(by_month_expense.get(m, 0), 2),
            "net": round(by_month_income.get(m, 0) - by_month_expense.get(m, 0), 2),
        } for m in months]
        return {
            "start": start, "end": end,
            "income": round(income, 2),
            "expense": round(expense, 2),
            "net": round(income - expense, 2),
            "series": series,
        }

    @r.get("/reports/aging")
    async def aging_report(user: dict = Depends(get_current_user)):
        today = now_utc().date()
        invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        buckets = {"current": 0.0, "1-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
        rows = []
        for inv in invs:
            if inv.get("status") == "paid":
                continue
            due = inv.get("due_date")
            if not due:
                continue
            try:
                due_d = datetime.fromisoformat(due).date()
            except Exception:
                continue
            outstanding = float(inv.get("total", 0) or 0) - float(inv.get("paid_amount", 0) or 0)
            if outstanding <= 0:
                continue
            days = (today - due_d).days
            if days <= 0:
                bucket = "current"
            elif days <= 30:
                bucket = "1-30"
            elif days <= 60:
                bucket = "31-60"
            elif days <= 90:
                bucket = "61-90"
            else:
                bucket = "90+"
            buckets[bucket] += outstanding
            rows.append({
                "invoice_id": inv["id"],
                "number": inv.get("number"),
                "client_id": inv.get("client_id"),
                "due_date": due,
                "days_overdue": max(0, days),
                "outstanding": round(outstanding, 2),
                "bucket": bucket,
                "currency": inv.get("currency", "AED"),
            })
        return {"buckets": {k: round(v, 2) for k, v in buckets.items()}, "rows": rows}

    @r.get("/reports/cashflow")
    async def cashflow_report(user: dict = Depends(get_current_user)):
        today = now_utc().date()
        invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        b30 = b60 = b90 = 0.0
        for inv in invs:
            if inv.get("status") == "paid":
                continue
            outstanding = float(inv.get("total", 0) or 0) - float(inv.get("paid_amount", 0) or 0)
            if outstanding <= 0:
                continue
            due = inv.get("due_date")
            if not due:
                continue
            try:
                due_d = datetime.fromisoformat(due).date()
            except Exception:
                continue
            days = (due_d - today).days
            if days <= 30:
                b30 += outstanding
            if days <= 60:
                b60 += outstanding
            if days <= 90:
                b90 += outstanding
        return {"next_30_days": round(b30, 2), "next_60_days": round(b60, 2), "next_90_days": round(b90, 2)}

    @r.get("/reports/client-profitability")
    async def client_profitability(user: dict = Depends(get_current_user)):
        clients = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        invs = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
        out = []
        for c in clients:
            c_invs = [i for i in invs if i.get("client_id") == c["id"]]
            revenue = sum(float(i.get("total", 0) or 0) for i in c_invs if i.get("status") == "paid")
            outstanding = sum(max(0, float(i.get("total", 0) or 0) - float(i.get("paid_amount", 0) or 0)) for i in c_invs if i.get("status") != "paid")
            # average days to pay
            paid = [i for i in c_invs if i.get("status") == "paid" and i.get("payment_date") and i.get("issue_date")]
            day_diffs = []
            for i in paid:
                try:
                    pd = datetime.fromisoformat(i["payment_date"]).date()
                    isd = datetime.fromisoformat(i["issue_date"]).date()
                    day_diffs.append((pd - isd).days)
                except Exception:
                    pass
            avg_days = round(sum(day_diffs) / len(day_diffs), 1) if day_diffs else None
            out.append({
                "client_id": c["id"],
                "name": c.get("name"),
                "company": c.get("company"),
                "revenue": round(revenue, 2),
                "outstanding": round(outstanding, 2),
                "invoice_count": len(c_invs),
                "avg_days_to_pay": avg_days,
            })
        out.sort(key=lambda x: x["revenue"], reverse=True)
        return out

    # =====================================================================
    # Document Templates
    # =====================================================================
    @r.post("/templates")
    async def create_template(data: TemplateIn, user: dict = Depends(get_current_user)):
        items = []
        for it in (data.items or []):
            items.append({
                "description": it.get("description", ""),
                "quantity": float(it.get("quantity") or 1),
                "rate": float(it.get("rate") or 0),
            })
        doc = {
            "id": new_id(),
            "user_id": user["id"],
            "name": data.name.strip(),
            "notes": data.notes,
            "items": items,
            "created_at": now_utc().isoformat(),
        }
        await db.templates.insert_one(doc)
        return serialize_doc(doc)

    @r.get("/templates")
    async def list_templates(user: dict = Depends(get_current_user)):
        items = await db.templates.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(500)
        return [serialize_doc(x) for x in items]

    @r.delete("/templates/{tid}")
    async def delete_template(tid: str, user: dict = Depends(get_current_user)):
        res = await db.templates.delete_one({"id": tid, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Template not found")
        return {"ok": True}

    # =====================================================================
    # Bulk Invoice Actions
    # =====================================================================
    @r.post("/invoices/bulk")
    async def bulk_invoice_action(data: BulkActionIn, user: dict = Depends(get_current_user)):
        ids = data.ids or []
        if not ids:
            raise HTTPException(400, "No ids provided")
        invs = await db.invoices.find({"id": {"$in": ids}, "user_id": user["id"]}, {"_id": 0}).to_list(2000)
        affected = [i["id"] for i in invs]
        if data.action == "mark_paid":
            today = now_utc().date().isoformat()
            await db.invoices.update_many(
                {"id": {"$in": affected}},
                {"$set": {"status": "paid", "payment_date": today}},
            )
        elif data.action == "mark_unpaid":
            await db.invoices.update_many(
                {"id": {"$in": affected}},
                {"$set": {"status": "unpaid", "payment_date": None}},
            )
        elif data.action == "delete":
            await db.invoices.delete_many({"id": {"$in": affected}})
        else:
            raise HTTPException(400, "Unknown action")
        await log_activity(db, user["id"], "invoice", None, f"bulk_{data.action}", {"ids": affected, "count": len(affected)})
        return {"ok": True, "affected": len(affected)}

    # =====================================================================
    # Public client portal
    # =====================================================================
    @r.post("/invoices/{inv_id}/share")
    async def create_share_link(inv_id: str, user: dict = Depends(get_current_user)):
        inv = await db.invoices.find_one({"id": inv_id, "user_id": user["id"]}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        token = inv.get("public_token")
        if not token:
            token = secrets.token_urlsafe(24)
            await db.invoices.update_one({"id": inv_id}, {"$set": {"public_token": token}})
        return {"token": token}

    @r.get("/public/invoices/{token}")
    async def get_public_invoice(token: str):
        inv = await db.invoices.find_one({"public_token": token}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        inv = serialize_doc(inv)
        client = await db.clients.find_one({"id": inv.get("client_id")}, {"_id": 0})
        user = await db.users.find_one({"id": inv.get("user_id")}, {"_id": 0, "password_hash": 0, "email": 0})
        # log a view event
        await db.activity_log.insert_one({
            "id": new_id(),
            "user_id": inv.get("user_id"),
            "entity_type": "invoice",
            "entity_id": inv["id"],
            "action": "viewed_publicly",
            "details": {"token_used": token[:6] + "..."},
            "created_at": now_utc().isoformat(),
        })
        return {
            "invoice": {k: v for k, v in inv.items() if k not in ("user_id", "public_token")},
            "client": serialize_doc(client) if client else None,
            "business": serialize_doc(user) if user else None,
        }

    # =====================================================================
    # Reminder settings & background scheduler
    # =====================================================================
    @r.put("/reminders/settings")
    async def update_reminder_settings(data: ReminderSettingsIn, user: dict = Depends(get_current_user)):
        updates = {}
        if data.auto_reminders_enabled is not None:
            updates["auto_reminders_enabled"] = bool(data.auto_reminders_enabled)
        if data.remind_days_before_due is not None:
            updates["remind_days_before_due"] = [int(x) for x in data.remind_days_before_due if int(x) >= 0]
        if data.remind_days_after_due is not None:
            updates["remind_days_after_due"] = [int(x) for x in data.remind_days_after_due if int(x) >= 0]
        if updates:
            await db.users.update_one({"id": user["id"]}, {"$set": {"reminder_settings": updates}})
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return serialize_doc(u).get("reminder_settings", {})

    @r.get("/reminders/settings")
    async def get_reminder_settings(user: dict = Depends(get_current_user)):
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return serialize_doc(u).get("reminder_settings", {
            "auto_reminders_enabled": False,
            "remind_days_before_due": [3],
            "remind_days_after_due": [1, 7],
        })

    # =====================================================================
    # Activity feed
    # =====================================================================
    @r.get("/activity")
    async def list_activity(limit: int = 50, user: dict = Depends(get_current_user)):
        rows = await db.activity_log.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
        return [serialize_doc(x) for x in rows]

    # =====================================================================
    # Backup / restore
    # =====================================================================
    @r.get("/backup.json")
    async def backup_json(token: Optional[str] = None, user: dict = Depends(get_current_user)):
        # `user` is from Bearer; the `token` query param fallback is for browser download triggers.
        uid = user["id"]
        collections = ["clients", "quotations", "invoices", "projects", "recurring_invoices", "expenses", "templates", "activity_log"]
        out = {"exported_at": now_utc().isoformat(), "user": {k: v for k, v in user.items() if k not in ("password_hash",)}}
        for c in collections:
            rows = await db[c].find({"user_id": uid}, {"_id": 0}).to_list(50000)
            out[c] = [serialize_doc(r) for r in rows]
        body = json.dumps(out, indent=2, default=str).encode("utf-8")
        return Response(
            content=body,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=lancely-backup.json"},
        )

    class RestoreIn(BaseModel):
        data: dict
        replace: bool = False

    @r.post("/backup/restore")
    async def backup_restore(payload: RestoreIn, user: dict = Depends(get_current_user)):
        uid = user["id"]
        data = payload.data or {}
        collections = ["clients", "quotations", "invoices", "projects", "recurring_invoices", "expenses", "templates"]
        if payload.replace:
            for c in collections:
                await db[c].delete_many({"user_id": uid})
        counts = {}
        for c in collections:
            rows = data.get(c) or []
            inserted = 0
            for row in rows:
                if not isinstance(row, dict):
                    continue
                row.pop("_id", None)
                row["user_id"] = uid
                if not row.get("id"):
                    row["id"] = new_id()
                # Avoid duplicate id collisions
                exists = await db[c].find_one({"id": row["id"], "user_id": uid})
                if exists:
                    await db[c].update_one({"id": row["id"]}, {"$set": row})
                else:
                    await db[c].insert_one(row)
                inserted += 1
            counts[c] = inserted
        await log_activity(db, uid, "system", None, "restore", counts)
        return {"ok": True, "restored": counts}

    return r


# ---------- Scheduler (auto reminders) ----------

async def process_due_reminders(db, send_email_fn):
    """Hourly job: for each user with auto_reminders_enabled, find invoices whose due_date is within
    remind_days_before_due or remind_days_after_due, and send a reminder if one hasn't been sent
    in the last 23 hours."""
    today = now_utc().date()
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(5000)
    for user in users:
        settings = (user.get("reminder_settings") or {})
        if not settings.get("auto_reminders_enabled"):
            continue
        before = settings.get("remind_days_before_due", [3])
        after = settings.get("remind_days_after_due", [1, 7])
        target_dates_before = {(today + timedelta(days=d)).isoformat() for d in before}
        target_dates_after = {(today - timedelta(days=d)).isoformat() for d in after}
        targets = target_dates_before | target_dates_after
        if not targets:
            continue
        invs = await db.invoices.find({
            "user_id": user["id"],
            "status": {"$ne": "paid"},
            "due_date": {"$in": list(targets)},
        }, {"_id": 0}).to_list(2000)
        for inv in invs:
            recent_log = await db.email_logs.find_one({
                "user_id": user["id"],
                "invoice_id": inv["id"],
                "created_at": {"$gte": (now_utc() - timedelta(hours=23)).isoformat()},
            })
            if recent_log:
                continue
            client = await db.clients.find_one({"id": inv.get("client_id")}, {"_id": 0})
            if not client or not client.get("email"):
                continue
            due_date = inv.get("due_date")
            try:
                dd = datetime.fromisoformat(due_date).date()
                days_diff = (today - dd).days
            except Exception:
                days_diff = 0
            if days_diff > 0:
                state = f"is {days_diff} day(s) overdue"
            elif days_diff < 0:
                state = f"is due in {-days_diff} day(s)"
            else:
                state = "is due today"
            business = (user.get("business_name") or user.get("name") or "Lancely").strip()
            subject = f"Friendly reminder: Invoice {inv.get('number')} {state}"
            currency = inv.get("currency", "AED")
            total = inv.get("total", 0)
            outstanding = float(total or 0) - float(inv.get("paid_amount", 0) or 0)
            html = f"""
            <p>Hi {client.get('name', 'there')},</p>
            <p>This is a friendly automated reminder that invoice <b>{inv.get('number')}</b>
               for <b>{currency} {outstanding:,.2f}</b> {state} (due {due_date}).</p>
            <p>If you've already paid, please ignore this message.</p>
            <p>Thanks,<br/>{business}</p>
            """.strip()
            try:
                result = await send_email_fn(user["id"], inv["id"], client["email"], subject, html)
                await log_activity(db, user["id"], "invoice", inv["id"], "auto_reminder_sent",
                                   {"to": client["email"], "status": result.get("status")})
            except Exception as e:
                logger.warning("auto reminder failed for invoice %s: %s", inv.get("id"), e)


# ---------- AI invoice generator helper ----------

async def ai_call(system_prompt: str, user_text: str, *, json_only: bool = False) -> str:
    """Single-shot Emergent LLM call returning the raw text. Cleans code fences if json_only."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(503, "AI is not configured (EMERGENT_LLM_KEY missing)")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    except Exception as e:
        raise HTTPException(500, f"emergentintegrations not available: {e}")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"ai-{new_id()}",
        system_message=system_prompt,
    ).with_model("anthropic", "claude-sonnet-4-6")
    chunks: List[str] = []
    try:
        async for event in chat.stream_message(UserMessage(text=user_text)):
            if isinstance(event, TextDelta):
                chunks.append(event.content)
            elif isinstance(event, StreamDone):
                break
    except Exception as e:
        raise HTTPException(502, f"LLM call failed: {e}")
    raw = "".join(chunks).strip()
    if json_only and raw.startswith("```"):
        raw = raw.strip("`")
        nl = raw.find("\n")
        if nl != -1:
            raw = raw[nl + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
    return raw


async def ai_parse_invoice(prompt_text: str, currency: str = "AED") -> dict:
    system_prompt = (
        "You are an invoicing assistant. Given a freelancer's natural-language description of work, "
        "produce a JSON object with: 'title' (short string), 'items' (array of {description, quantity, rate}), "
        "and optional 'notes'. Use the currency code provided. Quantity and rate are numeric. "
        "Reply with ONLY valid JSON, no markdown, no commentary."
    )
    user_text = f"Currency: {currency}\nDescription:\n{prompt_text}"
    raw = await ai_call(system_prompt, user_text, json_only=True)
    try:
        parsed = json.loads(raw)
    except Exception as e:
        logger.warning("AI returned non-JSON: %s | err=%s", raw[:300], e)
        raise HTTPException(502, "AI returned invalid JSON; please try a clearer description")
    items_in = parsed.get("items") or []
    items = []
    for it in items_in:
        try:
            items.append({
                "description": str(it.get("description") or "").strip(),
                "quantity": float(it.get("quantity") or 1),
                "rate": float(it.get("rate") or 0),
            })
        except Exception:
            continue
    return {
        "title": str(parsed.get("title") or "Invoice").strip(),
        "items": items,
        "notes": parsed.get("notes"),
    }


async def ai_compose_email(*, business_name: str, client_name: Optional[str], invoice_number: Optional[str],
                           currency: str, outstanding: float, due_date: Optional[str], days_overdue: int,
                           flavor: str, extra_context: Optional[str]) -> dict:
    flavor_map = {
        "gentle": "polite, warm, and assume the client just got busy",
        "firm": "professional but firm, indicate this is not the first attempt",
        "overdue": "direct, list the days overdue and ask for a specific payment date",
        "follow_up_quote": "follow up on a quotation that was sent; ask if the client has questions",
        "thank_you": "thank the client for prompt payment and reinforce the relationship",
        "project_update": "share a friendly project status update and next steps",
    }
    tone = flavor_map.get(flavor, "professional and warm")
    system_prompt = (
        "You write short, professional client emails for a UAE-based freelancer. "
        "Tone: " + tone + ". Keep it 3-5 sentences. Address the client by first name when known. "
        "Sign off with the freelancer's business name. "
        "Reply as a JSON object with keys 'subject' (string) and 'html' (HTML string with <p> paragraphs only — no <html>, <body>, or scripts). "
        "Reply with ONLY valid JSON, no markdown, no commentary."
    )
    parts = [
        f"Freelancer / Business name: {business_name}",
        f"Client name: {client_name or 'Client'}",
        f"Invoice number: {invoice_number or 'N/A'}",
        f"Currency: {currency}",
        f"Outstanding amount: {outstanding:.2f}",
        f"Due date: {due_date or 'unspecified'}",
        f"Days overdue (negative = days until due): {days_overdue}",
        f"Email flavor: {flavor}",
    ]
    if extra_context:
        parts.append(f"Extra context from freelancer: {extra_context}")
    raw = await ai_call(system_prompt, "\n".join(parts), json_only=True)
    try:
        parsed = json.loads(raw)
        subject = str(parsed.get("subject") or "").strip()
        html = str(parsed.get("html") or "").strip()
        if not subject or not html:
            raise ValueError("Missing subject or html")
        return {"subject": subject, "html": html}
    except Exception as e:
        logger.warning("AI email JSON parse failed: %s | err=%s", raw[:300], e)
        raise HTTPException(502, "AI returned invalid JSON for email; please try again")


EXPENSE_CATEGORIES = [
    "software", "subscriptions", "hardware", "office", "travel", "fuel",
    "meals", "marketing", "advertising", "design_assets", "stock_media",
    "legal", "accounting", "bank_fees", "utilities", "phone_internet",
    "education", "freelancers", "outsourcing", "rent", "tax", "general"
]


async def ai_categorize_expense(vendor: Optional[str], notes: Optional[str], amount: Optional[float]) -> dict:
    if not vendor and not notes:
        return {"category": "general", "confidence": 0.0}
    system_prompt = (
        "You categorize freelancer business expenses. Pick exactly ONE category from this list: "
        + ", ".join(EXPENSE_CATEGORIES) + ". "
        "Reply as JSON {\"category\": <one of the list>, \"confidence\": <0..1 float>}. "
        "Reply with ONLY valid JSON, no markdown, no commentary."
    )
    user_text = f"Vendor: {vendor or ''}\nNotes: {notes or ''}\nAmount: {amount or 0}"
    raw = await ai_call(system_prompt, user_text, json_only=True)
    try:
        parsed = json.loads(raw)
        cat = str(parsed.get("category") or "general").lower().strip()
        if cat not in EXPENSE_CATEGORIES:
            cat = "general"
        return {"category": cat, "confidence": float(parsed.get("confidence") or 0.7)}
    except Exception:
        return {"category": "general", "confidence": 0.0}


def attach_ai_routes(router: APIRouter, get_current_user, db):
    @router.post("/ai/parse-invoice")
    async def parse_invoice(data: AIParseIn, user: dict = Depends(get_current_user)):
        if not data.text or len(data.text.strip()) < 4:
            raise HTTPException(400, "Description is too short")
        currency = (data.currency or user.get("currency") or "AED").upper()
        return await ai_parse_invoice(data.text, currency)

    @router.post("/ai/compose-email")
    async def compose_email(data: AIComposeEmailIn, user: dict = Depends(get_current_user)):
        inv = None
        client = None
        if data.invoice_id:
            inv = await db.invoices.find_one({"id": data.invoice_id, "user_id": user["id"]}, {"_id": 0})
            if inv:
                client = await db.clients.find_one({"id": inv.get("client_id")}, {"_id": 0})
        outstanding = 0.0
        days_overdue = 0
        if inv:
            total = float(inv.get("total", 0) or 0)
            paid = float(inv.get("paid_amount", 0) or 0)
            outstanding = max(0.0, total - paid)
            due = inv.get("due_date")
            if due:
                try:
                    dd = datetime.fromisoformat(due).date()
                    days_overdue = (now_utc().date() - dd).days
                except Exception:
                    pass
        result = await ai_compose_email(
            business_name=user.get("business_name") or user.get("name") or "Lancely",
            client_name=(client or {}).get("name"),
            invoice_number=(inv or {}).get("number"),
            currency=(inv or {}).get("currency") or user.get("currency") or "AED",
            outstanding=outstanding,
            due_date=(inv or {}).get("due_date"),
            days_overdue=days_overdue,
            flavor=data.flavor,
            extra_context=data.extra_context,
        )
        return {**result, "to": (client or {}).get("email") or ""}

    @router.post("/ai/categorize-expense")
    async def categorize_expense(data: AICategorizeIn, user: dict = Depends(get_current_user)):
        return await ai_categorize_expense(data.vendor, data.notes, data.amount)

    return router
