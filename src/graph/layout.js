const HORIZONTAL_GAP = 280;
const VERTICAL_GAP = 180;
const ORIGIN_X = 80;
const ORIGIN_Y = 60;

/**
 * START에서의 최단 거리를 기준으로 노드를 결정적으로 배치한다.
 * 도달할 수 없는 노드는 마지막 도달 rank 아래에 한 줄씩 둔다.
 */
export function layoutGraph({ nodes = [], edges = [] } = {}) {
  const nodeCopies = nodes.map((node) => ({
    ...node,
    data: node.data ? { ...node.data } : node.data,
  }));
  const knownIds = new Set(nodeCopies.map((node) => node.id));
  const adjacency = new Map(nodeCopies.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!knownIds.has(edge.source) || !knownIds.has(edge.target)) return;
    adjacency.get(edge.source).push(edge.target);
  });

  const rankById = new Map();
  const queue = [];
  nodeCopies.forEach((node) => {
    if (node.data?.type !== 'start') return;
    rankById.set(node.id, 0);
    queue.push(node.id);
  });

  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const nextRank = rankById.get(source) + 1;
    adjacency.get(source).forEach((target) => {
      if (rankById.has(target)) return;
      rankById.set(target, nextRank);
      queue.push(target);
    });
  }

  let lastRank = rankById.size > 0 ? Math.max(...rankById.values()) : -1;
  nodeCopies.forEach((node) => {
    if (rankById.has(node.id)) return;
    lastRank += 1;
    rankById.set(node.id, lastRank);
  });

  const nodesByRank = new Map();
  nodeCopies.forEach((node) => {
    const rank = rankById.get(node.id);
    if (!nodesByRank.has(rank)) nodesByRank.set(rank, []);
    nodesByRank.get(rank).push(node.id);
  });

  const positionById = new Map();
  [...nodesByRank.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([rank, ids]) => {
      ids.forEach((id, index) => {
        positionById.set(id, {
          x: ORIGIN_X + index * HORIZONTAL_GAP,
          y: ORIGIN_Y + rank * VERTICAL_GAP,
        });
      });
    });

  return {
    nodes: nodeCopies.map((node) => ({ ...node, position: positionById.get(node.id) })),
    edges: edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
    })),
  };
}

