import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

let _client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getClient() {
  if (!_client) {
    _client = generateClient<Schema>();
  }
  return _client;
}

/**
 * Legacy-shaped catalog item. Originally `Schema['KnowledgeGraphItem']['type']`, now a standalone
 * interface (17.6e) — the KnowledgeGraphItem model + its table were decommissioned. The frontend
 * still uses this shape as the lingua franca for list/detail components, but the data is sourced
 * from the Dublin Core store and mapped to this shape by `dcQueries.toListItem`. All fields are
 * optional (DC records only populate a subset) plus a few `_`-prefixed DC helper fields.
 */
export interface KnowledgeGraphItem {
  id: string;
  entityType: string;
  name?: string | null;
  language?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  roles?: string[] | null;
  role?: string | null;
  movieId?: string | null;
  movieName?: string | null;
  personId?: string | null;
  personName?: string | null;
  recordingId?: string | null;
  recordingName?: string | null;
  performerId?: string | null;
  performerName?: string | null;
  performerType?: string | null;
  author?: string | null;
  format?: string | null;
  s3Key?: string | null;
  artistName?: string | null;
  sheetMusicId?: string | null;
  externalLinks?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  // DC helper fields (set by dcQueries.toListItem) — not part of the legacy schema.
  _dcId?: string;
  _creators?: string[];
  _contributors?: string[];
}
