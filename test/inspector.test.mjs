// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSPECT_CODE, parseVariables, inspectGlobals } from '../src/inspector.js';

test('parseVariables turns the Pico\'s JSON into rows sorted by name', () => {
  const stdout = '{"led": ["Pin", "Pin(GPIO25, mode=OUT)"], "i": ["int", "7"]}\r\n';
  assert.deepEqual(parseVariables(stdout), [
    { name: 'i', type: 'int', value: '7' },
    { name: 'led', type: 'Pin', value: 'Pin(GPIO25, mode=OUT)' },
  ]);
});

test('parseVariables gives an empty list when there are no variables', () => {
  assert.deepEqual(parseVariables('{}\r\n'), []);
});

test('parseVariables rejects output that is not the inspector\'s JSON', () => {
  assert.throws(() => parseVariables('Traceback...'), /inspector/);
});

// A stand-in for PicoLink that records what it was asked to run
function stubLink(result) {
  return {
    calls: [],
    async run(code, options) { this.calls.push({ code, options }); return result; },
  };
}

test('inspectGlobals runs the inspector without a soft reset', async () => {
  const link = stubLink({ stdout: '{"x": ["int", "1"]}\r\n', stderr: '' });
  const rows = await inspectGlobals(link);
  assert.deepEqual(rows, [{ name: 'x', type: 'int', value: '1' }]);
  assert.equal(link.calls[0].code, INSPECT_CODE);
  assert.deepEqual(link.calls[0].options, { reset: false });
});

test('inspectGlobals reports an error from the Pico', async () => {
  const link = stubLink({ stdout: '', stderr: 'ImportError: no module named \'json\'\r\n' });
  await assert.rejects(inspectGlobals(link), /ImportError/);
});

test('the inspector code skips modules, functions, classes and private names', () => {
  for (const kind of ['module', 'function', 'type']) assert.ok(INSPECT_CODE.includes(`'${kind}'`));
  assert.ok(INSPECT_CODE.includes("startswith('_')"));
});
