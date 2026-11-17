// Read a demo file (YAML), check it against demo.schema.json, and report mistakes by line number.

import fs from 'node:fs';
import { parseDocument, LineCounter, isMap } from 'yaml';
import Ajv from 'ajv';

export const LIVE = 'https://romilly.github.io/pico-pipette/';
const DEFAULTS = { title: 'Pico Pipette demo', url: LIVE, pace: 1, viewport: { width: 1280, height: 900 } };

const schema = JSON.parse(fs.readFileSync(new URL('./demo.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: false }).compile(schema);

// { title, url, pace, viewport, steps: [{ action, value, line }] }, or throws an Error naming the line at fault.
// `name` is the file name, used in error messages.
export function loadDemo(text, name = 'demo file') {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  if (doc.errors.length) {
    const error = doc.errors[0];
    const line = error.linePos?.[0]?.line ?? lines.linePos(error.pos[0]).line;
    throw new Error(`${name} line ${line}: ${error.message.split('\n')[0]}`);
  }
  const data = doc.toJS() ?? {};
  const lineOf = node => (node?.range ? lines.linePos(node.range[0]).line : 1);

  if (!validate(data)) throw new Error(describe(validate.errors[0], doc, lineOf, name));

  const steps = doc.get('steps', true).items.map((item, i) => {
    const [action, value] = Object.entries(data.steps[i])[0];
    return { action, value, line: lineOf(item) };
  });
  const { title, url, pace, viewport } = { ...DEFAULTS, ...data };
  return { title, url, pace, viewport, steps };
}

// Turn the validator's first complaint into a sentence with a line number
function describe(error, doc, lineOf, name) {
  const path = error.instancePath.split('/').slice(1).map(p => (/^\d+$/.test(p) ? Number(p) : p));
  const node = doc.getIn(path, true) ?? doc.getIn(path.slice(0, -1), true);
  const inStep = path[0] === 'steps' && path.length === 2;
  const field = path.filter(p => typeof p === 'string' && p !== 'steps').join('.');
  const where = `${name} line ${lineOf(node)}:`;
  switch (error.keyword) {
    case 'additionalProperties': {
      const extra = error.params.additionalProperty;
      const key = isMap(node) ? node.items.find(pair => pair.key?.value === extra)?.key : null;
      const at = `${name} line ${lineOf(key ?? node)}:`;
      return inStep ? `${at} unknown action "${extra}"`
        : path.length === 0 ? `${at} unknown setting "${extra}"`
        : `${at} ${field} has nothing called "${extra}"`;
    }
    case 'maxProperties':
    case 'minProperties':
      return `${where} each step needs exactly one action`;
    case 'required':
      return path.length === 0 ? `${where} the file needs "${error.params.missingProperty}"`
        : `${where} ${field} needs "${error.params.missingProperty}"`;
    case 'type':
      if (error.params.type === 'null') {
        return `${where} ${field} takes no value: write just "${field}:"` + (field === 'run' ? ', or "run: { wait: false }"' : '');
      }
      return `${where} ${field || 'the file'} ${error.message}`;
    case 'enum':
      return `${where} ${field} must be one of: ${error.params.allowedValues.join(', ')}`;
    default:
      return `${where} ${field || 'the file'} ${error.message}`;
  }
}
