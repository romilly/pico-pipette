// A second adapter for the "run code on a board" port: MicroPython compiled to WebAssembly,
// running in the same process. Used by the tests, and later for a "no Pico" mode.
//
// The port, which PicoLink (Web Serial) also implements:
//   run(code, { onOutput, reset = true }) -> Promise<{ stdout, stderr }>
//   interrupt() -> Promise
//
// Pass in loadMicroPython from @micropython/micropython-webassembly-pyscript
// (in Node, import the package; in a browser, import its micropython.mjs by URL).

const SOFT_RESET = `for _k in [k for k in globals() if k != '__name__']:
    del globals()[_k]`;

export async function createMicroPythonLink(loadMicroPython, options = {}) {
  let out = '';
  const mp = await loadMicroPython({ ...options, stdout: line => { out += line + '\n'; } });
  return {
    mp,
    async run(code, { onOutput = () => {}, reset = true } = {}) {
      if (reset) mp.runPython(SOFT_RESET);
      out = '';
      let stderr = '';
      try {
        mp.runPython(code);
      } catch (e) {
        stderr = e.message;
      }
      const result = { stdout: out, stderr };
      onOutput(result);
      return result;
    },
    async interrupt() { /* code runs to completion synchronously, so there is nothing to stop */ },
  };
}
