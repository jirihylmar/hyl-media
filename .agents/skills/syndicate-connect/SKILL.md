---
name: syndicate-connect
description: Connect this machine to the syndicate knowledge inbox using an ingest URL and per-host token, proving the route before recording it. Use for a new host or when reporting says NO ROUTE or spool.
---

# Connect this host

Read `.claude/skills/syndicate-connect/SKILL.md` completely before acting; it is the canonical
security and failure contract. Ask the operator to run the shared implementation with their ingest
URL, in their own terminal, from the project root and outside this session. It prompts for the
per-host token without echo (PROJECT_CHARTER.md § 8, *Git contains the recoverable system*):

```bash
bash .claude/skills/syndicate-connect/connect.sh --url <ingest-url>
```

Never ask for the token in the conversation, and never print or persist it anywhere except through
that script. It must prove the token before writing the machine-level route, and a failed proof must
leave no route behind.
