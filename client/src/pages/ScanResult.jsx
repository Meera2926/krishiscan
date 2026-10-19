import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  HelpCircle,
  ImageUp,
  MapPin,
  Share2,
  Sprout,
  Trash2,
  UserCheck,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeleteScan, useScan, useUpdateScan } from '../api/hooks.js';
import { ConsultationOffer } from '../components/consultation.jsx';
import { FollowUpCard, OrganicRemedies } from '../components/remedies.jsx';
import { DiseaseAdvice, useCropName } from '../components/domain.jsx';
import { SeverityMeter } from '../components/progression.jsx';
import { useSpeech } from '../lib/useSpeech.js';
import { Alert, ConfidenceBar, ErrorState, FullPageSpinner, SeverityBadge } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';
import { pct, shortDate } from '../lib/format.js';

/**
 * Reads the result aloud: the verdict in the farmer's language, then the advisory text in
 * English, since the knowledge base is English. Hidden when the device has no voices.
 */
function ListenButton({ scan, disease, className }) {
  const { t, i18n } = useTranslation();
  const { supported, speaking, speak, stop, hasVoiceFor } = useSpeech();
  const lang = i18n.language;
  if (!supported || !hasVoiceFor(lang)) return null;

  const build = () => {
    const name = localName(disease, lang) || t('common.unknown');
    const lines = [];
    if (scan.status === 'rejected') lines.push(t(`result.reason.${scan.statusReason}`));
    else if (disease?.isHealthy) lines.push(`${t('result.healthyTitle')}. ${t('result.healthyBody')}`);
    else {
      lines.push(`${t(`result.${scan.status === 'confident' ? 'confident' : 'uncertain'}`)}: ${name}.`);
      if (scan.top) lines.push(`${t('result.confidence')} ${Math.round(scan.top.confidence * 100)} %.`);
      if (scan.severity?.reliable) lines.push(`${t('progression.severity')} ${scan.severity.percent} %.`);
      if (scan.statusReason !== 'ok') lines.push(t(`result.reason.${scan.statusReason}`));
    }
    const parts = [{ text: lines.join(' '), lang }];
    const advice = [...(disease?.organicControl ?? []), ...(disease?.preventive ?? [])].slice(0, 3);
    // Advisory content is written in English, so read it with an English voice.
    if (advice.length) parts.push({ text: advice.join('. '), lang: 'en' });
    return parts;
  };

  return (
    <button
      type="button"
      className={clsx(
        'ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface/80 px-3 text-xs font-semibold ring-1 ring-current/15 transition-colors hover:bg-surface',
        className,
      )}
      onClick={() => (speaking ? stop() : speak(build()))}
      aria-pressed={speaking}
    >
      {speaking ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
      {speaking ? t('voice.stop') : t('voice.listen')}
    </button>
  );
}

/** The verdict card's tint, by outcome: red for a disease, green for healthy, amber when unsure, grey when rejected. */
const VERDICT = {
  disease: { wrap: 'bg-danger-bg border-danger/15', badge: 'bg-surface text-danger ring-danger/20', text: 'text-danger', Icon: AlertTriangle },
  healthy: { wrap: 'bg-ok-bg border-ok/15', badge: 'bg-surface text-ok ring-ok/20', text: 'text-ok', Icon: CheckCircle2 },
  uncertain: { wrap: 'bg-warn-bg border-warn/20', badge: 'bg-surface text-warn ring-warn/25', text: 'text-warn', Icon: HelpCircle },
  rejected: { wrap: 'bg-canvas-deep border-line-strong', badge: 'bg-surface text-ink-muted ring-line-strong', text: 'text-ink-muted', Icon: XCircle },
};

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

  const { scan, disease, alternatives = {}, remedies = [], followUp = null } = data;
  const lang = i18n.language;
  const review = scan.review ?? {};
  const reviewed = review.status === 'confirmed' || review.status === 'corrected';
  const status = reviewed ? 'confident' : scan.status;
  const nameFor = (key) => localName(alternatives[key], lang) || key;

  const label = { confident: t('result.confident'), uncertain: t('result.uncertain'), rejected: t('result.rejected') }[status];
  // Same branches as the verdict text below; an unsure "healthy" stays amber so the doubt is not hidden by green.
  const outcome =
    scan.status === 'rejected' && !reviewed ? 'rejected' : status === 'uncertain' ? 'uncertain' : disease?.isHealthy ? 'healthy' : 'disease';
  const tone = VERDICT[outcome];
  // The chip repeats the model's confidence only when it is about the name shown; after an expert
  // correction the top prediction is a different disease, and the bars below say which.
  const showChip = scan.top && scan.status !== 'rejected' && scan.top.diseaseKey === disease?.key;

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/history" className="btn-ghost -ml-3 mb-3">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('nav.history')}
      </Link>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="space-y-5">
          <img
            src={scan.image.url}
            alt=""
            className="aspect-square w-full rounded-panel bg-canvas-deep object-cover shadow-md ring-1 ring-line"
          />

          <div className="card divide-y divide-line px-5 py-1.5 text-sm">
            <p className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex items-center gap-2 text-ink-muted">
                <Sprout className="size-4 text-brand-600" aria-hidden="true" />
                {t('scan.crop')}
              </span>
              <span className="font-semibold text-brand-900">{cropName(scan.declaredCrop)}</span>
            </p>
            {scan.plot?.name && (
              <p className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-ink-muted">
                  <MapPin className="size-4 text-brand-600" aria-hidden="true" />
                  {t('scan.plot')}
                </span>
                <Link to={`/plots/${scan.plot.id}`} className="truncate font-semibold text-brand-700 underline underline-offset-2">
                  {scan.plot.name}
                </Link>
              </p>
            )}
            <p className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex items-center gap-2 text-ink-muted">
                <CalendarDays className="size-4 text-brand-600" aria-hidden="true" />
                {t('history.title')}
              </span>
              <span className="font-medium">{shortDate(scan.createdAt, lang)}</span>
            </p>
            {scan.location && (
              <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-ink-muted">
                  <Share2 className="size-4 text-brand-600" aria-hidden="true" />
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
              <p className="mb-1.5 font-semibold">{t('result.quality')}</p>
              <ul className="space-y-1 font-normal">
                {scan.quality.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />
                    {t(`result.qualityWarning.${w}`)}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex gap-2">
            <Link to="/scan" className="btn-outline flex-1">
              <ImageUp className="size-4" aria-hidden="true" />
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

        <div className="min-w-0 space-y-6">
          <section className="card animate-rise overflow-hidden">
            <div className={clsx('border-b p-5 sm:p-6', tone.wrap)}>
              <div className="flex items-start gap-4">
                <span className={clsx('grid size-12 shrink-0 place-items-center rounded-full shadow-xs ring-1', tone.badge)}>
                  <tone.Icon className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-h-9 items-center gap-2">
                    <p className={clsx('text-sm font-semibold', tone.text)}>{label}</p>
                    <ListenButton scan={scan} disease={disease} className={tone.text} />
                  </div>

                  {scan.status === 'rejected' && !reviewed ? (
                    <p className="mt-1 leading-relaxed text-ink">{t(`result.reason.${scan.statusReason}`)}</p>
                  ) : disease?.isHealthy ? (
                    <div className="mt-0.5">
                      <h1 className="text-2xl font-extrabold leading-tight text-ok sm:text-[1.75rem]">{t('result.healthyTitle')}</h1>
                      <p className="mt-1.5 leading-relaxed text-ink-muted">{t('result.healthyBody')}</p>
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      <h1 className="text-2xl font-extrabold leading-tight text-brand-900 sm:text-[1.75rem]">
                        {localName(disease, lang) || t('common.unknown')}
                      </h1>
                      {lang !== 'en' && disease?.commonName && <p className="mt-0.5 text-sm text-ink-muted">{disease.commonName}</p>}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden">
                    {outcome !== 'rejected' && !disease?.isHealthy && <SeverityBadge severity={disease?.severity} />}
                    {showChip && (
                      <span className={clsx('chip bg-surface/85 ring-1 ring-current/20 tabular-nums', tone.text)}>
                        {t('result.confidence')}: {pct(scan.top.confidence)}
                      </span>
                    )}
                  </div>

                  {outcome !== 'rejected' && !disease?.isHealthy && !reviewed && scan.statusReason !== 'ok' && (
                    <p className="mt-3 text-sm leading-relaxed text-warn">{t(`result.reason.${scan.statusReason}`)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* empty:hidden: a rejected scan with no review, offer or bars has nothing to put here. */}
            <div className="space-y-5 p-5 empty:hidden sm:p-6">
              {review.status !== 'none' && (
                <div
                  className={clsx(
                    'flex gap-3 rounded-control p-3.5 text-sm ring-1',
                    review.status === 'pending' ? 'bg-info-bg/70 text-info ring-info/15' : 'bg-ok-bg/70 text-ok ring-ok/15',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-current/15">
                    {review.status === 'pending' ? <Clock className="size-4" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="font-semibold">{t(`result.review.${review.status}`)}</p>
                    {review.note && (
                      <p className="mt-1 leading-relaxed text-ink">
                        <span className="font-medium">{t('result.expertNote')}:</span> {review.note}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {scan.status !== 'rejected' && <SeverityMeter severity={scan.severity} comparison={data.comparison} />}

              {data.consultation && <ConsultationOffer consultation={data.consultation} />}

              {scan.predictions?.length > 0 && scan.status !== 'rejected' && (
                <div className="space-y-3">
                  <ConfidenceBar
                    value={scan.top.confidence}
                    label={`${t('result.confidence')}: ${nameFor(scan.top.diseaseKey)}`}
                    tone={scan.status === 'confident' ? 'brand' : 'warn'}
                  />
                  {scan.predictions.length > 1 && (
                    <div className="space-y-3 rounded-control bg-surface-sunken p-4 ring-1 ring-line">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">{t('result.otherPossibilities')}</p>
                      {scan.predictions.slice(1).map((p) => (
                        <ConfidenceBar key={p.label} value={p.confidence} label={nameFor(p.diseaseKey)} tone="muted" />
                      ))}
                    </div>
                  )}
                  {scan.cropProbability != null && (
                    <p className="text-xs text-ink-muted">{t('result.cropMatch', { pct: pct(scan.cropProbability) })}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {followUp && <FollowUpCard followUp={followUp} plotId={scan.plot?.id} />}

          {!disease?.isHealthy && <OrganicRemedies remedies={remedies} sourceUrl={disease?.sourceUrl} />}

          {disease && (scan.status !== 'rejected' || reviewed) && (
            <DiseaseAdvice
              disease={disease}
              cards
              footer={
                !disease.isHealthy && (
                  <Link to={`/library/${disease.key}`} className="btn-outline">
                    <BookOpen className="size-4" aria-hidden="true" />
                    {t('result.viewDisease')}
                  </Link>
                )
              }
            />
          )}

          <p className="text-center text-xs text-ink-muted">{t('result.model', { version: scan.modelVersion, ms: scan.inferenceMs ?? '—' })}</p>
        </div>
      </div>
    </div>
  );
}
