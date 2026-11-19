// PicoLink: run MicroPython code on a Pico over Web Serial using the raw REPL.
// No DOM code here, so it can be tested in Node with a fake port.

const RAW_BANNER = 'raw REPL; CTRL-B to exit\r\n>';
export const RASPBERRY_PI_VID = 0x2E8A;

// Pick a serial port: reuse the one Pico this site is already allowed to use, if exactly one is
// plugged in; otherwise (or with ask: true) show the browser's chooser, listing only Raspberry Pi boards.
// serial is navigator.serial.
export async function choosePort(serial, { ask = false } = {}) {
  if (!ask) {
    const picos = (await serial.getPorts()).filter(p => p.getInfo().usbVendorId === RASPBERRY_PI_VID);
    if (picos.length === 1) return picos[0];
  }
  return serial.requestPort({ filters: [{ usbVendorId: RASPBERRY_PI_VID }] });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Raw REPL reply to a run is: OK <stdout> \x04 <stderr> \x04 >
export function parseReply(buffer) {
  if (!buffer.startsWith('OK')) return { stdout: '', stderr: '', done: false };
  const [stdout = '', stderr = ''] = buffer.slice(2).split('\x04');
  const done = /\x04[\s\S]*\x04>/.test(buffer);
  return { stdout, stderr, done };
}

export class PicoLink {
  constructor(port) {
    this.port = port;
    this.buffer = '';
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.onData = () => {};   // optional: called with everything received, e.g. for a log
    this.codeSent = Promise.resolve();   // settles once the running program's code has reached the Pico
    this.running = null;                 // while a program runs: a promise that settles when it ends
  }

  async open() {
    await this.port.open({ baudRate: 115200 });   // ignored for USB CDC, but required
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.pumping = this.pump();
  }

  async pump() {
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        const text = this.decoder.decode(value, { stream: true });
        this.buffer += text;
        this.onData(text);
      }
    } catch (e) { /* reader cancelled on close */ }
  }

  async write(text) { await this.writer.write(this.encoder.encode(text)); }

  async waitFor(predicate, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = predicate(this.buffer);
      if (result) return result;
      await sleep(20);
    }
    throw new Error(`Timed out waiting for the Pico. Received: ${JSON.stringify(this.buffer)}`);
  }

  // Run code to completion (or until interrupt()); onOutput gets {stdout, stderr} as it arrives.
  // By default the Pico is soft-reset first, so nothing is left over from earlier runs.
  async run(code, { onOutput = () => {}, reset = true } = {}) {
    let sent;
    this.codeSent = new Promise(resolve => { sent = resolve; });
    const running = this.execute(code, onOutput, reset, () => sent());
    this.running = running.then(() => {}, () => {});
    try {
      return await running;
    } finally {
      sent();
      this.running = null;
    }
  }

  async execute(code, onOutput, reset, sent) {
    await this.write('\r\x03\x03');               // stop anything already running
    await sleep(200);
    this.buffer = '';
    await this.write('\x01');                     // enter raw REPL
    await this.waitFor(b => b.includes(RAW_BANNER));
    if (reset) {
      this.buffer = '';
      await this.write('\x04');                   // Ctrl-D with no code: soft reset
      await this.waitFor(b => {
        const i = b.indexOf('soft reboot');
        return i >= 0 && b.indexOf(RAW_BANNER, i) >= 0;
      });
    }
    this.buffer = '';
    await this.write(code + '\x04');              // send code, Ctrl-D runs it
    sent();
    let seen = '';
    const reply = await this.waitFor(b => {
      if (b !== seen) { seen = b; onOutput(parseReply(b)); }
      const r = parseReply(b);
      return r.done && r;
    }, Infinity);
    await this.write('\x02');                     // back to the normal REPL
    return { stdout: reply.stdout, stderr: reply.stderr };
  }

  async interrupt() { await this.write('\x03'); }  // raises KeyboardInterrupt on the Pico

  // Send a line of typing to the running program, for input() to read; MicroPython echoes it back.
  // Like ViperIDE, this doesn't check that the program is waiting: unread typing waits on the Pico.
  // Control characters are left out (tabs become spaces), so typing can't stop or end the program.
  async sendInput(line) {
    await this.codeSent;   // typing before the program starts would reach MicroPython's normal REPL instead
    await this.write(line.replace(/\t/g, ' ').replace(/[\x00-\x1f\x7f]/g, '') + '\r');
  }

  async close() {
    await this.reader.cancel().catch(() => {});
    await this.pumping;
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close();
  }
}
