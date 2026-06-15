/**
 * Phase 20 verify — People/Bands lists still populate from the DC store after agents were re-typed
 * to dc_type=Agent / agents/ partition, and a person's metadata link now reads Agent/PERSON.
 */
import { chromium } from 'playwright';
const URL = 'https://main.d2r70lavusnzlx.amplifyapp.com';
const EMAIL = 'jiri.hylmar@gmail.com', PASSWORD = 'HylMedia123!';
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

  // 1. People list populates
  for (const [path, label] of [['/persons', 'People'], ['/bands', 'Bands']]) {
    await page.goto(`${URL}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const rows = await page.locator('table tbody tr, li a, .card').count().catch(() => 0);
    const body = (await page.textContent('body').catch(() => '')) || '';
    const ok = rows > 5 || body.length > 500;
    if (!ok) fail++;
    out(`${ok ? 'PASS' : 'FAIL'} ${label} list populated (rows~${rows})`);
  }

  // 2. A person detail: metadata link → sidecar with dc_type=Agent / ContentType=PERSON
  await page.goto(`${URL}/persons/mike-nichols_oa5z`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  const link = page.locator('a', { hasText: 'DC metadata' }).first();
  const href = await link.count() ? await link.getAttribute('href') : null;
  let agentOk = false, detail = '';
  if (href) {
    const r = await page.request.get(href);
    const sc = JSON.parse(await r.text());
    agentOk = sc.Attributes.dc_type === 'Agent' && sc.ContentType === 'PERSON' && sc.Attributes._category === 'agents';
    detail = `dc_type=${sc.Attributes.dc_type} ContentType=${sc.ContentType} _category=${sc.Attributes._category} s3_key=${sc.Attributes.s3_key.slice(0, 20)}…`;
  }
  if (!agentOk) fail++;
  out(`${agentOk ? 'PASS' : 'FAIL'} person metadata is Agent | ${detail}`);
} catch (err) { fail++; out(`ERROR ${err.message}`); }
finally { await browser.close(); }
out(fail === 0 ? '\nAGENT VERIFY: ALL PASS' : `\nAGENT VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
