#!/usr/bin/env python3
"""refs_check.py - open pull requests and unmerged branches, in this repository and its members.

Exit 0 = every repository was read and nothing is unbound
     3 = at least one item is UNBOUND (wins over 4; the NOT CHECKED ones are still named)
     4 = nothing is unbound, but a repository, or its pull-request dimension, is NOT CHECKED
     2 = progress.json is missing or unreadable, so no binding can be decided

WHY THIS EXISTS. A managing project missed an open pull request (booking-classic PR #1, the
central-access kit delivery) and an unmerged branch (web-cutover-links) in its member repository
for a day: nothing in the distributed defaults ever read a member's refs. The operator, in that
project's session: "you are responsible for managing the family, now booking and web members. with
some branch left, its the same issue". PROJECT_CHARTER.md section 14 now states the duty; this file
is what makes it decidable.

WHAT IT READS. This repository, plus every member its progress.json `relations` block declares
(section 14), by plain git only - no hosting API, no CLI, no token beyond what git already uses:
  1. `git ls-remote --symref` once per repository: the HEAD branch, refs/heads/*,
     refs/pull/<n>/head (GitHub, Gitea) and refs/merge-requests/<n>/head (GitLab).
  2. Only when something is not already known to be a base tip: one treeless fetch
     (`--filter=tree:0`, commits only) into a temporary bare repository that borrows the local
     clone's objects, and `for-each-ref --merged` against every base branch.
A ref whose commit is an ancestor of ANY base branch is handled and not listed. The bases are the
remote HEAD branch plus any `base_branches` the record declares (root key for this repository, the
member entry's key for a member).

WHAT PLAIN GIT CANNOT SEE. Whether a pull request is open. GitHub keeps refs/pull/<n>/head forever,
and a squash-merged or closed one is never an ancestor of the base. So a ref is classified by the
record, not by the host:
  BOUND     a NON-terminal task's `git_refs` names (repo, ref, sha): open work owns it
  RECORDED  a TERMINAL task's `git_refs` names it at that sha: its disposition is on record
  UNBOUND   anything else - the finding
  NOT CHECKED  the repository (or its pull-request dimension) could not be read - never clean
A binding holds only at the sha it names (a prefix of the ref's current tip): new commits are
unseen work, and the line then says which task names the older sha.

READ-ONLY. Every write goes to a temporary directory this process removes, on every exit path it
can catch. Every subprocess runs in its own process group under a timeout, and the whole group is
killed when the timeout fires, so no ssh child outlives the bound.
"""
import argparse
import concurrent.futures
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlsplit

#: Equal to progress_check.TERMINAL_STATUSES; scripts/test-refs-check.sh holds the two equal.
TERMINAL_STATUSES = {
    "complete", "completed", "superseded", "done", "closed", "dropped", "cancelled", "canceled",
    "resolved", "obsolete", "abandoned",
}

DEFAULT_TIMEOUT = 30.0   # seconds for one ls-remote; a fetch gets FETCH_FACTOR times that
FETCH_FACTOR = 4
POOL = 8
FETCH_CHUNK = 1000   # refspecs per fetch: the argument list stays far below any limit
SHA_SHOWN = 12

PULL_RE = re.compile(r"^refs/pull/(\d+)/head$")
MR_RE = re.compile(r"^refs/merge-requests/(\d+)/head$")
HEX_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
SCP = re.compile(r"^(?:[^@/\s]+@)?([^:/\s]+):(.+)$")
CRED = re.compile(r"(://)[^/@\s]+@")
CONFIG_COPY = re.compile(r"^(core\.sshcommand|credential\..*|http\..*|url\..*)$", re.I)


def norm_status(st):
    """Fold separator spellings together: 'not started' / 'not-started' -> 'not_started'."""
    return re.sub(r"[\s\-]+", "_", str(st).strip().lower())


def redact(text):
    """Remove the userinfo of every scheme://user[:secret]@ in a line before it is printed."""
    return CRED.sub(r"\1<redacted>@", text or "")


# --- origin normalisation: mirrors scripts/lib/estate-reach.sh norm() and the dashboard's
#     normalizeOrigin, so a binding written on one host matches on every other -----------------
def _host_path(host, path):
    h = host.lower().rstrip(".") if host else ""
    p = re.sub(r"\.git$", "", path.strip("/"), flags=re.I).lower() if path else ""
    return "%s/%s" % (h, p) if h and p else ""


def norm(origin):
    s = (origin or "").strip()
    if not s:
        return ""
    m = SCP.match(s)
    if m and "://" not in s:
        return _host_path(m.group(1), m.group(2))
    try:
        u = urlsplit(s if "://" in s else "https://" + s)
        host = u.hostname or ""
        port = u.port
    except ValueError:
        return ""
    if port and not ((u.scheme == "https" and port == 443) or (u.scheme == "ssh" and port == 22)):
        host = "%s:%d" % (host, port)
    return _host_path(host, u.path)


# --- progress.json shapes: the same tolerance progress_check.py has ---------------------------
def iter_phases(doc):
    ph = doc.get("phases") if isinstance(doc, dict) else None
    if isinstance(ph, dict):
        for k, v in ph.items():
            yield str(k), v
    elif isinstance(ph, list):
        for i, v in enumerate(ph):
            key = None
            if isinstance(v, dict):
                for cand in ("key", "id", "phase", "name"):
                    if v.get(cand):
                        key = str(v[cand])
                        break
            yield (key or "[%d]" % i), v


def iter_tasks_keyed(phase_obj):
    if not isinstance(phase_obj, dict):
        return
    ts = phase_obj.get("tasks")
    if isinstance(ts, list):
        items = [(None, t) for t in ts]
    elif isinstance(ts, dict):
        items = list(ts.items())
    else:
        return
    for k, t in items:
        if isinstance(t, dict):
            yield k, t


def git_ref_problem(entry):
    """Why one git_refs entry cannot bind anything, or None. progress_check.py warns on the same."""
    if not isinstance(entry, dict):
        return "is not an object"
    repo, ref, sha = entry.get("repo"), entry.get("ref"), entry.get("sha")
    if not isinstance(repo, str) or not repo.strip():
        return "has no non-empty 'repo' string ('.' for this repository, else the member's origin)"
    if not isinstance(ref, str) or not ref.strip():
        return "has no non-empty 'ref' string"
    if not ref.strip().startswith("refs/"):
        return "ref %r does not start with 'refs/' (write it in full, as refs-check prints it)" % ref
    if not isinstance(sha, str) or not HEX_RE.match(sha.strip()):
        return "sha %r is not 7 to 40 hex characters" % (sha,)
    return None


def base_branches_problem(value):
    """Why a base_branches value cannot be read, or None."""
    if not isinstance(value, list):
        return "is not a list of branch names"
    for b in value:
        if not isinstance(b, str) or not b.strip():
            return "holds %r, which is not a non-empty branch name" % (b,)
        if b.strip().startswith("refs/"):
            return "holds %r: give the branch name, not the ref" % (b,)
    return None


class Binding(object):
    def __init__(self, tid, status, terminal, repo, ref, sha):
        self.tid, self.status, self.terminal = tid, status, terminal
        self.repo, self.ref, self.sha = repo, ref, sha


def collect_bindings(doc):
    entries, ignored = [], []
    for pk, po in iter_phases(doc):
        for tk, t in iter_tasks_keyed(po):
            refs = t.get("git_refs")
            if refs is None:
                continue
            tid = t.get("id")
            tid = str(tid) if tid is not None else (str(tk) if tk is not None else "%s/(no id)" % pk)
            status = str(t.get("status") or "")
            terminal = norm_status(status) in TERMINAL_STATUSES
            if not isinstance(refs, list):
                ignored.append("task %s: git_refs is %s, not a list" % (tid, type(refs).__name__))
                continue
            for i, e in enumerate(refs):
                why = git_ref_problem(e)
                if why:
                    ignored.append("task %s git_refs[%d] %s" % (tid, i, why))
                    continue
                entries.append(Binding(tid, status or "no status", terminal, e["repo"].strip(),
                                       e["ref"].strip(), e["sha"].strip().lower()))
    return entries, ignored


# --- subprocesses: own process group, bounded, killed whole on timeout -------------------------
_LIVE = set()
_TEMPS = set()
_LOCK = threading.Lock()


def run(args, cwd=None, timeout=None, stdin_text=None, env=None):
    """(rc, stdout, stderr). rc is None when the timeout fired or the program could not start."""
    try:
        p = subprocess.Popen(args, cwd=cwd, env=env, start_new_session=True,
                             stdin=subprocess.PIPE if stdin_text is not None else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as e:
        return None, "", str(e)
    with _LOCK:
        _LIVE.add(p)
    try:
        out, err = p.communicate(stdin_text.encode() if stdin_text is not None else None,
                                 timeout=timeout)
        rc = p.returncode
    except subprocess.TimeoutExpired:
        _kill(p)
        try:
            out, err = p.communicate(timeout=5)
        except subprocess.TimeoutExpired:   # a process that left the group still holds a pipe
            out, err = b"", b""
        rc = None
    finally:
        with _LOCK:
            _LIVE.discard(p)
    return rc, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


def _kill(p):
    try:
        os.killpg(p.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _on_signal(signum, _frame):
    with _LOCK:
        for p in list(_LIVE):
            _kill(p)
        for d in list(_TEMPS):
            shutil.rmtree(d, ignore_errors=True)
    os._exit(128 + signum)


def first_line(text):
    for line in (text or "").splitlines():
        line = line.strip()
        if line:
            return redact(line)[:200]
    return "no message"


def base_env():
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_NO_LAZY_FETCH"] = "1"   # honoured by git 2.44+; nothing here relies on it
    return env


def git(ctx, *args, **kw):
    cmd = ["git"] + (["-C", ctx] if ctx else []) + list(args)
    return run(cmd, timeout=kw.get("timeout", 10), stdin_text=kw.get("stdin_text"),
               env=kw.get("env") or base_env())


def is_clone(path):
    """True when path is the top of its own git work tree (a nested clone, not a plain directory)."""
    if not os.path.exists(os.path.join(path, ".git")):
        return False
    rc, out, _ = git(path, "rev-parse", "--show-toplevel")
    return rc == 0 and os.path.realpath(out.strip()) == os.path.realpath(path)


def origin_url(clone):
    rc, out, _ = git(clone, "config", "--get", "remote.origin.url")
    return out.strip() if rc == 0 else ""


# --- the repository set -----------------------------------------------------------------------
class Repo(object):
    def __init__(self, key, label):
        self.key, self.label = key, label
        self.origin_raw, self.norm_origin, self.path = "", "", ""
        self.declared_bases = []
        self.ctx, self.remote, self.fetch_url, self.host_url = None, None, None, ""
        self.borrow = False   # ctx is a clone of THIS repository, so its objects can be borrowed
        self.notes, self.items = [], []
        self.state, self.reason = None, ""   # None (read), "na", "notchecked"
        self.pr_not_checked = ""
        self.bases = []

    def binds(self, b):
        """True when binding repo field b names this repository."""
        if self.key == "." and b == ".":
            return True
        if self.norm_origin and norm(b) == self.norm_origin:
            return True
        if self.origin_raw and b == self.origin_raw.strip():
            return True
        return bool(self.path) and b.rstrip("/") == self.path


def sibling_map(root):
    """normalised origin -> sibling checkout, one level under the project's parent directory."""
    out = {}
    parent = os.path.dirname(os.path.realpath(root))
    try:
        names = sorted(os.listdir(parent))
    except OSError:
        return out
    for n in names:
        d = os.path.join(parent, n)
        if os.path.realpath(d) == os.path.realpath(root) or not os.path.isdir(os.path.join(d, ".git")):
            continue
        n_origin = norm(origin_url(d))
        if n_origin and n_origin not in out:
            out[n_origin] = d
    return out


def repository_set(doc, root, toplevel):
    """([Repo], [note], number of members declared)."""
    repos, top_notes = [], []
    me = Repo(".", ". (this repository)")
    bb = doc.get("base_branches")
    if bb is not None:
        why = base_branches_problem(bb)
        if why:
            me.notes.append("root base_branches %s; ignored" % why)
        else:
            me.declared_bases = [b.strip() for b in bb]
    if toplevel is None:
        me.state, me.reason = "na", "not a git work tree: nothing to list"
    else:
        url = origin_url(toplevel)
        if not url:
            me.state, me.reason = "na", "no remote: nothing to list"
        else:
            me.origin_raw, me.norm_origin = url, norm(url)
            me.ctx, me.remote, me.fetch_url, me.host_url = toplevel, "origin", url, url
            me.borrow = True
    repos.append(me)

    rel = doc.get("relations")
    if rel is None:
        top_notes.append("members: none declared")
        return repos, top_notes, 0
    if not isinstance(rel, dict) or rel.get("version") != 1 or not isinstance(rel.get("members"), list):
        bad = Repo("relations", "relations (PROJECT_CHARTER.md section 14)")
        bad.state, bad.reason = "notchecked", "the relations block is malformed, so its members are unknown"
        repos.append(bad)
        return repos, top_notes, 0
    members = rel["members"]
    if not members:
        top_notes.append("members: [] (this repository declares that it manages nothing)")
        return repos, top_notes, 0

    seen = {".": me}
    if me.norm_origin:
        seen[me.norm_origin] = me
    siblings = None
    for i, m in enumerate(members):
        at = "relations.members[%d]" % i
        if not isinstance(m, dict):
            r = Repo(at, at)
            r.state, r.reason = "notchecked", "the member is not an object"
            repos.append(r)
            continue
        origin = m.get("origin").strip() if isinstance(m.get("origin"), str) else ""
        path = m.get("path").strip().rstrip("/") if isinstance(m.get("path"), str) else ""
        if path and (path.startswith("/") or ".." in path.split("/")):
            path = ""
        if not origin and not path:
            r = Repo(at, at)
            r.state, r.reason = "notchecked", "the member names no usable origin or path"
            repos.append(r)
            continue
        n_origin = norm(origin) if origin else ""
        key = n_origin or origin or path
        if key in seen or (n_origin and n_origin in seen):
            if seen.get(key) is me or seen.get(n_origin) is me:
                top_notes.append("%s names this repository; it is checked once, as '.'" % at)
            else:
                top_notes.append("%s repeats %s; it is checked once" % (at, key))
            continue
        r = Repo(key, key + ("  (path %s)" % path if path and key != path else ""))
        r.origin_raw, r.norm_origin, r.path = origin, n_origin, path
        seen[key] = r
        if n_origin:
            seen[n_origin] = r
        mb = m.get("base_branches")
        if mb is not None:
            why = base_branches_problem(mb)
            if why:
                r.notes.append("base_branches on %s %s; ignored" % (at, why))
            else:
                r.declared_bases = [b.strip() for b in mb]

        # (a) the member's own nested clone
        if path and toplevel is not None:
            here = os.path.join(toplevel, path)
            if is_clone(here):
                url = origin_url(here)
                if url and (not n_origin or norm(url) == n_origin or (not norm(url) and url == origin)):
                    r.ctx, r.remote, r.fetch_url, r.borrow = here, "origin", url, True
                elif url:
                    r.notes.append("path %s holds a clone of %s, not the declared origin; read "
                                   "through the declared origin" % (path, redact(url)))
                elif not origin:
                    r.state, r.reason = "na", "path %s is a clone with no remote: nothing to list" % path
                    repos.append(r)
                    continue
            elif not origin:
                r.state, r.reason = ("notchecked", "path %s is not a git clone on this host and no "
                                     "origin is declared" % path)
                repos.append(r)
                continue
        # (b) a sibling checkout of the same origin
        if r.ctx is None and n_origin and toplevel is not None:
            if siblings is None:
                siblings = sibling_map(toplevel)
            sib = siblings.get(n_origin)
            if sib:
                r.ctx, r.remote, r.fetch_url, r.borrow = sib, "origin", origin_url(sib), True
        # (c) the declared origin itself, from this project
        if r.ctx is None:
            r.ctx, r.remote, r.fetch_url = toplevel or root, origin, origin
        r.host_url = origin or r.fetch_url
        repos.append(r)
    return repos, top_notes, len(members)


# --- reading one repository -------------------------------------------------------------------
def host_of(url, timeout):
    n = norm(url)
    host = n.split("/", 1)[0] if n else ""
    if host and not re.search(r"github|gitlab", host):
        s = url.strip()
        if s.startswith("ssh://") or ("://" not in s and SCP.match(s)):
            rc, out, _ = run(["ssh", "-G", host.split(":")[0]], timeout=min(5, timeout))
            if rc == 0:
                for line in out.splitlines():
                    if line.startswith("hostname "):
                        return line.split(None, 1)[1].strip().lower() or host
    return host


def fetch_location(r):
    """The URL a temporary repository fetches from: a relative local path is resolved against ctx."""
    u = (r.fetch_url or "").strip()
    if u and "://" not in u and not SCP.match(u) and not os.path.isabs(u) and r.ctx:
        return os.path.normpath(os.path.join(r.ctx, u))
    return u


def ref_sort_key(ref):
    m = PULL_RE.match(ref) or MR_RE.match(ref)
    if m:
        return (1 if ref.startswith("refs/pull/") else 2, int(m.group(1)), ref)
    return (0, 0, ref)


def check_repo(r, timeout):
    if r.state:
        return r
    env = base_env()
    rc, out, _ = git(r.ctx, "config", "--get", "core.sshCommand")
    if not (rc == 0 and out.strip()) and "GIT_SSH_COMMAND" not in env and "GIT_SSH" not in env:
        env["GIT_SSH_COMMAND"] = "ssh -o BatchMode=yes -o ConnectTimeout=15"

    rc, out, err = git(r.ctx, "ls-remote", "--symref", r.remote, timeout=timeout, env=env)
    if rc is None:
        r.state, r.reason = "notchecked", "ls-remote did not answer within %gs" % timeout
        return r
    if rc != 0:
        r.state, r.reason = "notchecked", "ls-remote failed: %s" % first_line(err)
        return r
    head, heads, pulls = None, {}, {}
    for line in out.splitlines():
        if line.startswith("ref: ") and line.endswith("\tHEAD"):
            target = line[5:-5].strip()
            if target.startswith("refs/heads/"):
                head = target[len("refs/heads/"):]
            continue
        sha, _, ref = line.partition("\t")
        if ref.startswith("refs/heads/"):
            heads[ref[len("refs/heads/"):]] = sha.strip()
        elif PULL_RE.match(ref) or MR_RE.match(ref):
            pulls[ref] = sha.strip()

    if not any(PULL_RE.match(x) for x in pulls) and not any(MR_RE.match(x) for x in pulls):
        host = host_of(r.host_url, timeout)
        if not re.search(r"github|gitlab", host):
            r.pr_not_checked = ("%s advertises no pull or merge-request refs, so whether it has "
                                "open ones is unknown" % (host or "this remote"))
    if not heads and not pulls:
        r.notes.append("the remote has no branches")
        return r

    bases = [head] if head in heads else []
    for b in r.declared_bases:
        if b in heads:
            if b not in bases:
                bases.append(b)
        else:
            r.notes.append("base branch %r is declared but not on the remote" % b)
    if not bases:
        r.state, r.reason = ("notchecked", "no base branch: the remote advertises no HEAD branch "
                             "and no declared base_branches exists on it")
        return r
    r.bases = bases
    tips = {heads[b] for b in bases}
    cands = [("refs/heads/" + n, s) for n, s in heads.items() if n not in bases]
    cands += list(pulls.items())
    cands = [(ref, s) for ref, s in cands if s not in tips]
    if not cands:
        return r

    unmerged, why = ancestry(r, env, [(b, heads[b]) for b in bases], cands, timeout)
    if unmerged is None:
        r.state, r.reason = "notchecked", why
        return r
    r.items = sorted(unmerged, key=lambda x: ref_sort_key(x[0]))
    return r


def ancestry(r, env, bases, cands, timeout):
    """[(ref, sha)] of candidates merged into NO base, or (None, reason) when it cannot be known."""
    tmp = tempfile.mkdtemp(prefix="refs-check-")
    with _LOCK:
        _TEMPS.add(tmp)
    try:
        bare = os.path.join(tmp, "r.git")
        rc, _, err = git(None, "init", "--bare", "-q", bare, env=env)
        if rc != 0:
            return None, "could not create a temporary repository: %s" % first_line(err)
        for k, v in (("gc.auto", "0"), ("maintenance.auto", "false"), ("fetch.writeCommitGraph", "false")):
            git(bare, "config", k, v, env=env)
        ctx_is_repo = r.ctx and git(r.ctx, "rev-parse", "--git-dir", env=env)[0] == 0
        if ctx_is_repo and r.borrow:
            # Borrow the local clone's objects, unless it is shallow (its history would be cut).
            rc, out, _ = git(r.ctx, "rev-parse", "--is-shallow-repository", env=env)
            if rc == 0 and out.strip() == "false":
                rc, out, _ = git(r.ctx, "rev-parse", "--git-common-dir", env=env)
                objects = os.path.join(r.ctx, out.strip(), "objects")   # join keeps an absolute one
                if rc == 0 and os.path.isdir(objects):
                    with open(os.path.join(bare, "objects", "info", "alternates"), "w") as fh:
                        fh.write(os.path.realpath(objects) + "\n")
            # The clone's own transport settings (ssh command, credential helper, url rewrites).
            rc, out, _ = git(r.ctx, "config", "--local", "-z", "--get-regexp", ".", env=env)
            if rc == 0:
                for rec in out.split("\0"):
                    k, _, v = rec.partition("\n")
                    if k and CONFIG_COPY.match(k):
                        git(bare, "config", "--add", k, v, env=env)

        named = [("refs/rc/b/%d" % j, "refs/heads/" + b, s) for j, (b, s) in enumerate(bases)]
        named += [("refs/rc/c/%d" % i, ref, s) for i, (ref, s) in enumerate(cands)]
        # Presence BEFORE the promisor remote exists: with one configured, a lookup of a missing
        # object would fetch it from the network on its own.
        rc, out, err = git(bare, "cat-file", "--batch-check",
                           stdin_text="".join(s + "\n" for _, _, s in named), env=env)
        if rc != 0:
            return None, "could not read the local objects: %s" % first_line(err)
        missing = {line.split()[0] for line in out.splitlines() if line.endswith(" missing")}
        present = [(loc, s) for loc, _, s in named if s not in missing]
        if missing:
            # What `git clone --filter` writes, so a git as old as 2.19 accepts the filter.
            for k, v in (("remote.origin.url", fetch_location(r)), ("remote.origin.promisor", "true"),
                         ("remote.origin.partialclonefilter", "tree:0"),
                         ("core.repositoryformatversion", "1"), ("extensions.partialClone", "origin")):
                git(bare, "config", k, v, env=env)
            specs = ["+%s:%s" % (ref, loc) for loc, ref, s in named if s in missing]
            for at in range(0, len(specs), FETCH_CHUNK):
                rc, _, err = git(bare, "fetch", "--quiet", "--no-tags", "--filter=tree:0", "origin",
                                 *specs[at:at + FETCH_CHUNK], timeout=timeout * FETCH_FACTOR, env=env)
                if rc is None:
                    return None, ("fetch did not finish within %gs, so ancestry is unknown"
                                  % (timeout * FETCH_FACTOR))
                if rc != 0:
                    return None, "fetch failed, so ancestry is unknown: %s" % first_line(err)
        if present:
            rc, _, err = git(bare, "update-ref", "--stdin",
                             stdin_text="".join("update %s %s\n" % (loc, s) for loc, s in present), env=env)
            if rc != 0:
                return None, "could not place the known commits: %s" % first_line(err)
        rc, out, err = git(bare, "for-each-ref", "--format=%(refname) %(objectname)", "refs/rc/", env=env)
        if rc != 0:
            return None, "could not list the fetched refs: %s" % first_line(err)
        actual = dict(line.split(" ", 1) for line in out.splitlines() if " " in line)
        merged = set()
        for j in range(len(bases)):   # one call per base: before git 2.30 a second --merged replaced the first
            rc, out, err = git(bare, "for-each-ref", "--format=%(refname)", "--merged=refs/rc/b/%d" % j,
                               "refs/rc/c/", timeout=timeout * FETCH_FACTOR, env=env)
            if rc != 0:
                return None, "ancestry could not be computed: %s" % first_line(err)
            merged.update(out.split())
        result = []
        for i, (ref, s) in enumerate(cands):
            loc = "refs/rc/c/%d" % i
            if loc not in merged:
                result.append((ref, actual.get(loc, s)))
        return result, ""
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        with _LOCK:
            _TEMPS.discard(tmp)


# --- report -----------------------------------------------------------------------------------
def classify(r, ref, sha, bindings):
    bound = [b for b in bindings if r.binds(b.repo) and b.ref == ref and sha.startswith(b.sha)]
    live = [b for b in bound if not b.terminal]
    if live:
        return "BOUND", "task %s (%s)" % (live[0].tid, live[0].status)
    if bound:
        return "RECORDED", "task %s (%s)" % (bound[0].tid, bound[0].status)
    stale = [b for b in bindings if r.binds(b.repo) and b.ref == ref]
    hint = "; ".join("task %s names it at %s" % (b.tid, b.sha) for b in stale)
    return "UNBOUND", ("(%s)" % hint) if hint else ""


def main():
    ap = argparse.ArgumentParser(description="Open pull requests and unmerged branches in this "
                                             "repository and the members its relations block declares.")
    ap.add_argument("--file", default="progress.json", help="the record (default: progress.json)")
    ap.add_argument("--timeout", type=float, default=None,
                    help="seconds for each ls-remote (default 30, or REFS_CHECK_TIMEOUT); a fetch "
                         "gets %d times that" % FETCH_FACTOR)
    a = ap.parse_args()
    timeout = a.timeout
    if timeout is None:
        try:
            timeout = float(os.environ.get("REFS_CHECK_TIMEOUT") or DEFAULT_TIMEOUT)
        except ValueError:
            timeout = DEFAULT_TIMEOUT
    for s in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(s, _on_signal)

    path = os.path.abspath(a.file)
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError) as e:
        print("refs-check: cannot read %s (%s): which refs are bound is unknown" % (a.file, e))
        print("refs-check: did not run (exit 2)")
        return 2
    if not isinstance(doc, dict):
        print("refs-check: %s is not a JSON object: which refs are bound is unknown" % a.file)
        print("refs-check: did not run (exit 2)")
        return 2

    root = os.path.dirname(path)
    rc, out, _ = git(root, "rev-parse", "--show-toplevel")
    toplevel = out.strip() if rc == 0 and out.strip() else None
    bindings, ignored = collect_bindings(doc)
    repos, top_notes, members = repository_set(doc, root, toplevel)
    with concurrent.futures.ThreadPoolExecutor(max_workers=POOL) as pool:
        repos = list(pool.map(lambda r: check_repo(r, timeout), repos))

    print("refs-check: open pull requests and unmerged branches - this repository and %d "
          "declared member%s" % (members, "" if members == 1 else "s"))
    counts = {"UNBOUND": 0, "BOUND": 0, "RECORDED": 0, "NOT CHECKED": 0}
    paste = []
    for r in repos:
        head = redact(r.label)
        if r.key == "." and r.origin_raw:
            head += "  " + redact(r.origin_raw)
        if r.bases:
            head += "  base " + ", ".join(r.bases)
        print(head)
        if r.state == "na":
            print("  n/a          %s" % r.reason)
        elif r.state == "notchecked":
            print("  NOT CHECKED  %s" % r.reason)
            counts["NOT CHECKED"] += 1
        else:
            for ref, sha in r.items:
                verdict, extra = classify(r, ref, sha, bindings)
                counts[verdict] += 1
                print(("  %-12s %s  %s  %s" % (verdict, ref, sha[:SHA_SHOWN], extra)).rstrip())
                if verdict == "UNBOUND":
                    paste.append({"repo": r.key, "ref": ref, "sha": sha[:SHA_SHOWN]})
            if r.pr_not_checked:
                print("  NOT CHECKED  pull requests: %s" % r.pr_not_checked)
                counts["NOT CHECKED"] += 1
            if not r.items:
                print("  clean        no unmerged branch%s" % ("" if r.pr_not_checked else
                                                            " and no unmerged pull-request head"))
        for n in r.notes:
            print("  NOTE         %s" % n)
    for n in top_notes:
        print(n)
    for n in ignored:
        print("IGNORED      %s - it binds nothing" % n)
    if paste:
        print("")
        print("Bind each UNBOUND item to the open task that will process it (paste into that "
              "task, or add to its list), or process it; see .claude/skills/refs-check/SKILL.md:")
        print('"git_refs": [')
        for i, p in enumerate(paste):
            print("  " + json.dumps(p) + ("," if i < len(paste) - 1 else ""))
        print("]")
    code = 3 if counts["UNBOUND"] else (4 if counts["NOT CHECKED"] else 0)
    tail = ", %d ignored" % len(ignored) if ignored else ""
    print("refs-check: %d unbound, %d bound, %d recorded, %d not checked%s (exit %d)" % (
        counts["UNBOUND"], counts["BOUND"], counts["RECORDED"], counts["NOT CHECKED"], tail, code))
    return code


if __name__ == "__main__":
    sys.exit(main())
