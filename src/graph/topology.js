/** Build directed adjacency for known, non-text graph nodes and edges. */
export function buildAdjacency({ nodes = [], edges = [] } = {}, { reverse = false } = {}) {
  const routableIds = new Set(
    nodes.filter((node) => node.data?.type !== 'text').map((node) => node.id),
  );
  const adjacency = new Map([...routableIds].map((id) => [id, []]));

  edges.forEach((edge) => {
    if (!routableIds.has(edge.source) || !routableIds.has(edge.target)) return;
    const from = reverse ? edge.target : edge.source;
    const to = reverse ? edge.source : edge.target;
    adjacency.get(from).push(to);
  });

  return adjacency;
}

/** Return every node reachable from one or more starting node ids. */
export function reachableFrom(startIds, adjacency) {
  const seen = new Set(startIds);
  const queue = [...startIds];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    (adjacency.get(current) || []).forEach((next) => {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    });
  }
  return seen;
}

/** A router branch loops when its target can reach the router again. */
export function isLoopbackBranch(routerId, targetId, adjacency) {
  return reachableFrom([targetId], adjacency).has(routerId);
}

/** Detect any directed cycle, including a self-loop. */
export function hasDirectedCycle(adjacency) {
  const state = new Map();

  const visit = (nodeId) => {
    const current = state.get(nodeId);
    if (current === 'visiting') return true;
    if (current === 'visited') return false;

    state.set(nodeId, 'visiting');
    for (const next of adjacency.get(nodeId) || []) {
      if (visit(next)) return true;
    }
    state.set(nodeId, 'visited');
    return false;
  };

  return [...adjacency.keys()].some(visit);
}
