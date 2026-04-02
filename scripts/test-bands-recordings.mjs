/**
 * CRUD test: bands + recordings
 * Creates _test_1_band and _test_1_recording, exercises lifecycle, deletes.
 */
import { setup, createItem, getItem, updateItem, deleteItem, listByType,
  assert, assertEqual, assertIncludes, reportResults, resetResults } from './test-helpers.mjs';

async function run() {
  await setup();
  resetResults();
  console.log('=== CRUD Test: Bands + Recordings ===\n');

  // --- BANDS ---
  console.log('[Band: Create]');
  const band = await createItem({
    id: '_test_1_band', entityType: 'band',
    name: '_test_1_band', language: 'cs',
  });
  assert(band !== null, 'Band created');
  assertEqual(band.name, '_test_1_band', 'Band name matches');

  console.log('[Band: Update]');
  const bandUp = await updateItem('_test_1_band', 'band', { name: '_test_1_band_edited' });
  assertEqual(bandUp.name, '_test_1_band_edited', 'Band name updated');

  console.log('[Band: Tags]');
  const bandTagged = await updateItem('_test_1_band', 'band', { tags: ['rock', 'punk'] });
  assertIncludes(bandTagged.tags, 'rock', 'Band has rock tag');
  assertIncludes(bandTagged.tags, 'punk', 'Band has punk tag');

  console.log('[Band: Links]');
  const bandLinks = JSON.stringify([{ url: 'https://example.com/band', type: 'wikipedia' }]);
  const bandLinked = await updateItem('_test_1_band', 'band', { externalLinks: bandLinks });
  assertEqual(JSON.parse(bandLinked.externalLinks).length, 1, 'Band has 1 link');

  console.log('[Band: List]');
  const bands = await listByType('band');
  assert(bands.find(b => b.id === '_test_1_band') !== undefined, 'Band in listByType');

  // --- RECORDINGS ---
  console.log('[Recording: Create]');
  const rec = await createItem({
    id: '_test_1_recording', entityType: 'recording',
    name: '_test_1_recording', language: 'en',
  });
  assert(rec !== null, 'Recording created');

  console.log('[Recording: Update]');
  const recUp = await updateItem('_test_1_recording', 'recording', { name: '_test_1_recording_edited' });
  assertEqual(recUp.name, '_test_1_recording_edited', 'Recording name updated');

  console.log('[Recording: Tags]');
  const recTagged = await updateItem('_test_1_recording', 'recording', { tags: ['pop'] });
  assertIncludes(recTagged.tags, 'pop', 'Recording has pop tag');

  console.log('[Recording: Links]');
  const recLinks = JSON.stringify([{ url: 'https://musicbrainz.org/test', type: 'musicbrainz' }]);
  const recLinked = await updateItem('_test_1_recording', 'recording', { externalLinks: recLinks });
  assertEqual(JSON.parse(recLinked.externalLinks).length, 1, 'Recording has 1 link');

  console.log('[Recording: List]');
  const recs = await listByType('recording');
  assert(recs.find(r => r.id === '_test_1_recording') !== undefined, 'Recording in listByType');

  // --- DELETE ALL ---
  console.log('[Delete band]');
  await deleteItem('_test_1_band', 'band');
  const bandGone = await getItem('_test_1_band', 'band');
  assert(bandGone === null, 'Band deleted');

  console.log('[Delete recording]');
  await deleteItem('_test_1_recording', 'recording');
  const recGone = await getItem('_test_1_recording', 'recording');
  assert(recGone === null, 'Recording deleted');

  return reportResults('Bands + Recordings CRUD');
}

run().then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error('FATAL:', e); process.exit(1); });
