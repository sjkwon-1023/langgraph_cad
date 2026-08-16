import assert from 'node:assert/strict';
import test from 'node:test';

import { validateGraph } from '../src/graph/validation.js';
import { edge, minimal, node, reactLoop } from './fixtures.js';

const ids = (result) => result.issues.map((issue) => issue.id);
const check = (graph) => validateGraph({ stateFields: 'messages: list', graphName: 'g', ...graph });

test('a well-formed graph reports nothing', () => {
  assert.deepEqual(ids(validateGraph(reactLoop)), []);
  assert.equal(validateGraph(minimal).hasErrors, false);
});

test('a missing or unconnected START is an error', () => {
  assert.ok(ids(check({ nodes: [node('a', 'agent', 'A')], edges: [] })).includes('no-start'));
  assert.ok(
    ids(check({ nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A')], edges: [] }))
      .includes('start-no-outgoing'),
  );
});

test('edges into START or out of END are errors', () => {
  const nodes = [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('e', 'end', 'END')];
  assert.ok(ids(check({ nodes, edges: [edge('s', 'a'), edge('a', 's')] })).includes('start-incoming'));
  assert.ok(ids(check({ nodes, edges: [edge('s', 'a'), edge('e', 'a')] })).includes('end-outgoing'));
});

test('a router missing a source or a branch is reported instead of silently dropped', () => {
  const base = [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('c', 'conditional_edge', 'R')];
  const noSource = check({ nodes: base, edges: [edge('s', 'a'), edge('c', 'a')] });
  assert.ok(ids(noSource).includes('conditional-no-source'));
  const noTarget = check({ nodes: base, edges: [edge('s', 'a'), edge('a', 'c')] });
  assert.ok(ids(noTarget).includes('conditional-no-target'));
});

test('chained routers are an error', () => {
  const result = check({
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('c1', 'conditional_edge', 'R1'),
      node('c2', 'conditional_edge', 'R2'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c1'), edge('c1', 'c2'), edge('c2', 'a')],
  });
  assert.ok(ids(result).includes('conditional-chain'));
  assert.equal(result.hasErrors, true);
});

test('duplicate branch keys are an error because Python would silently drop one', () => {
  const result = check({
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('b', 'agent', 'B'),
      node('t', 'tool', 'T'),
      node('c', 'conditional_edge', 'R'),
    ],
    edges: [
      edge('s', 'a'),
      edge('a', 'c'),
      edge('c', 'b', { branchKey: 'next' }),
      edge('c', 't', { branchKey: 'next' }),
    ],
  });
  assert.ok(ids(result).includes('duplicate-branch-key'));
});

test('an implicit loopback branch key is an error and flags the branch edge', () => {
  const nodes = [
    node('s', 'start', 'START'),
    node('a', 'agent', 'Writer'),
    node('c', 'conditional_edge', 'Review'),
    node('e', 'end', 'END'),
  ];
  const loopEdge = edge('c', 'a');
  const result = check({
    nodes,
    edges: [edge('s', 'a'), edge('a', 'c'), loopEdge, edge('c', 'e')],
  });

  assert.ok(ids(result).includes('missing-loop-branch-key'));
  assert.ok(result.flaggedEdgeIds.has(loopEdge.id));
  assert.equal(result.hasErrors, true);
});

test('loop-safety State annotations do not produce unknown-symbol warnings', () => {
  const result = check({
    ...minimal,
    stateFields: [
      'messages: Annotated[list[AnyMessage], add_messages]',
      'remaining_steps: RemainingSteps',
      'is_last_step: IsLastStep',
      'result: Overwrite',
    ].join('\n'),
  });
  assert.ok(!ids(result).includes('unknown-state-annotation-symbol'));
});

test('reserved LangGraph node names are rejected', () => {
  const bad = node('a', 'agent', 'A');
  bad.data.codeIdentifier = '__end__';
  assert.ok(ids(check({ nodes: [node('s', 'start', 'START'), bad], edges: [edge('s', 'a')] }))
    .includes('reserved-node-name'));
});

test('graph name and state fields are validated', () => {
  assert.ok(ids(check({ ...minimal, graphName: '1graph' })).includes('invalid-graph-name'));
  assert.ok(ids(check({ ...minimal, graphName: 'class' })).includes('invalid-graph-name'));
  assert.ok(ids(check({ ...minimal, stateFields: 'messages list' })).includes('invalid-state-field'));
});

test('unknown State annotation symbols produce an advisory import warning', () => {
  const result = check({ ...minimal, stateFields: 'messages: Annotated[list, Foo]' });
  const issue = result.warnings.find((entry) => entry.id === 'unknown-state-annotation-symbol');
  assert.equal(result.hasErrors, false);
  assert.equal(
    issue?.message,
    'State field "Foo" is not imported automatically — add its import to the top of the generated code.',
  );
  assert.ok(!result.warnings.some((entry) => entry.message.includes('Annotated')));
});

test('unreachable nodes, dead ends and orphans are warnings, not errors', () => {
  const result = check({
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('lost', 'agent', 'Lost'),
      node('alone', 'tool', 'Alone'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'a'), edge('a', 'e'), edge('lost', 'e')],
  });
  assert.equal(result.hasErrors, false);
  const warningIds = result.warnings.map((issue) => issue.id);
  assert.ok(warningIds.includes('unreachable'));
  assert.ok(warningIds.includes('orphan'));
  assert.ok(warningIds.includes('no-path-to-end'));
});

test('a graph with no END node only warns', () => {
  const result = check({
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A')],
    edges: [edge('s', 'a')],
  });
  assert.equal(result.hasErrors, false);
  assert.ok(result.warnings.some((issue) => issue.id === 'no-end'));
});

test('errors carry the node and edge ids to highlight', () => {
  const result = check({
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('c', 'conditional_edge', 'R')],
    edges: [edge('s', 'a'), edge('c', 'a')],
  });
  assert.ok(result.flaggedNodeIds.has('c'));
});

test('text nodes are never reported as unreachable', () => {
  const result = check({
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('m', 'text', 'memo')],
    edges: [edge('s', 'a')],
  });
  assert.ok(!result.issues.some((issue) => issue.nodeIds.includes('m')));
});
