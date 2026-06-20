"""Lancely mobile backend regression suite.

Covers all endpoints exposed in /app/backend/server.py against the live
service at http://localhost:8001 (proxied at solvio-mvp.preview.emergentagent.com).

Run:
    pytest /app/backend/tests/test_lancely_backend.py -v \
        --junitxml=/app/test_reports/pytest/pytest_results.xml
"""
from __future__ import annotations

import os
import random
import string
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

REVIEW_EMAIL = "review@lancely.com"
REVIEW_PASSWORD = "Review123!"

# Note: Pydantic EmailStr (via email-validator) rejects RFC 6761 reserved TLDs
# like .test/.example/.invalid/.localhost. We register against a realistic
# domain so the auth flow itself can be exercised.
QA_DOMAIN = "lancelyqa.com"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------
def _rand_suffix(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def review_token(http):
    """Login as the pre-seeded review account."""
    r = http.post(f"{API}/auth/login", json={
        "email": REVIEW_EMAIL,
        "password": REVIEW_PASSWORD,
    })
    assert r.status_code == 200, f"review login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def review_headers(review_token):
    return {"Authorization": f"Bearer {review_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# 1) Health & root
# ---------------------------------------------------------------------------
class TestHealth:
    def test_health_ok(self, http):
        r = http.get(f"{API}/health")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("db") is True

    def test_api_root(self, http):
        r = http.get(f"{API}/")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 2) Auth flows
# ---------------------------------------------------------------------------
class TestAuth:
    def test_login_review(self, http):
        r = http.post(f"{API}/auth/login", json={
            "email": REVIEW_EMAIL, "password": REVIEW_PASSWORD,
        })
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        assert body["user"]["email"] == REVIEW_EMAIL

    def test_login_wrong_password(self, http):
        r = http.post(f"{API}/auth/login", json={
            "email": REVIEW_EMAIL, "password": "totally-wrong",
        })
        assert r.status_code == 401

    def test_register_new(self, http):
        email = f"qa+{_rand_suffix()}@lancelyqa.com"
        r = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "QA User",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body
        assert body["user"]["email"] == email

    def test_register_duplicate(self, http):
        email = f"qa+dup{_rand_suffix()}@lancelyqa.com"
        first = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "Dup",
        })
        assert first.status_code == 200
        dup = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "Dup",
        })
        assert dup.status_code == 409

    def test_demo_session(self, http):
        r = http.post(f"{API}/auth/demo-session")
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == "demo@lancely.app"
        assert "token" in body

    def test_me_with_token(self, http, review_headers):
        r = http.get(f"{API}/auth/me", headers=review_headers)
        assert r.status_code == 200
        assert r.json()["email"] == REVIEW_EMAIL

    def test_me_without_token(self, http):
        r = http.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_update_me(self, http):
        # Use a fresh QA account so we don't mutate the shared review profile.
        email = f"qa+upd{_rand_suffix()}@lancelyqa.com"
        reg = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "Upd",
        }).json()
        h = {"Authorization": f"Bearer {reg['token']}",
             "Content-Type": "application/json"}
        r = http.put(f"{API}/auth/me", headers=h, json={
            "currency": "USD", "business_name": "QA Co",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == "USD"
        assert body["business_name"] == "QA Co"

    def test_delete_me_then_me_401(self, http):
        email = f"qa+del{_rand_suffix()}@lancelyqa.com"
        reg = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "Del",
        }).json()
        token = reg["token"]
        h = {"Authorization": f"Bearer {token}",
             "Content-Type": "application/json"}
        d = http.delete(f"{API}/auth/me", headers=h)
        assert d.status_code == 204
        # Same token should no longer resolve to a user
        me = http.get(f"{API}/auth/me", headers=h)
        assert me.status_code == 401


# ---------------------------------------------------------------------------
# 3) Sign in with Apple — input validation only
# ---------------------------------------------------------------------------
class TestApple:
    def test_apple_empty_token(self, http):
        r = http.post(f"{API}/auth/apple", json={"identity_token": ""})
        # Must be rejected, never 200.
        assert r.status_code in (400, 401, 422), r.text


# ---------------------------------------------------------------------------
# 4) Currencies
# ---------------------------------------------------------------------------
class TestCurrencies:
    def test_list_currencies(self, http):
        r = http.get(f"{API}/currencies")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        sample = data[0]
        for key in ("code", "symbol", "name"):
            assert key in sample


# ---------------------------------------------------------------------------
# 5) Clients CRUD
# ---------------------------------------------------------------------------
class TestClients:
    def test_list_clients_seed_count(self, http, review_headers):
        r = http.get(f"{API}/clients", headers=review_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Seed says 10 clients for review profile. Allow >=10 in case prior
        # test runs added a few.
        assert len(data) >= 10, f"expected ≥10 seeded clients, got {len(data)}"

    def test_create_get_update_delete(self, http, review_headers):
        cr = http.post(f"{API}/clients", headers=review_headers, json={
            "name": "Test Client", "email": "t@e.com",
        })
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        # GET
        g = http.get(f"{API}/clients/{cid}", headers=review_headers)
        assert g.status_code == 200 and g.json()["name"] == "Test Client"
        # PUT
        p = http.put(f"{API}/clients/{cid}", headers=review_headers, json={
            "name": "Renamed", "email": "t@e.com",
        })
        assert p.status_code == 200 and p.json()["name"] == "Renamed"
        # DELETE
        d = http.delete(f"{API}/clients/{cid}", headers=review_headers)
        assert d.status_code == 204
        # Confirm gone
        gone = http.get(f"{API}/clients/{cid}", headers=review_headers)
        assert gone.status_code == 404


# ---------------------------------------------------------------------------
# 6) Projects CRUD
# ---------------------------------------------------------------------------
class TestProjects:
    def test_list_projects_seed_count(self, http, review_headers):
        r = http.get(f"{API}/projects", headers=review_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 8

    def test_project_lifecycle(self, http, review_headers):
        clients = http.get(f"{API}/clients", headers=review_headers).json()
        cid = clients[0]["id"]
        c = http.post(f"{API}/projects", headers=review_headers, json={
            "name": "P1", "client_id": cid, "status": "active", "value": 1000,
        })
        assert c.status_code == 200, c.text
        pid = c.json()["id"]
        # Status patch (JSON body)
        s = http.patch(f"{API}/projects/{pid}/status", headers=review_headers,
                       json={"status": "completed"})
        assert s.status_code == 200
        assert s.json()["status"] == "completed"
        # DELETE
        d = http.delete(f"{API}/projects/{pid}", headers=review_headers)
        assert d.status_code == 204


# ---------------------------------------------------------------------------
# 7) Quotations
# ---------------------------------------------------------------------------
class TestQuotations:
    def test_list_quotations_seed(self, http, review_headers):
        r = http.get(f"{API}/quotations", headers=review_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_create_status_delete(self, http, review_headers):
        cid = http.get(f"{API}/clients", headers=review_headers).json()[0]["id"]
        body = {
            "client_id": cid,
            "title": "Q1",
            "items": [{"description": "Item", "quantity": 2, "rate": 100}],
            "vat": 5,
        }
        c = http.post(f"{API}/quotations", headers=review_headers, json=body)
        assert c.status_code == 200, c.text
        q = c.json()
        assert q["subtotal"] == 200
        assert q["vat"] == 10
        assert q["total"] == 210
        # Status PATCH via query param
        s = http.patch(f"{API}/quotes/{q['id']}/status",
                       params={"status": "accepted"},
                       headers=review_headers)
        assert s.status_code == 200
        assert s.json()["status"] == "accepted"
        # DELETE
        d = http.delete(f"{API}/quotes/{q['id']}", headers=review_headers)
        assert d.status_code == 204


# ---------------------------------------------------------------------------
# 8) Invoices
# ---------------------------------------------------------------------------
class TestInvoices:
    def test_list_invoices_seed(self, http, review_headers):
        r = http.get(f"{API}/invoices", headers=review_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 15

    def test_invoice_lifecycle(self, http, review_headers):
        cid = http.get(f"{API}/clients", headers=review_headers).json()[0]["id"]
        body = {
            "client_id": cid,
            "items": [{"description": "a", "quantity": 1, "rate": 500}],
            "due_date": "2026-12-31",
            "vat": 5,
        }
        c = http.post(f"{API}/invoices", headers=review_headers, json=body)
        assert c.status_code == 200, c.text
        inv = c.json()
        assert inv["total"] == 525
        iid = inv["id"]

        # Partial payment 300
        p1 = http.post(f"{API}/invoices/{iid}/payments",
                       headers=review_headers, json={"amount": 300})
        assert p1.status_code == 200, p1.text
        body1 = p1.json()
        assert body1["paid_amount"] == 300
        assert body1["status"] in ("unpaid", "overdue")  # not yet paid
        assert body1["status"] != "paid"

        # Second payment 225 -> total 525 (full)
        p2 = http.post(f"{API}/invoices/{iid}/payments",
                       headers=review_headers, json={"amount": 225})
        assert p2.status_code == 200
        body2 = p2.json()
        assert body2["paid_amount"] == 525
        assert body2["status"] == "paid"

        # Flip back to unpaid via PATCH /status
        u = http.patch(f"{API}/invoices/{iid}/status",
                       headers=review_headers, json={"status": "unpaid"})
        assert u.status_code == 200
        body3 = u.json()
        assert body3["paid_amount"] == 0
        assert body3.get("payments") in ([], None)

        # DELETE
        d = http.delete(f"{API}/invoices/{iid}", headers=review_headers)
        assert d.status_code == 204


# ---------------------------------------------------------------------------
# 9) Dashboard / reports / reminders
# ---------------------------------------------------------------------------
class TestAnalytics:
    def test_dashboard_shape(self, http, review_headers):
        r = http.get(f"{API}/analytics/dashboard", headers=review_headers)
        assert r.status_code == 200
        d = r.json()
        for key in ("total_clients", "active_projects", "unpaid_count",
                    "unpaid_amount", "overdue_count", "overdue_amount",
                    "total_revenue", "monthly_earnings", "recent_invoices"):
            assert key in d, f"missing key {key} in dashboard payload"
        assert isinstance(d["monthly_earnings"], list)
        assert len(d["monthly_earnings"]) == 6
        assert isinstance(d["recent_invoices"], list)

    def test_reports_pl(self, http, review_headers):
        r = http.get(f"{API}/reports/pl", headers=review_headers)
        assert r.status_code == 200
        d = r.json()
        for key in ("income", "expense", "net", "series"):
            assert key in d
        assert isinstance(d["series"], list) and len(d["series"]) >= 1
        first = d["series"][0]
        for k in ("month", "income", "expense", "net"):
            assert k in first

    def test_reminders(self, http, review_headers):
        r = http.get(f"{API}/payments/reminders", headers=review_headers)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "rows" in d
        assert isinstance(d["items"], list)


# ---------------------------------------------------------------------------
# 10) CSV export
# ---------------------------------------------------------------------------
class TestCSVExport:
    def test_clients_csv(self, http, review_headers):
        r = http.get(f"{API}/export/clients.csv", headers=review_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower()
        assert r.text.startswith("Name,Company")

    def test_invoices_csv(self, http, review_headers):
        r = http.get(f"{API}/export/invoices.csv", headers=review_headers)
        assert r.status_code == 200
        assert r.text.startswith("Number,Issue Date")

    def test_payments_csv(self, http, review_headers):
        r = http.get(f"{API}/export/payments.csv", headers=review_headers)
        assert r.status_code == 200
        assert r.text.startswith("Invoice,Date")


# ---------------------------------------------------------------------------
# 11) RevenueCat webhook (public)
# ---------------------------------------------------------------------------
class TestWebhook:
    def test_revenuecat(self, http):
        r = http.post(f"{API}/webhooks/revenuecat", json={
            "event": "INITIAL_PURCHASE", "app_user_id": "abc",
        })
        assert r.status_code == 200
        assert r.json().get("received") is True


# ---------------------------------------------------------------------------
# 12) Tenant scoping
# ---------------------------------------------------------------------------
class TestTenantScoping:
    def test_new_user_sees_no_review_clients(self, http):
        email = f"qa+scope{_rand_suffix()}@lancelyqa.com"
        reg = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Test1234!", "name": "Scope",
        })
        assert reg.status_code == 200
        h = {"Authorization": f"Bearer {reg.json()['token']}",
             "Content-Type": "application/json"}
        r = http.get(f"{API}/clients", headers=h)
        assert r.status_code == 200
        assert r.json() == []
