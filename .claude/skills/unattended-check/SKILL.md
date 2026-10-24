---
name: unattended-check
description: Decide whether an operation this project started is actually being watched — session-watched, durably supervised, or unmonitored — by probing the supervisor rather than trusting what was said about it. Refuses a yield when a non-terminal operation has no proved watcher, and classifies every claimed operation at session start. Invoke before ending a turn that leaves work depending on a future external state change, when resuming a project that claims a background job, or when asked whether something is still running.
---

# Unattended operation check

One implementation of `PROJECT_CHARTER.md` § 11, *Unattended operations*. The rules live in the
charter, for both executors; this skill is what makes them decidable.

```bash
python3 .claude/skills/unattended-check/unattended_check.py --gate        # before a final response
python3 .claude/skills/unattended-check/unattended_check.py --reconcile   # at session start
python3 .claude/skills/unattended-check/unattended_check.py --probe <id>  # recording a check
```

`--gate` and `--reconcile` read `progress.json` and act on the `unattended` block of every
**non-terminal** task. A task without one is not an unattended operation and is never reported.
`--probe` reads the one task you name, terminal or not (see below).

**Exit codes.** `0` permitted / nothing to recover · `3` yield refused (`--gate`) or a watcher needs
recovery first (`--reconcile`) · `2` `progress.json` could not be read, which means the state of
every operation is **unknown** — never read that as *none*. `--probe` exits `0` when its check
completed, whether alive or not, and `2` when no task has that id and a `liveness_check`, when the
check did not complete, when it holds a shell operator that `--probe` refuses (below), or when there
is no `progress.json`.

## The block

```json
"unattended": {
  "operation_id":      "capacity-p5en-2026-09-02",
  "supervisor_id":     "capacity-watch.timer",
  "supervisor_mode":   "durably-supervised",
  "state_ref":         "journal:capacity-watch",
  "started_at":        "2026-09-02T08:00:00Z",
  "last_observed_at":  "2026-09-02T08:40:00Z",
  "next_action_at":    "2026-09-02T09:40:00Z",
  "deadline_at":       "2026-09-03T08:00:00Z",
  "retry_count":       1,
  "retry_limit":       6,
  "delivery_state":    "pending",
  "cleanup_state":     "leased",
  "cleanup_owner":     "capacity-guardian.timer",
  "notification_state":"project-notice",
  "liveness_check":    "systemctl --user is-active capacity-watch.timer",
  "liveness_seen_failing": "2026-09-02T07:55:00Z exit 3: systemctl --user is-active capacity-watch.timer"
}
```

`supervisor_mode` is `session-watched`, `durably-supervised` or `unmonitored`. `delivery_state` is
`pending`, `delivered`, or one of the five non-delivery terminals — `capacity-exhausted`,
`workload-failed`, `controller-crashed`, `cleanup-failed`, `deadline-missed`. **Only `delivered`
means the outcome happened.**

**`liveness_check`, `liveness_seen_failing` and `state_ref` are host-owned; everything else
travels.** The check runs `liveness_check` and never interprets it, so a project may name a systemd
unit, a launchd label, a cron entry or a pid file without this skill knowing what any of those are.
`liveness_seen_failing` repeats that command. Every other field is read on machines where a host
path would mean nothing, so an absolute `/home/...` in one of them is reported.

**A `liveness_check` counts only once it has been seen to fail** (`PROJECT_CHARTER.md` § 10,
*Verify reality*). Record the block, then, before you start the target, run
`unattended_check.py --probe <task id>`: it runs the recorded check exactly as the gate does and
must report not alive. Copy the line it prints into `liveness_seen_failing`, start the target, and
see `--probe` report alive. The check notes, without refusing, a durably supervised operation not
yet delivered or failed whose `liveness_seen_failing` has no line showing its current
`liveness_check` exiting non-zero. A line that names the command but shows `exit 0` does not count,
and a changed check needs a new line. Never stop a running target to clear the note: run `--probe`
the next time the target is stopped, before it starts again.

The check runs without a shell, so `$(...)`, a pipe or `&&` reaches the command as a literal word:
only the first command runs, with the rest as its arguments. Only single quotes protect: inside
double quotes a shell still runs `$(...)` and a backtick, and the check does not, so
`kill -0 "$(cat <pidfile>)"` can never succeed. The script of a `-c` option is the exception, since
`sh -c "..."` runs it in a shell. A `liveness_check` holding `&&`, `||`, `|`, `;`, a line break,
`>` or `<` outside quotes, or `$(` or a backtick outside single quotes, is noted by `--gate` and
`--reconcile`, never refused.
`--probe` refuses `&&`, `||`, `|`, `;`, `$(` and a line break: it exits `2` and records no line,
so the check stays unproved until it is one command; put a compound check inside `sh -c '...'`,
in single quotes, because inside double quotes the check keeps a backslash that a shell would drop.
A backtick, `>` or `<` is only a note, and `--probe` still prints its line: without a shell each
is a character of one word, as in an unquoted JMESPath literal (``--query X[?Y==`Z`]``).
Avoid `pgrep -f`: it matches any process whose command line holds the pattern, the `sh -c` running
it included, so a dead target reads as alive. Use a unit state
(`systemctl --user is-active <unit>`), a pid file read as `sh -c 'kill -0 "$(cat <pidfile>)"'`,
where `sh -c` is safe because `kill -0` matches nothing by name, or `pgrep -x <name>`, which
matches a process name of at most 15 characters.

## What it will not do

It will not decide that an operation is fine because the task text says so, and it will not treat a
supervisor's exit status as delivery. Those are the two failures it exists for: a supervisor that
returned `0` on capacity exhaustion once made a failed delivery read as service success, and an
executor that said it was monitoring had already ended the turn that was doing the monitoring.

## Related

- `PROJECT_CHARTER.md` § 11 — the contract itself, and the only place its rules are stated.
- `/update-progress` Step 9a — runs `--gate`; `/start-session` Step 6a — runs `--reconcile`.
- `/open-work` — renders open work; this skill answers a different question about the same tasks.
