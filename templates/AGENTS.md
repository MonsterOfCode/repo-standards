<!--
Template of the agents standard (standards/agents.md, section 3). Replace every <...> with what is
true for the project, delete what does not apply, and delete this comment. Keep it under ~300 lines.
-->

# <Project> — agent guide

## What this project is

<One paragraph: the product, who uses it, what it is built with, what data is sensitive and why
(personal data, health data, payments).>

## Read first

1. [`STATUS.md`](STATUS.md) — the current state: work in flight, open questions, environment notes.
2. [`docs/decisions.md`](docs/decisions.md) — why things are the way they are. Search it for the topic
   you touch (`grep -n -i '<keyword>' docs/decisions.md`) before designing anything.
3. <The document that answers "what must the product do", e.g. `docs/reference/business-logic.md`.>

## Hard rules — never break these

1. **Never `git commit`, `git add` or `git push`** unless asked in the current conversation.
   Permission for one commit is not permission for the next, nor for a push or a release.
2. **Never print a secret** (in chat, logs, commands or files): refer to it by its variable name.
3. **Only the project's own local and test databases and services.** <Name them: container, port,
   database. Name what must never be touched.>
4. **Never run anything against production.** <Who decides releases and how.>
5. <Project-specific rules, each with its reason: a protected account, a legacy system that is
   read-only, a partner that must never be called from tests...>

## How to work

- **Investigate before building**: search for the permission, schema, route, component or migration
  before writing new plumbing, and read the decisions on the topic.
- **Follow the existing pattern**; when it is wrong, fix it everywhere, not in one place.
- **The backend is the authority** for permissions, visibility, validation and business math.
- **Verified means verified**: `npm run verify` passes, and for any UI change you looked at it in the
  browser (desktop and phone, light and dark). Report failures with their output.
- **Record decisions**: any non-obvious or cross-cutting choice gets the next D-number in
  `docs/decisions.md`; cite it in the code that enforces it.
- **Ask only for product or design decisions**; decide the rest and say what you decided.
- **Parallel sessions**: re-read a file right before editing it; never revert changes you did not make.
- **Update `STATUS.md`** after every task, before your final summary.

## Engineering standards

This project follows [repo-standards](https://github.com/MonsterOfCode/repo-standards):

| Standard       | Version | Exceptions (decision) |
| -------------- | ------- | --------------------- |
| Architecture   | 1.1     | <none / Dn>           |
| API            | 1.0     |                       |
| Security       | 1.0     |                       |
| Privacy        | 1.0     |                       |
| Agents         | 1.1     |                       |
| Testing        | 1.1     |                       |
| Commit checks  | 1.1     |                       |
| CI/CD          | 1.0     |                       |
| Logging        | 1.1     |                       |
| Audit log      | 1.1     |                       |
| Service health | 1.1     |                       |

## Architecture map

<The layer folders that exist (or the feature layout, if a decision chose feature folders), one line
each, and one current example per kind of change:>

```text
src/
  config/       the only reader of environment variables       e.g. config/config.js
  routers/      HTTP: validate, authorize, call one service     e.g. routers/<domain>-router.js
  services/     use cases, transactions, audit                  e.g. services/<domain>-service.js
  domain/       pure business rules                             e.g. domain/<rule>.js
  policies/     authorization                                   e.g. policies/<domain>-policy.js
  models/       one file per collection                         e.g. models/<area>/<entity>.js
  adapters/     one client per external service                 e.g. adapters/<service>-adapter.js
  jobs/         scheduled jobs                                  e.g. jobs/<name>-job.js
```

Layer rules: `npm run check:architecture` (architecture standard, ARCH-B1–B7 / ARCH-F1–F7).

## Commands

```bash
npm install            # also installs the git hooks
npm run dev            # <port>
npm run checks         # fast checks (pre-commit): format, lint, architecture, translations, ...
npm run verify         # checks + tests at 100% coverage (+ build): must pass before a task is done
npm run test:e2e       # <end-to-end tests, and the database they use>
npm run migrate        # <migrations, and on which database>
```

## Local environment

| What     | Where                        |
| -------- | ---------------------------- |
| API      | <http://localhost:port>      |
| Database | <container, port, database>  |
| Email    | <mail catcher URL>           |
| Accounts | <how to get a local account> |

## Where things are

- `docs/decisions.md` — the decision log.
- <`docs/...` — what each document answers.>
