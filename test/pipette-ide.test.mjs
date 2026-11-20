// The <pipette-ide> element (the full editor), tested in Chrome with MicroPython's WebAssembly build
// standing in for the Pico. Skipped if Chrome can't be started; set CHROME to its path if it isn't found.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from './browser.mjs';

let b, page;
before(async () => { b = await startBrowser(); });
after(async () => { await b.close(); });

// A fresh page holding one <pipette-ide> (window.el) containing code, whose "Pico" is MicroPython in WebAssembly.
async function fresh(code) {
  page = await b.browser.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(`${b.base}/test/blank.html`);
  await page.evaluate(async (code) => {
    const { loadMicroPython } = await import('/node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs');
    const { createMicroPythonLink } = await import('/src/micropython.js');
    const { Connection } = await import('/src/connection.js');
    await import('/src/pipette-ide.js');
    const board = await createMicroPythonLink(loadMicroPython);
    const link = { ...board, open: async () => {}, close: async () => {}, sendInput: async () => {} };
    const serial = { addEventListener() {}, getPorts: async () => [{ getInfo: () => ({ usbVendorId: 0x2E8A }) }] };
    const el = document.createElement('pipette-ide');
    el.textContent = code;
    el.connection = new Connection(serial, { makeLink: () => link });
    document.body.append(el);
    window.el = el;
  }, code);
}

const text = (selector) => page.$eval(selector, (e) => e.textContent);
const ready = () => page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready'
  && !document.querySelector('#files').classList.contains('busy'));

test('shows the full editor, holding the code inside the element', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('\n  x = 1\n  print(x)\n');
  assert.equal(await page.inputValue('pipette-ide #editor'), 'x = 1\nprint(x)\n');
  assert.equal(await page.evaluate(() => window.el.value), 'x = 1\nprint(x)\n');
  assert.equal(await text('#connection-text'), 'Not connected');
  for (const id of ['run', 'save-pico', 'install', 'repl-input']) assert.equal(await page.isDisabled(`#${id}`), true, id);
  assert.equal(await page.isEnabled('#connect'), true);
});

test('Connect shows the Pico\'s files; Run shows the output and the variables', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('x = 41 + 1\nprint(x)\n');
  await page.click('#connect');
  await ready();
  assert.equal(await page.$eval('#connection', (e) => e.className), 'connection connected');
  await page.evaluate(() => window.el.connection.link.run("open('hello.py', 'w').write('1')"));
  await page.click('#reload');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Showing /');
  assert.ok((await page.$$eval('#pico-files .name', (els) => els.map((e) => e.textContent))).includes('hello.py'));
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Finished');
  assert.equal(await text('#stdout'), '42\n');
  assert.deepEqual(await page.$$eval('#variables td', (tds) => tds.map((td) => td.textContent)), ['x', 'int', '42']);
});

test('the REPL shares variables with the program', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('x = 21\n');
  await page.click('#connect');
  await ready();
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Finished');
  await page.fill('#repl-input', 'x * 2');
  await page.press('#repl-input', 'Enter');
  await page.waitForFunction(() => document.querySelector('#repl-log').textContent.includes('42'));
});
