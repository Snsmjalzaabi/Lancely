# Lancely — Product Requirements Document

## Tagline
**From Client to Payment. One Place.**

## Problem
Freelancers juggle WhatsApp, Email, Excel, Word, PDF invoices and Notes apps to manage
their business. Lancely replaces all of that with one calm mobile dashboard.

## MVP Feature Set (built)

### Auth
- Emergent-managed Google OAuth sign-in (`expo-web-browser` + `expo-secure-store`).
- **"Try with demo data"** demo-session endpoint that creates a disposable account
  pre-seeded with sample clients, projects, quotes, and invoices.

### Dashboard (Home tab)
- Revenue this month hero card.
- KPI grid: Active Clients · Active Projects · Pending invoices total · Overdue total.
- Outstanding invoices list (clickable → detail).
- Inline notifications strip (overdue invoices, due-soon items, stale quotes).
- Pull-to-refresh.

### Clients
- List with search.
- Add Client (name, company, email, phone, notes).
- Client profile with quick actions (Email, Call, New Quote, New Invoice), paid/outstanding
  metrics, and grouped related Projects/Quotes/Invoices.
- Delete client.

### Projects (Kanban tab)
- Horizontal scrolling Kanban: Lead → Proposal Sent → In Progress → Review → Completed.
- Cards show client, AED value, due date.
- One-tap move forward/back between columns. Status persists to backend.
- Create project (name, client, value, status, due-in days).
- Project detail with status switcher.

### Quotes
- List with status badges (draft/sent/accepted/rejected) and totals.
- Create quote: client picker chip row, multiple line items (service + description + price)
  with live total, notes.
- Quote detail with items breakdown, **Mark Accepted / Mark Rejected** actions.
- Auto-assigned quote numbers (`Q-YYYYMM-001`).

### Invoices
- List filtered by All / Pending / Overdue / Partial / Paid (sticky filter chip row).
- Sticky earned / outstanding / overdue metric tiles.
- Create invoice (client, amount, due-in days, notes).
- Invoice detail with **Record Payment** (partial amounts allowed), **Mark fully paid**,
  status auto-derived (paid / partial / overdue / pending).
- Auto-assigned invoice numbers (`INV-1001+`).

### Notifications
- Computed from data: invoice overdue, invoice due ≤3 days, project due ≤3 days, quote
  awaiting response ≥7 days.
- Accessible from the bell icon in every tab header.

### Currency
- AED, formatted everywhere (`AED 4,250`).

## Tech Stack
- **Frontend:** Expo SDK 54 + Expo Router (file-based), React Native 0.81, TypeScript.
  Light "Organic & Earthy" theme from `/app/design_guidelines.json`.
- **Backend:** FastAPI + Motor (MongoDB). All routes under `/api`.
- **Storage:** `expo-secure-store` for the session token (via the shared
  `@/src/utils/storage` wrapper), AsyncStorage available for non-sensitive KV.

## Out of scope for v1 (deliberately)
- PDF generation (planned next).
- Stripe / Razorpay paid plan paywall.
- AI features, contracts, chat, full CRM.
- Multi-currency.

## Success metrics (from PRD)
1. Sign up in under 2 minutes ✅ (Google OAuth or one-tap demo).
2. Create a client in under 30 seconds ✅ (5 fields, one screen).
3. Send a quote in under 60 seconds ✅ (client chip + items + total).
4. Generate an invoice in under 30 seconds ✅ (3 required fields).
5. Know who owes money at a glance ✅ (dashboard hero + outstanding section + Money tab metrics).
