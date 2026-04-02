/**
 * CRUD test: movies
 * Creates _test_1_movie, exercises full lifecycle, deletes.
 */
import { setup, createItem, getItem, updateItem, deleteItem, listByType,
  assert, assertEqual, assertIncludes, reportResults, resetResults } from './test-helpers.mjs';

const TEST_ID = '_test_1_movie';
const ENTITY = 'movie';

async function run() {
  await setup();
  resetResults();
  console.log('=== CRUD Test: Movies ===\n');

  // 1. Create
  console.log('[Create]');
  const created = await createItem({ id: TEST_ID, entityType: ENTITY, name: '_test_1_movie', language: 'en' });
  assert(created !== null, 'Create returns data');
  assertEqual(created.name, '_test_1_movie', 'Name matches');
  assertEqual(created.language, 'en', 'Language matches');

  // 2. Read
  console.log('[Read]');
  const fetched = await getItem(TEST_ID, ENTITY);
  assert(fetched !== null, 'Get returns data');
  assertEqual(fetched.name, '_test_1_movie', 'Fetched name matches');

  // 3. List (should appear in type listing)
  console.log('[List]');
  const movies = await listByType(ENTITY);
  const found = movies.find(m => m.id === TEST_ID);
  assert(found !== undefined, 'Appears in listByType');

  // 4. Update name
  console.log('[Update name]');
  const updated = await updateItem(TEST_ID, ENTITY, { name: '_test_1_movie_edited' });
  assertEqual(updated.name, '_test_1_movie_edited', 'Name updated');
  assert(updated.updatedBy === 'test-runner', 'updatedBy set');

  // 5. Update language
  console.log('[Update language]');
  const updated2 = await updateItem(TEST_ID, ENTITY, { language: 'cs' });
  assertEqual(updated2.language, 'cs', 'Language updated');

  // 6. Add tags
  console.log('[Tags]');
  const tagged = await updateItem(TEST_ID, ENTITY, { tags: ['drama', 'test-tag'] });
  assert(Array.isArray(tagged.tags), 'Tags is array');
  assertIncludes(tagged.tags, 'drama', 'Has drama tag');
  assertIncludes(tagged.tags, 'test-tag', 'Has test-tag');

  // 7. Modify tags
  console.log('[Modify tags]');
  const retagged = await updateItem(TEST_ID, ENTITY, { tags: ['comedy'] });
  assertEqual(retagged.tags.length, 1, 'Tags replaced (length 1)');
  assertIncludes(retagged.tags, 'comedy', 'Has comedy tag');

  // 8. Add external links
  console.log('[External links]');
  const links = JSON.stringify([{ url: 'https://example.com/test', type: 'wikipedia' }]);
  const linked = await updateItem(TEST_ID, ENTITY, { externalLinks: links });
  assert(linked.externalLinks !== null, 'externalLinks set');
  const parsedLinks = JSON.parse(linked.externalLinks);
  assertEqual(parsedLinks.length, 1, 'Has 1 link');
  assertEqual(parsedLinks[0].type, 'wikipedia', 'Link type is wikipedia');

  // 9. Modify external links (add second)
  console.log('[Modify links]');
  const links2 = JSON.stringify([
    { url: 'https://example.com/test', type: 'wikipedia' },
    { url: 'https://imdb.com/test', type: 'imdb' },
  ]);
  const linked2 = await updateItem(TEST_ID, ENTITY, { externalLinks: links2 });
  const parsedLinks2 = JSON.parse(linked2.externalLinks);
  assertEqual(parsedLinks2.length, 2, 'Has 2 links');

  // 10. Verify full state
  console.log('[Verify full state]');
  const final = await getItem(TEST_ID, ENTITY);
  assertEqual(final.name, '_test_1_movie_edited', 'Final name correct');
  assertEqual(final.language, 'cs', 'Final language correct');
  assertIncludes(final.tags, 'comedy', 'Final tags correct');
  assert(JSON.parse(final.externalLinks).length === 2, 'Final links correct');

  // 11. Delete
  console.log('[Delete]');
  const deleted = await deleteItem(TEST_ID, ENTITY);
  assert(deleted !== null, 'Delete returns data');

  // 12. Verify gone
  console.log('[Verify deleted]');
  const gone = await getItem(TEST_ID, ENTITY);
  assert(gone === null, 'Item no longer exists after delete');

  return reportResults('Movies CRUD');
}

run().then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error('FATAL:', e); process.exit(1); });
