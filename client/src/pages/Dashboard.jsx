import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Map, Plus, ScanLine, Sprout, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultations, useOutbreakAlerts, usePlots, useScans, useScanSummary } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { ScanCard } from '../components/domain.jsx';
import { EmptyState, SeverityBadge, Spinner, StatCard } from '../components/ui.jsx';
import { relativeTime, shortDate } from '../lib/format.js';

/** Scans per week as plain CSS bars; a charting library would add ~100 KB for this one chart. */
function WeeklyBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.scans));
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={data.map((d) => `${d.week}: ${d.scans}`).join(', ')}>
        {data.map((d) => (
          <div key={d.week} className="flex h-full flex-1 flex-col justify-end" title={`${d.week}: ${d.scans}`}>
            <div className="rounded-t bg-brand-600" style={{ height: `${(d.scans / max) * 100}%` }}>
              {d.diseased > 0 && <div className="rounded-t bg-warn/80" style={{ height: `${(d.diseased / d.scans) * 100}%` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
        <span>{data[0].week}</span>
        <span>{data.at(-1).week}</span>
      </div>
    </div>
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('dashboard.greeting', { name: user.name.split(' ')[0] })}</h1>
          <p className="mt-1 text-ink-muted">{t('dashboard.subtitle')}</p>
        </div>
        <Link to="/scan" className="btn-primary hidden px-5 sm:inline-flex">
          <Camera className="size-5" aria-hidden="true" />
          {t('dashboard.newScan')}
        </Link>
      </header>

      {unanswered.length > 0 && (
        <section className="card border-warn/40 bg-warn-bg/30 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <UserCheck className="size-5 text-warn" aria-hidden="true" />
            {t('dashboard.expertOffers')}
          </h2>
          <ul className="space-y-2">
            {unanswered.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</span>
                  <span className="block text-ink-muted">
                    {t('consult.retentionNotice', { date: shortDate(c.expiresAt, i18n.language) })}
                  </span>
                </span>
                <Link to={`/consultations/${c.id}`} className="btn-secondary">
                  {c.reminder ? t('dashboard.reminderNth', { n: c.reminder.index, of: c.reminder.of }) : t('consult.open')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={summary.isLoading}>
        <StatCard icon={ScanLine} label={t('dashboard.totalScans')} value={s?.total ?? '—'} />
        <StatCard icon={CheckCircle2} tone="ok" label={t('dashboard.healthy')} value={s?.healthy ?? '—'} />
        <StatCard icon={ClipboardList} tone="warn" label={t('dashboard.needsReview')} value={s?.pendingReview ?? '—'} />
        <StatCard icon={Sprout} tone="soil" label={t('dashboard.plots')} value={plots.data?.length ?? '—'} />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="size-5 text-warn" aria-hidden="true" />
          {t('dashboard.nearbyAlerts')}
        </h2>
        {alerts.isLoading || plots.isLoading ? (
          <Spinner />
        ) : !plots.data?.length ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink-muted">{t('dashboard.addPlotPrompt')}</p>
            <Link to="/plots/new" className="btn-secondary">
              <Plus className="size-4" aria-hidden="true" />
              {t('dashboard.addPlot')}
            </Link>
          </div>
        ) : alerts.data?.length ? (
          <ul className="space-y-2">
            {alerts.data.flatMap((a) =>
              a.outbreaks.map((o) => (
                <li key={`${a.plotId}-${o.diseaseKey}`}>
                  <Link to={`/plots/${a.plotId}`} className="card flex items-center gap-3 border-l-4 border-l-warn p-4 hover:shadow-md">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {t('dashboard.alertLine', { disease: o.commonName, count: o.reports, km: o.nearestKm, plot: a.plotName })}
                      </p>
                      <p className="text-xs text-ink-muted">{relativeTime(o.lastSeen, lang)}</p>
                    </div>
                    <SeverityBadge severity={o.severity} />
                  </Link>
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className="card p-4 text-sm text-ink-muted">{t('dashboard.noAlerts')}</p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('dashboard.recentScans')}</h2>
            {recent.data?.total > 0 && (
              <Link to="/history" className="text-sm font-semibold text-brand-700 hover:underline">
                {t('common.viewAll')}
              </Link>
            )}
          </div>
          {recent.isLoading ? (
            <Spinner />
          ) : recent.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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

        <section className="space-y-6">
          {s?.topDiseases?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">{t('dashboard.topDiseases')}</h2>
              <ul className="space-y-2">
                {s.topDiseases.map((d) => (
                  <li key={d.diseaseKey} className="flex items-center justify-between gap-3">
                    <Link to={`/library/${d.diseaseKey}`} className="truncate hover:underline">
                      {d.commonName}
                    </Link>
                    <span className="chip bg-canvas tabular-nums text-ink">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weekly.length > 1 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">{t('dashboard.weeklyActivity')}</h2>
              <WeeklyBars data={weekly} />
            </div>
          )}
          <Link to="/outbreaks" className="card flex items-center gap-3 p-5 hover:shadow-md">
            <Map className="size-6 text-brand-700" aria-hidden="true" />
            <span className="font-semibold">{t('nav.outbreaks')}</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
