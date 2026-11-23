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

test('markLine marks a given line and says what went wrong there', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: CODE });
  assert.equal(await page.evaluate(() => window.editor.markLine(2, 'ValueError: bad pin')), 2);
  assert.equal(await page.$eval('.pipette-gutter .error', (e) => e.textContent), '2');
  assert.equal(await page.$eval('.pipette-where', (e) => e.textContent), 'Line 2: ValueError: bad pin');
  assert.equal(await page.evaluate(() => window.editor.markLine(99, 'gone')), null);   // no such line: nothing marked
  assert.equal(await page.$$eval('.pipette-gutter .error', (es) => es.length), 0);
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

// --- go to definition
const DEFS = 'def double(x):\n    return 2 * x\n\nprint(double(3), len("ab"))\nhelpers.triple(3)\nimport helpers\n';
// Where the nth occurrence of word is on screen
const spot = (word, n = 1) => page.evaluate(([word, n]) => {
  const v = window.editor.value;
  let i = -1;
  for (let k = 0; k < n; k++) i = v.indexOf(word, i + 1);
  return window.editor.pointAt(i);
}, [word, n]);
const caretLine = () => page.evaluate(() => {
  const t = window.editor.textarea;
  return t.value.slice(0, t.selectionStart).split('\n').length;
});
const hint = () => page.$eval('.pipette-hint', (h) => (h.hidden ? null : h.textContent));
async function ctrlClick(where, key = 'Control') {
  await page.keyboard.down(key);
  await page.mouse.click(where.x, where.y);
  await page.keyboard.up(key);
}

test('Ctrl-click on a name selects its definition', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  await ctrlClick(await spot('double', 2));
  await page.waitForFunction(() => window.editor.textarea.selectionEnd > window.editor.textarea.selectionStart);
  assert.equal(await selection(), 'double');
  assert.equal(await caretLine(), 1);
});

test('Cmd-click (on a Mac) does the same', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  await ctrlClick(await spot('x', 2), 'Meta');
  await page.waitForFunction(() => window.editor.textarea.selectionEnd > window.editor.textarea.selectionStart);
  assert.equal(await selection(), 'x');
  assert.equal(await caretLine(), 1);
});

test('an ordinary click just places the caret', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  const where = await spot('double', 2);
  await page.mouse.click(where.x, where.y);
  assert.equal(await selection(), '');
  assert.equal(await caretLine(), 4);
});

test('F12 goes to the definition of the name at the caret', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  const where = await spot('double', 2);
  await page.mouse.click(where.x, where.y);
  await page.keyboard.press('F12');
  await page.waitForFunction(() => window.editor.textarea.selectionEnd > window.editor.textarea.selectionStart);
  assert.equal(await caretLine(), 1);
});

test('resting the pointer on a name shows where it is defined; moving away hides it', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  const where = await spot('double', 2);
  await page.mouse.move(where.x, where.y);
  await page.waitForFunction(() => !document.querySelector('.pipette-hint').hidden);
  assert.match(await hint(), /double: defined on line 1/);
  assert.match(await hint(), /click to go there/);
  await page.mouse.move(where.x, where.y + 200);
  await page.waitForFunction(() => document.querySelector('.pipette-hint').hidden);
});

test('Ctrl-click on a built-in name says so', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  await ctrlClick(await spot('len'));
  await page.waitForFunction(() => !document.querySelector('.pipette-hint').hidden);
  assert.match(await hint(), /len is built into MicroPython/);
});

test('a name from another file goes to editor.openModule, which may answer with a message', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: DEFS });
  await ctrlClick(await spot('triple'));
  await page.waitForFunction(() => !document.querySelector('.pipette-hint').hidden);
  assert.match(await hint(), /triple comes from helpers/, 'with nothing to open it, it says where it comes from');
  await page.evaluate(() => {
    window.asked = [];
    window.editor.openModule = async (found) => { window.asked.push(found); return 'Connect to look on the Pico'; };
  });
  await ctrlClick(await spot('triple'));
  await page.waitForFunction(() => document.querySelector('.pipette-hint').textContent === 'Connect to look on the Pico');
  assert.deepEqual(await page.evaluate(() => window.asked), [{ module: 'helpers', name: 'triple', line: 6 }]);
});

test('goTo selects a definition and scrolls it into view', async (t) => {
  if (skip) return t.skip(skip);
  await fresh({ value: 'x = 1\n'.repeat(200) + 'def far():\n    pass\n', rows: 10 });
  await page.evaluate(() => window.editor.goTo({ line: 201, column: 5, length: 3 }));
  assert.equal(await selection(), 'far');
  const visible = await page.evaluate(() => {
    const t = window.editor.textarea;
    const lineHeight = parseFloat(getComputedStyle(t).lineHeight);
    const top = 200 * lineHeight;
    return top >= t.scrollTop && top < t.scrollTop + t.clientHeight;
  });
  assert.equal(visible, true);
});
