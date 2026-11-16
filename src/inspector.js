// Show the global variables a program left behind on the Pico.

// MicroPython run on the Pico: prints the learner's globals as JSON {name: [type, repr]}.
export const INSPECT_CODE = `import json
def _inspect():
    out = {}
    for name, value in globals().items():
        kind = type(value).__name__
        if name.startswith('_') or kind in ('module', 'function', 'type', 'closure', 'bound_method'):
            continue
        text = repr(value)
        out[name] = [kind, text if len(text) <= 80 else text[:77] + '...']
    print(json.dumps(out))
_inspect()
del _inspect`;

// [{name, type, value}] sorted by name
export function parseVariables(stdout) {
  let data;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`Unexpected output from the variable inspector: ${JSON.stringify(stdout)}`);
  }
  return Object.entries(data)
    .map(([name, [type, value]]) => ({ name, type, value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// No soft reset: we want to see what the last program left behind.
export async function inspectGlobals(link) {
  const { stdout, stderr } = await link.run(INSPECT_CODE, { reset: false });
  if (stderr) throw new Error(stderr.trim());
  return parseVariables(stdout);
}
