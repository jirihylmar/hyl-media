/**
 * Playwright parity check for the DC list cutover (Phase 17.3a).
 * Logs into the deployed (Cognito-gated) app and confirms entity lists render from the DC store.
 *
 * Usage: node scripts/verify-frontend-dc.mjs
 */
import { chromium } from 'playwright';

const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com';
const PASSWORD = 'HylMedia123!';

const EXPECT = [
  { path: '/movies', label: 'Movies', min: 90 },
  { path: '/persons', label: 'People', min: 400 },
  { path: '/recordings', label: 'Recordings', min: 160 },
  { path: '/library', label: 'Library', min: 300 },
  { path: '/sheet-music', label: 'Sheet', min: 100 },
];

const out = (m) => process.stdout.write(m + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
let fail = 0;
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  // Amplify Authenticator login.
  await page.fill('input[name="username"]', EMAIL, { timeout: 30000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for the app shell (top bar / signed-in content).
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);

  for (const e of EXPECT) {
    await page.goto(`${URL}${e.path}`, { waitUntil: 'networkidle', timeout: 60000 });
    // Heading shows "Label (N)"; wait for it to leave the "(...)" loading state.
    await page.waitForFunction(
      () => /\(\d+\)/.test(document.querySelector('h1')?.textContent || ''),
      { timeout: 30000 },
    ).catch(() => {});
    const h1 = (await page.textContent('h1').catch(() => '')) || '';
    const rows = await page.locator('tbody tr').count().catch(() => 0);
    const m = h1.match(/\((\d+)\)/);
    const count = m ? parseInt(m[1], 10) : rows;
    const ok = count >= e.min;
    if (!ok) fail++;
    out(`${ok ? 'PASS' : 'FAIL'} ${e.path} → "${h1.trim()}" rows=${rows} count=${count} (min ${e.min})`);
  }
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/dc-verify-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nFRONTEND DC VERIFY: ALL PASS' : `\nFRONTEND DC VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
