/**
 * Final pass 2 — hardcoded links for remaining well-known items.
 * Musicians, actors, well-known sheet music songs, Czech recordings.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-final2.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = 'KnowledgeGraphItem-g7elqzchivgt3g2i2zs6rfn64u-NONE';
const REGION = 'eu-central-1';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

async function queryAll(t) {
  const items = []; let k;
  do { const r = await client.send(new QueryCommand({ TableName: TABLE, IndexName: 'byType', KeyConditionExpression: 'entityType = :t', ExpressionAttributeValues: { ':t': t }, ExclusiveStartKey: k })); items.push(...(r.Items||[])); k = r.LastEvaluatedKey; } while(k);
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
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id: item.id, entityType },
    UpdateExpression: 'SET externalLinks = :links',
    ExpressionAttributeValues: { ':links': JSON.stringify(merged) },
  }));
  return toAdd.length;
}

// === MUSICIANS Wikipedia + optional IMDB ===
const MUSICIAN_LINKS = {
  'Bruce Springsteen': { wiki: 'https://en.wikipedia.org/wiki/Bruce_Springsteen' },
  'Chris Isaak': { wiki: 'https://en.wikipedia.org/wiki/Chris_Isaak' },
  'David Bowie': { wiki: 'https://en.wikipedia.org/wiki/David_Bowie' },
  'Iggy Pop': { wiki: 'https://en.wikipedia.org/wiki/Iggy_Pop' },
  'Janis Joplin': { wiki: 'https://en.wikipedia.org/wiki/Janis_Joplin' },
  'Johnny Cash': { wiki: 'https://en.wikipedia.org/wiki/Johnny_Cash' },
  'Meredith Brooks': { wiki: 'https://en.wikipedia.org/wiki/Meredith_Brooks' },
  'Miro Žbirka': { wiki: 'https://en.wikipedia.org/wiki/Miro_%C5%BDbirka' },
  'Moby': { wiki: 'https://en.wikipedia.org/wiki/Moby' },
  'Norah Jones': { wiki: 'https://en.wikipedia.org/wiki/Norah_Jones' },
  'Passenger': { wiki: 'https://en.wikipedia.org/wiki/Passenger_(singer)' },
  'Phil Collins': { wiki: 'https://en.wikipedia.org/wiki/Phil_Collins' },
  'Richard Müller': { wiki: 'https://en.wikipedia.org/wiki/Richard_M%C3%BCller_(singer)' },
  'Robbie Williams': { wiki: 'https://en.wikipedia.org/wiki/Robbie_Williams' },
  'Sade': { wiki: 'https://en.wikipedia.org/wiki/Sade_(band)' },
  'Sonny and Cher': { wiki: 'https://en.wikipedia.org/wiki/Sonny_%26_Cher' },
  'Sting': { wiki: 'https://en.wikipedia.org/wiki/Sting_(musician)' },
  'Vanessa-Mae': { wiki: 'https://en.wikipedia.org/wiki/Vanessa-Mae' },
  'Vladimír Mišík': { wiki: 'https://cs.wikipedia.org/wiki/Vladim%C3%ADr_Mi%C5%A1%C3%ADk' },
  'Petr Kalandra': { wiki: 'https://cs.wikipedia.org/wiki/Petr_Kalandra' },
  'Kalandra': { wiki: 'https://cs.wikipedia.org/wiki/Petr_Kalandra' },
};

// === ACTORS Wikipedia + IMDB ===
const ACTOR_LINKS = {
  'C. Thomas Howell': { wiki: 'https://en.wikipedia.org/wiki/C._Thomas_Howell', imdb: 'nm0001368' },
  'Cary Elwes': { wiki: 'https://en.wikipedia.org/wiki/Cary_Elwes', imdb: 'nm0000144' },
  'Chris Pine': { wiki: 'https://en.wikipedia.org/wiki/Chris_Pine', imdb: 'nm1517976' },
  'Christopher Eccleston': { wiki: 'https://en.wikipedia.org/wiki/Christopher_Eccleston', imdb: 'nm0001172' },
  'David Keith': { wiki: 'https://en.wikipedia.org/wiki/David_Keith_(actor)', imdb: 'nm0445643' },
  'Eli Wallach': { wiki: 'https://en.wikipedia.org/wiki/Eli_Wallach', imdb: 'nm0908324' },
  'Emile Ardolino': { wiki: 'https://en.wikipedia.org/wiki/Emile_Ardolino', imdb: 'nm0033802' },
  'Emmanuelle Béart': { wiki: 'https://en.wikipedia.org/wiki/Emmanuelle_B%C3%A9art', imdb: 'nm0000889' },
  'Ewen Bremner': { wiki: 'https://en.wikipedia.org/wiki/Ewen_Bremner', imdb: 'nm0107338' },
  'Finn Wittrock': { wiki: 'https://en.wikipedia.org/wiki/Finn_Wittrock', imdb: 'nm2214597' },
  'Fionnula Flanagan': { wiki: 'https://en.wikipedia.org/wiki/Fionnula_Flanagan', imdb: 'nm0281492' },
  'Freida Pinto': { wiki: 'https://en.wikipedia.org/wiki/Freida_Pinto', imdb: 'nm2951768' },
  'George Segal': { wiki: 'https://en.wikipedia.org/wiki/George_Segal', imdb: 'nm0001718' },
  'Gian Maria Volonté': { wiki: 'https://en.wikipedia.org/wiki/Gian_Maria_Volont%C3%A9', imdb: 'nm0901827' },
  'Jane Darwell': { wiki: 'https://en.wikipedia.org/wiki/Jane_Darwell', imdb: 'nm0001106' },
  'Jerry Orbach': { wiki: 'https://en.wikipedia.org/wiki/Jerry_Orbach', imdb: 'nm0001581' },
  'John C. Reilly': { wiki: 'https://en.wikipedia.org/wiki/John_C._Reilly', imdb: 'nm0000604' },
  'John Carradine': { wiki: 'https://en.wikipedia.org/wiki/John_Carradine', imdb: 'nm0001016' },
  'John Leguizamo': { wiki: 'https://en.wikipedia.org/wiki/John_Leguizamo', imdb: 'nm0000491' },
  'Jon Voight': { wiki: 'https://en.wikipedia.org/wiki/Jon_Voight', imdb: 'nm0000685' },
  'Jonny Lee Miller': { wiki: 'https://en.wikipedia.org/wiki/Jonny_Lee_Miller', imdb: 'nm0000543' },
  'Julie Hagerty': { wiki: 'https://en.wikipedia.org/wiki/Julie_Hagerty', imdb: 'nm0353470' },
  'Karen Lynn Gorney': { wiki: 'https://en.wikipedia.org/wiki/Karen_Lynn_Gorney', imdb: 'nm0331175' },
  'Katharine Ross': { wiki: 'https://en.wikipedia.org/wiki/Katharine_Ross', imdb: 'nm0001687' },
  'Kerry Washington': { wiki: 'https://en.wikipedia.org/wiki/Kerry_Washington', imdb: 'nm0913488' },
  'Lea Thompson': { wiki: 'https://en.wikipedia.org/wiki/Lea_Thompson', imdb: 'nm0000670' },
  'Lee J. Cobb': { wiki: 'https://en.wikipedia.org/wiki/Lee_J._Cobb', imdb: 'nm0002011' },
  'Lee Van Cleef': { wiki: 'https://en.wikipedia.org/wiki/Lee_Van_Cleef', imdb: 'nm0001806' },
  'Maggie Gyllenhaal': { wiki: 'https://en.wikipedia.org/wiki/Maggie_Gyllenhaal', imdb: 'nm0350454' },
  'Marianne Koch': { wiki: 'https://en.wikipedia.org/wiki/Marianne_Koch', imdb: 'nm0462282' },
  'Martin Balsam': { wiki: 'https://en.wikipedia.org/wiki/Martin_Balsam', imdb: 'nm0000842' },
  'Meg Tilly': { wiki: 'https://en.wikipedia.org/wiki/Meg_Tilly', imdb: 'nm0001797' },
  'Min-sik Choi': { wiki: 'https://en.wikipedia.org/wiki/Choi_Min-sik', imdb: 'nm0158856' },
  'Naomie Harris': { wiki: 'https://en.wikipedia.org/wiki/Naomie_Harris', imdb: 'nm0365140' },
  'Natascha McElhone': { wiki: 'https://en.wikipedia.org/wiki/Natascha_McElhone', imdb: 'nm0005212' },
  'Nick Searcy': { wiki: 'https://en.wikipedia.org/wiki/Nick_Searcy', imdb: 'nm0781029' },
  'O.J. Simpson': { wiki: 'https://en.wikipedia.org/wiki/O._J._Simpson', imdb: 'nm0001740' },
  'Patrick Fugit': { wiki: 'https://en.wikipedia.org/wiki/Patrick_Fugit', imdb: 'nm0297647' },
  'Priscilla Presley': { wiki: 'https://en.wikipedia.org/wiki/Priscilla_Presley', imdb: 'nm0001638' },
  'Rachel Ward': { wiki: 'https://en.wikipedia.org/wiki/Rachel_Ward', imdb: 'nm0001832' },
  'Richard Chamberlain': { wiki: 'https://en.wikipedia.org/wiki/Richard_Chamberlain', imdb: 'nm0001039' },
  'Robert Hays': { wiki: 'https://en.wikipedia.org/wiki/Robert_Hays', imdb: 'nm0001330' },
  'Rosemarie DeWitt': { wiki: 'https://en.wikipedia.org/wiki/Rosemarie_DeWitt', imdb: 'nm1679669' },
  'Scott Glenn': { wiki: 'https://en.wikipedia.org/wiki/Scott_Glenn', imdb: 'nm0001277' },
  'Stockard Channing': { wiki: 'https://en.wikipedia.org/wiki/Stockard_Channing', imdb: 'nm0001035' },
  'Steve Guttenberg': { wiki: 'https://en.wikipedia.org/wiki/Steve_Guttenberg', imdb: 'nm0000430' },
  'Taylor Hackford': { wiki: 'https://en.wikipedia.org/wiki/Taylor_Hackford', imdb: 'nm0352519' },
  'Ted Danson': { wiki: 'https://en.wikipedia.org/wiki/Ted_Danson', imdb: 'nm0001100' },
  'Tom Selleck': { wiki: 'https://en.wikipedia.org/wiki/Tom_Selleck', imdb: 'nm0000633' },
  'Tom Wilkinson': { wiki: 'https://en.wikipedia.org/wiki/Tom_Wilkinson', imdb: 'nm0929489' },
  'Valeria Golino': { wiki: 'https://en.wikipedia.org/wiki/Valeria_Golino', imdb: 'nm0001283' },
  'Victor Jory': { wiki: 'https://en.wikipedia.org/wiki/Victor_Jory', imdb: 'nm0430419' },
  'Vincent Cassel': { wiki: 'https://en.wikipedia.org/wiki/Vincent_Cassel', imdb: 'nm0001993' },
  'Albert Hall': { wiki: 'https://en.wikipedia.org/wiki/Albert_Hall_(actor)', imdb: 'nm0355932' },
  'Angela Bassett': { wiki: 'https://en.wikipedia.org/wiki/Angela_Bassett', imdb: 'nm0000291' },
  'Anil Kapoor': { wiki: 'https://en.wikipedia.org/wiki/Anil_Kapoor', imdb: 'nm0004246' },
  'Barry Miller': { wiki: 'https://en.wikipedia.org/wiki/Barry_Miller_(actor)', imdb: 'nm0589014' },
  'David Carradine': { wiki: 'https://en.wikipedia.org/wiki/David_Carradine', imdb: 'nm0001016' },
};

// === SHEET MUSIC Wikipedia (well-known songs) ===
const SHEET_WIKI = {
  'American Pie': 'https://en.wikipedia.org/wiki/American_Pie_(song)',
  'Angie': 'https://en.wikipedia.org/wiki/Angie_(The_Rolling_Stones_song)',
  'Angie Acoustic': 'https://en.wikipedia.org/wiki/Angie_(The_Rolling_Stones_song)',
  'Angie Chords': 'https://en.wikipedia.org/wiki/Angie_(The_Rolling_Stones_song)',
  'Ashes To Ashes': 'https://en.wikipedia.org/wiki/Ashes_to_Ashes_(David_Bowie_song)',
  'Blowin In The Wind Chords': 'https://en.wikipedia.org/wiki/Blowin%27_in_the_Wind',
  'Bobby Brown': 'https://en.wikipedia.org/wiki/Bobby_Brown_(Frank_Zappa_song)',
  'Cocaine': 'https://en.wikipedia.org/wiki/Cocaine_(song)',
  'Dancing Barefoot': 'https://en.wikipedia.org/wiki/Dancing_Barefoot',
  'Dignity': 'https://en.wikipedia.org/wiki/Dignity_(Bob_Dylan_song)',
  'Dont Worry Be Happy': 'https://en.wikipedia.org/wiki/Don%27t_Worry,_Be_Happy',
  'Every Breath You Take': 'https://en.wikipedia.org/wiki/Every_Breath_You_Take',
  'Fields Of Gold Chords¨¨': 'https://en.wikipedia.org/wiki/Fields_of_Gold',
  'Heart Of Gold': 'https://en.wikipedia.org/wiki/Heart_of_Gold_(Neil_Young_song)',
  'Heroin': 'https://en.wikipedia.org/wiki/Heroin_(song)',
  'Hotel California': 'https://en.wikipedia.org/wiki/Hotel_California_(Eagles_song)',
  'Hotel California (2)': 'https://en.wikipedia.org/wiki/Hotel_California_(Eagles_song)',
  'House Of The Rising Sun': 'https://en.wikipedia.org/wiki/The_House_of_the_Rising_Sun',
  'House Of The Rising Sun (2)': 'https://en.wikipedia.org/wiki/The_House_of_the_Rising_Sun',
  'Hurricane': 'https://en.wikipedia.org/wiki/Hurricane_(Bob_Dylan_song)',
  'I Shot The Sheriff': 'https://en.wikipedia.org/wiki/I_Shot_the_Sheriff',
  'I Still Havent Found What Im Looking For': 'https://en.wikipedia.org/wiki/I_Still_Haven%27t_Found_What_I%27m_Looking_For',
  'Just Like A Woman': 'https://en.wikipedia.org/wiki/Just_Like_a_Woman',
  'Knocking On Heavens Door Chords': 'https://en.wikipedia.org/wiki/Knockin%27_on_Heaven%27s_Door',
  'Lay Lady Lay Chords': 'https://en.wikipedia.org/wiki/Lay_Lady_Lay',
  'Lemon Tree Chords': 'https://en.wikipedia.org/wiki/Lemon_Tree_(Fools_Garden_song)',
  'Life On Mars': 'https://en.wikipedia.org/wiki/Life_on_Mars%3F_(song)',
  'Light My Fire': 'https://en.wikipedia.org/wiki/Light_My_Fire',
  'Love Street': 'https://en.wikipedia.org/wiki/Love_Street_(The_Doors_song)',
  'Mr Tambourine Man': 'https://en.wikipedia.org/wiki/Mr._Tambourine_Man',
  'My Way - tabs': 'https://en.wikipedia.org/wiki/My_Way',
  'My Way Chords': 'https://en.wikipedia.org/wiki/My_Way',
  'Natural Woman Chords': 'https://en.wikipedia.org/wiki/(You_Make_Me_Feel_Like)_A_Natural_Woman',
  'No Woman No Cry': 'https://en.wikipedia.org/wiki/No_Woman,_No_Cry',
  'People Are Strange': 'https://en.wikipedia.org/wiki/People_Are_Strange',
  'Perfect Day': 'https://en.wikipedia.org/wiki/Perfect_Day_(Lou_Reed_song)',
  'Riders On The Storm': 'https://en.wikipedia.org/wiki/Riders_on_the_Storm',
  'Ruby Tuesday': 'https://en.wikipedia.org/wiki/Ruby_Tuesday_(song)',
  'Say A Little Prayer': 'https://en.wikipedia.org/wiki/I_Say_a_Little_Prayer',
  'Ship Song': 'https://en.wikipedia.org/wiki/The_Ship_Song',
  'Space Oddity': 'https://en.wikipedia.org/wiki/Space_Oddity_(song)',
  'Strangers In The Night Chords': 'https://en.wikipedia.org/wiki/Strangers_in_the_Night',
  'Sunday Morning': 'https://en.wikipedia.org/wiki/Sunday_Morning_(The_Velvet_Underground_song)',
  'The Times They Are A-changin': 'https://en.wikipedia.org/wiki/The_Times_They_Are_a-Changin%27_(song)',
  'Where The Streets Have No Name': 'https://en.wikipedia.org/wiki/Where_the_Streets_Have_No_Name',
  'Where The Wild Roses Grow': 'https://en.wikipedia.org/wiki/Where_the_Wild_Roses_Grow',
  'Wild Horses': 'https://en.wikipedia.org/wiki/Wild_Horses_(Rolling_Stones_song)',
  'You Cant Always Get What You Want': 'https://en.wikipedia.org/wiki/You_Can%27t_Always_Get_What_You_Want',
  'Ziggy Stardust Chords': 'https://en.wikipedia.org/wiki/Ziggy_Stardust_(song)',
  'Alice': 'https://en.wikipedia.org/wiki/Alice_(Smokie_song)',
  // Czech songs
  'Balada o poľných vtákoch': 'https://sk.wikipedia.org/wiki/Balada_o_po%C4%BEn%C3%BDch_vt%C3%A1koch',
  'Slunečný hrob (akordy a text)': 'https://cs.wikipedia.org/wiki/Slune%C4%8Dn%C3%BD_hrob',
};

// === RECORDING Wikipedia (remaining Czech/specific) ===
const RECORDING_WIKI = {
  'Time Is On My Side': 'https://en.wikipedia.org/wiki/Time_Is_on_My_Side',
  'Ladyhawke - I\'Il Stand By You': 'https://en.wikipedia.org/wiki/I%27ll_Stand_by_You',
  'Voices': 'https://en.wikipedia.org/wiki/Voices_(Cheap_Trick_song)',
};

async function main() {
  let updated = 0;

  // === PERSONS (musicians + actors) ===
  console.log('=== PERSONS ===');
  const persons = await queryAll('person');

  for (const person of persons) {
    const name = person.name || '';
    const links = [];

    // Musicians
    if (MUSICIAN_LINKS[name]) {
      const m = MUSICIAN_LINKS[name];
      if (m.wiki && !getLinks(person).some(l => l.type === 'wikipedia')) {
        links.push({ url: m.wiki, type: 'wikipedia' });
      }
    }

    // Actors
    if (ACTOR_LINKS[name]) {
      const a = ACTOR_LINKS[name];
      if (a.wiki && !getLinks(person).some(l => l.type === 'wikipedia')) {
        links.push({ url: a.wiki, type: 'wikipedia' });
      }
      if (a.imdb && !getLinks(person).some(l => l.type === 'imdb')) {
        links.push({ url: `https://www.imdb.com/name/${a.imdb}/`, type: 'imdb' });
      }
    }

    if (links.length > 0) {
      const added = await addLinks(person, 'person', links);
      if (added > 0) {
        updated++;
        console.log(`  ${name}: +${added} (${links.map(l=>l.type).join(', ')})`);
      }
    }
  }

  // === RECORDINGS ===
  console.log('\n=== RECORDINGS ===');
  const recordings = await queryAll('recording');
  for (const rec of recordings) {
    const name = rec.name || '';
    if (RECORDING_WIKI[name] && !getLinks(rec).some(l => l.type === 'wikipedia')) {
      if (await addLinks(rec, 'recording', [{ url: RECORDING_WIKI[name], type: 'wikipedia' }])) {
        updated++;
        console.log(`  ${name}: +wikipedia`);
      }
    }
  }

  // === SHEET MUSIC ===
  console.log('\n=== SHEET MUSIC ===');
  const sheets = await queryAll('sheet_music');
  for (const sheet of sheets) {
    const name = sheet.name || '';
    if (SHEET_WIKI[name] && !getLinks(sheet).some(l => l.type === 'wikipedia')) {
      if (await addLinks(sheet, 'sheet_music', [{ url: SHEET_WIKI[name], type: 'wikipedia' }])) {
        updated++;
        console.log(`  ${name}: +wikipedia`);
      }
    }
  }

  console.log(`\nTotal updated: ${updated}`);

  // === FINAL COVERAGE ===
  console.log('\n=== FINAL COVERAGE ===');
  for (const type of ['movie','band','person','recording','book','sheet_music']) {
    const items = await queryAll(type);
    const withLinks = items.filter(i => i.externalLinks);
    const linkTypes = {};
    for (const item of withLinks) {
      for (const l of getLinks(item)) { linkTypes[l.type] = (linkTypes[l.type] || 0) + 1; }
    }
    console.log(`  ${type}: ${withLinks.length}/${items.length} (${Math.round(withLinks.length/items.length*100)}%) — ${JSON.stringify(linkTypes)}`);
  }
}

main().catch(console.error);
