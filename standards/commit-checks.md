# Commit checks standard

**Version:** 1.2 (2026-11-03). **For:** every project of ours, backend and frontend. **Audience:** the developer, or the AI agent,
setting up or reviewing a project's git hooks and CI checks.

**Changes in 1.2:** every rule has a stable ID (`CC-<area><n>`) and every checklist item cites the
rules it covers; the consistency choices (commit message format, CSS class prefix, check command
names) are marked _(convention)_; no rule's meaning changed.

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

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`CC-<area><n>`: `R` prerequisites, `H` hooks, `F` formatting and lint, `A` architecture, `L`
translations (locales), `S` secrets, `V` environment variables (`.env.example`), `E` email
templates, `D` database migrations, `O` route documentation (OpenAPI), `C` CSS classes, `M` commit
messages, `X` how check scripts behave. A rule marked _(convention)_ is a consistency choice, not a
risk control.

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

- **CC-R1 — gitleaks is a documented prerequisite.** The project's `README`/setup document lists
  gitleaks as a prerequisite, the pre-commit hook refuses every commit without it, and the hook's
  error message says how to install it. A missing tool must never be skipped silently.
- **CC-R2 — Installing the dependencies activates the hooks.** No manual step.
  Reference (Node/React): husky, activated by the `prepare` script on `npm install`.

## 2. Hooks

- **CC-H1 — Three hooks:**

  | Hook         | Runs                                                                                                     | Target time |
  | ------------ | -------------------------------------------------------------------------------------------------------- | ----------- |
  | `pre-commit` | gitleaks on the staged changes, then `checks` (every fast check of sections 3–5)                         | < 30 s      |
  | `commit-msg` | the commit message check (section 6)                                                                     | < 1 s       |
  | `pre-push`   | `verify`: the checks, then the tests with 100% coverage (testing standard), and the build for a frontend | minutes     |

- **CC-H2 — `checks` and `verify` exist.** `checks` runs every fast check, and `verify` runs checks
  plus tests (plus build).
- **CC-H3 — CI runs them again:** `verify` on every push and pull request, the commit message check
  on the pushed commits, and gitleaks on the whole history ([CI/CD standard](ci-cd.md)).
- **CC-H4 — Hooks are never bypassed** (`--no-verify`). A failing hook is fixed, or the check is
  fixed if it is wrong, in its own commit.

Reference (Node/React): hooks in `config/husky/node-backend/` and `config/husky/react-frontend/`.

## 3. Checks for every project

### 3.1 Formatting and lint

- **CC-F1 — Formatted, with no difference.** The stack's formatter in check mode, with no
  difference. Committed docs, JSON and config files are formatted too.
- **CC-F2 — Lint with zero warnings.**

Reference (Node/React): `prettier --check .` and `eslint . --max-warnings 0`.

### 3.2 Architecture

- **CC-A1 — `check:architecture` with no violation:** the layer rules of the architecture standard
  (ARCH-B1–B7 for a backend, ARCH-F1–F7 for a frontend), checked by a dependency tool.

Reference (Node/React): dependency-cruiser with `config/dependency-cruiser/`.

### 3.3 Translations

- **CC-L1 — Each layer checks its own locales:** the backend's languages against each other, and the
  frontend's against each other. There is no comparison between backend and frontend.
- **CC-L2 — Same keys.** Every locale has exactly the same keys as the reference locale (missing and
  extra keys listed per file).
- **CC-L3 — Same variables per key.** For **each key**, the interpolation variables (`{{name}}`,
  nested `$t(...)`) are the same in every language of that layer. A nested key must exist.
- **CC-L4 — Plural families together.** Plural families (`_one`/`_other`...) exist together in every
  language. A language whose "one" means exactly 1 may drop `{{count}}` from its `_one` form.
- **CC-L5 — No empty or non-string values.**
- **CC-L6 — Language rules:** Swiss Standard German never uses "ß".
- **CC-L7 — Frontend: used and defined.** Every key used in the code exists, and every key in the
  reference locale is used. Keys only the API sends are an explicit, commented allow-list.

Reference (Node/React): `scripts/node-backend/check-locales.js` + `checks/locale-check.js`,
`scripts/react-frontend/check-translations.mjs` + `lib/translations.mjs`.

### 3.4 Secrets

- **CC-S1 — Secret scan.** `gitleaks git --pre-commit --staged --redact` with the project's
  `.gitleaks.toml`, which extends the default rules. Its allow-list only covers values that are fake
  by design, such as test fixtures.
- **CC-S2 — A real secret is never allow-listed:** rotate it and rewrite history.

Reference (Node/React): `config/gitleaks.toml`.

### 3.5 `.env.example` parity

- **CC-V1 — Every variable read is in `.env.example`** (commented, with a safe default or
  placeholder, **never a real value**).
- **CC-V2 — Every variable in `.env.example` is read by the code.**
- **CC-V3 — Deployment env examples only name known variables.**
- **CC-V4 — Outside reads are allow-listed.** Variables read outside the config module (scripts,
  Docker) are an explicit, commented allow-list.

Reference (Node/React): `scripts/node-backend/check-env-example.js`, `scripts/react-frontend/check-env-example.mjs`.

## 4. Backend checks

### 4.1 Email templates

- **CC-E1 — Template files in both formats.** When templates are files, every template has an HTML
  and a plain-text version (`x.html` + `x.txt`), and both use the same variables.
- **CC-E2 — Code-built emails from a catalogue.** When emails are built in code from translations,
  keep a catalogue of every email builder with sample values, and for every builder and every
  language:
  - build the message: subject, HTML and text are non-empty;
  - no unresolved `{{...}}`, `undefined`, `null`, `NaN` or `[object Object]` in any of them;
  - every translation key the email used exists in every locale;
  - an exported builder missing from the catalogue fails the check.

Reference (Node/React): `scripts/node-backend/check-emails.js` + `checks/email-check.js`.

### 4.2 Migrations: final state before production, changes only after

- **CC-D1 — Before the first production release, one migration per collection, in its final
  state**: the collection, its validator, every index and the system data the app needs (roles,
  plans...). There is no migration that only adds an index or converts data: an index or a schema
  change edits that collection's migration, and every deployed non-production database is reset (or
  re-runs it, which is why migrations are idempotent). A project that has not reached production
  never carries a history of changes.
- **CC-D2 — Migrations that change something come only after production**, once the database can no
  longer be rebuilt: then a change is a new migration, and the released ones are locked (below).
- **CC-D3 — A test runs every migration** on an empty database and checks the result.

**Immutability once in production:**

Migrations are an append-only log **once they run in production**: an environment that already ran
a migration never runs its new version, so editing it makes environments silently diverge.

- **CC-D4 — A migration lock.** `migrations.lock.json` maps each migration released to production to
  the SHA-256 of its content. The `migrations:lock` command (reference: `npm run migrations:lock`)
  writes it. It is run and committed as part of preparing a production release.
- **CC-D5 — Locked migrations never change.** The check fails when a locked migration was modified,
  renamed or deleted, or when the lock lists a file that doesn't exist.
- **CC-D6 — The release refuses an incomplete lock.** The production release pipeline runs the check
  in release mode: every migration of the released commit must be in the lock, with the right hash.
  Otherwise the release stops.
- **CC-D7 — Empty lock before production.** Before the first production release, the lock is empty
  and migrations may be edited, provided every deployed non-production database is reset or re-run.
- **CC-D8 — A change to a released migration goes into a new migration file.**
- **CC-D9 — The migration contract** is also checked: file naming with a timestamp, `up`/`down`
  exported, self-contained (no app imports).

Reference (Node/React): `scripts/node-backend/check-migrations-lock.js` + `checks/migrations-lock.js`,
`check-migration-contract.js`.

### 4.3 Route documentation (OpenAPI)

- **CC-O1 — Every router that defines routes exports its docs** (`apiDocs`).
- **CC-O2 — Route by route, both directions:** every route (method + path) has a doc entry, and every
  doc entry matches a route. A route documented by two routers is an error.
- **CC-O3 — The OpenAPI document builds.** Every operation has a unique `operationId` and at least
  one 2xx/3xx response.
- **CC-O4 — Undocumented routers are allow-listed.** Routers that intentionally have no docs (the
  docs router itself, test-only hooks) are an explicit allow-list.

Reference (Node/React): `scripts/node-backend/check-route-docs.js` + `checks/route-docs-check.js`.

## 5. Frontend checks

### 5.1 CSS class prefix and usage

- **CC-C1 — Our classes carry the app prefix** _(convention)_. Every CSS class **we define** carries
  the application's unique prefix (`acme-` for an app called Acme, `ledger-` for one called
  Ledger...), so our classes never collide with a framework's and can be found and removed safely:
  every class in our `.css` selectors and every Tailwind `@utility` starts with the prefix. When the
  check finds an unprefixed class, its message says how to fix it: rename **our** class to the
  prefix, or, if the class belongs to a library, add the library's prefix to the allow-list
  (CC-C4).
- **CC-C2 — Every class we define is used** somewhere in the app (className strings and template
  literals, `cn`/`clsx`/`cva` arguments, `classList`, selectors in `querySelector`/`closest`/test
  locators, `@apply`). A class built with `${}` is a pattern that must match a defined class.
- **CC-C3 — Defined when used.** Every prefixed class used in the code or the tests is defined.
- **CC-C4 — Out of scope, as an explicit, commented allow-list:**
  - framework classes (Tailwind utilities such as `flex` or `px-4`, and the `dark` variant);
  - classes rendered by a third-party library and restyled by our CSS, such as Leaflet maps
    (`leaflet-*`) or Recharts charts (`recharts-*`, e.g. `.recharts-wrapper`). They keep the
    library's name: renaming one to our prefix would stop it matching. List the library's prefix in
    the check (`FOREIGN_CLASS_PREFIXES`) with a comment saying which library and where it is used;
  - intentional overrides of a framework built-in (proved by compiling the framework's own CSS).

Reference (Node/React): `scripts/react-frontend/check-css.mjs` + `lib/css-classes.mjs` (prefix through
`CSS_CLASS_PREFIX` or the constant at the top; library prefixes in `FOREIGN_CLASS_PREFIXES`).

## 6. Commit messages

```text
type(scope)?: (#<issue> )?subject

feat: #12 add the billing prices page
fix(billing): #42 round the VAT per line
docs: describe the release steps
```

- **CC-M1 — Commit message format** _(convention)_. Every commit message header follows
  `type(scope)?: (#<issue> )?subject`:
  - **type:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`,
    `revert`.
  - **scope:** optional, lowercase kebab-case.
  - **subject:** not empty, no trailing period. The whole header is at most 100 characters.
  - **Body and footers are free**, e.g. `Co-Authored-By: ...`.
  - **Rejected:** `wip`, `Feat: x`, `feat:#1 x`, `feat(Billing): x`, `feat: x.`, `feat: #12` (issue
    with no subject).
- **CC-M2 — The issue reference** _(convention)_. `#<issue>` is the issue the commit belongs to,
  **right after `: `, whenever one exists**. GitHub and GitLab link it automatically. To close the
  issue on merge, add `Closes #42` in the body.

Reference (Node/React): commitlint with `config/commitlint.config.js` (self-contained;
`npm i -D @commitlint/cli`).

## 7. Scripts: how they behave

- **CC-X1 — Check command names** _(convention)_. One command per check, `check:<name>`, and
  `checks` to run them all (reference: `npm run check:<name>`).
- **CC-X2 — Clear output and exit code.** Each prints `✓ <what> ok` when it passes. Otherwise it
  lists every problem (file, key or class, and what is wrong) and exits 1.
- **CC-X3 — Tested check logic.** The check logic lives in a module covered by the test suite,
  tested on fixtures and on the real project; the command-line script is a thin wrapper.
- **CC-X4 — No `.env`, no network.** A check never reads a developer's `.env` or calls a network
  service.

## 8. Checklist

- [ ] gitleaks is a documented prerequisite, the hook refuses commits without it, and its error says how to install it (CC-R1).
- [ ] Installing the dependencies activates the hooks: pre-commit (gitleaks + checks), commit-msg (message check), pre-push (verify) (CC-R2, CC-H1).
- [ ] `checks` and `verify` exist, and CI runs `verify`, the message check on the pushed commits and gitleaks on the history; hooks are never bypassed (CC-H2, CC-H3, CC-H4).
- [ ] Formatting and lint: no differences (docs, JSON and config included), zero warnings (CC-F1, CC-F2).
- [ ] Architecture: `check:architecture` with no violation (CC-A1).
- [ ] Translations, per layer: same keys, same variables per key, plural families, no empty values, language rules; frontend: used and unused keys (CC-L1, CC-L2, CC-L3, CC-L4, CC-L5, CC-L6, CC-L7).
- [ ] Secret scan on the staged changes with an allow-list of fake values only; a real secret is rotated, never allow-listed (CC-S1, CC-S2).
- [ ] `.env.example` parity in both directions, no real values; deployment examples name only known variables; outside reads allow-listed (CC-V1, CC-V2, CC-V3, CC-V4).
- [ ] Backend: email templates (files in both formats, or a catalogue built in every language) (CC-E1, CC-E2).
- [ ] Backend: before production, one final-state migration per collection (no index-only or conversion migrations), changes only after production; every migration tested on an empty database (CC-D1, CC-D2, CC-D3).
- [ ] Backend: migration lock, locked migrations unchanged, the production release refuses an incomplete lock, changes in new files; migration contract (CC-D4, CC-D5, CC-D6, CC-D7, CC-D8, CC-D9).
- [ ] Backend: route docs route by route in both directions; the OpenAPI document builds with unique operationIds; undocumented routers allow-listed (CC-O1, CC-O2, CC-O3, CC-O4).
- [ ] Frontend: every class we define has the app prefix and is used; every prefixed class used is defined; foreign classes in a commented allow-list (CC-C1, CC-C2, CC-C3, CC-C4).
- [ ] Commit messages follow section 6, with the issue reference when one exists (CC-M1, CC-M2).
- [ ] One `check:<name>` command per check; clear output and exit code; no `.env` or network; every check has tests on fixtures; every problem the checks found in the project is fixed (CC-X1, CC-X2, CC-X3, CC-X4).
