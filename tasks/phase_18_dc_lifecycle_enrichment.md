# Phase 18: Full DC Lifecycle — Claude Enrichment + _explicit_fields + Edit/Approve

## Objective
Port the Digital Horizon metadata lifecycle so DC records become live, editable, and enriched:
Claude fills `dc_abstract` + refines `dc_subject`; `_explicit_fields` pins operator edits so
enrichment never clobbers them; a frontend editor + approve/regenerate mutations complete the loop.

## Secrets — Anthropic API key (MANDATORY)
The enrichment API key is stored in **AWS Secrets Manager**:
- Secret: `hyl-media/anthropic-api-key`
- ARN: `arn:aws:secretsmanager:eu-central-1:299025166536:secret:hyl-media/anthropic-api-key-KBL4LX`
- Shape: `{"ANTHROPIC_API_KEY":"sk-ant-..."}`

**Rules:** fetch at runtime via `secretsmanager:GetSecretValue` (SDK/MCP). **NEVER** hardcode,
print, log, or commit the key. A Lambda would get an IAM policy scoped to this ARN; the local
enrichment script reads it via the SDK with profile `JiHy__vsb__299`.
> The plaintext key was shared in chat once — rotate it in the Anthropic console after Phase 18 is
> working.

## Tasks
- **18.1** `scripts/enrich-dc.mjs` — fetch key from Secrets Manager, call Claude for `dc_abstract`
  (300–500 chars, content language) + refined `dc_subject`. `--dry-run`. Port DH `dc-refresh.ts`
  prompt. Use the latest Claude model.
- **18.2** `_explicit_fields` pinning — skip pinned fields on enrichment (DH `normalizeExplicitFields`
  + `REFRESHABLE_DC_FIELDS`).
- **18.3** Batch-enrich records missing `dc_abstract`; write back to S3 sidecar + re-sync (or direct
  `UpdateItem` on non-pinned fields). Bump `_last_updated_at`. Rate-limit + log token usage.
- **18.4** Frontend DC editor — edit `dc_title`/`dc_abstract`/`dc_subject`/`dc_creator`; pin edited
  fields into `_explicit_fields` (DH `UPDATABLE_DC_FIELDS` allowlist + SET-only writes).
- **18.5** Regenerate (non-pinned only) + approve (`_approval_status=approved`, bump
  `_last_updated_at`) mutations.
- **18.6** End-to-end verify (enrich→pin→regenerate→edit→approve) + cost/usage report.

## Reference
- DH lifecycle: `digital-horizon-playbook/.../recordings/_shared/dc-refresh.ts`,
  `.../update-metadata/handler.ts`, `tasks/phase_28_metadata_lifecycle.md`.
