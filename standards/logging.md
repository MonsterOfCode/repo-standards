# Application logging standard

**Version:** 1.0 (2026-10-31). **For:** every backend service of ours. **Audience:** the developer, or the AI agent, building or
reviewing a service's logging.

This is the standard all our services follow, so that every service's logs can be collected,
searched and correlated the same way (on a VM with Docker today, on Kubernetes tomorrow), and so
that no log ever becomes a leak of personal data.

**Logs are not the audit log.** Logs are for operating the service: debugging, performance,
incidents. They are short-lived, may be sampled, and must never be the only record of who did
what. "Who did what, when, to what, and who saw what" belongs in the audit log, which has its own
standard ([`audit-log.md`](audit-log.md)). Errors also go to error tracking (Sentry or equivalent), and
numbers go to metrics (Prometheus or equivalent).

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at what the project already has (logger, access log,
   request ids, error tracking, log files, Dockerfile, compose or k8s files) before changing
   anything. Build on what exists; replace what contradicts this standard.
2. Adapt it to the project's stack, but keep the **contract** the same: the line format (section
   3), the base fields, the access event (section 5), the redaction rules (section 6) and the
   configuration names (section 4). Libraries and file layout are yours to choose.
3. Finish with the checklist in section 10. Every item must be true and covered by a test.
   Anything you could not do, report explicitly; never skip it silently.

The key words **must**, **must not** and **should** mean what they say.

## 1. Principles

1. **Logs are an event stream on stdout** (12-factor). The service writes one event per line to
   standard output; the platform (Docker, Kubernetes, a log agent) collects, ships, stores and
   rotates them. By default a service must not write log files.
2. **One JSON object per line** in every deployed environment. Human-readable output is only for a
   developer's machine and tests.
3. **No personal data, no secrets.** A redaction step runs on every line, whatever the code passed
   to the logger (section 6). Log ids, not people.
4. **Every line can be correlated.** Each line carries the service, environment, version and, inside
   an HTTP request, its request id.
5. **One access event per HTTP request**, structured, without the query string, body, raw IP, user
   agent or referrer.
6. **Logs never change behaviour.** Logging must not throw, block a request or fail an operation.

## 2. Levels

| Level   | Use for                                                                                       |
| ------- | --------------------------------------------------------------------------------------------- |
| `error` | something failed and needs attention: an unhandled error, a failed job, a dependency down     |
| `warn`  | something unexpected the service handled: a retry, a refused abuse attempt, a 5xx access line |
| `info`  | normal lifecycle and business milestones: startup, shutdown, a job run summary, access lines  |
| `debug` | detail for local debugging only; off in deployed environments                                 |

- An error is logged **once**, where it is handled (the central error handler, the job runner), with
  its stack. Don't log it again at every layer it passes through.
- Expected client errors (4xx validation, 404) are not `error`: the access line already records them.

## 3. The line

Every line is one JSON object with at least these fields:

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

Any other field is event-specific (`jobName`, `durationMs`, `count`, ids...). Rules:

- Field names are camelCase and stable: dashboards and alerts depend on them.
- Variable data goes in fields, never interpolated into `message`, so lines can be grouped and
  searched by `message`.
- Values are ids, enums, numbers, booleans, durations. Never whole documents or request bodies.
- The pod or host name is **not** a field: the platform adds it (Kubernetes metadata, Docker labels).

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

The names are part of the standard:

| Variable             | Values                        | Default                                                                                                                |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LOG_FORMAT`         | `json` \| `pretty`            | `pretty` only when the environment is local or test; `json` everywhere else                                            |
| `STANDARD_LOG_LEVEL` | `error` `warn` `info` `debug` | `info`                                                                                                                 |
| `LOGS_DIR`           | a directory, or unset         | unset = **no files**. Set only on a host without a log collector: JSON files with daily rotation and a retention limit |

- `pretty` is a readable one-line format (time, level, request id prefix, message, then the extra
  fields as compact JSON). It still goes through redaction.
- Files, when enabled, contain exactly the same JSON lines as stdout; stdout stays on.
- In containers the root filesystem should be read-only; nothing in the logging setup may need to
  write to it.

## 5. Request id and the access event

**Request id:**

- Accept an incoming `X-Request-Id` only if it matches `^[a-zA-Z0-9._:-]{1,128}$`; otherwise generate
  a UUID.
- Store it in a request-scoped context (async-local storage or the equivalent), so every log line,
  error report and audit row of that request carries it without being passed around.
- Echo it in the response header `X-Request-Id`, and forward it on calls to other internal services.

**Access event:** one line per request, written when the response ends or the connection closes,
mounted right after the request-id middleware (so rate-limited and timed-out requests are logged
too).

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

- Level `info`, or `warn` for a 5xx (the error itself is logged at `error` by the error handler).
- **Never logged:** query string (search terms can be names), body, headers, cookies, raw IP, user
  agent, referrer.
- **Skipped:** health and readiness probes and metrics scraping; the probes hit them every few
  seconds. They are still counted in metrics.
- Behind a reverse proxy or ingress, configure the framework's trusted-proxy setting so the client IP
  (before hashing) is the real one.

## 6. Redaction

A redaction step in the logger runs on **every** line, before every output, on the message, the stack
and all fields. It is defence in depth: code should not log personal data in the first place, but a
mistake must not leak.

**Keys whose value is replaced by `"[Filtered]"`** (compared case-insensitively, ignoring `_` and `-`;
the whole value is dropped, whatever its type):

- credentials: `password`, `passwd`, `newPassword`, `currentPassword`, `secret`, `clientSecret`,
  `token`, `accessToken`, `refreshToken`, `idToken`, `csrfToken`, `authorization`, `cookie`, `cookies`,
  `setCookie`, `apiKey`, `key`, `otc`, `otcCode`, `verificationCode`, `signature`, `sig`;
- people: `email`, `emails`, `phone`, `phoneNumber`, `mobile`, `name`, `firstName`, `lastName`,
  `fullName`, `displayName`, `contactName`, `address`, `street`, `streetAddress`, `birthDate`,
  `dateOfBirth`, `dob`, national and insurance ids (`ahv`, `avs`, `ssn`, `insurance`,
  `insuranceNumber`), `iban`;
- content: `patient`, `patients`, `diagnosis`, `notes`, `note`, `comment`, `comments`, `message` (as a
  field, not the line's own `message`), `body`, `content`, `description`, `data`.

A project adds its own sensitive domain keys to this list; it never removes one.

**Patterns masked inside any string:**

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

- Use **one** shared scrubber for the logger and the error-tracking client, so both filter the same
  things.
- Before scrubbing, turn values into plain JSON (an Error becomes its stack text, dates their ISO
  string), cap the depth, and survive circular objects.
- A test proves that an e-mail, a phone number, a Bearer token, a JWT and a `{ password }` field
  passed to the logger never come out in any format.

## 7. Background jobs and startup

- A job logs one `info` line when it finishes (`jobName`, `durationMs`, counts) and one `error` line
  with the stack when it fails. No line per processed item.
- Jobs have no request id; add a `jobName` (and a run id if the job has one) to each of their lines.
- Log startup (port, environment, version) and graceful shutdown (signal received, each shutdown
  step, completion or timeout).
- Never log configuration values. Logging which optional features are on is fine.

## 8. Running on Kubernetes (or any container platform)

- stdout only (`LOGS_DIR` unset), `LOG_FORMAT=json`. The cluster's log agent (Alloy, Fluent Bit,
  Vector...) ships the lines to the log store (Loki, Elasticsearch...), and adds pod, namespace and
  container labels.
- Promote only a few low-cardinality fields to labels (`service`, `env`, `level`). `requestId`,
  `path` and ids stay in the line, searchable but not labels.
- Retention lives in the log store (e.g. 14–30 days). Logs are not the audit log: anything that must
  be kept longer goes to the audit log.
- Probes: a liveness endpoint with no dependency checks, and a readiness endpoint that checks the
  database. Neither appears in the access log.

## 9. Never in a log

- passwords, tokens, one-time codes, API keys, session cookies, signed links;
- names, e-mails, phones, addresses, dates of birth of people;
- health data, notes, comments, descriptions, any free text a user typed;
- request or response bodies, query strings, raw IP addresses, user agents;
- whole database documents.

If you need to know _which_ record was involved, log its id.

## 10. Checklist

- [ ] One JSON object per line on stdout in every deployed environment; no files unless `LOGS_DIR` is set.
- [ ] `LOG_FORMAT` (`pretty` only local/test), `STANDARD_LOG_LEVEL`, optional `LOGS_DIR`, with the defaults of section 4.
- [ ] Base fields on every line: `timestamp`, `level`, `message`, `service`, `env`, `version`; `requestId` inside a request; `stack` for errors.
- [ ] Request id: validated incoming `X-Request-Id` or a new UUID, request-scoped context, echoed in the response, forwarded to internal calls.
- [ ] One access event per request with the fields of section 5; no query string, raw IP, user agent, referrer or body; probes and metrics skipped.
- [ ] One shared redaction step on every line and output (keys and patterns of section 6), shared with error tracking; a test proves it.
- [ ] Errors logged once, where handled, with their stack; 4xx are not `error`.
- [ ] Jobs log a summary line per run and an error line on failure; startup and shutdown logged; no configuration values logged.
- [ ] The service runs with a read-only root filesystem without logging errors.
