export type TagCategory = {
  label: string;
  tags: string[];
};

export const TAG_DICTIONARY: Record<string, TagCategory> = {
  genre: {
    label: 'Genre',
    tags: [
      'rock', 'pop', 'jazz', 'classical', 'electronic', 'folk',
      'blues', 'country', 'punk', 'metal', 'reggae', 'soul',
      'hip-hop', 'soundtrack', 'world', 'ambient', 'r&b',
    ],
  },
  library_type: {
    label: 'Library Type',
    tags: [
      'prose', 'poetry', 'fiction', 'non-fiction', 'textbook',
      'reference', 'manual', 'biography', 'essay',
    ],
  },
  content: {
    label: 'Content',
    tags: [
      'spiritual', 'technical', 'creative', 'educational',
      'entertainment', 'philosophical', 'scientific', 'political',
      'historical', 'medical', 'programming', 'yoga',
    ],
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
  library_type: '#059669',
  content: '#d97706',
};
