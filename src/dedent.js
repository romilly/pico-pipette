// Code as written inside an HTML element: drop blank lines at either end and the indentation all lines share.
// No DOM code here.
export function dedent(text) {
  if (!text.trim()) return '';
  const lines = text.replace(/^\s*\n/, '').trimEnd().split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n') + '\n';
}
