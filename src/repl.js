// An interactive REPL on the board, through the same run() port as everything else.
// Code is compiled in MicroPython's 'single' mode, as its own REPL does: expressions show
// their value, and variables are shared with the program that last ran.

import { tokenize } from './highlight.js';

// Run what was typed; returns { stdout, stderr } like run(). Never soft-resets the board.
export async function evaluate(link, source, { onOutput } = {}) {
  const code = `exec(compile(${JSON.stringify(source)}, '<repl>', 'single'))`;
  const { stdout, stderr } = await link.run(code, { reset: false, onOutput });
  return { stdout, stderr: cleanTraceback(stderr) };
}

// Drop the frame for the exec(...) wrapper, so the traceback reads like the MicroPython REPL's
function cleanTraceback(stderr) {
  if (!stderr.includes('"<repl>"')) return stderr;
  return stderr
    .replace(/^ {2}File "<stdin>", line 1, in <module>\r?\n/m, '')
    .replace(/"<repl>"/g, '"<stdin>"');
}

// Does the input need more lines before it can run? (Enter then adds a line instead of running.)
export function needsMore(source) {
  const tokens = tokenize(source);
  const last = tokens.at(-1);
  if (last?.type === 'string' && /^[a-zA-Z]*("""|''')/.test(last.text) && !/("""|''')$/.test(last.text.slice(3))) return true;
  let depth = 0;
  for (const { type, text } of tokens) {
    if (type !== 'plain') continue;
    for (const c of text) depth += '([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0;
  }
  if (depth > 0) return true;
  // A block (a line ending in a colon) continues until a blank line
  const code = tokens.filter(t => t.type !== 'comment').map(t => t.type === 'string' ? '""' : t.text).join('');
  const startsBlock = code.split('\n').some(line => line.trimEnd().endsWith(':'));
  return startsBlock && !/\n[ \t]*$/.test(source);
}

// Earlier entries, for the up and down arrow keys
export class History {
  constructor() { this.entries = []; this.position = 0; this.draft = ''; }

  add(entry) {
    if (entry.trim() && entry !== this.entries.at(-1)) this.entries.push(entry);
    this.position = this.entries.length;
  }

  // The entry before the one shown; `current` is what's being typed, kept to come back to
  back(current = '') {
    if (this.position === this.entries.length) this.draft = current;
    this.position = Math.max(0, this.position - 1);
    return this.entries[this.position] ?? current;
  }

  forward() {
    this.position = Math.min(this.entries.length, this.position + 1);
    return this.position === this.entries.length ? this.draft : this.entries[this.position];
  }
}
