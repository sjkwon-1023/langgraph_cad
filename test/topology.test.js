import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdjacency,
  hasDirectedCycle,
  isLoopbackBranch,
  reachableFrom,
} from '../src/graph/topology.js';
import { edge, node } from './fixtures.js';

test('reachability ignores text nodes, dangling edges, and supports reverse traversal', () => {
  const nodes = [
    node('s', 'start', 'START'),
    node('a', 'agent', 'A'),
    node('e', 'end', 'END'),
    node('memo', 'text', 'memo'),
  ];
  const edges = [edge('s', 'a'), edge('a', 'e'), edge('memo', 'a'), edge('a', 'missing')];

  assert.deepEqual([...reachableFrom(['s'], buildAdjacency({ nodes, edges }))], ['s', 'a', 'e']);
  assert.deepEqual(
    [...reachableFrom(['e'], buildAdjacency({ nodes, edges }, { reverse: true }))],
    ['e', 'a', 's'],
  );
});

test('loopback branches include indirect returns and exclude forward branches', () => {
  const nodes = [
    node('router', 'conditional_edge', 'Route'),
    node('loop', 'tool', 'Loop'),
    node('middle', 'agent', 'Middle'),
    node('forward', 'agent', 'Forward'),
  ];
  const edges = [
    edge('router', 'loop'),
    edge('loop', 'middle'),
    edge('middle', 'router'),
    edge('router', 'forward'),
  ];
  const adjacency = buildAdjacency({ nodes, edges });

  assert.equal(isLoopbackBranch('router', 'loop', adjacency), true);
  assert.equal(isLoopbackBranch('router', 'forward', adjacency), false);
});

test('cycle detection covers self-loops, indirect cycles, and acyclic graphs', () => {
  const nodes = [node('a', 'agent', 'A'), node('b', 'tool', 'B'), node('c', 'agent', 'C')];

  assert.equal(hasDirectedCycle(buildAdjacency({ nodes, edges: [edge('a', 'a')] })), true);
  assert.equal(
    hasDirectedCycle(buildAdjacency({ nodes, edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')] })),
    true,
  );
  assert.equal(
    hasDirectedCycle(buildAdjacency({ nodes, edges: [edge('a', 'b'), edge('b', 'c')] })),
    false,
  );
});
