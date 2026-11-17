// Run a scripted demo of Pico Pipette, described in a YAML file, for screen recording.
// Playwright drives your own Chrome while you record the window with a screen recorder
// (and the Pico with a camera).
//
//   node demo/demo.mjs                                   runs demo/intro.yaml on the live site
//   node demo/demo.mjs demo/mine.yaml                    runs your own demo file
//   node demo/demo.mjs demo/mine.yaml http://localhost:8000/   ...on a local copy of Pipette
//
// Demo files are described by demo.schema.json; VS Code (with Red Hat's YAML extension) completes
// and checks them as you type. See demo/README.md for the steps you can use.
//
// Needs Google Chrome installed. To use Chromium or another Chromium-based browser instead,
// set CHROME to its path, e.g.  CHROME=/usr/bin/chromium node demo/demo.mjs
//
// The first time, a port chooser appears when the demo clicks Connect: pick your Pico.
// Chrome remembers that (in demo/.chrome-profile), so later runs need no clicks at all.
//
// To slow everything down (or speed it up), set DEMO_PACE: 1.5 is half as slow again, 0.8 is quicker.
// It overrides the pace in the demo file.  DEMO_PACE=1.5 node demo/demo.mjs
//
// To have Playwright record the page itself, set DEMO_VIDEO to the file you want.
// An .mp4 is converted from Playwright's WebM recording by your own ffmpeg:
//   DEMO_VIDEO=demo.mp4 node demo/demo.mjs
// A plain file name is saved in this demo folder (demo/demo.mp4); a path with a folder is used as given.
// Playwright records with its own copy of ffmpeg; if it's missing, the script says how to get it.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDemo } from './demofile.js';
import { runSteps } from './steps.js';

const DEMO_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(DEMO_DIR, '.chrome-profile');

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
  const args = process.argv.slice(2);
  const file = args.find(a => /\.ya?ml$/i.test(a)) ?? path.join(DEMO_DIR, 'intro.yaml');
  const urlArg = args.find(a => /^https?:\/\//.test(a));
  const unknown = args.filter(a => a !== file && a !== urlArg);
  if (unknown.length) {
    console.error(`Not a demo file or a web address: ${unknown.join(' ')}\n` +
      'Usage: node demo/demo.mjs [demo.yaml] [http://localhost:8000/]');
    process.exit(1);
  }
  let demo;
  try {
    demo = loadDemo(fs.readFileSync(file, 'utf8'), path.basename(file));
  } catch (e) {
    console.error(e.code === 'ENOENT' ? `Can't find the demo file ${file}` : e.message);
    process.exit(1);
  }
  const url = urlArg ?? demo.url;
  const pace = Number(process.env.DEMO_PACE) || demo.pace;
  const SIZE = demo.viewport;
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
  console.log(`Running "${demo.title}" (${demo.steps.length} steps). If a port chooser appears, pick your Pico.`);
  let failure;
  try {
    await runSteps(page, demo.steps, { pace, name: path.basename(file) });
    await page.waitForTimeout(1000);
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
