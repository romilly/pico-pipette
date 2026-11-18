// The editor component, tested in a real browser (Chrome, via playwright-core).
// Skipped if Chrome can't be started; set CHROME to its path if it isn't found.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
let server, browser, page, base, skip = false;

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'text/plain' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
  } catch {
    skip = 'Chrome could not be started (set CHROME to its path)';
  }
});

after(async () => {
  await browser?.close();
  server.close();
});

// A fresh page holding one editor, made by createEditor(options); it's window.editor.
async function fresh(options) {
  page = await browser.newPage();
  await page.goto(`${base}/test/blank.html`);
  await page.evaluate(async (options) => {
    const { createEditor } = await import('/src/editor.js');
    window.editor = createEditor(options);
    document.body.append(window.editor.element, window.editor.where);
  }, options);
}

const CODE = 'import time\nx = 1\nprint(y)\n';
const TRACE = 'Traceback (most recent call last):\n  File "<stdin>", line 3, in <module>\nNameError: name \'y\' isn\'t defined\n';
const gutter = () => page.$eval('.pipette-gutter', (g) => g.textContent);
const errorNumber = () => page.$$eval('.pipette-gutter .error', (els) => els.map((e) => e.textContent));
const bandShown = () => page.$eval('.pipette-error-band', (b) => getComputedStyle(b).display !== 'none');
const selection = () => page.evaluate(() => {
  const t = window.editor.textarea;
  return t.value.slice(t.selectionStart, t.selectionEnd);
});

test('shows the code with line numbers and colours', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE, id: 'editor' });
  assert.equal(await gutter(), '1\n2\n3\n4');
  assert.equal(await page.$eval('#editor', (e) => e.value), CODE);
  assert.match(await page.$eval('.pipette-colour', (c) => c.innerHTML), /<span class="tok-keyword">import<\/span>/);
});

test('a traceback marks the line it points to, selects it, and says where', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  assert.equal(await page.evaluate((s) => window.editor.markError(s), TRACE), 3);
  assert.deepEqual(await errorNumber(), ['3']);
  assert.equal(await bandShown(), true);
  assert.equal(await selection(), 'print(y)');
  assert.equal(await page.$eval('.pipette-where', (w) => w.textContent), "Line 3: NameError: name 'y' isn't defined");
});

test('the "Line n" link selects the line again', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  await page.evaluate((s) => window.editor.markError(s), TRACE);
  await page.evaluate(() => window.editor.textarea.setSelectionRange(0, 0));
  await page.click('.pipette-where a');
  assert.equal(await selection(), 'print(y)');
});

test('output without a traceback in the learner\'s code marks nothing', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  assert.equal(await page.evaluate(() => window.editor.markError('')), null);
  assert.equal(await page.evaluate(() => window.editor.markError('OSError: [Errno 2] ENOENT\n')), null);
  assert.deepEqual(await errorNumber(), []);
  assert.equal(await bandShown(), false);
  assert.equal(await page.$eval('.pipette-where', (w) => w.textContent), '');
});

test('typing clears the error mark', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  await page.evaluate((s) => window.editor.markError(s), TRACE);
  await page.type('.pipette-editor textarea', 'z');
  assert.deepEqual(await errorNumber(), []);
  assert.equal(await bandShown(), false);
  assert.equal(await page.$eval('.pipette-where', (w) => w.textContent), '');
});

test('setting the value redraws and clears the error mark', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  await page.evaluate((s) => window.editor.markError(s), TRACE);
  await page.evaluate(() => { window.editor.value = 'a = 1\nb = 2'; });
  assert.equal(await gutter(), '1\n2');
  assert.deepEqual(await errorNumber(), []);
});

test('Tab inserts four spaces rather than leaving the editor', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: '' });
  await page.focus('.pipette-editor textarea');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x');
  assert.equal(await page.evaluate(() => window.editor.value), '    x');
});

test('editors on the same page are independent', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  await page.evaluate(async () => {
    const { createEditor } = await import('/src/editor.js');
    window.other = createEditor({ value: 'one\ntwo' });
    document.body.append(window.other.element);
  });
  await page.evaluate((s) => window.editor.markError(s), TRACE);
  assert.deepEqual(await page.$$eval('.pipette-gutter', (gs) => gs.map((g) => g.textContent)), ['1\n2\n3\n4', '1\n2']);
  assert.equal(await page.$$eval('.pipette-gutter .error', (els) => els.length), 1);
  assert.equal(await page.$$eval('style[data-pipette-editor]', (els) => els.length), 1);
});

test('Tab counts as an edit: it fires input, like typing', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: '' });
  await page.evaluate(() => {
    window.edits = 0;
    window.editor.textarea.addEventListener('input', () => window.edits++);
  });
  await page.focus('.pipette-editor textarea');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.edits), 1);
});
