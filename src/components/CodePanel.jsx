import React, { useMemo } from 'react';

import { TOKEN_COLORS, tokenizePython } from '../highlight/python.js';

const LEVEL_STYLE = {
  error: { background: '#fdecea', border: '#f5c2c0', color: '#8f1f18', icon: '✕' },
  warning: { background: '#fff8e1', border: '#ffe08a', color: '#7a5600', icon: '!' },
};

function IssueList({ issues, onFocus }) {
  if (issues.length === 0) return null;
  const { background, border, color, icon } = LEVEL_STYLE[issues[0].level];
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: '0 0 10px',
        padding: '8px 10px',
        background,
        border: `1px solid ${border}`,
        borderRadius: '6px',
        color,
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {issues.map((issue, index) => (
        <li key={`${issue.id}-${index}`} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
          <span aria-hidden="true">{icon}</span>
          {issue.nodeIds.length > 0 ? (
            <button
              type="button"
              onClick={() => onFocus(issue.nodeIds)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                textDecoration: 'underline dotted',
              }}
            >
              {issue.message}
            </button>
          ) : (
            <span>{issue.message}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CodePanel({
  code,
  graphName,
  onGraphNameChange,
  stateFields,
  onStateFieldsChange,
  validation,
  onCopy,
  onFocusNodes,
}) {
  const tokens = useMemo(() => tokenizePython(code), [code]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '15px', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ margin: 0, color: '#333', fontSize: '18px', flex: 1 }}>생성된 코드</h2>
        <button
          type="button"
          onClick={onCopy}
          disabled={validation.hasErrors}
          title={validation.hasErrors ? '오류를 먼저 해결해야 복사할 수 있습니다.' : '코드를 클립보드로 복사'}
          style={{
            padding: '9px 14px',
            borderRadius: '6px',
            border: 'none',
            background: validation.hasErrors ? '#c9ccd1' : '#007bff',
            color: '#fff',
            cursor: validation.hasErrors ? 'not-allowed' : 'pointer',
            fontSize: '14px',
          }}
        >
          코드 복사
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#f0f0f0', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
        <label htmlFor="graphNameInput" style={{ fontSize: '13px', fontWeight: 500, color: '#333' }}>
          Graph Name
        </label>
        <input
          id="graphNameInput"
          type="text"
          value={graphName}
          onChange={(event) => onGraphNameChange(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
          placeholder="my_workflow_graph"
          style={{ padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
        />
        <label htmlFor="stateFieldsInput" style={{ fontSize: '13px', fontWeight: 500, color: '#333' }}>
          State 필드 <span style={{ fontWeight: 400, color: '#777' }}>(한 줄에 <code>이름: 타입</code> 하나)</span>
        </label>
        <textarea
          id="stateFieldsInput"
          rows={3}
          value={stateFields}
          onChange={(event) => onStateFieldsChange(event.target.value)}
          spellCheck={false}
          style={{
            padding: '9px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            font: '13px monospace',
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ overflowY: 'auto', maxHeight: '30%' }}>
        <IssueList issues={validation.errors} onFocus={onFocusNodes} />
        <IssueList issues={validation.warnings} onFocus={onFocusNodes} />
      </div>

      <div style={{ flex: 1, minHeight: '120px', overflow: 'auto', background: '#2d2d2d', borderRadius: '6px', border: '1px solid #444' }}>
        <pre
          style={{
            margin: 0,
            padding: '15px',
            font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            color: TOKEN_COLORS.plain,
            whiteSpace: 'pre',
          }}
        >
          <code>
            {tokens.map((token, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={index} style={{ color: TOKEN_COLORS[token.type] }}>
                {token.value}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
