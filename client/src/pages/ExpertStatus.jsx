import clsx from 'clsx';
import { BookOpen, Check, Hourglass, Map, PencilLine, RefreshCw, ShieldOff, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMyApplication } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CertificateImage, ExpertFacts } from '../components/experts.jsx';
import { Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const STATUS = {
  pending: { Icon: Hourglass, card: 'border-info/30 bg-info-bg/40', icon: 'bg-info-bg text-info ring-info/20' },
  rejected: { Icon: XCircle, card: 'border-warn/30 bg-warn-bg/40', icon: 'bg-warn-bg text-warn ring-warn/20' },
  suspended: { Icon: ShieldOff, card: 'border-danger/30 bg-danger-bg/40', icon: 'bg-danger-bg text-danger ring-danger/20' },
};

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
  const { Icon, card, icon } = STATUS[status];
  const canEdit = status === 'pending' || status === 'rejected';
  const profile = application.data?.expertProfile ?? user.expertProfile ?? {};
  const submitted = verification.submittedAt;
  const decided = status !== 'pending' && verification.decidedAt;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow mb-1.5">{t('expert.apply.eyebrow')}</p>
        <h1 className="text-[1.75rem] font-extrabold leading-[1.15] sm:text-4xl">{t('expert.greeting', { name: user.name.split(' ')[0] })}</h1>
      </header>

      <section className={clsx('card animate-rise p-5 sm:p-6', card)} aria-live="polite">
        <div className="flex gap-4">
          <span className={clsx('grid size-12 shrink-0 place-items-center rounded-panel ring-1', icon)}>
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug">{t(`expert.home.${status}Title`)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t(`expert.home.${status}Body`)}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-subtle">
              {submitted && <span>{t('expert.home.submitted', { date: shortDate(submitted, lang) })}</span>}
              {decided && <span>{t('expert.home.decided', { date: shortDate(decided, lang) })}</span>}
            </p>
          </div>
        </div>

        {status !== 'pending' && verification.note && (
          <div className="mt-4 rounded-card border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.home.adminNote')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{verification.note}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {canEdit && (
            <Link to="/expert/application" className={status === 'rejected' ? 'btn-primary' : 'btn-secondary'}>
              <PencilLine className="size-4" aria-hidden="true" />
              {t('expert.home.update')}
            </Link>
          )}
          <button type="button" className="btn-ghost" onClick={checkAgain} disabled={checking}>
            {checking ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            {t('expert.home.checkAgain')}
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-bold">{t('expert.home.whatYouSent')}</h2>
          {application.isLoading ? (
            <Spinner />
          ) : (
            <>
              <ExpertFacts expert={profile} />
              {application.data?.hasDocument && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.field.certificate')}</p>
                  <CertificateImage expertId={user.id} />
                </div>
              )}
            </>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-bold">{t(status === 'suspended' ? 'expert.home.whileSuspended' : 'expert.home.untilVerified')}</h2>
          <ul className="space-y-2.5 text-sm leading-relaxed">
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
              <span>
                {t('expert.home.canRead')}{' '}
                <span className="inline-flex flex-wrap gap-x-3">
                  <Link to="/library" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    {t('nav.library')}
                  </Link>
                  <Link to="/outbreaks" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                    <Map className="size-3.5" aria-hidden="true" />
                    {t('nav.outbreaks')}
                  </Link>
                </span>
              </span>
            </li>
            {canEdit && (
              <li className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                <span>{t('expert.home.canEdit')}</span>
              </li>
            )}
            {['cannotCases', 'cannotBooked', 'cannotLabels'].map((key) => (
              <li key={key} className="flex gap-2.5 text-ink-muted">
                <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                <span>{t(`expert.home.${key}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
