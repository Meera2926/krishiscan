import { CalendarPlus, ExternalLink, Leaf, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { shortDate } from '../lib/format.js';
import { IconBadge, SectionTitle } from './ui.jsx';

/**
 * The organic options the knowledge base already recommends for this disease, made shoppable
 * where there is something to buy. Field practices (rotation, removing infected leaves, hot-water
 * seed treatment) are listed as advice only.
 *
 * Nothing here is a new recommendation: each line is the advice recorded against the disease,
 * with its source. The shop links run a search rather than pointing at a product page, because
 * stock and prices cannot be checked from inside this app.
 */
export function OrganicRemedies({ remedies, sourceUrl }) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState(null);
  if (!remedies?.length) return null;

  return (
    <section className="card overflow-hidden">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <SectionTitle icon={Leaf} className="mb-2">
          {t('remedies.title')}
        </SectionTitle>
      </header>

      <ul className="divide-y divide-line px-2 pb-2 sm:px-3">
        {remedies.map((r, i) => {
          const open = openIndex === i;
          // Something to do in the field rather than buy: shown as advice, with no shop to send them to.
          if (r.practice) {
            return (
              <li key={r.advice} className="flex items-start gap-3 px-3 py-4">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 font-semibold leading-snug">{r.advice}</span>
              </li>
            );
          }
          return (
            <li key={r.advice}>
              <button
                type="button"
                className="group flex w-full items-start gap-3 rounded-control px-3 py-4 text-left transition-colors hover:bg-surface-sunken"
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-brand-900">{r.product?.name ?? r.advice}</span>
                  {r.product && <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{r.advice}</span>}
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 underline-offset-2 group-hover:underline">
                    {r.homemade ? t('remedies.homemade') : t(open ? 'remedies.hide' : 'remedies.whereToBuy')}
                  </span>
                </span>
                {r.product?.kind && (
                  <span className="chip shrink-0 bg-ok-bg text-ok ring-1 ring-ok/15">{t(`remedies.kind.${r.product.kind}`, r.product.kind)}</span>
                )}
              </button>

              {open && (
                <div className="mx-3 mb-3 rounded-control bg-surface-sunken p-4 ring-1 ring-line">
                  {r.homemade ? (
                    <p className="text-sm text-ink-muted">{t('remedies.homemadeBody')}</p>
                  ) : (
                    <>
                      <p className="mb-3 text-sm text-ink-muted">{t('remedies.searchNote', { term: r.searchTerm })}</p>
                      <div className="flex flex-wrap gap-2">
                        {r.buy.map((b) => (
                          <a
                            key={b.id}
                            href={b.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="btn-secondary"
                          >
                            <ShoppingCart className="size-4" aria-hidden="true" />
                            {b.name}
                            <ExternalLink className="size-3.5 opacity-60" aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line bg-surface-sunken px-5 py-3.5 text-xs leading-relaxed text-ink-muted sm:px-6">
        {t('remedies.disclaimer')}
        {sourceUrl && (
          <>
            {' '}
            <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-brand-700 underline">
              {t('result.source')}
            </a>
          </>
        )}
      </p>
    </section>
  );
}

/** When to photograph the same leaf again, so progression tracking has something to compare. */
export function FollowUpCard({ followUp, scanId }) {
  const { t, i18n } = useTranslation();
  if (!followUp) return null;
  const date = shortDate(followUp.date, i18n.language);

  return (
    <section className="card flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <IconBadge icon={CalendarPlus} size="lg" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-bold text-brand-900">{t('followUp.title', { date })}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
          {t(followUp.healthy ? 'followUp.healthyBody' : 'followUp.body', { days: followUp.days })}
        </p>
      </div>
      <Link to={`/scan?again=${scanId}`} className="btn-outline max-sm:w-full">
        {t('followUp.remind')}
      </Link>
    </section>
  );
}
