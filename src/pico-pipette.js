// <pico-pipette>: a code editor with Connect, Run and Stop buttons and the program's output, as one HTML element.
//
//   <script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pico-pipette.js"></script>
//   <pico-pipette rows="10">
//     print("Hello from the Pico")
//   </pico-pipette>
//
// The code inside the element is its starting code (common indentation removed; write < as &lt; and & as &amp;).
//
//   el.value                   get or set the code
//   el.run()                   run it (connecting first if need be); resolves to { stdout, stderr }
//   el.stop()                  interrupt a running program
//   el.connection              its Connection (see connection.js). Elements on one page can share a Pico:
//                              other.connection = el.connection, set before other is added to the page.
//   'done' event               after each run; event.detail is { stdout, stderr }
//   'connection' event         when the connection changes; event.detail.state is 'connected', 'connecting' or 'disconnected'
//
// A DOM component (like editor.js). It adds its own styles to the page once; its classes start pipette-.
import { createEditor } from './editor.js';
import { Connection } from './connection.js';

const STYLES = `
pico-pipette { display: block; }
.pipette-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
.pipette-status { color: #666; }
.pipette-output { background: #f4f4f4; padding: 0.75rem; min-height: 2rem; white-space: pre-wrap; margin: 0.5rem 0; }
.pipette-error { color: #b3261e; margin: 0.5rem 0; }
.pipette-error:empty { display: none; }
`;

const STATUS = { connected: 'Connected', connecting: 'Connecting…', disconnected: '' };

// Added first in <head>, so a page's own rules win where they differ.
function addStyles() {
  if (document.querySelector('style[data-pipette-element]')) return;
  const style = document.createElement('style');
  style.dataset.pipetteElement = '';
  style.textContent = STYLES;
  document.head.prepend(style);
}

// Code as written inside the element: drop blank lines at either end and the indentation all lines share.
export function dedent(text) {
  if (!text.trim()) return '';
  const lines = text.replace(/^\s*\n/, '').trimEnd().split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n') + '\n';
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(name, text) {
  const b = make('button', null, text);
  b.name = name;
  b.type = 'button';
  return b;
}

export class PicoPipette extends HTMLElement {
  connectedCallback() {
    if (this.editor) return;   // built already: the element was moved
    addStyles();
    this.connection ??= new Connection(globalThis.navigator?.serial);
    this.editor = createEditor({ value: dedent(this.textContent), rows: Number(this.getAttribute('rows')) || 12 });
    this.buttons = { connect: button('connect', 'Connect'), run: button('run', 'Run'), stop: button('stop', 'Stop') };
    this.status = make('span', 'pipette-status');
    this.output = make('pre', 'pipette-output');
    this.error = make('p', 'pipette-error');
    const bar = make('div', 'pipette-bar');
    bar.append(...Object.values(this.buttons), this.status);
    this.replaceChildren(this.editor.element, this.editor.where, bar, this.output, this.error);

    this.buttons.connect.addEventListener('click', () => this.toggle());
    this.buttons.run.addEventListener('click', () => this.run());
    this.buttons.stop.addEventListener('click', () => this.stop());
    this.connection.onChange((state) => {
      this.showState(state);
      this.dispatchEvent(new CustomEvent('connection', { bubbles: true, detail: { state } }));
    });
    this.running = false;
    this.showState(this.connection.state);
    this.showRunning();
  }

  get value() { return this.editor ? this.editor.value : dedent(this.textContent); }
  set value(code) {
    if (this.editor) this.editor.value = code;
    else this.textContent = code;
  }

  async toggle() {
    try {
      await this.connection.toggle();
    } catch (e) {
      this.status.textContent = `Could not connect: ${e.message}`;
    }
  }

  async run() {
    if (this.running) return undefined;
    this.running = true;
    this.showRunning();
    this.output.textContent = '';
    this.error.textContent = '';
    this.editor.clearError();
    try {
      const link = await this.connection.connect();
      const result = await link.run(this.editor.value, {
        onOutput: ({ stdout }) => { this.output.textContent = stdout; },
      });
      this.output.textContent = result.stdout;
      // markError shows "Line n: ..." under the editor; errors with no line in the program go here
      if (result.stderr && !this.editor.markError(result.stderr)) {
        this.error.textContent = result.stderr.trim().split('\n').at(-1);
      }
      this.dispatchEvent(new CustomEvent('done', { bubbles: true, detail: result }));
      return result;
    } catch (e) {
      this.error.textContent = e.message;   // e.g. no Pico was chosen
      return undefined;
    } finally {
      this.running = false;
      this.showRunning();
    }
  }

  stop() {
    return this.connection.link?.interrupt();
  }

  showState(state) {
    this.buttons.connect.textContent = state === 'connected' ? 'Disconnect' : 'Connect';
    this.buttons.connect.disabled = state === 'connecting';
    this.status.textContent = STATUS[state];
  }

  showRunning() {
    this.buttons.run.disabled = this.running;
    this.buttons.stop.disabled = !this.running;
  }
}

if (globalThis.customElements && !customElements.get('pico-pipette')) customElements.define('pico-pipette', PicoPipette);
