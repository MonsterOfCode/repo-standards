# Engineering standards

The standards every one of our projects follows, so that architecture, agent setup, audit trails,
logs, monitoring, tests and the checks run on every commit work the same way everywhere.

Each standard is written for the developer **or the AI agent** implementing it in a project: it
opens with instructions for the agent, says what is contract (must be identical in every project)
and what is free to adapt to the stack, and ends with a checklist. Hand the file to the agent and
ask it to implement the standard in your project and confirm every checklist item.

| Standard                                              | What it covers                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Architecture](standards/architecture.md)             | layer-first folders (never feature folders), layers and their dependencies (checked on every commit), input validation and the 422 format, bot traps, naming, code rules, anti-patterns |
| [Agents](standards/agents.md)                         | the files every repository has for AI agents (`AGENTS.md`, `STATUS.md`, decision log, skills) and how an agent works in it |
| [Audit log](standards/audit-log.md)                   | who did what, when, to what, and who saw what: two layers, privacy rules, retention, alerts, tamper resistance |
| [Application logging](standards/logging.md)           | JSON events on stdout, base fields, access event, redaction, Kubernetes                             |
| [Service health](standards/service-health.md)         | checks of every dependency and job, failure alerts, settings, health endpoints and Prometheus metrics |
| [Testing](standards/testing.md)                       | 100% coverage gate in the pipeline, what to test, determinism, isolation, exclusions                 |
| [Commit checks](standards/commit-checks.md)           | what every commit and push must pass: format, lint, translations, emails, migrations, route docs, CSS, env, secrets, commit messages |

Reference scripts and configuration live in [`scripts/`](scripts/) and [`config/`](config/): copy
them into a project and adjust the paths at the top of each file. [`templates/`](templates/) holds
the agent files of a repository (`AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `decisions.md`) and the
verify, decision, handoff and review skills.

## Starting a new project

1. Copy the templates of [`templates/`](templates/) and fill them with what is true for the project
   (agents standard).
2. Lay out the folders by layer (architecture standard) and add the architecture check.
3. Add the commit checks and hooks, the 100% coverage gate, then logging, audit log and service
   health as the project needs them.
4. List in `AGENTS.md` the standards followed, with their versions.

Each standard opens with instructions for an agent and ends with a checklist: hand an agent the
standard and ask it to apply it and confirm every item.

## Versions

Each standard carries a version and a date at the top. A project lists, in its `AGENTS.md`, the
version of each standard it follows and its exceptions (each one a decision in its log). Rules have
IDs (`ARCH-B2`, `AG-7`) so a review can cite exactly the rule it applies.

## Changing a standard

A standard changes through a pull request to this repository. When it changes, each project
updates itself and says in its own decision log which version it follows. A project that cannot
follow a rule records the exception, and the reason, in its decision log.
