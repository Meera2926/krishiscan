import { ArrowRight, Camera, CloudSun, GraduationCap, Info, Leaf, Map } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { describeError } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert, Field, IconBadge, Spinner } from '../components/ui.jsx';
import { LANGUAGES } from '../i18n/index.js';

/** A seedling in soil, drawn inline so the page needs no image download on a slow connection. */
function Seedling({ className }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <ellipse cx="120" cy="138" rx="104" ry="14" className="fill-soil-500/15" />
      <path d="M30 140c18-22 52-30 90-30s72 8 90 30z" className="fill-soil-500/25" />
      <path d="M120 116c0-22 1-44 4-66" className="stroke-brand-600" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M123 66C96 70 74 56 66 30c28-4 52 8 57 36z" className="fill-brand-400" />
      <path d="M123 66C108 56 92 46 74 36" className="stroke-brand-600/50" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M125 54c8-26 32-40 62-36-4 28-28 42-62 36z" className="fill-brand-500" />
      <path d="M125 54c18-10 34-20 54-30" className="stroke-brand-700/40" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The welcome side of the card on wide screens: what KrishiScan is, and three things it does. */
function WelcomePanel() {
  const { t } = useTranslation();
  const benefits = [
    { icon: Camera, label: t('landing.f1Title') },
    { icon: Map, label: t('landing.f2Title') },
    { icon: CloudSun, label: t('landing.f3Title') },
  ];
  return (
    <aside className="relative hidden flex-col overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-surface-sunken p-10 lg:flex">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-brand-200/50 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-center gap-2">
        <Leaf className="size-8 shrink-0 -rotate-12 fill-current text-brand-600" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-2xl font-extrabold tracking-tight text-brand-900">{t('app.name')}</span>
      </div>
      <p className="relative mt-4 max-w-xs text-lg font-semibold leading-snug text-brand-900">{t('app.tagline')}</p>
      <ul className="relative mt-8 space-y-4">
        {benefits.map((b) => (
          <li key={b.label} className="flex items-center gap-3 text-[15px] font-semibold text-brand-900">
            <IconBadge icon={b.icon} tone="white" className="shadow-[var(--shadow-xs)]" />
            <span className="min-w-0">{b.label}</span>
          </li>
        ))}
      </ul>
      <Seedling className="animate-sway relative mx-auto mt-auto w-56 pt-10" />
    </aside>
  );
}

function AuthCard({ title, subtitle, children, footer, after }) {
  return (
    <div className="animate-rise mx-auto max-w-md pt-2 sm:pt-6 lg:max-w-5xl">
      <div className="card-raised overflow-hidden lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <WelcomePanel />
        <div className="p-6 sm:p-10">
          <IconBadge icon={Leaf} size="lg" className="mb-4 lg:hidden" />
          <h1 className="text-[1.75rem] font-extrabold leading-tight text-brand-900">{title}</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <hr className="rule mt-7" />
          <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
          {after}
        </div>
      </div>
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

/** The seeded demo accounts (npm run seed -- --demo), shown so a visitor or examiner can try each role. */
const DEMO_ACCOUNTS = [
  { role: 'farmer', email: 'farmer@demo.in' },
  { role: 'expert', email: 'expert@demo.in' },
];
const DEMO_PASSWORD = 'demo1234';

function DemoAccounts({ onPick }) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 rounded-card bg-surface-sunken p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 text-sm font-bold text-brand-900">
        <Info className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
        {t('auth.demoTitle')}
      </p>
      <ul className="mt-3 space-y-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email} className="flex items-center gap-3 rounded-control bg-surface px-3.5 py-2.5 ring-1 ring-line">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block text-xs font-bold uppercase tracking-wide text-brand-700">{t(`consult.role.${a.role}`)}</span>
              <span className="block truncate font-semibold text-ink">{a.email}</span>
              <span className="block text-ink-muted">
                {t('auth.password')}: <span className="font-semibold text-ink">{DEMO_PASSWORD}</span>
              </span>
            </span>
            <button type="button" className="btn-outline min-h-10 shrink-0 px-4 text-sm" onClick={() => onPick(a.email)}>
              {t('auth.demoFill')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const location = useLocation();
  const [state, submit] = useSubmit(login, location.state?.from ?? '/dashboard');
  const formRef = useRef(null);
  // Fills the form rather than logging straight in, so the visitor sees which account they are using.
  const fillDemo = (email) => {
    const { elements } = formRef.current;
    elements.email.value = email;
    elements.password.value = DEMO_PASSWORD;
    formRef.current.querySelector('button[type="submit"]').focus();
  };

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-bold text-brand-700 underline-offset-2 hover:underline">
            {t('nav.register')}
          </Link>
        </>
      }
      after={<DemoAccounts onPick={fillDemo} />}
    >
      <form
        ref={formRef}
        className="space-y-5"
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
        <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={state.pending}>
          {state.pending && <Spinner className="size-4 text-white" />}
          {t('auth.submitLogin')}
        </button>
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
          <Link to="/login" className="font-bold text-brand-700 underline-offset-2 hover:underline">
            {t('nav.login')}
          </Link>
        </>
      }
    >
      <form
        className="space-y-5"
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
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
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
        <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={state.pending}>
          {state.pending && <Spinner className="size-4 text-white" />}
          {t('auth.submitRegister')}
        </button>
      </form>
      {/* Experts do not sign up here: their account is only useful once a certificate is checked. */}
      <div className="mt-6 flex items-center gap-3.5 rounded-card bg-accent-50 p-4 ring-1 ring-accent-500/25">
        <IconBadge icon={GraduationCap} tone="accent" />
        <div className="min-w-0 text-sm">
          <p className="font-bold text-ink">{t('auth.expertPrompt')}</p>
          <Link
            to="/register/expert"
            className="inline-flex min-h-9 items-center gap-1 font-bold text-brand-700 underline-offset-2 hover:underline"
          >
            {t('auth.expertApply')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
