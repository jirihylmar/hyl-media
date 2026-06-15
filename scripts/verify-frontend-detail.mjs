/**
 * Playwright check for the DC detail-page cutover (Phase 17.3b).
 * Logs in and verifies representative detail pages render relationships/PDF from the DC store.
 */
import { chromium } from 'playwright';

const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com';
const PASSWORD = 'HylMedia123!';

// legacy ids confirmed present in the catalog.
const CASES = [
  { path: '/movies/dirty-dancing_e9cg', name: 'Dirty Dancing', expectText: ['Soundtrack'] },
  { path: '/recordings/i-ve-had-the-time-of-my-life_27d8', name: 'Time of My Life', expectText: ['Featured in'] },
  { path: '/library/100-1-otazek-a-odpovedi-o-krevnim-tlaku_8009', name: 'krevn', expectText: ['Author', 'Download'] },
  { path: '/persons/mike-nichols_oa5z', name: 'Mike Nichols', expectText: ['Filmography'] },
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
    await page.waitForFunction(
      () => !/^\s*Loading/.test(document.querySelector('h1, p')?.textContent || ''),
      { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(1500);
    const body = (await page.textContent('body').catch(() => '')) || '';
    const h1 = (await page.textContent('h1').catch(() => '')) || '';
    const nameOk = body.toLowerCase().includes(c.name.toLowerCase());
    const textsOk = c.expectText.every((t) => body.includes(t));
    const ok = nameOk && textsOk;
    if (!ok) fail++;
    out(`${ok ? 'PASS' : 'FAIL'} ${c.path} → h1="${h1.trim()}" name=${nameOk} sections=${textsOk ? c.expectText.join('+') : 'MISSING ' + c.expectText.filter((t) => !body.includes(t)).join(',')}`);
  }
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/dc-detail-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nDETAIL DC VERIFY: ALL PASS' : `\nDETAIL DC VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
