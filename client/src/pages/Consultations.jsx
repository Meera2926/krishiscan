import { CalendarClock, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultations } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MODE_ICONS } from '../components/consultation.jsx';
import { EmptyState, ErrorState, Pagination, PageHeader, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const STATUS_TONE = {
  open: 'bg-info-bg text-info',
  confirmed: 'bg-ok-bg text-ok',
  completed: 'bg-surface text-ink-muted border border-line',
  cancelled: 'bg-surface text-ink-muted border border-line',
  expired: 'bg-warn-bg text-warn',
};

function ConsultationRow({ consultation, showFarmer }) {
  const { t, i18n } = useTranslation();
  const Icon = MODE_ICONS[consultation.mode] ?? UserCheck;
  const summary = consultation.caseSummary ?? {};

  return (
    <li>
      <Link to={`/consultations/${consultation.id}`} className="card flex items-center gap-4 p-4 transition hover:border-brand-700">
        {summary.imageUrl ? (
          <img src={summary.imageUrl} alt="" className="size-14 shrink-0 rounded-xl border border-line object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-line">
            <Icon className="size-5 text-ink-muted" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{summary.diseaseName || t('consult.caseTitle')}</p>
          <p className="truncate text-sm text-ink-muted">
            {showFarmer && consultation.farmer?.name ? `${consultation.farmer.name} · ` : ''}
            {t(`consult.reason.${consultation.trigger}`)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {consultation.decision === 'scheduled' && consultation.scheduledFor
              ? `${t(`consult.mode.${consultation.mode}`)} · ${shortDate(consultation.scheduledFor, i18n.language)}`
              : consultation.expiresAt
                ? t('consult.retentionNotice', { date: shortDate(consultation.expiresAt, i18n.language) })
                : shortDate(consultation.createdAt, i18n.language)}
          </p>
        </div>
        <span className={`chip shrink-0 px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[consultation.status] ?? ''}`}>
          {consultation.decision === 'pending' ? t('consult.needsAnswer') : t(`consult.status.${consultation.status}`)}
        </span>
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
        <div className="mb-4 flex gap-2" role="tablist">
          {['queue', 'mine'].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'btn-primary' : 'btn-secondary'}
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

      {isLoading && <Spinner />}
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
