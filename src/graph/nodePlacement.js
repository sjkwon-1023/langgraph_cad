const DEFAULT_STEP = 48;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const positionKey = ({ x, y }) => `${x}:${y}`;

/**
 * Pick a visible, unoccupied position for a node added by clicking the palette.
 * Drag-and-drop positions intentionally bypass this helper.
 */
export function getPaletteClickPosition(basePosition, existingNodes, bounds, step = DEFAULT_STEP) {
  const minimumX = Math.min(bounds.minX, bounds.maxX);
  const maximumX = Math.max(bounds.minX, bounds.maxX);
  const minimumY = Math.min(bounds.minY, bounds.maxY);
  const maximumY = Math.max(bounds.minY, bounds.maxY);
  const base = {
    x: clamp(basePosition.x, minimumX, maximumX),
    y: clamp(basePosition.y, minimumY, maximumY),
  };
  const occupied = new Set(existingNodes.map((node) => positionKey(node.position)));
  const candidates = [];
  const candidateKeys = new Set();
  const addCandidate = (x, y) => {
    const candidate = {
      x: clamp(x, minimumX, maximumX),
      y: clamp(y, minimumY, maximumY),
    };
    const key = positionKey(candidate);
    if (!candidateKeys.has(key)) {
      candidateKeys.add(key);
      candidates.push(candidate);
    }
  };

  addCandidate(base.x, base.y);
  const maximumDistance = Math.max(maximumX - minimumX, maximumY - minimumY);
  const maximumSteps = Math.ceil(maximumDistance / step);
  const directions = [
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [directionX, directionY] of directions) {
    for (let distance = 1; distance <= maximumSteps; distance += 1) {
      const offset = distance * step;
      addCandidate(base.x + directionX * offset, base.y + directionY * offset);
    }
  }

  return candidates.find((candidate) => !occupied.has(positionKey(candidate))) || base;
}
