import { ArrowRight, Camera, CloudSun, Map, ShieldAlert, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useCrops } from '../api/hooks.js';
import { cropLabel } from '../i18n/index.js';

/** The product shot: a diagnosis card, drawn rather than screenshotted so it stays translated. */
function DiagnosisPreview() {
  return (
    <div className="relative" aria-hidden="true">
      {/* Soft glow behind the card, so it sits on the page rather than being pasted onto it.
          Kept inside the card's own box: a negative inset here widens the page on small screens. */}
      <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-brand-200/50 via-brand-100/40 to-accent-100/40 blur-2xl" />
      <div className="card-raised relative overflow-hidden p-6">
        <div className="absolute -right-12 -top-12 size-44 rounded-full bg-brand-50" />
        <div className="relative space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="size-16 shrink-0 rounded-panel bg-[radial-gradient(circle_at_35%_40%,#6b4a1f_0_14%,transparent_15%),radial-gradient(circle_at_65%_60%,#8a5a2b_0_10%,transparent_11%),linear-gradient(135deg,#43a772,#145938)] shadow-[var(--shadow-sm)] ring-1 ring-brand-900/10" />
            <div className="min-w-0">
              <p className="font-bold">Tomato · Late blight</p>
              <span className="chip mt-1 bg-brand-100 text-brand-800 ring-1 ring-brand-300/40">
                <Sparkles className="size-3" />
                Confident diagnosis
              </span>
            </div>
          </div>
          {[
            ['Late blight', 0.86],
            ['Early blight', 0.09],
            ['Septoria leaf spot', 0.03],
          ].map(([label, v], i) => (
            <div key={label}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className={i === 0 ? 'font-semibold' : 'text-ink-muted'}>{label}</span>
                <span className="font-bold tabular-nums">{Math.round(v * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
                <div
                  className={`h-full rounded-full ${i === 0 ? 'bg-gradient-to-r from-brand-500 to-brand-600' : 'bg-ink-muted/30'}`}
                  style={{ width: `${Math.max(3, v * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-control bg-danger-bg px-3.5 py-2.5 text-sm font-semibold text-danger ring-1 ring-danger/15">
            <ShieldAlert className="size-4 shrink-0" />
            High late-blight risk this week
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-16 sm:space-y-24">
      <section className="animate-rise grid items-center gap-12 pt-4 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-10">
        <div>
          <p className="eyebrow mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 ring-1 ring-brand-200/70">
            {t('app.tagline')}
          </p>
          <h1 className="text-[2.5rem] font-extrabold leading-[1.05] sm:text-6xl">{t('landing.heroTitle')}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">{t('landing.heroBody')}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary group px-6 text-base">
              <Camera className="size-5" aria-hidden="true" />
              {t('landing.ctaStart')}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link to="/library" className="btn-secondary px-6 text-base">
              {t('landing.ctaLibrary')}
            </Link>
          </div>
          {crops.length > 0 && (
            <div className="mt-10">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-ink-subtle">{t('library.allCrops')}</p>
              <ul className="flex flex-wrap gap-2" aria-label="Supported crops">
                {crops
                  .filter((c) => c.supportedByModel)
                  .map((c) => (
                    <li
                      key={c.key}
                      className="chip border border-line-strong bg-surface px-3.5 py-1.5 text-sm text-ink shadow-[var(--shadow-xs)]"
                    >
                      {cropLabel(c, i18n.language)}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <DiagnosisPreview />
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {features.map((f, i) => (
          <div key={f.title} className="card-interactive group p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="grid size-12 place-items-center rounded-control bg-gradient-to-b from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-200/70 transition-transform duration-300 group-hover:scale-105">
                <f.icon className="size-6" aria-hidden="true" />
              </div>
              <span className="text-sm font-bold tabular-nums text-line-strong">0{i + 1}</span>
            </div>
            <h2 className="text-lg font-bold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="flex gap-3.5 rounded-panel bg-gradient-to-br from-soil-100 to-canvas-deep p-6 text-soil-700 ring-1 ring-soil-500/15">
        <ShieldAlert className="size-5 shrink-0 translate-y-0.5" aria-hidden="true" />
        <p className="text-sm leading-relaxed">{t('landing.honesty')}</p>
      </section>
    </div>
  );
}
