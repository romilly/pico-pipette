// Carry out the steps of a demo file in a Pipette page, with Playwright.
// Each action in demo.schema.json has a function here (a test checks they match).

// Buttons a demo can click by name
export const BUTTONS = {
  connect: '#connect', run: '#run', stop: '#stop',
  open: '#open', 'save-local': '#save-local', 'save-pico': '#save-pico', 'save-main': '#save-main',
  'new-folder': '#new-folder', refresh: '#reload', install: '#install',
  send: '#send-input', 'clear-repl': '#repl-clear',
};

const SECTIONS = { editor: '.code', output: '#stdout', repl: '#repl', variables: '#variables' };
const LONG = { timeout: 120_000 };   // long enough to pick the Pico by hand on a first run, or a slow install

// Waiting for the page
const WAITS = {
  connected: page => page.waitForFunction(() => document.getElementById('status').textContent === 'Connected'
    && !document.getElementById('files').classList.contains('busy'), null, LONG),
  finished: page => page.waitForFunction(() => !document.getElementById('files').classList.contains('busy')
    && /^(Finished|Stopped|Something|Ready)/.test(document.getElementById('status').textContent), null, LONG),
  idle: page => page.waitForFunction(() => !document.getElementById('files').classList.contains('busy'), null, LONG),
};

// The actions, each called with (demo, value); `demo` holds the page and helpers at the chosen pace
export const ACTIONS = {
  caption: (demo, text) => demo.caption(text),
  pause: (demo, seconds) => demo.pause(seconds),
  click: (demo, target) => (typeof target === 'string'
    ? demo.clickOn(BUTTONS[target])
    : demo.clickOn(target.selector, { x: target.x ?? 0.5, y: target.y ?? 0.5 })),
  wait: (demo, what) => WAITS[what](demo.page),
  type: async (demo, code) => {
    await demo.clickOn('#editor', { x: 0.3, y: 0.15 });
    await demo.page.keyboard.press('ControlOrMeta+A');
    await demo.page.keyboard.press('Delete');
    await demo.typeText(code, 30);
  },
  edit: (demo, { find, replace, in: within = find }) => demo.edit(find, replace, within),
  run: async (demo, options) => {
    await demo.clickOn('#run');
    if (options?.wait !== false) await WAITS.finished(demo.page);
  },
  stop: async demo => {
    if (await demo.page.isEnabled('#stop')) await demo.clickOn('#stop');
    await WAITS.finished(demo.page);
  },
  repl: async (demo, text) => {
    const { page } = demo;
    await demo.clickOn('#repl-input', { x: 0.1 });
    const lines = text.replace(/\n+$/, '').split('\n');
    for (const [i, line] of lines.entries()) {
      if (i) await page.keyboard.press('Shift+Enter');   // a new line, without the REPL's auto-indent
      await demo.typeText(line, 60);
    }
    // Enter runs a single line; a block needs one or two more to finish it
    for (let i = 0; i < 3 && (await page.inputValue('#repl-input')) !== ''; i++) {
      await demo.pause(0.3);
      await page.keyboard.press('Enter');
    }
    await WAITS.idle(page);
  },
  input: async (demo, text) => {
    await demo.page.waitForSelector('#stdin', { state: 'visible', ...LONG });
    await demo.clickOn('#stdin', { x: 0.1 });
    await demo.typeText(text, 90);
    await demo.page.keyboard.press('Enter');
  },
  install: async (demo, name) => {
    await demo.clickOn('#package');
    await demo.page.keyboard.press('ControlOrMeta+A');
    await demo.typeText(name, 90);
    await demo.clickOn('#install');
    await WAITS.idle(demo.page);
  },
  'save-main': async demo => {
    await demo.clickOn('#save-main');
    await WAITS.idle(demo.page);
  },
  scroll: async (demo, where) => {
    await demo.page.evaluate(({ where, selector }) => {
      if (selector) document.querySelector(selector).scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: where === 'bottom' ? document.body.scrollHeight : 0, behavior: 'smooth' });
    }, { where, selector: SECTIONS[where] });
    await demo.pause(0.6);
  },
};

// Run the steps in order. A failing step is reported with its line in the demo file.
export async function runSteps(page, steps, { pace = 1, name = 'demo file', onStep = () => {} } = {}) {
  const demo = helpers(page, pace);
  await demo.showPointer();
  for (const step of steps) {
    onStep(step);
    try {
      await ACTIONS[step.action](demo, step.value);
    } catch (e) {
      throw new Error(`${name} line ${step.line} (${step.action}): ${e.message.split('\n')[0]}`);
    }
  }
}

// --- helpers that act like a person at the keyboard and mouse

function helpers(page, pace) {
  const demo = {
    page,
    pause: seconds => page.waitForTimeout(seconds * 1000 * pace),
    typeText: (text, msPerKey) => page.keyboard.type(text, { delay: msPerKey * pace }),

    async caption(text) {
      await page.evaluate(text => {
        let box = document.getElementById('demo-caption');
        if (!box) {
          box = document.createElement('div');
          box.id = 'demo-caption';
          Object.assign(box.style, {
            position: 'fixed', left: '50%', bottom: '1.5rem', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(20, 20, 20, 0.88)', color: '#fff', padding: '0.6rem 1.4rem', borderRadius: '10px',
            font: '600 1.3rem system-ui, sans-serif', maxWidth: '80%', textAlign: 'center', transition: 'opacity 0.3s',
          });
          document.body.append(box);
          document.body.style.paddingBottom = '6rem';   // so the caption never hides the bottom of the page
        }
        box.textContent = text;
        box.style.opacity = text ? 1 : 0;
      }, text);
    },

    // Playwright clicks without moving the real mouse pointer, so draw one that follows its mouse
    async showPointer() {
      await page.evaluate(() => {
        if (document.getElementById('demo-pointer')) return;
        const pointer = document.createElement('div');
        pointer.id = 'demo-pointer';
        pointer.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.5 16 L12 24 L15.5 22.5 L12 15 L19.5 15 Z"
          fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
        Object.assign(pointer.style, { position: 'fixed', left: '0', top: '0', zIndex: 2000, pointerEvents: 'none',
          transform: 'translate(-3px, -2px)', filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.35))' });
        document.body.append(pointer);
        document.addEventListener('mousemove', e => {
          pointer.style.left = e.clientX + 'px';
          pointer.style.top = e.clientY + 'px';
        }, true);
        document.addEventListener('mousedown', e => {
          const ripple = document.createElement('div');
          Object.assign(ripple.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px',
            width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255, 170, 0, 0.45)', zIndex: 1999,
            pointerEvents: 'none', transition: 'transform 0.45s ease-out, opacity 0.45s ease-out' });
          document.body.append(ripple);
          requestAnimationFrame(() => { ripple.style.transform = 'scale(1.8)'; ripple.style.opacity = '0'; });
          setTimeout(() => ripple.remove(), 500);
        }, true);
      });
      const { width, height } = page.viewportSize() ?? { width: 1280, height: 900 };
      await page.mouse.move(width / 2, height / 2);
    },

    // Glide the pointer to an element, then click it, like a person would
    async clickOn(selector, { x = 0.5, y = 0.5 } = {}) {
      const element = page.locator(selector);
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      if (!box) throw new Error(`can't see ${selector} on the page`);
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: Math.round(25 * pace) });
      await demo.pause(0.35);
      await page.mouse.down();
      await page.mouse.up();
    },

    // Point at `find` (the first one inside the first `within`) in the editor, select it, and type over it
    async edit(find, replace, within) {
      const spot = await page.evaluate(({ find, within }) => {
        const editor = document.getElementById('editor');
        const outer = editor.value.indexOf(within);
        if (outer < 0 || !within.includes(find)) return { missing: true };
        const start = outer + within.indexOf(find);
        // Where that text is on screen: monospace, so count lines and columns
        const before = editor.value.slice(0, start).split('\n');
        const style = getComputedStyle(editor);
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = `${style.fontSize} ${style.fontFamily}`;
        const charWidth = measure.measureText('M').width;
        const box = editor.getBoundingClientRect();
        return {
          start, end: start + find.length,
          x: box.left + parseFloat(style.paddingLeft) + (before.at(-1).length + find.length / 2) * charWidth - editor.scrollLeft,
          y: box.top + parseFloat(style.paddingTop) + (before.length - 0.5) * parseFloat(style.lineHeight) - editor.scrollTop,
        };
      }, { find, within });
      if (spot.missing) throw new Error(`"${find}"${within === find ? '' : ` in "${within}"`} isn't in the editor`);
      await page.mouse.move(spot.x, spot.y, { steps: Math.round(25 * pace) });
      await page.evaluate(({ start, end }) => {
        const editor = document.getElementById('editor');
        editor.focus();
        editor.setSelectionRange(start, end);
      }, spot);
      await demo.pause(0.6);
      await demo.typeText(replace, 90);
    },
  };
  return demo;
}
