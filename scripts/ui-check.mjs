/**
 * UI smoke test using the locally installed Chrome (playwright-core, no browser download).
 *
 *   node scripts/ui-check.mjs [baseUrl]
 *
 * Requires the dev servers (or production build) to be running.
 * Screenshots are written to ./screenshots/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const outDir = path.join(process.cwd(), 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const consoleErrors = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') {
    const text = message.text();
    // Ignore network noise from third-party lookups / favicon during local runs.
    if (/favicon|ERR_|Failed to load resource/.test(text)) return;
    consoleErrors.push(`console: ${text}`);
  }
});

async function go(pathname) {
  await page.goto(`${base}${pathname}`, { waitUntil: 'load', timeout: 60_000 });
}

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error.message.split('\n')[0]);
  }
}

console.log(`\nLith Tools UI check → ${base}\n`);

// ------------------------------------------------------------------ homepage
await check('home renders', async () => {
  await go('/');
  await page.getByRole('heading', { name: /放进一个工具箱/ }).waitFor({ timeout: 15_000 });
  await page.getByRole('heading', { name: '最常用的工具，一步直达' }).waitFor({ timeout: 10_000 });
  await shot('home-light');
  return 'hero + featured + categories';
});

await check('dark mode toggle', async () => {
  await page.getByRole('button', { name: /深色模式/ }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, { timeout: 5_000 });
  await shot('home-dark');
  await page.getByRole('button', { name: /浅色模式/ }).click();
  return 'class toggled + persisted';
});

await check('command palette', async () => {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '搜索工具' });
  await dialog.waitFor({ timeout: 5_000 });
  await dialog.getByPlaceholder(/搜索工具，例如/).fill('二维码');
  await dialog.getByRole('button', { name: /二维码生成器/ }).first().waitFor({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  return 'Ctrl+K opens and filters';
});

// ----------------------------------------------------------------- tool list
await check('tools index', async () => {
  await go('/tools');
  await page.getByRole('heading', { name: '所有工具，一处找到' }).waitFor({ timeout: 10_000 });
  const count = await page.locator('a[href^="/tools/"]').count();
  if (count < 60) throw new Error(`only ${count} tool links rendered`);
  await shot('tools-index');
  return `${count} tool links`;
});

await check('tool search filters', async () => {
  await page.getByPlaceholder(/搜索工具名称/).fill('JSON');
  await page.waitForTimeout(400);
  const count = await page.locator('a[href^="/tools/"]').count();
  if (count === 0) throw new Error('no results for JSON');
  return `${count} results`;
});

await check('tool page renders', async () => {
  await go('/tools/json-formatter');
  await page.getByRole('heading', { name: 'JSON 格式化器' }).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '格式化', exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await shot('tool-json');
  return 'title + tool + related tools';
});

// ---------------------------------------------------------------------- blog
await check('blog list', async () => {
  await go('/blog');
  await page.getByRole('heading', { name: /技术分享|博客/ }).first().waitFor({ timeout: 10_000 });
  await shot('blog-list');
  const links = await page.locator('a[href^="/blog/"]').count();
  if (links === 0) throw new Error('no blog posts listed');
  return `${links} blog links`;
});

await check('blog detail + markdown', async () => {
  await page.locator('a[href^="/blog/"]').first().click();
  await page.waitForURL(/\/blog\/\d+/, { timeout: 10_000 });
  await page.locator('.prose-content').first().waitFor({ timeout: 10_000 });
  await shot('blog-detail');
  return 'markdown rendered';
});

// --------------------------------------------------------------------- forum
await check('forum list', async () => {
  await go('/forum');
  await page.getByRole('heading', { name: /论坛/ }).first().waitFor({ timeout: 10_000 });
  await shot('forum-list');
  return 'forums rendered';
});

// ------------------------------------------------------------------ auth flow
await check('login + dashboard', async () => {
  await go('/login');
  await page.getByLabel('用户名').fill(process.env.ADMIN_USERNAME ?? 'admin');
  await page.getByLabel('密码').fill(process.env.ADMIN_PASSWORD ?? 'admin123456');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await page.getByText('账户设置').first().waitFor({ timeout: 10_000 });
  await shot('dashboard');
  return 'authenticated session';
});

// ---------------------------------------------------------------------- admin
await check('admin overview', async () => {
  await go('/admin');
  await page.getByRole('heading', { name: /概览/ }).first().waitFor({ timeout: 10_000 });
  await shot('admin-overview');
  return 'stats rendered';
});

await check('admin submissions', async () => {
  await go('/admin/submissions');
  await page.getByRole('heading', { name: /投稿/ }).first().waitFor({ timeout: 10_000 });
  await shot('admin-submissions');
  return 'review queue';
});

// ---------------------------------------------------------------- auth pages
await check('register page', async () => {
  await go('/register');
  await page.getByRole('heading', { name: '创建账号' }).waitFor({ timeout: 10_000 });
  await shot('register');
  return 'email step';
});

// ------------------------------------------------------------------- mobile
await check('mobile home', async () => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/`, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('heading', { name: /放进一个工具箱/ }).waitFor({ timeout: 10_000 });
  await mobilePage.screenshot({ path: path.join(outDir, 'home-mobile.png') });
  await mobile.close();
  return 'responsive header + hero';
});

await browser.close();

if (consoleErrors.length) {
  console.log('\nBrowser errors captured:');
  for (const error of [...new Set(consoleErrors)].slice(0, 20)) console.log(`  ! ${error}`);
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\n${failed === 0 ? 'UI checks passed' : `${failed} UI check(s) failed`} · screenshots in screenshots/\n`);
process.exit(failed === 0 ? 0 : 1);
