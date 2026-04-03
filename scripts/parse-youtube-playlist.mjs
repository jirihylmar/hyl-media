/**
 * Parse YouTube playlist TSV into structured JSON.
 * Extracts artist, song title, featured artists, language, and tags from YouTube video titles.
 *
 * Usage:
 *   node scripts/parse-youtube-playlist.mjs
 *
 * Input:  input/youtube_playlist.tsv
 * Output: input/youtube_parsed.json
 */

import { readFileSync, writeFileSync } from 'fs';

const INPUT = 'input/youtube_playlist.tsv';
const OUTPUT = 'input/youtube_parsed.json';

// --- Manual overrides for ambiguous/tricky titles ---
const MANUAL_ENTRIES = {
  'Wicked Game': { artist: 'Chris Isaak', song: 'Wicked Game', language: 'en', tags: ['rock'] },
  'Me and Bobby McGee': { artist: 'Janis Joplin', song: 'Me and Bobby McGee', language: 'en', tags: ['rock'] },
  'Zmrzlinář': { artist: 'Jaroslav Uhlíř & Zdeněk Svěrák', song: 'Zmrzlinář', language: 'cs', tags: ['pop', 'children'] },
  'Creep (RadioHead)': { artist: 'Radiohead', song: 'Creep', language: 'en', tags: ['rock', 'alternative'] },
  'Time Is On My Side (Mono Version)': { artist: 'The Rolling Stones', song: 'Time Is On My Side', language: 'en', tags: ['rock'] },
  'Ly  O  Lay Ale Loya (Circle Dance) ~ Native Song': { artist: 'Sacred Spirit', song: 'Ly O Lay Ale Loya (Circle Dance)', language: 'en', tags: ['world'] },
  'MIDI LIDI:  LÁSKA NENÍ ŠVÉDSKÝ STŮL': { artist: 'Midi Lidi', song: 'Láska není švédský stůl', language: 'cs', tags: ['electronic', 'pop'] },
  'Ring Of Fire - Johnny Cash & Dj Serj Moldova (remix)': { artist: 'Johnny Cash', song: 'Ring of Fire', language: 'en', tags: ['country'] },
  'Pulp Fiction: The Complete Soundtrack': { artist: 'Various Artists', song: 'Pulp Fiction: The Complete Soundtrack', language: 'en', tags: ['soundtrack'], type: 'compilation' },
  'TOP GUN Opening Theme Full Version (off vocal)': { artist: 'Harold Faltermeyer', song: 'Top Gun Anthem', language: 'en', tags: ['soundtrack'] },
  'Metallica: Whiskey in the Jar (Slane Castle - Meath, Ireland - June 8, 2019)': { artist: 'Metallica', song: 'Whiskey in the Jar', language: 'en', tags: ['metal'] },
  'Chris Isaac   Wicked Game Chillion Remix (1hour)': { artist: 'Chris Isaak', song: 'Wicked Game (Chillion Remix)', language: 'en', tags: ['rock', 'electronic'] },
  '⚡Timeless✔️Beauty❤️ Forever Young - Alphaville - (Jennifer Connelly 1990s) (1980s Music)': { artist: 'Alphaville', song: 'Forever Young', language: 'en', tags: ['synthpop'] },
  'Amy Winehouse Greatest Hits - Best Songs Of Amy Winehouse - Amy Winehouse Full Playlist': { artist: 'Amy Winehouse', song: 'Greatest Hits (Compilation)', language: 'en', tags: ['soul', 'jazz'], type: 'compilation' },
  'Robbie Williams and Taylor Swift Angels #live at Wembley': { artist: 'Robbie Williams', song: 'Angels', featured: ['Taylor Swift'], language: 'en', tags: ['pop'] },
  'Righteous Brothers | Unchained Melody [From the Movie Ghost]': { artist: 'Righteous Brothers', song: 'Unchained Melody', language: 'en', tags: ['soul', 'pop'] },
  'Iva Bittova & Miroslav Donutil "Zabili, zabili"': { artist: 'Iva Bittová', song: 'Zabili, zabili', featured: ['Miroslav Donutil'], language: 'cs', tags: ['folk', 'experimental'] },
  'Kalandra Solnej sloup': { artist: 'Kalandra', song: 'Solnej sloup', language: 'cs', tags: ['rock'] },
  'Kubistický portrét (Suchý Jiří & Šlitr Jiří)': { artist: 'Jiří Suchý & Jiří Šlitr', song: 'Kubistický portrét', language: 'cs', tags: ['chanson'] },
  'Waiting for the Man - Reed and Bowie': { artist: 'Lou Reed', song: 'Waiting for the Man', featured: ['David Bowie'], language: 'en', tags: ['rock'] },
  'Janis Joplin-Mercedes Benz(original)': { artist: 'Janis Joplin', song: 'Mercedes Benz', language: 'en', tags: ['rock', 'blues'] },
  'Adele, Radio 1 Live Lounge Special Part 1 - Rolling In The Deep': { artist: 'Adele', song: 'Rolling In The Deep', language: 'en', tags: ['pop', 'soul'] },
  'The winner takes it all - At Vance (Pride and prejudice)': { artist: 'At Vance', song: 'The Winner Takes It All', language: 'en', tags: ['metal'] },
  'FICTION - Básnici Ticha (official video, HD)': { artist: 'Fiction', song: 'Básníci ticha', language: 'cs', tags: ['rock'] },
  'Bruce Springsteen Secret Garden HD, Jerry Maguire Soundtrack (flac)': { artist: 'Bruce Springsteen', song: 'Secret Garden', language: 'en', tags: ['rock'] },
  'The Beach (2000) OST - "Faithless - Woozy" - Track 10': { artist: 'Faithless', song: 'Woozy', language: 'en', tags: ['electronic', 'dance'] },
  'The Beach - Pure Shores (HD)': { artist: 'All Saints', song: 'Pure Shores', language: 'en', tags: ['pop', 'r&b'] },
  'Best Of Sade Tribute Soul Mix Smooth Jazz Music Songs R&B Compilation Playlist By Eric The Tutor': { artist: 'Sade', song: 'Best Of (Compilation)', language: 'en', tags: ['soul', 'jazz'], type: 'compilation' },
  'Moulin Rouge OST [7] - Children of the Revolution': { artist: 'T. Rex', song: 'Children of the Revolution', language: 'en', tags: ['rock', 'soundtrack'] },
  'Pulp Fiction - Dance Scene (HQ)': { artist: 'Chuck Berry', song: 'You Never Can Tell', language: 'en', tags: ['rock', 'soundtrack'] },
  '1. The Beach Soundtrack - Snakeblood': { artist: 'Faithless', song: 'Snakeblood', language: 'en', tags: ['electronic', 'soundtrack'] },
  'Eurythmics, Annie Lennox, Dave Stewart - Here Comes The Rain Again (Remastered)': { artist: 'Eurythmics', song: 'Here Comes The Rain Again', language: 'en', tags: ['synthpop', 'pop'] },
  'Eurythmics, Annie Lennox, Dave Stewart - Sweet Dreams (Are Made Of This) (Official Video)': { artist: 'Eurythmics', song: 'Sweet Dreams (Are Made Of This)', language: 'en', tags: ['synthpop', 'pop'] },
  'Alphaville • Forever Young // Jennifer Connelly • Evolution Age': { artist: 'Alphaville', song: 'Forever Young', language: 'en', tags: ['synthpop'] },
  'Annie Lennox   A Whiter Shade of Pale (Tradução)': { artist: 'Annie Lennox', song: 'A Whiter Shade of Pale', language: 'en', tags: ['pop'] },
  'Modern Talking • Cheri, Cheri Lady // Jennifer Connelly • Phenomena': { artist: 'Modern Talking', song: 'Cheri, Cheri Lady', language: 'en', tags: ['pop', 'eurodisco'] },
  'Vlado Müller + Martin Čížek - Přátelé Zeleného údolí (1980)': { artist: 'Vlado Müller', song: 'Přátelé Zeleného údolí', featured: ['Martin Čížek'], language: 'cs', tags: ['folk'] },
  'Muchomůrky bílé - Mejla Hlavsa': { artist: 'Mejla Hlavsa', song: 'Muchomůrky bílé', language: 'cs', tags: ['punk', 'underground'] },
  "WHAT'S UP? - 4 Non Blondes | Subtítulos inglés y español": { artist: '4 Non Blondes', song: "What's Up?", language: 'en', tags: ['rock', 'alternative'] },
  'CADILLAC - Jan Vyčítal': { artist: 'Jan Vyčítal', song: 'Cadillac', language: 'cs', tags: ['country', 'rock'] },
  'Mr. Tambourine Man (Live at the Newport Folk Festival. 1964)': { artist: 'Bob Dylan', song: 'Mr. Tambourine Man', language: 'en', tags: ['folk', 'rock'] },
  'Valašská Polanka - koncert 28.4.2013 - kostel sv. Jana Křtitele - Z Tvé ruky Pane můj': { artist: 'Valašská Polanka', song: 'Z Tvé ruky Pane můj', language: 'cs', tags: ['folk', 'spiritual'] },
  'Difang & Igay singing "Weeding and Paddyfield Song No. 1"': { artist: 'Difang', song: 'Weeding and Paddyfield Song No. 1', featured: ['Igay'], language: 'en', tags: ['world', 'traditional'] },
  'Midi Lidi @ Radio Wave Live Session v Plzni': { artist: 'Midi Lidi', song: 'Radio Wave Live Session', language: 'cs', tags: ['electronic', 'pop'] },
  'Bára Basiková & Precedens - Soumrak bohů': { artist: 'Bára Basiková', song: 'Soumrak bohů', featured: ['Precedens'], language: 'cs', tags: ['rock'] },
  'U2 & Patti Smith - Bad + People Have the Power Pro Shot HD': { artist: 'U2', song: 'Bad / People Have the Power', featured: ['Patti Smith'], language: 'en', tags: ['rock'] },
  'Mary J. Blige, U2 - One (Official Music Video)': { artist: 'Mary J. Blige', song: 'One', featured: ['U2'], language: 'en', tags: ['r&b', 'rock'] },
  'Marianne Faithfull, David Bowie - I Got You Babe': { artist: 'Marianne Faithfull', song: 'I Got You Babe', featured: ['David Bowie'], language: 'en', tags: ['rock', 'folk'] },
  'Charli xcx - Guess ft. Billie Eilish': { artist: 'Charli XCX', song: 'Guess', featured: ['Billie Eilish'], language: 'en', tags: ['pop', 'electronic'] },
  'Charli xcx - Guess featuring billie eilish (official video)': { artist: 'Charli XCX', song: 'Guess', featured: ['Billie Eilish'], language: 'en', tags: ['pop', 'electronic'] },
  'Ladyhawke • I\'ll Stand By You • The Pretenders': { artist: 'The Pretenders', song: "I'll Stand By You", language: 'en', tags: ['rock'] },
  'Nick Cave & The Bad Seeds - Henry Lee ft. P.J Harvey (Official HD Video)': { artist: 'Nick Cave & The Bad Seeds', song: 'Henry Lee', featured: ['PJ Harvey'], language: 'en', tags: ['rock', 'alternative'] },
  'Pavel Novák - Nádherná - HD - elvo video': { artist: 'Pavel Novák', song: 'Nádherná', language: 'cs', tags: ['pop'] },
  'Richard Müller - Nahy 2': { artist: 'Richard Müller', song: 'Nahý II', language: 'sk', tags: ['rock', 'pop'] },
  'Iggy Pop - Lust For Life - Later… with Jools Holland - BBC Two': { artist: 'Iggy Pop', song: 'Lust for Life', language: 'en', tags: ['punk', 'rock'] },
  'The Cranberries - Zombie 1999 Live Video': { artist: 'The Cranberries', song: 'Zombie', language: 'en', tags: ['rock', 'alternative'] },
  'P!NK - Try (The Truth About Love - Live From Los Angeles)': { artist: 'Pink', song: 'Try', language: 'en', tags: ['pop', 'rock'] },
  '1. Robbie Williams - Let Me Entertain You (Knebworth 2003)': { artist: 'Robbie Williams', song: 'Let Me Entertain You', language: 'en', tags: ['pop'] },
  'Metallica - Enter Sandman Live Moscow 1991 HD': { artist: 'Metallica', song: 'Enter Sandman', language: 'en', tags: ['metal'] },
  'Rage Against The Machine  -  Killing In The Name  -  1993': { artist: 'Rage Against The Machine', song: 'Killing in the Name', language: 'en', tags: ['rock', 'metal'] },
  'Against All Odds • Take a Look At Me Now • Phil Collins': { artist: 'Phil Collins', song: 'Against All Odds (Take a Look at Me Now)', language: 'en', tags: ['pop', 'rock'] },
  'Jan Kalousek & ZOO - Čas sluhů [w]': { artist: 'Jan Kalousek & ZOO', song: 'Čas sluhů', language: 'cs', tags: ['rock'] },
  'Miro Žbirka - Čistý svet ft. Rachel Sklenickova': { artist: 'Miro Žbirka', song: 'Čistý svet', featured: ['Rachel Sklenickova'], language: 'sk', tags: ['pop', 'rock'] },
};

// --- Known artist/band metadata ---
const ARTIST_META = {
  // Czech/Slovak
  'Puding pani Elvisovej': { language: 'sk', type: 'band', tags: ['pop', 'rock'] },
  'MIDI LIDI': { language: 'cs', type: 'band', tags: ['electronic', 'pop'] },
  'Midi Lidi': { language: 'cs', type: 'band', tags: ['electronic', 'pop'] },
  'Miro Žbirka': { language: 'sk', type: 'person', tags: ['pop', 'rock'] },
  'Blue Effect': { language: 'cs', type: 'band', tags: ['rock', 'psychedelic'] },
  'Jan Kalousek & ZOO': { language: 'cs', type: 'band', tags: ['rock'] },
  'Iva Bittová': { language: 'cs', type: 'person', tags: ['experimental', 'folk'] },
  'Spirituál kvintet': { language: 'cs', type: 'band', tags: ['folk'] },
  'Kalandra': { language: 'cs', type: 'band', tags: ['rock'] },
  'Elán': { language: 'sk', type: 'band', tags: ['pop', 'rock'] },
  'Jiří Schelinger': { language: 'cs', type: 'person', tags: ['pop', 'rock'] },
  'Pavel Novák': { language: 'cs', type: 'person', tags: ['pop'], },
  'Pavel Bobek': { language: 'cs', type: 'person', tags: ['country', 'pop'] },
  'Richard Müller': { language: 'sk', type: 'person', tags: ['rock', 'pop'] },
  'Vlado Müller': { language: 'cs', type: 'person', tags: ['folk'] },
  'Mejla Hlavsa': { language: 'cs', type: 'person', tags: ['punk', 'underground'] },
  'Hudba Praha': { language: 'cs', type: 'band', tags: ['rock'] },
  'Visací zámek': { language: 'cs', type: 'band', tags: ['punk'] },
  'Visací Zámek': { language: 'cs', type: 'band', tags: ['punk'] },
  'Wohnout': { language: 'cs', type: 'band', tags: ['rock'] },
  'Jan Vyčítal': { language: 'cs', type: 'person', tags: ['country', 'rock'] },
  'FICTION': { language: 'cs', type: 'band', tags: ['rock'] },
  'Bára Basiková': { language: 'cs', type: 'person', tags: ['rock', 'pop'] },
  'Precedens': { language: 'cs', type: 'band', tags: ['rock'] },
  'ELÁN': { language: 'sk', type: 'band', tags: ['pop', 'rock'] },
  // International
  'Scorpions': { language: 'en', type: 'band', tags: ['rock'] },
  'Simon & Garfunkel': { language: 'en', type: 'band', tags: ['folk', 'rock'] },
  'Chris Isaak': { language: 'en', type: 'person', tags: ['rock'] },
  'Janis Joplin': { language: 'en', type: 'person', tags: ['rock', 'blues'] },
  'Johnny Cash': { language: 'en', type: 'person', tags: ['country'] },
  'Deep Purple': { language: 'en', type: 'band', tags: ['rock'] },
  'Hans Zimmer': { language: 'en', type: 'person', tags: ['soundtrack', 'electronic'] },
  'Chris de Burgh': { language: 'en', type: 'person', tags: ['pop'] },
  'Passenger': { language: 'en', type: 'person', tags: ['folk', 'pop'] },
  'Metallica': { language: 'en', type: 'band', tags: ['metal'] },
  'Vanessa-Mae': { language: 'en', type: 'person', tags: ['classical', 'pop'] },
  'Alphaville': { language: 'en', type: 'band', tags: ['synthpop'] },
  'The Rolling Stones': { language: 'en', type: 'band', tags: ['rock'] },
  'Amy Winehouse': { language: 'en', type: 'person', tags: ['soul', 'jazz'] },
  'Robbie Williams': { language: 'en', type: 'person', tags: ['pop'] },
  'Taylor Swift': { language: 'en', type: 'person', tags: ['pop'] },
  'Righteous Brothers': { language: 'en', type: 'band', tags: ['soul', 'pop'] },
  'Dario G': { language: 'en', type: 'band', tags: ['electronic', 'dance'] },
  'Phil Collins': { language: 'en', type: 'person', tags: ['pop', 'rock'] },
  'Sade': { language: 'en', type: 'band', tags: ['soul', 'jazz'] },
  'Bruce Springsteen': { language: 'en', type: 'person', tags: ['rock'] },
  'Alannah Myles': { language: 'en', type: 'person', tags: ['rock'] },
  'The Cranberries': { language: 'en', type: 'band', tags: ['rock', 'alternative'] },
  'Eric Carmen': { language: 'en', type: 'person', tags: ['pop', 'rock'] },
  'Depeche Mode': { language: 'en', type: 'band', tags: ['electronic', 'synthpop'] },
  'INXS': { language: 'en', type: 'band', tags: ['rock', 'pop'] },
  'AC/DC': { language: 'en', type: 'band', tags: ['rock'] },
  'P!NK': { language: 'en', type: 'person', tags: ['pop', 'rock'] },
  'Pink': { language: 'en', type: 'person', tags: ['pop', 'rock'] },
  'Iron Maiden': { language: 'en', type: 'band', tags: ['metal'] },
  'Prodigy': { language: 'en', type: 'band', tags: ['electronic'] },
  'The Prodigy': { language: 'en', type: 'band', tags: ['electronic'] },
  '4 Non Blondes': { language: 'en', type: 'band', tags: ['rock', 'alternative'] },
  'Mary J. Blige': { language: 'en', type: 'person', tags: ['r&b', 'soul'] },
  'U2': { language: 'en', type: 'band', tags: ['rock'] },
  'Nick Cave & The Bad Seeds': { language: 'en', type: 'band', tags: ['rock', 'alternative'] },
  'Nick Cave': { language: 'en', type: 'person', tags: ['rock', 'alternative'] },
  'David Bowie': { language: 'en', type: 'person', tags: ['rock', 'pop'] },
  'Lou Reed': { language: 'en', type: 'person', tags: ['rock'] },
  'Meredith Brooks': { language: 'en', type: 'person', tags: ['rock'] },
  'Eurythmics': { language: 'en', type: 'band', tags: ['synthpop', 'pop'] },
  'Annie Lennox': { language: 'en', type: 'person', tags: ['pop'] },
  'Midnight Oil': { language: 'en', type: 'band', tags: ['rock'] },
  'Iggy Pop': { language: 'en', type: 'person', tags: ['punk', 'rock'] },
  'Enigma': { language: 'en', type: 'band', tags: ['electronic', 'new age'] },
  'Moby': { language: 'en', type: 'person', tags: ['electronic'] },
  'The Verve': { language: 'en', type: 'band', tags: ['rock', 'alternative'] },
  'Rage Against The Machine': { language: 'en', type: 'band', tags: ['rock', 'metal'] },
  'Kylie Minogue': { language: 'en', type: 'person', tags: ['pop', 'dance'] },
  'Charli xcx': { language: 'en', type: 'person', tags: ['pop', 'electronic'] },
  'Charli XCX': { language: 'en', type: 'person', tags: ['pop', 'electronic'] },
  'The Pretenders': { language: 'en', type: 'band', tags: ['rock'] },
  'Modern Talking': { language: 'en', type: 'band', tags: ['pop', 'eurodisco'] },
  'Sting': { language: 'en', type: 'person', tags: ['rock', 'pop'] },
  'Marianne Faithfull': { language: 'en', type: 'person', tags: ['rock', 'folk'] },
  'Adele': { language: 'en', type: 'person', tags: ['pop', 'soul'] },
  'At Vance': { language: 'en', type: 'band', tags: ['metal'] },
  'Faithless': { language: 'en', type: 'band', tags: ['electronic', 'dance'] },
  'All Saints': { language: 'en', type: 'band', tags: ['pop', 'r&b'] },
  'TLC': { language: 'en', type: 'band', tags: ['r&b', 'pop'] },
  'Radiohead': { language: 'en', type: 'band', tags: ['rock', 'alternative'] },
  'Bob Dylan': { language: 'en', type: 'person', tags: ['folk', 'rock'] },
  'Frank Zappa': { language: 'en', type: 'person', tags: ['rock', 'experimental'] },
  'Patti Smith': { language: 'en', type: 'person', tags: ['punk', 'rock'] },
  'Patti Smith Group': { language: 'en', type: 'band', tags: ['punk', 'rock'] },
  'Difang': { language: 'en', type: 'person', tags: ['world', 'traditional'] },
  'Sacred Spirit': { language: 'en', type: 'band', tags: ['world', 'new age'] },
  'Billie Eilish': { language: 'en', type: 'person', tags: ['pop', 'alternative'] },
  'T. Rex': { language: 'en', type: 'band', tags: ['rock', 'glam'] },
  'Chuck Berry': { language: 'en', type: 'person', tags: ['rock'] },
  'Various Artists': { language: 'en', type: 'compilation', tags: ['soundtrack'] },
  'Harold Faltermeyer': { language: 'en', type: 'person', tags: ['soundtrack', 'electronic'] },
  'Jaroslav Uhlíř & Zdeněk Svěrák': { language: 'cs', type: 'band', tags: ['pop', 'children'] },
  'Jiří Suchý & Jiří Šlitr': { language: 'cs', type: 'band', tags: ['chanson'] },
  'Valašská Polanka': { language: 'cs', type: 'band', tags: ['folk', 'spiritual'] },
  'Fiction': { language: 'cs', type: 'band', tags: ['rock'] },
  'PJ Harvey': { language: 'en', type: 'person', tags: ['rock', 'alternative'] },
  'Martin Čížek': { language: 'cs', type: 'person', tags: ['folk'] },
  'Miroslav Donutil': { language: 'cs', type: 'person', tags: ['actor'] },
  'Igay': { language: 'en', type: 'person', tags: ['world', 'traditional'] },
};

// --- Title parsing ---

function parseTitleLine(title, url) {
  // Check manual override
  const manual = MANUAL_ENTRIES[title];
  if (manual) {
    const meta = ARTIST_META[manual.artist] || {};
    return {
      type: meta.type || 'unknown',
      ...manual,
      youtubeUrl: url,
      tags: manual.tags || meta.tags || [],
      language: manual.language || meta.language || 'en',
      source: 'manual',
    };
  }

  let artist = null;
  let song = null;
  let featured = [];

  // Remove common noise
  let clean = title
    .replace(/\(Official\s*(HD\s*)?(?:Music\s*)?Video\)/gi, '')
    .replace(/\[Official\s*(?:Music\s*)?Video\]/gi, '')
    .replace(/\(official\s*video,?\s*HD\)/gi, '')
    .replace(/\(Remastered\)/gi, '')
    .replace(/\(Official Audio\)/gi, '')
    .replace(/\(Official Video\)/gi, '')
    .replace(/\[official video\]/gi, '')
    .replace(/\(OFFICIAL VIDEOCLIP\)/gi, '')
    .replace(/\|Official video\|/gi, '')
    .replace(/Official HD Video/gi, '')
    .replace(/Official Lyric Video/gi, '')
    .replace(/Official Music Video/gi, '')
    .replace(/\(HD\)/gi, '')
    .replace(/\[HD\]/gi, '')
    .replace(/HD/g, '')
    .replace(/\(Lyrics in Description\)/gi, '')
    .replace(/\(Subtitulado en Español\)/gi, '')
    .replace(/\(Tradução\)/gi, '')
    .replace(/- Legendado/gi, '')
    .replace(/Subtítulos inglés y español/gi, '')
    .replace(/\(flac\)/gi, '')
    .replace(/\.mpg$/i, '')
    .replace(/\(1hour\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern: "Artist • Song • OriginalArtist" (movie soundtrack style)
  const bulletMatch = clean.match(/^(.+?)\s*•\s*(.+?)\s*•\s*(.+)$/);
  if (bulletMatch) {
    // Could be "Movie • Song • Artist" or "Song • Artist"
    // In this playlist: "The Graduate • The Sound of Silence • Simon & Garfunkel"
    song = bulletMatch[2].trim();
    artist = bulletMatch[3].trim();
    return buildEntry(artist, song, featured, url, clean);
  }

  // Pattern: "Artist • Song" (two bullets)
  const bullet2Match = clean.match(/^(.+?)\s*•\s*(.+)$/);
  if (bullet2Match) {
    // Could be "Movie • Song • Artist" missed, or "Alphaville • Forever Young"
    // Check if first part looks like an artist
    const p1 = bullet2Match[1].trim();
    const p2 = bullet2Match[2].trim();
    if (ARTIST_META[p1]) {
      artist = p1; song = p2;
    } else if (ARTIST_META[p2]) {
      song = p1; artist = p2;
    } else {
      // Guess: first is context/movie, second might be "Song • Artist"
      artist = p2; song = p1;
    }
    return buildEntry(artist, song, featured, url, clean);
  }

  // Pattern: "Artist - Song (extra info)" or "Artist: Song"
  // Try " - " separator first
  const dashMatch = clean.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    artist = dashMatch[1].trim();
    song = dashMatch[2].trim();

    // Handle "Artist & FeatArtist - Song"
    const featInArtist = artist.match(/^(.+?)\s*(?:&|feat\.?|ft\.?|,)\s+(.+)$/i);
    if (featInArtist) {
      // Check if both parts are known artists
      const a1 = featInArtist[1].trim();
      const a2 = featInArtist[2].trim();
      if (ARTIST_META[a1] && ARTIST_META[a2]) {
        artist = a1;
        featured.push(a2);
      }
      // else keep combined name
    }

    // Handle "Song ft. FeatArtist" in song part
    const featInSong = song.match(/^(.+?)\s+(?:feat\.?|ft\.?)\s+(.+)$/i);
    if (featInSong) {
      song = featInSong[1].trim();
      featured.push(featInSong[2].trim());
    }

    // Clean song: remove "(Live ...)", "(Remix)", movie refs, etc.
    song = song
      .replace(/\(Live[^)]*\)/gi, '')
      .replace(/\(En Vivo!\)/gi, '')
      .replace(/\(From[^)]*\)/gi, '')
      .replace(/\(from[^)]*\)/gi, '')
      .replace(/\([^)]*Remix\)/gi, '')
      .replace(/\([^)]*Live Session[^)]*\)/gi, '')
      .replace(/\([^)]*Soundtrack[^)]*\)/gi, '')
      .replace(/Live Moscow \d+/gi, '')
      .replace(/Live at[^,)]*/gi, '')
      .replace(/\(Leon\)/gi, '')
      .replace(/\(Pelíšky\)/gi, '')
      .replace(/\(Taratata[^)]*\)/gi, '')
      .replace(/\(U2 At The BBC\)/gi, '')
      .replace(/\(Radio 1[^)]*\)/gi, '')
      .replace(/@ Radio Wave.*$/gi, '')
      .replace(/\s*-\s*$/, '')
      .trim();

    // Remove leading track numbers
    song = song.replace(/^\d+\.\s*/, '');
    artist = artist.replace(/^\d+\.\s*/, '');

    // Cleanup decorative chars
    artist = artist.replace(/[⚡✔️❤️]/g, '').trim();
    song = song.replace(/[⚡✔️❤️]/g, '').trim();

    return buildEntry(artist, song, featured, url, clean);
  }

  // Pattern: "Song (Artist)" like "Kubistický portrét (Suchý Jiří & Šlitr Jiří)"
  const parenArtist = clean.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenArtist) {
    song = parenArtist[1].trim();
    artist = parenArtist[2].trim();
    return buildEntry(artist, song, featured, url, clean);
  }

  // Fallback: entire title is song, artist unknown — try lookup
  return buildEntry(null, clean, featured, url, clean);
}

function buildEntry(artist, song, featured, url, rawTitle) {
  // Normalize artist names
  artist = normalizeArtistName(artist);
  featured = featured.map(normalizeArtistName);

  // Clean song title
  if (song) {
    song = song.replace(/\s+/g, ' ').trim();
    // Remove trailing " - " artifacts
    song = song.replace(/\s*-\s*$/, '').trim();
  }

  // Get metadata
  const meta = artist ? (ARTIST_META[artist] || {}) : {};
  const language = meta.language || (featured.length > 0 ? (ARTIST_META[featured[0]] || {}).language : null) || 'en';
  const tags = meta.tags || [];

  // If entry came from MANUAL_ENTRIES, it may have its own type/tags/language
  // But if not, derive from ARTIST_META
  return {
    artist: artist || 'Unknown',
    song: song || rawTitle,
    featured: featured.length > 0 ? featured : undefined,
    language,
    tags,
    type: meta.type || 'unknown',
    youtubeUrl: url,
  };
}

function normalizeArtistName(name) {
  if (!name) return name;
  // Fix common variations
  const fixes = {
    'Chris Isaac': 'Chris Isaak',
    'P!NK': 'Pink',
    'Elan': 'Elán',
    'ELÁN': 'Elán',
    'Visací zámek': 'Visací Zámek',
    'Prodigy': 'The Prodigy',
    'MIDI LIDI': 'Midi Lidi',
    'FICTION': 'Fiction',
    'Charli xcx': 'Charli XCX',
    'Iva Bittova': 'Iva Bittová',
    'Dj Serj Moldova': null, // strip remix DJs
  };
  return fixes[name] !== undefined ? fixes[name] : name;
}

// --- Main ---
const raw = readFileSync(INPUT, 'utf-8');
const lines = raw.split('\n').slice(1); // skip header

const entries = [];
const skipped = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const parts = trimmed.split('\t');
  const title = parts[0]?.trim();
  const url = parts[1]?.trim();

  // Skip private/deleted videos
  if (!title || title === '[Private video]' || title === '[Deleted video]') {
    skipped.push(title || '(empty)');
    continue;
  }
  // Skip entries without URL
  if (!url) {
    skipped.push(`${title} (no URL)`);
    continue;
  }

  const entry = parseTitleLine(title, url);
  entry.rawTitle = title;
  entries.push(entry);
}

// Deduplicate by song+artist (keep first occurrence)
const seen = new Set();
const deduped = [];
const dupes = [];
for (const e of entries) {
  const key = `${(e.artist || '').toLowerCase()}|||${(e.song || '').toLowerCase()}`;
  if (seen.has(key)) {
    dupes.push(e);
    continue;
  }
  seen.add(key);
  deduped.push(e);
}

writeFileSync(OUTPUT, JSON.stringify(deduped, null, 2));

console.log(`=== YouTube Playlist Parser ===`);
console.log(`Total lines: ${lines.length}`);
console.log(`Parsed: ${entries.length}`);
console.log(`Deduplicated: ${deduped.length} unique (${dupes.length} duplicates)`);
console.log(`Skipped: ${skipped.length} (private/no URL)`);
console.log(`\nOutput: ${OUTPUT}`);

if (dupes.length > 0) {
  console.log(`\nDuplicates removed:`);
  for (const d of dupes) {
    console.log(`  - ${d.artist} — ${d.song}`);
  }
}

// Stats
const byType = {};
for (const e of deduped) {
  byType[e.type] = (byType[e.type] || 0) + 1;
}
console.log(`\nBy artist type:`, byType);

const byLang = {};
for (const e of deduped) {
  byLang[e.language] = (byLang[e.language] || 0) + 1;
}
console.log(`By language:`, byLang);

// Show unknown artists
const unknowns = deduped.filter(e => e.type === 'unknown' || e.artist === 'Unknown');
if (unknowns.length > 0) {
  console.log(`\nUnresolved entries (${unknowns.length}):`);
  for (const u of unknowns) {
    console.log(`  - "${u.rawTitle}" → artist: ${u.artist}, song: ${u.song}`);
  }
}
