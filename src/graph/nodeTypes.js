export const NODE_TYPES = {
  start: { type: 'start', label: 'START', singleton: true, hint: '그래프 진입점' },
  end: { type: 'end', label: 'END', singleton: true, hint: '그래프 종료점' },
  agent: { type: 'agent', label: 'Agent', hint: 'add_node 로 등록되는 노드' },
  tool: { type: 'tool', label: 'Tool', hint: 'add_node 로 등록되는 노드' },
  conditional_edge: {
    type: 'conditional_edge',
    label: 'Conditional Edge',
    hint: 'add_conditional_edges 의 라우터 함수',
  },
  text: { type: 'text', label: 'Text', hint: '코드에 포함되지 않는 메모' },
};

export const NODE_TYPE_KEYS = Object.keys(NODE_TYPES);

/** Nodes that become an `add_node(...)` call. */
export const isCodeNode = (type) => type === 'agent' || type === 'tool';

/** Nodes that carry a generated identifier. */
export const needsCodeIdentifier = (type) => isCodeNode(type) || type === 'conditional_edge';
