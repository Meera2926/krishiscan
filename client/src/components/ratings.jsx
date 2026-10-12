import clsx from 'clsx';
import { Star } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STARS = [1, 2, 3, 4, 5];

/** "4.5", never "4.53" or "4": an average is read at a glance and should look like one. */
export const formatAverage = (value) => (value == null ? '' : Number(value).toFixed(1));

/**
 * Read-only stars. Fractional values fill part of a star, so 4.5 looks different from 4 and 5.
 * The filled row is clipped over the empty one; the stars sit with no gap so the width maps
 * straight onto the value.
 */
export function Stars({ value = 0, size = 'size-4', className }) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span
      className={clsx('relative inline-flex shrink-0 align-middle', className)}
      role="img"
      aria-label={t('rating.outOf', { value: formatAverage(clamped).replace(/\.0$/, '') })}
    >
      <span className="flex text-line-strong" aria-hidden="true">
        {STARS.map((n) => (
          <Star key={n} className={clsx(size, 'shrink-0')} fill="currentColor" strokeWidth={1.5} />
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-accent-500" style={{ width: `${(clamped / 5) * 100}%` }} aria-hidden="true">
        {STARS.map((n) => (
          <Star key={n} className={clsx(size, 'shrink-0')} fill="currentColor" strokeWidth={1.5} />
        ))}
      </span>
    </span>
  );
}

/** Stars plus "4.5 (12 ratings)", or a plain "No ratings yet" so an empty record is not a zero. */
export function RatingLine({ rating, className }) {
  const { t } = useTranslation();
  if (!rating) return null;
  if (!rating.count || rating.average == null) {
    return <p className={clsx('text-xs text-ink-subtle', className)}>{t('rating.none')}</p>;
  }
  return (
    <p className={clsx('flex flex-wrap items-center gap-1.5 text-sm', className)}>
      <Stars value={rating.average} size="size-3.5" />
      <span className="font-semibold tabular-nums">{t('rating.summary', { average: formatAverage(rating.average), count: rating.count })}</span>
    </p>
  );
}

/**
 * Choosing 1-5 stars. Real radio buttons underneath, so arrow keys, Tab and screen readers behave
 * as they do for any radio group; the stars are only what is drawn.
 */
export function StarInput({ value, onChange, legend, error, disabled }) {
  const { t } = useTranslation();
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <fieldset disabled={disabled}>
      {legend && <legend className="label">{legend}</legend>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {STARS.map((n) => (
            <label
              key={n}
              className="cursor-pointer rounded-control p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600"
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={t('rating.outOf', { value: n })}
              />
              <Star
                className={clsx('size-8 transition-colors', n <= shown ? 'text-accent-500' : 'text-line-strong')}
                fill="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
        {shown > 0 && (
          <span className="text-sm font-semibold text-ink-muted" aria-hidden="true">
            {t(`rating.word.${shown}`)}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-xs font-semibold text-danger" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </fieldset>
  );
}

/** 5-to-1 bars as plain divs; one small chart does not justify a charting library. */
export function RatingDistribution({ distribution = {} }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...STARS.map((n) => distribution[n] ?? 0));
  return (
    <ul className="space-y-1.5" aria-label={t('rating.distribution')}>
      {[...STARS].reverse().map((n) => {
        const value = distribution[n] ?? 0;
        return (
          <li key={n} className="flex items-center gap-2 text-sm">
            <span className="flex w-8 shrink-0 items-center gap-0.5 font-semibold tabular-nums" aria-hidden="true">
              {n}
              <Star className="size-3.5 text-accent-500" fill="currentColor" strokeWidth={1.5} />
            </span>
            <span className="sr-only">{t('rating.starRow', { stars: n, value })}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas-deep ring-1 ring-inset ring-ink/5" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-700"
                style={{ width: value ? `${Math.max(3, (value / max) * 100)}%` : 0 }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-muted" aria-hidden="true">
              {value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
