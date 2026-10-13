import { AlertTriangle, ArrowRight, BarChart3, Bug, Camera, CheckCircle2, ClipboardList, Map, Plus, ScanLine, Sprout, UserCheck } from 'lucide-react';
import { MODE_ICONS } from '../components/consultation.jsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultationSummary, useConsultations, useOutbreakAlerts, usePlots, useScans, useScanSummary } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { ScanCard } from '../components/domain.jsx';
import { EmptyState, HeroPanel, IconBadge, SectionTitle, SeverityBadge, Spinner, StatCard } from '../components/ui.jsx';
import { relativeTime, shortDate } from '../lib/format.js';

/**
 * Scans per week as plain CSS bars; a charting library would add ~100 KB for this one chart.
 * Each bar is the week's scans: brand green for healthy leaves, a warm soil-to-amber cap for the
 * diseased share, so the split reads at a glance and not by red against green alone.
 */
function WeeklyBars({ data }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.scans));
  return (
    <div>
      <div className="flex h-36 items-end gap-2 border-b border-line" role="img" aria-label={data.map((d) => `${d.week}: ${d.scans}`).join(', ')}>
        {data.map((d) => (
          <div key={d.week} className="group flex h-full flex-1 flex-col justify-end" title={`${d.week}: ${d.scans}`}>
            <div
              className="overflow-hidden rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-opacity duration-200 group-hover:opacity-80"
              style={{ height: `${Math.max(3, (d.scans / max) * 100)}%` }}
            >
              {d.diseased > 0 && (
                <div className="bg-gradient-to-t from-soil-500 to-accent-500" style={{ height: `${(d.diseased / d.scans) * 100}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-subtle">
        <span>{data[0].week}</span>
        <span>{data.at(-1).week}</span>
      </div>
      {/* The bar's aria-label already gives the totals; the key is for sighted readers only. */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-ink-muted" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand-500" />
          {t('dashboard.healthy')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-gradient-to-t from-soil-500 to-accent-500" />
          {t('dashboard.diseasedScans')}
        </li>
      </ul>
    </div>
  );
}

/** A row inside a dashboard card that links somewhere: tinted on hover, arrow nudges right. */
const ROW_LINK = 'group flex items-center gap-4 rounded-control px-3 py-3 transition-colors duration-200 hover:bg-brand-50';

function RowArrow() {
  return (
    <ArrowRight
      className="size-4 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-700"
      aria-hidden="true"
    />
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const summary = useScanSummary();
  const recent = useScans({ limit: 4 });
  const plots = usePlots();
  const alerts = useOutbreakAlerts();
  const consultations = useConsultations({ scope: 'mine', limit: 20 });
  const consultSummary = useConsultationSummary();
  // Offers the farmer has not answered. These are what the week-long reminders are about, and
  // the app has no email or SMS channel, so this list is where a reminder actually lands.
  const unanswered = (consultations.data?.items ?? []).filter((c) => c.decision !== 'scheduled' && c.expiresAt);

  const s = summary.data;
  const lang = i18n.language;
  const weekly = (s?.weekly ?? []).map((w) => ({
    week: new Date(w.weekStart).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' }),
    scans: w.scans,
    diseased: w.diseased,
  }));
  const today = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-8">
      <HeroPanel
        eyebrow={today}
        title={t('dashboard.greeting', { name: user.name.split(' ')[0] })}
        subtitle={t('dashboard.subtitle')}
        action={
          // Phones reach the scanner from the bottom bar, so the hero keeps its button for wider screens.
          <Link to="/scan" className="btn-primary btn-pill hidden sm:inline-flex">
            <Camera className="size-5" aria-hidden="true" />
            {t('dashboard.newScan')}
          </Link>
        }
      />

      {unanswered.length > 0 && (
        <section className="rounded-card bg-gradient-to-br from-accent-50 via-accent-50/60 to-surface p-5 shadow-[var(--shadow-sm)] ring-1 ring-accent-500/30 sm:p-6">
          <SectionTitle icon={UserCheck} tone="accent">
            {t('dashboard.expertOffers')}
          </SectionTitle>
          <ul className="space-y-2.5">
            {unanswered.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface/90 px-4 py-3.5 text-sm ring-1 ring-accent-500/15"
              >
                <span className="min-w-0">
                  <span className="font-bold text-brand-900">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</span>
                  <span className="mt-0.5 block text-ink-muted">
                    {t('consult.retentionNotice', { date: shortDate(c.expiresAt, i18n.language) })}
                  </span>
                </span>
                <Link to={`/consultations/${c.id}`} className="btn-primary">
                  {c.reminder ? t('dashboard.reminderNth', { n: c.reminder.index, of: c.reminder.of }) : t('consult.open')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {consultSummary.data?.upcoming?.length > 0 && (
        <section className="card p-5 sm:p-6">
          <SectionTitle icon={UserCheck}>{t('consult.pageTitle')}</SectionTitle>
          <ul className="-mx-3 -mb-2 divide-y divide-line">
            {consultSummary.data.upcoming.map((c) => {
              const Icon = MODE_ICONS[c.mode] ?? UserCheck;
              return (
                <li key={c.id} className="py-0.5">
                  <Link to={`/consultations/${c.id}`} className={ROW_LINK}>
                    <IconBadge icon={Icon} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-brand-900">{t(`consult.booked.${c.mode}`)}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {shortDate(c.scheduledFor, lang)} ·{' '}
                        {c.expert?.name ?? t('consult.awaitingExpert')}
                        {c.expert?.expertProfile?.qualification ? ` · ${c.expert.expertProfile.qualification}` : ''}
                      </p>
                      {/* A phone has no room beside the line, so the status sits under it there. */}
                      <span className="chip mt-1.5 bg-brand-50 text-brand-800 ring-1 ring-brand-200 sm:hidden">{t(`consult.status.${c.status}`)}</span>
                    </div>
                    <span className="chip shrink-0 bg-brand-50 text-brand-800 ring-1 ring-brand-200 max-sm:hidden">
                      {t(`consult.status.${c.status}`)}
                    </span>
                    <RowArrow />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy={summary.isLoading}>
        <StatCard icon={ScanLine} label={t('dashboard.totalScans')} value={s?.total ?? '—'} />
        <StatCard icon={CheckCircle2} tone="ok" label={t('dashboard.healthy')} value={s?.healthy ?? '—'} />
        <StatCard icon={ClipboardList} tone="warn" label={t('dashboard.needsReview')} value={s?.pendingReview ?? '—'} />
        <StatCard icon={Sprout} tone="soil" label={t('dashboard.plots')} value={plots.data?.length ?? '—'} />
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={AlertTriangle} tone="warn">
          {t('dashboard.nearbyAlerts')}
        </SectionTitle>
        {alerts.isLoading || plots.isLoading ? (
          <Spinner />
        ) : !plots.data?.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-sunken p-4">
            <p className="text-sm text-ink-muted">{t('dashboard.addPlotPrompt')}</p>
            <Link to="/plots/new" className="btn-outline">
              <Plus className="size-4" aria-hidden="true" />
              {t('dashboard.addPlot')}
            </Link>
          </div>
        ) : alerts.data?.length ? (
          <ul className="-mx-3 -mb-2 divide-y divide-line">
            {alerts.data.flatMap((a) =>
              a.outbreaks.map((o) => (
                <li key={`${a.plotId}-${o.diseaseKey}`} className="py-0.5">
                  <Link to={`/plots/${a.plotId}`} className={ROW_LINK}>
                    <IconBadge icon={AlertTriangle} tone={o.severity === 'severe' ? 'danger' : 'warn'} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">
                        {t('dashboard.alertLine', { disease: o.commonName, count: o.reports, km: o.nearestKm, plot: a.plotName })}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-subtle">{relativeTime(o.lastSeen, lang)}</p>
                    </div>
                    <SeverityBadge severity={o.severity} />
                    <RowArrow />
                  </Link>
                </li>
              )),
            )}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-control bg-ok-bg/60 px-4 py-3.5">
            <CheckCircle2 className="size-5 shrink-0 text-ok" aria-hidden="true" />
            <p className="text-sm text-ink-muted">{t('dashboard.noAlerts')}</p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="min-w-0">
          <SectionTitle
            icon={ScanLine}
            action={
              recent.data?.total > 0 && (
                <Link to="/history" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900">
                  {t('common.viewAll')}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )
            }
          >
            {t('dashboard.recentScans')}
          </SectionTitle>
          {recent.isLoading ? (
            <Spinner />
          ) : recent.data?.items.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {recent.data.items.map((scan) => (
                <ScanCard key={scan.id} scan={scan} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Camera}
              title={t('dashboard.noScans')}
              action={
                <Link to="/scan" className="btn-primary">
                  {t('dashboard.newScan')}
                </Link>
              }
            />
          )}
        </section>

        <section className="min-w-0 space-y-6">
          {s?.topDiseases?.length > 0 && (
            <div className="card p-5 sm:p-6">
              <SectionTitle icon={Bug}>{t('dashboard.topDiseases')}</SectionTitle>
              <ul className="space-y-3.5">
                {s.topDiseases.map((d, i) => (
                  <li key={d.diseaseKey}>
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/library/${d.diseaseKey}`} className="truncate text-sm font-semibold hover:text-brand-700 hover:underline">
                        {d.commonName}
                      </Link>
                      <span className="chip shrink-0 bg-brand-50 font-bold tabular-nums text-brand-800">{d.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas-deep">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-700"
                        style={{ width: `${(d.count / s.topDiseases[0].count) * 100}%`, opacity: 1 - i * 0.12 }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weekly.length > 1 && (
            <div className="card p-5 sm:p-6">
              <SectionTitle icon={BarChart3}>{t('dashboard.weeklyActivity')}</SectionTitle>
              <WeeklyBars data={weekly} />
            </div>
          )}
          <Link
            to="/outbreaks"
            className="card-interactive group flex items-center gap-4 bg-gradient-to-br from-brand-100/70 via-brand-50 to-surface p-5"
          >
            <IconBadge icon={Map} tone="white" size="lg" />
            <span className="min-w-0 flex-1 font-bold text-brand-900">{t('nav.outbreaks')}</span>
            <RowArrow />
          </Link>
        </section>
      </div>
    </div>
  );
}
