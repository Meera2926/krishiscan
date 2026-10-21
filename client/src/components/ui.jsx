import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Info, Leaf, Loader2, ShieldCheck, XCircle } from 'lucide-react';
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
        <h1 className="text-[1.75rem] font-extrabold leading-[1.15] text-brand-900 sm:text-[2.125rem]">{title}</h1>
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
        <div className="icon-badge mb-5 size-16">
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
      <div className="grid size-14 place-items-center rounded-full bg-danger-bg text-danger ring-1 ring-danger/15">
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
  brand: 'bg-brand-100 text-brand-700 ring-brand-700/10',
  ok: 'bg-ok-bg text-ok ring-ok/15',
  warn: 'bg-accent-100 text-accent-700 ring-accent-700/15',
  soil: 'bg-soil-100 text-soil-700 ring-soil-500/20',
};

export function StatCard({ label, value, icon: Icon, tone = 'brand' }) {
  return (
    // Icon above the figure on phones: in a half-width tile, a label beside the icon has too little room
    // for single long words such as Malayalam "ആരോഗ്യമുള്ളത്" and pushed the page wider than the screen.
    <div className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-3.5">
      {Icon && (
        <div className={clsx('grid size-10 shrink-0 place-items-center rounded-full ring-1 sm:size-12', STAT_TONES[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 max-w-full">
        <p className="text-[1.75rem] font-extrabold leading-none text-brand-900 tabular-nums">{value}</p>
        {/* Wraps rather than truncates: "Awaiting expert" loses its meaning cut short. */}
        <p className="mt-1.5 text-xs font-medium leading-snug text-ink-muted [overflow-wrap:anywhere]">{label}</p>
      </div>
    </div>
  );
}

const BADGE_TONES = {
  brand: 'bg-brand-100 text-brand-700 ring-brand-700/10',
  accent: 'bg-accent-100 text-accent-700 ring-accent-700/15',
  warn: 'bg-warn-bg text-warn ring-warn/20',
  danger: 'bg-danger-bg text-danger ring-danger/20',
  info: 'bg-info-bg text-info ring-info/15',
  white: 'bg-surface text-brand-700 ring-brand-700/10',
};
const BADGE_SIZES = { sm: ['size-8', 'size-4'], md: ['size-10', 'size-5'], lg: ['size-12', 'size-6'], xl: ['size-14', 'size-7'] };

/** A round tinted disc behind an icon — the design's mark for sections, features and statuses. */
export function IconBadge({ icon: Icon, tone = 'brand', size = 'md', className }) {
  const [box, glyph] = BADGE_SIZES[size] ?? BADGE_SIZES.md;
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-full ring-1', box, BADGE_TONES[tone] ?? BADGE_TONES.brand, className)}>
      <Icon className={glyph} aria-hidden="true" />
    </span>
  );
}

/** A heading for a block inside a page, with an optional icon badge and an action on the right. */
export function SectionTitle({ icon, tone = 'brand', children, action, as: Tag = 'h2', className }) {
  return (
    <div className={clsx('mb-4 flex items-center justify-between gap-3', className)}>
      <Tag className="flex min-w-0 items-center gap-2.5 text-lg font-bold text-brand-900">
        {icon && <IconBadge icon={icon} tone={tone} size="sm" />}
        <span className="min-w-0">{children}</span>
      </Tag>
      {action}
    </div>
  );
}

/**
 * The light welcome panel at the top of a home screen: mint wash, deep-green type, a faint leaf
 * drawn into the corner. Replaces the dark band, so deep green stays the colour of actions.
 */
export function HeroPanel({ eyebrow, title, subtitle, action, children, className }) {
  return (
    <header
      className={clsx(
        'animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-100 via-brand-50 to-surface px-6 py-7 ring-1 ring-brand-200/60 sm:px-8 sm:py-9',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-brand-200/45 blur-3xl" aria-hidden="true" />
      <Leaf
        className="pointer-events-none absolute -bottom-8 right-6 size-44 -rotate-12 fill-brand-200/40 text-brand-300/50 max-sm:hidden"
        strokeWidth={0.75}
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>}
          <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight text-brand-900 sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-ink-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </header>
  );
}
