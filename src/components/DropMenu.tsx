import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropOption {
  value: string;
  label: string;
  hint?: string;
}

/** Themed menu that replaces native <select>. Opens upward by default so it clears the screen edge. */
export function DropMenu({
  value,
  options,
  onChange,
  label,
  icon,
  testId,
  placement = 'up',
  align = 'left',
  title,
}: {
  value: string;
  options: DropOption[];
  onChange: (value: string) => void;
  label: string;
  icon?: React.ReactNode;
  testId?: string;
  placement?: 'up' | 'down';
  align?: 'left' | 'right';
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="drop" ref={ref}>
      <button
        type="button"
        className={`composer-select ${open ? 'open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title || label}
        data-testid={testId}
        data-value={value}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="drop-current">{current?.label ?? '—'}</span>
        <ChevronDown size={11} className={`drop-chevron ${open ? 'flip' : ''}`} />
      </button>
      {open && (
        <div className={`drop-pop ${placement} ${align}`} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              className={`drop-item ${option.value === value ? 'active' : ''}`}
              data-testid={testId ? `${testId}-option-${option.value || 'none'}` : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="drop-item-text">
                <b>{option.label}</b>
                {option.hint && <span>{option.hint}</span>}
              </span>
              {option.value === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small pill button that opens a floating panel under it. */
export function ChipPopover({
  label,
  icon,
  count,
  testId,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  testId?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="drop" ref={ref}>
      <button
        type="button"
        className={`top-chip ${open ? 'open' : ''}`}
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label}
        {count !== undefined && <span className="top-chip-count">{count}</span>}
      </button>
      {open && <div className="drop-pop panel down center">{children(() => setOpen(false))}</div>}
    </div>
  );
}
