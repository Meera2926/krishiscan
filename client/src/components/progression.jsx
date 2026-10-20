import clsx from 'clsx';
import { CalendarCheck, FlaskConical, Leaf, Minus, Plus, ShieldAlert, Trash2, TrendingDown, TrendingUp, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { useCreateTreatment, useDeleteTreatment, useDiseases } from '../api/hooks.js';
import { localName } from '../i18n/index.js';
import { shortDate } from '../lib/format.js';
import { Alert, Field, IconBadge, Spinner } from './ui.jsx';

const GRADE_LINES = [5, 10, 25, 50];

// Chart colours are SVG attributes, so the palette's values are spelled out once here: grid and
// axis in the mint neutrals, the trend in brand green, treatments in the info blue, and each
// reading by health (green, warm orange, danger red).
const C = {
  grid: '#e2eadf',
  axis: '#cad8c5',
  label: '#526357',
  line: '#2c723a',
  area: '#91c586',
  treatment: '#1d55a8',
  healthy: '#1d6b38',
  diseased: '#d0701c',
  severe: '#c42b2b',
};

export function TrendBadge({ trend }) {
  const { t } = useTranslation();
  const config = {
    worsening: { cls: 'bg-danger-bg text-danger ring-danger/20', Icon: TrendingUp },
    improving: { cls: 'bg-ok-bg text-ok ring-ok/15', Icon: TrendingDown },
    stable: { cls: 'bg-info-bg text-info ring-info/15', Icon: Minus },
    insufficient: { cls: 'bg-canvas-deep text-ink-muted ring-line-strong', Icon: Minus },
  }[trend ?? 'insufficient'];
  return (
    <span className={clsx('chip shrink-0 ring-1', config.cls)}>
      <config.Icon className="size-3.5" aria-hidden="true" />
      {t(`progression.trend.${trend ?? 'insufficient'}`)}
    </span>
  );
}

/** Severity (% leaf area) over time, with grade guide lines and treatment markers. Plain SVG. */
export function SeverityChart({ points, treatments = [] }) {
  const { t, i18n } = useTranslation();
  const readings = points.filter((p) => p.percent != null);
  if (readings.length === 0) return <p className="text-sm text-ink-muted">{t('progression.noReadings')}</p>;

  const W = 640;
  const H = 240;
  const pad = { l: 40, r: 16, t: 14, b: 30 };
  const times = [...readings.map((p) => +new Date(p.date)), ...treatments.map((tr) => +new Date(tr.appliedAt))];
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 - t0 < 864e5) {
    t0 -= 864e5;
    t1 += 864e5;
  }
  const yMax = Math.max(30, Math.ceil((Math.max(...readings.map((p) => p.percent)) + 5) / 10) * 10);
  const x = (d) => pad.l + ((+new Date(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const path = readings.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ');
  // A faint wash under the line, closed along the 0% axis, so the trend reads as a shape.
  const area = `${path} L${x(readings.at(-1).date).toFixed(1)},${y(0)} L${x(readings[0].date).toFixed(1)},${y(0)} Z`;

  return (
    <figure className="rounded-control bg-surface-sunken/70 p-2 ring-1 ring-line sm:p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('progression.chartLabel')}>
        {GRADE_LINES.filter((g) => g < yMax).map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke={C.grid} strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill={C.label}>
              {g}%
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke={C.axis} />
        <text x={pad.l - 6} y={y(0) + 4} textAnchor="end" fontSize="11" fill={C.label}>
          0%
        </text>

        {treatments.map((tr) => (
          <g key={tr.id}>
            <line x1={x(tr.appliedAt)} x2={x(tr.appliedAt)} y1={pad.t} y2={H - pad.b} stroke={C.treatment} strokeDasharray="4 3" />
            <text x={x(tr.appliedAt) + 4} y={pad.t + 10} fontSize="11" fontWeight="600" fill={C.treatment}>
              {tr.product.length > 16 ? `${tr.product.slice(0, 15)}…` : tr.product}
            </text>
          </g>
        ))}

        <path d={area} fill={C.area} fillOpacity="0.18" />
        <path d={path} fill="none" stroke={C.line} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {readings.map((p) => (
          <circle key={p.scanId} cx={x(p.date)} cy={y(p.percent)} r="5" fill={p.isHealthy ? C.healthy : p.percent > 25 ? C.severe : C.diseased} stroke="#fff" strokeWidth="2">
            <title>{`${shortDate(p.date, i18n.language)}: ${p.percent}%`}</title>
          </circle>
        ))}

        <text x={pad.l} y={H - 8} fontSize="11" fill={C.label}>
          {shortDate(t0, i18n.language)}
        </text>
        <text x={W - pad.r} y={H - 8} fontSize="11" fill={C.label} textAnchor="end">
          {shortDate(t1, i18n.language)}
        </text>
      </svg>
      <figcaption className="mt-2 text-xs text-ink-muted">{t('progression.caption')}</figcaption>
    </figure>
  );
}

export function ProgressionSummary({ summary }) {
  const { t } = useTranslation();
  if (!summary || summary.trend === 'insufficient') {
    return <p className="text-sm text-ink-muted">{t('progression.needMoreScans')}</p>;
  }
  const stats = [
    [t('progression.latest'), `${summary.latestPercent}%`],
    [t('progression.change'), `${summary.change > 0 ? '+' : ''}${summary.change} ${t('progression.points')}`],
    [t('progression.rate'), `${summary.slopePerDay > 0 ? '+' : ''}${summary.slopePerDay} ${t('progression.perDay')}`],
    ['AUDPC', `${summary.audpc}`],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-control bg-surface px-3 py-2.5 ring-1 ring-line">
            <dt className="text-xs font-medium text-ink-muted">{k}</dt>
            <dd className="mt-0.5 font-bold text-brand-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {summary.daysToSevere != null && (
        <Alert tone="danger" icon={false} className="flex gap-2.5">
          <ShieldAlert className="size-4 shrink-0 translate-y-0.5" aria-hidden="true" />
          <span>{t('progression.daysToSevere', { count: summary.daysToSevere })}</span>
        </Alert>
      )}
    </div>
  );
}

const EFFICACY_TONE = {
  effective: 'bg-ok-bg text-ok ring-ok/15',
  not_effective: 'bg-danger-bg text-danger ring-danger/20',
  no_change: 'bg-warn-bg text-warn ring-warn/20',
  awaiting_followup: 'bg-info-bg text-info ring-info/15',
  no_baseline: 'bg-canvas-deep text-ink-muted ring-line-strong',
  no_followup: 'bg-canvas-deep text-ink-muted ring-line-strong',
};

export function TreatmentLog({ plot, treatments, diseaseOptions }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const remove = useDeleteTreatment(plot.id);
  const lang = i18n.language;
  const safe = treatments.safeHarvestFrom;

  return (
    <div className="space-y-4">
      {safe && (
        <div
          className={clsx(
            'flex items-center gap-3 rounded-control p-3 text-sm ring-1',
            treatments.safeToHarvestNow ? 'bg-ok-bg text-ok ring-ok/15' : 'bg-warn-bg text-warn ring-warn/20',
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface/80">
            <CalendarCheck className="size-5" aria-hidden="true" />
          </span>
          <p className="font-medium">
            {treatments.safeToHarvestNow ? t('treatments.safeNow') : t('treatments.safeFrom', { date: shortDate(safe, lang) })}
          </p>
        </div>
      )}

      {treatments.items.length === 0 && !open && (
        <div className="flex items-start gap-3 rounded-control bg-surface-sunken p-4 ring-1 ring-line">
          <IconBadge icon={FlaskConical} size="sm" />
          <p className="text-sm leading-relaxed text-ink-muted">{t('treatments.empty')}</p>
        </div>
      )}

      <ul className="space-y-3">
        {treatments.items.map((tr) => (
          <li key={tr.id} className="rounded-control bg-surface p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-brand-900">
                  {tr.product}
                  {tr.activeIngredient && <span className="font-normal text-ink-muted"> · {tr.activeIngredient}</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {t(`treatments.type.${tr.type}`)} · {shortDate(tr.appliedAt, lang)}
                  {tr.dose && ` · ${tr.dose}`}
                  {tr.phiDays != null && ` · PHI ${tr.phiDays} d`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('chip ring-1', EFFICACY_TONE[tr.efficacy.status])}>{t(`treatments.efficacy.${tr.efficacy.status}`)}</span>
                <button
                  type="button"
                  className="btn-ghost min-h-9 rounded-full px-2.5 hover:text-danger"
                  aria-label={t('common.delete')}
                  disabled={remove.isPending}
                  onClick={() => window.confirm(t('common.confirmDelete')) && remove.mutate(tr.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {tr.efficacy.change != null
                ? t('treatments.changeLine', { before: tr.efficacy.before.percent, after: tr.efficacy.after.percent })
                : tr.efficacy.status === 'awaiting_followup'
                  ? t('treatments.rescanFrom', { date: shortDate(tr.efficacy.followUpFrom, lang) })
                  : tr.efficacy.status === 'no_baseline'
                    ? t('treatments.noBaselineHint')
                    : null}
            </p>
            {tr.consultationId && (
              // The spray did not work, so the app stops guessing and offers a person.
              <Link to={`/consultations/${tr.consultationId}`} className="btn-outline mt-3">
                <UserCheck className="size-4" aria-hidden="true" />
                {t('treatments.askExpert')}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {open ? (
        <TreatmentForm plot={plot} diseaseOptions={diseaseOptions} onDone={() => setOpen(false)} />
      ) : (
        <button type="button" className="btn-outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('treatments.add')}
        </button>
      )}
    </div>
  );
}

function TreatmentForm({ plot, diseaseOptions, onDone }) {
  const { t, i18n } = useTranslation();
  const create = useCreateTreatment(plot.id);
  const { data: diseases = [] } = useDiseases({ crop: plot.crop });
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: 'chemical', product: '', activeIngredient: '', dose: '', diseaseKey: diseaseOptions[0] ?? '', appliedAt: today, phiDays: '', notes: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fields = create.error ? describeError(create.error).fields : {};

  async function submit(e) {
    e.preventDefault();
    const body = { type: form.type, product: form.product, appliedAt: new Date(`${form.appliedAt}T12:00:00`).toISOString() };
    for (const k of ['activeIngredient', 'dose', 'notes']) if (form[k].trim()) body[k] = form[k].trim();
    if (form.diseaseKey) body.diseaseKey = form.diseaseKey;
    if (form.phiDays !== '') body.phiDays = Number(form.phiDays);
    const ok = await create.mutateAsync(body).catch(() => null);
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card bg-surface-sunken p-4 ring-1 ring-line sm:p-5">
      {create.error && <Alert tone="danger">{describeError(create.error).message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('treatments.typeLabel')} htmlFor="tr-type">
          <select id="tr-type" className="input" value={form.type} onChange={set('type')}>
            {['chemical', 'organic', 'cultural'].map((k) => (
              <option key={k} value={k}>
                {t(`treatments.type.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('treatments.disease')} htmlFor="tr-disease" optional>
          <select id="tr-disease" className="input" value={form.diseaseKey} onChange={set('diseaseKey')}>
            <option value="">{t('treatments.preventive')}</option>
            {diseases.map((d) => (
              <option key={d.key} value={d.key}>
                {localName(d, i18n.language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('treatments.product')} htmlFor="tr-product" error={fields.product}>
          <input id="tr-product" className="input" required maxLength={120} value={form.product} onChange={set('product')} placeholder={t('treatments.productPlaceholder')} />
        </Field>
        <Field label={t('result.activeIngredient')} htmlFor="tr-ai" optional>
          <input id="tr-ai" className="input" maxLength={120} value={form.activeIngredient} onChange={set('activeIngredient')} />
        </Field>
        <Field label={t('result.dose')} htmlFor="tr-dose" optional>
          <input id="tr-dose" className="input" maxLength={120} value={form.dose} onChange={set('dose')} />
        </Field>
        <Field label={t('treatments.appliedAt')} htmlFor="tr-date" error={fields.appliedAt}>
          <input id="tr-date" type="date" className="input" required max={today} value={form.appliedAt} onChange={set('appliedAt')} />
        </Field>
        <Field label={t('treatments.phi')} htmlFor="tr-phi" hint={t('treatments.phiHint')} optional>
          <input id="tr-phi" type="number" min="0" max="365" inputMode="numeric" className="input" value={form.phiDays} onChange={set('phiDays')} />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending && <Spinner className="size-4 text-white" />}
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

const COMPARE_TONES = {
  worse: { box: 'bg-danger-bg/60 ring-danger/20', text: 'text-danger', Icon: TrendingUp },
  better: { box: 'bg-ok-bg/70 ring-ok/20', text: 'text-ok', Icon: TrendingDown },
  same: { box: 'bg-surface-sunken ring-line', text: 'text-ink-muted', Icon: Minus },
};

/** This photo against the earlier one: the earlier photo, both percentages, and whether it got worse. */
function ScanComparison({ comparison }) {
  const { t, i18n } = useTranslation();
  const tone = COMPARE_TONES[comparison.direction] ?? COMPARE_TONES.same;
  const date = shortDate(comparison.previousDate, i18n.language);
  return (
    <div className={clsx('rounded-card p-4 ring-1', tone.box)}>
      <p className={clsx('flex items-center gap-2 font-bold', tone.text)}>
        <tone.Icon className="size-5 shrink-0" aria-hidden="true" />
        {t(`progression.compare.${comparison.direction}`, { change: Math.abs(comparison.change) })}
      </p>
      <div className="mt-3 flex items-center gap-3">
        {comparison.previousImageUrl && (
          <img src={comparison.previousImageUrl} alt="" className="size-16 shrink-0 rounded-control object-cover ring-1 ring-line" />
        )}
        <div className="min-w-0 text-sm">
          <p className="text-ink-muted">
            {t(comparison.basis === 'leaf' ? 'progression.compare.withLeaf' : 'progression.compare.withPlot', { date })}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-ink">
            {t('progression.compare.before')} {comparison.previousPercent}% <span aria-hidden="true">→</span>{' '}
            {t('progression.compare.now')} {comparison.currentPercent}%
          </p>
          <Link to={`/scans/${comparison.previousScanId}`} className="mt-0.5 inline-block font-semibold text-brand-700 underline">
            {t('progression.previousScan')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SeverityMeter({ severity, comparison }) {
  const { t } = useTranslation();
  if (!severity?.reliable || severity.percent == null) return null;
  const tone = severity.percent > 25 ? 'bg-danger' : severity.percent > 5 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <Leaf className="size-4 text-brand-700" aria-hidden="true" />
          {t('progression.severity')}
        </span>
        <span className="font-semibold tabular-nums">
          {severity.percent}% · {t('progression.grade', { grade: severity.grade })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-canvas-deep ring-1 ring-inset ring-ink/5" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={severity.percent} aria-label={t('progression.severity')}>
        <div className={clsx('h-full rounded-full', tone)} style={{ width: `${Math.max(2, severity.percent)}%` }} />
      </div>
      {comparison && <ScanComparison comparison={comparison} />}
      <p className="text-xs text-ink-muted">{t('progression.estimateNote')}</p>
    </div>
  );
}
