# Application logging standard

**Version:** 1.2 (2026-11-03). **For:** every backend service of ours. **Audience:** the developer, or the AI agent, building or
reviewing a service's logging.

**Changes in 1.2:** every rule has a stable ID (`LOG-<area><n>`) and every checklist item cites the
rules it covers; no rule's meaning changed.

**Changes in 1.1:** stack-specific details moved to "Reference implementation (Node/React)"
callouts; links to the security and privacy standards.

This is the standard all our services follow, so that every service's logs can be collected,
searched and correlated the same way (on a VM with Docker today, on Kubernetes tomorrow), and so
that no log ever becomes a leak of personal data.

**Logs are not the audit log.** Logs are for operating the service: debugging, performance,
incidents. They are short-lived and may be sampled (LOG-P7). "Who did what, when, to what, and who
saw what" belongs in the audit log, which has its own standard ([`audit-log.md`](audit-log.md)).
Errors also go to error tracking (Sentry or equivalent), and numbers go to metrics (Prometheus or
equivalent). What may never appear in a log is also a privacy rule ([privacy standard](privacy.md));
which security events must be logged is in the [security standard](security.md).

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at what the project already has (logger, access log,
   request ids, error tracking, log files, Dockerfile, compose or k8s files) before changing
   anything. Build on what exists; replace what contradicts this standard.
2. Adapt it to the project's stack, but keep the **contract** the same: the line format (section
   3), the base fields, the access event (section 5), the redaction rules (section 6) and the
   configuration names (section 4). Libraries and file layout are yours to choose.
3. Finish with the checklist in section 10. Every item must be true and covered by a test.
   Anything you could not do, report explicitly; never skip it silently.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`LOG-<area><n>`: `P` principles, `L` levels, `F` line format and fields, `C` configuration, `R`
request id and access event, `X` redaction, `J` background jobs and startup, `K` container
platforms, `N` never in a log.

## 1. Principles

- **LOG-P1 — Logs are an event stream on stdout** (12-factor). The service writes one event per line
  to standard output; the platform (Docker, Kubernetes, a log agent) collects, ships, stores and
  rotates them. By default a service must not write log files.
- **LOG-P2 — One JSON object per line** in every deployed environment. Human-readable output is only
  for a developer's machine and tests.
- **LOG-P3 — No personal data, no secrets.** A redaction step runs on every line, whatever the code
  passed to the logger (section 6). Log ids, not people.
- **LOG-P4 — Every line can be correlated.** Each line carries the service, environment, version
  and, inside an HTTP request, its request id.
- **LOG-P5 — One access event per HTTP request**, structured, without the query string, body, raw
  IP, user agent or referrer.
- **LOG-P6 — Logs never change behaviour.** Logging must not throw, block a request or fail an
  operation.
- **LOG-P7 — Logs are never the only record of who did what.** That record is the audit log
  ([`audit-log.md`](audit-log.md)).

## 2. Levels

| Level   | Use for                                                                                       |
| ------- | --------------------------------------------------------------------------------------------- |
| `error` | something failed and needs attention: an unhandled error, a failed job, a dependency down     |
| `warn`  | something unexpected the service handled: a retry, a refused abuse attempt, a 5xx access line |
| `info`  | normal lifecycle and business milestones: startup, shutdown, a job run summary, access lines  |
| `debug` | detail for local debugging only; off in deployed environments                                 |

- **LOG-L1 — Levels as in the table.** Each line uses the level the table gives its kind of event;
  `debug` is off in deployed environments.
- **LOG-L2 — An error is logged once**, where it is handled (the central error handler, the job
  runner), with its stack. Don't log it again at every layer it passes through.
- **LOG-L3 — Expected client errors are not `error`.** 4xx validation and 404 are already recorded
  by the access line.

## 3. The line

- **LOG-F1 — Base fields.** Every line is one JSON object with at least these fields:

  | Field       | Content                                                                                                         |
  | ----------- | --------------------------------------------------------------------------------------------------------------- |
  | `timestamp` | ISO 8601, UTC                                                                                                   |
  | `level`     | `error` \| `warn` \| `info` \| `debug`                                                                          |
  | `message`   | a short, stable sentence (`"http request"`, `"Job finished"`); variable data goes in fields, not in the message |
  | `service`   | the service name (from config, e.g. `APP_NAME`)                                                                 |
  | `env`       | the environment (`NODE_ENV` or equivalent: `development`, `staging`, `production`...)                           |
  | `version`   | the release: the git SHA baked into the image at build time, else the app version                               |
  | `requestId` | inside an HTTP request: its id (section 5); absent outside a request                                            |
  | `stack`     | for errors: the stack trace (redacted like the rest)                                                            |

  Any other field is event-specific (`jobName`, `durationMs`, `count`, ids...).

- **LOG-F2 — Field names are camelCase and stable:** dashboards and alerts depend on them.
- **LOG-F3 — Variable data goes in fields**, never interpolated into `message`, so lines can be
  grouped and searched by `message`.
- **LOG-F4 — Values are ids, enums, numbers, booleans, durations.** Never whole documents or request
  bodies.
- **LOG-F5 — The pod or host name is not a field:** the platform adds it (Kubernetes metadata, Docker
  labels).

Example:

```json
{
  "timestamp": "2026-10-28T14:29:34.917Z",
  "level": "info",
  "message": "Job finished",
  "service": "orders-api",
  "env": "production",
  "version": "0105224",
  "jobName": "invoice-sync",
  "durationMs": 842,
  "processed": 12
}
```

## 4. Configuration

- **LOG-C1 — Configuration names and defaults.** The names are part of the standard:

  | Variable             | Values                        | Default                                                                                                                |
  | -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | `LOG_FORMAT`         | `json` \| `pretty`            | `pretty` only when the environment is local or test; `json` everywhere else                                            |
  | `STANDARD_LOG_LEVEL` | `error` `warn` `info` `debug` | `info`                                                                                                                 |
  | `LOGS_DIR`           | a directory, or unset         | unset = **no files**. Set only on a host without a log collector: JSON files with daily rotation and a retention limit |

- **LOG-C2 — `pretty` is still redacted.** It is a readable one-line format (time, level, request id
  prefix, message, then the extra fields as compact JSON), and it goes through redaction like JSON.
- **LOG-C3 — Files mirror stdout.** Files, when enabled, contain exactly the same JSON lines as
  stdout; stdout stays on.
- **LOG-C4 — Read-only root filesystem.** In containers the root filesystem should be read-only;
  nothing in the logging setup may need to write to it.

> **Reference implementation (Node/React).** winston with a JSON format on a console transport, a
> format that adds the base fields and the request id, and the shared scrubber as the last format
> before output; `winston-daily-rotate-file` only when `LOGS_DIR` is set. `NODE_ENV` gives `env`;
> the image's build argument (git SHA) gives `version`.

## 5. Request id and the access event

**Request id:**

- **LOG-R1 — Validated or generated.** Accept an incoming `X-Request-Id` only if it matches
  `^[a-zA-Z0-9._:-]{1,128}$`; otherwise generate a UUID.
- **LOG-R2 — Request-scoped context.** Store it in a request-scoped context (async-local storage or
  the equivalent), so every log line, error report and audit row of that request carries it without
  being passed around.
- **LOG-R3 — Echoed and forwarded.** Echo it in the response header `X-Request-Id`, and forward it on
  calls to other internal services.

**Access event:**

- **LOG-R4 — One access line per request**, written when the response ends or the connection closes,
  mounted right after the request-id middleware (so rate-limited and timed-out requests are logged
  too), with these fields:

  | Field           | Content                                                                              |
  | --------------- | ------------------------------------------------------------------------------------ |
  | `message`       | `"http request"`                                                                     |
  | `method`        | `GET`, `POST`...                                                                     |
  | `path`          | the path **without the query string**, with token-like segments filtered (section 6) |
  | `route`         | the route template when the router knows it (`/orders/:orderId`), else `null`        |
  | `statusCode`    | the status sent                                                                      |
  | `durationMs`    | time to respond, ms (one decimal)                                                    |
  | `contentLength` | response size in bytes, or `null`                                                    |
  | `requestId`     |                                                                                      |
  | `ipHash`        | a keyed HMAC of the client IP (secret from config), never the IP                     |
  | `aborted`       | `true` if the client closed the connection before the response was complete          |

- **LOG-R5 — Access level.** Level `info`, or `warn` for a 5xx (the error itself is logged at `error`
  by the error handler).
- **LOG-R6 — Never in the access event:** query string (search terms can be names), body, headers,
  cookies, raw IP, user agent, referrer.
- **LOG-R7 — Probes are skipped.** Health and readiness probes and metrics scraping are not logged;
  the probes hit them every few seconds. They are still counted in metrics.
- **LOG-R8 — The real client IP.** Behind a reverse proxy or ingress, configure the framework's
  trusted-proxy setting so the client IP (before hashing) is the real one.

> **Reference implementation (Node/React).** The request id and context live in `AsyncLocalStorage`
> (`util/request-context.js`); the access event is a small middleware on the response's `finish` and
> `close` events (no morgan); Express `app.set("trust proxy", 1)` behind one proxy.

## 6. Redaction

Redaction is defence in depth: code should not log personal data in the first place, but a mistake
must not leak.

- **LOG-X1 — Redaction on every line.** A redaction step in the logger runs on **every** line, before
  every output, on the message, the stack and all fields.
- **LOG-X2 — Filtered keys.** The value of these keys is replaced by `"[Filtered]"` (compared
  case-insensitively, ignoring `_` and `-`; the whole value is dropped, whatever its type):
  - credentials: `password`, `passwd`, `newPassword`, `currentPassword`, `secret`, `clientSecret`,
    `token`, `accessToken`, `refreshToken`, `idToken`, `csrfToken`, `authorization`, `cookie`,
    `cookies`, `setCookie`, `apiKey`, `key`, `otc`, `otcCode`, `verificationCode`, `signature`,
    `sig`;
  - people: `email`, `emails`, `phone`, `phoneNumber`, `mobile`, `name`, `firstName`, `lastName`,
    `fullName`, `displayName`, `contactName`, `address`, `street`, `streetAddress`, `birthDate`,
    `dateOfBirth`, `dob`, national and insurance ids (`ahv`, `avs`, `ssn`, `insurance`,
    `insuranceNumber`), `iban`;
  - content: `patient`, `patients`, `diagnosis`, `notes`, `note`, `comment`, `comments`, `message`
    (as a field, not the line's own `message`), `body`, `content`, `description`, `data`.
- **LOG-X3 — The key list only grows.** A project adds its own sensitive domain keys to this list; it
  never removes one.
- **LOG-X4 — Masked patterns.** These patterns are masked inside any string:

  | Pattern                                                                                                              | Becomes             |
  | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
  | e-mail addresses                                                                                                     | `[email]`           |
  | phone numbers (international and national)                                                                           | `[phone]`           |
  | JWTs (`eyJ...`)                                                                                                      | `[jwt]`             |
  | `Bearer ...` / `Basic ...`                                                                                           | `Bearer [Filtered]` |
  | national ids (e.g. Swiss AHV `756.xxxx.xxxx.xx`)                                                                     | `[ahv]`             |
  | IBANs                                                                                                                | `[iban]`            |
  | database duplicate-key details (`dup key: {...}`)                                                                    | filtered            |
  | URL query values named token, code, signature, email, password...                                                    | filtered            |
  | path segments after `confirm`, `verify`, `reset-password`, `unsubscribe`, `token`... and any 32+ char opaque segment | filtered            |

- **LOG-X5 — One shared scrubber.** The logger and the error-tracking client use **one** shared
  scrubber, so both filter the same things.
- **LOG-X6 — Safe serialisation.** Before scrubbing, turn values into plain JSON (an Error becomes
  its stack text, dates their ISO string), cap the depth, and survive circular objects.
- **LOG-X7 — Redaction is tested.** A test proves that an e-mail, a phone number, a Bearer token, a
  JWT and a `{ password }` field passed to the logger never come out in any format.

> **Reference implementation (Node/React).** One module (`util/error-reporting-scrubber.js`) exports
> `scrubText` and `scrubData`; the logger's last format and Sentry's `beforeSend` /
> `beforeBreadcrumb` both call it, and Sentry's `sendDefaultPii` is off.

## 7. Background jobs and startup

- **LOG-J1 — One summary per job run.** A job logs one `info` line when it finishes (`jobName`,
  `durationMs`, counts) and one `error` line with the stack when it fails. No line per processed
  item.
- **LOG-J2 — Job lines are tagged.** Jobs have no request id; add a `jobName` (and a run id if the
  job has one) to each of their lines.
- **LOG-J3 — Startup and shutdown are logged:** startup (port, environment, version) and graceful
  shutdown (signal received, each shutdown step, completion or timeout).
- **LOG-J4 — Never log configuration values.** Logging which optional features are on is fine.

## 8. Running on Kubernetes (or any container platform)

- **LOG-K1 — stdout only** (`LOGS_DIR` unset), `LOG_FORMAT=json`. The cluster's log agent (Alloy,
  Fluent Bit, Vector...) ships the lines to the log store (Loki, Elasticsearch...), and adds pod,
  namespace and container labels.
- **LOG-K2 — Few, low-cardinality labels.** Promote only `service`, `env` and `level` to labels.
  `requestId`, `path` and ids stay in the line, searchable but not labels.
- **LOG-K3 — Retention lives in the log store** (e.g. 14–30 days). Logs are not the audit log:
  anything that must be kept longer goes to the audit log.
- **LOG-K4 — Probes.** A liveness endpoint with no dependency checks, and a readiness endpoint that
  checks the database. Neither appears in the access log.

## 9. Never in a log

- **LOG-N1 — Never logged**, by any line, field or format:
  - passwords, tokens, one-time codes, API keys, session cookies, signed links;
  - names, e-mails, phones, addresses, dates of birth of people;
  - health data, notes, comments, descriptions, any free text a user typed;
  - request or response bodies, query strings, raw IP addresses, user agents;
  - whole database documents.
- **LOG-N2 — Log the id.** If you need to know _which_ record was involved, log its id.

## 10. Checklist

- [ ] One JSON object per line on stdout in every deployed environment; no files unless `LOGS_DIR` is set, and then the same lines as stdout (LOG-P1, LOG-P2, LOG-C3, LOG-K1).
- [ ] `LOG_FORMAT` (`pretty` only local/test, still redacted), `STANDARD_LOG_LEVEL`, optional `LOGS_DIR`, with the defaults of section 4 (LOG-C1, LOG-C2).
- [ ] Base fields on every line: `timestamp`, `level`, `message`, `service`, `env`, `version`; `requestId` inside a request; `stack` for errors (LOG-P4, LOG-F1).
- [ ] Stable camelCase fields, variable data in fields and not in `message`, only ids, enums, numbers, booleans and durations as values, no pod or host field (LOG-F2, LOG-F3, LOG-F4, LOG-F5).
- [ ] Request id: validated incoming `X-Request-Id` or a new UUID, request-scoped context, echoed in the response, forwarded to internal calls (LOG-R1, LOG-R2, LOG-R3).
- [ ] One access event per request with the fields of section 5, at `info` (`warn` for a 5xx); no query string, raw IP, user agent, referrer or body; probes and metrics skipped; trusted proxy set (LOG-P5, LOG-R4, LOG-R5, LOG-R6, LOG-R7, LOG-R8).
- [ ] One shared redaction step on every line and output (keys and patterns of section 6, keys only added), shared with error tracking, safe serialisation; a test proves it (LOG-P3, LOG-X1, LOG-X2, LOG-X3, LOG-X4, LOG-X5, LOG-X6, LOG-X7).
- [ ] Nothing of section 9 in any line; records identified by their id (LOG-N1, LOG-N2).
- [ ] Levels as in section 2; errors logged once, where handled, with their stack; 4xx are not `error` (LOG-L1, LOG-L2, LOG-L3).
- [ ] Logging never throws, blocks or fails an operation; logs are never the only record of who did what (LOG-P6, LOG-P7).
- [ ] Jobs log a summary line per run and an error line on failure, tagged with `jobName`; startup and shutdown logged; no configuration values logged (LOG-J1, LOG-J2, LOG-J3, LOG-J4).
- [ ] On a container platform: only low-cardinality labels, retention in the log store, liveness and readiness probes outside the access log (LOG-K2, LOG-K3, LOG-K4).
- [ ] The service runs with a read-only root filesystem without logging errors (LOG-C4).
