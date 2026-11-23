// <pipette-ide>: the whole Pico Pipette editor as one HTML element: connection, editor, files on the computer
// and on the Pico, packages, output, typing to input(), the REPL and the variables.
//
//   <script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pipette-ide.js"></script>
//   <pipette-ide>
//     print("Hello from the Pico")
//   </pipette-ide>
//
// The code inside the element is its starting code (common indentation removed; write < as &lt; and & as &amp;);
// with none, it starts with a blink program.
//
//   el.value                   get or set the code in the tab that's showing
//   el.connection              its Connection (see connection.js); set it before adding the element to share one
//   'connection' event         when the connection changes; event.detail.state is 'connected', 'connecting' or 'disconnected'
//
// Its parts keep the ids the editor page always had (#run, #editor, #repl-input...; demo scripts use them),
// so use one <pipette-ide> per page. For several small editors on a page, use <pico-pipette>.
// A DOM component (like editor.js). It adds its own styles to the page once.
import { Connection } from './connection.js';
import { createEditor } from './editor.js';
import { Tabs } from './tabs.js';
import { innermostFrame } from './traceback.js';
import { highlight } from './highlight.js';
import { inspectGlobals } from './inspector.js';
import { evaluate, needsMore, History } from './repl.js';
import { listDir, readFile, writeFile, remove, makeDir, joinPath, firstFile } from './picofs.js';
import { findInModule, modulePaths } from './definitions.js';
import { installPackage } from './packages.js';
import { openLocalFile, saveLocalFile } from './localfiles.js';
import { dedent } from './dedent.js';

const STARTER = `from machine import Pin
import time

led = Pin("LED", Pin.OUT)

for i in range(10):
    led.toggle()
    print("blink", i)
    time.sleep(0.5)

print("done")
`;

const STYLES = `
pipette-ide { display: block; }
pipette-ide .bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.75rem 0; }
pipette-ide #status { color: #666; }
pipette-ide .connection { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; color: #444; }
pipette-ide .connection .dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; border: 2px solid #999; box-sizing: border-box; }
pipette-ide .connection.connected .dot { background: #2e9d4f; border-color: #2e9d4f; }
pipette-ide .connection.connecting .dot { border-color: #c98a00; }
pipette-ide #filename { font: 0.95rem ui-monospace, monospace; width: 12rem; padding: 0.15rem 0.4rem; }
pipette-ide #unsaved { color: #8a5a00; font-size: 0.9rem; }
/* Tabs: one per open file, above the code */
pipette-ide #code { min-width: 0; }
pipette-ide .tab-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.2rem; }
pipette-ide .tab { display: inline-flex; align-items: center; border: 1px solid #ccc; border-bottom: 0; border-radius: 6px 6px 0 0;
  background: #f1f1f1; font: 0.85rem ui-monospace, monospace; position: relative; top: 1px; }
pipette-ide .tab.active { background: #fff; z-index: 2; }
pipette-ide .tab-name { background: none; border: 0; padding: 0.3rem 0.15rem 0.3rem 0.6rem; font: inherit; color: #555; cursor: pointer; }
pipette-ide .tab.active .tab-name { color: #111; }
pipette-ide .tab-dot { color: #8a5a00; width: 0.7rem; text-align: center; }
pipette-ide .tab:not(.unsaved) .tab-dot { visibility: hidden; }
pipette-ide .tab-close { background: none; border: 0; padding: 0.2rem 0.45rem 0.2rem 0.1rem; color: #999; cursor: pointer; font: inherit; }
pipette-ide .tab-close:hover, pipette-ide .tab-close:focus-visible { color: #b3261e; }
pipette-ide #new-tab { background: none; border: 1px dashed #bbb; border-bottom: 0; border-radius: 6px 6px 0 0; padding: 0.15rem 0.55rem;
  color: #777; cursor: pointer; font-size: 0.95rem; position: relative; top: 1px; }
pipette-ide #new-tab:hover, pipette-ide #new-tab:focus-visible { color: #111; border-color: #888; }
pipette-ide #import-warning { margin: 0.4rem 0 0; padding: 0.35rem 0.6rem; background: #fff6dc; border-left: 3px solid #c98a00; color: #5c4400; font-size: 0.9rem; }
pipette-ide #import-warning[hidden] { display: none; }
pipette-ide .workspace { display: grid; grid-template-columns: 15rem 1fr; gap: 1rem; align-items: start; }
pipette-ide #files { border: 1px solid #ccc; font-size: 0.9rem; }
pipette-ide #files.busy { opacity: 0.5; pointer-events: none; }
pipette-ide #files header { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.5rem; background: #f4f4f4; border-bottom: 1px solid #ccc; }
pipette-ide #files header span { display: flex; gap: 0.25rem; }
pipette-ide #files header button { font-size: 0.8rem; }
pipette-ide #pico-path { padding: 0.25rem 0.5rem; color: #666; font-family: ui-monospace, monospace; border-bottom: 1px solid #eee; }
pipette-ide #pico-files { list-style: none; margin: 0; padding: 0; max-height: 18rem; overflow: auto; }
pipette-ide #pico-files li { display: flex; align-items: center; gap: 0.25rem; padding: 0.1rem 0.5rem; }
pipette-ide #pico-files li:hover { background: #f4f4f4; }
pipette-ide #pico-files .name { flex: 1; text-align: left; background: none; border: 0; padding: 0.1rem 0; cursor: pointer; font: inherit; font-family: ui-monospace, monospace; }
pipette-ide #pico-files .size { color: #999; font-size: 0.8rem; }
pipette-ide #pico-files .delete { background: none; border: 0; color: #b3261e; cursor: pointer; visibility: hidden; }
pipette-ide #pico-files li:hover .delete { visibility: visible; }
pipette-ide #files .none { color: #999; padding: 0.5rem; margin: 0; }
pipette-ide #packages { border-top: 1px solid #ccc; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
pipette-ide #packages .row { display: flex; gap: 0.25rem; }
pipette-ide #packages input { flex: 1; min-width: 0; font: 0.85rem ui-monospace, monospace; padding: 0.15rem 0.3rem; }
pipette-ide #packages small { color: #666; line-height: 1.3; }
pipette-ide #install-log { font-size: 0.75rem; padding: 0.4rem; margin-top: 0.35rem; min-height: 0; max-height: 8rem; overflow: auto; }
pipette-ide #install-log.failed { color: #b3261e; background: #fdf0ef; }
pipette-ide pre { background: #f4f4f4; padding: 0.75rem; min-height: 3rem; white-space: pre-wrap; margin: 0; }
pipette-ide #stdout { max-height: 16rem; overflow: auto; }
pipette-ide #stderr { color: #b3261e; background: #fdf0ef; }
/* Typing to a running program, for input() */
pipette-ide #stdin-row { display: flex; gap: 0.5rem; align-items: center; margin: 0.35rem 0; }
pipette-ide #stdin-row[hidden] { display: none; }
pipette-ide #stdin-row label { color: #555; font-size: 0.9rem; }
pipette-ide #stdin { flex: 1; font: 0.95rem ui-monospace, monospace; padding: 0.2rem 0.4rem; }
/* The REPL: a transcript, then a prompt to type at */
pipette-ide .repl-head { display: flex; align-items: baseline; gap: 1rem; }
pipette-ide .repl-head small { color: #666; }
pipette-ide #repl { border: 1px solid #ccc; font: 0.95rem/1.4 ui-monospace, monospace; }
pipette-ide #repl-log { max-height: 16rem; overflow: auto; background: #fff; min-height: 0; padding: 0.5rem 0.75rem 0; }
pipette-ide #repl-log:empty { display: none; }
pipette-ide #repl-log .err { color: #b3261e; }
pipette-ide #repl-log .prompt, pipette-ide #repl .prompt { color: #999; user-select: none; }
pipette-ide .repl-input { display: flex; align-items: flex-start; padding: 0.25rem 0.75rem 0.5rem; background: #fff; }
pipette-ide .repl-input .prompt { white-space: pre; }
pipette-ide #repl-input { flex: 1; font: inherit; border: 0; outline: none; resize: none; padding: 0; tab-size: 4; white-space: pre; overflow: hidden; background: none; }
pipette-ide #repl-input:disabled { background: none; }
pipette-ide #stderr:empty { display: none; }
pipette-ide #variables table { border-collapse: collapse; width: 100%; font-size: 0.95rem; }
pipette-ide #variables th, pipette-ide #variables td { text-align: left; padding: 0.25rem 0.75rem; border-bottom: 1px solid #e5e5e5; }
pipette-ide #variables td { font-family: ui-monospace, monospace; }
pipette-ide #variables td:nth-child(2) { color: #666; }
pipette-ide #variables .none { color: #666; }
`;

const MARKUP = `
<div class="bar">
  <span class="connection" id="connection" role="status"><span class="dot" aria-hidden="true"></span><span id="connection-text">Not connected</span></span>
  <button id="connect" title="Connect to your Pico (Shift-click to choose a different board). Disconnect releases it for other programs.">Connect</button>
  <button id="run" disabled>Run</button>
  <button id="stop" disabled>Stop</button>
  <span id="status"></span>
</div>

<div class="bar">
  <input id="filename" value="blink.py" aria-label="File name" spellcheck="false">
  <button id="open">Open…</button>
  <button id="save-local">Save to computer</button>
  <button id="save-pico" disabled>Save to Pico</button>
  <button id="save-main" disabled>Save as main.py</button>
  <span id="unsaved"></span>
</div>

<div class="workspace">
  <section id="files">
    <header>
      <b>Pico files</b>
      <span>
        <button id="new-folder" title="New folder" disabled>New folder</button>
        <button id="reload" title="Refresh" disabled>↻</button>
      </span>
    </header>
    <div id="pico-path">/</div>
    <ul id="pico-files"></ul>
    <p class="none" id="files-note">Connect to see the files on your Pico.</p>
    <form id="packages">
      <b>Install a package</b>
      <div class="row">
        <input id="package" placeholder="e.g. ssd1306" spellcheck="false" aria-label="Package name or URL">
        <button id="install" disabled>Install</button>
      </div>
      <small>A <a href="https://github.com/micropython/micropython-lib" target="_blank" rel="noopener">micropython-lib</a> name, github:org/repo, or a URL</small>
      <pre id="install-log" hidden></pre>
    </form>
  </section>

  <div id="code">
    <div class="tab-bar" id="tabs" role="tablist" aria-label="Open files"></div>
    <p id="import-warning" role="status" hidden></p>
  </div>
</div>

<h2>Output</h2>
<pre id="stdout"></pre>
<div id="stdin-row" hidden>
  <label for="stdin">Type to your program:</label>
  <input id="stdin" spellcheck="false" autocomplete="off" placeholder="for input(): type and press Enter">
  <button id="send-input" type="button">Send</button>
</div>
<p id="where-goes-here"></p>
<pre id="stderr"></pre>

<div class="repl-head">
  <h2>REPL</h2>
  <small>Type Python and press Enter. ↑ and ↓ recall earlier lines.</small>
  <button id="repl-clear" type="button">Clear</button>
</div>
<div id="repl">
  <pre id="repl-log"></pre>
  <div class="repl-input"><span class="prompt" id="repl-prompt">&gt;&gt;&gt; </span><textarea id="repl-input" rows="1" spellcheck="false" wrap="off" disabled placeholder="Connect to use the REPL"></textarea></div>
</div>

<h2>Variables</h2>
<div id="variables"><p class="none">Run your program to see its variables when it finishes or stops.</p></div>
`;

// Added first in <head>, so a page's own rules win where they differ.
function addStyles() {
  if (document.querySelector('style[data-pipette-ide]')) return;
  const style = document.createElement('style');
  style.dataset.pipetteIde = '';
  style.textContent = STYLES;
  document.head.prepend(style);
}

// Wires up the editor's parts inside el, starting with the code starter; returns { value } for the tab showing.
// Modules MicroPython has built in: no file to open for these
const BUILT_IN_MODULES = new Set(('array asyncio binascii bluetooth builtins cmath collections cryptolib deflate errno '
  + 'framebuf gc hashlib heapq io json machine math micropython network neopixel os platform random re rp2 select '
  + 'socket ssl struct sys time uasyncio ubinascii ucollections uctypes uerrno uhashlib uheapq uio ujson umachine '
  + 'uos urandom ure uselect usocket ussl ustruct usys utime uzlib vfs zlib').split(' '));

function setUp(el, starter) {
  const $ = id => el.querySelector(`#${id}`);
  const connection = el.connection;
  let link = null;           // connection.link, kept here for the many places that use it
  let busy = false;          // false, 'running' (a program) or 'files' (a file operation)
  let picoDir = '/';         // folder shown in the Pico files panel

  // --- tabs: one editor component per open file, only the active one showing. Its textarea has id "editor"
  // (demo scripts use it) and its "Line n: ..." goes above the errors.
  const tabs = new Tabs({ name: 'blink.py' });
  const editors = new Map();                     // tab id -> its editor
  const whereBox = document.createElement('div');
  $('where-goes-here').replaceWith(whereBox);
  const current = () => editors.get(tabs.active.id);

  function addEditor(tab, text) {
    const editor = createEditor({ value: text, rows: 14 });
    editor.openModule = (found) => openDefinition(found, tab);
    editor.textarea.addEventListener('input', () => { tabs.edited(tab.id); drawTabs(); });   // typing, pasting or Tab
    $('import-warning').before(editor.element);
    editors.set(tab.id, editor);
    return editor;
  }

  // Show the active tab's editor (and only that), with its name in the filename box
  function show() {
    for (const [id, editor] of editors) {
      const active = id === tabs.active.id;
      editor.element.hidden = !active;
      editor.element.style.display = active ? '' : 'none';
      if (active) editor.textarea.id = 'editor';
      else editor.textarea.removeAttribute('id');
    }
    whereBox.replaceChildren(current().where);
    $('filename').value = tabs.active.name;
    drawTabs();
    current().refresh();   // line numbers and colours line up now it's visible
  }

  function describe(tab) {
    if (tab.source.kind === 'pico') return `${tab.source.path} on the Pico`;
    if (tab.source.kind === 'local') return `${tab.name} on your computer`;
    return tab.picoPath ? `${tab.picoPath} on the Pico` : 'New file, not saved yet';
  }

  function drawTabs() {
    const bar = $('tabs');
    bar.replaceChildren();
    for (const tab of tabs.list) {
      const item = document.createElement('div');
      item.className = `tab${tab === tabs.active ? ' active' : ''}${tab.unsaved ? ' unsaved' : ''}`;
      const name = document.createElement('button');
      Object.assign(name, { type: 'button', className: 'tab-name', textContent: tab.name, title: describe(tab) });
      name.setAttribute('role', 'tab');
      name.setAttribute('aria-selected', String(tab === tabs.active));
      name.onclick = () => switchTo(tab.id);
      const dot = document.createElement('span');
      Object.assign(dot, { className: 'tab-dot', textContent: '●', title: 'Unsaved changes' });
      const close = document.createElement('button');
      Object.assign(close, { type: 'button', className: 'tab-close', textContent: '×', title: `Close ${tab.name}` });
      close.setAttribute('aria-label', `Close ${tab.name}`);
      close.onclick = () => closeTab(tab.id);
      item.append(name, dot, close);
      bar.append(item);
    }
    const plus = document.createElement('button');
    Object.assign(plus, { type: 'button', id: 'new-tab', textContent: '+', title: 'New file' });
    plus.setAttribute('aria-label', 'New file');
    plus.onclick = newTab;
    bar.append(plus);
    $('unsaved').textContent = tabs.active.unsaved ? '● unsaved changes' : '';
  }

  function switchTo(id) {
    tabs.activate(id);
    show();
  }

  function newTab() {
    addEditor(tabs.newTab(), '');
    show();
    $('filename').select();     // ready to give it a name
  }

  function closeTab(id) {
    const tab = tabs.get(id);
    if (tab.unsaved && !confirm(`${tab.name} has unsaved changes. Close it anyway?`)) return;
    const { replacement } = tabs.close(id);
    editors.get(id).element.remove();
    editors.delete(id);
    if (replacement) addEditor(replacement, '');
    show();
  }

  // Opens a file in a new tab, or switches to its tab if it's open already
  function openInTab({ name, text, source, onPico = false }) {
    const opened = tabs.open({ name, source, onPico });
    if (!opened.existing) addEditor(opened.tab, text);
    show();
    return opened;
  }

  addEditor(tabs.active, starter);
  show();

  // --- go to definition in another file: the module's open tab, or failing that its file on the Pico.
  // Returns a message for the editor to show by the name, if it couldn't get there.
  async function openDefinition({ module, name }, from, hops = 0) {
    const top = module.split('.')[0];
    if (BUILT_IN_MODULES.has(top)) return `\`${top}\` is built into MicroPython, so there's no Python file to show`;
    const paths = modulePaths(module, from.picoPath ?? '/main.py');
    let tab = tabs.moduleTab(paths, from);
    let message = null;
    if (!tab) {
      if (!link) return `\`${module}\` isn't open in a tab: connect to the Pico to look for it there`;
      if (busy) return `Wait for the Pico to finish, then try again`;
      await fileTask(`Looking for ${module} on the Pico…`, async () => {
        const path = await firstFile(link, paths);
        if (!path) {
          const compiled = await firstFile(link, paths.filter(p => !p.endsWith('/__init__.py')).map(p => p.replace(/\.py$/, '.mpy')));
          message = compiled ? `${module} is compiled (${compiled}), so there's no source to show`
            : `${module} isn't on the Pico: it may be built into MicroPython`;
          return message;
        }
        tab = openInTab({ name: path.split('/').at(-1), text: await readFile(link, path), source: { kind: 'pico', path }, onPico: true }).tab;
        return `Opened ${path} from the Pico`;
      });
      if (!tab) return message ?? `Couldn't open ${module}`;
    }
    switchTo(tab.id);
    const editor = editors.get(tab.id);
    if (!name) { editor.goTo({ line: 1 }); return null; }
    const found = findInModule(editor.value, name);
    if (found?.module && hops < 3) return openDefinition(found, tab, hops + 1);
    if (found?.text) { editor.goTo(found); return null; }
    refresh(`Couldn't find ${name} in ${tab.name}`);
    return null;
  }

  // --- buttons follow the connection and whatever is in progress
  function refresh(status) {
    if (status) $('status').textContent = status;
    const ready = !!link && !busy;
    // Disconnecting is allowed while a program runs (it's stopped first), but not mid-way through a file operation
    $('connect').disabled = connection.state === 'connecting' || busy === 'files';
    $('connect').textContent = link ? 'Disconnect' : 'Connect';
    for (const id of ['run', 'save-pico', 'save-main', 'new-folder', 'reload', 'install', 'repl-input']) $(id).disabled = !ready;
    $('repl-input').placeholder = link ? '' : 'Connect to use the REPL';
    $('stop').disabled = busy !== 'running';
    $('stdin-row').hidden = busy !== 'running';
    $('files').classList.toggle('busy', !!busy);
  }

  function fileName() {
    const name = $('filename').value.trim();
    if (!name) { refresh('Type a file name first'); $('filename').focus(); }
    return name;
  }

  // A new name in the filename box renames the tab (and makes it a new file, rather than the one it came from)
  $('filename').addEventListener('input', () => {
    tabs.rename(tabs.active.id, $('filename').value.trim());
    drawTabs();
  });

  // Runs a file operation on the Pico, keeping other buttons out of the way meanwhile
  async function fileTask(message, action) {
    busy = 'files';
    refresh(message);
    try {
      const done = await action();
      if (done) refresh(done);
    } catch (e) {
      refresh(`${message.replace(/…$/, '')} failed: ${e.message}`);
    } finally {
      busy = false;
      refresh();
    }
  }

  // --- connecting and disconnecting
  let disconnecting = false;   // true while we let go of the Pico ourselves, rather than it being unplugged

  connection.onChange(state => {
    el.dispatchEvent(new CustomEvent('connection', { bubbles: true, detail: { state } }));
    link = connection.link;
    $('connection').className = `connection ${state}`;
    $('connection-text').textContent = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Not connected' }[state];
    if (state === 'disconnected') {
      busy = false;
      $('pico-files').innerHTML = '';
      $('files-note').textContent = 'Connect to see the files on your Pico.';
      $('files-note').hidden = false;
      refresh(disconnecting ? 'Disconnected: other programs can use the Pico now' : 'Pico disconnected');
    } else refresh();
  });

  $('connect').onclick = async event => {
    if (!('serial' in navigator)) return refresh('This browser has no Web Serial: use Chrome, Edge or Firefox 151+');
    if (link) {
      disconnecting = true;
      try { await connection.disconnect(); } finally { disconnecting = false; }
      return;
    }
    try {
      // Reuses an already-allowed Pico; Shift-click to choose a different board
      await connection.connect({ ask: event.shiftKey });
      await fileTask('Reading the Pico\'s files…', async () => { await showPicoFolder('/'); return 'Ready'; });
    } catch (e) {
      refresh(`Could not connect: ${e.message}. Close other tabs or programs using the Pico, unplug it and plug it back in. More in Help.`);
    }
  };

  // --- files on the computer
  $('open').onclick = async () => {
    try {
      const file = await openLocalFile();
      if (!file) return;
      const { existing } = openInTab({ name: file.name, text: file.text, source: { kind: 'local', handle: file.handle } });
      refresh(existing ? `${file.name} is open already` : `Opened ${file.name} from your computer`);
    } catch (e) {
      refresh(`Could not open the file: ${e.message}`);
    }
  };

  $('save-local').onclick = async () => {
    const name = fileName();
    if (!name) return;
    const tab = tabs.active;
    try {
      const handle = await saveLocalFile(name, current().value, tab.source.kind === 'local' ? tab.source.handle : null);
      if (handle === undefined) return;            // cancelled
      tabs.savedLocally(tab.id, { kind: 'local', handle });
      if (handle?.name) tab.name = handle.name;
      show();
      refresh(handle ? `Saved ${handle.name} on your computer` : `Downloaded ${name}`);
    } catch (e) {
      refresh(`Could not save the file: ${e.message}`);
    }
  };

  // --- files on the Pico
  async function showPicoFolder(dir) {
    const entries = await listDir(link, dir);
    picoDir = dir;
    $('pico-path').textContent = dir;
    const list = $('pico-files');
    list.innerHTML = '';
    if (dir !== '/') addRow(list, { label: '📁 ..', onOpen: () => openFolder(dir.replace(/\/[^/]+\/?$/, '') || '/') });
    for (const entry of entries) {
      const path = joinPath(dir, entry.name);
      addRow(list, entry.isDir
        ? { label: `📁 ${entry.name}`, onOpen: () => openFolder(path), onDelete: () => deleteFromPico(path) }
        : { label: entry.name, size: entry.size, onOpen: () => openFromPico(path, entry.name), onDelete: () => deleteFromPico(path) });
    }
    $('files-note').hidden = entries.length > 0;
    $('files-note').textContent = 'This folder is empty.';
  }

  function addRow(list, { label, size, onOpen, onDelete }) {
    const li = document.createElement('li');
    const name = document.createElement('button');
    name.className = 'name';
    name.textContent = label;
    name.onclick = onOpen;
    li.append(name);
    if (size !== undefined) {
      const s = document.createElement('span');
      s.className = 'size';
      s.textContent = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
      li.append(s);
    }
    if (onDelete) {
      const del = document.createElement('button');
      del.className = 'delete';
      del.title = `Delete ${label.replace('📁 ', '')}`;
      del.textContent = '✕';
      del.onclick = onDelete;
      li.append(del);
    }
    list.append(li);
  }

  const openFolder = dir => fileTask('Reading the Pico\'s files…', async () => { await showPicoFolder(dir); return `Showing ${dir}`; });

  async function openFromPico(path, name) {
    const open = tabs.list.find(tab => tab.source.kind === 'pico' && tab.source.path === path);
    if (open) {
      switchTo(open.id);
      refresh(`${path} is open already`);
      return;
    }
    await fileTask(`Opening ${path}…`, async () => {
      openInTab({ name, text: await readFile(link, path), source: { kind: 'pico', path }, onPico: true });
      return `Opened ${path} from the Pico`;
    });
  }

  async function saveToPico(path, done) {
    const tab = tabs.active;
    await fileTask(`Saving ${path} to the Pico…`, async () => {
      await writeFile(link, path, editors.get(tab.id).value, {
        onProgress: p => { if (p < 1) refresh(`Saving ${path} to the Pico… ${Math.round(p * 100)}%`); },
      });
      tabs.savedToPico(tab.id, path);
      show();
      await showPicoFolder(picoDir);
      return done;
    });
  }

  $('save-pico').onclick = () => {
    const name = fileName();
    if (name) saveToPico(joinPath(picoDir, name), `Saved ${joinPath(picoDir, name)} on the Pico`);
  };

  $('save-main').onclick = () =>
    saveToPico('/main.py', 'Saved /main.py: the Pico will run it whenever it powers up');

  async function deleteFromPico(path) {
    if (!confirm(`Delete ${path} from the Pico? This can't be undone.`)) return;
    await fileTask(`Deleting ${path}…`, async () => {
      await remove(link, path);
      await showPicoFolder(picoDir);
      return `Deleted ${path}`;
    });
  }

  $('new-folder').onclick = async () => {
    const name = prompt('Name of the new folder:')?.trim();
    if (!name) return;
    await fileTask(`Creating ${name}…`, async () => {
      await makeDir(link, joinPath(picoDir, name));
      await showPicoFolder(picoDir);
      return `Created ${joinPath(picoDir, name)}`;
    });
  };

  $('reload').onclick = () => openFolder(picoDir);

  // --- packages (downloaded by the browser, written into the Pico's lib folder)
  $('packages').onsubmit = async e => {
    e.preventDefault();
    const spec = $('package').value.trim();
    if (!spec) return $('package').focus();
    const out = $('install-log');
    out.hidden = false;
    out.classList.remove('failed');
    out.textContent = '';
    const log = line => { out.textContent += line + '\n'; out.scrollTop = out.scrollHeight; };
    busy = 'files';
    refresh(`Installing ${spec}…`);
    try {
      const files = await installPackage(link, spec, { log });
      log(`Done: ${files.length} file${files.length === 1 ? '' : 's'} installed`);
      refresh(`Installed ${spec}`);
      $('package').value = '';
      try { await showPicoFolder(picoDir); } catch { /* the list is only a convenience */ }
    } catch (err) {
      log(err.message);
      out.classList.add('failed');
      refresh(`Could not install ${spec}`);
    } finally {
      busy = false;
      refresh();
    }
  };

  // --- running programs
  function showVariables(rows) {
    const box = $('variables');
    box.innerHTML = '';
    if (!rows.length) {
      box.innerHTML = '<p class="none">No variables.</p>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<tr><th>Name</th><th>Type</th><th>Value</th></tr>';
    for (const { name, type, value } of rows) {
      const tr = table.insertRow();
      for (const text of [name, type, value]) tr.insertCell().textContent = text;
    }
    box.append(table);
  }

  async function updateVariables() {
    try {
      showVariables(await inspectGlobals(link));
    } catch (e) {
      $('variables').innerHTML = '<p class="none"></p>';
      $('variables').firstChild.textContent = `Could not read the variables: ${e.message}`;
    }
  }

  // Warn if the program imports open tabs whose changes aren't on the Pico: the Pico imports its own copies
  function warnAboutImports(code) {
    const stale = tabs.staleImports(code);
    const warning = $('import-warning');
    warning.hidden = !stale.length;
    if (!stale.length) return;
    const names = stale.map(tab => tab.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
    const one = stale.length === 1;
    warning.textContent = `${names} ${one ? 'has' : 'have'} changes that are not on the Pico. Your program imports the `
      + `${one ? 'copy' : 'copies'} on the Pico, if there ${one ? 'is one' : 'are any'}: to use your changes, `
      + `save ${one ? 'it' : 'them'} to the Pico first.`;
  }

  // Mark where the error happened: in the tab that ran, or in another open file that the traceback points into
  function markRunError(stderr, ran) {
    const frame = innermostFrame(stderr);
    const other = frame && frame.file !== '<stdin>' ? tabs.fileTab(frame.file) : null;
    if (other && editors.has(other.id) && other !== ran) {
      switchTo(other.id);
      editors.get(other.id).markLine(frame.line, `${stderr.trim().split('\n').at(-1).trim()} (in ${other.name})`);
    } else {
      editors.get(ran.id)?.markError(stderr);
    }
  }

  $('run').onclick = async () => {
    const ran = tabs.active;
    const program = current().value;
    busy = 'running';
    refresh('Running…');
    $('stdout').textContent = $('stderr').textContent = '';
    $('variables').innerHTML = '';
    for (const editor of editors.values()) editor.clearError();
    warnAboutImports(program);
    $('stdout').after($('stdin-row'));             // typing for input() goes under the program's output
    setTimeout(() => $('stdin').focus());        // ready for the program's input()
    const showOutput = ({ stdout, stderr }) => {   // the output so far
      $('stdout').textContent = stdout;
      $('stdout').scrollTop = $('stdout').scrollHeight;   // follow the newest output
      $('stderr').textContent = stderr;
    };
    try {
      const result = await link.run(program, { onOutput: showOutput });
      showOutput(result);
      markRunError(result.stderr, ran);
      if (!connection.connected) return;           // disconnected while it ran: nothing more to read
      busy = 'files';
      refresh('Reading variables…');
      await updateVariables();
      refresh(/KeyboardInterrupt/.test(result.stderr) ? 'Stopped'
        : result.stderr ? 'Finished with an error' : 'Finished');
    } catch (e) {
      $('stderr').textContent = e.message;
      refresh('Something went wrong talking to the Pico');
    } finally {
      busy = false;
      refresh();
    }
  };

  $('stop').onclick = () => link.interrupt();

  // --- typing to a running program: sent a line at a time, for input() to read (MicroPython echoes it)
  async function sendInput() {
    const text = $('stdin').value;
    $('stdin').value = '';
    await link.sendInput(text);
    $('stdin').focus();
  }
  $('stdin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendInput(); } });
  $('send-input').onclick = sendInput;

  // --- the REPL: shares variables with the program that last ran
  const replInput = $('repl-input');
  const replLog = $('repl-log');
  const history = new History();

  function logRepl(html, className) {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.innerHTML = html;
    replLog.append(span);
    replLog.scrollTop = replLog.scrollHeight;
  }
  const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function setReplInput(text) {
    replInput.value = text;
    fitReplInput();
  }
  function fitReplInput() {
    replInput.rows = Math.max(1, replInput.value.split('\n').length);
    $('repl-prompt').textContent = ['>>> ', ...replInput.value.split('\n').slice(1).map(() => '... ')].join('\n');
  }

  async function runRepl() {
    const source = replInput.value;
    const typed = source.replace(/\s+$/, '');      // without the blank line that ended a block
    history.add(typed);
    setReplInput('');
    const lines = typed.split('\n');
    logRepl(lines.map((line, i) => `<span class="prompt">${i ? '... ' : '>>> '}</span>${highlight(line)}`).join('\n') + '\n');
    if (!source.trim()) return;
    replLog.after($('stdin-row'));                // typing for input() goes under the REPL's output
    busy = 'running';
    refresh('Running…');
    $('stdin').focus();
    const output = document.createElement('span');
    replLog.append(output);
    try {
      const { stdout, stderr } = await evaluate(link, source, {
        onOutput: ({ stdout }) => { output.textContent = stdout; replLog.scrollTop = replLog.scrollHeight; },
      });
      output.textContent = stdout;
      if (stderr) logRepl(escapeHtml(stderr.replace(/\r/g, '')), 'err');
      if (!connection.connected) return;           // disconnected while it ran: nothing more to read
      busy = 'files';
      refresh('Reading variables…');
      await updateVariables();
      refresh(/KeyboardInterrupt/.test(stderr) ? 'Stopped' : 'Ready');
    } catch (e) {
      logRepl(escapeHtml(e.message + '\n'), 'err');
      refresh('Something went wrong talking to the Pico');
    } finally {
      busy = false;
      refresh();
      replInput.focus();
    }
  }

  replInput.addEventListener('keydown', e => {
    const { value, selectionStart, selectionEnd } = replInput;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const atEnd = selectionStart === value.length;
      if (atEnd && needsMore(value)) {
        // Carry on the block: keep the indentation, and indent further after a colon
        const line = value.slice(value.lastIndexOf('\n') + 1);
        const indent = line.match(/^[ \t]*/)[0] + (line.trimEnd().endsWith(':') ? '    ' : '');
        replInput.setRangeText('\n' + indent, selectionStart, selectionEnd, 'end');
        fitReplInput();
      } else {
        runRepl();
      }
    } else if (e.key === 'Enter') {                 // Shift-Enter: a new line without running
      e.preventDefault();
      replInput.setRangeText('\n', selectionStart, selectionEnd, 'end');
      fitReplInput();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      replInput.setRangeText('    ', selectionStart, selectionEnd, 'end');
    } else if (e.key === 'ArrowUp' && !value.slice(0, selectionStart).includes('\n')) {
      e.preventDefault();
      setReplInput(history.back(value));
    } else if (e.key === 'ArrowDown' && !value.slice(selectionEnd).includes('\n')) {
      e.preventDefault();
      setReplInput(history.forward());
    }
  });
  replInput.addEventListener('input', fitReplInput);
  $('repl-clear').onclick = () => { replLog.textContent = ''; replInput.focus(); };

  return {
    get value() { return current().value; },
    set value(code) { current().value = code; },
    tabs,
  };
}

export class PipetteIde extends HTMLElement {
  connectedCallback() {
    if (this.editor) return;   // built already: the element was moved
    addStyles();
    this.connection ??= new Connection(globalThis.navigator?.serial);
    const starter = dedent(this.textContent) || STARTER;
    this.innerHTML = MARKUP;
    this.editor = setUp(this, starter);
  }

  get value() { return this.editor ? this.editor.value : dedent(this.textContent); }
  set value(code) {
    if (this.editor) this.editor.value = code;
    else this.textContent = code;
  }
}

if (globalThis.customElements && !customElements.get('pipette-ide')) customElements.define('pipette-ide', PipetteIde);
