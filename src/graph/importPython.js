import { DEFAULT_GRAPH_NAME, DEFAULT_STATE_FIELDS } from '../generator/generatePython.js';
import { layoutGraph } from './layout.js';
import { STATE_VERSION } from './serialization.js';

const MARKER_RE = /\b(add_conditional_edges|set_entry_point|set_finish_point|add_sequence|add_node|add_edge|StateGraph)\s*\(/g;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function maskPython(source) {
  const characters = source.split('');
  const masked = source.split('');
  let quote = null;
  let triple = false;
  let escaped = false;
  let comment = false;

  const hide = (index) => {
    if (characters[index] !== '\n') masked[index] = ' ';
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (comment) {
      hide(index);
      if (character === '\n') comment = false;
      continue;
    }
    if (quote) {
      hide(index);
      if (triple) {
        if (source.slice(index, index + 3) === quote.repeat(3)) {
          hide(index + 1);
          hide(index + 2);
          index += 2;
          quote = null;
          triple = false;
        }
      } else if (escaped) {
        escaped = false;
      } else if (character === '\n') {
        quote = null;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '#') {
      comment = true;
      hide(index);
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      triple = source.slice(index, index + 3) === character.repeat(3);
      hide(index);
      if (triple) {
        hide(index + 1);
        hide(index + 2);
        index += 2;
      }
    }
  }
  return masked.join('');
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function lineOfOffset(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return low + 1;
}

function indentation(text) {
  const prefix = text.match(/^[ \t]*/)?.[0] || '';
  return [...prefix].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0);
}

function enclosingBlockReason(lines, maskedLines, lineIndex) {
  const currentIndent = indentation(lines[lineIndex]);
  if (currentIndent === 0) return null;
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const text = maskedLines[index];
    if (!text.trim() || indentation(text) >= currentIndent || !text.trimEnd().endsWith(':')) continue;
    const header = text.trim();
    if (/^(async\s+)?(for|while)\b/.test(header)) return 'Calls created inside loops cannot be imported.';
    if (/^(if|elif|else\b|match\b|case\b)/.test(header)) return 'Calls created inside conditional blocks cannot be imported.';
    if (/^(async\s+)?def\b/.test(header)) return 'Graph construction calls inside function blocks cannot be imported.';
    return 'Dynamic graph construction calls inside indented blocks cannot be imported.';
  }
  return 'Dynamic graph construction calls inside indented blocks cannot be imported.';
}

function findCallEnd(masked, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === '(') depth += 1;
    else if (masked[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(raw) {
  const masked = maskPython(raw);
  const parts = [];
  let start = 0;
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let index = 0; index < masked.length; index += 1) {
    const character = masked[index];
    if ('([{'.includes(character)) stack.push(character);
    else if (')]}'.includes(character)) {
      if (stack.at(-1) === pairs[character]) stack.pop();
    } else if (character === ',' && stack.length === 0) {
      parts.push(raw.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitKeyValue(raw) {
  const masked = maskPython(raw);
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let index = 0; index < masked.length; index += 1) {
    const character = masked[index];
    if ('([{'.includes(character)) stack.push(character);
    else if (')]}'.includes(character)) {
      if (stack.at(-1) === pairs[character]) stack.pop();
    } else if (character === ':' && stack.length === 0) {
      return [raw.slice(0, index).trim(), raw.slice(index + 1).trim()];
    }
  }
  return null;
}

function parseStringLiteral(raw) {
  const text = raw.trim();
  if (/^"(?:\\.|[^"\\\n])*"$/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  const match = /^'((?:\\.|[^'\\\n])*)'$/.exec(text);
  if (!match) return null;
  return match[1].replace(/\\([\\"'nrt])/g, (_, escaped) => ({
    '\\': '\\',
    '"': '"',
    "'": "'",
    n: '\n',
    r: '\r',
    t: '\t',
  })[escaped]);
}

function parseEndpoint(raw, { allowEnd = true } = {}) {
  const text = raw.trim();
  const literal = parseStringLiteral(text);
  if (literal !== null) return { kind: 'node', name: literal };
  if (text === 'START') return { kind: 'start', name: 'START' };
  if (allowEnd && text === 'END') return { kind: 'end', name: 'END' };
  return null;
}

function parsePathMap(raw) {
  const text = raw.trim();
  if (!text.startsWith('{')) return { error: 'path_map must be a literal dictionary.' };
  if (!text.endsWith('}')) return { error: 'The path_map dictionary is not closed.' };
  const content = text.slice(1, -1).trim();
  if (!content) return { entries: [] };
  const entries = [];
  for (const part of splitTopLevel(content)) {
    const pair = splitKeyValue(part);
    if (!pair) return { error: 'A path_map entry must contain a key and target.' };
    const key = parseStringLiteral(pair[0]);
    const target = parseEndpoint(pair[1], { allowEnd: true });
    if (key === null) return { error: 'The path_map branch key must be a string literal.' };
    if (!target || target.kind === 'start') {
      return { error: 'The path_map branch target is a variable or uses an unsupported form.' };
    }
    entries.push({ key, target });
  }
  return { entries };
}

function readStateFields(lines, maskedLines) {
  for (let index = 0; index < maskedLines.length; index += 1) {
    const header = /^(\s*)class\s+State\s*\(\s*TypedDict\s*\)\s*:/.exec(maskedLines[index]);
    if (!header) continue;
    const classIndent = indentation(header[1]);
    let childIndent = null;
    const fields = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const maskedLine = maskedLines[cursor];
      if (!maskedLine.trim()) continue;
      const indent = indentation(maskedLine);
      if (indent <= classIndent) break;
      if (childIndent === null) childIndent = indent;
      if (indent !== childIndent) continue;
      const field = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/.exec(lines[cursor]);
      if (field) fields.push(`${field[1]}: ${field[2]}`);
    }
    return fields.join('\n');
  }
  return DEFAULT_STATE_FIELDS;
}

function collectCandidates(source, masked) {
  const lines = source.split('\n');
  const maskedLines = masked.split('\n');
  const starts = lineStarts(source);
  const candidates = [];
  MARKER_RE.lastIndex = 0;
  let match = MARKER_RE.exec(masked);
  while (match) {
    const line = lineOfOffset(starts, match.index);
    const openIndex = masked.indexOf('(', match.index);
    const endIndex = findCallEnd(masked, openIndex);
    candidates.push({
      marker: match[1],
      line,
      markerColumn: match.index - starts[line - 1],
      text: lines[line - 1] ?? '',
      maskedLine: maskedLines[line - 1] ?? '',
      blockReason: enclosingBlockReason(lines, maskedLines, line - 1),
      start: match.index,
      openIndex,
      endIndex,
      raw: endIndex < 0 ? source.slice(match.index) : source.slice(match.index, endIndex + 1),
      args: endIndex < 0 ? null : source.slice(openIndex + 1, endIndex),
    });
    match = MARKER_RE.exec(masked);
  }
  return { candidates, lines, maskedLines };
}

function receiverBefore(candidate) {
  if (candidate.marker === 'StateGraph') return null;
  const prefix = candidate.maskedLine.slice(0, candidate.markerColumn);
  return /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/.exec(prefix)?.[1] || null;
}

function graphAssignment(candidate) {
  const prefix = candidate.maskedLine.slice(0, candidate.markerColumn);
  return /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/.exec(prefix)?.[1] || null;
}

function nodeType(name) {
  return /tools?/i.test(name) ? 'tool' : 'agent';
}

/** Convert supported static LangGraph calls into a persisted v1 graph. */
export function importPython(source) {
  const text = String(source ?? '');
  const masked = maskPython(text);
  const { candidates, lines, maskedLines } = collectCandidates(text, masked);
  const unreadableByLine = new Map();
  const calls = [];
  let graphName = null;

  const reject = (candidate, reason) => {
    if (!unreadableByLine.has(candidate.line)) {
      unreadableByLine.set(candidate.line, { line: candidate.line, text: candidate.text, reason });
    }
  };

  candidates.forEach((candidate) => {
    if (candidate.blockReason) {
      reject(candidate, candidate.blockReason);
      return;
    }
    if (candidate.endIndex < 0) {
      reject(candidate, candidate.marker === 'add_conditional_edges'
        ? 'The conditional edge call or path_map dictionary is not closed.'
        : 'The graph construction call is not closed.');
      return;
    }
    if (candidate.marker === 'StateGraph') {
      const assigned = graphAssignment(candidate);
      if (!assigned) {
        reject(candidate, 'StateGraph must be assigned to a simple graph variable to be imported.');
      } else if (graphName && graphName !== assigned) {
        reject(candidate, 'Multiple StateGraph variables cannot be imported.');
      } else {
        graphName = assigned;
      }
      return;
    }
    calls.push({ ...candidate, receiver: receiverBefore(candidate) });
  });

  const explicitNames = new Set();
  const parsedCalls = [];
  calls.forEach((candidate) => {
    if (!candidate.receiver || !graphName || candidate.receiver !== graphName) {
      reject(candidate, 'Calls on another graph variable or an unknown receiver cannot be imported.');
      return;
    }
    const args = splitTopLevel(candidate.args);
    if (candidate.marker === 'add_sequence') {
      reject(candidate, 'add_sequence is not supported. Expand it into add_node and add_edge calls.');
      return;
    }
    if (candidate.marker === 'add_node') {
      let name = null;
      if (args.length === 1 && IDENTIFIER_RE.test(args[0])) name = args[0];
      else if (args.length === 2 && IDENTIFIER_RE.test(args[1])) name = parseStringLiteral(args[0]);
      if (name === null) {
        reject(candidate, 'The node name is a variable or uses an unsupported form.');
        return;
      }
      explicitNames.add(name);
      parsedCalls.push({ kind: 'node', name, line: candidate.line });
      return;
    }
    if (candidate.marker === 'add_edge') {
      const sourceEndpoint = args.length === 2 ? parseEndpoint(args[0]) : null;
      const targetEndpoint = args.length === 2 ? parseEndpoint(args[1]) : null;
      if (!sourceEndpoint || !targetEndpoint || sourceEndpoint.kind === 'end' || targetEndpoint.kind === 'start') {
        reject(candidate, 'The edge endpoint is a variable or uses an unsupported form.');
        return;
      }
      parsedCalls.push({ kind: 'edge', source: sourceEndpoint, target: targetEndpoint, line: candidate.line });
      return;
    }
    if (candidate.marker === 'set_entry_point' || candidate.marker === 'set_finish_point') {
      const endpoint = args.length === 1 ? parseEndpoint(args[0]) : null;
      if (!endpoint || endpoint.kind !== 'node') {
        reject(candidate, 'The entry or finish point name is a variable and cannot be imported.');
        return;
      }
      parsedCalls.push(candidate.marker === 'set_entry_point'
        ? { kind: 'edge', source: { kind: 'start', name: 'START' }, target: endpoint, line: candidate.line }
        : { kind: 'edge', source: endpoint, target: { kind: 'end', name: 'END' }, line: candidate.line });
      return;
    }
    if (candidate.marker === 'add_conditional_edges') {
      if (args.length < 3) {
        reject(candidate, 'There is no path_map, so the branch targets are unknown.');
        return;
      }
      const sourceEndpoint = parseEndpoint(args[0], { allowEnd: false });
      const router = args[1]?.trim();
      const pathMap = args.length === 3 ? parsePathMap(args[2]) : null;
      if (!sourceEndpoint) {
        reject(candidate, 'The conditional edge source is a variable and cannot be imported.');
      } else if (!IDENTIFIER_RE.test(router || '')) {
        reject(candidate, 'The router function is not a simple identifier and cannot be imported.');
      } else if (args.length !== 3) {
        reject(candidate, 'The conditional edge has unsupported extra arguments and cannot be imported.');
      } else if (pathMap.error) {
        reject(candidate, pathMap.error);
      } else {
        parsedCalls.push({
          kind: 'conditional',
          source: sourceEndpoint,
          router,
          branches: pathMap.entries,
          line: candidate.line,
        });
      }
    }
  });

  const nodes = [];
  const edges = [];
  const implied = [];
  const byKey = new Map();
  const counters = new Map();
  const nextId = (type) => {
    const prefix = type === 'conditional_edge' ? 'conditional' : type;
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
  const ensureNode = (endpoint, { router = false } = {}) => {
    const key = router ? `router:${endpoint.name}` : `${endpoint.kind}:${endpoint.name}`;
    if (byKey.has(key)) return byKey.get(key);
    let type = endpoint.kind;
    if (router) type = 'conditional_edge';
    else if (endpoint.kind === 'node') type = nodeType(endpoint.name);
    const id = nextId(type);
    const data = { type, label: endpoint.name };
    if (type === 'conditional_edge' || (
      (type === 'agent' || type === 'tool') && /^[A-Za-z0-9_]+$/.test(endpoint.name)
    )) {
      data.codeIdentifier = endpoint.name;
    }
    nodes.push({ id, data });
    byKey.set(key, id);
    return id;
  };
  const addEdge = (sourceId, targetId, data) => {
    const edge = { id: `edge-${edges.length + 1}`, source: sourceId, target: targetId };
    if (data) edge.data = data;
    edges.push(edge);
  };
  const noteImplied = (endpoint) => {
    if (endpoint.kind !== 'node' || explicitNames.has(endpoint.name) || implied.includes(endpoint.name)) return;
    implied.push(endpoint.name);
  };

  parsedCalls.filter((call) => call.kind === 'node').forEach((call) => {
    ensureNode({ kind: 'node', name: call.name });
  });
  const conditionalEdgeKeys = new Set();
  parsedCalls.filter((call) => call.kind !== 'node').forEach((call) => {
    if (call.kind === 'edge') {
      noteImplied(call.source);
      noteImplied(call.target);
      addEdge(ensureNode(call.source), ensureNode(call.target));
      return;
    }
    noteImplied(call.source);
    const sourceId = ensureNode(call.source);
    const routerId = ensureNode({ kind: 'router', name: call.router }, { router: true });
    const sourceKey = `${sourceId}->${routerId}`;
    if (!conditionalEdgeKeys.has(sourceKey)) {
      conditionalEdgeKeys.add(sourceKey);
      addEdge(sourceId, routerId);
    }
    call.branches.forEach(({ key, target }) => {
      noteImplied(target);
      const targetId = ensureNode(target);
      const branchKey = `${routerId}->${targetId}:${key}`;
      if (!conditionalEdgeKeys.has(branchKey)) {
        conditionalEdgeKeys.add(branchKey);
        addEdge(routerId, targetId, { branchKey: key });
      }
    });
  });

  const unreadable = [...unreadableByLine.values()].sort((left, right) => left.line - right.line);
  const summary = {
    nodes: nodes.length,
    edges: edges.length,
    routers: nodes.filter((node) => node.data.type === 'conditional_edge').length,
  };
  if (nodes.length === 0 && edges.length === 0) {
    return { state: null, unreadable, implied, summary };
  }
  const laidOut = layoutGraph({ nodes, edges });
  return {
    state: {
      v: STATE_VERSION,
      graphName: graphName || DEFAULT_GRAPH_NAME,
      stateFields: readStateFields(lines, maskedLines),
      nodes: laidOut.nodes,
      edges: laidOut.edges,
    },
    unreadable,
    implied,
    summary,
  };
}
