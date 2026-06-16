# Phase 22: Metadata Structure Review & Cleaning — Virtual / File-less Resources

## Origin
Operator (2026-06-16), inspecting the Easy Virtue sidecar
`metadata/datasets/6187d196-3a32-5563-e103-0bfcd7a28e12/easy-virtue.json.metadata.json`:

> `"ContentType": "DATASET"`, `"_category": "datasets"` — not correct I think. I understand it's
> missing the core media object as it's virtual, but this definitely should go to the `/metadata/`
> partition. Don't know if the case isn't the same for other entries. Check structure of the example
> object / metadata object.

## The question
Virtual (no media file) DC resources are currently emitted as **content descriptor + sidecar**:
- **movies, recordings** → `_category=datasets`, `ContentType=DATASET`, `dc_type=MovingImage|Sound`
  - content descriptor JSON at `datasets/<uuid>/<slug>.json`
  - DC sidecar at `metadata/datasets/<uuid>/<slug>.json.metadata.json`
- **agents (person/band/collaboration)** → `_category=agents`, `ContentType=PERSON|BAND|COLLABORATION`,
  `dc_type=Agent`
  - content descriptor JSON at `agents/<uuid>/<slug>.json`
  - DC sidecar at `metadata/agents/<uuid>/<slug>.json.metadata.json`

The operator questions whether a **file-less / virtual** resource should have a content object in the
`datasets/`/`agents/` partition **at all**, or whether such resources should be **metadata-only**
(only the `metadata/` sidecar, no content descriptor).

## Scope / blast radius
This is the **Phase 15–20 design**, not new to the agent. The emit logic lives in:
- `scripts/lib/dc-paths.mjs` (`categoryForEntityType`, content/sidecar keys)
- `scripts/lib/build-dc-sidecar.mjs` (the 28-key DH sidecar)
- `scripts/lib/entity-to-dc.mjs` (KnowledgeGraphItem → DC, the hyl-media extensions)
- `amplify/functions/agent/dc-emit.ts` (the agent's typed port — must stay consistent)

So a change affects **all ~94 movies + ~94 recordings + ~509 agents** (the documents/ partition —
books & sheet music — DO have a real PDF, so they are likely out of scope).

## Tasks
- **22.1** Study the Digital Horizon reference (`/home/ubuntu/digital-horizon-playbook`): does every
  DC resource require a content object, or can a resource be **metadata-only**? What
  `ContentType`/`_category`/`dc_type` does the reference use for file-less/virtual objects? Document
  the canonical pattern with concrete example paths. *Verify:* documented finding incl. whether a
  resource can exist with NO content object.
- **22.2** Decide the correct hyl-media model for file-less resources (movies/recordings/agents) —
  keep the descriptor vs go metadata-only — and **get operator approval on the direction (BLOCKING)**.
- **22.3** If a change is needed, update the emit code (`dc-paths.mjs`, `build-dc-sidecar.mjs`,
  `entity-to-dc.mjs`, `amplify/functions/agent/dc-emit.ts`) so future creates follow the corrected
  structure. *Verify:* a new agent create + a re-emit produce the corrected structure; type-checks;
  lib self-tests pass.
- **22.4** Migration / metadata-cleaning script to fix existing records (datasets + agents) to the
  corrected structure — idempotent, before/after audit, no orphaned S3 objects. *Verify:* all
  affected records migrated; idempotent re-run is a no-op.
- **22.5** Re-run `scripts/audit-dc-conformance.mjs` (must stay **ALL PASS**), spot-check the frontend
  detail pages still resolve, and redeploy if frontend/agent code changed.

## Notes / cautions
- The conformance auditor (`audit-dc-conformance.mjs`) encodes the CURRENT structure rules — if the
  structure changes, the auditor rules likely need updating too (it's the source of "ALL PASS").
- The metadata table key is **composite (PK, SK)**, SK = `#<language>#<slug>` — see the Phase 21
  dedup fix (`createResource` upsert-by-PK) before writing any migration that re-keys rows.
- S3 sidecar is authoritative (CLAUDE.md source-of-truth rule); never leave a write DDB-only.
