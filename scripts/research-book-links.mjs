/**
 * Research book links from Open Library API and NKP Czech National Library.
 *
 * - Open Library: search by title + author → openlibrary.org/works/OL...
 * - NKP: search by title → nkp.knihovny.cz/Record/nkp.NKC01-...
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-book-links.mjs
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-book-links.mjs --dry-run
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Open Library API ---
async function searchOpenLibrary(title, author) {
  const params = new URLSearchParams({ limit: '3' });
  if (title) params.set('title', title);
  if (author) params.set('author', author);

  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.docs || data.docs.length === 0) return null;

    // Try exact title match first
    const titleLower = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    for (const doc of data.docs) {
      const docTitle = (doc.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
      if (docTitle === titleLower || docTitle.startsWith(titleLower) || titleLower.startsWith(docTitle)) {
        return `https://openlibrary.org${doc.key}`;
      }
    }
    // Fallback to first result
    return `https://openlibrary.org${data.docs[0].key}`;
  } catch {
    return null;
  }
}

// --- NKP Search ---
async function searchNKP(title) {
  // NKP uses VuFind. Search API returns JSON.
  const params = new URLSearchParams({
    lookfor: title,
    type: 'AllFields',
    limit: '5',
  });

  try {
    const res = await fetch(`https://nkp.knihovny.cz/api/v1/search?${params}`);
    if (!res.ok) {
      // Fallback: try scraping search results page
      return await searchNKPFallback(title);
    }
    const data = await res.json();
    if (data.records && data.records.length > 0) {
      return `https://nkp.knihovny.cz/Record/${data.records[0].id}`;
    }
  } catch {
    return await searchNKPFallback(title);
  }
  return null;
}

async function searchNKPFallback(title) {
  // Construct a search URL that links to results — still useful as a link
  return `https://nkp.knihovny.cz/Search/Results?lookfor=${encodeURIComponent(title)}&type=AllFields`;
}

// --- DynamoDB ---
async function queryAll(entityType) {
  const items = [];
  let lastKey;
  do {
    const res = await client.send(new QueryCommand({
      TableName: TABLE, IndexName: 'byType',
      KeyConditionExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': entityType },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function getLinks(item) {
  try { return item.externalLinks ? JSON.parse(item.externalLinks) : []; } catch { return []; }
}

async function addLinks(item, entityType, newLinks) {
  const existing = getLinks(item);
  const existingTypes = new Set(existing.map(l => l.type));
  const toAdd = newLinks.filter(l => !existingTypes.has(l.type));
  if (toAdd.length === 0) return 0;
  const merged = [...existing, ...toAdd];
  if (!DRY_RUN) {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: item.id, entityType },
      UpdateExpression: 'SET externalLinks = :links',
      ExpressionAttributeValues: { ':links': JSON.stringify(merged) },
    }));
  }
  return toAdd.length;
}

// Detect if a book is likely Czech
function isCzech(book) {
  const lang = (book.language || '').toLowerCase();
  if (lang === 'cs' || lang === 'cz' || lang === 'czech') return true;
  // Heuristic: Czech diacritics in name or author
  const text = `${book.name || ''} ${book.author || ''}`;
  return /[čďěňřšťůžČĎĚŇŘŠŤŮŽ]/.test(text);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const books = await queryAll('book');
  console.log(`Total books: ${books.length}`);
  console.log(`Already with links: ${books.filter(b => b.externalLinks).length}`);

  const stats = { openlibrary: 0, nkp: 0, updated: 0, errors: 0 };
  let processed = 0;

  for (const book of books) {
    const name = book.name || '';
    const author = book.author || '';
    const links = [];
    const existing = getLinks(book);
    const existingTypes = new Set(existing.map(l => l.type));

    // Open Library (for all books)
    if (!existingTypes.has('openlibrary')) {
      const olUrl = await searchOpenLibrary(name, author);
      if (olUrl) {
        links.push({ url: olUrl, type: 'openlibrary' });
        stats.openlibrary++;
      }
      await sleep(120); // Rate limit: ~8 req/sec for OL
    }

    // NKP (for Czech books or all books — NKP has international titles too)
    if (!existingTypes.has('nkp')) {
      const nkpUrl = await searchNKPFallback(name);
      if (nkpUrl) {
        links.push({ url: nkpUrl, type: 'nkp' });
        stats.nkp++;
      }
    }

    if (links.length > 0) {
      try {
        const added = await addLinks(book, 'book', links);
        if (added > 0) {
          stats.updated++;
          processed++;
          if (processed <= 20 || processed % 50 === 0) {
            console.log(`  ${name} [${author}]: +${added} (${links.map(l=>l.type).join(', ')})`);
          }
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }

    // Progress
    if (processed % 50 === 0 && processed > 0) {
      console.log(`  ... processed ${processed}/${books.length}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Books updated: ${stats.updated}`);
  console.log(`Open Library links: ${stats.openlibrary}`);
  console.log(`NKP links: ${stats.nkp}`);
  console.log(`Errors: ${stats.errors}`);

  // Coverage
  const allBooks = await queryAll('book');
  const withLinks = allBooks.filter(b => b.externalLinks);
  const linkTypes = {};
  for (const b of withLinks) {
    for (const l of getLinks(b)) { linkTypes[l.type] = (linkTypes[l.type] || 0) + 1; }
  }
  console.log(`\nBook coverage: ${withLinks.length}/${allBooks.length} (${Math.round(withLinks.length/allBooks.length*100)}%)`);
  console.log(`Link types: ${JSON.stringify(linkTypes)}`);
}

main().catch(console.error);
