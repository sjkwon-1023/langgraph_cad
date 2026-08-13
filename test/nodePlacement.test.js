import assert from 'node:assert/strict';
import test from 'node:test';

import { getPaletteClickPosition } from '../src/graph/nodePlacement.js';

const bounds = { minX: 0, maxX: 500, minY: 0, maxY: 500 };

test('palette clicks use a diagonal staircase when the center is occupied', () => {
  const nodes = [];
  const positions = [];

  for (let index = 0; index < 4; index += 1) {
    const position = getPaletteClickPosition({ x: 250, y: 250 }, nodes, bounds);
    positions.push(position);
    nodes.push({ position });
  }

  assert.deepEqual(positions, [
    { x: 250, y: 250 },
    { x: 298, y: 298 },
    { x: 346, y: 346 },
    { x: 394, y: 394 },
  ]);
  assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, 4);
});

test('palette click offsets stay inside the visible flow bounds', () => {
  const nodes = [];
  for (let index = 0; index < 20; index += 1) {
    const position = getPaletteClickPosition({ x: 490, y: 490 }, nodes, bounds);
    assert.ok(position.x >= bounds.minX && position.x <= bounds.maxX);
    assert.ok(position.y >= bounds.minY && position.y <= bounds.maxY);
    nodes.push({ position });
  }
});
