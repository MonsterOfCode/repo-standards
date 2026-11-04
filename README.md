# Engineering standards

The standards every one of our projects follows, so that architecture, APIs, security, privacy,
agent setup, audit trails, logs, monitoring, tests, the checks run on every commit and the way code
is released work the same way everywhere.

Each standard is written for the developer **or the AI agent** implementing it in a project: it
opens with instructions for the agent, says what is contract (must be identical in every project)
and what is free to adapt to the stack, and ends with a checklist. The rules are stack-agnostic;
what is specific to our reference stack (Node/Express/MongoDB and React/Vite) is marked
"Reference implementation (Node/React)". Hand the file to the agent and ask it to implement the
standard in your project and confirm every checklist item.

| Standard                                      | Version | What it covers                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Architecture](standards/architecture.md)     | 1.2     | layer-first folders by default (feature folders by recorded decision), layers and their dependencies (checked on every commit), background jobs, input validation and the 422 format, bot traps, accessibility (WCAG 2.2 AA), naming, code rules, anti-patterns |
| [API](standards/api.md)                       | 1.1     | resource naming, methods and status codes, the body envelope, pagination, filters, sorting, search, field shaping, idempotency, concurrency, versioning, types, OpenAPI                                                                                         |
| [Partner API](standards/partner-api.md)       | 1.0     | server-to-server APIs with outside organisations: scoped keys with rotation overlap, IP allow-lists, request signing, per-subject queries and minimisation, data-free signed webhooks; how we call partner APIs and how we choose them                          |
| [Security](standards/security.md)             | 1.1     | authentication and sessions, authorization, input and output, secrets, transport and headers, rate limits, supply chain, security logging, backups, incident response, periodic review, PWA and mobile clients                                                  |
| [Privacy](standards/privacy.md)               | 1.1     | data classification and register, minimisation, retention, the rights of the person, erasure that survives a backup restore, consent, access to sensitive data, breach notification, sub-processors, DPIA                                                       |
| [Agents](standards/agents.md)                 | 1.2     | the files every repository has for AI agents (`AGENTS.md`, `STATUS.md`, decision log, skills), how an agent works in it, and agents as a security boundary                                                                                                      |
| [Audit log](standards/audit-log.md)           | 1.2     | rule IDs; who did what, when, to what, and who saw what: two layers, privacy rules, retention, alerts, tamper resistance                                                                                                                                        |
| [Application logging](standards/logging.md)   | 1.2     | rule IDs; JSON events on stdout, base fields, access event, redaction, Kubernetes                                                                                                                                                                               |
| [Service health](standards/service-health.md) | 1.2     | rule IDs; checks of every dependency and job, background-job rules, failure alerts, settings, health endpoints, Prometheus metrics, required external uptime monitoring                                                                                         |
| [Testing](standards/testing.md)               | 1.2     | rule IDs; 100% coverage gate in the pipeline, what to test, determinism, isolation, exclusions, optional mutation testing                                                                                                                                       |
| [Commit checks](standards/commit-checks.md)   | 1.2     | rule IDs; what every commit and push must pass: format, lint, translations, emails, migrations, route docs, CSS, env, secrets, commit messages                                                                                                                  |
| [CI/CD](standards/ci-cd.md)                   | 1.0     | branches, environments, pipeline stages and gates, images by commit, promotion to production, migrations, rollback, feature flags, ops log, who releases                                                                                                        |

Reference scripts and configuration live in [`scripts/`](scripts/) and [`config/`](config/): copy
them into a project and adjust the paths at the top of each file. [`templates/`](templates/) holds
the agent files of a repository (`AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `decisions.md`) and the
verify, decision, handoff, review (one change) and audit (a whole project) skills.

## Starting a new project

1. Copy the templates of [`templates/`](templates/) and fill them with what is true for the project
   (agents standard).
2. Lay out the folders (architecture standard: by layer, unless a decision says by feature) and add
   the architecture check.
3. Add the commit checks and hooks and the 100% coverage gate (commit-checks and testing standards).
4. Set up the pipeline and the environments (CI/CD standard) before the first feature, so every
   change goes through it from day one.
5. Write the data register and decide retention and legal bases (privacy standard), then build
   authentication, authorization and the security baseline (security standard).
6. Design every endpoint to the API standard, and every API for outside organisations to the partner
   API standard (also used to choose the partner APIs we consume).
7. Add logging, the audit log and service health (with the external uptime monitor) before the first
   production release.
8. List in `AGENTS.md` the standards followed, with their versions; before go-live, run every
   checklist again (and the security review: ASVS level 2 and a penetration test).

Each standard opens with instructions for an agent and ends with a checklist: hand an agent the
standard and ask it to apply it and confirm every item.

## Auditing an existing project

To check a project that already exists against these standards, give an agent the
[audit skill](templates/skills/audit/SKILL.md) (or paste it as the prompt) and point it at this
repository. It goes through every standard that applies, rule by rule, and reports for each rule
whether it is met, partly met, not met, an exception recorded in the project's decisions, not
applicable, or outside what the repository shows, with the evidence and the fix. It looks every rule
up by its ID in the project's decision log and reports a recorded exception as `exception (D<n>)`,
flagging one whose review date has passed; it reports conventions in their own group, never counted
with the security, privacy and reliability gaps. It changes nothing.

Example prompt: _"Audit this project against the standards in
https://github.com/MonsterOfCode/repo-standards, following its `templates/skills/audit/SKILL.md`.
Report only; change nothing."_

## Conventions

Most rules are risk controls: breaking one opens a security, privacy or reliability gap. A few are
consistency choices (the status code of a validation failure, the shape of a body, the casing of a
field, the folder layout, file naming). Either would work; what matters is that every project makes
the same choice.

A rule marked _(convention)_ is a consistency choice, not a risk control. It applies to every new
project; an existing project may keep its own documented convention instead, through a
decision-log entry (see "Exceptions and adaptations"), and an audit reports conventions apart from
security, privacy and reliability gaps.

## Exceptions and adaptations

A project that does not apply a rule, applies it differently, or keeps its own convention instead,
records it in its decision log as one entry (template:
[`templates/decisions.md`](templates/decisions.md)). One entry may cover several rules.

- **Title:** `D<n> — Exception: <rule IDs> <short>`, for example
  `D41 — Exception: API-B1 API-L2 legacy list format`.
- **Rules:** the rule IDs, one or more.
- **Verdict:** `exception` (not applied), `adapted` (applied differently) or `convention kept` (the
  project keeps its own convention).
- **Reason:** why.
- **Compensating control:** what replaces the risk control, or "none needed - convention".
- **Review date:** when it is looked at again; a `convention kept` may say "none".
- **Owner:** who decided and answers for it.

An exception is valid only when it is recorded this way. An audit looks each rule up by its ID in
the decision log and reports it as `exception (D<n>)` instead of "not met"; an entry whose review
date has passed is reported as expired, to be renewed or fixed.

## Versions

Each standard carries a version and a date at the top; a changed standard says what changed in a
"Changes in x.y" line under it. A project lists, in its `AGENTS.md`, the version of each standard it
follows and its exceptions (each one a decision in its log, in the format above). Rules have IDs
(`ARCH-B2`, `AG-7`, `SEC-A6`, `API-L4`, `PAPI-K4`, `CI-13`, `PRIV-14`) so a review can cite exactly
the rule it applies; an ID is never reused for a different rule.

- A minor version (1.0 → 1.1) adds rules, relaxes a rule, or clarifies; a project moves to it at its
  own pace.
- A major version (1.x → 2.0) changes a contract (a body format, a config name); a project moving to
  it plans the migration as its own work.

## Changing a standard

A standard changes through a pull request to this repository. When it changes, each project
updates itself and says in its own decision log which version it follows. A project that cannot
follow a rule records the exception in its decision log, in the format of "Exceptions and
adaptations".
