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
  }),
});
