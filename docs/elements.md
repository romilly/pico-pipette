# The elements

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

Pico Pipette publishes two custom elements in the npm package `pico-pipette`.
For how to put them on a page, see [How to add Pipette to your own web page](embedding.md).

## `<pico-pipette>`

A code editor with **Connect**, **Run**, **Stop** and **Start again** buttons and the program's output.

Script: `https://cdn.jsdelivr.net/npm/pico-pipette/src/pico-pipette.js` (also the package's main export).
Class: `PicoPipette`, exported from the same module.

### Content

The text inside the element is its starting code, with the indentation all its lines share removed.
**Start again** puts it back.

### Attributes

| Attribute | Meaning | Default |
|---|---|---|
| `rows` | Height of the editor, in lines | `12` |

### Properties

| Property | Meaning |
|---|---|
| `value` | The code in the editor. Read or write. |
| `connection` | The element's [`Connection`](modules.md#connectionjs). Set it before the element is added to the page to share one Pico between elements. |
| `beforeRun` | Optional `async (link, { say }) => …`, called after connecting and before each run. `link` is the connected port; `say(text)` shows text in the output. |
| `editor` | The element's [editor](modules.md#editorjs), once the element is on the page. |
| `canRun` | `true` if the browser has Web Serial. Read only. |

### Methods

| Method | Result |
|---|---|
| `run()` | Connects if need be, then runs the code. Resolves to `{ stdout, stderr }`, or `undefined` if it couldn't run (for example, no Pico was chosen). Does nothing while a run is in progress. |
| `stop()` | Interrupts a running program. |
| `toggle()` | Connects, or disconnects if connected. |

### Events

Both bubble.

| Event | When | `detail` |
|---|---|---|
| `done` | After each run | `{ stdout, stderr }` |
| `connection` | When the connection's state changes | `{ state }`: `'connected'`, `'connecting'` or `'disconnected'` |

### Behaviour

- When a program fails, its failing line is marked in the editor. An error with no line in the program is shown under the output.
- Without Web Serial, **Connect** and **Run** are disabled and the element says what's needed.

### Styling

The element adds its own styles once, first in `<head>`, so a page's own rules win.
Its classes start `pipette-`: `pipette-bar`, `pipette-connection` (plus `connected` or `connecting`),
`pipette-status`, `pipette-output` and `pipette-error`. Its buttons have `name` attributes
`connect`, `run`, `stop` and `reset`.

## `<pipette-ide>`

The whole editor, as on <https://romilly.github.io/pico-pipette/>: connection, files on the computer and on the Pico,
packages, tabs, output, typing to `input()`, the REPL and the variables.

Script: `https://cdn.jsdelivr.net/npm/pico-pipette/src/pipette-ide.js`.
Class: `PipetteIde`, exported from the same module.

### Content

The text inside the element is the first tab's code, with shared indentation removed.
If it's empty, the editor starts with a program that blinks the LED.

### Properties

| Property | Meaning |
|---|---|
| `value` | The code in the tab showing. Read or write. |
| `connection` | The element's [`Connection`](modules.md#connectionjs). Set it before the element is added to the page. |

### Events

| Event | When | `detail` |
|---|---|---|
| `connection` | When the connection's state changes | `{ state }`, as for `<pico-pipette>` |

### Ids

The element's parts have fixed ids, which the demo scripts rely on, so use only one `<pipette-ide>` per page.
They include `connect`, `run`, `stop`, `status`, `filename`, `open`, `save-local`, `save-pico`, `save-main`,
`pico-files`, `package`, `install`, `editor`, `tabs`, `stdout`, `stdin`, `stderr`, `repl-input`, `repl-log`
and `variables`.

### Styling

Editor classes start `pipette-`, and syntax colours use `tok-` classes. A page's own CSS can restyle either.
