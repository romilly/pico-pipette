// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tabs, importsOf, sameFile } from '../src/tabs.js';

test('starts with one new, unsaved-free tab, which is active', () => {
  const tabs = new Tabs({ name: 'blink.py' });
  assert.equal(tabs.list.length, 1);
  assert.equal(tabs.active.name, 'blink.py');
  assert.equal(tabs.active.unsaved, false);
  assert.deepEqual(tabs.active.source, { kind: 'new' });
});

test('opening a file adds a tab and makes it active', () => {
  const tabs = new Tabs({ name: 'blink.py' });
  const { tab, existing } = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/helpers.py' } });
  assert.equal(existing, false);
  assert.equal(tabs.active, tab);
  assert.deepEqual(tabs.list.map((t) => t.name), ['blink.py', 'helpers.py']);
});

test('opening a file that is already open switches to its tab instead', () => {
  const tabs = new Tabs({ name: 'blink.py' });
  const first = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/lib/helpers.py' } }).tab;
  tabs.activate(tabs.list[0].id);
  const again = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/lib/helpers.py' } });
  assert.equal(again.existing, true);
  assert.equal(again.tab, first);
  assert.equal(tabs.active, first);
  assert.equal(tabs.list.length, 2);
});

test('files with the same name from different places get separate tabs', () => {
  const tabs = new Tabs({ name: 'blink.py' });
  tabs.open({ name: 'main.py', source: { kind: 'pico', path: '/main.py' } });
  tabs.open({ name: 'main.py', source: { kind: 'pico', path: '/old/main.py' } });
  assert.equal(tabs.list.length, 3);
});

test('new tabs get names that are not already in use', () => {
  const tabs = new Tabs({ name: 'untitled.py' });
  assert.equal(tabs.newTab().name, 'untitled-2.py');
  assert.equal(tabs.newTab().name, 'untitled-3.py');
});

test('closing the active tab activates its neighbour, preferring the one to its left', () => {
  const tabs = new Tabs({ name: 'a.py' });
  tabs.newTab(); tabs.newTab();               // a.py, untitled.py, untitled-2.py (active)
  const [a, b, c] = tabs.list;
  tabs.close(c.id);
  assert.equal(tabs.active, b);
  tabs.activate(a.id);
  tabs.close(a.id);
  assert.equal(tabs.active, b);               // no tab to its left, so the right one
  tabs.newTab();
  tabs.activate(b.id);
  tabs.close(tabs.list[1].id);                // closing an inactive tab leaves the active one alone
  assert.equal(tabs.active, b);
});

test('closing the last tab leaves a fresh empty one', () => {
  const tabs = new Tabs({ name: 'a.py' });
  const { replacement } = tabs.close(tabs.active.id);
  assert.equal(tabs.list.length, 1);
  assert.equal(replacement, tabs.active);
  assert.equal(tabs.active.name, 'untitled.py');
});

test('edits mark a tab unsaved and no longer the same as on the Pico; saving clears what it should', () => {
  const tabs = new Tabs({ name: 'a.py' });
  const tab = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/helpers.py' }, onPico: true }).tab;
  assert.equal(tab.onPico, true);
  tabs.edited(tab.id);
  assert.equal(tab.unsaved, true);
  assert.equal(tab.onPico, false);
  tabs.savedLocally(tab.id, { kind: 'local', handle: null });
  assert.equal(tab.unsaved, false);
  assert.equal(tab.onPico, false);            // saving to the computer doesn't put it on the Pico
  tabs.edited(tab.id);
  tabs.savedToPico(tab.id, '/lib/helpers.py');
  assert.equal(tab.unsaved, false);
  assert.equal(tab.onPico, true);
  assert.equal(tab.picoPath, '/lib/helpers.py');
});

test('saving to the Pico under another name (Save as main.py) renames the tab to match', () => {
  const tabs = new Tabs({ name: 'blink.py' });
  tabs.savedToPico(tabs.active.id, '/main.py');
  assert.equal(tabs.active.name, 'main.py');
  assert.deepEqual(tabs.active.source, { kind: 'pico', path: '/main.py' });
});

test('renaming the active tab changes its name and forgets the file it came from on the computer', () => {
  const tabs = new Tabs({ name: 'a.py' });
  tabs.savedLocally(tabs.active.id, { kind: 'local', handle: { name: 'a.py' } });
  tabs.rename(tabs.active.id, 'b.py');
  assert.equal(tabs.active.name, 'b.py');
  assert.deepEqual(tabs.active.source, { kind: 'new' });
});

test('anyUnsaved says whether closing everything would lose work', () => {
  const tabs = new Tabs({ name: 'a.py' });
  assert.equal(tabs.anyUnsaved(), false);
  tabs.edited(tabs.active.id);
  assert.equal(tabs.anyUnsaved(), true);
});

test('importsOf finds the modules a program imports', () => {
  assert.deepEqual(importsOf(`import time
from machine import Pin
import helpers, lib.leds as leds
    from sensors.temp import read   # indented, inside a function
# import notthis
x = "import nor this"
`), ['time', 'machine', 'helpers', 'lib', 'sensors']);
});

test('staleImports lists other open tabs the active code imports whose changes are not on the Pico', () => {
  const tabs = new Tabs({ name: 'main.py' });
  const helpers = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/helpers.py' }, onPico: true }).tab;
  const leds = tabs.open({ name: 'leds.py' }).tab;               // new, never saved to the Pico
  tabs.open({ name: 'notes.py' });                               // not imported: never mentioned
  const main = tabs.list[0];
  tabs.activate(main.id);
  const code = 'import helpers\nimport leds\nimport time\n';
  assert.deepEqual(tabs.staleImports(code).map((t) => t.name), ['leds.py']);
  tabs.edited(helpers.id);
  assert.deepEqual(tabs.staleImports(code).map((t) => t.name), ['helpers.py', 'leds.py']);
  assert.deepEqual(tabs.staleImports('print(1)'), []);
  assert.ok(!tabs.staleImports('import main').includes(main));  // never the tab being run
  void leds;
});

test('sameFile matches a traceback\'s file name to a tab\'s file on the Pico', () => {
  assert.equal(sameFile('helpers.py', { picoPath: '/helpers.py', name: 'helpers.py' }), true);
  assert.equal(sameFile('/lib/helpers.py', { picoPath: '/lib/helpers.py', name: 'helpers.py' }), true);
  assert.equal(sameFile('lib/helpers.py', { picoPath: '/lib/helpers.py', name: 'helpers.py' }), true);
  assert.equal(sameFile('helpers.py', { picoPath: '/lib/helpers.py', name: 'helpers.py' }), false);
  assert.equal(sameFile('helpers.py', { picoPath: null, name: 'helpers.py' }), true);   // not saved yet: by name
  assert.equal(sameFile('other.py', { picoPath: null, name: 'helpers.py' }), false);
  assert.equal(sameFile('helpers.py', { picoPath: null, name: 'helpers.py' }), true);
});

test('fileTab finds the open tab a traceback\'s file refers to', () => {
  const tabs = new Tabs({ name: 'main.py' });
  const helpers = tabs.open({ name: 'helpers.py', source: { kind: 'pico', path: '/lib/helpers.py' }, onPico: true }).tab;
  assert.equal(tabs.fileTab('/lib/helpers.py'), helpers);
  assert.equal(tabs.fileTab('nothing.py'), undefined);
});
