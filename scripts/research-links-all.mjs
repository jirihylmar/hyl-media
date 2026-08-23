/**
 * Research and bulk-add Wikipedia + IMDB links for ALL entity types.
 * Covers: persons, recordings, books, sheet_music (movies+bands already done).
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-all.mjs
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-all.mjs --dry-run
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = 'eu-central-1';
const DRY_RUN = process.argv.includes('--dry-run');

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Wikipedia API ---
async function wikiSearch(title, lang = 'en') {
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  // Try exact title
  try {
    const url = `${base}?action=query&titles=${encodeURIComponent(title)}&format=json&redirects=1`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    if (page && page.pageid && page.pageid > 0) {
      const articleTitle = page.title.replace(/ /g, '_');
      return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;
    }
  } catch {}

  // Fallback: opensearch
  try {
    const searchUrl = `${base}?action=opensearch&search=${encodeURIComponent(title)}&limit=5&format=json`;
    const res = await fetch(searchUrl);
    const [, titles, , urls] = await res.json();
    if (urls && urls.length > 0) {
      const lower = title.toLowerCase();
      for (let i = 0; i < titles.length; i++) {
        const t = titles[i].toLowerCase();
        if (t === lower || t.startsWith(lower)) return urls[i];
      }
      return urls[0];
    }
  } catch {}
  return null;
}

async function wikiSearchWithFallback(title, disambig, lang = 'en') {
  // Try with disambiguation first if provided
  if (disambig) {
    const url = await wikiSearch(`${title} (${disambig})`, lang);
    if (url) return url;
  }
  const url = await wikiSearch(title, lang);
  if (url) return url;
  // Try Czech Wikipedia for Czech names
  if (lang === 'en') {
    const csUrl = await wikiSearch(title, 'cs');
    if (csUrl) return csUrl;
  }
  return null;
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

async function addLinks(item, entityType, newLinks) {
  const existing = item.externalLinks ? JSON.parse(item.externalLinks) : [];
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

// --- IMDB IDs for known actors/directors ---
const IMDB_PERSONS = {
  'Aaron Eckhart': 'nm0000399',
  'Al Pacino': 'nm0000199',
  'Alain Delon': 'nm0001128',
  'Alan Ruck': 'nm0748620',
  'Anne Bancroft': 'nm0000843',
  'Anne Hathaway': 'nm0004266',
  'Anthony Hopkins': 'nm0000164',
  'Antonio Banderas': 'nm0000104',
  'Audrey Tautou': 'nm0851582',
  'Baz Luhrmann': 'nm0525303',
  'Ben Affleck': 'nm0000255',
  'Benedict Cumberbatch': 'nm1212722',
  'Billy Crudup': 'nm0189144',
  'Billy Zane': 'nm0000708',
  'Bruce Willis': 'nm0000246',
  'Burt Lancaster': 'nm0000044',
  'Cameron Crowe': 'nm0001081',
  'Cameron Diaz': 'nm0000139',
  'Carey Mulligan': 'nm1659547',
  'Carl Reiner': 'nm0001657',
  'Catherine Zeta-Jones': 'nm0001876',
  'Charles Bronson': 'nm0000314',
  'Charlize Theron': 'nm0000234',
  'Christian Bale': 'nm0000288',
  'Christian Slater': 'nm0000228',
  'Christoph Waltz': 'nm0910607',
  'Christopher Nolan': 'nm0634240',
  'Christopher Plummer': 'nm0001626',
  'Christopher Walken': 'nm0000686',
  'Cillian Murphy': 'nm0614165',
  'Claire Danes': 'nm0000132',
  'Claudia Cardinale': 'nm0001016',
  'Clint Eastwood': 'nm0000142',
  'Colin Firth': 'nm0000146',
  'Cuba Gooding Jr.': 'nm0000421',
  'Dakota Fanning': 'nm0266824',
  'Danny Boyle': 'nm0000965',
  'David Carradine': 'nm0001016',
  'Debra Winger': 'nm0000700',
  'Demi Moore': 'nm0000193',
  'Dennis Hopper': 'nm0000454',
  'Denzel Washington': 'nm0000243',
  'Dev Patel': 'nm2353862',
  'Dustin Hoffman': 'nm0000163',
  'Elizabeth Taylor': 'nm0000072',
  'Ellen Page': 'nm0680983',
  'Emily Blunt': 'nm1289434',
  'Ethan Hawke': 'nm0000160',
  'Ewan McGregor': 'nm0000191',
  'Ezra Miller': 'nm3009232',
  'Gal Gadot': 'nm2933757',
  'Gary Busey': 'nm0000997',
  'Gary Oldman': 'nm0000198',
  'George Clooney': 'nm0000123',
  'Glenn Close': 'nm0000335',
  'Hailee Steinfeld': 'nm2794962',
  'Harrison Ford': 'nm0000148',
  'Harvey Keitel': 'nm0000172',
  'Heath Ledger': 'nm0005132',
  'Helen Hunt': 'nm0000166',
  'Henry Fonda': 'nm0000020',
  'Hugh Grant': 'nm0000424',
  'Hugh Jackman': 'nm0413168',
  'Hugo Weaving': 'nm0915989',
  'Ian McKellen': 'nm0005212',
  'Jack Nicholson': 'nm0000197',
  'Jamie Foxx': 'nm0004937',
  'Jane Fonda': 'nm0000404',
  'Jared Leto': 'nm0001467',
  'Jean Reno': 'nm0000606',
  'Jeff Bridges': 'nm0000313',
  'Jennifer Garner': 'nm0004950',
  'Jennifer Grey': 'nm0000427',
  'Jessie Buckley': 'nm4225208',
  'Jodie Foster': 'nm0000149',
  'John Goodman': 'nm0000422',
  'John Malkovich': 'nm0000518',
  'John Travolta': 'nm0000237',
  'Jonah Hill': 'nm1706767',
  'Jonathan Demme': 'nm0001129',
  'Joseph Gordon-Levitt': 'nm0330687',
  'Josh Hartnett': 'nm0001326',
  'Julianne Moore': 'nm0000194',
  'Kate Beckinsale': 'nm0000295',
  'Kate Hudson': 'nm0005028',
  'Kate Winslet': 'nm0000701',
  'Katharine Hepburn': 'nm0000031',
  'Keanu Reeves': 'nm0000206',
  'Kelly McGillis': 'nm0000532',
  'Leonardo DiCaprio': 'nm0000138',
  'Leslie Nielsen': 'nm0000558',
  'Liam Neeson': 'nm0000553',
  'Luc Besson': 'nm0000108',
  'Lucy Liu': 'nm0005154',
  'Maggie Smith': 'nm0001749',
  'Marcello Mastroianni': 'nm0000052',
  'Margot Robbie': 'nm3053338',
  'Mark Rylance': 'nm0753314',
  'Matt Damon': 'nm0000354',
  'Matthew Broderick': 'nm0000111',
  'Matthew McConaughey': 'nm0000190',
  'Melanie Griffith': 'nm0000429',
  'Meryl Streep': 'nm0000658',
  'Mike Nichols': 'nm0001566',
  'Mila Kunis': 'nm0005109',
  'Milla Jovovich': 'nm0000170',
  'Morgan Freeman': 'nm0000151',
  'Natalie Portman': 'nm0000204',
  'Nicole Kidman': 'nm0000173',
  'Olivia Newton-John': 'nm0001565',
  'Patricia Arquette': 'nm0000099',
  'Patrick Swayze': 'nm0000664',
  'Patty Duke': 'nm0001158',
  'Penélope Cruz': 'nm0004851',
  'Quentin Tarantino': 'nm0000233',
  'Regina King': 'nm0005093',
  'Renée Zellweger': 'nm0000250',
  'Richard Burton': 'nm0000009',
  'Richard Gere': 'nm0000152',
  'Robert De Niro': 'nm0000134',
  'Robert Duvall': 'nm0000380',
  'Russell Crowe': 'nm0000128',
  'Samuel L. Jackson': 'nm0000168',
  'Scarlett Johansson': 'nm0424060',
  'Sergio Leone': 'nm0001466',
  'Sigourney Weaver': 'nm0000244',
  'Stephen Rea': 'nm0713933',
  'Steve Martin': 'nm0000188',
  'Tilda Swinton': 'nm0842770',
  'Tobey Maguire': 'nm0001497',
  'Tom Cruise': 'nm0000129',
  'Tom Hanks': 'nm0000158',
  'Tom Hardy': 'nm0362766',
  'Tom Sizemore': 'nm0001745',
  'Tony Scott': 'nm0001716',
  'Uma Thurman': 'nm0000235',
  'Val Kilmer': 'nm0000174',
  'Viggo Mortensen': 'nm0001557',
  'Whoopi Goldberg': 'nm0000155',
};

// --- Main ---
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const stats = { wikipedia: 0, imdb: 0, updated: 0, errors: 0 };

  // ===================== PERSONS =====================
  console.log('\n=== PERSONS ===');
  const persons = await queryAll('person');
  const noLinks = persons.filter(p => !p.externalLinks);
  console.log(`${persons.length} total, ${noLinks.length} without links`);

  for (const person of noLinks) {
    const name = person.name || '';
    const roles = person.roles || [];
    const links = [];

    // Wikipedia — try with role-based disambiguation
    let disambig = null;
    if (roles.includes('actor') || roles.includes('director')) disambig = 'actor';
    else if (roles.includes('artist') || roles.includes('musician')) disambig = 'musician';
    else if (roles.includes('author')) disambig = 'writer';

    const wikiUrl = await wikiSearchWithFallback(name, disambig);
    if (wikiUrl) {
      links.push({ url: wikiUrl, type: 'wikipedia' });
      stats.wikipedia++;
    }
    await sleep(80);

    // IMDB for actors/directors
    if (IMDB_PERSONS[name]) {
      links.push({ url: `https://www.imdb.com/name/${IMDB_PERSONS[name]}/`, type: 'imdb' });
      stats.imdb++;
    }

    if (links.length > 0) {
      try {
        const added = await addLinks(person, 'person', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name}: +${added} (${links.map(l=>l.type).join(', ')})`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ===================== RECORDINGS =====================
  console.log('\n=== RECORDINGS ===');
  const recordings = await queryAll('recording');
  const recNoLinks = recordings.filter(r => !r.externalLinks);
  console.log(`${recordings.length} total, ${recNoLinks.length} without links`);

  // For recordings, search Wikipedia with "(song)" disambiguation
  for (const rec of recNoLinks) {
    const name = rec.name || '';
    // Skip artist notes
    if (name.includes('Artist Note') || name.includes('(Artist Note)')) continue;

    const links = [];
    const wikiUrl = await wikiSearchWithFallback(name, 'song');
    if (wikiUrl) {
      links.push({ url: wikiUrl, type: 'wikipedia' });
      stats.wikipedia++;
    }
    await sleep(80);

    if (links.length > 0) {
      try {
        const added = await addLinks(rec, 'recording', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name}: +${added}`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ===================== BOOKS =====================
  console.log('\n=== BOOKS ===');
  const books = await queryAll('book');
  const bookNoLinks = books.filter(b => !b.externalLinks);
  console.log(`${books.length} total, ${bookNoLinks.length} without links`);

  for (const book of bookNoLinks) {
    const name = book.name || '';
    const author = book.author || '';
    const links = [];

    // Try Wikipedia with author for disambiguation
    let wikiUrl = await wikiSearchWithFallback(name, 'book');
    if (!wikiUrl && author) {
      wikiUrl = await wikiSearchWithFallback(name, `${author} book`);
    }
    if (!wikiUrl) {
      // Try Czech Wikipedia for Czech books
      wikiUrl = await wikiSearch(name, 'cs');
    }
    if (wikiUrl) {
      links.push({ url: wikiUrl, type: 'wikipedia' });
      stats.wikipedia++;
    }
    await sleep(80);

    if (links.length > 0) {
      try {
        const added = await addLinks(book, 'book', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name}: +${added}`);
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
  const sheetNoLinks = sheets.filter(s => !s.externalLinks);
  console.log(`${sheets.length} total, ${sheetNoLinks.length} without links`);

  for (const sheet of sheetNoLinks) {
    const name = sheet.name || '';
    const artist = sheet.artistName || '';
    const links = [];

    // Try Wikipedia with "(song)" disambiguation
    let wikiUrl = await wikiSearchWithFallback(name, 'song');
    if (!wikiUrl && artist) {
      wikiUrl = await wikiSearch(`${name} ${artist}`, 'en');
    }
    if (wikiUrl) {
      links.push({ url: wikiUrl, type: 'wikipedia' });
      stats.wikipedia++;
    }
    await sleep(80);

    if (links.length > 0) {
      try {
        const added = await addLinks(sheet, 'sheet_music', links);
        if (added > 0) {
          stats.updated++;
          console.log(`  ${name}: +${added}`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ===================== SUMMARY =====================
  console.log('\n=== SUMMARY ===');
  console.log(`Items updated: ${stats.updated}`);
  console.log(`Wikipedia links: ${stats.wikipedia}`);
  console.log(`IMDB links: ${stats.imdb}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
