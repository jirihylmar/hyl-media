import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';

const REGION = process.env.AWS_REGION || 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_S3 = process.argv.includes('--skip-s3');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const TABLE = args[0];
const BUCKET = args[1];
const INPUT_DIR = args[2] || 'input/music-read';

if (!TABLE || (!DRY_RUN && !SKIP_S3 && !BUCKET)) {
  console.error('Usage: node scripts/import-sheet-music.mjs <TABLE> <BUCKET> [INPUT_DIR] [--dry-run] [--skip-s3]');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function makeId(name) {
  const slug = slugify(name).slice(0, 40);
  const hash = createHash('md5').update(name).digest('hex').slice(0, 4);
  return `${slug}_${hash}`;
}

function parseFilename(filename) {
  const ext = extname(filename);
  const base = filename.slice(0, -ext.length);
  const format = ext.replace('.', '').toLowerCase();

  // Try "Artist - Song" pattern
  const dashMatch = base.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    return { artist: dashMatch[1].trim(), title: dashMatch[2].trim(), format };
  }

  // Fallback: title only
  return { artist: null, title: base.trim(), format };
}

function detectLanguage(text) {
  if (/[čďěňřšťůžáéíóúý]/i.test(text)) return 'cs';
  return 'en';
}

// Find matching performer in existing knowledge graph
async function findPerformer(artistName) {
  // Search by name in byType GSI for bands, persons, artists
  for (const entityType of ['band', 'person', 'artist']) {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'byType',
      KeyConditionExpression: 'entityType = :et AND #n = :name',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':et': entityType, ':name': artistName },
    }));
    if (result.Items?.length > 0) {
      return result.Items[0];
    }
  }
  return null;
}

async function run() {
  const files = readdirSync(INPUT_DIR).filter(f => !f.startsWith('.'));
  console.log(`Found ${files.length} files in ${INPUT_DIR}`);

  const items = [];
  const crossRefs = [];

  for (const filename of files) {
    const { artist, title, format } = parseFilename(filename);
    const fullTitle = artist ? `${artist} - ${title}` : title;
    const language = detectLanguage(fullTitle);
    const s3Key = `sheet-music/${filename}`;
    const id = makeId(fullTitle);

    items.push({
      __typename: 'KnowledgeGraphItem',
      id,
      entityType: 'sheet_music',
      name: title,
      artistName: artist,
      format,
      language,
      s3Key,
      _filename: filename,
      _artist: artist,
    });
  }

  console.log(`Parsed ${items.length} sheet music files`);
  console.log(`With artist: ${items.filter(i => i._artist).length}`);
  console.log(`Without artist: ${items.filter(i => !i._artist).length}`);

  // Find cross-references
  if (!DRY_RUN) {
    console.log('\nLooking up cross-references to existing artists...');
    const artistNames = [...new Set(items.filter(i => i._artist).map(i => i._artist))];
    let matched = 0;
    for (const name of artistNames) {
      const performer = await findPerformer(name);
      if (performer) {
        matched++;
        // Create cross-ref entries for all sheet music by this artist
        for (const item of items.filter(i => i._artist === name)) {
          crossRefs.push({
            __typename: 'KnowledgeGraphItem',
            id: `${item.id}___performer___${performer.id}`,
            entityType: 'sheet_music_performer',
            sheetMusicId: item.id,
            name: item.name,
            performerId: performer.id,
            performerName: performer.name,
            performerType: performer.entityType,
          });
        }
      }
    }
    console.log(`  ${matched}/${artistNames.length} artists matched, ${crossRefs.length} cross-references`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no items written.');
    for (const item of items.slice(0, 5)) {
      console.log(`  ${item.id} | ${item._artist || '(none)'} | ${item.name} | ${item.format}`);
    }
    return;
  }

  // Upload to S3
  if (!SKIP_S3) {
    console.log('\nUploading files to S3...');
    let uploaded = 0;
    for (const item of items) {
      const filePath = join(INPUT_DIR, item._filename);
      const body = readFileSync(filePath);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: item.s3Key,
        Body: body,
        ContentType: 'application/pdf',
      }));
      uploaded++;
      if (uploaded % 25 === 0 || uploaded === items.length) {
        console.log(`  ${uploaded}/${items.length} files uploaded`);
      }
    }
  }

  // Write sheet_music items + cross-references to DynamoDB
  const allItems = [
    ...items.map(({ _filename, _artist, ...rest }) => rest),
    ...crossRefs,
  ];

  console.log(`\nWriting ${allItems.length} items to DynamoDB (${items.length} sheet music + ${crossRefs.length} cross-refs)...`);
  let written = 0;
  for (let i = 0; i < allItems.length; i += 25) {
    const batch = allItems.slice(i, i + 25).map(item => ({
      PutRequest: { Item: item },
    }));
    const result = await ddb.send(new BatchWriteCommand({
      RequestItems: { [TABLE]: batch },
    }));
    const unprocessed = result.UnprocessedItems?.[TABLE];
    if (unprocessed?.length) {
      await new Promise(r => setTimeout(r, 1000));
      await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: unprocessed } }));
    }
    written += batch.length;
    if (written % 50 === 0 || written === allItems.length) {
      console.log(`  ${written}/${allItems.length} items written`);
    }
  }

  console.log(`Done. ${items.length} sheet music + ${crossRefs.length} cross-references in DynamoDB.`);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
