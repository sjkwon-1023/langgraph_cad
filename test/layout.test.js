import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutGraph } from '../src/graph/layout.js';

const node = (id, type = 'agent') => ({ id, data: { type, label: id } });
const edge = (source, target, id = `${source}-${target}`) => ({ id, source, target });

test('fan-out과 fan-in을 고유하고 안정적인 rank 좌표에 배치한다', () => {
  const input = {
    nodes: [node('start', 'start'), node('left'), node('right'), node('join')],
    edges: [edge('start', 'left'), edge('start', 'right'), edge('left', 'join'), edge('right', 'join')],
  };
  const result = layoutGraph(input);
  const positions = new Map(result.nodes.map((item) => [item.id, item.position]));

  assert.equal(new Set(result.nodes.map((item) => `${item.position.x}:${item.position.y}`)).size, 4);
  assert.equal(positions.get('left').y, positions.get('right').y);
  assert.ok(positions.get('left').x < positions.get('right').x);
  assert.ok(positions.get('join').y > positions.get('left').y);
  assert.deepEqual(layoutGraph(input), result);
});

test('cycle과 self-loop에서도 종료하고 모든 좌표를 유한한 정수로 만든다', () => {
  const result = layoutGraph({
    nodes: [node('start', 'start'), node('a'), node('b')],
    edges: [edge('start', 'a'), edge('a', 'b'), edge('b', 'a'), edge('b', 'b')],
  });

  result.nodes.forEach(({ position }) => {
    assert.equal(Number.isFinite(position.x), true);
    assert.equal(Number.isFinite(position.y), true);
    assert.equal(Number.isInteger(position.x), true);
    assert.equal(Number.isInteger(position.y), true);
  });
});

test('START 미도달 노드와 START가 없는 그래프도 발견 순서대로 아래에 배치한다', () => {
  const withStart = layoutGraph({
    nodes: [node('start', 'start'), node('reached'), node('loose-a'), node('loose-b')],
    edges: [edge('start', 'reached')],
  });
  const positions = new Map(withStart.nodes.map((item) => [item.id, item.position]));
  assert.ok(positions.get('loose-a').y > positions.get('reached').y);
  assert.ok(positions.get('loose-b').y > positions.get('loose-a').y);

  const withoutStart = layoutGraph({
    nodes: [node('first'), node('second')],
    edges: [edge('first', 'second')],
  });
  assert.ok(withoutStart.nodes[1].position.y > withoutStart.nodes[0].position.y);
});

test('입력 노드와 엣지를 변이하지 않는다', () => {
  const input = {
    nodes: [node('start', 'start'), node('a')],
    edges: [{ ...edge('start', 'a'), data: { branchKey: 'go' } }],
  };
  const before = structuredClone(input);
  const result = layoutGraph(input);

  assert.deepEqual(input, before);
  assert.notEqual(result.nodes, input.nodes);
  assert.notEqual(result.edges, input.edges);
  assert.notEqual(result.edges[0].data, input.edges[0].data);
});

