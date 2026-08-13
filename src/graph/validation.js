import {
  analyzeStateFieldAnnotations,
  branchKeyOf,
  buildPlan,
  parseStateFields,
} from '../generator/generatePython.js';
import { isValidPythonIdentifier, RESERVED_NODE_NAMES } from './identifiers.js';
import { isCodeNode } from './nodeTypes.js';

const error = (id, message, refs = {}) => ({ id, level: 'error', message, nodeIds: [], edgeIds: [], ...refs });
const warn = (id, message, refs = {}) => ({ id, level: 'warning', message, nodeIds: [], edgeIds: [], ...refs });

function reachableFrom(startIds, adjacency) {
  const seen = new Set(startIds);
  const queue = [...startIds];
  while (queue.length > 0) {
    const current = queue.shift();
    (adjacency.get(current) || []).forEach((next) => {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    });
  }
  return seen;
}

/**
 * Report everything that would make the generated code wrong or would silently
 * drop part of the drawing. Errors block copying; warnings are advisory.
 */
export function validateGraph({ nodes = [], edges = [], graphName = '', stateFields = '' } = {}) {
  const issues = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const typeOf = (id) => byId.get(id)?.data?.type;
  const labelOf = (id) => byId.get(id)?.data?.label || id;

  const startNodes = nodes.filter((node) => node.data?.type === 'start');
  const endNodes = nodes.filter((node) => node.data?.type === 'end');
  const codeNodes = nodes.filter((node) => isCodeNode(node.data?.type));
  const routerNodes = nodes.filter((node) => node.data?.type === 'conditional_edge');
  const liveEdges = edges.filter((edge) => byId.has(edge.source) && byId.has(edge.target));

  // --- graph-level settings ---
  if (!isValidPythonIdentifier(graphName)) {
    issues.push(error('invalid-graph-name', `Graph Name "${graphName}" 은 Python 식별자로 쓸 수 없습니다.`));
  }
  const parsedStateFields = parseStateFields(stateFields);
  parsedStateFields.invalid.forEach((line) => {
    issues.push(error('invalid-state-field', `State 필드 "${line}" 를 "이름: 타입" 형태로 해석할 수 없습니다.`));
  });
  analyzeStateFieldAnnotations(parsedStateFields.fields).unknownNames.forEach((name) => {
    issues.push(warn(
      'unknown-state-annotation-symbol',
      `State 필드의 "${name}" 는 자동 import 대상이 아닙니다 — 생성 코드 상단에 import 를 직접 추가하세요.`,
    ));
  });

  // --- START / END ---
  if (startNodes.length === 0) {
    issues.push(error('no-start', 'START 노드가 없어 그래프의 진입점을 만들 수 없습니다.'));
  }
  if (startNodes.length > 1) {
    issues.push(error('multiple-start', 'START 노드는 하나만 있어야 합니다.', {
      nodeIds: startNodes.map((node) => node.id),
    }));
  }
  if (endNodes.length > 1) {
    issues.push(error('multiple-end', 'END 노드는 하나만 있어야 합니다.', {
      nodeIds: endNodes.map((node) => node.id),
    }));
  }
  if (endNodes.length === 0) {
    issues.push(warn('no-end', 'END 노드가 없습니다. 종료 지점을 명시하는 편이 좋습니다.'));
  }

  startNodes.forEach((node) => {
    if (!liveEdges.some((edge) => edge.source === node.id)) {
      issues.push(error('start-no-outgoing', 'START 노드가 아무 노드에도 연결되지 않았습니다.', {
        nodeIds: [node.id],
      }));
    }
    const incoming = liveEdges.filter((edge) => edge.target === node.id);
    if (incoming.length > 0) {
      issues.push(error('start-incoming', 'START 노드로 들어오는 엣지는 사용할 수 없습니다.', {
        nodeIds: [node.id],
        edgeIds: incoming.map((edge) => edge.id),
      }));
    }
  });

  endNodes.forEach((node) => {
    const outgoing = liveEdges.filter((edge) => edge.source === node.id);
    if (outgoing.length > 0) {
      issues.push(error('end-outgoing', 'END 노드에서 나가는 엣지는 사용할 수 없습니다.', {
        nodeIds: [node.id],
        edgeIds: outgoing.map((edge) => edge.id),
      }));
    }
  });

  // --- node names ---
  const seenNames = new Map();
  codeNodes.forEach((node) => {
    const name = node.data?.codeIdentifier;
    if (RESERVED_NODE_NAMES.has(name)) {
      issues.push(error('reserved-node-name', `"${name}" 은 LangGraph 예약어라 노드 이름으로 쓸 수 없습니다.`, {
        nodeIds: [node.id],
      }));
    }
    if (seenNames.has(name)) {
      issues.push(error('duplicate-node-name', `노드 이름 "${name}" 이 중복됩니다.`, {
        nodeIds: [seenNames.get(name), node.id],
      }));
    } else {
      seenNames.set(name, node.id);
    }
  });

  // --- conditional routers ---
  const plan = buildPlan({ nodes, edges, graphName, stateFields });
  const nodeNames = plan.nodeNames;

  routerNodes.forEach((node) => {
    const label = node.data?.label || 'Conditional Edge';
    const outgoing = liveEdges.filter((edge) => edge.source === node.id);
    const incoming = liveEdges.filter((edge) => edge.target === node.id);

    const chained = outgoing.filter((edge) => typeOf(edge.target) === 'conditional_edge');
    chained.forEach((edge) => {
      issues.push(error('conditional-chain', `Conditional Edge "${label}" 를 다른 Conditional Edge 에 직접 연결할 수 없습니다.`, {
        nodeIds: [node.id, edge.target],
        edgeIds: [edge.id],
      }));
    });

    const branchEdges = outgoing.filter((edge) => plan.asTarget(edge.target));
    if (branchEdges.length === 0) {
      issues.push(error('conditional-no-target', `Conditional Edge "${label}" 에서 나가는 분기가 없어 코드로 생성되지 않습니다.`, {
        nodeIds: [node.id],
      }));
    }
    if (incoming.filter((edge) => plan.asSource(edge.source)).length === 0) {
      issues.push(error('conditional-no-source', `Conditional Edge "${label}" 에 들어오는 노드가 없어 코드로 생성되지 않습니다.`, {
        nodeIds: [node.id],
      }));
    }

    const keys = new Map();
    branchEdges.forEach((edge) => {
      const key = branchKeyOf(edge, byId.get(edge.target), nodeNames);
      if (keys.has(key)) {
        issues.push(error('duplicate-branch-key', `Conditional Edge "${label}" 의 분기 키 "${key}" 가 중복됩니다.`, {
          nodeIds: [node.id],
          edgeIds: [keys.get(key), edge.id],
        }));
      } else {
        keys.set(key, edge.id);
      }
    });
  });

  // --- connectivity ---
  const routable = nodes.filter((node) => node.data?.type !== 'text');
  const forward = new Map();
  const backward = new Map();
  liveEdges.forEach((edge) => {
    if (typeOf(edge.source) === 'text' || typeOf(edge.target) === 'text') return;
    if (!forward.has(edge.source)) forward.set(edge.source, []);
    forward.get(edge.source).push(edge.target);
    if (!backward.has(edge.target)) backward.set(edge.target, []);
    backward.get(edge.target).push(edge.source);
  });

  if (startNodes.length > 0) {
    const reached = reachableFrom(startNodes.map((node) => node.id), forward);
    routable
      .filter((node) => node.data?.type !== 'start' && !reached.has(node.id))
      .forEach((node) => {
        issues.push(warn('unreachable', `"${labelOf(node.id)}" 는 START 에서 도달할 수 없습니다.`, {
          nodeIds: [node.id],
        }));
      });
  }

  if (endNodes.length > 0) {
    const terminating = reachableFrom(endNodes.map((node) => node.id), backward);
    codeNodes
      .filter((node) => !terminating.has(node.id))
      .forEach((node) => {
        issues.push(warn('no-path-to-end', `"${labelOf(node.id)}" 에서 END 로 가는 경로가 없습니다.`, {
          nodeIds: [node.id],
        }));
      });
  }

  routable
    .filter((node) => !liveEdges.some((edge) => edge.source === node.id || edge.target === node.id))
    .forEach((node) => {
      issues.push(warn('orphan', `"${labelOf(node.id)}" 에 연결된 엣지가 없습니다.`, { nodeIds: [node.id] }));
    });

  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  return {
    issues,
    errors,
    warnings,
    hasErrors: errors.length > 0,
    flaggedNodeIds: new Set(errors.flatMap((issue) => issue.nodeIds)),
    flaggedEdgeIds: new Set(errors.flatMap((issue) => issue.edgeIds)),
  };
}
