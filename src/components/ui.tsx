import React, { useEffect, useRef } from 'react';
import { X, Check, ChevronDown, Loader2 } from 'lucide-react';

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="rm-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#rm-mark)" />
      <path
        d="M10.2 23.2V8.8h6.1a4.7 4.7 0 0 1 0 9.4h-3.9l6.2 5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.4" cy="9.4" r="1.9" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="ReverseMind">
      <LogoMark size={25} />
      {!compact && (
        <span className="brand-name">
          Reverse<span>Mind</span>
        </span>
      )}
    </div>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  className = '',
  active = false,
  disabled = false,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'is-active' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  icon,
  onClick,
  disabled,
  type = 'button',
  className = '',
  testId,
}: {
  children?: React.ReactNode;
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} button-${size} ${className}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {icon && <span className="button-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'cyan';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
  testId,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const timer = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} ref={ref} role="dialog" aria-modal="true" data-testid={testId}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={440}
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} testId="confirm-cancel">
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            testId="confirm-ok"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input textarea ${props.className || ''}`} />;
}

export function Select({
  value,
  onChange,
  children,
  className = '',
  testId,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={`select-wrap ${className}`}>
      <select
        className="input select"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {children}
      </select>
      <ChevronDown size={14} className="select-chevron" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
          title={option.label}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" />;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {right}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="tooltip-wrap" data-tooltip={label}>
      {children}
    </span>
  );
}

export function AgentAvatar({
  name,
  color,
  size = 32,
  status,
}: {
  name: string;
  color: string;
  size?: number;
  status?: 'online' | 'idle' | 'running' | 'offline';
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="agent-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, ${color}, ${color}88)`,
      }}
    >
      {initials}
      {status && <span className={`agent-status status-${status}`} />}
    </span>
  );
}

export function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <span className="check-row">
      <Check size={14} /> {children}
    </span>
  );
}
