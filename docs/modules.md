# The modules

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

The JavaScript modules in `src/`. They're plain ES modules with no dependencies, so a page can import them from
`https://cdn.jsdelivr.net/npm/pico-pipette/src/<name>.js` or from its own copy.
For examples, see [How to add Pipette to your own web page](embedding.md#a-page-of-your-own-design).

Only `editor.js` and `localfiles.js`, plus the two [elements](elements.md), use the DOM.
The others also run in Node.

## The port

Everything that talks to a board uses this interface. `PicoLink` provides it over Web Serial,
and `createMicroPythonLink` provides it with MicroPython compiled to WebAssembly.

| Member | Meaning |
|---|---|
| `run(code, { onOutput, reset = true })` | Runs `code` on the board. Resolves to `{ stdout, stderr }` when it ends. `onOutput({ stdout, stderr })` is called as output arrives. With `reset`, the board is soft-reset first, so nothing is left from earlier runs. |
| `interrupt()` | Stops a running program, as Ctrl-C does. |
| `sendInput(line)` | Optional. Sends a line of typing for the running program's `input()`. |

## `picolink.js`

| Export | Meaning |
|---|---|
| `new PicoLink(port)` | A port for a Pico on a Web Serial `SerialPort`. Has the port interface above, plus `open()`, `close()`, `running` (a promise while a program runs, otherwise `null`) and `onData(text)` (optional: called with everything received). |
| `choosePort(serial, { ask = false })` | Resolves to a `SerialPort`. Reuses the one Pico this site is already allowed to use, if exactly one is plugged in; otherwise, or with `ask: true`, shows the browser's chooser, listing only Raspberry Pi boards. `serial` is `navigator.serial`. |
| `RASPBERRY_PI_VID` | `0x2E8A`, Raspberry Pi's USB vendor id. |
| `parseReply(buffer)` | Parses a raw REPL reply into `{ stdout, stderr, done }`. |

## `connection.js`

`new Connection(serial, { makeLink })`: whether a page is connected to a Pico, and connecting or disconnecting.
`serial` is `navigator.serial`. `makeLink(port)` makes the link; by default, a `PicoLink`.

| Member | Meaning |
|---|---|
| `state` | `'disconnected'`, `'connecting'` or `'connected'` |
| `onChange(listener)` | Calls `listener(state)` whenever the state changes. |
| `connect({ ask = false })` | Resolves to the link, connecting first if need be. `ask: true` shows the browser's chooser even if a Pico is already allowed. |
| `disconnect()` | Stops any running program, waiting up to 2 seconds, then closes the port so other programs can use the board. |
| `toggle(options)` | `disconnect()` if connected, otherwise `connect(options)`. |
| `link` | The connected link, or `null`. |
| `connected` | `true` while there's a link. |

When the board is unplugged, the state becomes `'disconnected'`.

## `editor.js`

`createEditor({ value = '', rows = 14, id })` makes a code editor with line numbers, Python colours,
error marking and go to definition. It adds its own styles to the page once; make as many as you like.
`id` becomes the textarea's id.

| Member | Meaning |
|---|---|
| `element` | The editor, to add to the page. |
| `where` | An element that shows `Line n: message` after an error. Add it to the page where you want that shown. |
| `value` | The code. Read or write; writing clears any error mark. |
| `textarea` | The underlying textarea. Its `input` event fires on every edit, Tab included. |
| `markError(stderr)` | Marks the line a MicroPython traceback points to. Returns its number, or `null`. |
| `markLine(n, message)` | Marks line `n` with `message`. Returns `n`, or `null` if there's no such line. |
| `clearError()` | Removes the error mark. |
| `selectLine(n)` | Selects line `n`. |
| `goTo({ line, column = 1, length = 0 })` | Selects that text and scrolls it into view. |
| `pointAt(offset)` | `{ x, y }`: where a character is on screen. |
| `showHint(message, offset)`, `hideHint()` | Shows or hides a hint by a character. Text in backticks is shown as code. |
| `openModule` | Optional `async ({ module, name, line }) => message`, called for go to definition on a name from another file. The message it returns, if any, is shown by the name. |
| `refresh()` | Redraws, after changing `textarea.value` directly. |

Its classes start `pipette-`, and syntax colours use `tok-` classes.

## `picofs.js`

Files on the Pico. Each function takes a connected link first.

| Export | Meaning |
|---|---|
| `listDir(link, path = '/')` | Resolves to `[{ name, isDir, size }]`, folders first, each group sorted by name. |
| `readFile(link, path)` | Resolves to the file's text. |
| `readBytes(link, path)` | Resolves to the file's bytes, as a `Uint8Array`. |
| `writeFile(link, path, content, { onProgress })` | Writes text or a `Uint8Array`. Writes a temporary file and renames it at the end, so an interrupted save leaves the old file intact. |
| `remove(link, path)` | Deletes a file, or an empty folder. |
| `makeDir(link, path)` | Creates a folder. |
| `makeDirs(link, path)` | Creates every folder in the path that doesn't exist yet. |
| `firstFile(link, paths)` | Resolves to the first of `paths` that is a file, or `null`. |
| `joinPath(dir, name)` | Joins a folder and a name. |

## `packages.js`

| Export | Meaning |
|---|---|
| `installPackage(link, spec, { fetch, index, version, log })` | Installs a package and its dependencies into the Pico's lib folder, as `mip` does, with the browser doing the downloading. `spec` is a micropython-lib name, `github:org/repo` (also `gitlab:` and `codeberg:`), a `package.json` URL, or a `.py` or `.mpy` URL. Resolves to the paths written. |
| `INDEX` | The micropython-lib index, `https://micropython.org/pi/v2`. |

## `micropython.js`

| Export | Meaning |
|---|---|
| `createMicroPythonLink(loadMicroPython, options)` | Resolves to a port that runs code in MicroPython compiled to WebAssembly. Pass `loadMicroPython` from `@micropython/micropython-webassembly-pyscript`. Used by the tests. `interrupt()` does nothing, since code runs to completion. |

## `localfiles.js`

| Export | Meaning |
|---|---|
| `openLocalFile()` | Asks the user for a Python file on their computer. Resolves to `{ name, text, handle }`, or `null` if they cancel. `handle` is `null` where the browser can't save back to the file. |
| `saveLocalFile(name, text, handle)` | Saves `text`. In Chrome and Edge it writes to `handle` (asking where to save if there's none) and resolves to the handle to reuse next time; in other browsers it downloads a copy and resolves to `null`. Resolves to `undefined` if the user cancels. |

## Other modules

`dedent.js`, `traceback.js`, `highlight.js`, `definitions.js`, `inspector.js`, `repl.js` and `tabs.js`
are used by the editor and the elements. They're published, but their interfaces may change between versions.
