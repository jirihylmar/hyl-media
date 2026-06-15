import { defineFunction } from '@aws-amplify/backend';

// Read-only API over the CLI-created hyl-media-metadata-repository DC table.
// Not an Amplify model (the table is owned by the Digital Horizon metadata CLI),
// so it is exposed via custom AppSync queries backed by this function (Phase 17.1).
export const metadataApi = defineFunction({
  name: 'metadata-api',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    METADATA_TABLE: 'hyl-media-metadata-repository',
  },
});
