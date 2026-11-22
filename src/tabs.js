// The editor's tabs: which files are open, which one is showing, where each came from, and whether its
// changes are saved (on the computer or the Pico). No page code: <pipette-ide> draws the tab bar from this.
//
//   const tabs = new Tabs({ name: 'blink.py' });     // starts with one new tab
//   tabs.open({ name, source, onPico })              // { tab, existing }: switches to the file if already open
//   tabs.active, tabs.list, tabs.activate(id), tabs.close(id), tabs.newTab()
//   tabs.edited(id), tabs.savedLocally(id, source), tabs.savedToPico(id, path), tabs.rename(id, name)
//   tabs.staleImports(code)                           // open tabs the code imports whose changes aren't on the Pico
//
// A tab's source says where its file came from: { kind: 'new' }, { kind: 'pico', path } or
// { kind: 'local', handle } (handle is the browser's file handle, or null where saving downloads a copy).

import { tokenize } from './highlight.js';

export class Tabs {
  constructor({ name = 'untitled.py' } = {}) {
    this.list = [];
    this.nextId = 1;
    this.active = this.add({ name });
  }

  add({ name, source = { kind: 'new' }, onPico = false }) {
    const tab = {
      id: this.nextId++, name, source, unsaved: false, onPico,
      picoPath: source.kind === 'pico' ? source.path : null,   // where it is on the Pico, if anywhere
    };
    this.list.push(tab);
    return tab;
  }

  // Opens a file in a new tab, or switches to the tab that already has it open
  open({ name, source = { kind: 'new' }, onPico = false }) {
    const already = this.list.find((tab) => sameSource(tab.source, source));
    if (already) {
      this.active = already;
      return { tab: already, existing: true };
    }
    this.active = this.add({ name, source, onPico });
    return { tab: this.active, existing: false };
  }

  // A new, empty tab with a name not already in use
  newTab() {
    const names = new Set(this.list.map((tab) => tab.name));
    let name = 'untitled.py';
    for (let n = 2; names.has(name); n++) name = `untitled-${n}.py`;
    this.active = this.add({ name });
    return this.active;
  }

  get(id) { return this.list.find((tab) => tab.id === id); }

  activate(id) {
    this.active = this.get(id) ?? this.active;
    return this.active;
  }

  // Closes a tab (the caller asks first if it has unsaved changes). If it was showing, its neighbour shows
  // instead, the one to its left if there is one; closing the last tab leaves a fresh empty one (the replacement).
  close(id) {
    const index = this.list.findIndex((tab) => tab.id === id);
    if (index < 0) return {};
    const [closed] = this.list.splice(index, 1);
    if (!this.list.length) return { closed, replacement: this.newTab() };
    if (this.active === closed) this.active = this.list[Math.max(0, index - 1)];
    return { closed };
  }

  edited(id) {
    const tab = this.get(id);
    tab.unsaved = true;
    tab.onPico = false;
  }

  savedLocally(id, source) {
    const tab = this.get(id);
    tab.source = source;
    tab.unsaved = false;
  }

  savedToPico(id, path) {
    const tab = this.get(id);
    Object.assign(tab, { name: path.split('/').at(-1), picoPath: path, onPico: true, unsaved: false });
    if (tab.source.kind !== 'local') tab.source = { kind: 'pico', path };
  }

  // A new name means a different file: it no longer saves over the one it came from
  rename(id, name) {
    const tab = this.get(id);
    Object.assign(tab, { name, source: { kind: 'new' }, picoPath: null, onPico: false });
  }

  anyUnsaved() { return this.list.some((tab) => tab.unsaved); }

  // The other open .py tabs that `code` imports and whose current text isn't on the Pico, so running `code`
  // would import the Pico's old copy (or fail to find the module)
  staleImports(code) {
    const imported = new Set(importsOf(code));
    return this.list.filter((tab) => tab !== this.active && !tab.onPico
      && tab.name.endsWith('.py') && imported.has(tab.name.slice(0, -3)));
  }

  // The open tab holding a file named in a traceback, if any
  fileTab(file) { return this.list.find((tab) => sameFile(file, tab)); }
}

function sameSource(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'pico') return a.path === b.path;
  if (a.kind === 'local') return !!a.handle && a.handle === b.handle;
  return false;
}

// Does a file named in a traceback ("helpers.py", "/lib/helpers.py") refer to this tab's file?
export function sameFile(file, tab) {
  if (tab.picoPath) return '/' + file.replace(/^\/+/, '') === tab.picoPath;
  return file.split('/').at(-1) === tab.name;
}

// The top-level modules a program imports: `import a.b, c as d` gives a and c; `from e.f import g` gives e.
// Imports in comments and strings are ignored; relative imports (from . import x) are left out.
export function importsOf(code) {
  const text = tokenize(code)
    .map((t) => (t.type === 'comment' ? '' : t.type === 'string' ? '""' : t.text))
    .join('');
  const found = [];
  for (const line of text.split('\n')) {
    let m = line.match(/^\s*import\s+(.+)/);
    const names = m ? m[1].split(',').map((part) => part.trim())
      : (m = line.match(/^\s*from\s+([\w.]+)\s+import\b/)) ? [m[1]] : [];
    for (const name of names) {
      const top = name.split(/[.\s]/)[0];
      if (top && !found.includes(top)) found.push(top);
    }
  }
  return found;
}
