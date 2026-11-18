import React from 'react';

import { parseStatus } from '../lib/widgets';

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'big';
  testId?: string;
};

export const Button: React.FC<BtnProps> = ({ variant = 'secondary', size = 'md', testId, className = '', ...rest }) => (
  <button
    type="button"
    data-testid={testId}
    className={`btn ${variant === 'secondary' ? '' : variant} ${size === 'md' ? '' : size} ${className}`.trim()}
    {...rest}
  />
);

export const Chip: React.FC<{ tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral'; children: React.ReactNode; testId?: string }> = ({
  tone = 'neutral',
  children,
  testId,
}) => (
  <span className={`chip ${tone === 'neutral' ? '' : tone}`} data-testid={testId}>
    {children}
  </span>
);

/** Renders "good:Text" style specs as a chip; anything else renders nothing. */
export const StatusChip: React.FC<{ spec?: string | null }> = ({ spec }) => {
  const s = parseStatus(spec);
  return s ? <Chip tone={s.status}>{s.text}</Chip> : null;
};

export const Card: React.FC<{
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  style?: React.CSSProperties;
}> = ({ title, aside, children, className = '', testId, style }) => (
  <section className={`card ${className}`} data-testid={testId} style={style}>
    {(title || aside) && (
      <div className="ch">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        {aside}
      </div>
    )}
    <div className="cb">{children}</div>
  </section>
);

export const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; hint?: string }> = ({
  label,
  htmlFor,
  children,
  hint,
}) => (
  <div className="field">
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <span className="small dim">{hint}</span>}
  </div>
);

export const ErrorBanner: React.FC<{ message: string | null; testId?: string }> = ({ message, testId }) =>
  message ? (
    <div className="banner bad" role="alert" data-testid={testId ?? 'error'}>
      {message}
    </div>
  ) : null;

export const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="empty" aria-busy="true">
    {label}
  </div>
);

/** An inline "reason" row used instead of window.prompt. */
export const ReasonRow: React.FC<{
  id: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  minLength?: number;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  testId?: string;
}> = ({ id, label, placeholder, confirmLabel, minLength = 5, busy, onConfirm, onCancel, testId }) => {
  const [reason, setReason] = React.useState('');
  const ok = reason.trim().length >= minLength;
  return (
    <div className="confirm" data-testid={testId}>
      <div className="field" style={{ flex: '1 1 240px' }}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          className="input"
          value={reason}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) onConfirm(reason.trim());
            if (e.key === 'Escape') onCancel();
          }}
          data-testid={testId ? `${testId}-input` : undefined}
        />
      </div>
      <div className="row">
        <Button variant="primary" disabled={!ok || busy} onClick={() => onConfirm(reason.trim())} testId={testId ? `${testId}-confirm` : undefined}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
