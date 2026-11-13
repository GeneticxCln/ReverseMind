import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" data-testid="toasts">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
          <span className="toast-dot" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="toast-title">{toast.title}</div>
            {toast.body && <div className="toast-body">{toast.body}</div>}
          </div>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
