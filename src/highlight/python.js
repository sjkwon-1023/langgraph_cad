// Minimal Python tokenizer. The panel only ever renders code this app just
// generated, so a full grammar (and the dependency that comes with it) would be
// far more machinery than the job needs.

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const BUILTINS = new Set([
  'bool', 'bytes', 'dict', 'float', 'frozenset', 'int', 'list', 'object',
  'set', 'str', 'tuple', 'Any', 'Annotated', 'Literal', 'Optional', 'Sequence',
  'TypedDict', 'Union',
]);

const SCANNER = new RegExp(
  [
    '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\')', // 1 triple-quoted string
    '(#[^\\n]*)', // 2 comment
    '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')', // 3 string
    '(\\b\\d+(?:\\.\\d+)?\\b)', // 4 number
    '([A-Za-z_][A-Za-z0-9_]*)', // 5 identifier
  ].join('|'),
  'g',
);

/** Split Python source into `{ type, value }` tokens covering the whole input. */
export function tokenizePython(code) {
  const source = String(code ?? '');
  const tokens = [];
  let lastIndex = 0;
  let previousWord = null;

  const pushPlain = (value) => {
    if (value) tokens.push({ type: 'plain', value });
  };

  SCANNER.lastIndex = 0;
  let match = SCANNER.exec(source);
  while (match !== null) {
    pushPlain(source.slice(lastIndex, match.index));
    const [value, triple, comment, string, number, word] = match;

    if (triple || string) tokens.push({ type: 'string', value });
    else if (comment) tokens.push({ type: 'comment', value });
    else if (number) tokens.push({ type: 'number', value });
    else if (word) {
      if (previousWord === 'def' || previousWord === 'class') tokens.push({ type: 'entity', value });
      else if (KEYWORDS.has(word)) tokens.push({ type: 'keyword', value });
      else if (BUILTINS.has(word)) tokens.push({ type: 'builtin', value });
      else tokens.push({ type: 'plain', value });
      previousWord = word;
    }

    lastIndex = match.index + value.length;
    match = SCANNER.exec(source);
  }
  pushPlain(source.slice(lastIndex));
  return tokens;
}

export const TOKEN_COLORS = {
  plain: '#e6e6e6',
  keyword: '#c792ea',
  builtin: '#82aaff',
  string: '#c3e88d',
  comment: '#7f8c98',
  number: '#f78c6c',
  entity: '#ffcb6b',
};
