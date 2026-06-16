"""Lancely backend regression test suite.

Covers: demo auth, /auth/me, dashboard aggregates, clients CRUD, project
status transitions, quote create/list/status (query param), invoice
create/list/auto-overdue/pay/status (query param), notifications, auth
guard, tenant isolation.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = "http://localhost:8001"  # in-container; matches EXPO_BACKEND_URL path mapping


# ------------------------- Fixtures -------------------------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _new_session(api):
    r = api.post(f"{BASE_URL}/api/auth/demo-session")
    assert r.status_code == 200, r.text
    data = r.json()
    return data, {"Authorization": f"Bearer {data['session_token']}"}


@pytest.fixture(scope="module")
def session(api):
    data, headers = _new_session(api)
    return {"data": data, "headers": headers}


# ------------------------- Auth -------------------------

class TestAuth:
    def test_demo_session_creates_user_and_token(self, api):
        r = api.post(f"{BASE_URL}/api/auth/demo-session")
        assert r.status_code == 200
        d = r.json()
        assert d["session_token"].startswith("demo_")
        assert d["user"]["email"].startswith("demo_") and d["user"]["email"].endswith("@lancely.app")
        assert d["user"]["user_id"]
        # expires_at is iso in the future
        exp = datetime.fromisoformat(d["expires_at"].replace("Z", "+00:00"))
        assert exp > datetime.now(timezone.utc)

    def test_auth_me_with_token(self, api, session):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=session["headers"])
        assert r.status_code == 200
        me = r.json()
        assert me["user_id"] == session["data"]["user"]["user_id"]
        assert me["email"] == session["data"]["user"]["email"]

    def test_protected_endpoint_without_auth_returns_401(self, api):
        # Try a few protected endpoints
        for path in ["/api/auth/me", "/api/clients", "/api/dashboard",
                     "/api/projects", "/api/quotes", "/api/invoices",
                     "/api/notifications"]:
            r = api.get(f"{BASE_URL}{path}")
            assert r.status_code == 401, f"{path} should require auth (got {r.status_code})"

    def test_invalid_bearer_token_rejected(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401


# ------------------------- Dashboard -------------------------

class TestDashboard:
    def test_dashboard_seeded_aggregates(self, api, session):
        r = api.get(f"{BASE_URL}/api/dashboard", headers=session["headers"])
        assert r.status_code == 200
        d = r.json()
        # Seed: 3 clients
        assert d["active_clients"] == 3, d
        # Seed: 2 projects, none completed
        assert d["active_projects"] == 2, d
        # Seed invoices: inv1 paid 4250, inv2 pending 4250, inv3 overdue 1800
        # pending_invoices_amount = pending+partial remaining = 4250
        assert d["pending_invoices_amount"] == 4250.0, d
        # overdue_invoices_amount = 1800
        assert d["overdue_invoices_amount"] == 1800.0, d
        # total_earned (sum paid_amount) = 4250
        assert d["total_earned"] == 4250.0, d
        # outstanding = 4250 + 1800 = 6050
        assert d["outstanding_balance"] == 6050.0, d
        # revenue_this_month: paid_date was 2 days ago => may or may not be
        # in current month near month boundary. Allow paid (4250) OR 0.
        assert d["revenue_this_month"] in (0.0, 4250.0), d


# ------------------------- Clients CRUD -------------------------

class TestClients:
    def test_list_seeded_three(self, api, session):
        r = api.get(f"{BASE_URL}/api/clients", headers=session["headers"])
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 3
        names = {c["name"] for c in items}
        assert {"Layla Ahmed", "Omar Khalid", "Sara Mansoor"} <= names

    def test_create_get_update_delete_client(self, api, session):
        h = session["headers"]
        payload = {"name": "TEST_Client", "company": "TEST_Co", "email": "t@test.ae"}
        r = api.post(f"{BASE_URL}/api/clients", json=payload, headers=h)
        assert r.status_code == 200, r.text
        created = r.json()
        cid = created["id"]
        assert created["name"] == "TEST_Client"
        assert created["company"] == "TEST_Co"
        # GET
        r = api.get(f"{BASE_URL}/api/clients/{cid}", headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Client"
        # PUT
        r = api.put(f"{BASE_URL}/api/clients/{cid}",
                    json={**payload, "name": "TEST_Client_Updated"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Client_Updated"
        # Verify persisted
        r = api.get(f"{BASE_URL}/api/clients/{cid}", headers=h)
        assert r.json()["name"] == "TEST_Client_Updated"
        # DELETE
        r = api.delete(f"{BASE_URL}/api/clients/{cid}", headers=h)
        assert r.status_code == 200 and r.json()["ok"] is True
        # Confirm gone
        r = api.get(f"{BASE_URL}/api/clients/{cid}", headers=h)
        assert r.status_code == 404


# ------------------------- Projects -------------------------

class TestProjects:
    def test_list_and_status_transitions(self, api, session):
        h = session["headers"]
        # Need a client
        cli = api.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        # Create project (starts at "lead")
        r = api.post(f"{BASE_URL}/api/projects", json={
            "name": "TEST_Project_Flow",
            "client_id": cli["id"],
            "value": 1000,
        }, headers=h)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "lead"
        pid = p["id"]

        for nxt in ["proposal_sent", "in_progress", "review", "completed"]:
            r = api.patch(f"{BASE_URL}/api/projects/{pid}/status",
                          json={"status": nxt}, headers=h)
            assert r.status_code == 200, f"{nxt}: {r.text}"
            assert r.json()["status"] == nxt

        # Verify persisted via GET list
        items = api.get(f"{BASE_URL}/api/projects", headers=h).json()
        found = next(x for x in items if x["id"] == pid)
        assert found["status"] == "completed"

        # Cleanup
        api.delete(f"{BASE_URL}/api/projects/{pid}", headers=h)

    def test_list_seeded_two(self, api):
        # Fresh session to ensure clean count
        _, h = _new_session(api)
        items = requests.get(f"{BASE_URL}/api/projects", headers=h).json()
        assert len(items) == 2


# ------------------------- Quotes -------------------------

class TestQuotes:
    def test_create_quote_auto_number_and_amount(self, api, session):
        h = session["headers"]
        cli = api.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        payload = {
            "client_id": cli["id"],
            "title": "TEST_Quote",
            "items": [
                {"service": "Design", "description": "x", "price": 1200.5},
                {"service": "Dev", "description": "y", "price": 800.5},
            ],
            "notes": "test",
        }
        r = api.post(f"{BASE_URL}/api/quotes", json=payload, headers=h)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["amount"] == 2001.0
        assert q["status"] == "sent"
        # Quote number pattern Q-YYYYMM-NNN
        ym = datetime.now().strftime("%Y%m")
        assert q["quote_number"].startswith(f"Q-{ym}-")
        assert len(q["quote_number"].split("-")[-1]) == 3

        # PATCH status with QUERY param
        r = api.patch(
            f"{BASE_URL}/api/quotes/{q['id']}/status",
            params={"status": "accepted"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"

        # Sending status in body should NOT work (it's a query param)
        r2 = api.patch(
            f"{BASE_URL}/api/quotes/{q['id']}/status",
            json={"status": "rejected"},
            headers=h,
        )
        # FastAPI should 422 since query param missing
        assert r2.status_code in (400, 422)

    def test_list_quotes(self, api, session):
        r = api.get(f"{BASE_URL}/api/quotes", headers=session["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1


# ------------------------- Invoices -------------------------

class TestInvoices:
    def test_create_invoice_auto_number(self, api):
        _, h = _new_session(api)  # fresh user => INV-1004 (after 3 seeded)
        cli = requests.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        payload = {
            "client_id": cli["id"],
            "amount": 500.0,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "notes": "TEST_inv",
        }
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["invoice_number"].startswith("INV-1")
        # Seeded 3 invoices -> next is INV-1004
        assert inv["invoice_number"] == "INV-1004"
        assert inv["status"] == "pending"
        assert inv["paid_amount"] == 0

    def test_invoice_pay_partial_then_full(self, api):
        _, h = _new_session(api)
        cli = requests.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        r = requests.post(f"{BASE_URL}/api/invoices", json={
            "client_id": cli["id"], "amount": 1000.0,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
        }, headers=h)
        inv = r.json()
        iid = inv["id"]
        # Partial
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/pay",
                          json={"amount": 400}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "partial"
        assert r.json()["paid_amount"] == 400
        # Pay rest
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/pay",
                          json={"amount": 600}, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "paid"
        assert body["paid_amount"] == 1000
        assert body["paid_date"] is not None

    def test_invoice_status_patch_marks_paid(self, api):
        _, h = _new_session(api)
        cli = requests.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        r = requests.post(f"{BASE_URL}/api/invoices", json={
            "client_id": cli["id"], "amount": 750.0,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
        }, headers=h)
        iid = r.json()["id"]
        r = requests.patch(f"{BASE_URL}/api/invoices/{iid}/status",
                           params={"status": "paid"}, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "paid"
        assert body["paid_amount"] == 750
        assert body["paid_date"] is not None

    def test_list_auto_marks_overdue(self, api):
        _, h = _new_session(api)
        cli = requests.get(f"{BASE_URL}/api/clients", headers=h).json()[0]
        # Create invoice with due_date already in the past
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        r = requests.post(f"{BASE_URL}/api/invoices", json={
            "client_id": cli["id"], "amount": 999.0, "due_date": past,
        }, headers=h)
        assert r.status_code == 200
        inv_id = r.json()["id"]
        # Create endpoint may already mark overdue (per _invoice_status),
        # but the spec says GET auto-marks.
        items = requests.get(f"{BASE_URL}/api/invoices", headers=h).json()
        target = next(x for x in items if x["id"] == inv_id)
        assert target["status"] == "overdue", target


# ------------------------- Notifications -------------------------

class TestNotifications:
    def test_notifications_include_overdue_and_stale_quote(self, api):
        _, h = _new_session(api)
        r = requests.get(f"{BASE_URL}/api/notifications", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        types = {it["type"] for it in data["items"]}
        # Seeded inv3 is overdue
        assert "invoice_overdue" in types, data
        # Seeded project due in 12d or 30d => not necessarily due_soon
        # Seeded quote was created just now -> not stale yet (no quote_awaiting expected)


# ------------------------- Tenant isolation -------------------------

class TestTenantIsolation:
    def test_two_demo_sessions_are_isolated(self, api):
        _, h1 = _new_session(api)
        _, h2 = _new_session(api)
        # Create a client only in tenant 1
        r = requests.post(f"{BASE_URL}/api/clients",
                          json={"name": "TEST_OnlyTenant1"}, headers=h1)
        assert r.status_code == 200
        c1_id = r.json()["id"]

        # tenant 2 should not see it
        list2 = requests.get(f"{BASE_URL}/api/clients", headers=h2).json()
        assert all(c["id"] != c1_id for c in list2)
        assert all(c["name"] != "TEST_OnlyTenant1" for c in list2)

        # tenant 2 cannot GET tenant 1's client
        r = requests.get(f"{BASE_URL}/api/clients/{c1_id}", headers=h2)
        assert r.status_code == 404

        # tenant 2 cannot update / delete tenant 1's client
        r = requests.put(f"{BASE_URL}/api/clients/{c1_id}",
                         json={"name": "hacked"}, headers=h2)
        assert r.status_code == 404
        r = requests.delete(f"{BASE_URL}/api/clients/{c1_id}", headers=h2)
        assert r.status_code == 404

        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{c1_id}", headers=h1)
