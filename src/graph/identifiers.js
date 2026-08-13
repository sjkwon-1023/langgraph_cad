// Identifier helpers shared by the editor and the Python code generator.

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

// LangGraph refuses to register a node under either of these names.
export const RESERVED_NODE_NAMES = new Set(['__start__', '__end__']);

export const isPythonKeyword = (name) => PYTHON_KEYWORDS.has(name);

export const isValidPythonIdentifier = (name) =>
  typeof name === 'string'
  && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
  && !isPythonKeyword(name);

/** Collapse arbitrary text into a `[A-Za-z0-9_]+` token. Never returns ''. */
export function toToken(text, fallback = 'node') {
  const token = String(text ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '');
  return token || fallback;
}

/** `Conditional Edge` -> `conditional_edge`, `MyAgent` -> `my_agent`. */
export const toSnakeCase = (text, fallback = 'node') =>
  toToken(text, fallback)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/_{2,}/g, '_')
    .toLowerCase();

function makeUnique(candidate, taken) {
  if (!taken.has(candidate)) return candidate;
  let counter = 1;
  while (taken.has(`${candidate}_${counter}`)) counter += 1;
  return `${candidate}_${counter}`;
}

/**
 * The string a node is registered under via `add_node`.
 *
 * Only nodes that reach the generated code get one, so START/END are excluded
 * by the caller — a plain node *labelled* "END" is nothing special here.
 */
export function uniqueNodeName(label, existingNodes, excludeId = null) {
  const taken = new Set(
    existingNodes
      .filter((node) => node.id !== excludeId && node.data?.codeIdentifier)
      .map((node) => node.data.codeIdentifier),
  );
  return makeUnique(toToken(label), taken);
}

/** Allocate a valid, unique Python identifier and record it in `taken`. */
export function claimPythonIdentifier(base, taken, fallback = 'node') {
  let candidate = toToken(base, fallback);
  if (/^[0-9]/.test(candidate)) candidate = `_${candidate}`;
  if (isPythonKeyword(candidate)) candidate = `${candidate}_`;
  const unique = makeUnique(candidate, taken);
  taken.add(unique);
  return unique;
}

/** A Python string literal. JSON's escaping rules are a subset of Python's. */
export const pyStr = (text) => JSON.stringify(String(text ?? ''));

/** Text safe to drop inside a `"""..."""` docstring. */
export const pyDocText = (text) =>
  String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
