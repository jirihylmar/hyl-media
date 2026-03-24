/**
 * Create missing person/band entities for book authors and sheet music artists.
 * Also creates sheet_music_performer cross-refs and fixes near-matches.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/create-missing-entities.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = 'eu-central-1';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function makeId(name) {
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const hash = createHash('md5').update(name).digest('hex').slice(0, 4);
  return `${slug}_${hash}`;
}

// --- Sheet music: persons to create ---
const sheetMusicPersons = [
  { name: 'Aretha Franklin', language: 'en', roles: ['artist'] },
  { name: 'Bob Dylan', language: 'en', roles: ['artist'] },
  { name: 'Bob Marley', language: 'en', roles: ['artist'] },
  { name: 'Bobby McFerrin', language: 'en', roles: ['artist'] },
  { name: 'Don McLean', language: 'en', roles: ['artist'] },
  { name: 'Eric Clapton', language: 'en', roles: ['artist'] },
  { name: 'Frank Sinatra', language: 'en', roles: ['artist'] },
  { name: 'Frank Zappa', language: 'en', roles: ['artist'] },
  { name: 'Jaromir Nohavica', language: 'cs', roles: ['artist'] },
  { name: 'Michal Prokop', language: 'cs', roles: ['artist'] },
  { name: 'Neil Young', language: 'en', roles: ['artist'] },
  { name: 'Petr Hapka', language: 'cs', roles: ['artist'] },
  { name: 'Zdenek Sverak', language: 'cs', roles: ['artist'] },
];

// --- Sheet music: bands to create ---
const sheetMusicBands = [
  { name: 'Animals', language: 'en' },
  { name: 'Eagles', language: 'en' },
  { name: 'Film', language: 'cs' },
  { name: 'Fools Garden', language: 'en' },
  { name: 'Garaz', language: 'cs' },
  { name: 'Greenhorns', language: 'cs' },
  { name: 'K.T.O.', language: 'cs' },
  { name: 'Katapult', language: 'cs' },
  { name: 'Smokie', language: 'en' },
  { name: 'The Doors', language: 'en' },
  { name: 'Tri sestry', language: 'cs' },
  { name: 'Velvet Underground', language: 'en' },
];

// --- Artist name normalization (sheet music artistName → entity name) ---
const artistNameMap = {
  // Near-matches: map sheet music artistName to existing entity
  'Rolling Stones': { id: 'the-rolling-stones_1asy', name: 'The Rolling Stones', type: 'band' },
  'Nick Cave': { id: 'nick-cave-&-the-bad-seeds_n05e', name: 'Nick Cave & The Bad Seeds', type: 'band' },
  'Patti Smith': { id: 'patti-smith-group_5vzj', name: 'Patti Smith Group', type: 'band' },
  'Johny Cash': { id: 'johnny-cash_scgm', name: 'Johnny Cash', type: 'person' },
  'Jiri Suchy': { id: 'suchy-jiri-&-slitr-jiri_f24h', name: 'Jiri Suchy & Jiri Slitr', type: 'band' },
  // New persons
  'Aretha Franklin': { type: 'person' },
  'Bob Dylan': { type: 'person' },
  'Bob Marley': { type: 'person' },
  'Bobby Mcferrin': { type: 'person', matchName: 'Bobby McFerrin' },
  'Don Mclean': { type: 'person', matchName: 'Don McLean' },
  'Eric Clapton': { type: 'person' },
  'Frank Sinatra': { type: 'person' },
  'Frank Zappa': { type: 'person' },
  'Jaromir Nohavica': { type: 'person' },
  'Michal Prokop': { type: 'person' },
  'Neil Young': { type: 'person' },
  'Hapka': { type: 'person', matchName: 'Petr Hapka' },
  'Sverak': { type: 'person', matchName: 'Zdenek Sverak' },
  // New bands
  'Animals': { type: 'band' },
  'Eagles': { type: 'band' },
  'Film': { type: 'band' },
  'Fools Garden': { type: 'band' },
  'Garaz': { type: 'band', matchName: 'Garaz' },
  'Greenhorns': { type: 'band' },
  'K.T.O.': { type: 'band' },
  'Katapult': { type: 'band' },
  'Smokie': { type: 'band' },
  'The Doors': { type: 'band' },
  'Tri sestry': { type: 'band' },
  'Velvet Underground': { type: 'band' },
  // Skip
  'Koledy': { type: 'skip' }, // carols, not an artist
};

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

async function putItem(item) {
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...item,
      __typename: 'KnowledgeGraphItem',
      createdAt: new Date().toISOString(),
    },
  }));
}

async function main() {
  console.log('=== Create Missing Entities ===\n');

  // Load existing entities for dedup
  const existingPersons = await scanAll('person');
  const existingBands = await scanAll('band');
  const existingCrossRefs = await scanAll('sheet_music_performer');
  const existingPersonNames = new Set(existingPersons.map(p => p.name));
  const existingBandNames = new Set(existingBands.map(b => b.name));
  const existingCrossRefIds = new Set(existingCrossRefs.map(cr => cr.id));

  console.log(`Existing: ${existingPersons.length} persons, ${existingBands.length} bands, ${existingCrossRefs.length} cross-refs\n`);

  // Track created entities: name → {id, entityType}
  const createdEntities = {};

  // Step 1: Create person entities for sheet music artists
  console.log('--- Creating person entities (sheet music artists) ---');
  for (const p of sheetMusicPersons) {
    if (existingPersonNames.has(p.name)) {
      console.log(`  SKIP (exists): ${p.name}`);
      const existing = existingPersons.find(ep => ep.name === p.name);
      createdEntities[p.name] = { id: existing.id, entityType: 'person' };
      continue;
    }
    const id = makeId(p.name);
    const nameParts = p.name.split(' ');
    const item = {
      id, entityType: 'person',
      name: p.name,
      givenName: nameParts.slice(0, -1).join(' '),
      familyName: nameParts[nameParts.length - 1],
      language: p.language,
      roles: p.roles,
    };
    await putItem(item);
    createdEntities[p.name] = { id, entityType: 'person' };
    console.log(`  CREATED: ${p.name} (${id})`);
  }

  // Step 2: Create band entities for sheet music artists
  console.log('\n--- Creating band entities (sheet music artists) ---');
  for (const b of sheetMusicBands) {
    if (existingBandNames.has(b.name)) {
      console.log(`  SKIP (exists): ${b.name}`);
      const existing = existingBands.find(eb => eb.name === b.name);
      createdEntities[b.name] = { id: existing.id, entityType: 'band' };
      continue;
    }
    const id = makeId(b.name);
    const item = {
      id, entityType: 'band',
      name: b.name,
      language: b.language,
    };
    await putItem(item);
    createdEntities[b.name] = { id, entityType: 'band' };
    console.log(`  CREATED: ${b.name} (${id})`);
  }

  // Step 3: Create book author persons
  console.log('\n--- Creating person entities (book authors) ---');
  const books = await scanAll('book');
  const uniqueAuthors = [...new Set(books.map(b => b.author).filter(Boolean))];
  console.log(`  Found ${uniqueAuthors.length} unique book authors`);
  let authorCreated = 0;
  for (const authorName of uniqueAuthors) {
    if (existingPersonNames.has(authorName) || createdEntities[authorName]) {
      continue; // already exists
    }
    const id = makeId(authorName);
    const nameParts = authorName.split(' ');
    const item = {
      id, entityType: 'person',
      name: authorName,
      givenName: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '',
      familyName: nameParts[nameParts.length - 1],
      language: /[áčďéěíňóřšťúůýž]/i.test(authorName) ? 'cs' : 'en',
      roles: ['author'],
    };
    await putItem(item);
    createdEntities[authorName] = { id, entityType: 'person' };
    authorCreated++;
    if (authorCreated % 20 === 0) console.log(`  ... created ${authorCreated} authors`);
  }
  console.log(`  CREATED: ${authorCreated} book author persons`);

  // Step 4: Create sheet_music_performer cross-refs
  console.log('\n--- Creating sheet_music_performer cross-refs ---');
  const sheetMusic = await scanAll('sheet_music');
  let crossRefCreated = 0;
  for (const sheet of sheetMusic) {
    const artistName = sheet.artistName;
    if (!artistName) continue;

    // Resolve the entity for this artist
    let entity = null;
    const mapping = artistNameMap[artistName];

    if (mapping) {
      if (mapping.type === 'skip') continue;
      if (mapping.id) {
        // Existing entity (near-match)
        entity = { id: mapping.id, type: mapping.type, name: mapping.name };
      } else {
        // Newly created entity
        const lookupName = mapping.matchName || artistName;
        const created = createdEntities[lookupName];
        if (created) {
          entity = { id: created.id, type: created.entityType, name: lookupName };
        }
      }
    } else {
      // Try direct name match in created entities
      const created = createdEntities[artistName];
      if (created) {
        entity = { id: created.id, type: created.entityType, name: artistName };
      }
    }

    if (!entity) continue;

    const crossRefId = `${sheet.id}___performer___${entity.id}`;
    if (existingCrossRefIds.has(crossRefId)) continue;

    await putItem({
      id: crossRefId,
      entityType: 'sheet_music_performer',
      sheetMusicId: sheet.id,
      performerId: entity.id,
      performerName: entity.name,
      performerType: entity.type,
      name: sheet.name,
    });
    crossRefCreated++;
  }
  console.log(`  CREATED: ${crossRefCreated} sheet_music_performer cross-refs`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Person entities created: ${sheetMusicPersons.filter(p => !existingPersonNames.has(p.name)).length + authorCreated}`);
  console.log(`  Band entities created: ${sheetMusicBands.filter(b => !existingBandNames.has(b.name)).length}`);
  console.log(`  Cross-refs created: ${crossRefCreated}`);
  console.log('\nDone!');
}

main().catch(console.error);
