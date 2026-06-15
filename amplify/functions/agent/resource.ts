import { defineFunction } from '@aws-amplify/backend';

// The hyl-media operator agent (Phase 21): a Claude tool-use loop over the
// hyl-media-metadata-repository (DC) table. The Anthropic key is fetched at
// runtime from Secrets Manager (ANTHROPIC_SECRET_ID), not an Amplify secret,
// so it stays the single source documented in CLAUDE.md / the Phase 21
// guardrails. 120s timeout accommodates multi-turn tool loops + web research.
export const agent = defineFunction({
  name: 'agent',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    METADATA_TABLE: 'hyl-media-metadata-repository',
    ANTHROPIC_SECRET_ID: 'hyl-media/anthropic-api-key',
    ANTHROPIC_MODEL: 'claude-opus-4-8',
  },
});
