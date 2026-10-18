/**
 * Capture full-page screenshots for visual review.
 *   node scripts/snapshot.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const outDir = path.join(process.cwd(), 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const routes = [
  ['home', '/'],
  ['tools', '/tools'],
  ['blog', '/blog'],
  ['login', '/login'],
  ['tool', '/tools/image-compress'],
];

for (const [name, route] of routes) {
  await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, `full-${name}.png`), fullPage: true });
  console.log(`captured ${route}`);
}

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${base}/`, { waitUntil: 'load', timeout: 60_000 });
await mobilePage.waitForTimeout(1200);
await mobilePage.screenshot({ path: path.join(outDir, 'full-home-mobile.png'), fullPage: true });
console.log('captured mobile home');

await browser.close();
