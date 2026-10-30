---
name: docs-check
description: Check that docs/ holds only what persists - no phase, session, task or working-state names, no hand-off outside docs/handoff/, every dated file or directory marked as a dated record, every architecture diagram readable at the width it is shown. Use after git add, before you commit anything under docs/ (the commit guard runs it then anyway), when the commit guard or repo-hygiene names a docs-check finding, and after regenerating diagrams.
---

# Check docs/

Read `.claude/skills/docs-check/SKILL.md` completely and apply its canonical rules. Run the
shared checker from the project root:

```bash
python3 .claude/skills/docs-check/docs_check.py                  # everything tracked under docs/
python3 .claude/skills/docs-check/docs_check.py --staged         # what this commit adds or changes
python3 .claude/skills/docs-check/docs_check.py --diagrams-only  # only docs/architecture/ images
```

Exit `0` nothing found, `1` findings, `2` could not check. On exit `2` the unread paths are named,
the findings for the rest are still printed, and the run is never clean; with `--json`, `complete`
is then `false`. It reads only what git tracks or has staged: run it after `git add`.

The checker reads names, the first lines of dated text files and image headers from the tracked
tree, never prose. Whether a document is canonical and current is the hygiene pass's judgement.
Do not reproduce or weaken the checks in Codex prose; this adapter and Claude run the same
executable checker.
