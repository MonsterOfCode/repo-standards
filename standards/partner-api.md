# Partner API standard

**Version:** 1.0 (2026-11-03). **For:** every server-to-server API between one of our systems and an
outside organisation: the APIs we build for partners to call, the webhooks we send them, and the
partner APIs we call. **Audience:** the developer, or the AI agent, building, reviewing or choosing
such an integration.

A partner integration moves data across an organisation boundary, usually personal data, with a
credential that lives on someone else's server. This standard makes that as safe as it can be: every
credential is scoped, restricted and rotatable without downtime, every request carries only what the
caller needs, and the data that crosses is the minimum for the purpose.

- **Part A** (sections 1-6) is the contract for the partner APIs and webhooks **we build**. Every API
  built under these standards follows it.
- **Part B** (section 7) is how we **call** a partner's API, whoever built it.
- **Part C** (section 8) is the guide for **choosing** a partner API we will consume, and for what to
  ask its provider when it falls short of part A.

Everything in the [API standard](api.md) (URLs, envelope, errors, versioning, OpenAPI) and the
[security standard](security.md) applies too; this standard adds what is specific to an outside
caller. The rules are stack-agnostic; concrete code is in the **Reference implementation (Node)**
callouts.

**If you are an agent implementing this in a project:**

1. Read the whole standard, then the project's existing integrations (clients, credentials, webhook
   code) and its privacy register.
2. Building a partner API: apply part A in full; any rule not applied is an exception recorded in the
   project's decision log with its reason.
3. Integrating a partner's API: fill in the section 8 evaluation in a decision entry before writing
   the client, then build the client to section 7.
4. Finish with the checklist in section 9.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`PAPI-<area><n>`: `K` credentials, `N` network, `S` request signing, `G` granularity and
minimisation, `W` webhooks, `O` operations, `C` consuming, `E` evaluation.

---

## Part A — Partner APIs we build

## 1. Credentials

- **PAPI-K1 — One credential per partner, per environment, per purpose.** Created by an administrator
  of ours for a named partner (a record with its name, contact, purpose and legal basis), never shared
  between partners, never valid in another environment. A dev credential does not work on staging or
  production.
- **PAPI-K2 — Scoped to the least it needs.** A credential carries named scopes
  (`competences.read`, `orders.write`); a read-only integration gets read-only scopes. A route checks
  the scope as it checks a permission (SEC-Z1) and the object-level rules still apply (SEC-Z3): the
  credential reaches only the data of the partner's own relationship.
- **PAPI-K3 — Strong, recognisable, shown once.** At least 256 bits of randomness, with a fixed
  prefix that names the system and kind (`<sys>_live_...`, `<sys>_test_...`) so secret scanners
  recognise it. The raw value is shown once at creation; the server stores only a keyed hash
  (HMAC-SHA256 with a server-side pepper) plus a short fragment of the start and end so an
  administrator can tell which key a partner has configured.
- **PAPI-K4 — Rotation with overlap.** Replacing a credential issues a new one and keeps the previous
  one valid for a configurable grace period (default 24 hours, at least 15 minutes), so the partner
  switches without downtime; the old one then stops on its own. An **emergency rotation** ends the old
  one at once (suspected leak). Both are audited.
- **PAPI-K5 — Revocable, observable, optionally expiring.** An administrator can revoke a credential
  at once; each credential records `createdAt`, `lastUsedAt` and the last caller IP; a credential may
  carry an expiry date, and one unused for 90 days is flagged for review.
- **PAPI-K6 — Sent only in a header.** `Authorization: Bearer <key>` (or a documented header), never
  in the URL, the query string or the body. A key found in a URL is refused **and** the credential is
  treated as leaked (flagged for rotation).
- **PAPI-K7 — One answer for every refusal.** Missing, unknown, revoked, expired key, wrong
  environment or a caller outside the allow-list: all `401` with the same code
  (`invalid_credentials`). The reason is in our audit log, never in the answer.

## 2. Network

- **PAPI-N1 — IP allow-list per credential.** Each credential holds the addresses or CIDR ranges it
  may be used from; a call from anywhere else is refused (PAPI-K7). In production a credential
  **must** have an allow-list; one without is an exception in the decision log (e.g. a partner with no
  fixed egress, compensated by signing every request, PAPI-S1). The caller's IP is taken from the edge
  proxy's trusted header only (the proxy hops are configured, never "trust every hop").
- **PAPI-N2 — HTTPS only**, TLS 1.2 minimum (SEC-T1). Partner routes answer no CORS headers: they are
  server to server and a browser must never call them.
- **PAPI-N3 — mTLS (optional)** for partners that can hold a client certificate: the edge verifies
  the certificate against the partner's registered one, on top of the key. It replaces neither the
  key nor the allow-list.

## 3. Request signing

A bearer key proves only that the caller has the key: whoever copies one request can replay it, and
the key itself travels on every call. A signature computed over the request with a secret that never
travels closes both gaps.

- **PAPI-S1 — When it is required.** Every partner route that **changes state** must require a
  signed request. Routes that **read** special-category data (health, financial, identity) should
  require it; a read route without it is fine only with an IP allow-list (PAPI-N1). A credential
  **without** an allow-list (a recorded exception to PAPI-N1) must sign **every** request, reads
  included: signing is what replaces the allow-list, so it can't stay optional there.
- **PAPI-S2 — What is signed.** HMAC-SHA256, with a per-credential signing secret (separate from the
  key, rotated with overlap like it), over the canonical string

  ```
  <timestamp>\n<METHOD>\n<path with query, as sent>\n<hex SHA-256 of the raw body, or of "" when empty>
  ```

  sent as `Signature: t=<unix seconds>,v1=<hex hmac>`. During an overlap both secrets' signatures are
  accepted (several `v1=` values may be sent).

- **PAPI-S3 — How it is checked.** The comparison is constant-time and the body hash is computed
  from the raw bytes received, before parsing. Replay is closed in two layers:
  - **After the window:** the timestamp must be within 5 minutes of the server clock, so a copied
    request is useless once it is older than that, whatever it is.
  - **Inside the window:** on a state-changing route the request carries a unique `Idempotency-Key`
    (API standard) or nonce, covered by the signature, and the server remembers it for those 5
    minutes; the same key seen again is refused (or, for an idempotent create, answered with the
    first result and nothing done twice). A copied request can't be sent again, even seconds later.
    The key belongs to one request, not to a record: a partner sends as many updates as it wants,
    one after another, each with a new key; only the very same request sent twice is refused.

  A read route needs only the first layer: replaying a read inside 5 minutes returns data the caller
  could already read.

## 4. Granularity and data minimisation

The default for a partner API is: the partner asks about the subjects it already knows, and gets
back only the fields its purpose needs. The privacy standard's minimisation rules apply in full.

- **PAPI-G1 — Query by subject.** Reads take the identifiers the partner already holds (a
  professional number, an order id) and answer only for those: `GET /competences?gln=...`, or a batch
  `POST /competences/query` with up to a documented maximum (e.g. 100 ids) for a periodic sync. The
  maximum is enforced.
- **PAPI-G2 — No bulk dump by default.** An endpoint that returns every subject the partner may see
  exists only by a recorded decision (with the reason a per-subject query cannot work). A sync that
  needs to detect changes uses a **change feed**: `GET /changes?since=<cursor>` returning ids and
  change types only, followed by per-subject queries (PAPI-G1).
- **PAPI-G3 — Fields per purpose, strictest where it matters most.** Each scope has a field
  allow-list and an answer carries those fields and nothing else. How strict depends on the data:
  - **Sensitive data** (health, financial, identity numbers, location of a person, any special
    category of the [privacy standard](privacy.md)): **must** - only the fields the purpose needs, each
    one justified in the partner record; names, internal ids, identifiers from other systems, free
    text and links are left out unless that record says why they are needed.
  - **Other personal data** (names, professional contact details): **should** - leave out what the
    purpose doesn't use; a field more is a decision, not a habit.
  - **Data that is not personal** (catalogues, reference lists, public classifications): free to
    shape for convenience.
- **PAPI-G4 — No existence oracle.** An identifier the partner may not see, that does not exist, or
  whose subject has not consented, answers the same as a subject with no data (an empty result), never
  a distinct error. A partner learns nothing about people outside its relationship.
- **PAPI-G5 — Consent and relationship decide visibility.** A subject appears to a partner only while
  the relationship exists (membership, contract, consent) and disappears from the next answer when it
  ends; the API documents this so the partner deletes what is no longer returned.

## 5. Webhooks we send

- **PAPI-W1 — Data-free.** A webhook says that something changed: event type, subject id, event id
  and time. It carries no personal data; the partner reads the details through the authenticated API
  (section 4), so a leaked webhook or a misdirected URL exposes nothing.
- **PAPI-W2 — Signed.** Every delivery is signed as in PAPI-S2 (canonical string with the timestamp
  and the body hash), with a per-partner webhook secret rotated with overlap. The documentation tells
  receivers to verify it and to refuse anything older than 5 minutes.
- **PAPI-W3 — Only to registered HTTPS URLs.** An administrator registers the URL; it must be
  `https`, is checked against private and link-local addresses on every delivery (SSRF, SEC-I7) and
  redirects are not followed.
- **PAPI-W4 — Reliable and idempotent.** Retries with exponential backoff for at least 24 hours,
  each delivery keeping its event id so the receiver can drop duplicates; a delivery log per partner
  (status, attempts, last error), and repeated failures disable the endpoint and alert our team.

## 6. Operations

- **PAPI-O1 — Rate limited per credential**, with documented limits, `429`, `Retry-After` and the
  rate-limit headers (API standard, section 8).
- **PAPI-O2 — Every call is audited** ([audit-log standard](audit-log.md)): credential, partner,
  route, outcome, the number of subjects returned and their ids when the data is personal (who saw
  what). Never the key, the signature or the response data.
- **PAPI-O3 — Anomalies alert:** a burst of refused calls on one credential, calls from a new IP, a
  volume far above the partner's usual, a key sent in a URL (audit-log standard, section 12).
- **PAPI-O4 — A published contract.** OpenAPI for the partner routes, given to the partner; changes
  are additive within a version and a deprecation is announced at least 6 months ahead (API-V3).
- **PAPI-O5 — A test environment with test data** and its own credentials, so a partner can build
  against it without production data.
- **PAPI-O6 — A partner record and agreement.** Each partner's record states the purpose, the data,
  the legal basis and the data processing agreement where one is needed
  ([privacy standard](privacy.md)); the integration is listed in the data register.

> **Reference implementation (Node).**
>
> ```js
> // Stored: { keyHash, keyFragment, previousKeyHash, previousKeyRetiredAt, allowedCidrs, scopes }
> const hashKey = (raw) =>
>   crypto
>     .createHmac("sha256", config.partnerKeyPepper)
>     .update(raw)
>     .digest("hex");
> const withinOverlap = (retiredAt) =>
>   retiredAt && Date.now() - retiredAt.getTime() < config.partnerKeyOverlapMs;
>
> export const partnerAuth = async (req, _res, next) => {
>   const raw = req.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
>   const credential =
>     raw && (await partnerCredentials.findByHash(hashKey(raw)));
>   const usable =
>     credential &&
>     credential.isActive &&
>     (credential.keyHash === hashKey(raw) ||
>       withinOverlap(credential.previousKeyRetiredAt)) &&
>     ipInCidrs(req.ip, credential.allowedCidrs); // req.ip from the configured trusted proxy hops
>   if (!usable) return next(new UnauthorizedError("invalid_credentials"));
>   req.partner = credential;
>   return next();
> };
>
> // Signature check (PAPI-S2/S3), on the raw body captured by the body parser's `verify` hook.
> const expected = (secret, t, req) =>
>   crypto
>     .createHmac("sha256", secret)
>     .update(
>       `${t}\n${req.method}\n${req.originalUrl}\n${sha256Hex(req.rawBody ?? "")}`,
>     )
>     .digest();
> ```
>
> Compare with `crypto.timingSafeEqual` against every active secret; refuse a `t` more than 300 s
> from now.

---

## Part B — Calling a partner's API

## 7. The client

These rules apply to every outside API we call, whatever its provider offers.

- **PAPI-C1 — One client module per provider** (an adapter behind a port, architecture standard),
  the only code that talks to it; a stub of the provider for tests and end-to-end runs; a check in
  service health ([service-health standard](service-health.md)) that never reads personal data.
- **PAPI-C2 — The credential stays on the server.** From the environment or a secret store, read only
  by the config module, sent only in the header the provider documents, never logged, returned,
  audited or put in a URL (SEC-S3, SEC-S6). The config refuses to start when it is enabled without
  its credential.
- **PAPI-C3 — A fixed destination.** HTTPS only (plain HTTP only to localhost in local and test),
  certificate verification never disabled, the base URL from config, path parameters encoded,
  **redirects not followed** (a 3xx is an error, so the credential never travels to another host).
- **PAPI-C4 — Bounded calls.** A timeout on every call, a maximum response size, retries only for
  network errors, timeouts and `5xx` on idempotent calls, with backoff; a `401`/`403`/`404`/`429` is
  not retried; `Retry-After` is honoured; calls are spaced to stay well under the provider's limit.
- **PAPI-C5 — Answers are checked and stripped on arrival.** Parsed with a schema that keeps only the
  fields we use (names, identifiers and links we don't need are dropped before anything is stored or
  logged), and checked to be about us (the organisation, account or subjects we asked for). An answer
  that fails the schema is an error, not partial data.
- **PAPI-C6 — Store the minimum, delete what disappears.** We keep only what the purpose needs, with
  its retention in the data register; when the provider stops returning something (consent ended,
  validity expired), we delete our copy on the next read.
- **PAPI-C7 — Ask for the least.** When the provider offers per-subject queries, field selection or
  narrower scopes, we use them, even when a broader call would be simpler.
- **PAPI-C8 — Inbound webhooks** from a provider are verified (signature and timestamp) before
  anything else, treated as a hint to read through the API, and never trusted for their data.
- **PAPI-C9 — Known egress addresses.** Our servers call partners from addresses we can give them
  for their allow-list (PAPI-N1 on their side), and the list is in the deployment docs. How, by
  setup:
  - **A few servers with static IPs** (VPS, bare metal): give every server's IP (IPv4 and IPv6, or
    turn IPv6 off for that traffic). Adding or replacing a server means updating every partner's
    allow-list first, so it is a step of the server runbook.
  - **Many or changing machines** (autoscaling, Kubernetes, serverless): all partner traffic leaves
    through **one egress point with static IPs** - a NAT gateway with reserved addresses, a cluster
    egress gateway, or an outbound proxy - so the partner allow-lists one or two addresses that never
    change, whatever runs behind them.
  - **No stable egress possible:** the partner can't allow-list us, so every request we send must be
    signed (PAPI-S1), reads included; mTLS (PAPI-N3) may be added but is never required. If the
    provider supports neither signing nor an allow-list, its key alone protects the data: acceptable
    only for data that is not sensitive, recorded in the decision entry.

> **Reference implementation (Node).**
>
> ```js
> const response = await fetch(
>   `${config.partner.baseUrl}/api/v1/items/${encodeURIComponent(id)}`,
>   {
>     headers: {
>       Accept: "application/json",
>       Authorization: `Bearer ${config.partner.apiKey}`,
>     },
>     redirect: "manual", // a 3xx is an error: the key never follows a redirect
>     signal: AbortSignal.timeout(15_000),
>   },
> );
> if (response.status >= 300 && response.status < 400)
>   throw new PartnerError("partner_redirect");
> // check content-length against the maximum, then parse with a schema that strips unused fields
> ```

---

## Part C — Choosing a partner API

## 8. Evaluation

Before integrating an outside API, its provider's answers to the table below are written in a
decision entry of the project. A **must** that is missing means we don't integrate, or the decision
records why we accept it and what compensates for it. A missing **should** is accepted, but it is
written in the decision, asked of the provider, and the compensating control on our side is named.
The same table is what we ask a provider for when its API falls short.

| ID       | Criterion                                                                               | Level  |
| -------- | --------------------------------------------------------------------------------------- | ------ |
| PAPI-E1  | HTTPS only, a valid certificate, no credential in URLs                                  | must   |
| PAPI-E2  | A credential per organisation and environment, revocable by us at any time              | must   |
| PAPI-E3  | Scoped credentials: we can hold read-only access to only what we need                   | must   |
| PAPI-E4  | A written contract (OpenAPI or equivalent), versioned, with a deprecation notice period | must   |
| PAPI-E5  | Documented rate limits and errors (`429` with `Retry-After`)                            | must   |
| PAPI-E6  | A data processing agreement and data location acceptable to our privacy rules           | must   |
| PAPI-E7  | A separate test environment with test credentials                                       | must   |
| PAPI-E8  | IP allow-list per credential                                                            | should |
| PAPI-E9  | Credential rotation with an overlap period                                              | should |
| PAPI-E10 | Per-subject or batch queries (we ask only about subjects we know), no forced bulk dump  | should |
| PAPI-E11 | Only the fields the purpose needs (field selection or purpose-specific answers)         | should |
| PAPI-E12 | No existence oracle: unknown and not-visible subjects answer the same                   | should |
| PAPI-E13 | Signed requests or mTLS (required if we write to the API)                               | should |
| PAPI-E14 | Data-free, signed webhooks instead of polling, when change matters within hours         | should |
| PAPI-E15 | Their side logs our calls and can tell us who used our credential, from where           | should |
| PAPI-E16 | A status page or uptime commitment, and a security contact                              | should |

A provider we build ourselves under these standards meets every row by construction (part A).

## 9. Checklist

**Building a partner API (part A)**

- [ ] One credential per partner, environment and purpose, with scopes, a partner record (purpose, data, legal basis, DPA).
- [ ] Keys of 256+ bits with a prefix, shown once, stored as a keyed hash with a fragment; `lastUsedAt`, last IP, optional expiry.
- [ ] Rotation with overlap (default 24 h) and emergency rotation; revocation at once; all audited.
- [ ] Key only in a header; a key in a URL is refused and flagged; one `401 invalid_credentials` for every refusal.
- [ ] IP allow-list per credential (required in production, or a recorded exception); trusted proxy hops configured; no CORS on partner routes.
- [ ] Signed requests on every state-changing route (and sensitive reads without an allow-list): timestamp window, constant-time compare, replay refused.
- [ ] Per-subject and batch queries with a maximum; no bulk dump without a decision; change feed of ids only.
- [ ] Field allow-list per scope (strict for sensitive data); unknown, not visible and no-consent subjects answer as "no data".
- [ ] Webhooks data-free, signed, only to registered HTTPS URLs, retried and idempotent, with a delivery log.
- [ ] Rate limit per credential; every call audited (subjects returned, never data or keys); anomaly alerts.
- [ ] OpenAPI given to the partner, additive changes, 6-month deprecation; a test environment with test data.

**Calling a partner API (part B)**

- [ ] One client module with a test stub and a service-health check.
- [ ] Credential server-side only, never logged or in a URL; config refuses to start without it.
- [ ] HTTPS with certificate verification, fixed base URL, redirects refused.
- [ ] Timeout, size limit, retries only where safe, `Retry-After` honoured.
- [ ] Answer parsed with a stripping schema and checked to be about us; only the minimum stored; what disappears is deleted.
- [ ] Per-subject queries and narrow scopes used when offered; inbound webhooks verified; egress addresses known and documented (static IPs or one egress gateway).

**Choosing a partner API (part C)**

- [ ] Section 8 table filled in a decision entry; every missing **must** justified, every missing **should** asked of the provider with our compensating control.
