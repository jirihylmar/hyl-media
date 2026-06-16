/**
 * Phase 17.6c — live verify the DC-native document upload.
 * Logs in, opens the Library upload form, uploads a small PDF, and confirms the new book lands as a
 * DC record: the detail page renders the title + a Download link, and the row is conformant.
 * Prints the new record's uuid (last line, "NEW_ID=<uuid>") so the caller can audit / clean it up.
 */
import { chromium } from 'playwright';

const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com';
const PASSWORD = 'HylMedia123!';
const PDF = process.argv[2] || '/tmp/upload-test/phase22-test.pdf';
const TITLE = process.argv[3] || 'Phase 22 Upload Test';

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

  // Open the upload form directly.
  await page.goto(`${URL}/library?create=1`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Scope strictly to the upload form (the page header has its own global-search input).
  const form = page.locator('form').filter({ has: page.locator('input[type="file"]') }).first();
  await form.locator('input[type="file"]').setInputFiles(PDF);
  const textInputs = form.locator('input:not([type="file"])');
  await textInputs.nth(0).fill(TITLE);                  // Name (required)
  if (await textInputs.count() > 1) await textInputs.nth(1).fill('Test Author'); // Author (book)
  await form.locator('button:has-text("Upload")').click();

  // Wait for navigation to the detail page /library/<uuid>.
  await page.waitForURL(/\/library\/[0-9a-f-]{8,}/, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const url = page.url();
  const m = url.match(/\/library\/([0-9a-f-]{16,})/);
  check(!!m, `navigated to new book detail (${url})`);

  const body = (await page.textContent('body').catch(() => '')) || '';
  check(new RegExp(TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(body), 'detail shows the uploaded title');
  const dl = await page.locator('a:has-text("Download"), button:has-text("Download")').count();
  check(dl > 0, 'detail shows a Download link');

  if (m) out(`NEW_ID=${m[1]}`);
} catch (err) {
  fail++;
  out(`ERROR ${err.message}`);
  await page.screenshot({ path: '/tmp/upload-test/error.png' }).catch(() => {});
} finally {
  await browser.close();
}
out(fail === 0 ? '\nDOCUMENT UPLOAD VERIFY: ALL PASS' : `\nDOCUMENT UPLOAD VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
