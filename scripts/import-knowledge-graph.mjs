import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'fs';

const REGION = process.env.AWS_REGION || 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const TABLE = args[0];
const DATA_PATH = args[1] || 'input/dynamo_implementation/data/all_items.json';

if (!TABLE) {
  console.error('Usage: node scripts/import-knowledge-graph.mjs <TABLE_NAME> [DATA_PATH] [--dry-run]');
  process.exit(1);
}

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client);

// Map snake_case fields from JSON to camelCase for DynamoDB/Amplify
function mapItem(item) {
  const mapped = {
    __typename: 'KnowledgeGraphItem',
    id: item.id,
    entityType: item.entity_type,
  };
  if (item.name != null) mapped.name = item.name;
  if (item.language != null) mapped.language = item.language;
  if (item.given_name != null) mapped.givenName = item.given_name;
  if (item.family_name != null) mapped.familyName = item.family_name;
  if (item.roles != null) mapped.roles = item.roles;
  if (item.role != null) mapped.role = item.role;
  if (item.movie_id != null) mapped.movieId = item.movie_id;
  if (item.movie_name != null) mapped.movieName = item.movie_name;
  if (item.person_id != null) mapped.personId = item.person_id;
  if (item.person_name != null) mapped.personName = item.person_name;
  if (item.recording_id != null) mapped.recordingId = item.recording_id;
  if (item.recording_name != null) mapped.recordingName = item.recording_name;
  if (item.performer_id != null) mapped.performerId = item.performer_id;
  if (item.performer_name != null) mapped.performerName = item.performer_name;
  if (item.performer_type != null) mapped.performerType = item.performer_type;
  return mapped;
}

async function upload() {
  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  console.log(`Loaded ${raw.length} items from ${DATA_PATH}`);

  // Count by entity_type
  const counts = {};
  for (const item of raw) {
    counts[item.entity_type] = (counts[item.entity_type] || 0) + 1;
  }
  console.log('Counts by entity_type:', counts);

  if (DRY_RUN) {
    console.log('DRY RUN — no items written.');
    return;
  }

  const items = raw.map(mapItem);
  let written = 0;

  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map(item => ({
      PutRequest: { Item: item },
    }));

    const result = await ddb.send(new BatchWriteCommand({
      RequestItems: { [TABLE]: batch },
    }));

    // Handle unprocessed items
    const unprocessed = result.UnprocessedItems?.[TABLE];
    if (unprocessed && unprocessed.length > 0) {
      console.warn(`  ${unprocessed.length} unprocessed items in batch ${Math.floor(i / 25) + 1}, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
      await ddb.send(new BatchWriteCommand({
        RequestItems: { [TABLE]: unprocessed },
      }));
    }

    written += batch.length;
    if (written % 100 === 0 || written === items.length) {
      console.log(`  ${written}/${items.length} items written`);
    }
  }

  console.log(`Done. ${written} items written to ${TABLE}`);
}

upload().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
