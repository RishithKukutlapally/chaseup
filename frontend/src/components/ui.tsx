import React from 'react';

type Tone = 'neutral' | 'ok' | 'warn' | 'fail' | 'info' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  ok: 'bg-[#dcfce7] text-status-success',
  warn: 'bg-[#fef3c7] text-status-warning',
  fail: 'bg-error-container text-on-error-container',
  info: 'bg-secondary-container text-on-secondary-container',
  accent: 'bg-primary-container text-white',
};

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'ok':
    case 'success':
    case 'Received':
    case 'approved_sent':
    case 'approved':
    case 'completed':
    case 'Completed':
      return 'ok';
    case 'warn':
    case 'simulated':
    case 'fallback_success':
    case 'pending_approval':
    case 'Draft_Ready':
    case 'Waived':
    case 'pending':
      return 'warn';
    case 'fail':
    case 'error':
    case 'timeout':
    case 'blocked_budget':
    case 'blocked_rate_limit':
    case 'disabled':
    case 'circuit_open':
    case 'Missing':
    case 'discarded':
    case 'failed':
      return 'fail';
    default:
      return 'neutral';
  }
}

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string; testId?: string }> = ({
  tone = 'neutral',
  children,
  title,
  testId,
}) => (
  <span
    title={title}
    data-testid={testId}
    className={`inline-flex items-center gap-1 px-space-xs py-space-2xs rounded font-label-sm text-label-sm uppercase whitespace-nowrap ${TONE_CLASSES[tone]}`}
  >
    {children}
  </span>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}> = ({ title, actions, children, className = '', testId }) => (
  <section
    data-testid={testId}
    className={`bg-surface-container-lowest rounded border border-border-hairline shadow-sm p-space-lg flex flex-col gap-space-md ${className}`}
  >
    {(title || actions) && (
      <header className="flex items-center justify-between gap-space-md flex-wrap">
        {title && <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>}
        {actions && <div className="flex items-center gap-space-sm flex-wrap">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-primary-container text-white hover:bg-on-primary-fixed-variant',
  secondary: 'bg-surface-container-lowest text-on-surface border border-border-structural hover:bg-surface-container-low',
  danger: 'bg-error text-white hover:bg-on-error-container',
  ghost: 'text-on-surface-variant hover:bg-surface-container-high',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; testId?: string }
> = ({ variant = 'secondary', className = '', testId, children, ...rest }) => (
  <button
    type="button"
    data-testid={testId}
    {...rest}
    className={`px-space-md py-space-xs rounded font-label-md text-label-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${BTN[variant]} ${className}`}
  >
    {children}
  </button>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone }> = ({
  label,
  value,
  sub,
  tone,
}) => (
  <div className="bg-surface-container-lowest rounded border border-border-hairline p-space-md flex flex-col gap-space-2xs">
    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</span>
    <span
      className={`font-headline-lg text-headline-lg ${tone === 'fail' ? 'text-error' : tone === 'ok' ? 'text-status-success' : 'text-on-surface'}`}
    >
      {value}
    </span>
    {sub && <span className="font-body-sm text-body-sm text-on-surface-variant">{sub}</span>}
  </div>
);

export const PageHeader: React.FC<{ title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  subtitle,
  actions,
}) => (
  <div className="flex items-start justify-between gap-space-md flex-wrap mb-space-lg">
    <div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
      {subtitle && <p className="font-body-md text-body-md text-on-surface-variant mt-space-2xs max-w-3xl">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-space-sm flex-wrap">{actions}</div>}
  </div>
);

export const Table: React.FC<{ head: React.ReactNode[]; children: React.ReactNode; testId?: string }> = ({
  head,
  children,
  testId,
}) => (
  <div className="overflow-x-auto">
    <table data-testid={testId} className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-border-structural">
          {head.map((h, i) => (
            <th key={i} className="py-space-xs pr-space-md font-label-sm text-label-sm uppercase text-on-surface-variant">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-body-sm text-body-sm text-on-surface">{children}</tbody>
    </table>
  </div>
);

export const Td: React.FC<{ children?: React.ReactNode; mono?: boolean; className?: string; title?: string }> = ({
  children,
  mono,
  className = '',
  title,
}) => (
  <td title={title} className={`py-space-xs pr-space-md align-top border-b border-border-hairline ${mono ? 'font-data-mono-sm text-data-mono-sm' : ''} ${className}`}>
    {children}
  </td>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; testId?: string }> = ({
  title,
  onClose,
  children,
  wide,
  testId,
}) => (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center overflow-y-auto p-space-xl" onClick={onClose}>
    <div
      role="dialog"
      aria-label={title}
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
      className={`bg-surface-container-lowest rounded shadow-lg border border-border-hairline w-full ${wide ? 'max-w-6xl' : 'max-w-xl'} p-space-xl flex flex-col gap-space-md`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>
      {children}
    </div>
  </div>
);

export const SimulatedBanner: React.FC<{ mode: string | undefined }> = ({ mode }) =>
  mode === 'simulated' ? (
    <div className="rounded border border-status-warning/40 bg-[#fef3c7] text-on-surface p-space-sm font-body-sm text-body-sm">
      <strong>SIMULATED MODE</strong> — no GOOGLE_API_KEY is configured. AI output is produced locally, and tokens and
      costs are estimates at list price, labelled "simulated".
    </div>
  ) : null;

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="flex flex-col gap-space-2xs">
    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</span>
    {children}
    {hint && <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span>}
  </label>
);

export const inputClass =
  'bg-surface-container-lowest border border-border-structural rounded px-space-sm py-space-xs font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-accent-blue disabled:bg-surface-container-low disabled:text-on-surface-variant';

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-body-md text-body-md text-on-surface-variant p-space-md text-center">{children}</p>
);

/** Prompt the user for a reason; returns null if cancelled or too short. */
export function askReason(question: string, min = 5): string | null {
  const r = window.prompt(question);
  if (r === null) return null;
  if (r.trim().length < min) {
    window.alert(`Please give a reason of at least ${min} characters.`);
    return null;
  }
  return r.trim();
}
