// Go to definition: where a name in a Python file is defined. No DOM, no parser: a line-level reading of the
// file, so it copes with half-written code. Python's scoping is followed just far enough to pick the right line:
//   - inside a function, its own parameters and variables come first (unless declared global);
//   - at module level the latest assignment above the caret wins; from inside a function, the first one;
//   - self.x goes to the first self.x = ... in the class, self.method() to the method;
//   - imported names point into their module, which the caller finds (modulePaths) and searches (findInModule).
//
//   nameAt(code, offset)          -> { name, qualifier, start, end } | null    (qualifier: 'helpers' in helpers.double)
//   findDefinition(code, offset)  -> { line, column, length, text, name }      in this file
//                                  | { module, name, line }                    in a module (name null: the module itself)
//                                  | { builtin } | { attribute, of } | null
//   findInModule(code, name)      -> a module-level definition, as above, or { module, name, line } if it's imported
//   modulePaths(module, fromPath) -> the files on the Pico the module could be, in the order MicroPython tries them

import { tokenize, BUILTINS } from './highlight.js';

const WORD = /[\p{L}\p{N}_]/u;
const NOT_NAMES = new Set(['comment', 'string', 'number', 'keyword', 'constant', 'decorator']);
const STATEMENT_KEYWORDS = /^(?:if|elif|else|while|return|assert|del|raise|yield|await|print|lambda|pass|break|continue|try|finally|not)\b/;

export function nameAt(code, offset) {
  let i = offset;
  if (!WORD.test(code[i] ?? '')) i--;
  if (i < 0 || !WORD.test(code[i] ?? '')) return null;
  let start = i, end = i + 1;
  while (start > 0 && WORD.test(code[start - 1])) start--;
  while (end < code.length && WORD.test(code[end])) end++;
  if (/\p{N}/u.test(code[start]) || NOT_NAMES.has(tokenAt(code, start))) return null;
  // the dotted chain in front of it: helpers.double, self.led.on
  let q = start;
  while (code[q - 1] === '.' && WORD.test(code[q - 2] ?? '')) {
    q -= 1;
    while (q > 0 && WORD.test(code[q - 1])) q--;
  }
  return { name: code.slice(start, end), qualifier: q < start ? code.slice(q, start - 1) : null, start, end };
}

function tokenAt(code, offset) {
  let at = 0;
  for (const token of tokenize(code)) {
    if (offset < at + token.text.length) return token.type;
    at += token.text.length;
  }
  return null;
}

// --- reading the file: statements, scopes and the names each binds

// The code with comments and the insides of strings blanked out, so offsets still line up
function blank(code) {
  return tokenize(code).map(({ type, text }) =>
    type === 'comment' ? text.replace(/[^\n]/g, ' ')
      : type === 'string' ? text.replace(/(['"]+)([\s\S]*?)(['"]*)$/, (_, open, inside, close) =>
        open + inside.replace(/[^\n]/g, ' ') + close)
      : text).join('');
}

// Logical statements: a line, plus the lines that continue it inside brackets or after a backslash
function statements(text) {
  const result = [];
  let depth = 0, current = null, at = 0;
  for (const line of text.split('\n')) {
    if (!current || (depth <= 0 && !/\\\s*$/.test(current.text))) {
      if (current) result.push(current);
      current = /\S/.test(line) ? { start: at, text: line } : null;
      depth = 0;
    } else {
      current.text += '\n' + line;
    }
    for (const c of line) depth += '([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0;
    at += line.length + 1;
  }
  if (current) result.push(current);
  return result;
}

// Identifiers in a piece of text, with their offsets, splitting at top-level commas: "a, (b, c)" -> a, b, c
function names(text, base) {
  const found = [];
  for (const m of text.matchAll(/[\p{L}_][\p{L}\p{N}_]*/gu)) found.push({ name: m[0], offset: base + m.index });
  return found;
}

// The index of a top-level "=" that assigns (not ==, <=, >=, != or :=, nor inside brackets), and an augmenting
// operator before it if any
function assignment(text) {
  let depth = 0, last = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '=' && depth === 0 && text[i + 1] !== '=' && !'=<>!:'.includes(text[i - 1])) last = i;
  }
  return last;
}

function read(code) {
  const text = blank(code);
  const bindings = [];      // { name, offset, kind, scope, cls, module?, imported? }
  const spans = [];         // module names in import statements: { start, end, module, line }
  const globals = [];       // { scope, name }
  const lineAt = offset => text.slice(0, offset).split('\n').length;
  const stack = [];         // { kind: 'def' | 'class', indent }
  const placed = [];        // each statement with the scopes around it

  for (const st of statements(text)) {
    const indent = st.text.match(/^ */)[0].length;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const fn = [...stack].reverse().find(s => s.kind === 'def') ?? null;
    const cls = [...stack].reverse().find(s => s.kind === 'class') ?? null;
    const scope = stack.at(-1) ?? null;       // where a name bound by this statement lives
    const body = st.text.slice(indent);
    const base = st.start + indent;
    const bind = (name, offset, kind, extra = {}) => bindings.push({ name, offset, kind, scope, cls, ...extra });
    placed.push({ start: st.start, end: st.start + st.text.length, stack: [...stack], scope });
    let m;

    if ((m = body.match(/^((?:async\s+)?def\s+)([\p{L}_][\p{L}\p{N}_]*)\s*\(/u))) {
      bind(m[2], base + m[1].length, 'def');
      const inner = { kind: 'def', indent, cls };
      const open = base + m[0].length;
      const params = body.slice(m[0].length);
      // each parameter's name is the first word of its top-level comma-separated part
      let depth = 0, partStart = 0;
      for (let i = 0; i <= params.length; i++) {
        const c = params[i];
        if (i === params.length || (c === ')' && depth === 0) || (c === ',' && depth === 0)) {
          const part = params.slice(partStart, i);
          const p = part.match(/^[\s*]*([\p{L}_][\p{L}\p{N}_]*)/u);
          if (p) bindings.push({ name: p[1], offset: open + partStart + p[0].length - p[1].length, kind: 'param', scope: inner, cls });
          if (c !== ',') break;
          partStart = i + 1;
        } else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
      }
      stack.push(inner);
    } else if ((m = body.match(/^(class\s+)([\p{L}_][\p{L}\p{N}_]*)/u))) {
      bind(m[2], base + m[1].length, 'class');
      stack.push({ kind: 'class', indent });
    } else if ((m = body.match(/^((?:async\s+)?for\s+)(.+?)\s+in\b/su))) {
      for (const n of names(m[2], base + m[1].length)) bind(n.name, n.offset, 'for');
    } else if (/^(?:async\s+)?with\b/.test(body) || /^except\b/.test(body)) {
      for (const a of body.matchAll(/\bas\s+\(?([^:)]+)/g)) {
        for (const n of names(a[1], base + a.index + a[0].length - a[1].length)) bind(n.name, n.offset, 'as');
      }
    } else if ((m = body.match(/^import\s+/))) {
      // import a.b.c as d -> d is module a.b.c;  import a.b -> a is module a
      for (const part of body.slice(m[0].length).matchAll(/([\w.]+)(?:\s+as\s+(\w+))?/g)) {
        const at = base + m[0].length + part.index;
        const module = part[1];
        addSpans(spans, module, at, lineAt(at));
        if (part[2]) bind(part[2], at + part[0].length - part[2].length, 'import', { module, imported: null });
        else bind(module.split('.')[0], at, 'import', { module: module.split('.')[0], imported: null });
      }
    } else if ((m = body.match(/^(from\s+)([\w.]+)(\s+import\s+)/))) {
      const module = m[2];
      addSpans(spans, module, base + m[1].length, lineAt(base));
      const listAt = m[0].length;
      for (const part of body.slice(listAt).matchAll(/(\w+)(?:\s+as\s+(\w+))?/g)) {
        const at = base + listAt + part.index;
        const name = part[2] ?? part[1];
        bind(name, part[2] ? at + part[0].length - part[2].length : at, 'import', { module, imported: part[1] });
      }
    } else if ((m = body.match(/^(global\s+)(.+)/))) {
      for (const n of names(m[2], 0)) globals.push({ scope: fn, name: n.name });
    } else if (!STATEMENT_KEYWORDS.test(body)) {
      // assignments: a = 1, a, b = f(), a = b = 0, a += 1, a: int = 0, self.x = 1
      let target = null;
      const eq = assignment(body);
      if (eq >= 0) {
        const lhs = body.slice(0, eq).replace(/[-+*/%&|^@]|\/\/|\*\*|<<|>>$/, m => ' '.repeat(m.length));
        target = lhs.replace(/:[^,]*$/, m => ' '.repeat(m.length));   // drop an annotation
      } else if ((m = body.match(/^[\p{L}_][\p{L}\p{N}_]*\s*:(?!=)/u))) {
        target = body.slice(0, m[0].length - 1);                        // x: int, with no value
      }
      if (target !== null && /^[\s\w.,()[\]*]*$/u.test(target)) {
        // each top-level comma part: a plain name, or self.name
        for (const part of target.matchAll(/[^,()[\]]+/g)) {
          const piece = part[0];
          const lead = piece.match(/^[\s*]*/)[0].length;
          const word = piece.slice(lead).trimEnd();
          const at = base + part.index + lead;
          if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(word)) bind(word, at, 'assign');
          else if ((m = word.match(/^self\.([\p{L}_][\p{L}\p{N}_]*)$/u)) && cls) {
            bindings.push({ name: m[1], offset: at + 5, kind: 'attribute', scope: null, cls });
          }
        }
      }
    }
  }
  return { code, text, bindings, spans, globals, placed, lineAt };
}

// In "import tools.leds", clicking "tools" means module tools, and clicking "leds" means tools.leds
function addSpans(spans, module, at, line) {
  let offset = 0;
  for (const part of module.split('.')) {
    if (part) spans.push({ start: at + offset, end: at + offset + part.length, module: module.slice(0, offset + part.length), line });
    offset += part.length + 1;
  }
}

function located(file, binding) {
  if (binding.kind === 'import') {
    return { module: binding.module, name: binding.imported, line: file.lineAt(binding.offset) };
  }
  const line = file.lineAt(binding.offset);
  const lineStart = file.code.lastIndexOf('\n', binding.offset - 1) + 1;
  const lineEnd = file.code.indexOf('\n', binding.offset);
  return {
    line, column: binding.offset - lineStart + 1, length: binding.name.length,
    text: file.code.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim(), name: binding.name,
  };
}

// The latest binding at or before the offset, or failing that the first
function pick(list, offset, latest) {
  if (!list.length) return null;
  if (!latest) return list[0];
  const before = list.filter(b => b.offset <= offset);
  return before.at(-1) ?? list[0];
}

function resolve(file, name, offset) {
  const here = file.placed.findLast(p => p.start <= offset) ?? { stack: [] };
  const stack = here.stack;
  const isGlobal = f => file.globals.some(g => g.scope === f && g.name === name);
  const named = file.bindings.filter(b => b.name === name && b.kind !== 'attribute');
  // innermost first: functions (skipping classes around them, as Python does), the class body if we're
  // directly in it, then the module
  const scopes = [...stack].reverse();
  for (let i = 0; i < scopes.length; i++) {
    const s = scopes[i];
    if (s.kind === 'class' && i > 0) continue;
    if (s.kind === 'def' && isGlobal(s)) break;
    const found = pick(named.filter(b => b.scope === s), offset, true);
    if (found) return found;
  }
  return pick(named.filter(b => b.scope === null), offset, !stack.some(s => s.kind === 'def'));
}

export function findDefinition(code, offset) {
  const target = nameAt(code, offset);
  if (!target) return null;
  const file = read(code);
  const span = file.spans.find(s => s.start <= target.start && target.start < s.end);
  if (span) return { module: span.module, name: null, line: span.line };
  const own = file.bindings.find(b => b.offset === target.start && b.kind !== 'attribute');
  if (own && !target.qualifier) return located(file, own);

  if (target.qualifier) {
    const chain = target.qualifier.split('.');
    if (target.qualifier === 'self') {
      const here = file.placed.findLast(p => p.start <= target.start);
      const fn = here && [...here.stack].reverse().find(s => s.kind === 'def');
      const cls = fn?.cls;
      const attr = file.bindings.find(b => b.kind === 'attribute' && b.cls === cls && b.name === target.name);
      const method = file.bindings.find(b => b.kind === 'def' && cls && b.scope === cls && b.name === target.name);
      if (cls && (method || attr)) return located(file, method ?? attr);
    } else {
      const first = resolve(file, chain[0], target.start);
      if (first?.kind === 'import' && first.imported === null) {
        return { module: [first.module, ...chain.slice(1)].join('.'), name: target.name, line: file.lineAt(first.offset) };
      }
    }
    return { attribute: target.name, of: target.qualifier };
  }

  const found = resolve(file, target.name, target.start);
  if (found) return located(file, found);
  if (BUILTINS.has(target.name) && target.name !== 'self') return { builtin: target.name };
  return null;
}

export function findInModule(code, name) {
  const file = read(code);
  const top = file.bindings.filter(b => b.scope === null && b.kind !== 'attribute' && b.name === name);
  const best = top.find(b => b.kind === 'def' || b.kind === 'class') ?? top[0];
  return best ? located(file, best) : null;
}

export function modulePaths(module, fromPath = '/main.py') {
  const dots = module.match(/^\.*/)[0].length;
  const rest = module.slice(dots).replace(/\./g, '/');
  if (dots) {
    const dir = fromPath.split('/').slice(0, -dots).join('/');
    return rest ? [`${dir}/${rest}.py`, `${dir}/${rest}/__init__.py`] : [`${dir}/__init__.py`];
  }
  return ['', '/lib'].flatMap(root => [`${root}/${rest}.py`, `${root}/${rest}/__init__.py`]);
}
