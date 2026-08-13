import React from 'react';
import { ReactFlowProvider } from 'reactflow';

import GraphEditor from './GraphEditor.jsx';

export default function App() {
  return (
    <ReactFlowProvider>
      <GraphEditor />
    </ReactFlowProvider>
  );
}
