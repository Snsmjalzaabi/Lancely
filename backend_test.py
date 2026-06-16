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
    

    # ==================== PHASE 4 TESTS ====================
    
    def test_currencies_endpoint(self):
        """Test GET /api/currencies returns 6 supported currencies"""
        success, response = self.run_test(
            "Currencies: GET /api/currencies",
            "GET",
            "currencies",
            200,
            description="Should return AED, USD, EUR, GBP, SAR, INR"
        )
        if success:
            currencies = response
            codes = [c.get('code') for c in currencies]
            expected = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'INR']
            if set(codes) == set(expected):
                self.log(f"✅ All 6 currencies present: {codes}", "PASS")
            else:
                self.log(f"❌ Currency mismatch. Expected {expected}, got {codes}", "FAIL")
    
    def test_user_defaults_currency_theme(self):
        """Test new user defaults: currency='AED', theme='dark'"""
        # Register a new user
        timestamp = int(time.time())
        email = f"qa+defaults+{timestamp}@lancely.ae"
        success, response = self.run_test(
            "User defaults: Register and check currency/theme",
            "POST",
            "auth/register",
            200,
            data={
                "email": email,
                "password": "TestPass123!",
                "name": "Defaults Test User"
            },
            description="New user should have currency='AED' and theme='dark'"
        )
        if success:
            user = response.get('user', {})
            currency = user.get('currency')
            theme = user.get('theme')
            if currency == 'AED' and theme == 'dark':
                self.log(f"✅ User defaults correct: currency={currency}, theme={theme}", "PASS")
            else:
                self.log(f"❌ User defaults incorrect: currency={currency}, theme={theme}", "FAIL")
    
    def test_update_user_currency_theme(self):
        """Test PUT /api/auth/me with currency and theme"""
        # Update to USD and light
        success, response = self.run_test(
            "User update: Change currency to USD and theme to light",
            "PUT",
            "auth/me",
            200,
            data={"currency": "USD", "theme": "light"},
            description="Should update currency and theme"
        )
        if success:
            if response.get('currency') == 'USD' and response.get('theme') == 'light':
                self.log("✅ Currency and theme updated successfully", "PASS")
            else:
                self.log(f"❌ Update failed: currency={response.get('currency')}, theme={response.get('theme')}", "FAIL")
        
        # Test invalid currency
        self.run_test(
            "User update: Invalid currency 'XYZ' should return 400",
            "PUT",
            "auth/me",
            400,
            data={"currency": "XYZ"},
            description="Should reject invalid currency"
        )
        
        # Test invalid theme
        self.run_test(
            "User update: Invalid theme 'rainbow' should return 400",
            "PUT",
            "auth/me",
            400,
            data={"theme": "rainbow"},
            description="Should reject invalid theme"
        )
        
        # Restore to AED and dark for other tests
        self.run_test(
            "User update: Restore to AED and dark",
            "PUT",
            "auth/me",
            200,
            data={"currency": "AED", "theme": "dark"}
        )
    
    def test_invoice_with_currency(self):
        """Test POST /api/invoices with currency"""
        # Create a client first
        success, client = self.run_test(
            "Invoice currency: Create test client",
            "POST",
            "clients",
            200,
            data={"name": "Currency Test Client", "email": "currency@test.com"}
        )
        if not success:
            return
        
        client_id = client.get('id')
        
        # Create invoice with USD currency
        success, invoice = self.run_test(
            "Invoice currency: Create invoice with currency=USD",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client_id,
                "title": "USD Invoice",
                "items": [{"description": "Test item", "quantity": 1, "rate": 100}],
                "currency": "USD"
            },
            description="Should save currency=USD on the invoice"
        )
        if success:
            if invoice.get('currency') == 'USD':
                self.log("✅ Invoice created with USD currency", "PASS")
            else:
                self.log(f"❌ Invoice currency incorrect: {invoice.get('currency')}", "FAIL")
        
        # Create invoice without currency (should default to user's currency)
        success, invoice2 = self.run_test(
            "Invoice currency: Create invoice without currency (should default to user's)",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client_id,
                "title": "Default Currency Invoice",
                "items": [{"description": "Test item", "quantity": 1, "rate": 100}]
            },
            description="Should default to user's currency (AED)"
        )
        if success:
            if invoice2.get('currency') == 'AED':
                self.log("✅ Invoice defaulted to user's currency (AED)", "PASS")
            else:
                self.log(f"❌ Invoice currency should be AED, got: {invoice2.get('currency')}", "FAIL")
    
    def test_quotation_currency_preservation(self):
        """Test quotation->invoice conversion preserves currency"""
        # Create a client
        success, client = self.run_test(
            "Quotation currency: Create test client",
            "POST",
            "clients",
            200,
            data={"name": "Quotation Currency Client"}
        )
        if not success:
            return
        
        client_id = client.get('id')
        
        # Create quotation with EUR currency
        success, quotation = self.run_test(
            "Quotation currency: Create quotation with EUR",
            "POST",
            "quotations",
            200,
            data={
                "client_id": client_id,
                "title": "EUR Quotation",
                "items": [{"description": "Test item", "quantity": 2, "rate": 50}],
                "currency": "EUR"
            }
        )
        if not success:
            return
        
        qid = quotation.get('id')
        
        # Convert to invoice
        success, invoice = self.run_test(
            "Quotation currency: Convert EUR quotation to invoice",
            "POST",
            f"quotations/{qid}/convert",
            200,
            description="Invoice should preserve EUR currency from quotation"
        )
        if success:
            if invoice.get('currency') == 'EUR':
                self.log("✅ Invoice preserved EUR currency from quotation", "PASS")
            else:
                self.log(f"❌ Invoice currency should be EUR, got: {invoice.get('currency')}", "FAIL")
    
    def test_csv_exports(self):
        """Test CSV export endpoints"""
        entities = ['clients', 'invoices', 'quotations', 'projects']
        
        for entity in entities:
            # Test with valid token
            url = f"{self.base_url}/export/{entity}.csv?token={self.token}"
            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    content_type = response.headers.get('Content-Type', '')
                    content_disp = response.headers.get('Content-Disposition', '')
                    
                    if 'text/csv' in content_type and 'attachment' in content_disp:
                        # Check if CSV has header row
                        lines = response.text.strip().split('\n')
                        if len(lines) >= 1:  # At least header
                            self.tests_run += 1
                            self.tests_passed += 1
                            self.log(f"✅ CSV export {entity}: Valid CSV with {len(lines)} lines", "PASS")
                        else:
                            self.tests_run += 1
                            self.tests_failed += 1
                            self.log(f"❌ CSV export {entity}: Empty CSV", "FAIL")
                    else:
                        self.tests_run += 1
                        self.tests_failed += 1
                        self.log(f"❌ CSV export {entity}: Wrong content type or disposition", "FAIL")
                else:
                    self.tests_run += 1
                    self.tests_failed += 1
                    self.log(f"❌ CSV export {entity}: Status {response.status_code}", "FAIL")
            except Exception as e:
                self.tests_run += 1
                self.tests_failed += 1
                self.log(f"❌ CSV export {entity}: Error {str(e)}", "FAIL")
        
        # Test without token (should return 401)
        self.run_test(
            "CSV export: Without token should return 401",
            "GET",
            "export/clients.csv",
            401,
            description="CSV export requires authentication"
        )
    
    def test_recurring_invoices_crud(self):
        """Test recurring invoices CRUD operations"""
        # Create a client first
        success, client = self.run_test(
            "Recurring: Create test client",
            "POST",
            "clients",
            200,
            data={"name": "Recurring Test Client"}
        )
        if not success:
            return
        
        client_id = client.get('id')
        
        # Create recurring invoice
        success, recurring = self.run_test(
            "Recurring: Create monthly recurring invoice",
            "POST",
            "recurring-invoices",
            200,
            data={
                "client_id": client_id,
                "title": "Monthly Retainer",
                "frequency": "monthly",
                "currency": "AED",
                "items": [{"description": "Monthly service", "quantity": 1, "rate": 1000}],
                "due_days": 14
            },
            description="Should create recurring invoice template"
        )
        if not success:
            return
        
        rid = recurring.get('id')
        
        # Get recurring invoice
        self.run_test(
            "Recurring: GET recurring invoice by ID",
            "GET",
            f"recurring-invoices/{rid}",
            200
        )
        
        # List recurring invoices
        success, list_resp = self.run_test(
            "Recurring: List all recurring invoices",
            "GET",
            "recurring-invoices",
            200
        )
        if success:
            if len(list_resp) > 0:
                self.log(f"✅ Found {len(list_resp)} recurring invoice(s)", "PASS")
        
        # Update recurring invoice
        self.run_test(
            "Recurring: Update recurring invoice",
            "PUT",
            f"recurring-invoices/{rid}",
            200,
            data={
                "client_id": client_id,
                "title": "Updated Monthly Retainer",
                "frequency": "monthly",
                "currency": "AED",
                "items": [{"description": "Updated service", "quantity": 1, "rate": 1200}],
                "due_days": 14
            }
        )
        
        # Test invalid frequency
        self.run_test(
            "Recurring: Invalid frequency 'fortnightly' should return 400",
            "POST",
            "recurring-invoices",
            400,
            data={
                "client_id": client_id,
                "title": "Invalid Frequency",
                "frequency": "fortnightly",
                "items": []
            },
            description="Should reject invalid frequency"
        )
        
        # Test invalid client_id
        self.run_test(
            "Recurring: Invalid client_id should return 400",
            "POST",
            "recurring-invoices",
            400,
            data={
                "client_id": "invalid-client-id",
                "title": "Invalid Client",
                "frequency": "monthly",
                "items": []
            },
            description="Should reject invalid client_id"
        )
        
        # Store for generate test
        self.recurring_id = rid
    
    def test_recurring_generate(self):
        """Test POST /api/recurring-invoices/{id}/generate"""
        if not hasattr(self, 'recurring_id'):
            self.log("⚠️ Skipping generate test - no recurring invoice created", "WARN")
            return
        
        # Get initial state
        success, before = self.run_test(
            "Recurring generate: Get initial state",
            "GET",
            f"recurring-invoices/{self.recurring_id}",
            200
        )
        if not success:
            return
        
        initial_count = before.get('generated_count', 0)
        initial_next_run = before.get('next_run_date')
        
        # Generate invoice
        success, invoice = self.run_test(
            "Recurring generate: Generate invoice from template",
            "POST",
            f"recurring-invoices/{self.recurring_id}/generate",
            200,
            description="Should create invoice and update template"
        )
        if not success:
            return
        
        # Verify invoice was created
        if invoice.get('number'):
            self.log(f"✅ Invoice {invoice.get('number')} created", "PASS")
        
        # Get updated state
        success, after = self.run_test(
            "Recurring generate: Get updated state",
            "GET",
            f"recurring-invoices/{self.recurring_id}",
            200
        )
        if success:
            new_count = after.get('generated_count', 0)
            new_next_run = after.get('next_run_date')
            
            if new_count == initial_count + 1:
                self.log(f"✅ Generated count incremented: {initial_count} -> {new_count}", "PASS")
            else:
                self.log(f"❌ Generated count not incremented: {initial_count} -> {new_count}", "FAIL")
            
            if new_next_run != initial_next_run:
                self.log(f"✅ Next run date advanced: {initial_next_run} -> {new_next_run}", "PASS")
            else:
                self.log(f"❌ Next run date not advanced: {initial_next_run}", "FAIL")
    
    def test_recurring_run_due(self):
        """Test POST /api/recurring-invoices/run-due"""
        success, response = self.run_test(
            "Recurring run-due: Process all due templates",
            "POST",
            "recurring-invoices/run-due",
            200,
            description="Should generate invoices for due templates"
        )
        if success:
            count = response.get('count', 0)
            generated = response.get('generated', [])
            self.log(f"✅ Run-due completed: {count} invoice(s) generated", "PASS")
            
            # Verify no templates are due after running
            success2, list_resp = self.run_test(
                "Recurring run-due: Verify no templates due after run",
                "GET",
                "recurring-invoices",
                200
            )
            if success2:
                today = datetime.now().date().isoformat()
                due_count = sum(1 for r in list_resp if r.get('is_active') and r.get('next_run_date', '9999') <= today)
                if due_count == 0:
                    self.log("✅ No templates due after run-due", "PASS")
                else:
                    self.log(f"⚠️ {due_count} template(s) still due after run-due", "WARN")
    
    def test_email_status(self):
        """Test GET /api/email/status"""
        success, response = self.run_test(
            "Email: GET /api/email/status",
            "GET",
            "email/status",
            200,
            description="Should return configured:false since RESEND_API_KEY is empty"
        )
        if success:
            configured = response.get('configured')
            provider = response.get('provider')
            sender = response.get('sender')
            
            if configured == False and provider == 'resend':
                self.log(f"✅ Email status correct: configured={configured}, provider={provider}, sender={sender}", "PASS")
            else:
                self.log(f"❌ Email status incorrect: configured={configured}, provider={provider}", "FAIL")
    
    def test_email_send_not_configured(self):
        """Test POST /api/email/send with RESEND_API_KEY unset"""
        success, response = self.run_test(
            "Email: Send email when not configured",
            "POST",
            "email/send",
            200,
            data={
                "to": "test@example.com",
                "subject": "Test Email",
                "html": "<p>Test</p>"
            },
            description="Should return ok:false, status:'not_configured' without raising 500"
        )
        if success:
            ok = response.get('ok')
            status = response.get('status')
            
            if ok == False and status == 'not_configured':
                self.log(f"✅ Email send gracefully handled: ok={ok}, status={status}", "PASS")
            else:
                self.log(f"❌ Email send response incorrect: ok={ok}, status={status}", "FAIL")
    
    def test_pdf_with_currency(self):
        """Test PDF generation uses document currency"""
        # Create a client
        success, client = self.run_test(
            "PDF currency: Create test client",
            "POST",
            "clients",
            200,
            data={"name": "PDF Currency Client"}
        )
        if not success:
            return
        
        client_id = client.get('id')
        
        # Create invoice with GBP currency
        success, invoice = self.run_test(
            "PDF currency: Create invoice with GBP",
            "POST",
            "invoices",
            200,
            data={
                "client_id": client_id,
                "title": "GBP Invoice",
                "items": [{"description": "Test item", "quantity": 1, "rate": 100}],
                "currency": "GBP"
            }
        )
        if not success:
            return
        
        inv_id = invoice.get('id')
        
        # Test PDF generation
        url = f"{self.base_url}/invoices/{inv_id}/pdf?token={self.token}"
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                content = response.content
                
                if 'application/pdf' in content_type and content.startswith(b'%PDF'):
                    self.tests_run += 1
                    self.tests_passed += 1
                    self.log(f"✅ PDF generated with correct content type and PDF header", "PASS")
                else:
                    self.tests_run += 1
                    self.tests_failed += 1
                    self.log(f"❌ PDF generation failed: wrong content type or format", "FAIL")
            else:
                self.tests_run += 1
                self.tests_failed += 1
                self.log(f"❌ PDF generation failed: status {response.status_code}", "FAIL")
        except Exception as e:
            self.tests_run += 1
            self.tests_failed += 1
            self.log(f"❌ PDF generation error: {str(e)}", "FAIL")
    
    # ==================== END PHASE 4 TESTS ====================

    # ==================== P0 FIX TESTS ====================
    
    def test_ai_parse_invoice_valid(self):
        """P0 FIX 1(a): Test /api/ai/parse-invoice with valid description"""
        success, data = self.run_test(
            "AI Parse Invoice - Valid Input",
            "POST",
            "ai/parse-invoice",
            200,
            data={"text": "Logo design 1500 AED, website development 5000 AED", "currency": "AED"},
            description="P0 FIX 1(a): Valid description should return JSON with title, items, notes"
        )
        if success and data:
            if "title" in data and "items" in data and isinstance(data["items"], list):
                self.log(f"✅ Response has correct structure with {len(data['items'])} items", "SUCCESS")
            else:
                self.log(f"⚠️ Response missing expected fields: {data}", "WARNING")

    def test_ai_parse_invoice_short_text(self):
        """P0 FIX 1(b): Test /api/ai/parse-invoice with short text returns 400"""
        success, response = self.run_test(
            "AI Parse Invoice - Short Text Returns 400",
            "POST",
            "ai/parse-invoice",
            400,
            data={"text": "hi", "currency": "AED"},
            description="P0 FIX 1(b): Empty/short text should return 400"
        )

    def test_ai_parse_invoice_no_crash(self):
        """P0 FIX 1(c): Test /api/ai/parse-invoice never crashes with 500"""
        self.log("\n🤖 Testing AI Parse Invoice - No 500 Crashes...")
        test_cases = [
            {"text": "", "currency": "AED"},
            {"text": "   ", "currency": "AED"},
        ]
        
        all_passed = True
        for i, test_data in enumerate(test_cases):
            url = f"{self.base_url}/ai/parse-invoice"
            headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {self.token}'}
            
            try:
                response = requests.post(url, json=test_data, headers=headers, timeout=10)
                self.tests_run += 1
                
                if response.status_code == 500:
                    self.tests_failed += 1
                    self.log(f"❌ Got 500 for input: {test_data}", "FAIL")
                    all_passed = False
                else:
                    self.tests_passed += 1
                    self.log(f"✅ Edge case {i+1} handled without 500 (got {response.status_code})", "PASS")
            except Exception as e:
                self.tests_run += 1
                self.tests_failed += 1
                self.log(f"❌ Exception for case {i+1}: {str(e)}", "FAIL")
                all_passed = False

    def test_ai_compose_email_without_invoice(self):
        """P0 FIX 3: Test /api/ai/compose-email with flavor='gentle' without invoice_id"""
        success, data = self.run_test(
            "AI Compose Email - Without Invoice ID",
            "POST",
            "ai/compose-email",
            200,
            data={"flavor": "gentle"},
            description="P0 FIX 3: Regression check - flavor without invoice_id should succeed"
        )
        if success and data:
            if "subject" in data and "html" in data and "to" in data:
                self.log("✅ Response has subject, html, to fields", "SUCCESS")
            else:
                self.log(f"⚠️ Missing expected fields. Got: {list(data.keys())}", "WARNING")
    
    # ==================== END P0 FIX TESTS ====================


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
        
        # ===== PHASE 4 TESTS =====
        self.log("\n\n🚀 PHASE 4 FEATURE TESTS")
        self.log("-" * 80)
        
        self.log("\n💱 CURRENCIES & MULTI-CURRENCY")
        self.test_currencies_endpoint()
        self.test_user_defaults_currency_theme()
        self.test_update_user_currency_theme()
        self.test_invoice_with_currency()
        self.test_quotation_currency_preservation()
        
        self.log("\n📊 CSV EXPORTS")
        self.test_csv_exports()
        
        self.log("\n🔄 RECURRING INVOICES")
        self.test_recurring_invoices_crud()
        self.test_recurring_generate()
        self.test_recurring_run_due()
        
        self.log("\n📧 EMAIL SERVICE")
        self.test_email_status()
        self.test_email_send_not_configured()
        
        self.log("\n📄 PDF WITH CURRENCY")
        
        # ===== P0 FIX TESTS =====
        self.log("\n\n🔧 P0 FIX VALIDATION TESTS")
        self.log("-" * 80)
        self.test_ai_parse_invoice_valid()
        self.test_ai_parse_invoice_short_text()
        self.test_ai_parse_invoice_no_crash()
        self.test_ai_compose_email_without_invoice()

        self.test_pdf_with_currency()
        
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
