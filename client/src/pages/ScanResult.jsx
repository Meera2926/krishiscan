import clsx from 'clsx';
import { ArrowLeft, BookOpen, Camera, CheckCircle2, Clock, HelpCircle, Share2, Trash2, UserCheck, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeleteScan, useScan, useUpdateScan } from '../api/hooks.js';
import { DiseaseAdvice, useCropName } from '../components/domain.jsx';
import { Alert, ConfidenceBar, ErrorState, FullPageSpinner, SeverityBadge } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';
import { pct, shortDate } from '../lib/format.js';

export default function ScanResult() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useScan(id);
  const updateScan = useUpdateScan(id);
  const deleteScan = useDeleteScan();
  const cropName = useCropName();

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { scan, disease, alternatives = {} } = data;
  const lang = i18n.language;
  const review = scan.review ?? {};
  const reviewed = review.status === 'confirmed' || review.status === 'corrected';
  const status = reviewed ? 'confident' : scan.status;
  const nameFor = (key) => localName(alternatives[key], lang) || key;

  const header = {
    confident: { Icon: CheckCircle2, tone: 'bg-brand-700 text-white', label: t('result.confident') },
    uncertain: { Icon: HelpCircle, tone: 'bg-warn-bg text-warn', label: t('result.uncertain') },
    rejected: { Icon: XCircle, tone: 'bg-black/5 text-ink', label: t('result.rejected') },
  }[status];

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/history" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('nav.history')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <img src={scan.image.url} alt="" className="aspect-square w-full rounded-2xl border border-line object-cover" />
          <div className="card space-y-2 p-4 text-sm">
            <p className="flex justify-between gap-2">
              <span className="text-ink-muted">{t('scan.crop')}</span>
              <span className="font-medium">{cropName(scan.declaredCrop)}</span>
            </p>
            {scan.plot?.name && (
              <p className="flex justify-between gap-2">
                <span className="text-ink-muted">{t('scan.plot')}</span>
                <Link to={`/plots/${scan.plot.id}`} className="truncate font-medium underline">
                  {scan.plot.name}
                </Link>
              </p>
            )}
            <p className="flex justify-between gap-2">
              <span className="text-ink-muted">{t('history.title')}</span>
              <span>{shortDate(scan.createdAt, lang)}</span>
            </p>
            {scan.location && (
              <label className="flex cursor-pointer items-center justify-between gap-2 pt-1">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <Share2 className="size-3.5" aria-hidden="true" />
                  {scan.shareLocation ? t('result.shareOn') : t('result.shareOff')}
                </span>
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={scan.shareLocation}
                  disabled={updateScan.isPending}
                  onChange={(e) => updateScan.mutate({ shareLocation: e.target.checked })}
                />
              </label>
            )}
          </div>

          {scan.quality?.warnings?.length > 0 && (
            <Alert tone="warn">
              <p className="mb-1 font-semibold">{t('result.quality')}</p>
              <ul className="list-inside list-disc font-normal">
                {scan.quality.warnings.map((w) => (
                  <li key={w}>{t(`result.qualityWarning.${w}`)}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex gap-2">
            <Link to="/scan" className="btn-primary flex-1">
              <Camera className="size-4" aria-hidden="true" />
              {t('result.scanAgain')}
            </Link>
            <button
              type="button"
              className="btn-danger"
              aria-label={t('common.delete')}
              disabled={deleteScan.isPending}
              onClick={() => {
                if (window.confirm(t('common.confirmDelete'))) {
                  deleteScan.mutate(scan.id, { onSuccess: () => navigate('/history', { replace: true }) });
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className={clsx('flex items-center gap-2 px-5 py-3 text-sm font-semibold', header.tone)}>
              <header.Icon className="size-5" aria-hidden="true" />
              {header.label}
            </div>
            <div className="space-y-5 p-5">
              {scan.status === 'rejected' && !reviewed ? (
                <p className="leading-relaxed">{t(`result.reason.${scan.statusReason}`)}</p>
              ) : disease?.isHealthy ? (
                <div>
                  <h1 className="text-2xl font-bold text-ok">{t('result.healthyTitle')}</h1>
                  <p className="mt-1 text-ink-muted">{t('result.healthyBody')}</p>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">{localName(disease, lang) || t('common.unknown')}</h1>
                    <SeverityBadge severity={disease?.severity} />
                  </div>
                  {lang !== 'en' && disease?.commonName && <p className="text-sm text-ink-muted">{disease.commonName}</p>}
                  {!reviewed && scan.statusReason !== 'ok' && (
                    <p className="mt-2 text-sm leading-relaxed text-warn">{t(`result.reason.${scan.statusReason}`)}</p>
                  )}
                </div>
              )}

              {review.status !== 'none' && (
                <div className={clsx('flex gap-3 rounded-xl p-3 text-sm', review.status === 'pending' ? 'bg-info-bg text-info' : 'bg-ok-bg text-ok')}>
                  {review.status === 'pending' ? <Clock className="size-5 shrink-0" aria-hidden="true" /> : <UserCheck className="size-5 shrink-0" aria-hidden="true" />}
                  <div>
                    <p className="font-semibold">{t(`result.review.${review.status}`)}</p>
                    {review.note && (
                      <p className="mt-1 text-ink">
                        <span className="font-medium">{t('result.expertNote')}:</span> {review.note}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {scan.predictions?.length > 0 && scan.status !== 'rejected' && (
                <div className="space-y-3">
                  <ConfidenceBar value={scan.top.confidence} label={`${t('result.confidence')}: ${nameFor(scan.top.diseaseKey)}`} tone={scan.status === 'confident' ? 'brand' : 'warn'} />
                  {scan.predictions.length > 1 && (
                    <>
                      <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('result.otherPossibilities')}</p>
                      {scan.predictions.slice(1).map((p) => (
                        <ConfidenceBar key={p.label} value={p.confidence} label={nameFor(p.diseaseKey)} tone="muted" />
                      ))}
                    </>
                  )}
                  {scan.cropProbability != null && (
                    <p className="text-xs text-ink-muted">{t('result.cropMatch', { pct: pct(scan.cropProbability) })}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {disease && (scan.status !== 'rejected' || reviewed) && (
            <section className="card p-5">
              <DiseaseAdvice disease={disease} />
              {!disease.isHealthy && (
                <Link to={`/library/${disease.key}`} className="btn-secondary mt-6">
                  <BookOpen className="size-4" aria-hidden="true" />
                  {t('result.viewDisease')}
                </Link>
              )}
            </section>
          )}

          <p className="text-center text-xs text-ink-muted">{t('result.model', { version: scan.modelVersion, ms: scan.inferenceMs ?? '—' })}</p>
        </div>
      </div>
    </div>
  );
}
