---
description: Draw the project's architecture as a few readable views - an overview, detail views, a flow chart, a swim lane - from what it has deployed, and keep them current in the READMEs (project)
allowed-tools:
  - Read
  - Bash
  - Write
  - Edit
  - AskUserQuestion
---

<!--
  Centrally distributed by /distribute-defaults from syndicate-playbooks-examples.
  Project-specific additions go in .claude/local-overlays/<this-filename> as
  splice fragments (see /distribute-defaults for the overlay format).
  Direct edits to this file will be flagged on the next distribution.
-->

# Generate Architecture Views

Show the people who read about this project (its operators, developers and users) what the
solution is. Draw it as a small set of **views**, each readable at the width it is shown, from what
the project has deployed, and keep them current in `README.md` and `docs/architecture/README.md`.

---

## Why views, not one diagram

One picture of a whole solution grows with the solution, and the page it is shown on does not. A
README column is about 880 px wide. A diagram drawn 4,103 px wide is shown there at a fifth of its
size, and its labels at 3 px: the picture is on the page and nobody can read it. Measured
2026-10-30 on the workstation: 11 of 12 architecture diagrams were 1,572 to 4,103 px wide, and their
10 pt labels showed at 2.9 to 7.5 px. The operator, the same day: *"we have a problem with
readability, we need to approach it smarter in case solutions are getting complex, divide diagram
to readable parts if needed, use accompanying diagrams like flow chart, swim lines eg, keep extent
manageable, this part its for operators, developers, users to see what the solution is about"*.

So a solution is drawn as views, and every view is held to a budget:

| View | File | For | Shows | When |
|---|---|---|---|---|
| **Overview** | `overview.png` | everyone | who uses the solution, each subsystem as one box, the external systems it talks to | always; the root README shows this one |
| **Detail** | `<subsystem>.png` | developers, operators | the parts of one subsystem and how they connect; an edge that leaves the view ends at a plain box naming the other view | only for a subsystem whose parts the overview cannot hold |
| **Flow chart** | `flow-<process>.png` | operators, users | the steps and decisions of one process: an order handled, a release deployed, a nightly import | for the processes people ask about |
| **Swim lane** | `lanes-<process>.png` | everyone | who does what, in order, across actors: the user, the operator, each system part, one lane each | when a process crosses actors and the order matters |

**The budget, per view:** at most 12 nodes, 4 clusters and 16 edges (a swim lane: at most 12
steps in at most 6 lanes), no text under 13 pt, and an image at most 1,350 px wide and 1,600 px
tall, drawn at 96 dpi: a view is never scaled down with Graphviz `size`, `dpi` or `resolution`,
which would shrink its labels again. Graphviz renders at 96 dpi and the library's labels are 13 pt
(17.3 px): an image 1,350 px wide, shown 880 px wide, still shows them at 11 px, and 1,600 px tall
is about one screen at that scale. `generate.py` reports each view's counts and fails a view over
budget, and an image in `docs/architecture/` it neither drew nor lists in `KEEP` (Step 6);
`docs-check` measures the images (Step 5), and so do the commit guard and `/repo-hygiene` when an
image changes.

**The extent:** an overview, at most four detail views, and at most three flow charts and swim
lanes together. A solution that
needs more is drawn coarser, not in more views: the views explain what the solution is, and the
complete list of resources is the project's `resource_inventory` and its infrastructure code, not
a picture. Leave out what explains nothing to these readers (roles, log groups, alarms, the
permission between two functions) unless it is the point of the view.

---

## Prerequisites

The generator needs the Python package `diagrams` and Graphviz (`dot`); the flow chart and the swim
lane use the `graphviz` package that `diagrams` installs with it. Work through these in order:

1. **Use what the project provides.** If the project has its own way to run the generator, such as
   a `make architecture` target or a container named in its `CLAUDE.md`, run `generate.py` through
   it in Step 4. It runs the views and does not replace them: a script that draws one diagram is
   rewritten as views (Step 3), whatever runs it.
2. **Check what is already there:** `python3 -c 'import diagrams, graphviz'` and `command -v dot`.
   If both succeed, install nothing.
3. **Install only where the host's rules allow it.** On a shared or administered host, never
   install packages. That means a member host, a machine whose administrator is someone else, or
   any project whose `CLAUDE.md` forbids host changes. Report the missing dependency instead, so
   the project or the operator can provide it. Installing is fine on a host you administer alone,
   such as your own workstation, and there these two commands do it:

```bash
pip3 install --break-system-packages diagrams
sudo apt-get install -y graphviz
```

---

## Usage

```
/generate-architecture
```

It takes no arguments. The views are named by what they show (the table above), and the images
land in `docs/architecture/` beside `generate.py`.

---

## Steps

### 1. Read what is there

Read `docs/architecture/generate.py` if it exists, the images in `docs/architecture/`, and where
`README.md` and `docs/architecture/README.md` show them. A `generate.py` built from the template
below (it defines `View`, `flow`, `lanes` and `check`) is kept and edited. Any other is rewritten
from the template in Step 3, and what it drew becomes material for the plan: the old single
picture is what the operator could not read. Another script beside it that the project keeps,
drawing an image of its own (a physical topology, say), stays as it is (Step 6).

### 2. Plan the views

Establish the architecture in this source order, stopping at the first that answers:
1. `resource_inventory` in progress.json, and the completed tasks that created the resources
2. the project's own infrastructure-as-code: CDK, CloudFormation or Terraform under its declared path
3. a live account inventory, where the account is reachable (`/check-aws` resolves the handle)
4. the project's own code and its entry documents (`README.md`, `CLAUDE.md`, runbooks), for what
   is built but not deployed as infrastructure: a library, a tool, a pipeline run by hand
5. `IMPLEMENTATION_PLAN.md` last, and only for the shape that was *originally intended*

The diagram describes what exists, which is why the first four outrank the fifth. The
specification is the Phase-0 origin record, frozen at approval: a diagram drawn from it shows a
system that was planned, not one that is running, and nothing in the picture says which of the two
a reader is looking at. `docs/architecture/README.md` names the source actually used (Step 8).

From that source, list the solution's actors (who uses or runs it), its subsystems (parts a reader
would name: ingestion, the API, the admin console), the external systems it talks to, and up to
three processes people ask about (none, if nobody asks). Then decide the views by the table above:
the overview always; a detail view for each subsystem with more parts than the overview can hold;
a flow chart for a process with decisions in it; a swim lane for a process that crosses actors. A
flow chart shows how a process runs at a glance; it does not restate a procedure whose steps have
a home elsewhere (a runbook, a command): name that home in the view's section of
`docs/architecture/README.md`. Write the plan in the `Views:` block of the docstring of
`generate.py`, one line per view: its image, its readers, what it shows.

### 3. Write or rewrite generate.py

If `docs/architecture/generate.py` does not exist, or was not built from the template, write it
from the template below and the plan, and say so in the report: no `generate.py` was found, or
the one there drew a single diagram, so one was written as views. Writing it is the work
this command was run for, not a decision to put to the operator (`PROJECT_CHARTER.md` § 3).

Replace the examples in `draw()` with the plan's views, one for each line of the `Views:` block,
delete each example the plan has no view for, and fill in the `{{...}}` placeholders; keep the
helpers as they are. A view that comes out over budget is split, never squeezed: move parts into
a detail view, or draw a subsystem as one box. A part that several views touch (a shared table, a
bucket) is drawn in one of them; the others end their edge at a plain box naming that view, so no
part is drawn twice. Labels say what a reader recognises ("Order API", "Nightly import"), not a
resource id: under an icon, two lines of about 13 characters, because an icon is 1.4 in wide and a
longer label runs under its neighbour (the run warns about each one). Keep arrows off cluster
titles: end one at the cluster's edge, title the cluster at its foot, or drop a cluster that only
groups (the template's docstring shows how).

### 4. Run the generator

```bash
python3 docs/architecture/generate.py
```

It prints one line per view (its image, its counts, its size in pixels and the dpi it was drawn
at) and exits 1 naming each view over budget, a missing overview, a view whose name does not say
its kind, and each image in `docs/architecture/` it neither drew nor lists in `KEEP` (Step 6). An
image in `KEEP` is measured against the same size limit. Split the views over budget (Step 3),
retire the images no view draws (Step 6), and run it again.

### 5. Check readability, then look

```bash
git add docs/architecture
python3 .claude/skills/docs-check/docs_check.py --diagrams-only
```

docs-check reads the git index, not the files on disk, so the views are staged first (staging is
not committing). Exit 0: every staged image in `docs/architecture/` is within 1,350 × 1,600 px (a
run that says `0 paths checked` checked nothing). Exit 1: it names each image over the limit, the
scale it is shown at in an 880 px column and what its labels become there; split that view
(Step 3). Exit 2: a path could not be read: it is named, and the findings for the rest are still
printed; fix that and run it again. An image whose name carries a date is reported too: it is a
snapshot of a past state, so it is archived (Step 6) or redrawn as a current view.

Then **look at every image** (the Read tool shows it). A view within the limit can still be hard to
read: labels over each other, a swim lane step outside its lane, a long edge label. Fix what you see
in `generate.py` and run Step 4 again.

### 6. Retire what no view draws any more

An image that another script the project keeps draws in `docs/architecture/`, under a name with no
date (a physical topology, say), is not stale: list it in `KEEP` in `generate.py`, the image's name
to the script that draws it, and Step 4 measures it against the same size limit. A dated snapshot,
or an image no script draws any more (the old single diagram, a view since merged), is moved to
`docs/_archive/architecture/`, never deleted. First repoint every reference to it
(`git grep -n '<old>.png'`): a current document points at the view that now shows what it showed,
and a document that cites the snapshot itself cites it at its archive path.

```bash
mkdir -p docs/_archive/architecture && git mv -- docs/architecture/<old>.png docs/_archive/architecture/
```

### 7. Update README.md

The root README shows the overview, near the top (after the title and overview), and links the
rest:

```markdown
## Architecture

![{Project Name} overview](docs/architecture/overview.png)

The detail views, the flows and how they are drawn: [docs/architecture/README.md](docs/architecture/README.md).
```

If an Architecture section exists, bring its image path and link into line with this.

### 8. Create or update docs/architecture/README.md

One section per view, in the order of the table above, each saying in a sentence what the view
shows and for whom, then the image. Create it with this shape if it does not exist:

```markdown
# Architecture

## Overview

[One sentence: what the solution is, for whom.]

![Overview](overview.png)

## <Subsystem> (detail)

[What this part does; which view it connects to.]

![<Subsystem>](<subsystem>.png)

## <Process> (flow)

[What starts it, what decides it, how it ends; where its steps are written down, if anywhere (a
runbook, a command).]

![<Process>](flow-<process>.png)

## <Process>, who does what (swim lane)

![<Process> by actor](lanes-<process>.png)

## Source

[Which source the views were drawn from: `resource_inventory` and the completed tasks, the
project's IaC, a live account inventory, the project's code and entry documents, or
`IMPLEMENTATION_PLAN.md` as the originally intended shape. And the date they were drawn. Views
drawn from the specification show what was planned, not what runs.]

## Regenerating

    python3 docs/architecture/generate.py
    git add docs/architecture
    python3 .claude/skills/docs-check/docs_check.py --diagrams-only

docs-check reads the git index, so the views are staged before it measures them (staging is not
committing). Requirements: the Python package `diagrams` (which brings `graphviz`) and Graphviz
(`dot`). Install them only where the host's rules allow it (`/generate-architecture`
§ Prerequisites).
```

If it exists, keep its prose where it is still true, give each view its section, and refresh the
**Source** section to name the source this run actually drew from, with today's date. A view carries
no evidence of its own provenance: without that line a picture drawn from the Phase-0 specification
and a picture drawn from the live account are the same image to every reader who opens it.

---

## Output

```
## Architecture Views Generated

| View | Image | Nodes | Size |
|---|---|---|---|
| Overview | docs/architecture/overview.png | 9 | 1,180 × 640 px |
| ... | ... | ... | ... |

- generate.py: [written as views / rewritten from a single diagram / kept]
- docs-check --diagrams-only, after git add: [exit 0, N paths checked]
- Retired: [images moved to docs/_archive/architecture/, or none]
- README.md: [updated / already current]
- docs/architecture/README.md: [created / updated]
- Source: [the source used, and today's date]
```

---

## generate.py Template

When writing `generate.py`, start from this. Keep the helpers; replace the `Views:` block and the
examples in `draw()` with the plan, and list in `KEEP` each image another kept script draws here.

```python
#!/usr/bin/env python3
"""
{{PROJECT_NAME}} - architecture views, each readable in an 880 px README column

Views: the plan (/generate-architecture Step 2); replace these lines with yours, one per view.
  overview.png     everyone: who orders, the subsystems, the payment and mail services
  orders.png       developers, operators: the Order API's functions and its table (detail)
  flow-order.png   operators, users: the checks an order passes before it is placed
  lanes-order.png  everyone: who does what, in order, when an order is placed

View() draws the overview (required, shown in the root README) and up to 4 detail views; flow()
and lanes() draw up to 3 flow charts and swim lanes. Per view: 12 nodes, 4 clusters, 16 arrows
(a swim lane: 6 lanes, 12 steps), 1350 x 1600 px drawn at 96 dpi and never scaled (no size, dpi
or resolution), no text under 13 pt, and under an icon 2 lines of about 13 characters. Draw a
store in one view; an arrow leaving it ends at see(). Keep arrows off cluster titles: end one at
the cluster's edge (Edge(lhead="cluster_<title>")), title the cluster at its foot (graph_attr=
{"labelloc": "b"}) or drop a cluster that only groups. Exits 1 naming each view that breaks a
rule and each image here (not subfolders) that it did not draw and KEEP does not list.
"""
import json
import os
import sys
from pathlib import Path

import graphviz  # installed with diagrams
from diagrams import Cluster, Diagram, Edge, Node
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.onprem.client import User, Users

SCRIPT_DIR = Path(__file__).resolve().parent
LIMITS = {"nodes": 12, "clusters": 4, "lanes": 6, "edges": 16, "width": 1350, "height": 1600}
MIN_PT, MIN_DPI = 13, 96
MAX_VIEWS = {"detail": 4, "flow": 3}  # besides the overview; a swim lane is a flow
SCALERS, IMAGES = ("size", "dpi", "resolution", "viewport"), (".png", ".svg", ".jpg", ".jpeg")
TEXT = {"fontname": "Sans-Serif", "fontsize": "13", "fontcolor": "#2D3436"}  # diagrams' default
BOX = {"shape": "box", "style": "rounded,filled", "fillcolor": "white"}
LANE_COLOURS = ["#E5F5FD", "#EBF3E7", "#ECE8F6", "#FDF7E3"]  # diagrams' cluster colours
KEEP = {}  # image here: the kept script that draws it, e.g. {"topology.png": "topology.py"}
DRAWN = {}  # png: (graph, maker) of every view, for check()
# diagrams titles a cluster at 12 pt, the one text it draws under 13 pt.
Cluster._default_graph_attrs = {**Cluster._default_graph_attrs, "fontsize": str(MIN_PT)}

class View(Diagram):
    def __init__(self, name, title, direction="TB"):
        # TB fits the tall limit (LR gives each labelled arrow a column); splines take labels.
        super().__init__(title, filename=str(SCRIPT_DIR / name), show=False, direction=direction,
                         graph_attr={"pad": "0.3", "labelloc": "t", "splines": "spline",
                                     "nodesep": "0.5", "ranksep": "0.7", "compound": "true"})
        _record(self.dot, name, "View")

def _record(graph, name, maker):
    if SCRIPT_DIR / f"{name}.png" in DRAWN:  # drawn again, it would replace a view never checked
        raise ValueError(f"{name}.png: two views have this name; give each its own")
    DRAWN[SCRIPT_DIR / f"{name}.png"] = (graph, maker)
    if maker != "View":  # diagrams draws a View itself, as its `with` block ends
        graph.render(SCRIPT_DIR / name, format="png", cleanup=True)

def _box(label, **kw):
    return Node(label, fixedsize="false", width="1.6", height="0.7", labelloc="c", **{**BOX, **kw})
def part(label, view=None):
    """A subsystem as one box; `view` names the detail view that opens it up."""
    return _box(f"{label}\n({view}.png)" if view else label)
def external(label):
    """A system outside the solution that it talks to."""
    return _box(label, fillcolor="#EEEEEE", color="#999999")
def see(label, view):
    """Where an arrow leaves this view, naming the view it continues in."""
    return _box(f"{label}\n(see {view}.png)", style="rounded,dashed", color="#7B8894")

def _graph(name, title, **attrs):
    return graphviz.Digraph(name, graph_attr={**TEXT, "label": title, "labelloc": "t", "pad": "0.3",
                                              "fontsize": "15", **attrs},
                            node_attr={**BOX, **TEXT}, edge_attr={"color": "#5B6874", **TEXT})

def _steps(view, ids, arrows, why=()):
    """Each step's dot name, s0, s1, ...: no step id can clash with a name made here."""
    for reason in [*why, *["it has no steps"] * (not ids),
                   *(f"step {s!r}: its id is used twice" for s in ids if ids.count(s) > 1),
                   *(f"an arrow names {e!r}, which is not a declared step"
                     for arrow in arrows for e in arrow[:2] if e not in ids)]:
        raise ValueError(f"{view}: {reason}")
    return {sid: f"s{n}" for n, sid in enumerate(ids)}

def flow(name, title, steps, arrows):
    """A flow chart. steps: [(id, kind, label)], kind start|end|step|decision;
    arrows: [(from, to, label)], yes/no on a decision's arrows."""
    shape = {"start": "oval", "end": "oval", "step": "box", "decision": "diamond"}
    node = _steps(name, [step[0] for step in steps], arrows, [f"step {s!r}: its kind is not "
                  f"one of {', '.join(shape)}" for s, k, _ in steps if k not in shape])
    g = _graph(name, title, nodesep="0.4", ranksep="0.35")
    for sid, kind, label in steps:
        g.node(node[sid], label, shape=shape[kind],
               fillcolor="#EBF3E7" if kind in ("start", "end") else "white")
    for a, b, label in arrows:
        g.edge(node[a], node[b], label=label)
    _record(g, name, "flow")

def lanes(name, title, actors, steps, arrows):
    """A swim lane. actors: lane names, top to bottom, each once. steps: [(id, actor, column,
    label)], column a whole number from 0, left to right in time. arrows: [(from, to, label)]."""
    node = _steps(name, [step[0] for step in steps], arrows, [
        *(f"actor {a!r} is listed twice" for a in actors if actors.count(a) > 1),
        *(f"step {s!r}: {a!r} is not an actor" for s, a, _, _ in steps if a not in actors),
        *(f"step {s!r}: its column {c!r} is not a whole number from 0" for s, _, c, _ in steps
          if type(c) is not int or c < 0),
        *(f"step {s!r}: {a!r} has a step in column {c} already" for n, (s, a, c, _)
          in enumerate(steps) if (a, c) in [(t[1], t[2]) for t in steps[:n]])])
    where = {sid: (actors.index(actor), col) for sid, actor, col, _ in steps}
    columns = range(max(c for _, c in where.values()) + 1)
    text, rows = {node[sid]: label for sid, _, _, label in steps}, []
    g = _graph(name, title, nodesep="0.25", ranksep="0.45")
    for i, actor in enumerate(actors):
        # A lane is one rank, which fixes the lane order; with an invisible node in each empty
        # cell, the weighted edges below line every column up across the lanes.
        cell = {col: node[sid] for sid, (lane, col) in where.items() if lane == i}
        rows.append([f"lane{i}"] + [cell.get(c, f"cell{i}_{c}") for c in columns])
        with g.subgraph(graph_attr={"rank": "same"}) as r:
            r.node(rows[-1][0], actor, shape="plaintext", style="", fontname="Sans-Serif Bold",
                   **{"class": "lane"})
            for c, n in enumerate(rows[-1][1:]):
                r.node(n, text.get(n, ""), group=str(c),
                       **({} if n in text else {"style": "invis", "width": "0.1"}))
        for a, b in zip(rows[-1], rows[-1][1:]):
            g.edge(a, b, style="invis")
    for a, b in (pair for upper, lower in zip(rows, rows[1:]) for pair in zip(upper, lower)):
        g.edge(a, b, style="invis", weight="100")
    for a, b, label in arrows:
        # dot ranks downward and keeps lane order: an arrow up or back is laid out reversed, head
        # drawn at its start. Weight 0 keeps columns. A passed lane would hold the label: start.
        back, passes = where[a] > where[b], abs(where[a][0] - where[b][0]) > 1
        at = ("headlabel" if back else "taillabel") if passes else "label"
        g.edge(*((node[b], node[a]) if back else (node[a], node[b])), weight="0", **{at: label},
               dir="back" if back else "forward", labeldistance="2.5", labelangle="35")
    # A cluster per lane routes an arrow that passes a lane around it: bands are painted.
    layout = json.loads(g.pipe(format="json0"))
    x0, _, x1, _ = (float(v) for v in layout["bb"].split(","))
    top = float(layout["lp"].split(",")[1]) - float(layout["lheight"]) * 36 - 4  # title's foot
    placed, paint = {o["name"]: o for o in layout["objects"] if "pos" in o}, ""
    for i, row in enumerate(rows):
        y = float(placed[row[0]]["pos"].split(",")[1])
        half = max(float(placed[n]["height"]) for n in row) * 36 + 8
        y0, y1, c = y - half, min(y + half, top), LANE_COLOURS[i % len(LANE_COLOURS)]
        paint += f"C 7 -{c} c 7 -{c} P 4 {x0} {y0} {x1} {y0} {x1} {y1} {x0} {y1} "
    g.graph_attr["_background"] = paint
    _record(g, name, "lanes")

def measure(graph, width, height):
    """A view's counts, size and dpi; the limits it breaks; label lines wider than their node."""
    layout = json.loads(graph.pipe(format="json", quiet=True))  # json, not json0: text as drawn
    sub, objects, edges = layout.get("_subgraph_cnt", 0), layout["objects"], layout.get("edges", [])
    shown = [o.get("class") for o in objects[sub:] if "invis" not in o.get("style", "")]
    x0, _, x1, _ = (float(v) for v in layout["bb"].split(","))
    dpi = 72 * width / (x1 - x0 + 2 * 72 * float(layout.get("pad", "0.0555").split(",")[0]))
    found = {"nodes": len(shown) - shown.count("lane"), "lanes": shown.count("lane"),
             "clusters": sum(o["name"].startswith("cluster") for o in objects[:sub]),
             "edges": sum("invis" not in e.get("style", "") for e in edges),
             "width": width, "height": height, "dpi": round(dpi)}
    tiny, wide = [], []
    for item in [layout, *objects, *edges]:
        size = 14.0  # Graphviz's default
        for op in item.get("_ldraw_", []) + item.get("_hldraw_", []) + item.get("_tldraw_", []):
            size = op["size"] if op["op"] == "F" else size
            if op["op"] == "T":
                tiny += [op["text"]] * (size < MIN_PT)
                wide += [op["text"]] * ("width" in item and op["width"] > float(item["width"]) * 72)
    over = [f"{k} {found[k]} (max {v})" for k, v in LIMITS.items() if found[k] > v]
    # Under 96 dpi a 13 pt label shows under 17 px: a scaled drawing defeats MIN_PT.
    over += [f"{k}={layout[k]} (scales the drawing: remove it)" for k in SCALERS if k in layout]
    over += [f"drawn at {dpi:.0f} dpi (min {MIN_DPI})"] * (dpi < MIN_DPI * .98)
    return found, over + [f"{len(tiny)} texts under {MIN_PT} pt, as {t!r}" for t in tiny[:1]], wide

def png_size(path):
    """(width, height) from a whole PNG, else None: a Git LFS pointer, a file cut short."""
    data = path.read_bytes() if path.is_file() and os.access(path, os.R_OK) else b""
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR" and data[-8:-4] == b"IEND":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")

def check():
    """Print every view and every other image here; return 1 if any breaks a rule."""
    makers = {png.stem: maker for png, (_, maker) in DRAWN.items()}
    kinds = ["detail" if m == "View" else "flow" for s, m in makers.items() if s != "overview"]
    over = [f"OVER A LIMIT: {kinds.count(k)} {k} views (max {v})" for k, v in MAX_VIEWS.items()
            if kinds.count(k) > v] + ['overview.png: not drawn; draw it with View("overview", ...),'
                                      " the README shows it"] * ("overview" not in makers)
    over += [f"{s}.png: drawn by {m}(), so its name must " + ("not start with flow- or lanes-"
             if m == "View" else f"start with {m}-") for s, m in makers.items()
             if (s.startswith(("flow-", "lanes-")) if m == "View" else not s.startswith(f"{m}-"))]
    warn, stale = [], [p for p in sorted(SCRIPT_DIR.iterdir()) if p.suffix.lower() in IMAGES]
    for p in [*DRAWN, *(p for p in stale if p not in DRAWN)]:
        size, new, kept = png_size(p), p not in DRAWN, KEEP.get(p.name)
        (w, h), tag = size or (0, 0), f"KEPT, drawn by {kept}" if kept else "NOT DRAWN" * new
        over += [f"{p.name}: not a PNG / unreadable"] * (p.suffix.lower() == ".png" and not size)
        over += [f"{p.name}: not drawn here and not in KEEP: a stale image - archive it (git mv"
                 " to docs/_archive/architecture/) or draw it as a view"] * bool(new and not kept)
        over += [f"OVER A LIMIT {p.name}: {w} x {h} px, wider or taller than a view may be"] * bool(
            kept and new and (w > LIMITS["width"] or h > LIMITS["height"]))  # KEEP: a view's limit
        if new or not size:
            print(os.path.relpath(p), tag, f"{w}x{h}" if size else "-", sep="  ")
            continue
        found, excess, wide = measure(DRAWN[p][0], *size)
        print(os.path.relpath(p), *(f"{k}={v}" for k, v in found.items()))
        over += [f"OVER A LIMIT {p.name}: {', '.join(excess)}"] * bool(excess)
        warn += [f"WARNING {p.name}: label line {t!r} is wider than its node" for t in wide]
    sys.stdout.flush()  # so the table comes first when both streams go to one log
    print(*warn, *over, sep="\n", file=sys.stderr, end="\n" * bool(warn or over))
    return 1 if over else 0

def draw():
    with View("overview", "{{PROJECT_NAME}} - overview"):
        customers, operator = Users("Customers"), User("Operator")
        with Cluster("AWS {{AWS_ACCOUNT_ID}} ({{AWS_REGION}})", graph_attr={"labelloc": "b"}):
            web, orders, fulfil = part("Web app"), part("Order API", "orders"), part("Fulfilment")
        payments, mail = external("Payment provider"), external("Mail service")
        customers >> Edge(label="browse, order") >> web >> orders >> fulfil
        operator >> Edge(label="refunds") >> orders >> Edge(label="charge, refund") >> payments
        mail << Edge(label="confirmations") << fulfil  # laid out upward: nothing leaves at the foot

    with View("orders", "Order API (detail)"):
        web, fulfil = see("Web app", "overview"), see("Fulfilment", "overview")
        operator, payments = User("Operator"), external("Payment provider")
        with Cluster("Order API", graph_attr={"labelloc": "b"}):
            create, refund, table = Lambda("Create order"), Lambda("Refund"), Dynamodb("Orders")
        web >> Edge(label="new order") >> create
        operator >> Edge(label="refund") >> refund
        [create, refund] >> table >> Edge(label="order placed") >> fulfil
        # One arrow from the cluster's edge: two arrows to one box set their labels side by side.
        create >> Edge(label="charge, refund", ltail="cluster_Order API") >> payments

    flow("flow-order", "Placing an order",
         [("start", "start", "Customer submits\nan order"), ("valid", "decision", "Valid?"),
          ("charge", "step", "Charge the card"), ("paid", "decision", "Paid?"),
          ("store", "step", "Store the order,\nqueue fulfilment"), ("end", "end", "Order placed"),
          ("stop", "end", "Not placed:\nshow what to correct")],
         [("start", "valid", ""), ("valid", "stop", "no"), ("valid", "charge", "yes"),
          ("charge", "paid", ""), ("paid", "stop", "no"), ("paid", "store", "yes"),
          ("store", "end", "")])

    lanes("lanes-order", "Who does what when an order is placed",
          ["Customer", "Web app", "Order API", "Payment provider"],
          [("submit", "Customer", 0, "Submit order"), ("send", "Web app", 1, "Send order"),
           ("check", "Order API", 2, "Check, charge"), ("show", "Web app", 5, "Show receipt"),
           ("pay", "Payment provider", 3, "Take payment"), ("store", "Order API", 4, "Store order"),
           ("mail", "Customer", 5, "Gets e-mail")],
          [("submit", "send", ""), ("send", "check", ""), ("check", "pay", "charge"),
           ("pay", "store", "paid"), ("store", "show", ""), ("store", "mail", "receipt")])

if __name__ == "__main__":
    draw()
    sys.exit(check())
```

---

## Notes

- A view is drawn for its readers, not for completeness: if a reader would not name it, it is not
  a box.
- `Cluster()` groups what belongs together (one account, one subsystem); at most four per view, and
  nested at most one deep.
- `direction="LR"` suits a flow from left to right with few branches; `"TB"` suits layers.
- The script is idempotent: run it as often as the architecture changes.
