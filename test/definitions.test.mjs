import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameAt, findDefinition, findInModule, modulePaths } from '../src/definitions.js';

// The offset of the nth (default first) `word` in code, plus `into` characters
const at = (code, word, n = 1, into = 1) => {
  let i = -1;
  for (let k = 0; k < n; k++) i = code.indexOf(word, i + 1);
  assert.ok(i >= 0, `${word} not in code`);
  return i + into;
};
const lineOf = (code, offset) => code.slice(0, offset).split('\n').length;

test('nameAt finds the identifier under the caret, and what it is an attribute of', () => {
  const code = 'x = helpers.double(3)\n';
  assert.deepEqual(nameAt(code, at(code, 'double')), { name: 'double', qualifier: 'helpers', start: 12, end: 18 });
  assert.deepEqual(nameAt(code, at(code, 'helpers')), { name: 'helpers', qualifier: null, start: 4, end: 11 });
  assert.deepEqual(nameAt(code, at(code, 'double', 1, 6)), { name: 'double', qualifier: 'helpers', start: 12, end: 18 },
    'the caret just after the name still counts');
});

test('nameAt ignores comments, strings, numbers and keywords', () => {
  const code = 'def f():  # call double\n    return "double" + 12\n';
  assert.equal(nameAt(code, at(code, 'double')), null);
  assert.equal(nameAt(code, at(code, 'double', 2)), null);
  assert.equal(nameAt(code, at(code, '12')), null);
  assert.equal(nameAt(code, at(code, 'return')), null);
});

test('a function or class is found where it is defined', () => {
  const code = 'def double(x):\n    return 2 * x\n\nclass Led:\n    pass\n\nprint(double(Led()))\n';
  const d = findDefinition(code, at(code, 'double', 2));
  assert.deepEqual(d, { line: 1, column: 5, length: 6, text: 'def double(x):', name: 'double' });
  assert.equal(findDefinition(code, at(code, 'Led', 2)).line, 4);
});

test('clicking the definition itself finds it', () => {
  const code = 'def double(x):\n    return 2 * x\n';
  assert.equal(findDefinition(code, at(code, 'double')).line, 1);
});

test('at module level, the latest assignment above the caret wins', () => {
  const code = 'speed = 10\nprint(speed)\nspeed = 20\nprint(speed)\n';
  assert.equal(findDefinition(code, at(code, 'speed', 2)).line, 1);
  assert.equal(findDefinition(code, at(code, 'speed', 4)).line, 3);
});

test('a name used before it is assigned goes to its first assignment', () => {
  const code = 'def go():\n    blink()\n\ndef blink():\n    pass\n';
  assert.equal(findDefinition(code, at(code, 'blink')).line, 4);
});

test('inside a function, its own parameters and variables come first', () => {
  const code = 'x = 1\ncount = 0\ndef f(x, y=2):\n    count = x + y\n    return count\nprint(x, count)\n';
  assert.equal(findDefinition(code, at(code, 'x', 3)).line, 3, 'the parameter x');
  assert.equal(findDefinition(code, at(code, 'y', 2)).line, 3, 'the parameter y');
  assert.equal(findDefinition(code, at(code, 'count', 3)).line, 4, 'the local count');
  assert.equal(findDefinition(code, at(code, 'x', 4)).line, 1, 'the global x, outside the function');
  assert.equal(findDefinition(code, at(code, 'count', 4)).line, 2, 'the global count, outside the function');
});

test('from inside a function, a global goes to where it is first assigned', () => {
  const code = 'speed = 10\ndef go():\n    print(speed)\nspeed = 20\n';
  assert.equal(findDefinition(code, at(code, 'speed', 2)).line, 1);
});

test('a name declared global inside a function is the module-level one', () => {
  const code = 'count = 0\ndef bump():\n    global count\n    count = count + 1\n';
  assert.equal(findDefinition(code, at(code, 'count', 4)).line, 1);
});

test('loop variables, with ... as, except ... as and tuple assignments are definitions', () => {
  const code = 'for i, led in enumerate(leds):\n    print(i, led)\n'
    + 'with open("f") as f:\n    f.read()\n'
    + 'try:\n    pass\nexcept OSError as e:\n    print(e)\n'
    + 'a, b = 1, 2\nprint(a + b)\n';
  assert.equal(findDefinition(code, at(code, 'led', 3)).line, 1);
  assert.equal(findDefinition(code, at(code, 'print(i', 1, 7)).line, 1);
  assert.equal(findDefinition(code, at(code, 'f.read')).line, 3);
  assert.equal(findDefinition(code, at(code, 'print(e)', 1, 7)).line, 7);
  assert.equal(findDefinition(code, at(code, 'a + b', 1, 0)).line, 9);
  assert.equal(findDefinition(code, at(code, 'a + b', 1, 4)).line, 9);
});

test('augmented and annotated assignments count, comparisons do not', () => {
  const code = 'total: int = 0\ntotal += 5\nif total == 5:\n    pass\n';
  assert.equal(findDefinition(code, at(code, 'total', 3)).line, 2);
  const code2 = 'n = 1\nif n == 1:\n    print(n)\n';
  assert.equal(findDefinition(code2, at(code2, '(n)', 1, 1)).line, 1);
});

test('self.x goes to its first assignment in the class, self.method() to the method', () => {
  const code = 'class Led:\n    def __init__(self, pin):\n        self.pin = pin\n        self.on = False\n'
    + '    def toggle(self):\n        self.on = not self.on\n        self.show()\n'
    + '    def show(self):\n        print(self.pin)\n';
  assert.equal(findDefinition(code, at(code, 'self.pin', 2, 6)).line, 3);
  assert.equal(findDefinition(code, at(code, 'self.on', 3, 6)).line, 4);
  assert.equal(findDefinition(code, at(code, 'self.show', 1, 6)).line, 8);
  assert.equal(findDefinition(code, at(code, 'pin', 3)).line, 2, 'the parameter pin');
});

test('a name imported from a module points into that module', () => {
  const code = 'from helpers import double, triple as three\nprint(double(2), three(3))\n';
  assert.deepEqual(findDefinition(code, at(code, 'double', 2)), { module: 'helpers', name: 'double', line: 1 });
  assert.deepEqual(findDefinition(code, at(code, 'three', 2)), { module: 'helpers', name: 'triple', line: 1 });
  assert.deepEqual(findDefinition(code, at(code, 'double')), { module: 'helpers', name: 'double', line: 1 },
    'clicking the name in the import line');
});

test('module.name points into the module, and so does the module name itself', () => {
  const code = 'import helpers\nimport tools.leds as leds\nhelpers.double(2)\nleds.blink()\n';
  assert.deepEqual(findDefinition(code, at(code, 'double')), { module: 'helpers', name: 'double', line: 1 });
  assert.deepEqual(findDefinition(code, at(code, 'helpers', 2)), { module: 'helpers', name: null, line: 1 });
  assert.deepEqual(findDefinition(code, at(code, 'blink')), { module: 'tools.leds', name: 'blink', line: 2 });
  assert.deepEqual(findDefinition(code, at(code, 'helpers')), { module: 'helpers', name: null, line: 1 });
  assert.deepEqual(findDefinition(code, at(code, 'tools')), { module: 'tools', name: null, line: 2 });
});

test('built-in names are reported as built in, unless the program defines them', () => {
  const code = 'print(len("x"))\n';
  assert.deepEqual(findDefinition(code, at(code, 'len')), { builtin: 'len' });
  const code2 = 'def print(x):\n    pass\nprint(1)\n';
  assert.equal(findDefinition(code2, at(code2, 'print', 2)).line, 1);
});

test('names with no definition to be found give null, or say what they are attributes of', () => {
  const code = 'led = Pin(25)\nled.on()\nmystery()\n';
  assert.deepEqual(findDefinition(code, at(code, 'on')), { attribute: 'on', of: 'led' });
  assert.equal(findDefinition(code, at(code, 'mystery')), null);
  assert.equal(findDefinition(code, at(code, 'Pin')), null);
});

test('findInModule finds a module-level definition, preferring def and class', () => {
  const code = 'import time\n\nSPEED = 3\n\ndef double(x):\n    y = 1\n    return 2 * x\n\nclass Led:\n    pass\n'
    + 'double = double\n';
  assert.deepEqual(findInModule(code, 'double'), { line: 5, column: 5, length: 6, text: 'def double(x):', name: 'double' });
  assert.equal(findInModule(code, 'SPEED').line, 3);
  assert.equal(findInModule(code, 'Led').line, 9);
  assert.equal(findInModule(code, 'y'), null, 'not a local variable');
  assert.equal(findInModule(code, 'nothing'), null);
});

test('findInModule follows a name the module imports from somewhere else', () => {
  const code = 'from .leds import blink\nfrom tools import fade as dim\n';
  assert.deepEqual(findInModule(code, 'dim'), { module: 'tools', name: 'fade', line: 2 });
  assert.deepEqual(findInModule(code, 'blink'), { module: '.leds', name: 'blink', line: 1 });
});

test('modulePaths lists where MicroPython looks for a module on the Pico', () => {
  assert.deepEqual(modulePaths('helpers'), ['/helpers.py', '/helpers/__init__.py', '/lib/helpers.py', '/lib/helpers/__init__.py']);
  assert.deepEqual(modulePaths('tools.leds'),
    ['/tools/leds.py', '/tools/leds/__init__.py', '/lib/tools/leds.py', '/lib/tools/leds/__init__.py']);
  assert.deepEqual(modulePaths('.leds', '/lib/tools/__init__.py'), ['/lib/tools/leds.py', '/lib/tools/leds/__init__.py']);
  assert.deepEqual(modulePaths('..x', '/lib/a/b/c.py'), ['/lib/a/x.py', '/lib/a/x/__init__.py']);
});

test('lineOf helper agrees with findDefinition lines', () => {
  const code = 'a = 1\n\nb = a\n';
  assert.equal(lineOf(code, at(code, 'a', 2)), 3);
});

test('parameters over several lines, docstrings and keyword arguments', () => {
  const code = 'def move(speed,\n         steps=10):\n    """speed = how fast"""\n    print(speed, end="")\n    return steps\n'
    + 'end = 3\nprint(end)\n';
  assert.equal(findDefinition(code, at(code, 'speed', 3)).line, 1, 'not the docstring');
  assert.equal(findDefinition(code, at(code, 'steps', 2)).line, 2);
  assert.equal(findDefinition(code, at(code, '(end)', 1, 1)).line, 6, 'end="" is not an assignment');
});

test('half-written code does not throw', () => {
  for (const code of ['def f(', 'x = (1,\n', 'class', 'from ', 'import', 'for x in', 'self.', '"""\nx = 1']) {
    for (let i = 0; i <= code.length; i++) findDefinition(code, i);
  }
});
