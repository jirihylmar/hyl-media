import { vi } from 'vitest';
import type { KnowledgeGraphItem } from '../lib/client';

// Mock data factories
export function makeItem(overrides: Partial<KnowledgeGraphItem> = {}): KnowledgeGraphItem {
  return {
    id: 'test-id',
    entityType: 'movie',
    name: 'Test Item',
    language: 'en',
    tags: null,
    externalLinks: null,
    givenName: null,
    familyName: null,
    roles: null,
    role: null,
    movieId: null,
    movieName: null,
    personId: null,
    personName: null,
    recordingId: null,
    recordingName: null,
    performerId: null,
    performerName: null,
    performerType: null,
    author: null,
    format: null,
    s3Key: null,
    artistName: null,
    sheetMusicId: null,
    wikiUrl: null,
    imdbUrl: null,
    spotifyUrl: null,
    youtubeUrl: null,
    updatedAt: null,
    updatedBy: null,
    createdAt: '',
    owner: null,
    ...overrides,
  } as KnowledgeGraphItem;
}

export function makeMovie(overrides: Partial<KnowledgeGraphItem> = {}) {
  return makeItem({ entityType: 'movie', ...overrides });
}

export function makeRecording(overrides: Partial<KnowledgeGraphItem> = {}) {
  return makeItem({ entityType: 'recording', ...overrides });
}

export function makePerson(overrides: Partial<KnowledgeGraphItem> = {}) {
  return makeItem({ entityType: 'person', ...overrides });
}

export function makeRecordingMovie(overrides: Partial<KnowledgeGraphItem> = {}) {
  return makeItem({
    entityType: 'recording_movie',
    movieId: 'movie-1',
    movieName: 'Test Movie',
    recordingId: 'rec-1',
    recordingName: 'Test Song',
    ...overrides,
  });
}

// Mock queries module
export function createMockQueries() {
  return {
    listByType: vi.fn().mockResolvedValue([]),
    getItem: vi.fn().mockResolvedValue(null),
    listByCastMovie: vi.fn().mockResolvedValue([]),
    listByPersonFilm: vi.fn().mockResolvedValue([]),
    listByRecording: vi.fn().mockResolvedValue([]),
    listByPerformer: vi.fn().mockResolvedValue([]),
    createItem: vi.fn().mockResolvedValue(makeItem()),
    deleteItem: vi.fn().mockResolvedValue(makeItem()),
    updateItem: vi.fn().mockResolvedValue(makeItem()),
  };
}
