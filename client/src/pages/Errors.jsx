import { SearchX, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[50dvh] place-items-center text-center">
      <div>
        <SearchX className="mx-auto mb-4 size-12 text-ink-muted" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t('errors.notFound')}</h1>
        <p className="mt-2 text-ink-muted">{t('errors.notFoundBody')}</p>
        <Link to="/" className="btn-primary mt-6">
          {t('errors.goHome')}
        </Link>
      </div>
    </div>
  );
}

/** Last-resort boundary. Deliberately avoids hooks that could themselves be what failed. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : (error?.message ?? 'Unexpected error');
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div className="max-w-md">
        <TriangleAlert className="mx-auto mb-4 size-12 text-danger" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 break-words text-ink-muted">{message}</p>
        <a href="/" className="btn-primary mt-6">
          Reload KrishiScan
        </a>
      </div>
    </div>
  );
}
