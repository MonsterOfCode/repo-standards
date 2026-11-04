# Service health and failure alerts standard

**Version:** 1.2 (2026-11-03). **For:** every backend service of ours. **Audience:** the developer, or the AI agent, building or
reviewing a service's dependency monitoring.

**Changes in 1.2:** every rule has a stable ID (`SH-<area><n>`) and every checklist item cites the
rules it covers; new background-job rules (section 2.1, SH-B1–B6: run records, last success only
after success, an expiring lock, isolation, idempotence, stale-job alerts), which extend the
existing job bookkeeping; no other rule's meaning changed.

**Changes in 1.1:** an external uptime monitor of the public URL is required in production
(section 11); stack-specific details moved to a "Reference implementation (Node/React)" callout.

A service is only as healthy as the things it depends on: its database, email, billing system,
partner APIs, and its own scheduled jobs. This standard makes every service watch those
dependencies itself, show their state on one admin page, and alert the people the administrator
chose when one fails, in the same way across all our projects.

**What this is not:**

- **Not the Kubernetes probes.** Liveness and readiness check the process and its own database only.
  An external dependency must never make a pod unready (SH-E1, SH-K2): Kubernetes would restart
  healthy pods without fixing the partner.
- **Not a replacement for metrics or logs.** Those are for engineers; the check results are also
  exported as metrics (section 10) so Prometheus can graph and alert on them. The page and the alerts
  are for the people responsible for the service, in plain language.
- **Not uptime monitoring from outside.** An external probe of the public URL is **required in
  production** (section 11): when the service is down, its own checks and alerts are down with it.
  This standard checks what only the service itself can see.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then list every external dependency and every scheduled job of the
   project, and look at what exists already (health endpoints, job locks, notifications,
   permissions) before writing anything.
2. Adapt it to the stack, but keep the **contract** the same: the check result (section 3), the
   statuses, the alert rules (section 6), the permissions (section 7) and the settings (section 5).
3. Finish with the checklist in section 13. Every item must be true and covered by a test.
   Anything you could not do, report explicitly; never skip it silently.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`SH-<area><n>`: `P` principles, `W` what to check, `B` background jobs, `C` the check result, `T`
the health tick and stored state, `S` settings, `A` alerts, `M` permissions, `U` API and admin page,
`Q` tests, `E` health endpoints and metrics, `X` external uptime monitoring, `K` Kubernetes.

## 1. Principles

- **SH-P1 — Every dependency is checked, and so are the service's own jobs.** A dependency that
  silently fails (an expired token, a revoked key, a job that stopped running) must be noticed by the
  service before a user does.
- **SH-P2 — Configuration counts as health.** A dependency that answers but is set up wrong (a price
  not linked in the billing system, a missing tax) is failing if it blocks users.
- **SH-P3 — Cheap, safe probes.** A check never reads or writes personal data, never sends an email,
  never creates anything in a partner system, and spends as little as possible of any quota or paid
  call.
- **SH-P4 — A check never throws.** Every failure, timeout or bug in a check becomes a result.
- **SH-P5 — No alert spam.** Alert on a confirmed change of state, remind rarely, and say once when
  it works again.
- **SH-P6 — The administrator decides.** Who is alerted, which checks run and how often are
  settings, changed in the app, per environment, and audited.

## 2. What to check

- **SH-W1 — Every dependency and every job has a check**, probed as in this table:

  | Kind                      | Example probe                                                                                                         |
  | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
  | Database                  | a ping or `hello`; the topology the service needs (e.g. a replica set for transactions)                               |
  | Email (SMTP)              | connect, TLS and log in, then quit; **nothing is sent**                                                               |
  | Billing system            | one authenticated read that proves the token, plus the configuration the service needs (prices linked, taxes present) |
  | Partner APIs              | a public or cheap authenticated endpoint that returns no personal data, or the last result of the sync that uses it   |
  | Paid or rate-limited APIs | the cheapest call that proves the credentials; never one counted in a user-facing quota                               |
  | Each scheduled job        | its last successful run is not older than its interval × 1.5 + 15 minutes (SH-B6)                                     |

- **SH-W2 — Fire-and-forget is not checked.** Don't check what is fire-and-forget by design (error
  tracking).
- **SH-W3 — Personal-data endpoints are judged by the sync.** When a partner endpoint returns
  personal data or every read is logged by the partner, don't probe it. Judge it by the last result
  of the real sync instead.

### 2.1 Background jobs

Every scheduled job of the service (not only the health tick of section 4) runs through one job
runner that follows these rules, so its health can be judged:

- **SH-B1 — Every run leaves a run record:**
  `{ jobName, startedAt, endedAt, outcome, errorCode, counts }` (`outcome`: `succeeded` or `failed`;
  `counts`: items processed, skipped, failed). It never holds personal data. The runner also keeps one summary per job
  `{ jobName, lastSuccessAt, lastDurationMs, lastFailureAt }`. Writing them is bookkeeping only: a
  failed write never changes the job's result.
- **SH-B2 — The last success is written only after the run succeeded**, when all its work is done,
  never when it starts. A run that fails or crashes leaves the previous `lastSuccessAt` in place.
- **SH-B3 — One instance at a time.** A lock in the shared database or store, with an expiry,
  guarantees two instances never run the same job at once. The expiry is longer than the job's
  longest normal run, so a crashed holder's lock expires and the next tick runs the job again.
- **SH-B4 — One job never stops the others.** Each job runs isolated, with its errors caught per
  job: a failing, slow or crashing job never stops, blocks or skips the other jobs.
- **SH-B5 — Idempotent or safely resumable.** A job can be re-run after a crash at any point without
  doing its work twice (sending an email twice, charging twice): it is idempotent, or it records its
  progress and resumes from it.
- **SH-B6 — A stale job alerts.** The job's check (SH-W1) fails with `job_stale` when its last
  success is older than its expected interval × `SERVICE_HEALTH_JOB_STALE_FACTOR` + 15 minutes, or
  when it never succeeded, and is alerted like any failing check (section 6).

## 3. The check result

- **SH-C1 — The result shape.** Each check is one small module in a registry, and returns:

  ```text
  { status: "ok" | "degraded" | "failing" | "not_configured",
    code:   stable snake_case reason ("smtp_auth_failed", "billing_prices_not_linked", "job_stale"),
    detail: short technical hint (an HTTP status, a network error code) - never a secret or personal data }
  ```

  The runner adds `latencyMs`. The statuses mean:

  | Status           | Meaning                                                     | Alerted |
  | ---------------- | ----------------------------------------------------------- | ------- |
  | `ok`             | works                                                       | no      |
  | `degraded`       | works, but something secondary is wrong (shown on the page) | no      |
  | `failing`        | users are or will be affected                               | yes     |
  | `not_configured` | this environment doesn't use the dependency                 | never   |

- **SH-C2 — Running the checks:**
  - checks run **concurrently**, each with a timeout (e.g. 10 s);
  - a timeout becomes `failing` / `check_timeout`;
  - a throw or a malformed result becomes `failing` / `check_error`.
- **SH-C3 — Stable codes.** Codes are stable once shipped. The page and the alerts translate them
  into a plain sentence that says what to do.

## 4. The job and the stored state

- **SH-T1 — A health tick every 5 minutes**, under a database lock so only one instance runs it
  (SH-B3). It runs every enabled check whose own interval has passed since its last run.
- **SH-T2 — State is one document per check:**

  ```text
  { checkName, group, status, code, detail, latencyMs,
    since,               // when the current status started
    lastCheckedAt, lastOkAt, consecutiveFailures, alertedAt }
  ```

  Checks that no longer exist are removed. History is not kept here; logs and alerts hold it.

- **SH-T3 — Every status change is logged** (failing at `error`, the rest at `warn`) with
  `checkName`, `code`, `previousStatus`, `status` and `detail`, following the logging standard.

## 5. Settings (per check, per environment)

- **SH-S1 — Two settings per check:**

  | Setting           | Values                                 | Default                                                                                     |
  | ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
  | `enabled`         | on / off                               | `SERVICE_HEALTH_DEFAULT_ENABLED`: on in production, off elsewhere when unset                |
  | `intervalMinutes` | 5, 10, 15, 30, 60, 180, 360, 720, 1440 | 10 for what costs nothing outside the service (database, email, jobs); 60 for external APIs |

- **SH-S2 — Stored per environment.** Settings are stored in the environment's own database, so
  each environment is configured on its own page. A missing setting means the default.
- **SH-S3 — A disabled check is silent.** It never runs (not even on "Check now") and never alerts.
  Its last state stays visible but no longer counts as failing.
- **SH-S4 — Switching a check off** clears its failure streak and any open alert.
- **SH-S5 — Changes are audited** (old and new values) and take effect on the next tick.
- **SH-S6 — Other defaults in config:** `SERVICE_HEALTH_FAILURES_BEFORE_ALERT` (2),
  `SERVICE_HEALTH_RENOTIFY_HOURS` (24), `SERVICE_HEALTH_JOB_STALE_FACTOR` (1.5),
  `SERVICE_HEALTH_CHECK_TIMEOUT_MS` (10000).

## 6. Alerts

- **SH-A1 — Failing after 2 runs.** Failing is announced after **2 failing runs in a row**, which
  absorbs blips. While it stays failing it is re-announced at most **once every 24 hours**.
- **SH-A2 — Recovered once.** Recovered is announced once, when an announced check is `ok` or
  `degraded` again. A check that becomes `not_configured` or is switched off is cleared silently.
- **SH-A3 — One message per run** lists every check it is about, so an outage of several services is
  a single alert.
- **SH-A4 — Channels: in-app, then email.** The in-app notification is written before any email is
  attempted, so an email outage is still announced in the app. A delivery failure is logged and
  never fails the run.
- **SH-A5 — State before sending.** The alert state is saved before sending, so a crash in between
  loses one alert rather than repeating it.
- **SH-A6 — Content:** what failed, since when and what to do. Never secrets, tokens or personal
  data.

## 7. Permissions

- **SH-M1 — Three separate permissions**, held by the top administrator and granted to others
  individually; none of them in any default role:

  | Permission              | Allows                                        |
  | ----------------------- | --------------------------------------------- |
  | `service_health.read`   | see the page and run "Check now"              |
  | `service_health.notify` | be alerted (in-app and email)                 |
  | `service_health.manage` | change the settings (on/off, interval, reset) |

Watching, being woken up and changing the settings are three different choices, so they are three
permissions.

## 8. API and page

- **SH-U1 — `GET /admin/service-health`** returns every check with its settings and state, and in
  the meta:
  - the last run, and when "Check now" is next allowed;
  - which dependencies are configured in this environment;
  - the allowed intervals, the alert rules, and whether the caller may manage.
- **SH-U2 — `POST /admin/service-health/run`** runs every enabled check now, under the job lock and
  with the same alert rules:
  - at most once a minute, whoever asks: `429` with `retryAfterSeconds`;
  - `409` while a run is in progress.
- **SH-U3 — `PATCH /admin/service-health/settings/:checkName`** `{ enabled?, intervalMinutes? }`, and
  `DELETE` on the same path for "Reset to default".
- **SH-U4 — Admin page:**
  - checks grouped (Infrastructure, Integrations, Scheduled jobs), each with:
    - its status badge and the plain-language reason;
    - since, last checked, last OK, response time;
    - for managers, its switch and interval;
  - a menu badge with the number of failing checks;
  - the page refreshes every minute.

## 9. Testing

- **SH-Q1 — Unit tests per check**, with the dependency mocked: ok, every failing code, timeout,
  throw.
- **SH-Q2 — Alert rules are tested:** the second failing run alerts, a blip doesn't, the 24 h
  reminder works, recovery is announced once, and a disabled check is silent.
- **SH-Q3 — End-to-end, with stubbed partners:**
  - make a stub fail, run the job twice;
  - check the alert reaches a holder of `notify` and not a reader without it;
  - fix the stub, check the single recovery.
- **SH-Q4 — No test or script calls a real partner.**

## 10. Health endpoints and Prometheus

Every service exposes, besides its admin page:

- **SH-E1 — Health endpoints** (public, cheap, no internal detail in the answer):

  | Endpoint           | Checks                                | Answers                                             |
  | ------------------ | ------------------------------------- | --------------------------------------------------- |
  | `GET /health/live` | nothing (the process answers)         | `200 { status: "alive" }`                           |
  | `GET /health`      | the process and its own database only | `200` ready, `503` when the database is unreachable |

  They serve the Kubernetes probes and external uptime monitoring. They never include the external
  dependencies (see "What this is not").

- **SH-E2 — `GET /metrics`** in Prometheus format, protected (an operations token or network policy,
  never public). Besides the usual HTTP metrics, it exports the **stored** result of the checks:

  | Metric                                                       | Value                                                                                                 |
  | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
  | `service_health_check_status{check, group, state}`           | `0` ok, `1` degraded, `2` failing, `-1` disabled, not configured or not checked yet; `state` names it |
  | `service_health_check_last_checked_timestamp_seconds{check}` | when the check last ran                                                                               |
  | `service_health_check_latency_seconds{check}`                | its last response time                                                                                |
  | `service_health_check_consecutive_failures{check}`           | failures in a row                                                                                     |
  | `job_last_success_timestamp_seconds{job}`                    | last successful run of each scheduled job                                                             |
  | `job_last_failure_timestamp_seconds{job}`                    | last failed run                                                                                       |

- **SH-E3 — A scrape never runs a check** or calls a partner. It reads the stored state, cached for
  about 15 seconds, so Prometheus can scrape as often as it likes without spending paid calls.
- **SH-E4 — Only enabled checks produce new results.** A disabled or unused check is still listed,
  with `-1`, so a series never silently disappears and a dashboard shows it is off on purpose.
- **SH-E5 — A failed state read is not a failed scrape.** If the state can't be read, the scrape
  still answers with the other metrics and increments `service_health_metrics_read_errors_total`.
- **SH-E6 — Bounded labels.** One series per check: labels stay bounded, never ids or messages.

Example Prometheus alert rules, alongside the in-app alerts and not replacing them:

```yaml
- alert: DependencyFailing
  expr: service_health_check_status == 2
  for: 15m
- alert: HealthCheckNotRunning # an enabled check stopped running
  expr: service_health_check_status >= 0 and time() - service_health_check_last_checked_timestamp_seconds > 3 * 3600
- alert: JobNotSucceeding
  expr: time() - job_last_success_timestamp_seconds > 2 * 3600
```

## 11. External uptime monitoring (required in production)

The in-app checks and alerts run inside the service. When the service, its server, its network or
its edge proxy is down, nothing inside it can raise an alert. So every production environment
**must** also be watched from outside:

- **SH-X1 — A monitor outside the service's infrastructure** (a hosted uptime service, or a monitor
  on another provider and another network), never on the same server or cluster.
- **SH-X2 — It probes the public URLs** a user reaches, through the real DNS, TLS and edge proxy:
  - the API's readiness endpoint (`GET /health`, section 10), expecting `200`;
  - the frontend's entry page, expecting `200` and a known piece of content.
- **SH-X3 — Every 1 to 5 minutes**, from at least two locations, alerting after 2 failed probes in a
  row (to absorb a single network blip).
- **SH-X4 — It also watches the TLS certificate** (alert at least 14 days before expiry) and, where
  the service tool allows it, the domain's expiry.
- **SH-X5 — Alerts go to people, by a channel that doesn't depend on the service**: email and/or a
  phone push or SMS to the on-call people, never only to the app's own notifications.
- **SH-X6 — Dead-man's switches** for what runs outside the service (backups, the external
  scheduler, if any): the job pings the monitor on success, and the monitor alerts when the ping does
  not arrive.
- **SH-X7 — Staging should have it too**, with alerts to the team channel only.
- **SH-X8 — Documented and tested once.** The monitor's configuration (URLs, intervals, who is
  alerted) is written in the project's deployment docs, and a test alert is sent once when it is set
  up.

## 12. Running on Kubernetes

- **SH-K1 — Once per tick across all replicas.** The job runs inside the API pods, guarded by the
  database lock, or as a CronJob.
- **SH-K2 — Readiness stays limited** to the process and its database (section 10).
- **SH-K3 — State in the database**, so every replica shows the same page.

> **Reference implementation (Node/React).** The checks are modules in a registry under
> `services/service-health/`; the tick is a `node-cron` job in the API process under a MongoDB
> lock (`database/job-lock.js`), which also records `job_runs` for every job; settings and state are
> collections (`service_health_settings`, `service_health`); metrics with `prom-client`; SMTP checked
> with the mailer's `verify()` (connect, TLS, login, no message). External uptime: a hosted monitor
> (e.g. an Uptime Kuma instance on another provider, or a hosted service) on `/api/v1/health` and the
> SPA's `/`, plus a healthchecks-style ping URL for the backup job.

## 13. Checklist

- [ ] Every external dependency and every scheduled job has a check in the registry, probed cheaply and safely; fire-and-forget not checked; personal-data partners judged by their sync (SH-P1, SH-P3, SH-W1, SH-W2, SH-W3).
- [ ] Checks return the result of section 3, run concurrently with a timeout, never throw, use stable codes, and never touch personal data or create anything (SH-P4, SH-C1, SH-C2, SH-C3).
- [ ] Configuration problems that block users are `failing` checks (SH-P2).
- [ ] Every job runs through one runner: a run record per run without personal data, last success written only after success, an expiring lock in the shared store, each job isolated with its errors caught, idempotent or resumable after a crash; stale or never-succeeded jobs fail and alert (SH-B1, SH-B2, SH-B3, SH-B4, SH-B5, SH-B6).
- [ ] A 5-minute tick under a lock runs the enabled checks whose interval has passed; the state is stored per check; status changes are logged (SH-T1, SH-T2, SH-T3).
- [ ] Settings per check and per environment (on/off, interval), stored in the environment's database, defaults from config (on only in production); a disabled check is silent and switching off clears it; audited changes (SH-P6, SH-S1, SH-S2, SH-S3, SH-S4, SH-S5, SH-S6).
- [ ] Alerts after 2 failures, reminders every 24 h at most, one recovery message, one message per run, in-app before email, state saved before sending, no secrets or personal data (SH-P5, SH-A1, SH-A2, SH-A3, SH-A4, SH-A5, SH-A6).
- [ ] Three permissions (`read`, `notify`, `manage`), none in default roles (SH-M1).
- [ ] API and admin page with the checks, the reasons, the settings and a "Check now" limited to once a minute; a menu badge (SH-U1, SH-U2, SH-U3, SH-U4).
- [ ] `/health/live` and `/health` (process + own database only), public and without detail; no external dependency can make the service unready (SH-E1, SH-K2).
- [ ] `/metrics` (protected) exports the stored check state and job timestamps of section 10; a scrape never runs a check; disabled checks are listed with `-1`; read errors counted; bounded labels (SH-E2, SH-E3, SH-E4, SH-E5, SH-E6).
- [ ] Tests of section 9; no real partner called in tests (SH-Q1, SH-Q2, SH-Q3, SH-Q4).
- [ ] On Kubernetes: the tick runs once across replicas, the state lives in the database (SH-K1, SH-K3).
- [ ] Production: an external uptime monitor outside the service's infrastructure probes the public API and frontend URLs every 1 to 5 minutes from two locations, and the TLS certificate; alerts people by a channel independent of the service; dead-man's switches watch the backups; configuration documented and a test alert sent; staging watched too (SH-X1, SH-X2, SH-X3, SH-X4, SH-X5, SH-X6, SH-X7, SH-X8).
