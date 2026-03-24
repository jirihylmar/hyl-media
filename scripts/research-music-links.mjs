/**
 * Research links for recordings and sheet music.
 *
 * - MusicBrainz: search by title + artist → musicbrainz.org/recording/{id}
 * - Supermusic.cz: search link → supermusic.cz/najdi.php?hladane={query}
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-music-links.mjs
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-music-links.mjs --dry-run
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

// --- MusicBrainz API ---
// Rate limit: 1 req/sec with User-Agent
const MB_HEADERS = { 'User-Agent': 'HylMedia/1.0 (jiri.hylmar@gmail.com)' };

async function searchMusicBrainz(title, artist) {
  // Clean up title for search
  let cleanTitle = title
    .replace(/\s*\(.*?\)\s*/g, ' ')  // Remove parentheticals
    .replace(/\s*(Chords|chords|tabs|akordy|text|Acoustic|Live.*$)/gi, '')
    .replace(/\s*(ft\.|feat\.).*$/i, '')
    .replace(/\s*(2|3|\(\d+\))$/g, '') // Remove trailing numbers like (2)
    .replace(/\s*-\s*$/, '')
    .trim();

  if (!cleanTitle || cleanTitle.length < 2) return null;

  let query = `recording:"${cleanTitle}"`;
  if (artist && artist !== '?' && !artist.includes('Koledy')) {
    // Clean artist name
    const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, '').trim();
    query += ` AND artist:"${cleanArtist}"`;
  }

  try {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
    const res = await fetch(url, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.recordings || data.recordings.length === 0) return null;

    // Find best match — score > 80
    const best = data.recordings.find(r => r.score >= 80);
    if (best) {
      return `https://musicbrainz.org/recording/${best.id}`;
    }
    // Fallback to first result if score > 50
    if (data.recordings[0].score >= 50) {
      return `https://musicbrainz.org/recording/${data.recordings[0].id}`;
    }
  } catch {}
  return null;
}

// --- Supermusic.cz search link ---
function supermusicSearchUrl(title, artist) {
  let query = title
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*(Chords|chords|tabs|akordy a text|akordy|text)/gi, '')
    .replace(/\s*(ft\.|feat\.).*$/i, '')
    .replace(/\s*-\s*$/, '')
    .replace(/\s*(2|3|\(\d+\))$/g, '')
    .trim();

  if (artist && artist !== '?' && !artist.includes('Koledy')) {
    query += ' ' + artist;
  }

  return `https://supermusic.cz/najdi.php?hladane=${encodeURIComponent(query)}`;
}

// --- DynamoDB ---
async function queryAll(entityType) {
  const items = []; let lastKey;
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

// We need to resolve performer names for recordings
// Load cross-refs to find performer for each recording
async function buildRecordingPerformerMap() {
  const crossRefs = await queryAll('recording_performer');
  const map = {};
  for (const cr of crossRefs) {
    if (cr.recordingId && cr.performerName) {
      map[cr.recordingId] = cr.performerName;
    }
  }
  return map;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const stats = { musicbrainz: 0, supermusic: 0, updated: 0, errors: 0 };
  const performerMap = await buildRecordingPerformerMap();

  // ===================== RECORDINGS =====================
  console.log('\n=== RECORDINGS ===');
  const recordings = await queryAll('recording');
  console.log(`Total: ${recordings.length}, with links: ${recordings.filter(r=>r.externalLinks).length}`);

  for (const rec of recordings) {
    const name = rec.name || '';
    if (name.includes('Artist Note')) continue;

    const artist = performerMap[rec.id] || '';
    const existing = getLinks(rec);
    const existingTypes = new Set(existing.map(l => l.type));
    const links = [];

    // MusicBrainz
    if (!existingTypes.has('musicbrainz')) {
      const mbUrl = await searchMusicBrainz(name, artist);
      if (mbUrl) {
        links.push({ url: mbUrl, type: 'musicbrainz' });
        stats.musicbrainz++;
      }
      await sleep(1100); // MusicBrainz requires 1 req/sec
    }

    // Supermusic.cz
    if (!existingTypes.has('supermusic')) {
      const smUrl = supermusicSearchUrl(name, artist);
      links.push({ url: smUrl, type: 'supermusic' });
      stats.supermusic++;
    }

    if (links.length > 0) {
      try {
        const added = await addLinks(rec, 'recording', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name} [${artist}]: +${added} (${links.map(l=>l.type).join(', ')})`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ===================== SHEET MUSIC =====================
  console.log('\n=== SHEET MUSIC ===');
  const sheets = await queryAll('sheet_music');
  console.log(`Total: ${sheets.length}, with links: ${sheets.filter(s=>s.externalLinks).length}`);

  for (const sheet of sheets) {
    const name = sheet.name || '';
    const artist = sheet.artistName || '';
    const existing = getLinks(sheet);
    const existingTypes = new Set(existing.map(l => l.type));
    const links = [];

    // MusicBrainz
    if (!existingTypes.has('musicbrainz')) {
      const mbUrl = await searchMusicBrainz(name, artist);
      if (mbUrl) {
        links.push({ url: mbUrl, type: 'musicbrainz' });
        stats.musicbrainz++;
      }
      await sleep(1100);
    }

    // Supermusic.cz
    if (!existingTypes.has('supermusic')) {
      const smUrl = supermusicSearchUrl(name, artist);
      links.push({ url: smUrl, type: 'supermusic' });
      stats.supermusic++;
    }

    if (links.length > 0) {
      try {
        const added = await addLinks(sheet, 'sheet_music', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name} [${artist}]: +${added} (${links.map(l=>l.type).join(', ')})`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ===================== SUMMARY =====================
  console.log('\n=== SUMMARY ===');
  console.log(`Updated: ${stats.updated}`);
  console.log(`MusicBrainz: ${stats.musicbrainz}`);
  console.log(`Supermusic: ${stats.supermusic}`);
  console.log(`Errors: ${stats.errors}`);

  // Coverage
  console.log('\n=== FINAL COVERAGE ===');
  for (const type of ['recording', 'sheet_music']) {
    const items = await queryAll(type);
    const withLinks = items.filter(i => i.externalLinks);
    const lt = {};
    for (const i of withLinks) { for (const l of getLinks(i)) lt[l.type] = (lt[l.type]||0)+1; }
    console.log(`  ${type}: ${withLinks.length}/${items.length} (${Math.round(withLinks.length/items.length*100)}%) — ${JSON.stringify(lt)}`);
  }
}

main().catch(console.error);
