#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: |
  Apple rejected Lancely v1.0.2. The shared remote backend (freelancer-hub-47) had been decommissioned and was returning 404 for all /api/* endpoints, so the mobile app could not log in, register, demo, or load any data — which is the root cause of the rejection. Rebuild a full self-contained backend in /app/backend so the app works for App Store Review.

backend:
  - task: "Full Lancely backend (auth, clients, projects, quotations, invoices, payments, dashboard, reports, reminders, CSV, RevenueCat webhook, Apple sign-in, demo session)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            Built complete FastAPI + Motor (MongoDB) backend covering every endpoint the
            mobile app calls. Verified manually via curl: /api/health, /api/auth/register,
            /api/auth/login, /api/auth/me (GET/PUT/DELETE), /api/auth/demo-session,
            /api/auth/apple, /api/currencies, /api/clients (CRUD), /api/projects (CRUD +
            status patch), /api/quotations (CRUD), /api/quotes/:id/status, /api/invoices
            (CRUD + status + payments), /api/analytics/dashboard, /api/reports/pl,
            /api/payments/reminders, /api/export/{ds}.csv, /api/webhooks/revenuecat.
            Startup hook seeds two accounts:
              • review@lancely.com / Review123!  → 10 clients, 8 projects, 15 invoices
              • demo@lancely.app (shared demo)   → 6 clients, 4 projects, 6 invoices, 3 quotes
            Apple sign-in verifies identity_token against Apple's JWKS with bundle id
            com.lancely.app.

frontend:
  - task: "Demo Mode (Try with demo account)"
    implemented: true
    working: true
    file: "/app/frontend/app/login.tsx,/app/frontend/lib/auth.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            Replaced the brittle hard-coded test@lancely.ae/test1234 login with a new
            signInDemo() in AuthProvider that calls POST /api/auth/demo-session and
            stores the returned JWT. Verified via browser screenshot: tapping
            "Try with demo account" loads the dashboard with seeded numbers.
  - task: "Sign in with Apple"
    implemented: true
    working: "NA"
    file: "/app/frontend/lib/appleAuth.ts,/app/frontend/lib/auth.tsx,/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Backend /api/auth/apple endpoint is live and verifies Apple identity_token
            against Apple JWKS. Frontend code is unchanged (was already correct).
            Cannot exercise the native Apple flow from web/Expo Go — must be
            validated on a real iOS development build by the user.
  - task: "Review account credentials seeded for Apple App Review"
    implemented: true
    working: true
    file: "/app/backend/server.py,/app/memory/test_credentials.md"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            review@lancely.com / Review123! is auto-seeded on backend startup with 10
            clients, 8 projects, and 15 invoices (mix of paid/unpaid/overdue/partial).
            Verified by login curl. test_credentials.md updated.

metadata:
  created_by: "main_agent"
  version: "1.0.3"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Full Lancely backend (auth, clients, projects, quotations, invoices, payments, dashboard, reports, reminders, CSV, RevenueCat webhook, Apple sign-in, demo session)"
    - "Demo Mode (Try with demo account)"
    - "Review account credentials seeded for Apple App Review"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Rebuilt the entire backend from scratch in /app/backend/server.py because the
      shared remote backend had been decommissioned. The app is now self-contained.
      Please test:
        1. Backend (priority): every endpoint listed above with the review account
           (login: review@lancely.com / Review123!). Confirm CRUD on clients,
           projects, quotations, invoices; payment recording; dashboard math;
           reminders shape; CSV download with bearer token; demo-session endpoint
           creates/returns a JWT.
        2. Frontend (priority): tap "Try with demo account" → dashboard loads with
           seeded numbers. Then create a client, create a project, create an invoice,
           record a payment. Verify Settings → Delete Account clears the session.
           Sign in with Apple is iOS-only and cannot be exercised in the test harness.
