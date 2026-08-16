import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';

import { useNodeEditor } from '../app/editorContext.js';
import { useIsFlaggedNode } from '../app/validationContext.js';

const BASE_STYLE = {
  padding: '10px 15px',
  borderRadius: '8px',
  position: 'relative',
  minWidth: '180px',
  cursor: 'default',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  transition: 'all 0.2s ease-in-out',
};

const TYPE_STYLES = {
  start: { backgroundColor: '#e8f5e9', borderColor: '#4caf50', color: '#2e7d32' },
  end: { backgroundColor: '#ffebee', borderColor: '#f44336', color: '#c62828' },
  conditional_edge: { backgroundColor: '#ede7f6', borderColor: '#7e57c2', color: '#4527a0' },
  text: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
    color: '#e65100',
    fontStyle: 'italic',
    minWidth: '200px',
    maxWidth: '300px',
  },
};

export default function CustomNode({ data, id, selected }) {
  const [draft, setDraft] = useState(data.label || '');
  const inputRef = useRef(null);
  const hasError = useIsFlaggedNode(id);
  const { isEditing, onEditClick, onLabelUpdate, onEditCancel } = useNodeEditor(id);

  useEffect(() => {
    setDraft(data.label || '');
  }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => onLabelUpdate(id, draft), [onLabelUpdate, draft, id]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setDraft(data.label || '');
        onEditCancel();
      }
    },
    [commit, onEditCancel, data.label],
  );

  const isEditable = data.type !== 'start' && data.type !== 'end';
  const style = {
    ...BASE_STYLE,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    ...(TYPE_STYLES[data.type] || {}),
    ...(hasError ? { borderColor: '#dc3545', boxShadow: '0 0 0 3px rgba(220,53,69,0.25)' } : {}),
  };

  return (
    <div
      className="custom-node-wrapper"
      style={style}
      title={
        data.codeIdentifier
          ? `Code name: ${data.codeIdentifier}`
          : `${data.label} node`
      }
    >
      {selected && !isEditing && isEditable && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDraft(data.label || '');
            onEditClick(id);
          }}
          aria-label={`Edit ${data.label} node name`}
          title="Edit node name"
          style={{
            position: 'absolute',
            top: '-10px',
            right: '-10px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '1px solid #ddd',
            backgroundColor: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            padding: 0,
            boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
            zIndex: 10,
          }}
        >
          ✎
        </button>
      )}

      {data.type !== 'start' && <Handle type="target" position={Position.Top} style={{ background: '#555' }} />}

      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label="Node name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            border: '1px dashed #aaa',
            outline: 'none',
            backgroundColor: 'transparent',
            fontSize: '14px',
            fontWeight: '500',
            color: 'inherit',
            padding: '2px',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{ fontSize: '14px', fontWeight: '500', userSelect: 'none', textAlign: 'center' }}>
          {data.label || '(Unnamed)'}
        </div>
      )}

      {data.type !== 'end' && <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />}

      {data.codeIdentifier && data.codeIdentifier !== data.label && (
        <div style={{ fontSize: '10px', color: '#777', marginTop: '5px', textAlign: 'center' }}>
          {data.codeIdentifier}
        </div>
      )}
    </div>
  );
}
