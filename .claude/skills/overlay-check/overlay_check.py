#!/usr/bin/env python3
"""Validate this project's local-overlay splice directives before a distribution does it for you.

WHY THIS EXISTS. A project adds its own content to a distributed default by writing
`.claude/local-overlays/<cmd>.md`. Until 2026-09-07 it could not check that file: the overlay
engine lives in `syndicate-playbooks-examples`, which is LOCAL-ONLY by policy and never present on
a box. So an overlay was written blind and first validated at the next `/distribute-defaults` run —
and a bad overlay there is not a local problem. It is classified `broken-overlay`, `--apply` exits
3, and NOTHING is written to ANY project on that host.

WHAT IT CHECKS AGAINST, STATED HONESTLY. The engine always splices `_project-template`'s canonical,
so that is what this checks against wherever this machine has it (the first that exists):

  1. `--canonical DIR`;
  2. the commands beside this checker, when it runs from a `_project-template` tree itself;
  3. `~/syndicate-playbooks-examples/_project-template/.claude/commands`. That folder has exactly
     two homes (PROJECT_CHARTER.md § 8): the engine itself on the operator's workstation, and the
     tool clone `syndicate-join` brings up to date at the start of every run on an outside machine.

Where none exists (a box, a member host) it falls back to `.claude/commands/<cmd>.md`, which is:

  * byte-identical to the canonical, IF this project's overlay has not been baked yet; or
  * the BAKED result (OLD canonical + overlay), if it has.

In the second case this check is approximate, and it says so rather than pretending otherwise: an
anchor can appear to bind to a line the overlay itself inserted on a previous distribution, or to a
line the canonical has since renamed. An earlier version of this file asserted flatly that "the
canonical is already here"; that is false for any already-baked project, and the claim is corrected
rather than quietly dropped.

Measured 2026-11-04, which is why the canonical comes first. An outside machine's syndicate-join
refused cad-designer's overlay: it anchored on `### 6. Update README.md`, which phase 143 had
renumbered `### 7.` on 2026-10-30. The join's remedy was "run /overlay-check", and that, checking
the project's delivered copy (the old canonical with the overlay baked in), said "ok, exit 0". The
person had no way to see the fault, and every join for five days updated none of their projects.

WHY THE PARSING IS DUPLICATED FROM THE ENGINE, DELIBERATELY. The regexes and the block semantics
below are copied from `scripts/apply-overlay.py`, because the alternative — importing it — is
impossible on a host where the engine does not exist, and the alternative to duplicating is a
project that cannot check at all. The duplication is held by a test in the engine repo
(`scripts/test-overlay-check-parity.sh`) which runs BOTH tools over a fixture corpus and fails if
they ever disagree. Do not "simplify" either regex without running it.

MEASURED, 2026-09-07 — every one of these was a real divergence in the first version of this file,
found by adversarial review before it shipped:
  * a bare `<!-- splice-after -->` next to a valid block: this said ok, the engine exits 2 and
    freezes the host. A checker whose whole purpose is preventing that must not bless it.
  * `<!-- splice-after : "x" -->` (one stray space): this said ok, and the engine SILENTLY dropped
    the overlay — then distribution overwrote the project's customisation with bare canonical and
    reported success. That engine defect is fixed too; this catches the typo at authoring time.
  * a later block anchoring on a line an EARLIER block inserts: this said NOT FOUND, but the engine
    splices into a progressive buffer and binds it correctly. A false alarm that would send a
    project to edit a working overlay.

Usage: overlay_check.py [--canonical DIR] [PROJECT]   (PROJECT defaults to the current folder)
Exit 0 every directive is bindable · 1 at least one problem · 2 nothing to check.
"""
import difflib
import glob
import json
import os
import re
import subprocess
import sys

# Copied verbatim from scripts/apply-overlay.py — see the docstring note above.
DIRECTIVE_RE = re.compile(
    r'^\s*<!--\s*splice-(before|after|append)(?::\s*"((?:[^"\\]|\\.)*)")?\s*-->\s*$'
)
NEAR_MISS_RE = re.compile(r'^\s*<!--.*\bsplice-(?:before|after|append)\b.*-->\s*$')


def read_lines(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return None, f"not valid UTF-8 ({exc.reason} at byte {exc.start}) — the engine would crash"
    # The engine reads both files in text mode (universal newlines): a CRLF overlay or delivered copy
    # (a Windows editor, a Git-for-Windows checkout on /mnt/c) binds there, so it binds here.
    return text.replace("\r\n", "\n").replace("\r", "\n").splitlines(keepends=True), None


def parse(lines):
    """Mirror apply-overlay.py's parse_overlay, returning (blocks, error)."""
    blocks, directive, anchor, content = [], None, None, []
    for line in lines:
        bare = line.rstrip("\n")
        m = DIRECTIVE_RE.match(bare)
        if m:
            if directive is not None:
                blocks.append((directive, anchor, content))
            directive, anchor, content = m.group(1), m.group(2), []
            if directive in ("before", "after") and anchor is None:
                return None, (f'splice-{directive} with no quoted anchor: {bare.strip()!r} — '
                              f'the engine raises here and the distribution writes nothing to '
                              f'ANY project on this host')
        elif NEAR_MISS_RE.match(bare):
            return None, (f'looks like a directive but does not parse: {bare.strip()!r}\n'
                          f'      expected exactly:  <!-- splice-before: "ANCHOR" -->\n'
                          f'                         <!-- splice-after: "ANCHOR" -->\n'
                          f'                         <!-- splice-append -->')
        elif directive is not None:
            content.append(line)
    if directive is not None:
        blocks.append((directive, anchor, content))
    if not blocks:
        if not "".join(lines).strip():
            # An EMPTY file. The engine tolerates it (exit 0, canonical unchanged), so this must
            # too: a checker that predicts a refusal the engine never makes sends a project to
            # edit a working overlay under maximum perceived urgency. Reported, not failed.
            return [], "EMPTY"
        return None, "no splice-before/after/append directive — this overlay is a silent no-op"
    return blocks, None


def nearest(anchor, buf):
    """Up to three lines most like a lost anchor, whole, those at the anchor's heading level first:
    for the reader to judge, never applied. Similar is not the same section: a renamed step can be
    nearest to a different step (the 2026-11-04 review found `## Step 8: Remove Examples Repository`
    nearest to `## Step 3: Locate Examples Repository`), so the reader checks the section first."""
    # A line holding a double quote can never be an anchor (the directive quotes it): never offered.
    lines = list(dict.fromkeys(l.rstrip("\n") for l in buf if l.strip() and '"' not in l))
    near = difflib.get_close_matches(anchor, lines, n=5, cutoff=0.6)
    level = len(anchor) - len(anchor.lstrip("#"))
    num = re.match(r"^#+\s*(?:Step\s+)?(\d+)[.:]", anchor)
    def step(l):
        m = re.match(r"^#+\s*(?:Step\s+)?(\d+)[.:]", l)
        return m.group(1) if m else None
    # Stable sort, so difflib's closeness order holds within each group: the same step number first
    # (a renamed step), then the same heading level.
    near.sort(key=lambda l: (bool(num) and step(l) != num.group(1), (len(l) - len(l.lstrip("#"))) != level))
    return near[:3]


def check_one(overlay, canon, rel, name, canon_label, delivered):
    """Return (problems, warnings, notes). Simulates the engine's progressive buffer. A problem is
    what the engine refuses; a warning is what it accepts but may not do what the author meant."""
    problems, warnings, notes = 0, 0, []
    ov_lines, err = read_lines(overlay)
    if err:
        notes.append(("BAD ENCODING", rel, err))
        return 1, 0, notes
    canon_lines, err = read_lines(canon)
    if err:
        notes.append(("BAD ENCODING", canon_label, err))
        return 1, 0, notes

    blocks, err = parse(ov_lines)
    if err == "EMPTY":
        notes.append(("NOTE", rel, "file is empty — the engine ignores it, but it does nothing"))
        return 0, 0, notes
    if err:
        notes.append(("MALFORMED", rel, err))
        return 1, 0, notes

    # The engine computes each insertion point against the CURRENT buffer, so a later block may
    # legitimately anchor on a line an earlier block inserted. Checking every anchor against the
    # untouched canonical reports those as missing — a false alarm on a working overlay.
    buf = list(canon_lines)
    for directive, anchor, content in blocks:
        if directive == "append":
            buf.extend(content)
            notes.append(("ok", rel, "splice-append (no anchor)"))
            continue
        matches = [i for i, l in enumerate(buf) if l.rstrip("\n") == anchor]
        if not matches:
            near = nearest(anchor, buf)
            notes.append(("NOT FOUND", rel,
                          f'splice-{directive}  {anchor}\n'
                          f'      no line of {canon_label} matches this exactly (whole line, spaces count)'
                          + ('\n      nearest lines now (use one only if it starts the same section):'
                             + "".join(f'\n        "{l}"' for l in near) if near else '')))
            problems += 1
            continue
        if len(matches) > 1:
            notes.append(("AMBIGUOUS x%d" % len(matches), rel,
                          f'splice-{directive}  {anchor[:56]}\n'
                          f'      the engine takes the FIRST silently — extend it until unique'))
            warnings += 1
        else:
            notes.append(("ok", rel, f"splice-{directive}  {anchor[:56]}"))
        at = matches[0] if directive == "before" else matches[0] + 1
        buf[at:at] = content

    # Is the file we checked against already a baked artifact rather than the canonical?
    body = [l.replace("\r\n", "\n") for _, _, c in blocks for l in c if l.strip()]
    if delivered and body and all(l in canon_lines for l in body):
        notes.append(("NOTE", rel,
                      f".claude/commands/{name} already contains this overlay's content, so it is "
                      f"a BAKED file (the canonical of its last delivery, plus this overlay), not "
                      f"the canonical. Anchors were checked against it; an anchor may be binding to "
                      f"a line this overlay itself inserted, or to one the canonical has since "
                      f"renamed. If a distribution or syndicate-join called this overlay broken, "
                      f"check against the canonical: --canonical <syndicate-playbooks-examples>/"
                      f"_project-template/.claude/commands"))
    return problems, warnings, notes


def newer_of(a, b):
    """Of two canonical commands folders, the one whose checkout holds the other's HEAD (b when they
    cannot be compared)."""
    def head(d):
        try:
            r = subprocess.run(["git", "-C", d, "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
            return r.stdout.strip() if r.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            return ""
    ha, hb = head(a), head(b)
    if not ha or not hb:
        return b
    try:
        r = subprocess.run(["git", "-C", a, "merge-base", "--is-ancestor", hb, ha], capture_output=True, timeout=10)
        return a if r.returncode == 0 else b
    except (OSError, subprocess.SubprocessError):
        return b


def find_canonical(given, root="."):
    """(dir, label) of the canonical commands to check against, or (None, None): see the docstring."""
    if given:
        return os.path.abspath(given), None
    here = os.path.dirname(os.path.abspath(__file__))
    claude = os.path.dirname(os.path.dirname(here))           # <tree>/.claude
    if os.path.basename(claude) == ".claude" and \
            os.path.basename(os.path.dirname(claude)) == "_project-template":
        beside = os.path.join(claude, "commands")
        if os.path.isdir(beside):
            return beside, None
    home = os.path.join(os.path.expanduser("~"), "syndicate-playbooks-examples",
                        "_project-template", ".claude", "commands")
    # A project still in Phase 0 holds the clone it was bootstrapped from, which can be newer than
    # ~'s (the 2026-11-04 review): the one that holds the other's HEAD wins.
    nested = os.path.join(root, "syndicate-playbooks-examples", "_project-template", ".claude", "commands")
    if os.path.isdir(nested) and os.path.isdir(home):
        return newer_of(nested, home), None
    if os.path.isdir(home):
        return home, None
    if os.path.isdir(nested):
        return nested, None
    return None, None


def describe(canon_dir):
    """The canonical's path, and its commit when it is a git checkout, for the reader to judge age."""
    try:
        r = subprocess.run(["git", "-C", canon_dir, "log", "-1", "--format=%h %cs"],
                           capture_output=True, text=True, timeout=10)
        rev = r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        rev = ""
    home = os.path.expanduser("~")
    shown = "~" + canon_dir[len(home):] if canon_dir.startswith(home + os.sep) else canon_dir
    return shown + (f" (at {rev})" if rev else "")


def older_than_delivery(canon_dir, root):
    """The canonical commit this project last received, when the canonical's checkout does not hold
    it as an ancestor of its HEAD (it is older); else None. Never fails the check. Judged only for a
    real canonical (a syndicate-playbooks-examples _project-template), never for another repository."""
    if not os.path.realpath(canon_dir).endswith(os.path.join("_project-template", ".claude", "commands")):
        return None
    try:
        with open(os.path.join(root, ".claude", "distribution-manifest.json")) as f:
            sha = str(json.load(f).get("canonical_commit") or "")
    except (OSError, ValueError, AttributeError):
        return None
    if not re.fullmatch(r"[0-9a-f]{7,40}", sha):
        return None
    try:
        r = subprocess.run(["git", "-C", canon_dir, "merge-base", "--is-ancestor", sha, "HEAD"],
                           capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    # 0: an ancestor, current enough. 1: not one. 128: the commit is unknown here (newer), or not git.
    if r.returncode == 1:
        return sha[:7]
    if r.returncode == 128 and "Not a valid" in r.stderr + r.stdout:
        return sha[:7]
    return None


def main():
    args, given = sys.argv[1:], None
    if args[:1] in (["-h"], ["--help"]):
        print(__doc__.strip().splitlines()[0])
        print("usage: overlay_check.py [--canonical DIR] [PROJECT]")
        return 0
    if args[:1] == ["--canonical"]:
        if len(args) < 2:
            print("overlay-check: --canonical needs the folder of the canonical commands")
            return 1
        given, args = args[1], args[2:]
    if len(args) > 1 or (args and args[0].startswith("-")):
        print("usage: overlay_check.py [--canonical DIR] [PROJECT]")
        return 1
    root = args[0] if args else "."
    ovdir = os.path.join(root, ".claude", "local-overlays")
    cmddir = os.path.join(root, ".claude", "commands")
    if not os.path.isdir(root):
        print(f"overlay-check: no such project path: {root}")
        return 1
    canon_dir, _ = find_canonical(given, root)
    if given and not os.path.isdir(canon_dir):
        print(f"overlay-check: --canonical {given}: no such folder")
        return 1
    real_root, real_canon = os.path.realpath(root), os.path.realpath(canon_dir or root)
    if given and os.path.commonpath([real_canon, real_root]) == real_root \
            and not real_canon.startswith(os.path.join(real_root, "syndicate-playbooks-examples") + os.sep):
        print(f"overlay-check: --canonical {given} is inside this project: it is the delivered copy, not the"
              f" canonical. It must be <syndicate-playbooks-examples>/_project-template/.claude/commands")
        return 1
    if given and not glob.glob(os.path.join(canon_dir, "*.md")):
        print(f"overlay-check: --canonical {given} holds no command (*.md): it must be "
              f"<syndicate-playbooks-examples>/_project-template/.claude/commands")
        return 1
    overlays = sorted(glob.glob(os.path.join(ovdir, "*.md")))
    if not overlays:
        print("overlay-check: no overlays in .claude/local-overlays/ — nothing to check")
        return 2
    if canon_dir:
        print(f"  against        the canonical in {describe(canon_dir)}, which the next distribution splices onto")
        older = older_than_delivery(canon_dir, root)
        if older:
            print(f"  NOTE           this canonical is older than the one this project last received ({older}):"
                  f" bring it up to date first (on an outside machine, run syndicate-join), or a working"
                  f" overlay may read NOT FOUND here")
    else:
        print("  against        this project's delivered .claude/commands (no canonical on this machine):"
              " approximate where an overlay is already baked in")

    skip = set()
    sf = os.path.join(ovdir, ".skip")
    if os.path.exists(sf):
        for line in open(sf, encoding="utf-8", errors="replace"):
            line = line.strip()
            if line and not line.startswith("#"):
                skip.add(line)

    # The commands the last distribution recorded delivering. A command the project still holds but
    # the defaults no longer ship (renamed, retired) is not in it, and the engine ignores its overlay.
    try:
        with open(os.path.join(root, ".claude", "distribution-manifest.json")) as f:
            delivered_names = set((json.load(f).get("files") or {}).keys())
    except (OSError, ValueError, AttributeError):
        delivered_names = set()
    problems = warnings = 0
    for ov in overlays:
        name = os.path.basename(ov)
        rel = f".claude/local-overlays/{name}"
        if canon_dir:
            canon, canon_label = os.path.join(canon_dir, name), f"the canonical {name}"
        else:
            canon, canon_label = os.path.join(cmddir, name), f".claude/commands/{name}"
        if name in skip:
            print(f"  CONTRADICTION  {rel}: also listed in .skip — it will never be applied")
            warnings += 1
            continue
        if not os.path.exists(canon) and canon_dir:
            if f".claude/commands/{name}" in delivered_names:
                # The project has it delivered, so it is a default this canonical folder lacks: the
                # wrong folder, or a clone older than the default. Never an "ok" (2026-11-04 review).
                print(f"  NO CANONICAL   {rel}: {canon_dir} holds no {name}, though the last distribution"
                      f" delivered it here: --canonical must be <syndicate-playbooks-examples>/_project-template/"
                      f".claude/commands, or that clone is older than this default")
                problems += 1
                continue
            # The engine reads overlays of the distributed defaults only: this one blocks nothing,
            # and does nothing.
            print(f"  NOTE           {rel}: {name} is not a distributed default, so no distribution"
                  f" applies this overlay")
            continue
        if not os.path.exists(canon):
            print(f"  NO CANONICAL   {rel}: {canon_label} does not exist")
            problems += 1
            continue
        p, w, notes = check_one(ov, canon, rel, name, canon_label, delivered=not canon_dir)
        problems += p
        warnings += w
        for tag, where, msg in notes:
            print(f"  {tag:<14} {where}  {msg}")

    print()
    if problems:
        print(f"overlay-check: {problems} problem(s) a distribution refuses: /distribute-defaults then "
              f"writes NOTHING to ANY project on this host, and syndicate-join leaves this project out "
              f"until it is fixed." + (f" Also {warnings} warning(s), above." if warnings else ""))
        return 1
    if warnings:
        print(f"overlay-check: {warnings} warning(s). A distribution accepts these (AMBIGUOUS: it binds the "
              f"FIRST matching line; CONTRADICTION: .skip wins and the overlay is never applied), but "
              f"each may not do what was meant: fix them.")
        return 1
    print(f"overlay-check: ok — {len(overlays)} overlay file(s), every directive parses and binds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
