// A small Python syntax highlighter for the editor: no dependencies, line-independent,
// and forgiving of half-typed code (an unclosed string just runs to the end of its line).

const KEYWORDS = new Set(('and as assert async await break class continue def del elif else except finally for from ' +
  'global if import in is lambda nonlocal not or pass raise return try while with yield').split(' '));
const CONSTANTS = new Set(['True', 'False', 'None']);
const BUILTINS = new Set(('abs all any bin bool bytearray bytes callable chr dict dir divmod enumerate eval exec ' +
  'filter float format getattr globals hasattr hash hex id input int isinstance issubclass iter len list locals map ' +
  'max min next object oct open ord pow print property range repr reversed round set setattr slice sorted ' +
  'staticmethod str sum super tuple type zip self Exception KeyboardInterrupt OSError ValueError TypeError ' +
  'NameError IndexError KeyError ImportError RuntimeError StopIteration').split(' '));

// Tried in order at each position; the first match wins
const RULES = [
  ['comment', /#[^\r\n]*/y],
  ['string', /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?)/y],
  ['decorator', /@[\p{L}_][\p{L}\p{N}_.]*/uy],
  ['number', /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[jJ]?)/y],
  ['word', /[\p{L}_][\p{L}\p{N}_]*/uy],
];

// [{type, text}], where type is plain, keyword, builtin, constant, name, string, comment, number or decorator.
// Joining every token's text gives back the original code exactly.
export function tokenize(code) {
  const tokens = [];
  let i = 0, afterDefOrClass = false;
  const push = (type, text) => {
    const last = tokens.at(-1);
    if (type === 'plain' && last?.type === 'plain') last.text += text;
    else tokens.push({ type, text });
  };
  while (i < code.length) {
    let matched = false;
    for (const [rule, pattern] of RULES) {
      pattern.lastIndex = i;
      const m = pattern.exec(code);
      if (!m || !m[0]) continue;
      let type = rule;
      if (rule === 'word') {
        const word = m[0];
        type = afterDefOrClass ? 'name'
          : KEYWORDS.has(word) ? 'keyword'
          : CONSTANTS.has(word) ? 'constant'
          : BUILTINS.has(word) ? 'builtin' : 'plain';
        afterDefOrClass = word === 'def' || word === 'class';
      } else {
        afterDefOrClass = false;
      }
      push(type, m[0]);
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) {
      if (!/\s/.test(code[i])) afterDefOrClass = false;
      push('plain', code[i]);
      i++;
    }
  }
  return tokens;
}

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// HTML for the code, with coloured tokens in <span class="tok-TYPE"> elements
export function highlight(code) {
  return tokenize(code)
    .map(({ type, text }) => type === 'plain' ? escape(text) : `<span class="tok-${type}">${escape(text)}</span>`)
    .join('');
}
