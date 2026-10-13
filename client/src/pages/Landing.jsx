import { useEffect } from 'react';
import { ArrowRight, BookOpen, CloudSun, FileText, ImageUp, Leaf, Map, ScanLine, ScanSearch, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useCrops } from '../api/hooks.js';
import LandingHero from '../components/LandingHero.jsx';
import { CropArt } from '../components/illustrations.jsx';
import { IconBadge } from '../components/ui.jsx';
import { cropLabel } from '../i18n/index.js';

/** Centred eyebrow, title and subtitle that open each section below the hero. */
function SectionIntro({ eyebrow, title, subtitle, id }) {
  return (
    <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
      {eyebrow && <p className="eyebrow mb-2 [&:not(:lang(en))]:tracking-normal">{eyebrow}</p>}
      <h2 id={id} className="text-[1.75rem] font-extrabold leading-tight text-brand-900 sm:text-[2.1rem]">
        {title}
      </h2>
      {subtitle && <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>}
    </div>
  );
}

/** The arrow after a crop's name: the card is a way in, not just a label. */
function GoArrow() {
  return <ArrowRight className="ml-auto mt-0.5 size-4 shrink-0 text-brand-700 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />;
}

/**
 * "Cabbage (Patta Gobhi, Bandgobhi)": the name farmers search for first with the arrow beside it, the
 * other names quieter below. The arrow drops under a name too long to share the line, rather than
 * squeezing a single long Tamil or Malayalam word into a mid-word break.
 */
function CropName({ label, longWords, className }) {
  const [, name, others] = label.match(/^(.+?) \((.+)\)$/) ?? [null, label, null];
  return (
    <span
      className={`block flex-1 pb-1.5 pt-2.5 font-semibold leading-snug ${longWords ? 'px-1.5 text-[13px] sm:px-2 sm:text-sm' : 'px-2 text-sm'} ${className}`}
    >
      <span className="flex flex-wrap items-start gap-x-2">
        <span className="min-w-0 break-words">{name}</span>
        <GoArrow />
      </span>
      {others && <span className="mt-0.5 block break-words text-xs font-medium text-ink-muted">{others}</span>}
    </span>
  );
}

const LONG_WORD_LANGS = ['ta', 'te', 'ml'];

// Tile widths for the crop grid: 2, 3, 4 then 6 to a row. Eleven crops plus the "All crops" tile make
// twelve, which fills every one of those rows exactly; flex-wrap with centring keeps it tidy if the list changes.
// Tamil, Telugu and Malayalam crop names are single long words that a sixth of the row would split
// mid-word, so those languages stop at four to a row.
const TILE_BASE = 'w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)]';
const cropTile = (longWords) => (longWords ? TILE_BASE : `${TILE_BASE} lg:w-[calc(16.666%-0.834rem)]`);

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { status } = useAuth();
  const { data: crops = [] } = useCrops();
  const { hash } = useLocation();

  const supported = crops.filter((c) => c.supportedByModel);
  const longWords = LONG_WORD_LANGS.includes(i18n.language);

  // The top bar's "Crops" link is /#crops. The crop section only exists once the list has loaded,
  // so try again when it arrives as well as when the hash changes.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, supported.length]);

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  const features = [
    { icon: ScanLine, tone: 'brand', title: t('landing.f1Title'), body: t('landing.f1Body') },
    { icon: Map, tone: 'brand', title: t('landing.f2Title'), body: t('landing.f2Body') },
    { icon: CloudSun, tone: 'accent', title: t('landing.f3Title'), body: t('landing.f3Body') },
    { icon: ShieldCheck, tone: 'brand', title: t('landing.f4Title'), body: t('landing.f4Body') },
  ];

  const steps = [
    { icon: ImageUp, title: t('landing.step1Title'), body: t('landing.step1Body') },
    { icon: ScanSearch, title: t('landing.step2Title'), body: t('landing.step2Body') },
    { icon: FileText, title: t('landing.step3Title'), body: t('landing.step3Body') },
    { icon: Leaf, title: t('landing.step4Title'), body: t('landing.step4Body') },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      <LandingHero />

      {/* Why choose: four white cards on a soft panel, as in the design's features row. */}
      <section
        id="features"
        aria-labelledby="why-title"
        className="scroll-mt-24 rounded-[1.75rem] bg-gradient-to-b from-surface/80 to-brand-50/60 px-4 py-10 shadow-[var(--shadow-xs)] ring-1 ring-brand-200/50 sm:px-8 sm:py-12"
      >
        <SectionIntro id="why-title" eyebrow={t('landing.whyEyebrow')} title={t('landing.whyTitle', { app: t('app.name') })} subtitle={t('landing.whySubtitle')} />
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {features.map((f) => (
            <li key={f.title} className="card p-6">
              <IconBadge icon={f.icon} tone={f.tone} size="xl" />
              <h3 className="mt-5 text-[17px] font-bold leading-snug text-brand-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Supported crops: one picture card per crop the model knows, each opening its diseases. */}
      {supported.length > 0 && (
        <section
          id="crops"
          aria-labelledby="crops-title"
          className="scroll-mt-24 rounded-[1.75rem] bg-surface px-4 py-10 shadow-[var(--shadow-xs)] ring-1 ring-line sm:px-8 sm:py-12"
        >
          <SectionIntro id="crops-title" title={t('landing.cropsTitle')} subtitle={t('landing.cropsSubtitle')} />
          <ul className="flex flex-wrap justify-center gap-4">
            {supported.map((c) => (
              <li key={c.key} className={cropTile(longWords)}>
                <Link
                  to={`/library?crop=${encodeURIComponent(c.key)}`}
                  className="card-interactive group flex h-full flex-col overflow-hidden p-1.5"
                >
                  <CropArt crop={c.key} className="block aspect-[4/3] w-full rounded-[0.7rem]" />
                  <CropName label={cropLabel(c, i18n.language)} longWords={longWords} className="text-brand-900" />
                </Link>
              </li>
            ))}
            {/* Every crop at once: the whole disease library. */}
            <li className={cropTile(longWords)}>
              <Link
                to="/library"
                className="group flex h-full flex-col overflow-hidden rounded-card border border-dashed border-brand-300 bg-brand-50/70 p-1.5 transition-colors hover:border-brand-500 hover:bg-brand-50"
              >
                <span className="grid aspect-[4/3] w-full place-items-center rounded-[0.7rem] bg-surface/70">
                  <IconBadge icon={BookOpen} size="xl" className="transition-transform duration-300 group-hover:scale-105" />
                </span>
                <CropName label={t('library.allCrops')} longWords={longWords} className="text-brand-800" />
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* How it works: a white panel with four steps, joined by thin arrows on wide screens. */}
      <section
        aria-labelledby="how-title"
        className="relative overflow-hidden rounded-[1.75rem] bg-surface px-5 py-10 shadow-[var(--shadow-xs)] ring-1 ring-line sm:px-8 sm:py-12"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-100/60 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-brand-50 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <SectionIntro id="how-title" eyebrow={t('landing.howEyebrow')} title={t('landing.howTitle')} subtitle={t('landing.howSubtitle')} />
          <ol className="grid gap-7 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-12">
            {steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 sm:flex-col sm:items-center sm:text-center">
                <span
                  className={`grid size-14 shrink-0 place-items-center rounded-full ring-4 ring-surface ${
                    i === 0 ? 'bg-brand-700 text-white shadow-[var(--shadow-brand)]' : 'bg-brand-100 text-brand-700 shadow-[var(--shadow-sm)]'
                  }`}
                >
                  <s.icon className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold tabular-nums text-brand-600">{i + 1}</p>
                  <h3 className="mt-0.5 font-bold leading-snug text-brand-900">{s.title}</h3>
                  <p className="mx-auto mt-1.5 max-w-60 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="absolute -right-[2.1rem] top-[1.125rem] hidden size-5 text-brand-300 lg:block" strokeWidth={1.5} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="flex gap-3.5 rounded-panel bg-accent-50 p-5 text-soil-700 ring-1 ring-accent-500/25 sm:p-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
          <ShieldAlert className="size-[18px]" aria-hidden="true" />
        </span>
        <p className="self-center text-sm leading-relaxed">{t('landing.honesty')}</p>
      </section>
    </div>
  );
}
