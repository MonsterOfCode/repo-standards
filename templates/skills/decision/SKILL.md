---
name: decision
description: Record a decision as the next numbered D-entry in docs/decisions.md. Use for any non-obvious or cross-cutting choice, or when a person decides something worth keeping.
argument-hint: "[short title of the decision]"
---

# Record a decision

1. Search the log for the topic (`grep -n -i '<keyword>' docs/decisions.md`). If an entry covers it,
   add a dated "Update" paragraph to it, or write a new entry that says which one it supersedes.
2. Right before writing (other sessions add entries in parallel), take the next number:
   `grep -o '^## D[0-9]*' docs/decisions.md | sort -t D -k2 -n | tail -1`. Append after the last entry.
3. Write it in the log's format: title phrased as the outcome; status with the absolute date and who
   decided; context; decision (concrete names: codes, permissions, files, endpoints); why, with the
   alternatives rejected; consequences and tests. As short as the decision allows.
4. Cite the number in the code that enforces a non-obvious rule (`// D42: ...`).
5. Mention the number in your summary and in `STATUS.md`.
