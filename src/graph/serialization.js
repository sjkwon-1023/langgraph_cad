import { DEFAULT_GRAPH_NAME, DEFAULT_STATE_FIELDS } from '../generator/generatePython.js';
import { NODE_TYPES, needsCodeIdentifier } from './nodeTypes.js';

export const STATE_VERSION = 1;

/** Past this the URL starts getting rejected by chat apps, proxies and browsers. */
export const HASH_LENGTH_WARNING = 8000;

const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_ID = 128;
const MAX_LABEL = 200;
const MAX_BRANCH_KEY = 100;
const MAX_STATE_FIELDS = 2000;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isString = (value) => typeof value === 'string';

const clamp = (text, max) => String(text).slice(0, max);

class DecodeError extends Error {}

const fail = (reason) => {
  throw new DecodeError(reason);
};

function readPosition(raw) {
  if (!raw || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) fail('The node position is invalid.');
  return { x: raw.x, y: raw.y };
}

function readNode(raw) {
  if (!raw || !isString(raw.id) || !raw.id || raw.id.length > MAX_ID) fail('The node ID is invalid.');
  const data = raw.data || {};
  if (!isString(data.type) || !Object.hasOwn(NODE_TYPES, data.type)) {
    fail(`Unknown node type: ${String(data.type)}`);
  }
  const node = {
    id: raw.id,
    position: readPosition(raw.position),
    data: {
      type: data.type,
      label: isString(data.label) ? clamp(data.label, MAX_LABEL) : NODE_TYPES[data.type].label,
    },
  };
  if (needsCodeIdentifier(data.type)) {
    const identifier = isString(data.codeIdentifier) ? data.codeIdentifier : '';
    if (identifier && !/^[A-Za-z0-9_]+$/.test(identifier)) fail('The node identifier contains invalid characters.');
    node.data.codeIdentifier = identifier || undefined;
  }
  return node;
}

function readEdge(raw, nodeIds) {
  if (!raw || !isString(raw.id) || !raw.id || raw.id.length > MAX_ID) fail('The edge ID is invalid.');
  if (!nodeIds.has(raw.source) || !nodeIds.has(raw.target)) fail('An edge refers to a node that does not exist.');
  const data = raw.data || {};
  const edge = { id: raw.id, source: raw.source, target: raw.target, data: {} };
  if (isString(data.branchKey) && data.branchKey.trim()) {
    edge.data.branchKey = clamp(data.branchKey.trim(), MAX_BRANCH_KEY);
  }
  if (data.controlPoint) {
    edge.data.controlPoint = readPosition(data.controlPoint);
    edge.data.controlPointDragged = true;
  }
  return edge;
}

/** Normalise any accepted payload (current or legacy) into the persisted shape. */
function readState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('This is not a saved graph payload.');
  if (raw.v !== undefined && raw.v !== STATE_VERSION) fail(`Unsupported save version: ${String(raw.v)}`);

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : fail('nodes must be an array.');
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  if (rawNodes.length > MAX_NODES) fail(`Too many nodes (${rawNodes.length} > ${MAX_NODES}).`);
  if (rawEdges.length > MAX_EDGES) fail(`Too many edges (${rawEdges.length} > ${MAX_EDGES}).`);

  const nodes = rawNodes.map(readNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) fail('Duplicate node IDs are not allowed.');

  const edges = rawEdges.map((edge) => readEdge(edge, nodeIds));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) fail('Duplicate edge IDs are not allowed.');

  return {
    v: STATE_VERSION,
    graphName: isString(raw.graphName) && raw.graphName ? clamp(raw.graphName, 64) : DEFAULT_GRAPH_NAME,
    stateFields: isString(raw.stateFields) ? clamp(raw.stateFields, MAX_STATE_FIELDS) : DEFAULT_STATE_FIELDS,
    nodes,
    edges,
  };
}

export function createInitialState() {
  return {
    v: STATE_VERSION,
    graphName: DEFAULT_GRAPH_NAME,
    stateFields: DEFAULT_STATE_FIELDS,
    nodes: [{ id: 'start-1', position: { x: 100, y: 100 }, data: { type: 'start', label: 'START' } }],
    edges: [],
  };
}

/** Strip everything React Flow adds at runtime; only the drawing is persisted. */
export function toPersisted({ nodes = [], edges = [], graphName, stateFields }) {
  return {
    v: STATE_VERSION,
    graphName: graphName || DEFAULT_GRAPH_NAME,
    stateFields: stateFields ?? DEFAULT_STATE_FIELDS,
    nodes: nodes.map((node) => {
      const persisted = {
        id: node.id,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        data: { type: node.data.type, label: node.data.label },
      };
      if (node.data.codeIdentifier) persisted.data.codeIdentifier = node.data.codeIdentifier;
      return persisted;
    }),
    edges: edges.map((edge) => {
      const persisted = { id: edge.id, source: edge.source, target: edge.target };
      const data = {};
      if (edge.data?.branchKey) data.branchKey = edge.data.branchKey;
      if (edge.data?.controlPointDragged && edge.data.controlPoint) {
        data.controlPoint = {
          x: Math.round(edge.data.controlPoint.x),
          y: Math.round(edge.data.controlPoint.y),
        };
      }
      if (Object.keys(data).length > 0) persisted.data = data;
      return persisted;
    }),
  };
}

/** Persisted node -> React Flow node. */
export const toFlowNode = (node) => ({ ...node, type: 'custom', zIndex: 10 });

/** Persisted edge -> React Flow edge. Visual styling lives in CustomEdge. */
export const toFlowEdge = (edge) => ({
  ...edge,
  type: 'customEdge',
  data: edge.data || {},
  zIndex: 5,
});

export const encodeState = (state) => encodeURIComponent(JSON.stringify(toPersisted(state)));

/**
 * Decode a URL hash. Shared URLs are untrusted input, so a malformed payload is
 * reported rather than merged into the editor state.
 */
export function decodeState(hash) {
  const payload = String(hash || '').replace(/^#/, '');
  if (!payload) return { ok: true, state: null };
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(payload));
  } catch {
    return { ok: false, reason: 'The graph data in the URL is not valid JSON.' };
  }
  try {
    return { ok: true, state: readState(parsed) };
  } catch (err) {
    if (err instanceof DecodeError) return { ok: false, reason: err.message };
    throw err;
  }
}
