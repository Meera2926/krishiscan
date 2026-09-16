import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert, Field, PageHeader, Spinner } from '../components/ui.jsx';
import { LANGUAGES } from '../i18n/index.js';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [state, setState] = useState({ pending: false, saved: false, error: null });

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
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('profile.title')} subtitle={user.email} />
      <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
        {state.saved && <Alert tone="ok">{t('profile.saved')}</Alert>}
        {state.error && <Alert tone="danger">{state.error.message}</Alert>}
        <Field label={t('auth.name')} htmlFor="name" error={state.error?.fields?.name}>
          <input id="name" name="name" className="input" required minLength={2} maxLength={80} defaultValue={user.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <p className="text-sm text-ink-muted">
          {t('profile.role')}: <span className="font-medium capitalize text-ink">{user.role}</span>
        </p>
        <button type="submit" className="btn-primary" disabled={state.pending}>
          {state.pending && <Spinner className="size-4 text-white" />}
          {t('common.save')}
        </button>
      </form>
    </div>
  );
}
