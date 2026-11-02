# Security standard

**Version:** 1.0 (2026-11-02). **For:** every project of ours, backend and frontend, and the
servers they run on. **Audience:** the developer, or the AI agent, building or reviewing a
project's security.

Every application of ours handles accounts, and most handle personal data. This standard sets the
security baseline they all meet: how people sign in, how access is decided, how input and output
are handled, where secrets live, which headers are sent, how abuse is limited, how dependencies are
kept safe, and what happens when something goes wrong. The yardstick is
[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) level 2.

The rules are stack-agnostic. Concrete libraries are in the **Reference implementation
(Node/React)** callouts.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at what the project has: authentication and session
   code, permission checks, middleware order, security headers, rate limits, CI scans, secret
   handling, backup scripts. Build on what exists; replace what contradicts this standard.
2. Treat every rule as a requirement with a test where a test is possible (a refused request, a
   header present, a cookie flag set, a lockout reached).
3. Never weaken a control to make a test or a feature pass. A control a project cannot meet is a
   decision in its log, with the compensating measure.
4. Finish with the checklist in section 13. Report every gap you found, fixed or not.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs `SEC-<area><n>`:
`A` authentication, `Z` authorization, `I` input and output, `S` secrets, `T` transport and headers,
`R` rate limiting and abuse, `D` dependencies, `L` security logging, `E` errors, `B` backups, `X`
incident response, `P` periodic review.

## 1. Authentication and sessions

- **SEC-A1 — Password policy.** At least 12 characters (up to at least 128), checked the same way in
  the frontend and the backend (ARCH-V1); a live checklist under the field says what is missing.
  Composition rules (lower, upper, digit, symbol) are allowed but length matters most. No forced
  periodic rotation. Login never applies a new policy to an old password; the next change does.
  Checking a new password against a breached-password list (k-anonymity API or a local list) is
  recommended; if not adopted, it is a decision.
- **SEC-A2 — Password storage.** A slow, salted, adaptive hash: argon2id, or bcrypt with cost ≥ 12.
  Never a fast hash, never reversible encryption. Rehash on login when the parameters were raised.
- **SEC-A3 — A second factor** for every account that can see personal data of others or administer
  the platform: a one-time code (emailed or TOTP) or a passkey. One-time codes are random, short-lived
  (≤ 10 minutes), single use, stored hashed, and limited in attempts (e.g. 3) before a new code is
  needed.
- **SEC-A4 — Login does not reveal accounts.** Login, password reset, sign-up and "resend" answer the
  same way, with the same timing, whether the account exists or not ("If an account exists, we sent
  an email"). A sign-up for a taken address sends an email to that address instead of an error on
  screen.
- **SEC-A5 — Account lockout.** After a few failed logins on one account (e.g. 5), the account is
  locked for a while (e.g. 15 minutes), independently of the per-IP rate limit, so a distributed
  attack on one account is stopped too. The lockout answer is the same as a wrong password (SEC-A4)
  and is a security event (SEC-L1).
- **SEC-A6 — Short access, rotated refresh.** Access tokens live minutes (e.g. 5–15). Refresh tokens
  are opaque random values stored **hashed**, bound to a session, valid days not months, and
  **rotated on every use**: the old one is revoked when the new one is issued.
- **SEC-A7 — Refresh-token reuse detection.** A revoked refresh token presented again (after a few
  seconds of grace for parallel tabs) means it was stolen: revoke the whole session family and log a
  security event.
- **SEC-A8 — Session control.** A password change or reset revokes every other session; an account
  disable revokes all of them; logout revokes the current one server-side. A person can see and end
  their sessions where the product allows it.
- **SEC-A9 — Cookies.** Session cookies are `HttpOnly`, `Secure` (everywhere except plain-HTTP local
  development), `SameSite=Lax` or `Strict`, `Path=/` or narrower, without a `Domain` attribute unless
  a subdomain must share them. A value the frontend must read (a CSRF token) is not a credential.
- **SEC-A10 — CSRF.** Every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated by a
  cookie carries a CSRF token in a header that matches a cookie (double submit) or the session,
  compared in constant time. Bearer-token clients don't need it. OAuth/OIDC flows bind the callback
  to a `state` value stored in a short-lived cookie (login CSRF).
- **SEC-A11 — Tokens in links** (verification, reset, invitation, deletion confirmation) are random
  (≥ 128 bits), stored hashed, single use, short-lived (an hour for a reset, a few days at most for an
  invitation), and never logged (logging standard, section 6).
- **SEC-A12 — Calling applications are identified.** When several clients call the API (web app,
  mobile, partner), each has an id and a key stored hashed; a request without a known client is
  refused before authentication.

> **Reference implementation (Node/React).** bcrypt (cost 12); JWT access token of 5 minutes in an
> `HttpOnly` cookie (or a bearer header for non-browser clients); refresh tokens of 7 days, SHA-256
> hashed in a collection, rotated with a guarded `findOneAndUpdate({ tokenHash, revoked: false })`,
> reuse grace 5 s; email one-time code with 3 attempts; lockout 5 failures / 15 minutes; double-submit
> CSRF middleware (`X-CSRF-Token` header vs a `SameSite=Strict` readable cookie, `crypto.timingSafeEqual`),
> logout exempt; app-client keys HMAC-hashed with a server secret.

## 2. Authorization

- **SEC-Z1 — Deny by default.** Every route requires an authenticated caller and a named permission,
  except an explicit, reviewed list of public routes. A new route without a permission fails a test.
- **SEC-Z2 — Decided on the server, every time.** The frontend hides what the API says is not
  allowed; it never decides (ARCH-3). Permissions are read fresh enough that a revoked right stops
  working within seconds, not at the next login.
- **SEC-Z3 — Object-level checks.** Holding `orders.read` doesn't mean any order: every read and
  write checks that the caller may reach **that** record (tenant, ownership, assignment), in the
  query itself (ARCH-B10). A record the caller may not see is `404`, not `403`, so ids can't be
  probed.
- **SEC-Z4 — No privilege above one's own.** Nobody grants a permission they don't hold, assigns a
  role above their own, or edits an account above them. Protected accounts (the platform owner) can't
  be demoted, disabled or deleted by any code path.
- **SEC-Z5 — Mass assignment.** Request schemas list the fields a caller may set; fields like
  `role`, `organizationId`, `status` or `isAdmin` are never taken from a body unless that route is
  about them and the permission allows it (ARCH-V3).
- **SEC-Z6 — Tests per role.** Every role is tested against every route that matters, allowed and
  refused (testing standard, section 4), including another tenant's ids.

## 3. Input and output

- **SEC-I1 — Validate at the edge.** Every input is parsed by a schema before use (architecture
  standard, section 6): types, lengths, ranges, formats, unknown fields refused. Body size is capped
  at the HTTP layer.
- **SEC-I2 — Queries are parameterised.** No string-built SQL or query objects from raw input; for
  document databases, operators in input (`$where`, `$gt` as a key) are refused by the schema.
- **SEC-I3 — Output is encoded by the framework.** The UI renders text as text. Raw HTML insertion
  (`innerHTML` and equivalents) is forbidden except for sanitised rich text.
- **SEC-I4 — Rich text is sanitised on the server** with a real HTML parser and an allow-list of tags,
  attributes and URL schemes (`http`, `https`, `mailto`), before it is stored; links get
  `rel="noopener noreferrer"`.
- **SEC-I5 — File uploads.** Size limit, type checked from the content (magic bytes), not from the
  name or the client's type; stored outside the web root under a random name; served with
  `Content-Disposition: attachment` and the stored type, from a separate domain or with
  `X-Content-Type-Options: nosniff`; scanned for malware when files are shared with other people.
- **SEC-I6 — Exports.** CSV/spreadsheet exports neutralise formula injection (a cell starting with
  `=`, `+`, `-`, `@` is prefixed) and are capped in rows.
- **SEC-I7 — Outbound requests** to a URL derived from input are allow-listed by host (no
  server-side request forgery to internal addresses).

## 4. Secrets

- **SEC-S1 — Never in the repository.** No secret in code, config, tests, docs or history. Fake
  values for tests are obviously fake and allow-listed. A secret pushed by mistake is **rotated**,
  then removed from history.
- **SEC-S2 — A secret scan on every commit and in CI**: gitleaks on the staged changes in the
  pre-commit hook and on the whole history in CI ([commit-checks standard](commit-checks.md),
  section 3.4).
- **SEC-S3 — Secrets come from the environment** or a secret store, read only by the config module
  (ARCH-C1), per environment, never shared between production and the others. `.env.example` names
  them with placeholders.
- **SEC-S4 — Least privilege.** Each secret grants only what the service needs (a database user per
  environment, read-only partner tokens where possible, no administrator tokens in the app).
- **SEC-S5 — Rotation.** Every secret has a known rotation procedure (written in the deployment
  docs) and is rotated when someone with access leaves, after an incident, and when a provider
  recommends it. Keys used for signing or encryption carry a key id, so old and new can overlap.
- **SEC-S6 — Never printed.** Secrets never appear in logs, error reports, command lines, CI output
  or chat; they are referred to by their variable name.

## 5. Transport and headers

- **SEC-T1 — HTTPS only.** Plain HTTP only redirects to HTTPS. TLS 1.2 minimum, certificates renewed
  automatically and monitored (service-health standard, section 11).
- **SEC-T2 — HSTS** with at least one year (`max-age=31536000; includeSubDomains`), on the production
  domain once every subdomain serves HTTPS.
- **SEC-T3 — Content Security Policy** without `unsafe-inline` or `unsafe-eval` for scripts:
  `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` (or
  `'self'`), and explicit sources for anything external. A documentation UI that needs inline scripts
  is disabled in production or served under its own policy.
- **SEC-T4 — Other headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` (or stricter), a `Permissions-Policy` that turns off what the app
  doesn't use, `Cross-Origin-Opener-Policy: same-origin`. No `X-Powered-By` or server version.
- **SEC-T5 — CORS allow-list.** Only the app's own origins, per environment, from config; never `*`
  with credentials; the exposed headers listed explicitly.
- **SEC-T6 — Non-production is closed.** Develop and staging are behind a login gate or an IP
  allow-list and send `X-Robots-Tag: noindex`; a public demo carries no real data.

> **Reference implementation (Node/React).** `helmet` with an explicit CSP, `cors` with an origin
> function over `CORS_ALLOWED_ORIGINS`, Express `trust proxy` set to the number of proxies; the edge
> proxy (Caddy) terminates TLS, adds HSTS and the basic-auth gate on non-production hosts.

## 6. Rate limiting and abuse

- **SEC-R1 — Limits per route.** A global limit on every request, and tighter limits per kind of
  route: login and code verification (counting failures only), password reset and sign-up (counting
  every call), public forms ([architecture standard](architecture.md), ARCH-V10), and authenticated
  reads and writes. A signed-in caller is counted per account, an anonymous one per IP.
- **SEC-R2 — The answer is `429`** with its own code, `retryAfterSeconds` and the standard rate-limit
  headers ([API standard](api.md), API-R1); every refusal is counted in metrics.
- **SEC-R3 — Shared counters with several instances.** In-memory counters are only valid with one
  instance; with several, the counters live in a shared store.
- **SEC-R4 — Bot traps on every public form** (ARCH-V9) and an email cooldown, so a form can't be
  used to flood someone's inbox.
- **SEC-R5 — Request deadline.** Every request has a time limit (e.g. 30 s) and the body parser has a
  size limit, so slow or large requests can't exhaust the service.

## 7. Dependencies and supply chain

- **SEC-D1 — Lockfiles committed**, and CI installs exactly them (`npm ci` or equivalent).
- **SEC-D2 — An audit gate in CI**: the build fails on a known high or critical vulnerability in a
  production dependency; an accepted one is a dated, reasoned exception that expires.
- **SEC-D3 — Automated updates** (Renovate or Dependabot): security updates at once, others grouped
  weekly; every update goes through the full pipeline.
- **SEC-D4 — Images.** Base images pinned by digest (or exact version) and rebuilt regularly; the
  built image is scanned and the pipeline fails on a fixable critical vulnerability (CI/CD standard);
  containers run as a non-root user with a read-only root filesystem where possible.
- **SEC-D5 — CI actions pinned** to a commit SHA, with the least permissions per job.
- **SEC-D6 — SBOM (optional).** Generate a software bill of materials with each image, so a new
  vulnerability can be matched to what runs.
- **SEC-D7 — New dependencies are chosen**: maintained, widely used, licence compatible, and not
  added for what a few lines would do.

> **Reference implementation (Node/React).** `npm audit --omit=dev --audit-level=high` in CI;
> Renovate; Trivy on every built image (`--severity CRITICAL --ignore-unfixed`); GitHub Actions pinned
> by SHA; `docker buildx` with `sbom: true`; the image's own `apk upgrade` when a base image fix lags.

## 8. Security logging

- **SEC-L1 — Security events are recorded** in the audit log ([audit-log standard](audit-log.md)):
  login success and failure, lockout, one-time code failures, password change and reset, MFA changes,
  session revocation, refresh-token reuse, permission and role changes, denied access to sensitive
  records, and administrator actions.
- **SEC-L2 — Anomalies raise alerts** (audit-log standard, section 12): many denied requests per
  account or IP, mass reads, token reuse, lockouts.
- **SEC-L3 — Logs and error reports are scrubbed** ([logging standard](logging.md), section 6): no
  credentials, tokens, personal data or raw IPs.

## 9. Errors

- **SEC-E1 — No internals in answers.** An error body is the code, a short message and the request
  id (architecture standard, 6.2). Never a stack trace, a query, a file path, a library message or a
  version, in any environment reachable from outside.
- **SEC-E2 — Same answer for "not there" and "not yours"** (SEC-Z3), and for "unknown account" and
  "wrong password" (SEC-A4).
- **SEC-E3 — Unexpected errors** are `500` with a generic code, logged once with their stack and
  sent to error tracking (scrubbed).

## 10. Backups and restore

- **SEC-B1 — Production data is backed up daily**, as a consistent snapshot, encrypted on the
  client side with a key the server can't use to decrypt (public-key encryption, private key kept
  offline), stored off the server in the same legal region as the data.
- **SEC-B2 — Retention** is defined (e.g. 14 daily + 8 weekly) and pruning never runs after a failed
  backup. The bucket uses versioning or object lock so a stolen key can't erase history.
- **SEC-B3 — Restore drills.** A backup is restored into a throwaway instance and compared with its
  manifest: before go-live, then monthly. The date and result go in the ops log (CI/CD standard).
- **SEC-B4 — Monitored.** A failed or missing backup alerts (dead-man's switch, service-health
  standard, section 11).

## 11. Incident response

- **SEC-X1 — Written beforehand.** The project's deployment docs say who is on call, how to reach
  them, who decides, and who talks to customers and authorities.
- **SEC-X2 — Steps:** contain (revoke sessions, disable accounts or keys, take a component offline),
  preserve evidence (logs, audit rows, seals), **rotate every secret that may be exposed**, fix,
  restore, and write a post-mortem with actions.
- **SEC-X3 — Notification duties.** A personal-data breach is assessed at once against the
  data-protection law that applies ([privacy standard](privacy.md), section 9): e.g. the authority
  within 72 hours under the GDPR, "as soon as possible" under the Swiss nLPD, and the people affected
  when the risk is high. The assessment is recorded even when no notification is due.
- **SEC-X4 — Every server action during an incident** is appended to the ops log.

## 12. Periodic review

- **SEC-P1 — ASVS level 2** is the yardstick: before go-live and once a year, the project goes through
  it and records the gaps as issues.
- **SEC-P2 — A penetration test before go-live** by someone who didn't build it, and after a major
  change of the authentication, authorization or data model. Findings are fixed or accepted as
  decisions.
- **SEC-P3 — Access review** every quarter: who holds administrator roles, server access, CI
  secrets and partner accounts; leavers removed the day they leave.
- **SEC-P4 — This checklist** is re-run at each review and its result recorded.

## 13. Checklist

- [ ] Password policy (≥ 12 characters, same rule front and back), adaptive hash, no forced rotation; breached-password check adopted or a decision.
- [ ] Second factor for privileged accounts; one-time codes short-lived, single use, hashed, limited attempts.
- [ ] No account enumeration in login, reset, sign-up and resend; per-account lockout logged as a security event.
- [ ] Short access tokens; hashed, rotated refresh tokens; reuse revokes the session; password change revokes other sessions.
- [ ] Cookies `HttpOnly`, `Secure`, `SameSite`; CSRF token on cookie-authenticated unsafe requests; OAuth `state` bound to a cookie.
- [ ] Deny by default; permission per route; object-level checks in the query; `404` for what isn't visible; no privilege above one's own; tests per role.
- [ ] Schema validation at the edge, body size limit, parameterised queries, server-side HTML sanitising, safe uploads and exports, outbound URL allow-list.
- [ ] No secret in the repo; gitleaks in the hook and in CI; secrets per environment, least privilege, rotation documented.
- [ ] HTTPS only, HSTS, CSP without unsafe inline scripts, `frame-ancestors`, referrer policy, nosniff, CORS allow-list; non-production closed and noindex.
- [ ] Global and per-route rate limits with `429`; shared counters when several instances run; bot traps and email cooldowns on public forms; request deadline.
- [ ] Lockfiles, audit gate, automated updates, pinned and scanned images, pinned CI actions.
- [ ] Security events in the audit log, anomaly alerts, scrubbed logs and error reports.
- [ ] Error bodies leak nothing; unexpected errors are generic `500`s, tracked.
- [ ] Encrypted off-server backups, retention, restore drill before go-live and monthly, backup failures alert.
- [ ] Incident response written down, including secret rotation and breach notification duties.
- [ ] ASVS level 2 review and a penetration test before go-live; quarterly access review.
