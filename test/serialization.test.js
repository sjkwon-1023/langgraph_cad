import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATE_VERSION,
  createInitialState,
  decodeJson,
  decodeState,
  encodeJson,
  encodeState,
  toFlowEdge,
  toFlowNode,
  toPersisted,
} from '../src/graph/serialization.js';
import { minimal } from './fixtures.js';

// The shape older versions of the app wrote into the URL, junk fields included.
const LEGACY = {
  nodes: [
    {
      id: 'start-1',
      type: 'custom',
      position: { x: 100, y: 100 },
      data: { type: 'start', label: 'START', codeIdentifier: 'start' },
      zIndex: 10,
      width: 212,
      height: 39,
      selected: false,
    },
    {
      id: 'agent-1747965831009',
      type: 'custom',
      position: { x: 133, y: 192 },
      data: { type: 'agent', label: 'Agent', obj: 'agent_function', codeIdentifier: 'Agent' },
      zIndex: 10,
      width: 212,
      height: 56,
      selected: false,
      positionAbsolute: { x: 133, y: 192 },
      dragging: false,
    },
  ],
  edges: [
    {
      style: { stroke: '#555', strokeWidth: 1.5, strokeDasharray: 'none' },
      markerEnd: { type: 'arrowclosed', color: '#555', width: 15, height: 15 },
      source: 'start-1',
      sourceHandle: null,
      target: 'agent-1747965831009',
      targetHandle: null,
      type: 'customEdge',
      data: { controlPoint: { x: -94.5, y: 231 }, controlPointDragged: true },
      zIndex: 5,
      id: 'reactflow__edge-start-1-agent-1747965831009',
      selected: false,
    },
  ],
  entryPointCodeId: null,
  graphName: 'my_graph',
};

test('a round trip through the URL hash preserves the drawing', () => {
  const decoded = decodeState(encodeState(minimal));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.state.v, STATE_VERSION);
  assert.equal(decoded.state.nodes.length, 3);
  assert.deepEqual(
    decoded.state.nodes.map((node) => node.data.type),
    ['start', 'agent', 'end'],
  );
  assert.equal(decoded.state.edges.length, 2);
});

test('runtime-only fields never reach the persisted payload', () => {
  const persisted = toPersisted({
    graphName: 'g',
    stateFields: 'messages: list',
    nodes: [
      {
        id: 'a',
        type: 'custom',
        position: { x: 1.4, y: 2.6 },
        zIndex: 20,
        width: 212,
        height: 56,
        selected: true,
        dragging: true,
        positionAbsolute: { x: 1, y: 2 },
        data: { type: 'agent', label: 'A', codeIdentifier: 'A' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'a',
        target: 'a',
        selected: true,
        zIndex: 100,
        style: { stroke: '#555' },
        markerEnd: { type: 'arrowclosed' },
        data: { controlPoint: { x: 3.2, y: 4.8 }, controlPointDragged: true, branchKey: 'go' },
      },
    ],
  });
  assert.deepEqual(persisted.nodes[0], {
    id: 'a',
    position: { x: 1, y: 3 },
    data: { type: 'agent', label: 'A', codeIdentifier: 'A' },
  });
  assert.deepEqual(persisted.edges[0], {
    id: 'e1',
    source: 'a',
    target: 'a',
    data: { branchKey: 'go', controlPoint: { x: 3, y: 5 } },
  });
});

test('an untouched control point is not persisted', () => {
  const persisted = toPersisted({
    nodes: [],
    edges: [{ id: 'e', source: 'a', target: 'b', data: { controlPoint: { x: 1, y: 2 } } }],
  });
  assert.deepEqual(persisted.edges[0], { id: 'e', source: 'a', target: 'b' });
});

test('legacy URLs still load, and shed their junk', () => {
  const decoded = decodeState(encodeURIComponent(JSON.stringify(LEGACY)));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.state.nodes.length, 2);
  // START carries no generated identifier any more.
  assert.equal(decoded.state.nodes[0].data.codeIdentifier, undefined);
  assert.equal(decoded.state.nodes[1].data.codeIdentifier, 'Agent');
  assert.equal(decoded.state.nodes[1].data.obj, undefined);
  assert.equal(decoded.state.edges[0].data.controlPoint.x, -94.5);
  assert.equal(decoded.state.edges[0].data.controlPointDragged, true);
  assert.equal(decoded.state.entryPointCodeId, undefined);
});

test('the new payload is much smaller than the legacy one', () => {
  const before = encodeURIComponent(JSON.stringify(LEGACY)).length;
  const after = encodeState(decodeState(encodeURIComponent(JSON.stringify(LEGACY))).state).length;
  assert.ok(after < before * 0.6, `expected a big shrink, got ${before} -> ${after}`);
});

test('malformed shared state is rejected with a reason instead of being merged', () => {
  for (const payload of [
    'not json',
    encodeURIComponent(JSON.stringify([1, 2, 3])),
    encodeURIComponent(JSON.stringify({ nodes: 'nope' })),
    encodeURIComponent(JSON.stringify({ v: 99, nodes: [] })),
    encodeURIComponent(JSON.stringify({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { type: 'evil' } }] })),
    encodeURIComponent(JSON.stringify({ nodes: [{ id: 'a', position: { x: 'x', y: 0 }, data: { type: 'agent' } }] })),
    encodeURIComponent(JSON.stringify({ nodes: [], edges: [{ id: 'e', source: 'ghost', target: 'ghost' }] })),
  ]) {
    const decoded = decodeState(payload);
    assert.equal(decoded.ok, false, `expected rejection for ${payload.slice(0, 40)}`);
    assert.ok(decoded.reason.length > 0);
  }
});

test('a node identifier cannot smuggle arbitrary text into generated code', () => {
  const decoded = decodeState(
    encodeURIComponent(
      JSON.stringify({
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { type: 'agent', label: 'A', codeIdentifier: 'x", evil)#' } }],
      }),
    ),
  );
  assert.equal(decoded.ok, false);
});

test('an empty hash means "start fresh"', () => {
  assert.deepEqual(decodeState(''), { ok: true, state: null });
  assert.deepEqual(decodeState('#'), { ok: true, state: null });
});

test('the initial state seeds a START node', () => {
  const initial = createInitialState();
  assert.equal(initial.nodes.length, 1);
  assert.equal(initial.nodes[0].data.type, 'start');
});

test('JSON export round-trips through import', () => {
  const decoded = decodeJson(encodeJson(minimal));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.state.nodes.length, 3);
  assert.equal(decodeJson('{').ok, false);
});

test('hydration adds back the React Flow render fields', () => {
  assert.equal(toFlowNode({ id: 'a', data: {}, position: { x: 0, y: 0 } }).type, 'custom');
  assert.equal(toFlowEdge({ id: 'e', source: 'a', target: 'b' }).type, 'customEdge');
  assert.deepEqual(toFlowEdge({ id: 'e', source: 'a', target: 'b' }).data, {});
});
