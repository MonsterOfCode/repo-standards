<!-- Template of the agents standard (section 4). Append-only; never renumber. Delete this comment. -->

# Decisions

Each decision has a number, never reused. To change one, add a dated update to it, or a new
decision that says which one it supersedes. Code enforcing a non-obvious rule cites its number.

---

## D1 — <the decision, phrased as the outcome>

**Status:** 🟢 Decided by <who> (<YYYY-MM-DD>) and implemented. <or 🟡 Open, ⚪ Deferred>

**Context.** <Why this came up, in one or two sentences.>

**Decision.** <What was decided, concretely: names of permissions, error codes, files, endpoints.>

**Why.** <The reasoning, and the alternatives rejected.>

**Consequences / tests.** <What changes elsewhere, and which tests lock it in.>

---

<!-- Template for an exception to an engineering standard (README, "Exceptions and adaptations").
One entry may cover several rules. An audit finds it by the rule IDs. Delete this comment. -->

## D2 — Exception: <rule IDs, e.g. API-B1 API-L2> <short description>

**Status:** 🟢 Decided by <who> (<YYYY-MM-DD>).

**Rules:** <one or more rule IDs, e.g. API-B1, API-L2>

**Verdict:** <exception (not applied) | adapted (applied differently) | convention kept (the project keeps its own convention)>

**Reason:** <Why the rule is not applied as written.>

**Compensating control:** <What replaces the risk control, or "none needed - convention".>

**Review date:** <YYYY-MM-DD, when this is looked at again; "none" is allowed for a convention kept.>

**Owner:** <Who decided and answers for it.>

---
