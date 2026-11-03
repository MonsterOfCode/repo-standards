---
name: review
description: Review a change (the working tree, a commit range or a pull request) against the engineering standards and the project's decisions, citing rule IDs.
argument-hint: "[commit range or PR number; default: uncommitted changes]"
---

# Review against the standards

1. Get the change: `git diff` (default), `git diff <range>`, or the pull request's diff.
2. Read the project's `AGENTS.md`, the decisions the change touches, and the standards that apply
   (architecture always; testing; commit checks; logging, audit log, service health when relevant).
3. For each changed file, check at least:
   - **Architecture**: right layer and name (ARCH-1, ARCH-N1), dependency direction (ARCH-B1–B7,
     ARCH-F1–F7), thin routers/jobs, validation at the edge, permissions and policies, transactions,
     concurrency, adapters, N+1, indexes, typed errors, server state in the query cache.
   - **Consistency** (ARCH-5): does every sibling page or service follow the same pattern?
   - **One rule, one function** (ARCH-4): is the rule already implemented somewhere else?
   - **Tests**: every branch tested with real assertions; nothing excluded to reach 100%.
   - **Security and privacy**: no secret, no personal data in logs, audit events for sensitive reads
     and changes.
   - **APIs** (api standard) and, for a partner-facing route or a client of an outside API, the
     partner API standard (credentials, allow-list, signing, minimisation, client rules).
   - **Translations, docs, decisions** updated in the same change.
4. Verify each finding against the code before reporting it: quote the line, give the scenario that
   goes wrong.

Report findings most severe first: file and line, the rule ID, what is wrong, the failure scenario,
and the fix. Say plainly when nothing was found.
