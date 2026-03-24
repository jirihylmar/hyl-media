import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

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
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
