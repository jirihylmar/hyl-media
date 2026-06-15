import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { metadataApi } from '../functions/metadata-api/resource';

const schema = a.schema({
  KnowledgeGraphItem: a.model({
    id: a.string().required(),
    entityType: a.string().required(),
    name: a.string(),
    language: a.string(),
    // Person fields
    givenName: a.string(),
    familyName: a.string(),
    roles: a.string().array(),
    // Relationship fields (movie_cast)
    role: a.string(),
    movieId: a.string(),
    movieName: a.string(),
    personId: a.string(),
    personName: a.string(),
    // Relationship fields (recording_performer)
    recordingId: a.string(),
    recordingName: a.string(),
    performerId: a.string(),
    performerName: a.string(),
    performerType: a.string(),
    // Book fields
    author: a.string(),
    format: a.string(),
    s3Key: a.string(),
    // Sheet music fields
    artistName: a.string(),
    sheetMusicId: a.string(),
    // External links — JSON-serialized Array<{url: string, type: string}>
    externalLinks: a.string(),
    // Legacy link fields (kept for schema compatibility, frontend uses externalLinks)
    wikiUrl: a.string(),
    imdbUrl: a.string(),
    spotifyUrl: a.string(),
    youtubeUrl: a.string(),
    // Tags (controlled vocabulary)
    tags: a.string().array(),
    // Audit fields
    updatedAt: a.datetime(),
    updatedBy: a.string(),
  })
    .identifier(['id', 'entityType'])
    .secondaryIndexes((index) => [
      index('entityType').sortKeys(['name']).name('byType'),
      index('movieId').sortKeys(['role']).name('byCastMovie'),
      index('personId').sortKeys(['movieName']).name('byPersonFilm'),
      index('recordingId').sortKeys(['performerName']).name('byRecording'),
      index('performerId').sortKeys(['recordingName']).name('byPerformer'),
      index('language').sortKeys(['name']).name('byLanguage'),
    ])
    .authorization((allow) => [allow.authenticated()]),

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
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
