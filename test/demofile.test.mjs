// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDemo, LIVE } from '../demo/demofile.js';
import { ACTIONS } from '../demo/steps.js';

const schema = JSON.parse(fs.readFileSync(new URL('../demo/demo.schema.json', import.meta.url)));

test('a demo file becomes settings and a list of steps, with defaults filled in', () => {
  const demo = loadDemo(`
steps:
  - caption: Hello
  - pause: 2
  - run:
  - edit: { find: led, replace: leed, in: led.toggle }
`);
  assert.deepEqual(demo, {
    title: 'Pico Pipette demo', url: LIVE, pace: 1, viewport: { width: 1280, height: 900 },
    steps: [
      { action: 'caption', value: 'Hello', line: 3 },
      { action: 'pause', value: 2, line: 4 },
      { action: 'run', value: null, line: 5 },
      { action: 'edit', value: { find: 'led', replace: 'leed', in: 'led.toggle' }, line: 6 },
    ],
  });
});

test('settings in the file are used', () => {
  const demo = loadDemo('title: Mine\nurl: http://localhost:8000/\npace: 1.5\nviewport: { width: 1000, height: 700 }\nsteps:\n  - pause: 1\n');
  assert.equal(demo.title, 'Mine');
  assert.equal(demo.url, 'http://localhost:8000/');
  assert.equal(demo.pace, 1.5);
  assert.deepEqual(demo.viewport, { width: 1000, height: 700 });
});

test('an unknown action is reported by name and line', () => {
  assert.throws(() => loadDemo('steps:\n  - pause: 1\n  - clik: run\n'), /line 3: unknown action "clik"/);
});

test('a wrong value is reported with its line', () => {
  assert.throws(() => loadDemo('steps:\n  - pause: soon\n'), /line 2: .*pause.* must be number/);
  assert.throws(() => loadDemo('steps:\n  - click: runn\n'), /line 2: .*click/);
  assert.throws(() => loadDemo('steps:\n  - wait: forever\n'), /line 2: .*wait.* must be one of: connected, finished, idle/);
});

test('an action that takes no value says so plainly', () => {
  assert.throws(() => loadDemo('steps:\n  - stop: now\n'), /line 2: stop takes no value: write just "stop:"/);
  assert.throws(() => loadDemo('steps:\n  - run: yes\n'), /line 2: run takes no value.*wait: false/);
});

test('two actions in one step is a mistake', () => {
  assert.throws(() => loadDemo('steps:\n  - caption: Hi\n    pause: 1\n'), /line 2: .*one action/);
});

test('a missing value for edit is reported', () => {
  assert.throws(() => loadDemo('steps:\n  - edit: { find: led }\n'), /line 2: .*replace/);
});

test('YAML that cannot be read is reported with its line', () => {
  assert.throws(() => loadDemo('steps:\n  - caption: "unclosed\n  - pause: 1\n'), /line \d+/);
});

test('a file with no steps is reported', () => {
  assert.throws(() => loadDemo('title: Empty\n'), /steps/);
});

test('the schema and the step runner know the same actions', () => {
  assert.deepEqual(Object.keys(schema.definitions.step.properties).sort(), Object.keys(ACTIONS).sort());
});

test('every button the schema allows is one the runner can find', async () => {
  const { BUTTONS } = await import('../demo/steps.js');
  assert.deepEqual(schema.definitions.button.enum.sort(), Object.keys(BUTTONS).sort());
});

test('the demos shipped in demo/ are all valid', () => {
  const files = fs.readdirSync(new URL('../demo/', import.meta.url)).filter(f => /\.ya?ml$/.test(f));
  assert.ok(files.includes('intro.yaml'));
  for (const f of files) loadDemo(fs.readFileSync(new URL(`../demo/${f}`, import.meta.url), 'utf8'), f);
});
