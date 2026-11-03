---
name: audit
description: Audit a whole project against the engineering standards (not a single change) and report, rule by rule, what is met, what is wrong and what is missing, citing rule IDs and evidence.
argument-hint: "[standard names to limit the audit, e.g. security partner-api; default: all that apply]"
---

# Audit a project against the standards

The standards live in https://github.com/MonsterOfCode/repo-standards. Read them from there (or
from a local clone that is up to date with `main`), never from memory: rules are added between
versions.

1. **Know the project.** Read its `AGENTS.md` / `CLAUDE.md`, `README`, decision log and deployment
   docs, and list its stack, its HTTP APIs (internal and partner-facing), the outside APIs it calls,
   its jobs, its data stores and the personal data it holds.
2. **Pick the standards that apply** (all of them unless the argument limits the audit), and say
   which ones do not apply and why (for example: no partner-facing API, so part A of the partner API
   standard is not applicable; it still calls outside APIs, so parts B and C apply).
3. **Go rule by rule**, using each standard's checklist and its rule IDs. For each rule give one
   verdict:
   - **met** - with the evidence (file and line, config, workflow, doc);
   - **partly met** - what is there and what is missing;
   - **not met** - what is wrong or missing, with the evidence;
   - **exception** - not met, but a decision in the project's log records why (cite it);
   - **not applicable** - with the reason;
   - **cannot tell** - the evidence is outside the repository (server, provider settings, a
     contract); say what to check and with whom.

   Check the code, not the documentation: a rule is met when the code, config or pipeline enforces
   it. Run the project's checks when they exist and say what they returned.

4. **For each outside API the project calls**, fill in the partner API standard's evaluation table
   (section 8, PAPI-E1-E16) from the provider's documentation and the client code, and list what to
   ask the provider.
5. **Verify every "not met" before reporting it**: quote the line or show the missing piece, and
   give the scenario that goes wrong.

## Report

1. A summary: the standards and versions audited, counts of met / partly / not met / exceptions per
   standard, and the five most serious gaps.
2. The findings, most severe first (security and privacy before style): rule ID, verdict, evidence,
   the failure scenario, the fix, and its size (small / medium / large).
3. What could not be checked from the repository, and who can answer it.
4. A proposed order of work.

Change nothing while auditing: no edits, no commits. The audit is a report; fixes are separate work
the owner of the project decides.
