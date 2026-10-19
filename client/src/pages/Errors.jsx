import { House, Leaf, RotateCw, SearchX, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

/**
 * The shared frame: a white card centred on the canvas, with the same faint corner leaf as HeroPanel.
 * Only a sliver of the leaf is tucked under the edge, so its outline still reads as a leaf.
 */
function ErrorPanel({ badge, children }) {
  return (
    <div className="card-raised animate-rise relative w-full max-w-md overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand-100/80 blur-3xl" aria-hidden="true" />
      <Leaf
        className="pointer-events-none absolute -bottom-5 -right-3 size-20 -rotate-12 fill-brand-200/40 text-brand-300/50 sm:size-28"
        strokeWidth={0.75}
        aria-hidden="true"
      />
      <div className="relative">
        {badge}
        {children}
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60dvh] place-items-center py-6">
      <ErrorPanel
        badge={
          <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full bg-brand-100 text-brand-700 ring-8 ring-brand-50">
            <SearchX className="size-9" aria-hidden="true" />
          </div>
        }
      >
        <p className="text-5xl font-extrabold leading-none text-brand-200" aria-hidden="true">
          404
        </p>
        <h1 className="mt-3 text-2xl font-extrabold text-brand-900">{t('errors.notFound')}</h1>
        <p className="mt-2 text-ink-muted">{t('errors.notFoundBody')}</p>
        <Link to="/" className="btn-primary btn-pill mt-7">
          <House className="size-4" aria-hidden="true" />
          {t('errors.goHome')}
        </Link>
      </ErrorPanel>
    </div>
  );
}

/** Last-resort boundary. Deliberately avoids hooks that could themselves be what failed. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : (error?.message ?? 'Unexpected error');
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4 sm:p-6">
      <ErrorPanel
        badge={
          <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full bg-danger-bg text-danger ring-8 ring-danger-bg/50">
            <TriangleAlert className="size-9" aria-hidden="true" />
          </div>
        }
      >
        <h1 className="text-2xl font-extrabold text-brand-900">Something went wrong</h1>
        <p className="mt-2 break-words text-ink-muted">{message}</p>
        <a href="/" className="btn-primary btn-pill mt-7">
          <RotateCw className="size-4" aria-hidden="true" />
          Reload KrishiScan
        </a>
      </ErrorPanel>
    </div>
  );
}
