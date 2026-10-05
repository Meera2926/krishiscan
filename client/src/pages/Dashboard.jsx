import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardList, Map, Plus, ScanLine, Sprout, UserCheck } from 'lucide-react';
import { MODE_ICONS } from '../components/consultation.jsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultationSummary, useConsultations, useOutbreakAlerts, usePlots, useScans, useScanSummary } from '../api/hooks.js';
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
          <div key={d.week} className="group flex h-full flex-1 flex-col justify-end" title={`${d.week}: ${d.scans}`}>
            <div
              className="overflow-hidden rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 transition-opacity duration-200 group-hover:opacity-80"
              style={{ height: `${Math.max(3, (d.scans / max) * 100)}%` }}
            >
              {d.diseased > 0 && (
                <div className="rounded-t-md bg-gradient-to-t from-warn to-accent-500" style={{ height: `${(d.diseased / d.scans) * 100}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-subtle">
        <span>{data[0].week}</span>
        <span>{data.at(-1).week}</span>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, tone = 'brand', children, action }) {
  const tones = { brand: 'bg-brand-50 text-brand-600 ring-brand-200/70', warn: 'bg-warn-bg text-warn ring-warn/20' };
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-lg font-bold">
        {Icon && (
          <span className={`grid size-8 place-items-center rounded-control ring-1 ${tones[tone]}`}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        {children}
      </h2>
      {action}
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
    <div className="space-y-9">
      {/* A gradient band gives the page an opening, instead of text starting at the top edge. */}
      <header className="animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-7 text-white shadow-[var(--shadow-lg)] sm:px-8 sm:py-9">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-300/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-200">{today}</p>
            <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight sm:text-4xl">
              {t('dashboard.greeting', { name: user.name.split(' ')[0] })}
            </h1>
            <p className="mt-1.5 text-[15px] text-brand-100/90">{t('dashboard.subtitle')}</p>
          </div>
          <Link
            to="/scan"
            className="btn hidden bg-white px-5 text-brand-800 shadow-[var(--shadow-md)] hover:bg-brand-50 sm:inline-flex"
          >
            <Camera className="size-5" aria-hidden="true" />
            {t('dashboard.newScan')}
          </Link>
        </div>
      </header>

      {unanswered.length > 0 && (
        <section className="overflow-hidden rounded-card bg-warn-bg/50 ring-1 ring-warn/20">
          <div className="border-b border-warn/15 px-5 py-3.5">
            <h2 className="flex items-center gap-2.5 font-bold text-warn">
              <UserCheck className="size-5" aria-hidden="true" />
              {t('dashboard.expertOffers')}
            </h2>
          </div>
          <ul className="divide-y divide-warn/10">
            {unanswered.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</span>
                  <span className="mt-0.5 block text-ink-muted">
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

      {consultSummary.data?.upcoming?.length > 0 && (
        <section>
          <SectionHeading icon={UserCheck}>{t('consult.pageTitle')}</SectionHeading>
          <ul className="space-y-2.5">
            {consultSummary.data.upcoming.map((c) => {
              const Icon = MODE_ICONS[c.mode] ?? UserCheck;
              return (
                <li key={c.id}>
                  <Link to={`/consultations/${c.id}`} className="card-interactive group flex items-center gap-4 p-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{t(`consult.booked.${c.mode}`)}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {shortDate(c.scheduledFor, lang)} ·{' '}
                        {c.expert?.name ?? t('consult.awaitingExpert')}
                        {c.expert?.expertProfile?.qualification ? ` · ${c.expert.expertProfile.qualification}` : ''}
                      </p>
                    </div>
                    <span className="chip bg-canvas-deep text-ink-muted">{t(`consult.status.${c.status}`)}</span>
                    <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
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
        <SectionHeading icon={AlertTriangle} tone="warn">
          {t('dashboard.nearbyAlerts')}
        </SectionHeading>
        {alerts.isLoading || plots.isLoading ? (
          <Spinner />
        ) : !plots.data?.length ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-ink-muted">{t('dashboard.addPlotPrompt')}</p>
            <Link to="/plots/new" className="btn-secondary">
              <Plus className="size-4" aria-hidden="true" />
              {t('dashboard.addPlot')}
            </Link>
          </div>
        ) : alerts.data?.length ? (
          <ul className="space-y-2.5">
            {alerts.data.flatMap((a) =>
              a.outbreaks.map((o) => (
                <li key={`${a.plotId}-${o.diseaseKey}`}>
                  <Link to={`/plots/${a.plotId}`} className="card-interactive group flex items-center gap-4 overflow-hidden p-4 pl-0">
                    <span className="h-12 w-1 shrink-0 rounded-r-full bg-gradient-to-b from-warn to-danger" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">
                        {t('dashboard.alertLine', { disease: o.commonName, count: o.reports, km: o.nearestKm, plot: a.plotName })}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-subtle">{relativeTime(o.lastSeen, lang)}</p>
                    </div>
                    <SeverityBadge severity={o.severity} />
                    <ArrowRight
                      className="size-4 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className="card p-5 text-sm text-ink-muted">{t('dashboard.noAlerts')}</p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionHeading
            icon={ScanLine}
            action={
              recent.data?.total > 0 && (
                <Link to="/history" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-800">
                  {t('common.viewAll')}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )
            }
          >
            {t('dashboard.recentScans')}
          </SectionHeading>
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

        <section className="space-y-5">
          {s?.topDiseases?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-4 font-bold">{t('dashboard.topDiseases')}</h2>
              <ul className="space-y-3">
                {s.topDiseases.map((d, i) => (
                  <li key={d.diseaseKey}>
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/library/${d.diseaseKey}`} className="truncate text-sm font-medium hover:text-brand-700">
                        {d.commonName}
                      </Link>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-ink-muted">{d.count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas-deep">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                        style={{ width: `${(d.count / s.topDiseases[0].count) * 100}%`, opacity: 1 - i * 0.12 }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weekly.length > 1 && (
            <div className="card p-5">
              <h2 className="mb-4 font-bold">{t('dashboard.weeklyActivity')}</h2>
              <WeeklyBars data={weekly} />
            </div>
          )}
          <Link
            to="/outbreaks"
            className="card-interactive group flex items-center gap-4 bg-gradient-to-br from-surface to-brand-50 p-5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-100 text-brand-700 ring-1 ring-brand-200/70">
              <Map className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 font-bold">{t('nav.outbreaks')}</span>
            <ArrowRight
              className="size-4 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </section>
      </div>
    </div>
  );
}
