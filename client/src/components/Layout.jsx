import clsx from 'clsx';
import { BookOpen, Camera, ChevronDown, ClipboardCheck, History, Home, LogOut, Map, Sprout, User, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import { LANGUAGES } from '../i18n/index.js';

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  return (
    <div className="relative">
      <select
        aria-label="Language"
        className="min-h-9 appearance-none rounded-full border border-line-strong bg-surface/80 py-1 pl-3 pr-8 text-sm font-medium text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
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
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
    </div>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-control bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-[var(--shadow-brand)] ring-1 ring-brand-900/20 transition-transform duration-300 group-hover:scale-105">
        <Sprout className="size-5" aria-hidden="true" />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-brand-800">{t('app.name')}</span>
    </Link>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user, status, logout } = useAuth();

  /**
   * Navigation is per role, not one list with bits hidden. An expert has no plots, takes no
   * photos and has no scan history of their own, so offering them "Scan leaf" is an invitation
   * to a page that will never have anything on it.
   */
  const isExpert = ['expert', 'admin'].includes(user?.role);
  const nav = !user
    ? [
        { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map },
        { to: '/library', label: t('nav.library'), icon: BookOpen },
      ]
    : isExpert
      ? [
          { to: '/dashboard', label: t('nav.dashboard'), icon: Home, mobile: true },
          { to: '/consultations', label: t('nav.consultations'), icon: UserCheck, mobile: true },
          { to: '/reviews', label: t('nav.reviews'), icon: ClipboardCheck, mobile: true },
          { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map, mobile: true },
          { to: '/library', label: t('nav.library'), icon: BookOpen, mobile: true },
        ]
      : [
          { to: '/dashboard', label: t('nav.dashboard'), icon: Home, mobile: true },
          { to: '/scan', label: t('nav.scan'), icon: Camera, primary: true, mobile: true },
          { to: '/history', label: t('nav.history'), icon: History, mobile: true },
          { to: '/plots', label: t('nav.plots'), icon: Sprout, mobile: true },
          { to: '/consultations', label: t('nav.consultations'), icon: UserCheck },
          { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map },
          { to: '/library', label: t('nav.library'), icon: BookOpen, mobile: true },
        ];

  // The mobile bottom bar holds five destinations; each list marks its own.
  const mobileNav = nav.filter((n) => n.mobile);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2.5 focus:shadow-[var(--shadow-md)]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Brand />
          <nav className="ml-3 hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'relative rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-200',
                    isActive ? 'bg-brand-700 text-white shadow-[var(--shadow-brand)]' : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
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
                <NavLink
                  to="/profile"
                  className="hidden items-center gap-2 rounded-full border border-line-strong bg-surface/80 py-1 pl-1 pr-3 text-sm font-semibold text-ink-muted transition-colors hover:border-brand-300 hover:text-ink sm:inline-flex"
                  aria-label={t('nav.profile')}
                >
                  <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-700" aria-hidden="true">
                    <User className="size-3.5" />
                  </span>
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
        {/* A hairline that fades at both ends reads softer than a full-width rule. */}
        <div className="rule" aria-hidden="true" />
      </header>

      <main id="main" className={clsx('mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:py-10', user && 'pb-28 lg:pb-10')}>
        <Outlet />
      </main>

      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
          aria-label="Main mobile"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {mobileNav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                      isActive ? 'text-brand-700' : 'text-ink-subtle',
                    )
                  }
                >
                  {({ isActive }) =>
                    item.primary ? (
                      <>
                        <span className="-mt-7 grid size-14 place-items-center rounded-panel bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-[var(--shadow-brand)] ring-4 ring-surface transition-transform duration-300 active:scale-95">
                          <item.icon className="size-6" aria-hidden="true" />
                        </span>
                        <span className="max-w-full truncate px-1">{item.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="relative">
                          <item.icon className="size-5" aria-hidden="true" />
                          {isActive && (
                            <span className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-600" aria-hidden="true" />
                          )}
                        </span>
                        <span className="max-w-full truncate px-1">{item.label}</span>
                      </>
                    )
                  }
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
