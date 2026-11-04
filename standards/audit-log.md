# Audit log standard

**Version:** 1.2 (2026-11-03). **For:** every project of ours that stores personal data. **Audience:** the developer, or the AI
agent, building or reviewing a project's audit log.

**Changes in 1.2:** every rule has a stable ID (`AUD-<area><n>`) and every checklist item cites the
rules it covers; no rule's meaning changed.

**Changes in 1.1:** stack-specific details moved to a "Reference implementation (Node/React)"
callout (section 13); links to the privacy and security standards.

This is the standard all our applications follow, so that an audit question ("who did what, when,
to what, and who saw what") gets answered the same way in every system, and an auditor or a
data-protection review finds the same guarantees everywhere.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at what the project already has (logging, an audit or
   history table, request ids, transactions, permissions) before writing anything. Build on what
   exists; replace what contradicts this standard.
2. Adapt it to the project's stack (language, framework, database), but keep the **contract** the
   same: the row fields (section 3), the two layers (section 2), the privacy rules (sections 1, 5, 6) and the config names (section 5, in the language's naming case). Libraries and file layout
   are yours to choose.
3. Where the project's domain differs (it has no "patients", say), map the examples to its own
   sensitive records. Every example below is only an illustration.
4. Finish with the checklist in section 14. Every item must be true and covered by a test.
   Anything you could not do, report explicitly; never skip it silently.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`AUD-<area><n>`: `P` principles, `S` store, layers and row, `E` domain events, `C` audit config and
metadata, `L` request ledger, `G` coverage guard, `R` retention, `I` indexes, `A` reading the audit,
`H` access history per person, `N` anomaly alerts, `T` tamper resistance.

## 1. Principles

- **AUD-P1 — Nothing escapes the audit.** Every state change is recorded, whether it succeeds or
  fails, and even when a developer forgot to emit an event for it (section 6 guarantees that).
- **AUD-P2 — No sensitive content in the audit.** Health data, people's names, contact details, free
  text, passwords, tokens and codes must never be written to an audit row. A row holds ids, field
  names, enum values, booleans, counts and dates. Display labels (a person's name) are looked up
  when the log is read, never stored.
- **AUD-P3 — Values are kept only where a rule allows it (allow-list).** By default no value is kept.
  A field's value goes into the audit only when the audit config lists that field. Forgetting a
  field must hide its content, never leak it.
- **AUD-P4 — All the rules live in one audit config** (section 5). No module defines its own list.
- **AUD-P5 — A failed audit write fails the operation.** A meaningful event is never
  fire-and-forget: a change whose audit row could not be written must not be reported as a success.
- **AUD-P6 — The event commits with the change.** When the change runs in a database transaction,
  its event is written in that same transaction.
- **AUD-P7 — Append-only.** No application code updates or deletes audit rows. Rows leave only
  through retention.
- **AUD-P8 — Reading the audit is itself audited**, and only people explicitly granted it can read
  it.

## 2. Two layers, one store

- **AUD-S1 — One store.** All rows live in one store (a collection or table named `audit_logs`).
  That gives one retention mechanism, one permission, one admin screen and one query API.
- **AUD-S2 — Two layers.** The store holds both layers:

  | Layer          | `type`                                                   | Written by                     | Purpose                                                      |
  | -------------- | -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
  | Domain events  | a closed list (`order.cancelled`, `patient.access`, ...) | the code that makes the change | the **meaning**: what changed, from what to what, by whom    |
  | Request ledger | `http.request`                                           | an HTTP middleware             | the **coverage**: every mutating request, success or failure |

- **AUD-S3 — Correlated by `requestId`.** Every row stores the id of the HTTP request that produced
  it, taken from a request context (async-local storage or the equivalent), so no caller has to pass
  it. Background jobs and scripts store `null`.

## 3. The row (envelope)

- **AUD-S4 — The envelope.** Every row has exactly these fields and is validated against a schema
  before it is written:

  | Field            | Type                                   | Notes                                                                                            |
  | ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
  | `id`             | UUID                                   |                                                                                                  |
  | `type`           | enum                                   | a **closed list** in code; an unknown type fails validation, and so the operation                |
  | `requestId`      | string \| null                         | the HTTP request id (`X-Request-Id`); `null` for jobs                                            |
  | `actorUserId`    | UUID \| null                           | who did it; `null` = the system (a job)                                                          |
  | `organizationId` | UUID \| null                           | the tenant it happened in or to, for per-tenant queries                                          |
  | `subject`        | `{ type: string, id: string \| null }` | what it was done to: `{ type: "patient", id }`, `{ type: "http_route", id: "/orders/:orderId" }` |
  | `action`         | string                                 | the verb, stable and dotted (`order.cancel`, `invoice.paid`; the HTTP method for the ledger)     |
  | `metadata`       | object                                 | only what section 5 allows                                                                       |
  | `createdAt`      | timestamp                              |                                                                                                  |
  | `expiresAt`      | timestamp                              | `createdAt` + the retention of its `type` (section 8)                                            |

- **AUD-S5 — Stable identifiers.** `type` and `action` are stable once shipped: queries, alerts and
  reports depend on them.
- **AUD-S6 — A searchable subject.** `subject` points at what a reader would search for (a patient,
  an order, an invoice, a team membership).

## 4. Domain events

- **AUD-E1 — One event per meaningful change**, written by the code that makes the change (the
  service layer, not the HTTP handler).
- **AUD-E2 — A closed catalogue.** Event types form a **closed catalogue in code**. Adding an event
  means adding its type there; validation rejects anything else, so an event can never be silently
  dropped.
- **AUD-E3 — Updates record the changed fields** (dotted paths for nested objects), and only fields
  that actually changed; a save that changes nothing writes no event.
- **AUD-E4 — Values only for listed fields.** For each changed field:
  - listed in the audit config for that kind of record → `{ field, from, to }`;
  - anything else → `{ field, redacted: true }`: the reader knows who changed it and when, never the
    old or new value. This is what happens to personal data (e-mail, phone, a person's name), to
    health data and to any field nobody thought about.
- **AUD-E5 — Only non-personal business data is listed:** an organization's name, a registry
  number, an active flag, a status, a role, a setting.
- **AUD-E6 — One shared diff helper** computes the diff from `(before, after, listedFields)`; no
  module decides this on its own.
- **AUD-E7 — Events built by hand** (a status transition, an assignment) carry only ids, enum values,
  booleans, counts and dates.
- **AUD-E8 — Reads of sensitive records are events too.** Every read of a sensitive record (a
  patient file, say) writes an access event, e.g. `patient.access`. Its metadata says which fields
  were visible, whether especially sensitive ones were among them, and on what basis access was
  given. A list page writes one event per record it returns, in one batched write.
- **AUD-E9 — Awaited outside a transaction.** Outside a transaction, the write is awaited; if it
  fails, it throws and the request fails (5xx).
- **AUD-E10 — In the transaction inside one.** Inside a transaction, the event is written with the
  transaction's session/connection, so it commits or rolls back with the change. Let the database
  error propagate unchanged, so the driver can retry a transient transaction failure.

## 5. The audit config, and what metadata may contain

- **AUD-C1 — One config module, with these names.** Every rule about what the audit may keep lives
  in **one config module**. The constant names are part of the standard (use the language's case;
  the prefix says where each rule applies):

  | Name                                  | Applies to           | Content                                                                                            |
  | ------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
  | `AUDIT_RETENTION_DAYS_BY_TYPE`        | every row            | days to keep a row, by `type`, with a `default`                                                    |
  | `CHANGE_EVENT_FIELDS_WITH_VALUES`     | domain change events | per kind of record, the fields whose old/new values are kept; `"<field>.*"` = every field under it |
  | `HTTP_LEDGER_BODY_FIELDS_WITH_VALUES` | request ledger only  | top-level body fields whose value is kept (only a boolean or a short enum-like string)             |
  | `HTTP_LEDGER_REDACTED_URL_PARAM`      | request ledger only  | pattern of URL param **names** whose value is always `[redacted]`                                  |

Example (JavaScript):

```js
export const AUDIT_RETENTION_DAYS_BY_TYPE = {
  "http.request": 365,
  default: 730,
};

// Anything not listed -> { field, redacted: true }.
export const CHANGE_EVENT_FIELDS_WITH_VALUES = {
  organization: [
    "name",
    "registryNumber",
    "isActive",
    "address.*",
    "contacts.website",
  ], // not contacts.email/phone
  userProfile: [], // names, phone: never
};

export const HTTP_LEDGER_BODY_FIELDS_WITH_VALUES = [
  "status",
  "state",
  "role",
  "type",
  "isActive",
  "language",
];

export const HTTP_LEDGER_REDACTED_URL_PARAM =
  /token|code|secret|signature|otc|password|apikey/i;
```

- **AUD-C2 — Listing a field is a reviewed change.** Adding a field to a list is a deliberate,
  reviewed change: "is this value safe to keep for the whole retention period?". Adding a field to a
  model needs no audit change, because it is redacted by default.
- **AUD-C3 — What metadata may contain at all:**

  | Allowed                                         | Never                                                      |
  | ----------------------------------------------- | ---------------------------------------------------------- |
  | ids (UUIDs) of related records                  | names, e-mails, phones, addresses of people                |
  | enum values (`status`, `role`, `state`, `kind`) | health data, notes, descriptions, comments, any free text  |
  | booleans (`reasonProvided: true`)               | passwords, tokens, one-time codes, API keys, signed links  |
  | counts, amounts, dates                          | raw IP addresses: store a keyed HMAC of the IP (`ipHash`)  |
  | names of the fields that changed                | request body or query values (except the allow-list above) |

- **AUD-C4 — If in doubt, record the fact.** Record that something was provided
  (`reasonProvided: true`), not what it was.

## 6. The request ledger (HTTP middleware)

- **AUD-L1 — Mounted before the body parsers.** The ledger is mounted at the API root, **before the
  body parsers**, so a request refused by any layer (body parser, client check, CSRF,
  authentication, permission, validation) is still recorded. One row per request, written when the
  response finishes, or when the connection closes first (`aborted: true`).
- **AUD-L2 — What is recorded:**
  - every `POST`, `PUT`, `PATCH` and `DELETE`, whatever the status (2xx, 4xx, 5xx);
  - `GET`s of sensitive resources, from an explicit list in code:
    - `always`: listings of sensitive records, messages, team members, support tickets, the audit
      log itself;
    - `failures`: routes whose successful reads already write a domain access event, so only denied
      or failed attempts are added and nothing is recorded twice.
- **AUD-L3 — What is not recorded:** health checks, metrics, API docs, test-only hooks, and requests
  already refused by the global rate limiter (a flood must not turn into database writes).
- **AUD-L4 — The ledger row** has this shape:

  ```text
  type: "http.request"
  subject: { type: "http_route", id: "/orders/:orderId/comments" }   # the route TEMPLATE, never the raw URL
  action: "POST"
  metadata: {
    method, route,
    params,        # URL params (they are the ids); a name matching HTTP_LEDGER_REDACTED_URL_PARAM,
                   # or a value that is not a short id -> "[redacted]"
    statusCode, aborted, durationMs,
    appClientId,   # which client application called, if the API has several
    ipHash,        # keyed HMAC of the client IP, never the IP
    bodyFields,    # dotted field NAMES of the body (depth 3, at most 100; uuid keys -> ":id")
    bodyValues,    # values only for HTTP_LEDGER_BODY_FIELDS_WITH_VALUES, only booleans or short enum-like strings
    queryFields    # query parameter NAMES only
  }
  ```

- **AUD-L5 — The route template, never the raw path.** The route template is resolved from the
  router at response time. A path no route matched is stored as `route: null`, because the raw path
  could carry a token.
- **AUD-L6 — The ledger never changes the response.** The ledger write is not awaited by the
  request, and a failure is logged and sent to error tracking. This is the one exception to AUD-P5,
  because the domain event, if there is one, is already fail-closed.

## 7. Coverage guard (test)

- **AUD-G1 — Every mutating route is covered by a test.** A test enumerates every mutating route of
  every router, sends each one through the real application, and asserts that the ledger recorded
  it under exactly that route template. A new route is covered automatically, and a route the
  middleware misses fails the build.

The access history (section 11) and the anomaly alerts (section 12) are how the audit serves the
[privacy standard](privacy.md) (right of access, access logging of sensitive data) and the
[security standard](security.md) (security events).

## 8. Retention

- **AUD-R1 — Retention by type.** Each row stores `expiresAt`, computed from
  `AUDIT_RETENTION_DAYS_BY_TYPE`. Our defaults: the `http.request` ledger **1 year**, domain events
  **2 years**.
- **AUD-R2 — The purge is the only delete path.** The database deletes expired rows (a TTL index on
  `expiresAt`, or a scheduled purge where the database has no TTL).
- **AUD-R3 — A hard cap.** A hard cap of 2 years on `createdAt` should back it up.
- **AUD-R4 — Longer only with legal confirmation.** A longer period for a type (billing, access to
  health records) needs a legal confirmation first.

## 9. Indexes

- **AUD-I1 — These indexes exist:**

  | Index                                                                  | Serves                                        |
  | ---------------------------------------------------------------------- | --------------------------------------------- |
  | `expiresAt` (TTL), `createdAt desc`                                    | retention, newest-first lists                 |
  | `type, createdAt desc`                                                 | filter by event type                          |
  | `subject.type, subject.id, createdAt desc`                             | the history of one record                     |
  | `subject.id, createdAt desc` and `action, createdAt desc`              | the admin search (exact value)                |
  | `actorUserId, createdAt desc`                                          | what one person did                           |
  | `organizationId, createdAt desc`                                       | what happened in one tenant                   |
  | `requestId` (only where set)                                           | correlate a ledger row with its domain events |
  | `type, metadata.statusCode, createdAt desc`                            | ledger rows by status class                   |
  | `metadata.params.<sensitiveRecordId>, createdAt desc` (only where set) | denied attempts on one sensitive record       |

## 10. Reading the audit

- **AUD-A1 — A read-only API.** No endpoint creates or edits rows.
  - A list: exact-value search over `requestId`, `actorUserId`, `organizationId`, `subject.id` or
    `action`; filters on type, actor, tenant, status class and date range; paginated.
  - A detail by id.
- **AUD-A2 — A dedicated permission** (`audit_logs.read`), held by the top administrator only by
  default and granted to others explicitly. Every read is recorded by the ledger.
- **AUD-A3 — Labels at read time.** Actor and tenant names are looked up when a page is returned,
  with one batched query per page. A deleted or anonymized person shows as "Deleted user" with the
  id. This is why the log never needs rewriting when a person is erased.

## 11. Access history per person (right of access)

To answer "who accessed my data" (nLPD/GDPR):

- **AUD-H1 — Read from the audit, never stored twice.** The history is read from the audit at
  request time.
- **AUD-H2 — What it includes:** every event whose subject is the person's record, the denied or
  failed requests on their record's routes, and the reads of the history itself.
- **AUD-H3 — A safe, audited export.** It has a CSV export: values quoted and protected against
  formula injection, capped in rows, and itself recorded as an event before any row is sent.
- **AUD-H4 — Its own permission**, granted explicitly.

## 12. Daily anomaly alerts

- **AUD-N1 — A daily job raises alerts.** A daily job (with a lock so it runs once) aggregates the
  previous day and raises alerts for:
  - one account reading many distinct sensitive records (a threshold in config, e.g. 200 a day);
  - many 403 answers per account or per `ipHash` (e.g. 50 a day);
  - any reuse of a revoked refresh token;
  - any account lockout.
- **AUD-N2 — Idempotent alerts.** Alerts are upserted on a unique key `(kind, day, subjectKey)`, so a
  re-run is idempotent.
- **AUD-N3 — No content in alerts.** They hold ids, counts and a few sample audit-row ids, never
  content.
- **AUD-N4 — Restricted notification.** Only holders of the alerts permission are notified, with no
  detail in the notification.
- **AUD-N5 — Acknowledging an alert is audited.**

## 13. Tamper resistance (production)

Required before real data is in production:

- **AUD-T1 — Prevention.** The application's database user cannot update or delete audit rows: a
  role with insert + read only on `audit_logs`, or a separate user for it. Index creation and the
  retention purge run with a different, privileged identity.
- **AUD-T2 — Detection.** A scheduled job seals the rows (e.g. every hour): it chains a hash over the
  rows in order and stores one seal `{ from, to, count, firstId, lastId, rootHash, prevSealHash }`.
  Each seal is copied outside the server into write-once storage (e.g. S3 Object Lock in compliance
  mode, kept at least as long as the retention). A verifier script recomputes the seals and is run
  monthly and for any investigation.

> **Reference implementation (Node/React).** MongoDB: an `audit_logs` collection with a
> `$jsonSchema` validator and a TTL index on `expiresAt` (`expireAfterSeconds: 0`), created by its
> migration; the audit config is `config/audit.js`; `recordAuditEvent(type, ..., { session })`
> validates the row with Zod and writes it with the transaction's session; the request context is
> `AsyncLocalStorage`; the ledger is an Express middleware mounted on `/api/v1` before
> `express.json()`, which resolves the route template from the router's stack at `finish`; the
> anomaly job is a `node-cron` job under the database lock; seals go to S3 Object Lock. A
> SQL database uses an `audit_logs` table, a scheduled `DELETE ... WHERE expires_at < now()` run by a
> privileged role, and `GRANT INSERT, SELECT` only for the application role.

## 14. Checklist

- [ ] One `audit_logs` store with both layers and the envelope of section 3, schema-validated, with a closed list of `type`s; stable `type` and `action`; a searchable `subject` (AUD-S1, AUD-S2, AUD-S4, AUD-S5, AUD-S6).
- [ ] `requestId` from the request context on every row; `null` for jobs (AUD-S3).
- [ ] Every state change recorded, success or failure, with no sensitive content in any row (AUD-P1, AUD-P2).
- [ ] Domain events in the service layer from a closed catalogue: awaited, fail-closed, written in the change's transaction when there is one (AUD-P5, AUD-P6, AUD-E1, AUD-E2, AUD-E9, AUD-E10).
- [ ] One audit config with the four rules of section 5, under those names; no module defines its own list; listing a field is a reviewed change (AUD-P3, AUD-P4, AUD-C1, AUD-C2).
- [ ] Changed fields only, as `{ field, from, to }` for listed fields and `{ field, redacted: true }` for every other one, computed by one shared helper; only non-personal business data listed; a test proves an unlisted field is redacted (AUD-E3, AUD-E4, AUD-E5, AUD-E6).
- [ ] Hand-built events and all metadata hold only what section 5 allows; when in doubt, the fact is recorded, not the value (AUD-E7, AUD-C3, AUD-C4).
- [ ] Every read of a sensitive record writes an access event; list pages in one batched write (AUD-E8).
- [ ] Request-ledger middleware before the body parsers: the recorded and skipped requests of section 6, route template (`null` when unmatched), field names only, allow-listed values, redacted credential params, `ipHash`; never changes the response (AUD-L1, AUD-L2, AUD-L3, AUD-L4, AUD-L5, AUD-L6).
- [ ] A coverage test over every mutating route (AUD-G1).
- [ ] `expiresAt` by type with our defaults, an automatic purge as the only delete path, a hard cap on `createdAt`, longer periods only with legal confirmation (AUD-R1, AUD-R2, AUD-R3, AUD-R4).
- [ ] The indexes of section 9 (AUD-I1).
- [ ] A read-only audit API behind a dedicated permission, labels resolved at read time, reads recorded (AUD-P8, AUD-A1, AUD-A2, AUD-A3).
- [ ] Access history per person, read from the audit, with an audited export, behind its own permission (AUD-H1, AUD-H2, AUD-H3, AUD-H4).
- [ ] Daily anomaly alerts under a lock, idempotent, without content, notified only to permission holders, acknowledgement audited (AUD-N1, AUD-N2, AUD-N3, AUD-N4, AUD-N5).
- [ ] No code path updates or deletes audit rows (AUD-P7).
- [ ] Production: insert/read-only database role for the audit and off-server hash seals (AUD-T1, AUD-T2).
