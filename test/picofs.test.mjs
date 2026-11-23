// Run with: npm test   (or node --test)
// These tests run the file snippets in real MicroPython (its WebAssembly build), not a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { createMicroPythonLink } from '../src/micropython.js';
import { listDir, readFile, readBytes, writeFile, remove, makeDir, makeDirs, joinPath, firstFile } from '../src/picofs.js';

// The WebAssembly MicroPython adapter, counting runs. Each test gets a fresh MicroPython
// and works in its own folder.
async function micropython() {
  const board = await createMicroPythonLink(loadMicroPython);
  await board.run("import os\nos.mkdir('/work')");
  return {
    runs: 0,
    async run(code, options) {
      this.runs++;
      this.lastOptions = options;
      return board.run(code, options);
    },
  };
}

test('an empty folder lists nothing', async () => {
  const link = await micropython();
  assert.deepEqual(await listDir(link, '/work'), []);
});

test('files written can be read back exactly', async () => {
  const link = await micropython();
  const text = 'from machine import Pin\nprint("héllo, 世界 \'quotes\' \\\\ backslash")\n';
  await writeFile(link, '/work/blink.py', text);
  assert.equal(await readFile(link, '/work/blink.py'), text);
});

test('writing replaces an existing file', async () => {
  const link = await micropython();
  await writeFile(link, '/work/main.py', 'old version, which is longer\n');
  await writeFile(link, '/work/main.py', 'new\n');
  assert.equal(await readFile(link, '/work/main.py'), 'new\n');
});

test('large files are sent in several pieces and still arrive intact', async () => {
  const link = await micropython();
  const text = Array.from({ length: 400 }, (_, i) => `print("line ${i}")`).join('\n');
  const progress = [];
  await writeFile(link, '/work/big.py', text, { onProgress: p => progress.push(p) });
  assert.ok(link.runs > 3, `expected several runs, got ${link.runs}`);
  assert.equal(progress.at(-1), 1);
  assert.equal(await readFile(link, '/work/big.py'), text);
});

test('an empty file can be written', async () => {
  const link = await micropython();
  await writeFile(link, '/work/empty.py', '');
  assert.equal(await readFile(link, '/work/empty.py'), '');
});

test('listDir shows folders first, then files with their sizes', async () => {
  const link = await micropython();
  await writeFile(link, '/work/b.py', 'x = 1\n');
  await writeFile(link, '/work/a.py', 'é\n');
  await makeDir(link, '/work/lib');
  assert.deepEqual(await listDir(link, '/work'), [
    { name: 'lib', isDir: true, size: 0 },
    { name: 'a.py', isDir: false, size: 3 },
    { name: 'b.py', isDir: false, size: 6 },
  ]);
});

test('no temporary file is left behind after a write', async () => {
  const link = await micropython();
  await writeFile(link, '/work/main.py', 'print(1)\n');
  assert.deepEqual((await listDir(link, '/work')).map(e => e.name), ['main.py']);
});

test('remove deletes a file, and an empty folder', async () => {
  const link = await micropython();
  await writeFile(link, '/work/gone.py', '');
  await makeDir(link, '/work/old');
  await remove(link, '/work/gone.py');
  await remove(link, '/work/old');
  assert.deepEqual(await listDir(link, '/work'), []);
});

test('errors from the Pico are reported, e.g. reading a missing file', async () => {
  const link = await micropython();
  await assert.rejects(readFile(link, '/work/nope.py'), /ENOENT|OSError/);
});

test('file operations never soft-reset the Pico', async () => {
  const link = await micropython();
  await listDir(link, '/work');
  assert.deepEqual(link.lastOptions, { reset: false });
});

test('binary files (bytes rather than text) are written exactly', async () => {
  const link = await micropython();
  const bytes = Uint8Array.from({ length: 300 }, (_, i) => i % 256);   // includes 0, 0xff, invalid UTF-8
  await writeFile(link, '/work/data.mpy', bytes);
  assert.deepEqual(await readBytes(link, '/work/data.mpy'), bytes);
});

test('makeDirs creates every missing folder in a path, and tolerates existing ones', async () => {
  const link = await micropython();
  await makeDir(link, '/work/lib');
  await makeDirs(link, '/work/lib/aioble/sub');
  assert.deepEqual(await listDir(link, '/work/lib'), [{ name: 'aioble', isDir: true, size: 0 }]);
  assert.deepEqual(await listDir(link, '/work/lib/aioble'), [{ name: 'sub', isDir: true, size: 0 }]);
});

test('joinPath builds Pico paths', () => {
  assert.equal(joinPath('/', 'main.py'), '/main.py');
  assert.equal(joinPath('/lib', 'util.py'), '/lib/util.py');
  assert.equal(joinPath('/lib/', 'util.py'), '/lib/util.py');
});

test('firstFile finds the first of several paths that is a file, in one run', async () => {
  const link = await micropython();
  await makeDirs(link, '/work/lib/tools');
  await writeFile(link, '/work/lib/helpers.py', 'x = 1\n');
  await writeFile(link, '/work/lib/tools/__init__.py', '');
  link.runs = 0;
  assert.equal(await firstFile(link, ['/work/helpers.py', '/work/lib/helpers.py']), '/work/lib/helpers.py');
  assert.equal(link.runs, 1);
  assert.equal(await firstFile(link, ['/work/lib/tools', '/work/lib/tools/__init__.py']), '/work/lib/tools/__init__.py',
    'a folder is not a file');
  assert.equal(await firstFile(link, ['/work/nothing.py']), null);
});
