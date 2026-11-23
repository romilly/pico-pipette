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
//
// Go to definition: Ctrl-click (Cmd-click on a Mac) or F12 on a name selects where it's defined in this file,
// and resting the pointer on a name says where that is. For a name from another file the editor calls
//   editor.openModule = async ({ module, name, line }) => message?   // e.g. open it in another tab
// and shows the message it returns, if any, by the name.
//   editor.goTo({ line, column, length })         // select that text and scroll it into view
//   editor.pointAt(offset)                        // { x, y }: where a character is on screen

import { errorLine, lineRange } from './traceback.js';
import { highlight } from './highlight.js';
import { findDefinition } from './definitions.js';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const CLICK = MAC ? 'Cmd-click' : 'Ctrl-click';

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
.pipette-hint { position: absolute; z-index: 2; pointer-events: none; max-width: 30rem; white-space: pre-wrap;
  font: 0.85rem/1.3 system-ui, sans-serif; background: #333; color: #fff; padding: 0.3rem 0.5rem; border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25); }
.pipette-hint code { font-family: ui-monospace, monospace; color: #ffd27a; }
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
  const hintBox = make('div', 'pipette-hint');
  hintBox.hidden = true;
  hintBox.setAttribute('role', 'status');
  for (const node of [gutter, colour]) node.setAttribute('aria-hidden', 'true');
  const code = make('div', 'pipette-code');
  code.append(band, colour, textarea, hintBox);
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

  // --- go to definition
  const metrics = () => {
    const style = getComputedStyle(textarea);
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${style.fontSize} ${style.fontFamily}`;
    return {
      charWidth: measure.measureText('M').width, lineHeight: parseFloat(style.lineHeight),
      left: parseFloat(style.paddingLeft), top: parseFloat(style.paddingTop),
    };
  };

  // Where a character is on screen (its middle), and which character is at a point (null if none is)
  function pointAt(offset) {
    const m = metrics();
    const before = textarea.value.slice(0, offset).split('\n');
    const box = textarea.getBoundingClientRect();
    return {
      x: box.left + m.left + (before.at(-1).length + 0.5) * m.charWidth - textarea.scrollLeft,
      y: box.top + m.top + (before.length - 0.5) * m.lineHeight - textarea.scrollTop,
    };
  }

  function offsetAt(x, y) {
    const m = metrics();
    const box = textarea.getBoundingClientRect();
    const line = Math.floor((y - box.top - m.top + textarea.scrollTop) / m.lineHeight);
    const column = Math.floor((x - box.left - m.left + textarea.scrollLeft) / m.charWidth);
    const lines = textarea.value.split('\n');
    if (line < 0 || line >= lines.length || column < 0 || column >= lines[line].length) return null;
    return lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + column;
  }

  function goTo({ line, column = 1, length = 0 }) {
    const range = lineRange(textarea.value, line);
    if (!range) return;
    const start = Math.min(range[0] + column - 1, range[1]);
    hideHint();
    textarea.focus();
    textarea.setSelectionRange(start, start + length);
    const m = metrics();
    const top = (line - 1) * m.lineHeight;
    if (top < textarea.scrollTop || top + m.lineHeight > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    }
    align();
  }

  // A small note by the character at offset (parts in backticks look like code)
  function showHint(message, offset) {
    hintBox.replaceChildren(...message.split(/`([^`]*)`/).map((part, i) => {
      if (i % 2 === 0) return part;
      const c = make('code');
      c.textContent = part;
      return c;
    }));
    const m = metrics();
    const p = pointAt(offset);
    const box = code.getBoundingClientRect();
    hintBox.style.left = `${Math.max(0, p.x - box.left - m.charWidth / 2)}px`;
    hintBox.hidden = false;
    // above the line, clear of the pointer; below it if there's no room above
    const above = p.y - box.top - m.lineHeight * 0.6 - hintBox.offsetHeight;
    hintBox.style.top = `${above >= 0 ? above : p.y - box.top + m.lineHeight * 0.6}px`;
  }

  function hideHint() { hintBox.hidden = true; }

  function describe(found, offset) {
    const here = textarea.value.slice(0, offset).split('\n').length;
    if (found?.text) return found.line === here ? null : `\`${found.name}\`: defined on line ${found.line}: \`${found.text}\``;
    if (found?.module) {
      const what = found.name ? `\`${found.name}\` comes from \`${found.module}\`` : `\`${found.module}\` is a module`;
      return `${what}, in another file`;
    }
    return null;
  }

  async function definitionAt(offset) {
    if (offset === null) return;
    const found = findDefinition(textarea.value, offset);
    if (found?.text) { goTo(found); return; }
    let message;
    if (found?.module && api.openModule) message = await api.openModule({ module: found.module, name: found.name, line: found.line });
    else if (found?.module) message = describe(found, offset);
    else if (found?.builtin) message = `\`${found.builtin}\` is built into MicroPython`;
    else if (found?.attribute) message = `Can't tell where \`${found.of}.${found.attribute}\` is defined: it depends on what \`${found.of}\` holds when the program runs`;
    else message = 'No definition found in this file';
    if (message) showHint(message, offset);
  }

  textarea.addEventListener('mousedown', (e) => {
    hideHint();
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    textarea.focus();
    definitionAt(offsetAt(e.clientX, e.clientY));
  });

  // Resting the pointer on a name says where it's defined
  let resting = null, hinted = null;
  textarea.addEventListener('mousemove', (e) => {
    const offset = offsetAt(e.clientX, e.clientY);
    const word = offset === null ? null : wordAt(offset);
    if (word === hinted && word !== null) return;
    clearTimeout(resting);
    if (hinted !== null) { hideHint(); hinted = null; }
    if (word === null) return;
    resting = setTimeout(() => {
      const message = describe(findDefinition(textarea.value, offset), offset);
      if (!message) return;
      hinted = word;
      showHint(`${message}\n${CLICK} to go there`, offset);
    }, 500);
  });
  const leave = () => { clearTimeout(resting); hinted = null; hideHint(); };
  textarea.addEventListener('mouseleave', leave);

  // The start of the word under offset, so moving within a word keeps its hint
  function wordAt(offset) {
    const v = textarea.value;
    if (!/[\p{L}\p{N}_]/u.test(v[offset] ?? '')) return null;
    let start = offset;
    while (start > 0 && /[\p{L}\p{N}_]/u.test(v[start - 1])) start--;
    return start;
  }

  textarea.addEventListener('input', () => { leave(); clearError(); });
  textarea.addEventListener('scroll', () => { leave(); align(); });
  // Tab inserts four spaces rather than leaving the editor, and counts as an edit like typing
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'F12' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      definitionAt(textarea.selectionStart);
      return;
    }
    if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) leave();   // holding Ctrl to click keeps the hint
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    textarea.setRangeText('    ', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // The line numbers are exactly as tall as the textarea, which scrolls and can be resized
  new ResizeObserver(() => { gutter.style.height = `${textarea.offsetHeight}px`; align(); }).observe(textarea);
  draw();

  const api = {
    element, where, textarea,
    get value() { return textarea.value; },
    set value(text) { textarea.value = text; clearError(); },
    markError, markLine, clearError, selectLine, goTo, pointAt, showHint, hideHint,
    openModule: null,
    refresh: draw,   // after changing textarea.value directly
  };
  return api;
}
