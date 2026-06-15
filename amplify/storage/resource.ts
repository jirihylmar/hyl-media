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
  }),
});
