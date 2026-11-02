# Testing standard (100% coverage gate)

**Version:** 1.1 (2026-11-02). **For:** every project of ours, backend and frontend. **Audience:** the developer, or the AI agent,
setting up or reviewing a project's tests and pipeline.

**Changes in 1.1:** optional mutation testing for critical code (section 8); stack-specific tools
moved to "Reference implementation (Node/React)" callouts.

Every line of our code is executed by a test, and the pipeline refuses to merge, build or deploy
code that isn't. This standard says how to set that up, what counts as a real test, and the few
cases where code may be left out.

**If you are an agent implementing this in a project:**

1. Read the whole standard first. Then look at the project's test runner, coverage config, CI
   pipeline and git hooks before changing anything.
2. Set the gate first (section 2), run it, and list what is below 100%. Then write the missing tests,
   most important code first (permissions, money, personal data, state changes).
3. Never reach 100% by excluding files or adding ignore comments to code you could test (section 3).
4. Finish with the checklist in section 10. Report the numbers before and after, and every exclusion
   with its reason.

The key words **must**, **must not** and **should** mean what they say.

## 1. Principles

1. **100% on all four metrics:** statements, branches, functions and lines. Branches matter most:
   the untested `else` is where the bug is.
2. **The pipeline enforces it.** Below 100% on any metric, the test step fails, and so does
   everything after it (build, image, deploy).
3. **The same gate runs locally** before every push (the fast checks before every commit), so the
   pipeline is never the first to find out.
4. **Coverage is the floor, not the goal.** A line run by a test with no assertion about it is not
   tested. Every test asserts the behaviour that matters: the result, the status code, the stored
   document, the error code, the event written.
5. **Tests are deterministic.** The same code gives the same result every run, on every machine. A
   flaky test is a bug, fixed or removed the day it is seen, never retried until it passes.
6. **Tests never touch anything real:** no developer database, no production or staging service, no
   real partner API, no real email.

## 2. The gate

**In the test runner's config:** global thresholds, all four at 100.

- Coverage is measured on the whole source tree, not only on files a test happens to import: an
  untested file must count as 0%, not disappear.
- **One command runs the whole gate** (the project's `verify`). It must fail on any error:
  - lint + project contract checks + tests with coverage;
  - a frontend also runs format check, translation check and build.

> **Reference implementation (Node/React).**
>
> ```js
> // Jest (package.json "jest" or jest.config.js), with collectCoverageFrom: ["src/**/*.js"]
> coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } }
>
> // Vitest (vitest.config.js), with coverage.include: ["src/**"]
> coverage: { provider: "v8", thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } }
> ```
>
> The gate is `npm run verify`.

**In the pipeline** (see the [CI/CD standard](ci-cd.md)):

- One required job runs exactly that script on every push and every merge/pull request to the main
  branches.
- Every following job (build image, deploy, release) **depends on it**: a red gate means nothing
  ships.
- Branch protection (or the release workflow) requires the job to be green before merging or
  releasing.
- Slow suites, such as full end-to-end, may run in the release pipeline instead of on every push,
  but must pass before a deploy.

**Locally:** a git hook runs the same command (commit-checks standard: the fast checks before each
commit, the full gate before each push). Never bypass it (`--no-verify`); fix the failure.

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

**Ignore comments** (the coverage tool's "ignore next" marker) are allowed only for defensive
branches that cannot happen through the public interface. They always carry a reason on the same
line, for example in JavaScript:

```js
/* istanbul ignore next -- defensive only; resolveUser guarantees req.auth.user before this handler */
```

Before adding one, prefer refactoring the code so the branch can be tested, or removing the branch if
it truly cannot happen. Every new exclusion or ignore is called out in the pull request.

## 4. What to test

| Layer                                               | Test with                                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pure logic (domain rules, calculations, formatting) | unit tests, every branch                                                                                                                                                    |
| services and data access                            | integration tests against a real database engine started for the tests (in memory or in a throwaway container), never mocks of the driver for logic that depends on queries |
| HTTP routes                                         | through the real app factory, over HTTP in process: status, body, error code, permission refusals, validation errors                                                        |
| permissions                                         | **every role** against every route that matters: allowed and refused                                                                                                        |
| concurrency                                         | real transactions on a real engine: two requests racing for the same thing, exactly one wins                                                                                |
| external partners                                   | the client with the HTTP layer mocked, or a local stub server; every error the partner can return                                                                           |
| frontend components and pages                       | component tests: what the user sees and does, not implementation details                                                                                                    |
| whole flows                                         | end-to-end in a real browser: with a mocked API on every push, and against the real backend before a release                                                                |

Also tested, always:

- **every error code** a route can return, and that the frontend shows it in the right place;
- **privacy:** personal data never appears in responses it shouldn't, in logs or in the audit log;
- **every bug fix** gets a regression test that **fails on the old code**.

> **Reference implementation (Node/React).** Jest + supertest for the API, with an in-memory MongoDB
> replica set (`mongodb-memory-server`, so transactions work); Vitest + Testing Library for the SPA;
> Playwright for end-to-end, against a mocked API and against the real backend on its own ports.

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
  (use a local mail catcher), or reports to real error tracking (no DSN in tests).
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

## 8. Mutation testing (optional, for critical code)

Coverage proves a line ran, not that a test would notice if it were wrong: a suite can reach 100%
with tests that assert little. Mutation testing measures that. The tool changes the code in small
ways (a `>` becomes `>=`, a condition becomes `true`, a `+` becomes `-`, a call is removed), runs the
tests against each change (a "mutant"), and counts how many the tests catch ("killed"). A surviving
mutant is a change of behaviour no test notices.

- **Scope: the critical code only**, where a silent mistake is expensive: money (prices, totals,
  taxes, invoices, balances), permissions and visibility (policies, permission checks), and personal
  data (redaction, retention, erasure, access logging). The project lists these paths in its
  mutation config.
- **When:** periodically (e.g. weekly or nightly) on those paths, and in the pipeline of a pull
  request that touches them, limited to the changed files. Never on every commit for the whole code:
  it is slow.
- **Target:** a mutation score (killed / total, equivalent mutants excluded) of **at least 80%** on
  the listed paths, raised as the tests improve. The periodic run fails below the target; a pull
  request may not lower the score of the files it touches.
- **Survivors are read, not ignored.** Each one is either a missing assertion (write it), dead or
  redundant code (remove it), or an equivalent mutant that changes nothing observable (mark it as
  such in the tool's config, with a reason).
- A project that adopts it records the scope and the target in its decision log.

> **Reference implementation (Node/React).** [Stryker Mutator](https://stryker-mutator.io/)
> (`@stryker-mutator/core` with the Jest or Vitest runner): `mutate` lists the critical paths
> (`src/domain/invoice-*.js`, `src/policies/**`, `src/util/*scrub*.js`...), `thresholds.break: 80`,
> `incremental: true` so a run only re-tests what changed; a scheduled CI workflow runs it and keeps
> the HTML report as an artifact.

## 9. Speed and structure

- Test files mirror the code they test (`src/test/<area>.test.js`, or next to the file); helpers live
  in a `test/support/` folder.
- Keep the full suite runnable locally in a few minutes; split or parallelize when it grows.
- Expensive setup (an in-memory database) is started once per file, not per test.

## 10. Checklist

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
- [ ] Optional: mutation testing on the critical paths (money, permissions, personal data), run periodically and on pull requests touching them, with a score target.
