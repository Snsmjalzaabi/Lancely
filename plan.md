# Lancely (UAE Freelancer Management) — plan.md

## 1) Objectives
- Deliver an MVP web app for UAE freelancers to manage **clients, quotations, invoices, projects, reminders, and analytics** in a single dark modern dashboard.
- Ensure **UAE VAT (5%)** is consistently applied across quotations/invoices with correct **subtotal/VAT/total**.
- Provide **PDF downloads** for quotations and invoices.
- Provide a responsive, premium SaaS-style UI (dark-only) with clear empty states.
- Validate end-to-end flows with automated testing (testing_agent_v3) and fix until stable.

## 2) Implementation Steps

### Phase 1 — Skip POC (go straight to build)
Rationale: standard CRUD + JWT auth + server-side PDF generation; no external integrations.

### Phase 2 — V1 App Development (Core MVP)
**Backend (FastAPI + Motor + MongoDB)**
- Project setup: config, env, CORS, logging; DB connection; common error handling.
- Auth (JWT + bcrypt): register/login/logout, password hashing, token refresh (optional), protected routes.
- Data models & collections: users, clients, quotations(+items), invoices(+items), projects, reminders.
- CRUD endpoints:
  - Clients: create/list/detail/update/delete; search/sort.
  - Quotations: create with line items, compute totals (AED, VAT 5%); list/detail/update/delete.
  - Invoices: create with items, status workflow (unpaid/paid/overdue), due dates; list/detail/update/delete.
  - Convert quotation → invoice endpoint (copy items + totals).
  - Projects: CRUD with status/deadline/value.
  - Reminders: derived view endpoint (upcoming/overdue/paid) from invoice due date + status.
- VAT/totals: centralized calculation utility (subtotal, VAT=0.05*subtotal, grand total).
- PDF generation (reportlab):
  - Quotation PDF endpoint
  - Invoice PDF endpoint
  - Include freelancer business info + client info + TRN fields + totals.
- Analytics endpoints:
  - total revenue (paid invoices), unpaid count, overdue count, active projects count
  - monthly earnings (group by month for paid invoices)

**Frontend (React + Tailwind + shadcn/ui + recharts)**
- App shell: dark-only theme, sidebar navigation, top header, responsive layout.
- Routing (react-router-dom):
  - Auth: /login, /register
  - App: /dashboard, /clients, /quotations, /invoices, /projects, /payments, /settings
- Auth handling: token storage, axios interceptors, protected routes.
- Pages (MVP UX-first):
  - Dashboard: KPI cards + monthly earnings chart + “what needs attention” (overdue/unpaid).
  - Clients: table + add/edit modal/drawer + client detail view.
  - Quotations: create/edit with line items; preview totals; download PDF; convert to invoice.
  - Invoices: create/edit with line items; status badges; mark paid/unpaid; download PDF.
  - Projects: CRUD, status badges, deadline highlighting.
  - Payments/Reminders: grouped sections (upcoming/overdue/paid) + quick actions.
  - Settings: profile + business info (used on PDFs), TRN, address.
- Empty states: polished placeholders with CTA buttons (no seed data).

**Phase 2 user stories (at least 5)**
1. As a freelancer, I can register/login and reach a protected dashboard so my data is private.
2. As a freelancer, I can add clients with TRN/VAT details so my invoices are compliant.
3. As a freelancer, I can create quotations with line items and VAT so I can quote accurately.
4. As a freelancer, I can create invoices and mark them paid/unpaid so I can track cashflow.
5. As a freelancer, I can view a dashboard with revenue/unpaid/overdue/projects and monthly earnings so I understand my business.
6. As a freelancer, I can download PDF invoices/quotations so I can send professional documents.

**Conclude Phase 2:** run **testing_agent_v3** for one full E2E pass (auth → CRUD → totals → PDF → analytics) and fix all failures.

### Phase 3 — Stabilization + UX Polish (Production-lean MVP)
- Tighten validation (pydantic), edge cases (rounding, empty line items, date/timezone handling UAE).
- Improve invoice overdue automation (server-side: overdue if due_date < today and not paid).
- Add list filters/sorting (status, client, date ranges) and consistent pagination.
- Harden security: rate-limit login (basic), better token expiry handling, secure headers.
- Add lightweight unit tests for VAT calc + PDF generator + analytics aggregation.

**Phase 3 user stories (at least 5)**
1. As a freelancer, I can filter invoices by status/date so I can find what needs action quickly.
2. As a freelancer, I see overdue invoices automatically flagged so I don’t miss payments.
3. As a freelancer, I can trust totals/VAT rounding so my documents match expectations.
4. As a freelancer, I can update my business info in Settings and see it reflected on PDFs.
5. As a freelancer, I can use the app comfortably on mobile so I can work on the go.

**Conclude Phase 3:** run **testing_agent_v3** again and fix until green.

### Phase 4 — Expand (optional, only after stable)
- Recurring invoices (simple templates).
- Email sending (if requested later; would require a POC then).
- Multi-currency (if requested later).
- Light theme toggle (if requested later).

**Phase 4 user stories (at least 5)**
1. As a freelancer, I can create invoice templates so I can invoice faster.
2. As a freelancer, I can generate recurring invoices monthly so I don’t repeat work.
3. As a freelancer, I can export data (CSV) so I can share with my accountant.
4. As a freelancer, I can configure reminders cadence so it matches my workflow.
5. As a freelancer, I can enable extra features without breaking core flows.

## 3) Next Actions
1. Scaffold repo: backend (FastAPI) + frontend (React) + env templates.
2. Implement backend models/utilities first (VAT calc, PDF gen, analytics aggregation).
3. Build core CRUD endpoints + auth.
4. Build frontend shell + routing + auth guard.
5. Implement key pages in priority order: Invoices → Quotations → Clients → Dashboard → Projects → Payments → Settings.
6. Run testing_agent_v3; fix issues; repeat after Phase 3 polish.

## 4) Success Criteria
- Users can sign up/login and access only their own data.
- CRUD works for clients/quotations/invoices/projects with correct relationships.
- VAT (5%) and totals are correct and consistent everywhere.
- Quotations can convert to invoices without data loss.
- Invoice statuses and reminders accurately show upcoming/overdue/paid.
- PDF download works for both quotations and invoices and includes UAE-relevant fields (TRN, AED totals).
- Dashboard analytics match underlying invoice/project data.
- Responsive dark UI is usable on desktop/mobile with clear empty states.
- testing_agent_v3 passes end-to-end with no critical bugs.