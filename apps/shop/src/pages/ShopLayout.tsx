import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCan, useLoadAccess, type ShopPermission } from '../access';
import {
  Store,
  ScanLine,
  ReceiptText,
  Boxes,
  LayoutGrid,
  CalendarX2,
  Truck,
  ClipboardList,
  Users,
  Building2,
  BarChart3,
  Landmark,
  History,
  UserCog,
  Monitor,
  Trash2,
  Settings as SettingsIcon,
  CreditCard,
  MoreHorizontal,
  Moon,
  Sun,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Headset,
  LifeBuoy,
  MapPin,
  LayoutDashboard,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useTheme } from '@dawai/shared/hooks/useTheme';
import FindAnything from '../components/FindAnything';
import ProfileMenu from '../components/ProfileMenu';
import { useT, useLangStore, bnNumerals } from '../i18n/ui';
import AlertBell from '../alerts/AlertBell';
import AlertTicker from '../alerts/AlertTicker';
import { useStockAlertsPoll } from '../alerts/useStockAlerts';
import { BRAND } from '../brand';
import { supportApi, onlineOrdersApi } from '../api';
import SetupChecklist from '../components/SetupChecklist';
import BranchSwitcher from '../components/BranchSwitcher';
import { useBranchStore } from '../branch';

/**
 * The shop's shell.
 *
 * Deliberately the same shape as the operator console — a rail on the left, a
 * bar across the top — because one shell is one thing to learn, and the shared
 * components behave the same in both. The colour is the shop's own: green, the
 * colour money is counted in.
 *
 * On a phone the rail becomes a bar of four with everything else behind
 * "More". Nine tabs across 390px is nine labels colliding, and a counter's
 * handset gets used for two things — checking stock and checking the day — not
 * for running the shop.
 */

interface ShopLink {
  to: string;
  label: string;
  icon: typeof Store;
  end: boolean;
  /** What the person's role must allow for the link to show (types in access.ts). */
  perm?: ShopPermission;
  /** The account owner's alone. */
  ownerOnly?: boolean;
}

/**
 * The rail, in four groups.
 *
 * Eleven links in one column is a list somebody reads every time instead of
 * pointing at. Grouped the way the work actually divides — the counter, the
 * people with accounts, the shelves, and the things touched once a month — so
 * the eye lands in the right third of the rail before it reads any word.
 *
 * The headings are not links and carry nothing a salesman cannot see: a group
 * whose every link is hidden from them is not drawn at all.
 */
interface ShopGroup {
  /** Left off the first group: the counter needs no heading. */
  title?: string;
  links: ShopLink[];
}

const GROUPS: ShopGroup[] = [
  {
    links: [
      /* Back to the counter. It has no rail of its own — a till is full bleed —
         so this is the only way back into it from the shop. */
      /* The owner's first screen: the shop at a glance. */
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: false, perm: 'reports.view' },
      { to: '/', label: 'POS', icon: ScanLine, end: true, perm: 'pos.sell' },
      /* Beside the counter, because it is the counter's own screen as much as
         the owner's: somebody comes back holding a slip, and that is where the
         bill is found. A salesman sees their own bills there and no margin. */
      { to: '/sales', label: 'Sales', icon: ReceiptText, end: false },
      /* Orders customers send through the shop's link — badged with the new ones. */
      { to: '/online-orders', label: 'Online orders', icon: ShoppingBag, end: false, perm: 'online_orders.manage' },
    ],
  },
  {
    /* The people the shop deals with. Not "Accounts": that is the money
       page, and one word for two things is one too many. */
    title: 'People',
    links: [
      /* The baki khata. Not admin-only: a salesman takes the money when
         somebody comes to settle, and has to be able to show them what it is
         for. */
      { to: '/customers', label: 'Customers', icon: Users, end: false },
      { to: '/suppliers', label: 'Suppliers', icon: Building2, end: false, perm: 'purchases.manage' },
    ],
  },
  {
    title: 'Inventory',
    links: [
      /* The stock list carries what the shop paid and what it is worth, so it
         belongs with the back room. A salesman sees what is left on the shelf
         in the POS search, beside the name, which is what they need. */
      { to: '/stock', label: 'Stock', icon: Boxes, end: false, perm: 'stock.view' },
      { to: '/purchases', label: 'Purchases', icon: Truck, end: false, perm: 'purchases.manage' },
      /* Beside the deliveries, because it is the half that comes before one. */
      { to: '/orders', label: 'Orders', icon: ClipboardList, end: false, perm: 'purchases.manage' },
      { to: '/racks', label: 'Racks', icon: LayoutGrid, end: false, perm: 'stock.view' },
      { to: '/expiry', label: 'Expiry', icon: CalendarX2, end: false, perm: 'stock.view' },
    ],
  },
  {
    title: 'Money',
    links: [
      { to: '/reports', label: 'Reports', icon: BarChart3, end: false },
      /* Every taka in and out in one place — profit and loss, the cash book,
         the expenses and the money that comes in without a bill. */
      { to: '/accounts', label: 'Accounts', icon: Landmark, end: false, perm: 'accounts.view' },
    ],
  },
  {
    /* Set up once, then only looked at — and the owner's own trail. */
    title: 'Manage',
    links: [
      /* Where people stand. With the shop's own settings rather than with the
         shelves: it is set up once and then only looked at. */
      { to: '/counters', label: 'Counters', icon: Monitor, end: false, perm: 'settings.manage' },
      { to: '/staff', label: 'Staff', icon: UserCog, end: false, perm: 'staff.manage' },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false, perm: 'settings.manage' },
      /* The plan and paying for it — the owner's alone, like the trail below. */
      { to: '/subscription', label: 'Subscription', icon: CreditCard, end: false, ownerOnly: true },
      /* The shop's locations — part of what it pays for, so the owner's. */
      { to: '/branches', label: 'Branches', icon: MapPin, end: false, perm: 'branches.manage' },
      /* Who did what and when — the owner's own trail of the shop. */
      { to: '/activity', label: 'Activity', icon: History, end: false, perm: 'audit.view' },
      /* Nothing deleted is destroyed, and this is where it went. With the
         shop's own things rather than the shelves: it holds all of them. */
      { to: '/trash', label: 'Recycle Bin', icon: Trash2, end: false, perm: 'audit.view' },
      /* Every role: the person who notices something wrong is usually the one
         at the counter. Badged with the replies nobody here has read yet. */
      { to: '/support', label: 'Support', icon: Headset, end: false },
      /* How-tos, for everyone — the answer before a support message. */
      { to: '/help', label: 'Help', icon: LifeBuoy, end: false },
    ],
  },
];

/** What fits across a phone before the labels start to collide. */
const PHONE_TABS = 4;

/** Remembered per machine: the counter PC and the office laptop want different rails. */
const RAIL_KEY = 'dawai.shop.rail';
/** Which groups are folded away, remembered per machine like the rail itself. */
const GROUPS_KEY = 'dawai.shop.rail.groups';

export default function ShopLayout() {
  const t = useT();
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  /*
   * The rail, folded down to its icons.
   *
   * Kept per browser rather than per account: the machine at the counter is a
   * narrow screen that wants every pixel for the bill, and the owner's laptop
   * in the back room is not. Whoever sits at each one decides once.
   */
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== 'closed';
    } catch {
      return true;
    }
  });

  const toggleRail = () => {
    setRailOpen((v) => {
      try {
        localStorage.setItem(RAIL_KEY, v ? 'closed' : 'open');
      } catch {
        /* A locked store is not a reason to refuse to fold the menu. */
      }
      return !v;
    });
  };
  /*
   * Groups folded away.
   *
   * The owner who never opens Expenses or the Bin from the counter PC can put
   * "The shop" away and keep the rail to what they use; the choice sticks on
   * that machine. A folded group still shows the page you are on, so folding
   * never hides where you are.
   */
  const [folded, setFolded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const foldGroup = (title: string) =>
    setFolded((cur) => {
      const next = { ...cur, [title]: !cur[title] };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* Still folds for this visit. */
      }
      return next;
    });
  const { pathname } = useLocation();
  const isHere = (l: ShopLink) => (l.end ? pathname === l.to : pathname === l.to || pathname.startsWith(`${l.to}/`));
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const { theme, toggle } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  /* A switch of branch starts the page again, so nothing on it is the old branch's. */
  const branchKey = useBranchStore((s) => s.branch);
  /* Expired lots and empty shelves, polled for the bell and the ticker. */
  useStockAlertsPoll();

  /*
   * Replies from support nobody here has read yet.
   *
   * Counted in the shell rather than on the page, so a reply is noticed from
   * the till. Re-asked on every move, because opening the conversation is what
   * clears it, and once a minute otherwise.
   */
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => {
    let live = true;
    const ask = () =>
      supportApi
        .unread()
        .then((d) => live && setSupportUnread(d.unread))
        .catch(() => undefined);
    void ask();
    const tick = window.setInterval(() => document.visibilityState === 'visible' && void ask(), 60_000);
    return () => {
      live = false;
      window.clearInterval(tick);
    };
  }, [pathname]);
  /* New online orders, asked every half minute: a customer is waiting on each. */
  const [newOrders, setNewOrders] = useState(0);
  /* Online orders come with some plans only; off the plan, the menu does not offer them. */
  const [ordersAllowed, setOrdersAllowed] = useState(true);
  useEffect(() => {
    let live = true;
    const ask = () =>
      onlineOrdersApi
        .count()
        .then((d) => {
          if (!live) return;
          setNewOrders(d.count);
          setOrdersAllowed(d.allowed !== false);
        })
        .catch(() => undefined);
    void ask();
    const tick = window.setInterval(() => document.visibilityState === 'visible' && void ask(), 30_000);
    return () => {
      live = false;
      window.clearInterval(tick);
    };
  }, [pathname]);
  const badgeOf = (to: string) => (to === '/support' ? supportUnread : to === '/online-orders' ? newOrders : 0);
  const count = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

  /* A salesman sees the counter and nothing that carries a purchase price. */
  const can = useCan();
  useLoadAccess();
  /* The bell's stock alerts are for whoever looks after the shelves. */
  const runsTheShop = can('stock.view');
  /* The account's owner — the server refuses the Activity trail to anybody else. */
  const owns = user?.role === 'admin';
  const groups = GROUPS.map((g) => ({
    ...g,
    links: g.links.filter(
      (l) => can(l.perm) && (!l.ownerOnly || owns) && (l.to !== '/online-orders' || ordersAllowed),
    ),
  })).filter((g) => g.links.length > 0);

  /* The phone bar is flat: four tabs and a More sheet. Groups are a shape for a
     column, and a bar across 390px has no room to draw one. */
  const links = groups.flatMap((g) => g.links);
  const pinned = links.slice(0, PHONE_TABS);
  const rest = links.slice(PHONE_TABS);

  const railWidth = railOpen ? 'w-60' : 'w-[4.5rem]';

  return (
    /*
      The bar runs the whole width, and the brand sits in it.

      Before this the mark was the first thing inside the rail, so it scrolled
      away with the menu — a logo that slides off the screen is not branding,
      it is a list item. Now the header is one band across the top and the brand
      occupies the rail's column of it, which is where the eye already expects a
      product's name to be and where it cannot move.
    */
    <div className="shell-h flex flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-card">
        {/* ---- the brand, in the rail's column of the band ---- */}
        <div
          className={`relative hidden h-full shrink-0 items-center gap-3 border-r border-border px-3 lg:flex ${railWidth} transition-[width] duration-150`}
        >
          {/*
            The fold, on the corner where the two lines meet.

            Half of the circle over the rail's edge and half over the page, at
            the height of the logo, where the eye already is when it goes
            looking for the rail. It rides with the rail when it folds, because it is anchored
            to the brand's column rather than to the screen.
          */}
          <button
            type="button"
            onClick={toggleRail}
            aria-label={t(railOpen ? 'Fold the menu' : 'Open the menu')}
            title={t(railOpen ? 'Fold the menu' : 'Open the menu')}
            className="absolute -right-3 top-1/2 z-50 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            {railOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-[18px] w-[18px]" />
          </span>
          {railOpen && (
            <div className="min-w-0 leading-tight">
              <strong className="block truncate text-sm font-semibold">{BRAND.name}</strong>
              <small className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t('Pharmacy')}
              </small>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          {/* On a phone the rail is not drawn, so the bar carries the mark. */}
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground lg:hidden">
            <Store className="h-4 w-4" />
          </span>

          {/* One box that finds anything — a bill, an invoice, a medicine, a
              name. In the bar on every screen, because a shopkeeper types the
              thing they know rather than working out which page it lives on. */}
          <FindAnything />

          <div className="ml-auto flex items-center gap-1.5">
            {/*
              Bangla or English, per person rather than per shop.

              One counter may be staffed by somebody who wants Bangla and the
              owner's own laptop by somebody who does not — see i18n/ui.ts. Two
              letters rather than a flag: a flag is a country, and both of these
              are read by people in the same one.
            */}
            {/* The owner's alone: setting the shop up is their job. */}
            {/* Only drawn for a shop with more than one branch. */}
            <BranchSwitcher />
            {owns && <SetupChecklist />}
            <AlertBell runsTheShop={runsTheShop} />
            <button
              type="button"
              onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
              className="rounded-md px-2 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={lang === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন'}
              aria-label={t('Switch language')}
            >
              {lang === 'bn' ? 'EN' : 'বাং'}
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t(theme === 'dark' ? 'Light mode' : 'Dark mode')}
              title={t(theme === 'dark' ? 'Light mode' : 'Dark mode')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {/* Who is signed in, and the three things they do about it —
                their own details, their own password, and the way out. */}
            <ProfileMenu />
          </div>
        </div>
      </header>

      {/* ---- the rail and the page, each scrolling on its own ---- */}
      <div className="flex min-h-0 flex-1">
        {/*
          The rail is wrapped, and the wrapper is what the arrow hangs off.

          It cannot hang off the rail itself: that scrolls, and anything sitting
          outside a scrolling box is clipped by it. The wrapper does not scroll,
          so the circle can straddle the line.
        */}
        <div className="hidden shrink-0 lg:block">
          <aside
            className={`flex h-full flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-card px-3 py-4 ${railWidth} transition-[width] duration-150`}
          >
            <nav className="flex flex-col gap-4">
              {groups.map((g, i) => {
                /* Only an open rail folds: folded to icons, every icon shows. */
                const shut = !!g.title && railOpen && !!folded[g.title];
                const link = (l: ShopLink) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    title={railOpen ? undefined : t(l.label)}
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}${railOpen ? '' : ' justify-center px-0'}`
                    }
                  >
                    <span className="relative shrink-0">
                      <l.icon className="nav-icon" strokeWidth={2} />
                      {!railOpen && badgeOf(l.to) > 0 && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                      )}
                    </span>
                    {railOpen && <span className="min-w-0 flex-1 truncate">{t(l.label)}</span>}
                    {railOpen && badgeOf(l.to) > 0 && (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
                        {count(badgeOf(l.to))}
                      </span>
                    )}
                  </NavLink>
                );
                return (
                  <div key={g.title ?? i} className="flex flex-col gap-0.5">
                    {g.title && railOpen && (
                      <button
                        type="button"
                        onClick={() => foldGroup(g.title!)}
                        aria-expanded={!shut}
                        className="group/head flex items-center justify-between rounded-md px-2 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span>{t(g.title)}</span>
                        <span className="flex items-center gap-1">
                          {shut && (
                            <span className="rounded-full bg-muted px-1.5 font-sans text-[9.5px] normal-case tracking-normal tabular-nums">
                              {g.links.length}
                            </span>
                          )}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${shut ? '-rotate-90' : ''}`}
                          />
                        </span>
                      </button>
                    )}
                    {/* Folded, a rule stands in for the heading: the grouping is
                        still worth seeing when the words are gone. */}
                    {g.title && !railOpen && <div className="mx-2 mb-1 border-t border-border" />}
                    {/* Rows animate between one fraction and none, so the
                        group slides shut rather than blinking out. */}
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                        shut ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                      }`}
                    >
                      {/* Shut, the links are out of reach as well as out of
                          sight — no tabbing into a group that looks closed. */}
                      <div
                        className="flex min-h-0 flex-col gap-0.5 overflow-hidden"
                        {...(shut ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}
                      >
                        {g.links.map(link)}
                      </div>
                    </div>
                    {/* The page you are on stays in view even with its group shut. */}
                    {shut && g.links.filter(isHere).map(link)}
                  </div>
                );
              })}
            </nav>

            {/*
              Its own block at the foot of the rail, on a ground of its own.

              Loose text at the bottom of a column reads as something that ran
              out rather than as a footer; a band closes the rail off and says
              the list has ended. Only when the rail is open — folded, there is
              no room for a word of it.
            */}
            {railOpen && (
              <div className="mt-auto pt-4">
                <div className="rounded-lg bg-muted px-3 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                  © {new Date().getFullYear()} {BRAND.name}
                  <br />
                  Powered by CyberLab
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">

        {/* The bottom bar is fixed on a phone, so the page ends above it; on a
            desktop the same room keeps a page's last row — a pager, usually —
            clear of the back-to-top button that floats there. */}
        <main
          ref={mainRef}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 400)}
          className="min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-20 sm:px-6 lg:pb-20"
        >
          <Fragment key={branchKey}>
            <Outlet />
          </Fragment>
        </main>

        {/* In the flow under the page rather than fixed, so it never covers the
            last row of a list; lifted over the tab bar on a phone. */}
        <AlertTicker className="mb-14 lg:mb-0" />

        {/*
          Back to the top.

          Only once somebody is far enough down that the way back is a real
          journey — a button that is always there is a button in the way. Bottom
          right on a desktop, and lifted clear of the tab bar on a phone.
        */}
        {scrolled && (
          <button
            type="button"
            onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title={t('Back to the top')}
            aria-label={t('Back to the top')}
            className="fixed bottom-28 right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-primary shadow-lg transition-colors hover:bg-primary hover:text-primary-foreground lg:bottom-14 lg:right-6"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}

        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card lg:hidden">
          {pinned.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`
              }
            >
              <l.icon className="h-5 w-5" strokeWidth={2} />
              {t(l.label)}
            </NavLink>
          ))}
          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <span className="relative">
                <MoreHorizontal className="h-5 w-5" />
                {rest.some((l) => badgeOf(l.to) > 0) && (
                  <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                )}
              </span>
              {t('More')}
            </button>
          )}
        </nav>

        {moreOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="w-full rounded-t-2xl border-t border-border bg-card p-4 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-sm">{t('Everything else')}</strong>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label={t('Close')}
                  className="rounded p-1 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {rest.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    onClick={() => setMoreOpen(false)}
                    className="relative flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-xs font-medium"
                  >
                    <l.icon className="h-5 w-5" strokeWidth={2} />
                    {t(l.label)}
                    {badgeOf(l.to) > 0 && (
                      <span className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
                        {count(badgeOf(l.to))}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
