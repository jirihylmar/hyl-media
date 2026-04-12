/**
 * Enrich knowledge graph: Movies ↔ Recordings via LLM knowledge.
 * - Creates missing recording entities for iconic movie songs
 * - Creates missing movie entities for recordings referencing films
 * - Creates recording_movie cross-references
 * - Tags new entities as 'recommended'
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/enrich-movie-recordings.mjs [--dry-run] [--audit-only]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = process.env.AWS_REGION || 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');
const AUDIT_ONLY = process.argv.includes('--audit-only');

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
      updatedAt: new Date().toISOString(),
      updatedBy: 'enrich-movie-recordings',
    },
  }));
}

async function addTag(id, entityType, currentTags, newTag) {
  if (currentTags.includes(newTag)) return false;
  const updated = [...currentTags, newTag];
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would add tag '${newTag}' to ${entityType} ${id}`);
    return true;
  }
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET tags = :tags, updatedAt = :now',
    ExpressionAttributeValues: {
      ':tags': updated,
      ':now': new Date().toISOString(),
    },
  }));
  return true;
}

// ============================================================================
// LLM KNOWLEDGE: Movie ↔ Recording connections
// ============================================================================
// Each entry: { movie, recording, artist, notes }
// - If movie or recording doesn't exist in DB, it will be created
// - All new entities get tagged 'recommended'
//
// Sources: Claude's knowledge of iconic movie soundtracks and songs
// ============================================================================

const MOVIE_RECORDING_LINKS = [
  // --- Connections between EXISTING movies and EXISTING recordings ---

  // Dirty Dancing
  { movie: 'Dirty Dancing', recording: 'Hungry Eyes', artist: 'Eric Carmen', notes: 'iconic 80s movie song' },

  // Top Gun
  { movie: 'Top Gun', recording: 'Top Gun Opening Theme', artist: 'Harold Faltermeyer', notes: 'opening theme' },
  { movie: 'Top Gun', recording: 'Top Gun Anthem', artist: 'Harold Faltermeyer & Steve Stevens', notes: 'anthem' },
  { movie: 'Top Gun', recording: 'Top Gun (Soundtrack)', artist: 'Various', notes: 'soundtrack compilation' },

  // Pulp Fiction
  { movie: 'Pulp Fiction', recording: 'You Never Can Tell', artist: 'Chuck Berry', notes: 'Jack Rabbit Slims dance scene' },
  { movie: 'Pulp Fiction', recording: 'Pulp Fiction Dance Scene', artist: 'Various', notes: 'dance scene compilation' },
  { movie: 'Pulp Fiction', recording: 'Pulp Fiction Soundtrack', artist: 'Various', notes: 'soundtrack compilation' },

  // Ghost
  { movie: 'Ghost', recording: 'Unchained Melody', artist: 'The Righteous Brothers', notes: 'pottery scene, iconic love song' },

  // Moulin Rouge!
  { movie: 'Moulin Rouge!', recording: 'Children of the Revolution', artist: 'T. Rex', notes: 'covered in film' },
  { movie: 'Moulin Rouge!', recording: 'Moulin Rouge Children of the Revolution', artist: 'Various', notes: 'film version' },

  // The Beach
  { movie: 'The Beach', recording: 'Pure Shores', artist: 'All Saints', notes: 'main theme' },
  { movie: 'The Beach', recording: 'Snakeblood (The Beach)', artist: 'Orbital', notes: 'soundtrack' },
  { movie: 'The Beach', recording: 'Snakeblood', artist: 'Orbital', notes: 'original track on soundtrack' },

  // Interstellar
  { movie: 'Interstellar', recording: 'Stay (Interstellar)', artist: 'Hans Zimmer', notes: 'emotional climax theme' },

  // Against All Odds
  { movie: 'Against All Odds', recording: 'Against All Odds Take a Look At Me Now', artist: 'Phil Collins', notes: 'title song, #1 hit' },

  // Leon: The Professional
  { movie: 'Leon: The Professional', recording: 'Shape of My Heart', artist: 'Sting', notes: 'closing credits, defines the film' },

  // Philadelphia
  { movie: 'Philadelphia', recording: 'Streets of Philadelphia', artist: 'Bruce Springsteen', notes: 'Oscar-winning song' },

  // Trainspotting
  { movie: 'Trainspotting', recording: 'Lust For Life', artist: 'Iggy Pop', notes: 'opening scene, iconic' },

  // The Graduate
  { movie: 'The Graduate', recording: 'The Sound of Silence', artist: 'Simon & Garfunkel', notes: 'opening and closing, defining song' },

  // Romeo + Juliet
  { movie: 'Romeo + Juliet', recording: 'Heroes', artist: 'David Bowie', notes: 'covered by The Wallflowers for film' },

  // Once Upon a Time in the West
  { movie: 'Once Upon a Time in the West', recording: 'Jednoho dne se vrátiš (Tenkrát na západě)', artist: 'Karel Gott', notes: 'Czech version of Ennio Morricone theme' },

  // Vanilla Sky
  { movie: 'Vanilla Sky', recording: 'Wicked Game', artist: 'Chris Isaak', notes: 'featured in film' },

  // Saturday Night Fever
  { movie: 'Saturday Night Fever', recording: 'Heart of Glass', artist: 'Blondie', notes: 'disco era connection' },

  // --- NEW recordings to create for existing movies ---

  // Titanic
  { movie: 'Titanic', recording: 'My Heart Will Go On', artist: 'Celine Dion', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning, best-selling movie song of all time' },

  // Dirty Dancing — (I've Had) The Time of My Life
  { movie: 'Dirty Dancing', recording: '(I\'ve Had) The Time of My Life', artist: 'Bill Medley & Jennifer Warnes', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning, final dance scene' },

  // The Big Lebowski
  { movie: 'The Big Lebowski', recording: 'The Man in Me', artist: 'Bob Dylan', newRecording: true,
    recMeta: { language: 'en', tags: ['folk', 'rock', 'soundtrack', 'recommended'] }, notes: 'opening credits, dream sequence' },

  // Forrest Gump
  { movie: 'Forrest Gump', recording: 'Fortunate Son', artist: 'Creedence Clearwater Revival', newRecording: true,
    recMeta: { language: 'en', tags: ['rock', 'soundtrack', 'recommended'] }, notes: 'Vietnam sequence, iconic soundtrack moment' },

  // Working Girl
  { movie: 'Working Girl', recording: 'Let the River Run', artist: 'Carly Simon', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning theme song' },

  // Sister Act
  { movie: 'Sister Act', recording: 'I Will Follow Him', artist: 'Whoopi Goldberg & The Sisters', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soul', 'soundtrack', 'recommended'] }, notes: 'climactic performance' },

  // An Officer and a Gentleman
  { movie: 'An Officer and a Gentleman', recording: 'Up Where We Belong', artist: 'Joe Cocker & Jennifer Warnes', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning, final scene' },

  // Jerry Maguire
  { movie: 'Jerry Maguire', recording: 'Secret Garden', artist: 'Bruce Springsteen', notes: 'love theme — already exists as recording' },

  // Crazy Heart
  { movie: 'Crazy Heart', recording: 'The Weary Kind', artist: 'Ryan Bingham', newRecording: true,
    recMeta: { language: 'en', tags: ['country', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning theme' },

  // Dallas Buyers Club
  { movie: 'Dallas Buyers Club', recording: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics', notes: 'featured in film, recording exists' },

  // Grease
  { movie: 'Grease', recording: 'Summer Nights', artist: 'John Travolta & Olivia Newton-John', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'iconic musical number' },
  { movie: 'Grease', recording: 'You\'re the One That I Want', artist: 'John Travolta & Olivia Newton-John', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'closing number, massive hit' },

  // Inception
  { movie: 'Inception', recording: 'Time', artist: 'Hans Zimmer', notes: 'closing theme — check if existing "Time" recording matches' },

  // The Dark Knight
  { movie: 'The Dark Knight', recording: 'Why So Serious?', artist: 'Hans Zimmer', newRecording: true,
    recMeta: { language: 'en', tags: ['soundtrack', 'recommended'] }, notes: 'Joker theme' },

  // Kill Bill: Vol. 1
  { movie: 'Kill Bill: Vol. 1', recording: 'Wicked Game', artist: 'Chris Isaak', notes: 'featured in soundtrack' },

  // Django Unchained
  { movie: 'Django Unchained', recording: 'Freedom', artist: 'Anthony Hamilton & Elayna Boynton', newRecording: true,
    recMeta: { language: 'en', tags: ['soul', 'soundtrack', 'recommended'] }, notes: 'original song for film' },

  // True Romance
  { movie: 'True Romance', recording: 'You\'re So Cool', artist: 'Hans Zimmer', newRecording: true,
    recMeta: { language: 'en', tags: ['soundtrack', 'recommended'] }, notes: 'main theme, based on Gassenhauer' },

  // Slumdog Millionaire
  { movie: 'Slumdog Millionaire', recording: 'Jai Ho', artist: 'A.R. Rahman', newRecording: true,
    recMeta: { language: 'en', tags: ['world', 'soundtrack', 'recommended'] }, notes: 'Oscar-winning, worldwide hit' },

  // Les Misérables
  { movie: 'Les Misérables', recording: 'I Dreamed a Dream', artist: 'Anne Hathaway', newRecording: true,
    recMeta: { language: 'en', tags: ['soundtrack', 'recommended'] }, notes: 'show-stopping performance in 2012 film' },

  // Chicago
  { movie: 'Chicago', recording: 'All That Jazz', artist: 'Catherine Zeta-Jones', newRecording: true,
    recMeta: { language: 'en', tags: ['soundtrack', 'recommended'] }, notes: 'opening number' },

  // The Devil Wears Prada
  { movie: 'The Devil Wears Prada', recording: 'Suddenly I See', artist: 'KT Tunstall', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'rock', 'soundtrack', 'recommended'] }, notes: 'opening montage' },

  // Bridget Jones's Diary
  { movie: 'Bridget Jones\'s Diary', recording: 'All By Myself', artist: 'Jamie O\'Neal', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'opening scene, defines the character' },

  // V for Vendetta
  { movie: 'V for Vendetta', recording: 'Street Fighting Man', artist: 'The Rolling Stones', newRecording: true,
    recMeta: { language: 'en', tags: ['rock', 'soundtrack', 'recommended'] }, notes: 'key scene' },

  // The Great Gatsby (2013)
  { movie: 'The Great Gatsby', recording: 'Young and Beautiful', artist: 'Lana Del Rey', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'love theme' },

  // Wonder Woman
  { movie: 'Wonder Woman', recording: 'To Be Human', artist: 'Sia', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'soundtrack', 'recommended'] }, notes: 'end credits theme' },

  // Pearl Harbor
  { movie: 'Pearl Harbor', recording: 'There You\'ll Be', artist: 'Faith Hill', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'country', 'soundtrack', 'recommended'] }, notes: 'main theme, big hit' },

  // The Wolf of Wall Street
  { movie: 'The Wolf of Wall Street', recording: 'Sympathy For The Devil', artist: 'The Rolling Stones', notes: 'featured — recording already exists' },

  // Ferris Bueller's Day Off
  { movie: 'Ferris Bueller\'s Day Off', recording: 'Twist and Shout', artist: 'The Beatles', newRecording: true,
    recMeta: { language: 'en', tags: ['rock', 'soundtrack', 'recommended'] }, notes: 'parade scene, iconic moment' },

  // Doctor Strange
  { movie: 'Doctor Strange', recording: 'Interstellar Overdrive', artist: 'Pink Floyd', newRecording: true,
    recMeta: { language: 'en', tags: ['psychedelic', 'rock', 'soundtrack', 'recommended'] }, notes: 'featured in film' },

  // Ray
  { movie: 'Ray', recording: 'Hit the Road Jack', artist: 'Ray Charles', newRecording: true,
    recMeta: { language: 'en', tags: ['soul', 'r&b', 'soundtrack', 'recommended'] }, notes: 'biopic of Ray Charles' },
  { movie: 'Ray', recording: 'I Got a Woman', artist: 'Ray Charles', newRecording: true,
    recMeta: { language: 'en', tags: ['soul', 'r&b', 'soundtrack', 'recommended'] }, notes: 'key performance in film' },

  // Almost Famous
  { movie: 'Almost Famous', recording: 'Tiny Dancer', artist: 'Elton John', newRecording: true,
    recMeta: { language: 'en', tags: ['pop', 'rock', 'soundtrack', 'recommended'] }, notes: 'bus sing-along, one of most iconic movie music moments' },
];

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== Movie ↔ Recording Enrichment (LLM Knowledge) ===\n');

  // Scan existing data
  console.log('Scanning DynamoDB...');
  const [movies, recordings, existingLinks] = await Promise.all([
    scanAll('movie'),
    scanAll('recording'),
    scanAll('recording_movie'),
  ]);
  console.log(`  Movies: ${movies.length}`);
  console.log(`  Recordings: ${recordings.length}`);
  console.log(`  Existing recording_movie links: ${existingLinks.length}\n`);

  // Build lookup maps
  const movieByNorm = {};
  for (const m of movies) movieByNorm[normalize(m.name)] = m;
  const recordingByNorm = {};
  for (const r of recordings) recordingByNorm[normalize(r.name)] = r;
  const existingLinkIds = new Set(existingLinks.map(l => l.id));

  // --- AUDIT ---
  const stats = {
    linksToCreate: 0,
    linksExisting: 0,
    recordingsToCreate: 0,
    moviesToCreate: 0,
    movieTagsToUpdate: 0,
  };
  const plan = {
    newRecordings: [],
    newMovies: [],
    newLinks: [],
    tagUpdates: [],
  };

  for (const entry of MOVIE_RECORDING_LINKS) {
    const movieNorm = normalize(entry.movie);
    const recNorm = normalize(entry.recording);

    let movieItem = movieByNorm[movieNorm];
    let recItem = recordingByNorm[recNorm];

    // Create missing recording?
    if (!recItem && entry.newRecording) {
      const existing = plan.newRecordings.find(r => normalize(r.name) === recNorm);
      if (!existing) {
        const id = makeId(entry.recording);
        const rec = {
          id,
          name: entry.recording,
          language: entry.recMeta?.language || 'en',
          tags: entry.recMeta?.tags || ['soundtrack', 'recommended'],
        };
        plan.newRecordings.push(rec);
        // Add to lookup so subsequent entries can find it
        recordingByNorm[recNorm] = { ...rec, entityType: 'recording' };
        stats.recordingsToCreate++;
      }
      recItem = recordingByNorm[recNorm];
    }

    // Skip if recording doesn't exist and we're not creating it
    if (!recItem && !entry.newRecording) {
      // Try fuzzy match — some recordings have slightly different names
      const fuzzy = Object.entries(recordingByNorm).find(([norm]) => {
        return norm.includes(recNorm) || recNorm.includes(norm);
      });
      if (fuzzy) {
        recItem = fuzzy[1];
      } else {
        console.log(`  SKIP: recording "${entry.recording}" not found in DB`);
        continue;
      }
    }

    if (!movieItem) {
      console.log(`  SKIP: movie "${entry.movie}" not found in DB`);
      continue;
    }

    // Plan the link
    const movieId = movieItem.id;
    const recId = recItem.id || makeId(entry.recording);
    const linkId = `${recId}___soundtrack___${movieId}`;

    if (existingLinkIds.has(linkId)) {
      stats.linksExisting++;
      continue;
    }

    // Avoid duplicate link plans
    if (plan.newLinks.find(l => l.id === linkId)) continue;

    plan.newLinks.push({
      id: linkId,
      movieId,
      movieName: movieItem.name || entry.movie,
      recordingId: recId,
      recordingName: recItem.name || entry.recording,
      notes: entry.notes,
    });
    stats.linksToCreate++;
    existingLinkIds.add(linkId);

    // Add 'soundtrack' tag to movie if missing
    const movieTags = movieItem.tags || [];
    if (!movieTags.includes('soundtrack')) {
      const already = plan.tagUpdates.find(t => t.id === movieId);
      if (!already) {
        plan.tagUpdates.push({ id: movieId, entityType: 'movie', currentTags: movieTags, tag: 'soundtrack' });
        stats.movieTagsToUpdate++;
      }
    }
  }

  // --- AUDIT SUMMARY ---
  console.log('\n========================================');
  console.log('AUDIT SUMMARY');
  console.log('========================================');
  console.log(`New recordings to create: ${stats.recordingsToCreate}`);
  console.log(`New recording_movie links: ${stats.linksToCreate}`);
  console.log(`Existing links (skipped): ${stats.linksExisting}`);
  console.log(`Movies to tag 'soundtrack': ${stats.movieTagsToUpdate}`);
  console.log('========================================\n');

  if (plan.newRecordings.length > 0) {
    console.log('--- New Recordings ---');
    for (const r of plan.newRecordings) {
      console.log(`  + ${r.name} [${r.tags.join(', ')}]`);
    }
    console.log();
  }

  if (plan.newLinks.length > 0) {
    console.log('--- New Links ---');
    for (const l of plan.newLinks) {
      console.log(`  ${l.recordingName} ↔ ${l.movieName} (${l.notes})`);
    }
    console.log();
  }

  if (plan.tagUpdates.length > 0) {
    console.log('--- Tag Updates ---');
    for (const t of plan.tagUpdates) {
      console.log(`  ${t.id} + 'soundtrack'`);
    }
    console.log();
  }

  if (AUDIT_ONLY) {
    console.log('Audit complete (--audit-only mode).');
    return;
  }

  if (DRY_RUN) console.log('*** DRY RUN MODE — no changes will be made ***\n');

  // --- ENRICHMENT ---

  // Step 1: Create new recordings
  if (plan.newRecordings.length > 0) {
    console.log('--- Creating recordings ---');
    for (const r of plan.newRecordings) {
      await putItem({
        id: r.id,
        entityType: 'recording',
        name: r.name,
        language: r.language,
        tags: r.tags,
        externalLinks: '[]',
      });
      console.log(`  CREATED recording: ${r.name} (${r.id})`);
    }
  }

  // Step 2: Create recording_movie cross-refs
  if (plan.newLinks.length > 0) {
    console.log('\n--- Creating recording_movie links ---');
    for (const l of plan.newLinks) {
      await putItem({
        id: l.id,
        entityType: 'recording_movie',
        recordingId: l.recordingId,
        recordingName: l.recordingName,
        movieId: l.movieId,
        movieName: l.movieName,
        name: `${l.recordingName} — ${l.movieName}`,
      });
      console.log(`  LINKED: ${l.recordingName} ↔ ${l.movieName}`);
    }
  }

  // Step 3: Tag movies as 'soundtrack'
  if (plan.tagUpdates.length > 0) {
    console.log('\n--- Tagging movies ---');
    for (const t of plan.tagUpdates) {
      await addTag(t.id, t.entityType, t.currentTags, t.tag);
      console.log(`  TAGGED: ${t.id} + 'soundtrack'`);
    }
  }

  // Final summary
  console.log('\n========================================');
  console.log('ENRICHMENT COMPLETE');
  console.log('========================================');
  console.log(`Recordings created: ${plan.newRecordings.length}`);
  console.log(`Links created: ${plan.newLinks.length}`);
  console.log(`Movies tagged: ${plan.tagUpdates.length}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
