import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePython } from '../src/generator/generatePython.js';
import { tokenizePython } from '../src/highlight/python.js';
import { reactLoop } from './fixtures.js';

const typeOf = (code, needle) =>
  tokenizePython(code).find((token) => token.value === needle)?.type;

test('tokens cover the input exactly', () => {
  const code = generatePython(reactLoop);
  assert.equal(tokenizePython(code).map((token) => token.value).join(''), code);
});

test('common Python constructs are classified', () => {
  const code = 'def f(x):\n    # note\n    return "s"  # tail\n';
  assert.equal(typeOf(code, 'def'), 'keyword');
  assert.equal(typeOf(code, 'f'), 'entity');
  assert.equal(typeOf(code, 'return'), 'keyword');
  assert.equal(typeOf(code, '"s"'), 'string');
  assert.equal(typeOf(code, '# note'), 'comment');
  assert.equal(typeOf(code, '1'), undefined);
  assert.equal(typeOf('x = 42\n', '42'), 'number');
  assert.equal(typeOf('class State(TypedDict):\n', 'State'), 'entity');
  assert.equal(typeOf('a: list\n', 'list'), 'builtin');
});

test('a docstring is one token, not a run of quotes', () => {
  const tokens = tokenizePython('"""line one\nline two"""\n');
  assert.equal(tokens[0].type, 'string');
  assert.equal(tokens[0].value, '"""line one\nline two"""');
});

test('an unterminated string does not swallow the rest of the file', () => {
  const code = 'x = "oops\ny = 1\n';
  assert.equal(tokenizePython(code).map((token) => token.value).join(''), code);
  assert.equal(typeOf(code, '1'), 'number');
});

test('empty input yields no tokens', () => {
  assert.deepEqual(tokenizePython(''), []);
  assert.deepEqual(tokenizePython(null), []);
});
