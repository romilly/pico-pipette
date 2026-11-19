// Connection: whether we're connected to a Pico, and connecting to it or letting it go.
// Pages show its state and offer a Connect/Disconnect toggle; disconnecting releases the USB port
// so other programs (Thonny, another tab) can use the board. No DOM code here.
import { PicoLink, choosePort } from './picolink.js';

const STOP_TIMEOUT_MS = 2000;   // how long disconnect waits for a running program to stop

export class Connection {
  // serial is navigator.serial; makeLink(port) makes the link (a PicoLink unless a test says otherwise).
  constructor(serial, { makeLink = (port) => new PicoLink(port) } = {}) {
    this.serial = serial;
    this.makeLink = makeLink;
    this.link = null;
    this.state = 'disconnected';   // 'disconnected', 'connecting' or 'connected'
    this.listeners = [];
    this.opening = null;
    serial?.addEventListener('disconnect', (event) => {
      if (this.link && event.target === this.link.port) { this.link = null; this.setState('disconnected'); }
    });
  }

  // listener(state) is called whenever the state changes.
  onChange(listener) { this.listeners.push(listener); }

  setState(state) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  get connected() { return this.link !== null; }   // false from the moment a disconnect begins

  // The link, connecting first if need be. ask: true shows the browser's chooser even if a Pico is already allowed.
  async connect({ ask = false } = {}) {
    if (this.link) return this.link;
    if (!this.opening) this.opening = this.open(ask).finally(() => { this.opening = null; });
    return this.opening;
  }

  async open(ask) {
    this.setState('connecting');
    try {
      const link = this.makeLink(await choosePort(this.serial, { ask }));
      await link.open();
      this.link = link;
      this.setState('connected');
      return link;
    } catch (e) {
      this.setState('disconnected');
      throw e;
    }
  }

  // Stops any running program, then closes the port so other programs can use the board.
  async disconnect() {
    const link = this.link;
    if (!link) return;
    this.link = null;
    try {
      if (link.running) {
        await link.interrupt();
        await Promise.race([link.running, new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS))]);
      }
      await link.close();
    } finally {
      this.setState('disconnected');
    }
  }

  async toggle(options) {
    return this.link ? this.disconnect() : this.connect(options);
  }
}
