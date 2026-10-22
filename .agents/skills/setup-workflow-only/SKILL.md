---
name: setup-workflow-only
description: Add syndicate session discipline to an existing project without replacing its code, structure or project-owned instructions. Use for workflow injection into an established repository; use $setup for a new project.
---

# Add workflow to an existing project

Read `.claude/commands/setup-workflow-only.md` completely and execute it as the canonical procedure,
translating Claude tool names to available Codex capabilities. Preserve existing `CLAUDE.md` and
`AGENTS.md` content, merge only the missing workflow entry, and install both `.claude` and `.agents`
surfaces. Do not treat this command as a default refresh.

Two answers are the operator's alone. Ask for the one-sentence `description` and write it to
`progress.json` with `description_reviewed`, never composing it; leave line 3 of a new `CLAUDE.md`
or `AGENTS.md` as the pointer at it. Ask what this repository manages (`PROJECT_CHARTER.md` § 14)
and write the `relations` block exactly as answered. Never seed `"members": []`, and leave the block
out while the question is unanswered.
