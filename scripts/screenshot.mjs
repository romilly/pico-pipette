// Makes docs/images/overview.png: the editor after a failed run, with MicroPython's WebAssembly build
// standing in for a Pico. Run from the project folder: node scripts/screenshot.mjs docs/images/overview.png
// Needs Chrome (set CHROME to its path if it isn't found).
import { startBrowser } from '../test/browser.mjs';
const out = process.argv[2];
const code = `temps = [21.5, 22.0, 22.4]

def average(readings):
    return sum(readings) / len(readings)

print("average", average(temps))
print("highest", max(temps))
print("lowest", lowest(temps))
`;
const b = await startBrowser();
if (b.skip) { console.log(b.skip); process.exit(1); }
const page = await b.browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
await page.goto(`${b.base}/test/blank.html`);
await page.evaluate(async (code) => {
  const { loadMicroPython } = await import('/node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs');
  const { createMicroPythonLink } = await import('/src/micropython.js');
  const { Connection } = await import('/src/connection.js');
  await import('/src/pipette-ide.js');
  const board = await createMicroPythonLink(loadMicroPython);
  const link = { ...board, open: async () => {}, close: async () => {}, sendInput: async () => {} };
  const serial = { addEventListener() {}, getPorts: async () => [{ getInfo: () => ({ usbVendorId: 0x2E8A }) }] };
  document.body.style.cssText = 'font-family: system-ui, sans-serif; margin: 1rem 1.5rem;';
  const h = document.createElement('h1'); h.textContent = 'Pico Pipette'; h.style.cssText='font-size:1.5rem;margin:0 0 .5rem';
  const el = document.createElement('pipette-ide');
  el.textContent = code;
  el.connection = new Connection(serial, { makeLink: () => link });
  document.body.append(h, el);
  window.el = el;
}, code);
await page.click('#connect');
await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready' && !document.querySelector('#files').classList.contains('busy'));
const setup = [
  'import os',
  "for d in ('dev', 'home', 'proc', 'tmp'):",
  '    try:',
  "        os.rmdir('/' + d)",
  '    except Exception as e:',
  '        print(d, e)',
  "os.mkdir('/lib')",
  "open('/main.py', 'w').write('x = 1\\n' * 20)",
  "open('/sensors.py', 'w').write('y = 2\\n' * 40)",
].join('\n');
await page.evaluate((s) => window.el.connection.link.run(s, { reset: false }), setup);
await page.click('#reload');
await page.waitForTimeout(500);
await page.fill('#filename', 'temps.py');
await page.click('#run');
await page.waitForFunction(() => /^(Finished|Stopped|Failed|Error)/.test(document.querySelector('#status').textContent) || document.querySelector('#stderr').textContent.length > 0, null, {timeout: 15000});
await page.waitForTimeout(500);
// The WebAssembly board has folders a real Pico doesn't; hide them
await page.$$eval('#pico-files .name', (els) => els.filter((e) => ['dev', 'home', 'proc'].some((n) => e.textContent.trim().endsWith(' ' + n)))
  .forEach((e) => { (e.closest('li') ?? e.parentElement).style.display = 'none'; }));
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: true });

await b.close();
