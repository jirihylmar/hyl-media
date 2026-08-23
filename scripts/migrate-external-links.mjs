/**
 * Migrate external links from fixed fields (wikiUrl, imdbUrl, spotifyUrl, youtubeUrl)
 * to flexible externalLinks JSON array of {url, type}.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/migrate-external-links.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = 'eu-central-1';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

const FIELD_MAP = {
  wikiUrl: 'wikipedia',
  imdbUrl: 'imdb',
  spotifyUrl: 'spotify',
  youtubeUrl: 'youtube',
};

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const res = await client.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function migrate() {
  const items = await scanAll();
  console.log(`Scanned ${items.length} items`);

  // Find items that have any old URL field
  const toMigrate = items.filter(item =>
    item.wikiUrl || item.imdbUrl || item.spotifyUrl || item.youtubeUrl
  );

  console.log(`Found ${toMigrate.length} items with old URL fields to migrate`);

  // Also check items that already have externalLinks (shouldn't exist yet, but be safe)
  const alreadyMigrated = items.filter(item => item.externalLinks);
  console.log(`Items already with externalLinks: ${alreadyMigrated.length}`);

  let migrated = 0;
  let errors = 0;

  for (const item of toMigrate) {
    const links = [];

    for (const [field, type] of Object.entries(FIELD_MAP)) {
      if (item[field]) {
        links.push({ url: item[field], type });
      }
    }

    if (links.length === 0) continue;

    // If item already has externalLinks, merge (don't duplicate)
    let existing = [];
    if (item.externalLinks) {
      try { existing = JSON.parse(item.externalLinks); } catch {}
    }

    const existingTypes = new Set(existing.map(l => l.type));
    const merged = [...existing, ...links.filter(l => !existingTypes.has(l.type))];

    try {
      await client.send(new UpdateCommand({
        TableName: TABLE,
        Key: { id: item.id, entityType: item.entityType },
        UpdateExpression: 'SET externalLinks = :links REMOVE wikiUrl, imdbUrl, spotifyUrl, youtubeUrl',
        ExpressionAttributeValues: {
          ':links': JSON.stringify(merged),
        },
      }));
      migrated++;
      if (migrated % 20 === 0) console.log(`  migrated ${migrated}/${toMigrate.length}...`);
    } catch (e) {
      console.error(`Error migrating ${item.id} (${item.entityType}):`, e.message);
      errors++;
    }
  }

  console.log(`\nDone! Migrated: ${migrated}, Errors: ${errors}`);

  // Verify a few
  if (toMigrate.length > 0) {
    console.log('\nSample verification:');
    const sample = toMigrate.slice(0, 5);
    for (const item of sample) {
      const links = [];
      for (const [field, type] of Object.entries(FIELD_MAP)) {
        if (item[field]) links.push({ url: item[field], type });
      }
      console.log(`  ${item.entityType}/${item.id}: ${item.name || ''} → ${links.length} links (${links.map(l => l.type).join(', ')})`);
    }
  }
}

migrate().catch(console.error);
