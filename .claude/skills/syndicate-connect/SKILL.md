---
name: syndicate-connect
description: Give this machine a working route to the knowledge inbox from two inputs — the ingest URL and a per-host token — so every project on it can deliver knowledge extractions by HTTPS, regardless of where the project lives on disk. Proves the token against the endpoint, then records ~/.syndicate-remote-secrets/ingest.json. Invoke when a host reports NO ROUTE or spool, or when setting up a new or foreign machine.
---

# syndicate-connect

One command, two inputs: the ingest URL and a per-host token. Run once per **machine**, never per
project. Delivery is by HTTPS POST to the ingest endpoint — no ssh key, no `box.json`, no firewall.

## The property this guarantees

> **Where a project lives on disk is irrelevant to whether it can report.**

`/update-progress` § 11.0 resolves the route from `$HOME` alone. A project under `/mnt/c/Users/...`,
one under `~/work/...`, and one on a network path all use the same machine-level `ingest.json`.

## Procedure

The operator runs this with their ingest **URL**, in their own terminal, from this project's root
and outside the session. The **per-host token** is theirs to enter, never typed into a session,
whose transcript persists on disk (PROJECT_CHARTER.md § 8, *Git contains the recoverable system*):

```bash
bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>
```

At a terminal it prompts for the token without echo. A script that already holds the token pipes it
in instead (`<token source> | bash .claude/skills/syndicate-connect/connect.sh --url <ingest url>`),
as `syndicate-join` and the operator's member-host setup (the issuer's output, piped over ssh) do.
Either way the token reaches no command line:
`curl` reads it from a config on stdin and `python3` from its environment. The old `--token` option
still works but warns, because a value there sits in the process list and the shell history. That
is all — outbound HTTPS is the only requirement, so it works behind any firewall.

## What it does, in order

1. **Refuses `$HOME` on a Windows mount** (`/mnt/...`) — the token file would be world-readable there.
2. **Refuses sudo/root** — `ingest.json` would land in `/root`, where the session resolver never looks.
3. **Proves the token before writing anything.** It POSTs an *empty body*: the endpoint checks auth
   first, so `401` means the token is bad and `400` (empty body refused) means the token is **good** —
   this validates the credential without delivering a file. `000`/`5xx` means the endpoint is
   unreachable. On any failure it writes nothing and the host stays on `spool` (loud), never `ingest`
   (confident, and wrong).
4. **Writes** `~/.syndicate-remote-secrets/ingest.json` = `{url, token}`, mode 600.
5. **Resolves the route** as § 11.0 does and prints it. Must be `ingest`, on the box too: a checkout
   of the inbox in `$HOME` is not a route. The retired `direct` route wrote into the box's, and the
   extractions there were never committed (83 never reached curation).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | route proven and recorded |
| `1` | usage error, or an environment that cannot work (`$HOME` on a Windows mount, sudo, no `curl`, no/`http` URL) |
| `3` | token rejected, or endpoint unreachable — **nothing written** |

## If this machine is outside the syndicate

It is if it joined with `join-syndicate.sh` (it has `~/.local/bin/syndicate-join`) and is not one of
the operator's own hosts: the workstation, the remote dev box, or a member host (a machine of the
operator's reached only from the workstation over a VPN). Two facts follow, and an agent here should
act on them without waiting for chat:

1. **`/distribute-defaults` never reaches you** — updates do not arrive on their own. If your command
   or skill files look older than the operator's, that is expected, not broken.
2. **You refresh yourself** with one command in a WSL terminal: `syndicate-join` (and
   `syndicate-join --check` to see whether everything is current, changing nothing). It also sets up
   this inbox route, so on such a machine you do not run `connect.sh` by hand. Do not run
   `distribute-defaults.sh` yourself; it is the operator's tool. Full lifecycle:
   `syndicate-playbooks-examples/README.md` § *Syndicate External Onboarding*.

If this host is stuck on a stale delivery route (e.g. it still tries `scp`/`box.json` and spools),
the fix is that refresh: it brings the current `/update-progress`, which knows the `ingest` route.

## What retired with the SSH model

`box.json`, the PEM, the ssh key install, the security-group `/32` allowlisting, and the `/mnt/c`
key-permission trap are all gone — there is no key to place. The token is a *delivery* credential to
*one* endpoint that only appends a review-pending file to the inbox; it grants no shell.

## Related

- `/update-progress` § 11.0 — the resolver this satisfies (`ingest` / `spool`, on every host).
- `docs/knowledge-ingest-lambda-instruction.md` — the endpoint's architecture and security posture.
