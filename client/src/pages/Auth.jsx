import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { describeError } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert, Field, Spinner } from '../components/ui.jsx';
import { LANGUAGES } from '../i18n/index.js';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-ink-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
    </div>
  );
}

function useSubmit(action, redirectTo) {
  const navigate = useNavigate();
  const [state, setState] = useState({ pending: false, message: null, fields: {} });
  const submit = async (payload) => {
    setState({ pending: true, message: null, fields: {} });
    try {
      await action(payload);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setState({ pending: false, ...describeError(err) });
    }
  };
  return [state, submit];
}

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const location = useLocation();
  const [state, submit] = useSubmit(login, location.state?.from ?? '/dashboard');

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            {t('nav.register')}
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          submit({ email: form.get('email'), password: form.get('password') });
        }}
      >
        {state.message && <Alert tone="danger">{state.message}</Alert>}
        <Field label={t('auth.email')} htmlFor="email" error={state.fields.email}>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" error={state.fields.password}>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={state.pending}>
          {state.pending && <Spinner className="size-4 text-white" />}
          {t('auth.submitLogin')}
        </button>
        {import.meta.env.DEV && <p className="text-center text-xs text-ink-muted">{t('auth.demoHint')}</p>}
      </form>
    </AuthCard>
  );
}

export function Register() {
  const { t, i18n } = useTranslation();
  const { register } = useAuth();
  const [state, submit] = useSubmit(register, '/dashboard');

  return (
    <AuthCard
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            {t('nav.login')}
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = Object.fromEntries(new FormData(e.currentTarget));
          for (const k of ['state', 'district']) if (!form[k]) delete form[k];
          submit(form);
        }}
      >
        {state.message && <Alert tone="danger">{state.message}</Alert>}
        <Field label={t('auth.name')} htmlFor="name" error={state.fields.name}>
          <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} className="input" />
        </Field>
        <Field label={t('auth.email')} htmlFor="email" error={state.fields.email}>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" hint={t('auth.passwordHint')} error={state.fields.password}>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.state')} htmlFor="state" optional error={state.fields.state}>
            <input id="state" name="state" autoComplete="address-level1" maxLength={60} className="input" />
          </Field>
          <Field label={t('auth.district')} htmlFor="district" optional error={state.fields.district}>
            <input id="district" name="district" autoComplete="address-level2" maxLength={60} className="input" />
          </Field>
        </div>
        <Field label={t('auth.language')} htmlFor="preferredLanguage">
          <select id="preferredLanguage" name="preferredLanguage" defaultValue={i18n.language} className="input">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={state.pending}>
          {state.pending && <Spinner className="size-4 text-white" />}
          {t('auth.submitRegister')}
        </button>
      </form>
    </AuthCard>
  );
}
