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
2. **List the project's exceptions.** In its decision log, find every entry recording an exception
   (README of the standards, "Exceptions and adaptations": title `D<n> — Exception: <rule IDs> ...`,
   with **Rules**, **Verdict**, **Reason**, **Compensating control**, **Review date**, **Owner**),
   and index them by rule ID. A deviation described in the log without that format is reported as
   an unrecorded exception (the rule is judged as written).
3. **Pick the standards that apply** (all of them unless the argument limits the audit), and say
   which ones do not apply and why (for example: no partner-facing API, so part A of the partner API
   standard is not applicable; it still calls outside APIs, so parts B and C apply).
4. **Go rule by rule**, using each standard's checklist and its rule IDs. For each rule, first look
   its ID up in the exception index. Then give one verdict:
   - **met** - with the evidence (file and line, config, workflow, doc);
   - **partly met** - what is there and what is missing;
   - **not met** - what is wrong or missing, with the evidence;
   - **exception (D<n>)** - not applied as written, and decision D<n> records it in the exception
     format (give its verdict: exception, adapted or convention kept). Check that the compensating
     control it names exists. If its review date has passed, report it as **exception (D<n>,
     review expired <date>)**: the entry must be renewed or the rule met;
   - **not applicable** - with the reason;
   - **cannot tell** - the evidence is outside the repository (server, provider settings, a
     contract); say what to check and with whom.

   Check the code, not the documentation: a rule is met when the code, config or pipeline enforces
   it. Run the project's checks when they exist and say what they returned.

   Rules marked _(convention)_ are consistency choices, not risk controls. Judge them the same way,
   but keep them in a separate **conventions** group: never count them with the security, privacy
   or reliability findings, never rank them among the most serious gaps. A project that keeps its
   own convention through a `convention kept` decision is an exception, not a gap.

5. **For each outside API the project calls**, fill in the partner API standard's evaluation table
   (section 8, PAPI-E1-E16) from the provider's documentation and the client code, and list what to
   ask the provider.
6. **Verify every "not met" before reporting it**: quote the line or show the missing piece, and
   give the scenario that goes wrong.

## Report

1. A summary: the standards and versions audited; per standard, the counts of met / partly / not
   met / exception / not applicable / cannot tell, given twice: for the **risk rules** and for the
   **conventions**; the five most serious gaps (risk rules only); and every exception whose review
   date has passed.
2. The findings on risk rules, most severe first (security and privacy, then reliability): rule ID,
   verdict, evidence, the failure scenario, the fix, and its size (small / medium / large).
3. The exceptions: rule IDs, decision, verdict, compensating control checked or not, review date
   (expired ones first), and deviations found in the log without the exception format.
4. The conventions: rule ID, verdict, what the project does instead, and the fix or the decision to
   record (`convention kept`).
5. What could not be checked from the repository, and who can answer it.
6. A proposed order of work.

Change nothing while auditing: no edits, no commits. The audit is a report; fixes are separate work
the owner of the project decides.
