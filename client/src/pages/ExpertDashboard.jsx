import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Inbox,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sprout,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  useConsultationAction,
  useConsultationSummary,
  useConsultations,
  useExpertApplications,
  useReviewMetrics,
  useReviewQueue,
} from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MODE_ICONS } from '../components/consultation.jsx';
import { useCropName } from '../components/domain.jsx';
import { EmptyState, ErrorState, SeverityBadge, Spinner, StatCard } from '../components/ui.jsx';
import { relativeTime, shortDate } from '../lib/format.js';

const clock = (iso, lang) =>
  new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });

/**
 * Applications are the admin's first job: until someone checks a certificate, that expert cannot
 * help anyone. Counts come with any status list, so the smallest one is asked for.
 */
function PendingApplicationsBanner() {
  const { t } = useTranslation();
  const { data } = useExpertApplications('pending');
  const pending = data?.counts?.pending ?? 0;
  if (!pending) return null;
  return (
    <Link
      to="/admin/experts"
      className="card-interactive group flex items-center gap-3.5 border-warn/30 bg-warn-bg/50 p-4"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-control bg-warn-bg text-warn ring-1 ring-warn/20">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 font-bold">{t('admin.pendingBanner', { count: pending })}</p>
      <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/** True while the booked hour is running, so the expert knows to join now rather than later. */
const isLive = (iso) => {
  const start = new Date(iso).getTime();
  return Date.now() >= start - 5 * 60_000 && Date.now() <= start + 60 * 60_000;
};

function SectionHeading({ icon: Icon, tone = 'brand', children, action }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 ring-brand-200/70',
    warn: 'bg-warn-bg text-warn ring-warn/20',
    ok: 'bg-ok-bg text-ok ring-ok/15',
  };
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-lg font-bold">
        <span className={`grid size-8 place-items-center rounded-control ring-1 ${tones[tone]}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** One appointment on the expert's own list. */
function Appointment({ consultation, lang, t, cropName }) {
  const Icon = MODE_ICONS[consultation.mode] ?? CalendarClock;
  const summary = consultation.caseSummary ?? {};
  const live = isLive(consultation.scheduledFor);

  return (
    <li>
      <Link
        to={`/consultations/${consultation.id}`}
        className={`card-interactive group flex items-center gap-4 p-4 ${live ? 'border-ok/50 bg-ok-bg/25' : ''}`}
      >
        <div className="w-16 shrink-0 text-center">
          <p className="text-lg font-extrabold leading-none tabular-nums">{clock(consultation.scheduledFor, lang)}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{t(`consult.mode.${consultation.mode}`)}</p>
        </div>
        <span className="h-12 w-px shrink-0 bg-line" aria-hidden="true" />
        {summary.imageUrl ? (
          <img src={summary.imageUrl} alt="" className="size-12 shrink-0 rounded-control border border-line object-cover" />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-control bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{summary.diseaseName || t('consult.caseTitle')}</p>
          <p className="truncate text-sm text-ink-muted">
            {consultation.farmer?.name}
            {summary.crop ? ` · ${cropName(summary.crop)}` : ''}
            {consultation.farmer?.district ? ` · ${consultation.farmer.district}` : ''}
          </p>
        </div>
        {live ? (
          <span className="chip bg-ok text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
            {t('expert.joinNow')}
          </span>
        ) : (
          <span className="chip bg-canvas-deep text-ink-muted">{t(`consult.status.${consultation.status}`)}</span>
        )}
        <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** An unclaimed request, with the one action that matters on it (for an expert; an admin only looks). */
function OpenRequest({ consultation, lang, t, cropName, canAdvise }) {
  const Icon = MODE_ICONS[consultation.mode] ?? UserCheck;
  const take = useConsultationAction(consultation.id);
  const summary = consultation.caseSummary ?? {};

  return (
    <li className="card flex flex-wrap items-center gap-4 p-4">
      {summary.imageUrl ? (
        <img src={summary.imageUrl} alt="" className="size-12 shrink-0 rounded-control border border-line object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-control bg-warn-bg text-warn ring-1 ring-warn/20">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link to={`/consultations/${consultation.id}`} className="truncate font-bold hover:text-brand-700">
          {summary.diseaseName || t('consult.caseTitle')}
        </Link>
        <p className="truncate text-sm text-ink-muted">
          {consultation.farmer?.name}
          {summary.crop ? ` · ${cropName(summary.crop)}` : ''} · {t(`consult.reason.${consultation.trigger}`)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`consult.mode.${consultation.mode}`)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {shortDate(consultation.scheduledFor, lang)} · {clock(consultation.scheduledFor, lang)}
          </span>
          <span>{t('expert.raised', { when: relativeTime(consultation.createdAt, lang) })}</span>
        </p>
      </div>
      {canAdvise && (
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={take.isPending}
          onClick={() => take.mutate({ action: 'accept' })}
        >
          {take.isPending ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {t('consult.accept')}
        </button>
      )}
    </li>
  );
}

export default function ExpertDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const cropName = useCropName();
  const lang = i18n.language;

  const summary = useConsultationSummary();
  const queue = useConsultations({ scope: 'queue', status: 'open', limit: 8 });
  const metrics = useReviewMetrics();
  const labelQueue = useReviewQueue({ status: 'pending', limit: 3 });

  const isAdmin = user.role === 'admin';
  const s = summary.data;
  const unclaimed = (queue.data?.items ?? []).filter((c) => !c.expert);
  const profile = user.expertProfile ?? {};
  const today = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-9">
      {isAdmin && <PendingApplicationsBanner />}
      <header className="animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-7 text-white shadow-[var(--shadow-lg)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-200">{today}</p>
            <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight sm:text-4xl">
              {t('expert.greeting', { name: user.name.split(' ')[0] })}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-100/90">
              {profile.qualification && (
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <BadgeCheck className="size-4" aria-hidden="true" />
                  {profile.qualification}
                </span>
              )}
              {profile.organisation && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {profile.organisation}
                </span>
              )}
              {profile.crops?.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Sprout className="size-3.5" aria-hidden="true" />
                  {profile.crops.map(cropName).join(', ')}
                </span>
              )}
            </p>
          </div>
          <p className="rounded-control bg-white/10 px-4 py-3 text-sm font-semibold ring-1 ring-white/20">
            {t('expert.todayCount', { count: s?.today?.length ?? 0 })}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={summary.isLoading}>
        <StatCard icon={Inbox} tone="warn" label={t('expert.waiting')} value={s?.waiting ?? '—'} />
        <StatCard icon={CalendarClock} label={t('expert.todayStat')} value={s?.today?.length ?? '—'} />
        <StatCard icon={MessageSquare} label={t('expert.myCases')} value={s?.mine ?? '—'} />
        <StatCard icon={CheckCircle2} tone="ok" label={t('expert.answered')} value={s?.completed ?? '—'} />
      </section>

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <>
          <section>
            <SectionHeading icon={CalendarClock}>{t('expert.todaySchedule')}</SectionHeading>
            {summary.isLoading ? (
              <Spinner />
            ) : s?.today?.length ? (
              <ul className="space-y-2.5">
                {s.today.map((c) => (
                  <Appointment key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarClock} title={t('expert.noToday')} body={t('expert.noTodayBody')} />
            )}
          </section>

          <section>
            <SectionHeading icon={Inbox} tone="warn">
              {t('expert.unclaimed')}
            </SectionHeading>
            {queue.isLoading ? (
              <Spinner />
            ) : unclaimed.length ? (
              <ul className="space-y-2.5">
                {unclaimed.map((c) => (
                  <OpenRequest key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} canAdvise={!isAdmin} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={Inbox} title={t('expert.noUnclaimed')} body={t('expert.noUnclaimedBody')} />
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            {s?.upcoming?.length > 0 && (
              <section>
                <SectionHeading icon={Clock}>{t('expert.laterThisWeek')}</SectionHeading>
                <ul className="space-y-2.5">
                  {s.upcoming.map((c) => (
                    <Appointment key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} />
                  ))}
                </ul>
              </section>
            )}

            {s?.recent?.length > 0 && (
              <section>
                <SectionHeading icon={CheckCircle2} tone="ok">
                  {t('expert.recentlyAnswered')}
                </SectionHeading>
                <ul className="space-y-2.5">
                  {s.recent.map((c) => (
                    <li key={c.id}>
                      <Link to={`/consultations/${c.id}`} className="card-interactive group block p-4">
                        <div className="flex items-center gap-3">
                          <p className="min-w-0 flex-1 truncate font-bold">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</p>
                          <span className="shrink-0 text-xs text-ink-subtle">{relativeTime(c.outcome?.completedAt ?? c.scheduledFor, lang)}</span>
                        </div>
                        {c.outcome?.advice && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{c.outcome.advice}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      <section>
        <SectionHeading
          icon={ClipboardCheck}
          action={
            <Link to="/reviews" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-800">
              {t('common.viewAll')}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {t('expert.labelChecks')}
          {metrics.data?.pending > 0 && (
            <span className="chip ml-1 bg-warn-bg text-warn ring-1 ring-warn/20 tabular-nums">{metrics.data.pending}</span>
          )}
        </SectionHeading>
        <p className="mb-3 text-sm text-ink-muted">{t('expert.labelChecksBody')}</p>
        {labelQueue.isLoading ? (
          <Spinner />
        ) : labelQueue.data?.items?.length ? (
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {labelQueue.data.items.map((scan) => (
              <li key={scan.id}>
                <Link to={`/scans/${scan.id}`} className="card-interactive flex items-center gap-3 p-3">
                  <img src={scan.image.url} alt="" className="size-12 shrink-0 rounded-control border border-line object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{cropName(scan.declaredCrop)}</p>
                    <p className="truncate text-xs text-ink-subtle">{relativeTime(scan.createdAt, lang)}</p>
                    <SeverityBadge severity={scan.severity?.grade >= 3 ? 'severe' : undefined} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-5 text-sm text-ink-muted">{t('expert.noLabelChecks')}</p>
        )}
      </section>
    </div>
  );
}
