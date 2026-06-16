# Lancely — Security Notes

## Token Storage (localStorage vs httpOnly cookies)

Lancely currently stores the JWT auth token in `localStorage` (browser-side) under the key
`lancely_token`. A code review flagged this as a security concern because localStorage tokens
are accessible to JavaScript and can be exfiltrated by XSS.

### Why we kept `localStorage` (for now)

1. **PDF / CSV downloads via `window.open`** — `/api/invoices/{id}/pdf?token=...` and the four
   `/api/export/<entity>.csv?token=...` endpoints are opened in a new browser tab. With
   `httpOnly` cookies set on the API host, that new tab does send the cookie automatically only if
   the cookie's `SameSite` and `Domain` match — fine for a single-origin deployment but fragile
   across the Kubernetes ingress used in the preview environment.
2. **Cross-subdomain test environment** — During development and automated testing the frontend
   and backend are reached through the same hostname but cookies behave inconsistently with
   `window.open` and Playwright sessions. Query-string tokens keep download flows reliable.
3. **No third-party JS** — The app does not load any third-party scripts, so the XSS surface is
   limited to our own code.

### Mitigations in place

- JWT tokens expire after 7 days and are signed with a strong server-side secret (`JWT_SECRET` in
  `/app/backend/.env`).
- All user-supplied HTML (email composer body) is plain text rendered server-side by Resend, not
  injected via `dangerouslySetInnerHTML` in the React UI.
- We do not store passwords client-side; they are bcrypt-hashed server-side.
- The token is automatically cleared and the user is redirected to `/login` on any 401 from the API.

### How to migrate to `httpOnly` cookies later

1. Update `/api/auth/login` and `/api/auth/register` to set a cookie via FastAPI's
   `response.set_cookie("lancely_token", token, httponly=True, secure=True, samesite="lax")`.
2. Add a small dependency on the backend to read the cookie when `Authorization: Bearer` is absent.
3. Add CSRF protection for state-changing routes (e.g., double-submit token).
4. Replace `?token=` query string on `/pdf` and `/export/*.csv` with the cookie. This requires the
   download to be initiated from the same first-party origin (use `<a href>` instead of
   `window.open` with absolute URL).
5. Migrate the frontend `AuthContext` to call `/api/auth/me` to determine login state and stop
   reading `localStorage`.

## Other security considerations

- **Email service**: When `RESEND_API_KEY` is unset the `/api/email/send` endpoint returns
  `{ok:false, status:'not_configured'}` rather than failing. Real sending requires you to set the
  key in `/app/backend/.env` and restart the backend.
- **PII**: Client TRN, business address, and contact details are stored in MongoDB. There is no
  encryption-at-rest beyond what MongoDB itself provides; do not run this MVP on a shared host
  without storage-level encryption for production data.
- **Rate limiting**: Login is not rate-limited at the app layer; rely on the ingress/load balancer
  for now. Add a simple in-memory limiter or use an external service before launching publicly.
