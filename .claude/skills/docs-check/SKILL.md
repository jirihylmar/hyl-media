---
name: docs-check
description: Check that docs/ holds only what persists - no phase, session, task or working-state names, no hand-off outside docs/handoff/, every dated file or directory marked as a dated record, every architecture diagram readable at the width it is shown. Invoke after git add, before you commit anything under docs/ (the commit guard runs it then anyway), when the commit guard or /repo-hygiene names a docs-check finding, and after regenerating diagrams.
---

# docs-check

`docs/` is where a reader looks for what is true now, so it holds only what persists: the
canonical documents, dated records that say they are records, `docs/_archive/` and dated hand-offs
in `docs/handoff/`. The rule has one home, `PROJECT_CHARTER.md` § 11 *`docs/` holds what
persists*. This skill does not restate it. It checks the tracked tree against it.

## Why it exists

The operator, 2026-10-30: docs/ *"should hold only persistent things. sometimes it happens that
they put some ad hoc things which get stale, in the worst case they use it as a scratch"*, and of
the architecture diagrams, *"we have a problem with readability"*. Two facts measured that day:
Graphviz renders PNG at 96 dpi, and 11 of the 12 architecture PNGs on the workstation were
1572-4103 px wide, so in an 880 px README column their 10 pt labels (the node size the old
`/generate-architecture` template set) were 2.9-7.5 px tall.

## Run it

```bash
python3 .claude/skills/docs-check/docs_check.py                    # the index: everything tracked under docs/
python3 .claude/skills/docs-check/docs_check.py --staged           # only what this commit adds or changes
python3 .claude/skills/docs-check/docs_check.py --rev origin/main  # one commit's tree
python3 .claude/skills/docs-check/docs_check.py --diagrams-only    # only the diagram rule
python3 .claude/skills/docs-check/docs_check.py --json -C <dir>    # one JSON object, another checkout
```

One line per finding, `<kind>  <path>  <message>`, sorted by path, then a summary on stderr.
`--json` gives `findings`, `checked`, `mode`, `unreadable` and `complete`, which is `false`
whenever anything could not be read or the run could not finish.

| Exit | Meaning |
|---|---|
| `0` | nothing found |
| `1` | findings |
| `2` | could not check: not a git work tree, an unknown revision, `docs` tracked as a symlink or a submodule, a git failure, a blob that could not be read, an image header that does not parse, a defect in the checker itself (one line, `docs-check: cannot check: <error>`, never Python's exit 1). The unread paths are named, and the findings for the rest are still printed. **Never read as clean.** |

The exit code is the check's alone. A reader that closes stdout early (`| head`), stdout or stderr
closed (`>&-`, `2>&-`) or a stdout that takes no byte (a full disk) drops the text, never changes
the code.

## The three findings, and what to do about each

| Kind | What it found | What to do |
|---|---|---|
| `not-persistent` | A file or directory under `docs/` named (a) for a phase, session, sprint, cycle, iteration or task **with its number** (`phase-12`, `session28`, `task_12.3`) or with a leading task id (`148.7-notes.md`); (b) for the next phase (`next-phase`); (c) for working state (a whole word `scratch`, `scratchpad`, `wip`, `tmp`, `temp`, `draft`, `drafts`, `todo`); (d) as a hand-off: a directory named `handoff` or `handover`, a file named that word alone, one that starts with it (after a date, if any) and carries a date or the word `session` (`_handoff_2026-06-21_vocab.md`, `2026-10-01-handoff.md`), or `SESSION-HANDOFF`. **(a)-(d) apply whatever the date**: a date and a record line do not make a phase's or a session's material a record (`phase-12-results-2026-10-30.md` is reported). Only a date directly after the word is read as a date, not as the word's number: `review-cycle-2026-10.md` is a review dated 2026-10, so the record rule below judges it. A directory is reported once, as `directory <path>: <reason>` with its file count, and no name under it is reported again. | Phase and session documentation is not kept in `docs/` under any name, dated or not. What lasts goes into the canonical document it changes; working material goes to `work/phase-<id>/`, swept when the phase closes; the rest goes to `docs/_archive/`. A record the operator needs (an incident report, an audit) is named for its subject and its date, not for a phase. A hand-off goes to `docs/handoff/<YYYY-MM-DD>-<name>/`. If a command or script of this project writes a directory there, change that command too, or it comes back. |
| `not-persistent` (hand-off folder) | `docs/Handoff/`, `docs/HANDOFF/`: the hand-off folder in the wrong case. Only `docs/handoff/` is skipped, so on a case-sensitive file system the two are different folders. | Rename it to `docs/handoff/`. |
| `not-persistent` (diagram) | Under `docs/architecture/`, an image whose path carries a date, or a **directory** whose name does (marked with a record line or not): a snapshot of a past state. | Archive it under `docs/_archive/`, or redraw it as the current view and take the date out of its name. |
| `record-unmarked` | A text file (`.md .markdown .txt .html .htm .rst .adoc`) whose name carries a date (`YYYY-MM-DD`, `YYYYMMDD` or `YYYY-MM`, `-` or `_` between the parts), without the record line. A **directory** outside `docs/architecture/` whose name carries a date is one finding for everything under it, unless a text file directly inside it, such as its `README.md`, carries the line (a symlink is never read, so a linked README does not mark it). A dated file that is not text is silent: its name identifies it. | If it is a record (an incident report, an audit, a measurement baseline, a periodic review), add the record line. A phase's or a session's notes, or a run's output, is not a record: fold what lasts into the canonical document it changes, move working material to `work/phase-<id>/` (a run's output to a path outside `docs/`), and archive the rest. If it is meant to be current, take the date out of its name and keep it current. For a dated directory, if a command or script of this project writes it there, change that command too, or it comes back. |
| `diagram-unreadable` | A `.png`, `.jpg` or `.jpeg` under `docs/architecture/` over the limit, **1350 x 1600 px**, wherever it is below that: the size rule is not a naming rule, so an image under a directory reported for its name is measured too. The message gives its size, the limit, the scale it is shown at in an 880 px column and the size a 13 pt label (the `diagrams` package's default) becomes there. | Split it into views with `/generate-architecture`: an overview, detail views, a flow chart or a swim lane, each within the limit. |

The record line **starts** one of the first 15 lines (after `>`, `*`, `-` or `**`, if any). A
line ends at `\n`, `\r\n` or `\r`, and a leading byte-order mark is ignored. The first 15 lines are
read up to 1 MB, so a self-contained page whose first line is a long inline stylesheet still counts:

```markdown
> Dated record, <kind>, <date>: not kept current. <Where the current state is kept.>
```

For example `> Dated record, audit, 2026-10-16: not kept current. The rule it measured is in the
project's conventions document.` The words `dated record` in the middle of a sentence do not count. In an HTML page
the line is an HTML comment in its first 15 lines:
`<!-- Dated record, report, 2026-10-16: not kept current. -->`.

## The diagram limit

Graphviz renders PNG at 96 dpi, and the `diagrams` package built on it draws node and edge labels
at 13 pt by default (Graphviz's own default is 14 pt), so a label is 17.3 px tall. A README or docs
page shows an image in a column about 880 px wide and scales a wider image down. A label stays
legible from 11 px up, so the widest image whose labels survive is 880 × 17.3 / 11 = 1386 px. The
limit is that, rounded down: **1350 px wide**. **1600 px tall** is about one screen at that scale,
and a reader cannot take in a taller image at once.

The raw pixels are measured. A PNG `pHYs` chunk is honoured only when it states more than 96 dpi,
a hi-dpi export whose labels are proportionally larger: 2700 × 1800 px at 192 dpi passes as
1350 × 900. **Graphviz writes no `pHYs` chunk at any `-Gdpi`**, so render at the default 96 dpi:
a `-Gdpi=192` render is measured at its raw size. A JPEG's density is not used, because most tools
stamp 72 dpi regardless. SVG, GIF and WebP are not measured.

## Who runs it

- **The commit guard** runs it with `--staged`. It notes a finding in what the commit adds and
  **never refuses** the commit.
- **`/repo-hygiene` Step 0** runs it over the tracked tree as quick check H.
- **`/generate-architecture` Step 5** runs it with `--diagrams-only` after drawing.

Run it yourself after `git add`, before you commit anything under `docs/`: it reads only what git
tracks or has staged, so a file you have not added is not seen (the commit guard runs it then
anyway).

## What it reads, and its limits

- **The tracked tree, through git, never the working tree.** The index by default (entries added
  with `git add -N` are skipped), one commit with `--rev` (a bare repository will do), or, with
  `--staged`, what the index adds to `HEAD`: the naming and record rules apply to added paths,
  the diagram rule to added or modified images, and a dated directory's record line is looked for
  in the whole index. A rename is read as a deletion and an addition, so its new path is judged:
  rename detection would compare the old blob's content, which a blobless clone does not have.
  An untracked file is not its business until it is staged.
- **Only the blobs a rule needs are read**: a dated text file's first lines, those of the text
  files directly inside a dated directory, and an image's header. In a blobless partial clone the
  missing ones are fetched in **one** fetch and nothing is fetched lazily, so an unreachable remote
  costs one failed fetch; the blobs it could not get are named, the findings it could make are
  still printed (and listed in `--json`, with `complete` false), and the run exits 2.
- **Scope:** `docs/` at the repository root. `docs/handoff/` and every directory named `_archive`
  or `archive` are skipped with everything under them. A symlink or a submodule under `docs/` gets
  the name rules and is never read.
- **Names, not content.** An ad hoc file with a neutral name (a `notes.md` under `docs/`) is not caught, and
  neither is a hand-off whose name starts with another word (`transfer-handover/`), nor a session's
  notes named by their date alone (`session-2026-10-30-notes.md`, which the record rule judges). Whether a
  document is canonical and current is a judgement, and the hygiene pass makes it (`/repo-hygiene`).
- **A word can be a false positive.** `temp-sensors.md` is a temperature document and is reported
  as working state; `2.1-migration.md` reads as a task id. There is no allow-list. The callers
  note and report and never refuse, so a false positive costs one line of output. The cure is a
  name that says what the file is.

## Related skills

- `/generate-architecture`: draws the views this check measures.
- `/repo-hygiene`: the periodic pass that judges what this check cannot.
- `/progress-check`: the same idea for `progress.json`, which is to catch the problem at the commit.
