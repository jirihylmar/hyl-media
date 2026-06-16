/**
 * Phase 17.6d — verify the Dossier relationship columns (Cast / Performer / Artist) still render
 * after they were migrated from legacy cross-ref rows to the DC dc_creator/dc_contributor arrays.
 * Loads each relationship tab and asserts the column is populated (linked names present, not all "—").
 */
import { chromium } from 'playwright';

const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com';
const PASSWORD = 'HylMedia123!';

const out = (m) => process.stdout.write(m + '\n');
const browser = await chromium.launch();
const page = await browser.newPage();
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; out(`${ok ? 'PASS' : 'FAIL'} ${msg}`); };

async function tabBody(tab) {
  await page.goto(`${URL}/?tab=${tab}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => !/Loading data/.test(document.body.textContent || ''), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return (await page.textContent('body').catch(() => '')) || '';
}

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="username"]', EMAIL, { timeout: 30000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // Movies tab: a known movie (Dirty Dancing) must show cast names from DC.
  const mb = await tabBody('movies');
  check(/Dirty Dancing/.test(mb) && (/Patrick Swayze|Jennifer Grey|Emile Ardolino/.test(mb)),
    'Movies tab: Dirty Dancing row shows DC cast names');
  // At least several cast cells populated overall (count linked /persons/ anchors on the movies table).
  const personLinks = await page.locator('a[href*="/persons/"]').count();
  check(personLinks >= 20, `Movies tab: cast column populated (${personLinks} person links)`);

  // Recordings tab: performers present.
  await tabBody('recordings');
  const recPerfLinks = await page.locator('a[href*="/persons/"], a[href*="/bands/"]').count();
  check(recPerfLinks >= 20, `Recordings tab: performer column populated (${recPerfLinks} performer links)`);

  // Sheets tab: artists present.
  await tabBody('sheets');
  const sheetArtistLinks = await page.locator('a[href*="/persons/"], a[href*="/bands/"]').count();
  check(sheetArtistLinks >= 20, `Sheet Music tab: artist column populated (${sheetArtistLinks} artist links)`);
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/dossier-relations-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nDOSSIER RELATIONS VERIFY: ALL PASS' : `\nDOSSIER RELATIONS VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
