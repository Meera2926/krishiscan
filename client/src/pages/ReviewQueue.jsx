import clsx from 'clsx';
import { Check, ClipboardCheck, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { useDiseases, useReviewDecision, useReviewMetrics, useReviewQueue } from '../api/hooks.js';
import { useCropName } from '../components/domain.jsx';
import { Alert, EmptyState, ErrorState, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui.jsx';
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
    <li className="card overflow-hidden sm:flex">
      <a href={scan.image.url} target="_blank" rel="noopener noreferrer" className="block sm:w-56 sm:shrink-0">
        <img src={scan.image.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
      </a>
      <div className="flex-1 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <StatusBadge status={scan.status} isHealthy={scan.isHealthy} />
          <span>{t('reviews.declaredCrop', { crop: cropName(scan.declaredCrop) })}</span>
          <span>· {relativeTime(scan.createdAt, i18n.language)}</span>
          {scan.owner?.district && <span>· {scan.owner.district}</span>}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('reviews.modelSaid')}</p>
          {scan.predictions?.length ? (
            <ul className="mt-1 space-y-0.5 text-sm">
              {scan.predictions.map((p, i) => (
                <li key={p.label} className={clsx('flex justify-between gap-3', i === 0 && 'font-semibold')}>
                  <span className="truncate">{options.find((o) => o.key === p.diseaseKey)?.commonName ?? p.label}</span>
                  <span className="tabular-nums">{pct(p.confidence)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{t('reviews.noDiagnosis')}</p>
          )}
          {scan.review?.correctedDiseaseKey && (
            <p className="mt-2 text-sm font-medium text-ok">→ {options.find((o) => o.key === scan.review.correctedDiseaseKey)?.commonName ?? scan.review.correctedDiseaseKey}</p>
          )}
        </div>

        {!readOnly && (
          <>
            {decide.error && <Alert tone="danger">{describeError(decide.error).message}</Alert>}
            {correcting && (
              <div className="space-y-2">
                <select className="input" value={diseaseKey} onChange={(e) => setDiseaseKey(e.target.value)} aria-label={t('reviews.choose')}>
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
            <textarea className="input py-2" rows={2} maxLength={1000} placeholder={t('reviews.note')} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {correcting ? (
                <>
                  <button type="button" className="btn-primary" disabled={!diseaseKey || decide.isPending} onClick={() => submit({ action: 'correct', diseaseKey })}>
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
                  <button type="button" className="btn-secondary" onClick={() => setCorrecting(true)}>
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
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useReviewQueue({ status, page, limit: 10 });
  const metrics = useReviewMetrics();

  return (
    <div>
      <PageHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />

      {metrics.data && metrics.data.reviewed > 0 && (
        <section className="card mb-6 grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
          <div>
            <p className="text-sm text-ink-muted">{t('reviews.agreement')}</p>
            <p className="text-3xl font-bold tabular-nums">{pct(metrics.data.agreementRate)}</p>
            <p className="text-xs text-ink-muted">{t('reviews.reviewedCount', { count: metrics.data.reviewed })}</p>
          </div>
          {metrics.data.confusions.length > 0 && (
            <div className="sm:border-l sm:border-line sm:pl-5">
              <p className="mb-1 text-sm font-semibold">{t('reviews.confusions')}</p>
              <ul className="space-y-0.5 text-sm">
                {metrics.data.confusions.slice(0, 5).map((c) => (
                  <li key={`${c.predicted}-${c.actual}`} className="flex justify-between gap-3">
                    <span className="truncate">
                      {c.predicted ?? '—'} → {c.actual}
                    </span>
                    <span className="tabular-nums text-ink-muted">×{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="mb-4 flex gap-1 rounded-xl bg-black/5 p-1 sm:w-fit" role="tablist">
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
            className={clsx('flex-1 rounded-lg px-4 py-2 text-sm font-medium', status === s ? 'bg-surface shadow-sm' : 'text-ink-muted')}
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
              <ReviewCard key={scan.id} scan={scan} readOnly={status !== 'pending'} />
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
