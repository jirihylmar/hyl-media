import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

let _client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getClient() {
  if (!_client) {
    _client = generateClient<Schema>();
  }
  return _client;
}

export type KnowledgeGraphItem = Schema['KnowledgeGraphItem']['type'];
