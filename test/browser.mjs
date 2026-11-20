// Shared by the tests that run in a real browser: serves the project folder over http and starts Chrome
// (via playwright-core). If Chrome can't be started, skip says why; set CHROME to its path if it isn't found.
//   const b = await startBrowser();   // b.browser, b.base (the server's URL), b.skip
//   await b.close();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };

export async function startBrowser() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'text/plain' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const result = { base: `http://127.0.0.1:${server.address().port}`, browser: null, skip: false };
  try {
    result.browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
  } catch {
    result.skip = 'Chrome could not be started (set CHROME to its path)';
  }
  result.close = async () => {
    await result.browser?.close();
    server.close();
  };
  return result;
}
