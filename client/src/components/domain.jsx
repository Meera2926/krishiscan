import clsx from 'clsx';
import { Bug, ChevronRight, Droplets, FlaskConical, Leaf, ShieldAlert, ShieldCheck, Sprout, Thermometer, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCrops } from '../api/hooks.js';
import { cropLabel, localName } from '../i18n/index.js';
import { relativeTime } from '../lib/format.js';
import { Alert, SectionTitle, SeverityBadge, StatusBadge } from './ui.jsx';

export function CropSelect({ value, onChange, id, required, onlySupported = true, allowAll, allLabel }) {
  const { t, i18n } = useTranslation();
  const { data: crops = [] } = useCrops();
  const options = crops.filter((c) => !onlySupported || c.supportedByModel);
  return (
    <select id={id} className="input cursor-pointer" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}>
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

/**
 * Symptoms, causes, treatments and prevention for one disease, in two groups: what the disease is,
 * and what to do about it. By default both sit in one container the caller provides (the library
 * page wraps it in a card); with `cards` each group is its own white card, as on the result page,
 * and `footer` closes the last one.
 */
export function DiseaseAdvice({ disease, compact = false, cards = false, footer }) {
  const { t, i18n } = useTranslation();
  if (!disease) return null;

  const source = hostname(disease.sourceUrl) && (
    <p className="text-xs text-ink-muted">
      {t('result.source')}:{' '}
      <a href={disease.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline break-all">
        {hostname(disease.sourceUrl)}
      </a>
      {i18n.language !== 'en' && ' (English)'}
    </p>
  );

  if (disease.isHealthy) {
    const body = (
      <>
        {disease.symptoms && <p className="leading-relaxed text-ink-muted">{disease.symptoms}</p>}
        <AdviceList icon={ShieldCheck} title={t('result.preventive')} items={disease.preventive} />
      </>
    );
    return <AdviceGroups cards={cards} groups={[body]} footer={footer} />;
  }

  const fc = disease.favorableConditions ?? {};
  const hasConditions = [fc.tempMinC, fc.tempMaxC, fc.humidityPct, fc.leafWetnessHours, fc.rainfall].some((v) => v != null && v !== '');
  const hasCause = Boolean(disease.pathogen || disease.causalAgentType);
  const showConditions = !compact && hasConditions;
  const hasTreatment = disease.organicControl?.length > 0 || disease.chemicalControl?.length > 0 || disease.preventive?.length > 0;

  const about = (disease.symptoms || hasCause || showConditions) && (
    <>
      {disease.symptoms && (
        <div>
          <SectionTitle as="h3" icon={Leaf}>
            {t('result.symptoms')}
          </SectionTitle>
          <p className="leading-relaxed text-ink/90">{disease.symptoms}</p>
        </div>
      )}

      {hasCause && (
        <div>
          <SectionTitle as="h3" icon={Bug} tone="accent">
            {t('result.cause')}
          </SectionTitle>
          <p className="leading-relaxed">
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

      {showConditions && (
        <div>
          <SectionTitle as="h3" icon={Thermometer} tone="info">
            {t('library.favorable')}
          </SectionTitle>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(fc.tempMinC != null || fc.tempMaxC != null) && (
              <Condition label={t('library.temp')} value={`${fc.tempMinC ?? '?'}–${fc.tempMaxC ?? '?'} °C`} />
            )}
            {fc.humidityPct != null && <Condition label={t('library.humidity')} value={`≥ ${fc.humidityPct}%`} />}
            {fc.leafWetnessHours != null && <Condition label={t('library.leafWetness')} value={`${fc.leafWetnessHours} h`} />}
            {fc.rainfall && (
              <div className="col-span-full rounded-control bg-surface-sunken px-3.5 py-2.5 ring-1 ring-line">
                <dt className="text-xs font-medium text-ink-muted">{t('library.rainfall')}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed">{fc.rainfall}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );

  const treatment = hasTreatment && (
    <>
      <AdviceList icon={Sprout} title={t('result.organic')} items={disease.organicControl} />

      {disease.chemicalControl?.length > 0 && (
        <div>
          <SectionTitle as="h3" icon={FlaskConical} tone="warn">
            {t('result.chemical')}
          </SectionTitle>
          <div className="overflow-x-auto rounded-control ring-1 ring-line">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-brand-50 text-xs font-bold uppercase tracking-[0.08em] text-brand-800">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">{t('result.activeIngredient')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{t('result.dose')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{t('result.phi')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {disease.chemicalControl.map((c) => (
                  <tr key={`${c.activeIngredient}-${c.dose}`}>
                    <td className="px-3.5 py-2.5 font-medium">{c.activeIngredient}</td>
                    <td className="px-3.5 py-2.5">{c.dose}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{c.phiDays != null ? t('result.phiDays', { count: c.phiDays }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Alert's own triangle is swapped for the shield, so the warning carries one icon, not two. */}
          <Alert tone="warn" className="mt-3" icon={false}>
            <div className="flex gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t('result.safety')}</span>
            </div>
          </Alert>
        </div>
      )}

      <AdviceList icon={ShieldCheck} title={t('result.preventive')} items={disease.preventive} />
    </>
  );

  const groups = [about, treatment].filter(Boolean);
  return <AdviceGroups cards={cards} groups={groups} footer={source || footer ? <>{source}{footer}</> : null} />;
}

/** One card per group, or the groups stacked in one container with a hairline between them. */
function AdviceGroups({ cards, groups, footer }) {
  if (cards) {
    if (!groups.length && !footer) return null;
    const blocks = groups.length ? groups : [null];
    return (
      <div className="space-y-6">
        {blocks.map((g, i) => (
          <section key={i} className="card space-y-6 p-5 sm:p-6">
            {g}
            {i === blocks.length - 1 && footer && <div className="space-y-4">{footer}</div>}
          </section>
        ))}
      </div>
    );
  }
  return (
    <section className="space-y-6">
      {groups.map((g, i) => (
        <div key={i} className="space-y-6">
          {i > 0 && <hr className="rule" />}
          {g}
        </div>
      ))}
      {footer && <div className="space-y-4">{footer}</div>}
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

function AdviceList({ icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <SectionTitle as="h3" icon={icon}>
        {title}
      </SectionTitle>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 leading-relaxed">
            <span className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-brand-500 ring-[3px] ring-brand-100" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Condition({ label, value }) {
  return (
    <div className="rounded-control bg-surface-sunken px-3.5 py-2.5 ring-1 ring-line">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-bold text-brand-900 tabular-nums">{value}</dd>
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
    <Link to={`/scans/${scan.id}`} className="card-interactive group flex items-center gap-3.5 overflow-hidden p-3 sm:pr-4">
      <img
        src={scan.image.url}
        alt=""
        loading="lazy"
        width="80"
        height="80"
        className="size-20 shrink-0 rounded-xl bg-canvas-deep object-cover ring-1 ring-line"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={scan.status} isHealthy={scan.isHealthy} />
          {scan.status !== 'rejected' && !scan.isHealthy && <SeverityBadge severity={scan.disease?.severity} />}
          {/* The agronomist label check is our own quality control. A farmer only needs to know
              it is happening, so it is an icon with a tooltip, not a sentence across the card. */}
          {scan.review?.status === 'pending' && (
            <span
              className="grid size-5 place-items-center rounded-full bg-info-bg text-info ring-1 ring-info/15"
              title={t('result.review.pending')}
              aria-label={t('result.review.pending')}
            >
              <Timer className="size-3" aria-hidden="true" />
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate font-bold leading-snug text-brand-900 transition-colors group-hover:text-brand-700">{title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {cropName(scan.declaredCrop)}
          {scan.plot?.name && ` · ${scan.plot.name}`} · {relativeTime(scan.createdAt, i18n.language)}
        </p>
      </div>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-100"
        aria-hidden="true"
      >
        <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function RiskLevelBadge({ level }) {
  const { t } = useTranslation();
  const tone = {
    high: 'bg-danger-bg text-danger ring-danger/20',
    moderate: 'bg-warn-bg text-warn ring-warn/20',
    low: 'bg-ok-bg text-ok ring-ok/15',
    unknown: 'bg-canvas-deep text-ink-muted ring-line-strong',
  }[level];
  return (
    <span className={clsx('chip ring-1', tone)}>
      <Droplets className="size-3" aria-hidden="true" />
      {t(`risk.level.${level}`)}
    </span>
  );
}
