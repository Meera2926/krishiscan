import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, Inbox, MessageSquare, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultationSummary, useConsultations, useReviewMetrics } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MODE_ICONS } from '../components/consultation.jsx';
import { EmptyState, ErrorState, Spinner, StatCard } from '../components/ui.jsx';
import { relativeTime, shortDate } from '../lib/format.js';

const time = (iso, lang) =>
  new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });

/** A case on the expert's own list: when it is, who it is for, and what the app thought. */
function AppointmentRow({ consultation, lang, t }) {
  const Icon = MODE_ICONS[consultation.mode] ?? CalendarClock;
  const summary = consultation.caseSummary ?? {};
  // "Live" while the booked hour is running, so the expert knows to join now rather than later.
  const start = new Date(consultation.scheduledFor).getTime();
  const live = Date.now() >= start - 5 * 60_000 && Date.now() <= start + 60 * 60_000;

  return (
    <li>
      <Link to={`/consultations/${consultation.id}`} className="card-interactive group flex items-center gap-4 p-4">
        {summary.imageUrl ? (
          <img src={summary.imageUrl} alt="" className="size-14 shrink-0 rounded-control border border-line object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-control bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{summary.diseaseName || t('consult.caseTitle')}</p>
          <p className="truncate text-sm text-ink-muted">
            {consultation.farmer?.name}
            {consultation.farmer?.district ? ` · ${consultation.farmer.district}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink-subtle">
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`consult.mode.${consultation.mode}`)} · {shortDate(consultation.scheduledFor, lang)} · {time(consultation.scheduledFor, lang)}
          </p>
        </div>
        {live && (
          <span className="chip bg-ok-bg text-ok ring-1 ring-ok/20">
            <span className="size-1.5 animate-pulse rounded-full bg-ok" aria-hidden="true" />
            {t('expert.live')}
          </span>
        )}
        <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function ExpertDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.language;

  const summary = useConsultationSummary();
  // Unclaimed bookings: anything a farmer has booked that no expert has taken yet.
  const queue = useConsultations({ scope: 'queue', status: 'open', limit: 6 });
  const metrics = useReviewMetrics();

  const s = summary.data;
  const unclaimed = (queue.data?.items ?? []).filter((c) => !c.expert);

  return (
    <div className="space-y-9">
      <header className="animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-7 text-white shadow-[var(--shadow-lg)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-200">{t('expert.eyebrow')}</p>
            <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight sm:text-4xl">
              {t('expert.greeting', { name: user.name.split(' ')[0] })}
            </h1>
            {user.expertProfile?.qualification && <p className="mt-1.5 text-[15px] text-brand-100/90">{user.expertProfile.qualification}</p>}
          </div>
          <Link to="/consultations" className="btn hidden bg-white px-5 text-brand-800 shadow-[var(--shadow-md)] hover:bg-brand-50 sm:inline-flex">
            <UserCheck className="size-5" aria-hidden="true" />
            {t('expert.openQueue')}
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={summary.isLoading}>
        <StatCard icon={Inbox} tone="warn" label={t('expert.waiting')} value={s?.waiting ?? '—'} />
        <StatCard icon={MessageSquare} label={t('expert.myCases')} value={s?.mine ?? '—'} />
        <StatCard icon={CheckCircle2} tone="ok" label={t('expert.answered')} value={s?.completed ?? '—'} />
        <StatCard icon={ClipboardCheck} tone="soil" label={t('expert.labelChecks')} value={metrics.data?.pending ?? '—'} />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-bold">
            <span className="grid size-8 place-items-center rounded-control bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
              <CalendarClock className="size-4" aria-hidden="true" />
            </span>
            {t('expert.upcoming')}
          </h2>
        </div>
        {summary.isLoading ? (
          <Spinner />
        ) : summary.error ? (
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        ) : s?.upcoming?.length ? (
          <ul className="space-y-2.5">
            {s.upcoming.map((c) => (
              <AppointmentRow key={c.id} consultation={c} lang={lang} t={t} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={CalendarClock} title={t('expert.noUpcoming')} body={t('expert.noUpcomingBody')} />
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-bold">
            <span className="grid size-8 place-items-center rounded-control bg-warn-bg text-warn ring-1 ring-warn/20">
              <Inbox className="size-4" aria-hidden="true" />
            </span>
            {t('expert.unclaimed')}
          </h2>
          <Link to="/consultations" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-800">
            {t('common.viewAll')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {queue.isLoading ? (
          <Spinner />
        ) : unclaimed.length ? (
          <ul className="space-y-2.5">
            {unclaimed.map((c) => (
              <li key={c.id}>
                <Link to={`/consultations/${c.id}`} className="card-interactive group flex items-center gap-4 p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-control bg-warn-bg text-warn ring-1 ring-warn/20">
                    {(() => {
                      const Icon = MODE_ICONS[c.mode] ?? UserCheck;
                      return <Icon className="size-5" aria-hidden="true" />;
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {c.farmer?.name} · {t(`consult.reason.${c.trigger}`)}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {t(`consult.mode.${c.mode}`)} · {shortDate(c.scheduledFor, lang)} · {relativeTime(c.createdAt, lang)}
                    </p>
                  </div>
                  <span className="btn-secondary pointer-events-none hidden sm:inline-flex">{t('consult.accept')}</span>
                  <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Inbox} title={t('expert.noUnclaimed')} body={t('expert.noUnclaimedBody')} />
        )}
      </section>

      <Link to="/reviews" className="card-interactive group flex items-center gap-4 bg-gradient-to-br from-surface to-brand-50 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-brand-100 text-brand-700 ring-1 ring-brand-200/70">
          <ClipboardCheck className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t('nav.reviews')}</span>
          <span className="block text-sm text-ink-muted">{t('expert.labelChecksBody')}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
