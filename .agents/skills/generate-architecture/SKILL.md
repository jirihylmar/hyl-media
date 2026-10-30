---
name: generate-architecture
description: Draw or redraw a project's architecture as a few readable views (an overview, detail views, a flow chart, a swim lane) with the repository's generation script, from what the project has deployed and tracked rather than from its Phase-0 specification. Use when the deployed architecture or the tracked record has changed, or when a diagram is too large to read where it is shown.
---

# Generate architecture

Read `.claude/commands/generate-architecture.md` completely and execute it as the canonical procedure,
translating Claude tool names to available Codex capabilities. This project's architecture script
(`generate.py` beside its views) is edited when it was built from the command's template; any other is rewritten from that template, and what it
drew becomes material for the plan. Never draw or edit an image by hand. Verify the actual images
the script writes with the same readability check the command runs, after staging them, and look
at each one.
