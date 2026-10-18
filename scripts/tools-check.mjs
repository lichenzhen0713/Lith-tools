/**
 * Tool page smoke test: visits every internal tool route and fails on
 * rendering errors / missing implementations. Screenshots the first tool of
 * each category for visual review.
 *
 *   node scripts/tools-check.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const outDir = path.join(process.cwd(), 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const catalog = await fetch(`${base}/api/tools`).then((response) => response.json());
const tools = catalog.tools.filter((tool) => tool.slug && !tool.isExternal);
const byCategory = new Map();
for (const tool of tools) {
  const key = tool.category?.slug ?? 'other';
  if (!byCategory.has(key)) byCategory.set(key, tool);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
let currentSlug = '';
const pageErrors = new Map();
const consoleErrors = new Map();
const push = (map, slug, value) => {
  const list = map.get(slug) ?? [];
  list.push(value);
  map.set(slug, list);
};
page.on('pageerror', (error) => push(pageErrors, currentSlug, error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/favicon|Failed to load resource|ERR_/.test(text)) return;
  push(consoleErrors, currentSlug, text.slice(0, 200));
});

const results = [];
for (const tool of tools) {
  currentSlug = tool.slug;
  const started = Date.now();
  try {
    await page.goto(`${base}/tools/${tool.slug}`, { waitUntil: 'load', timeout: 30_000 });
    await page.getByRole('heading', { name: tool.name, exact: false }).first().waitFor({ timeout: 10_000 });
    await page
      .waitForFunction(() => !document.querySelector('[aria-label="工具加载中"]'), null, { timeout: 15_000 })
      .catch(() => undefined);
    const body = await page.locator('body').innerText();
    if (/工具运行出错|页面渲染出错|该工具正在迁移中/.test(body)) {
      results.push({ slug: tool.slug, ok: false, reason: 'rendering error state' });
      continue;
    }
    if ((pageErrors.get(tool.slug)?.length ?? 0) > 0) {
      results.push({ slug: tool.slug, ok: false, reason: pageErrors.get(tool.slug)[0] });
      continue;
    }
    results.push({ slug: tool.slug, ok: true, ms: Date.now() - started });
    const hero = byCategory.get(tool.category?.slug ?? 'other');
    if (hero?.slug === tool.slug) {
      await page.screenshot({ path: path.join(outDir, `tool-${tool.category?.slug ?? 'other'}.png`) });
    }
  } catch (error) {
    results.push({ slug: tool.slug, ok: false, reason: error.message.split('\n')[0] });
  }
}

await browser.close();

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  if (!item.ok) console.log(`  ✗ ${item.slug} — ${item.reason}`);
}
const slowest = [...results].filter((item) => item.ok).sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 5);
console.log(`\n${results.length - failed.length}/${results.length} tool pages rendered without errors`);
if (slowest.length) console.log('slowest:', slowest.map((item) => `${item.slug} ${item.ms}ms`).join(', '));
for (const [slug, errors] of consoleErrors) {
  if (results.find((item) => item.slug === slug && item.ok)) {
    console.log(`  ! console error in ${slug}: ${errors[0]}`);
  }
}
console.log(`screenshots: first tool of each category in screenshots/\n`);
process.exit(failed.length === 0 ? 0 : 1);
