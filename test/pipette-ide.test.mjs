// The <pipette-ide> element (the full editor), tested in Chrome with MicroPython's WebAssembly build
// standing in for the Pico. Skipped if Chrome can't be started; set CHROME to its path if it isn't found.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from './browser.mjs';

let b, page, dialogs;
before(async () => { b = await startBrowser(); });
after(async () => { await b.close(); });

// A fresh page holding one <pipette-ide> (window.el) containing code, whose "Pico" is MicroPython in WebAssembly.
async function fresh(code) {
  page = await b.browser.newPage();
  dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
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

// --- tabs

const tabNames = () => page.$$eval('#tabs .tab-name', (els) => els.map((e) => e.textContent));
const activeTab = () => page.$eval('#tabs .tab.active .tab-name', (e) => e.textContent);
const finished = () => page.waitForFunction(() => /^(Finished|Stopped)/.test(document.querySelector('#status').textContent));
// Put a file on the stand-in Pico, then refresh the files panel
async function picoFile(name, text) {
  await page.evaluate(([name, text]) => window.el.connection.link.run(`open('${name}', 'w').write(${JSON.stringify(text)})`), [name, text]);
  await page.click('#reload');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Showing /');
}

test('starts with one tab; + adds an empty one, and #editor is always the tab showing', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('print("first")\n');
  assert.deepEqual(await tabNames(), ['blink.py']);
  await page.click('#new-tab');
  assert.deepEqual(await tabNames(), ['blink.py', 'untitled.py']);
  assert.equal(await activeTab(), 'untitled.py');
  assert.equal(await page.inputValue('#filename'), 'untitled.py');
  assert.equal(await page.inputValue('#editor'), '');
  assert.equal(await page.$$eval('[id="editor"]', (els) => els.length), 1);
  assert.equal(await page.isVisible('#editor'), true);
});

test('each tab keeps its own code, and el.value is the tab showing', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('print("first")\n');
  await page.click('#new-tab');
  await page.fill('#editor', 'print("second")\n');
  assert.equal(await page.evaluate(() => window.el.value), 'print("second")\n');
  await page.click('#tabs .tab-name >> text=blink.py');
  assert.equal(await page.inputValue('#editor'), 'print("first")\n');
  assert.equal(await page.evaluate(() => window.el.value), 'print("first")\n');
  await page.click('#tabs .tab-name >> text=untitled.py');
  assert.equal(await page.inputValue('#editor'), 'print("second")\n');
});

test('typing marks the tab unsaved; closing it asks first, and closing the last tab leaves an empty one', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('x = 1\n');
  await page.type('#editor', 'y');
  assert.equal(await page.$eval('#tabs .tab.active', (e) => e.classList.contains('unsaved')), true);
  await page.click('#tabs .tab.active .tab-close');
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0], /blink\.py has unsaved changes/);
  assert.deepEqual(await tabNames(), ['untitled.py']);
  assert.equal(await page.inputValue('#editor'), '');
});

test('renaming in the filename box renames the tab', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('x = 1\n');
  await page.fill('#filename', 'lights.py');
  assert.deepEqual(await tabNames(), ['lights.py']);
});

test('opening a file from the Pico opens a tab, and opening it again switches to that tab', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('x = 1\n');
  await page.click('#connect');
  await ready();
  await picoFile('helpers.py', 'def double(n):\n    return 2 * n\n');
  await page.click('#pico-files .name >> text=helpers.py');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Opened'));
  assert.deepEqual(await tabNames(), ['blink.py', 'helpers.py']);
  assert.equal(await page.inputValue('#editor'), 'def double(n):\n    return 2 * n\n');
  await page.click('#tabs .tab-name >> text=blink.py');
  await page.click('#pico-files .name >> text=helpers.py');
  await page.waitForFunction(() => document.querySelector('#tabs .tab.active .tab-name').textContent === 'helpers.py');
  assert.deepEqual(await tabNames(), ['blink.py', 'helpers.py']);
  assert.equal(dialogs.length, 0);                       // no "replace unsaved changes?" any more
});

test('Run warns when the program imports an open tab whose changes are not on the Pico', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('import helpers\nprint(helpers.double(21))\n');
  await page.click('#connect');
  await ready();
  await page.click('#new-tab');
  await page.fill('#filename', 'helpers.py');
  await page.fill('#editor', 'def double(n):\n    return 2 * n\n');
  await page.click('#tabs .tab-name >> text=blink.py');
  await page.click('#run');
  await finished();
  assert.match(await text('#import-warning'), /helpers\.py.*not on the Pico/);
  await page.click('#tabs .tab-name >> text=helpers.py');
  await page.click('#save-pico');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Saved'));
  await page.click('#tabs .tab-name >> text=blink.py');
  await page.click('#run');
  await finished();
  assert.equal(await page.isHidden('#import-warning'), true);
  assert.equal(await text('#stdout'), '42\n');
});

test('an error inside another open file switches to its tab and marks the line', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('import helpers\nprint(helpers.half(0))\n');
  await page.click('#connect');
  await ready();
  await picoFile('helpers.py', '# helpers\ndef half(n):\n    return 1 / n\n');
  await page.click('#pico-files .name >> text=helpers.py');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Opened'));
  await page.click('#tabs .tab-name >> text=blink.py');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Finished with an error');
  assert.equal(await activeTab(), 'helpers.py');
  assert.deepEqual(await page.$$eval('.pipette-editor:not([hidden]) .pipette-gutter .error', (els) => els.map((e) => e.textContent)), ['3']);
  assert.match(await page.$eval('.pipette-where', (e) => e.textContent), /^Line 3: ZeroDivisionError/);
});

// --- go to definition across files
const selected = () => page.evaluate(() => {
  const t = document.querySelector('#editor');
  return { text: t.value.slice(t.selectionStart, t.selectionEnd), line: t.value.slice(0, t.selectionStart).split('\n').length };
});
async function ctrlClickWord(word, n = 1) {
  const where = await page.evaluate(([word, n]) => {
    const t = document.querySelector('#editor');
    let i = -1;
    for (let k = 0; k < n; k++) i = t.value.indexOf(word, i + 1);
    const style = getComputedStyle(t);
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${style.fontSize} ${style.fontFamily}`;
    const before = t.value.slice(0, i).split('\n');
    const box = t.getBoundingClientRect();
    return {
      x: box.left + parseFloat(style.paddingLeft) + (before.at(-1).length + 0.5) * measure.measureText('M').width,
      y: box.top + parseFloat(style.paddingTop) + (before.length - 0.5) * parseFloat(style.lineHeight),
    };
  }, [word, n]);
  await page.keyboard.down('Control');
  await page.mouse.click(where.x, where.y);
  await page.keyboard.up('Control');
}
const hintText = () => page.$eval('.pipette-editor:not([hidden]) .pipette-hint', (h) => (h.hidden ? null : h.textContent));

test('Ctrl-click on a name from a module on the Pico opens the module in a tab, at the definition', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('from helpers import double\nimport tools\nprint(double(2), tools.half(4))\n');
  await page.click('#connect');
  await ready();
  await page.evaluate(() => window.el.connection.link.run("import os\nos.mkdir('/lib')"));
  await picoFile('lib/helpers.py', '# helpers\n\ndef double(n):\n    return 2 * n\n');
  await picoFile('tools.py', 'from helpers import double as twice\n\ndef half(n):\n    return n / 2\n');
  await ctrlClickWord('double', 2);
  await page.waitForFunction(() => document.querySelector('#tabs .tab.active .tab-name').textContent === 'helpers.py');
  assert.deepEqual(await selected(), { text: 'double', line: 3 });
  assert.match(await text('#status'), /Opened \/lib\/helpers\.py/);
  await page.click('#tabs .tab-name >> text=blink.py');
  await ctrlClickWord('half');
  await page.waitForFunction(() => document.querySelector('#tabs .tab.active .tab-name').textContent === 'tools.py');
  assert.deepEqual(await selected(), { text: 'half', line: 3 });
  await ctrlClickWord('twice');
  await page.waitForFunction(() => document.querySelector('#tabs .tab.active .tab-name').textContent === 'helpers.py');
  assert.deepEqual(await selected(), { text: 'double', line: 3 }, 'a name the module imports is followed on');
  assert.deepEqual(await tabNames(), ['blink.py', 'helpers.py', 'tools.py'], 'helpers.py was not opened twice');
});

test('an open tab is used without the Pico; built-in modules and missing names say so', async (t) => {
  if (b.skip) return t.skip(b.skip);
  await fresh('import helpers\nimport machine\nhelpers.double(2)\nhelpers.nothing()\nmachine.Pin(25)\nimport gone\ngone.f()\n');
  await page.click('#new-tab');
  await page.fill('#filename', 'helpers.py');
  await page.fill('#editor', 'def double(n):\n    return 2 * n\n');
  await page.click('#tabs .tab-name >> text=blink.py');
  await ctrlClickWord('double');
  await page.waitForFunction(() => document.querySelector('#tabs .tab.active .tab-name').textContent === 'helpers.py');
  assert.deepEqual(await selected(), { text: 'double', line: 1 });
  await page.click('#tabs .tab-name >> text=blink.py');
  await ctrlClickWord('nothing');
  await page.waitForFunction(() => /nothing/.test(document.querySelector('#status').textContent));
  assert.match(await text('#status'), /Couldn't find nothing in helpers\.py/);
  await page.click('#tabs .tab-name >> text=blink.py');
  await ctrlClickWord('Pin');
  await page.waitForFunction(() => !!document.querySelector('.pipette-editor:not([hidden]) .pipette-hint:not([hidden])'));
  assert.match(await hintText(), /machine is built into MicroPython/);
  await ctrlClickWord('f()');
  await page.waitForFunction(() => /connect to the Pico/.test(document.querySelector('.pipette-editor:not([hidden]) .pipette-hint').textContent));
  assert.match(await hintText(), /gone isn't open in a tab: connect to the Pico to look for it there/);
  await page.click('#connect');
  await ready();
  await ctrlClickWord('f()');
  await page.waitForFunction(() => /isn't on the Pico/.test(document.querySelector('#status').textContent));
});
