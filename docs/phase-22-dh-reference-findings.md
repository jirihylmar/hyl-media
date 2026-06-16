# Phase 22.1 — DH reference findings: how virtual / file-less resources are modelled

**Task:** Study the Digital Horizon reference (`/home/ubuntu/digital-horizon-playbook`) to answer:
does every DC resource require a content object, or can a resource be **metadata-only**? What
`ContentType` / `_category` / `dc_type` does the reference use for file-less / virtual objects?

**Date:** 2026-06-16. **Verdict:** see § Decision input for 22.2 (BLOCKING).

---

## 1. What the DH reference actually does

In Digital Horizon, **every metadata-repository row describes a real S3 artifact** — there is no
metadata-only / file-less resource concept anywhere in the reference.

Evidence (authoritative DH docs):

- **`docs/recordings/process-session-reference-spec.md` §2 + §4.6** — the canonical schema:
  - `s3_key` = `{category}/{uuid}/{filename}` — *always a real content file*.
  - §4 gotcha 6 (verbatim): *"Metadata sidecar key: `metadata/{category}/{uuid}/{filename}.metadata.json`;
    **content key `{category}/{uuid}/{filename}`**."* — i.e. the sidecar is, by definition, the
    parallel of an existing content object.
  - `dc_source_uri` = `https://{bucket}.s3.{region}.amazonaws.com/{s3_key}` — *the artifact's identity*.

- **`docs/metadata/README.md` § two-layer model** — the third layer is literally *"S3 object … the
  actual bytes"* living at `audio/<id>/…`, `datasets/<id>/…`, `documents/<id>/…`. Every DC row has a
  bytes-bearing object behind it; versioning is enabled on those bytes.

- **`docs/metadata-repository-producers.md` §16** — the only multi-artifact producer (the recording
  enricher) *"emits 3 sidecars per recording (audio/dataset/document)"* — and each of those three is a
  **real file**: the `.mp3`, the Transcribe job `.json` **dataset**, and the extracted `.txt`/`.md`
  **document**. DH's `DATASET` is a genuine data file (transcript/diarization JSON), not a descriptor.

- **DH `_category` enum** = `documents, images, audio, video, datasets, interactive, misc`.
  **There is no `agents` category.** DH has no person/band/agent entities at all — it is a recordings
  + documents corpus. `dc_type=Agent` and `_category=agents` are **hyl-media inventions**, not DH.

**Answer to the core question:** In the DH reference a resource **cannot** exist with no content
object. Sidecar ⇔ content object is 1:1 by construction. There is no documented metadata-only path.

---

## 2. What hyl-media currently does (and why it diverges)

hyl-media has genuinely **virtual** entities with no media bytes — movies, recordings, and agents
(person / band / collaboration). To force them into the DH "every sidecar mirrors a content object"
shape, Phase 15–20 **fabricates a content descriptor JSON object** for each one and points `s3_key`
at it. Code: `scripts/lib/entity-to-dc.mjs` (`resolveArtifact` + the `descriptor` block at the end),
`scripts/lib/dc-paths.mjs` (`categoryForEntityType`).

| hyl-media entity | `_category` | `ContentType` | `dc_type` | content object written to S3 |
|---|---|---|---|---|
| movie | `datasets` | `DATASET` | `MovingImage` | `datasets/<uuid>/<slug>.json` (descriptor) |
| recording | `datasets` | `DATASET` | `Sound` | `datasets/<uuid>/<slug>.json` (descriptor) |
| person | `agents` | `PERSON` | `Agent` | `agents/<uuid>/<slug>.json` (descriptor) |
| band | `agents` | `BAND` | `Agent` | `agents/<uuid>/<slug>.json` (descriptor) |
| collaboration | `agents` | `COLLABORATION` | `Agent` | `agents/<uuid>/<slug>.json` (descriptor) |
| book / sheet_music | `documents` | `PDF` | `Text` | the **real** PDF (no descriptor) |

The descriptor (see `entityToDc`'s `descriptor` object) re-serialises fields that are *already in the
sidecar's Attributes* (`name`, `tags`, `external_links`, `creators`, `contributors`, `*_uris`,
`is_part_of`, `has_part`, `relation`). It carries **no information the sidecar doesn't already hold**.

**Live confirmation** — the operator's Easy Virtue example
(`6187d196-3a32-5563-e103-0bfcd7a28e12`): the descriptor object
`datasets/6187d196-…/easy-virtue.json` (271 bytes) really exists in S3, alongside its sidecar at
`metadata/datasets/6187d196-…/easy-virtue.json.metadata.json`.

**Blast radius:** ~94 movies + ~94 recordings + ~509 agents = **~697 fabricated descriptor objects**
(books/sheet_music excluded — they have real PDFs). Plus the file-less book/sheet_music edge case
(`_file_missing=true`), a handful.

### So the operator's instinct is correct
The descriptor object is a **DH-conformance prosthetic**, not real content. It is redundant with the
sidecar and is exactly what made the operator ask *"why does a virtual resource have a DATASET content
object at all?"*. The DH reference offers no precedent for it because DH never has virtual resources.

---

## 3. Decision input for 22.2 (the BLOCKING choice)

Three coherent options. The auditor (`scripts/audit-dc-conformance.mjs`) currently *requires* the
content object to exist, so whichever we pick, the auditor rules move with it.

**Option A — Metadata-only (operator's instinct; recommended).**
Drop the fabricated descriptor object entirely for virtual resources. Keep only the `metadata/`
sidecar. Mark the row as virtual (e.g. `s3_key=null` or an `_virtual=true` / keep `_file_missing`
flag; `dc_source_uri` becomes the sidecar's own address or null). Migration deletes the ~697
descriptor objects. Cleanest data model; matches the operator's reading. **Cost:** we diverge from DH's
"sidecar ⇔ content object" invariant — but DH has no virtual resources, so there is nothing to be
byte-compatible *with* here. Frontend reads come from DDB/sidecar, not the descriptor (needs a quick
check that nothing fetches the descriptor object — `mint…Url`-style code).

**Option B — Keep descriptors as-is (status quo).** No change. Preserves the literal DH invariant
(every sidecar has a content object) at the cost of ~697 redundant objects the operator finds wrong.

**Option C — Keep a content object but make it meaningful.** Instead of deleting, make the descriptor
the *canonical JSON representation* of the entity (a real, useful dataset payload) so `DATASET` is
honest. More work; only worth it if we want the entity downloadable as JSON.

**Recommendation: Option A.** The descriptor adds no information, the operator flagged it as wrong,
and DH offers no precedent requiring it. We keep DH byte-compatibility where it *exists* (real
documents/PDFs, the 28-key sidecar shape) and stop emulating a content object for things that have no
content.

**Open sub-questions for the operator to confirm under Option A:**
1. `s3_key` for a virtual row → `null`, or keep the (now non-existent) descriptor key as a logical id?
2. `dc_source_uri` for a virtual row → null, or point at the `metadata/` sidecar itself?
3. Should `_category=agents` / `_category=datasets` stay, or should virtual rows move under a single
   marker? (Recommend: keep the categories — they're useful facets — just drop the content object.)
