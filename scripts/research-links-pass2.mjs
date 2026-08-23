/**
 * Second pass — add missing Wikipedia links that the API lookup missed.
 * Hardcoded correct URLs for all missing movies and bands.
 *
 * Usage:
 *   AWS_PROFILE=JiHy__vsb__299 AWS_REGION=eu-central-1 node scripts/research-links-pass2.mjs
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

// Movies that missed Wikipedia in pass 1
const MOVIE_WIKI = {
  'The Beach': 'https://en.wikipedia.org/wiki/The_Beach_(film)',
  'The Da Vinci Code': 'https://en.wikipedia.org/wiki/The_Da_Vinci_Code_(film)',
  'The Devil Wears Prada': 'https://en.wikipedia.org/wiki/The_Devil_Wears_Prada_(film)',
  'The Fifth Element': 'https://en.wikipedia.org/wiki/The_Fifth_Element',
  'The Graduate': 'https://en.wikipedia.org/wiki/The_Graduate',
  'The Great Gatsby': 'https://en.wikipedia.org/wiki/The_Great_Gatsby_(2013_film)',
  'The Leopard': 'https://en.wikipedia.org/wiki/The_Leopard_(film)',
  'The Naked Gun': 'https://en.wikipedia.org/wiki/The_Naked_Gun:_From_the_Files_of_Police_Squad!',
  'The Silence of the Lambs': 'https://en.wikipedia.org/wiki/The_Silence_of_the_Lambs_(film)',
  'The Wolf of Wall Street': 'https://en.wikipedia.org/wiki/The_Wolf_of_Wall_Street_(2013_film)',
  'Titanic': 'https://en.wikipedia.org/wiki/Titanic_(1997_film)',
  'Top Gun': 'https://en.wikipedia.org/wiki/Top_Gun',
  'Trainspotting': 'https://en.wikipedia.org/wiki/Trainspotting_(film)',
  'True Grit': 'https://en.wikipedia.org/wiki/True_Grit_(2010_film)',
  'V for Vendetta': 'https://en.wikipedia.org/wiki/V_for_Vendetta_(film)',
  'We Need to Talk About Kevin': 'https://en.wikipedia.org/wiki/We_Need_to_Talk_About_Kevin_(film)',
  'Witness': 'https://en.wikipedia.org/wiki/Witness_(1985_film)',
  'Working Girl': 'https://en.wikipedia.org/wiki/Working_Girl',
};

// Bands missing Wikipedia — includes Czech/Slovak bands on cs.wikipedia
const BAND_WIKI = {
  'AC/DC': 'https://en.wikipedia.org/wiki/AC/DC',
  'Alphaville': 'https://en.wikipedia.org/wiki/Alphaville_(band)',
  'Blue Effect': 'https://en.wikipedia.org/wiki/Blue_Effect',
  'Eagles': 'https://en.wikipedia.org/wiki/Eagles_(band)',
  'Elan': 'https://en.wikipedia.org/wiki/El%C3%A1n',
  'Enigma': 'https://en.wikipedia.org/wiki/Enigma_(German_band)',
  'Fools Garden': 'https://en.wikipedia.org/wiki/Fools_Garden',
  'Greenhorns': 'https://en.wikipedia.org/wiki/Greenhorns',
  'Iron Maiden': 'https://en.wikipedia.org/wiki/Iron_Maiden',
  'Katapult': 'https://en.wikipedia.org/wiki/Katapult_(band)',
  'Metallica': 'https://en.wikipedia.org/wiki/Metallica',
  'Modern Talking': 'https://en.wikipedia.org/wiki/Modern_Talking',
  'Nick Cave & The Bad Seeds': 'https://en.wikipedia.org/wiki/Nick_Cave_and_the_Bad_Seeds',
  'Patti Smith Group': 'https://en.wikipedia.org/wiki/Patti_Smith_Group',
  'Righteous Brothers': 'https://en.wikipedia.org/wiki/The_Righteous_Brothers',
  'Simon & Garfunkel': 'https://en.wikipedia.org/wiki/Simon_%26_Garfunkel',
  'Spirituál kvintet': 'https://en.wikipedia.org/wiki/Spiritu%C3%A1l_kvintet',
  'The Cranberries': 'https://en.wikipedia.org/wiki/The_Cranberries',
  'The Pretenders': 'https://en.wikipedia.org/wiki/The_Pretenders',
  'The Verve': 'https://en.wikipedia.org/wiki/The_Verve',
  'U2': 'https://en.wikipedia.org/wiki/U2',
  // Czech/Slovak bands — use cs.wikipedia where no en article
  'Fiction': 'https://cs.wikipedia.org/wiki/Fiction_(hudebn%C3%AD_skupina)',
  'Film': 'https://cs.wikipedia.org/wiki/Film_(hudebn%C3%AD_skupina)',
  'Garaz': 'https://cs.wikipedia.org/wiki/Gar%C3%A1%C5%BE_(skupina)',
  'Jan Kalousek & ZOO': 'https://cs.wikipedia.org/wiki/ZOO_(hudebn%C3%AD_skupina)',
  'Jiří Suchý & Jiří Šlitr': 'https://cs.wikipedia.org/wiki/Such%C3%BD_a_%C5%A0litr',
  'K.T.O.': 'https://cs.wikipedia.org/wiki/K.T.O.',
  'Puding Pani Elvisovej': 'https://sk.wikipedia.org/wiki/Puding_pani_Elvisovej',
};

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

async function addLink(item, entityType, url, type) {
  const existing = item.externalLinks ? JSON.parse(item.externalLinks) : [];
  if (existing.some(l => l.type === type)) return false; // already has this type

  existing.push({ url, type });
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id: item.id, entityType },
    UpdateExpression: 'SET externalLinks = :links',
    ExpressionAttributeValues: { ':links': JSON.stringify(existing) },
  }));
  return true;
}

async function main() {
  const movies = await queryByType('movie');
  const bands = await queryByType('band');
  let updated = 0;

  // Movies
  for (const movie of movies) {
    const name = movie.name || '';
    if (MOVIE_WIKI[name]) {
      if (await addLink(movie, 'movie', MOVIE_WIKI[name], 'wikipedia')) {
        console.log(`  movie: ${name} +wikipedia`);
        updated++;
      }
    }
  }

  // Bands
  for (const band of bands) {
    const name = band.name || '';
    if (BAND_WIKI[name]) {
      if (await addLink(band, 'band', BAND_WIKI[name], 'wikipedia')) {
        console.log(`  band: ${name} +wikipedia`);
        updated++;
      }
    }
  }

  console.log(`\nUpdated: ${updated} items`);

  // Summary: count links
  const allMovies = await queryByType('movie');
  const allBands = await queryByType('band');
  const moviesWithWiki = allMovies.filter(m => {
    const links = m.externalLinks ? JSON.parse(m.externalLinks) : [];
    return links.some(l => l.type === 'wikipedia');
  });
  const moviesWithImdb = allMovies.filter(m => {
    const links = m.externalLinks ? JSON.parse(m.externalLinks) : [];
    return links.some(l => l.type === 'imdb');
  });
  const bandsWithWiki = allBands.filter(b => {
    const links = b.externalLinks ? JSON.parse(b.externalLinks) : [];
    return links.some(l => l.type === 'wikipedia');
  });

  console.log(`\nFinal coverage:`);
  console.log(`  Movies: ${moviesWithWiki.length}/${allMovies.length} Wikipedia, ${moviesWithImdb.length}/${allMovies.length} IMDB`);
  console.log(`  Bands: ${bandsWithWiki.length}/${allBands.length} Wikipedia`);

  // List bands still missing
  const missing = allBands.filter(b => {
    const links = b.externalLinks ? JSON.parse(b.externalLinks) : [];
    return !links.some(l => l.type === 'wikipedia');
  });
  if (missing.length) {
    console.log(`  Bands still missing Wikipedia: ${missing.map(b => b.name).join(', ')}`);
  }
}

main().catch(console.error);
