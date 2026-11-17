# Error diagnostics standard

**Version:** 1.0 (2026-11-17). **For:** every service and frontend of ours. **Audience:** the
developer, or the AI agent, writing, catching, logging or reviewing errors.

An error is a message to the person who will debug it, often months later, at night, without the
code open and without a way to reproduce it. This standard makes every error say **what failed, on
what, why, and what happened next**, so that the log line or the error-tracking issue is enough to
understand the problem, and at the same time makes sure that no error ever carries a secret or
personal data.

**Descriptive and safe are not in tension.** An error is described with identifiers, states, codes,
counts, field paths, names of configuration variables, statuses and durations: never with the
values of secrets or the data of people. "Invoice 8f3c… is `paid`, expected `draft` or `issued`" is
fully descriptive and leaks nothing.

**Two audiences.** What the caller receives is deliberately short: the error body of the
[architecture standard](architecture.md) (6.2: `code`, `message`, `requestId`) and nothing internal
([security standard](security.md), SEC-E1/E2). What the operator receives (the log line and the
error-tracking issue) is complete. The request id links the two: a user quoting it leads to the full
story. How the lines are written, levelled and redacted is the [logging standard](logging.md); this
standard is about what an error must say.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at what the project has: its error classes, the central
   error handler, the integration clients (HTTP calls to other services), the job runner, the
   logger and the error-tracking setup. Build on what exists.
2. Adapt it to the stack, but keep the **contract**: every error has a precise code, a factual
   message, a structured context and its cause (section 3); what may never be in an error (section 7) is not negotiable.
3. Fix the existing errors that break the rules (vague messages, swallowed causes, missing context)
   and add the tests of section 10. Finish with the checklist in section 11. Anything you could not
   do, report explicitly; never skip it silently.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`ERR-<area><n>`: `P` principles, `M` message, `C` context and cause, `X` external calls, `I`
invariants, validation and data, `J` background jobs, `S` safety, `F` serialisation to JSON, `H`
handling and display, `T` tests.

## 1. Principles

- **ERR-P1 — Every error answers four questions:** what operation failed, on what (the kind of
  record and its id), why (the rule, or the state expected and the state found), and what happened
  next (rolled back, retried, skipped, left for the next run). "Something went wrong", "Error",
  "Invalid input", "Request failed" or "Unexpected error" on their own are never acceptable.
- **ERR-P2 — Two levels of detail.** The caller gets the short contract body (SEC-E1); the log line
  and the error-tracking issue get everything of this standard. The request id is in both.
- **ERR-P3 — Describe with identifiers, never with values.** Ids, codes, enum states, counts, field
  paths, types, lengths, HTTP statuses, durations, attempt numbers and configuration variable
  _names_ are allowed. The values of secrets and of personal fields are not (section 7).
- **ERR-P4 — One cause, one code.** The code names the precise cause (`invoice_already_paid`,
  `bexio_contact_rejected`), not a family (`invalid_state`, `integration_error`). Two different
  causes never share a code. Codes are stable once shipped (ARCH-B16).

## 2. The message

- **ERR-M1 — A factual English sentence.** Subject, what is wrong, and when it applies, the expected
  against the found: "Invoice is not open: expected status draft or issued". No blame, no
  speculation ("probably"), no advice meant for a user.
- **ERR-M2 — The message is stable; the variables go in the context.** The message text is the same
  for every occurrence of the cause, so error tracking groups the occurrences into one issue and
  logs can be searched by message (LOG-F3). Ids, states and counts go in the context (ERR-C1).
  Short safe values that define the cause (an enum state, an HTTP status, a configuration variable
  name) may also appear in the message.
- **ERR-M3 — Say expected and found.** For a state, a type, a count or a limit: both sides. "expected
  1 active term, found 2", "limit 50 lines, got 73".
- **ERR-M4 — Configuration errors name the variable, never its value.** "BILLING_API_TOKEN is not
  set", "PARTNER_BASE_URL is not an https URL", "SMTP_PORT must be a number between 1 and 65535".
  At startup, every invalid variable is listed at once, not only the first.
- **ERR-M5 — No ambiguity between similar failures.** "not found" and "not yours" are different
  causes internally even when the caller gets the same answer (SEC-E2): the log says which.

| Vague            | Descriptive                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Unknown event`  | `Unknown notification event` + context `{ eventKey: "order.shipped", knownEvents: 31 }`                                                   |
| `Request failed` | `Billing API refused the invoice creation: 422` + context `{ operation: "invoice.create", status: 422, providerCode: "contact_missing" }` |
| `Invalid data`   | `Partner answer has an unexpected shape` + context `{ issues: [{ path: "items.3.validUntil", expected: "date", received: "string" }] }`   |
| `Cannot cancel`  | `Order is not cancellable: expected status open, found shipped` + context `{ orderId, status: "shipped" }`                                |
| `Database error` | `Duplicate key on users.email_unique` + context `{ collection: "users", index: "email_unique" }` (never the duplicated value)             |
| `Job failed`     | `Job invoice-sync failed at step read-payments: 3 of 40 invoices failed` + context `{ jobName, runId, step, failed: 3, total: 40 }`       |

## 3. Context and cause

- **ERR-C1 — Every error carries a structured context.** An object with what the reader needs:
  `operation`, the record kind and id (`orderId`, `organizationId`), the states involved, the
  acting account's id and role, the attempt number, the limits. Values follow LOG-F4: ids, enums,
  numbers, booleans, durations, short safe strings. The context is logged as fields and attached to
  the error-tracking issue.
- **ERR-C2 — The cause is never lost.** When code catches an error and throws another, the new error
  keeps the original as its `cause` (the language's error-cause mechanism). The original's message,
  code and stack stay readable in the log and in error tracking, through the whole chain.
- **ERR-C3 — Never replace a precise error with a vaguer one.** Wrapping adds the higher-level
  operation ("Could not issue invoice 8f3c…"); it does not hide the lower one ("…because: billing
  API timed out after 10 s").
- **ERR-C4 — Never swallow.** A `catch` that does nothing is a defect. A deliberate ignore has a
  comment saying why, and logs a `warn` (or `debug` when it is truly routine) with the context.
- **ERR-C5 — Partial failures say how many and which.** "3 of 40 failed" with the ids of the failed
  items (capped, e.g. the first 20, plus the total) and the first failure's cause.
- **ERR-C6 — Errors from a transaction or a retry loop say so:** whether the change was rolled back,
  how many attempts were made of how many, and the delay before the next.

## 4. Calls to other services

Most hard-to-debug failures come from a dependency. An error from an integration must be enough to
open a ticket with the provider without reproducing the call.

- **ERR-X1 — A dependency error names:** the service, the operation, the method and the path
  _template_ (`POST /invoices/{id}/issue`, never the query string), the HTTP status, the provider's
  own error code and message, the duration, the timeout, the attempt (n of m) and whether it will
  be retried.
- **ERR-X2 — The provider's answer is scrubbed and capped.** Its error text goes through the shared
  scrubber (LOG-X5) and is cut to a fixed length (e.g. 500 characters). Never the request body we
  sent, never request or response headers.
- **ERR-X3 — An unexpected answer describes the shape, not the data.** Report the schema issues:
  field path, expected type, received type. Never the received values.
- **ERR-X4 — Network failures keep their system code:** `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`,
  TLS errors, with the host name (never a URL carrying credentials).
- **ERR-X5 — Each integration has its own error type** with its own codes (`<service>_unavailable`,
  `<service>_rate_limited`, `<service>_invalid_response`, `<service>_rejected`), so alerts and
  dashboards can tell them apart.

## 5. Invariants, validation and data

- **ERR-I1 — A broken invariant describes the invariant and the state found:** "A subscription must
  have exactly one open term: found 2" with the ids. These are bugs: they are `error`, never
  silently corrected.
- **ERR-I2 — Validation failures log paths and rule keys, never values.** The 422 body already
  carries them (ARCH-V16); the log line adds the route and the counts, never what was typed.
- **ERR-I3 — Database errors name the collection or table, the operation and the index or
  constraint**, never the conflicting value (LOG-X4 filters it anyway).
- **ERR-I4 — Timeouts name the limit and the elapsed time** ("Database operation exceeded 5000 ms
  on orders.find").

## 6. Background jobs

- **ERR-J1 — A failed run says where it stopped:** job name, run id, the step, the items processed,
  failed and total, and the first failure's cause (LOG-J1 for the summary line).
- **ERR-J2 — One item's failure is reported with the item's id** and does not hide the others
  (ERR-C5).
- **ERR-J3 — A skipped run says why** (lock held by another instance, feature off, nothing due).

## 7. Never in an error

Every rule above stops at this section.

- **ERR-S1 — Never in a message, context, cause, stack or provider text:**
  - passwords, tokens, API keys, client secrets, private keys, cookies, `Authorization` headers,
    one-time codes, signed or one-time links, connection strings with credentials, signatures;
  - personal data (names, e-mails, phones, addresses, dates of birth, national or insurance ids,
    IBANs), health data, free text a person typed (LOG-N1);
  - request or response bodies, query strings, whole records or documents.

  To say _which_ record, use its id (LOG-N2). To say _which_ secret, use the name of its variable.

- **ERR-S2 — Redaction is the safety net, not the plan.** The shared scrubber (LOG-X1–X6) runs on
  every error, its context and its whole cause chain, in the log and in error tracking; code still
  must not put the data there in the first place.
- **ERR-S3 — The caller never gets the diagnostics.** The answer is the error body (ARCH-V17) with
  only the `params`/`details` the caller needs and is allowed to know. `401`, `403` and `404` carry
  no details. Stacks, context, causes and provider texts stay on the server (SEC-E1).
- **ERR-S4 — Descriptive inside, uniform outside.** Where the caller must get the same answer for
  different causes (SEC-E2: not there / not yours, unknown account / wrong password), the log still
  records the real cause; the answer does not.
- **ERR-S5 — Error tracking identifies people by id only:** no e-mail, no IP, no request body, no
  cookies (the client's "send personal data" option is off).
- **ERR-S6 — One error line stays under 16 KB.** Container runtimes (containerd, Docker's log
  driver) split longer lines, and the log store then receives broken JSON. The serialiser (section 8) cuts the stack frames first, then the deepest context, and says so (`truncated: true`); the
  cause chain keeps at most 5 levels, the provider text 500 characters (ERR-X2), id lists 20 items
  (ERR-C5).

## 8. Turning an error into JSON

`JSON.stringify` loses an error: `message`, `stack` and `cause` are not enumerable properties, so an
error becomes `{}`; a generic depth limit turns the deeper levels into `[Object]` or a filter marker;
a circular reference throws, and the line is lost with it. Every log line and error-tracking event
is JSON, so the conversion is part of the contract.

- **ERR-F1 — One error serialiser, used everywhere.** The logger, the error tracker and anything
  else that turns an error into data call the same function. No output turns an error into a string
  (`String(err)`, `err.stack` alone) or passes it to a generic JSON conversion.
- **ERR-F2 — Every level is kept.** An error becomes an object with `name`, `message`, `code`,
  `status` when there is one, `context`, the other own properties of the error (enumerable or not,
  e.g. `details`, `retryable`), `stack`, `cause` serialised the same way (recursively, up to the
  limit of ERR-S6), and the `errors` of an aggregate error. An error found anywhere inside the
  context or the metadata is serialised the same way, never flattened to its stack text.
- **ERR-F3 — Values that JSON does not know are converted, not dropped:** dates to ISO strings,
  `BigInt` to strings, `Map` to an object, `Set` to an array, binary buffers to `[Buffer <n> bytes]`,
  functions and symbols to their name, `undefined` kept as `null` where the key matters, objects
  with a `toJSON` (database ids) through it.
- **ERR-F4 — Limits are visible, never silent.** The depth limit for context and metadata is at
  least 10 levels; beyond it, and beyond the size limit, the value becomes an explicit marker
  (`"[Depth limit]"`, `"[Truncated]"`) and the line gets `truncated: true`. A circular reference
  becomes `"[Circular]"`. The limit markers are never the redaction marker (`"[Filtered]"`), so a
  reader can tell "cut" from "hidden".
- **ERR-F5 — Serialise first, scrub second, and scrub every level.** The scrubber (LOG-X1–X4) runs
  on the result of the serialiser, so every message, stack, context and cause at every depth is
  redacted.
- **ERR-F6 — The serialiser never throws.** A property getter that throws, a hostile `toJSON` or an
  unexpected type becomes a marker (`"[Unserializable]"`); the error is still logged (LOG-P6).

## 9. Handling and display

- **ERR-H1 — Logged once, complete.** Where an error is handled (the central handler, the job
  runner), it is logged once (LOG-L2) with its message, code, context, cause chain, stack and the
  request id or job name.
- **ERR-H2 — Expected outcomes are not errors.** A refused validation, a 404 or a business refusal is
  a normal answer (LOG-L3): it is described by its code and context in the access line or a `warn`,
  not reported as an error-tracking issue.
- **ERR-H3 — An unexpected failure answers `500` with a generic code and the request id** (SEC-E3).
  The frontend shows its own translated message with "Reference: <request id>" so a user can quote
  it, reports the failure to error tracking with the same request id, and never shows the
  server's `message` as is.
- **ERR-H4 — Frontend errors follow the same rules:** a failed request names the operation (the API
  call), the status, the error code and the request id; a rendering error names the component; the
  same "never" list applies (form values are personal data).

## 10. Tests

- **ERR-T1 — Important errors are tested for their content**, not only for being thrown: the code
  and the context that makes them understandable (the state found, the ids, the counts).
- **ERR-T2 — A test proves the safety net:** an error whose message, context and cause contain a
  token, an e-mail and a password comes out scrubbed in the log line and in the error-tracking
  event (extends LOG-X7).
- **ERR-T3 — Integration clients are tested on failure:** for each dependency, a refused answer, an
  unexpected shape and a network failure produce the error of section 4.
- **ERR-T4 — Vague messages are caught before review** _(should)_: a lint rule or a check flags
  errors thrown with a generic message (`Error`, `Failed`, `Invalid`, `Something went wrong`) or
  without a code.
- **ERR-T5 — A round-trip test proves nothing is lost.** An error with a code, a context nested
  deeper than 3 levels, an own non-enumerable property, a cause chain of 3 errors (one of them an
  aggregate), a date, a `Map`, a circular reference and an error inside its context is logged; the
  test parses the JSON line and finds every level, every code and every message, the markers where
  expected, and no secret. The same test runs on the error-tracking event.

> **Reference implementation (Node/React).** One base error class (`AppError`) with `code`,
> `message`, `context` and the standard `cause` option; the typed HTTP errors extend it, e.g.
> `new ConflictError("Order is not cancellable", "order_not_cancellable", { context, cause })` with
> `context = { orderId, status: order.status, expected: ["open"] }`. One `serializeError` module
> (`util/error-serializer.js`) walks `Object.getOwnPropertyNames(err)`, `cause` and
> `AggregateError.errors` with a `WeakSet` for cycles; the logger calls it in its first format
> (before redaction, instead of Winston's `errors()` alone) and Sentry's `beforeSend` adds its
> output as `contexts.error` while the linked-errors integration (depth 5) keeps the causes. The
> central error handler logs `{ error: serializeError(err), requestId }`. Integration clients throw
> one class per service (`BillingApiError`) built from the method, path template, status, scrubbed
> and capped provider text, duration and attempt. A Zod failure is reported as its issues' `path`,
> `code`, `expected` and `received` types, never `input`. The React API layer reports
> `{ endpoint, status, code, requestId }` and the UI shows the reference.

## 11. Checklist

- [ ] No vague error left: every thrown error states what failed, on what, why and what happened next, with a precise stable code (ERR-P1, ERR-P4, ERR-M1, ERR-M5).
- [ ] Stable messages, variable data in a structured context; expected and found stated; configuration errors name the variable, never the value, all at once (ERR-M2, ERR-M3, ERR-M4, ERR-C1).
- [ ] Causes kept through every wrap, never replaced by a vaguer error, never swallowed; partial failures, rollbacks and retries described (ERR-C2, ERR-C3, ERR-C4, ERR-C5, ERR-C6).
- [ ] Every integration has its own error type naming service, operation, path template, status, provider code and scrubbed capped text, duration, timeout and attempt; shape errors list paths and types only; network codes kept (ERR-X1 – ERR-X5).
- [ ] Invariants, validation, database errors and timeouts described as in section 5 (ERR-I1 – ERR-I4).
- [ ] Failed and skipped job runs say where and why, item failures carry the item id (ERR-J1 – ERR-J3).
- [ ] Nothing of section 7 in any error; scrubber on every error, context and cause chain in logs and error tracking; callers get only the contract body; uniform answers keep the real cause in the log; error tracking identifies people by id only; one error line under 16 KB (ERR-S1 – ERR-S6).
- [ ] One error serialiser for every output: every level, own property, cause and aggregate kept; unknown JSON values converted; visible limit, cycle and truncation markers distinct from the redaction marker; scrubbing after serialisation on every level; never throws (ERR-F1 – ERR-F6).
- [ ] Errors logged once, complete; expected outcomes not reported as errors; 500s carry the request id, shown by the frontend as a reference; frontend errors follow the same rules (ERR-H1 – ERR-H4).
- [ ] Tests for the content of important errors, the scrubbing of error chains, and each integration's failures; a check for vague messages; a round-trip test that parses the logged JSON and finds every level (ERR-T1 – ERR-T5).
