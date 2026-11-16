// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PicoLink } from '../src/picolink.js';

// A fake port that behaves like MicroPython's REPL. `script(code)` decides the result:
// { stdout, stderr } to finish, or { stdout, forever: true } to keep running until Ctrl-C.
function fakePico(script) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  let controller, mode = 'friendly';
  const send = text => controller.enqueue(enc.encode(text));
  const events = [];
  return {
    events,
    async open() {},
    async close() {},
    readable: new ReadableStream({ start(c) { controller = c; } }),
    writable: new WritableStream({
      write(chunk) {
        const text = dec.decode(chunk);
        if (text.includes('\x03')) {
          if (mode === 'running') {
            send('\x04Traceback (most recent call last):\r\nKeyboardInterrupt: \r\n\x04>');
            mode = 'raw';
          } else send('\r\n>>> ');
        } else if (text === '\x01') {
          mode = 'raw';
          send('\r\nraw REPL; CTRL-B to exit\r\n>');
        } else if (text === '\x02') {
          mode = 'friendly';
          send('\r\nMicroPython\r\n>>> ');
        } else if (mode === 'raw' && text === '\x04') {
          events.push('soft reset');
          send('\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>');
        } else if (mode === 'raw' && text.endsWith('\x04')) {
          events.push('run');
          const result = script(text.slice(0, -1));
          send('OK' + (result.stdout ?? ''));
          if (result.forever) mode = 'running';
          else send('\x04' + (result.stderr ?? '') + '\x04>');
        }
      },
    }),
  };
}

async function connect(script) {
  const link = new PicoLink(fakePico(script));
  await link.open();
  return link;
}

test('onData sees everything the Pico sends, as it arrives', async () => {
  const link = new PicoLink(fakePico(() => ({ stdout: 'hello\r\n' })));
  let received = '';
  link.onData = text => { received += text; };
  await link.open();
  await link.run('print("hello")');
  assert.match(received, /raw REPL; CTRL-B to exit/);
  assert.match(received, /soft reboot/);
  assert.match(received, /OKhello/);
  await link.close();
});

test('run soft-resets the Pico first, so variables from earlier runs are gone', async () => {
  const link = await connect(() => ({ stdout: 'hi\r\n' }));
  await link.run('print("hi")');
  assert.deepEqual(link.port.events, ['soft reset', 'run']);
  await link.close();
});

test('run can skip the soft reset, to look at what the last program left behind', async () => {
  const link = await connect(() => ({ stdout: '' }));
  await link.run('print(globals())', { reset: false });
  assert.deepEqual(link.port.events, ['run']);
  await link.close();
});

test('run returns what the program printed', async () => {
  const link = await connect(code => ({ stdout: `ran ${code}\r\n` }));
  const result = await link.run('print(1)');
  assert.deepEqual(result, { stdout: 'ran print(1)\r\n', stderr: '' });
  await link.close();
});

test('run returns the traceback when the program fails', async () => {
  const link = await connect(() => ({ stderr: 'NameError: name \'x\' isn\'t defined\r\n' }));
  const result = await link.run('print(x)');
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /NameError/);
  await link.close();
});

test('output streams while running, and interrupt stops the program', async () => {
  const link = await connect(() => ({ stdout: 'blink 0\r\n', forever: true }));
  const seen = [];
  const running = link.run('while True: pass', { onOutput: o => seen.push(o.stdout) });
  await link.waitFor(b => b.includes('blink 0'));
  await link.interrupt();
  const result = await running;
  assert.ok(seen.includes('blink 0\r\n'), 'output arrived before the program finished');
  assert.match(result.stderr, /KeyboardInterrupt/);
  await link.close();
});
