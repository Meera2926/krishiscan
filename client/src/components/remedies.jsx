import { CalendarPlus, ExternalLink, Leaf, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { shortDate } from '../lib/format.js';

/**
 * The organic options the knowledge base already recommends for this disease, made shoppable.
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
      <header className="flex items-center gap-2.5 border-b border-line bg-gradient-to-r from-brand-50 to-surface px-5 py-3.5">
        <span className="grid size-8 place-items-center rounded-control bg-brand-100 text-brand-700 ring-1 ring-brand-200/70">
          <Leaf className="size-4" aria-hidden="true" />
        </span>
        <h2 className="font-bold">{t('remedies.title')}</h2>
      </header>

      <ul className="divide-y divide-line">
        {remedies.map((r, i) => {
          const open = openIndex === i;
          return (
            <li key={r.advice}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-sunken"
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ok-bg text-xs font-bold text-ok tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{r.product?.name ?? r.advice}</span>
                  {r.product && <span className="mt-0.5 block text-sm text-ink-muted">{r.advice}</span>}
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-600">
                    {r.homemade ? t('remedies.homemade') : t(open ? 'remedies.hide' : 'remedies.whereToBuy')}
                  </span>
                </span>
                {r.product?.kind && (
                  <span className="chip shrink-0 bg-ok-bg text-ok ring-1 ring-ok/15">{t(`remedies.kind.${r.product.kind}`, r.product.kind)}</span>
                )}
              </button>

              {open && (
                <div className="bg-surface-sunken px-5 pb-5 pt-1">
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

      <p className="border-t border-line bg-surface-sunken px-5 py-3 text-xs leading-relaxed text-ink-subtle">
        {t('remedies.disclaimer')}
        {sourceUrl && (
          <>
            {' '}
            <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="font-semibold underline">
              {t('result.source')}
            </a>
          </>
        )}
      </p>
    </section>
  );
}

/** When to photograph the same leaf again, so progression tracking has something to compare. */
export function FollowUpCard({ followUp, plotId }) {
  const { t, i18n } = useTranslation();
  if (!followUp) return null;
  const date = shortDate(followUp.date, i18n.language);

  return (
    <section className="card flex flex-wrap items-center gap-4 border-brand-200/70 bg-gradient-to-br from-brand-50/60 to-surface p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-control bg-brand-100 text-brand-700 ring-1 ring-brand-200/70">
        <CalendarPlus className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{t('followUp.title', { date })}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
          {t(followUp.healthy ? 'followUp.healthyBody' : 'followUp.body', { days: followUp.days })}
        </p>
      </div>
      <Link to={plotId ? `/scan?plot=${plotId}` : '/scan'} className="btn-secondary">
        {t('followUp.remind')}
      </Link>
    </section>
  );
}
