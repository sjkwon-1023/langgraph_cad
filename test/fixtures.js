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

/** START -> generator -> router -> { generator, END } */
export const reflectionLoop = {
  graphName: 'reflection_graph',
  stateFields: 'draft: str',
  nodes: [
    node('rs', 'start', 'START'),
    node('rg', 'agent', 'Generator'),
    node('rc', 'conditional_edge', 'Evaluate Draft'),
    node('re', 'end', 'END'),
  ],
  edges: [
    edge('rs', 'rg'),
    edge('rg', 'rc'),
    edge('rc', 'rg', { branchKey: 'revise' }),
    edge('rc', 're', { branchKey: 'accepted' }),
  ],
};

export const minimal = {
  graphName: 'my_graph',
  stateFields: 'messages: list',
  nodes: [node('s', 'start', 'START'), node('a', 'agent', 'Agent'), node('e', 'end', 'END')],
  edges: [edge('s', 'a'), edge('a', 'e')],
};
