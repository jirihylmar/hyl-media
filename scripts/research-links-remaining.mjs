/**
 * Research Wikipedia links for recordings, books, and sheet music.
 * Run AFTER research-links-all.mjs (which handles persons).
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-remaining.mjs
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

async function wikiOpenSearch(query, lang = 'en') {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json`;
    const res = await fetch(url);
    const [, titles, , urls] = await res.json();
    if (urls && urls.length > 0) {
      const lower = query.toLowerCase();
      for (let i = 0; i < titles.length; i++) {
        const t = titles[i].toLowerCase();
        if (t === lower || t.includes(lower) || lower.includes(t)) return urls[i];
      }
      return urls[0];
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

async function addLink(item, entityType, url, type) {
  const existing = item.externalLinks ? JSON.parse(item.externalLinks) : [];
  if (existing.some(l => l.type === type)) return false;
  existing.push({ url, type });
  if (!DRY_RUN) {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: item.id, entityType },
      UpdateExpression: 'SET externalLinks = :links',
      ExpressionAttributeValues: { ':links': JSON.stringify(existing) },
    }));
  }
  return true;
}

// Well-known recording Wikipedia mappings
const RECORDING_WIKI = {
  'Against All Odds Take a Look At Me Now': 'https://en.wikipedia.org/wiki/Against_All_Odds_(Take_a_Look_at_Me_Now)',
  'Angels': 'https://en.wikipedia.org/wiki/Angels_(Robbie_Williams_song)',
  'Because the Night': 'https://en.wikipedia.org/wiki/Because_the_Night',
  'Beds Are Burning': 'https://en.wikipedia.org/wiki/Beds_Are_Burning',
  'Bitter Sweet Symphony': 'https://en.wikipedia.org/wiki/Bitter_Sweet_Symphony',
  'Black Velvet': 'https://en.wikipedia.org/wiki/Black_Velvet_(song)',
  'Candy': 'https://en.wikipedia.org/wiki/Candy_(Iggy_Pop_song)',
  'Enjoy The Silence': 'https://en.wikipedia.org/wiki/Enjoy_the_Silence',
  'Enter Sandman Live Moscow 1991': 'https://en.wikipedia.org/wiki/Enter_Sandman',
  'Forever Young': 'https://en.wikipedia.org/wiki/Forever_Young_(Alphaville_song)',
  'Here Comes the Rain Again': 'https://en.wikipedia.org/wiki/Here_Comes_the_Rain_Again',
  'Heroes': 'https://en.wikipedia.org/wiki/Heroes_(David_Bowie_song)',
  'Hungry Eyes': 'https://en.wikipedia.org/wiki/Hungry_Eyes',
  'Killing In The Name': 'https://en.wikipedia.org/wiki/Killing_in_the_Name',
  'Let Her Go': 'https://en.wikipedia.org/wiki/Let_Her_Go',
  'Let Me Entertain You': 'https://en.wikipedia.org/wiki/Let_Me_Entertain_You_(Robbie_Williams_song)',
  'Lust For Life': 'https://en.wikipedia.org/wiki/Lust_for_Life_(Iggy_Pop_song)',
  'Me and Bobby McGee': 'https://en.wikipedia.org/wiki/Me_and_Bobby_McGee',
  'Mercedes Benz': 'https://en.wikipedia.org/wiki/Mercedes_Benz_(song)',
  'Mystify': 'https://en.wikipedia.org/wiki/Mystify_(song)',
  'Natural Blues': 'https://en.wikipedia.org/wiki/Natural_Blues',
  'Never Tear Us Apart': 'https://en.wikipedia.org/wiki/Never_Tear_Us_Apart',
  'One': 'https://en.wikipedia.org/wiki/One_(U2_song)',
  'Pale Blue Eyes': 'https://en.wikipedia.org/wiki/Pale_Blue_Eyes',
  'Pure Shores': 'https://en.wikipedia.org/wiki/Pure_Shores',
  'Return To Innocence': 'https://en.wikipedia.org/wiki/Return_to_Innocence',
  'Ring Of Fire': 'https://en.wikipedia.org/wiki/Ring_of_Fire_(song)',
  'Rolling in the Deep': 'https://en.wikipedia.org/wiki/Rolling_in_the_Deep',
  'Secret Garden': 'https://en.wikipedia.org/wiki/Secret_Garden_(Bruce_Springsteen_song)',
  'Shape of My Heart': 'https://en.wikipedia.org/wiki/Shape_of_My_Heart_(Sting_song)',
  'Smack My Bitch Up': 'https://en.wikipedia.org/wiki/Smack_My_Bitch_Up',
  'Still Loving You': 'https://en.wikipedia.org/wiki/Still_Loving_You',
  'Streets of Philadelphia': 'https://en.wikipedia.org/wiki/Streets_of_Philadelphia',
  'Sweet Dreams (Are Made of This)': 'https://en.wikipedia.org/wiki/Sweet_Dreams_(Are_Made_of_This)',
  'Sympathy For The Devil': 'https://en.wikipedia.org/wiki/Sympathy_for_the_Devil',
  'The Sound of Silence': 'https://en.wikipedia.org/wiki/The_Sound_of_Silence',
  'The Trooper': 'https://en.wikipedia.org/wiki/The_Trooper',
  'Thunderstruck': 'https://en.wikipedia.org/wiki/Thunderstruck_(AC/DC_song)',
  'Unchained Melody': 'https://en.wikipedia.org/wiki/Unchained_Melody',
  'Vincent': 'https://en.wikipedia.org/wiki/Vincent_(Don_McLean_song)',
  'Waiting for the Man': 'https://en.wikipedia.org/wiki/I%27m_Waiting_for_the_Man',
  'Walk On The Wild Side': 'https://en.wikipedia.org/wiki/Walk_on_the_Wild_Side_(Lou_Reed_song)',
  'Waterfalls': 'https://en.wikipedia.org/wiki/Waterfalls_(TLC_song)',
  "What's Up": 'https://en.wikipedia.org/wiki/What%27s_Up%3F_(4_Non_Blondes_song)',
  'Whiskey in the Jar': 'https://en.wikipedia.org/wiki/Whiskey_in_the_Jar',
  'Wicked Game': 'https://en.wikipedia.org/wiki/Wicked_Game',
  'With Or Without You': 'https://en.wikipedia.org/wiki/With_or_Without_You',
  'Zombie': 'https://en.wikipedia.org/wiki/Zombie_(The_Cranberries_song)',
  'Time': 'https://en.wikipedia.org/wiki/Time_(Hans_Zimmer_composition)',
  'Bitch': 'https://en.wikipedia.org/wiki/Bitch_(Meredith_Brooks_song)',
  'Got You Babe': 'https://en.wikipedia.org/wiki/I_Got_You_Babe',
  'A Whiter Shade of Pale (Traducäo)': 'https://en.wikipedia.org/wiki/A_Whiter_Shade_of_Pale',
  'Storm': 'https://en.wikipedia.org/wiki/Storm_(Vanessa-Mae_album)',
  'The Cars': 'https://en.wikipedia.org/wiki/The_Cars_(song)',
  'The Lady in Red': 'https://en.wikipedia.org/wiki/The_Lady_in_Red_(Chris_de_Burgh_song)',
  'When you came into my life': 'https://en.wikipedia.org/wiki/When_You_Came_Into_My_Life',
  'Try (The Truth About Love)': 'https://en.wikipedia.org/wiki/Try_(P!nk_song)',
  "What's Up (P!nk version)": 'https://en.wikipedia.org/wiki/What%27s_Up%3F_(4_Non_Blondes_song)',
  'Bad + People Have the Power': 'https://en.wikipedia.org/wiki/People_Have_the_Power',
  'Henry Lee ft. PJ Harvey': 'https://en.wikipedia.org/wiki/Henry_Lee_(song)',
  'Moulin Rouge Children of the Revolution': 'https://en.wikipedia.org/wiki/Children_of_the_Revolution_(song)',
  'TOP GUN Opening Theme': 'https://en.wikipedia.org/wiki/Danger_Zone_(song)',
  'Top Gun (Soundtrack)': 'https://en.wikipedia.org/wiki/Top_Gun_(soundtrack)',
  'The winner takes it all Vance': 'https://en.wikipedia.org/wiki/The_Winner_Takes_It_All',
  'Ladyhawke - I\'ll Stand By You': 'https://en.wikipedia.org/wiki/I%27ll_Stand_by_You',
};

// Czech recording Wikipedia mappings
const RECORDING_WIKI_CS = {
  'Jednoho dne se vrátiš (Tenkrát na západě)': 'https://cs.wikipedia.org/wiki/Tenkr%C3%A1t_na_Z%C3%A1pad%C4%9B_(film)',
  'Švihák lázeňský': 'https://cs.wikipedia.org/wiki/%C5%A0vih%C3%A1k_l%C3%A1ze%C5%88sk%C3%BD',
};

// Well-known book Wikipedia mappings
const BOOK_WIKI = {
  // Major international works
  'Bhagavad Gita As It Is': 'https://en.wikipedia.org/wiki/Bhagavad_Gita_As_It_Is',
  'Siddhartha': 'https://en.wikipedia.org/wiki/Siddhartha_(novel)',
  'The Art of War': 'https://en.wikipedia.org/wiki/The_Art_of_War',
  'The Doors of Perception': 'https://en.wikipedia.org/wiki/The_Doors_of_Perception',
  'Brave New World': 'https://en.wikipedia.org/wiki/Brave_New_World',
  'Animal Farm': 'https://en.wikipedia.org/wiki/Animal_Farm',
  '1984': 'https://en.wikipedia.org/wiki/Nineteen_Eighty-Four',
  'Light on Yoga': 'https://en.wikipedia.org/wiki/Light_on_Yoga',
  'Pattern Recognition and Machine Learning': 'https://en.wikipedia.org/wiki/Pattern_Recognition_and_Machine_Learning',
};

// Sheet music = songs, similar mapping
const SHEET_WIKI = {
  'Against All Odds': 'https://en.wikipedia.org/wiki/Against_All_Odds_(Take_a_Look_at_Me_Now)',
  'Angels': 'https://en.wikipedia.org/wiki/Angels_(Robbie_Williams_song)',
  'Because The Night': 'https://en.wikipedia.org/wiki/Because_the_Night',
  'Beds Are Burning': 'https://en.wikipedia.org/wiki/Beds_Are_Burning',
  'Bitter Sweet Symphony': 'https://en.wikipedia.org/wiki/Bitter_Sweet_Symphony',
  'Black Velvet': 'https://en.wikipedia.org/wiki/Black_Velvet_(song)',
  'Enjoy The Silence': 'https://en.wikipedia.org/wiki/Enjoy_the_Silence',
  'Enter Sandman': 'https://en.wikipedia.org/wiki/Enter_Sandman',
  'Forever Young': 'https://en.wikipedia.org/wiki/Forever_Young_(Alphaville_song)',
  'Here Comes The Rain Again': 'https://en.wikipedia.org/wiki/Here_Comes_the_Rain_Again',
  'Heroes': 'https://en.wikipedia.org/wiki/Heroes_(David_Bowie_song)',
  'Hungry Eyes': 'https://en.wikipedia.org/wiki/Hungry_Eyes',
  'Killing In The Name': 'https://en.wikipedia.org/wiki/Killing_in_the_Name',
  'Let Her Go': 'https://en.wikipedia.org/wiki/Let_Her_Go',
  'Lust For Life': 'https://en.wikipedia.org/wiki/Lust_for_Life_(Iggy_Pop_song)',
  'Me And Bobby McGee': 'https://en.wikipedia.org/wiki/Me_and_Bobby_McGee',
  'Mercedes Benz': 'https://en.wikipedia.org/wiki/Mercedes_Benz_(song)',
  'Mystify': 'https://en.wikipedia.org/wiki/Mystify_(song)',
  'Natural Blues': 'https://en.wikipedia.org/wiki/Natural_Blues',
  'Never Tear Us Apart': 'https://en.wikipedia.org/wiki/Never_Tear_Us_Apart',
  'One': 'https://en.wikipedia.org/wiki/One_(U2_song)',
  'Pale Blue Eyes': 'https://en.wikipedia.org/wiki/Pale_Blue_Eyes',
  'Pure Shores': 'https://en.wikipedia.org/wiki/Pure_Shores',
  'Return To Innocence': 'https://en.wikipedia.org/wiki/Return_to_Innocence',
  'Ring Of Fire': 'https://en.wikipedia.org/wiki/Ring_of_Fire_(song)',
  'Rolling In The Deep': 'https://en.wikipedia.org/wiki/Rolling_in_the_Deep',
  'Shape Of My Heart': 'https://en.wikipedia.org/wiki/Shape_of_My_Heart_(Sting_song)',
  'Smack My Bitch Up': 'https://en.wikipedia.org/wiki/Smack_My_Bitch_Up',
  'Still Loving You': 'https://en.wikipedia.org/wiki/Still_Loving_You',
  'Streets Of Philadelphia': 'https://en.wikipedia.org/wiki/Streets_of_Philadelphia',
  'Sweet Dreams': 'https://en.wikipedia.org/wiki/Sweet_Dreams_(Are_Made_of_This)',
  'Sympathy For The Devil': 'https://en.wikipedia.org/wiki/Sympathy_for_the_Devil',
  'The Sound Of Silence': 'https://en.wikipedia.org/wiki/The_Sound_of_Silence',
  'The Trooper': 'https://en.wikipedia.org/wiki/The_Trooper',
  'Thunderstruck': 'https://en.wikipedia.org/wiki/Thunderstruck_(AC/DC_song)',
  'Unchained Melody': 'https://en.wikipedia.org/wiki/Unchained_Melody',
  'Vincent': 'https://en.wikipedia.org/wiki/Vincent_(Don_McLean_song)',
  'Walk On The Wild Side': 'https://en.wikipedia.org/wiki/Walk_on_the_Wild_Side_(Lou_Reed_song)',
  'Waterfalls': 'https://en.wikipedia.org/wiki/Waterfalls_(TLC_song)',
  "What's Up": 'https://en.wikipedia.org/wiki/What%27s_Up%3F_(4_Non_Blondes_song)',
  'Whiskey In The Jar': 'https://en.wikipedia.org/wiki/Whiskey_in_the_Jar',
  'Wicked Game': 'https://en.wikipedia.org/wiki/Wicked_Game',
  'With Or Without You': 'https://en.wikipedia.org/wiki/With_or_Without_You',
  'Zombie': 'https://en.wikipedia.org/wiki/Zombie_(The_Cranberries_song)',
  'Secret Garden': 'https://en.wikipedia.org/wiki/Secret_Garden_(Bruce_Springsteen_song)',
  'The Lady In Red': 'https://en.wikipedia.org/wiki/The_Lady_in_Red_(Chris_de_Burgh_song)',
  'Candy': 'https://en.wikipedia.org/wiki/Candy_(Iggy_Pop_song)',
  'Let Me Entertain You': 'https://en.wikipedia.org/wiki/Let_Me_Entertain_You_(Robbie_Williams_song)',
  'Try': 'https://en.wikipedia.org/wiki/Try_(P!nk_song)',
  'Bitch': 'https://en.wikipedia.org/wiki/Bitch_(Meredith_Brooks_song)',
  'People Have The Power': 'https://en.wikipedia.org/wiki/People_Have_the_Power',
  "I Got You Babe": 'https://en.wikipedia.org/wiki/I_Got_You_Babe',
  'Henry Lee': 'https://en.wikipedia.org/wiki/Henry_Lee_(song)',
  'I\'ll Stand By You': 'https://en.wikipedia.org/wiki/I%27ll_Stand_by_You',
  'When You Came Into My Life': 'https://en.wikipedia.org/wiki/When_You_Came_Into_My_Life',
  'A Whiter Shade Of Pale': 'https://en.wikipedia.org/wiki/A_Whiter_Shade_of_Pale',
  'The Winner Takes It All': 'https://en.wikipedia.org/wiki/The_Winner_Takes_It_All',
  'Children Of The Revolution': 'https://en.wikipedia.org/wiki/Children_of_the_Revolution_(song)',
};

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  const stats = { wikipedia: 0, updated: 0, errors: 0, skipped: 0 };

  // ===================== RECORDINGS =====================
  console.log('\n=== RECORDINGS ===');
  const recordings = await queryAll('recording');
  const recNoLinks = recordings.filter(r => !r.externalLinks);
  console.log(`${recNoLinks.length} without links`);

  for (const rec of recNoLinks) {
    const name = rec.name || '';
    if (name.includes('Artist Note')) { stats.skipped++; continue; }

    // Check hardcoded first
    let wikiUrl = RECORDING_WIKI[name] || RECORDING_WIKI_CS[name];

    // If not hardcoded, try API
    if (!wikiUrl) {
      wikiUrl = await wikiSearch(name + ' (song)');
      if (!wikiUrl) wikiUrl = await wikiSearch(name);
      if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
      await sleep(120);
    }

    if (wikiUrl) {
      try {
        if (await addLink(rec, 'recording', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          console.log(`  ${name}: +wikipedia`);
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
  console.log(`${bookNoLinks.length} without links`);

  for (const book of bookNoLinks) {
    const name = book.name || '';

    // Check hardcoded first
    let wikiUrl = BOOK_WIKI[name];

    // If not hardcoded, try API
    if (!wikiUrl) {
      wikiUrl = await wikiSearch(name);
      if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
      await sleep(120);
    }

    if (wikiUrl) {
      try {
        if (await addLink(book, 'book', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          console.log(`  ${name}: +wikipedia`);
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
  console.log(`${sheetNoLinks.length} without links`);

  for (const sheet of sheetNoLinks) {
    const name = sheet.name || '';

    // Check hardcoded first (case-insensitive match)
    let wikiUrl = null;
    for (const [key, url] of Object.entries(SHEET_WIKI)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        wikiUrl = url;
        break;
      }
    }

    // If not hardcoded, try API
    if (!wikiUrl) {
      wikiUrl = await wikiSearch(name + ' (song)');
      if (!wikiUrl) wikiUrl = await wikiSearch(name);
      if (!wikiUrl) wikiUrl = await wikiSearch(name, 'cs');
      await sleep(120);
    }

    if (wikiUrl) {
      try {
        if (await addLink(sheet, 'sheet_music', wikiUrl, 'wikipedia')) {
          stats.wikipedia++;
          stats.updated++;
          console.log(`  ${name}: +wikipedia`);
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
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);

  // Final coverage report
  console.log('\n=== FINAL COVERAGE ===');
  for (const type of ['movie','band','person','recording','book','sheet_music']) {
    const items = await queryAll(type);
    const withLinks = items.filter(i => i.externalLinks);
    console.log(`  ${type}: ${withLinks.length}/${items.length} with links (${Math.round(withLinks.length/items.length*100)}%)`);
  }
}

main().catch(console.error);
