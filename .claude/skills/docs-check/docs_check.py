#!/usr/bin/env python3
"""docs-check: whether docs/ holds only what persists, read from the tracked tree.

WHY THIS EXISTS. The operator, 2026-10-30: docs/ "should hold only persistent things. sometimes it
happens that they put some ad hoc things which get stale, in the worst case they use it as a
scratch"; phase documentation, if any, "has to be clearly identified". And of the architecture
diagrams: "we have a problem with readability". Measured that day: Graphviz renders PNG at 96 dpi,
and 11 of 12 architecture PNGs on the workstation were 1572-4103 px wide, so in an ~880 px README
column their 10 pt labels (the node size the old /generate-architecture template set) were
2.9-7.5 px tall.

WHAT IT REPORTS, from names, the first lines of dated text files and image headers. It never
judges prose.
  not-persistent      a path under docs/ named (a) for a phase, session, sprint, cycle, iteration
                      or task with its number, or with a leading task id (148.7-...); (b) for the
                      next phase; (c) for working state (scratch, scratchpad, wip, tmp, temp,
                      draft, drafts, todo); (d) as a hand-off outside docs/handoff/ (docs/Handoff/
                      and other cases of it: rename to docs/handoff/); and, under
                      docs/architecture/, a diagram or a directory whose name carries a date: a
                      snapshot. (a)-(d) apply whatever the date: a date does not make a phase's or
                      a session's material a record. Only a date DIRECTLY after the word is read
                      as a date, not as its number (review-cycle-2026-10 is not cycle 2026).
  record-unmarked     a dated text file, or a dated directory outside docs/architecture/ (one
                      finding for all of it), without the record line starting one of the first
                      RECORD_LINES lines (a directory: of a text file directly inside it)
  diagram-unreadable  a PNG or JPEG under docs/architecture/ larger than MAX_W x MAX_H px
A directory reported under (a)-(d), or as a dated directory, is one finding with its file count;
no NAME under it is reported again. The size rule is not a naming rule: every image under
docs/architecture/ is measured, whatever directory finding covers it. Directories named _archive or
archive, and docs/handoff/, are skipped with everything under them.

WHERE IT READS. The tracked tree, through git, never the working tree: the index (default), one
commit (--rev), or what the index adds to HEAD (--staged, without rename detection: a rename is a
deletion and an addition, and the added path is judged). A blob is read only when a rule needs
its bytes. In a partial clone the blobs it needs and lacks are fetched in ONE fetch; no read
fetches lazily, so an unreachable promisor costs one failed fetch, not one per blob.

EXIT. 0 nothing found; 1 findings; 2 could not check: not a git work tree, an unknown revision,
docs tracked as a symlink or submodule, a git failure, a blob that could not be read, an image
header that does not parse, a defect in this checker (any uncaught exception: one line on stderr,
never Python's exit 1, which every caller reads as findings). Something that could not be read is
never reported as clean; when some paths could not be read, the findings for the rest are still
printed (and listed in --json, with "complete": false). The exit code is the check's alone: a
reader that closes stdout or stderr, or never opens it, changes no exit code.

The rule itself has one home, PROJECT_CHARTER.md section 11, "`docs/` holds what persists".
SKILL.md beside this file says what to do about each finding. Stdlib only; runs under python3 -I.
"""
import argparse
import datetime
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import zlib

# --- the limits, stated once ------------------------------------------------------------------
# Graphviz renders PNG at BASE_DPI, and the diagrams package on top of it draws node and edge
# labels at LABEL_PT by default (Graphviz's own default is 14 pt), which is
# LABEL_PT * BASE_DPI / 72 = 17.3 px. A README or docs page shows an image in a column about
# COLUMN px wide and scales a wider image down to fit. A label stays legible from FLOOR_PX up, so
# the widest image whose labels survive is COLUMN * 17.3 / FLOOR_PX = 1386 px; MAX_W is that
# rounded down. MAX_H is about one screen at that scale: a taller image cannot be taken in at once.
BASE_DPI = 96
LABEL_PT = 13
COLUMN = 880
FLOOR_PX = 11
MAX_W = 1350
MAX_H = 1600
# A dated text file says it is a dated record at the start of one of its first RECORD_LINES lines.
RECORD_LINES = 15

DOCS = "docs/"
EXCLUDED = ("docs/handoff/",)
ARCHIVE_DIRS = {"_archive", "archive"}  # at any depth under docs/, skipped with all under them
ARCH = "docs/architecture/"
TEXT_EXT = {".md", ".markdown", ".txt", ".html", ".htm", ".rst", ".adoc"}
IMAGE_EXT = {".png", ".jpg", ".jpeg"}
SYMLINK = "120000"                    # its bytes are a path: names only, never read
GITLINK = "160000"                    # a submodule: names only, never read
# --staged reads the diff with --no-renames: rename and copy detection compares the CONTENT of the
# old blob, which a blobless clone lacks, so it would fetch lazily, one blob at a time. A rename is
# then a deletion (not judged) and an addition, which is.
NAMING_CHANGES = {"A"}                # --staged: a path this commit adds
IMAGE_CHANGES = {"A", "M", "T"}       # --staged: an image this commit adds or changes

# A text file is kept until RECORD_LINES line breaks have been seen, up to TEXT_HEAD_BYTES: a
# self-contained HTML page can carry a whole stylesheet on its first line.
TEXT_HEAD_BYTES = 1024 * 1024
IMAGE_HEAD_BYTES = 8 * 1024 * 1024    # every chunk before the image data, with room to spare
EMPTY_BLOBS = {"e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
               "473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813"}
CE_INTENT_TO_ADD = 1 << 29            # git's index flag for an entry added with git add -N

LABEL_PX = LABEL_PT * BASE_DPI / 72.0

# --- names ------------------------------------------------------------------------------------
NUMBERED_RE = re.compile(r"(?<![a-z])(phase|session|sprint|cycle|iteration|task)s?[-_ .]?(\d)")
TASK_ID_RE = re.compile(r"^\d+\.\d+[a-z]?[-_ ]")
NEXT_PHASE_RE = re.compile(r"(?<![a-z])next[-_ .]?phase")
WORKING_TOKENS = {"scratch", "scratchpad", "wip", "tmp", "temp", "draft", "drafts", "todo"}
HANDOFF_WORDS = {"handoff", "handoffs", "handover", "handovers"}
SESSION_WORDS = {"session", "sessions"}
HAND_RE = re.compile(r"hand[-_ .]?(off|over)")
LEADING_DATE_RE = re.compile(r"^(?:19|20)\d\d[-_]?\d\d(?:[-_]?\d\d)?(?:t\d+)?")
TOKEN_SPLIT_RE = re.compile(r"[-_. ]+")

HANDOFF_DIR = "handoff"               # docs/handoff/, the one folder set aside for hand-offs

WHERE_INSTEAD = (
    "docs/ holds what persists (PROJECT_CHARTER.md section 11), and phase or session documentation "
    "is not kept there under any name, dated or not: what lasts goes into the canonical document "
    "it changes; working material to work/phase-<id>/, swept when the phase closes; the rest to "
    "docs/_archive/; a record the operator needs (an incident report, an audit) is named for its "
    "subject and its date, not for a phase; a hand-off -> docs/handoff/<YYYY-MM-DD>-<name>/"
)
# Appended to every directory finding: a directory under docs/ is often written by the project's
# own procedure (a test run's dated output, a hand-off folder), and moving or marking what is there
# is undone by that procedure's next run.
WRITER_TOO = ("if a command or script of this project writes it there, change that command too, "
              "or it comes back")
HANDOFF_INSTEAD = (
    "a hand-off goes to docs/handoff/<YYYY-MM-DD>-<name>/; what lasts in it is folded into the "
    "canonical document it changes"
)
CASE_INSTEAD = "rename it to docs/handoff/, the one folder set aside for hand-offs"
SNAPSHOT_INSTEAD = (
    "archive it under docs/_archive/, or redraw it as the current view and take the date out of "
    "its name"
)

# --- dates and the record line ------------------------------------------------------------------
DATE_FULL_RE = re.compile(r"(?<!\d)((?:19|20)\d\d)([-_])(\d\d)\2(\d\d)(?!\d)")
DATE_COMPACT_RE = re.compile(r"(?<!\d)((?:19|20)\d\d)(\d\d)(\d\d)(?!\d)")
DATE_MONTH_RE = re.compile(r"(?<!\d)((?:19|20)\d\d)[-_](\d\d)(?![-_]?\d)")
# The record line STARTS a line: after optional blanks, one of > * - <!-- <p>, and bold stars.
RECORD_RE = re.compile(r"^\s*(?:>|\*|-|<!--|<p>)?\s*\**\s*dated\s+record\b", re.IGNORECASE)
LINE_SPLIT_RE = re.compile(r"\r\n|\r|\n")
LINE_BREAK_RE = re.compile(rb"\r\n|\r|\n")     # the same breaks, counted in bytes as they are read


class CannotCheck(Exception):
    """The check as a whole cannot run: exit 2."""


class Unreadable(Exception):
    """One path's bytes could not be read or parsed: exit 2, the path named."""


def find_date(text):
    """The earliest valid date in text, as (position, 'YYYY-MM-DD' or 'YYYY-MM'), or None."""
    found = []
    for m in DATE_FULL_RE.finditer(text):
        y, mo, d = int(m.group(1)), int(m.group(3)), int(m.group(4))
        if _valid(y, mo, d):
            found.append((m.start(), "%04d-%02d-%02d" % (y, mo, d)))
    for m in DATE_COMPACT_RE.finditer(text):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if _valid(y, mo, d):
            found.append((m.start(), "%04d-%02d-%02d" % (y, mo, d)))
    for m in DATE_MONTH_RE.finditer(text):
        y, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            found.append((m.start(), "%04d-%02d" % (y, mo)))
    return min(found) if found else None


def _valid(y, mo, d):
    try:
        datetime.date(y, mo, d)
    except ValueError:
        return False
    return True


def has_record_line(head):
    text = head.decode("utf-8", "replace").lstrip("﻿")
    lines = LINE_SPLIT_RE.split(text)           # \n, \r\n or \r; not str.splitlines' \f and \v
    return any(RECORD_RE.match(line) for line in lines[:RECORD_LINES])


def starts_with_date(text):
    """Whether text starts with a date (YYYY-MM-DD, YYYYMMDD or YYYY-MM)."""
    found = find_date(text)
    return found is not None and found[0] == 0


def numbered(s):
    """Rule 1(a) on a lower-cased name: (word, by_task_id) or None.

    It applies whatever date the name also carries: a date does not make a phase's or a session's
    material a record (PROJECT_CHARTER.md section 11). Only a date DIRECTLY after the word is read
    as a date and not as the word's number: review-cycle-2026-10 is a review dated 2026-10, not
    cycle 2026, so the record rule judges it."""
    for m in NUMBERED_RE.finditer(s):
        if not starts_with_date(s[m.start(2):]):
            return m.group(1), False
    if TASK_ID_RE.match(s):
        return "task", True
    return None


def is_handoff(s, is_dir):
    """Rule 1(d) on a lower-cased name: a hand-off by its name, not a name that mentions one."""
    s = HAND_RE.sub(r"hand\1", s)
    stem = s if is_dir else os.path.splitext(s)[0]
    tokens = [t for t in TOKEN_SPLIT_RE.split(stem) if t]
    for a, b in zip(tokens, tokens[1:]):
        if (a in HANDOFF_WORDS and b in SESSION_WORDS) or (a in SESSION_WORDS and b in HANDOFF_WORDS):
            return True                         # SESSION-HANDOFF
    rest = LEADING_DATE_RE.sub("", stem.strip("-_. ")).strip("-_. ")
    lead = TOKEN_SPLIT_RE.split(rest)[0] if rest else ""
    if lead not in HANDOFF_WORDS:
        return False                            # handover-contract, workflows-...-handoff
    return rest == lead or find_date(stem) is not None or "session" in stem


def article(word):
    return "an" if word[:1] in "aeiou" else "a"


def segment_reason(seg, is_dir, top=False):
    """Why one path segment (a directory name or a file name) does not persist, or None.

    top: the segment is a directory directly under docs/, where docs/handoff/ is the hand-off
    folder; the same word in another case is that folder misnamed, not a hand-off elsewhere."""
    s = seg.lower()
    if top and is_dir and s == HANDOFF_DIR:
        return ("handoff-case", "the hand-off folder in the wrong case (%r)" % seg)
    n = numbered(s)                             # whatever the date: see numbered()
    if n and n[1]:
        return ("numbered", "named for a task by its number (%r)" % seg)
    if n:
        return ("numbered", "named for %s %s with its number (%r)" % (article(n[0]), n[0], seg))
    if NEXT_PHASE_RE.search(s):
        return ("next", "named for the next phase (%r)" % seg)
    if is_handoff(s, is_dir):
        return ("handoff", "a hand-off outside docs/handoff/ (%r)" % seg)
    for t in TOKEN_SPLIT_RE.split(s):
        if t in WORKING_TOKENS:
            return ("working", "named for working state (%r in %r)" % (t, seg))
    return None


def remedy(reason):
    return {"handoff": HANDOFF_INSTEAD, "handoff-case": CASE_INSTEAD}.get(reason[0], WHERE_INSTEAD)


# --- images -----------------------------------------------------------------------------------
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_size(data):
    """(width, height, (dpi_x, dpi_y) or None) from the chunks before the image data."""
    if not data.startswith(PNG_SIG):
        raise Unreadable("not a PNG: no PNG signature")
    pos, size, dpi = len(PNG_SIG), None, None
    while True:
        if pos + 8 > len(data):
            raise Unreadable("PNG ends before its image data")
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        end = pos + 12 + length
        if end > len(data):
            raise Unreadable("PNG chunk %s is cut short" % ctype.decode("latin-1"))
        body = data[pos + 8:pos + 8 + length]
        (crc,) = struct.unpack(">I", data[end - 4:end])
        if zlib.crc32(ctype + body) & 0xFFFFFFFF != crc:
            raise Unreadable("PNG chunk %s fails its CRC" % ctype.decode("latin-1"))
        if size is None:
            if ctype != b"IHDR" or length != 13:
                raise Unreadable("PNG does not start with an IHDR chunk")
            size = struct.unpack(">II", body[:8])
            if 0 in size:
                raise Unreadable("PNG header gives a zero size")
        elif ctype == b"pHYs" and length == 9:
            ppx, ppy, unit = struct.unpack(">IIB", body)
            if unit == 1 and ppx and ppy:      # pixels per metre; unit 0 is an aspect ratio
                dpi = (ppx * 0.0254, ppy * 0.0254)
        elif ctype == b"IDAT":
            return size[0], size[1], dpi
        elif ctype == b"IEND":
            raise Unreadable("PNG has no image data")
        pos = end


def jpeg_size(data):
    """(width, height, None) from the first frame header. JPEG density is not trusted."""
    if not data.startswith(b"\xff\xd8"):
        raise Unreadable("not a JPEG: no start-of-image marker")
    pos = 2
    while True:
        if pos >= len(data) or data[pos] != 0xFF:
            raise Unreadable("JPEG has no marker at byte %d" % pos)
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1                            # fill bytes
        if pos >= len(data):
            raise Unreadable("JPEG ends before its frame header")
        marker = data[pos]
        pos += 1
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            continue                            # standalone markers carry no length
        if marker in (0x00, 0xD8, 0xD9, 0xDA):
            raise Unreadable("JPEG reaches marker 0x%02X before a frame header" % marker)
        if pos + 2 > len(data):
            raise Unreadable("JPEG segment cut short")
        (seglen,) = struct.unpack(">H", data[pos:pos + 2])
        if seglen < 2 or pos + seglen > len(data):
            raise Unreadable("JPEG segment cut short")
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            if seglen < 7:
                raise Unreadable("JPEG frame header cut short")
            h, w = struct.unpack(">HH", data[pos + 3:pos + 7])
            if not w or not h:
                raise Unreadable("JPEG frame header gives a zero size")
            return w, h, None
        pos += seglen


def image_size(path, data):
    return png_size(data) if path.lower().endswith(".png") else jpeg_size(data)


def diagram_message(w, h, dpi):
    """None when the image is within the limit, else the finding's message.

    A pHYs resolution is honoured only when it states more than BASE_DPI: a hi-dpi export has
    proportionally larger labels. A lower or equal stamp is not evidence of smaller labels, so the
    raw pixels are measured. Graphviz writes no pHYs chunk at any -Gdpi."""
    hidpi = bool(dpi) and round(dpi[0]) > BASE_DPI and round(dpi[1]) > BASE_DPI
    if hidpi:
        w96, h96 = int(round(w * BASE_DPI / dpi[0])), int(round(h * BASE_DPI / dpi[1]))
        label = LABEL_PX * dpi[0] / BASE_DPI
    else:
        w96, h96, label = w, h, LABEL_PX
    if w96 <= MAX_W and h96 <= MAX_H:
        return None
    size = "%d x %d px" % (w, h)
    if hidpi:
        size += " at %.0f dpi (%d x %d px at %d dpi)" % (dpi[0], w96, h96, BASE_DPI)
    over = []
    if w96 > MAX_W:
        over.append("wider than %d px" % MAX_W)
    if h96 > MAX_H:
        over.append("taller than %d px, more than about one screen" % MAX_H)
    scale = min(1.0, float(COLUMN) / w)         # the column scales the image's RAW pixels
    shown = label * scale
    return ("%s, limit %d x %d px: %s; shown at %d px wide it is scaled to %.2f, so a %d pt label "
            "(%.1f px) becomes %.1f px%s; split it into views (/generate-architecture)"
            % (size, MAX_W, MAX_H, " and ".join(over), COLUMN, scale, LABEL_PT, label, shown,
               ", under the %d px floor" % FLOOR_PX if shown < FLOOR_PX else ""))


# --- git --------------------------------------------------------------------------------------
class Entry(object):
    __slots__ = ("path", "mode", "oid", "change")

    def __init__(self, path, mode, oid, change=None):
        self.path, self.mode, self.oid, self.change = path, mode, oid, change


class Git(object):
    def __init__(self, cwd):
        self.cwd = cwd
        self.env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0")
        # Reads never fetch: what a rule needs and lacks is fetched once, in fetch_missing().
        # GIT_NO_LAZY_FETCH is honoured from git 2.44 (and its April 2024 security backports);
        # a git without it is kept from fetching because cat-file is asked only for objects
        # present_objects() has proved are here. Either guard alone suffices.
        self.read_env = dict(self.env, GIT_NO_LAZY_FETCH="1")

    def run(self, args, stdin=None, ok=(0,), env=None):
        try:
            p = subprocess.run(["git", "-C", self.cwd] + list(args), input=stdin,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=env or self.env)
        except OSError as exc:
            raise CannotCheck("cannot run git: %s" % exc)
        if p.returncode not in ok:
            err = p.stderr.decode("utf-8", "replace").strip().splitlines()
            raise CannotCheck("git %s failed (exit %d)%s" % (
                " ".join(args[:3]), p.returncode, ": " + err[-1] if err else ""))
        return p.stdout, p.returncode

    def text(self, args, ok=(0,)):
        out, rc = self.run(args, ok=ok)
        return out.decode("utf-8", "surrogateescape").strip(), rc


def decode(raw):
    return raw.decode("utf-8", "surrogateescape")


def locate(cwd, need_worktree):
    """Return a Git rooted where paths are relative to the repository root."""
    if not os.path.isdir(cwd):
        raise CannotCheck("no such directory: %s" % cwd)
    git = Git(cwd)
    try:
        inside, _ = git.text(["rev-parse", "--is-inside-work-tree"])
    except CannotCheck:
        raise CannotCheck("not a git repository: %s" % os.path.abspath(cwd))
    if inside == "true":
        top, _ = git.text(["rev-parse", "--show-toplevel"])
        return Git(top)
    if need_worktree:
        raise CannotCheck("not a git work tree: %s" % os.path.abspath(cwd))
    return git                                  # a bare repository, for --rev


def refuse_docs_entry(mode, where):
    """docs itself tracked as something other than a directory cannot be checked."""
    what = {SYMLINK: "a symlink", GITLINK: "a submodule (gitlink)"}.get(mode, "a file")
    raise CannotCheck("docs is tracked as %s (mode %s) in %s, not as a directory: nothing under "
                      "it can be read from the tracked tree" % (what, mode, where))


def intent_to_add(git):
    """Paths under docs/ added with git add -N: in the index, but with no content staged yet."""
    out, _ = git.run(["ls-files", "-z", "--debug", "--", "docs"])
    rec = re.compile(rb"([^\0]*)\0  ctime: [^\n]*\n  mtime: [^\n]*\n  dev: [^\n]*\n"
                     rb"  uid: [^\n]*\n  size: \d+\tflags: ([0-9a-fA-F]+)\n")
    return {decode(m.group(1)) for m in rec.finditer(out)
            if int(m.group(2), 16) & CE_INTENT_TO_ADD}


def list_index(git):
    out, _ = git.run(["ls-files", "-z", "-s", "--", "docs"])
    entries, seen = [], {}
    for rec in out.split(b"\0"):
        if not rec:
            continue
        meta, _, path = rec.partition(b"\t")
        mode, oid, stage = meta.decode().split()
        path = decode(path)
        if path == "docs":
            refuse_docs_entry(mode, "the index")
        if mode == "040000":
            continue                            # a sparse-index directory, not a file
        if mode == GITLINK:
            oid = None                          # names only
        if stage != "0":
            oid = None                          # unmerged: no single staged blob to read
        if path in seen:
            seen[path].oid = None
            continue
        seen[path] = Entry(path, mode, oid)
        entries.append(seen[path])
    if any(e.oid in EMPTY_BLOBS for e in entries):
        ita = intent_to_add(git)
        entries = [e for e in entries if e.path not in ita]
    return entries


def list_rev(git, rev):
    if not rev or rev.startswith("-"):
        raise CannotCheck("unknown revision: %r" % rev)
    try:
        commit, _ = git.text(["rev-parse", "--verify", "--quiet", rev + "^{commit}"])
    except CannotCheck:
        raise CannotCheck("unknown revision: %s" % rev)
    out, _ = git.run(["ls-tree", "-r", "-z", "--full-tree", commit, "--", "docs"])
    entries = []
    for rec in out.split(b"\0"):
        if not rec:
            continue
        meta, _, path = rec.partition(b"\t")
        mode, otype, oid = meta.decode().split()
        path = decode(path)
        if path == "docs":
            refuse_docs_entry(mode, rev)
        if otype == "commit":
            entries.append(Entry(path, mode, None))   # a submodule: names only
        elif otype == "blob":
            entries.append(Entry(path, mode, oid))
    return entries


def list_staged(git):
    _, rc = git.run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], ok=(0, 1, 128))
    if rc == 0:
        base = "HEAD"
    else:                                       # the first commit: everything staged is added
        out, _ = git.run(["hash-object", "-t", "tree", "--stdin"], stdin=b"")
        base = out.decode().strip()
    # --no-renames, and the no-lazy-fetch environment: see NAMING_CHANGES. Without rename detection
    # the raw diff compares object names only and needs no blob.
    out, _ = git.run(["diff", "--cached", "--no-renames", "--no-color", "--raw", "-z", "--no-abbrev",
                      "--diff-filter=AMT", base, "--", DOCS], env=git.read_env)
    fields = out.split(b"\0")
    entries, i = [], 0
    while i < len(fields):
        meta = fields[i]
        if not meta:
            i += 1
            continue
        parts = meta.decode().lstrip(":").split()
        if len(parts) != 5 or parts[4][:1] not in ("A", "M", "T"):
            raise CannotCheck("unexpected git diff --raw record: %r" % meta)
        _, dst_mode, _, dst_oid, status = parts
        change = status[0]
        if i + 1 >= len(fields):
            raise CannotCheck("git diff --raw output cut short")
        path = decode(fields[i + 1])
        i += 2
        if dst_mode == GITLINK or not dst_oid.strip("0"):
            dst_oid = None                      # a submodule, or intent-to-add: nothing to read
        entries.append(Entry(path, dst_mode, dst_oid, change))
    return entries


def present_objects(git, oids):
    """The subset of oids this repository holds, decided WITHOUT fetching anything.

    rev-list --missing=print turns lazy fetching off (every git that has the option), and
    --ignore-missing drops a missing tip instead of dying, so each present blob is printed and an
    absent one is not (git >= 2.44 may print it as '?<oid>')."""
    if not oids:
        return set()
    out, _ = git.run(["rev-list", "--objects", "--no-walk", "--ignore-missing", "--missing=print",
                      "--stdin"], stdin=("\n".join(sorted(oids)) + "\n").encode(),
                     env=git.read_env)
    have = set()
    for line in out.decode("ascii", "replace").splitlines():
        if line and not line.startswith("?"):
            have.add(line.split()[0])
    return have & set(oids)


def promisor_remote(git):
    """The partial clone's promisor remote: remote.<name>.promisor or extensions.partialClone."""
    out, _ = git.text(["config", "--get-regexp", r"^remote\..*\.promisor$"], ok=(0, 1))
    remotes = [line.split()[0][len("remote."):-len(".promisor")] for line in out.splitlines()
               if line.split()[-1:] in (["true"], ["yes"], ["on"], ["1"])]
    if not remotes:
        old, _ = git.text(["config", "--get", "extensions.partialClone"], ok=(0, 1))
        remotes = [old] if old else []
    return remotes[0] if remotes else None


def fetch_missing(git, remote, oids):
    """Fetch exactly these blobs from the promisor in ONE fetch; return None or git's error."""
    try:
        p = subprocess.run(["git", "-C", git.cwd, "-c", "fetch.negotiationAlgorithm=noop",
                            "fetch", remote, "--no-tags", "--no-write-fetch-head",
                            "--recurse-submodules=no", "--filter=blob:none", "--stdin"],
                           input=("\n".join(sorted(oids)) + "\n").encode(),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=git.env)
    except OSError as exc:
        return "cannot run git fetch: %s" % exc
    if p.returncode == 0:
        return None
    lines = [l.strip() for l in p.stderr.decode("utf-8", "replace").splitlines() if l.strip()]
    said = [l for l in lines if l.startswith(("fatal:", "error:"))] or lines[-1:]
    return "git fetch exited %d%s" % (p.returncode, ": " + said[0] if said else "")


def read_blobs(git, wanted):
    """{oid: bytes or Unreadable} for wanted {oid: (bytes to keep at most, line breaks or None)}.

    A blob's bytes are kept until that many line breaks have been seen, or the byte limit.
    What is not here is fetched once, from the promisor if there is one; what is still not here
    is Unreadable. cat-file is then asked only for objects proved present, so no read can start a
    lazy fetch on any git version: a dead promisor costs one failed fetch, not one per blob."""
    result = {}
    if not wanted:
        return result
    have = present_objects(git, wanted)
    missing = sorted(set(wanted) - have)
    if missing:
        remote = promisor_remote(git)
        why = "not in this repository"
        if remote:
            err = fetch_missing(git, remote, missing)
            have |= present_objects(git, missing)
            why = ("not in this clone, and the one fetch from %s failed: %s" % (remote, err) if err
                   else "not in this clone, and the fetch from %s did not bring it" % remote)
        for oid in missing:
            if oid not in have:
                result[oid] = Unreadable("blob %s is %s" % (oid[:12], why))
    pending = sorted((oid, keep) for oid, keep in wanted.items() if oid in have)
    while pending:
        pending = _read_batch(git, pending, result)
    return result


def _read_batch(git, pending, result):
    """Read pending [(oid, (limit, lines))] into result until cat-file stops; return what is left."""
    with tempfile.TemporaryFile() as errf:     # a file, not a pipe: nothing can fill it and hang
        try:
            proc = subprocess.Popen(["git", "-C", git.cwd, "cat-file", "--batch"],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=errf, env=git.read_env)
        except OSError as exc:
            raise CannotCheck("cannot run git cat-file: %s" % exc)
        stopped = None
        try:
            for i, (oid, keep) in enumerate(pending):
                try:
                    proc.stdin.write(oid.encode() + b"\n")
                    proc.stdin.flush()
                    header = proc.stdout.readline()
                except OSError:
                    header = b""
                if not header:
                    stopped = i                 # cat-file exited while reading this blob
                    break
                parts = header.split()
                if len(parts) != 3:
                    result[oid] = Unreadable("blob %s is %s" % (
                        oid[:12], b" ".join(parts[1:]).decode("utf-8", "replace")))
                    continue
                limit, lines = keep
                kept, have, left = [], 0, int(parts[2])
                breaks, after_cr, full = 0, False, False
                while left:
                    chunk = proc.stdout.read(min(left, 1 << 16))
                    if not chunk:
                        break
                    left -= len(chunk)
                    if full:
                        continue                # enough kept: the rest is read and dropped
                    piece = chunk[:limit - have]
                    kept.append(piece)
                    have += len(piece)
                    if lines is not None:
                        # a \r\n split across two chunks is one break, not two
                        breaks += len(LINE_BREAK_RE.findall(piece)) - (
                            1 if after_cr and piece.startswith(b"\n") else 0)
                        after_cr = piece.endswith(b"\r")
                    full = have >= limit or (lines is not None and breaks >= lines)
                if left:
                    stopped = i
                    break
                proc.stdout.read(1)             # the newline after each object
                result[oid] = b"".join(kept)
        except ValueError as exc:
            raise CannotCheck("git cat-file --batch answered %r" % exc)
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass
            proc.wait()
        if stopped is None:
            return []
        errf.seek(0)
        last = errf.read().decode("utf-8", "replace").strip().splitlines()
        oid = pending[stopped][0]
        result[oid] = Unreadable("blob %s could not be read: %s" % (
            oid[:12], last[-1] if last else "git cat-file exited %s" % proc.returncode))
        return pending[stopped + 1:]


# --- the check --------------------------------------------------------------------------------
def in_scope(path):
    if not path.startswith(DOCS) or path.startswith(EXCLUDED):
        return False
    return not ARCHIVE_DIRS.intersection(s.lower() for s in path[len(DOCS):].split("/")[:-1])


def ext(path):
    return os.path.splitext(path)[1].lower()


def check(git, entries, staged, diagrams_only, pool=None):
    """Return (findings {(kind, path): message}, unreadable [(path, reason)], checked count).

    entries are judged; pool is the whole tracked tree they belong to (the index for --staged),
    where a dated directory's record line is looked for."""
    findings, unreadable, checked = {}, [], set()
    names_apply = (lambda e: e.change in NAMING_CHANGES) if staged else (lambda e: True)
    image_apply = (lambda e: e.change in IMAGE_CHANGES) if staged else (lambda e: True)
    entries = [e for e in entries if in_scope(e.path)]
    pool = entries if pool is None else [e for e in pool if in_scope(e.path)]

    # Rule 1, and dated directories. Walking each path's directories from the top, the first one
    # named for what does not persist, or carrying a date, is ONE finding with its file count, and
    # no name under it is judged one by one. Under docs/architecture/ a dated directory is a
    # snapshot of past diagrams, the same finding as a dated diagram, not a record to be marked.
    dirs, named = {}, set()       # dir -> [("named", reason) | ("dated"|"snapshot", date), count]
    if not diagrams_only:
        for e in entries:
            if not names_apply(e):
                continue
            checked.add(e.path)
            segs = e.path[len(DOCS):].split("/")
            hit = None
            for i, seg in enumerate(segs[:-1]):
                reason = segment_reason(seg, True, top=(i == 0))
                date = None if reason else find_date(seg)
                if reason or date:
                    d = DOCS + "/".join(segs[:i + 1]) + "/"
                    hit = (d, ("named", reason) if reason else
                           ("snapshot" if d.startswith(ARCH) else "dated", date[1]))
                    break
            if hit:
                dirs.setdefault(hit[0], [hit[1], 0])[1] += 1
                continue
            reason = segment_reason(segs[-1], e.mode == GITLINK)
            if reason:
                findings[("not-persistent", e.path)] = "%s; %s" % (reason[1], remedy(reason))
                named.add(e.path)
    walked = sorted(dirs)

    def covered(path):
        """Under a directory that is already one finding: no name under it is judged again."""
        return any(path.startswith(d) for d in walked)

    # Rule 2 (dated text files and dated directories) and rule 3 (diagrams) need bytes; collect
    # everything to read first, so a partial clone fetches what it lacks in one round trip.
    wanted, records, markers, images = {}, [], {}, []

    def want(e, limit, lines=None):
        if not e.oid:
            return
        if e.oid in wanted:
            old_limit, old_lines = wanted[e.oid]
            limit = max(limit, old_limit)
            lines = None if lines is None or old_lines is None else max(lines, old_lines)
        wanted[e.oid] = (limit, lines)

    if not diagrams_only:
        for e in entries:
            if (not names_apply(e) or ext(e.path) not in TEXT_EXT or e.path in named
                    or covered(e.path) or e.mode in (SYMLINK, GITLINK)):
                continue
            date = find_date(e.path.rsplit("/", 1)[-1])
            if date:
                records.append((e, date[1]))
                want(e, TEXT_HEAD_BYTES, RECORD_LINES)
        for d, (how, _) in dirs.items():
            if how[0] != "dated":
                continue
            markers[d] = [e for e in pool if e.path.startswith(d) and "/" not in e.path[len(d):]
                          and ext(e.path) in TEXT_EXT and e.mode not in (SYMLINK, GITLINK)]
            for e in markers[d]:
                want(e, TEXT_HEAD_BYTES, RECORD_LINES)
    # Rule 3 measures every image under docs/architecture/ that this run judges, whatever
    # directory finding covers it: a name finding is not a size finding, and moving or renaming a
    # diagram does not make it readable.
    for e in entries:
        if (not e.path.startswith(ARCH) or ext(e.path) not in IMAGE_EXT
                or not (names_apply(e) or image_apply(e))):
            continue
        measure = image_apply(e) and e.mode not in (SYMLINK, GITLINK)   # a link is never read
        images.append((e, measure))
        if measure:
            want(e, IMAGE_HEAD_BYTES)

    blobs = read_blobs(git, wanted)

    def bytes_of(e):
        if not e.oid:
            raise Unreadable("unmerged: the index holds no single staged blob to read")
        data = blobs.get(e.oid)
        if isinstance(data, Unreadable):
            raise data
        if data is None:
            raise Unreadable("blob %s was not read" % e.oid[:12])
        return data

    for e, date in records:
        try:
            head = bytes_of(e)
        except Unreadable as exc:
            unreadable.append((e.path, str(exc)))
            continue
        if not has_record_line(head):
            findings[("record-unmarked", e.path)] = (
                "a dated file is read as a record of its date. A record (an incident report, an "
                "audit, a measurement baseline, a periodic review) says so at the start of a line "
                "in its first %d lines ('> Dated record, <kind>, %s: not kept current. ...'); a "
                "phase's or a session's notes, or a run's output, is not a record: fold what lasts "
                "into the canonical document it changes and archive the rest; a document meant to "
                "be current takes the date out of its name and is kept current"
                % (RECORD_LINES, date))
    for d in sorted(markers):
        (how, count), errors, marked = dirs[d], [], False
        for e in markers[d]:
            try:
                if has_record_line(bytes_of(e)):
                    marked = True
                    break
            except Unreadable as exc:
                errors.append("%s: %s" % (e.path, exc))
        if marked:
            continue
        if errors:
            unreadable.append((d, "cannot tell whether it is marked as a dated record: "
                               + "; ".join(errors)))
            continue
        findings[("record-unmarked", d)] = (
            "directory %s: its name carries a date (%s), so it is read as a record of that date; "
            "%s. A record says so in a text file directly inside it, such as its README.md, at the "
            "start of a line in its first %d lines ('> Dated record, <kind>, %s: not kept current. "
            "...'); a run's output or a phase's working material is not a record and leaves "
            "docs/ (work/phase-<id>/, an output path outside docs/, or docs/_archive/); a "
            "directory meant to be current takes the date out of its name; %s"
            % (d, how[1], _count(count, staged), RECORD_LINES, how[1], WRITER_TOO))
    for d, (how, count) in dirs.items():
        if how[0] == "named":
            findings[("not-persistent", d)] = "directory %s: %s; %s; %s; %s" % (
                d, how[1][1], _count(count, staged), remedy(how[1]), WRITER_TOO)
        elif how[0] == "snapshot":
            findings[("not-persistent", d)] = (
                "directory %s: its name carries a date (%s), so the diagrams in it are a snapshot "
                "of a past state; %s; %s; %s"
                % (d, how[1], _count(count, staged), SNAPSHOT_INSTEAD, WRITER_TOO))

    for e, measure in images:
        checked.add(e.path)
        if (names_apply(e) and not covered(e.path)
                and ("not-persistent", e.path) not in findings):
            date = find_date(e.path[len(ARCH):])
            if date:
                findings[("not-persistent", e.path)] = (
                    "a dated diagram (%s) is a snapshot of a past state: %s"
                    % (date[1], SNAPSHOT_INSTEAD))
        if not measure:
            continue
        try:
            w, h, dpi = image_size(e.path, bytes_of(e))
        except Unreadable as exc:
            unreadable.append((e.path, str(exc)))
            continue
        msg = diagram_message(w, h, dpi)
        if msg:
            findings[("diagram-unreadable", e.path)] = msg
    return findings, unreadable, len(checked)


def _count(n, staged):
    return ("%d file%s added under it" if staged else "%d tracked file%s under it") % (
        n, "" if n == 1 else "s")


def shown(path):
    return path if path.isprintable() else ascii(path)[1:-1]


def _quiet(name):
    """Point sys.<name>, whose write failed, at /dev/null, so the flush at exit cannot fail as
    well and turn the check's exit code into Python's 120. With no descriptor to point, drop it:
    the flush at exit skips a stream that is None."""
    try:
        target = getattr(sys, name).fileno()
        fd = os.open(os.devnull, os.O_WRONLY)
        if fd != target:
            os.dup2(fd, target)
            os.close(fd)
    except (OSError, ValueError, AttributeError):
        setattr(sys, name, None)


def _emit(name, text):
    """Write to sys.stdout or sys.stderr. A reader that closed it early (| head), never opened it
    (>&-) or cannot take it (a full disk) is treated alike: the text is dropped, quietly, and the
    exit code stays the check's. Return whether the text was written."""
    stream = getattr(sys, name)
    if stream is None:
        return False
    try:
        stream.write(text)
        stream.flush()
    except (OSError, ValueError):
        _quiet(name)
        return False
    return True


def _write(text):
    return _emit("stdout", text)


def _say(text):
    _emit("stderr", text + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="docs_check.py",
        description="Check that docs/ holds only what persists, from the tracked tree.")
    which = ap.add_mutually_exclusive_group()
    which.add_argument("--staged", action="store_true",
                       help="only what the index adds or changes relative to HEAD")
    which.add_argument("--rev", metavar="REV", help="the tree of this commit, not the index")
    ap.add_argument("--diagrams-only", action="store_true",
                    help="only the diagram rule (docs/architecture/ images)")
    ap.add_argument("--json", action="store_true", help="one JSON object on stdout")
    ap.add_argument("-C", metavar="DIR", default=".", dest="cwd", help="run in DIR")
    args = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")
    mode = "staged" if args.staged else ("rev:%s" % args.rev if args.rev is not None else "index")

    try:
        git = locate(args.cwd, need_worktree=args.rev is None)
        pool = None
        if args.rev is not None:
            entries = list_rev(git, args.rev)
        elif args.staged:
            pool = list_index(git)
            entries = list_staged(git)
        else:
            entries = list_index(git)
        findings, unreadable, checked = check(git, entries, args.staged, args.diagrams_only, pool)
    except Exception as exc:                    # CannotCheck, or a defect in this checker
        why = one_line(exc)
        if args.json:
            _write(json.dumps({"error": why, "mode": mode, "complete": False}) + "\n")
        _say("docs-check: cannot check: %s" % why)
        return 2

    rows = sorted(((path, kind, msg) for (kind, path), msg in findings.items()))
    if args.json:
        _write(json.dumps({
            "findings": [{"kind": k, "path": p, "message": m} for p, k, m in rows],
            "checked": checked,
            "mode": mode,
            "complete": not unreadable,
            "unreadable": [{"path": p, "reason": r} for p, r in sorted(unreadable)],
        }) + "\n")
    else:
        for path, kind, msg in rows:
            if not _write("%s  %s  %s\n" % (kind, shown(path), msg)):
                break
    for path, reason in sorted(unreadable):
        _say("docs-check: cannot read %s: %s" % (shown(path), reason))
    if unreadable:
        _say("docs-check: NOT CHECKED: %d path%s could not be read; %d finding%s in %d paths "
             "checked" % (len(unreadable), "" if len(unreadable) == 1 else "s", len(rows),
                          "" if len(rows) == 1 else "s", checked))
        return 2
    if rows:
        _say("docs-check: %d finding%s in %d paths checked"
             % (len(rows), "" if len(rows) == 1 else "s", checked))
        return 1
    _say("docs-check: clean, %d paths checked" % checked)
    return 0


def one_line(exc):
    """An exception as one line: its own words for CannotCheck, else its type and words."""
    text = str(exc) if isinstance(exc, CannotCheck) else "%s: %s" % (type(exc).__name__, exc)
    return " ".join(text.split()) or type(exc).__name__


def run(argv=None):
    """main(), with the exit code kept the check's: Python exits 1 on an uncaught exception, which
    every caller reads as 'findings'. A defect anywhere is exit 2, 'cannot check', in one line."""
    try:
        return main(argv)
    except Exception as exc:
        _say("docs-check: cannot check: %s" % one_line(exc))
        return 2


if __name__ == "__main__":
    sys.exit(run())
