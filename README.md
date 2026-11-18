# Pico Pipette

Program, debug and manage a Raspberry Pi Pico running MicroPython, straight from a web browser.
There's nothing to install: plug in your Pico, open **https://romilly.github.io/pico-pipette/**, and click **Connect**.

Pico Pipette talks to the Pico over [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API),
which works in Chrome, Edge, and Firefox 151 or later, on desktop and laptop computers.

## What it does

- **Write code** in an editor with Python syntax colouring and line numbers.
- **Run code on the Pico** and see its output as it arrives. **Stop** a program that's still running.
  Programs can use `input()`: type to them in the box that appears while they run.
- **Find errors fast.** When a program fails, the line that caused it is highlighted in the editor,
  with the error message beside it.
- **See the variables** your program left behind when it finished, crashed or was stopped.
- **Try things in the REPL**, which shares variables with the program you last ran: look at them, change them, call your functions.
- **Open and save files** on your computer.
- **Browse the Pico's files**: open them in the editor, save to the Pico, delete, and create folders.
  **Save as main.py** makes your program run whenever the Pico powers up.
- **Install packages** from [micropython-lib](https://github.com/micropython/micropython-lib), GitHub or a URL,
  with their dependencies. The browser downloads them, so the Pico doesn't need Wi-Fi.
- **Check your connection** with the connection checker, which explains the common problems
  (another tab or program holding the Pico, power-only USB cables, boards without MicroPython, Linux permissions).

## Using it

- **Editor:** https://romilly.github.io/pico-pipette/
- **Help:** https://romilly.github.io/pico-pipette/help.html
- **Connection checker:** https://romilly.github.io/pico-pipette/check.html

To run your own copy, serve the folder over http and open it in a browser that supports Web Serial:

```
python3 -m http.server 8000
```

then visit http://localhost:8000/. (Opening `index.html` directly from disk won't work:
browsers only allow Web Serial and module scripts on `https://` or `localhost` pages.)

## Using Pipette in your own pages

The modules in `src/` have no dependencies and no build step, so a course or tutorial page can import them directly.
`examples/blink-lesson.html` is a complete lesson page with its own code box.
Pages hosted elsewhere should be able to import the published copies,
such as `https://romilly.github.io/pico-pipette/src/picolink.js`.

```js
import { PicoLink } from './src/picolink.js';
import { errorLine } from './src/traceback.js';

const link = new PicoLink(await navigator.serial.requestPort());
await link.open();
const { stdout, stderr } = await link.run('print("Hello from the Pico")');
```

## How it's built

```
index.html      the editor
help.html       help for people using the editor
check.html      the connection checker
examples/       how other pages can use Pipette
src/
  picolink.js     runs code on a Pico over Web Serial, using MicroPython's raw REPL
  micropython.js  runs code in MicroPython compiled to WebAssembly (for tests, and a future "no Pico" mode)
  traceback.js    finds the failing line in a MicroPython traceback
  highlight.js    colours Python code for the editor
  inspector.js    lists the global variables a program left behind
  repl.js         the interactive REPL: runs what's typed, decides when a block is complete, keeps history
  picofs.js       files on the Pico: list, read, write, delete, create folders
  packages.js     installs packages the way mip does
  localfiles.js   opens and saves files on your computer
test/           tests, run with Node's built-in test runner
```

Everything that talks to a board uses one small interface, so the same code works with a real Pico
or with MicroPython running in WebAssembly:

```
run(code, { onOutput, reset = true })  ->  { stdout, stderr }
interrupt()
sendInput(line)    (optional: typing for a running program's input())
```

Most tests run against real MicroPython (the WebAssembly build), not a mock.

## Developing

You'll need Node 20 or later.

```
npm install
npm test
```

## Scripted demos

Demos are written as short YAML files, step by step: captions, clicks, typing, running, the REPL, and so on.
`demo/demo.mjs` plays them in your own Chrome with a visible mouse pointer, ready to record
with a screen recorder, or as an MP4. VS Code completes and checks demo files as you write them,
using `demo/demo.schema.json`.

```
npm install
node demo/demo.mjs demo/intro.yaml
```

This is handy for tutorials and courses: a lesson's demo can be re-recorded in a minute whenever Pipette changes.
See [demo/README.md](demo/README.md) for the steps you can use.

## Licence

MIT. See [LICENSE](LICENSE).
