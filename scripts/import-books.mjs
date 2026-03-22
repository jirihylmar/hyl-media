import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
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
const INPUT_DIR = args[2] || 'input/library';

if (!TABLE || (!DRY_RUN && !SKIP_S3 && !BUCKET)) {
  console.error('Usage: node scripts/import-books.mjs <TABLE> <BUCKET> [INPUT_DIR] [--dry-run] [--skip-s3]');
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

function makeId(name, extra = '') {
  const input = name + extra;
  const slug = slugify(name).slice(0, 40);
  const hash = createHash('md5').update(input).digest('hex').slice(0, 4);
  return `${slug}_${hash}`;
}

function parseFilename(filename) {
  const ext = extname(filename);
  const base = filename.slice(0, -ext.length);
  const format = ext.replace('.', '').toLowerCase();

  // Try "Title by Author" pattern
  const byMatch = base.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { title: byMatch[1].trim(), author: byMatch[2].trim(), format };
  }

  // Fallback: title only
  return { title: base.trim(), author: null, format };
}

function detectLanguage(title) {
  // Czech characters/patterns
  if (/[čďěňřšťůžáéíóúý]/i.test(title) || /překlad|český|série/i.test(title)) {
    return 'cs';
  }
  return 'en';
}

async function run() {
  const files = readdirSync(INPUT_DIR).filter(f => !f.startsWith('.'));
  console.log(`Found ${files.length} files in ${INPUT_DIR}`);

  const items = [];
  for (const filename of files) {
    const { title, author, format } = parseFilename(filename);
    const language = detectLanguage(title + (author || ''));
    const s3Key = `library/${filename}`;
    const id = makeId(title, (author || '') + format);

    items.push({
      __typename: 'KnowledgeGraphItem',
      createdAt: new Date().toISOString(),
      id,
      entityType: 'book',
      name: title,
      author: author,
      format,
      language,
      s3Key,
      _filename: filename, // internal, not written to DynamoDB
    });
  }

  // Summary
  const langCounts = {};
  const fmtCounts = {};
  for (const item of items) {
    langCounts[item.language] = (langCounts[item.language] || 0) + 1;
    fmtCounts[item.format] = (fmtCounts[item.format] || 0) + 1;
  }
  console.log(`Parsed ${items.length} books`);
  console.log('Languages:', langCounts);
  console.log('Formats:', fmtCounts);
  console.log(`Books without author: ${items.filter(i => !i.author).length}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN — no items written.');
    // Show a few samples
    for (const item of items.slice(0, 5)) {
      console.log(`  ${item.id} | ${item.name} | ${item.author || '(none)'} | ${item.format} | ${item.language}`);
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
        ContentType: item.format === 'pdf' ? 'application/pdf' :
                     item.format === 'epub' ? 'application/epub+zip' :
                     'application/octet-stream',
      }));
      uploaded++;
      if (uploaded % 50 === 0 || uploaded === items.length) {
        console.log(`  ${uploaded}/${items.length} files uploaded`);
      }
    }
  }

  // Write to DynamoDB
  console.log('\nWriting metadata to DynamoDB...');
  let written = 0;
  const dbItems = items.map(({ _filename, ...rest }) => rest);

  // Deduplicate by composite key (id + entityType)
  const seen = new Set();
  const uniqueItems = [];
  for (const item of dbItems) {
    const key = `${item.id}#${item.entityType}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    } else {
      console.warn(`  Duplicate skipped: ${item.name}`);
    }
  }
  if (uniqueItems.length !== dbItems.length) {
    console.log(`  ${dbItems.length - uniqueItems.length} duplicates removed`);
  }

  for (let i = 0; i < uniqueItems.length; i += 25) {
    const batch = uniqueItems.slice(i, i + 25).map(item => ({
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
    if (written % 100 === 0 || written === uniqueItems.length) {
      console.log(`  ${written}/${uniqueItems.length} items written`);
    }
  }

  console.log(`Done. ${written} book items in DynamoDB.`);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
