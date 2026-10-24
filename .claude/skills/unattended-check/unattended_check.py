#!/usr/bin/env python3
"""unattended_check.py — the one implementation of PROJECT_CHARTER.md § 11, Unattended operations.

Two modes, one body of rules, because the pre-yield gate and the session-start reconciliation ask
the SAME question — "is this operation actually being watched?" — and answering it twice in prose
is how the two answers drift apart:

  --gate       before a final response.  Exit 3 if any operation must refuse the yield.
  --reconcile  at session start.         Exit 0 always; exit 3 if a watcher needs recovery FIRST.

--probe TASK_ID is not a third answer to that question. It runs one task's recorded liveness_check
once, as the gate does, and prints the line that liveness_seen_failing records — unless the check
holds one of PROBE_REFUSES where a shell would act on it ($( outside single quotes, the rest
outside quotes), which it names instead. A backtick, > or < is only noted, by --probe too (see
SHELL_OPERATORS).

WHY THIS EXISTS (models-trainer, 2026-09-01). An executor said it was monitoring an AWS capacity
operation. It then sent a final response, which ended polling. Its systemd supervisor went inactive
and nothing noticed. No retry happened for over eight hours. Promised 30-minute reports never fired.
The supervisor returned exit 0 for capacity exhaustion, so a FAILED DELIVERY READ AS SUCCESS. And
the next session did not reconcile the promised watcher against its live state before doing other
work. Every one of those is checkable from recorded state plus one host-owned liveness command, and
none of them was checked, because nothing was recorded and nothing ran.

HOST-OWNED vs TRAVELLING. `liveness_check`, `liveness_seen_failing` and `state_ref` are
host-owned: they may name a systemd unit, a launchd label, a cron entry, a pid file, an absolute
path. Everything else travels between hosts in progress.json and must stay portable — an absolute
/home/... path in a travelling field is reported, because progress.json is read on machines where
it means nothing. `liveness_seen_failing` records one observed failure of `liveness_check`: it is
the line --probe prints, `<time> exit <code>: <command>`, so it repeats the command. Only a
non-zero exit of the current command counts, so a changed check is noted until it has been seen
failing again.
"""

import argparse
import datetime
import json
import os
import re
import shlex
import subprocess
import sys

TERMINAL_TASK = {"complete", "completed", "superseded", "done", "closed", "dropped",
                 "cancelled", "canceled", "resolved", "obsolete", "abandoned"}

MODES = ("session-watched", "durably-supervised", "unmonitored")

# The charter's six terminal outcome classes, plus the one non-terminal value. `delivered` is the
# ONLY one that means the outcome happened; every other terminal value is a non-delivery, and that
# separation is the whole point — a supervisor may exit 0 on capacity exhaustion and must not have
# that read as success.
DELIVERY_STATES = ("pending", "delivered", "capacity-exhausted", "workload-failed",
                   "controller-crashed", "cleanup-failed", "deadline-missed")
NON_DELIVERY_TERMINAL = ("capacity-exhausted", "workload-failed", "controller-crashed",
                         "cleanup-failed", "deadline-missed")

REQUIRED = ("operation_id", "supervisor_id", "supervisor_mode", "state_ref", "started_at",
            "last_observed_at", "next_action_at", "deadline_at", "retry_count", "retry_limit",
            "delivery_state", "cleanup_state", "cleanup_owner", "notification_state")

TRAVELLING = ("operation_id", "supervisor_id", "supervisor_mode", "started_at", "last_observed_at",
              "next_action_at", "deadline_at", "delivery_state", "cleanup_state", "cleanup_owner",
              "notification_state")

ABS_HOST_PATH = re.compile(r"(^|[\s\"'])(/home/|/Users/|/root/|[A-Za-z]:\\)")

# A note, never a refusal: the refusal list is the charter's (section 11), and a new refusal would
# block every operation already recorded. CASE 12 forbids two words in this output; keep them out.
NEVER_SEEN_FAILING = ("liveness_check has not been recorded failing (liveness_seen_failing does "
                      "not show it exiting non-zero): until it is, its pass may come from a check "
                      "that cannot fail. Run --probe while the target is stopped, and never stop a "
                      "running one for this; see SKILL.md")

# One line --probe printed: `<time> exit <code>: <command>`. The time is not parsed.
SEEN_FAILING_LINE = re.compile(r"\bexit (-?\d+): (.+?)\s*$")

# The check runs without a shell, so a shell operator where a shell would act on it reaches the
# first command as an argument: `A && B` runs A alone, with `&&`, B and B's arguments as A's, and
# B never runs. models-trainer, 2026-10-02: a unit check `&&` a process check ran as one systemctl
# call with seven arguments, and it was seen failing whenever the unit was down, so the record
# looked proved while its second half had never run. --gate and --reconcile note every operator
# below, for the same reason as NEVER_SEEN_FAILING, and never refuse because of one.
#
# --probe refuses PROBE_REFUSES: it exits 2 and prints no line, because a failure of the first
# command alone would be recorded as a failure of the whole check. A line break is POSIX's other
# spelling of `;`. A backtick, > or < (NOTED_ONLY) is only a note there too, and --probe prints its
# line: without a shell each is a character of one word, as in an unquoted JMESPath literal such as
# --query X[?Y==`Z`], and the check works as written. `||` comes before `|`, so it is named as
# itself. A lone `&` is left out: unquoted in a URL it is a word here, and the check works as
# written.
#
# Only single quotes protect. Inside double quotes a POSIX shell still runs `$(...)` and a backtick,
# and this check does not (EXPANDED_IN_DOUBLE_QUOTES), so `kill -0 "$(cat f)"` hands kill the text
# `$(cat f)` as its pid, cat never runs, and the check can never succeed. The one exception is the
# script of a -c option: sh -c "kill -0 $(cat f)" gives sh that text, and sh runs the substitution.
PROBE_REFUSES = ("&&", "||", "$(", "|", ";", "\n")
NOTED_ONLY = (">", "<", "`")
SHELL_OPERATORS = PROBE_REFUSES + NOTED_ONLY
EXPANDED_IN_DOUBLE_QUOTES = ("$(", "`")
SCRIPT_OPTION = re.compile(r"-[A-Za-z]*c[A-Za-z]*\Z")   # -c, -ec, -lc: the next word is a script
# Both notes take (operator, where): where() says which quotes it stood outside.
SHELL_OPERATOR_NOTE = ("liveness_check holds the shell operator %r %s, and it runs without a "
                       "shell, so only its first command runs, with the rest as its arguments: its "
                       "answer says nothing about the rest, and --probe records no line for it, so "
                       "it stays unproved. Make it one command, or put it inside sh -c '...'; see "
                       "SKILL.md")
NOTED_ONLY_NOTE = ("liveness_check holds the shell operator %r %s, and it runs without a shell, "
                   "so its command receives it as a character of a word, never as a redirection or "
                   "a command substitution. That is right in a word such as an unquoted JMESPath "
                   "literal (--query X[?Y==`Z`]), and --probe records its line; if a shell was "
                   "meant, put the check inside sh -c '...'; see SKILL.md")


def where(op):
    """Where a named operator stood: a shell runs EXPANDED_IN_DOUBLE_QUOTES inside double quotes
    too, so for those two 'outside quotes' would be false."""
    return "outside single quotes" if op in EXPANDED_IN_DOUBLE_QUOTES else "outside quotes"


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _ts(v):
    """Parse an ISO-8601 instant. Returns None if absent or unparseable — the caller decides what
    an unreadable time MEANS, because 'absent' and 'malformed' are both failures here but neither
    may be silently read as 'fine'."""
    if not v or not isinstance(v, str):
        return None
    s = v.strip().replace("Z", "+00:00")
    try:
        d = datetime.datetime.fromisoformat(s)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)


def _tasks(data):
    ph = data.get("phases") or {}
    items = ph.items() if isinstance(ph, dict) else enumerate(ph)
    for key, p in items:
        if not isinstance(p, dict):
            continue
        ts = p.get("tasks") or []
        ts = list(ts.values()) if isinstance(ts, dict) else ts
        for t in ts:
            if isinstance(t, dict):
                yield key, t


def shell_operator(cmd, ops=SHELL_OPERATORS):
    """The first of ops in cmd where a shell would act on it and this check does not, else None:
    the earliest position wins, then the order of ops. Quotes are read as a POSIX shell reads
    them. Nothing is special inside single quotes, so the sh -c '...' that SKILL.md recommends for
    a compound check is one word, and never named. Inside double quotes an operator is a word,
    except EXPANDED_IN_DOUBLE_QUOTES, which a shell still runs there, and this check does not:
    `kill -0 "$(cat f)"` is named.

    One word is exempt from that: the script of a -c option (SCRIPT_OPTION, the word before it),
    as in sh -c "kill -0 $(cat f)", because the program given -c runs its script in a shell, so the
    substitution runs after all. A backslash outside single quotes makes the next character a word.
    (shlex.split, which runs the check, keeps a backslash before $ or a backtick inside double
    quotes where a shell drops it, so sh -c "kill -0 \\$(cat f)" hands its shell \\$( and fails:
    write a -c script in single quotes, as SKILL.md does.)"""
    quote, i, start, prev = None, 0, 0, ""
    while i < len(cmd):
        c = cmd[i]
        if quote == "'":
            quote = None if c == "'" else quote
        elif c == "\\":
            i += 1
        elif quote == '"' and c == '"':
            quote = None
        elif quote is None and c in "'\"":
            quote = c
        else:
            script = quote == '"' and SCRIPT_OPTION.match(prev)
            for op in ops:
                if (quote is None or (op in EXPANDED_IN_DOUBLE_QUOTES and not script)) \
                        and cmd.startswith(op, i):
                    return op
            if quote is None and c in " \t\n":                # a word ends: remember it
                prev = cmd[start:i] if i > start else prev
                start = i + 1
        i += 1
    return None


def _run_check(cmd, timeout):
    """Run a liveness command exactly as the gate does: split, no shell. Returns (exit code,
    detail). The exit code is None when the command timed out or could not run at all, because
    a check that never completed has observed nothing — neither alive nor dead. A shell operator
    in cmd is not refused here: callers name it with shell_operator() and operator_note()."""
    try:
        r = subprocess.run(shlex.split(cmd), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "liveness_check timed out after %ss" % timeout
    except Exception as e:                                   # noqa: BLE001 - report, never raise
        return None, "liveness_check could not run: %s" % e
    return r.returncode, (r.stdout or r.stderr or "").strip()[:200]


def _probe(cmd, timeout):
    """Run the project's own liveness command. NOT INTERPRETED, only run: this file must never
    learn what systemd is. A non-zero exit means 'not alive'; a missing command means 'unproved',
    and those are different answers (see classify). A check that did not complete is 'not alive'
    here: the gate may not borrow a pass it never saw."""
    if not cmd or not isinstance(cmd, str):
        return None, "no liveness_check declared"
    rc, detail = _run_check(cmd, timeout)
    return (rc == 0), detail


def _noted_check(op):
    """The liveness_check of a durably supervised operation not yet delivered or failed, else None:
    the one scope both notes share. Terminal delivery states take classify()'s early exit, so the
    gate and reconcile agree, and finished work has nothing to stop."""
    mode = str(op.get("supervisor_mode") or "").strip().lower()
    delivery = str(op.get("delivery_state") or "").strip().lower()
    cmd = op.get("liveness_check")
    if mode != "durably-supervised" or not isinstance(cmd, str) or not cmd.strip():
        return None
    if delivery == "delivered" or delivery in NON_DELIVERY_TERMINAL:
        return None
    return cmd


def seen_failing_note(op):
    """NEVER_SEEN_FAILING for an operation in _noted_check()'s scope whose liveness_seen_failing
    holds no line in which its current liveness_check exited non-zero; else None. Naming the
    command is not enough: a copied alive line (`exit 0: <cmd>`), free text, or a longer command
    that contains it proves no failure. Decided from the record alone: it never runs the probe, so
    the gate does not run a check twice."""
    cmd = _noted_check(op)
    if cmd is None:
        return None
    for line in str(op.get("liveness_seen_failing") or "").splitlines():
        m = SEEN_FAILING_LINE.search(line)
        if m and int(m.group(1)) != 0 and m.group(2) == cmd.strip():
            return None
    return NEVER_SEEN_FAILING


def operator_note(cmd):
    """The note for a liveness_check holding a shell operator that shell_operator() names, else
    None: SHELL_OPERATOR_NOTE naming the first of PROBE_REFUSES when it holds one, wherever a
    NOTED_ONLY character stands before it, else NOTED_ONLY_NOTE naming the first of those. --gate,
    --reconcile and --probe all name it through here, so they never disagree about which it is."""
    found = shell_operator(cmd, PROBE_REFUSES)
    if found:
        return SHELL_OPERATOR_NOTE % (found, where(found))
    found = shell_operator(cmd, NOTED_ONLY)
    return NOTED_ONLY_NOTE % (found, where(found)) if found else None


def shell_operator_note(op):
    """operator_note() for an operation in _noted_check()'s scope, whatever liveness_seen_failing
    records: a recorded failure of a check holding one of PROBE_REFUSES may be its first command's
    alone. Else None."""
    cmd = _noted_check(op)
    return operator_note(cmd.strip()) if cmd else None


def notes(op):
    """Every note for op, in the order printed. Notes never refuse a yield."""
    return [n for n in (shell_operator_note(op), seen_failing_note(op)) if n]


def classify(op, now, timeout):
    """Return (state, reasons, alive). One classification, used by both modes."""
    reasons = []
    mode = str(op.get("supervisor_mode") or "").strip().lower()
    delivery = str(op.get("delivery_state") or "").strip().lower()

    missing = [f for f in REQUIRED if op.get(f) in (None, "")]
    # retry_count 0 is legitimate and must not read as missing.
    missing = [f for f in missing if not (f in ("retry_count", "retry_limit")
                                          and isinstance(op.get(f), int))]
    if missing:
        reasons.append("missing required field(s): %s" % ", ".join(missing))
    if mode not in MODES:
        reasons.append("supervisor_mode %r is not one of %s" % (op.get("supervisor_mode"), ", ".join(MODES)))
    if delivery and delivery not in DELIVERY_STATES:
        reasons.append("delivery_state %r is not one of %s" % (op.get("delivery_state"), ", ".join(DELIVERY_STATES)))

    for f in TRAVELLING:
        v = op.get(f)
        if isinstance(v, str) and ABS_HOST_PATH.search(v):
            reasons.append("%s carries a host-specific absolute path; this field travels between "
                           "hosts in progress.json — use a portable identifier" % f)

    if delivery == "delivered":
        return "terminal-success", reasons, None
    if delivery in NON_DELIVERY_TERMINAL:
        reasons.append("delivery_state is %r — terminal, and NOT a delivery" % delivery)
        return "terminal-non-delivery", reasons, None

    alive, detail = (None, "")
    if mode == "durably-supervised":
        alive, detail = _probe(op.get("liveness_check"), timeout)
        if alive is None:
            reasons.append("claims durable supervision but declares no liveness_check, so the "
                           "supervisor cannot be proved alive")
        elif not alive:
            reasons.append("supervisor %r is NOT active (%s)" % (op.get("supervisor_id"), detail or "probe failed"))
        reasons.extend(notes(op))

    nxt, dl = _ts(op.get("next_action_at")), _ts(op.get("deadline_at"))
    if dl is not None and now > dl:
        reasons.append("deadline %s has passed with no terminal delivery_state" % op.get("deadline_at"))
        return "overdue", reasons, alive
    if nxt is None:
        reasons.append("next_action_at is absent or unparseable, so nothing is scheduled to happen")
        return ("watcher-missing" if mode == "durably-supervised" else "state-unknown"), reasons, alive
    if now > nxt:
        reasons.append("next_action_at %s has passed" % op.get("next_action_at"))
        return "overdue", reasons, alive

    if mode == "unmonitored":
        reasons.append("no watcher is running")
        return "unmonitored", reasons, alive
    if mode == "durably-supervised":
        return ("running-healthy" if alive else "watcher-missing"), reasons, alive
    return "session-watched", reasons, alive


def gate(ops, now, timeout):
    """The charter's six refusal conditions. A yield is refused if ANY fires."""
    refusals = []
    for key, tid, name, op in ops:
        state, reasons, _ = classify(op, now, timeout)
        why = []
        delivery = str(op.get("delivery_state") or "").strip().lower()
        mode = str(op.get("supervisor_mode") or "").strip().lower()
        terminal = delivery == "delivered" or delivery in NON_DELIVERY_TERMINAL

        if not terminal and mode != "durably-supervised":
            why.append("operation is non-terminal and no durable supervisor is proved "
                       "(supervisor_mode=%r)" % op.get("supervisor_mode"))
        if not terminal and state in ("watcher-missing",):
            why.append("supervisor is inactive before delivery")
        if not terminal and _ts(op.get("next_action_at")) is None:
            why.append("next observation time is absent")
        elif not terminal and _ts(op.get("next_action_at")) and now > _ts(op.get("next_action_at")):
            why.append("next observation time has already passed")
        dl = _ts(op.get("deadline_at"))
        if not terminal and dl is not None and now > dl:
            why.append("deadline has passed with no terminal result")
        if not str(op.get("cleanup_owner") or "").strip():
            why.append("no independent cleanup owner is named")
        if str(op.get("reports_every") or "").strip() and not str(op.get("notification_state") or "").strip():
            why.append("periodic reporting was promised but no scheduler and notification route exist")

        if why:
            refusals.append((tid, name, op.get("operation_id"), state, why + reasons))
    return refusals


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    # One at a time: `--gate --probe` must not run the probe and return a passing code for a gate
    # that never ran.
    what = ap.add_mutually_exclusive_group()
    what.add_argument("--gate", action="store_true",
                      help="pre-yield gate; exit 3 to refuse the yield")
    what.add_argument("--reconcile", action="store_true", help="session-start classification")
    what.add_argument("--probe", metavar="TASK_ID",
                      help="run that task's RECORDED liveness_check as the gate does and print the "
                           "line to record in liveness_seen_failing")
    ap.add_argument("--file", default="progress.json")
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if not (a.gate or a.reconcile or a.probe):
        ap.error("choose --gate, --reconcile or --probe")

    try:
        with open(a.file) as fh:
            data = json.load(fh)
    except FileNotFoundError:
        if a.probe:
            print("unattended-check: no %s here — no task %s to probe" % (a.file, a.probe))
            return 2
        print("unattended-check: no %s here — nothing to check" % a.file)
        return 0
    except Exception as e:                                   # noqa: BLE001
        print("unattended-check: CANNOT READ %s (%s) — the state of every unattended operation in "
              "this project is UNKNOWN, which is not the same as none" % (a.file, e))
        return 2

    if a.probe:
        # The command comes from the record, never from argv: a command passed on the command line
        # would itself be matched by `pgrep -f`, and the probe would read its own caller as alive.
        cmd = None
        for key, t in _tasks(data):
            op = t.get("unattended")
            lc = op.get("liveness_check") if isinstance(op, dict) else None
            if str(t.get("id")) == a.probe and isinstance(lc, str) and lc.strip():
                cmd = lc.strip()
                break
        if cmd is None:
            print("unattended-check: no task %s with a liveness_check to probe" % a.probe)
            return 2
        # Not run: a failure of its first command would print a line that proves the whole check.
        # A NOTED_ONLY character is a word without a shell, so that check runs, and is noted below.
        op_found = shell_operator(cmd, PROBE_REFUSES)
        if op_found:
            print("unattended-check: the check holds the shell operator %r %s and runs without a "
                  "shell, so only its first command would run. Not run, and no line to record: "
                  "make it one command, or put it inside sh -c '...'."
                  % (op_found, where(op_found)))
            return 2
        rc, detail = _run_check(cmd, a.timeout)
        if rc is None:
            print("unattended-check: the check did not complete (%s). Fix it: this is not a "
                  "failure to record." % detail)
            return 2
        print("%s exit %d: %s" % (_now().strftime("%Y-%m-%dT%H:%M:%SZ"), rc, cmd))
        print("%s%s" % ("alive. The check counts once it has also been seen to fail with the "
                        "target stopped." if rc == 0 else
                        "not alive. Record the line above in liveness_seen_failing.",
                        (" (%s)" % detail) if detail else ""))
        note = operator_note(cmd)
        if note:
            print("note: %s" % note)
        return 0

    ops = []
    for key, t in _tasks(data):
        op = t.get("unattended")
        if not isinstance(op, dict):
            continue
        if str(t.get("status") or "").strip().lower() in TERMINAL_TASK:
            continue
        ops.append((key, t.get("id"), str(t.get("name") or "")[:70], op))

    now = _now()

    if a.gate:
        refusals = gate(ops, now, a.timeout)
        if a.json:
            noted = [(tid, op.get("operation_id"), n)
                     for key, tid, name, op in ops for n in notes(op)]
            print(json.dumps({"operations": len(ops), "refusals": [
                {"task": r[0], "operation_id": r[2], "state": r[3], "reasons": r[4]} for r in refusals],
                "notes": [{"task": tid, "operation_id": oid, "note": n}
                          for tid, oid, n in noted]},
                indent=1))
        elif not ops:
            print("unattended-check: no open task declares an unattended operation — yield permitted")
        elif not refusals:
            print("unattended-check: %d operation(s) proved — yield permitted" % len(ops))
            for key, tid, name, op in ops:
                print("  OK    %s  %s  supervisor=%s  next=%s  deadline=%s  delivery=%s"
                      % (tid, op.get("operation_id"), op.get("supervisor_id"),
                         op.get("next_action_at"), op.get("deadline_at"), op.get("delivery_state")))
                for note in notes(op):
                    print("           note: %s" % note)
        else:
            print("unattended-check: YIELD REFUSED — %d operation(s) cannot be left as they are."
                  % len(refusals))
            for tid, name, oid, state, why in refusals:
                print("  REFUSE %s (%s) [%s] — %s" % (tid, oid, state, name))
                for w in why:
                    print("           - %s" % w)
            print("\nFix the operation or say plainly that no watcher is running. Do NOT send a "
                  "final response describing this as monitored: see PROJECT_CHARTER.md section 11.")
        return 3 if refusals else 0

    # --reconcile
    rows, recover = [], []
    for key, tid, name, op in ops:
        state, reasons, _ = classify(op, now, a.timeout)
        rows.append((tid, op.get("operation_id"), state, reasons, name))
        if state in ("watcher-missing", "overdue", "state-unknown", "terminal-non-delivery"):
            recover.append((tid, op.get("operation_id"), state))
    if a.json:
        print(json.dumps({"operations": [
            {"task": r[0], "operation_id": r[1], "state": r[2], "reasons": r[3]} for r in rows],
            "recover_first": [{"task": r[0], "operation_id": r[1], "state": r[2]} for r in recover]},
            indent=1))
        return 3 if recover else 0
    if not ops:
        print("unattended-check: no open task declares an unattended operation")
        return 0
    print("**Unattended operations** (PROJECT_CHARTER.md section 11)\n")
    print("| Task | Operation | State | What it means |")
    print("|------|-----------|-------|---------------|")
    MEANING = {
        "running-healthy":       "a named supervisor answered and its next action is still ahead",
        "terminal-success":      "delivered",
        "terminal-non-delivery": "finished WITHOUT delivering — this is not success",
        "overdue":               "its own next action or deadline has passed",
        "watcher-missing":       "it claims a supervisor and none is running",
        "state-unknown":         "nothing recorded says what happens next",
        "session-watched":       "only watched inside an open turn — no turn is open now",
        "unmonitored":           "no watcher is running, and that is recorded honestly",
    }
    for tid, oid, state, reasons, name in rows:
        print("| %s | %s | **%s** | %s |" % (tid, oid, state, MEANING.get(state, state)))
    if recover:
        print("\n> **Recover these before any unrelated work** — charter section 11: a watcher that is "
              "missing, inactive or overdue makes its own recovery the first task of this session.")
        for tid, oid, state in recover:
            print(">  - %s (%s): %s" % (tid, oid, state))
    for tid, oid, state, reasons, name in rows:
        for r in reasons:
            print("  note %s: %s" % (tid, r))
    return 3 if recover else 0


if __name__ == "__main__":
    sys.exit(main())
