# Lancely Mobile ↔ Web Integration Brief

> **Audience:** the Emergent agent (or developer) working on the **mobile** Lancely repo at
> `https://github.com/snsmjalzaabi/Lancely`
>
> **Goal:** Make the mobile Expo app use the **web app's backend** as the single source of truth,
> so the same user logs in on web and mobile and sees the same clients, invoices, expenses,
> templates, etc.
>
> **Strategy:** Decommission the mobile project's own backend. Point the Expo client at the web
> backend's public URL. The web backend already covers every feature the mobile UI is likely to
> need (auth, clients, projects, quotations, invoices, recurring, expenses, payments, reports,
> templates, AI). No data migration is needed if the mobile app is brand new (no production users).

---

## 1. Target backend

- **Tech:** FastAPI + MongoDB (Motor), JWT auth with `Bearer` tokens (HS256)
- **All routes are prefixed with `/api`**
- **CORS:** currently `*` — works for Expo dev (mobile clients aren't bound by CORS anyway, but
  Expo web preview is)
- **Public preview URL (dev):** `https://freelancer-hub-47.preview.emergentagent.com`
  - **API base for mobile:** `https://freelancer-hub-47.preview.emergentagent.com/api`
  - ⚠️ This preview URL changes if the project is redeployed. Use a deployed/production URL when
    going live (Vercel / Emergent deploy / Railway).

### Env var the mobile app must set

In the mobile project, set the API base URL via an Expo public env var (visible on the client):

```
EXPO_PUBLIC_BACKEND_URL=https://freelancer-hub-47.preview.emergentagent.com
```

Then in `frontend/lib/api.ts` (or wherever the axios/fetch base URL lives):

```ts
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
```

Remove any references to the mobile's own `backend/` server.

---

## 2. Authentication contract

JWT bearer tokens, expiring in **7 days**. Token must be sent on every protected endpoint via
`Authorization: Bearer <token>` header.

### `POST /api/auth/register`

Request:
```json
{ "email": "user@example.com", "password": "min6chars", "name": "Jane Doe", "business_name": "Jane Studio" }
```
Response (201):
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid", "email": "user@example.com", "name": "Jane Doe",
    "business_name": "Jane Studio", "trn": "", "address": "", "phone": "",
    "website": "", "currency": "AED", "theme": "dark", "created_at": "ISO"
  }
}
```

### `POST /api/auth/login`

Request:
```json
{ "email": "user@example.com", "password": "min6chars" }
```
Response → same shape as register (`{ token, user }`).

### `GET /api/auth/me` (auth required)

Returns the current user object (no `password_hash`).

### `PUT /api/auth/me` (auth required)

Partial update. Any of:
```json
{ "name": "...", "business_name": "...", "trn": "...", "address": "...",
  "phone": "...", "website": "...", "currency": "AED|USD|EUR|GBP|SAR|INR",
  "theme": "dark|light" }
```

### Mobile token storage

- Use **`expo-secure-store`** (NOT AsyncStorage) for the JWT — it's a credential.
- Pattern:
  ```ts
  import * as SecureStore from 'expo-secure-store';
  await SecureStore.setItemAsync('lancely_token', token);
  const token = await SecureStore.getItemAsync('lancely_token');
  ```

### Axios interceptor pattern (works on mobile)

```ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const api = axios.create({ baseURL: `${process.env.EXPO_PUBLIC_BACKEND_URL}/api` });

api.interceptors.request.use(async (config) => {
  const t = await SecureStore.getItemAsync('lancely_token');
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err?.response?.status === 401) {
      await SecureStore.deleteItemAsync('lancely_token');
      // redirect to login
    }
    return Promise.reject(err);
  }
);
```

---

## 3. Full endpoint catalog

All require `Authorization: Bearer <token>` unless noted. All return JSON. Errors return
`{ "detail": "message" }` with appropriate HTTP status.

### Currencies (public-ish, still auth-gated for safety)
- `GET /api/currencies` → `[{ code, symbol, name, locale }]`
  - Supported: `AED, USD, EUR, GBP, SAR, INR`

### Clients
- `POST /api/clients` body: `{ name, company?, email?, phone?, address?, trn?, notes? }`
- `GET  /api/clients` → list
- `GET  /api/clients/{id}` → one
- `PUT  /api/clients/{id}` body: same as POST
- `DELETE /api/clients/{id}`

### Projects
- `POST /api/projects` body: `{ name, client_id?, status?, deadline?, value?, notes? }`
  - `status`: `active|on_hold|completed|cancelled`
- `GET  /api/projects`
- `GET  /api/projects/{id}`
- `PUT  /api/projects/{id}`
- `DELETE /api/projects/{id}`

### Quotations
- `POST /api/quotations` body: `{ client_id, title?, issue_date?, valid_until?, notes?, status?, items: [{description, quantity, rate}], currency? }`
  - `status`: `draft|sent|accepted|rejected`
  - Server computes `subtotal`, `vat` (5%), `total`, and assigns sequential `number`.
- `GET  /api/quotations`
- `GET  /api/quotations/{id}`
- `PUT  /api/quotations/{id}`
- `DELETE /api/quotations/{id}`
- `POST /api/quotations/{id}/convert` → converts an accepted quotation into an invoice. Response = new invoice doc.
- `GET  /api/quotations/{id}/pdf` → `application/pdf` blob (use `expo-file-system` to save, then `expo-sharing` to share)

### Invoices
- `POST /api/invoices` body: `{ client_id, title?, issue_date?, due_date?, notes?, status?, items: [...], project_id?, currency? }`
  - `status`: `unpaid|paid|overdue`
- `GET  /api/invoices`
- `GET  /api/invoices/{id}`
- `PUT  /api/invoices/{id}`
- `PATCH /api/invoices/{id}/status` body: `{ status: "paid|unpaid|overdue", payment_date? }`
- `DELETE /api/invoices/{id}`
- `GET  /api/invoices/{id}/pdf` → PDF blob

### Recurring invoices
- `POST /api/recurring-invoices` body: `{ client_id, title?, notes?, frequency: "weekly|monthly|quarterly|yearly", next_run_date: "YYYY-MM-DD", is_active, currency, items, due_days }`
- `GET  /api/recurring-invoices`
- `GET  /api/recurring-invoices/{id}`
- `PUT  /api/recurring-invoices/{id}`
- `DELETE /api/recurring-invoices/{id}`
- `POST /api/recurring-invoices/{id}/generate` → creates a real invoice from the template now
- `POST /api/recurring-invoices/run-due` → admin sweep (you usually don't need this on mobile)

### Payments
- `POST /api/invoices/{invoiceId}/payments` body: `{ amount, method?, payment_date?, notes? }`
  - Updates invoice's `paid_amount` and flips status to `paid` when fully paid.
- `DELETE /api/invoices/{invoiceId}/payments/{paymentId}`
- `GET  /api/payments/reminders` → invoices needing follow-up (overdue / due soon)

### Expenses
- `POST /api/expenses` body: `{ vendor?, notes?, amount, currency?, category?, date?, project_id? }`
  - `category` is one of: `software, subscriptions, hardware, office, travel, fuel, meals, marketing, advertising, design_assets, stock_media, legal, accounting, bank_fees, utilities, phone_internet, education, freelancers, outsourcing, rent, tax, general`
- `GET  /api/expenses`
- `PUT  /api/expenses/{id}`
- `DELETE /api/expenses/{id}`

### AI helpers (use **sparingly** on mobile — they cost LLM credits)
- `POST /api/ai/parse-invoice` body: `{ text, currency? }` →
  `{ title, items: [{description, quantity, rate}], notes? }`
  Use case: voice-to-invoice on mobile. Pair with `expo-speech` or just text input.
- `POST /api/ai/compose-email` body: `{ invoice_id?, flavor: "gentle|firm|overdue|follow_up_quote|thank_you|project_update", extra_context? }` →
  `{ subject, html, to }`
- `POST /api/ai/categorize-expense` body: `{ vendor?, notes?, amount? }` →
  `{ category, confidence }`
  Use case: snap-a-receipt screen → user types vendor → suggest category.
- `POST /api/ai/draft-template` body: `{ trigger: "before|after", days, tone: "gentle|firm|overdue|final", name? }`

### Reminders (auto-emails)
- `GET  /api/reminders/settings`
- `PUT  /api/reminders/settings` body: `{ auto_reminders_enabled, remind_days_before_due: [3,1], remind_days_after_due: [1,7] }`
- `GET  /api/reminders/templates`
- `POST /api/reminders/templates` body: `{ name, trigger: "before|after", days, subject, html, is_active }`
- `PUT  /api/reminders/templates/{id}`
- `DELETE /api/reminders/templates/{id}`
- `POST /api/reminders/templates/preview` body: `{ subject, html }` → returns sample rendered output. **Mobile MUST sanitize the returned `html` before rendering** (use `react-native-render-html` with `defaultTextProps` or strip tags).

### Reports
- `GET /api/reports/pl` → `{ income, expense, net, series: [{month, income, expense, net}] }`
- `GET /api/reports/aging` → `{ buckets: {...}, rows: [...] }`
- `GET /api/reports/cashflow` → `{ next_30_days, next_60_days, next_90_days }`
- `GET /api/reports/client-profitability` → `[{ client_id, name, revenue, outstanding, invoice_count, avg_days_to_pay }]`

### Dashboard
- `GET /api/analytics/dashboard` → `{ total_clients, unpaid_count, unpaid_amount, overdue_count, overdue_amount, active_projects, total_revenue, monthly_earnings: [{month, amount}], recent_invoices }`

### CSV exports (great for "Export" button on mobile)
- `GET /api/export/clients.csv`
- `GET /api/export/invoices.csv`
- `GET /api/export/quotations.csv`
- `GET /api/export/projects.csv`

### Public invoice link (no auth)
- `POST /api/invoices/{id}/share` → `{ token: "..." }`
- `GET  /api/public/invoices/{token}` → invoice + business + client (read-only)
- Web view URL pattern: `<webBaseUrl>/p/<token>`

### Email service
- `GET  /api/email/status` → `{ configured, provider, sender, note }`
- `POST /api/email/send` body: `{ to, subject, html, cc?, invoice_id? }`

### Backup
- `GET  /api/backup.json` → full user data dump
- `POST /api/backup/restore` body: previous backup JSON

### Activity feed
- `GET /api/activity?limit=50`

---

## 4. Mobile-side TODO checklist

In the **mobile project** (`snsmjalzaabi/Lancely`), an agent should:

### Phase 1 — Wire to shared backend (1-2 hours)
- [ ] Delete `backend/` folder (or rename to `backend.legacy/` for safety)
- [ ] Remove backend-related supervisor entries / scripts
- [ ] Create `.env` with `EXPO_PUBLIC_BACKEND_URL=https://freelancer-hub-47.preview.emergentagent.com`
- [ ] Update `frontend/lib/api.ts` (or equivalent) to use `EXPO_PUBLIC_BACKEND_URL`
- [ ] Install `expo-secure-store` if not already: `npx expo install expo-secure-store`
- [ ] Replace any AsyncStorage token logic with SecureStore
- [ ] Update Login + Register screens to call `POST /api/auth/login` and `POST /api/auth/register` and store `data.token`
- [ ] Add the axios interceptor pattern shown above
- [ ] Wire all screens (Clients, Invoices, etc.) to use the endpoints in §3
- [ ] Verify on real device via Expo Go

### Phase 2 — Mobile-specific UX (optional, recommended)
- [ ] **Receipt capture for expenses:** use `expo-camera` or `expo-image-picker` to snap a photo,
      OCR with on-device or via a new backend endpoint (TBD), then call
      `POST /api/ai/categorize-expense` to auto-categorize.
- [ ] **Voice-to-invoice:** Speech input → `POST /api/ai/parse-invoice` → review screen.
- [ ] **PDF sharing:** Use `expo-file-system` + `expo-sharing` to save the PDF blob from
      `GET /api/invoices/{id}/pdf` and share via WhatsApp/Mail.
- [ ] **Pull-to-refresh** on lists; cache last response with `@tanstack/react-query` (already
      used on the web side too).

### Phase 3 — Push notifications (future)
The current backend does NOT yet have push-token endpoints. When ready, we'll add:
- `POST /api/devices` body: `{ expo_push_token, platform }`
- The auto-reminder scheduler can then send push alongside email.

---

## 5. Things to keep in mind

1. **CORS:** Not relevant for native (RN) builds — only for Expo's web preview. Already `*`.
2. **Date format:** ISO strings (`"2026-06-15"` for dates, full ISO with timezone for datetimes).
3. **All IDs are UUIDs** (strings), never Mongo ObjectIds.
4. **VAT:** Server computes 5% (UAE) automatically; mobile only sends raw line items.
5. **PDF endpoints** stream `application/pdf` — handle as `responseType: 'arraybuffer'` (axios) or
   `expo-file-system.downloadAsync`.
6. **Public reminder template HTML** comes from user input on the web side. Mobile must **never
   inject it into a `WebView` or HTML renderer without sanitizing**. The web side now uses
   DOMPurify; on mobile use `react-native-render-html`'s allowlist or strip tags before display.

---

## 6. Quick test plan once wired

```bash
# 1. Login (replace URL)
curl -X POST https://<api-base>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@lancely.ae","password":"test1234"}'

# 2. Save the token from the response, then:
TOKEN=...
curl https://<api-base>/api/auth/me -H "Authorization: Bearer $TOKEN"
curl https://<api-base>/api/clients -H "Authorization: Bearer $TOKEN"
curl https://<api-base>/api/analytics/dashboard -H "Authorization: Bearer $TOKEN"
```

If all three return 200 with sensible JSON, you're wired correctly.

---

## 7. What to copy/paste into the mobile project's Emergent chat

> "Switch this Expo app from its own backend to the shared Lancely web backend.
>
> 1. The shared API base URL is **`https://freelancer-hub-47.preview.emergentagent.com/api`** —
>    put it in `.env` as `EXPO_PUBLIC_BACKEND_URL=https://freelancer-hub-47.preview.emergentagent.com`.
> 2. Delete (or rename) the existing `backend/` folder — we won't use it anymore.
> 3. Replace all token storage with `expo-secure-store` under the key `lancely_token`.
> 4. Rewrite `frontend/lib/api.ts` (or wherever) to use the shared base + JWT bearer auth.
> 5. The full endpoint contract is in `MOBILE_INTEGRATION_BRIEF.md` (paste it from the web
>    project). Match every screen to the listed endpoints.
> 6. Verify login + clients list + dashboard analytics work end-to-end using credentials
>    `test@lancely.ae / test1234`.
> 7. Keep all UI; only swap data layer."

---

**End of brief.** Once the mobile app is pointed at this backend, both apps share data instantly.
No further bridge or sync code is needed.
