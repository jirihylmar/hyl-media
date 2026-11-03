---
name: refs-check
description: List the open pull requests and the branches not merged into a base branch, in this repository and in every member its progress.json relations block declares, and say which are bound to open work by ref and SHA. A member that cannot be read is NOT CHECKED, never clean. Use at session start and close, when asked what waits in this repository or its members, before merging or deleting a branch, and after binding or processing one.
---

# Open pull requests and unmerged branches

Read `.claude/skills/refs-check/SKILL.md` completely and execute its procedure as the canonical
workflow. The implementation is single-owned there and is executor-neutral Python; run it directly
from the project root.

```bash
python3 .claude/skills/refs-check/refs_check.py
```

Preserve these boundaries:

- The duty is stated once, in `PROJECT_CHARTER.md` section 14. Do not restate it here.
- Exit 3 means at least one item is UNBOUND. At session close it refuses the close until each item
  is bound to open work by `git_refs` or processed. Binding or a mechanical merge is the session's
  own work, not a question for the operator. Never delete an unmerged branch to shorten the list.
- Exit 4 means a repository or its pull requests were NOT CHECKED: unknown, never clean. Report it;
  it does not block a close.
- Exit 2 means `progress.json` could not be read, so no binding can be decided.
