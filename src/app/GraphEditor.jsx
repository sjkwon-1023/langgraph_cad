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
  decodeJson,
  decodeState,
  encodeJson,
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
          push('공유 URL이 너무 깁니다. JSON으로 내보내 보관하는 것을 권장합니다.', 'info');
        }
        if (hash === window.location.hash) return;
        window.history.replaceState(null, '', hash);
      } catch (error) {
        console.error('Failed to save the graph URL.', error);
        push('그래프를 URL에 저장하지 못했습니다.', 'error');
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
        push(`${definition.label} 노드는 하나만 추가할 수 있습니다.`, 'info');
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
        push('노드 이름은 비워 둘 수 없습니다.', 'error');
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
      push('클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.', 'error');
    }
  }, [push]);

  const handleCopyCode = useCallback(() => copyText(code, '생성된 코드를 복사했습니다.'), [code, copyText]);
  const handleCopyUrl = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.hash = encodeState(currentState);
      copyText(url.toString(), '현재 그래프 URL을 복사했습니다.');
    } catch (error) {
      console.error('Failed to create a share URL.', error);
      push('공유 URL을 만들지 못했습니다.', 'error');
    }
  }, [copyText, currentState, push]);

  const handleExport = useCallback(() => {
    try {
      const blob = new Blob([encodeJson(currentState)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${graphName || 'langgraph-cad'}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      push('그래프 JSON을 내보냈습니다.', 'success');
    } catch (error) {
      console.error('JSON export failed.', error);
      push('그래프 JSON을 내보내지 못했습니다.', 'error');
    }
  }, [currentState, graphName, push]);

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

  const handleImport = useCallback(async (file) => {
    try {
      const decoded = decodeJson(await file.text());
      if (!decoded.ok) {
        push(decoded.reason, 'error');
        return;
      }
      requestUrlSave();
      replaceGraph(decoded.state);
      push('그래프 JSON을 불러왔습니다.', 'success');
    } catch (error) {
      console.error('JSON import failed.', error);
      push('그래프 JSON 파일을 읽지 못했습니다.', 'error');
    }
  }, [push, replaceGraph, requestUrlSave]);

  const handleReset = useCallback(() => {
    if (!window.confirm('그래프 전체를 초기 상태로 되돌릴까요?')) return;
    requestUrlSave();
    replaceGraph(createInitialState());
    push('그래프를 초기화했습니다.', 'success');
  }, [push, replaceGraph, requestUrlSave]);

  const handleLoadTemplate = useCallback((templateId) => {
    if (!hasGraphTemplate(templateId)) {
      push('알 수 없는 그래프 템플릿입니다.', 'error');
      return;
    }
    if (!window.confirm('현재 그래프를 선택한 템플릿으로 덮어쓸까요?')) return;
    requestUrlSave();
    replaceGraph(createGraphFromTemplate(templateId));
    push('그래프 템플릿을 불러왔습니다.', 'success');
  }, [push, replaceGraph, requestUrlSave]);

  const handleApplyPython = useCallback((result) => {
    if (!result.state) return false;
    const summary = [
      `노드 ${result.summary.nodes}개`,
      `엣지 ${result.summary.edges}개`,
      `읽지 못한 줄 ${result.unreadable.length}개`,
      `add_node 없이 참조된 노드 ${result.implied.length}개`,
    ].join(' / ');
    if (!window.confirm(`판정한 Python 코드로 현재 그래프를 덮어쓸까요?\n\n${summary}`)) return false;
    requestUrlSave();
    replaceGraph(result.state);
    push(`Python 코드에서 그래프를 불러왔습니다. ${summary}`, 'success');
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
              aria-label="노드 팔레트 열기"
              aria-expanded={paletteOpen}
              aria-controls="node-palette"
              onClick={() => setPaletteOpen(true)}
            >
              ☰
            </button>
            <div className="mobile-tabs" role="tablist" aria-label="작업 화면">
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
              aria-label="노드 팔레트 닫기"
              onClick={() => setPaletteOpen(false)}
            />
          )}
          <aside id="node-palette" className={`palette-pane ${paletteOpen ? 'open' : ''}`} aria-label="노드 팔레트">
            <button
              type="button"
              className="drawer-close"
              aria-label="노드 팔레트 닫기"
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
              onExport={handleExport}
              onImport={handleImport}
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
            aria-label="그래프 편집기"
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
            aria-label="코드 패널"
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
