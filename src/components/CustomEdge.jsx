import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EdgeLabelRenderer, useReactFlow, useStore } from 'reactflow';

import { useMarkGraphChanged } from '../app/editorContext.js';
import { useIsFlaggedEdge } from '../app/validationContext.js';
import { initialControlPoint } from '../graph/edgeGeometry.js';
import { buildAdjacency, isLoopbackBranch } from '../graph/topology.js';

// How far the curve bows away from the straight source -> target line.
const CURVATURE_STRENGTH = 0.25;

function buildPath(sourceX, sourceY, targetX, targetY, control) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return `M ${sourceX},${sourceY}`;
  const offset = distance * CURVATURE_STRENGTH;
  const handleX = control.x - (dx / distance) * offset;
  const handleY = control.y - (dy / distance) * offset;
  return `M ${sourceX},${sourceY} Q ${handleX},${handleY} ${control.x},${control.y} T ${targetX},${targetY}`;
}

const selectEdgeMeta = (source, target) => (store) => {
  const sourceNode = store.nodeInternals.get(source);
  const targetNode = store.nodeInternals.get(target);
  const isBranch = sourceNode?.data?.type === 'conditional_edge';
  const adjacency = buildAdjacency({
    nodes: [...store.nodeInternals.values()],
    edges: store.edges,
  });
  const isLoop = isBranch && isLoopbackBranch(source, target, adjacency);
  return {
    isBranch,
    isLoop,
    fallbackKey:
      targetNode?.data?.type === 'end'
        ? 'end'
        : isLoop ? '' : targetNode?.data?.codeIdentifier || '',
  };
};

const metaEqual = (a, b) =>
  a.isBranch === b.isBranch && a.isLoop === b.isLoop && a.fallbackKey === b.fallbackKey;

export default function CustomEdge({ id, source, target, sourceX, sourceY, targetX, targetY, data, markerEnd, selected }) {
  const { setEdges, getViewport } = useReactFlow();
  const hasError = useIsFlaggedEdge(id);
  const markGraphChanged = useMarkGraphChanged();
  const { isBranch, fallbackKey } = useStore(selectEdgeMeta(source, target), metaEqual);

  const selfLoop = source === target;
  const [control, setControl] = useState(
    () => data?.controlPoint || initialControlPoint(sourceX, sourceY, targetX, targetY, selfLoop),
  );
  const controlRef = useRef(control);
  const [drag, setDrag] = useState(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const pinned = Boolean(data?.controlPointDragged);
  controlRef.current = control;

  useEffect(() => {
    if (!pinned) setControl(initialControlPoint(sourceX, sourceY, targetX, targetY, selfLoop));
  }, [sourceX, sourceY, targetX, targetY, pinned, selfLoop]);

  useEffect(() => {
    if (data?.controlPoint) setControl(data.controlPoint);
  }, [data?.controlPoint]);

  const patchEdge = useCallback(
    (patch) => {
      const changed = Object.entries(patch).some(([key, value]) => !Object.is(data?.[key], value));
      if (!changed) return;
      markGraphChanged();
      setEdges((edges) =>
        edges.map((edge) => (edge.id === id ? { ...edge, data: { ...edge.data, ...patch } } : edge)),
      );
    },
    [data, markGraphChanged, setEdges, id],
  );

  const onControlMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      setDrag({ x: event.clientX, y: event.clientY, originX: control.x, originY: control.y });
    },
    [control],
  );

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (event) => {
      const { zoom } = getViewport();
      const nextControl = {
        x: drag.originX + (event.clientX - drag.x) / zoom,
        y: drag.originY + (event.clientY - drag.y) / zoom,
      };
      controlRef.current = nextControl;
      setControl(nextControl);
    };
    const onUp = () => {
      setDrag(null);
      patchEdge({ controlPoint: controlRef.current, controlPointDragged: true });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [drag, getViewport, patchEdge]);

  const resetCurve = useCallback(() => {
    markGraphChanged();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge;
        const { controlPoint, controlPointDragged, ...rest } = edge.data || {};
        return { ...edge, data: rest };
      }),
    );
    setControl(initialControlPoint(sourceX, sourceY, targetX, targetY, selfLoop));
  }, [markGraphChanged, setEdges, id, sourceX, sourceY, targetX, targetY, selfLoop]);

  const commitKey = useCallback(() => {
    setEditingKey(false);
    const next = keyDraft.trim();
    patchEdge({ branchKey: next || undefined });
  }, [keyDraft, patchEdge]);

  const stroke = hasError ? '#dc3545' : selected ? '#007bff' : '#555';
  const path = buildPath(sourceX, sourceY, targetX, targetY, control);
  const branchKey = data?.branchKey || fallbackKey;

  return (
    <>
      <path d={path} style={{ stroke: 'transparent', strokeWidth: 15, fill: 'none', pointerEvents: 'stroke' }} />
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: hasError || selected ? 2.5 : 1.5,
          strokeDasharray: isBranch ? '5,5' : undefined,
          fill: 'none',
        }}
      />

      {isBranch && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${control.x}px, ${control.y - 18}px)`,
              pointerEvents: 'all',
            }}
          >
            {editingKey ? (
              <input
                autoFocus
                value={keyDraft}
                aria-label="Branch key"
                onChange={(event) => setKeyDraft(event.target.value)}
                onBlur={commitKey}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitKey();
                  if (event.key === 'Escape') setEditingKey(false);
                }}
                style={{ font: '11px monospace', width: '110px', padding: '2px 4px', border: '1px solid #7e57c2', borderRadius: '4px' }}
              />
            ) : (
              <button
                type="button"
                title="Value returned when the router function selects this branch"
                aria-label={`Edit branch key ${branchKey}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setKeyDraft(data?.branchKey || fallbackKey);
                  setEditingKey(true);
                }}
                style={{
                  font: '11px monospace',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${hasError ? '#dc3545' : '#b39ddb'}`,
                  background: '#f3efff',
                  color: '#4527a0',
                  cursor: 'pointer',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {branchKey || '(branch key)'}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {selected && (
        <>
          <circle
            cx={control.x}
            cy={control.y}
            r={10}
            fill="transparent"
            style={{ cursor: 'move' }}
            onMouseDown={onControlMouseDown}
          />
          <circle
            cx={control.x}
            cy={control.y}
            r={6}
            fill="#fff"
            stroke="#007bff"
            strokeWidth={1.5}
            style={{ cursor: 'move' }}
            onMouseDown={onControlMouseDown}
          />
          {pinned && (
            <EdgeLabelRenderer>
              <button
                type="button"
                className="nodrag nopan"
                onClick={resetCurve}
                title="Restore curve to default shape"
                aria-label="Reset curve shape"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${control.x + 22}px, ${control.y}px)`,
                  pointerEvents: 'all',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: '1px solid #007bff',
                  background: '#fff',
                  color: '#007bff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ⟲
              </button>
            </EdgeLabelRenderer>
          )}
        </>
      )}
    </>
  );
}
