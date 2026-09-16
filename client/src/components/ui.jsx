import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { pct } from '../lib/format.js';

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-brand-700', className ?? 'size-5')} aria-hidden="true" />;
}

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status">
      <div className="flex items-center gap-3 text-ink-muted">
        <Spinner className="size-6" />
        <span>{t('common.loading')}</span>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Icon className="size-7" aria-hidden="true" />
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const { message } = describeError(error);
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <p className="font-semibold">{t('errors.generic')}</p>
      <p className="text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', children, className }) {
  const tones = {
    info: 'bg-info-bg text-info',
    warn: 'bg-warn-bg text-warn',
    danger: 'bg-danger-bg text-danger',
    ok: 'bg-ok-bg text-ok',
  };
  return <div className={clsx('rounded-xl px-4 py-3 text-sm font-medium', tones[tone], className)}>{children}</div>;
}

export function Field({ label, hint, error, htmlFor, optional, children }) {
  const { t } = useTranslation();
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-muted">({t('common.optional')})</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs font-medium text-danger" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

export function SeverityBadge({ severity }) {
  const { t } = useTranslation();
  if (!severity || severity === 'none') return null;
  const tone = { low: 'bg-ok-bg text-ok', moderate: 'bg-warn-bg text-warn', severe: 'bg-danger-bg text-danger' }[severity];
  return <span className={clsx('chip', tone)}>{t(`severity.${severity}`)}</span>;
}

export function StatusBadge({ status, isHealthy }) {
  const { t } = useTranslation();
  if (status !== 'rejected' && isHealthy) {
    return (
      <span className="chip bg-ok-bg text-ok">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t('status.healthy')}
      </span>
    );
  }
  const config = {
    confident: { cls: 'bg-brand-100 text-brand-800', Icon: ShieldCheck },
    uncertain: { cls: 'bg-warn-bg text-warn', Icon: HelpCircle },
    rejected: { cls: 'bg-black/5 text-ink-muted', Icon: XCircle },
  }[status];
  if (!config) return null;
  return (
    <span className={clsx('chip', config.cls)}>
      <config.Icon className="size-3.5" aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}

export function ConfidenceBar({ value, label, tone = 'brand' }) {
  const color = { brand: 'bg-brand-600', muted: 'bg-ink-muted/40', warn: 'bg-warn' }[tone];
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="font-semibold tabular-nums">{pct(value)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-black/5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label={label}
      >
        <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
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

export function StatCard({ label, value, icon: Icon, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', soil: 'bg-soil-100 text-soil-700' };
  return (
    <div className="card flex items-center gap-3 p-4">
      {Icon && (
        <div className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        <p className="truncate text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
