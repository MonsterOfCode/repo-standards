# Engineering standards

The standards every one of our projects follows, so that audit trails, logs, monitoring, tests and
the checks run on every commit work the same way everywhere.

Each standard is written for the developer **or the AI agent** implementing it in a project: it
opens with instructions for the agent, says what is contract (must be identical in every project)
and what is free to adapt to the stack, and ends with a checklist. Hand the file to the agent and
ask it to implement the standard in your project and confirm every checklist item.

| Standard                                              | What it covers                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Audit log](standards/audit-log.md)                   | who did what, when, to what, and who saw what: two layers, privacy rules, retention, alerts, tamper resistance |
| [Application logging](standards/logging.md)           | JSON events on stdout, base fields, access event, redaction, Kubernetes                             |
| [Service health](standards/service-health.md)         | checks of every dependency and job, failure alerts, settings, health endpoints and Prometheus metrics |
| [Testing](standards/testing.md)                       | 100% coverage gate in the pipeline, what to test, determinism, isolation, exclusions                 |
| [Commit checks](standards/commit-checks.md)           | what every commit and push must pass: format, lint, translations, emails, migrations, route docs, CSS, env, secrets, commit messages |

Reference scripts and configuration for the commit checks live in [`scripts/`](scripts/) and
[`config/`](config/): copy them into a project and adjust the paths at the top of each file.

## Changing a standard

A standard changes through a pull request to this repository. When it changes, each project
updates itself and says in its own decision log which version it follows. A project that cannot
follow a rule records the exception, and the reason, in its decision log.
