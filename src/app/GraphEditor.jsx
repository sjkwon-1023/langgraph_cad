import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from 'reactflow';

import CodePanel from '../components/CodePanel.jsx';
import CustomEdge from '../components/CustomEdge.jsx';
import CustomNode from '../components/CustomNode.jsx';
import NodePalette from '../components/NodePalette.jsx';
import { ToastStack, useToasts } from '../components/Toast.jsx';
import { generatePython } from '../generator/generatePython.js';
import { uniqueNodeName } from '../graph/identifiers.js';
import { getPaletteClickPosition } from '../graph/nodePlacement.js';
import { NODE_TYPES, needsCodeIdentifier } from '../graph/nodeTypes.js';
import {
  HASH_LENGTH_WARNING,
  createInitialState,
  decodeState,
  encodeState,
  toFlowEdge,
  toFlowNode,
  toPersisted,
} from '../graph/serialization.js';
import { createGraphFromTemplate, hasGraphTemplate } from '../graph/templates.js';
import { validateGraph } from '../graph/validation.js';
import { EditorContext } from './editorContext.js';
import { ValidationContext } from './validationContext.js';

const CUSTOM_NODE_TYPES = { custom: CustomNode };
const EDGE_TYPES = { customEdge: CustomEdge };
const DEFAULT_EDGE_OPTIONS = {
  type: 'customEdge',
  data: {},
  markerEnd: { type: MarkerType.ArrowClosed, color: '#555', width: 15, height: 15 },
};

function hydrateState(state) {
  return {
    graphName: state.graphName,
    stateFields: state.stateFields,
    nodes: state.nodes.map(toFlowNode),
    edges: state.edges.map(toFlowEdge),
  };
}

function initializeEditor() {
  const decoded = decodeState(window.location.hash);
  if (!decoded.ok) {
    return {
      ...hydrateState(createInitialState()),
      decodeError: decoded.reason,
      fitLoadedGraph: false,
    };
  }

  const state = decoded.state || createInitialState();
  return {
    ...hydrateState(state),
    decodeError: null,
    fitLoadedGraph: Boolean(decoded.state),
  };
}

function structuralSnapshot(nodes, edges, graphName, stateFields) {
  return {
    graphName,
    stateFields,
    nodes: nodes.map((node) => ({
      id: node.id,
      data: {
        type: node.data.type,
        label: node.data.label,
        codeIdentifier: node.data.codeIdentifier,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: { branchKey: edge.data?.branchKey },
    })),
  };
}

const persistedNodesSignature = (nodes) => JSON.stringify(toPersisted({ nodes }).nodes);
const persistedEdgesSignature = (edges) => JSON.stringify(toPersisted({ edges }).edges);

function useNarrowLayout() {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = (event) => setIsNarrow(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isNarrow;
}

export default function GraphEditor() {
  const [initial] = useState(initializeEditor);
  const [nodes, setNodes] = useNodesState(initial.nodes);
  const [edges, setEdges] = useEdgesState(initial.edges);
  const [graphName, setGraphName] = useState(initial.graphName);
  const [stateFields, setStateFields] = useState(initial.stateFields);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [mobileView, setMobileView] = useState('editor');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [fitRequest, setFitRequest] = useState(null);
  const [urlSaveRequest, setUrlSaveRequest] = useState(0);
  const canvasRef = useRef(null);
  const currentStateRef = useRef(null);
  const edgesRef = useRef(edges);
  const nodesRef = useRef(nodes);
  const nextId = useRef(0);
  const pendingUrlSave = useRef(null);
  const urlSaveEpoch = useRef(0);
  const warnedAboutHashLength = useRef(false);
  const initialToastShown = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const isNarrow = useNarrowLayout();
  const { toasts, push, dismiss } = useToasts();

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const cancelPendingUrlSave = useCallback(() => {
    urlSaveEpoch.current += 1;
    if (pendingUrlSave.current !== null) {
      window.clearTimeout(pendingUrlSave.current);
      pendingUrlSave.current = null;
    }
  }, []);

  const requestUrlSave = useCallback(() => {
    cancelPendingUrlSave();
    setUrlSaveRequest((current) => current + 1);
  }, [cancelPendingUrlSave]);

  useEffect(() => {
    if (initial.decodeError && !initialToastShown.current) {
      initialToastShown.current = true;
      push(initial.decodeError, 'error');
    }
  }, [initial.decodeError, push]);

  useEffect(() => {
    if (!fitRequest) return undefined;
    if (fitRequest.nodeIds.length === 0) {
      setFitRequest(null);
      return undefined;
    }
    if (!nodesInitialized) return undefined;
    const frame = requestAnimationFrame(() => {
      const fitted = fitView({
        nodes: fitRequest.nodeIds.map((id) => ({ id })),
        padding: 0.2,
        duration: 250,
      });
      if (fitted || fitRequest.attemptsLeft <= 1) {
        setFitRequest(null);
      } else {
        setFitRequest((current) => (
          current ? { ...current, attemptsLeft: current.attemptsLeft - 1 } : current
        ));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, fitView, nodesInitialized]);

  const currentState = useMemo(
    () => ({ nodes, edges, graphName, stateFields }),
    [nodes, edges, graphName, stateFields],
  );
  currentStateRef.current = currentState;

  useEffect(() => {
    if (urlSaveRequest === 0) return undefined;
    const epoch = urlSaveEpoch.current;
    const stateToSave = currentStateRef.current;
    const timer = window.setTimeout(() => {
      if (epoch !== urlSaveEpoch.current) return;
      pendingUrlSave.current = null;
      try {
        const hash = `#${encodeState(stateToSave)}`;
        if (hash.length > HASH_LENGTH_WARNING && !warnedAboutHashLength.current) {
          warnedAboutHashLength.current = true;
          push('The share URL is very long and may not work in some apps or browsers.', 'info');
        }
        if (hash === window.location.hash) return;
        window.history.replaceState(null, '', hash);
      } catch (error) {
        console.error('Failed to save the graph URL.', error);
        push('Could not save the graph to the URL.', 'error');
      }
    }, 400);
    pendingUrlSave.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (pendingUrlSave.current === timer) pendingUrlSave.current = null;
    };
  }, [push, urlSaveRequest]);

  const handleNodesChange = useCallback((changes) => {
    const previous = nodesRef.current;
    const next = applyNodeChanges(changes, previous);
    nodesRef.current = next;
    if (persistedNodesSignature(previous) !== persistedNodesSignature(next)) requestUrlSave();
    setNodes(next);
  }, [requestUrlSave, setNodes]);

  const handleEdgesChange = useCallback((changes) => {
    const previous = edgesRef.current;
    const next = applyEdgeChanges(changes, previous);
    edgesRef.current = next;
    if (persistedEdgesSignature(previous) !== persistedEdgesSignature(next)) requestUrlSave();
    setEdges(next);
  }, [requestUrlSave, setEdges]);

  const structure = structuralSnapshot(nodes, edges, graphName, stateFields);
  const structureSignature = JSON.stringify(structure);
  const validation = useMemo(() => validateGraph(structure), [structureSignature]);
  const code = useMemo(() => generatePython(structure), [structureSignature]);
  const validationContext = useMemo(
    () => ({
      flaggedNodeIds: validation.flaggedNodeIds,
      flaggedEdgeIds: validation.flaggedEdgeIds,
    }),
    [validation.flaggedNodeIds, validation.flaggedEdgeIds],
  );

  const takenTypes = useMemo(() => new Set(nodes.map((node) => node.data.type)), [nodes]);

  const allocateNodeId = useCallback((type) => {
    nextId.current += 1;
    return `${type}-${Date.now()}-${nextId.current}`;
  }, []);

  const addNodeAt = useCallback(
    (type, position, paletteBounds = null) => {
      const definition = NODE_TYPES[type];
      if (!definition) return;
      if (definition.singleton && nodes.some((node) => node.data.type === type)) {
        push(`Only one ${definition.label} node can be added.`, 'info');
        return;
      }

      const nodeId = allocateNodeId(type);
      requestUrlSave();
      setNodes((current) => {
        if (definition.singleton && current.some((node) => node.data.type === type)) return current;
        const data = { type, label: definition.label };
        if (needsCodeIdentifier(type)) {
          data.codeIdentifier = uniqueNodeName(definition.label, current);
        }
        const resolvedPosition = paletteBounds
          ? getPaletteClickPosition(position, current, paletteBounds)
          : position;
        return current.concat({
          id: nodeId,
          type: 'custom',
          position: resolvedPosition,
          data,
          zIndex: 10,
        });
      });
      setPaletteOpen(false);
    },
    [allocateNodeId, nodes, push, requestUrlSave, setNodes],
  );

  const addNodeAtCanvasCenter = useCallback((type) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return false;
    const topLeft = screenToFlowPosition({ x: bounds.left, y: bounds.top });
    const bottomRight = screenToFlowPosition({ x: bounds.right, y: bounds.bottom });
    const center = screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    addNodeAt(
      type,
      center,
      {
        minX: topLeft.x,
        maxX: bottomRight.x,
        minY: topLeft.y,
        maxY: bottomRight.y,
      },
    );
    return true;
  }, [addNodeAt, screenToFlowPosition]);

  const handlePaletteAdd = useCallback(
    (type) => {
      if (isNarrow && mobileView !== 'editor') {
        setMobileView('editor');
      }
      addNodeAtCanvasCenter(type);
    },
    [addNodeAtCanvasCenter, isNarrow, mobileView],
  );

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;
      addNodeAt(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNodeAt, screenToFlowPosition],
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleConnect = useCallback(
    (connection) => {
      requestUrlSave();
      setEdges((current) => addEdge({ ...connection, data: {} }, current));
    },
    [requestUrlSave, setEdges],
  );

  const handleEditClick = useCallback((nodeId) => setEditingNodeId(nodeId), []);
  const handleEditCancel = useCallback(() => setEditingNodeId(null), []);
  const handleLabelUpdate = useCallback(
    (nodeId, nextLabel) => {
      const label = nextLabel.trim();
      if (!label) {
        setEditingNodeId(null);
        push('The node name cannot be empty.', 'error');
        return;
      }
      if (nodesRef.current.find((node) => node.id === nodeId)?.data.label === label) {
        setEditingNodeId(null);
        return;
      }
      requestUrlSave();
      setNodes((current) => current.map((node) => {
        if (node.id !== nodeId) return node;
        const data = { ...node.data, label };
        if (needsCodeIdentifier(node.data.type)) {
          data.codeIdentifier = uniqueNodeName(label, current, nodeId);
        }
        return { ...node, data };
      }));
      setEditingNodeId(null);
    },
    [push, requestUrlSave, setNodes],
  );

  const editorContext = useMemo(
    () => ({
      editingNodeId,
      onEditClick: handleEditClick,
      onLabelUpdate: handleLabelUpdate,
      onEditCancel: handleEditCancel,
      onGraphChange: requestUrlSave,
    }),
    [editingNodeId, handleEditCancel, handleEditClick, handleLabelUpdate, requestUrlSave],
  );

  const copyText = useCallback(async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      push(successMessage, 'success');
    } catch (error) {
      console.error('Clipboard write failed.', error);
      push('Could not copy to the clipboard. Check your browser permissions.', 'error');
    }
  }, [push]);

  const handleCopyCode = useCallback(() => copyText(code, 'Copied the generated code.'), [code, copyText]);
  const handleCopyUrl = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.hash = encodeState(currentState);
      copyText(url.toString(), 'Copied the current graph URL.');
    } catch (error) {
      console.error('Failed to create a share URL.', error);
      push('Could not create a share URL.', 'error');
    }
  }, [copyText, currentState, push]);

  const replaceGraph = useCallback((state) => {
    const hydrated = hydrateState(state);
    nodesRef.current = hydrated.nodes;
    edgesRef.current = hydrated.edges;
    setNodes(hydrated.nodes);
    setEdges(hydrated.edges);
    setGraphName(hydrated.graphName);
    setStateFields(hydrated.stateFields);
    setEditingNodeId(null);
    setMobileView('editor');
    setPaletteOpen(false);
    setFitRequest({ nodeIds: hydrated.nodes.map((node) => node.id), attemptsLeft: 8 });
  }, [setEdges, setNodes]);

  const handleReset = useCallback(() => {
    if (!window.confirm('Reset the entire graph to its initial state?')) return;
    requestUrlSave();
    replaceGraph(createInitialState());
    push('Reset the graph.', 'success');
  }, [push, replaceGraph, requestUrlSave]);

  const handleLoadTemplate = useCallback((templateId) => {
    if (!hasGraphTemplate(templateId)) {
      push('Unknown graph template.', 'error');
      return;
    }
    if (!window.confirm('Replace the current graph with the selected template?')) return;
    requestUrlSave();
    replaceGraph(createGraphFromTemplate(templateId));
    push('Loaded the graph template.', 'success');
  }, [push, replaceGraph, requestUrlSave]);

  const handleApplyPython = useCallback((result) => {
    if (!result.state) return false;
    const summary = [
      `${result.summary.nodes} nodes`,
      `${result.summary.edges} edges`,
      `${result.unreadable.length} unreadable lines`,
      `${result.implied.length} nodes referenced without add_node`,
    ].join(' / ');
    if (!window.confirm(`Replace the current graph with the reviewed Python code?\n\n${summary}`)) return false;
    requestUrlSave();
    replaceGraph(result.state);
    push(`Loaded the graph from Python code. ${summary}`, 'success');
    return true;
  }, [push, replaceGraph, requestUrlSave]);

  const handleGraphNameChange = useCallback((nextGraphName) => {
    if (nextGraphName === graphName) return;
    requestUrlSave();
    setGraphName(nextGraphName);
  }, [graphName, requestUrlSave]);

  const handleStateFieldsChange = useCallback((nextStateFields) => {
    if (nextStateFields === stateFields) return;
    requestUrlSave();
    setStateFields(nextStateFields);
  }, [requestUrlSave, stateFields]);

  const handleFocusNodes = useCallback((nodeIds) => {
    const ids = new Set(nodeIds);
    setNodes((current) => current.map((node) => ({ ...node, selected: ids.has(node.id) })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    setMobileView('editor');
    requestAnimationFrame(() => {
      fitView({ nodes: nodeIds.map((id) => ({ id })), padding: 0.3, duration: 250 });
    });
  }, [fitView, setEdges, setNodes]);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [paletteOpen]);

  return (
    <ValidationContext.Provider value={validationContext}>
      <EditorContext.Provider value={editorContext}>
        <main className="app-shell">
          <header className="mobile-toolbar">
            <button
              type="button"
              className="toolbar-button"
              aria-label="Open node palette"
              aria-expanded={paletteOpen}
              aria-controls="node-palette"
              onClick={() => setPaletteOpen(true)}
            >
              ☰
            </button>
            <div className="mobile-tabs" role="tablist" aria-label="Workspace views">
              <button
                type="button"
                id="editor-tab"
                role="tab"
                aria-selected={mobileView === 'editor'}
                aria-controls="editor-panel"
                className={mobileView === 'editor' ? 'active' : ''}
                onClick={() => setMobileView('editor')}
              >
                Editor
              </button>
              <button
                type="button"
                id="code-tab"
                role="tab"
                aria-selected={mobileView === 'code'}
                aria-controls="code-panel"
                className={mobileView === 'code' ? 'active' : ''}
                onClick={() => setMobileView('code')}
              >
                Code
              </button>
            </div>
          </header>

          {paletteOpen && (
            <button
              type="button"
              className="drawer-backdrop"
              aria-label="Close node palette"
              onClick={() => setPaletteOpen(false)}
            />
          )}
          <aside id="node-palette" className={`palette-pane ${paletteOpen ? 'open' : ''}`} aria-label="Node palette">
            <button
              type="button"
              className="drawer-close"
              aria-label="Close node palette"
              onClick={() => setPaletteOpen(false)}
            >
              ×
            </button>
            <NodePalette
              onAddNode={handlePaletteAdd}
              onNodeDragStart={() => setPaletteOpen(false)}
              onLoadTemplate={handleLoadTemplate}
              onReset={handleReset}
              onCopyUrl={handleCopyUrl}
              takenTypes={takenTypes}
            />
          </aside>

          <section
            id="editor-panel"
            role="tabpanel"
            aria-labelledby="editor-tab"
            aria-hidden={isNarrow && mobileView !== 'editor'}
            ref={canvasRef}
            className={`editor-pane ${mobileView === 'editor' ? '' : 'mobile-hidden'}`}
            aria-label="Graph editor"
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              nodeTypes={CUSTOM_NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Shift']}
              elevateNodesOnSelect
              elevateEdgesOnSelect
              selectionOnDrag={!isNarrow}
              selectionMode={SelectionMode.Partial}
              panOnDrag={isNarrow ? true : [2]}
              panOnScroll={false}
              fitView={initial.fitLoadedGraph}
              fitViewOptions={{ padding: 0.2 }}
              attributionPosition="bottom-left"
            >
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
              <Controls />
              <Background color="#e9e9e9" gap={20} size={1.5} />
            </ReactFlow>
          </section>

          <section
            id="code-panel"
            role="tabpanel"
            aria-labelledby="code-tab"
            aria-hidden={isNarrow && mobileView !== 'code'}
            className={`code-pane ${mobileView === 'code' ? '' : 'mobile-hidden'}`}
            aria-label="Code panel"
          >
            <CodePanel
              code={code}
              graphName={graphName}
              onGraphNameChange={handleGraphNameChange}
              stateFields={stateFields}
              onStateFieldsChange={handleStateFieldsChange}
              validation={validation}
              onCopy={handleCopyCode}
              onFocusNodes={handleFocusNodes}
              onApplyPython={handleApplyPython}
            />
          </section>
        </main>
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </EditorContext.Provider>
    </ValidationContext.Provider>
  );
}
