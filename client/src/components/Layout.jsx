import clsx from 'clsx';
import {
  BookOpen,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  Home,
  Leaf,
  Lightbulb,
  LogOut,
  Map,
  ShieldCheck,
  Sprout,
  User,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { isUnverifiedExpert, useAuth } from '../auth/AuthProvider.jsx';
import { LANGUAGES } from '../i18n/index.js';

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  return (
    <div className="relative">
      <select
        aria-label="Language"
        className="min-h-9 appearance-none rounded-full border border-line-strong bg-surface/90 py-1 pl-2.5 pr-6 text-sm font-medium sm:pl-3 sm:pr-8 text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
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
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 sm:right-2.5 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
    </div>
  );
}

/**
 * The leaf mark and the name. `onDark` is the white version used on the sidebar; `compact` keeps
 * only the mark on the narrowest phones, where the open pages' bar also has to fit "Log in".
 */
function Brand({ onDark = false, compact = false, className }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={clsx('group flex shrink-0 items-center gap-1.5 sm:gap-2', className)}>
      <Leaf
        className={clsx(
          'size-6 shrink-0 -rotate-12 fill-current transition-transform duration-300 group-hover:rotate-0 sm:size-7',
          onDark ? 'text-brand-200' : 'text-brand-600',
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className={clsx('text-lg font-extrabold tracking-tight sm:text-xl', onDark ? 'text-white' : 'text-brand-900', compact && 'max-[379px]:sr-only')}>
        {t('app.name')}
      </span>
    </Link>
  );
}

const TIPS = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5'];

/** One field tip a day, the same for everyone on a given date. */
function TipOfTheDay() {
  const { t } = useTranslation();
  const now = new Date();
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86_400_000);
  return (
    <div className="rounded-card bg-white/[0.07] p-4 ring-1 ring-white/10">
      <p className="flex items-center gap-2 text-sm font-bold text-white">
        <Lightbulb className="size-4 fill-accent-500 text-accent-500" aria-hidden="true" />
        {t('shell.tipTitle')}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/75">{t(`shell.${TIPS[day % TIPS.length]}`)}</p>
    </div>
  );
}

/**
 * Where the current page sits: Home, then the section, then "Details" for anything deeper.
 * Sections are looked up from the navigation itself, so the trail always uses the menu's words.
 */
function useBreadcrumbs(nav) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const home = { to: '/dashboard', label: t('nav.dashboard') };
  if (pathname === '/dashboard') return [home];
  // Pages that are reached from a section rather than listed in the menu.
  const parents = { scans: '/history', experts: '/consultations', admin: '/admin/experts', expert: '/dashboard' };
  const first = pathname.split('/')[1];
  const sectionPath = parents[first] ?? `/${first}`;
  const section = nav.find((n) => n.to === sectionPath) ?? (first === 'profile' ? { to: '/profile', label: t('nav.profile') } : null);
  const crumbs = [home];
  if (section && section.to !== '/dashboard') crumbs.push({ to: section.to, label: section.label });
  if (pathname !== section?.to) crumbs.push({ label: t('shell.details') });
  return crumbs;
}

function Breadcrumbs({ nav }) {
  const { t } = useTranslation();
  const crumbs = useBreadcrumbs(nav);
  return (
    <nav aria-label={t('shell.breadcrumb')} className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-ink-muted">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="truncate transition-colors hover:text-brand-700">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-ink" aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function AccountControls() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher />
      <NavLink
        to="/profile"
        className="hidden items-center gap-2 rounded-full border border-line-strong bg-surface/90 py-1 pl-1 pr-3 text-sm font-semibold text-ink-muted transition-colors hover:border-brand-300 hover:text-ink sm:inline-flex"
        aria-label={t('nav.profile')}
      >
        <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-700" aria-hidden="true">
          <User className="size-3.5" />
        </span>
        <span className="max-w-32 truncate">{user.name.split(' ')[0]}</span>
      </NavLink>
      <button type="button" className="btn-ghost min-h-9 px-2.5" onClick={logout} aria-label={t('nav.logout')}>
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2.5 focus:shadow-[var(--shadow-md)]"
    >
      Skip to content
    </a>
  );
}

/** Signed out: a light top bar with pill links, like the open pages of a product site. */
function PublicShell({ nav }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const { pathname, hash } = useLocation();
  // "Crops" is a section of the home page, so the two share a path and are told apart by the hash.
  const isActive = (item) => (item.hash ? pathname === '/' && hash === item.hash : item.to === '/' ? pathname === '/' && !hash : pathname.startsWith(item.to));
  const linkTo = (item) => (item.hash ? { pathname: '/', hash: item.hash } : item.to);
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
          <Brand compact />
          <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.label}
                to={linkTo(item)}
                aria-current={isActive(item) ? 'page' : undefined}
                className={clsx(
                  'rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-200',
                  isActive(item) ? 'bg-brand-100/80 text-brand-900' : 'text-ink hover:bg-brand-50',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3 lg:ml-0">
            <LanguageSwitcher />
            {status !== 'checking' && (
              <Link to="/login" className="btn-primary btn-pill min-h-10 px-4 text-sm sm:px-7">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
        {/* On narrower screens the links move under the bar, so the open pages stay one tap away. */}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2.5 lg:hidden" aria-label="Main mobile">
          {nav.map((item) => (
            <Link
              key={item.label}
              to={linkTo(item)}
              aria-current={isActive(item) ? 'page' : undefined}
              className={clsx(
                'shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
                isActive(item) ? 'bg-brand-100/80 text-brand-900' : 'text-ink-muted hover:bg-brand-50',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:py-10">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}

/** Signed in: a deep-green sidebar on wide screens, a bottom bar on phones. */
function AppShell({ nav }) {
  // The mobile bottom bar holds up to five destinations; each list marks its own.
  const mobileNav = nav.filter((n) => n.mobile);

  return (
    <div className="min-h-dvh lg:pl-64">
      <SkipLink />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gradient-to-b from-brand-800 to-brand-900 px-4 pb-5 pt-6 text-white lg:flex">
        <Brand onDark className="px-2" />
        <nav className="mt-8 flex-1 overflow-y-auto" aria-label="Main">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors duration-200',
                      isActive ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
                    )
                  }
                >
                  <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <TipOfTheDay />
      </aside>

      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Brand className="lg:hidden" />
          <div className="hidden min-w-0 lg:block">
            <Breadcrumbs nav={nav} />
          </div>
          <div className="ml-auto">
            <AccountControls />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-7 sm:px-6 sm:pt-9 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
        aria-label="Main mobile"
      >
        {/* Columns follow the list, so three items spread out rather than bunching to the left. */}
        <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }}>
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
                      <span className="-mt-7 grid size-14 place-items-center rounded-full bg-brand-700 text-white shadow-[var(--shadow-brand)] ring-4 ring-surface transition-transform duration-300 active:scale-95">
                        <item.icon className="size-6" aria-hidden="true" />
                      </span>
                      <span className="max-w-full truncate px-1">{item.label}</span>
                    </>
                  ) : (
                    <>
                      <span className={clsx('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-brand-100')}>
                        <item.icon className="size-5" aria-hidden="true" />
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
      <ScrollRestoration />
    </div>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user } = useAuth();

  /**
   * Navigation is per role, not one list with bits hidden. An expert has no plots, takes no
   * photos and has no scan history of their own, so offering them "Scan leaf" is an invitation
   * to a page that will never have anything on it. An expert still waiting to be checked gets
   * only the public pages: every case page would turn them away.
   */
  const home = { to: '/dashboard', label: t('nav.dashboard'), icon: Home, mobile: true };
  const outbreaks = { to: '/outbreaks', label: t('nav.outbreaks'), icon: Map };
  const library = { to: '/library', label: t('nav.library'), icon: BookOpen };

  if (!user) {
    // The design's menu: detection opens the scan page (which asks a visitor to log in first), and
    // "Crops" jumps to the supported-crops section of the home page.
    const open = [
      { to: '/', label: t('nav.dashboard') },
      { to: '/scan', label: t('nav.detection') },
      { to: '/', hash: '#crops', label: t('nav.crops') },
      outbreaks,
      library,
    ];
    return <PublicShell nav={open} />;
  }

  const nav = isUnverifiedExpert(user)
    ? [home, { ...outbreaks, mobile: true }, { ...library, mobile: true }]
    : user.role === 'admin'
      ? [
          home,
          { to: '/admin/experts', label: t('nav.adminExperts'), icon: ShieldCheck, mobile: true },
          { to: '/consultations', label: t('nav.consultations'), icon: UserCheck, mobile: true },
          { to: '/reviews', label: t('nav.reviews'), icon: ClipboardCheck, mobile: true },
          { ...outbreaks, mobile: true },
          library,
        ]
      : user.role === 'expert'
        ? [
            home,
            { to: '/consultations', label: t('nav.consultations'), icon: UserCheck, mobile: true },
            { to: '/reviews', label: t('nav.reviews'), icon: ClipboardCheck, mobile: true },
            { ...outbreaks, mobile: true },
            { ...library, mobile: true },
          ]
        : [
            home,
            { to: '/scan', label: t('nav.scan'), icon: Camera, primary: true, mobile: true },
            { to: '/history', label: t('nav.history'), icon: History, mobile: true },
            { to: '/plots', label: t('nav.plots'), icon: Sprout, mobile: true },
            { to: '/consultations', label: t('nav.consultations'), icon: UserCheck },
            outbreaks,
            { ...library, mobile: true },
          ];

  return <AppShell nav={nav} />;
}
