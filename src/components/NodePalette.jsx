import React, { useState } from 'react';

import { NODE_TYPES, NODE_TYPE_KEYS } from '../graph/nodeTypes.js';
import { GRAPH_TEMPLATES } from '../graph/templates.js';

const actionStyle = (color) => ({
  padding: '10px 15px',
  borderRadius: '6px',
  border: `1px solid ${color}`,
  background: '#fff',
  color,
  cursor: 'pointer',
  fontSize: '14px',
  width: '100%',
  transition: 'all 0.2s ease',
});

function ActionButton({ color, onClick, ariaLabel, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={actionStyle(color)}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = color;
        event.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = '#fff';
        event.currentTarget.style.color = color;
      }}
    >
      {children}
    </button>
  );
}

export default function NodePalette({
  onAddNode,
  onNodeDragStart,
  onLoadTemplate,
  onReset,
  onCopyUrl,
  takenTypes,
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(GRAPH_TEMPLATES[0].id);
  const selectedTemplate = GRAPH_TEMPLATES.find(({ id }) => id === selectedTemplateId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '15px' }}>
      <h2 style={{ marginTop: 0, marginBottom: '6px', color: '#333', fontSize: '18px' }}>Add nodes</h2>
      <p style={{ margin: '0 0 15px', fontSize: '12px', color: '#777' }}>
        Drag a node onto the canvas, or click to add it at the center of the view.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {NODE_TYPE_KEYS.map((key) => {
          const nodeType = NODE_TYPES[key];
          const disabled = Boolean(nodeType.singleton && takenTypes.has(key));
          return (
            <button
              key={key}
              type="button"
              draggable={!disabled}
              disabled={disabled}
              title={disabled ? `A ${nodeType.label} node already exists.` : nodeType.hint}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/reactflow', key);
                event.dataTransfer.effectAllowed = 'move';
                onNodeDragStart();
              }}
              onClick={() => onAddNode(key)}
              style={{
                padding: '12px 15px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                background: disabled ? '#f1f1f1' : '#fff',
                cursor: disabled ? 'not-allowed' : 'grab',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: '500',
                color: disabled ? '#aaa' : '#444',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {nodeType.label}
            </button>
          );
        })}
      </div>

      <hr style={{ margin: '25px 0', border: 0, borderTop: '1px solid #eee' }} />

      <section aria-labelledby="template-heading">
        <h2 id="template-heading" style={{ margin: '0 0 6px', color: '#333', fontSize: '18px' }}>
          Templates
        </h2>
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#777', lineHeight: 1.4 }}>
          Load an initial graph structure. You will be asked before the current graph is replaced.
        </p>
        <label htmlFor="graph-template-select" style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
          Select a graph template
        </label>
        <select
          id="graph-template-select"
          aria-label="Select a graph template"
          value={selectedTemplateId}
          onChange={(event) => setSelectedTemplateId(event.target.value)}
          style={{ width: '100%', padding: '9px', border: '1px solid #ccc', borderRadius: '6px', background: '#fff' }}
        >
          {GRAPH_TEMPLATES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
        <p style={{ minHeight: '34px', margin: '7px 0 9px', fontSize: '12px', color: '#666', lineHeight: 1.4 }}>
          {selectedTemplate?.description}
        </p>
        <ActionButton
          color="#7c3aed"
          ariaLabel="Load the selected graph template"
          onClick={() => onLoadTemplate(selectedTemplateId)}
        >
          Load template
        </ActionButton>
      </section>

      <hr style={{ margin: '25px 0', border: 0, borderTop: '1px solid #eee' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ActionButton color="#28a745" onClick={onCopyUrl}>Copy URL</ActionButton>
        <ActionButton color="#dc3545" onClick={onReset}>Reset all</ActionButton>
        <ActionButton
          color="#6c757d"
          onClick={() => window.open('https://github.com/sjkwon1023/langgraph_cad/tree/main', '_blank', 'noopener')}
        >
          Readme
        </ActionButton>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '20px', fontSize: '12px', color: '#bbb', lineHeight: 1.4 }}>
        Sejin Kwon
        <br />
        sjkwon1023@gmail.com
      </div>
    </div>
  );
}
