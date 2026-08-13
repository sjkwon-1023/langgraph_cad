import React, { useMemo, useState } from 'react';

import { importPython } from '../graph/importPython.js';
import { TOKEN_COLORS, tokenizePython, tokenizePythonLines } from '../highlight/python.js';

const LEVEL_STYLE = {
  error: { background: '#fdecea', border: '#f5c2c0', color: '#8f1f18', icon: '✕' },
  warning: { background: '#fff8e1', border: '#ffe08a', color: '#7a5600', icon: '!' },
};

const MODE_BUTTON_STYLE = {
  padding: '7px 10px',
  border: '1px solid #b8bec7',
  background: '#fff',
  color: '#333',
  cursor: 'pointer',
  fontSize: '13px',
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

function ModeButton({ active, children, onClick, rounded }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        ...MODE_BUTTON_STYLE,
        background: active ? '#0d6efd' : MODE_BUTTON_STYLE.background,
        color: active ? '#fff' : MODE_BUTTON_STYLE.color,
        borderColor: active ? '#0d6efd' : '#b8bec7',
        borderRadius: rounded,
      }}
    >
      {children}
    </button>
  );
}

function ImportReview({ source, result, onApply }) {
  const lines = useMemo(() => tokenizePythonLines(source), [source]);
  const unreadableByLine = useMemo(
    () => new Map(result.unreadable.map((item) => [item.line, item])),
    [result.unreadable],
  );
  const summaryItems = [
    `노드 ${result.summary.nodes}개`,
    `엣지 ${result.summary.edges}개`,
    `읽지 못한 줄 ${result.unreadable.length}개`,
    `add_node 없이 참조된 노드 ${result.implied.length}개`,
  ];

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '10px', minHeight: 0, overflowY: 'auto' }}>
      <div
        aria-label="Python 코드 변환 요약"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 12px',
          padding: '9px 10px',
          border: '1px solid #d7dce2',
          borderRadius: '6px',
          background: '#f7f8fa',
          color: '#333',
          fontSize: '13px',
        }}
      >
        {summaryItems.map((item) => <span key={item}>{item}</span>)}
      </div>

      {!result.state && (
        <p
          role="alert"
          style={{ margin: 0, padding: '9px 10px', borderRadius: '6px', background: '#fdecea', color: '#8f1f18', fontSize: '13px' }}
        >
          그래프를 만드는 호출을 찾지 못했습니다. 현재 캔버스는 변경되지 않습니다.
        </p>
      )}

      {result.implied.length > 0 && (
        <div style={{ padding: '9px 10px', border: '1px solid #ffe08a', borderRadius: '6px', background: '#fff8e1', color: '#6b4d00', fontSize: '13px' }}>
          <strong>add_node 없이 참조된 노드:</strong> {result.implied.join(', ')}
        </div>
      )}

      <div style={{ flex: 1, minHeight: '150px', overflow: 'auto', background: '#2d2d2d', borderRadius: '6px', border: '1px solid #444' }}>
        <div
          role="region"
          aria-label="Python 코드 판정 결과"
          style={{ minWidth: 'max-content', padding: '10px 0', font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: TOKEN_COLORS.plain }}
        >
          {lines.map((line) => {
            const unreadable = unreadableByLine.get(line.line);
            return (
              <div
                key={line.line}
                title={unreadable?.reason}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px minmax(max-content, 1fr)',
                  minHeight: '1.5em',
                  background: unreadable ? 'rgba(239, 68, 68, 0.38)' : 'transparent',
                  boxShadow: unreadable ? 'inset 4px 0 #ff5a5f' : 'none',
                }}
              >
                <span aria-hidden="true" style={{ paddingRight: '10px', color: unreadable ? '#ffd6d6' : '#858b98', textAlign: 'right', userSelect: 'none' }}>
                  {line.line}
                </span>
                <code style={{ paddingRight: '12px', whiteSpace: 'pre' }}>
                  {line.tokens.map((token, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={index} style={{ color: TOKEN_COLORS[token.type] }}>
                      {token.value.endsWith('\n') ? token.value.slice(0, -1) : token.value}
                    </span>
                  ))}
                </code>
              </div>
            );
          })}
        </div>
      </div>

      {result.unreadable.length > 0 && (
        <div style={{ color: '#8f1f18', fontSize: '13px' }}>
          <strong>읽지 못한 줄과 이유</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
            {result.unreadable.map((item) => (
              <li key={item.line}>줄 {item.line}: {item.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {result.state && (
        <button
          type="button"
          aria-label="판정한 Python 코드를 현재 그래프에 적용"
          onClick={onApply}
          style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: '6px', border: 'none', background: '#198754', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
        >
          판정 결과 적용
        </button>
      )}
    </div>
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
  onApplyPython,
}) {
  const [mode, setMode] = useState('generated');
  const [pythonSource, setPythonSource] = useState('');
  const [importResult, setImportResult] = useState(null);
  const tokens = useMemo(() => tokenizePython(code), [code]);

  const handleSourceChange = (event) => {
    setPythonSource(event.target.value);
    setImportResult(null);
  };

  const handleConvert = () => {
    setImportResult(importPython(pythonSource));
  };

  const handleApply = () => {
    if (!importResult?.state) return;
    if (!onApplyPython(importResult)) return;
    setPythonSource('');
    setImportResult(null);
    setMode('generated');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '15px', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, color: '#333', fontSize: '18px', flex: 1 }}>
          {mode === 'generated' ? '생성된 코드' : 'Python 코드 가져오기'}
        </h2>
        {mode === 'generated' && (
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
        )}
      </div>

      <div role="group" aria-label="코드 패널 모드" style={{ display: 'flex' }}>
        <ModeButton active={mode === 'generated'} rounded="6px 0 0 6px" onClick={() => setMode('generated')}>
          생성된 코드
        </ModeButton>
        <ModeButton active={mode === 'import'} rounded="0 6px 6px 0" onClick={() => setMode('import')}>
          코드 붙여넣기
        </ModeButton>
      </div>

      {mode === 'generated' ? (
        <>
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
        </>
      ) : (
        <>
          <label htmlFor="pythonSourceInput" style={{ fontSize: '13px', fontWeight: 500, color: '#333' }}>
            LangGraph Python 소스
          </label>
          <textarea
            id="pythonSourceInput"
            aria-label="그래프로 변환할 LangGraph Python 소스"
            rows={importResult ? 6 : 14}
            value={pythonSource}
            onChange={handleSourceChange}
            placeholder="StateGraph, add_node, add_edge 호출이 있는 Python 코드를 붙여넣으세요."
            spellCheck={false}
            style={{
              padding: '10px',
              border: '1px solid #aeb4bc',
              borderRadius: '6px',
              font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <button
            type="button"
            aria-label="붙여넣은 Python 코드를 그래프로 변환"
            onClick={handleConvert}
            style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: '6px', border: 'none', background: '#0d6efd', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
          >
            그래프로 변환
          </button>
          {importResult && (
            <ImportReview source={pythonSource} result={importResult} onApply={handleApply} />
          )}
        </>
      )}
    </div>
  );
}
