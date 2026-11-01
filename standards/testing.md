# Testing standard (100% coverage gate)

**Version:** 1.0 (2026-10-31). **For:** every project of ours, backend and frontend. **Audience:** the developer, or the AI agent,
setting up or reviewing a project's tests and pipeline.

Every line of our code is executed by a test, and the pipeline refuses to merge, build or deploy
code that isn't. This standard says how to set that up, what counts as a real test, and the few
cases where code may be left out.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at the project's test runner, coverage config, CI
   pipeline and git hooks before changing anything.
2. Set the gate first (section 2), run it, and list what is below 100%. Then write the missing tests,
   most important code first (permissions, money, personal data, state changes).
3. Never reach 100% by excluding files or adding ignore comments to code you could test (section 3).
4. Finish with the checklist in section 9. Report the numbers before and after, and every exclusion
   with its reason.

The key words **must**, **must not** and **should** mean what they say.

## 1. Principles

1. **100% on all four metrics:** statements, branches, functions and lines. Branches matter most:
   the untested `else` is where the bug is.
2. **The pipeline enforces it.** Below 100% on any metric, the test step fails, and so does
   everything after it (build, image, deploy).
3. **The same gate runs locally** before every commit, so the pipeline is never the first to find
   out.
4. **Coverage is the floor, not the goal.** A line run by a test with no assertion about it is not
   tested. Every test asserts the behaviour that matters: the result, the status code, the stored
   document, the error code, the event written.
5. **Tests are deterministic.** The same code gives the same result every run, on every machine. A
   flaky test is a bug, fixed or removed the day it is seen, never retried until it passes.
6. **Tests never touch anything real:** no developer database, no production or staging service, no
   real partner API, no real email.

## 2. The gate

**In the test runner's config** (thresholds global, all four at 100):

```js
// Jest (package.json "jest" or jest.config.js)
coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } }

// Vitest (vitest.config.js)
coverage: { provider: "v8", thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } }
```

- `collectCoverageFrom` / `include` covers the whole source tree (`src/**`). Coverage is measured on
  all files, not only on files a test happens to import: an untested file must count as 0%, not
  disappear.
- **One script runs the whole gate.** It must fail on any error, for example:
  - `npm run verify` = lint + project contract checks + tests with coverage;
  - a frontend also runs format check, translation check and build.

**In the pipeline** (GitHub Actions, GitLab CI...):

- One required job runs exactly that script on every push and every merge/pull request to the main
  branches.
- Every following job (build image, deploy, release) **depends on it**: a red gate means nothing
  ships.
- Branch protection (or the release workflow) requires the job to be green before merging or
  releasing.
- Slow suites, such as full end-to-end, may run in the release pipeline instead of on every push,
  but must pass before a deploy.

**Locally:** a pre-commit hook (husky or plain git hooks) runs the same script. Never bypass it
(`--no-verify`); fix the failure.

## 3. What may be excluded

Exclusions are rare, listed in the config, and each has a **comment saying why**. Allowed:

| Excluded                                                   | Why                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| the process entry point (`app.js`, `main.jsx`)             | wiring only; its parts are tested through the app factory             |
| data files (translations, JSON, seeds)                     | no logic; checked by their own scripts (e.g. a translation key check) |
| database migrations                                        | tested by a dedicated test that runs them all on an empty database    |
| re-export files (`index.js` with only `export ... from`)   | no logic of their own                                                 |
| test support code, generated code, CLI scripts run by hand | not product code                                                      |
| a file whose remaining paths are true concurrency races    | only with a written reason, and its normal paths still tested         |

**Ignore comments** (`/* istanbul ignore next */`, `/* v8 ignore next */`) are allowed only for
defensive branches that cannot happen through the public interface. They always carry a reason on
the same line:

```js
/* istanbul ignore next -- defensive only; resolveUser guarantees req.auth.user before this handler */
```

Before adding one, prefer refactoring the code so the branch can be tested, or removing the branch if
it truly cannot happen. Every new exclusion or ignore is called out in the pull request.

## 4. What to test

| Layer                                               | Test with                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pure logic (domain rules, calculations, formatting) | unit tests, every branch                                                                                                                                                              |
| services and data access                            | integration tests against a real database engine in memory (e.g. an in-memory MongoDB replica set, or a test PostgreSQL), never mocks of the driver for logic that depends on queries |
| HTTP routes                                         | through the real app factory (e.g. supertest): status, body, error code, permission refusals, validation errors                                                                       |
| permissions                                         | **every role** against every route that matters: allowed and refused                                                                                                                  |
| concurrency                                         | real transactions on a real engine: two requests racing for the same thing, exactly one wins                                                                                          |
| external partners                                   | the client with the HTTP layer mocked, or a local stub server; every error the partner can return                                                                                     |
| frontend components and pages                       | component tests (Testing Library): what the user sees and does, not implementation details                                                                                            |
| whole flows                                         | end-to-end (Playwright): with a mocked API on every push, and against the real backend before a release                                                                               |

Also tested, always:

- **every error code** a route can return, and that the frontend shows it in the right place;
- **privacy:** personal data never appears in responses it shouldn't, in logs or in the audit log;
- **every bug fix** gets a regression test that **fails on the old code**.

## 5. Determinism

- **No wall clock in assertions.** Inject `now` or use fake timers; dates are fixed in the test.
- **No sleeps to wait for something.** Wait for the condition (`waitFor`, polling with a deadline).
  A fixed sleep is either too slow or flaky.
- **No order dependence.** Each test creates its own data and cleans up, or uses its own database;
  tests pass alone and in any order.
- **No shared global state** between tests (caches, singletons, environment variables): reset them
  in `beforeEach`.
- **Randomness is seeded or asserted generically** (`expect.any(String)`, a format regex).
- **Timeouts** are generous enough for a CI runner under coverage (e.g. 15 s per test), and a test
  that needs more is a test to split.

## 6. Isolation

- Tests run against **their own** database, created and dropped by the test run, never the
  developer's.
- Real-backend end-to-end runs on its own ports and its own database, so it can run while a
  developer works.
- External services are stubs or mocks; no test or script calls a real partner, sends a real email
  (use a local catcher such as Mailpit), or reports to real error tracking (empty DSN in tests).
- Secrets in tests are fake values set by the test setup, never read from a developer's `.env`.

## 7. Flaky tests

- A test that fails once and passes on retry is **flaky**: record it, find the cause, and fix it the
  same day. Common causes are reading state before an async update, the wall clock, order
  dependence, and shared memory between workers.
- No automatic retries in the unit/integration runner to hide flakiness.
- End-to-end suites may retry once in CI, but a retried test is reported and fixed like any other
  flaky test.
- When the runner itself crashes (out of memory), fix the configuration (worker memory limits,
  fewer workers); never ignore it.

## 8. Speed and structure

- Test files mirror the code they test (`src/test/<area>.test.js`, or next to the file); helpers live
  in a `test/support/` folder.
- Keep the full suite runnable locally in a few minutes; split or parallelize when it grows.
- Expensive setup (an in-memory database) is started once per file, not per test.

## 9. Checklist

- [ ] Coverage thresholds at 100% on statements, branches, functions and lines, measured on the whole source tree.
- [ ] One script runs lint, contract checks and tests with coverage, and fails on any error.
- [ ] The pipeline runs it on every push and pull request; build, image and deploy depend on it; merging/releasing requires it green.
- [ ] A pre-commit hook runs the same script; nobody bypasses it.
- [ ] Every exclusion and ignore comment has a written reason; none hides testable code.
- [ ] Routes tested through the real app, with every role and every error code.
- [ ] Data access and races tested against a real in-memory database engine.
- [ ] Partners mocked or stubbed; no real external call, email or error report from tests.
- [ ] Tests are deterministic (no wall clock, no sleeps, no order dependence) and isolated (own database, own ports).
- [ ] Every bug fix has a regression test that fails on the old code.
- [ ] Flaky tests are fixed, not retried.
- [ ] End-to-end (mocked API on push, real backend before release) passes before any deploy.
