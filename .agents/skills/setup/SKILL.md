---
name: setup
description: Initialize a new syndicate project from the selected playbook, or route an existing project to workflow-only setup. Use after Phase 0 selects a playbook and confirms environment facts.
---

# Set up a project

Read `.claude/commands/setup.md` completely and execute it as the canonical procedure, translating
Claude tool names to available Codex capabilities. Preserve the scenario distinction, naming
invariants, AWS identity proof and project-owned instruction boundaries. Install both `.claude` and
`.agents` executor surfaces; never commit `.codex/` host configuration.

Two answers are the operator's alone. Ask for the one-sentence `description` and write it to
`progress.json` with `description_reviewed`, never composing it; leave line 3 of `CLAUDE.md` and
`AGENTS.md` as the pointer at it. Ask what this repository manages (`PROJECT_CHARTER.md` § 14) and
write the `relations` block exactly as answered. Never seed `"members": []`, and leave the block out
while the question is unanswered.
