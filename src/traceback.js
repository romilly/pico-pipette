// Helpers for turning a MicroPython traceback into a place in the learner's code.

// Line number of the innermost traceback entry in the learner's own code ("<stdin>"), or null.
export function errorLine(stderr) {
  const matches = [...stderr.matchAll(/File "<stdin>", line (\d+)/g)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}

// Where the error actually happened: { file, line } for the innermost traceback entry in any file
// ("<stdin>" for the learner's program, or a module such as "/lib/helpers.py"), or null.
export function innermostFrame(stderr) {
  const m = [...stderr.matchAll(/File "([^"]+)", line (\d+)/g)].at(-1);
  return m ? { file: m[1], line: Number(m[2]) } : null;
}

// [start, end] character offsets of line n (counting from 1), or null if there is no such line.
export function lineRange(text, n) {
  const lines = text.split('\n');
  if (n < 1 || n > lines.length) return null;
  const start = lines.slice(0, n - 1).reduce((sum, line) => sum + line.length + 1, 0);
  return [start, start + lines[n - 1].length];
}
