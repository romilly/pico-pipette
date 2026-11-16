// A scripted demo of Pico Pipette, for screen recording. Playwright drives your own Chrome
// while you record the window (and the Pico, with a camera) using OBS or similar.
//
//   node demo/demo.mjs                          uses the live site
//   node demo/demo.mjs http://localhost:8000/   uses a local copy
//
// Needs Google Chrome installed. To use Chromium or another Chromium-based browser instead,
// set CHROME to its path, e.g.  CHROME=/usr/bin/chromium node demo/demo.mjs
//
// The first time, a port chooser appears when the script clicks Connect: pick your Pico.
// Chrome remembers that (in demo/.chrome-profile), so later runs need no clicks at all.
//
// Note: the demo saves its program as main.py on the Pico (replacing any main.py there)
// and installs the ssd1306 package into /lib.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LIVE = 'https://romilly.github.io/pico-pipette/';
const PROFILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.chrome-profile');

const PROGRAM = `from machine import Pin
import time

led = Pin("LED", Pin.OUT)

for i in range(10):
    led.toggle()
    print("blink", i)
    time.sleep(0.25)

print("done")
`;

// --- helpers

async function caption(page, text) {
  await page.evaluate(text => {
    let box = document.getElementById('demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demo-caption';
      Object.assign(box.style, {
        position: 'fixed', left: '50%', bottom: '1.5rem', transform: 'translateX(-50%)', zIndex: 1000,
        background: 'rgba(20, 20, 20, 0.88)', color: '#fff', padding: '0.6rem 1.4rem', borderRadius: '10px',
        font: '600 1.3rem system-ui, sans-serif', maxWidth: '80%', textAlign: 'center', transition: 'opacity 0.3s',
      });
      document.body.append(box);
      document.body.style.paddingBottom = '6rem';   // so the caption never hides the bottom of the page
    }
    box.textContent = text;
    box.style.opacity = text ? 1 : 0;
  }, text);
}

const pause = (page, seconds) => page.waitForTimeout(seconds * 1000);

const scrollTo = (page, where) => page.evaluate(where => window.scrollTo({
  top: where === 'bottom' ? document.body.scrollHeight : 0, behavior: 'smooth',
}), where);

async function typeProgram(page, code) {
  await page.click('#editor');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(code, { delay: 30 });
}

// Select the first occurrence of `from` in the editor and type `to` over it
async function edit(page, from, to) {
  await page.evaluate(from => {
    const editor = document.getElementById('editor');
    const start = editor.value.indexOf(from);
    if (start < 0) throw new Error(`"${from}" is not in the editor`);
    editor.focus();
    editor.setSelectionRange(start, start + from.length);
  }, from);
  await pause(page, 0.6);
  await page.keyboard.type(to, { delay: 90 });
}

async function run(page) {
  await page.click('#run');
  await page.waitForFunction(() => /^(Finished|Stopped|Something)/.test(document.getElementById('status').textContent),
    null, { timeout: 120_000 });
}

const idle = page => page.waitForFunction(() => !document.getElementById('files').classList.contains('busy'),
  null, { timeout: 120_000 });

// --- the demo

export async function runDemo(page) {
  await caption(page, 'Pico Pipette: MicroPython on a Raspberry Pi Pico, from your browser');
  await pause(page, 3);

  await caption(page, 'Connect to the Pico. There\'s nothing to install');
  await pause(page, 1.5);
  await page.click('#connect');
  await page.waitForFunction(() => document.getElementById('status').textContent === 'Connected',
    null, { timeout: 120_000 });   // long enough to pick the Pico by hand on the first run
  await idle(page);
  await pause(page, 1.5);

  await caption(page, 'Write a program…');
  await typeProgram(page, PROGRAM);
  await pause(page, 1);

  await caption(page, '…and run it on the Pico. Watch the LED');
  await run(page);
  await pause(page, 2.5);

  await caption(page, 'Make a mistake…');
  await edit(page, '    led.toggle', '    leed.toggle');
  await pause(page, 1);
  await caption(page, '…and Pipette shows you where it went wrong');
  await run(page);
  await pause(page, 4);

  await caption(page, 'Fix it');
  await edit(page, 'leed', 'led');
  await pause(page, 1.5);

  await caption(page, 'Run a longer program, then stop it…');
  await edit(page, 'range(10)', 'range(1000)');
  await page.click('#run');
  await pause(page, 3.5);
  if (await page.isEnabled('#stop')) await page.click('#stop');
  await page.waitForFunction(() => /^(Finished|Stopped|Something)/.test(document.getElementById('status').textContent),
    null, { timeout: 120_000 });
  await caption(page, '…and see how far it got');
  await scrollTo(page, 'bottom');
  await pause(page, 4);
  await scrollTo(page, 'top');
  await pause(page, 1);

  await caption(page, 'Save it as main.py, and it runs whenever the Pico powers up');
  await page.click('#save-main');
  await idle(page);
  await pause(page, 3.5);

  await caption(page, 'Install packages from micropython-lib. The Pico doesn\'t need Wi-Fi');
  await page.click('#package');
  await page.keyboard.type('ssd1306', { delay: 90 });
  await page.click('#install');
  await idle(page);
  await pause(page, 4);

  await caption(page, 'Try it: romilly.github.io/pico-pipette');
  await pause(page, 5);
  await caption(page, '');
}

// --- run it in your own Chrome

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2] ?? LIVE;
  const context = await chromium.launchPersistentContext(PROFILE, {
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }),
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(url);
  console.log('Running the demo. If a port chooser appears, pick your Pico.');
  try {
    await runDemo(page);
  } finally {
    await pause(page, 1);
    await context.close();
  }
}
