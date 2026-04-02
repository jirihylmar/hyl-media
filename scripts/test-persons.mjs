/**
 * CRUD test: persons
 * Creates _test_1_person, exercises full lifecycle, deletes.
 */
import { setup, createItem, getItem, updateItem, deleteItem, listByType,
  assert, assertEqual, assertIncludes, reportResults, resetResults } from './test-helpers.mjs';

const TEST_ID = '_test_1_person';
const ENTITY = 'person';

async function run() {
  await setup();
  resetResults();
  console.log('=== CRUD Test: Persons ===\n');

  // 1. Create with person-specific fields
  console.log('[Create]');
  const created = await createItem({
    id: TEST_ID, entityType: ENTITY,
    name: '_test_1_person', givenName: 'Test', familyName: 'Person',
    language: 'en', roles: ['actor', 'director'],
  });
  assert(created !== null, 'Create returns data');
  assertEqual(created.name, '_test_1_person', 'Name matches');
  assertEqual(created.givenName, 'Test', 'givenName matches');
  assertEqual(created.familyName, 'Person', 'familyName matches');
  assert(Array.isArray(created.roles), 'Roles is array');
  assertIncludes(created.roles, 'actor', 'Has actor role');

  // 2. Read
  console.log('[Read]');
  const fetched = await getItem(TEST_ID, ENTITY);
  assert(fetched !== null, 'Get returns data');
  assertIncludes(fetched.roles, 'director', 'Fetched has director role');

  // 3. List
  console.log('[List]');
  const persons = await listByType(ENTITY);
  assert(persons.find(p => p.id === TEST_ID) !== undefined, 'Appears in listByType');

  // 4. Update name + roles
  console.log('[Update]');
  const updated = await updateItem(TEST_ID, ENTITY, {
    name: '_test_1_person_edited', roles: ['author'],
  });
  assertEqual(updated.name, '_test_1_person_edited', 'Name updated');
  assertEqual(updated.roles.length, 1, 'Roles replaced');
  assertIncludes(updated.roles, 'author', 'Now has author role');

  // 5. Tags
  console.log('[Tags]');
  const tagged = await updateItem(TEST_ID, ENTITY, { tags: ['actor', 'test-tag'] });
  assertIncludes(tagged.tags, 'actor', 'Has actor tag');

  // 6. External links
  console.log('[External links]');
  const links = JSON.stringify([{ url: 'https://en.wikipedia.org/wiki/Test', type: 'wikipedia' }]);
  const linked = await updateItem(TEST_ID, ENTITY, { externalLinks: links });
  assertEqual(JSON.parse(linked.externalLinks).length, 1, 'Has 1 link');

  // 7. Delete
  console.log('[Delete]');
  await deleteItem(TEST_ID, ENTITY);
  const gone = await getItem(TEST_ID, ENTITY);
  assert(gone === null, 'Deleted successfully');

  return reportResults('Persons CRUD');
}

run().then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error('FATAL:', e); process.exit(1); });
