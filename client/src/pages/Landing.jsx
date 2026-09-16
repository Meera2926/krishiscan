import { Camera, CloudSun, Map, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useCrops } from '../api/hooks.js';
import { localName } from '../i18n/index.js';

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { status } = useAuth();
  const { data: crops = [] } = useCrops();

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  const features = [
    { icon: Camera, title: t('landing.f1Title'), body: t('landing.f1Body') },
    { icon: Map, title: t('landing.f2Title'), body: t('landing.f2Body') },
    { icon: CloudSun, title: t('landing.f3Title'), body: t('landing.f3Body') },
  ];

  return (
    <div className="space-y-12 sm:space-y-16">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.2fr_1fr] lg:pt-10">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-700">{t('app.tagline')}</p>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">{t('landing.heroTitle')}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">{t('landing.heroBody')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary px-6 text-base">
              <Camera className="size-5" aria-hidden="true" />
              {t('landing.ctaStart')}
            </Link>
            <Link to="/library" className="btn-secondary px-6 text-base">
              {t('landing.ctaLibrary')}
            </Link>
          </div>
          {crops.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Supported crops">
              {crops
                .filter((c) => c.supportedByModel)
                .map((c) => (
                  <li key={c.key} className="chip bg-surface border border-line px-3 py-1 text-sm text-ink">
                    {localName(c, i18n.language)}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="card relative overflow-hidden p-6" aria-hidden="true">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-brand-100" />
          <div className="relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-16 rounded-2xl bg-[radial-gradient(circle_at_35%_40%,#6b4a1f_0_14%,transparent_15%),radial-gradient(circle_at_65%_60%,#8a5a2b_0_10%,transparent_11%),linear-gradient(135deg,#3f9d4f,#1f6f32)]" />
              <div>
                <p className="font-semibold">Tomato · Late blight</p>
                <p className="text-sm text-ink-muted">Confident diagnosis</p>
              </div>
            </div>
            {[
              ['Late blight', 0.86],
              ['Early blight', 0.09],
              ['Septoria leaf spot', 0.03],
            ].map(([label, v]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-semibold">{Math.round(v * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/5">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${v * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger">High late-blight risk this week</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <div className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <f.icon className="size-6" aria-hidden="true" />
            </div>
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="flex gap-3 rounded-2xl bg-soil-100 p-5 text-soil-700">
        <ShieldAlert className="size-5 shrink-0 translate-y-0.5" aria-hidden="true" />
        <p className="text-sm leading-relaxed">{t('landing.honesty')}</p>
      </section>
    </div>
  );
}
