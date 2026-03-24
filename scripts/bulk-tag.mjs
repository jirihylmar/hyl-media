/**
 * Bulk-tag books and sheet music with appropriate tags from the controlled dictionary.
 *
 * Books get: library_type + content tags
 * Sheet music gets: genre tags
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/bulk-tag.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = 'eu-central-1';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

// --- Tag assignment rules for books ---

function tagBook(book) {
  const tags = [];
  const name = (book.name || '').toLowerCase();
  const author = (book.author || '').toLowerCase();

  // Library type tags
  if (name.includes('sutra') || name.includes('gita') || name.includes('vedanta') ||
      name.includes('dhamma') || name.includes('buddhist') || name.includes('hinduism') ||
      name.includes('tattva') || name.includes('yoga') || name.includes('rajayoga') ||
      name.includes('mantr') || name.includes('meditation') || name.includes('purification')) {
    tags.push('reference');
  }
  if (name.includes('pattern recognition') || name.includes('machine learning') ||
      name.includes('probabilistic') || name.includes('supercomputing') ||
      name.includes('programming') || name.includes('scales micro')) {
    tags.push('textbook');
  }
  if (name.includes('first aid') || name.includes('prvni pomoc') || name.includes('kineziologie') ||
      name.includes('masaz') || name.includes('anatomie') || name.includes('rehabilita')) {
    tags.push('manual');
  }
  if (name.includes('steve jobs') || name.includes('life and teachings') ||
      name.includes('milarepa') || author.includes('biography')) {
    tags.push('biography');
  }
  if (name.includes('jerry of the islands') || name.includes('hypnotiz') ||
      name.includes('host u tabule') || name.includes('katyn') ||
      name.includes('maj') || name.includes('stare povesti')) {
    tags.push('prose');
  }
  if (name.includes('poetry') || name.includes('basn') || name.includes('maj')) {
    // Máj is poetry
  }
  if (!tags.some(t => ['reference', 'textbook', 'manual', 'biography', 'prose'].includes(t))) {
    tags.push('non-fiction');
  }

  // Content tags
  if (name.includes('yoga') || name.includes('meditation') || name.includes('pranayama') ||
      name.includes('asana') || name.includes('relaxation') || name.includes('vedsk') ||
      name.includes('athayoga') || author.includes('jnaneshvara')) {
    tags.push('yoga');
  }
  if (name.includes('sutra') || name.includes('gita') || name.includes('vedanta') ||
      name.includes('dhamma') || name.includes('buddhist') || name.includes('hinduism') ||
      name.includes('soul after death') || name.includes('tattva') || name.includes('purification') ||
      name.includes('tibetu') || name.includes('indicka filozofie') || name.includes('conquest of fear') ||
      name.includes('rajayoga') || name.includes('mantr') || name.includes('sacred books') ||
      author.includes('sivananda') || author.includes('vivekananda') || author.includes('bhikkhu') ||
      author.includes('bhaktivedanta') || author.includes('steiner')) {
    tags.push('spiritual');
  }
  if (name.includes('machine learning') || name.includes('pattern recognition') ||
      name.includes('probabilistic') || name.includes('supercomputing') ||
      name.includes('programming') || name.includes('scales micro')) {
    tags.push('technical');
  }
  if (name.includes('kineziologie') || name.includes('masaz') || name.includes('stres') ||
      name.includes('mozek') || name.includes('predpoklady') || name.includes('first aid') ||
      name.includes('prvni pomoc') || name.includes('ayurveda') || name.includes('anatomie')) {
    tags.push('medical');
  }
  if (name.includes('psychology') || name.includes('fear') || name.includes('stres') ||
      name.includes('mozek') || author.includes('freud')) {
    if (!tags.includes('medical')) tags.push('philosophical');
  }
  if (name.includes('zprava o indii') || name.includes('stare povesti') || name.includes('katyn')) {
    tags.push('historical');
  }
  if (name.includes('learn and master guitar') || name.includes('scales micro')) {
    tags.push('educational');
  }
  if (name.includes('jerry of the islands') || name.includes('hypnotiz') ||
      name.includes('host u tabule')) {
    tags.push('entertainment');
  }
  if (name.includes('programming') || name.includes('supercomputing')) {
    tags.push('programming');
  }

  // Deduplicate
  return [...new Set(tags)];
}

// --- Tag assignment rules for sheet music ---

function tagSheetMusic(sheet) {
  const tags = [];
  const artist = (sheet.artistName || '').toLowerCase();
  const name = (sheet.name || '').toLowerCase();

  // Genre tags based on artist
  const rockArtists = ['rolling stones', 'bob dylan', 'neil young', 'patti smith', 'david bowie',
    'lou reed', 'velvet underground', 'the doors', 'iggy pop', 'nick cave', 'eric clapton',
    'katapult', 'michal prokop', 'frank zappa', 'animals', 'eagles', 'u2', 'jiri schelinger',
    'vladimir misik', 'tri sestry', 'film', 'garaz', 'greenhorns', 'jaromir nohavica',
    'miro zbirka', 'richard muller', 'hapka', 'spiritual kvintet', 'jiri suchy',
    'petr kalandra'];
  const popArtists = ['frank sinatra', 'don mclean', 'bobby mcferrin', 'fools garden', 'smokie',
    'sting', 'sverak', 'aretha franklin'];
  const folkArtists = ['bob dylan', 'neil young', 'simon & garfunkel', 'jaromir nohavica',
    'spiritual kvintet', 'greenhorns', 'don mclean'];
  const reggaeArtists = ['bob marley'];
  const countryArtists = ['johny cash', 'greenhorns'];
  const soulArtists = ['aretha franklin'];

  for (const ra of rockArtists) {
    if (artist.includes(ra)) { tags.push('rock'); break; }
  }
  for (const pa of popArtists) {
    if (artist.includes(pa)) { tags.push('pop'); break; }
  }
  for (const fa of folkArtists) {
    if (artist.includes(fa)) { tags.push('folk'); break; }
  }
  for (const ra of reggaeArtists) {
    if (artist.includes(ra)) { tags.push('reggae'); break; }
  }
  for (const ca of countryArtists) {
    if (artist.includes(ca)) { tags.push('country'); break; }
  }
  for (const sa of soulArtists) {
    if (artist.includes(sa)) { tags.push('soul'); break; }
  }

  // Christmas carols
  if (artist === 'koledy') {
    tags.length = 0; // Clear other tags
    tags.push('folk', 'world');
  }

  // Default if no genre matched
  if (tags.length === 0) {
    tags.push('rock'); // Most sheet music in this collection is rock
  }

  return [...new Set(tags)];
}

// --- Main ---

async function scanAll(entityType) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'entityType = :et',
      ExpressionAttributeValues: { ':et': entityType },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function applyTags(id, entityType, tags) {
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET tags = :t, updatedAt = :u, updatedBy = :b',
    ExpressionAttributeValues: {
      ':t': tags,
      ':u': new Date().toISOString(),
      ':b': 'bulk-tag-script',
    },
  }));
}

async function main() {
  console.log('=== Bulk Tagging ===\n');

  // Tag books
  const books = await scanAll('book');
  console.log(`Found ${books.length} books`);
  let bookTagged = 0;
  for (const book of books) {
    const tags = tagBook(book);
    if (tags.length > 0) {
      // Merge with existing tags
      const existing = book.tags || [];
      const merged = [...new Set([...existing, ...tags])];
      await applyTags(book.id, 'book', merged);
      bookTagged++;
    }
  }
  console.log(`Tagged ${bookTagged} books\n`);

  // Tag sheet music
  const sheets = await scanAll('sheet_music');
  console.log(`Found ${sheets.length} sheet music items`);
  let sheetTagged = 0;
  for (const sheet of sheets) {
    const tags = tagSheetMusic(sheet);
    if (tags.length > 0) {
      const existing = sheet.tags || [];
      const merged = [...new Set([...existing, ...tags])];
      await applyTags(sheet.id, 'sheet_music', merged);
      sheetTagged++;
    }
  }
  console.log(`Tagged ${sheetTagged} sheet music items\n`);

  // Print sample results
  console.log('--- Sample Book Tags ---');
  const sampleBooks = books.slice(0, 10);
  for (const b of sampleBooks) {
    console.log(`  ${b.name}: ${tagBook(b).join(', ')}`);
  }

  console.log('\n--- Sample Sheet Music Tags ---');
  const sampleSheets = sheets.slice(0, 10);
  for (const s of sampleSheets) {
    console.log(`  ${s.name} (${s.artistName}): ${tagSheetMusic(s).join(', ')}`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
