export type TagCategory = {
  label: string;
  tags: string[];
  method: string;
};

export const TAG_DICTIONARY: Record<string, TagCategory> = {
  genre: {
    label: 'Genre',
    tags: [
      'rock', 'pop', 'jazz', 'classical', 'electronic', 'folk',
      'blues', 'country', 'punk', 'metal', 'reggae', 'soul',
      'hip-hop', 'soundtrack', 'world', 'ambient', 'r&b',
    ],
    method: 'Sheet music: artist-to-genre mapping. Bands/recordings: inherited from performer cross-refs and known genre associations. Movies: derived from soundtrack recordings.',
  },
  instrument: {
    label: 'Instrument',
    tags: [
      'guitar', 'piano', 'vocals', 'bass', 'drums', 'violin',
      'harmonica', 'accordion', 'flute', 'saxophone', 'trumpet',
    ],
    method: 'Manual assignment. Sheet music tagged by primary instrument in the arrangement.',
  },
  library_type: {
    label: 'Library Type',
    tags: [
      'prose', 'poetry', 'fiction', 'non-fiction', 'textbook',
      'reference', 'manual', 'biography', 'essay',
    ],
    method: 'Rule-based: book title and author keywords matched against category patterns (e.g., sutra/gita/vedanta → reference, machine learning → textbook).',
  },
  content: {
    label: 'Content',
    tags: [
      'spiritual', 'technical', 'creative', 'educational',
      'entertainment', 'philosophical', 'scientific', 'political',
      'historical', 'medical', 'programming', 'yoga',
    ],
    method: 'Rule-based: book title/author keywords (e.g., yoga/meditation/pranayama → yoga, sivananda/vivekananda → spiritual, machine learning → technical). Movies: theme-based.',
  },
  role: {
    label: 'Role',
    tags: [
      'actor', 'director', 'artist', 'author', 'composer', 'producer',
    ],
    method: 'Persons: copied from existing roles[] field in DynamoDB. Bands: not applicable.',
  },
  curation: {
    label: 'Curation',
    tags: [
      'recommended', 'favorite', 'hidden-gem',
    ],
    method: 'Recommended: auto-assigned to new entries. Favorite/hidden-gem: manual assignment for personal curation.',
  },
};

export function getAllTags(): string[] {
  return Object.values(TAG_DICTIONARY).flatMap(cat => cat.tags);
}

export function getTagCategory(tag: string): string | undefined {
  for (const [key, cat] of Object.entries(TAG_DICTIONARY)) {
    if (cat.tags.includes(tag)) return key;
  }
  return undefined;
}

export const TAG_COLORS: Record<string, string> = {
  genre: '#8b5cf6',
  instrument: '#0ea5e9',
  library_type: '#059669',
  content: '#d97706',
  role: '#dc2626',
  curation: '#ec4899',
};
