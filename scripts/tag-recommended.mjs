/**
 * Tag a curated selection of items as "recommended" across all entity types.
 * Adds 'recommended' to existing tags without removing any.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/tag-recommended.mjs [--dry-run]
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
const DRY_RUN = process.argv.includes('--dry-run');

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

async function addTag(item, tag) {
  const existing = item.tags || [];
  if (existing.includes(tag)) return false;
  const newTags = [...existing, tag];
  if (!DRY_RUN) {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: item.id, entityType: item.entityType },
      UpdateExpression: 'SET tags = :t, updatedAt = :u, updatedBy = :b',
      ExpressionAttributeValues: {
        ':t': newTags,
        ':u': new Date().toISOString(),
        ':b': 'tag-recommended-script',
      },
    }));
  }
  return true;
}

// Curated recommendations — personal picks across all entity types
// These are well-known, high-quality items that represent the best of each category

const RECOMMENDED_MOVIES = [
  'The Shawshank Redemption', 'Pulp Fiction', 'Forrest Gump',
  'The Matrix', '12 Angry Men', 'Fight Club',
  'Schindler\'s List', 'Inception', 'The Godfather',
  'Goodfellas', 'Se7en', 'The Usual Suspects',
  'Léon: The Professional', 'Amélie', 'Trainspotting',
  'One Flew Over the Cuckoo\'s Nest', 'A Clockwork Orange',
  'Dead Poets Society', 'The Silence of the Lambs',
  'American Beauty',
];

const RECOMMENDED_BANDS = [
  'The Doors', 'Pink Floyd', 'AC/DC', 'Metallica',
  'Depeche Mode', 'U2', 'Scorpions', 'The Rolling Stones',
  'Simon & Garfunkel', 'Eagles', 'Nick Cave & The Bad Seeds',
  'Velvet Underground', 'The Cranberries',
];

const RECOMMENDED_RECORDINGS = [
  'Sound of Silence', 'Hotel California', 'Wish You Were Here',
  'Riders on the Storm', 'Nothing Else Matters', 'Personal Jesus',
  'Zombie', 'Bitter Sweet Symphony', 'Under the Bridge',
  'Enjoy the Silence', 'Where the Streets Have No Name',
  'Wind of Change', 'Into My Arms', 'Hurt',
  'Hallelujah', 'Bohemian Rhapsody',
];

const RECOMMENDED_PERSONS = [
  'Morgan Freeman', 'Robert De Niro', 'Al Pacino',
  'Anthony Hopkins', 'Jack Nicholson', 'Jodie Foster',
  'Quentin Tarantino', 'Martin Scorsese', 'Stanley Kubrick',
  'David Fincher', 'Ridley Scott', 'Steven Spielberg',
  'Tim Robbins', 'Samuel L. Jackson', 'Brad Pitt',
  'Kevin Spacey', 'Edward Norton', 'Uma Thurman',
];

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function nameMatches(itemName, targetName) {
  return normalize(itemName) === normalize(targetName) ||
         normalize(itemName).includes(normalize(targetName)) ||
         normalize(targetName).includes(normalize(itemName));
}

async function main() {
  console.log(`=== Tag Recommended Items ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  let totalTagged = 0;

  // Movies
  const movies = await scanAll('movie');
  let movieCount = 0;
  for (const movie of movies) {
    if (RECOMMENDED_MOVIES.some(name => nameMatches(movie.name, name))) {
      if (await addTag(movie, 'recommended')) {
        console.log(`  [movie] ${movie.name}`);
        movieCount++;
      }
    }
  }
  console.log(`Movies: ${movieCount} tagged recommended\n`);
  totalTagged += movieCount;

  // Bands
  const bands = await scanAll('band');
  let bandCount = 0;
  for (const band of bands) {
    if (RECOMMENDED_BANDS.some(name => nameMatches(band.name, name))) {
      if (await addTag(band, 'recommended')) {
        console.log(`  [band] ${band.name}`);
        bandCount++;
      }
    }
  }
  console.log(`Bands: ${bandCount} tagged recommended\n`);
  totalTagged += bandCount;

  // Recordings
  const recordings = await scanAll('recording');
  let recCount = 0;
  for (const rec of recordings) {
    if (RECOMMENDED_RECORDINGS.some(name => nameMatches(rec.name, name))) {
      if (await addTag(rec, 'recommended')) {
        console.log(`  [recording] ${rec.name}`);
        recCount++;
      }
    }
  }
  console.log(`Recordings: ${recCount} tagged recommended\n`);
  totalTagged += recCount;

  // Persons
  const persons = await scanAll('person');
  let personCount = 0;
  for (const person of persons) {
    if (RECOMMENDED_PERSONS.some(name => nameMatches(person.name, name))) {
      if (await addTag(person, 'recommended')) {
        console.log(`  [person] ${person.name}`);
        personCount++;
      }
    }
  }
  console.log(`Persons: ${personCount} tagged recommended\n`);
  totalTagged += personCount;

  console.log(`=== Done: ${totalTagged} items tagged recommended ===${DRY_RUN ? ' (DRY RUN — no changes written)' : ''}`);
}

main().catch(console.error);
