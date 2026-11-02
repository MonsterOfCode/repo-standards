# Commit checks standard

**Version:** 1.1 (2026-11-02). **For:** every project of ours, backend and frontend. **Audience:** the developer, or the AI agent,
setting up or reviewing a project's git hooks and CI checks.

**Changes in 1.1:** the rules name the `checks` and `verify` commands generically; the npm, husky,
Prettier, ESLint and commitlint specifics are marked as the reference implementation (Node/React).

Every commit must pass the same fast checks, every push the full test gate, and every commit
message the same format, locally and again in CI. This standard lists the checks, says what each
must verify, and provides reference scripts and configuration in this repository.

**If you are an agent implementing this in a project:**

1. Read the whole standard first, then look at the project's package scripts, existing check
   scripts, git hooks (husky or `.git/hooks`), CI workflow and `.env.example`.
2. Copy the reference scripts that apply (`scripts/node-backend/`, `scripts/react-frontend/`) and
   the configuration (`config/`), and adapt the paths at the top of each file to the project. The
   reference scripts come from a Node/Express/MongoDB API and a React/Vite/Tailwind SPA; keep their
   **rules**, rewrite their plumbing if the stack differs.
3. Run every check, **fix what it finds in the project** (don't loosen the check), and add tests
   for the check logic so it counts in the 100% coverage gate (see the testing standard).
4. Finish with the checklist in section 8, and report every problem found and fixed.

The key words **must**, **must not** and **should** mean what they say.

The rules are stack-agnostic. Lines marked **Reference (Node/React)** point to the reference
implementation in this repository (npm scripts, husky hooks, Prettier, ESLint, commitlint, Node
check scripts); a project on another stack keeps the rule and uses its own tools. In this standard,
`checks` is the project's command that runs every fast check, and `verify` the one that runs the
checks plus the tests with coverage (plus the build); in the reference they are `npm run checks`
and `npm run verify`.

## 1. Prerequisites on every developer machine

| Tool                                                   | Why                                                                                           | Install                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| the project's runtime (e.g. Node.js, its version)      | runs the checks                                                                               | per project                                            |
| [gitleaks](https://github.com/gitleaks/gitleaks) 8.19+ | scans the staged changes for secrets; **the pre-commit hook refuses every commit without it** | `brew install gitleaks`, check with `gitleaks version` |

- The project's `README`/setup document lists gitleaks as a prerequisite, and the hook's error
  message says how to install it. A missing tool must never be skipped silently.
- Installing the project's dependencies activates the hooks. No manual step.
  Reference (Node/React): husky, activated by the `prepare` script on `npm install`.

## 2. Hooks

| Hook         | Runs                                                                                                     | Target time |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------- |
| `pre-commit` | gitleaks on the staged changes, then `checks` (every fast check of sections 3–5)                         | < 30 s      |
| `commit-msg` | the commit message check (section 6)                                                                     | < 1 s       |
| `pre-push`   | `verify`: the checks, then the tests with 100% coverage (testing standard), and the build for a frontend | minutes     |

- `checks` runs every fast check, and `verify` runs checks plus tests (plus build).
- **CI runs `verify`** on every push and pull request, the commit message check on the pushed
  commits, and gitleaks on the whole history ([CI/CD standard](ci-cd.md)).
- Hooks are never bypassed (`--no-verify`). A failing hook is fixed, or the check is fixed if it is
  wrong, in its own commit.

Reference (Node/React): hooks in `config/husky/node-backend/` and `config/husky/react-frontend/`.

## 3. Checks for every project

### 3.1 Formatting and lint

- The stack's formatter in check mode, with no difference.
- The linter with **zero warnings**.
- Committed docs, JSON and config files are formatted too.

Reference (Node/React): `prettier --check .` and `eslint . --max-warnings 0`.

### 3.2 Architecture

`check:architecture`: the layer rules of the architecture standard (ARCH-B1–B7 for a backend,
ARCH-F1–F7 for a frontend), checked by a dependency tool, with no violation.

Reference (Node/React): dependency-cruiser with `config/dependency-cruiser/`.

### 3.3 Translations

Each layer checks **its own** locales: the backend's languages against each other, and the
frontend's against each other. There is no comparison between backend and frontend.

- Every locale has exactly the same keys as the reference locale (missing and extra keys listed per
  file).
- For **each key**, the interpolation variables (`{{name}}`, nested `$t(...)`) are the same in every
  language of that layer. A nested key must exist.
- Plural families (`_one`/`_other`...) exist together in every language. A language whose "one"
  means exactly 1 may drop `{{count}}` from its `_one` form.
- No empty or non-string values.
- Language rules: Swiss Standard German never uses "ß".
- **Frontend:** every key used in the code exists, and every key in the reference locale is used.
  Keys only the API sends are an explicit, commented allow-list.

Reference (Node/React): `scripts/node-backend/check-locales.js` + `checks/locale-check.js`,
`scripts/react-frontend/check-translations.mjs` + `lib/translations.mjs`.

### 3.4 Secrets

`gitleaks git --pre-commit --staged --redact` with the project's `.gitleaks.toml`, which extends the
default rules. Its allow-list only covers values that are fake by design, such as test fixtures.
A real secret is never allow-listed: rotate it and rewrite history.

Reference (Node/React): `config/gitleaks.toml`.

### 3.5 `.env.example` parity

- Every environment variable the code reads is in `.env.example` (commented, with a safe default or
  placeholder, **never a real value**).
- Every variable in `.env.example` is read by the code.
- Deployment env examples only name known variables.
- Variables read outside the config module (scripts, Docker) are an explicit, commented allow-list.

Reference (Node/React): `scripts/node-backend/check-env-example.js`, `scripts/react-frontend/check-env-example.mjs`.

## 4. Backend checks

### 4.1 Email templates

**When templates are files,** every template has an HTML and a plain-text version (`x.html` +
`x.txt`), and both use the same variables.

**When emails are built in code from translations,** keep a catalogue of every email builder with
sample values, and for every builder and every language:

- build the message: subject, HTML and text are non-empty;
- no unresolved `{{...}}`, `undefined`, `null`, `NaN` or `[object Object]` in any of them;
- every translation key the email used exists in every locale;
- an exported builder missing from the catalogue fails the check.

Reference (Node/React): `scripts/node-backend/check-emails.js` + `checks/email-check.js`.

### 4.2 Migrations: final state before production, changes only after

- **Before the first production release, one migration per collection, in its final state**: the
  collection, its validator, every index and the system data the app needs (roles, plans...). There
  is no migration that only adds an index or converts data: an index or a schema change edits that
  collection's migration, and every deployed non-production database is reset (or re-runs it, which
  is why migrations are idempotent). A project that has not reached production never carries a
  history of changes.
- **Migrations that change something come only after production**, once the database can no longer
  be rebuilt: then a change is a new migration, and the released ones are locked (below).
- A test runs every migration on an empty database and checks the result.

**Immutability once in production:**

Migrations are an append-only log **once they run in production**: an environment that already ran
a migration never runs its new version, so editing it makes environments silently diverge.

- `migrations.lock.json` maps each migration released to production to the SHA-256 of its content.
  The `migrations:lock` command (reference: `npm run migrations:lock`) writes it. It is run and
  committed as part of preparing a production release.
- The check fails when a locked migration was modified, renamed or deleted, or when the lock lists a
  file that doesn't exist.
- The production release pipeline runs the check in release mode: every migration of the released
  commit must be in the lock, with the right hash. Otherwise the release stops.
- **Before the first production release,** the lock is empty and migrations may be edited, provided
  every deployed non-production database is reset or re-run.
- A change to a released migration goes into a **new** migration file.
- The migration contract is also checked: file naming with a timestamp, `up`/`down` exported,
  self-contained (no app imports).

Reference (Node/React): `scripts/node-backend/check-migrations-lock.js` + `checks/migrations-lock.js`,
`check-migration-contract.js`.

### 4.3 Route documentation (OpenAPI)

- Every router that defines routes exports its docs (`apiDocs`).
- **Route by route, both directions:** every route (method + path) has a doc entry, and every doc
  entry matches a route. A route documented by two routers is an error.
- The aggregated OpenAPI document builds. Every operation has a unique `operationId` and at least
  one 2xx/3xx response.
- Routers that intentionally have no docs (the docs router itself, test-only hooks) are an explicit
  allow-list.

Reference (Node/React): `scripts/node-backend/check-route-docs.js` + `checks/route-docs-check.js`.

## 5. Frontend checks

### 5.1 CSS class prefix and usage

Every CSS class **we define** carries the application's unique prefix (`acme-` for an app called Acme,
`ledger-` for one called Ledger...), so our classes never collide with a framework's and can be found and removed safely.

- **Defined classes:** every class in our `.css` selectors and every Tailwind `@utility` starts with
  the prefix.
- **Used:** every class we define is used somewhere in the app (className strings and template
  literals, `cn`/`clsx`/`cva` arguments, `classList`, selectors in `querySelector`/`closest`/test
  locators, `@apply`). A class built with `${}` is a pattern that must match a defined class.
- **Defined when used:** every prefixed class used in the code or the tests is defined.
- **Out of scope:**
  - framework classes (Tailwind utilities such as `flex` or `px-4`, and the `dark` variant);
  - classes rendered by a third-party library and restyled by our CSS, such as Leaflet maps
    (`leaflet-*`) or Recharts charts (`recharts-*`, e.g. `.recharts-wrapper`). They keep the library's
    name: renaming one to our prefix would stop it matching. List the library's prefix in the check
    (`FOREIGN_CLASS_PREFIXES`) with a comment saying which library and where it is used;
  - intentional overrides of a framework built-in (proved by compiling the framework's own CSS).

  All of these are an explicit, commented allow-list.

When the check finds an unprefixed class, its message says how to fix it: rename **our** class to
the prefix, or, if the class belongs to a library, add the library's prefix to the allow-list.

Reference (Node/React): `scripts/react-frontend/check-css.mjs` + `lib/css-classes.mjs` (prefix through
`CSS_CLASS_PREFIX` or the constant at the top; library prefixes in `FOREIGN_CLASS_PREFIXES`).

## 6. Commit messages

```text
type(scope)?: (#<issue> )?subject

feat: #12 add the billing prices page
fix(billing): #42 round the VAT per line
docs: describe the release steps
```

- **type:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`,
  `revert`.
- **scope:** optional, lowercase kebab-case.
- **`#<issue>`:** the issue the commit belongs to, **right after `: `, whenever one exists**. GitHub
  and GitLab link it automatically. To close the issue on merge, add `Closes #42` in the body.
- **subject:** not empty, no trailing period. The whole header is at most 100 characters.
- **Body and footers are free**, e.g. `Co-Authored-By: ...`.
- **Rejected:** `wip`, `Feat: x`, `feat:#1 x`, `feat(Billing): x`, `feat: x.`, `feat: #12` (issue
  with no subject).

Reference (Node/React): commitlint with `config/commitlint.config.js` (self-contained;
`npm i -D @commitlint/cli`).

## 7. Scripts: how they behave

- One command per check, `check:<name>`, and `checks` to run them all (reference: `npm run check:<name>`).
- Each prints `✓ <what> ok` when it passes. Otherwise it lists every problem (file, key or class,
  and what is wrong) and exits 1.
- The check logic lives in a module covered by the test suite, tested on fixtures and on the real
  project; the command-line script is a thin wrapper.
- A check never reads a developer's `.env` or calls a network service.

## 8. Checklist

- [ ] gitleaks is a documented prerequisite, and the hook's error says how to install it.
- [ ] Installing the dependencies activates the hooks: pre-commit (gitleaks + checks), commit-msg (message check), pre-push (verify).
- [ ] `checks` and `verify` exist, and CI runs `verify`, the message check on the pushed commits and gitleaks on the history.
- [ ] Formatting and lint: no differences, zero warnings.
- [ ] Architecture: `check:architecture` with no violation.
- [ ] Translations: same keys, same variables per key, plural families, no empty values, language rules; frontend: used and unused keys.
- [ ] `.env.example` parity in both directions; deployment examples name only known variables.
- [ ] Backend: email templates (files in both formats, or a catalogue built in every language).
- [ ] Backend: before production, one final-state migration per collection (no index-only or conversion migrations); migration lock; the production release refuses an incomplete lock; migration contract.
- [ ] Backend: route docs route by route in both directions; the OpenAPI document builds with unique operationIds.
- [ ] Frontend: every class we define has the app prefix and is used; every prefixed class used is defined.
- [ ] Commit messages follow section 6.
- [ ] Every check has tests on fixtures; every problem the checks found in the project is fixed.
