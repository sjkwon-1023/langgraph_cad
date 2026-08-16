export const NODE_TYPES = {
  start: { type: 'start', label: 'START', singleton: true, hint: 'Graph entry point' },
  end: { type: 'end', label: 'END', singleton: true, hint: 'Graph exit point' },
  agent: { type: 'agent', label: 'Agent', hint: 'Node registered with add_node' },
  tool: { type: 'tool', label: 'Tool', hint: 'Node registered with add_node' },
  conditional_edge: {
    type: 'conditional_edge',
    label: 'Conditional Edge',
    hint: 'Router function for add_conditional_edges',
  },
  text: { type: 'text', label: 'Memo', hint: 'Memo not included in generated code' },
};

export const NODE_TYPE_KEYS = Object.keys(NODE_TYPES);

/** Nodes that become an `add_node(...)` call. */
export const isCodeNode = (type) => type === 'agent' || type === 'tool';

/** Nodes that carry a generated identifier. */
export const needsCodeIdentifier = (type) => isCodeNode(type) || type === 'conditional_edge';
