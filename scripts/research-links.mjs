/**
 * Research and bulk-add Wikipedia + IMDB links for movies and bands.
 * Uses MediaWiki API for Wikipedia lookups and known IMDB title mappings.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links.mjs
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links.mjs --dry-run
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

// Rate-limit helper
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Wikipedia API ---

async function wikiSearch(title, disambiguation) {
  // Try exact title first, then with disambiguation suffix
  const candidates = [title];
  if (disambiguation) candidates.push(`${title} (${disambiguation})`);

  for (const candidate of candidates) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(candidate)}&format=json&redirects=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query?.pages || {};
      const page = Object.values(pages)[0];
      if (page && page.pageid && page.pageid > 0) {
        const articleTitle = page.title.replace(/ /g, '_');
        return `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;
      }
    } catch (e) {
      // ignore, try next
    }
  }

  // Fallback: opensearch
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(title)}&limit=3&format=json`;
  try {
    const res = await fetch(searchUrl);
    const [, titles, , urls] = await res.json();
    if (urls && urls.length > 0) {
      // Pick the best match
      const lowerTitle = title.toLowerCase();
      for (let i = 0; i < titles.length; i++) {
        const t = titles[i].toLowerCase();
        if (t === lowerTitle || t.startsWith(lowerTitle + ' (')) {
          return urls[i];
        }
      }
      return urls[0]; // fallback to first result
    }
  } catch (e) {
    // ignore
  }

  return null;
}

// --- IMDB known mappings (manual for accuracy) ---
// IMDB IDs for the 94 movies — these are stable identifiers
const IMDB_MOVIES = {
  '12 Angry Men': 'tt0050083',
  '28 Days Later': 'tt0289043',
  '8½': 'tt0056801',
  'A Few Good Men': 'tt0104257',
  'A Fistful of Dollars': 'tt0058461',
  'Against All Odds': 'tt0086859',
  'Agnes of God': 'tt0088683',
  'Airplane!': 'tt0080339',
  'Almost Famous': 'tt0181875',
  'An Officer and a Gentleman': 'tt0084434',
  'Black Swan': 'tt0947798',
  "Bridget Jones's Diary": 'tt0243155',
  'Cast Away': 'tt0162222',
  'Chicago': 'tt0299658',
  'Crazy Heart': 'tt1263670',
  'Dallas Buyers Club': 'tt0790636',
  'Dangerous Liaisons': 'tt0094947',
  "Dead Men Don't Wear Plaid": 'tt0083798',
  'Dirty Dancing': 'tt0092890',
  'Django Unchained': 'tt1853728',
  'Doctor Strange': 'tt1211837',
  'Dunkirk': 'tt5013056',
  "Ferris Bueller's Day Off": 'tt0091042',
  'Forrest Gump': 'tt0109830',
  'G.I. Jane': 'tt0119173',
  'Ghost': 'tt0099653',
  'Glory': 'tt0097441',
  'Grease': 'tt0077631',
  'Inception': 'tt1375666',
  'Interstellar': 'tt0816692',
  'Jerry Maguire': 'tt0116695',
  'Judy': 'tt7549996',
  'Kill Bill: Vol. 1': 'tt0266697',
  'Leon: The Professional': 'tt0110413',
  'Les Misérables': 'tt1707386',
  'Lucy': 'tt2872732',
  'Malcolm X': 'tt0104797',
  'Man on Fire': 'tt0328107',
  'Michael Clayton': 'tt0465538',
  'Mission: Impossible': 'tt0117060',
  'Moulin Rouge!': 'tt0203009',
  'On Golden Pond': 'tt0082846',
  'Once Upon a Time in the West': 'tt0064116',
  'Pearl Harbor': 'tt0213149',
  'Philadelphia': 'tt0107818',
  'Point Break': 'tt0102685',
  'Pulp Fiction': 'tt0110912',
  'Rachel Getting Married': 'tt1084950',
  'Rain Man': 'tt0095953',
  'Ray': 'tt0350258',
  'Red Dawn': 'tt0087985',
  'Romeo + Juliet': 'tt0117509',
  'Ronin': 'tt0122690',
  'Saturday Night Fever': 'tt0076666',
  'Saving Private Ryan': 'tt0120815',
  'Sister Act': 'tt0105417',
  'Slumdog Millionaire': 'tt1010048',
  'Star Wars: Episode I – The Phantom Menace': 'tt0120915',
  'The Accused': 'tt0094608',
  'The Beach': 'tt0163978',
  'The Big Lebowski': 'tt0118715',
  'The Da Vinci Code': 'tt0382625',
  'The Dark Knight': 'tt0468569',
  'The Devil Wears Prada': 'tt0458352',
  "The Devil's Advocate": 'tt0118971',
  'The Fifth Element': 'tt0119116',
  'The Good, the Bad and the Ugly': 'tt0060196',
  'The Graduate': 'tt0061722',
  'The Grapes of Wrath': 'tt0032551',
  'The Great Gatsby': 'tt1343092',
  'The Hours': 'tt0274558',
  'The Leopard': 'tt0057091',
  'The Miracle Worker': 'tt0056241',
  'The Naked Gun': 'tt0095705',
  'The Others': 'tt0230600',
  'The Silence of the Lambs': 'tt0102926',
  'The Thorn Birds': 'tt0086798',
  'The Wolf of Wall Street': 'tt0993846',
  'Three Men and a Little Lady': 'tt0100196',
  'Titanic': 'tt0120338',
  'Tootsie': 'tt0084805',
  'Top Gun': 'tt0092099',
  'Training Day': 'tt0139654',
  'Trainspotting': 'tt0117951',
  'True Detective': 'tt2356777',
  'True Grit': 'tt1403865',
  'True Romance': 'tt0108399',
  'V for Vendetta': 'tt0434409',
  'Vanilla Sky': 'tt0259711',
  'We Need to Talk About Kevin': 'tt1242460',
  "Who's Afraid of Virginia Woolf?": 'tt0061184',
  'Witness': 'tt0090329',
  'Wonder Woman': 'tt0451279',
  'Working Girl': 'tt0096463',
};

// Wikipedia disambiguation hints
const WIKI_HINTS = {
  // Movies that need "(film)" or "(year film)" disambiguation
  'Chicago': 'film',
  'Ghost': 'film',
  'Glory': '1989 film',
  'Grease': 'film',
  'Inception': 'film',
  'Interstellar': 'film',
  'Judy': '2019 film',
  'Lucy': '2014 film',
  'Philadelphia': 'film',
  'Ray': 'film',
  'Ronin': 'film',
  'Titanic': '1997 film',
  'Witness': '1985 film',
  'Dunkirk': '2017 film',
  // Bands that need "(band)" disambiguation
  'Animals': 'band',
  'Enigma': 'German musical project',
  'Elan': 'Slovak band',
  'Fiction': 'band',
  'Film': 'Czech band',
  'Prodigy': 'band',
  'Scorpions': 'band',
  'Smokie': 'band',
};

// --- Query DynamoDB ---

async function queryByType(entityType) {
  const items = [];
  let lastKey;
  do {
    const res = await client.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'byType',
      KeyConditionExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': entityType },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// --- Main ---

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // Load movies and bands
  const movies = await queryByType('movie');
  const bands = await queryByType('band');
  console.log(`Movies: ${movies.length}, Bands: ${bands.length}`);

  let updated = 0;
  let wikiFound = 0;
  let imdbFound = 0;
  let errors = 0;

  // Process movies
  console.log('\n--- Movies ---');
  for (const movie of movies) {
    const name = movie.name || '';
    const existing = movie.externalLinks ? JSON.parse(movie.externalLinks) : [];
    const existingTypes = new Set(existing.map(l => l.type));
    const newLinks = [...existing];

    // Wikipedia
    if (!existingTypes.has('wikipedia')) {
      const hint = WIKI_HINTS[name] || 'film';
      const wikiUrl = await wikiSearch(name, hint);
      if (wikiUrl) {
        newLinks.push({ url: wikiUrl, type: 'wikipedia' });
        wikiFound++;
      }
      await sleep(100); // rate limit
    }

    // IMDB
    if (!existingTypes.has('imdb') && IMDB_MOVIES[name]) {
      newLinks.push({ url: `https://www.imdb.com/title/${IMDB_MOVIES[name]}/`, type: 'imdb' });
      imdbFound++;
    }

    if (newLinks.length > existing.length) {
      const added = newLinks.length - existing.length;
      console.log(`  ${name}: +${added} links (${newLinks.filter(l => !existingTypes.has(l.type)).map(l => l.type).join(', ')})`);

      if (!DRY_RUN) {
        try {
          await client.send(new UpdateCommand({
            TableName: TABLE,
            Key: { id: movie.id, entityType: 'movie' },
            UpdateExpression: 'SET externalLinks = :links',
            ExpressionAttributeValues: { ':links': JSON.stringify(newLinks) },
          }));
          updated++;
        } catch (e) {
          console.error(`  ERROR ${movie.id}: ${e.message}`);
          errors++;
        }
      } else {
        updated++;
      }
    }
  }

  // Process bands
  console.log('\n--- Bands ---');
  for (const band of bands) {
    const name = band.name || '';
    const existing = band.externalLinks ? JSON.parse(band.externalLinks) : [];
    const existingTypes = new Set(existing.map(l => l.type));
    const newLinks = [...existing];

    // Wikipedia
    if (!existingTypes.has('wikipedia')) {
      const hint = WIKI_HINTS[name] || 'band';
      const wikiUrl = await wikiSearch(name, hint);
      if (wikiUrl) {
        newLinks.push({ url: wikiUrl, type: 'wikipedia' });
        wikiFound++;
      }
      await sleep(100);
    }

    if (newLinks.length > existing.length) {
      const added = newLinks.length - existing.length;
      console.log(`  ${name}: +${added} links (${newLinks.filter(l => !existingTypes.has(l.type)).map(l => l.type).join(', ')})`);

      if (!DRY_RUN) {
        try {
          await client.send(new UpdateCommand({
            TableName: TABLE,
            Key: { id: band.id, entityType: 'band' },
            UpdateExpression: 'SET externalLinks = :links',
            ExpressionAttributeValues: { ':links': JSON.stringify(newLinks) },
          }));
          updated++;
        } catch (e) {
          console.error(`  ERROR ${band.id}: ${e.message}`);
          errors++;
        }
      } else {
        updated++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Items updated: ${updated}`);
  console.log(`Wikipedia links found: ${wikiFound}`);
  console.log(`IMDB links added: ${imdbFound}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
