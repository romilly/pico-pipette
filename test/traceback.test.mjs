// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorLine, lineRange, innermostFrame } from '../src/traceback.js';

test('finds the line of a simple error', () => {
  const stderr =
    'Traceback (most recent call last):\r\n' +
    '  File "<stdin>", line 5, in <module>\r\n' +
    "NameError: name 'x' isn't defined\r\n";
  assert.equal(errorLine(stderr), 5);
});

test('uses the innermost line when the error is inside a function', () => {
  const stderr =
    'Traceback (most recent call last):\r\n' +
    '  File "<stdin>", line 9, in <module>\r\n' +
    '  File "<stdin>", line 3, in blink\r\n' +
    'ZeroDivisionError: divide by zero\r\n';
  assert.equal(errorLine(stderr), 3);
});

test('ignores lines in other files, such as imported modules', () => {
  const stderr =
    'Traceback (most recent call last):\r\n' +
    '  File "<stdin>", line 4, in <module>\r\n' +
    '  File "helpers.py", line 12, in flash\r\n' +
    'ValueError: bad pin\r\n';
  assert.equal(errorLine(stderr), 4);
});

test('finds the line of a syntax error', () => {
  const stderr =
    'Traceback (most recent call last):\r\n' +
    '  File "<stdin>", line 2\r\n' +
    'SyntaxError: invalid syntax\r\n';
  assert.equal(errorLine(stderr), 2);
});

test('returns null when there is no traceback', () => {
  assert.equal(errorLine(''), null);
  assert.equal(errorLine('something else went wrong'), null);
});

test('lineRange gives the start and end of a line, counting from 1', () => {
  const text = 'first\nsecond\nthird';
  assert.deepEqual(lineRange(text, 1), [0, 5]);
  assert.deepEqual(lineRange(text, 2), [6, 12]);
  assert.deepEqual(lineRange(text, 3), [13, 18]);
});

test('lineRange returns null for a line that does not exist', () => {
  assert.equal(lineRange('one\ntwo', 3), null);
  assert.equal(lineRange('one\ntwo', 0), null);
});

test('innermostFrame gives the file and line where the error actually happened, in any file', () => {
  const stderr =
    'Traceback (most recent call last):\r\n' +
    '  File "<stdin>", line 4, in <module>\r\n' +
    '  File "/lib/helpers.py", line 12, in flash\r\n' +
    'ValueError: bad pin\r\n';
  assert.deepEqual(innermostFrame(stderr), { file: '/lib/helpers.py', line: 12 });
  assert.deepEqual(innermostFrame('  File "<stdin>", line 2\r\nSyntaxError: invalid syntax\r\n'), { file: '<stdin>', line: 2 });
  assert.equal(innermostFrame('no traceback here'), null);
});
