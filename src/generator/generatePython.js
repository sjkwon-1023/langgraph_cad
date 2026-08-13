import {
  claimPythonIdentifier,
  isValidPythonIdentifier,
  pyDocText,
  pyStr,
  toSnakeCase,
  toToken,
} from '../graph/identifiers.js';
import { isCodeNode } from '../graph/nodeTypes.js';

export const DEFAULT_GRAPH_NAME = 'my_graph';
export const DEFAULT_STATE_FIELDS = 'messages: list';

const STATE_CLASS = 'State';
const COMPILED_NAME = 'app';
const FIELD_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;

const STATE_ANNOTATION_IMPORTS = Object.freeze({
  Annotated: { kind: 'from', module: 'typing' },
  Any: { kind: 'from', module: 'typing' },
  Callable: { kind: 'from', module: 'typing' },
  Dict: { kind: 'from', module: 'typing' },
  Iterable: { kind: 'from', module: 'typing' },
  List: { kind: 'from', module: 'typing' },
  Literal: { kind: 'from', module: 'typing' },
  Mapping: { kind: 'from', module: 'typing' },
  Optional: { kind: 'from', module: 'typing' },
  Sequence: { kind: 'from', module: 'typing' },
  Set: { kind: 'from', module: 'typing' },
  Tuple: { kind: 'from', module: 'typing' },
  Union: { kind: 'from', module: 'typing' },
  add_messages: { kind: 'from', module: 'langgraph.graph.message' },
  operator: { kind: 'import', module: 'operator' },
});

const STATE_ANNOTATION_BUILTINS = new Set([
  'False',
  'None',
  'True',
  'bool',
  'bytes',
  'complex',
  'dict',
  'float',
  'frozenset',
  'int',
  'list',
  'object',
  'set',
  'str',
  'tuple',
  'type',
]);

const EMITTED_ANNOTATION_NAMES = new Set([
  STATE_CLASS,
  'END',
  'START',
  'StateGraph',
  'TypedDict',
]);

function annotationIdentifiers(annotation) {
  const withoutStrings = String(annotation).replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '');
  const identifiers = [];
  const tokenPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match;
  while ((match = tokenPattern.exec(withoutStrings)) !== null) {
    const before = withoutStrings.slice(0, match.index).trimEnd();
    if (!before.endsWith('.')) identifiers.push(match[0]);
  }
  return identifiers;
}

/** Resolve imports and unknown names referenced by parsed State annotations. */
export function analyzeStateFieldAnnotations(fields) {
  const typingNames = new Set();
  const langgraphMessageNames = new Set();
  const moduleNames = new Set();
  const unknownNames = new Set();

  fields.forEach(({ annotation }) => {
    annotationIdentifiers(annotation).forEach((name) => {
      const target = STATE_ANNOTATION_IMPORTS[name];
      if (target?.kind === 'import') moduleNames.add(target.module);
      else if (target?.module === 'typing') typingNames.add(name);
      else if (target?.module === 'langgraph.graph.message') langgraphMessageNames.add(name);
      else if (!STATE_ANNOTATION_BUILTINS.has(name) && !EMITTED_ANNOTATION_NAMES.has(name)) {
        unknownNames.add(name);
      }
    });
  });

  return {
    typingNames: [...typingNames].sort(),
    langgraphMessageNames: [...langgraphMessageNames].sort(),
    moduleNames: [...moduleNames].sort(),
    unknownNames: [...unknownNames].sort(),
  };
}

/** Parse the "State fields" input into `{ fields, invalid }`. */
export function parseStateFields(text) {
  const fields = [];
  const invalid = [];
  String(text ?? '').split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const match = FIELD_RE.exec(line);
    if (match) fields.push({ name: match[1], annotation: match[2].trim() });
    else invalid.push(line);
  });
  return { fields, invalid };
}

/** The branch key an edge leaving a conditional node contributes to `path_map`. */
export function branchKeyOf(edge, targetNode, nodeNames) {
  const explicit = typeof edge?.data?.branchKey === 'string' ? edge.data.branchKey.trim() : '';
  if (explicit) return explicit;
  if (targetNode?.data?.type === 'end') return 'end';
  return nodeNames.get(targetNode?.id) || 'branch';
}

/**
 * Build the graph model the generator emits from: identifiers are resolved
 * once here so the generator and the validator agree on every name.
 */
export function buildPlan({ nodes = [], edges = [], graphName, stateFields } = {}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const typeOf = (id) => byId.get(id)?.data?.type;

  const codeNodes = nodes.filter((node) => isCodeNode(node.data?.type));
  const routerNodes = nodes.filter((node) => node.data?.type === 'conditional_edge');

  const safeGraphName = isValidPythonIdentifier(graphName) ? graphName : DEFAULT_GRAPH_NAME;

  // Everything already bound in the emitted module, plus `state` so a generated
  // function never shadows its own parameter.
  const taken = new Set([STATE_CLASS, 'END', 'START', 'StateGraph', 'TypedDict', 'Literal', 'state']);
  taken.add(safeGraphName);
  const compiledName = claimPythonIdentifier(COMPILED_NAME, taken);

  const nodeNames = new Map();
  codeNodes.forEach((node) => {
    nodeNames.set(node.id, node.data?.codeIdentifier || toToken(node.data?.label));
  });

  const functionNames = new Map();
  codeNodes.forEach((node) => {
    functionNames.set(node.id, claimPythonIdentifier(toSnakeCase(nodeNames.get(node.id)), taken));
  });

  const routerFunctionNames = new Map();
  routerNodes.forEach((node) => {
    const base = node.data?.codeIdentifier || node.data?.label || 'route';
    routerFunctionNames.set(node.id, claimPythonIdentifier(toSnakeCase(base, 'route'), taken, 'route'));
  });

  // How a node is referred to on either end of an edge in the generated code.
  const asSource = (id) => {
    const type = typeOf(id);
    if (type === 'start') return 'START';
    if (isCodeNode(type)) return pyStr(nodeNames.get(id));
    return null; // END may not have outgoing edges; text/conditional are not endpoints
  };
  const asTarget = (id) => {
    const type = typeOf(id);
    if (type === 'end') return 'END';
    if (isCodeNode(type)) return pyStr(nodeNames.get(id));
    return null; // START may not have incoming edges
  };

  const known = (edge) => byId.has(edge.source) && byId.has(edge.target);

  const plainEdges = edges.filter(
    (edge) =>
      known(edge)
      && typeOf(edge.source) !== 'conditional_edge'
      && typeOf(edge.target) !== 'conditional_edge'
      && asSource(edge.source)
      && asTarget(edge.target),
  );

  const routers = routerNodes
    .map((node) => {
      const branches = edges
        .filter((edge) => known(edge) && edge.source === node.id && asTarget(edge.target))
        .map((edge) => ({
          edgeId: edge.id,
          key: branchKeyOf(edge, byId.get(edge.target), nodeNames),
          target: asTarget(edge.target),
        }));
      const sources = [];
      edges
        .filter((edge) => known(edge) && edge.target === node.id && asSource(edge.source))
        .forEach((edge) => {
          const ref = asSource(edge.source);
          if (!sources.includes(ref)) sources.push(ref);
        });
      return {
        nodeId: node.id,
        label: node.data?.label || 'Conditional Edge',
        functionName: routerFunctionNames.get(node.id),
        branches,
        sources,
      };
    })
    .filter((router) => router.branches.length > 0 && router.sources.length > 0);

  return {
    graphName: safeGraphName,
    compiledName,
    stateFields: parseStateFields(stateFields ?? DEFAULT_STATE_FIELDS),
    codeNodes,
    nodeNames,
    functionNames,
    // START edges are emitted first so the generated graph reads top-down.
    startEdges: plainEdges.filter((edge) => typeOf(edge.source) === 'start'),
    plainEdges: plainEdges.filter((edge) => typeOf(edge.source) !== 'start'),
    routers,
    asSource,
    asTarget,
  };
}

function renderStateClass(fields) {
  const lines = [`class ${STATE_CLASS}(TypedDict):`, '    """모든 노드가 공유하는 그래프 state."""', ''];
  if (fields.length === 0) lines.push('    pass');
  else fields.forEach((field) => lines.push(`    ${field.name}: ${field.annotation}`));
  return lines.join('\n');
}

function renderNodeFunction(node, functionName) {
  return [
    `def ${functionName}(state: ${STATE_CLASS}) -> dict:`,
    `    """TODO: '${pyDocText(node.data?.label) || functionName}' 노드를 구현하세요."""`,
    '    return {}',
  ].join('\n');
}

function renderRouterFunction(router) {
  const keys = [...new Set(router.branches.map((branch) => branch.key))];
  const literal = keys.map(pyStr).join(', ');
  return [
    `def ${router.functionName}(state: ${STATE_CLASS}) -> Literal[${literal}]:`,
    `    """TODO: '${pyDocText(router.label)}' 분기 조건을 구현하세요."""`,
    `    return ${pyStr(keys[0])}`,
  ].join('\n');
}

function renderGraph(plan) {
  const { graphName } = plan;
  const lines = [`${graphName} = StateGraph(${STATE_CLASS})`];

  if (plan.codeNodes.length > 0) {
    lines.push('');
    plan.codeNodes.forEach((node) => {
      lines.push(
        `${graphName}.add_node(${pyStr(plan.nodeNames.get(node.id))}, ${plan.functionNames.get(node.id)})`,
      );
    });
  }

  const edgeLines = [
    ...plan.startEdges.map((edge) => `${graphName}.add_edge(START, ${plan.asTarget(edge.target)})`),
    ...plan.plainEdges.map(
      (edge) => `${graphName}.add_edge(${plan.asSource(edge.source)}, ${plan.asTarget(edge.target)})`,
    ),
  ];
  if (edgeLines.length > 0) lines.push('', ...edgeLines);

  plan.routers.forEach((router) => {
    router.sources.forEach((source) => {
      lines.push(
        '',
        `${graphName}.add_conditional_edges(`,
        `    ${source},`,
        `    ${router.functionName},`,
        '    {',
        ...router.branches.map((branch) => `        ${pyStr(branch.key)}: ${branch.target},`),
        '    },',
        ')',
      );
    });
  });

  lines.push('', `${plan.compiledName} = ${graphName}.compile()`);
  return lines.join('\n');
}

/**
 * Emit a complete, runnable Python module for the drawn graph.
 *
 * The wiring compiles as-is; only the function bodies are left as TODOs.
 */
export function generatePython(input = {}) {
  const plan = buildPlan(input);
  const annotationSymbols = analyzeStateFieldAnnotations(plan.stateFields.fields);

  const usesStart = plan.startEdges.length > 0 || plan.routers.some((r) => r.sources.includes('START'));
  const usesEnd =
    plan.plainEdges.some((edge) => plan.asTarget(edge.target) === 'END')
    || plan.routers.some((router) => router.branches.some((branch) => branch.target === 'END'));

  const typingNames = new Set(['TypedDict', ...annotationSymbols.typingNames]);
  if (plan.routers.length > 0) typingNames.add('Literal');
  const langgraphNames = ['StateGraph'];
  if (usesEnd) langgraphNames.unshift('END');
  if (usesStart) langgraphNames.splice(usesEnd ? 1 : 0, 0, 'START');

  const header = [
    '"""LangGraph CAD 로 생성된 그래프.',
    '',
    'TODO 로 표시된 함수 본문만 채우면 됩니다 — 그래프 배선 자체는 그대로 컴파일됩니다.',
    '"""',
  ].join('\n');

  const standardImports = [
    ...annotationSymbols.moduleNames.map((name) => `import ${name}`),
    `from typing import ${[...typingNames].sort().join(', ')}`,
  ];
  const langgraphImports = [
    `from langgraph.graph import ${langgraphNames.sort().join(', ')}`,
    ...(
      annotationSymbols.langgraphMessageNames.length > 0
        ? [`from langgraph.graph.message import ${annotationSymbols.langgraphMessageNames.join(', ')}`]
        : []
    ),
  ];
  const imports = `${standardImports.join('\n')}\n\n${langgraphImports.join('\n')}`;

  const definitions = [
    renderStateClass(plan.stateFields.fields),
    ...plan.codeNodes.map((node) => renderNodeFunction(node, plan.functionNames.get(node.id))),
    ...plan.routers.map(renderRouterFunction),
    renderGraph(plan),
  ];

  return `${header}\n\n${imports}\n\n\n${definitions.join('\n\n\n')}\n`;
}
