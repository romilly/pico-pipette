// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedent } from '../src/dedent.js';

test('removes the indentation all lines share, and blank lines at either end', () => {
  assert.equal(dedent('\n    x = 1\n    if x:\n        print(x)\n  '), 'x = 1\nif x:\n    print(x)\n');
});

test('blank lines inside keep their place', () => {
  assert.equal(dedent('\n  a = 1\n\n  b = 2\n'), 'a = 1\n\nb = 2\n');
});

test('nothing but whitespace is no code', () => {
  assert.equal(dedent('  \n  '), '');
});
