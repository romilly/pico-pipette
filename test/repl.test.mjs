// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { createMicroPythonLink } from '../src/micropython.js';
import { evaluate, needsMore, History } from '../src/repl.js';

const board = () => createMicroPythonLink(loadMicroPython);

test('an expression shows its value, as in the MicroPython REPL', async () => {
  const link = await board();
  assert.deepEqual(await evaluate(link, '6 * 7'), { stdout: '42\n', stderr: '' });
  assert.deepEqual(await evaluate(link, "'hi'"), { stdout: "'hi'\n", stderr: '' });
});

test('statements show nothing, and None is not shown', async () => {
  const link = await board();
  assert.equal((await evaluate(link, 'x = 1')).stdout, '');
  assert.equal((await evaluate(link, 'None')).stdout, '');
});

test('the REPL shares variables with the program that last ran', async () => {
  const link = await board();
  await link.run('count = 7');
  assert.equal((await evaluate(link, 'count')).stdout, '7\n');
  await evaluate(link, 'count += 1');
  assert.equal((await evaluate(link, 'count')).stdout, '8\n');
});

test('the REPL never soft-resets the board', async () => {
  const calls = [];
  const link = { run: async (code, options) => { calls.push(options); return { stdout: '', stderr: '' }; } };
  await evaluate(link, '1');
  assert.deepEqual(calls, [{ reset: false, onOutput: undefined }]);
});

test('a block of several lines runs as one', async () => {
  const link = await board();
  assert.equal((await evaluate(link, 'for i in range(3):\n    i * 10\n')).stdout, '0\n10\n20\n');
});

test('quotes, backslashes and non-ASCII text arrive unchanged', async () => {
  const link = await board();
  assert.equal((await evaluate(link, `print("it's \\\\ é \\"q\\"")`)).stdout, `it's \\ é "q"\n`);
});

test('errors show only the traceback for what was typed', async () => {
  const link = await board();
  const { stderr } = await evaluate(link, '1/0');
  assert.equal(stderr, 'Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nZeroDivisionError: divide by zero\n');
});

test('syntax errors are reported', async () => {
  const link = await board();
  assert.match((await evaluate(link, 'if')).stderr, /SyntaxError/);
});

test('needsMore: a line ending in a colon starts a block, and a blank line ends it', () => {
  assert.equal(needsMore('x = 1'), false);
  assert.equal(needsMore('for i in range(3):'), true);
  assert.equal(needsMore('for i in range(3):\n    print(i)'), true);
  assert.equal(needsMore('for i in range(3):\n    print(i)\n'), false);
});

test('needsMore: unclosed brackets and triple quotes continue, ignoring brackets in strings and comments', () => {
  assert.equal(needsMore('print(1,'), true);
  assert.equal(needsMore('d = {"a": [1,\n 2]}'), false);
  assert.equal(needsMore('s = "("'), false);
  assert.equal(needsMore('x = 1  # (not open'), false);
  assert.equal(needsMore('"""start'), true);
  assert.equal(needsMore('x = 1  # ends with a colon:'), false);
});

test('History steps back and forward through earlier entries, skipping repeats and blanks', () => {
  const h = new History();
  for (const line of ['a = 1', 'a', 'a', '  ', 'b']) h.add(line);
  assert.equal(h.back('draft'), 'b');
  assert.equal(h.back(), 'a');
  assert.equal(h.back(), 'a = 1');
  assert.equal(h.back(), 'a = 1');           // stays at the oldest
  assert.equal(h.forward(), 'a');
  assert.equal(h.forward(), 'b');
  assert.equal(h.forward(), 'draft');        // back to what was being typed
  assert.equal(h.forward(), 'draft');
});
