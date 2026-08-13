import assert from 'node:assert/strict';
import test from 'node:test';

import { initialControlPoint, SELF_LOOP_OFFSET } from '../src/graph/edgeGeometry.js';

test('forward edges use the exact midpoint', () => {
  assert.deepEqual(initialControlPoint(10, 20, 110, 220), { x: 60, y: 120 });
});

test('back edges and self-loops bow sideways', () => {
  assert.deepEqual(initialControlPoint(10, 220, 110, 20), {
    x: 60 + SELF_LOOP_OFFSET,
    y: 120,
  });
  assert.deepEqual(initialControlPoint(40, 80, 40, 80, true), {
    x: 40 + SELF_LOOP_OFFSET,
    y: 80,
  });
});
