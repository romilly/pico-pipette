# CLAUDE.md

Notes for Claude when working on Pico Pipette.

## What this is

A browser tool for programming and debugging a Raspberry Pi Pico running MicroPython, over Web Serial.
See README.md for features and layout.

## Ways of working

- Test first. Write or change a failing test, see it fail, then make it pass.
- Keep it simple: plain JavaScript ES modules, no build step, no frameworks, no runtime dependencies.
- Code in `src/` must not touch the DOM, except `localfiles.js`. Pages (`index.html`, `check.html`, `examples/`) hold the UI.
- Everything that talks to a board goes through the port: an object with
  `run(code, { onOutput, reset = true }) -> { stdout, stderr }` and `interrupt()`.
  Adapters: `PicoLink` (Web Serial, `src/picolink.js`) and `createMicroPythonLink` (WebAssembly MicroPython, `src/micropython.js`).
- Snippets run on the Pico wrap their work in a function and delete it afterwards, so the learner's globals stay clean.
- It must work on Node 20.9, the version on the maintainer's machine.
- Commit and push freely; no need to ask first.
- Demo videos go in `demo/` (the demo script saves plain `DEMO_VIDEO` names there) and are stored with Git LFS.

## Commands

- `npm install` once, then `npm test` (runs `node --test`).
- To try the pages locally: `python3 -m http.server 8000`, then open http://localhost:8000/ in Chrome or Edge.
