import { toToken } from '../src/graph/identifiers.js';
import { needsCodeIdentifier } from '../src/graph/nodeTypes.js';

let sequence = 0;

export function node(id, type, label = id, extra = {}) {
  const data = { type, label, ...extra };
  if (needsCodeIdentifier(type) && !data.codeIdentifier) data.codeIdentifier = toToken(label);
  return { id, position: { x: (sequence += 40), y: sequence }, data };
}

export function edge(source, target, data = {}) {
  return { id: `e-${source}-${target}-${(sequence += 1)}`, source, target, data };
}

/** START -> agent -> router -> { tool -> agent, END } */
export const reactLoop = {
  graphName: 'my_graph',
  stateFields: 'messages: list',
  nodes: [
    node('s', 'start', 'START'),
    node('a', 'agent', 'Agent'),
    node('t', 'tool', 'Tool'),
    node('c', 'conditional_edge', 'Should Continue'),
    node('e', 'end', 'END'),
  ],
  edges: [
    edge('s', 'a'),
    edge('a', 'c'),
    edge('c', 't', { branchKey: 'continue' }),
    edge('c', 'e', { branchKey: 'finish' }),
    edge('t', 'a'),
  ],
};

export const minimal = {
  graphName: 'my_graph',
  stateFields: 'messages: list',
  nodes: [node('s', 'start', 'START'), node('a', 'agent', 'Agent'), node('e', 'end', 'END')],
  edges: [edge('s', 'a'), edge('a', 'e')],
};
