// The code editor: a transparent textarea over a coloured copy of the same text, with line numbers,
// and after a failed run, a band behind the line the traceback points to.
// A DOM component: create as many as you like; it adds its own styles to the page once.
//
//   const editor = createEditor({ value, rows, id });
//   page.append(editor.element, editor.where);   // where: "Line 3: NameError: ..." after a failed run
//   editor.value                                  // get or set the code
//   editor.markError(stderr)                      // mark the traceback's line; returns its number or null
//   editor.markLine(n, message)                   // mark line n with a message (e.g. an error in this file
//                                                 // found in another file's traceback); returns n or null
//   editor.textarea                               // for your own listeners: 'input' fires on every edit

import { errorLine, lineRange } from './traceback.js';
import { highlight } from './highlight.js';

const STYLES = `
.pipette-editor { display: flex; align-items: flex-start; border: 1px solid #ccc; }
.pipette-editor textarea, .pipette-gutter, .pipette-colour {
  font: 0.95rem/1.4 ui-monospace, monospace; padding: 0.5rem; margin: 0; border: 0; border-radius: 0; tab-size: 4; }
.pipette-code { position: relative; flex: 1; min-width: 0; display: flex; background: #fff; }
.pipette-editor textarea { flex: 1; position: relative; z-index: 1; resize: vertical; white-space: pre; overflow: auto;
  outline: none; background: transparent; color: transparent; caret-color: #111; box-sizing: border-box; width: 100%; }
.pipette-editor textarea::selection { background: rgba(255, 120, 100, 0.3); }
.pipette-colour { position: absolute; inset: 0; white-space: pre; overflow: hidden; pointer-events: none;
  color: #222; background: none; }
.pipette-error-band { position: absolute; left: 0; right: 0; background: #fde2df; display: none; pointer-events: none; }
.pipette-gutter { box-sizing: border-box; background: #f4f4f4; color: #999; text-align: right; min-width: 2ch;
  overflow: hidden; user-select: none; }
.pipette-gutter .error { color: #fff; background: #b3261e; display: inline-block; padding: 0 0.25rem; margin-right: -0.25rem; }
.pipette-where:empty { display: none; }
.pipette-where { margin: 0.5rem 0; color: #b3261e; }
.pipette-where a { color: inherit; font-weight: bold; }
.tok-keyword, .tok-constant { color: #8a2be2; }
.tok-builtin { color: #0b6e99; }
.tok-name { color: #1a4fd6; }
.tok-string { color: #2e7d32; }
.tok-number { color: #b35900; }
.tok-comment { color: #8a8a8a; }
.tok-decorator { color: #a0522d; }
`;

// Added first in <head>, so a page's own rules win where they differ.
function addStyles() {
  if (document.querySelector('style[data-pipette-editor]')) return;
  const style = document.createElement('style');
  style.dataset.pipetteEditor = '';
  style.textContent = STYLES;
  document.head.prepend(style);
}

function make(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createEditor({ value = '', rows = 14, id } = {}) {
  addStyles();
  const textarea = make('textarea');
  Object.assign(textarea, { rows, spellcheck: false, value });
  textarea.setAttribute('wrap', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('aria-label', 'Code');
  if (id) textarea.id = id;
  const gutter = make('pre', 'pipette-gutter');
  const colour = make('pre', 'pipette-colour');
  const band = make('div', 'pipette-error-band');
  for (const node of [gutter, colour]) node.setAttribute('aria-hidden', 'true');
  const code = make('div', 'pipette-code');
  code.append(band, colour, textarea);
  const element = make('div', 'pipette-editor');
  element.append(gutter, code);
  const where = make('p', 'pipette-where');
  let badLine = null;

  // Keep the line numbers, colours and error band lined up with the text as it scrolls
  function align() {
    gutter.scrollTop = colour.scrollTop = textarea.scrollTop;
    colour.scrollLeft = textarea.scrollLeft;
    band.style.display = badLine ? 'block' : 'none';
    if (badLine) {
      const style = getComputedStyle(textarea);
      const lineHeight = parseFloat(style.lineHeight);
      band.style.height = `${lineHeight}px`;
      band.style.top = `${parseFloat(style.paddingTop) + (badLine - 1) * lineHeight - textarea.scrollTop}px`;
    }
  }

  function draw() {
    const count = textarea.value.split('\n').length;
    gutter.innerHTML = Array.from({ length: count }, (_, i) =>
      i + 1 === badLine ? `<span class="error">${i + 1}</span>` : `${i + 1}`).join('\n');
    colour.innerHTML = highlight(textarea.value) + '\n';
    align();
  }

  function selectLine(n) {
    const range = lineRange(textarea.value, n);
    if (!range) return;
    textarea.focus();
    textarea.setSelectionRange(...range);
  }

  function clearError() {
    badLine = null;
    where.replaceChildren();
    draw();
  }

  function markError(stderr) {
    return markLine(errorLine(stderr ?? ''), (stderr ?? '').trim().split('\n').at(-1).trim());
  }

  function markLine(n, message) {
    badLine = n && lineRange(textarea.value, n) ? n : null;
    where.replaceChildren();
    if (badLine) {
      const link = make('a');
      link.href = '#';
      link.textContent = `Line ${badLine}`;
      const line = badLine;
      link.addEventListener('click', (e) => { e.preventDefault(); selectLine(line); });
      where.append(link, `: ${message}`);
      selectLine(badLine);
    }
    draw();
    return badLine;
  }

  textarea.addEventListener('input', clearError);
  textarea.addEventListener('scroll', align);
  // Tab inserts four spaces rather than leaving the editor, and counts as an edit like typing
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    textarea.setRangeText('    ', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // The line numbers are exactly as tall as the textarea, which scrolls and can be resized
  new ResizeObserver(() => { gutter.style.height = `${textarea.offsetHeight}px`; align(); }).observe(textarea);
  draw();

  return {
    element, where, textarea,
    get value() { return textarea.value; },
    set value(text) { textarea.value = text; clearError(); },
    markError, markLine, clearError, selectLine,
    refresh: draw,   // after changing textarea.value directly
  };
}
