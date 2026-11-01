---
name: handoff
description: Update STATUS.md after finishing a task, before the final summary, when the context is about to run out, or when asked to wrap up.
---

# Handoff

`STATUS.md` is the first thing every new agent reads. Keep it true, short and current.

1. Re-read `STATUS.md` fully: another session may have changed it.
2. Gather facts, don't recall them: `git status --short`, `git log --oneline -10`, the latest
   decision number.
3. Update:
   - **Last updated**, as an absolute date.
   - **Where things stand**, only if something structural changed.
   - **In flight**: work left half done (what, which files, what is left, the state of the tests);
     remove it when finished.
   - **Recently done**: one line per finished piece of work, with its decision number and how it was
     verified; remove lines that are committed and released.
   - **Open questions**: add unanswered ones; remove answered ones (record the answer as a decision
     if it is one).
   - **Local environment notes**: what the next agent must know before touching the environment.
4. Keep it under about 80 lines. Link to decisions and docs instead of repeating them. No secrets.
5. A lasting rule for every future agent is not status: propose adding it to `AGENTS.md` and ask.
