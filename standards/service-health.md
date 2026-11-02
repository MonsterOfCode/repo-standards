# Service health and failure alerts standard

**Version:** 1.1 (2026-11-02). **For:** every backend service of ours. **Audience:** the developer, or the AI agent, building or
reviewing a service's dependency monitoring.

**Changes in 1.1:** an external uptime monitor of the public URL is required in production
(section 11); stack-specific details moved to a "Reference implementation (Node/React)" callout.

A service is only as healthy as the things it depends on: its database, email, billing system,
partner APIs, and its own scheduled jobs. This standard makes every service watch those
dependencies itself, show their state on one admin page, and alert the people the administrator
chose when one fails, in the same way across all our projects.

**What this is not:**

- **Not the Kubernetes probes.** Liveness and readiness check the process and its own database only.
  An external dependency must never make a pod unready: Kubernetes would restart healthy pods
  without fixing the partner.
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

The key words **must**, **must not** and **should** mean what they say.

## 1. Principles

1. **Every dependency is checked, and so are the service's own jobs.** A dependency that silently
   fails (an expired token, a revoked key, a job that stopped running) must be noticed by the
   service before a user does.
2. **Configuration counts as health.** A dependency that answers but is set up wrong (a price not
   linked in the billing system, a missing tax) is failing if it blocks users.
3. **Cheap, safe probes.** A check never reads or writes personal data, never sends an email, never
   creates anything in a partner system, and spends as little as possible of any quota or paid call.
4. **A check never throws.** Every failure, timeout or bug in a check becomes a result.
5. **No alert spam.** Alert on a confirmed change of state, remind rarely, and say once when it works
   again.
6. **The administrator decides.** Who is alerted, which checks run and how often are settings,
   changed in the app, per environment, and audited.

## 2. What to check

| Kind                      | Example probe                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Database                  | a ping or `hello`; the topology the service needs (e.g. a replica set for transactions)                               |
| Email (SMTP)              | connect, TLS and log in, then quit; **nothing is sent**                                                               |
| Billing system            | one authenticated read that proves the token, plus the configuration the service needs (prices linked, taxes present) |
| Partner APIs              | a public or cheap authenticated endpoint that returns no personal data, or the last result of the sync that uses it   |
| Paid or rate-limited APIs | the cheapest call that proves the credentials; never one counted in a user-facing quota                               |
| Each scheduled job        | its last successful run is not older than its interval × 1.5 + 15 minutes                                             |

- For jobs, the job runner records `{ jobName, lastSuccessAt, lastDurationMs, lastFailureAt }` after
  each run. This is bookkeeping only: a failed write never changes the job's result.
- Don't check what is fire-and-forget by design (error tracking).
- When a partner endpoint returns personal data or every read is logged by the partner, don't probe
  it. Judge it by the last result of the real sync instead.

## 3. The check result

Each check is one small module in a registry, and returns:

```text
{ status: "ok" | "degraded" | "failing" | "not_configured",
  code:   stable snake_case reason ("smtp_auth_failed", "billing_prices_not_linked", "job_stale"),
  detail: short technical hint (an HTTP status, a network error code) - never a secret or personal data }
```

The runner adds `latencyMs`.

| Status           | Meaning                                                     | Alerted |
| ---------------- | ----------------------------------------------------------- | ------- |
| `ok`             | works                                                       | no      |
| `degraded`       | works, but something secondary is wrong (shown on the page) | no      |
| `failing`        | users are or will be affected                               | yes     |
| `not_configured` | this environment doesn't use the dependency                 | never   |

- **Running the checks:**
  - checks run **concurrently**, each with a timeout (e.g. 10 s);
  - a timeout becomes `failing` / `check_timeout`;
  - a throw or a malformed result becomes `failing` / `check_error`.
- **Codes** are stable once shipped. The page and the alerts translate them into a plain sentence
  that says what to do.

## 4. The job and the stored state

- **A scheduled job ticks every 5 minutes**, under a database lock so only one instance runs it. It
  runs every enabled check whose own interval has passed since its last run.
- **State is one document per check:**

  ```text
  { checkName, group, status, code, detail, latencyMs,
    since,               // when the current status started
    lastCheckedAt, lastOkAt, consecutiveFailures, alertedAt }
  ```

  Checks that no longer exist are removed. History is not kept here; logs and alerts hold it.

- **Every status change is logged** (failing at `error`, the rest at `warn`) with `checkName`, `code`,
  `previousStatus`, `status` and `detail`, following the logging standard.

## 5. Settings (per check, per environment)

| Setting           | Values                                 | Default                                                                                     |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `enabled`         | on / off                               | `SERVICE_HEALTH_DEFAULT_ENABLED`: on in production, off elsewhere when unset                |
| `intervalMinutes` | 5, 10, 15, 30, 60, 180, 360, 720, 1440 | 10 for what costs nothing outside the service (database, email, jobs); 60 for external APIs |

- **Storage:** settings are stored in the environment's own database, so each environment is
  configured on its own page. A missing setting means the default.
- **A disabled check** never runs (not even on "Check now") and never alerts. Its last state stays
  visible but no longer counts as failing.
- **Switching a check off** clears its failure streak and any open alert.
- **Changes are audited** (old and new values) and take effect on the next tick.
- Other defaults in config: `SERVICE_HEALTH_FAILURES_BEFORE_ALERT` (2),
  `SERVICE_HEALTH_RENOTIFY_HOURS` (24), `SERVICE_HEALTH_JOB_STALE_FACTOR` (1.5),
  `SERVICE_HEALTH_CHECK_TIMEOUT_MS` (10000).

## 6. Alerts

- **Failing** is announced after **2 failing runs in a row**, which absorbs blips. While it stays
  failing it is re-announced at most **once every 24 hours**.
- **Recovered** is announced once, when an announced check is `ok` or `degraded` again. A check that
  becomes `not_configured` or is switched off is cleared silently.
- **One message per run** lists every check it is about, so an outage of several services is a
  single alert.
- **Channels: in-app and email.** The in-app notification is written before any email is attempted,
  so an email outage is still announced in the app. A delivery failure is logged and never fails the
  run.
- **Order:** the alert state is saved before sending, so a crash in between loses one alert rather
  than repeating it.
- **Content:** what failed, since when and what to do. Never secrets, tokens or personal data.

## 7. Permissions

Separate permissions, held by the top administrator and granted to others individually; none of them
in any default role:

| Permission              | Allows                                        |
| ----------------------- | --------------------------------------------- |
| `service_health.read`   | see the page and run "Check now"              |
| `service_health.notify` | be alerted (in-app and email)                 |
| `service_health.manage` | change the settings (on/off, interval, reset) |

Watching, being woken up and changing the settings are three different choices, so they are three
permissions.

## 8. API and page

- `GET /admin/service-health` returns every check with its settings and state, and in the meta:
  - the last run, and when "Check now" is next allowed;
  - which dependencies are configured in this environment;
  - the allowed intervals, the alert rules, and whether the caller may manage.
- `POST /admin/service-health/run` runs every enabled check now, under the job lock and with the same
  alert rules:
  - at most once a minute, whoever asks: `429` with `retryAfterSeconds`;
  - `409` while a run is in progress.
- `PATCH /admin/service-health/settings/:checkName` `{ enabled?, intervalMinutes? }`, and `DELETE`
  on the same path for "Reset to default".
- **Admin page:**
  - checks grouped (Infrastructure, Integrations, Scheduled jobs), each with:
    - its status badge and the plain-language reason;
    - since, last checked, last OK, response time;
    - for managers, its switch and interval;
  - a menu badge with the number of failing checks;
  - the page refreshes every minute.

## 9. Testing

- **Unit tests per check**, with the dependency mocked: ok, every failing code, timeout, throw.
- **Alert rules:** the second failing run alerts, a blip doesn't, the 24 h reminder works, recovery
  is announced once, and a disabled check is silent.
- **End-to-end, with stubbed partners:**
  - make a stub fail, run the job twice;
  - check the alert reaches a holder of `notify` and not a reader without it;
  - fix the stub, check the single recovery.
- **No test or script calls a real partner.**

## 10. Health endpoints and Prometheus

Every service exposes, besides its admin page:

**Health endpoints** (public, cheap, no internal detail in the answer):

| Endpoint           | Checks                                | Answers                                             |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| `GET /health/live` | nothing (the process answers)         | `200 { status: "alive" }`                           |
| `GET /health`      | the process and its own database only | `200` ready, `503` when the database is unreachable |

They serve the Kubernetes probes and external uptime monitoring. They never include the external
dependencies (see "What this is not").

**`GET /metrics`** in Prometheus format, protected (an operations token or network policy, never
public). Besides the usual HTTP metrics, it exports the **stored** result of the checks:

| Metric                                                       | Value                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `service_health_check_status{check, group, state}`           | `0` ok, `1` degraded, `2` failing, `-1` disabled, not configured or not checked yet; `state` names it |
| `service_health_check_last_checked_timestamp_seconds{check}` | when the check last ran                                                                               |
| `service_health_check_latency_seconds{check}`                | its last response time                                                                                |
| `service_health_check_consecutive_failures{check}`           | failures in a row                                                                                     |
| `job_last_success_timestamp_seconds{job}`                    | last successful run of each scheduled job                                                             |
| `job_last_failure_timestamp_seconds{job}`                    | last failed run                                                                                       |

Rules:

- **A scrape never runs a check** or calls a partner. It reads the stored state, cached for about
  15 seconds, so Prometheus can scrape as often as it likes without spending paid calls.
- **Only enabled checks produce new results.** A disabled or unused check is still listed, with
  `-1`, so a series never silently disappears and a dashboard shows it is off on purpose.
- If the state can't be read, the scrape still answers with the other metrics and increments
  `service_health_metrics_read_errors_total`.
- One series per check: labels stay bounded, never ids or messages.

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

- **A monitor outside the service's infrastructure** (a hosted uptime service, or a monitor on
  another provider and another network), never on the same server or cluster.
- **It probes the public URLs** a user reaches, through the real DNS, TLS and edge proxy:
  - the API's readiness endpoint (`GET /health`, section 10), expecting `200`;
  - the frontend's entry page, expecting `200` and a known piece of content.
- **Every 1 to 5 minutes**, from at least two locations, alerting after 2 failed probes in a row
  (to absorb a single network blip).
- **It also watches the TLS certificate** (alert at least 14 days before expiry) and, where the
  service tool allows it, the domain's expiry.
- **Alerts go to people, by a channel that doesn't depend on the service**: email and/or a phone
  push or SMS to the on-call people, never only to the app's own notifications.
- **Dead-man's switches** for what runs outside the service (backups, the external scheduler, if
  any): the job pings the monitor on success, and the monitor alerts when the ping does not arrive.
- **Staging should have it too**, with alerts to the team channel only.
- The monitor's configuration (URLs, intervals, who is alerted) is written in the project's
  deployment docs, and a test alert is sent once when it is set up.

## 12. Running on Kubernetes

- The job runs inside the API pods, guarded by the database lock, or as a CronJob; either way, once
  per tick across all replicas.
- Readiness stays limited to the process and its database (section 10).
- The state lives in the database, so every replica shows the same page.

> **Reference implementation (Node/React).** The checks are modules in a registry under
> `services/service-health/`; the tick is a `node-cron` job in the API process under a MongoDB
> lock (`database/job-lock.js`), which also records `job_runs` for every job; settings and state are
> collections (`service_health_settings`, `service_health`); metrics with `prom-client`; SMTP checked
> with the mailer's `verify()` (connect, TLS, login, no message). External uptime: a hosted monitor
> (e.g. an Uptime Kuma instance on another provider, or a hosted service) on `/api/v1/health` and the
> SPA's `/`, plus a healthchecks-style ping URL for the backup job.

## 13. Checklist

- [ ] Every external dependency and every scheduled job has a check in the registry.
- [ ] Checks return the result of section 3, run concurrently with a timeout, never throw, and never touch personal data or create anything.
- [ ] Configuration problems that block users are `failing` checks.
- [ ] Jobs record their last success; stale or never-run jobs fail.
- [ ] A 5-minute job under a lock runs the enabled checks whose interval has passed; the state is stored per check.
- [ ] Settings per check and per environment (on/off, interval), defaults from config (on only in production), audited changes.
- [ ] Alerts after 2 failures, reminders every 24 h at most, one recovery message, one message per run, in-app before email.
- [ ] Three permissions (`read`, `notify`, `manage`), none in default roles.
- [ ] Admin page with the checks, the reasons, the settings and a "Check now" limited to once a minute; a menu badge.
- [ ] `/health/live` and `/health` (process + own database only), public and without detail; no external dependency can make the service unready.
- [ ] `/metrics` (protected) exports the stored check state and job timestamps of section 10; a scrape never runs a check; disabled checks are listed with `-1`.
- [ ] Tests of section 9; no real partner called in tests.
- [ ] Production: an external uptime monitor outside the service's infrastructure probes the public API and frontend URLs and the TLS certificate, alerts people by a channel independent of the service, and dead-man's switches watch the backups (section 11).
