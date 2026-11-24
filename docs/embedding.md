# How to add Pipette to your own web page

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

Use this when you're writing a lesson, course or project page and want readers to run code on their own Pico
from the page itself. Each option needs one script tag and no build step.

The page must be served over `https://`, or from `localhost` while you write it: browsers only allow Web Serial there.

## A small editor for a lesson: `<pico-pipette>`

1. Load the element:

   ```html
   <script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pico-pipette.js"></script>
   ```

2. Put a `<pico-pipette>` wherever you want an editor, with the starting code inside it:

   ```html
   <pico-pipette rows="8">
     from machine import Pin
     led = Pin("LED", Pin.OUT)
     led.toggle()
   </pico-pipette>
   ```

   The indentation all the lines share is removed. Write `<` as `&lt;` and `&` as `&amp;`, as anywhere in HTML.

Readers get **Connect**, **Run**, **Stop** and **Start again** buttons and the program's output.
[`examples/blink-lesson.html`](https://github.com/romilly/pico-pipette/blob/main/examples/blink-lesson.html)
is a complete lesson page.

### Several editors on one page

Give each editor the first one's connection before adding it to the page, so they share one Pico:

```js
other.connection = first.connection;
document.body.append(other);
```

### Saving a helper module before each run

If the lesson's code imports a module of yours, save it on the Pico in `beforeRun`:

```js
import { writeFile } from 'https://cdn.jsdelivr.net/npm/pico-pipette/src/picofs.js';

const el = document.querySelector('pico-pipette');
el.beforeRun = async (link, { say }) => {
  say('Saving helpers.py on the Pico…');
  await writeFile(link, '/helpers.py', helperCode);
};
```

## The whole editor: `<pipette-ide>`

For the full editor, as on the Pico Pipette site (files, packages, the REPL, variables and tabs):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pipette-ide.js"></script>

<pipette-ide>
  print("Hello from the Pico")
</pipette-ide>
```

Use only one per page: its parts have fixed ids.

## A page of your own design

Import the modules directly and build your own interface:

```js
import { Connection } from 'https://cdn.jsdelivr.net/npm/pico-pipette/src/connection.js';
import { createEditor } from 'https://cdn.jsdelivr.net/npm/pico-pipette/src/editor.js';

const editor = createEditor({ value: 'print("Hello from the Pico")', rows: 8 });
document.body.append(editor.element, editor.where);

const connection = new Connection(navigator.serial);
runButton.onclick = async () => {
  const link = await connection.connect();
  const { stdout, stderr } = await link.run(editor.value);
  output.textContent = stdout;
  editor.markError(stderr);
};
```

## Using npm instead of a CDN

```
npm install pico-pipette
```

then `import 'pico-pipette'` for `<pico-pipette>`, or `import 'pico-pipette/src/pipette-ide.js'` for `<pipette-ide>`.

## See also

- [The elements](elements.md): every attribute, property, method and event
- [The modules](modules.md): `Connection`, `PicoLink`, the editor, and files on the Pico
