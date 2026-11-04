# Testing standard (100% coverage gate)

**Version:** 1.2 (2026-11-03). **For:** every project of ours, backend and frontend. **Audience:** the developer, or the AI agent,
setting up or reviewing a project's tests and pipeline.

**Changes in 1.2:** every rule has a stable ID (`TEST-<area><n>`) and every checklist item cites
the rules it covers; no rule's meaning changed.

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

The key words **must**, **must not** and **should** mean what they say. Rules have IDs
`TEST-<area><n>`: `P` principles, `G` the gate, `X` exclusions, `W` what to test, `D` determinism,
`I` isolation, `F` flaky tests, `M` mutation testing, `S` speed and structure.

## 1. Principles

- **TEST-P1 — 100% on all four metrics:** statements, branches, functions and lines. Branches matter
  most: the untested `else` is where the bug is.
- **TEST-P2 — The pipeline enforces it.** Below 100% on any metric, the test step fails, and so does
  everything after it (build, image, deploy).
- **TEST-P3 — The same gate runs locally** before every push (the fast checks before every commit),
  so the pipeline is never the first to find out.
- **TEST-P4 — Coverage is the floor, not the goal.** A line run by a test with no assertion about it
  is not tested. Every test asserts the behaviour that matters: the result, the status code, the
  stored document, the error code, the event written.
- **TEST-P5 — Tests are deterministic.** The same code gives the same result every run, on every
  machine. A flaky test is a bug, fixed or removed the day it is seen, never retried until it
  passes.
- **TEST-P6 — Tests never touch anything real:** no developer database, no production or staging
  service, no real partner API, no real email.

## 2. The gate

**In the test runner's config:**

- **TEST-G1 — Global thresholds, all four at 100.**
- **TEST-G2 — Measured on the whole source tree**, not only on files a test happens to import: an
  untested file must count as 0%, not disappear.
- **TEST-G3 — One command runs the whole gate** (the project's `verify`). It must fail on any error:
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

- **TEST-G4 — One required job** runs exactly that command on every push and every merge/pull
  request to the main branches.
- **TEST-G5 — Everything after depends on it.** Every following job (build image, deploy, release)
  **depends on it**: a red gate means nothing ships.
- **TEST-G6 — Green before merge or release.** Branch protection (or the release workflow) requires
  the job to be green before merging or releasing.
- **TEST-G7 — Slow suites before a deploy.** Slow suites, such as full end-to-end, may run in the
  release pipeline instead of on every push, but must pass before a deploy.

**Locally:**

- **TEST-G8 — A git hook runs the same command** (commit-checks standard: the fast checks before each
  commit, the full gate before each push). Never bypass it (`--no-verify`); fix the failure.

## 3. What may be excluded

- **TEST-X1 — Exclusions are rare and listed.** They are listed in the config, each with a
  **comment saying why**, and only these are allowed:

  | Excluded                                                   | Why                                                                   |
  | ---------------------------------------------------------- | --------------------------------------------------------------------- |
  | the process entry point (`app.js`, `main.jsx`)             | wiring only; its parts are tested through the app factory             |
  | data files (translations, JSON, seeds)                     | no logic; checked by their own scripts (e.g. a translation key check) |
  | database migrations                                        | tested by a dedicated test that runs them all on an empty database    |
  | re-export files (`index.js` with only `export ... from`)   | no logic of their own                                                 |
  | test support code, generated code, CLI scripts run by hand | not product code                                                      |
  | a file whose remaining paths are true concurrency races    | only with a written reason, and its normal paths still tested         |

- **TEST-X2 — Ignore comments only for impossible branches.** The coverage tool's "ignore next"
  marker is allowed only for defensive branches that cannot happen through the public interface. It
  always carries a reason on the same line, for example in JavaScript:

  ```js
  /* istanbul ignore next -- defensive only; resolveUser guarantees req.auth.user before this handler */
  ```

- **TEST-X3 — Refactor before ignoring.** Before adding one, prefer refactoring the code so the
  branch can be tested, or removing the branch if it truly cannot happen.
- **TEST-X4 — Called out in review.** Every new exclusion or ignore is called out in the pull
  request.

## 4. What to test

- **TEST-W1 — Each layer is tested this way:**

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

- **TEST-W2 — Every error code** a route can return, and that the frontend shows it in the right
  place.
- **TEST-W3 — Privacy:** personal data never appears in responses it shouldn't, in logs or in the
  audit log.
- **TEST-W4 — Every bug fix** gets a regression test that **fails on the old code**.

> **Reference implementation (Node/React).** Jest + supertest for the API, with an in-memory MongoDB
> replica set (`mongodb-memory-server`, so transactions work); Vitest + Testing Library for the SPA;
> Playwright for end-to-end, against a mocked API and against the real backend on its own ports.

## 5. Determinism

- **TEST-D1 — No wall clock in assertions.** Inject `now` or use fake timers; dates are fixed in the
  test.
- **TEST-D2 — No sleeps to wait for something.** Wait for the condition (`waitFor`, polling with a
  deadline). A fixed sleep is either too slow or flaky.
- **TEST-D3 — No order dependence.** Each test creates its own data and cleans up, or uses its own
  database; tests pass alone and in any order.
- **TEST-D4 — No shared global state** between tests (caches, singletons, environment variables):
  reset them in `beforeEach`.
- **TEST-D5 — Randomness is seeded or asserted generically** (`expect.any(String)`, a format regex).
- **TEST-D6 — Generous timeouts.** Timeouts are generous enough for a CI runner under coverage (e.g.
  15 s per test), and a test that needs more is a test to split.

## 6. Isolation

- **TEST-I1 — Own database.** Tests run against **their own** database, created and dropped by the
  test run, never the developer's.
- **TEST-I2 — Own ports.** Real-backend end-to-end runs on its own ports and its own database, so it
  can run while a developer works.
- **TEST-I3 — No real external service.** External services are stubs or mocks; no test or script
  calls a real partner, sends a real email (use a local mail catcher), or reports to real error
  tracking (no DSN in tests).
- **TEST-I4 — Fake secrets.** Secrets in tests are fake values set by the test setup, never read
  from a developer's `.env`.

## 7. Flaky tests

- **TEST-F1 — Fixed the same day.** A test that fails once and passes on retry is **flaky**: record
  it, find the cause, and fix it the same day. Common causes are reading state before an async
  update, the wall clock, order dependence, and shared memory between workers.
- **TEST-F2 — No automatic retries** in the unit/integration runner to hide flakiness.
- **TEST-F3 — One end-to-end retry at most.** End-to-end suites may retry once in CI, but a retried
  test is reported and fixed like any other flaky test.
- **TEST-F4 — A crashing runner is fixed.** When the runner itself crashes (out of memory), fix the
  configuration (worker memory limits, fewer workers); never ignore it.

## 8. Mutation testing (optional, for critical code)

Coverage proves a line ran, not that a test would notice if it were wrong: a suite can reach 100%
with tests that assert little. Mutation testing measures that. The tool changes the code in small
ways (a `>` becomes `>=`, a condition becomes `true`, a `+` becomes `-`, a call is removed), runs the
tests against each change (a "mutant"), and counts how many the tests catch ("killed"). A surviving
mutant is a change of behaviour no test notices.

A project that adopts mutation testing follows these rules:

- **TEST-M1 — Scope: the critical code only**, where a silent mistake is expensive: money (prices,
  totals, taxes, invoices, balances), permissions and visibility (policies, permission checks), and
  personal data (redaction, retention, erasure, access logging). The project lists these paths in
  its mutation config.
- **TEST-M2 — When:** periodically (e.g. weekly or nightly) on those paths, and in the pipeline of a
  pull request that touches them, limited to the changed files. Never on every commit for the whole
  code: it is slow.
- **TEST-M3 — Target:** a mutation score (killed / total, equivalent mutants excluded) of **at least
  80%** on the listed paths, raised as the tests improve. The periodic run fails below the target; a
  pull request may not lower the score of the files it touches.
- **TEST-M4 — Survivors are read, not ignored.** Each one is either a missing assertion (write it),
  dead or redundant code (remove it), or an equivalent mutant that changes nothing observable (mark
  it as such in the tool's config, with a reason).
- **TEST-M5 — Recorded.** A project that adopts it records the scope and the target in its decision
  log.

> **Reference implementation (Node/React).** [Stryker Mutator](https://stryker-mutator.io/)
> (`@stryker-mutator/core` with the Jest or Vitest runner): `mutate` lists the critical paths
> (`src/domain/invoice-*.js`, `src/policies/**`, `src/util/*scrub*.js`...), `thresholds.break: 80`,
> `incremental: true` so a run only re-tests what changed; a scheduled CI workflow runs it and keeps
> the HTML report as an artifact.

## 9. Speed and structure

- **TEST-S1 — Tests mirror the code.** Test files mirror the code they test
  (`src/test/<area>.test.js`, or next to the file); helpers live in a `test/support/` folder.
- **TEST-S2 — A few minutes locally.** Keep the full suite runnable locally in a few minutes; split
  or parallelize when it grows.
- **TEST-S3 — Expensive setup once per file.** Expensive setup (an in-memory database) is started
  once per file, not per test.

## 10. Checklist

- [ ] Coverage thresholds at 100% on statements, branches, functions and lines, measured on the whole source tree (TEST-P1, TEST-G1, TEST-G2).
- [ ] One command runs lint, contract checks and tests with coverage (plus format, translations and build for a frontend), and fails on any error (TEST-G3).
- [ ] The pipeline runs it on every push and pull request; build, image and deploy depend on it; merging/releasing requires it green; slow suites pass before any deploy (TEST-P2, TEST-G4, TEST-G5, TEST-G6, TEST-G7).
- [ ] Git hooks run the same gate locally (fast checks before each commit, full gate before each push); nobody bypasses them (TEST-P3, TEST-G8).
- [ ] Every exclusion is from the allowed list and every ignore comment guards an impossible branch, each with a written reason and called out in the pull request; none hides testable code (TEST-X1, TEST-X2, TEST-X3, TEST-X4).
- [ ] Every test asserts the behaviour that matters; each layer tested as in section 4 (TEST-P4, TEST-W1).
- [ ] Routes tested through the real app, with every role and every error code shown in the right place (TEST-W1, TEST-W2).
- [ ] Data access and races tested against a real database engine started for the tests (TEST-W1).
- [ ] Privacy tested: no personal data in responses, logs or audit where it shouldn't be (TEST-W3).
- [ ] Partners mocked or stubbed; no real external call, email or error report from tests; fake secrets only (TEST-P6, TEST-I3, TEST-I4).
- [ ] Tests are deterministic (no wall clock, no sleeps, no order dependence, no shared state, seeded randomness, generous timeouts) and isolated (own database, own ports) (TEST-P5, TEST-D1, TEST-D2, TEST-D3, TEST-D4, TEST-D5, TEST-D6, TEST-I1, TEST-I2).
- [ ] Every bug fix has a regression test that fails on the old code (TEST-W4).
- [ ] Flaky tests are fixed the same day, not retried; at most one end-to-end retry, reported; runner crashes fixed (TEST-F1, TEST-F2, TEST-F3, TEST-F4).
- [ ] End-to-end (mocked API on push, real backend before release) passes before any deploy (TEST-W1, TEST-G7).
- [ ] Tests mirror the code, the suite runs locally in a few minutes, expensive setup once per file (TEST-S1, TEST-S2, TEST-S3).
- [ ] Optional: mutation testing on the critical paths (money, permissions, personal data), run periodically and on pull requests touching them, with a score target, survivors triaged, scope and target recorded (TEST-M1, TEST-M2, TEST-M3, TEST-M4, TEST-M5).
