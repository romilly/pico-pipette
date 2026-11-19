// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../src/connection.js';
import { RASPBERRY_PI_VID } from '../src/picolink.js';

// A fake navigator.serial with one Pico already allowed; it can announce that a port was unplugged.
function fakeSerial() {
  const serial = new EventTarget();
  const port = { getInfo: () => ({ usbVendorId: RASPBERRY_PI_VID }) };
  serial.port = port;
  serial.getPorts = async () => [port];
  serial.requestPort = async () => port;
  serial.unplug = (p = port) => { const e = new Event('disconnect'); Object.defineProperty(e, 'target', { value: p }); serial.dispatchEvent(e); };
  return serial;
}

// A fake link that records what is done to it. With program: true, a program is running until interrupted.
function fakeLink(port, { program = false, failOpen = false } = {}) {
  let finish;
  const link = {
    port, events: [],
    running: program ? new Promise((resolve) => { finish = resolve; }) : null,
    async open() { if (failOpen) throw new Error('port busy'); link.events.push('open'); },
    async interrupt() { link.events.push('interrupt'); if (finish) { finish(); link.running = null; } },
    async close() { link.events.push('close'); },
  };
  return link;
}

function connection(options = {}) {
  const serial = fakeSerial();
  const links = [];
  const made = new Connection(serial, { makeLink: (port) => { const l = fakeLink(port, options); links.push(l); return l; } });
  const states = [];
  made.onChange((state) => states.push(state));
  return { serial, made, links, states };
}

test('starts disconnected', () => {
  const { made } = connection();
  assert.equal(made.state, 'disconnected');
  assert.equal(made.link, null);
});

test('connect opens a link and reports connecting, then connected', async () => {
  const { made, links, states } = connection();
  const link = await made.connect();
  assert.equal(link, links[0]);
  assert.deepEqual(link.events, ['open']);
  assert.equal(made.state, 'connected');
  assert.deepEqual(states, ['connecting', 'connected']);
});

test('connecting again while connected reuses the link', async () => {
  const { made, links } = connection();
  await made.connect();
  await Promise.all([made.connect(), made.connect()]);
  assert.equal(links.length, 1);
});

test('two connects at once open one link', async () => {
  const { made, links } = connection();
  const [a, b] = await Promise.all([made.connect(), made.connect()]);
  assert.equal(a, b);
  assert.equal(links.length, 1);
});

test('a failed connect leaves it disconnected and passes the error on', async () => {
  const { made, states } = connection({ failOpen: true });
  await assert.rejects(made.connect(), /port busy/);
  assert.equal(made.state, 'disconnected');
  assert.deepEqual(states, ['connecting', 'disconnected']);
});

test('disconnect closes the link, releasing the port', async () => {
  const { made, links, states } = connection();
  await made.connect();
  await made.disconnect();
  assert.deepEqual(links[0].events, ['open', 'close']);
  assert.equal(made.state, 'disconnected');
  assert.equal(made.link, null);
  assert.deepEqual(states, ['connecting', 'connected', 'disconnected']);
});

test('disconnect stops a running program before closing', async () => {
  const { made, links } = connection({ program: true });
  await made.connect();
  await made.disconnect();
  assert.deepEqual(links[0].events, ['open', 'interrupt', 'close']);
});

test('toggle connects when disconnected and disconnects when connected', async () => {
  const { made } = connection();
  await made.toggle();
  assert.equal(made.state, 'connected');
  await made.toggle();
  assert.equal(made.state, 'disconnected');
});

test('unplugging the board makes it disconnected', async () => {
  const { serial, made, states } = connection();
  await made.connect();
  serial.unplug();
  assert.equal(made.state, 'disconnected');
  assert.equal(made.link, null);
  assert.equal(states.at(-1), 'disconnected');
});

test('unplugging some other device changes nothing', async () => {
  const { serial, made } = connection();
  await made.connect();
  serial.unplug({ getInfo: () => ({}) });
  assert.equal(made.state, 'connected');
});

test('disconnecting when not connected does nothing', async () => {
  const { made, states } = connection();
  await made.disconnect();
  assert.deepEqual(states, []);
});

test('connected is false as soon as a disconnect begins, so a stopped program does no more work', async () => {
  const { made, links } = connection({ program: true });
  await made.connect();
  let seenWhileStopping;
  links[0].running.then(() => { seenWhileStopping = made.connected; });
  await made.disconnect();
  assert.equal(seenWhileStopping, false);
});
