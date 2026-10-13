import clsx from 'clsx';
import { Lock, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { VerificationBadge } from '../components/experts.jsx';
import { Alert, Field, PageHeader, Spinner } from '../components/ui.jsx';
import { LANGUAGES } from '../i18n/index.js';

/** First letters of the first two words; Array.from keeps a non-Latin first character whole. */
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase();
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [state, setState] = useState({ pending: false, saved: false, error: null });
  // The admin checked this name against the certificate, so a checked expert cannot change it.
  const nameLocked = user.role === 'expert' && ['verified', 'suspended'].includes(user.expertVerification?.status);

  async function onSubmit(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setState({ pending: true, saved: false, error: null });
    try {
      const updated = await updateProfile(form);
      if (updated.preferredLanguage !== i18n.language) i18n.changeLanguage(updated.preferredLanguage);
      setState({ pending: false, saved: true, error: null });
    } catch (err) {
      setState({ pending: false, saved: false, error: describeError(err) });
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('profile.title')} subtitle={user.email} />
      <div className="card overflow-hidden">
        {/* Who is signed in, and in what role, above the fields they can change. */}
        <div className="relative flex items-center gap-4 overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-surface px-5 py-5 sm:px-6">
          <div className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full bg-brand-200/45 blur-3xl" aria-hidden="true" />
          <span
            className="relative grid size-16 shrink-0 place-items-center rounded-full bg-brand-700 text-xl font-extrabold text-white shadow-[var(--shadow-brand)] ring-4 ring-surface"
            aria-hidden="true"
          >
            {initials(user.name)}
          </span>
          <div className="relative min-w-0 space-y-1.5">
            <p className="truncate text-lg font-bold text-brand-900">{user.name}</p>
            <p className="text-sm text-ink-muted">
              {t('profile.role')}: <span className="font-semibold capitalize text-ink">{user.role}</span>
            </p>
            {user.role === 'expert' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
                <span>{t('profile.verification')}:</span>
                <VerificationBadge status={user.expertVerification?.status ?? 'pending'} />
                {/* The page farmers see, ratings included, so an expert can check what is shown. */}
                {user.expertVerification?.status === 'verified' && (
                  <Link to={`/experts/${user.id}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                    {t('profile.publicProfile')}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 border-t border-line p-5 sm:p-6">
          {state.saved && <Alert tone="ok">{t('profile.saved')}</Alert>}
          {state.error && <Alert tone="danger">{state.error.message}</Alert>}
          <Field
            label={t('auth.name')}
            htmlFor="name"
            hint={nameLocked ? t('profile.nameLocked') : undefined}
            error={state.error?.fields?.name}
          >
            <div className="relative">
              {/* Read-only, not disabled: it is still sent, unchanged, which the server accepts. */}
              <input
                id="name"
                name="name"
                className={clsx('input', nameLocked && 'bg-surface-sunken pr-10 text-ink-muted')}
                required
                minLength={2}
                maxLength={80}
                defaultValue={user.name}
                readOnly={nameLocked}
              />
              {nameLocked && (
                <Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              )}
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
            <Field label={t('auth.state')} htmlFor="state">
              <input id="state" name="state" className="input" maxLength={60} defaultValue={user.state ?? ''} />
            </Field>
            <Field label={t('auth.district')} htmlFor="district">
              <input id="district" name="district" className="input" maxLength={60} defaultValue={user.district ?? ''} />
            </Field>
          </div>
          <Field label={t('auth.language')} htmlFor="preferredLanguage">
            <select id="preferredLanguage" name="preferredLanguage" className="input" defaultValue={user.preferredLanguage}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end border-t border-line pt-5">
            <button type="submit" className="btn-primary max-sm:w-full sm:px-6" disabled={state.pending}>
              {state.pending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" aria-hidden="true" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
