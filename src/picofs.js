// Files on the Pico: each operation is a small MicroPython snippet run through PicoLink.run().
// Snippets work inside functions so they leave nothing behind in the learner's globals.
// File contents travel as hex, so any character (or binary data) survives the trip.

const CHUNK = 1024;   // bytes written to the Pico per run

const q = text => JSON.stringify(text);   // a JSON string is also a valid Python string literal

const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Run a snippet without a soft reset; turn a Python error into a JavaScript one.
async function exec(link, code) {
  const { stdout, stderr } = await link.run(code, { reset: false });
  if (stderr) throw new Error(stderr.trim().split('\n').at(-1).trim());
  return stdout;
}

export function joinPath(dir, name) {
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

// [{name, isDir, size}], folders first, then files, each sorted by name
export async function listDir(link, path = '/') {
  const stdout = await exec(link, `import os, json
def _ls(p):
    out = []
    for e in os.ilistdir(p):
        isdir = e[1] == 0x4000
        size = 0 if isdir else (e[3] if len(e) > 3 else os.stat(p.rstrip('/') + '/' + e[0])[6])
        out.append([e[0], isdir, size])
    print(json.dumps(out))
_ls(${q(path)})
del _ls`);
  return JSON.parse(stdout.trim())
    .map(([name, isDir, size]) => ({ name, isDir, size }))
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
}

export async function readFile(link, path) {
  return new TextDecoder().decode(await readBytes(link, path));
}

export async function readBytes(link, path) {
  const stdout = await exec(link, `import binascii
def _read(p):
    with open(p, 'rb') as f:
        while True:
            b = f.read(512)
            if not b:
                break
            print(binascii.hexlify(b).decode())
_read(${q(path)})
del _read`);
  return fromHex(stdout.replace(/\s+/g, ''));
}

// content is text or a Uint8Array of bytes.
// Writes to a temporary file first and renames it at the end,
// so an interrupted save doesn't leave a half-written main.py.
export async function writeFile(link, path, content, { onProgress = () => {} } = {}) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const temp = path + '.part';
  const count = Math.max(1, Math.ceil(bytes.length / CHUNK));
  for (let i = 0; i < count; i++) {
    const chunk = toHex(bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
    let code = `import binascii
def _write():
    with open(${q(temp)}, ${q(i === 0 ? 'wb' : 'ab')}) as f:
        f.write(binascii.unhexlify(${q(chunk)}))
_write()
del _write`;
    if (i === count - 1) code += `
import os
def _finish(t, p):
    try:
        os.remove(p)
    except OSError:
        pass
    os.rename(t, p)
_finish(${q(temp)}, ${q(path)})
del _finish`;
    await exec(link, code);
    onProgress((i + 1) / count);
  }
}

// Deletes a file, or a folder if it is empty
export async function remove(link, path) {
  await exec(link, `import os
def _rm(p):
    if os.stat(p)[0] & 0x4000:
        os.rmdir(p)
    else:
        os.remove(p)
_rm(${q(path)})
del _rm`);
}

export async function makeDir(link, path) {
  await exec(link, `import os\nos.mkdir(${q(path)})`);
}

// Creates every folder in the path that doesn't exist yet
export async function makeDirs(link, path) {
  await exec(link, `import os
def _mkdirs(p):
    sofar = ''
    for part in p.strip('/').split('/'):
        sofar += '/' + part
        try:
            os.stat(sofar)
        except OSError:
            os.mkdir(sofar)
_mkdirs(${q(path)})
del _mkdirs`);
}
