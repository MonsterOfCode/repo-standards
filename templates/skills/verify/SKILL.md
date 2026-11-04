---
name: verify
description: Run the full checks for what changed in this repository and report the results. Use before calling any task done.
---

# Verify

Goal: prove the change is done, at 100% coverage, without disturbing anyone's local environment.

1. See what changed: `git status --short`. A backend API change the frontend consumes means both.
2. Run, in the repository, stopping on the first real failure:
   - `npm run verify` (checks + tests at 100% coverage + build). Use a long timeout.
   - End-to-end: only the specs of the flow that changed (a file or two; `--repeat-each` for a race
     or a flaky fix), on their own test database, never the developer's. Never the whole suite per
     change: it runs in the release pipeline (testing standard, TEST-G7, TEST-G9). The whole suite
     locally only before merging into the main branch, when the change crosses flows, or when asked.
3. For any UI change, look at it in the browser: desktop and phone width, light and dark.
4. Never point a check at the developer's database, never restart their dev servers, never commit.
5. A failure in a file you did not touch may be someone else's work in progress (`git diff` on it):
   report it, don't "fix" it.

Report per repository: each check with pass or fail and its numbers (tests, coverage), and every
failure with the relevant output lines. Never claim a check passed that you did not run.
