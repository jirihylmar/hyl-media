/**
 * Migration: Merge artist entity type into person
 *
 * 1. Create person items for each artist (same ID, entityType='person', roles=['artist'])
 * 2. Update recording_performer items: performerType 'artist' → 'person'
 * 3. Delete old artist entity items
 *
 * Usage:
 *   node scripts/migrate-artist-to-person.mjs
 *
 * Requires: AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = 'eu-central-1';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

// The 3 artists to migrate
const artists = [
  { id: 'pink_fgym', name: 'P!nk', language: 'en' },
  { id: 'staydario-g_d0uu', name: 'Dario G', language: 'en' },
  { id: 'winehouse_5q78', name: 'Amy Winehouse', language: 'en' },
];

async function migrate() {
  console.log('=== Artist → Person Migration ===\n');

  // Step 1: Create person items
  console.log('Step 1: Creating person items...');
  for (const artist of artists) {
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        id: artist.id,
        entityType: 'person',
        __typename: 'KnowledgeGraphItem',
        name: artist.name,
        language: artist.language,
        roles: ['artist'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'migration-artist-to-person',
      },
    }));
    console.log(`  ✓ Created person: ${artist.name} (${artist.id})`);
  }

  // Step 2: Find and update recording_performer items with performerType='artist'
  console.log('\nStep 2: Updating recording_performer items...');
  const scan = await client.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'performerType = :pt',
    ExpressionAttributeValues: { ':pt': 'artist' },
  }));

  for (const item of scan.Items || []) {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: item.id, entityType: item.entityType },
      UpdateExpression: 'SET performerType = :pt',
      ExpressionAttributeValues: { ':pt': 'person' },
    }));
    console.log(`  ✓ Updated: ${item.id} → performerType=person`);
  }

  // Also check sheet_music_performer items
  const scanSM = await client.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'entityType = :et AND performerType = :pt',
    ExpressionAttributeValues: { ':et': 'sheet_music_performer', ':pt': 'artist' },
  }));

  for (const item of scanSM.Items || []) {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: item.id, entityType: item.entityType },
      UpdateExpression: 'SET performerType = :pt',
      ExpressionAttributeValues: { ':pt': 'person' },
    }));
    console.log(`  ✓ Updated sheet_music: ${item.id} → performerType=person`);
  }

  // Step 3: Delete old artist items
  console.log('\nStep 3: Deleting old artist items...');
  for (const artist of artists) {
    await client.send(new DeleteCommand({
      TableName: TABLE,
      Key: { id: artist.id, entityType: 'artist' },
    }));
    console.log(`  ✓ Deleted artist: ${artist.name} (${artist.id})`);
  }

  // Step 4: Verify
  console.log('\nStep 4: Verification...');
  const verifyArtists = await client.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'entityType = :et',
    ExpressionAttributeValues: { ':et': 'artist' },
  }));
  console.log(`  Artists remaining: ${verifyArtists.Items?.length || 0} (expected: 0)`);

  const verifyPerformers = await client.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'performerType = :pt',
    ExpressionAttributeValues: { ':pt': 'artist' },
  }));
  console.log(`  performer_type=artist remaining: ${verifyPerformers.Items?.length || 0} (expected: 0)`);

  console.log('\n=== Migration complete ===');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
