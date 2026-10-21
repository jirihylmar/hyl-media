---
name: central-sign-in
description: How an internal app of the operator gets a login the tested way (Google or an emailed code through central access, started with one line to the operator), and when it does not apply (customer-facing products keep their own). Use before adding, changing or fixing sign-in, login, authentication, a password or basic-auth guard, or access control for any page, dashboard, admin or project-management app.
---

# Sign-in for internal apps

Read `.claude/skills/central-sign-in/SKILL.md` completely and follow it: its rule section is the
agreed rule, word for word, and its numbered steps are the procedure.

In short: decide first whether the app is internal (the operator's own people use it) or a
customer-facing product with its own user ecosystem. A customer-facing product is out of scope and
keeps its own sign-in. An internal app joins central access with a one-line onboarding request to
the operator and builds no login of its own in the meantime. Do not restate or reword the rule in
Codex prose; the canonical file is the only text.
