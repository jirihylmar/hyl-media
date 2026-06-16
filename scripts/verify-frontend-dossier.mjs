/**
 * Playwright check for the DC Dossier + GlobalSearch cutover (Phase 17.4).
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

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="username"]', EMAIL, { timeout: 30000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // Dossier overview loads (not stuck on "Loading data...").
  await page.goto(`${URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => !/Loading data/.test(document.body.textContent || ''), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const body = (await page.textContent('body').catch(() => '')) || '';
  // Count-agnostic: the overview tab renders the "Entity Overview" table with the entity labels
  // and is not stuck loading. (Hardcoding exact counts is brittle — the catalog grows via the
  // agent; exact counts are asserted directly against the DC store, not the rendered HTML.)
  const overviewOk = !/Loading data/.test(body)
    && /Entity Overview/.test(body)
    && /Movies/.test(body) && /People/.test(body) && /Recordings/.test(body);
  check(overviewOk, `Dossier overview table renders (not stuck loading; entity rows present)`);

  // GlobalSearch via the DC searchMetadata query.
  await page.fill('input.global-search-input', 'dirty', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const dd = (await page.textContent('.global-search-dropdown').catch(() => '')) || '';
  check(/Dirty Dancing/i.test(dd), `GlobalSearch "dirty" → Dirty Dancing (got: ${dd.slice(0, 80).replace(/\n/g, ' ')})`);

  // Tag search (DC _tags / dc_subject).
  await page.fill('input.global-search-input', 'soundtrack', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const ts = (await page.textContent('.global-search-dropdown').catch(() => '')) || '';
  check(/result/i.test(ts) && !/No results/i.test(ts), `GlobalSearch tag "soundtrack" → results`);
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/dc-dossier-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nDOSSIER+SEARCH DC VERIFY: ALL PASS' : `\nDOSSIER+SEARCH DC VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
