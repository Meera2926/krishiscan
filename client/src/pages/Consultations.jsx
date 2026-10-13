import clsx from 'clsx';
import { CalendarClock, ChevronRight, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultations } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MODE_ICONS, STATUS_TONE } from '../components/consultation.jsx';
import { EmptyState, ErrorState, IconBadge, Pagination, PageHeader, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

function ConsultationRow({ consultation, showFarmer }) {
  const { t, i18n } = useTranslation();
  const Icon = MODE_ICONS[consultation.mode] ?? UserCheck;
  const summary = consultation.caseSummary ?? {};
  // An unanswered offer is the one row that asks something of the farmer, so it gets the sunlight tint.
  const pending = consultation.decision === 'pending';

  return (
    <li>
      <Link to={`/consultations/${consultation.id}`} className="card-interactive group flex items-center gap-3.5 p-4 sm:gap-4 sm:p-5">
        <span className="relative shrink-0">
          {summary.imageUrl ? (
            <img src={summary.imageUrl} alt="" className="size-14 rounded-control object-cover ring-1 ring-line sm:size-16" />
          ) : (
            <IconBadge icon={Icon} size="xl" />
          )}
          {/* The mode sits on the photo as a small round badge, so call, chat and visit read at a glance. */}
          {summary.imageUrl && (
            <IconBadge icon={Icon} size="sm" tone="white" className="absolute -bottom-1.5 -right-1.5 shadow-[var(--shadow-sm)]" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-brand-900">{summary.diseaseName || t('consult.caseTitle')}</p>
            <p className="truncate text-sm text-ink-muted">
              {showFarmer && consultation.farmer?.name ? `${consultation.farmer.name} · ` : ''}
              {t(`consult.reason.${consultation.trigger}`)}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-subtle">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                {consultation.decision === 'scheduled' && consultation.scheduledFor
                  ? `${t(`consult.mode.${consultation.mode}`)} · ${shortDate(consultation.scheduledFor, i18n.language)}`
                  : consultation.expiresAt
                    ? t('consult.retentionNotice', { date: shortDate(consultation.expiresAt, i18n.language) })
                    : shortDate(consultation.createdAt, i18n.language)}
              </span>
            </p>
          </div>
          <span
            className={clsx(
              'chip w-fit shrink-0 ring-1',
              pending ? 'bg-accent-100 text-accent-700 ring-accent-700/15' : STATUS_TONE[consultation.status],
            )}
          >
            <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
            {pending ? t('consult.needsAnswer') : t(`consult.status.${consultation.status}`)}
          </span>
        </div>

        <ChevronRight
          className="size-5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export default function Consultations() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isExpert = ['expert', 'admin'].includes(user?.role);
  const [scope, setScope] = useState(isExpert ? 'queue' : 'mine');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useConsultations({ scope, page });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('consult.pageTitle')} subtitle={t(isExpert ? 'consult.pageSubtitleExpert' : 'consult.pageSubtitle')} />

      {isExpert && (
        <div className="mb-5 inline-flex max-w-full gap-1 rounded-full bg-surface p-1 shadow-[var(--shadow-xs)] ring-1 ring-line" role="tablist">
          {['queue', 'mine'].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={clsx(
                'min-h-10 rounded-full px-5 text-sm font-semibold transition-colors',
                scope === s ? 'bg-brand-700 text-white shadow-[var(--shadow-brand)]' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
              )}
              onClick={() => {
                setScope(s);
                setPage(1);
              }}
            >
              {t(`consult.scope.${s}`)}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid place-items-center py-16">
          <Spinner className="size-7" />
        </div>
      )}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title={t('consult.emptyTitle')}
          body={t(
            scope === 'queue' ? 'consult.emptyQueueBody' : isExpert ? 'consult.emptyMineBody' : 'consult.emptyBody',
          )}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {data.items.map((c) => (
              <ConsultationRow key={c.id} consultation={c} showFarmer={isExpert} />
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
