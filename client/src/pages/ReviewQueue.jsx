import clsx from 'clsx';
import { ArrowRight, Check, ClipboardCheck, Cpu, GitCompareArrows, MapPin, Pencil, Sprout, Target } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { useDiseases, useReviewDecision, useReviewMetrics, useReviewQueue } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useCropName } from '../components/domain.jsx';
import {
  Alert,
  ConfidenceBar,
  EmptyState,
  ErrorState,
  IconBadge,
  PageHeader,
  Pagination,
  Spinner,
  StatusBadge,
} from '../components/ui.jsx';
import { pct, relativeTime } from '../lib/format.js';

function ReviewCard({ scan, readOnly }) {
  const { t, i18n } = useTranslation();
  const decide = useReviewDecision();
  const cropName = useCropName();
  const [correcting, setCorrecting] = useState(false);
  const [diseaseKey, setDiseaseKey] = useState('');
  const [note, setNote] = useState('');
  const { data: options = [] } = useDiseases({ crop: scan.declaredCrop ?? undefined, includeHealthy: 'true' });

  const submit = (body) => decide.mutate({ id: scan.id, ...body, ...(note.trim() && { note: note.trim() }) });

  return (
    <li className="card flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 sm:p-5">
      <a
        href={scan.image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block shrink-0 self-start overflow-hidden rounded-card ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-md)] sm:w-52"
      >
        <img src={scan.image.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover sm:aspect-square" />
      </a>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
          <StatusBadge status={scan.status} isHealthy={scan.isHealthy} />
          <span className="inline-flex items-center gap-1">
            <Sprout className="size-3.5 text-brand-600" aria-hidden="true" />
            {t('reviews.declaredCrop', { crop: cropName(scan.declaredCrop) })}
          </span>
          <span>{relativeTime(scan.createdAt, i18n.language)}</span>
          {scan.owner?.district && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {scan.owner.district}
            </span>
          )}
        </div>

        <div className="rounded-card bg-surface-sunken p-4 ring-1 ring-line">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-subtle">
            <Cpu className="size-3.5" aria-hidden="true" />
            {t('reviews.modelSaid')}
          </p>
          {scan.predictions?.length ? (
            <ul className="space-y-3">
              {scan.predictions.map((p, i) => (
                <li key={p.label} className={clsx(i === 0 ? 'font-semibold text-brand-900' : 'text-ink-muted')}>
                  <ConfidenceBar
                    value={p.confidence}
                    label={options.find((o) => o.key === p.diseaseKey)?.commonName ?? p.label}
                    tone={i === 0 ? 'brand' : 'muted'}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{t('reviews.noDiagnosis')}</p>
          )}
          {scan.review?.correctedDiseaseKey && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-3 py-1 text-sm font-semibold text-ok ring-1 ring-ok/15">
              <ArrowRight className="size-3.5" aria-hidden="true" />
              {options.find((o) => o.key === scan.review.correctedDiseaseKey)?.commonName ?? scan.review.correctedDiseaseKey}
            </p>
          )}
        </div>

        {!readOnly && (
          <>
            {decide.error && <Alert tone="danger">{describeError(decide.error).message}</Alert>}
            {correcting && (
              <div className="space-y-2">
                <select
                  className="input"
                  value={diseaseKey}
                  onChange={(e) => setDiseaseKey(e.target.value)}
                  aria-label={t('reviews.choose')}
                >
                  <option value="" disabled>
                    {t('reviews.choose')}
                  </option>
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.commonName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <textarea
              className="input py-2.5"
              rows={2}
              maxLength={1000}
              placeholder={t('reviews.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {correcting ? (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!diseaseKey || decide.isPending}
                    onClick={() => submit({ action: 'correct', diseaseKey })}
                  >
                    {decide.isPending && <Spinner className="size-4 text-white" />}
                    {t('reviews.submit')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setCorrecting(false)}>
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  {scan.diseaseKey && (
                    <button type="button" className="btn-primary" disabled={decide.isPending} onClick={() => submit({ action: 'confirm' })}>
                      <Check className="size-4" aria-hidden="true" />
                      {t('reviews.confirm')}
                    </button>
                  )}
                  <button type="button" className="btn-outline" onClick={() => setCorrecting(true)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    {t('reviews.correct')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export default function ReviewQueue() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // A label check is expert advice that ends up on a farmer's result, so admins watch but do not decide.
  const canDecide = user?.role === 'expert';
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useReviewQueue({ status, page, limit: 10 });
  const metrics = useReviewMetrics();

  return (
    <div>
      <PageHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
      {!canDecide && (
        <Alert tone="info" className="mb-6">
          {t('reviews.adminReadOnly')}
        </Alert>
      )}

      {metrics.data && metrics.data.reviewed > 0 && (
        <section className="card mb-6 grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
          <div className="flex items-center gap-4">
            <IconBadge icon={Target} size="xl" />
            <div>
              <p className="text-sm font-medium text-ink-muted">{t('reviews.agreement')}</p>
              <p className="text-[2rem] font-extrabold leading-tight text-brand-900 tabular-nums">{pct(metrics.data.agreementRate)}</p>
              <p className="text-xs text-ink-subtle">{t('reviews.reviewedCount', { count: metrics.data.reviewed })}</p>
            </div>
          </div>
          {metrics.data.confusions.length > 0 && (
            <div className="border-line max-sm:border-t max-sm:pt-4 sm:border-l sm:pl-6">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-900">
                <GitCompareArrows className="size-4 text-brand-600" aria-hidden="true" />
                {t('reviews.confusions')}
              </p>
              <ul className="space-y-1.5 text-sm">
                {metrics.data.confusions.slice(0, 5).map((c) => (
                  <li key={`${c.predicted}-${c.actual}`} className="flex justify-between gap-3">
                    <span className="truncate">
                      {c.predicted ?? '—'} → {c.actual}
                    </span>
                    <span className="chip shrink-0 bg-canvas-deep text-ink-muted tabular-nums">×{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="mb-5 flex gap-1 rounded-full bg-surface p-1 shadow-[var(--shadow-xs)] ring-1 ring-line sm:w-fit" role="tablist">
        {['pending', 'confirmed', 'corrected'].map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={clsx(
              'min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-5',
              status === s
                ? 'bg-brand-700 text-white shadow-[var(--shadow-brand)]'
                : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
            )}
          >
            {t(`reviews.${s}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.items.length ? (
        <EmptyState icon={ClipboardCheck} title={t('reviews.empty')} />
      ) : (
        <>
          <ul className="space-y-4">
            {data.items.map((scan) => (
              <ReviewCard key={scan.id} scan={scan} readOnly={!canDecide || status !== 'pending'} />
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
