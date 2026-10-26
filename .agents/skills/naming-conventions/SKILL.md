---
name: naming-conventions
description: How every name a project creates says whose it is - AWS resources, standing processes and containers start with the project's full origin repository name, never an abbreviation, and every AWS resource, new or existing, carries the tag origin=<owner>/<repository>. Use before naming or creating any resource, when writing infrastructure code, or when asked whose a resource is.
---

# Naming conventions

Read `.claude/skills/naming-conventions/SKILL.md` completely and follow it: its rule section is the
agreed rule, word for word, and its numbered steps are the procedure.

In short: every new name starts with this project's origin repository name in full (`<project>-<what>`;
a bucket `<project>-<what>-<account id>`), never an abbreviation; every AWS resource, new and existing,
carries the tag `origin=<owner>/<repository>`; existing names change only when the resource is rebuilt
anyway; a policy that allows only an old prefix is widened first, through the request mailbox. Do not
restate or reword the rule in Codex prose; the canonical file is the only text.
