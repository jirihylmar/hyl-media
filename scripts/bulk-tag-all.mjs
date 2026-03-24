/**
 * Bulk-tag persons, bands, movies, and recordings.
 *
 * Persons: role tags from existing roles[] field
 * Bands: genre tags based on known genre associations
 * Movies: genre + content tags based on soundtrack/cast associations
 * Recordings: genre tags inherited from performer
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/bulk-tag-all.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = 'eu-central-1';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

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
  if (tags.length === 0) return;
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET tags = :t, updatedAt = :u, updatedBy = :b',
    ExpressionAttributeValues: {
      ':t': tags,
      ':u': new Date().toISOString(),
      ':b': 'bulk-tag-all-script',
    },
  }));
}

// --- Person tagging: from roles[] field ---
function tagPerson(person) {
  const tags = [];
  const roles = person.roles || [];
  for (const role of roles) {
    if (['actor', 'director', 'artist', 'author', 'composer', 'producer'].includes(role)) {
      tags.push(role);
    }
  }
  // If no recognized role, infer from context
  if (tags.length === 0) {
    // Check if they have recordings (musician)
    tags.push('artist'); // default for persons without explicit roles
  }
  return [...new Set(tags)];
}

// --- Band tagging: genre by known associations ---
const bandGenreMap = {
  'rock': ['AC/DC', 'Iron Maiden', 'Metallica', 'Scorpions', 'The Rolling Stones',
           'The Cranberries', 'The Pretenders', 'The Verve', 'U2', 'Rage Against The Machine',
           'Midnight Oil', 'INXS', 'Nick Cave & The Bad Seeds', 'Patti Smith Group',
           'Blue Effect', 'Katapult', 'Marsyas', 'The Doors', 'Velvet Underground',
           'Animals', 'Eagles', 'Film', 'Greenhorns'],
  'pop': ['Modern Talking', 'Alphaville', 'All Saints', 'TLC', 'Depeche Mode',
          'Eurythmics', 'Fools Garden', 'Smokie'],
  'electronic': ['Depeche Mode', 'Prodigy', 'Enigma'],
  'folk': ['Simon & Garfunkel', 'Spiritual kvintet', 'Greenhorns',
           'Jan Kalousek & ZOO', 'Jiri Suchy & Jiri Slitr'],
  'punk': ['Rage Against The Machine', 'Tri sestry'],
  'metal': ['Iron Maiden', 'Metallica'],
  'soul': ['Righteous Brothers'],
  'world': ['Elan', 'Puding Pani Elvisovej'],
};

function tagBand(band) {
  const tags = [];
  const name = band.name;
  for (const [genre, bands] of Object.entries(bandGenreMap)) {
    if (bands.some(b => b === name)) {
      tags.push(genre);
    }
  }
  if (tags.length === 0) tags.push('rock'); // default
  return [...new Set(tags)];
}

// --- Movie tagging: based on known movie themes ---
function tagMovie(movie) {
  const tags = [];
  const name = (movie.name || '').toLowerCase();

  // Genre from known movies
  if (name.includes('top gun')) tags.push('soundtrack');
  if (name.includes('moulin rouge')) tags.push('soundtrack');
  if (name.includes('dirty dancing')) tags.push('soundtrack');
  if (name.includes('grease')) tags.push('soundtrack');
  if (name.includes('saturday night fever')) tags.push('soundtrack');

  // Content by theme
  if (name.includes('inception') || name.includes('matrix') || name.includes('interstellar')) {
    tags.push('entertainment');
  }

  // Default: entertainment for all movies
  if (!tags.includes('entertainment')) tags.push('entertainment');

  return [...new Set(tags)];
}

// --- Recording tagging: genre from performer type ---
function tagRecording(recording, performerLinks, bandGenres) {
  const tags = [];

  // Find performers for this recording
  const links = performerLinks.filter(l =>
    l.recordingId === recording.id && l.entityType === 'recording_performer'
  );

  for (const link of links) {
    if (link.performerType === 'band') {
      // Get band's genre tags
      const genres = bandGenres[link.performerName] || bandGenres[link.performerId];
      if (genres) tags.push(...genres);
    }
  }

  // Check recording name for genre hints
  const name = (recording.name || '').toLowerCase();
  if (name.includes('blues')) tags.push('blues');
  if (name.includes('jazz')) tags.push('jazz');

  if (tags.length === 0) tags.push('rock'); // default for this collection

  return [...new Set(tags)];
}

async function main() {
  console.log('=== Bulk Tag All Entities ===\n');

  // --- Persons ---
  const persons = await scanAll('person');
  const untaggedPersons = persons.filter(p => !p.tags || p.tags.length === 0);
  console.log(`Persons: ${persons.length} total, ${untaggedPersons.length} untagged`);
  for (const person of untaggedPersons) {
    const tags = tagPerson(person);
    await applyTags(person.id, 'person', tags);
  }
  console.log(`  Tagged ${untaggedPersons.length} persons\n`);

  // --- Bands ---
  const bands = await scanAll('band');
  const untaggedBands = bands.filter(b => !b.tags || b.tags.length === 0);
  console.log(`Bands: ${bands.length} total, ${untaggedBands.length} untagged`);
  const bandGenres = {}; // name → genres for recording lookup
  for (const band of bands) {
    const tags = band.tags && band.tags.length > 0 ? band.tags : tagBand(band);
    bandGenres[band.name] = tags;
    bandGenres[band.id] = tags;
    if (!band.tags || band.tags.length === 0) {
      await applyTags(band.id, 'band', tags);
    }
  }
  console.log(`  Tagged ${untaggedBands.length} bands\n`);

  // --- Movies ---
  const movies = await scanAll('movie');
  const untaggedMovies = movies.filter(m => !m.tags || m.tags.length === 0);
  console.log(`Movies: ${movies.length} total, ${untaggedMovies.length} untagged`);
  for (const movie of untaggedMovies) {
    const tags = tagMovie(movie);
    await applyTags(movie.id, 'movie', tags);
  }
  console.log(`  Tagged ${untaggedMovies.length} movies\n`);

  // --- Recordings ---
  const recordings = await scanAll('recording');
  const performerLinks = await scanAll('recording_performer');
  const untaggedRecordings = recordings.filter(r => !r.tags || r.tags.length === 0);
  console.log(`Recordings: ${recordings.length} total, ${untaggedRecordings.length} untagged`);
  for (const recording of untaggedRecordings) {
    const tags = tagRecording(recording, performerLinks, bandGenres);
    await applyTags(recording.id, 'recording', tags);
  }
  console.log(`  Tagged ${untaggedRecordings.length} recordings\n`);

  // Summary
  const total = untaggedPersons.length + untaggedBands.length + untaggedMovies.length + untaggedRecordings.length;
  console.log(`=== Done: ${total} items tagged ===`);
}

main().catch(console.error);
