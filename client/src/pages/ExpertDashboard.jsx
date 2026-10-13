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
import { ErrorState, HeroPanel, SectionTitle, SeverityBadge, Spinner, StatCard } from '../components/ui.jsx';
import { relativeTime, shortDate } from '../lib/format.js';

const clock = (iso, lang) => new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });

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
    <Link to="/admin/experts" className="card-interactive group flex items-center gap-3.5 border-warn/25 bg-warn-bg/60 p-4 sm:px-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-warn ring-1 ring-warn/20">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 font-bold text-ink">{t('admin.pendingBanner', { count: pending })}</p>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-warn ring-1 ring-warn/20">
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/** True while the booked hour is running, so the expert knows to join now rather than later. */
const isLive = (iso) => {
  const start = new Date(iso).getTime();
  return Date.now() >= start - 5 * 60_000 && Date.now() <= start + 60 * 60_000;
};

/**
 * The empty message for a panel. EmptyState is a card of its own, and a card inside a card reads as
 * clutter; this keeps the same icon, title and line, drawn straight onto the panel.
 */
function PanelEmpty({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface-sunken px-5 py-9 text-center">
      <span className="icon-badge mb-3.5 size-12">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="font-bold text-brand-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>}
    </div>
  );
}

/** A white panel that holds one block of the desk, headed like every other block in the app. */
function Panel({ icon, tone, title, action, children, className }) {
  return (
    <section className={`card p-5 sm:p-6 ${className ?? ''}`}>
      <SectionTitle icon={icon} tone={tone} action={action}>
        {title}
      </SectionTitle>
      {children}
    </section>
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
        className={`group flex items-center gap-3 rounded-card border p-3 transition-colors sm:gap-4 sm:p-3.5 ${
          live ? 'border-ok/40 bg-ok-bg/40 hover:bg-ok-bg/60' : 'border-line bg-surface hover:border-brand-200 hover:bg-brand-50/50'
        }`}
      >
        <div className="w-16 shrink-0 text-center">
          <p className="text-lg font-extrabold leading-none text-brand-900 tabular-nums">{clock(consultation.scheduledFor, lang)}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{t(`consult.mode.${consultation.mode}`)}</p>
        </div>
        <span className="h-10 w-px shrink-0 bg-line" aria-hidden="true" />
        {summary.imageUrl ? (
          <img src={summary.imageUrl} alt="" className="size-12 shrink-0 rounded-control object-cover ring-1 ring-line" />
        ) : (
          <span className="icon-badge size-12">
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
          <span className="chip bg-brand-50 text-brand-800 ring-1 ring-brand-200/70 max-sm:hidden">
            {t(`consult.status.${consultation.status}`)}
          </span>
        )}
        <ArrowRight
          className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
          aria-hidden="true"
        />
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface p-3.5">
      {summary.imageUrl ? (
        <img src={summary.imageUrl} alt="" className="size-12 shrink-0 rounded-control object-cover ring-1 ring-line" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700 ring-1 ring-accent-700/15">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link to={`/consultations/${consultation.id}`} className="truncate font-bold text-ink hover:text-brand-700">
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
          className="btn-primary shrink-0 max-sm:w-full"
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
  const hasProfileLine = Boolean(profile.qualification || profile.organisation || profile.crops?.length);
  const today = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 sm:space-y-7">
      {isAdmin && <PendingApplicationsBanner />}
      <HeroPanel
        eyebrow={today}
        title={t('expert.greeting', { name: user.name.split(' ')[0] })}
        subtitle={
          hasProfileLine && (
            <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {profile.qualification && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-brand-800">
                  <BadgeCheck className="size-4 text-brand-600" aria-hidden="true" />
                  {profile.qualification}
                </span>
              )}
              {profile.organisation && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-brand-600" aria-hidden="true" />
                  {profile.organisation}
                </span>
              )}
              {profile.crops?.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Sprout className="size-3.5 text-brand-600" aria-hidden="true" />
                  {profile.crops.map(cropName).join(', ')}
                </span>
              )}
            </span>
          )
        }
        action={
          <p className="inline-flex items-center gap-2.5 rounded-full bg-surface/85 py-2 pl-2 pr-4 text-sm font-bold text-brand-900 shadow-[var(--shadow-sm)] ring-1 ring-brand-200/70">
            <span className="icon-badge size-8">
              <CalendarClock className="size-4" aria-hidden="true" />
            </span>
            {t('expert.todayCount', { count: s?.today?.length ?? 0 })}
          </p>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy={summary.isLoading}>
        <StatCard icon={Inbox} tone="warn" label={t('expert.waiting')} value={s?.waiting ?? '—'} />
        <StatCard icon={CalendarClock} label={t('expert.todayStat')} value={s?.today?.length ?? '—'} />
        <StatCard icon={MessageSquare} label={t('expert.myCases')} value={s?.mine ?? '—'} />
        <StatCard icon={CheckCircle2} tone="ok" label={t('expert.answered')} value={s?.completed ?? '—'} />
      </section>

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Panel icon={CalendarClock} title={t('expert.todaySchedule')}>
              {summary.isLoading ? (
                <Spinner />
              ) : s?.today?.length ? (
                <ul className="space-y-2.5">
                  {s.today.map((c) => (
                    <Appointment key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} />
                  ))}
                </ul>
              ) : (
                <PanelEmpty icon={CalendarClock} title={t('expert.noToday')} body={t('expert.noTodayBody')} />
              )}
            </Panel>

            <Panel icon={Inbox} tone="accent" title={t('expert.unclaimed')}>
              {queue.isLoading ? (
                <Spinner />
              ) : unclaimed.length ? (
                <ul className="space-y-2.5">
                  {unclaimed.map((c) => (
                    <OpenRequest key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} canAdvise={!isAdmin} />
                  ))}
                </ul>
              ) : (
                <PanelEmpty icon={Inbox} title={t('expert.noUnclaimed')} body={t('expert.noUnclaimedBody')} />
              )}
            </Panel>
          </div>

          {(s?.upcoming?.length > 0 || s?.recent?.length > 0) && (
            <div className={`grid items-start gap-6 ${s?.upcoming?.length > 0 && s?.recent?.length > 0 ? 'lg:grid-cols-2' : ''}`}>
              {s?.upcoming?.length > 0 && (
                <Panel icon={Clock} title={t('expert.laterThisWeek')}>
                  <ul className="space-y-2.5">
                    {s.upcoming.map((c) => (
                      <Appointment key={c.id} consultation={c} lang={lang} t={t} cropName={cropName} />
                    ))}
                  </ul>
                </Panel>
              )}

              {s?.recent?.length > 0 && (
                <Panel icon={CheckCircle2} title={t('expert.recentlyAnswered')}>
                  <ul className="space-y-2.5">
                    {s.recent.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/consultations/${c.id}`}
                          className="group flex gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/50"
                        >
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ok-bg text-ok ring-1 ring-ok/15">
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-3">
                              <p className="min-w-0 flex-1 truncate font-bold">{c.caseSummary?.diseaseName || t('consult.caseTitle')}</p>
                              <span className="shrink-0 text-xs text-ink-subtle">
                                {relativeTime(c.outcome?.completedAt ?? c.scheduledFor, lang)}
                              </span>
                            </div>
                            {c.outcome?.advice && (
                              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{c.outcome.advice}</p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          )}
        </>
      )}

      <Panel
        icon={ClipboardCheck}
        title={
          <>
            {t('expert.labelChecks')}
            {metrics.data?.pending > 0 && (
              <span className="chip ml-2 bg-accent-100 align-middle text-accent-700 ring-1 ring-accent-700/15 tabular-nums">
                {metrics.data.pending}
              </span>
            )}
          </>
        }
        action={
          <Link to="/reviews" className="btn-outline btn-pill min-h-9 shrink-0 px-4 text-sm">
            {t('common.viewAll')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      >
        <p className="-mt-1 mb-4 text-sm text-ink-muted">{t('expert.labelChecksBody')}</p>
        {labelQueue.isLoading ? (
          <Spinner />
        ) : labelQueue.data?.items?.length ? (
          <ul className="grid gap-3 sm:grid-cols-3">
            {labelQueue.data.items.map((scan) => (
              <li key={scan.id}>
                <Link
                  to={`/scans/${scan.id}`}
                  className="group flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/50"
                >
                  <img src={scan.image.url} alt="" className="size-14 shrink-0 rounded-control object-cover ring-1 ring-line" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{cropName(scan.declaredCrop)}</p>
                    <p className="truncate text-xs text-ink-subtle">{relativeTime(scan.createdAt, lang)}</p>
                    <SeverityBadge severity={scan.severity?.grade >= 3 ? 'severe' : undefined} />
                  </div>
                  <ArrowRight
                    className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card bg-surface-sunken p-5 text-sm text-ink-muted">{t('expert.noLabelChecks')}</p>
        )}
      </Panel>
    </div>
  );
}
