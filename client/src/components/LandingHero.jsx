import { ArrowRight, ChartColumnIncreasing, Leaf, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import seedling from '../assets/hero-seedling.webp';

/** A loose, hand-drawn arrow under the handwritten note. */
function HandArrow({ className }) {
  return (
    <svg viewBox="0 0 40 52" fill="none" className={className} aria-hidden="true">
      <path
        d="M27 3c6 9 7 21 1 30-4 6-10 10-17 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M17 38.5 10.5 45l9 2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The pale leaf drifting between the text and the photo. */
function FloatingLeaf({ className }) {
  return (
    <svg viewBox="0 0 80 60" className={className} aria-hidden="true">
      <path d="M78 2C50 0 14 10 3 55c22 2 62-6 75-53Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The open home page's first screen, after the design the user supplied: a mint panel with the
 * headline, two calls to action and three small promises on the left, and the seedling photo
 * (taken from that design) on the right with a handwritten note above it.
 */
export default function LandingHero() {
  const { t } = useTranslation();
  const promises = [
    { icon: Zap, label: t('landing.badge1'), filled: true },
    { icon: Leaf, label: t('landing.badge2') },
    { icon: ChartColumnIncreasing, label: t('landing.badge3') },
  ];

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(105deg,#e7f1e3_0%,#f1f7ef_42%,#f5f9f3_100%)] shadow-[var(--shadow-sm)] ring-1 ring-brand-200/50">
      {/* Soft light in the corners, as in the design's backdrop. */}
      <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-brand-200/35 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-white/60 blur-3xl" aria-hidden="true" />

      <div className="relative grid lg:min-h-[35rem] lg:grid-cols-[1.32fr_1fr]">
        <div className="relative z-10 px-6 pb-10 pt-10 sm:px-10 lg:py-16 lg:pl-14 lg:pr-4">
          <h1 className="whitespace-pre-line text-[2.5rem] font-bold leading-[1.1] tracking-[-0.025em] text-brand-900 sm:text-[3.25rem] xl:text-[3.5rem]">
            {t('landing.heroTitle')}
          </h1>
          <p className="mt-5 max-w-[30rem] text-[1.1rem] leading-relaxed text-ink/80 sm:text-[1.2rem]">{t('landing.heroBody')}</p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/scan" className="btn-primary btn-pill group min-h-13 px-8 text-[15px]">
              {t('landing.ctaDetect')}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <a href="#features" className="btn-outline btn-pill min-h-13 border-brand-800 px-8 text-[15px] text-ink">
              {t('landing.ctaLearn')}
            </a>
          </div>

          <ul className="mt-12 grid max-w-[40rem] grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            {promises.map(({ icon: Icon, label, filled }) => (
              <li key={label} className="flex items-center gap-3 text-[13px] font-medium leading-snug text-ink sm:text-sm">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 ring-1 ring-brand-700/10">
                  <Icon className={filled ? 'size-5 fill-current' : 'size-5'} aria-hidden="true" />
                </span>
                <span className="min-w-0">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* The photo: flush with the panel's right and bottom edges on wide screens, a framed picture on phones. */}
        <div className="relative min-h-[22rem] sm:min-h-[28rem] lg:min-h-0">
          <img
            src={seedling}
            alt=""
            width="722"
            height="818"
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[left_bottom] [mask-image:linear-gradient(to_bottom,transparent,black_9%),linear-gradient(to_right,transparent,black_5%)] [mask-composite:intersect] [-webkit-mask-composite:source-in]"
          />
          <FloatingLeaf className="pointer-events-none absolute -left-10 top-[44%] hidden w-20 -rotate-6 text-brand-300/80 lg:block" />
          <p className="pointer-events-none absolute right-[9%] top-[9%] rotate-[-8deg] whitespace-pre-line text-center font-['Segoe_Print','Segoe_Script','Ink_Free','Bradley_Hand','Comic_Sans_MS',cursive] text-[1.05rem] leading-snug text-ink/85 sm:text-[1.2rem]">
            {t('landing.handNote')}
          </p>
          <HandArrow className="pointer-events-none absolute right-[13%] top-[24%] w-8 -rotate-6 text-ink/80 sm:w-9" />
        </div>
      </div>
    </section>
  );
}
