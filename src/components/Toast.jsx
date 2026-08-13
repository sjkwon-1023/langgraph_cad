import React, { useCallback, useEffect, useRef, useState } from 'react';

const TONES = {
  info: { background: '#0d6efd' },
  success: { background: '#198754' },
  error: { background: '#dc3545' },
};

/** Non-blocking user notifications. */
export function useToasts(timeout = 5000) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const timers = useRef(new Set());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info') => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, message, tone }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, timeout);
      timers.current.add(timer);
    },
    [dismiss, timeout],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
        maxWidth: 'min(560px, calc(100vw - 32px))',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            ...TONES[toast.tone],
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '6px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="알림 닫기"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
