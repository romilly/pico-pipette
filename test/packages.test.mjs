// Run with: npm test   (or node --test)
// The installer runs against a fake web (below) and real MicroPython standing in for the Pico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { createMicroPythonLink } from '../src/micropython.js';
import { INDEX, rewriteUrl, packageSource, deviceInfo, installPackage } from '../src/packages.js';
import { readFile, readBytes, listDir } from '../src/picofs.js';

const micropython = () => createMicroPythonLink(loadMicroPython);

// A fake web: url -> object (served as JSON), string or bytes. Remembers what was requested.
function fakeWeb(pages) {
  const requested = [];
  const fetch = async url => {
    requested.push(url);
    if (!(url in pages)) return { ok: false, status: 404 };
    const body = pages[url];
    const bytes = body instanceof Uint8Array ? body
      : new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body));
    return { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(bytes)), arrayBuffer: async () => bytes.buffer };
  };
  return { fetch, requested };
}

const file = (hash) => `${INDEX}/file/${hash.slice(0, 2)}/${hash}`;

test('rewriteUrl turns github:, gitlab: and codeberg: into raw file URLs', () => {
  assert.equal(rewriteUrl('github:org/repo/lib/x.py'), 'https://raw.githubusercontent.com/org/repo/HEAD/lib/x.py');
  assert.equal(rewriteUrl('github:org/repo/x.py', 'v1.2'), 'https://raw.githubusercontent.com/org/repo/v1.2/x.py');
  assert.equal(rewriteUrl('gitlab:org/repo/x.py'), 'https://gitlab.com/org/repo/-/raw/HEAD/x.py');
  assert.equal(rewriteUrl('codeberg:org/repo/x.py'), 'https://codeberg.org/api/v1/repos/org/repo/raw/x.py?ref=HEAD');
  assert.equal(rewriteUrl('https://example.com/x.py'), 'https://example.com/x.py');
});

test('packageSource: a plain name comes from the micropython-lib index', () => {
  assert.deepEqual(packageSource('ssd1306', { mpy: 6 }), { json: `${INDEX}/package/6/ssd1306/latest.json` });
  assert.deepEqual(packageSource('ssd1306', { mpy: 'py', version: '0.1.0' }), { json: `${INDEX}/package/py/ssd1306/0.1.0.json` });
});

test('packageSource: repositories and URLs point at a package.json, or a single file', () => {
  assert.deepEqual(packageSource('github:org/repo', {}), { json: 'github:org/repo/package.json' });
  assert.deepEqual(packageSource('github:org/repo/', {}), { json: 'github:org/repo/package.json' });
  assert.deepEqual(packageSource('https://example.com/pkg/package.json', {}), { json: 'https://example.com/pkg/package.json' });
  assert.deepEqual(packageSource('github:org/repo/tool.py', {}), { file: 'github:org/repo/tool.py', name: 'tool.py' });
  assert.deepEqual(packageSource('https://example.com/a/b.mpy', {}), { file: 'https://example.com/a/b.mpy', name: 'b.mpy' });
});

test('deviceInfo finds the .mpy version and the lib folder', async () => {
  assert.deepEqual(await deviceInfo(await micropython()), { mpy: 6, lib: '/lib' });
});

test('installs a micropython-lib package, including files in subfolders', async () => {
  const link = await micropython();
  const core = Uint8Array.from([0x4d, 6, 0, 31, 0xff, 0]);   // binary, like a real .mpy
  const web = fakeWeb({
    [`${INDEX}/package/6/aioble/latest.json`]: { hashes: [['aioble/__init__.mpy', 'aa11'], ['aioble/core.mpy', 'bb22']], version: '0.5.0' },
    [file('aa11')]: 'print("init")\n',
    [file('bb22')]: core,
  });
  const installed = await installPackage(link, 'aioble', { fetch: web.fetch });
  assert.deepEqual(installed, ['/lib/aioble/__init__.mpy', '/lib/aioble/core.mpy']);
  assert.equal(await readFile(link, '/lib/aioble/__init__.mpy'), 'print("init")\n');
  assert.deepEqual(await readBytes(link, '/lib/aioble/core.mpy'), core);
});

test('installs dependencies too, each only once', async () => {
  const link = await micropython();
  const web = fakeWeb({
    [`${INDEX}/package/6/app/latest.json`]: { hashes: [['app.mpy', 'a1']], deps: [['util', 'latest'], ['extra', '1.0']] },
    [`${INDEX}/package/6/util/latest.json`]: { hashes: [['util.mpy', 'b1']] },
    [`${INDEX}/package/6/extra/1.0.json`]: { hashes: [['extra.mpy', 'c1']], deps: [['util', 'latest']] },
    [file('a1')]: 'app', [file('b1')]: 'util', [file('c1')]: 'extra',
  });
  const installed = await installPackage(link, 'app', { fetch: web.fetch });
  assert.deepEqual(installed, ['/lib/app.mpy', '/lib/util.mpy', '/lib/extra.mpy']);
  assert.equal(web.requested.filter(u => u.includes('/util/')).length, 1);
});

test('installs from GitHub: relative and github: URLs in package.json, at the requested branch', async () => {
  const link = await micropython();
  const raw = 'https://raw.githubusercontent.com';
  const web = fakeWeb({
    [`${raw}/org/sensor/v2/package.json`]: {
      urls: [['sensor/__init__.py', 'sensor/__init__.py'], ['helpers.py', 'github:org/helpers/helpers.py']],
      deps: [['github:org/units', 'v2']],
    },
    [`${raw}/org/sensor/v2/sensor/__init__.py`]: 'from .core import *\n',
    [`${raw}/org/helpers/v2/helpers.py`]: 'def helper(): pass\n',
    [`${raw}/org/units/v2/package.json`]: { urls: [['units.py', 'units.py']] },
    [`${raw}/org/units/v2/units.py`]: 'CM = 1\n',
  });
  const installed = await installPackage(link, 'github:org/sensor', { fetch: web.fetch, version: 'v2' });
  assert.deepEqual(installed, ['/lib/sensor/__init__.py', '/lib/helpers.py', '/lib/units.py']);
  assert.equal(await readFile(link, '/lib/units.py'), 'CM = 1\n');
});

test('installs a single file straight from a URL', async () => {
  const link = await micropython();
  const web = fakeWeb({ 'https://example.com/code/blinker.py': 'BLINK = True\n' });
  assert.deepEqual(await installPackage(link, 'https://example.com/code/blinker.py', { fetch: web.fetch }), ['/lib/blinker.py']);
  assert.equal(await readFile(link, '/lib/blinker.py'), 'BLINK = True\n');
});

test('a package that does not exist is reported clearly, and nothing is written', async () => {
  const link = await micropython();
  const web = fakeWeb({});
  await assert.rejects(installPackage(link, 'no-such-thing', { fetch: web.fetch }), /Package not found: no-such-thing/);
  assert.deepEqual((await listDir(link, '/')).map(e => e.name).includes('lib'), false);
});

test('a missing file in a package is reported', async () => {
  const link = await micropython();
  const web = fakeWeb({ [`${INDEX}/package/6/broken/latest.json`]: { hashes: [['broken.mpy', 'dead']] } });
  await assert.rejects(installPackage(link, 'broken', { fetch: web.fetch }), /File not found: broken.mpy/);
});

test('when the web can\'t be reached at all, the error says so', async () => {
  const link = await micropython();
  const fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(installPackage(link, 'ssd1306', { fetch }), /Could not reach https:\/\/micropython\.org/);
});

test('progress messages are reported as files are copied', async () => {
  const link = await micropython();
  const web = fakeWeb({ [`${INDEX}/package/6/tiny/latest.json`]: { hashes: [['tiny.mpy', 'ee']] }, [file('ee')]: 'x' });
  const messages = [];
  await installPackage(link, 'tiny', { fetch: web.fetch, log: m => messages.push(m) });
  assert.deepEqual(messages, ['Installing tiny (latest) into /lib', 'Copying /lib/tiny.mpy']);
});
