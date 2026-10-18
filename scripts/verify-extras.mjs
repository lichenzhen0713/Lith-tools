/**
 * Extra checks: AI assistant page (modes) and KaTeX rendering after font pruning.
 */
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  if (/\.(woff2|woff|ttf)$/.test(request.url())) failures.push(`font failed: ${request.url()}`);
});

// login
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.getByLabel('用户名').fill('admin');
await page.getByLabel('密码').fill('admin123456');
await page.getByRole('button', { name: '登录' }).click();
await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

// assistant
await page.goto(`${base}/assistant`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: /多种模式/ }).waitFor({ timeout: 10_000 });
const modeCount = await page.locator('button[aria-pressed]').count();
if (modeCount < 5) failures.push(`expected 5 modes, found ${modeCount}`);
await page.getByRole('button', { name: /深度思考/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/assistant.png', fullPage: false });

// admin settings: masked view + runtime source
const settings = await page.evaluate(async () => {
  const response = await fetch('/api/admin/settings');
  return { status: response.status, data: await response.json() };
});
if (settings.status !== 200) failures.push(`admin settings returned ${settings.status}`);
if (settings.data?.ai && ('apiKey' in settings.data.ai || 'pass' in (settings.data.mail ?? {}))) {
  failures.push('admin settings leaked a secret field');
}
if (!settings.data?.ai?.hasApiKey && !settings.data?.ai?.configured) {
  failures.push('admin settings missing AI status');
}

// KaTeX after pruning legacy fonts
await page.goto(`${base}/blog/2`, { waitUntil: 'domcontentloaded' });
await page.locator('.katex').first().waitFor({ timeout: 15_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'screenshots/blog-math.png', fullPage: false });
const katexCount = await page.locator('.katex').count();
if (katexCount === 0) failures.push('KaTeX did not render');

await browser.close();
console.log(`modes=${modeCount} katex=${katexCount} fontFailures=${failures.filter((item) => item.startsWith('font')).length}`);
for (const failure of failures) console.log(`  ! ${failure}`);
process.exit(failures.length ? 1 : 0);
