"""
Comprehensive backend API tests for Lancely freelancer management platform.
Tests all endpoints: Auth, Clients, Invoices, Quotations, Projects, Payments, Analytics, PDFs.
"""
import requests
import sys
from datetime import datetime, timedelta
import time

# Use the public endpoint from frontend/.env
BASE_URL = "https://freelancer-hub-47.preview.emergentagent.com/api"

class LancelyAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.token2 = None  # For testing user isolation
        self.user_id = None
        self.user2_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        
    def log(self, msg, level="INFO"):
        """Log test messages"""
        print(f"[{level}] {msg}")
        
    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
        elif self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        self.log(f"\n{'='*80}")
        self.log(f"Test #{self.tests_run}: {name}")
        if description:
            self.log(f"Description: {description}")
        self.log(f"Request: {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: {response.status_code}", "PASS")
                try:
                    resp_data = response.json()
                    self.log(f"Response: {resp_data}")
                    return True, resp_data
                except:
                    return True, {}
            else:
                self.tests_failed += 1
                self.failed_tests.append(name)
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                try:
                    self.log(f"Response: {response.json()}")
                except:
                    self.log(f"Response: {response.text}")
                return False, {}
                
        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(name)
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False, {}
    
    def test_auth_register(self):
        """Test user registration with unique email"""
        timestamp = int(time.time())
        email = f"qa+{timestamp}@lancely.ae"
        success, response = self.run_test(
            "Auth: Register new user",
            "POST",
            "auth/register",
            200,
            data={
                "email": email,
                "password": "TestPass123!",
                "name": "QA Test User",
                "business_name": "QA Testing LLC"
            },
            description="Create a new user and verify JWT token is returned"
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            self.log(f"✓ Token received: {self.token[:20]}...")
            self.log(f"✓ User ID: {self.user_id}")
            return True
        return False
    
    def test_auth_register_duplicate(self):
        """Test duplicate registration rejection"""
        timestamp = int(time.time())
        email = f"qa+dup{timestamp}@lancely.ae"
        
        # First registration
        success1, _ = self.run_test(
            "Auth: Register user (first time)",
            "POST",
            "auth/register",
            200,
            data={"email": email, "password": "Pass123!", "name": "Dup User"},
            description="First registration should succeed"
        )
        
        # Duplicate registration
        success2, _ = self.run_test(
            "Auth: Register duplicate email (should fail)",
            "POST",
            "auth/register",
            400,
            data={"email": email, "password": "Pass123!", "name": "Dup User"},
            description="Duplicate email should return 400"
        )
        
        return success1 and success2
    
    def test_auth_login_valid(self):
        """Test login with valid credentials"""
        # Create a user first
        timestamp = int(time.time())
        email = f"qa+login{timestamp}@lancely.ae"
        password = "LoginTest123!"
        
        self.run_test(
            "Auth: Register user for login test",
            "POST",
            "auth/register",
            200,
            data={"email": email, "password": password, "name": "Login Test User"}
        )
        
        # Now login
        success, response = self.run_test(
            "Auth: Login with valid credentials",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password},
            description="Login should return token"
        )
        
        return success and 'token' in response
    
    def test_auth_login_invalid(self):
        """Test login with wrong password"""
        timestamp = int(time.time())
        email = f"qa+wrongpass{timestamp}@lancely.ae"
        
        # Create user
        self.run_test(
            "Auth: Register user for wrong password test",
            "POST",
            "auth/register",
            200,
            data={"email": email, "password": "CorrectPass123!", "name": "Wrong Pass User"}
        )
        
        # Try wrong password
        success, _ = self.run_test(
            "Auth: Login with wrong password",
            "POST",
            "auth/login",
            401,
            data={"email": email, "password": "WrongPassword!"},
            description="Wrong password should return 401"
        )
        
        return success
    
    def test_auth_me_with_token(self):
        """Test GET /auth/me with valid token"""
        success, response = self.run_test(
            "Auth: GET /auth/me with token",
            "GET",
            "auth/me",
            200,
            description="Should return user data"
        )
        return success and 'email' in response
    
    def test_auth_me_without_token(self):
        """Test GET /auth/me without token"""
        success, _ = self.run_test(
            "Auth: GET /auth/me without token",
            "GET",
            "auth/me",
            401,
            headers={},
            description="Should return 401 without token"
        )
        return success
    
    def test_auth_update_profile(self):
        """Test PUT /auth/me to update business info"""
        success, response = self.run_test(
            "Auth: Update user profile",
            "PUT",
            "auth/me",
            200,
            data={
                "business_name": "Updated Business LLC",
                "trn": "100123456700003",
                "address": "Dubai Marina, UAE",
                "phone": "+971501234567",
                "website": "https://example.ae"
            },
            description="Update business info and verify persistence"
        )
        
        if success:
            # Verify the update persisted
            success2, response2 = self.run_test(
                "Auth: Verify profile update persisted",
                "GET",
                "auth/me",
                200
            )
            if success2:
                return (response2.get('business_name') == "Updated Business LLC" and
                        response2.get('trn') == "100123456700003")
        return False
    
    def test_clients_crud(self):
        """Test Clients CRUD operations"""
        # CREATE
        success, client = self.run_test(
            "Clients: Create client",
            "POST",
            "clients",
            200,
            data={
                "name": "Test Client Ltd",
                "company": "Test Company",
                "email": "client@test.ae",
                "phone": "+971501111111",
                "address": "Dubai, UAE",
                "trn": "100111111100003",
                "notes": "VIP client"
            },
            description="Create a new client"
        )
        
        if not success or 'id' not in client:
            return False
        
        client_id = client['id']
        self.log(f"✓ Client created with ID: {client_id}")
        
        # LIST
        success, clients = self.run_test(
            "Clients: List all clients",
            "GET",
            "clients",
            200,
            description="Get list of clients"
        )
        
        if not success or not isinstance(clients, list):
            return False
        
        # GET by ID
        success, _ = self.run_test(
            "Clients: Get client by ID",
            "GET",
            f"clients/{client_id}",
            200,
            description="Get specific client"
        )
        
        if not success:
            return False
        
        # UPDATE
        success, updated = self.run_test(
            "Clients: Update client",
            "PUT",
            f"clients/{client_id}",
            200,
            data={
                "name": "Updated Client Ltd",
                "company": "Updated Company",
                "email": "updated@test.ae",
                "phone": "+971502222222",
                "address": "Abu Dhabi, UAE",
                "trn": "100222222200003",
                "notes": "Updated notes"
            },
            description="Update client details"
        )
        
        if not success or updated.get('name') != "Updated Client Ltd":
            return False
        
        # DELETE
        success, _ = self.run_test(
            "Clients: Delete client",
            "DELETE",
            f"clients/{client_id}",
            200,
            description="Delete client"
        )
        
        return success
    
    def test_clients_isolation(self):
        """Test that users can only see their own clients"""
        # Create client with user 1
        success, client1 = self.run_test(
            "Clients: User 1 creates client",
            "POST",
            "clients",
            200,
            data={"name": "User 1 Client"}
        )
        
        if not success:
            return False
        
        client1_id = client1['id']
        
        # Create user 2
        timestamp = int(time.time())
        email2 = f"qa+user2{timestamp}@lancely.ae"
        success, response = self.run_test(
            "Clients: Register user 2",
            "POST",
            "auth/register",
            200,
            data={"email": email2, "password": "User2Pass!", "name": "User 2"},
            headers={}
        )
        
        if not success:
            return False
        
        self.token2 = response['token']
        
        # User 2 tries to access user 1's client
        test_headers = {'Authorization': f'Bearer {self.token2}', 'Content-Type': 'application/json'}
        success, _ = self.run_test(
            "Clients: User 2 tries to access User 1's client (should fail)",
            "GET",
            f"clients/{client1_id}",
            404,
            headers=test_headers,
            description="User 2 should get 404 for User 1's client"
        )
        
        # Restore user 1 token
        # (token is already set back in run_test)
        
        return success
    
    def test_invoices_crud_with_vat(self):
        """Test Invoices CRUD with VAT calculations"""
        # First create a client
        success, client = self.run_test(
            "Invoices: Create client for invoice",
            "POST",
            "clients",
            200,
            data={"name": "Invoice Test Client"}
        )
        
        if not success:
            return False
        
        client_id = client['id']
        
        # CREATE invoice
        success, invoice = self.run_test(
            "Invoices: Create invoice with items",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client_id,
                "title": "Website Development",
                "issue_date": "2025-08-01",
                "due_date": "2025-08-15",
                "notes": "Payment terms: Net 14",
                "status": "unpaid",
                "items": [
                    {"description": "Frontend Development", "quantity": 10, "rate": 100},
                    {"description": "Backend Development", "quantity": 8, "rate": 120}
                ]
            },
            description="Create invoice and verify VAT calculation"
        )
        
        if not success:
            return False
        
        # Verify VAT calculation: subtotal = 10*100 + 8*120 = 1000 + 960 = 1960
        # VAT = 1960 * 0.05 = 98
        # Total = 1960 + 98 = 2058
        subtotal = invoice.get('subtotal')
        vat = invoice.get('vat')
        total = invoice.get('total')
        
        self.log(f"✓ Invoice created: {invoice.get('number')}")
        self.log(f"✓ Subtotal: {subtotal}, VAT: {vat}, Total: {total}")
        
        if subtotal != 1960.0 or vat != 98.0 or total != 2058.0:
            self.log(f"❌ VAT calculation incorrect! Expected subtotal=1960, vat=98, total=2058", "FAIL")
            return False
        
        # Verify invoice number format (INV-0001)
        invoice_number = invoice.get('number', '')
        if not invoice_number.startswith('INV-'):
            self.log(f"❌ Invoice number format incorrect: {invoice_number}", "FAIL")
            return False
        
        invoice_id = invoice['id']
        
        # LIST invoices
        success, invoices = self.run_test(
            "Invoices: List all invoices",
            "GET",
            "invoices",
            200
        )
        
        if not success:
            return False
        
        # GET by ID
        success, _ = self.run_test(
            "Invoices: Get invoice by ID",
            "GET",
            f"invoices/{invoice_id}",
            200
        )
        
        return success
    
    def test_invoice_status_transitions(self):
        """Test invoice status transitions (unpaid -> paid -> unpaid)"""
        # Create client and invoice
        success, client = self.run_test(
            "Invoice Status: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Status Test Client"}
        )
        
        if not success:
            return False
        
        success, invoice = self.run_test(
            "Invoice Status: Create unpaid invoice",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "Status Test Invoice",
                "items": [{"description": "Service", "quantity": 1, "rate": 1000}]
            }
        )
        
        if not success:
            return False
        
        invoice_id = invoice['id']
        
        # Mark as paid
        success, paid_invoice = self.run_test(
            "Invoice Status: Mark as paid",
            "PATCH",
            f"invoices/{invoice_id}/status",
            200,
            data={"status": "paid"},
            description="Status should change to paid and payment_date should be set"
        )
        
        if not success:
            return False
        
        if paid_invoice.get('status') != 'paid' or not paid_invoice.get('payment_date'):
            self.log(f"❌ Status not updated correctly or payment_date not set", "FAIL")
            return False
        
        self.log(f"✓ Invoice marked as paid, payment_date: {paid_invoice.get('payment_date')}")
        
        # Mark as unpaid
        success, unpaid_invoice = self.run_test(
            "Invoice Status: Mark as unpaid",
            "PATCH",
            f"invoices/{invoice_id}/status",
            200,
            data={"status": "unpaid"},
            description="Status should change to unpaid and payment_date should be cleared"
        )
        
        if not success:
            return False
        
        if unpaid_invoice.get('status') != 'unpaid' or unpaid_invoice.get('payment_date') is not None:
            self.log(f"❌ Status not updated or payment_date not cleared", "FAIL")
            return False
        
        self.log(f"✓ Invoice marked as unpaid, payment_date cleared")
        
        return True
    
    def test_invoice_overdue_logic(self):
        """Test that invoices are auto-marked as overdue when due_date < today"""
        # Create client
        success, client = self.run_test(
            "Invoice Overdue: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Overdue Test Client"}
        )
        
        if not success:
            return False
        
        # Create invoice with past due date
        past_date = (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d')
        success, invoice = self.run_test(
            "Invoice Overdue: Create invoice with past due date",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "Overdue Test",
                "due_date": past_date,
                "status": "unpaid",
                "items": [{"description": "Service", "quantity": 1, "rate": 500}]
            }
        )
        
        if not success:
            return False
        
        invoice_id = invoice['id']
        
        # GET invoice - should show as overdue
        success, fetched = self.run_test(
            "Invoice Overdue: GET invoice (should be overdue)",
            "GET",
            f"invoices/{invoice_id}",
            200,
            description="Invoice with past due_date and status=unpaid should show as overdue"
        )
        
        if not success:
            return False
        
        if fetched.get('status') != 'overdue':
            self.log(f"❌ Invoice not marked as overdue. Status: {fetched.get('status')}", "FAIL")
            return False
        
        self.log(f"✓ Invoice correctly marked as overdue")
        return True
    
    def test_quotations_crud_with_vat(self):
        """Test Quotations CRUD with VAT calculations"""
        # Create client
        success, client = self.run_test(
            "Quotations: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Quotation Test Client"}
        )
        
        if not success:
            return False
        
        # CREATE quotation
        success, quotation = self.run_test(
            "Quotations: Create quotation with items",
            "POST",
            "quotations",
            200,
            data={
                "client_id": client['id'],
                "title": "Mobile App Development",
                "issue_date": "2025-08-01",
                "valid_until": "2025-08-31",
                "notes": "Quote valid for 30 days",
                "status": "draft",
                "items": [
                    {"description": "UI/UX Design", "quantity": 5, "rate": 200},
                    {"description": "Development", "quantity": 20, "rate": 150}
                ]
            },
            description="Create quotation and verify VAT calculation"
        )
        
        if not success:
            return False
        
        # Verify VAT: subtotal = 5*200 + 20*150 = 1000 + 3000 = 4000
        # VAT = 4000 * 0.05 = 200
        # Total = 4200
        subtotal = quotation.get('subtotal')
        vat = quotation.get('vat')
        total = quotation.get('total')
        
        self.log(f"✓ Quotation created: {quotation.get('number')}")
        self.log(f"✓ Subtotal: {subtotal}, VAT: {vat}, Total: {total}")
        
        if subtotal != 4000.0 or vat != 200.0 or total != 4200.0:
            self.log(f"❌ VAT calculation incorrect!", "FAIL")
            return False
        
        # Verify quotation number format (QTN-0001)
        qtn_number = quotation.get('number', '')
        if not qtn_number.startswith('QTN-'):
            self.log(f"❌ Quotation number format incorrect: {qtn_number}", "FAIL")
            return False
        
        return True
    
    def test_quotation_convert_to_invoice(self):
        """Test converting quotation to invoice"""
        # Create client
        success, client = self.run_test(
            "Convert: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Convert Test Client"}
        )
        
        if not success:
            return False
        
        # Create quotation
        success, quotation = self.run_test(
            "Convert: Create quotation",
            "POST",
            "quotations",
            200,
            data={
                "client_id": client['id'],
                "title": "Conversion Test",
                "items": [{"description": "Service", "quantity": 2, "rate": 500}]
            }
        )
        
        if not success:
            return False
        
        qtn_id = quotation['id']
        qtn_total = quotation.get('total')
        
        # Convert to invoice
        success, invoice = self.run_test(
            "Convert: Convert quotation to invoice",
            "POST",
            f"quotations/{qtn_id}/convert",
            200,
            description="Should create new invoice with same items/totals"
        )
        
        if not success:
            return False
        
        # Verify invoice has same totals
        if invoice.get('total') != qtn_total:
            self.log(f"❌ Invoice total doesn't match quotation total", "FAIL")
            return False
        
        # Verify quotation was updated
        success, updated_qtn = self.run_test(
            "Convert: Verify quotation updated",
            "GET",
            f"quotations/{qtn_id}",
            200
        )
        
        if not success:
            return False
        
        if updated_qtn.get('status') != 'accepted' or not updated_qtn.get('converted_invoice_id'):
            self.log(f"❌ Quotation not updated correctly after conversion", "FAIL")
            return False
        
        self.log(f"✓ Quotation converted to invoice successfully")
        return True
    
    def test_projects_crud(self):
        """Test Projects CRUD operations"""
        # Create client
        success, client = self.run_test(
            "Projects: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Project Test Client"}
        )
        
        if not success:
            return False
        
        # CREATE project
        success, project = self.run_test(
            "Projects: Create project",
            "POST",
            "projects",
            200,
            data={
                "name": "Website Redesign",
                "client_id": client['id'],
                "status": "active",
                "deadline": "2025-12-31",
                "value": 5000.0,
                "notes": "Q4 project"
            },
            description="Create project with valid client_id"
        )
        
        if not success:
            return False
        
        project_id = project['id']
        
        # LIST projects
        success, _ = self.run_test(
            "Projects: List projects",
            "GET",
            "projects",
            200
        )
        
        if not success:
            return False
        
        # GET by ID
        success, _ = self.run_test(
            "Projects: Get project by ID",
            "GET",
            f"projects/{project_id}",
            200
        )
        
        if not success:
            return False
        
        # UPDATE
        success, _ = self.run_test(
            "Projects: Update project",
            "PUT",
            f"projects/{project_id}",
            200,
            data={
                "name": "Updated Project",
                "client_id": client['id'],
                "status": "completed",
                "deadline": "2025-12-31",
                "value": 6000.0,
                "notes": "Updated notes"
            }
        )
        
        if not success:
            return False
        
        # DELETE
        success, _ = self.run_test(
            "Projects: Delete project",
            "DELETE",
            f"projects/{project_id}",
            200
        )
        
        return success
    
    def test_projects_invalid_client(self):
        """Test project creation with invalid client_id"""
        success, _ = self.run_test(
            "Projects: Create with invalid client_id",
            "POST",
            "projects",
            400,
            data={
                "name": "Invalid Project",
                "client_id": "invalid-client-id-12345",
                "status": "active"
            },
            description="Should return 400 for invalid client_id"
        )
        
        return success
    
    def test_payments_reminders(self):
        """Test GET /payments/reminders endpoint"""
        # Create client
        success, client = self.run_test(
            "Payments: Create client",
            "POST",
            "clients",
            200,
            data={"name": "Payments Test Client"}
        )
        
        if not success:
            return False
        
        # Create overdue invoice
        past_date = (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d')
        success, _ = self.run_test(
            "Payments: Create overdue invoice",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "Overdue Invoice",
                "due_date": past_date,
                "status": "unpaid",
                "items": [{"description": "Service", "quantity": 1, "rate": 1000}]
            }
        )
        
        if not success:
            return False
        
        # Create upcoming invoice
        future_date = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        success, _ = self.run_test(
            "Payments: Create upcoming invoice",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "Upcoming Invoice",
                "due_date": future_date,
                "status": "unpaid",
                "items": [{"description": "Service", "quantity": 1, "rate": 500}]
            }
        )
        
        if not success:
            return False
        
        # Create paid invoice
        success, paid_inv = self.run_test(
            "Payments: Create paid invoice",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "Paid Invoice",
                "status": "paid",
                "items": [{"description": "Service", "quantity": 1, "rate": 750}]
            }
        )
        
        if not success:
            return False
        
        # Mark as paid
        self.run_test(
            "Payments: Mark invoice as paid",
            "PATCH",
            f"invoices/{paid_inv['id']}/status",
            200,
            data={"status": "paid"}
        )
        
        # GET reminders
        success, reminders = self.run_test(
            "Payments: Get reminders",
            "GET",
            "payments/reminders",
            200,
            description="Should return upcoming, overdue, paid arrays"
        )
        
        if not success:
            return False
        
        # Verify structure
        if not all(k in reminders for k in ['upcoming', 'overdue', 'paid']):
            self.log(f"❌ Reminders response missing required keys", "FAIL")
            return False
        
        # Verify overdue items have status='overdue'
        overdue_items = reminders.get('overdue', [])
        if overdue_items:
            if not all(item.get('status') == 'overdue' for item in overdue_items):
                self.log(f"❌ Overdue items don't have status='overdue'", "FAIL")
                return False
        
        self.log(f"✓ Reminders: {len(overdue_items)} overdue, {len(reminders.get('upcoming', []))} upcoming, {len(reminders.get('paid', []))} paid")
        
        return True
    
    def test_analytics_dashboard(self):
        """Test GET /analytics/dashboard endpoint"""
        success, analytics = self.run_test(
            "Analytics: Get dashboard data",
            "GET",
            "analytics/dashboard",
            200,
            description="Should return total_revenue, unpaid_count, overdue_count, active_projects, monthly_earnings, etc."
        )
        
        if not success:
            return False
        
        # Verify required fields
        required_fields = [
            'total_revenue', 'unpaid_count', 'unpaid_amount',
            'overdue_count', 'overdue_amount', 'active_projects',
            'total_clients', 'monthly_earnings', 'recent_invoices'
        ]
        
        for field in required_fields:
            if field not in analytics:
                self.log(f"❌ Analytics missing field: {field}", "FAIL")
                return False
        
        # Verify monthly_earnings is array of 6 months
        monthly = analytics.get('monthly_earnings', [])
        if len(monthly) != 6:
            self.log(f"❌ monthly_earnings should have 6 months, got {len(monthly)}", "FAIL")
            return False
        
        self.log(f"✓ Analytics: revenue={analytics['total_revenue']}, unpaid={analytics['unpaid_count']}, overdue={analytics['overdue_count']}, projects={analytics['active_projects']}")
        
        return True
    
    def test_pdf_generation(self):
        """Test PDF generation for invoices and quotations"""
        # Create client
        success, client = self.run_test(
            "PDF: Create client",
            "POST",
            "clients",
            200,
            data={"name": "PDF Test Client"}
        )
        
        if not success:
            return False
        
        # Create invoice
        success, invoice = self.run_test(
            "PDF: Create invoice",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client['id'],
                "title": "PDF Test Invoice",
                "items": [{"description": "Service", "quantity": 1, "rate": 1000}]
            }
        )
        
        if not success:
            return False
        
        # Test invoice PDF with token
        pdf_url = f"{self.base_url}/invoices/{invoice['id']}/pdf?token={self.token}"
        try:
            response = requests.get(pdf_url, timeout=10)
            if response.status_code == 200 and response.headers.get('content-type') == 'application/pdf':
                self.tests_run += 1
                self.tests_passed += 1
                self.log(f"\n{'='*80}")
                self.log(f"Test #{self.tests_run}: PDF: Get invoice PDF")
                self.log(f"✅ PASSED - PDF generated successfully, size: {len(response.content)} bytes", "PASS")
            else:
                self.tests_run += 1
                self.tests_failed += 1
                self.failed_tests.append("PDF: Get invoice PDF")
                self.log(f"\n{'='*80}")
                self.log(f"Test #{self.tests_run}: PDF: Get invoice PDF")
                self.log(f"❌ FAILED - Status: {response.status_code}, Content-Type: {response.headers.get('content-type')}", "FAIL")
                return False
        except Exception as e:
            self.tests_run += 1
            self.tests_failed += 1
            self.failed_tests.append("PDF: Get invoice PDF")
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False
        
        # Create quotation
        success, quotation = self.run_test(
            "PDF: Create quotation",
            "POST",
            "quotations",
            200,
            data={
                "client_id": client['id'],
                "title": "PDF Test Quotation",
                "items": [{"description": "Service", "quantity": 1, "rate": 2000}]
            }
        )
        
        if not success:
            return False
        
        # Test quotation PDF
        pdf_url = f"{self.base_url}/quotations/{quotation['id']}/pdf?token={self.token}"
        try:
            response = requests.get(pdf_url, timeout=10)
            if response.status_code == 200 and response.headers.get('content-type') == 'application/pdf':
                self.tests_run += 1
                self.tests_passed += 1
                self.log(f"\n{'='*80}")
                self.log(f"Test #{self.tests_run}: PDF: Get quotation PDF")
                self.log(f"✅ PASSED - PDF generated successfully, size: {len(response.content)} bytes", "PASS")
            else:
                self.tests_run += 1
                self.tests_failed += 1
                self.failed_tests.append("PDF: Get quotation PDF")
                self.log(f"\n{'='*80}")
                self.log(f"Test #{self.tests_run}: PDF: Get quotation PDF")
                self.log(f"❌ FAILED - Status: {response.status_code}", "FAIL")
                return False
        except Exception as e:
            self.tests_run += 1
            self.tests_failed += 1
            self.failed_tests.append("PDF: Get quotation PDF")
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False
        
        return True
    
    def test_authorization(self):
        """Test that protected endpoints return 401 without token"""
        endpoints = [
            ("GET", "clients"),
            ("GET", "invoices"),
            ("GET", "quotations"),
            ("GET", "projects"),
            ("GET", "payments/reminders"),
            ("GET", "analytics/dashboard"),
        ]
        
        all_passed = True
        for method, endpoint in endpoints:
            success, _ = self.run_test(
                f"Authorization: {method} /{endpoint} without token",
                method,
                endpoint,
                401,
                headers={},
                description="Should return 401"
            )
            if not success:
                all_passed = False
        
        return all_passed
    
    def run_all_tests(self):
        """Run all backend tests"""
        self.log("\n" + "="*80)
        self.log("LANCELY BACKEND API TEST SUITE")
        self.log("="*80)
        self.log(f"Base URL: {self.base_url}")
        self.log(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        self.log("="*80)
        
        # Auth tests
        self.log("\n\n🔐 AUTHENTICATION TESTS")
        self.log("-" * 80)
        self.test_auth_register()
        self.test_auth_register_duplicate()
        self.test_auth_login_valid()
        self.test_auth_login_invalid()
        self.test_auth_me_with_token()
        self.test_auth_me_without_token()
        self.test_auth_update_profile()
        
        # Clients tests
        self.log("\n\n👥 CLIENTS TESTS")
        self.log("-" * 80)
        self.test_clients_crud()
        self.test_clients_isolation()
        
        # Invoices tests
        self.log("\n\n🧾 INVOICES TESTS")
        self.log("-" * 80)
        self.test_invoices_crud_with_vat()
        self.test_invoice_status_transitions()
        self.test_invoice_overdue_logic()
        
        # Quotations tests
        self.log("\n\n📄 QUOTATIONS TESTS")
        self.log("-" * 80)
        self.test_quotations_crud_with_vat()
        self.test_quotation_convert_to_invoice()
        
        # Projects tests
        self.log("\n\n📁 PROJECTS TESTS")
        self.log("-" * 80)
        self.test_projects_crud()
        self.test_projects_invalid_client()
        
        # Payments tests
        self.log("\n\n💰 PAYMENTS TESTS")
        self.log("-" * 80)
        self.test_payments_reminders()
        
        # Analytics tests
        self.log("\n\n📊 ANALYTICS TESTS")
        self.log("-" * 80)
        self.test_analytics_dashboard()
        
        # PDF tests
        self.log("\n\n📑 PDF GENERATION TESTS")
        self.log("-" * 80)
        self.test_pdf_generation()
        
        # Authorization tests
        self.log("\n\n🔒 AUTHORIZATION TESTS")
        self.log("-" * 80)
        self.test_authorization()
        
        # Summary
        self.log("\n\n" + "="*80)
        self.log("TEST SUMMARY")
        self.log("="*80)
        self.log(f"Total tests run: {self.tests_run}")
        self.log(f"✅ Passed: {self.tests_passed}")
        self.log(f"❌ Failed: {self.tests_failed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            self.log("\n❌ Failed tests:")
            for test in self.failed_tests:
                self.log(f"  - {test}")
        
        self.log("="*80)
        
        return self.tests_failed == 0


def main():
    tester = LancelyAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
