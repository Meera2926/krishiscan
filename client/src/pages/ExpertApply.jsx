import clsx from 'clsx';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { describeError } from '../api/client.js';
import { useCrops, useExpertOptions, useMyApplication, useResubmitApplication } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { MODE_ICONS } from '../components/consultation.jsx';
import { CertificateImage, useOrgTypeLabel } from '../components/experts.jsx';
import { Alert, EmptyState, ErrorState, Field, FullPageSpinner, PageHeader, Spinner } from '../components/ui.jsx';
import { LANGUAGES, localName } from '../i18n/index.js';

const MODES = ['chat', 'call', 'visit'];
// The server refuses a certificate smaller than this; checking here saves a slow upload on 3G.
const MIN_SIDE = 300;
const CERTIFICATE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCOUNT_FIELDS = ['name', 'email', 'password', 'preferredLanguage', 'state', 'district'];
const CREDENTIAL_FIELDS = [
  'degree',
  'specialisation',
  'university',
  'graduationYear',
  'organisationType',
  'organisation',
  'designation',
  'experienceYears',
  'bio',
];

function Section({ title, children }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** A group of tick boxes laid out as tiles, big enough to hit with a thumb. */
function CheckGroup({ legend, hint, error, items, value, onChange, columns = 'sm:grid-cols-3' }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className={clsx('grid grid-cols-2 gap-2', columns)}>
        {items.map(({ key, label, Icon }) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border border-line-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold"
          >
            <input type="checkbox" className="size-4 shrink-0 accent-brand-700" checked={value.includes(key)} onChange={() => toggle(key)} />
            {Icon && <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />}
            <span className="min-w-0 break-words">{label}</span>
          </label>
        ))}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-semibold text-danger" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </fieldset>
  );
}

/** Why the checks exist and what happens after sending, said before anything is asked for. */
function WhyWeCheck() {
  const { t } = useTranslation();
  return (
    <section className="card border-brand-200 bg-brand-50/60 p-5 sm:p-6">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-100 text-brand-700 ring-1 ring-brand-200">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">{t('expert.apply.whyTitle')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('expert.apply.whyBody')}</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {['step1', 'step2', 'step3'].map((step, i) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white" aria-hidden="true">
              {i + 1}
            </span>
            <span className="min-w-0">{t(`expert.apply.${step}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ApplicationForm({ options, application }) {
  const resubmit = Boolean(application);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, registerExpert, refreshUser } = useAuth();
  const resend = useResubmitApplication();
  const orgType = useOrgTypeLabel();
  const { data: crops = [] } = useCrops();
  const profile = application?.expertProfile ?? {};
  const verification = application?.expertVerification;

  const [cropKeys, setCropKeys] = useState(profile.crops ?? []);
  // A new applicant almost certainly speaks the language they are reading this in.
  const [languages, setLanguages] = useState(profile.languages ?? [i18n.language]);
  const [modes, setModes] = useState(profile.modes ?? []);
  const [doc, setDoc] = useState(null); // { file, preview, check: 'checking' | 'ok' | 'tooSmall' | 'notImage' }
  const [state, setState] = useState({ pending: false, message: null, fields: {} });
  const previewRef = useRef(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const pickDocument = (file) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    if (!file) return setDoc(null);
    // The three types the server can read. HEIC is not among them, and phone browsers convert it
    // to JPEG when a photo is picked through a web form anyway.
    if (!CERTIFICATE_TYPES.includes(file.type)) return setDoc({ file, check: 'notImage' });

    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    setDoc({ file, preview, check: 'checking' });
    const img = new Image();
    const settle = (check) => setDoc((d) => (d?.preview === preview ? { ...d, check } : d));
    img.onload = () => settle(Math.min(img.naturalWidth, img.naturalHeight) < MIN_SIDE ? 'tooSmall' : 'ok');
    // A file that claims to be an image but will not draw will not decode on the server either.
    img.onerror = () => settle('notImage');
    img.src = preview;
  };

  const localErrors = () => {
    const errors = {};
    if (!languages.length) errors.languages = [t('expert.apply.pickLanguage')];
    if (!modes.length) errors.modes = [t('expert.apply.pickMode')];
    if (!doc && !resubmit) errors.document = [t('expert.apply.certificateRequired')];
    if (doc?.check === 'notImage') errors.document = [t('expert.apply.certificateNotImage')];
    if (doc?.check === 'tooSmall') errors.document = [t('expert.apply.certificateTooSmall', { min: MIN_SIDE })];
    return errors;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const local = localErrors();
    if (Object.keys(local).length) {
      setState({ pending: false, message: t('expert.apply.fixErrors'), fields: local });
      return;
    }

    const raw = new FormData(e.currentTarget);
    const body = new FormData();
    for (const key of [...(resubmit ? [] : ACCOUNT_FIELDS), ...CREDENTIAL_FIELDS]) {
      const value = String(raw.get(key) ?? '').trim();
      if (value) body.append(key, value);
    }
    // Every crop ticked means the same as none ticked (all crops), and stays under the server's cap.
    const allCrops = crops.length > 0 && crops.every((c) => cropKeys.includes(c.key));
    body.append('crops', allCrops ? '' : cropKeys.join(','));
    body.append('languages', languages.join(','));
    body.append('modes', modes.join(','));
    body.append('declaration', raw.get('declaration') ? 'true' : 'false');
    if (doc) body.append('document', doc.file);

    setState({ pending: true, message: null, fields: {} });
    try {
      if (resubmit) {
        await resend.mutateAsync(body);
        await refreshUser();
      } else {
        await registerExpert(body);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setState({ pending: false, ...describeError(err) });
    }
  };

  const err = state.fields;
  const year = options.graduationYear ?? {};

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={t('expert.apply.eyebrow')}
        title={resubmit ? t('expert.apply.resubmitTitle') : t('expert.apply.title')}
        subtitle={resubmit ? t('expert.apply.resubmitSubtitle') : t('expert.apply.subtitle')}
        back={
          resubmit && (
            <Link to="/dashboard" className="btn-ghost -ml-3 mb-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('common.back')}
            </Link>
          )
        }
      />

      <div className="space-y-5">
        {resubmit && verification?.status === 'rejected' && verification.note && (
          <Alert tone="warn">
            <p className="font-semibold">{t('expert.home.adminNote')}</p>
            <p className="whitespace-pre-wrap font-normal">{verification.note}</p>
          </Alert>
        )}

        <WhyWeCheck />

        <form className="space-y-5" onSubmit={onSubmit}>
          {!resubmit && (
            <Section title={t('expert.apply.sectionAccount')}>
              <Field label={t('auth.name')} htmlFor="name" hint={t('expert.apply.nameHint')} error={err.name}>
                <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} className="input" />
              </Field>
              <Field label={t('auth.email')} htmlFor="email" error={err.email}>
                <input id="email" name="email" type="email" autoComplete="email" required className="input" />
              </Field>
              <Field label={t('auth.password')} htmlFor="password" hint={t('auth.passwordHint')} error={err.password}>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  className="input"
                />
              </Field>
              <Field label={t('auth.language')} htmlFor="preferredLanguage" error={err.preferredLanguage}>
                <select id="preferredLanguage" name="preferredLanguage" defaultValue={i18n.language} className="input">
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.state')} htmlFor="state" error={err.state}>
                  <input id="state" name="state" autoComplete="address-level1" required maxLength={60} className="input" />
                </Field>
                <Field label={t('auth.district')} htmlFor="district" optional error={err.district}>
                  <input id="district" name="district" autoComplete="address-level2" maxLength={60} className="input" />
                </Field>
              </div>
            </Section>
          )}

          <Section title={t('expert.apply.sectionQualification')}>
            <Field label={t('expert.apply.degree')} htmlFor="degree" hint={t('expert.apply.degreeHint')} error={err.degree}>
              <select id="degree" name="degree" required defaultValue={profile.degree ?? ''} className="input">
                <option value="" disabled>
                  {t('expert.apply.choose')}
                </option>
                {options.degrees.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('expert.apply.specialisation')}
              htmlFor="specialisation"
              optional
              hint={t('expert.apply.specialisationHint')}
              error={err.specialisation}
            >
              <input
                id="specialisation"
                name="specialisation"
                maxLength={80}
                defaultValue={profile.specialisation ?? ''}
                placeholder={t('expert.apply.specialisationPlaceholder')}
                className="input"
              />
            </Field>
            <Field label={t('expert.apply.university')} htmlFor="university" error={err.university}>
              <input
                id="university"
                name="university"
                required
                minLength={3}
                maxLength={120}
                defaultValue={profile.university ?? ''}
                placeholder={t('expert.apply.universityPlaceholder')}
                className="input"
              />
            </Field>
            <Field label={t('expert.apply.graduationYear')} htmlFor="graduationYear" error={err.graduationYear}>
              <input
                id="graduationYear"
                name="graduationYear"
                type="number"
                inputMode="numeric"
                required
                min={year.min}
                max={year.max}
                step={1}
                defaultValue={profile.graduationYear ?? ''}
                className="input sm:max-w-40"
              />
            </Field>
          </Section>

          <Section title={t('expert.apply.sectionWork')}>
            <Field label={t('expert.apply.organisationType')} htmlFor="organisationType" error={err.organisationType}>
              <select id="organisationType" name="organisationType" required defaultValue={profile.organisationType ?? ''} className="input">
                <option value="" disabled>
                  {t('expert.apply.choose')}
                </option>
                {options.organisationTypes.map((o) => (
                  <option key={o.key} value={o.key}>
                    {orgType(o.key, o.label)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('expert.apply.organisation')} htmlFor="organisation" error={err.organisation}>
              <input
                id="organisation"
                name="organisation"
                required
                minLength={2}
                maxLength={120}
                defaultValue={profile.organisation ?? ''}
                placeholder={t('expert.apply.organisationPlaceholder')}
                className="input"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label={t('expert.apply.designation')} htmlFor="designation" error={err.designation}>
                <input
                  id="designation"
                  name="designation"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={profile.designation ?? ''}
                  placeholder={t('expert.apply.designationPlaceholder')}
                  className="input"
                />
              </Field>
              <Field label={t('expert.apply.experienceYears')} htmlFor="experienceYears" error={err.experienceYears}>
                <input
                  id="experienceYears"
                  name="experienceYears"
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  max={60}
                  step={1}
                  defaultValue={profile.experienceYears ?? ''}
                  className="input sm:w-36"
                />
              </Field>
            </div>
          </Section>

          <Section title={t('expert.apply.sectionAdvice')}>
            <CheckGroup
              legend={t('expert.apply.crops')}
              hint={t('expert.apply.cropsHint')}
              error={err.crops}
              items={crops.map((c) => ({ key: c.key, label: localName(c, i18n.language) }))}
              value={cropKeys}
              onChange={setCropKeys}
            />
            <CheckGroup
              legend={t('expert.apply.languages')}
              hint={t('expert.apply.languagesHint')}
              error={err.languages}
              items={LANGUAGES.map((l) => ({ key: l.code, label: l.label }))}
              value={languages}
              onChange={setLanguages}
            />
            <CheckGroup
              legend={t('expert.apply.modes')}
              hint={t('expert.apply.modesHint')}
              error={err.modes}
              items={MODES.map((m) => ({ key: m, label: t(`consult.mode.${m}`), Icon: MODE_ICONS[m] }))}
              value={modes}
              onChange={setModes}
            />
          </Section>

          <Section title={t('expert.apply.sectionAbout')}>
            <Field label={t('expert.apply.bio')} htmlFor="bio" optional hint={t('expert.apply.bioHint')} error={err.bio}>
              <textarea
                id="bio"
                name="bio"
                rows={4}
                maxLength={600}
                defaultValue={profile.bio ?? ''}
                placeholder={t('expert.apply.bioPlaceholder')}
                className="input py-2.5"
              />
            </Field>
          </Section>

          <Section title={t('expert.apply.sectionCertificate')}>
            <Field
              label={t('expert.apply.certificate')}
              htmlFor="document"
              optional={resubmit}
              hint={resubmit ? `${t('expert.apply.certificateHint')} ${t('expert.apply.certificateKeep')}` : t('expert.apply.certificateHint')}
              error={err.document}
            >
              <input
                id="document"
                type="file"
                accept={CERTIFICATE_TYPES.join(',')}
                onChange={(e) => pickDocument(e.target.files?.[0])}
                className="block w-full min-w-0 text-sm text-ink-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-line-strong file:bg-surface file:px-4 file:text-[15px] file:font-semibold file:text-ink hover:file:border-brand-300"
              />
            </Field>

            {doc?.preview && doc.check !== 'notImage' && (
              <div className="overflow-hidden rounded-card border border-line bg-canvas-deep">
                <img src={doc.preview} alt={t('expert.apply.certificatePreview')} className="max-h-80 w-full object-contain" />
              </div>
            )}
            {resubmit && !doc && application.hasDocument && (
              <div>
                <p className="mb-2 text-sm font-semibold">{t('expert.apply.certificateOnFile')}</p>
                <CertificateImage expertId={user.id} version={verification?.submittedAt} />
              </div>
            )}
          </Section>

          <section className="card space-y-4 p-5 sm:p-6">
            <label className="flex cursor-pointer gap-3 text-sm leading-relaxed">
              <input type="checkbox" name="declaration" required className="mt-1 size-4 shrink-0 accent-brand-700" />
              <span className="font-medium">{t('expert.apply.declaration')}</span>
            </label>
            {err.declaration && (
              <p className="text-xs font-semibold text-danger" role="alert">
                {Array.isArray(err.declaration) ? err.declaration[0] : err.declaration}
              </p>
            )}

            {state.message && <Alert tone="danger">{state.message}</Alert>}

            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={state.pending || doc?.check === 'checking'}>
              {state.pending ? <Spinner className="size-4 text-white" /> : <Send className="size-4" aria-hidden="true" />}
              {resubmit ? t('expert.apply.resubmit') : t('expert.apply.submit')}
            </button>
            <p className="text-xs leading-relaxed text-ink-subtle">{t('expert.apply.afterSubmit')}</p>
          </section>
        </form>

        {!resubmit && (
          <p className="text-center text-sm text-ink-muted">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
              {t('nav.login')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One form for both a new applicant and an applicant correcting what they sent. The second only
 * makes sense while the application is still open to change (pending or not accepted); once an
 * admin has verified or suspended the account, the server refuses edits, and so does this page.
 */
export default function ExpertApply({ resubmit = false }) {
  const { t } = useTranslation();
  const options = useExpertOptions();
  const application = useMyApplication({ enabled: resubmit });

  if (options.isLoading || (resubmit && application.isLoading)) return <FullPageSpinner />;
  if (options.error) return <ErrorState error={options.error} onRetry={options.refetch} />;
  if (resubmit && application.error) return <ErrorState error={application.error} onRetry={application.refetch} />;

  if (resubmit && !['pending', 'rejected'].includes(application.data?.expertVerification?.status)) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={ShieldCheck}
          title={t('expert.apply.locked')}
          body={t('expert.apply.lockedBody')}
          action={
            <Link to="/dashboard" className="btn-primary">
              {t('errors.goHome')}
            </Link>
          }
        />
      </div>
    );
  }

  return <ApplicationForm options={options.data} application={resubmit ? application.data : null} />;
}
