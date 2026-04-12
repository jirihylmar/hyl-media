import { describe, it, expect } from 'vitest';
import { TAG_DICTIONARY, TAG_COLORS, getAllTags, getTagCategory } from './tagDictionary';

describe('TAG_DICTIONARY', () => {
  it('should have all expected categories', () => {
    const categories = Object.keys(TAG_DICTIONARY);
    expect(categories).toContain('genre');
    expect(categories).toContain('instrument');
    expect(categories).toContain('library_type');
    expect(categories).toContain('content');
    expect(categories).toContain('role');
    expect(categories).toContain('curation');
  });

  it('should have the recommended tag in curation category', () => {
    expect(TAG_DICTIONARY.curation.tags).toContain('recommended');
    expect(TAG_DICTIONARY.curation.tags).toContain('favorite');
    expect(TAG_DICTIONARY.curation.tags).toContain('hidden-gem');
  });

  it('should have a label and method for each category', () => {
    for (const [key, cat] of Object.entries(TAG_DICTIONARY)) {
      expect(cat.label, `${key} should have a label`).toBeTruthy();
      expect(cat.method, `${key} should have a method`).toBeTruthy();
      expect(cat.tags.length, `${key} should have at least one tag`).toBeGreaterThan(0);
    }
  });

  it('should have no duplicate tags across categories', () => {
    const allTags = getAllTags();
    const uniqueTags = new Set(allTags);
    expect(allTags.length).toBe(uniqueTags.size);
  });
});

describe('TAG_COLORS', () => {
  it('should have a color for every category', () => {
    for (const key of Object.keys(TAG_DICTIONARY)) {
      expect(TAG_COLORS[key], `${key} should have a color`).toBeTruthy();
    }
  });

  it('should have a color for the curation category', () => {
    expect(TAG_COLORS.curation).toBe('#ec4899');
  });
});

describe('getAllTags', () => {
  it('should return all tags from all categories', () => {
    const tags = getAllTags();
    expect(tags).toContain('rock');
    expect(tags).toContain('guitar');
    expect(tags).toContain('prose');
    expect(tags).toContain('spiritual');
    expect(tags).toContain('actor');
    expect(tags).toContain('recommended');
    expect(tags).toContain('favorite');
    expect(tags).toContain('hidden-gem');
  });

  it('should include all tags from every category', () => {
    const tags = getAllTags();
    let expectedCount = 0;
    for (const cat of Object.values(TAG_DICTIONARY)) {
      expectedCount += cat.tags.length;
    }
    expect(tags.length).toBe(expectedCount);
  });
});

describe('getTagCategory', () => {
  it('should return the correct category for known tags', () => {
    expect(getTagCategory('rock')).toBe('genre');
    expect(getTagCategory('guitar')).toBe('instrument');
    expect(getTagCategory('prose')).toBe('library_type');
    expect(getTagCategory('spiritual')).toBe('content');
    expect(getTagCategory('actor')).toBe('role');
    expect(getTagCategory('recommended')).toBe('curation');
    expect(getTagCategory('favorite')).toBe('curation');
    expect(getTagCategory('hidden-gem')).toBe('curation');
  });

  it('should return undefined for unknown tags', () => {
    expect(getTagCategory('nonexistent')).toBeUndefined();
    expect(getTagCategory('')).toBeUndefined();
  });
});
