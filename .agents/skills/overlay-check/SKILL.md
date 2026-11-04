---
name: overlay-check
description: Validate this project's local-overlay splice anchors against the canonical the next distribution splices onto (or, where this machine has none, its own delivered command files) before a distribution rejects them. Use after editing anything under .claude/local-overlays/, or when a distribution reported broken-overlay.
---

# Check local-overlay anchors

Read `.claude/skills/overlay-check/SKILL.md` completely and apply its canonical rules. Run the
shared checker from the project root:

```bash
python3 .claude/skills/overlay-check/overlay_check.py
```

Exit `0` every anchor binds uniquely, `1` at least one problem, `2` no overlays present.
Its first line says what it checked against. When a distribution or `syndicate-join` called an
overlay broken and this says ok, it read a delivered copy that still holds the old line. On an
outside machine or the operator's workstation, run
`python3 ~/syndicate-playbooks-examples/_project-template/.claude/skills/overlay-check/overlay_check.py`
from the project root instead. On a box or a member host there is no canonical: change the anchor to
the line the distribution named, or ask the operator for the line the canonical now has.

An anchor that matches zero lines blocks the operator's next distribution for **every project on
this host**, not just this one; on an outside machine, `syndicate-join` leaves only this project out. An anchor that matches more than one line is resolved first-match-wins and
reports nothing, so the overlay lands somewhere the author did not choose. Do not reproduce or
weaken the checks in Codex prose; this adapter and Claude run the same executable checker.
