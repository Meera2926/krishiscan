import clsx from 'clsx';
import { BookOpen, Camera, ClipboardCheck, History, Home, LogOut, Map, Sprout, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import { LANGUAGES } from '../i18n/index.js';

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  return (
    <select
      aria-label="Language"
      className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm"
      value={i18n.language}
      onChange={(e) => {
        i18n.changeLanguage(e.target.value);
        if (user) updateProfile({ preferredLanguage: e.target.value }).catch(() => {});
      }}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="flex items-center gap-2 font-bold text-brand-800">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-brand-100">
        <Sprout className="size-5" aria-hidden="true" />
      </span>
      <span className="text-lg tracking-tight">{t('app.name')}</span>
    </Link>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user, status, logout } = useAuth();

  const nav = user
    ? [
        { to: '/dashboard', label: t('nav.dashboard'), icon: Home },
        { to: '/scan', label: t('nav.scan'), icon: Camera, primary: true },
        { to: '/history', label: t('nav.history'), icon: History },
        { to: '/plots', label: t('nav.plots'), icon: Sprout },
        { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map },
        { to: '/library', label: t('nav.library'), icon: BookOpen },
        ...(user.role !== 'farmer' ? [{ to: '/reviews', label: t('nav.reviews'), icon: ClipboardCheck }] : []),
      ]
    : [
        { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map },
        { to: '/library', label: t('nav.library'), icon: BookOpen },
      ];

  // The mobile bottom bar holds the five most-used destinations.
  const mobileNav = user ? nav.filter((n) => ['/dashboard', '/scan', '/history', '/plots', '/library'].includes(n.to)) : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Brand />
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-brand-100 text-brand-800' : 'text-ink-muted hover:bg-black/5 hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            {user ? (
              <>
                <NavLink to="/profile" className="btn-ghost hidden px-3 sm:inline-flex" aria-label={t('nav.profile')}>
                  <User className="size-4" aria-hidden="true" />
                  <span className="max-w-32 truncate">{user.name.split(' ')[0]}</span>
                </NavLink>
                <button type="button" className="btn-ghost px-3" onClick={logout} aria-label={t('nav.logout')}>
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              status !== 'checking' && (
                <>
                  <Link to="/login" className="btn-ghost">
                    {t('nav.login')}
                  </Link>
                  <Link to="/register" className="btn-primary hidden sm:inline-flex">
                    {t('nav.register')}
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </header>

      <main id="main" className={clsx('mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8', user && 'pb-28 lg:pb-8')}>
        <Outlet />
      </main>

      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Main mobile"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {mobileNav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                      isActive ? 'text-brand-700' : 'text-ink-muted',
                    )
                  }
                >
                  {item.primary ? (
                    <span className="-mt-6 grid size-12 place-items-center rounded-2xl bg-brand-700 text-white shadow-lg shadow-brand-700/30">
                      <item.icon className="size-6" aria-hidden="true" />
                    </span>
                  ) : (
                    <item.icon className="size-5" aria-hidden="true" />
                  )}
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <ScrollRestoration />
    </div>
  );
}
