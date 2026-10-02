import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../brand';
import {
  Building2,
  LogOut,
  ShieldCheck,
  Receipt,
  TrendingUp,
  Tags,
  Users,
  Bell,
  Inbox,
  ScrollText,
  Keyboard,
  Maximize,
  Minimize,
  Moon,
  Sun,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  KeyRound,
  Pill,
  ClipboardList,
  Headset,
  CalendarClock,
  NotebookPen,
  Send,
} from 'lucide-react';
import { platformApi } from '../api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { signOut } from '@dawai/shared/api';
import { useTheme } from '@dawai/shared/hooks/useTheme';
import { useFullscreen } from '@dawai/shared/hooks/useFullscreen';
import { BanglaKeyboard } from '@dawai/shared/components/BanglaKeyboard';
import ChangePasswordDialog from '@dawai/shared/components/ChangePasswordDialog';
import type { PlatformAccess } from '@dawai/shared/types';

/**
 * The operator's shell.
 *
 * Deliberately not the shop app's layout: every panel in that shell — the
 * till, the stock alerts, the counter picker — asks for an organization, and a
 * platform admin has none. Sharing it would mean a screen full of failed
 * requests.
 *
 * It does share the *chrome*, though, down to the class names: a collapsible
 * left rail, a top bar with the account and the bell, and a bottom tab bar on a
 * phone. The links used to sit in the top bar itself, which held six of them
 * and then ran out — Sales was the eighth, and the row was overflowing into the
 * account menu on a 1280px screen. A rail grows downwards, which is the
 * direction there is room in.
 */
/** One thing waiting on the operator, from whichever source. */
interface Alert {
  key: string;
  kind: 'payment' | 'support' | 'request' | 'lead' | 'followup';
  /** Who it is about — a shop, or the medicine that was asked for. */
  title: string;
  detail: string;
  /** A word for its state, in the same pill the shop app uses. */
  tag: string;
  href: string;
}

/**
 * Each page names the permissions that make it useful.
 *
 * A member who cannot open a page is not shown it — a console full of links that
 * answer 403 reads as a broken product rather than as a locked door.
 *
 * Ordered day-to-day first, because the phone's bottom bar takes the leading
 * four and the rest move into a sheet.
 */
interface ConsoleLink {
  to: string;
  label: string;
  icon: typeof Building2;
  end: boolean;
  needs: string[];
}

/**
 * The rail, in the four jobs this console is actually used for.
 *
 * It was one column ordered day-to-day first, which was right as far as it
 * went — but "day-to-day first" is an ordering, not a map, and ten links with
 * nothing dividing them make the operator read the whole list to find the one
 * they came for. The sections are the questions: *who are the customers*, *what
 * did they pay*, *what is in the shared catalogue*, *who runs this*.
 *
 * A member who cannot open a page is not shown it — a console full of links
 * that answer 403 reads as a broken product rather than as a locked door — and
 * a section with nothing left in it is not drawn at all.
 */
const NAV_SECTIONS: { heading: string; links: ConsoleLink[] }[] = [
  {
    heading: 'Shops',
    links: [
      { to: '/', label: 'Shops', icon: Building2, end: true, needs: ['shops.view'] },
      /* Who is about to leave; badged with what ends inside a week. */
      { to: '/renewals', label: 'Renewals', icon: CalendarClock, end: false, needs: ['shops.view'] },
      /* Customers asking for help; badged with the conversations waiting on a reply. */
      {
        to: '/support',
        label: 'Support',
        icon: Headset,
        end: false,
        needs: ['support.view', 'support.reply'],
      },
      {
        /* People who are not customers yet: the marketing site's enquiries. */
        to: '/leads',
        label: 'Demo requests',
        icon: Inbox,
        end: false,
        needs: ['leads.view', 'leads.manage'],
      },
    ],
  },
  {
    heading: 'Money',
    links: [
      {
        to: '/payments',
        label: 'Payments',
        icon: Receipt,
        end: false,
        needs: ['payments.view', 'payments.verify'],
      },
      { to: '/revenue', label: 'Sales', icon: TrendingUp, end: false, needs: ['revenue.view'] },
      {
        to: '/plans',
        label: 'Plans',
        icon: Tags,
        end: false,
        needs: ['plans.view', 'plans.manage'],
      },
    ],
  },
  {
    heading: 'Catalogue',
    links: [
      { to: '/medicines', label: 'Medicines', icon: Pill, end: false, needs: ['catalogue.view'] },
      {
        /* What shops asked to have added; badged with the pending count. */
        to: '/requests',
        label: 'Requests',
        icon: ClipboardList,
        end: false,
        needs: ['catalogue.view'],
      },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { to: '/team', label: 'Team', icon: Users, end: false, needs: ['team.manage'] },
      /* Every email and SMS sent, for "I never got the email". */
      { to: '/messages', label: 'Messages', icon: Send, end: false, needs: ['shops.view', 'support.view'] },
      {
        /* Read after the fact rather than worked from, so it sits last. */
        to: '/audit',
        label: 'Audit Trail',
        icon: ScrollText,
        end: false,
        needs: ['audit.view'],
      },
      /* Your own second factor and signed-in devices. Everyone has one, so it
         needs no permission. */
      { to: '/security', label: 'Security', icon: ShieldCheck, end: false, needs: [] },
    ],
  },
];

/** Flat, for the phone tabs and for anything that wants the plain list. */
const LINKS: ConsoleLink[] = NAV_SECTIONS.flatMap((section) => section.links);

/** What the bottom bar holds before the labels start to collide. */
const MOBILE_TABS = 4;

export default function PlatformLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  // Ends the session on the server too, so the refresh cookie goes with it.
  const logout = signOut;
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  /*
   * Everything the console is waiting on, in one place.
   *
   * There was no notification of any kind: a shop paid, or signed up, or
   * asked for a medicine that is not in the catalogue, and it sat on a page
   * until somebody went and looked. Each of those is blocking somebody —
   * nothing extends a subscription until a payment is verified, and a shop
   * awaiting approval cannot use the app at all.
   *
   * Four sources, one bell. Counts are the *true* totals (what the badge is
   * for); `alerts` are the few worth naming in the panel.
   */
  const [counts, setCounts] = useState({ payments: 0, shops: 0, support: 0, requests: 0, leads: 0, renewals: 0, followUps: 0 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { theme, toggle: toggleTheme } = useTheme();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  /*
   * The Bangla keyboard, from the console too.
   *
   * An operator types a shop's name, a plan's label and a support reply, and
   * a Bangladeshi pharmacy's name is usually Bangla. Held here rather than in the
   * panel so it survives moving between pages.
   */
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /** `Dr. Rahman Ahmed` → `DR`. */
  const initials = (user?.name || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  useEffect(() => {
    platformApi
      .access()
      .then(setAccess)
      .catch(() => undefined);
  }, []);

  /*
   * One poll a minute for the lot, and only for what this member may see.
   *
   * A member's permissions decide the links they get; the polling has to
   * follow, or a support-only member collects a 403 a minute in the log and
   * learns nothing. Each call is allowed to fail on its own — a console that
   * shows three of its four counts is more use than one that shows none.
   */
  useEffect(() => {
    if (!access) return;
    const may = (...needed: string[]) => needed.some((p) => access.permissions.includes(p));

    const poll = async () => {
      const [payments, stats, leads, catalogue, support, retention, followUps] = await Promise.all([
        may('payments.view', 'payments.verify')
          ? platformApi.payments({ status: 'pending', limit: 4 }).catch(() => null)
          : null,
        may('shops.view') ? platformApi.stats().catch(() => null) : null,
        may('leads.view', 'leads.manage')
          ? platformApi.leads({ status: 'new', limit: 3 }).catch(() => null)
          : null,
        // The platform stats carry the request count; a catalogue-only member
        // cannot read them, so ask the catalogue instead.
        may('catalogue.view') && !may('shops.view')
          ? platformApi.catalogueStats().catch(() => null)
          : null,
        may('support.view', 'support.reply')
          ? platformApi.support({ status: 'open', limit: 10 }).catch(() => null)
          : null,
        may('shops.view') ? platformApi.retention(7).catch(() => null) : null,
        may('shops.view') ? platformApi.followUps(3).catch(() => null) : null,
      ]);

      setCounts({
        payments: payments?.total ?? 0,
        shops: stats?.pending ?? 0,
        support: support?.waiting ?? 0,
        // On the badge, not in the bell's total: a renewal is a call to make
        // this week, not something waiting on the operator right now.
        renewals: (retention?.counts.trialsEnding ?? 0) + (retention?.counts.renewalsDue ?? 0),
        followUps: followUps?.total ?? 0,
        requests: may('catalogue.view')
          ? stats?.pendingMedicineRequests ?? catalogue?.pendingRequests ?? 0
          : 0,
        leads: leads?.waiting ?? 0,
      });
      const next: Alert[] = [];

      for (const p of payments?.data ?? []) {
        const customer = typeof p.organization === 'string' ? 'A customer' : p.organization?.name;
        next.push({
          key: `payment-${p._id}`,
          kind: 'payment',
          title: customer || 'A customer',
          detail: [
            `${p.currency || 'BDT'} ${p.amount?.toLocaleString?.() ?? p.amount}`,
            p.method,
            p.createdAt
              ? new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
          tag: 'unverified',
          href: '/payments?status=pending',
        });
      }

      /* A call somebody promised to make today, or already should have. */
      for (const n of followUps?.data ?? []) {
        const shop = typeof n.organization === 'object' && n.organization ? n.organization : null;
        next.push({
          key: `followup-${n._id}`,
          kind: 'followup',
          title: shop?.name ?? 'A shop',
          detail: n.body.replace(/\s+/g, ' ').slice(0, 90),
          tag: n.followUpAt && new Date(n.followUpAt) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'overdue' : 'follow up today',
          href: shop ? `/shops/${shop._id}` : '/',
        });
      }

      /* Only the ones still waiting on us, newest first, and at most three. */
      for (const s of (support?.data ?? []).filter((t) => t.unreadForPlatform > 0).slice(0, 3)) {
        const shop = typeof s.organization === 'object' && s.organization ? s.organization.name : 'A shop';
        next.push({
          key: `support-${s._id}`,
          kind: 'support',
          title: shop,
          detail: [s.subject, s.lastMessagePreview].filter(Boolean).join(' · '),
          tag: 'unanswered',
          href: '/support',
        });
      }

      for (const l of leads?.data ?? []) {
        next.push({
          key: `lead-${l.id}`,
          kind: 'lead',
          title: l.name,
          /* The shop and the topic, because "who is this and what do they
             want" is the whole triage question on an enquiry. */
          detail: [l.shop, l.topic].filter(Boolean).join(' · ') || 'New demo request',
          tag: 'unanswered',
          href: '/leads',
        });
      }

      setAlerts(next);
    };

    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => window.clearInterval(id);
  }, [access]);

  // Click anywhere else and the panels close — they overlay the page they are
  // about.
  useEffect(() => {
    if (!notifOpen && !menuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [notifOpen, menuOpen]);

  /**
   * What each link is waiting on.
   *
   * The Support link has carried a count since it was written, for the reason
   * that a number beside a link is the difference between an inbox somebody
   * opens and one somebody remembers to. Payments needed the same and did not
   * have it: nothing extends a subscription until an operator verifies a
   * payment, so an unnoticed one is a shop that paid and stayed locked out.
   */
  const badges: Record<string, number> = {
    '/': counts.shops,
    '/payments': counts.payments,
    '/support': counts.support,
    '/renewals': counts.renewals,
    '/leads': counts.leads,
    '/requests': counts.requests,
  };

  /** What the bell counts: everything waiting, from every source. */
  const waitingTotal =
    counts.payments + counts.shops + counts.support + counts.requests + counts.leads + counts.followUps;

  // Until the answer arrives, show nothing rather than everything: a flash of
  // links somebody cannot use is worse than a moment of none.
  const visible = access
    ? LINKS.filter((l) => l.needs.length === 0 || l.needs.some((p) => access.permissions.includes(p)))
    : [];

  /** The same filter, kept in sections, with the empty ones dropped. */
  const visibleSections = access
    ? NAV_SECTIONS.map((section) => ({
        ...section,
        links: section.links.filter((l) => l.needs.length === 0 || l.needs.some((p) => access.permissions.includes(p))),
      })).filter((section) => section.links.length > 0)
    : [];

  const primaryLinks = visible.slice(0, MOBILE_TABS);
  const moreLinks = visible.slice(MOBILE_TABS);
  const moreActive = moreLinks.some((l) => location.pathname.startsWith(l.to));

  return (
    <div className="app-shell">
      <div className="app-wrap">
        {/*
          The rail. Collapsing it to icons is what makes the console usable
          beside a spreadsheet on a laptop — the pages themselves are wide
          tables.
        */}
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
          <div className="sidebar-brand">
            <span className="topbar-logo">
              <ShieldCheck className="h-4 w-4" />
            </span>
            {!collapsed && (
              <div className="topbar-title">
                <strong>{BRAND.name}</strong>
                <small>{BRAND.console}</small>
              </div>
            )}
          </div>
          <button
            className={`sidebar-toggle${collapsed ? ' collapsed' : ''}`}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sidebar-toggle-circle">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </span>
          </button>

          <nav className="side-nav">
            {visibleSections.map((section) => (
              <div key={section.heading} className="nav-section">
                {/* Collapsed to icons a word does not fit, but the grouping still should. */}
                {collapsed ? (
                  <span className="nav-section-rule" aria-hidden="true" />
                ) : (
                  <p className="nav-section-heading">{section.heading}</p>
                )}
                {section.links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    title={collapsed ? l.label : undefined}
                  >
                    <l.icon className="nav-icon" strokeWidth={2} />
                    {!collapsed && <span>{l.label}</span>}
                    {badges[l.to] > 0 && <span className="nav-count">{badges[l.to]}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          {!collapsed && (
            <div className="sidebar-foot">
              © {new Date().getFullYear()} {BRAND.name}
              <br />
              Powered by CyberLab
            </div>
          )}
        </aside>

        <div className="app-main">
          <header className="app-topbar">
            {/* Only on a phone, where there is no rail to carry it. */}
            <div className="topbar-brand">
              <span className="topbar-logo">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="topbar-title">
                <strong>{BRAND.name}</strong>
                <small>{BRAND.console}</small>
              </div>
            </div>

            <div className="topbar-actions">
              {/*
                The console's own chrome, matching the shop app's.

                It had none of this: no notification of a payment arriving, no
                dark mode on a screen an operator has open all day, no
                fullscreen for the wall display, and no Bangla keyboard for a
                shop's own name.
              */}
              <div className="tb-wrap" ref={notifRef}>
                <button
                  className={`tb-icon-btn${notifOpen ? ' active' : ''}`}
                  onClick={() => setNotifOpen((v) => !v)}
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {waitingTotal > 0 && <span className="tb-badge">{waitingTotal}</span>}
                </button>
                {notifOpen && (
                  <div className="tb-dropdown tb-notif">
                    <div className="tb-dd-head">Waiting for you</div>

                    {waitingTotal === 0 && (
                      <div className="tb-dd-empty">
                        Nothing waiting — payments, sign-ups, support, demo requests and medicine
                        requests are all clear.
                      </div>
                    )}

                    {alerts.length > 0 && (
                      <div className="tb-notif-list">
                        {alerts.map((a) => (
                          <button
                            key={a.key}
                            className="tb-notif-item w-full text-left"
                            onClick={() => {
                              setNotifOpen(false);
                              navigate(a.href);
                            }}
                          >
                            <div className="tb-notif-name">
                              <strong>{a.title}</strong>
                              <span className="pill waiting">{a.tag}</span>
                            </div>
                            <div className="tb-notif-msg">{a.detail}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/*
                      One row per source that has anything, with its true total —
                      the panel names a few and these are the way to the rest. A
                      shop awaiting approval has nothing worth naming (it is a
                      sign-up, not an event), so it only ever appears here.
                    */}
                    {(
                      [
                        ['payment', 'payments', counts.payments, 'to verify', '/payments?status=pending', <Receipt key="i" className="h-4 w-4" />],
                        ['sign-up', 'sign-ups', counts.shops, 'awaiting approval', '/?status=pending', <Building2 key="i" className="h-4 w-4" />],
                        ['follow-up', 'follow-ups', counts.followUps, 'due today', '/', <NotebookPen key="i" className="h-4 w-4" />],
                        ['support conversation', 'support conversations', counts.support, 'waiting on a reply', '/support', <Headset key="i" className="h-4 w-4" />],
                        ['demo request', 'demo requests', counts.leads, 'unanswered', '/leads', <Inbox key="i" className="h-4 w-4" />],
                        ['medicine request', 'medicine requests', counts.requests, 'waiting', '/requests', <ClipboardList key="i" className="h-4 w-4" />],
                      ] as [string, string, number, string, string, JSX.Element][]
                    )
                      .filter(([, , count]) => count > 0)
                      .map(([one, many, count, verb, href, icon]) => (
                        <button
                          key={href}
                          className="tb-dd-item"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(href);
                          }}
                        >
                          {icon}
                          {/* "1 payments to verify" reads like a bug in the count. */}
                          {count} {count === 1 ? one : many} {verb}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <button
                className="tb-icon-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label="Toggle fullscreen"
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>

              <button
                className={`tb-icon-btn${keyboardOpen ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setKeyboardOpen((v) => !v)}
                title="বাংলা কীবোর্ড"
                aria-label="Bangla keyboard"
                aria-pressed={keyboardOpen}
              >
                <Keyboard className="h-5 w-5" />
              </button>

              <button
                className="tb-icon-btn"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/*
                The operator, behind their own initials.

                The name and a Sign out button sat in the bar itself, which on a
                1280px console left the navigation and these controls fighting
                for the same row. Under an avatar they cost 32px, and the menu
                has room for the things an account needs — including changing
                its own password, which an operator had no way to do at all.
              */}
              <div className="tb-wrap" ref={menuRef}>
                <button
                  className={`tb-profile${menuOpen ? ' active' : ''}`}
                  onClick={() => {
                    setMenuOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  aria-label="Account"
                  aria-expanded={menuOpen}
                >
                  <span className="tb-avatar">{initials}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform${
                      menuOpen ? ' rotate-180' : ''
                    }`}
                  />
                </button>
                {menuOpen && (
                  <div className="tb-dropdown">
                    <div className="tb-dd-user">
                      <strong>{user?.name}</strong>
                      {/* The role on its own line: an email and a role run
                          together on one line read as one string, and an
                          operator's address is long enough to push the role off
                          the edge. */}
                      <span>{user?.email}</span>
                      <span>{access?.isOwner ? 'Platform owner' : 'Platform staff'}</span>
                    </div>
                    <div className="tb-dd-sep" />
                    <button
                      className="tb-dd-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setPasswordOpen(true);
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                      Change password
                    </button>
                    <button
                      className="tb-dd-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/security');
                      }}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Two-factor and devices
                    </button>
                    <button
                      className="tb-dd-item danger"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="main">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Outside `main`, so it survives every page change; it portals to the
          body itself. */}
      {keyboardOpen && <BanglaKeyboard onClose={() => setKeyboardOpen(false)} />}

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => {
          // Every session for this account is already invalidated on the
          // server, this one included — see the dialog.
          setPasswordOpen(false);
          logout();
          navigate('/login');
        }}
      />

      {moreOpen && (
        <>
          <div
            className="mobile-sheet-backdrop no-print"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-sheet no-print" role="dialog" aria-label="More menu">
            <div className="mobile-sheet-head">
              <span>More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mobile-sheet-grid">
              {moreLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => `mobile-sheet-item${isActive ? ' active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <l.icon className="h-5 w-5" strokeWidth={2} />
                  <span>{l.label}</span>
                  {badges[l.to] > 0 && <span className="nav-count">{badges[l.to]}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      {/* The phone gets the leading four as tabs; the tail lives in the sheet. */}
      <nav className="mobile-nav no-print">
        {primaryLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            onClick={() => setMoreOpen(false)}
          >
            <l.icon className="nav-icon h-4 w-4" strokeWidth={2} />
            {/* "Medicine Requests" does not fit a tab; the first word does. */}
            <span>{l.label.split(' ')[0]}</span>
            {badges[l.to] > 0 && <span className="nav-count">{badges[l.to]}</span>}
          </NavLink>
        ))}
        {moreLinks.length > 0 && (
          <button
            type="button"
            className={`nav-link${moreOpen || moreActive ? ' active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="nav-icon h-4 w-4" strokeWidth={2} />
            <span>More</span>
          </button>
        )}
      </nav>
    </div>
  );
}
