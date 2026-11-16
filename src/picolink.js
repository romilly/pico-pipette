// PicoLink: run MicroPython code on a Pico over Web Serial using the raw REPL.
// No DOM code here, so it can be tested in Node with a fake port.

const RAW_BANNER = 'raw REPL; CTRL-B to exit\r\n>';
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

  async close() {
    await this.reader.cancel().catch(() => {});
    await this.pumping;
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close();
  }
}
