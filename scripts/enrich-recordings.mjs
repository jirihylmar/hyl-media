/**
 * Enrich recordings from parsed YouTube playlist.
 * - Creates missing bands/persons
 * - Creates missing recordings
 * - Creates recording_performer cross-references
 * - Adds YouTube external links
 * - Adds genre tags
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/enrich-recordings.mjs [--dry-run] [--audit-only]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');
const AUDIT_ONLY = process.argv.includes('--audit-only');
const INPUT = 'input/youtube_parsed.json';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function makeId(name) {
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const hash = createHash('md5').update(name).digest('hex').slice(0, 4);
  return `${slug}_${hash}`;
}

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

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
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create: ${item.entityType} "${item.name}" (${item.id})`);
    return;
  }
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...item,
      __typename: 'KnowledgeGraphItem',
      createdAt: new Date().toISOString(),
    },
  }));
}

async function updateExternalLinks(id, entityType, links) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update links for ${entityType} ${id}`);
    return;
  }
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET externalLinks = :links, updatedAt = :now',
    ExpressionAttributeValues: {
      ':links': JSON.stringify(links),
      ':now': new Date().toISOString(),
    },
  }));
}

async function updateTags(id, entityType, tags) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update tags for ${entityType} ${id}`);
    return;
  }
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET tags = :tags, updatedAt = :now',
    ExpressionAttributeValues: {
      ':tags': tags,
      ':now': new Date().toISOString(),
    },
  }));
}

// --- Name matching helpers ---

// Artist name variations that map to the same entity
const NAME_ALIASES = {
  'the prodigy': 'prodigy',
  'pink': 'p!nk',
  'charli xcx': 'charli xcx',
  'visaci zamek': 'visaci zamek',
  'midi lidi': 'midi lidi',
  'fiction': 'fiction',
  'elan': 'elan',
};

function findMatch(name, items) {
  const norm = normalize(name);
  // Exact normalized match
  let match = items.find(i => normalize(i.name) === norm);
  if (match) return match;
  // Check aliases
  const alias = NAME_ALIASES[norm];
  if (alias) {
    match = items.find(i => normalize(i.name) === alias);
    if (match) return match;
  }
  // Reverse alias check
  for (const [k, v] of Object.entries(NAME_ALIASES)) {
    if (v === norm) {
      match = items.find(i => normalize(i.name) === k);
      if (match) return match;
    }
  }
  return null;
}

// --- Main ---

async function main() {
  console.log('=== Recording Enrichment from YouTube Playlist ===\n');

  // Load parsed data
  const entries = JSON.parse(readFileSync(INPUT, 'utf-8'));
  console.log(`Loaded ${entries.length} parsed entries\n`);

  // Load existing DynamoDB data
  console.log('Scanning existing DynamoDB data...');
  const [existingRecordings, existingBands, existingPersons, existingCrossRefs] = await Promise.all([
    scanAll('recording'),
    scanAll('band'),
    scanAll('person'),
    scanAll('recording_performer'),
  ]);
  console.log(`  Recordings: ${existingRecordings.length}`);
  console.log(`  Bands: ${existingBands.length}`);
  console.log(`  Persons: ${existingPersons.length}`);
  console.log(`  Recording-performer links: ${existingCrossRefs.length}\n`);

  // Build lookup sets
  const crossRefIds = new Set(existingCrossRefs.map(cr => cr.id));

  // --- AUDIT PHASE ---
  const stats = {
    recordings: { existing: 0, toCreate: 0, items: [] },
    bands: { existing: 0, toCreate: 0, items: [] },
    persons: { existing: 0, toCreate: 0, items: [] },
    crossRefs: { existing: 0, toCreate: 0, items: [] },
    compilations: 0,
    youtubeLinksToAdd: 0,
    tagsToAdd: 0,
  };

  // Track entities we'll create (for cross-ref resolution)
  const entityRegistry = {}; // normalized name → { id, entityType, name }

  // Register existing entities
  for (const b of existingBands) {
    entityRegistry[normalize(b.name)] = { id: b.id, entityType: 'band', name: b.name };
  }
  for (const p of existingPersons) {
    entityRegistry[normalize(p.name)] = { id: p.id, entityType: 'person', name: p.name };
  }

  // Collect all unique artists (main + featured) from entries
  const allArtists = new Map(); // normalized → { name, type, language, tags }
  for (const e of entries) {
    if (e.type === 'compilation') {
      stats.compilations++;
      continue;
    }
    // Main artist
    const norm = normalize(e.artist);
    if (!allArtists.has(norm)) {
      allArtists.set(norm, { name: e.artist, type: e.type, language: e.language, tags: e.tags });
    }
    // Featured artists
    if (e.featured) {
      for (const f of e.featured) {
        const fnorm = normalize(f);
        if (!allArtists.has(fnorm)) {
          // Try to find type from ARTIST_META via the parsed data
          allArtists.set(fnorm, { name: f, type: 'person', language: 'en', tags: [] });
        }
      }
    }
  }

  // Check which artists exist, which need creation
  console.log('--- Artist Audit ---');
  const bandsToCreate = [];
  const personsToCreate = [];

  for (const [norm, info] of allArtists) {
    const existing = findMatch(info.name, [...existingBands, ...existingPersons]);
    if (existing) {
      entityRegistry[norm] = { id: existing.id, entityType: existing.entityType, name: existing.name };
      if (info.type === 'band') stats.bands.existing++;
      else stats.persons.existing++;
    } else {
      if (info.type === 'band') {
        stats.bands.toCreate++;
        bandsToCreate.push(info);
        const id = makeId(info.name);
        entityRegistry[norm] = { id, entityType: 'band', name: info.name };
      } else {
        stats.persons.toCreate++;
        personsToCreate.push(info);
        const id = makeId(info.name);
        entityRegistry[norm] = { id, entityType: 'person', name: info.name };
      }
    }
  }

  console.log(`  Bands: ${stats.bands.existing} existing, ${stats.bands.toCreate} to create`);
  console.log(`  Persons: ${stats.persons.existing} existing, ${stats.persons.toCreate} to create`);
  if (bandsToCreate.length > 0) {
    console.log(`  New bands: ${bandsToCreate.map(b => b.name).join(', ')}`);
  }
  if (personsToCreate.length > 0) {
    console.log(`  New persons: ${personsToCreate.map(p => p.name).join(', ')}`);
  }

  // Check which recordings exist
  console.log('\n--- Recording Audit ---');
  const recordingsToCreate = [];
  const recordingsExisting = [];
  const recordingsToAddYouTube = [];
  const recordingsToAddTags = [];

  for (const e of entries) {
    if (e.type === 'compilation') continue;

    const recMatch = findMatch(e.song, existingRecordings);
    if (recMatch) {
      stats.recordings.existing++;
      recordingsExisting.push({ entry: e, existing: recMatch });

      // Check if YouTube link already exists
      let links = [];
      try { links = JSON.parse(recMatch.externalLinks || '[]'); } catch {}
      const hasYoutube = links.some(l => l.type === 'youtube');
      if (!hasYoutube && e.youtubeUrl) {
        stats.youtubeLinksToAdd++;
        recordingsToAddYouTube.push({ existing: recMatch, entry: e, currentLinks: links });
      }

      // Check tags
      if (!recMatch.tags || recMatch.tags.length === 0) {
        if (e.tags && e.tags.length > 0) {
          stats.tagsToAdd++;
          recordingsToAddTags.push({ existing: recMatch, tags: e.tags });
        }
      }
    } else {
      stats.recordings.toCreate++;
      recordingsToCreate.push(e);
    }
  }

  console.log(`  Recordings: ${stats.recordings.existing} existing, ${stats.recordings.toCreate} to create`);
  console.log(`  YouTube links to add: ${stats.youtubeLinksToAdd}`);
  console.log(`  Tags to add: ${stats.tagsToAdd}`);
  console.log(`  Compilations skipped: ${stats.compilations}`);

  // Check cross-refs needed
  console.log('\n--- Cross-Reference Audit ---');
  const crossRefsToCreate = [];

  for (const e of entries) {
    if (e.type === 'compilation') continue;

    // Determine recording ID (existing or to-be-created)
    const recMatch = findMatch(e.song, existingRecordings);
    const recId = recMatch ? recMatch.id : makeId(e.song);

    // Main artist
    const artistEntity = entityRegistry[normalize(e.artist)];
    if (artistEntity) {
      const crossRefId = `${recId}___performer___${artistEntity.id}`;
      if (!crossRefIds.has(crossRefId)) {
        stats.crossRefs.toCreate++;
        crossRefsToCreate.push({
          id: crossRefId,
          recordingId: recId,
          recordingName: e.song,
          performerId: artistEntity.id,
          performerName: artistEntity.name,
          performerType: artistEntity.entityType,
        });
        crossRefIds.add(crossRefId); // prevent duplicates
      } else {
        stats.crossRefs.existing++;
      }
    }

    // Featured artists
    if (e.featured) {
      for (const f of e.featured) {
        const featEntity = entityRegistry[normalize(f)];
        if (featEntity) {
          const crossRefId = `${recId}___performer___${featEntity.id}`;
          if (!crossRefIds.has(crossRefId)) {
            stats.crossRefs.toCreate++;
            crossRefsToCreate.push({
              id: crossRefId,
              recordingId: recId,
              recordingName: e.song,
              performerId: featEntity.id,
              performerName: featEntity.name,
              performerType: featEntity.entityType,
            });
            crossRefIds.add(crossRefId);
          } else {
            stats.crossRefs.existing++;
          }
        }
      }
    }
  }

  console.log(`  Cross-refs: ${stats.crossRefs.existing} existing, ${stats.crossRefs.toCreate} to create`);

  // --- AUDIT SUMMARY ---
  console.log('\n========================================');
  console.log('AUDIT SUMMARY');
  console.log('========================================');
  console.log(`Bands:      ${stats.bands.toCreate} to create, ${stats.bands.existing} existing`);
  console.log(`Persons:    ${stats.persons.toCreate} to create, ${stats.persons.existing} existing`);
  console.log(`Recordings: ${stats.recordings.toCreate} to create, ${stats.recordings.existing} existing`);
  console.log(`Cross-refs: ${stats.crossRefs.toCreate} to create, ${stats.crossRefs.existing} existing`);
  console.log(`YouTube links: ${stats.youtubeLinksToAdd} to add`);
  console.log(`Tags: ${stats.tagsToAdd} to update`);
  console.log(`Compilations: ${stats.compilations} skipped`);
  console.log('========================================\n');

  if (AUDIT_ONLY) {
    console.log('Audit complete (--audit-only mode).');
    if (recordingsToCreate.length > 0) {
      console.log('\nRecordings to create:');
      for (const r of recordingsToCreate) {
        console.log(`  - ${r.artist} — ${r.song}`);
      }
    }
    return;
  }

  if (DRY_RUN) console.log('*** DRY RUN MODE — no changes will be made ***\n');

  // --- ENRICHMENT PHASE ---

  // Step 1: Create missing bands
  if (bandsToCreate.length > 0) {
    console.log('--- Creating bands ---');
    for (const b of bandsToCreate) {
      const id = makeId(b.name);
      await putItem({
        id,
        entityType: 'band',
        name: b.name,
        language: b.language,
        tags: b.tags,
      });
      console.log(`  CREATED band: ${b.name} (${id})`);
    }
  }

  // Step 2: Create missing persons
  if (personsToCreate.length > 0) {
    console.log('\n--- Creating persons ---');
    for (const p of personsToCreate) {
      const id = makeId(p.name);
      const nameParts = p.name.split(' ');
      await putItem({
        id,
        entityType: 'person',
        name: p.name,
        givenName: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : p.name,
        familyName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
        language: p.language,
        roles: ['artist'],
        tags: p.tags,
      });
      console.log(`  CREATED person: ${p.name} (${id})`);
    }
  }

  // Step 3: Create missing recordings
  if (recordingsToCreate.length > 0) {
    console.log('\n--- Creating recordings ---');
    for (const e of recordingsToCreate) {
      const id = makeId(e.song);
      const links = e.youtubeUrl ? [{ url: e.youtubeUrl, type: 'youtube' }] : [];
      await putItem({
        id,
        entityType: 'recording',
        name: e.song,
        language: e.language,
        tags: e.tags || [],
        externalLinks: JSON.stringify(links),
      });
      console.log(`  CREATED recording: ${e.song} (${id})`);
    }
  }

  // Step 4: Add YouTube links to existing recordings
  if (recordingsToAddYouTube.length > 0) {
    console.log('\n--- Adding YouTube links ---');
    for (const { existing, entry, currentLinks } of recordingsToAddYouTube) {
      const newLinks = [...currentLinks, { url: entry.youtubeUrl, type: 'youtube' }];
      await updateExternalLinks(existing.id, existing.entityType, newLinks);
      console.log(`  ADDED YouTube to: ${existing.name}`);
    }
  }

  // Step 5: Add tags to existing recordings without tags
  if (recordingsToAddTags.length > 0) {
    console.log('\n--- Adding tags ---');
    for (const { existing, tags } of recordingsToAddTags) {
      await updateTags(existing.id, existing.entityType, tags);
      console.log(`  ADDED tags to: ${existing.name} [${tags.join(', ')}]`);
    }
  }

  // Step 6: Create cross-references
  if (crossRefsToCreate.length > 0) {
    console.log('\n--- Creating recording_performer cross-refs ---');
    for (const cr of crossRefsToCreate) {
      await putItem({
        id: cr.id,
        entityType: 'recording_performer',
        recordingId: cr.recordingId,
        recordingName: cr.recordingName,
        performerId: cr.performerId,
        performerName: cr.performerName,
        performerType: cr.performerType,
        name: cr.recordingName,
      });
      console.log(`  LINKED: ${cr.recordingName} ↔ ${cr.performerName}`);
    }
  }

  // Final summary
  console.log('\n========================================');
  console.log('ENRICHMENT COMPLETE');
  console.log('========================================');
  console.log(`Bands created: ${bandsToCreate.length}`);
  console.log(`Persons created: ${personsToCreate.length}`);
  console.log(`Recordings created: ${recordingsToCreate.length}`);
  console.log(`Cross-refs created: ${crossRefsToCreate.length}`);
  console.log(`YouTube links added: ${recordingsToAddYouTube.length}`);
  console.log(`Tags updated: ${recordingsToAddTags.length}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
