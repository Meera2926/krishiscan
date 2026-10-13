import clsx from 'clsx';
import {
  BookOpen,
  CalendarCheck,
  Check,
  FileText,
  Hourglass,
  ListChecks,
  Map,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Send,
  ShieldOff,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMyApplication } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CertificateImage, ExpertFacts, VerificationBadge } from '../components/experts.jsx';
import { SectionTitle, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const STATUS = {
  pending: {
    Icon: Hourglass,
    card: 'from-info-bg via-info-bg/45 to-surface ring-info/20',
    icon: 'text-info ring-info/20',
    blob: 'bg-info/10',
  },
  rejected: {
    Icon: XCircle,
    card: 'from-warn-bg via-warn-bg/45 to-surface ring-warn/25',
    icon: 'text-warn ring-warn/25',
    blob: 'bg-warn/10',
  },
  suspended: {
    Icon: ShieldOff,
    card: 'from-danger-bg via-danger-bg/45 to-surface ring-danger/20',
    icon: 'text-danger ring-danger/20',
    blob: 'bg-danger/10',
  },
};

/** A line in the "until you are verified" list: green tick for what still works, red cross for what waits. */
function Rule({ ok, children }) {
  return (
    <li className={clsx('flex gap-3', !ok && 'text-ink-muted')}>
      <span
        className={clsx(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-1',
          ok ? 'bg-ok-bg text-ok ring-ok/15' : 'bg-danger-bg text-danger ring-danger/15',
        )}
      >
        {ok ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : <X className="size-3" strokeWidth={3} aria-hidden="true" />}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * Home for an expert nobody has checked yet, or one who has been stopped. It says where the
 * application stands, what the admin said, and what the account can and cannot do meanwhile,
 * rather than showing an expert desk full of cases they are not allowed to open.
 */
export default function ExpertStatus() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const application = useMyApplication();
  const [checking, setChecking] = useState(false);
  const lang = i18n.language;

  // An admin may have decided since this session began; reloading the account picks that up,
  // and a newly verified expert lands on the expert desk without logging out and in.
  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await Promise.all([refreshUser(), application.refetch()]);
    } catch {
      // The status card keeps showing what it had; nothing else to do.
    } finally {
      setChecking(false);
    }
  };

  const verification = user.expertVerification ?? {};
  const status = STATUS[verification.status] ? verification.status : 'pending';
  const { Icon, card, icon, blob } = STATUS[status];
  const canEdit = status === 'pending' || status === 'rejected';
  const profile = application.data?.expertProfile ?? user.expertProfile ?? {};
  const submitted = verification.submittedAt;
  const decided = status !== 'pending' && verification.decidedAt;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow mb-1.5">{t('expert.apply.eyebrow')}</p>
        <h1 className="text-[1.75rem] font-extrabold leading-[1.15] text-brand-900 sm:text-[2.125rem]">
          {t('expert.greeting', { name: user.name.split(' ')[0] })}
        </h1>
      </header>

      <section
        className={clsx('animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br p-5 ring-1 sm:p-8', card)}
        aria-live="polite"
      >
        <div className={clsx('pointer-events-none absolute -right-16 -top-20 size-64 rounded-full blur-3xl', blob)} aria-hidden="true" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:gap-5">
          <span className={clsx('grid size-14 shrink-0 place-items-center rounded-full bg-surface shadow-[var(--shadow-sm)] ring-1', icon)}>
            <Icon className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <VerificationBadge status={status} />
            <h2 className="mt-2 text-xl font-extrabold leading-snug text-brand-900 sm:text-2xl">{t(`expert.home.${status}Title`)}</h2>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{t(`expert.home.${status}Body`)}</p>
            {(submitted || decided) && (
              <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink-muted">
                {submitted && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 ring-1 ring-line">
                    <Send className="size-3.5" aria-hidden="true" />
                    {t('expert.home.submitted', { date: shortDate(submitted, lang) })}
                  </span>
                )}
                {decided && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 ring-1 ring-line">
                    <CalendarCheck className="size-3.5" aria-hidden="true" />
                    {t('expert.home.decided', { date: shortDate(decided, lang) })}
                  </span>
                )}
              </p>
            )}

            {status !== 'pending' && verification.note && (
              <div className="mt-5 rounded-card bg-surface p-4 shadow-[var(--shadow-xs)] ring-1 ring-line">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-subtle">
                  <MessageSquareText className="size-4" aria-hidden="true" />
                  {t('expert.home.adminNote')}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{verification.note}</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {canEdit && (
                <Link
                  to="/expert/application"
                  className={clsx(status === 'rejected' ? 'btn-primary' : 'btn-outline', 'btn-pill max-sm:w-full')}
                >
                  <PencilLine className="size-4" aria-hidden="true" />
                  {t('expert.home.update')}
                </Link>
              )}
              <button type="button" className="btn-ghost btn-pill max-sm:w-full" onClick={checkAgain} disabled={checking}>
                {checking ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                {t('expert.home.checkAgain')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="card p-5 sm:p-6">
          <SectionTitle icon={FileText}>{t('expert.home.whatYouSent')}</SectionTitle>
          {application.isLoading ? (
            <Spinner />
          ) : (
            <>
              <ExpertFacts expert={profile} />
              {application.data?.hasDocument && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.field.certificate')}</p>
                  <CertificateImage expertId={user.id} version={application.data?.expertVerification?.submittedAt} />
                </div>
              )}
            </>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <SectionTitle icon={ListChecks} tone={status === 'suspended' ? 'danger' : 'brand'}>
            {t(status === 'suspended' ? 'expert.home.whileSuspended' : 'expert.home.untilVerified')}
          </SectionTitle>
          <ul className="space-y-3 text-sm leading-relaxed">
            <Rule ok>
              {t('expert.home.canRead')}{' '}
              <span className="mt-1.5 flex flex-wrap gap-2">
                <Link
                  to="/library"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-800 ring-1 ring-brand-200/70 hover:bg-brand-100"
                >
                  <BookOpen className="size-3.5" aria-hidden="true" />
                  {t('nav.library')}
                </Link>
                <Link
                  to="/outbreaks"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-800 ring-1 ring-brand-200/70 hover:bg-brand-100"
                >
                  <Map className="size-3.5" aria-hidden="true" />
                  {t('nav.outbreaks')}
                </Link>
              </span>
            </Rule>
            {canEdit && <Rule ok>{t('expert.home.canEdit')}</Rule>}
            {['cannotCases', 'cannotBooked', 'cannotLabels'].map((key) => (
              <Rule key={key}>{t(`expert.home.${key}`)}</Rule>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
