/**
 * CRUD test: books + sheet music
 * Creates _test_1_book and _test_1_sheet_music, exercises lifecycle, deletes.
 * Note: S3 upload not tested here (metadata only).
 */
import { setup, createItem, getItem, updateItem, deleteItem, listByType,
  assert, assertEqual, assertIncludes, reportResults, resetResults } from './test-helpers.mjs';

async function run() {
  await setup();
  resetResults();
  console.log('=== CRUD Test: Books + Sheet Music ===\n');

  // --- BOOKS ---
  console.log('[Book: Create]');
  const book = await createItem({
    id: '_test_1_book', entityType: 'book',
    name: '_test_1_book', author: 'Test Author', language: 'cs', format: 'pdf',
  });
  assert(book !== null, 'Book created');
  assertEqual(book.author, 'Test Author', 'Author matches');
  assertEqual(book.format, 'pdf', 'Format matches');

  console.log('[Book: Read]');
  const fetched = await getItem('_test_1_book', 'book');
  assert(fetched !== null, 'Book readable');
  assertEqual(fetched.name, '_test_1_book', 'Book name matches');

  console.log('[Book: Update]');
  const bookUp = await updateItem('_test_1_book', 'book', {
    name: '_test_1_book_edited', author: 'Edited Author',
  });
  assertEqual(bookUp.name, '_test_1_book_edited', 'Book name updated');
  assertEqual(bookUp.author, 'Edited Author', 'Author updated');

  console.log('[Book: Tags]');
  const bookTagged = await updateItem('_test_1_book', 'book', { tags: ['prose', 'fiction'] });
  assertIncludes(bookTagged.tags, 'prose', 'Book has prose tag');
  assertIncludes(bookTagged.tags, 'fiction', 'Book has fiction tag');

  console.log('[Book: Links]');
  const bookLinks = JSON.stringify([
    { url: 'https://aleph.nkp.cz/test', type: 'nkp' },
    { url: 'https://openlibrary.org/test', type: 'openlibrary' },
  ]);
  const bookLinked = await updateItem('_test_1_book', 'book', { externalLinks: bookLinks });
  assertEqual(JSON.parse(bookLinked.externalLinks).length, 2, 'Book has 2 links');

  console.log('[Book: List]');
  const books = await listByType('book');
  assert(books.find(b => b.id === '_test_1_book') !== undefined, 'Book in listByType');

  // --- SHEET MUSIC ---
  console.log('[Sheet Music: Create]');
  const sheet = await createItem({
    id: '_test_1_sheet_music', entityType: 'sheet_music',
    name: '_test_1_sheet_music', artistName: 'Test Band', language: 'cs',
  });
  assert(sheet !== null, 'Sheet music created');
  assertEqual(sheet.artistName, 'Test Band', 'artistName matches');

  console.log('[Sheet Music: Update]');
  const sheetUp = await updateItem('_test_1_sheet_music', 'sheet_music', {
    name: '_test_1_sheet_music_edited',
  });
  assertEqual(sheetUp.name, '_test_1_sheet_music_edited', 'Sheet name updated');

  console.log('[Sheet Music: Tags]');
  const sheetTagged = await updateItem('_test_1_sheet_music', 'sheet_music', { tags: ['rock'] });
  assertIncludes(sheetTagged.tags, 'rock', 'Sheet has rock tag');

  console.log('[Sheet Music: Links]');
  const sheetLinks = JSON.stringify([{ url: 'https://supermusic.cz/test', type: 'supermusic' }]);
  const sheetLinked = await updateItem('_test_1_sheet_music', 'sheet_music', { externalLinks: sheetLinks });
  assertEqual(JSON.parse(sheetLinked.externalLinks).length, 1, 'Sheet has 1 link');

  console.log('[Sheet Music: List]');
  const sheets = await listByType('sheet_music');
  assert(sheets.find(s => s.id === '_test_1_sheet_music') !== undefined, 'Sheet in listByType');

  // --- DELETE ALL ---
  console.log('[Delete book]');
  await deleteItem('_test_1_book', 'book');
  assert((await getItem('_test_1_book', 'book')) === null, 'Book deleted');

  console.log('[Delete sheet music]');
  await deleteItem('_test_1_sheet_music', 'sheet_music');
  assert((await getItem('_test_1_sheet_music', 'sheet_music')) === null, 'Sheet music deleted');

  return reportResults('Books + Sheet Music CRUD');
}

run().then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error('FATAL:', e); process.exit(1); });
