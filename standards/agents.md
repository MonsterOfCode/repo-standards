# Agents standard

**Version:** 1.0 (2026-10-31). **For:** every project of ours. **Audience:** the developer setting up
a repository, and the AI agents (Claude Code, Codex, Cursor...) that work in it.

An agent starts every session without memory. What it knows about a project is what the repository
tells it: the rules, the current state, the decisions already taken and how to prove a change works.
This standard defines the files every repository has for that, and how an agent must work in it.
Templates are in [`templates/`](../templates/).

**If you are an agent setting this up in a project:**

1. Read the whole standard. Then read what the project already has (README, `docs/`, any
   `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, contributing guide) before writing anything.
2. Create the files of section 2 from the templates, filled with what is **true** for the project:
   commands you ran, folders that exist, rules the code follows. Never copy a placeholder or invent a
   rule. What you could not verify, you ask the developer.
3. Finish with the checklist in section 8.

The key words **must**, **must not** and **should** mean what they say. Rules have IDs `AG-n`.

## 1. Why these files

- **The rules must be read, not remembered.** An agent follows the instructions it is given at the
  start of the session. A rule that lives only in someone's head, or in a chat from last week, is
  broken by the next agent.
- **The state must be written down.** Several sessions work in parallel on the same repositories,
  and every session ends. What was done, what is half done and what is waiting on a person is in a
  file, or it is lost.
- **Decisions must not be re-argued.** An agent that doesn't know why something is the way it is
  will "improve" it back. The decision log says why.

## 2. The files every repository has

| File                         | What it holds                                                                 | Who updates it                    |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `AGENTS.md`                  | the agent guide: what the project is, hard rules, how to work, architecture map, commands, where things are | the developer, agents on request |
| `CLAUDE.md`                  | one line, `@AGENTS.md`, so Claude Code loads the same guide (plus Claude-only notes, if any) | rarely                            |
| `STATUS.md`                  | the current state: where things stand, recently done, in flight, open questions, environment notes | **every agent, after every task** |
| `docs/decisions.md`          | the decision log (D1, D2, ...): context, decision, why, consequences          | agents and developers, append-only |
| `docs/` (see section 5)      | architecture, reference specs, runbooks, the project's page/layout standard   | with the change that alters them  |
| `.claude/skills/` (optional) | the project's skills: verify, decision, handoff, review                       | the developer                     |

- **AG-1 — One guide for every agent.** `AGENTS.md` is read by Codex, Cursor and others;
  `CLAUDE.md` imports it with `@AGENTS.md`. The rules are never maintained twice.
- **AG-2 — Short, true, current.** `AGENTS.md` stays under ~300 lines; detail goes to `docs/` and the
  guide links to it. Every command in it has been run; every path exists. A wrong line is worse
  than a missing one: fix it the day it is found.
- **AG-3 — A workspace with several repositories** has its own `AGENTS.md` and `STATUS.md` at the
  workspace root (shared rules, the repositories and how they relate, the current state across
  them). Each repository's guide covers only that repository and points to the workspace guide.

## 3. What `AGENTS.md` contains

In this order (template: [`templates/AGENTS.md`](../templates/AGENTS.md)):

1. **What the project is**, in one paragraph: the product, its users, what is sensitive.
2. **Read first:** `STATUS.md`, the decision log, and the documents that matter for most changes.
3. **Hard rules**: the few things never to do, each with its reason. At least: never commit, stage or
   push unless asked in the current conversation; never print a secret; never touch a database or
   service that isn't the project's own test or local one; never run anything against production.
4. **How to work** (section 6, adapted to the project).
5. **Engineering standards** followed, with the version of each (README, "Versions") and the
   project's exceptions.
6. **Architecture map**: the layer folders and what goes where (architecture standard), with one
   current example file per kind of change ("a new endpoint looks like `billing-prices-router.js`").
7. **Commands**: install, dev servers, `checks`, `verify`, tests, end-to-end tests, migrations.
8. **Local environment**: ports, local databases, mail catcher, test accounts or how to create them.
9. **Where things are**: the documents of `docs/` and what each answers.

## 4. The decision log

- **AG-4 — Every non-obvious or cross-cutting choice is a decision**: a stack or library choice, a
  data model, a security rule, a business rule a person decided, a deviation from a standard.
- Numbered `D1`, `D2`, ... in `docs/decisions.md`, never renumbered. Format (template:
  [`templates/decisions.md`](../templates/decisions.md)): title phrased as the outcome, status
  (decided / open / deferred, with date and who decided), context, decision (concrete names: codes,
  permissions, files), why (with the alternatives rejected), consequences and tests.
- A decision is never edited silently: an update is a dated paragraph, or a new decision that says
  which one it supersedes.
- The code that enforces a non-obvious rule cites its decision (`// D182: ...`).
- Several sessions add decisions in parallel: take the next number **right before writing**, and
  append after the last entry.

## 5. `docs/`

| Document                     | Answers                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `decisions.md`               | why is it like this                                        |
| `reference/business-logic.md`| what must the product do (the verified business rules)     |
| `architecture.md`            | how the project applies the architecture standard          |
| `layout-standards.md` (frontend) | how to build a list, a detail page, a dialog, a form   |
| `testing.md`                 | how to run the tests, end-to-end setup, known gotchas      |
| `deploy/`                    | environments, runbooks, an append-only log of every server action |

Only the documents the project needs. A document that is no longer true is fixed or deleted.

## 6. How an agent works

- **AG-5 — Investigate before building.** Search for the permission, schema, route, component or
  migration before writing new plumbing: most "new" features are partly wired already. Read the
  decisions on the topic. Never approximate from memory or a screenshot: read the code.
- **AG-6 — Follow the existing pattern.** The project's way of doing a thing wins over the agent's
  habit. When the pattern is wrong, say so and fix it everywhere, not in one place (ARCH-5).
- **AG-7 — Verified means verified.** A task is done only when `npm run verify` passes (checks + tests
  at 100% coverage + build) and, for any UI change, the agent has looked at it in a browser (desktop
  and phone width, light and dark). Failures are reported with their output, never hidden.
- **AG-8 — Ask only for real decisions.** Product and design choices belong to a person; everything
  else the agent decides, then says plainly what it decided so it is easy to redirect.
- **AG-9 — Never commit, stage or push** unless asked in the current conversation. Permission for one
  commit is not permission for the next one, nor for a push or a release.
- **AG-10 — Parallel sessions.** Re-read a file right before editing it. Never revert or reformat a
  change you did not make. A failing test in a file you did not touch may be someone else's work in
  progress: report it.
- **AG-11 — Secrets.** Never print, log, commit or pass a secret on a command line. Refer to it by
  its variable name; pass it through the environment or stdin.
- **AG-12 — Update `STATUS.md` after every task**, before the final summary: what was finished, what
  is half done (files, what is left, test state), questions waiting on a person. Keep it short
  (template: [`templates/STATUS.md`](../templates/STATUS.md)).
- **AG-13 — Delegate with the rules.** A sub-agent receives the hard rules explicitly, and its report
  is verified before it is relayed.
- **AG-14 — Leave it better, in scope.** Something out of scope noticed on the way (dead code, a
  stale doc, a missing test) is reported or filed as an issue, not silently fixed in an unrelated
  change.

## 7. Skills

Optional but recommended: the repetitive procedures as skills (templates in
[`templates/skills/`](../templates/skills/)), so every agent runs them the same way:

- **verify** — runs the full checks for what changed and reports the numbers.
- **decision** — adds a decision with the next free number, in the right log and format.
- **handoff** — updates `STATUS.md` (AG-12).
- **review** — reviews a change against the standards, citing rule IDs.

## 8. Checklist

- [ ] `AGENTS.md` exists, follows section 3, under ~300 lines; every command run, every path real.
- [ ] `CLAUDE.md` imports `@AGENTS.md`.
- [ ] `STATUS.md` exists and is current; the guide tells agents to read it first and update it after every task.
- [ ] `docs/decisions.md` exists with the format of section 4; deviations from standards are decisions.
- [ ] The hard rules include: no commit/push unless asked, no secrets printed, no foreign databases, nothing against production.
- [ ] The standards followed are listed with their version and the project's exceptions.
- [ ] For a workspace of several repositories: a workspace `AGENTS.md` and `STATUS.md`.
- [ ] The verify, decision, handoff and review skills exist (or their steps are in the guide).
