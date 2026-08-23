/**
 * Fix enrichment: propagate YouTube links to band/person entities,
 * fix tags using correct genre knowledge.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/fix-enrichment.mjs [--dry-run]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'fs';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = process.env.AWS_REGION || 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function scanAll(entityType) {
  const items = [];
  let lastKey;
  do {
    const r = await client.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'entityType = :et',
      ExpressionAttributeValues: { ':et': entityType },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function updateItem(id, entityType, updates) {
  const expParts = [];
  const values = {};
  for (const [k, v] of Object.entries(updates)) {
    expParts.push(`${k} = :${k}`);
    values[`:${k}`] = v;
  }
  expParts.push('updatedAt = :now');
  values[':now'] = new Date().toISOString();

  if (DRY_RUN) {
    console.log(`  [DRY] ${entityType} ${id}: ${JSON.stringify(updates)}`);
    return;
  }
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id, entityType },
    UpdateExpression: 'SET ' + expParts.join(', '),
    ExpressionAttributeValues: values,
  }));
}

// --- LLM-informed correct tags for bands/persons ---
// These override whatever was bulk-tagged before
const BAND_TAGS = {
  'Puding Pani Elvisovej': ['rock', 'pop'],
  'Scorpions': ['rock'],
  'Simon & Garfunkel': ['folk', 'rock'],
  'Midi Lidi': ['electronic', 'pop'],
  'Deep Purple': ['rock'],
  'Elan': ['pop', 'rock'],
  'Blue Effect': ['rock', 'psychedelic'],
  'Jan Kalousek & ZOO': ['rock'],
  'Spirituál Kvintet': ['folk'],
  'Kalandra': ['rock'],
  'Hudba Praha': ['rock'],
  'Visací Zámek': ['punk'],
  'Wohnout': ['rock'],
  'Fiction': ['rock'],
  'Jaroslav Uhlíř & Zdeněk Svěrák': ['pop', 'children'],
  'At Vance': ['metal'],
  'Faithless': ['electronic', 'dance'],
  'T. Rex': ['rock', 'glam'],
  'The Prodigy': ['electronic'],
  'Radiohead': ['rock', 'alternative'],
  'Valašská Polanka': ['folk', 'spiritual'],
  'Sacred Spirit': ['world', 'new age'],
  'The Rolling Stones': ['rock'],
  'Righteous Brothers': ['soul', 'pop'],
  'Dario G': ['electronic', 'dance'],
  'Sade': ['soul', 'jazz'],
  'The Cranberries': ['rock', 'alternative'],
  'Depeche Mode': ['electronic', 'synthpop'],
  'INXS': ['rock', 'pop'],
  'AC/DC': ['rock'],
  '4 Non Blondes': ['rock', 'alternative'],
  'Eurythmics': ['synthpop', 'pop'],
  'Midnight Oil': ['rock'],
  'Enigma': ['electronic', 'new age'],
  'The Verve': ['rock', 'alternative'],
  'Rage Against The Machine': ['rock', 'metal'],
  'The Pretenders': ['rock'],
  'Modern Talking': ['pop', 'eurodisco'],
  'All Saints': ['pop', 'r&b'],
  'TLC': ['r&b', 'pop'],
  'U2': ['rock'],
  'Nick Cave & The Bad Seeds': ['rock', 'alternative'],
  'Alphaville': ['synthpop'],
  'Iron Maiden': ['metal'],
  // Czech/Slovak bands
  'Patti Smith Group': ['punk', 'rock'],
  'Precedens': ['rock'],
  'Jiří Suchý & Jiří Šlitr': ['chanson'],
  // Others from existing DB
  'Velvet Underground': ['rock'],
  'The Doors': ['rock'],
  'Katapult': ['rock'],
  'Eagles': ['rock'],
  'Animals': ['rock'],
  'Fools Garden': ['pop', 'rock'],
  'Greenhorns': ['country'],
  'Smokie': ['pop', 'rock'],
  'Film': ['rock'],
  'Garaz': ['rock'],
  'K.T.O.': ['rock'],
  'Tri sestry': ['punk', 'rock'],
};

const PERSON_TAGS = {
  'Chris Isaak': ['rock'],
  'Janis Joplin': ['rock', 'blues'],
  'Johnny Cash': ['country'],
  'Hans Zimmer': ['soundtrack'],
  'Chris de Burgh': ['pop'],
  'Passenger': ['folk', 'pop'],
  'Vanessa Mae': ['classical', 'pop'],
  'Amy Winehouse': ['soul', 'jazz'],
  'Robbie Williams': ['pop'],
  'Phil Collins': ['pop', 'rock'],
  'Bruce Springsteen': ['rock'],
  'Alannah Myles': ['rock'],
  'Eric Carmen': ['pop', 'rock'],
  'Iggy Pop': ['punk', 'rock'],
  'Moby': ['electronic'],
  'Lou Reed': ['rock'],
  'Meredith Brooks': ['rock'],
  'Annie Lennox': ['pop'],
  'David Bowie': ['rock', 'pop'],
  'Sting': ['rock', 'pop'],
  'Adele': ['pop', 'soul'],
  'Marianne Faithfull': ['rock', 'folk'],
  'Kylie Minogue': ['pop', 'dance'],
  'Charli XCX': ['pop', 'electronic'],
  'P!nk': ['pop', 'rock'],
  'Pink': ['pop', 'rock'],
  'Mary J. Blige': ['r&b', 'soul'],
  'Nick Cave': ['rock', 'alternative'],
  'PJ Harvey': ['rock', 'alternative'],
  'Taylor Swift': ['pop'],
  'Billie Eilish': ['pop', 'alternative'],
  'Patti Smith': ['punk', 'rock'],
  'Chuck Berry': ['rock'],
  'Harold Faltermeyer': ['soundtrack', 'electronic'],
  'Difang': ['world', 'traditional'],
  'Igay': ['world', 'traditional'],
  'Frank Zappa': ['rock', 'experimental'],
  'Bob Dylan': ['folk', 'rock'],
  // Czech/Slovak persons
  'Miro Žbirka': ['pop', 'rock'],
  'Jiří Schelinger': ['pop', 'rock'],
  'Pavel Novák': ['pop'],
  'Pavel Bobek': ['country', 'pop'],
  'Richard Müller': ['rock', 'pop'],
  'Vlado Müller': ['folk'],
  'Martin Čížek': ['folk'],
  'Mejla Hlavsa': ['punk', 'underground'],
  'Jan Vyčítal': ['country', 'rock'],
  'Iva Bittová': ['experimental', 'folk'],
  'Bára Basiková': ['rock', 'pop'],
  'Rachel Sklenickova': ['pop'],
  'Miroslav Donutil': ['actor'],
  'Precedens': ['rock'],
};

const RECORDING_TAGS = {
  'Paradox Výmyslov': ['rock', 'pop'],
  'Still Loving You': ['rock'],
  'The Sound Of Silence': ['folk', 'rock'],
  'Láska Není Švédský Stůl': ['electronic', 'pop'],
  'Wicked Game': ['rock'],
  'Me And Bobby Mcgee': ['rock', 'blues'],
  'Ring Of Fire': ['country'],
  'Slovenská': ['pop', 'rock'],
  'Hush': ['rock'],
  'Time (Interstellar)': ['soundtrack', 'electronic'],
  'The Lady In Red': ['pop'],
  'Čistý Svet': ['pop', 'rock'],
  'Let Her Go': ['folk', 'pop'],
  'Whiskey In The Jar': ['metal'],
  'Storm': ['classical', 'pop'],
  'Forever Young': ['synthpop'],
  'Sympathy For The Devil': ['rock'],
  'Best Of Sade': ['soul', 'jazz'],
  'Angels': ['pop'],
  'Unchained Melody': ['soul', 'pop'],
  'Stay (Interstellar)': ['soundtrack', 'electronic'],
  'Voices': ['electronic', 'dance'],
  'Slunečný Hrob': ['rock', 'psychedelic'],
  'Zmrzlinář': ['pop', 'children'],
  'Čas Sluhů': ['rock'],
  'Zabili, Zabili': ['folk', 'experimental'],
  'Mlýny': ['folk'],
  'Solnej Sloup': ['rock'],
  'Kubistický Portrét': ['chanson'],
  'Zalubeni': ['pop', 'rock'],
  'Léto S Tebou': ['pop', 'rock'],
  'Čajovna': ['rock', 'psychedelic'],
  'Balada O Poĺných Vtákoch': ['pop', 'rock'],
  'Nádherná': ['pop'],
  'Vincent': ['country', 'pop'],
  'Rozeznávám': ['rock', 'pop'],
  'Waterfalls': ['r&b', 'pop'],
  'With Or Without You': ['rock'],
  'Shape Of My Heart': ['rock', 'pop'],
  'I Got You Babe': ['rock', 'folk'],
  'Waiting For The Man': ['rock'],
  'Mercedes Benz': ['rock', 'blues'],
  'Rolling In The Deep': ['pop', 'soul'],
  "What's Up": ['rock', 'alternative'],
  'Soumrak Bohů': ['rock'],
  'Secret Garden': ['rock'],
  'Bad / People Have The Power': ['rock'],
  'Because The Night': ['punk', 'rock'],
  'Pure Shores': ['pop', 'r&b'],
  'Against All Odds (Take A Look At Me Now)': ['pop', 'rock'],
  'Black Velvet': ['rock'],
  'Zombie': ['rock', 'alternative'],
  'Hungry Eyes': ['pop', 'rock'],
  'Children Of The Revolution': ['rock', 'glam'],
  'Enjoy The Silence': ['electronic', 'synthpop'],
  'Mystify': ['rock', 'pop'],
  'Never Tear Us Apart': ['rock', 'pop'],
  'Thunderstruck': ['rock'],
  'You Never Can Tell': ['rock'],
  'Try': ['pop', 'rock'],
  'The Trooper': ['metal'],
  'Let Me Entertain You': ['pop'],
  'Enter Sandman': ['metal'],
  'Smack My Bitch Up': ['electronic'],
  'When You Came Into My Life': ['rock'],
  'One': ['r&b', 'rock'],
  'Henry Lee': ['rock', 'alternative'],
  'Heroes': ['rock', 'pop'],
  'Pale Blue Eyes': ['rock'],
  'Walk On The Wild Side': ['rock'],
  'Bitch': ['rock'],
  'Here Comes The Rain Again': ['synthpop', 'pop'],
  'Sweet Dreams (Are Made Of This)': ['synthpop', 'pop'],
  'Beds Are Burning': ['rock'],
  'Candy': ['punk', 'rock'],
  'Return To Innocence': ['electronic', 'new age'],
  'Natural Blues': ['electronic'],
  'Bitter Sweet Symphony': ['rock', 'alternative'],
  'Lust For Life': ['punk', 'rock'],
  'Killing In The Name': ['rock', 'metal'],
  'Tension': ['pop', 'dance'],
  "Can't Get You Out Of My Head": ['pop', 'dance'],
  'Padam Padam': ['pop', 'dance'],
  'Guess': ['pop', 'electronic'],
  "I'll Stand By You": ['rock'],
  'A Whiter Shade Of Pale': ['pop'],
  'Cheri, Cheri Lady': ['pop', 'eurodisco'],
  'Přátelé Zeleného Údolí': ['folk'],
  'Muchomůrky Bílé': ['punk', 'underground'],
  'Mama, Tata': ['rock'],
  'Známka Punku': ['punk'],
  'Traktor': ['punk'],
  'Svaz Českých Bohémů': ['rock'],
  'Creep': ['rock', 'alternative'],
  'Voda Čo Ma Drží Nad Vodou': ['pop', 'rock'],
  'Cadillac': ['country', 'rock'],
  'Mr. Tambourine Man': ['folk', 'rock'],
  'Z Tvé Ruky Pane Můj': ['folk', 'spiritual'],
  'Bobby Brown Goes Down': ['rock', 'experimental'],
  'Woozy': ['electronic', 'dance'],
  'Snakeblood': ['electronic', 'soundtrack'],
  'Pulp Fiction Soundtrack': ['soundtrack'],
  'Pulp Fiction Dance Scene': ['rock', 'soundtrack'],
  'Ly O Lay Ale Loya': ['world'],
  'Amy Winehouse Greatest Hits': ['soul', 'jazz'],
  'Weeding And Paddyfield Song': ['world', 'traditional'],
  'Midi Lidi Radio Wave Live Session': ['electronic', 'pop'],
  'Pink Puding Pong': ['rock', 'pop'],
  'Top Gun Anthem': ['soundtrack'],
  'Nahý II': ['rock', 'pop'],
  'The Winner Takes It All': ['metal'],
  'Radio Wave Live Session': ['electronic', 'pop'],
  'Ly O Lay Ale Loya (Circle Dance)': ['world'],
  'Weeding and Paddyfield Song No. 1': ['world', 'traditional'],
  'Wicked Game (Chillion Remix)': ['rock', 'electronic'],
};

// --- YouTube links to add to band/person entities ---
// Build from parsed playlist: artist → [youtubeUrls]
function loadYouTubeMap() {
  const entries = JSON.parse(readFileSync('input/youtube_parsed.json', 'utf-8'));
  const map = new Map(); // normalized artist name → { name, urls: Set }

  for (const e of entries) {
    if (e.type === 'compilation') continue;

    // Main artist
    const norm = normalize(e.artist);
    if (!map.has(norm)) map.set(norm, { name: e.artist, urls: new Set() });
    if (e.youtubeUrl) map.get(norm).urls.add(e.youtubeUrl);

    // Featured
    if (e.featured) {
      for (const f of e.featured) {
        const fn = normalize(f);
        if (!map.has(fn)) map.set(fn, { name: f, urls: new Set() });
        if (e.youtubeUrl) map.get(fn).urls.add(e.youtubeUrl);
      }
    }
  }
  return map;
}

async function main() {
  console.log('=== Fix Enrichment: Tags + YouTube Links ===\n');

  const [bands, persons, recordings] = await Promise.all([
    scanAll('band'),
    scanAll('person'),
    scanAll('recording'),
  ]);
  console.log(`Loaded: ${bands.length} bands, ${persons.length} persons, ${recordings.length} recordings\n`);

  const ytMap = loadYouTubeMap();
  let tagsFixed = 0, ytAdded = 0;

  // --- Fix band tags and add YouTube links ---
  console.log('--- Bands ---');
  for (const band of bands) {
    const updates = {};

    // Fix tags
    const correctTags = BAND_TAGS[band.name];
    if (correctTags) {
      const currentTags = band.tags || [];
      if (JSON.stringify(currentTags.sort()) !== JSON.stringify(correctTags.sort())) {
        updates.tags = correctTags;
        console.log(`  TAG FIX: ${band.name}: [${currentTags}] → [${correctTags}]`);
        tagsFixed++;
      }
    }

    // Add YouTube links
    const norm = normalize(band.name);
    const ytInfo = ytMap.get(norm);
    if (ytInfo) {
      let links = [];
      try { links = JSON.parse(band.externalLinks || '[]'); } catch {}
      const existingYT = new Set(links.filter(l => l.type === 'youtube').map(l => l.url));
      const newUrls = [...ytInfo.urls].filter(u => !existingYT.has(u));
      if (newUrls.length > 0) {
        for (const u of newUrls) links.push({ url: u, type: 'youtube' });
        updates.externalLinks = JSON.stringify(links);
        console.log(`  YT ADD: ${band.name} (+${newUrls.length} links)`);
        ytAdded++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateItem(band.id, 'band', updates);
    }
  }

  // --- Fix person tags and add YouTube links ---
  console.log('\n--- Persons ---');
  for (const person of persons) {
    const updates = {};

    const correctTags = PERSON_TAGS[person.name];
    if (correctTags) {
      const currentTags = person.tags || [];
      if (JSON.stringify(currentTags.sort()) !== JSON.stringify(correctTags.sort())) {
        updates.tags = correctTags;
        console.log(`  TAG FIX: ${person.name}: [${currentTags}] → [${correctTags}]`);
        tagsFixed++;
      }
    }

    const norm = normalize(person.name);
    const ytInfo = ytMap.get(norm);
    if (ytInfo) {
      let links = [];
      try { links = JSON.parse(person.externalLinks || '[]'); } catch {}
      const existingYT = new Set(links.filter(l => l.type === 'youtube').map(l => l.url));
      const newUrls = [...ytInfo.urls].filter(u => !existingYT.has(u));
      if (newUrls.length > 0) {
        for (const u of newUrls) links.push({ url: u, type: 'youtube' });
        updates.externalLinks = JSON.stringify(links);
        console.log(`  YT ADD: ${person.name} (+${newUrls.length} links)`);
        ytAdded++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateItem(person.id, 'person', updates);
    }
  }

  // --- Fix recording tags ---
  console.log('\n--- Recordings ---');
  for (const rec of recordings) {
    const correctTags = RECORDING_TAGS[rec.name];
    if (correctTags) {
      const currentTags = rec.tags || [];
      if (JSON.stringify(currentTags.sort()) !== JSON.stringify(correctTags.sort())) {
        console.log(`  TAG FIX: ${rec.name}: [${currentTags}] → [${correctTags}]`);
        await updateItem(rec.id, 'recording', { tags: correctTags });
        tagsFixed++;
      }
    }
  }

  console.log('\n========================================');
  console.log('FIX COMPLETE');
  console.log(`  Tags fixed: ${tagsFixed}`);
  console.log(`  YouTube links added to bands/persons: ${ytAdded}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Fix failed:', err);
  process.exit(1);
});
