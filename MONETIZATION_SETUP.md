# Lancely Monetization — Setup Walkthrough

Everything in the codebase is wired up. What you need to do next is **create the
external accounts** and **paste the keys into the `.env` files**. This document walks
you through it step by step.

---

## What's already built

### Backend (`/app/backend`)
- New `billing.py` module — `BillingProvider`, plan-gating dependency, webhook handler,
  REST-API fetcher for RevenueCat
- `/api/billing/status` — current plan + usage
- `/api/billing/refresh` — manual sync from RevenueCat
- `/api/billing/management-url` — opens RevenueCat-issued self-service portal
- `/api/webhooks/revenuecat` — secured by static bearer-token header
- Updated `auth/register` to grant a **14-day Pro trial** to every new user
- Pro-gating applied to: `/ai/parse-invoice`, `/ai/compose-email`,
  `/ai/categorize-expense`, `/ai/draft-template`, `/recurring-invoices` (POST),
  `/reminders/templates` (POST/PUT)
- Free-tier hard limits applied to `POST /clients`, `POST /invoices`, `POST /quotations`
- `pdf_generator.py` shows a promotional "Made with Lancely" footer for Free users only

### Frontend (`/app/frontend`)
- New `BillingContext` — sources truth from `/billing/status`, lazily initialises RevenueCat
- New `/pricing` public page — Free vs Pro tier cards with checkout buttons
- New **Billing tab** in Settings — usage bars + manage subscription button
- New `PlanBadge` in the top bar (clickable → Billing settings)
- Global **Upgrade Modal** — automatically triggered by the axios interceptor on any 402

---

## Step 1 — Create RevenueCat account

1. Go to **https://app.revenuecat.com** and sign up (free).
2. After signup you'll be prompted to **create a Project**. Call it `Lancely`.
3. You'll be asked to add an "app". For now you'll add a **Web Billing** app:
   - Platform: **Web**
   - App name: `Lancely Web`

> NOTE: If you also want the mobile Lancely to share subscriptions later, you'll add an
> iOS app and an Android app to the *same project*. For now, just add Web Billing.

---

## Step 2 — Connect Stripe

RevenueCat's Web Billing is backed by Stripe under the hood. They handle the actual
checkout, currency conversion, and card processing — RevenueCat just orchestrates and
keeps your entitlements in sync.

1. Inside RevenueCat → your Lancely project → **Integrations** → **Stripe**.
2. Click **Connect**. It will redirect you to Stripe — sign in (or sign up at
   https://stripe.com if you don't have an account).
3. Approve the connection. Stripe will be linked to your RevenueCat project.

> If you're targeting UAE freelancers, make sure your **Stripe account currency**
> defaults to **AED** during Stripe onboarding (you'll be asked).

---

## Step 3 — Create the Pro product in RevenueCat

1. In RevenueCat → your project → **Products** → **+ New product**.
2. Configure:
   - **Identifier**: `pro_monthly`
   - **Display name**: `Lancely Pro (Monthly)`
   - **Type**: Auto-renewable subscription
   - **Duration**: 1 month
   - **Web Billing pricing** → set price **AED 39.00** for AED currency
3. Create a second product `pro_annual`:
   - Same except duration **1 year** and price **AED 390.00**.
4. **Add a 14-day free trial** to both products (RevenueCat → product → Trial → 14 days).
   This means RevenueCat enforces the trial on the Stripe side too, so users won't be
   charged for the first 14 days.

> Heads-up: our backend *also* grants a 14-day Pro trial on registration that doesn't
> require a credit card. That's the "no-card trial" experience. RevenueCat's product-
> level trial kicks in when users actually subscribe (so if they subscribe on day 5,
> the card is charged on day 19 — they effectively get 14+14 days). You can simplify by
> disabling either trial layer if you want.

---

## Step 4 — Create the entitlement

1. In RevenueCat → **Entitlements** → **+ New entitlement**.
2. **Identifier**: `pro` (this MUST match `RC_PRO_ENTITLEMENT_ID` in our backend .env)
3. **Attached products**: select both `pro_monthly` and `pro_annual`.

---

## Step 5 — Create the offering

An "offering" is what's displayed on the paywall.

1. RevenueCat → **Offerings** → **+ New offering**.
2. **Identifier**: `default`
3. Add two packages:
   - **Monthly** → `$rc_monthly` → attach `pro_monthly`
   - **Annual** → `$rc_annual` → attach `pro_annual`
4. Save and make sure this offering is set as **Current**.

> Our frontend `Pricing.jsx` already looks up `$rc_monthly` and `$rc_annual` by
> identifier, so as long as you use those exact identifiers the buttons will work.

---

## Step 6 — Get the API keys

In RevenueCat → **API Keys**:

| Key in RevenueCat | Goes into | Var name |
|---|---|---|
| **Web Billing Public API Key** | `/app/frontend/.env` | `REACT_APP_RC_WEB_API_KEY` |
| **Secret API Key (v2)** | `/app/backend/.env` | `RC_SECRET_API_KEY` |

> The **public key** is fine to commit to your codebase (it's designed for client use).
> The **secret key** must NEVER be exposed in the frontend or in public repos.

---

## Step 7 — Set up the webhook

1. In RevenueCat → **Integrations** → **Webhooks** → **+ Add Webhook**.
2. **URL**: `https://www.lance-ly.com/api/webhooks/revenuecat`
   (or your `*.emergent.host` URL while testing in preview)
3. **Authorization header value**: paste this exact value:
   ```
   Bearer lancely-rc-webhook-changeme-2026
   ```
   (Or, even better, change it to a fresh random string and update both
   `RC_WEBHOOK_AUTH_SECRET` in `/app/backend/.env` AND the webhook config.)
4. **Event filters**: keep them all enabled — the backend handles `INITIAL_PURCHASE`,
   `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION`, etc. uniformly.

---

## Step 8 — Update `.env` files

Once you have the keys from Steps 6 & 7:

**`/app/backend/.env`** — replace the placeholder lines:
```
RC_SECRET_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxx
RC_WEBHOOK_AUTH_SECRET=<the-secret-you-pasted-into-revenuecat>
RC_PRO_ENTITLEMENT_ID=pro
```

**`/app/frontend/.env`** — fill in the value:
```
REACT_APP_RC_WEB_API_KEY=rcb_xxxxxxxxxxxxxxxxxxxxxxx
```

Then restart services:
```
sudo supervisorctl restart backend frontend
```

---

## Step 9 — Test on the preview environment

1. Open `https://freelancer-hub-47.preview.emergentagent.com/pricing`
2. Click **Subscribe monthly**.
3. Stripe checkout opens (still in test mode unless you've activated Stripe live mode).
4. Use a Stripe test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date
   - CVC: any 3 digits
5. Complete the checkout.
6. You should be redirected back to the dashboard, and the Plan badge in the topbar
   should now read **Pro**.
7. In RevenueCat → **Customers**, you should see the user with an active `pro`
   entitlement.

---

## Step 10 — Go live

When you're ready to accept real money:

1. In **Stripe Dashboard** → toggle from Test to Live mode (top-right). Stripe will
   ask you to complete a brief verification flow.
2. In **RevenueCat** → re-link Stripe (it'll detect the live mode).
3. **Redeploy** the Emergent app so the production environment picks up the new
   `.env` values.

---

## Mobile companion (later)

When you're ready to wire monetization into the **mobile Lancely** (Expo project):

1. In your existing RevenueCat project, add an **iOS app** and an **Android app**.
2. Use the **same `pro` entitlement and `$rc_monthly`/`$rc_annual` packages** — they
   work across all platforms.
3. Get the **iOS Public SDK Key** and **Android Public SDK Key**.
4. In your mobile project, configure `react-native-purchases` with the user's
   `appUserId` = the same `user.id` they have on the web (you'll get this from
   `/api/auth/me`).
5. A user who subscribes on iOS will instantly have Pro on web (and vice versa)
   thanks to the unified RevenueCat backend.

I'll hand you a separate brief for the mobile project when you're ready.

---

## What you can do RIGHT NOW (without any keys)

Even with all the RevenueCat fields blank, the app fully works:
- ✅ Free-tier users are correctly capped at 1 client, 3 invoices/mo
- ✅ Trial users (new signups) get unlimited Pro access for 14 days
- ✅ Existing users without `plan_tier` set default to Free
- ✅ AI / recurring / templates correctly return 402 for non-Pro users
- ✅ Upgrade modal appears on the UI when a 402 is hit
- ✅ Pricing page renders (just shows "No subscription package available" if you
  click Subscribe without RC keys configured)
- ✅ PDFs for Free users show the "Made with Lancely" footer

You can test the **entire UX flow** before wiring up real billing. The only thing that
doesn't work without keys is the actual Stripe checkout.

---

## Troubleshooting

**"No subscription package available" toast on Pricing page**
→ `REACT_APP_RC_WEB_API_KEY` is empty or wrong. Re-paste from RevenueCat dashboard.

**Webhook not updating the user's plan in MongoDB**
→ Check backend logs: `tail /var/log/supervisor/backend.out.log | grep RevenueCat`.
→ Verify the `Authorization` header in RevenueCat webhook config matches
  `RC_WEBHOOK_AUTH_SECRET` in backend .env (including the `Bearer ` prefix).

**User subscribed but still shows Free**
→ Click the **Refresh** button in Settings → Billing. This forces a sync from
  RevenueCat's REST API. If still wrong, check that the `appUserId` used at checkout
  matches the user's `id` field in MongoDB.

---

That's it. Once you give me the keys (or paste them into `.env` yourself), monetization
is live. Ping me if anything in the setup doesn't go as expected.
