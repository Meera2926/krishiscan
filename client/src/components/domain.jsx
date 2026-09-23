import { Bug, Droplets, FlaskConical, Leaf, ShieldAlert, ShieldCheck, Thermometer, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCrops } from '../api/hooks.js';
import { cropLabel, localName } from '../i18n/index.js';
import { relativeTime } from '../lib/format.js';
import { Alert, SeverityBadge, StatusBadge } from './ui.jsx';

export function CropSelect({ value, onChange, id, required, onlySupported = true, allowAll, allLabel }) {
  const { t, i18n } = useTranslation();
  const { data: crops = [] } = useCrops();
  const options = crops.filter((c) => !onlySupported || c.supportedByModel);
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}>
      {allowAll ? <option value="">{allLabel}</option> : <option value="" disabled>{t('scan.cropAuto')}</option>}
      {options.map((c) => (
        <option key={c.key} value={c.key}>
          {cropLabel(c, i18n.language)}
        </option>
      ))}
    </select>
  );
}

export function useCropName() {
  const { i18n } = useTranslation();
  const { data: crops = [] } = useCrops();
  return (key) => localName(crops.find((c) => c.key === key), i18n.language) || key;
}

/** Symptoms, causes, treatments and prevention for one disease. */
export function DiseaseAdvice({ disease, compact = false }) {
  const { t, i18n } = useTranslation();
  if (!disease) return null;

  if (disease.isHealthy) {
    return (
      <section className="space-y-4">
        {disease.symptoms && <p className="text-ink-muted">{disease.symptoms}</p>}
        <AdviceList icon={ShieldCheck} title={t('result.preventive')} items={disease.preventive} />
      </section>
    );
  }

  const fc = disease.favorableConditions ?? {};
  const hasConditions = [fc.tempMinC, fc.tempMaxC, fc.humidityPct, fc.leafWetnessHours, fc.rainfall].some((v) => v != null && v !== '');

  return (
    <section className="space-y-6">
      {disease.symptoms && (
        <div>
          <SectionTitle icon={Leaf}>{t('result.symptoms')}</SectionTitle>
          <p className="leading-relaxed">{disease.symptoms}</p>
        </div>
      )}

      {(disease.pathogen || disease.causalAgentType) && (
        <div>
          <SectionTitle icon={Bug}>{t('result.cause')}</SectionTitle>
          <p>
            {t(`library.agent.${disease.causalAgentType ?? 'none'}`)}
            {disease.pathogen && (
              <>
                {' — '}
                <em>{disease.pathogen}</em>
              </>
            )}
          </p>
        </div>
      )}

      {!compact && hasConditions && (
        <div>
          <SectionTitle icon={Thermometer}>{t('library.favorable')}</SectionTitle>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(fc.tempMinC != null || fc.tempMaxC != null) && (
              <Condition label={t('library.temp')} value={`${fc.tempMinC ?? '?'}–${fc.tempMaxC ?? '?'} °C`} />
            )}
            {fc.humidityPct != null && <Condition label={t('library.humidity')} value={`≥ ${fc.humidityPct}%`} />}
            {fc.leafWetnessHours != null && <Condition label={t('library.leafWetness')} value={`${fc.leafWetnessHours} h`} />}
            {fc.rainfall && <Condition label={t('library.rainfall')} value={fc.rainfall} />}
          </dl>
        </div>
      )}

      <AdviceList icon={Leaf} title={t('result.organic')} items={disease.organicControl} />

      {disease.chemicalControl?.length > 0 && (
        <div>
          <SectionTitle icon={FlaskConical}>{t('result.chemical')}</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('result.activeIngredient')}</th>
                  <th className="px-3 py-2 font-semibold">{t('result.dose')}</th>
                  <th className="px-3 py-2 font-semibold">{t('result.phi')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {disease.chemicalControl.map((c) => (
                  <tr key={`${c.activeIngredient}-${c.dose}`}>
                    <td className="px-3 py-2 font-medium">{c.activeIngredient}</td>
                    <td className="px-3 py-2">{c.dose}</td>
                    <td className="px-3 py-2 tabular-nums">{c.phiDays != null ? t('result.phiDays', { count: c.phiDays }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Alert tone="warn" className="mt-3 flex gap-2">
            <ShieldAlert className="size-4 shrink-0 translate-y-0.5" aria-hidden="true" />
            <span>{t('result.safety')}</span>
          </Alert>
        </div>
      )}

      <AdviceList icon={ShieldCheck} title={t('result.preventive')} items={disease.preventive} />

      {hostname(disease.sourceUrl) && (
        <p className="text-xs text-ink-muted">
          {t('result.source')}:{' '}
          <a href={disease.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">
            {hostname(disease.sourceUrl)}
          </a>
          {i18n.language !== 'en' && ' (English)'}
        </p>
      )}
    </section>
  );
}

function hostname(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : null;
  } catch {
    return null;
  }
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 font-semibold">
      <Icon className="size-4 text-brand-700" aria-hidden="true" />
      {children}
    </h3>
  );
}

function AdviceList({ icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 leading-relaxed">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Condition({ label, value }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

export function ScanCard({ scan }) {
  const { t, i18n } = useTranslation();
  const cropName = useCropName();
  const title =
    scan.status === 'rejected'
      ? t('status.rejected')
      : scan.disease
        ? localName(scan.disease, i18n.language)
        : scan.effectiveDiseaseKey ?? t('common.unknown');

  return (
    <Link to={`/scans/${scan.id}`} className="card group flex gap-3 overflow-hidden p-3 transition-shadow hover:shadow-md">
      <img
        src={scan.image.url}
        alt=""
        loading="lazy"
        width="80"
        height="80"
        className="size-20 shrink-0 rounded-xl object-cover bg-canvas"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={scan.status} isHealthy={scan.isHealthy} />
          {scan.status !== 'rejected' && !scan.isHealthy && <SeverityBadge severity={scan.disease?.severity} />}
          {scan.review?.status === 'pending' && (
            <span className="chip bg-info-bg text-info">
              <Timer className="size-3" aria-hidden="true" />
              {t('result.review.pending')}
            </span>
          )}
        </div>
        <p className="mt-1 truncate font-semibold group-hover:text-brand-800">{title}</p>
        <p className="truncate text-xs text-ink-muted">
          {cropName(scan.declaredCrop)}
          {scan.plot?.name && ` · ${scan.plot.name}`} · {relativeTime(scan.createdAt, i18n.language)}
        </p>
      </div>
    </Link>
  );
}

export function RiskLevelBadge({ level }) {
  const { t } = useTranslation();
  const tone = { high: 'bg-danger-bg text-danger', moderate: 'bg-warn-bg text-warn', low: 'bg-ok-bg text-ok', unknown: 'bg-black/5 text-ink-muted' }[level];
  return (
    <span className={`chip ${tone}`}>
      <Droplets className="size-3" aria-hidden="true" />
      {t(`risk.level.${level}`)}
    </span>
  );
}
