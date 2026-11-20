// The <pico-pipette> element, tested in a real browser (Chrome, via playwright-core) with a fake Pico.
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

// A fresh page holding one <pico-pipette> (window.el) containing code, connected through a fake Pico.
// The fake's run() replies with reply, or with no reply keeps running until interrupted.
// window.ran lists the code it was asked to run; window.done lists the details of 'done' events.
async function fresh(code, reply, { noSerial = false, beforeRun = false } = {}) {
  page = await browser.newPage();
  await page.goto(`${base}/test/blank.html`);
  await page.evaluate(async ({ code, reply, noSerial, beforeRun }) => {
    const { Connection } = await import('/src/connection.js');
    await import('/src/pico-pipette.js');
    window.ran = [];
    window.done = [];
    let finish;
    const link = {
      open: async () => {},
      close: async () => {},
      run: (code, { onOutput } = {}) => {
        window.ran.push(code);
        if (!reply) return new Promise((resolve) => { finish = resolve; });
        onOutput?.({ stdout: reply.stdout });
        return Promise.resolve(reply);
      },
      interrupt: async () => finish?.({ stdout: '', stderr: 'KeyboardInterrupt:\n' }),
    };
    const serial = { addEventListener() {}, getPorts: async () => [{ getInfo: () => ({ usbVendorId: 0x2E8A }) }] };
    const el = document.createElement('pico-pipette');
    el.textContent = code;
    el.connection = new Connection(noSerial ? null : serial, { makeLink: () => link });
    window.steps = [];
    if (beforeRun) {
      el.beforeRun = async (l, { say }) => {
        window.steps.push(l === link ? 'before run, given the link' : 'before run, given something else');
        say('Saving helpers…');
        window.said = document.querySelector('pico-pipette .pipette-output').textContent;
      };
    }
    const run = link.run;
    link.run = (...args) => { window.steps.push('run'); return run(...args); };
    el.addEventListener('done', (e) => window.done.push(e.detail));
    document.body.append(el);
    window.el = el;
  }, { code, reply, noSerial, beforeRun });
}

const inside = (selector, fn = (e) => e.textContent) => page.$eval(`pico-pipette ${selector}`, fn);
const disabled = (name) => inside(`button[name=${name}]`, (b) => b.disabled);

test('shows the code it contains, without the indentation, in an editor', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('\n    x = 1\n    if x:\n        print(x)\n  ');
  assert.equal(await page.evaluate(() => window.el.value), 'x = 1\nif x:\n    print(x)\n');
  assert.equal(await inside('textarea', (e) => e.value), 'x = 1\nif x:\n    print(x)\n');
  assert.equal(await inside('button[name=connect]'), 'Connect');
  assert.equal(await disabled('run'), false);
  assert.equal(await disabled('stop'), true);
});

test('a dot and a word show the connection', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('print(1)\n', { stdout: '1\r\n', stderr: '' });
  assert.equal(await inside('.pipette-connection', (e) => e.className), 'pipette-connection disconnected');
  assert.equal(await inside('.pipette-status'), 'Not connected');
  await page.click('pico-pipette button[name=connect]');
  await page.waitForFunction(() => window.el.connection.connected);
  assert.equal(await inside('.pipette-connection', (e) => e.className), 'pipette-connection connected');
  assert.equal(await inside('.pipette-connection .dot', (e) => getComputedStyle(e).backgroundColor), 'rgb(46, 157, 79)');
});

test('value sets the code', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('x = 1\n');
  await page.evaluate(() => { window.el.value = 'print(2)\n'; });
  assert.equal(await inside('textarea', (e) => e.value), 'print(2)\n');
});

test('Run connects if need be, runs the code, shows its output and says it is done', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('print("hi")\n', { stdout: 'hi\r\n', stderr: '' });
  await page.click('pico-pipette button[name=run]');
  await page.waitForFunction(() => window.done.length === 1);
  assert.deepEqual(await page.evaluate(() => window.ran), ['print("hi")\n']);
  assert.equal(await inside('.pipette-output'), 'hi\r\n');
  assert.deepEqual(await page.evaluate(() => window.done[0]), { stdout: 'hi\r\n', stderr: '' });
  assert.equal(await inside('button[name=connect]'), 'Disconnect');
  assert.equal(await inside('.pipette-status'), 'Connected');
});

test('an error marks the failing line in the editor', async (t) => {
  if (skip) return t.skip(skip);
  const stderr = 'Traceback (most recent call last):\n  File "<stdin>", line 2, in <module>\nNameError: name \'y\' isn\'t defined\n';
  await fresh('x = 1\nprint(y)\n', { stdout: '', stderr });
  await page.click('pico-pipette button[name=run]');
  await page.waitForFunction(() => window.done.length === 1);
  assert.deepEqual(await page.$$eval('pico-pipette .pipette-gutter .error', (els) => els.map((e) => e.textContent)), ['2']);
  assert.equal(await inside('.pipette-where'), "Line 2: NameError: name 'y' isn't defined");
});

test('Stop interrupts a running program', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('while True:\n    pass\n');
  await page.click('pico-pipette button[name=run]');
  await page.waitForFunction(() => !document.querySelector('pico-pipette button[name=stop]').disabled);
  assert.equal(await disabled('run'), true);
  await page.click('pico-pipette button[name=stop]');
  await page.waitForFunction(() => window.done.length === 1);
  assert.equal(await disabled('run'), false);
  assert.equal(await disabled('stop'), true);
});

test('Disconnect lets the Pico go', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('print(1)\n', { stdout: '1\r\n', stderr: '' });
  await page.click('pico-pipette button[name=connect]');
  await page.waitForFunction(() => window.el.connection.connected);
  await page.click('pico-pipette button[name=connect]');
  await page.waitForFunction(() => !window.el.connection.connected);
  assert.equal(await inside('button[name=connect]'), 'Connect');
});

test('beforeRun is called with the link after connecting and before the code runs, and can say what it is doing', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('print(1)\n', { stdout: '1\r\n', stderr: '' }, { beforeRun: true });
  await page.click('pico-pipette button[name=run]');
  await page.waitForFunction(() => window.done.length === 1);
  assert.deepEqual(await page.evaluate(() => window.steps), ['before run, given the link', 'run']);
  assert.equal(await page.evaluate(() => window.said), 'Saving helpers…');
  assert.equal(await inside('.pipette-output'), '1\r\n');
});

test('Start again puts back the starting code', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('x = 1\n');
  await page.fill('pico-pipette textarea', 'x = 2\n');
  await page.click('pico-pipette button[name=reset]');
  assert.equal(await inside('textarea', (e) => e.value), 'x = 1\n');
});

test('without Web Serial, Run and Connect are off and it says what is needed', async (t) => {
  if (skip) return t.skip(skip);
  await fresh('print(1)\n', undefined, { noSerial: true });
  assert.equal(await disabled('run'), true);
  assert.equal(await disabled('connect'), true);
  assert.match(await inside('.pipette-error'), /Chrome or Edge/);
});
