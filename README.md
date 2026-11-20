# Pico Pipette

Program, debug and manage a Raspberry Pi Pico running MicroPython, straight from a web browser.
There's nothing to install: plug in your Pico, open **https://romilly.github.io/pico-pipette/**, and click **Connect**.

Pico Pipette talks to the Pico over [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API),
which works in Chrome, Edge, and Firefox 151 or later, on desktop and laptop computers.

## What it does

- **Connect and disconnect**: a dot shows whether you're connected, and **Disconnect** releases the Pico's USB
  connection so other programs (Thonny, another tab) can use it.
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

### The `<pico-pipette>` element

The quickest way: one script tag, then a `<pico-pipette>` element wherever you want a code editor
with **Connect**, **Run** and **Stop** buttons and the program's output. No install, no build step:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pico-pipette.js"></script>

<pico-pipette rows="8">
  from machine import Pin
  led = Pin("LED", Pin.OUT)
  led.toggle()
</pico-pipette>
```

The code inside the element is its starting code; the indentation all its lines share is removed.
Write `<` as `&lt;` and `&` as `&amp;` there, as anywhere in HTML.
**Run** connects first if need be. When a program fails, its failing line is marked in the editor.
`examples/blink-lesson.html` is a complete lesson page using it.

From JavaScript:

```js
const el = document.querySelector('pico-pipette');
el.value = 'print("hi")';                 // get or set the code
const { stdout, stderr } = await el.run(); // run it; el.stop() interrupts a running program
el.addEventListener('done', (e) => console.log(e.detail.stdout));
el.addEventListener('connection', (e) => console.log(e.detail.state));   // 'connected', 'connecting', 'disconnected'
```

Several elements on one page can share one Pico: give each the same `Connection`
(`other.connection = first.connection`) before adding it to the page.

You can also install it from npm (`npm install pico-pipette`) and `import 'pico-pipette'`.

### The `<pipette-ide>` element

The whole editor, as on https://romilly.github.io/pico-pipette/, in one tag: connection, files on your computer
and on the Pico, packages, output, typing to `input()`, the REPL and the variables.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pipette-ide.js"></script>

<pipette-ide>
  print("Hello from the Pico")
</pipette-ide>
```

With no code inside, it starts with a blink program. It has `value` and `connection` and fires `connection` events,
like `<pico-pipette>`. Its parts have fixed ids (`#run`, `#editor`...), so use one per page.

### The modules

For a page of your own design, the modules in `src/` have no dependencies and no build step, so a page can import
them directly, from your own copy or from the published package,
such as `https://cdn.jsdelivr.net/npm/pico-pipette/src/picolink.js`.

```js
import { PicoLink } from './src/picolink.js';
import { createEditor } from './src/editor.js';

// Pipette's editor: line numbers, colours, and the failing line marked after an error.
// It adds its own styles; make as many as you like on one page.
const editor = createEditor({ value: 'print("Hello from the Pico")', rows: 8 });
document.body.append(editor.element, editor.where);   // where shows "Line n: ..." after an error

const link = new PicoLink(await navigator.serial.requestPort());
await link.open();
const { stdout, stderr } = await link.run(editor.value);
editor.markError(stderr);   // returns the failing line's number, or null
```

To offer a Connect/Disconnect toggle and show the connection's state, use a `Connection`.
It reconnects to an already-allowed Pico without asking, notices when the board is unplugged, and stops any
running program before releasing the port:

```js
import { Connection } from './src/connection.js';

const connection = new Connection(navigator.serial);
connection.onChange(state => { /* 'disconnected', 'connecting' or 'connected': update your page */ });
button.onclick = () => connection.toggle();
const link = await connection.connect();   // the link, connecting first if need be
```

The editor also has `textarea` (its `input` event fires on every edit, Tab included), `clearError()`,
`selectLine(n)`, and `refresh()` for after changing `textarea.value` directly.
Its classes start `pipette-`, and syntax colours use `tok-` classes; a page's own CSS can restyle either.

## How it's built

```
index.html      the editor page (a <pipette-ide> with a heading)
help.html       help for people using the editor
check.html      the connection checker
examples/       how other pages can use Pipette
src/
  picolink.js     runs code on a Pico over Web Serial, using MicroPython's raw REPL
  connection.js   connecting to a Pico and letting it go, with its state for the page to show
  micropython.js  runs code in MicroPython compiled to WebAssembly (for tests, and a future "no Pico" mode)
  pico-pipette.js the <pico-pipette> element: editor, Connect/Run/Stop and output in one tag
  pipette-ide.js  the <pipette-ide> element: the whole editor in one tag (index.html is just this)
  dedent.js       tidies the code written inside an element
  editor.js       the code editor component (line numbers, colours, error line), used by the pages
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
The editor's tests run in Chrome (via playwright-core); they're skipped if Chrome can't be found
(set `CHROME` to its path).

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
