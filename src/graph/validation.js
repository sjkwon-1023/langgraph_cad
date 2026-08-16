import {
  analyzeStateFieldAnnotations,
  buildPlan,
  parseStateFields,
} from '../generator/generatePython.js';
import { isValidPythonIdentifier, RESERVED_NODE_NAMES } from './identifiers.js';
import { isCodeNode } from './nodeTypes.js';
import { buildAdjacency, reachableFrom } from './topology.js';

const error = (id, message, refs = {}) => ({ id, level: 'error', message, nodeIds: [], edgeIds: [], ...refs });
const warn = (id, message, refs = {}) => ({ id, level: 'warning', message, nodeIds: [], edgeIds: [], ...refs });

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
    issues.push(error('invalid-graph-name', `Graph name "${graphName}" cannot be used as a Python identifier.`));
  }
  const parsedStateFields = parseStateFields(stateFields);
  parsedStateFields.invalid.forEach((line) => {
    issues.push(error('invalid-state-field', `State field "${line}" must use the "name: type" format.`));
  });
  analyzeStateFieldAnnotations(parsedStateFields.fields).unknownNames.forEach((name) => {
    issues.push(warn(
      'unknown-state-annotation-symbol',
      `State field "${name}" is not imported automatically — add its import to the top of the generated code.`,
    ));
  });

  // --- START / END ---
  if (startNodes.length === 0) {
    issues.push(error('no-start', 'A START node is required to define the graph entry point.'));
  }
  if (startNodes.length > 1) {
    issues.push(error('multiple-start', 'There must be exactly one START node.', {
      nodeIds: startNodes.map((node) => node.id),
    }));
  }
  if (endNodes.length > 1) {
    issues.push(error('multiple-end', 'There must be exactly one END node.', {
      nodeIds: endNodes.map((node) => node.id),
    }));
  }
  if (endNodes.length === 0) {
    issues.push(warn('no-end', 'There is no END node. Defining an explicit end point is recommended.'));
  }

  startNodes.forEach((node) => {
    if (!liveEdges.some((edge) => edge.source === node.id)) {
      issues.push(error('start-no-outgoing', 'The START node is not connected to any node.', {
        nodeIds: [node.id],
      }));
    }
    const incoming = liveEdges.filter((edge) => edge.target === node.id);
    if (incoming.length > 0) {
      issues.push(error('start-incoming', 'Edges into the START node are not allowed.', {
        nodeIds: [node.id],
        edgeIds: incoming.map((edge) => edge.id),
      }));
    }
  });

  endNodes.forEach((node) => {
    const outgoing = liveEdges.filter((edge) => edge.source === node.id);
    if (outgoing.length > 0) {
      issues.push(error('end-outgoing', 'Edges out of the END node are not allowed.', {
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
      issues.push(error('reserved-node-name', `"${name}" is reserved by LangGraph and cannot be used as a node name.`, {
        nodeIds: [node.id],
      }));
    }
    if (seenNames.has(name)) {
      issues.push(error('duplicate-node-name', `The node name "${name}" is duplicated.`, {
        nodeIds: [seenNames.get(name), node.id],
      }));
    } else {
      seenNames.set(name, node.id);
    }
  });

  // --- conditional routers ---
  const plan = buildPlan({ nodes, edges, graphName, stateFields });

  routerNodes.forEach((node) => {
    const label = node.data?.label || 'Conditional Edge';
    const outgoing = liveEdges.filter((edge) => edge.source === node.id);
    const incoming = liveEdges.filter((edge) => edge.target === node.id);

    const chained = outgoing.filter((edge) => typeOf(edge.target) === 'conditional_edge');
    chained.forEach((edge) => {
      issues.push(error('conditional-chain', `Conditional Edge "${label}" cannot connect directly to another Conditional Edge.`, {
        nodeIds: [node.id, edge.target],
        edgeIds: [edge.id],
      }));
    });

    const branchEdges = outgoing.filter((edge) => plan.asTarget(edge.target));
    if (branchEdges.length === 0) {
      issues.push(error('conditional-no-target', `Conditional Edge "${label}" has no outgoing branch, so no code can be generated for it.`, {
        nodeIds: [node.id],
      }));
    }
    if (incoming.filter((edge) => plan.asSource(edge.source)).length === 0) {
      issues.push(error('conditional-no-source', `Conditional Edge "${label}" has no incoming node, so no code can be generated for it.`, {
        nodeIds: [node.id],
      }));
    }

    const routerPlan = plan.allRouters.find((router) => router.nodeId === node.id);
    const branchByEdgeId = new Map(
      (routerPlan?.branches || []).map((branch) => [branch.edgeId, branch]),
    );
    const keys = new Map();
    branchEdges.forEach((edge) => {
      const branch = branchByEdgeId.get(edge.id);
      const key = branch?.key ?? '';
      if (branch?.isLoop && !branch.hasExplicitKey) {
        issues.push(error(
          'missing-loop-branch-key',
          `The loop branch of Conditional Edge "${label}" needs a meaningful branch key such as revise or retry.`,
          { nodeIds: [node.id, edge.target], edgeIds: [edge.id] },
        ));
      }
      if (keys.has(key)) {
        issues.push(error('duplicate-branch-key', `Conditional Edge "${label}" has a duplicate branch key "${key}".`, {
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
  const forward = buildAdjacency({ nodes, edges: liveEdges });
  const backward = buildAdjacency({ nodes, edges: liveEdges }, { reverse: true });

  if (startNodes.length > 0) {
    const reached = reachableFrom(startNodes.map((node) => node.id), forward);
    routable
      .filter((node) => node.data?.type !== 'start' && !reached.has(node.id))
      .forEach((node) => {
        issues.push(warn('unreachable', `"${labelOf(node.id)}" cannot be reached from START.`, {
          nodeIds: [node.id],
        }));
      });
  }

  if (endNodes.length > 0) {
    const terminating = reachableFrom(endNodes.map((node) => node.id), backward);
    codeNodes
      .filter((node) => !terminating.has(node.id))
      .forEach((node) => {
        issues.push(warn('no-path-to-end', `There is no path from "${labelOf(node.id)}" to END.`, {
          nodeIds: [node.id],
        }));
      });
  }

  routable
    .filter((node) => !liveEdges.some((edge) => edge.source === node.id || edge.target === node.id))
    .forEach((node) => {
      issues.push(warn('orphan', `"${labelOf(node.id)}" has no connected edges.`, { nodeIds: [node.id] }));
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
