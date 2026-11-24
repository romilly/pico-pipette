# For developers

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

For working on Pico Pipette itself. To understand the design first, read [How Pipette works](how-it-works.md).

## Getting started

You'll need Node 20.9 or later, and Chrome for the browser tests.

```
git clone https://github.com/romilly/pico-pipette.git
cd pico-pipette
npm install
npm test
```

To try the pages, run `python3 -m http.server 8000` and open <http://localhost:8000/> in Chrome or Edge.

## Layout

```
index.html      the editor page (a <pipette-ide> with a heading)
help.html       the user guide's index
help/           the user guide's pages, and help.css
check.html      the connection checker
examples/       how other pages can use Pipette
docs/           this documentation, published on GitHub Pages (docs/demo.md plays the videos in demo/)
demo/           scripted demos and the demo player
src/
  picolink.js     runs code on a Pico over Web Serial, using MicroPython's raw REPL
  connection.js   connecting to a Pico and letting it go, with its state for the page to show
  micropython.js  runs code in MicroPython compiled to WebAssembly (for tests, and a future "no Pico" mode)
  pico-pipette.js the <pico-pipette> element: editor, Connect/Run/Stop and output in one tag
  pipette-ide.js  the <pipette-ide> element: the whole editor in one tag
  dedent.js       tidies the code written inside an element
  editor.js       the code editor component (line numbers, colours, error line, go to definition)
  definitions.js  finds where a name is defined: in the file, or in a module it imports
  traceback.js    finds the failing line in a MicroPython traceback
  tabs.js         the editor's tabs: open files, unsaved changes, which imported modules aren't on the Pico
  highlight.js    colours Python code for the editor
  inspector.js    lists the global variables a program left behind
  repl.js         the interactive REPL: runs what's typed, decides when a block is complete, keeps history
  picofs.js       files on the Pico: list, read, write, delete, create folders
  packages.js     installs packages the way mip does
  localfiles.js   opens and saves files on your computer
  version.js      the version, shown on the editor page
test/           tests, run with Node's built-in test runner
```

## Conventions

- Test first: write or change a failing test, see it fail, then make it pass.
- Plain JavaScript ES modules: no build step, no frameworks, no runtime dependencies.
- Code in `src/` doesn't touch the DOM, except `localfiles.js`, `editor.js` and the two elements.
- Keep the elements' attributes, properties and events stable, `<pipette-ide>`'s ids (the demo scripts use them),
  and `editor.js`'s API (other projects use it).
- Everything that talks to a board goes through [the port](modules.md#the-port).

[CLAUDE.md](https://github.com/romilly/pico-pipette/blob/main/CLAUDE.md) has the same rules, for Claude Code.

## Tests

`npm test` runs every test with Node's built-in test runner. Most run against real MicroPython,
using its WebAssembly build, not a mock. The element and editor tests run in Chrome, through playwright-core,
and are skipped if Chrome can't be found: set `CHROME` to its path.

## Releasing

1. Change the version with `npm version patch` (or `minor`), never by hand: its hook copies the version into
   `src/version.js`, and a test checks they match.
2. Check what will be published with `npm pack --dry-run`. The package holds only `src/`, the README and the licence.
3. `npm publish`.

The editor site is GitHub Pages serving the repository's root, so pushing to `main` updates it.

## Scripted demos

Demos are short YAML files in `demo/`: captions, clicks, typing, runs, the REPL and so on.
`demo/demo.mjs` plays them in Chrome with a visible pointer, ready to record, or saves an MP4:

```
node demo/demo.mjs demo/intro.yaml
```

A lesson's demo can be re-recorded in a minute whenever Pipette changes.
[demo/README.md](https://github.com/romilly/pico-pipette/blob/main/demo/README.md) lists the steps you can use.
When you add a step, add it to `demo/demo.schema.json`, to `ACTIONS` in `demo/steps.js`, and to `demo/README.md`;
a test checks the first two match.

## Documentation

These pages follow the [Divio documentation system](https://docs.divio.com/documentation-system/):
tutorials, how-to guides, reference and explanation, kept separate. The user guide is `help.html` and the pages in `help/`,
plain HTML so the editor can link to it. The screenshot on the front pages, `docs/images/overview.png`, is made by
`node scripts/screenshot.mjs docs/images/overview.png`, with MicroPython's WebAssembly build standing in for a Pico.
