# CLAUDE.md

Notes for Claude when working on Pico Pipette.

## What this is

A browser tool for programming and debugging a Raspberry Pi Pico running MicroPython, over Web Serial.
See README.md for features and layout.

## Ways of working

- Test first. Write or change a failing test, see it fail, then make it pass.
- Keep it simple: plain JavaScript ES modules, no build step, no frameworks, no runtime dependencies.
- Code in `src/` must not touch the DOM, except `localfiles.js` and `editor.js` (the editor component, which other projects
  such as course-platform also use: keep its API stable). Pages (`index.html`, `check.html`, `examples/`) hold the UI.
- Everything that talks to a board goes through the port: an object with
  `run(code, { onOutput, reset = true }) -> { stdout, stderr }` and `interrupt()`, plus optionally `sendInput(line)`.
  Adapters: `PicoLink` (Web Serial, `src/picolink.js`) and `createMicroPythonLink` (WebAssembly MicroPython, `src/micropython.js`).
- Snippets run on the Pico wrap their work in a function and delete it afterwards, so the learner's globals stay clean.
- It must work on Node 20.9, the version on the maintainer's machine.
- Commit and push freely; no need to ask first.
- Demos are YAML files in `demo/`, described by `demo/demo.schema.json` and played by `demo/steps.js`
  (a test checks the schema and `ACTIONS` match: add new actions to both, and to `demo/README.md`).
- Demo videos go in `demo/` (the demo script saves plain `DEMO_VIDEO` names there). They're kept in ordinary git, not LFS,
  so commit only small, final versions; the main demo video is published on YouTube.

## Commands

- `npm install` once, then `npm test` (runs `node --test`). The editor tests need Chrome: set `CHROME` if it isn't found.
- To try the pages locally: `python3 -m http.server 8000`, then open http://localhost:8000/ in Chrome or Edge.
