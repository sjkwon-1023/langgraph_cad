import { STATE_VERSION } from './serialization.js';

export const REACT_AGENT_TEMPLATE = {
  v: STATE_VERSION,
  graphName: 'react_agent',
  stateFields: 'messages: Annotated[list, add_messages]',
  nodes: [
    { id: 'react-start', position: { x: 360, y: 40 }, data: { type: 'start', label: 'START' } },
    {
      id: 'react-agent',
      position: { x: 360, y: 180 },
      data: { type: 'agent', label: 'Agent', codeIdentifier: 'Agent' },
    },
    {
      id: 'react-router',
      position: { x: 360, y: 320 },
      data: { type: 'conditional_edge', label: 'Should Continue', codeIdentifier: 'ShouldContinue' },
    },
    {
      id: 'react-tool',
      position: { x: 40, y: 480 },
      data: { type: 'tool', label: 'Tool', codeIdentifier: 'Tool' },
    },
    { id: 'react-end', position: { x: 680, y: 480 }, data: { type: 'end', label: 'END' } },
  ],
  edges: [
    { id: 'react-start-agent', source: 'react-start', target: 'react-agent' },
    { id: 'react-agent-router', source: 'react-agent', target: 'react-router' },
    {
      id: 'react-router-tool',
      source: 'react-router',
      target: 'react-tool',
      data: { branchKey: 'tools' },
    },
    {
      id: 'react-router-end',
      source: 'react-router',
      target: 'react-end',
      data: { branchKey: 'end' },
    },
    { id: 'react-tool-agent', source: 'react-tool', target: 'react-agent' },
  ],
};

export const EVALUATOR_OPTIMIZER_TEMPLATE = {
  v: STATE_VERSION,
  graphName: 'evaluator_optimizer',
  stateFields: 'draft: str\nfeedback: str',
  nodes: [
    { id: 'evaluator-start', position: { x: 360, y: 40 }, data: { type: 'start', label: 'START' } },
    {
      id: 'evaluator-generator',
      position: { x: 360, y: 180 },
      data: { type: 'agent', label: 'Generator', codeIdentifier: 'Generator' },
    },
    {
      id: 'evaluator-router',
      position: { x: 360, y: 340 },
      data: { type: 'conditional_edge', label: 'Evaluate Draft', codeIdentifier: 'EvaluateDraft' },
    },
    { id: 'evaluator-end', position: { x: 680, y: 500 }, data: { type: 'end', label: 'END' } },
  ],
  edges: [
    { id: 'evaluator-start-generator', source: 'evaluator-start', target: 'evaluator-generator' },
    { id: 'evaluator-generator-router', source: 'evaluator-generator', target: 'evaluator-router' },
    {
      id: 'evaluator-router-generator',
      source: 'evaluator-router',
      target: 'evaluator-generator',
      data: { branchKey: 'revise' },
    },
    {
      id: 'evaluator-router-end',
      source: 'evaluator-router',
      target: 'evaluator-end',
      data: { branchKey: 'accepted' },
    },
  ],
};

export const PROMPT_CHAINING_TEMPLATE = {
  v: STATE_VERSION,
  graphName: 'prompt_chaining',
  stateFields: 'input: str\nextracted: str\nsummary: str',
  nodes: [
    { id: 'chaining-start', position: { x: 360, y: 40 }, data: { type: 'start', label: 'START' } },
    {
      id: 'chaining-extract',
      position: { x: 360, y: 180 },
      data: { type: 'agent', label: 'Extract', codeIdentifier: 'Extract' },
    },
    {
      id: 'chaining-gate',
      position: { x: 360, y: 320 },
      data: { type: 'conditional_edge', label: 'Quality Gate', codeIdentifier: 'QualityGate' },
    },
    {
      id: 'chaining-summarize',
      position: { x: 40, y: 480 },
      data: { type: 'agent', label: 'Summarize', codeIdentifier: 'Summarize' },
    },
    { id: 'chaining-end', position: { x: 360, y: 650 }, data: { type: 'end', label: 'END' } },
  ],
  edges: [
    { id: 'chaining-start-extract', source: 'chaining-start', target: 'chaining-extract' },
    { id: 'chaining-extract-gate', source: 'chaining-extract', target: 'chaining-gate' },
    {
      id: 'chaining-gate-summarize',
      source: 'chaining-gate',
      target: 'chaining-summarize',
      data: { branchKey: 'continue' },
    },
    {
      id: 'chaining-gate-end',
      source: 'chaining-gate',
      target: 'chaining-end',
      data: { branchKey: 'end' },
    },
    { id: 'chaining-summarize-end', source: 'chaining-summarize', target: 'chaining-end' },
  ],
};

export const ROUTING_TEMPLATE = {
  v: STATE_VERSION,
  graphName: 'routing_workflow',
  stateFields: 'request: str\nroute: str\nresult: str',
  nodes: [
    { id: 'routing-start', position: { x: 360, y: 40 }, data: { type: 'start', label: 'START' } },
    {
      id: 'routing-router',
      position: { x: 360, y: 180 },
      data: { type: 'conditional_edge', label: 'Route Request', codeIdentifier: 'RouteRequest' },
    },
    {
      id: 'routing-research',
      position: { x: 40, y: 360 },
      data: { type: 'agent', label: 'Research', codeIdentifier: 'Research' },
    },
    {
      id: 'routing-creative',
      position: { x: 360, y: 360 },
      data: { type: 'agent', label: 'Creative', codeIdentifier: 'Creative' },
    },
    {
      id: 'routing-support',
      position: { x: 680, y: 360 },
      data: { type: 'agent', label: 'Support', codeIdentifier: 'Support' },
    },
    { id: 'routing-end', position: { x: 360, y: 560 }, data: { type: 'end', label: 'END' } },
  ],
  edges: [
    { id: 'routing-start-router', source: 'routing-start', target: 'routing-router' },
    {
      id: 'routing-router-research',
      source: 'routing-router',
      target: 'routing-research',
      data: { branchKey: 'research' },
    },
    {
      id: 'routing-router-creative',
      source: 'routing-router',
      target: 'routing-creative',
      data: { branchKey: 'creative' },
    },
    {
      id: 'routing-router-support',
      source: 'routing-router',
      target: 'routing-support',
      data: { branchKey: 'support' },
    },
    { id: 'routing-research-end', source: 'routing-research', target: 'routing-end' },
    { id: 'routing-creative-end', source: 'routing-creative', target: 'routing-end' },
    { id: 'routing-support-end', source: 'routing-support', target: 'routing-end' },
  ],
};

export const PARALLEL_BRANCH_TEMPLATE = {
  v: STATE_VERSION,
  graphName: 'parallel_branch',
  stateFields: 'input: str\nleft_result: str\nright_result: str\nresult: str',
  nodes: [
    { id: 'parallel-start', position: { x: 360, y: 40 }, data: { type: 'start', label: 'START' } },
    {
      id: 'parallel-a',
      position: { x: 120, y: 220 },
      data: { type: 'agent', label: 'Branch A', codeIdentifier: 'BranchA' },
    },
    {
      id: 'parallel-b',
      position: { x: 600, y: 220 },
      data: { type: 'agent', label: 'Branch B', codeIdentifier: 'BranchB' },
    },
    {
      id: 'parallel-aggregate',
      position: { x: 360, y: 420 },
      data: { type: 'agent', label: 'Aggregate', codeIdentifier: 'Aggregate' },
    },
    { id: 'parallel-end', position: { x: 360, y: 580 }, data: { type: 'end', label: 'END' } },
  ],
  edges: [
    { id: 'parallel-start-a', source: 'parallel-start', target: 'parallel-a' },
    { id: 'parallel-start-b', source: 'parallel-start', target: 'parallel-b' },
    { id: 'parallel-a-aggregate', source: 'parallel-a', target: 'parallel-aggregate' },
    { id: 'parallel-b-aggregate', source: 'parallel-b', target: 'parallel-aggregate' },
    { id: 'parallel-aggregate-end', source: 'parallel-aggregate', target: 'parallel-end' },
  ],
};

export const GRAPH_TEMPLATES = Object.freeze([
  {
    id: 'react-agent',
    label: 'ReAct 에이전트',
    description: '도구 호출 뒤 Agent로 돌아오는 라우터 루프',
    graph: REACT_AGENT_TEMPLATE,
  },
  {
    id: 'evaluator-optimizer',
    label: '반성 루프',
    description: '평가 결과에 따라 생성을 반복하는 Evaluator-Optimizer',
    graph: EVALUATOR_OPTIMIZER_TEMPLATE,
  },
  {
    id: 'prompt-chaining',
    label: '순차 파이프라인',
    description: '품질 게이트를 통과한 결과만 다음 단계로 전달',
    graph: PROMPT_CHAINING_TEMPLATE,
  },
  {
    id: 'routing',
    label: '라우팅',
    description: 'START 직후 요청을 세 작업 중 하나로 분기',
    graph: ROUTING_TEMPLATE,
  },
  {
    id: 'parallel-branch',
    label: '병렬 분기',
    description: 'START에서 두 작업을 시작한 뒤 결과를 집계',
    graph: PARALLEL_BRANCH_TEMPLATE,
  },
]);

const TEMPLATE_BY_ID = new Map(GRAPH_TEMPLATES.map((template) => [template.id, template.graph]));

export const hasGraphTemplate = (templateId) => TEMPLATE_BY_ID.has(templateId);

/** Return an unshared persisted payload so React Flow cannot mutate the source template. */
export function createGraphFromTemplate(templateId) {
  const template = TEMPLATE_BY_ID.get(templateId);
  return template ? JSON.parse(JSON.stringify(template)) : null;
}
