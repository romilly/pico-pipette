// The version shown on the editor page matches the package's.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION } from '../src/version.js';
import { startBrowser } from './browser.mjs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));

test('src/version.js matches package.json (npm version needs both changing)', () => {
  assert.equal(VERSION, pkg.version);
});

let b;
before(async () => { b = await startBrowser(); });
after(async () => { await b.close(); });

test('the editor page shows the version', async (t) => {
  if (b.skip) return t.skip(b.skip);
  const page = await b.browser.newPage();
  await page.goto(`${b.base}/index.html`);
  await page.waitForFunction((v) => document.querySelector('#version')?.textContent === `v${v}`, pkg.version);
});
