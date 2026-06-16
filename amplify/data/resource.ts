import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { metadataApi } from '../functions/metadata-api/resource';
import { agent } from '../functions/agent/resource';

// Phase 17.6e — the legacy KnowledgeGraphItem model + its DynamoDB table were decommissioned.
// The catalog lives entirely in the CLI-created hyl-media-metadata-repository (Dublin Core) table,
// exposed through the custom queries/mutations below (metadata-api + agent). A verified export of
// the old table is preserved in s3 backups/ (see scripts/backup-legacy-kg-table.mjs).
const schema = a.schema({
  // Phase 17.1 — read API over the CLI-created hyl-media-metadata-repository (DC) table.
  // Returns raw DC records as AWSJSON; the frontend maps them to view models.
  getMetadata: a
    .query()
    .arguments({ pk: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  getMetadataByLegacyId: a
    .query()
    .arguments({ legacyId: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  listMetadataByType: a
    .query()
    .arguments({ dcType: a.string().required(), limit: a.integer() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  searchMetadata: a
    .query()
    .arguments({ q: a.string().required(), limit: a.integer() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  // Phase 17.3b / 18.4 — operator edit of DC fields (dc_title, language_code, _tags,
  // _external_links). SET-only on the existing row; relationships are not edited here.
  updateMetadata: a
    .mutation()
    .arguments({ pk: a.string().required(), patch: a.json().required() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  // Phase 17.6c — DC-native document upload. The browser uploads the PDF to documents/<uuid>/ via
  // Amplify Storage, then calls this to create the conformant file-backed DC record (S3 sidecar +
  // metadata-repo row). Replaces the legacy KnowledgeGraphItem write path for book/sheet uploads.
  createDocumentMetadata: a
    .mutation()
    .arguments({ input: a.json().required() })
    .returns(a.json())
    .handler(a.handler.function(metadataApi))
    .authorization((allow) => [allow.authenticated()]),

  // Phase 21 — the operator agent. Stateless multi-turn Claude tool-use loop:
  // the frontend owns the chat history and sends the full `messages` array each
  // call; `approval` carries the operator's approve/decline of a proposed
  // mutating tool (propose → approve → execute). Returns a step-log JSON.
  agentChat: a
    .mutation()
    .arguments({
      messages: a.json().required(),
      surfaceContext: a.string(),
      approval: a.json(),
    })
    .returns(a.json())
    .handler(a.handler.function(agent))
    .authorization((allow) => [allow.authenticated()]),

  // Phase 21.8 — async transport. A research-heavy turn runs ~90s, past
  // AppSync's ~30s synchronous limit, so agentChat returns {status:'pending',
  // turnId} and the worker persists the result; the frontend polls this query
  // until it is ready.
  getAgentTurn: a
    .query()
    .arguments({ turnId: a.string().required() })
    .returns(a.json())
    .handler(a.handler.function(agent))
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
