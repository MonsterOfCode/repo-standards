# Audit log standard

**For:** every project of ours that stores personal data. **Audience:** the developer, or the AI
agent, building or reviewing a project's audit log.

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

The key words **must**, **must not** and **should** mean what they say.

## 1. Principles

1. **Nothing escapes the audit.** Every state change is recorded, whether it succeeds or fails, and
   even when a developer forgot to emit an event for it (section 6 guarantees that).
2. **No sensitive content in the audit.** Health data, people's names, contact details, free text,
   passwords, tokens and codes must never be written to an audit row. A row holds ids, field names,
   enum values, booleans, counts and dates. Display labels (a person's name) are looked up when the
   log is read, never stored.
3. **Values are kept only where a rule allows it (allow-list).** By default no value is kept. A
   field's value goes into the audit only when the audit config lists that field. Forgetting a
   field must hide its content, never leak it.
4. **All the rules live in one audit config** (section 5). No module defines its own list.
5. **A failed audit write fails the operation.** A meaningful event is never fire-and-forget: a
   change whose audit row could not be written must not be reported as a success.
6. **The event commits with the change.** When the change runs in a database transaction, its
   event is written in that same transaction.
7. **Append-only.** No application code updates or deletes audit rows. Rows leave only through
   retention.
8. **Reading the audit is itself audited**, and only people explicitly granted it can read it.

## 2. Two layers, one store

All rows live in one store (a collection or table named `audit_logs`). That gives one retention
mechanism, one permission, one admin screen and one query API.

| Layer          | `type`                                                   | Written by                     | Purpose                                                      |
| -------------- | -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| Domain events  | a closed list (`order.cancelled`, `patient.access`, ...) | the code that makes the change | the **meaning**: what changed, from what to what, by whom    |
| Request ledger | `http.request`                                           | an HTTP middleware             | the **coverage**: every mutating request, success or failure |

The two layers are correlated by `requestId`: every row stores the id of the HTTP request that
produced it. It is taken from a request context (async-local storage or the equivalent), so no
caller has to pass it. Background jobs and scripts store `null`.

## 3. The row (envelope)

Every row has exactly these fields and is validated against a schema before it is written:

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

- `type` and `action` are stable identifiers once shipped: queries, alerts and reports depend on
  them.
- `subject` points at what a reader would search for (a patient, an order, an invoice, a team
  membership).

## 4. Domain events

- One event per meaningful change, written by the code that makes the change (the service layer,
  not the HTTP handler).
- Event types form a **closed catalogue in code**. Adding an event means adding its type there;
  validation rejects anything else, so an event can never be silently dropped.
- **Updates record the changed fields** (dotted paths for nested objects), and only fields that
  actually changed; a save that changes nothing writes no event. For each changed field:
  - listed in the audit config for that kind of record → `{ field, from, to }`;
  - anything else → `{ field, redacted: true }`: the reader knows who changed it and when, never
    the old or new value. This is what happens to personal data (e-mail, phone, a person's name),
    to health data and to any field nobody thought about.
  - Only non-personal business data goes on the list: an organization's name, a registry number,
    an active flag, a status, a role, a setting.
  - One shared helper computes the diff from `(before, after, listedFields)`; no module decides
    this on its own.
- **Events built by hand** (a status transition, an assignment) carry only ids, enum values,
  booleans, counts and dates.
- **Reads of sensitive records are events too.** Every read of a sensitive record (a patient file,
  say) writes an access event, e.g. `patient.access`. Its metadata says which fields were visible,
  whether especially sensitive ones were among them, and on what basis access was given. A list
  page writes one event per record it returns, in one batched write.
- **Write semantics:**
  - outside a transaction, the write is awaited; if it fails, it throws and the request fails (5xx);
  - inside a transaction, the event is written with the transaction's session/connection, so it
    commits or rolls back with the change. Let the database error propagate unchanged, so the
    driver can retry a transient transaction failure.

## 5. The audit config, and what metadata may contain

Every rule about what the audit may keep lives in **one config module**. The constant names are part
of the standard (use the language's case; the prefix says where each rule applies):

| Name                                  | Applies to           | Content                                                                                            |
| ------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `AUDIT_RETENTION_DAYS_BY_TYPE`        | every row            | days to keep a row, by `type`, with a `default`                                                    |
| `CHANGE_EVENT_FIELDS_WITH_VALUES`     | domain change events | per kind of record, the fields whose old/new values are kept; `"<field>.*"` = every field under it |
| `HTTP_LEDGER_BODY_FIELDS_WITH_VALUES` | request ledger only  | top-level body fields whose value is kept (only a boolean or a short enum-like string)             |
| `HTTP_LEDGER_REDACTED_URL_PARAM`      | request ledger only  | pattern of URL param **names** whose value is always `[redacted]`                                  |

Example (JavaScript):

```js
export const AUDIT_RETENTION_DAYS_BY_TYPE = { "http.request": 365, default: 730 };

// Anything not listed -> { field, redacted: true }.
export const CHANGE_EVENT_FIELDS_WITH_VALUES = {
  organization: ["name", "registryNumber", "isActive", "address.*", "contacts.website"], // not contacts.email/phone
  userProfile: [], // names, phone: never
};

export const HTTP_LEDGER_BODY_FIELDS_WITH_VALUES = ["status", "state", "role", "type", "isActive", "language"];

export const HTTP_LEDGER_REDACTED_URL_PARAM = /token|code|secret|signature|otc|password|apikey/i;
```

Adding a field to a list is a deliberate, reviewed change: "is this value safe to keep for the
whole retention period?". Adding a field to a model needs no audit change, because it is redacted
by default.

What may appear in metadata at all:

| Allowed                                         | Never                                                      |
| ----------------------------------------------- | ---------------------------------------------------------- |
| ids (UUIDs) of related records                  | names, e-mails, phones, addresses of people                |
| enum values (`status`, `role`, `state`, `kind`) | health data, notes, descriptions, comments, any free text  |
| booleans (`reasonProvided: true`)               | passwords, tokens, one-time codes, API keys, signed links  |
| counts, amounts, dates                          | raw IP addresses: store a keyed HMAC of the IP (`ipHash`)  |
| names of the fields that changed                | request body or query values (except the allow-list above) |

If in doubt, record that something was provided (`reasonProvided: true`), not what it was.

## 6. The request ledger (HTTP middleware)

Mounted at the API root, **before the body parsers**, so a request refused by any layer (body
parser, client check, CSRF, authentication, permission, validation) is still recorded. One row per
request, written when the response finishes, or when the connection closes first (`aborted: true`).

**Recorded:**

- every `POST`, `PUT`, `PATCH` and `DELETE`, whatever the status (2xx, 4xx, 5xx);
- `GET`s of sensitive resources, from an explicit list in code:
  - `always`: listings of sensitive records, messages, team members, support tickets, the audit
    log itself;
  - `failures`: routes whose successful reads already write a domain access event, so only denied
    or failed attempts are added and nothing is recorded twice.

**Not recorded:** health checks, metrics, API docs, test-only hooks, and requests already refused
by the global rate limiter (a flood must not turn into database writes).

**Row:**

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

- The route template is resolved from the router at response time. A path no route matched is
  stored as `route: null`, because the raw path could carry a token.
- The ledger write must never change the response: it is not awaited by the request, and a failure
  is logged and sent to error tracking. This is the one exception to principle 5, because the
  domain event, if there is one, is already fail-closed.

## 7. Coverage guard (test)

A test enumerates every mutating route of every router, sends each one through the real
application, and asserts that the ledger recorded it under exactly that route template. A new route
is covered automatically, and a route the middleware misses fails the build.

## 8. Retention

- Each row stores `expiresAt`, computed from `AUDIT_RETENTION_DAYS_BY_TYPE`. Our defaults: the
  `http.request` ledger **1 year**, domain events **2 years**.
- The database deletes expired rows (a TTL index on `expiresAt`, or a scheduled purge where the
  database has no TTL). This purge is the only delete path.
- A hard cap of 2 years on `createdAt` should back it up.
- A longer period for a type (billing, access to health records) needs a legal confirmation first.

## 9. Indexes

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

- **A read-only API.** No endpoint creates or edits rows.
  - A list: exact-value search over `requestId`, `actorUserId`, `organizationId`, `subject.id` or
    `action`; filters on type, actor, tenant, status class and date range; paginated.
  - A detail by id.
- **A dedicated permission** (`audit_logs.read`), held by the top administrator only by default
  and granted to others explicitly. Every read is recorded by the ledger.
- **Labels at read time.** Actor and tenant names are looked up when a page is returned, with one
  batched query per page. A deleted or anonymized person shows as "Deleted user" with the id. This
  is why the log never needs rewriting when a person is erased.

## 11. Access history per person (right of access)

To answer "who accessed my data" (nLPD/GDPR):

- the history is read from the audit at request time, never stored a second time;
- it includes every event whose subject is the person's record, the denied or failed requests on
  their record's routes, and the reads of the history itself;
- it has a CSV export: values quoted and protected against formula injection, capped in rows, and
  itself recorded as an event before any row is sent;
- it sits behind its own permission, granted explicitly.

## 12. Daily anomaly alerts

A daily job (with a lock so it runs once) aggregates the previous day and raises alerts for:

- one account reading many distinct sensitive records (a threshold in config, e.g. 200 a day);
- many 403 answers per account or per `ipHash` (e.g. 50 a day);
- any reuse of a revoked refresh token;
- any account lockout.

Alerts are upserted on a unique key `(kind, day, subjectKey)`, so a re-run is idempotent. They
hold ids, counts and a few sample audit-row ids, never content. Only holders of the alerts
permission are notified, with no detail in the notification. Acknowledging an alert is audited.

## 13. Tamper resistance (production)

Required before real data is in production:

1. **Prevention.** The application's database user cannot update or delete audit rows: a role
   with insert + read only on `audit_logs`, or a separate user for it. Index creation and the
   retention purge run with a different, privileged identity.
2. **Detection.** A scheduled job seals the rows (e.g. every hour): it chains a hash over the rows
   in order and stores one seal `{ from, to, count, firstId, lastId, rootHash, prevSealHash }`. Each
   seal is copied outside the server into write-once storage (e.g. S3 Object Lock in compliance
   mode, kept at least as long as the retention). A verifier script recomputes the seals and is run
   monthly and for any investigation.

## 14. Checklist

- [ ] One `audit_logs` store with the envelope of section 3, schema-validated, with a closed list of `type`s.
- [ ] `requestId` from the request context on every row.
- [ ] Domain events in the service layer: awaited, fail-closed, written in the change's transaction when there is one.
- [ ] One audit config with the four rules of section 5, under those names; no module defines its own list.
- [ ] Changed fields as `{ field, from, to }` only for listed fields; every other change `{ field, redacted: true }`; a test proves an unlisted field is redacted.
- [ ] Every read of a sensitive record writes an access event.
- [ ] Request-ledger middleware before the body parsers: route template, field names only, allow-listed values, redacted credential params, `ipHash`.
- [ ] A coverage test over every mutating route.
- [ ] `expiresAt` by type and an automatic purge; the indexes of section 9.
- [ ] A read-only audit API behind a dedicated permission, labels resolved at read time, reads recorded.
- [ ] Access history per person with an audited export (section 11).
- [ ] Daily anomaly alerts (section 12).
- [ ] No code path updates or deletes audit rows.
- [ ] Production: insert/read-only database role for the audit and off-server hash seals (section 13).
