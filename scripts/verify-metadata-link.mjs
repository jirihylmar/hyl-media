/**
 * Phase 19.4 — Playwright check for the "metadata" link on DC detail pages.
 * Logs in, opens representative detail pages, finds the metadata link, follows it to the signed
 * S3 sidecar URL, and confirms the sidecar is valid conformant JSON with an enriched dc_abstract.
 */
import { chromium } from 'playwright';

const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com';
const PASSWORD = 'HylMedia123!';

const CASES = [
  { path: '/movies/dirty-dancing_e9cg', name: 'Dirty Dancing' },
  { path: '/library/zen-and-the-art-of-archery_5603', name: 'Zen and the art of archery' },
  { path: '/persons/mike-nichols_oa5z', name: 'Mike Nichols' },
];

const out = (m) => process.stdout.write(m + '\n');
const browser = await chromium.launch();
const page = await browser.newPage();
let fail = 0;
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="username"]', EMAIL, { timeout: 30000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);

  for (const c of CASES) {
    await page.goto(`${URL}${c.path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    // locate the "metadata" link rendered by MetadataLink (text contains "metadata")
    const link = page.locator('a', { hasText: 'metadata' }).first();
    const count = await link.count();
    if (!count) { fail++; out(`FAIL ${c.path} → no metadata link found`); continue; }
    const href = await link.getAttribute('href');
    const hrefOk = !!href && href.includes('metadata/') && href.includes('.metadata.json');
    // fetch the signed sidecar URL and validate structure
    let jsonOk = false, absOk = false, detail = '';
    if (href) {
      try {
        const r = await page.request.get(href);
        const sc = JSON.parse(await r.text());
        jsonOk = sc && sc.Attributes && sc.id && sc.DocumentId === sc.id && sc.SK === sc.Attributes.sort_key;
        absOk = typeof sc.Attributes.dc_abstract === 'string' && sc.Attributes.dc_abstract.trim().length > 0;
        detail = `dc_type=${sc.Attributes.dc_type} abstract="${(sc.Attributes.dc_abstract || '').slice(0, 50)}…"`;
      } catch (e) { detail = `fetch/parse error: ${e.message?.slice(0, 60)}`; }
    }
    const ok = hrefOk && jsonOk && absOk;
    if (!ok) fail++;
    out(`${ok ? 'PASS' : 'FAIL'} ${c.path} → link=${!!count} hrefOk=${hrefOk} validSidecar=${jsonOk} abstract=${absOk} | ${detail}`);
  }
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/metadata-link-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nMETADATA-LINK VERIFY: ALL PASS' : `\nMETADATA-LINK VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
