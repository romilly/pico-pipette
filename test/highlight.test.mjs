// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, highlight } from '../src/highlight.js';

// Just the coloured tokens, as [type, text], leaving out plain text
const coloured = code => tokenize(code).filter(t => t.type !== 'plain').map(t => [t.type, t.text]);

test('tokens always join back into exactly the original code', () => {
  for (const code of ['', 'x = 1\n', 'def f(a, b="x"):\n    return a  # done\n', "'''never\nclosed", 'print("ok")\r\n']) {
    assert.equal(tokenize(code).map(t => t.text).join(''), code);
  }
});

test('keywords, built-ins and constants', () => {
  assert.deepEqual(coloured('for i in range(10):\n    if x is None: print(True)'), [
    ['keyword', 'for'], ['keyword', 'in'], ['builtin', 'range'], ['number', '10'],
    ['keyword', 'if'], ['keyword', 'is'], ['constant', 'None'], ['builtin', 'print'], ['constant', 'True'],
  ]);
});

test('words that only contain a keyword are not coloured', () => {
  assert.deepEqual(coloured('printer = iffy + format_in + classic'), []);
});

test('strings, including quotes, escapes and # inside them', () => {
  assert.deepEqual(coloured(`a = "it's # not a comment"`), [['string', `"it's # not a comment"`]]);
  assert.deepEqual(coloured(`b = 'say \\'hi\\''`), [['string', `'say \\'hi\\''`]]);
});

test('string prefixes such as f, r, b and rb belong to the string', () => {
  assert.deepEqual(coloured('f"{x}" r"\\d" b"\\x00" rb"raw"'), [
    ['string', 'f"{x}"'], ['string', 'r"\\d"'], ['string', 'b"\\x00"'], ['string', 'rb"raw"'],
  ]);
});

test('triple-quoted strings can span lines', () => {
  assert.deepEqual(coloured('"""first\nsecond"""\nx'), [['string', '"""first\nsecond"""']]);
});

test('an unclosed string stops at the end of the line', () => {
  assert.deepEqual(coloured('s = "oops\nprint(s)'), [['string', '"oops'], ['builtin', 'print']]);
});

test('comments run to the end of the line', () => {
  assert.deepEqual(coloured('x = 1  # set x\ny'), [['number', '1'], ['comment', '# set x']]);
});

test('numbers in their various forms', () => {
  assert.deepEqual(coloured('0x1F 1_000 3.14 1e-3 .5 0b101 7j').map(t => t[1]), ['0x1F', '1_000', '3.14', '1e-3', '.5', '0b101', '7j']);
});

test('decorators and the names after def and class are coloured', () => {
  assert.deepEqual(coloured('@micropython.native\ndef blink(n):\nclass Led:'), [
    ['decorator', '@micropython.native'], ['keyword', 'def'], ['name', 'blink'], ['keyword', 'class'], ['name', 'Led'],
  ]);
});

test('highlight wraps coloured tokens in spans and escapes HTML', () => {
  assert.equal(highlight('if a<b: print("<&>")'),
    '<span class="tok-keyword">if</span> a&lt;b: <span class="tok-builtin">print</span>(<span class="tok-string">"&lt;&amp;&gt;"</span>)');
});
