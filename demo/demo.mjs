// A scripted demo of Pico Pipette, for screen recording. Playwright drives your own Chrome
// while you record the window with a screen recorder (and the Pico with a camera).
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
// To slow everything down (or speed it up), set DEMO_PACE: 1.5 is half as slow again, 0.8 is quicker.
//   DEMO_PACE=1.5 node demo/demo.mjs
//
// To have Playwright record the page itself, set DEMO_VIDEO to the file you want.
// An .mp4 is converted from Playwright's WebM recording by your own ffmpeg:
//   DEMO_VIDEO=demo.mp4 node demo/demo.mjs
// A plain file name is saved in this demo folder (demo/demo.mp4); a path with a folder is used as given.
// Playwright records with its own copy of ffmpeg; if it's missing, the script says how to get it.
//
// Note: the demo saves its program as main.py on the Pico (replacing any main.py there)
// and installs the ssd1306 package into /lib.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LIVE = 'https://romilly.github.io/pico-pipette/';
const PACE = Number(process.env.DEMO_PACE) || 1;
const DEMO_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(DEMO_DIR, '.chrome-profile');
const SIZE = { width: 1280, height: 900 };

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

const pause = (page, seconds) => page.waitForTimeout(seconds * 1000 * PACE);
const typingDelay = ms => ms * PACE;

const scrollTo = (page, where) => page.evaluate(where => window.scrollTo({
  top: where === 'bottom' ? document.body.scrollHeight : 0, behavior: 'smooth',
}), where);

async function typeProgram(page, code) {
  await clickOn(page, '#editor', { x: 0.3, y: 0.15 });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(code, { delay: typingDelay(30) });
}

// Point at the first occurrence of `from` in the editor, select it, and type `to` over it.
// `within` picks which occurrence: the first `from` inside the first occurrence of `within`.
async function edit(page, from, to, { within = from } = {}) {
  const spot = await page.evaluate(({ from, within }) => {
    const editor = document.getElementById('editor');
    const outer = editor.value.indexOf(within);
    if (outer < 0 || !within.includes(from)) throw new Error(`"${from}" in "${within}" is not in the editor`);
    const start = outer + within.indexOf(from);
    // Where that text is on screen: monospace, so count lines and columns
    const before = editor.value.slice(0, start).split('\n');
    const style = getComputedStyle(editor);
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${style.fontSize} ${style.fontFamily}`;
    const charWidth = measure.measureText('M').width;
    const box = editor.getBoundingClientRect();
    return {
      start, end: start + from.length,
      x: box.left + parseFloat(style.paddingLeft) + (before.at(-1).length + from.length / 2) * charWidth - editor.scrollLeft,
      y: box.top + parseFloat(style.paddingTop) + (before.length - 0.5) * parseFloat(style.lineHeight) - editor.scrollTop,
    };
  }, { from, within });
  await page.mouse.move(spot.x, spot.y, { steps: Math.round(25 * PACE) });
  await page.evaluate(({ start, end }) => {
    const editor = document.getElementById('editor');
    editor.focus();
    editor.setSelectionRange(start, end);
  }, spot);
  await pause(page, 0.6);
  await page.keyboard.type(to, { delay: typingDelay(90) });
}

async function run(page) {
  await clickOn(page, '#run');
  await page.waitForFunction(() => /^(Finished|Stopped|Something)/.test(document.getElementById('status').textContent),
    null, { timeout: 120_000 });
}

const idle = page => page.waitForFunction(() => !document.getElementById('files').classList.contains('busy'),
  null, { timeout: 120_000 });

// Playwright clicks without moving the real mouse pointer, so draw one that follows its mouse.
async function showPointer(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-pointer')) return;
    const pointer = document.createElement('div');
    pointer.id = 'demo-pointer';
    pointer.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.5 16 L12 24 L15.5 22.5 L12 15 L19.5 15 Z"
      fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    Object.assign(pointer.style, { position: 'fixed', left: '0', top: '0', zIndex: 2000, pointerEvents: 'none',
      transform: 'translate(-3px, -2px)', filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.35))' });
    document.body.append(pointer);
    document.addEventListener('mousemove', e => {
      pointer.style.left = e.clientX + 'px';
      pointer.style.top = e.clientY + 'px';
    }, true);
    document.addEventListener('mousedown', e => {
      const ripple = document.createElement('div');
      Object.assign(ripple.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px',
        width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255, 170, 0, 0.45)', zIndex: 1999,
        pointerEvents: 'none', transition: 'transform 0.45s ease-out, opacity 0.45s ease-out' });
      document.body.append(ripple);
      requestAnimationFrame(() => { ripple.style.transform = 'scale(1.8)'; ripple.style.opacity = '0'; });
      setTimeout(() => ripple.remove(), 500);
    }, true);
  });
  await page.mouse.move(640, 450);
}

// Glide the pointer to an element, then click it, like a person would
async function clickOn(page, selector, { x = 0.5, y = 0.5 } = {}) {
  const element = page.locator(selector);
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: Math.round(25 * PACE) });
  await pause(page, 0.35);
  await page.mouse.down();
  await page.mouse.up();
}

// --- the demo

export async function runDemo(page) {
  await showPointer(page);
  await caption(page, 'Pico Pipette: MicroPython on a Raspberry Pi Pico, from your browser');
  await pause(page, 3);

  await caption(page, 'Connect to the Pico. There\'s nothing to install');
  await pause(page, 1.5);
  await clickOn(page, '#connect');
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
  await edit(page, 'led', 'leed', { within: 'led.toggle' });
  await pause(page, 1);
  await caption(page, '…and Pipette shows you where it went wrong');
  await run(page);
  await pause(page, 4);

  await caption(page, 'Fix it');
  await edit(page, 'leed', 'led');
  await pause(page, 1.5);

  await caption(page, 'Run a longer program, then stop it…');
  await edit(page, 'range(10)', 'range(1000)');
  await clickOn(page, '#run');
  await pause(page, 3.5);
  if (await page.isEnabled('#stop')) await clickOn(page, '#stop');
  await page.waitForFunction(() => /^(Finished|Stopped|Something)/.test(document.getElementById('status').textContent),
    null, { timeout: 120_000 });
  await caption(page, '…and see how far it got');
  await scrollTo(page, 'bottom');
  await pause(page, 4);
  await scrollTo(page, 'top');
  await pause(page, 1);

  await caption(page, 'Save it as main.py, and it runs whenever the Pico powers up');
  await clickOn(page, '#save-main');
  await idle(page);
  await pause(page, 3.5);

  await caption(page, 'Install packages from micropython-lib. The Pico doesn\'t need Wi-Fi');
  await clickOn(page, '#package');
  await page.keyboard.type('ssd1306', { delay: typingDelay(90) });
  await clickOn(page, '#install');
  await idle(page);
  await pause(page, 4);

  await caption(page, 'Try it: romilly.github.io/pico-pipette');
  await pause(page, 5);
  await caption(page, '');
}

// --- saving Playwright's recording

// Playwright records WebM. Save it as `target`, converting to MP4 with the system's ffmpeg if asked.
export function saveVideo(webm, target) {
  if (!/\.mp4$/i.test(target)) {
    fs.copyFileSync(webm, target);
    return;
  }
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target],
  { stdio: 'inherit' });
  if (result.error) throw new Error(`Could not run ffmpeg to make ${target}: ${result.error.message}. The WebM recording is ${webm}`);
  if (result.status !== 0) throw new Error(`ffmpeg could not convert the recording. The WebM recording is ${webm}`);
}

// --- run it in your own Chrome

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2] ?? LIVE;
  if (!/^https?:\/\//.test(url)) {
    console.error(`"${url}" isn't a web address. Usage:\n  node demo/demo.mjs [http://localhost:8000/]\n` +
      'With no address, the demo uses the live site.');
    process.exit(1);
  }
  const name = process.env.DEMO_VIDEO;
  const video = name && (name.includes('/') ? name : path.join(DEMO_DIR, name));   // plain names go in demo/
  const recordingDir = video && fs.mkdtempSync(path.join(os.tmpdir(), 'pipette-demo-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }),
      headless: false,
      viewport: SIZE,
      chromiumSandbox: true,                      // Playwright otherwise adds --no-sandbox, and Chrome shows a warning bar
      ignoreDefaultArgs: ['--enable-automation'], // hides the "controlled by automated test software" bar
      ...(video ? { recordVideo: { dir: recordingDir, size: SIZE } } : {}),
    });
  } catch (e) {
    if (/ffmpeg/i.test(e.message)) {
      console.error('Playwright needs its own copy of ffmpeg to record. Get it once with:\n  npx playwright-core install ffmpeg');
      process.exit(1);
    }
    throw e;
  }
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(url);
  console.log('Running the demo. If a port chooser appears, pick your Pico.');
  let failure;
  try {
    await runDemo(page);
    await pause(page, 1);
  } catch (e) {
    failure = e;   // still save whatever was recorded, then report the problem
  } finally {
    await context.close().catch(() => {});
  }
  if (video) {
    const webm = await page.video()?.path().catch(() => null);
    if (webm && fs.existsSync(webm)) {
      saveVideo(webm, video);
      fs.rmSync(recordingDir, { recursive: true, force: true });
      console.log(`Saved the recording as ${path.resolve(video)}${failure ? ' (the demo stopped early)' : ''}`);
    } else {
      console.error(`No recording was made (looked in ${recordingDir}).`);
    }
  }
  if (failure) {
    console.error(`The demo stopped: ${failure.message.split('\n')[0]}`);
    process.exit(1);
  }
}
