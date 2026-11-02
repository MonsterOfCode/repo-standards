# CI/CD standard

**Version:** 1.0 (2026-11-02). **For:** every project of ours that is deployed. **Audience:** the
developer, or the AI agent, setting up or reviewing a project's pipelines, environments and
releases.

Code reaches users through one path: a branch, a pipeline that proves it, an image built once, and a
promotion of that same image from environment to environment. Nothing is deployed by hand, nothing
is rebuilt between staging and production, and every manual action on a server is written down.
This standard defines the branches, the environments, the pipeline stages and their gates, the
release and rollback procedure, and who may do what.

The rules are stack-agnostic. Concrete tools are in the **Reference implementation (Node/React)**
callouts.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then read the project's pipeline files, deployment scripts and
   deployment docs before changing anything.
2. Never run a release, a deployment or a command on a server unless a person asked for it in the
   current conversation. Setting up the pipeline is not permission to use it.
3. Keep every gate; never add a way around one (a manual input that skips the tests, a deploy
   workflow callable from anywhere).
4. Finish with the checklist in section 11.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs `CI-n`.

## 1. Branches

- **CI-1 — Two long-lived branches.** `develop` is the integration branch; `main` is what may be
  released. Work happens on short-lived branches merged into `develop` through a pull request (or
  committed to `develop` directly in a one-person project, with the same hooks).
- **CI-2 — `main` only moves by merge from `develop`** (a pull request), never by a direct commit,
  except a hotfix that is merged back into `develop` the same day.
- **CI-3 — Both branches are protected:** no force push, no deletion, the pipeline green before a
  merge.
- Commit messages follow the commit-checks standard (section 6), so a release's changes can be read
  from its history.

## 2. Environments

| Environment  | Deploys                                                                       | Data                             | Access                          |
| ------------ | ----------------------------------------------------------------------------- | -------------------------------- | ------------------------------- |
| `develop`    | **automatically**, every push to `develop` that passes the pipeline           | synthetic, may be reset any time | team only (login gate), noindex |
| `staging`    | **on demand**: a release of the head of `main`, only if its pipeline is green | synthetic, resettable            | team only (login gate), noindex |
| `production` | **on demand**: a promotion of the exact image live on staging                 | real                             | public                          |

- **CI-4 — Production is a promotion, never a rebuild.** The image that ran on staging is the image
  that runs in production, identified by its commit. A production release can only take a commit
  that was successfully deployed to staging.
- **CI-5 — Environment-agnostic images.** One image per commit for every environment; everything
  that differs (URLs, keys, flags) is configuration given at start. A frontend whose build bakes in
  values reads them from a runtime config file instead, or, if it must be built per environment,
  builds every environment from the same commit in the same pipeline run (a decision).
- **CI-6 — Production data never leaves production.** Develop and staging hold synthetic data only.
  A copy of production data for a test is anonymised first, and is a decision.
- Other environments (a public demo, a preview per pull request) follow the same rules, and say which
  release they follow.

## 3. The pipeline

On every push and every pull request to `develop` or `main`, in this order; each stage needs the
previous ones green:

| Stage              | What                                                                                               | Fails on                         |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| Secrets            | secret scan of the whole history                                                                   | any finding not allow-listed     |
| Commit messages    | the format of the commit-checks standard, on the pushed commits                                    | a bad message                    |
| Checks and tests   | the project's `verify`: format, lint, architecture, contract checks, tests at 100% coverage, build | any error, coverage below 100%   |
| Dependency audit   | known vulnerabilities in production dependencies                                                   | high or critical                 |
| Deployment bundle  | lint of deploy scripts, validation of compose/manifests and proxy config                           | any error                        |
| Image              | build once, scan, push, tagged by commit                                                           | a fixable critical vulnerability |
| Deploy (`develop`) | only on a push to `develop`: deploy the image, then a smoke test                                   | the smoke test                   |

- **CI-7 — Every gate is required.** The image stage depends on every check before it; the deploy
  stages depend on the image. There is no input, label or commit message that skips a stage.
- **CI-8 — Images are tagged by commit** (`sha-<7 chars>`, plus the full SHA as a label), never
  `latest` alone, so what runs is always traceable to a commit and its pipeline.
- **CI-9 — The image scan** fails on a critical vulnerability that has a fix; the report is kept
  with the run. Base images are pinned and rebuilt regularly ([security standard](security.md),
  SEC-D4).
- **CI-10 — End-to-end before a release.** The slow suites (end-to-end against the real backend)
  run before a staging release, not necessarily on every push; a red suite stops the release
  (testing standard).
- The pipeline is fast enough to run on every push (target: under 15 minutes to an image); slow
  suites are moved to the release, never dropped.

> **Reference implementation (Node/React).** GitHub Actions: `ci.yml` (jobs `secrets` with the
> gitleaks image, `commits` with commitlint, `test` running `npm run verify`, `audit` with
> `npm audit --omit=dev --audit-level=high`, `deploy-bundle` with shellcheck, `docker compose config`
> and the proxy's validate command, `image` with `docker buildx`, Trivy and a push to the GitHub
> container registry as `sha-<7>`), all actions pinned by SHA, `permissions: contents: read` by
> default; `release.yml` started by hand (`workflow_dispatch`) with the environment as input;
> `deploy.yml` callable only from those two (`workflow_call`), so the gates cannot be skipped.

## 4. Releases

- **CI-11 — A release is a manual, recorded action** in the pipeline tool ("Release → staging",
  "Release → production"), never a command typed on a server. The run shows who started it, which
  commit and which image.
- **CI-12 — Staging takes the head of `main`**, refused unless the pipeline is green for that exact
  commit.
- **CI-13 — Production takes the commit live on staging** (or an earlier commit that was deployed to
  staging successfully, for a rollback). The pipeline reads the staging deployment history; a commit
  that never ran on staging is refused.
- **CI-14 — Release-only gates for production:** the migration lock is complete (commit-checks
  standard, section 4.2), and the required approval (section 8) is given.
- **CI-15 — One release at a time per environment.** Releases of the same environment are queued
  (pipeline concurrency and a lock on the server), never run in parallel. When a change spans
  several repositories, the one others depend on is released first (the API before the frontend).
- **CI-16 — Every deployment ends with a smoke check** from outside: the health endpoints answer,
  the frontend loads, non-production is still behind its gate and noindex.

## 5. Migrations

- **CI-17 — Migrations are a separate step**, run by the deployment **before** the new version
  starts, with the environment's own database user, never by the app at start-up. If they fail, the
  running version stays untouched and the deployment stops.
- **CI-18 — Backward-compatible for one release.** The previous version must keep working against
  the new schema, so an image rollback is always safe: expand (add) in one release, migrate the data,
  contract (remove) in a later release.
- Migrations are forward-only in production; the rollback of a release is a rollback of the image,
  never a `down` migration run by hand. Released migrations are immutable (commit-checks standard,
  section 4.2).
- A reset of a non-production database is a script, logged in the ops log; it refuses production.

## 6. Rollback

- **CI-19 — Rollback = redeploy the previous image** through the same release workflow (production
  with the commit of an earlier staged release). No hot-patching on the server.
- **CI-20 — Automatic rollback on a failed deployment.** When the new version doesn't become healthy
  within its deadline, the deployment script switches back to the previous image by itself and the
  run fails.
- A fix after a rollback goes through the whole path again (develop, main, staging, production).

## 7. Feature flags

- **CI-21 — Unfinished work ships dark** behind a flag rather than living on a long branch.
- Flags are configuration (ARCH-C1): a name, a safe default (off), listed in `.env.example`, read
  only by the config module, and, where the product needs it, per environment.
- A flag is removed (with its dead branch) once it is on everywhere (ARCH-C4). A flag never replaces
  a permission.

## 8. Secrets and access

- **CI-22 — Secrets per environment**, in the pipeline tool's environment secrets (or a secret
  store), never in the repository, never shared between production and the others; the deploy
  credentials of one environment can't deploy another.
- **CI-23 — Least privilege for the pipeline.** Each job has only the permissions it needs; the
  server account used by the pipeline can only run the deployment entry point (a forced command or
  an allow-listed wrapper), not a shell; SSH host keys are pinned.
- **CI-24 — Who may release production** is written in the deployment docs (by name or role).
  Production releases need that person's action or approval (a protected environment with required
  reviewers where the plan allows it; otherwise the manual run by an authorised person is the gate).
  Production cutovers (DNS, data migrations from a legacy system) are the product owner's call.

## 9. The ops log

- **CI-25 — Every manual action on a server is appended to an ops log** in the repository
  (`docs/deploy/<server>-ops-log.md`): date and time, who, which environment, the exact command or
  step (secrets referred to by name only), why, and the result. Package upgrades, firewall changes,
  restores, restore drills, database resets, secret rotations and incident steps included.
- The log is append-only: a wrong entry is corrected by a new one.
- A runbook (`docs/deploy/`) describes the servers, environments, bring-up order, backups, restore and
  upgrades; an action done often becomes a script.

## 10. Observability of releases

- Every running service reports its version (the commit) in its logs and health/metrics endpoints
  (logging standard, section 3), so an error is tied to a release.
- Error tracking receives the release and the environment.
- The external uptime monitor (service-health standard, section 11) watches every production URL.

## 11. Checklist

- [ ] `develop` and `main`, protected; `main` moves only by merge from `develop` (hotfixes merged back).
- [ ] Develop deploys automatically after a green pipeline; staging releases the head of `main` on demand; production promotes the image live on staging.
- [ ] One environment-agnostic image per commit, tagged by commit SHA; production never rebuilds.
- [ ] Pipeline stages: secret scan, commit messages, verify (100% coverage), dependency audit, deploy bundle, image build + scan; every gate required, none skippable.
- [ ] End-to-end suites pass before a staging release.
- [ ] Releases are manual runs in the pipeline tool, one at a time per environment, ending with an external smoke check.
- [ ] Migrations run as a separate step before the new version starts; backward-compatible for one release; production refuses an incomplete migration lock.
- [ ] Rollback is a redeploy of the previous image through the same workflow; a failed deployment rolls back by itself.
- [ ] Feature flags in config with safe defaults, removed once on everywhere.
- [ ] Secrets per environment; least-privilege pipeline and server account; who may release production is written down.
- [ ] Every manual server action is appended to the ops log; a runbook exists.
- [ ] Every service reports its release; the external uptime monitor watches production.
