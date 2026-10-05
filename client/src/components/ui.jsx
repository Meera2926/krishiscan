import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { pct } from '../lib/format.js';

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-brand-600', className ?? 'size-5')} aria-hidden="true" />;
}

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Spinner className="size-7" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-[1.75rem] font-extrabold leading-[1.15] sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-5 grid size-16 place-items-center rounded-panel bg-gradient-to-b from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-200/70">
          <Icon className="size-7" aria-hidden="true" />
        </div>
      )}
      <p className="text-lg font-bold">{title}</p>
      {body && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const { message } = describeError(error);
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <div className="grid size-14 place-items-center rounded-panel bg-danger-bg text-danger ring-1 ring-danger/15">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <p className="text-lg font-bold">{t('errors.generic')}</p>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

const ALERT_TONES = {
  info: { wrap: 'bg-info-bg/70 text-info ring-info/15', bar: 'bg-info', Icon: Info },
  warn: { wrap: 'bg-warn-bg/70 text-warn ring-warn/20', bar: 'bg-warn', Icon: AlertTriangle },
  danger: { wrap: 'bg-danger-bg/70 text-danger ring-danger/20', bar: 'bg-danger', Icon: XCircle },
  ok: { wrap: 'bg-ok-bg/70 text-ok ring-ok/15', bar: 'bg-ok', Icon: CheckCircle2 },
};

export function Alert({ tone = 'info', children, className, icon = true }) {
  const { wrap, bar, Icon } = ALERT_TONES[tone] ?? ALERT_TONES.info;
  return (
    <div className={clsx('relative overflow-hidden rounded-card px-4 py-3 pl-5 text-sm font-medium ring-1', wrap, className)}>
      <span className={clsx('absolute inset-y-0 left-0 w-1', bar)} aria-hidden="true" />
      {icon ? (
        <div className="flex gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function Field({ label, hint, error, htmlFor, optional, children }) {
  const { t } = useTranslation();
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-subtle">({t('common.optional')})</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-semibold text-danger" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

export function SeverityBadge({ severity }) {
  const { t } = useTranslation();
  if (!severity || severity === 'none') return null;
  const tone = {
    low: 'bg-ok-bg text-ok ring-ok/15',
    moderate: 'bg-warn-bg text-warn ring-warn/20',
    severe: 'bg-danger-bg text-danger ring-danger/20',
  }[severity];
  return (
    <span className={clsx('chip ring-1', tone)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {t(`severity.${severity}`)}
    </span>
  );
}

export function StatusBadge({ status, isHealthy }) {
  const { t } = useTranslation();
  if (status !== 'rejected' && isHealthy) {
    return (
      <span className="chip bg-ok-bg text-ok ring-1 ring-ok/15">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t('status.healthy')}
      </span>
    );
  }
  const config = {
    confident: { cls: 'bg-brand-100 text-brand-800 ring-brand-300/40', Icon: ShieldCheck },
    uncertain: { cls: 'bg-warn-bg text-warn ring-warn/20', Icon: HelpCircle },
    rejected: { cls: 'bg-canvas-deep text-ink-muted ring-line-strong', Icon: XCircle },
  }[status];
  if (!config) return null;
  return (
    <span className={clsx('chip ring-1', config.cls)}>
      <config.Icon className="size-3.5" aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}

export function ConfidenceBar({ value, label, tone = 'brand' }) {
  const fill = {
    brand: 'bg-gradient-to-r from-brand-500 to-brand-600',
    muted: 'bg-ink-muted/35',
    warn: 'bg-gradient-to-r from-warn to-accent-700',
  }[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="font-bold tabular-nums">{pct(value)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-canvas-deep ring-1 ring-inset ring-ink/5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label={label}
      >
        <div
          className={clsx('h-full rounded-full transition-[width] duration-700 ease-out', fill)}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Pagination">
      <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('common.previous')}
      </button>
      <span className="text-sm text-ink-muted tabular-nums">{t('common.pageOf', { page, pages })}</span>
      <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('common.next')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

const STAT_TONES = {
  brand: 'from-brand-50 to-brand-100 text-brand-600 ring-brand-200/70',
  ok: 'from-ok-bg to-ok-bg text-ok ring-ok/15',
  warn: 'from-warn-bg to-accent-100 text-warn ring-warn/20',
  soil: 'from-soil-100 to-soil-100 text-soil-700 ring-soil-500/20',
};

export function StatCard({ label, value, icon: Icon, tone = 'brand' }) {
  return (
    <div className="card flex items-center gap-3.5 p-4">
      {Icon && (
        <div className={clsx('grid size-11 shrink-0 place-items-center rounded-control bg-gradient-to-b ring-1', STAT_TONES[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[1.75rem] font-extrabold leading-none tabular-nums">{value}</p>
        {/* Wraps rather than truncates: "Awaiting expert" loses its meaning cut short. */}
        <p className="mt-1.5 text-xs font-medium leading-snug text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
