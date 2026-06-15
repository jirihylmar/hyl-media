import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'hylMediaStorage',
  access: (allow) => ({
    'library/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
    'sheet-music/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
    // Phase 17.3b — DC migration layout: book/sheet PDFs also live under documents/<uuid>/.
    'documents/*': [
      allow.authenticated.to(['read']),
    ],
    // Phase 19 — JSON descriptors for non-file MEDIA resources (movie/recording).
    'datasets/*': [
      allow.authenticated.to(['read']),
    ],
    // Phase 20 — JSON descriptors for agent entities (person/band/collaboration).
    'agents/*': [
      allow.authenticated.to(['read']),
    ],
    // Phase 19 — DC metadata sidecars (the conformant example artifact); linked from detail pages.
    'metadata/*': [
      allow.authenticated.to(['read']),
    ],
  }),
});
