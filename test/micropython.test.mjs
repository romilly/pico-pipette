// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { createMicroPythonLink } from '../src/micropython.js';

test('run returns what the code printed', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  assert.deepEqual(await link.run('print(6 * 7)'), { stdout: '42\n', stderr: '' });
});

test('run returns the traceback when the code fails, in the same form as a Pico', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  const { stdout, stderr } = await link.run('print("before")\nprint(x)');
  assert.equal(stdout, 'before\n');
  assert.match(stderr, /File "<stdin>", line 2/);
  assert.match(stderr, /NameError/);
});

test('run passes the output to onOutput', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  const seen = [];
  await link.run('print("hi")', { onOutput: o => seen.push(o) });
  assert.deepEqual(seen, [{ stdout: 'hi\n', stderr: '' }]);
});

test('by default each run starts afresh, like a soft reset', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  await link.run('x = 1');
  assert.match((await link.run('print(x)')).stderr, /NameError/);
});

test('reset: false keeps what the last run left behind', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  await link.run('x = 1');
  assert.equal((await link.run('print(x)', { reset: false })).stdout, '1\n');
});

test('files survive a reset, as they do on a Pico', async () => {
  const link = await createMicroPythonLink(loadMicroPython);
  await link.run("with open('/keep.txt', 'w') as f: f.write('kept')");
  assert.equal((await link.run("print(open('/keep.txt').read())")).stdout, 'kept\n');
});
