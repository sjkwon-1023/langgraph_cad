import assert from 'node:assert/strict';
import test from 'node:test';

import { toPersisted } from '../src/graph/serialization.js';
import {
  GRAPH_TEMPLATES,
  createGraphFromTemplate,
  hasGraphTemplate,
} from '../src/graph/templates.js';
import { validateGraph } from '../src/graph/validation.js';

test('the five templates are complete persisted v1 payloads with readable layouts', () => {
  assert.equal(GRAPH_TEMPLATES.length, 5);

  for (const { id, graph } of GRAPH_TEMPLATES) {
    assert.deepEqual(toPersisted(graph), graph, `${id} must already use the persisted shape`);

    const nodeIds = graph.nodes.map((node) => node.id);
    const edgeIds = graph.edges.map((edge) => edge.id);
    assert.equal(new Set(nodeIds).size, nodeIds.length, `${id} has duplicate node ids`);
    assert.equal(new Set(edgeIds).size, edgeIds.length, `${id} has duplicate edge ids`);

    const knownNodes = new Set(nodeIds);
    graph.edges.forEach((edge) => {
      assert.ok(knownNodes.has(edge.source), `${id} has an unknown edge source`);
      assert.ok(knownNodes.has(edge.target), `${id} has an unknown edge target`);
    });

    const positions = graph.nodes.map((node) => `${node.position.x},${node.position.y}`);
    assert.equal(new Set(positions).size, positions.length, `${id} has overlapping node origins`);
    graph.nodes.forEach((node) => {
      assert.equal(Number.isInteger(node.position.x), true, `${id} has a non-integer x coordinate`);
      assert.equal(Number.isInteger(node.position.y), true, `${id} has a non-integer y coordinate`);
    });

    const routers = new Set(
      graph.nodes.filter((node) => node.data.type === 'conditional_edge').map((node) => node.id),
    );
    graph.edges
      .filter((edge) => routers.has(edge.source))
      .forEach((edge) => assert.ok(edge.data?.branchKey, `${id} has an implicit branch key`));
  }
});

test('all templates pass graph validation without errors', () => {
  for (const { id, graph } of GRAPH_TEMPLATES) {
    const validation = validateGraph(graph);
    assert.deepEqual(validation.errors, [], `${id}: ${validation.errors.map((issue) => issue.message).join('; ')}`);
  }
});

test('template loads return fresh copies and reject unknown ids', () => {
  assert.equal(hasGraphTemplate('react-agent'), true);
  assert.equal(hasGraphTemplate('unknown'), false);
  assert.equal(createGraphFromTemplate('unknown'), null);

  const first = createGraphFromTemplate('react-agent');
  const second = createGraphFromTemplate('react-agent');
  assert.notEqual(first, second);
  assert.notEqual(first.nodes, second.nodes);
  assert.notEqual(first.nodes[0].data, second.nodes[0].data);

  first.nodes[0].data.label = 'mutated';
  assert.equal(second.nodes[0].data.label, 'START');
});
