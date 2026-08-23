/**
 * Final pass — fill remaining gaps:
 * - Persons with IMDB but no Wikipedia
 * - Sheet music matched via recordings
 * - Books via cs.wikipedia + better search
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-final.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';  // DEAD: this table was DELETED in Phase 17.6e — this script can no longer run.
const REGION = 'eu-central-1';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function wikiSearch(title, lang = 'en') {
  const base = `https://${lang}.wikipedia.org/w/api.php`;
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
  return null;
}

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

function hasType(item, type) {
  return getLinks(item).some(l => l.type === type);
}

async function addLink(item, entityType, url, type) {
  const existing = getLinks(item);
  if (existing.some(l => l.type === type)) return false;
  existing.push({ url, type });
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id: item.id, entityType },
    UpdateExpression: 'SET externalLinks = :links',
    ExpressionAttributeValues: { ':links': JSON.stringify(existing) },
  }));
  return true;
}

// Known person Wikipedia URLs (actors/directors who were rate-limited before)
const PERSON_WIKI = {
  'Billy Crudup': 'https://en.wikipedia.org/wiki/Billy_Crudup',
  'Billy Zane': 'https://en.wikipedia.org/wiki/Billy_Zane',
  'Burt Lancaster': 'https://en.wikipedia.org/wiki/Burt_Lancaster',
  'Cameron Crowe': 'https://en.wikipedia.org/wiki/Cameron_Crowe',
  'Carey Mulligan': 'https://en.wikipedia.org/wiki/Carey_Mulligan',
  'Carl Reiner': 'https://en.wikipedia.org/wiki/Carl_Reiner',
  'Catherine Zeta-Jones': 'https://en.wikipedia.org/wiki/Catherine_Zeta-Jones',
  'Charlize Theron': 'https://en.wikipedia.org/wiki/Charlize_Theron',
  'Christian Bale': 'https://en.wikipedia.org/wiki/Christian_Bale',
  'Christian Slater': 'https://en.wikipedia.org/wiki/Christian_Slater',
  'Christoph Waltz': 'https://en.wikipedia.org/wiki/Christoph_Waltz',
  'Christopher Nolan': 'https://en.wikipedia.org/wiki/Christopher_Nolan',
  'Christopher Plummer': 'https://en.wikipedia.org/wiki/Christopher_Plummer',
  'Christopher Walken': 'https://en.wikipedia.org/wiki/Christopher_Walken',
  'Cillian Murphy': 'https://en.wikipedia.org/wiki/Cillian_Murphy',
  'Claire Danes': 'https://en.wikipedia.org/wiki/Claire_Danes',
  'Claudia Cardinale': 'https://en.wikipedia.org/wiki/Claudia_Cardinale',
  'Cuba Gooding Jr.': 'https://en.wikipedia.org/wiki/Cuba_Gooding_Jr.',
  'Debra Winger': 'https://en.wikipedia.org/wiki/Debra_Winger',
  'Dennis Hopper': 'https://en.wikipedia.org/wiki/Dennis_Hopper',
  'Denzel Washington': 'https://en.wikipedia.org/wiki/Denzel_Washington',
  'Dev Patel': 'https://en.wikipedia.org/wiki/Dev_Patel',
  'Dustin Hoffman': 'https://en.wikipedia.org/wiki/Dustin_Hoffman',
  'Elizabeth Taylor': 'https://en.wikipedia.org/wiki/Elizabeth_Taylor',
  'Emily Blunt': 'https://en.wikipedia.org/wiki/Emily_Blunt',
  'Ethan Hawke': 'https://en.wikipedia.org/wiki/Ethan_Hawke',
  'Ewan McGregor': 'https://en.wikipedia.org/wiki/Ewan_McGregor',
  'Gary Oldman': 'https://en.wikipedia.org/wiki/Gary_Oldman',
  'Glenn Close': 'https://en.wikipedia.org/wiki/Glenn_Close',
  'Harvey Keitel': 'https://en.wikipedia.org/wiki/Harvey_Keitel',
  'Heath Ledger': 'https://en.wikipedia.org/wiki/Heath_Ledger',
  'Helen Hunt': 'https://en.wikipedia.org/wiki/Helen_Hunt',
  'Henry Fonda': 'https://en.wikipedia.org/wiki/Henry_Fonda',
  'Hugh Jackman': 'https://en.wikipedia.org/wiki/Hugh_Jackman',
  'Hugo Weaving': 'https://en.wikipedia.org/wiki/Hugo_Weaving',
  'Jamie Foxx': 'https://en.wikipedia.org/wiki/Jamie_Foxx',
  'Jane Fonda': 'https://en.wikipedia.org/wiki/Jane_Fonda',
  'Jeff Bridges': 'https://en.wikipedia.org/wiki/Jeff_Bridges',
  'Jennifer Grey': 'https://en.wikipedia.org/wiki/Jennifer_Grey',
  'Jessie Buckley': 'https://en.wikipedia.org/wiki/Jessie_Buckley',
  'Jodie Foster': 'https://en.wikipedia.org/wiki/Jodie_Foster',
  'John Goodman': 'https://en.wikipedia.org/wiki/John_Goodman',
  'Jonathan Demme': 'https://en.wikipedia.org/wiki/Jonathan_Demme',
  'Josh Hartnett': 'https://en.wikipedia.org/wiki/Josh_Hartnett',
  'Julianne Moore': 'https://en.wikipedia.org/wiki/Julianne_Moore',
  'Kate Beckinsale': 'https://en.wikipedia.org/wiki/Kate_Beckinsale',
  'Katharine Hepburn': 'https://en.wikipedia.org/wiki/Katharine_Hepburn',
  'Keanu Reeves': 'https://en.wikipedia.org/wiki/Keanu_Reeves',
  'Kelly McGillis': 'https://en.wikipedia.org/wiki/Kelly_McGillis',
  'Leonardo DiCaprio': 'https://en.wikipedia.org/wiki/Leonardo_DiCaprio',
  'Leslie Nielsen': 'https://en.wikipedia.org/wiki/Leslie_Nielsen',
  'Liam Neeson': 'https://en.wikipedia.org/wiki/Liam_Neeson',
  'Luc Besson': 'https://en.wikipedia.org/wiki/Luc_Besson',
  'Lucy Liu': 'https://en.wikipedia.org/wiki/Lucy_Liu',
  'Maggie Smith': 'https://en.wikipedia.org/wiki/Maggie_Smith',
  'Marcello Mastroianni': 'https://en.wikipedia.org/wiki/Marcello_Mastroianni',
  'Margot Robbie': 'https://en.wikipedia.org/wiki/Margot_Robbie',
  'Mark Rylance': 'https://en.wikipedia.org/wiki/Mark_Rylance',
  'Matt Damon': 'https://en.wikipedia.org/wiki/Matt_Damon',
  'Matthew Broderick': 'https://en.wikipedia.org/wiki/Matthew_Broderick',
  'Matthew McConaughey': 'https://en.wikipedia.org/wiki/Matthew_McConaughey',
  'Melanie Griffith': 'https://en.wikipedia.org/wiki/Melanie_Griffith',
  'Meryl Streep': 'https://en.wikipedia.org/wiki/Meryl_Streep',
  'Mike Nichols': 'https://en.wikipedia.org/wiki/Mike_Nichols',
  'Mila Kunis': 'https://en.wikipedia.org/wiki/Mila_Kunis',
  'Milla Jovovich': 'https://en.wikipedia.org/wiki/Milla_Jovovich',
  'Morgan Freeman': 'https://en.wikipedia.org/wiki/Morgan_Freeman',
  'Natalie Portman': 'https://en.wikipedia.org/wiki/Natalie_Portman',
  'Nicole Kidman': 'https://en.wikipedia.org/wiki/Nicole_Kidman',
  'Olivia Newton-John': 'https://en.wikipedia.org/wiki/Olivia_Newton-John',
  'Patricia Arquette': 'https://en.wikipedia.org/wiki/Patricia_Arquette',
  'Patrick Swayze': 'https://en.wikipedia.org/wiki/Patrick_Swayze',
  'Patty Duke': 'https://en.wikipedia.org/wiki/Patty_Duke',
  'Penélope Cruz': 'https://en.wikipedia.org/wiki/Pen%C3%A9lope_Cruz',
  'Quentin Tarantino': 'https://en.wikipedia.org/wiki/Quentin_Tarantino',
  'Regina King': 'https://en.wikipedia.org/wiki/Regina_King',
  'Renée Zellweger': 'https://en.wikipedia.org/wiki/Ren%C3%A9e_Zellweger',
  'Richard Burton': 'https://en.wikipedia.org/wiki/Richard_Burton',
  'Richard Gere': 'https://en.wikipedia.org/wiki/Richard_Gere',
  'Robert De Niro': 'https://en.wikipedia.org/wiki/Robert_De_Niro',
  'Robert Duvall': 'https://en.wikipedia.org/wiki/Robert_Duvall',
  'Russell Crowe': 'https://en.wikipedia.org/wiki/Russell_Crowe',
  'Samuel L. Jackson': 'https://en.wikipedia.org/wiki/Samuel_L._Jackson',
  'Scarlett Johansson': 'https://en.wikipedia.org/wiki/Scarlett_Johansson',
  'Sergio Leone': 'https://en.wikipedia.org/wiki/Sergio_Leone',
  'Sigourney Weaver': 'https://en.wikipedia.org/wiki/Sigourney_Weaver',
  'Stephen Rea': 'https://en.wikipedia.org/wiki/Stephen_Rea',
  'Steve Martin': 'https://en.wikipedia.org/wiki/Steve_Martin',
  'Tilda Swinton': 'https://en.wikipedia.org/wiki/Tilda_Swinton',
  'Tobey Maguire': 'https://en.wikipedia.org/wiki/Tobey_Maguire',
  'Tom Cruise': 'https://en.wikipedia.org/wiki/Tom_Cruise',
  'Tom Hanks': 'https://en.wikipedia.org/wiki/Tom_Hanks',
  'Tom Hardy': 'https://en.wikipedia.org/wiki/Tom_Hardy',
  'Tom Sizemore': 'https://en.wikipedia.org/wiki/Tom_Sizemore',
  'Tony Scott': 'https://en.wikipedia.org/wiki/Tony_Scott',
  'Uma Thurman': 'https://en.wikipedia.org/wiki/Uma_Thurman',
  'Val Kilmer': 'https://en.wikipedia.org/wiki/Val_Kilmer',
  'Viggo Mortensen': 'https://en.wikipedia.org/wiki/Viggo_Mortensen',
  'Whoopi Goldberg': 'https://en.wikipedia.org/wiki/Whoopi_Goldberg',
  // Musicians/artists
  'Bob Dylan': 'https://en.wikipedia.org/wiki/Bob_Dylan',
  'Bob Marley': 'https://en.wikipedia.org/wiki/Bob_Marley',
  'Bobby McFerrin': 'https://en.wikipedia.org/wiki/Bobby_McFerrin',
  'Dario G': 'https://en.wikipedia.org/wiki/Dario_G',
  'Don McLean': 'https://en.wikipedia.org/wiki/Don_McLean',
  'Eric Clapton': 'https://en.wikipedia.org/wiki/Eric_Clapton',
  'Frank Sinatra': 'https://en.wikipedia.org/wiki/Frank_Sinatra',
  'Neil Young': 'https://en.wikipedia.org/wiki/Neil_Young',
  'P!nk': 'https://en.wikipedia.org/wiki/Pink_(singer)',
  'Jaromir Nohavica': 'https://cs.wikipedia.org/wiki/Jarom%C3%ADr_Nohavica',
  'Michal Prokop': 'https://cs.wikipedia.org/wiki/Michal_Prokop',
  'Petr Hapka': 'https://cs.wikipedia.org/wiki/Petr_Hapka',
  'Zdenek Sverak': 'https://cs.wikipedia.org/wiki/Zden%C4%9Bk_Sv%C4%9Br%C3%A1k',
  // Czech persons
  'Jiří Schelinger': 'https://cs.wikipedia.org/wiki/Ji%C5%99%C3%AD_Schelinger',
  'Lou Reed': 'https://en.wikipedia.org/wiki/Lou_Reed',
  'Annie Lennox': 'https://en.wikipedia.org/wiki/Annie_Lennox',
  'Adele': 'https://en.wikipedia.org/wiki/Adele',
  'Chris de Burgh': 'https://en.wikipedia.org/wiki/Chris_de_Burgh',
  'Eric Carmen': 'https://en.wikipedia.org/wiki/Eric_Carmen',
  'Hans Zimmer': 'https://en.wikipedia.org/wiki/Hans_Zimmer',
  'Alannah Myles': 'https://en.wikipedia.org/wiki/Alannah_Myles',
  // Well-known authors
  'Aldous Huxley': 'https://en.wikipedia.org/wiki/Aldous_Huxley',
  'Alois Jirásek': 'https://en.wikipedia.org/wiki/Alois_Jir%C3%A1sek',
  'Karel Hynek Mácha': 'https://en.wikipedia.org/wiki/Karel_Hynek_M%C3%A1cha',
  'Confucius': 'https://en.wikipedia.org/wiki/Confucius',
  'B. K. S. Iyengar': 'https://en.wikipedia.org/wiki/B._K._S._Iyengar',
};

// Well-known book Wikipedia URLs
const BOOK_WIKI = {
  'Siddhartha': 'https://en.wikipedia.org/wiki/Siddhartha_(novel)',
  'The Art of War': 'https://en.wikipedia.org/wiki/The_Art_of_War',
  'Brave New World': 'https://en.wikipedia.org/wiki/Brave_New_World',
  'Light on Yoga': 'https://en.wikipedia.org/wiki/Light_on_Yoga',
  'Pattern Recognition and Machine Learning': 'https://en.wikipedia.org/wiki/Pattern_Recognition_and_Machine_Learning',
  'Bhagavad-gita As It Is': 'https://en.wikipedia.org/wiki/Bhagavad_Gita_As_It_Is',
  'Bhagavad Gita': 'https://en.wikipedia.org/wiki/Bhagavad_Gita',
  'Máj': 'https://cs.wikipedia.org/wiki/M%C3%A1j_(b%C3%A1se%C5%88)',
  'Babička': 'https://cs.wikipedia.org/wiki/Babi%C4%8Dka_(N%C4%9Bmcov%C3%A1)',
  'Kytice': 'https://cs.wikipedia.org/wiki/Kytice_(Erben)',
  'Staré pověsti české': 'https://cs.wikipedia.org/wiki/Star%C3%A9_pov%C4%9Bsti_%C4%8Desk%C3%A9',
};

async function main() {
  const stats = { wikipedia: 0, updated: 0, errors: 0 };

  // ===== PERSONS: add Wikipedia for those who have IMDB but no Wikipedia =====
  console.log('\n=== PERSONS (Wikipedia gap fill) ===');
  const persons = await queryAll('person');
  let personGaps = 0;

  for (const person of persons) {
    const name = person.name || '';
    if (hasType(person, 'wikipedia')) continue;

    let wikiUrl = PERSON_WIKI[name];
    if (!wikiUrl) {
      // Try API for those not hardcoded
      wikiUrl = await wikiSearch(name);
      if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
      await sleep(100);
    }

    if (wikiUrl) {
      try {
        if (await addLink(person, 'person', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          personGaps++;
          console.log(`  ${name}: +wikipedia`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }
  console.log(`  Filled ${personGaps} person Wikipedia gaps`);

  // ===== SHEET MUSIC: match songs from recording links =====
  console.log('\n=== SHEET MUSIC (from recording matches) ===');
  const recordings = await queryAll('recording');
  const recLinkMap = {};
  for (const rec of recordings) {
    const links = getLinks(rec);
    const wiki = links.find(l => l.type === 'wikipedia');
    if (wiki) recLinkMap[(rec.name || '').toLowerCase()] = wiki.url;
  }

  const sheets = await queryAll('sheet_music');
  let sheetMatches = 0;
  for (const sheet of sheets) {
    if (hasType(sheet, 'wikipedia')) continue;
    const name = (sheet.name || '').toLowerCase();

    // Try matching against recording names
    let wikiUrl = recLinkMap[name];

    // Try partial matching (sheet name contained in recording name or vice versa)
    if (!wikiUrl) {
      for (const [recName, url] of Object.entries(recLinkMap)) {
        if (recName.includes(name) || name.includes(recName)) {
          wikiUrl = url;
          break;
        }
      }
    }

    // Try API
    if (!wikiUrl) {
      wikiUrl = await wikiSearch(sheet.name + ' (song)');
      if (!wikiUrl) wikiUrl = await wikiSearch(sheet.name);
      if (!wikiUrl && sheet.artistName) wikiUrl = await wikiSearch(`${sheet.name} ${sheet.artistName}`);
      if (!wikiUrl) wikiUrl = await wikiSearch(sheet.name, 'cs');
      await sleep(100);
    }

    if (wikiUrl) {
      try {
        if (await addLink(sheet, 'sheet_music', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          sheetMatches++;
          console.log(`  ${sheet.name}: +wikipedia`);
        }
      } catch (e) {
        console.error(`  ERROR ${sheet.name}: ${e.message}`);
        stats.errors++;
      }
    }
  }
  console.log(`  Matched ${sheetMatches} sheet music items`);

  // ===== BOOKS: try harder =====
  console.log('\n=== BOOKS ===');
  const books = await queryAll('book');
  let bookMatches = 0;
  for (const book of books) {
    if (hasType(book, 'wikipedia')) continue;
    const name = book.name || '';

    let wikiUrl = BOOK_WIKI[name];
    if (!wikiUrl) {
      wikiUrl = await wikiSearch(name);
      if (!wikiUrl) wikiUrl = await wikiSearch(name + ' (book)');
      if (!wikiUrl) wikiUrl = await wikiSearch(name + ' (novel)');
      if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
      await sleep(100);
    }

    if (wikiUrl) {
      try {
        if (await addLink(book, 'book', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          bookMatches++;
          console.log(`  ${name}: +wikipedia`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }
  console.log(`  Found ${bookMatches} book links`);

  // ===== RECORDINGS: fill remaining gaps via API =====
  console.log('\n=== RECORDINGS (remaining) ===');
  let recGaps = 0;
  for (const rec of recordings) {
    if (hasType(rec, 'wikipedia')) continue;
    const name = rec.name || '';
    if (name.includes('Artist Note')) continue;

    let wikiUrl = await wikiSearch(name + ' (song)');
    if (!wikiUrl) wikiUrl = await wikiSearch(name);
    if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
    await sleep(100);

    if (wikiUrl) {
      try {
        if (await addLink(rec, 'recording', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          recGaps++;
          console.log(`  ${name}: +wikipedia`);
        }
      } catch (e) {
        console.error(`  ERROR ${name}: ${e.message}`);
        stats.errors++;
      }
    }
  }
  console.log(`  Filled ${recGaps} recording gaps`);

  // ===== FINAL COVERAGE =====
  console.log('\n=== SUMMARY ===');
  console.log(`Updated: ${stats.updated}, Wikipedia: ${stats.wikipedia}, Errors: ${stats.errors}`);

  console.log('\n=== FINAL COVERAGE ===');
  for (const type of ['movie','band','person','recording','book','sheet_music']) {
    const items = await queryAll(type);
    const withLinks = items.filter(i => i.externalLinks);
    const linkTypes = {};
    for (const item of withLinks) {
      for (const l of getLinks(item)) {
        linkTypes[l.type] = (linkTypes[l.type] || 0) + 1;
      }
    }
    console.log(`  ${type}: ${withLinks.length}/${items.length} (${Math.round(withLinks.length/items.length*100)}%) — ${JSON.stringify(linkTypes)}`);
  }
}

main().catch(console.error);
