import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlatformLayout from './PlatformLayout';

/**
 * The Dawai console's top bar, and the bell that tells it what is waiting:
 * payments to verify (nothing extends a subscription until one is), shops
 * awaiting approval, and unanswered enquiries — each asked for only if the
 * member may see it.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  payments: vi.fn(),
  stats: vi.fn(),
  leads: vi.fn(),
  retention: vi.fn(),
  followUps: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../api', () => ({
  platformApi: {
    access: mocks.access,
    payments: mocks.payments,
    stats: mocks.stats,
    leads: mocks.leads,
    retention: mocks.retention,
    followUps: mocks.followUps,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate, Outlet: () => null };
});

const ALL_PERMISSIONS = [
  'shops.view',
  'payments.view',
  'payments.verify',
  'revenue.view',
  'plans.view',
  'team.manage',
  'leads.view',
];

const payment = (over: Record<string, unknown> = {}) => ({
  _id: `p${Math.random()}`,
  organization: { _id: 'o1', name: 'Demo Pharmacy' },
  amount: 3000,
  currency: 'BDT',
  method: 'bkash',
  status: 'pending',
  createdAt: '2026-09-03T00:00:00.000Z',
  ...over,
});

const renderConsole = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <PlatformLayout />
    </MemoryRouter>,
  );

const openBell = async () => {
  const user = userEvent.setup();
  renderConsole();
  await user.click(await screen.findByRole('button', { name: 'Notifications' }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ isOwner: true, permissions: ALL_PERMISSIONS });
  mocks.payments.mockResolvedValue({ data: [], total: 0, page: 1, limit: 4 });
  mocks.stats.mockResolvedValue({ total: 12, signupsThisWeek: 2, pending: 0, byStatus: {}, byPlan: {} });
  mocks.leads.mockResolvedValue({ data: [], waiting: 0, total: 0, page: 1, limit: 3 });
  mocks.followUps.mockResolvedValue({ data: [], total: 0 });
  mocks.retention.mockResolvedValue({
    windowDays: 7, trialsEnding: [], renewalsDue: [], lapsed: [], inactive: [],
    counts: { trialsEnding: 0, renewalsDue: 0, lapsed: 0, inactive: 0 },
  });
});

describe('the operator console’s top bar', () => {
  it('offers notifications, fullscreen, the Bangla keyboard, dark mode and the account menu', async () => {
    renderConsole();
    for (const label of [
      'Notifications',
      'Toggle fullscreen',
      'Bangla keyboard',
      'Toggle theme',
      'Account',
    ]) {
      expect(await screen.findByRole('button', { name: label }), `${label} is missing`).toBeTruthy();
    }
  });

  it('counts everything waiting on one badge', async () => {
    // 7 payments + 2 sign-ups + 4 enquiries.
    mocks.payments.mockResolvedValue({ data: [payment()], total: 7, page: 1, limit: 4 });
    mocks.stats.mockResolvedValue({ total: 12, signupsThisWeek: 2, pending: 2, byStatus: {}, byPlan: {} });
    mocks.leads.mockResolvedValue({ data: [], waiting: 4, total: 4, page: 1, limit: 3 });

    const { container } = renderConsole();
    await waitFor(() => expect(container.querySelector('.tb-badge')?.textContent).toBe('13'));
  });

  it('names what is waiting, from each source', async () => {
    mocks.payments.mockResolvedValue({ data: [payment()], total: 1, page: 1, limit: 4 });
    mocks.leads.mockResolvedValue({
      data: [{ id: 'l1', name: 'Karim Uddin', shop: 'Karim Pharmacy', topic: 'Demo' }],
      waiting: 1,
      total: 1,
      page: 1,
      limit: 3,
    });

    await openBell();

    // A payment: who paid, how much, how they sent it — enough to match a
    // bKash transaction before opening the page.
    expect(screen.getByText('Demo Pharmacy')).toBeTruthy();
    expect(screen.getByText(/BDT 3,000/)).toBeTruthy();
    expect(screen.getByText(/bkash/)).toBeTruthy();

    // An enquiry from the marketing site: who, and which shop.
    expect(screen.getByText('Karim Uddin')).toBeTruthy();
    expect(screen.getByText(/Karim Pharmacy/)).toBeTruthy();
  });

  it('offers a way to the rest of each source, with its true total', async () => {
    mocks.payments.mockResolvedValue({ data: [payment()], total: 12, page: 1, limit: 4 });
    mocks.stats.mockResolvedValue({ total: 30, signupsThisWeek: 4, pending: 4, byStatus: {}, byPlan: {} });

    await openBell();
    expect(screen.getByRole('button', { name: /12 payments to verify/ })).toBeTruthy();
    // A sign-up has nothing worth naming in the list — it is a state, not an
    // event — so this row is the only place it appears.
    expect(screen.getByRole('button', { name: /4 sign-ups awaiting approval/ })).toBeTruthy();
  });

  it('takes the operator to the payments that are waiting, filtered', async () => {
    mocks.payments.mockResolvedValue({ data: [payment()], total: 1, page: 1, limit: 4 });

    const user = await openBell();
    // Singular, because "1 payments" reads like a bug in the count.
    await user.click(screen.getByRole('button', { name: /1 payment to verify/ }));
    expect(mocks.navigate).toHaveBeenCalledWith('/payments?status=pending');
  });

  it('says plainly when there is nothing waiting', async () => {
    await openBell();
    expect(screen.getByText(/Nothing waiting/)).toBeTruthy();
  });

  it('badges the nav link each count belongs to', async () => {
    mocks.payments.mockResolvedValue({ data: [], total: 5, page: 1, limit: 4 });
    renderConsole();

    // The number sits on the Payments link as well as the bell: a count beside
    // a link is the difference between a page somebody opens and one somebody
    // remembers to.
    await waitFor(() => {
      const link = screen.getAllByRole('link', { name: /Payments/ })[0];
      expect(link.textContent).toContain('5');
    });
  });

  it('does not ask for what this member may not see', async () => {
    /*
     * The console hides links a member cannot use; the polling has to follow. A
     * support-only member asking for payments every minute collects a 403 a
     * minute in the log and learns nothing.
     */
    mocks.access.mockResolvedValue({ isOwner: false, permissions: ['leads.view'] });
    renderConsole();

    await waitFor(() => expect(mocks.leads).toHaveBeenCalled());
    expect(mocks.payments).not.toHaveBeenCalled();
    expect(mocks.stats).not.toHaveBeenCalled();
  });

  it('survives one source failing', async () => {
    // Three counts are more use than none: each call is allowed to fail alone.
    mocks.payments.mockRejectedValue(new Error('500'));
    mocks.leads.mockResolvedValue({ data: [], waiting: 2, total: 2, page: 1, limit: 3 });

    const { container } = renderConsole();
    // On the bell specifically: the same number is also on the Support link,
    // and `getByText` cannot tell them apart.
    await waitFor(() => expect(container.querySelector('.tb-badge')?.textContent).toBe('2'));
  });

  /**
   * The navigation moved out of the top bar and into a left rail.
   *
   * Eight links did not fit a 1280px bar beside the brand and the account
   * controls — Sales was the eighth and the row overflowed. The alternative was
   * grouping them behind dropdowns, which was rejected for one reason: the
   * counts. A payment nobody has verified is a shop that paid and stayed
   * locked out, and a badge folded inside a closed menu notifies nobody.
   */
  describe('the rail', () => {
    it('lists every page the member may open, badges and all', async () => {
      mocks.payments.mockResolvedValue({ data: [], total: 5, page: 1, limit: 4 });
      const { container } = renderConsole();

      await waitFor(() => {
        const rail = container.querySelector('.side-nav')!;
        expect(rail.querySelectorAll('.nav-link')).toHaveLength(10); // nine by permission (Overview, Renewals and Messages ride on shops.view), plus Security, which everyone has
        // Visible on the link itself, not behind a menu that has to be opened.
        expect(rail.querySelector('.nav-count')?.textContent).toBe('5');
      });
    });

    it('collapses to icons, for the console beside a spreadsheet', async () => {
      const user = userEvent.setup();
      const { container } = renderConsole();

      await user.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
      expect(container.querySelector('.sidebar.collapsed')).toBeTruthy();
      // The labels go; the links stay reachable, and each keeps its tooltip.
      expect(screen.queryByText('Plans')).toBeNull();
      expect(container.querySelectorAll('.side-nav .nav-link')).toHaveLength(10);

      await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
      expect(container.querySelector('.sidebar.collapsed')).toBeNull();
    });

    it('gives a phone four tabs and puts the tail in a sheet', async () => {
      const user = userEvent.setup();
      const { container } = renderConsole();

      await waitFor(() =>
        expect(container.querySelectorAll('.mobile-nav .nav-link')).toHaveLength(5),
      );

      await user.click(screen.getByRole('button', { name: /More/ }));
      const sheet = screen.getByRole('dialog', { name: 'More menu' });
      // The four that did not fit — nothing is unreachable on a phone.
      for (const label of ['Plans', 'Team']) {
        expect(within(sheet).getByText(label), `${label} is missing`).toBeTruthy();
      }
    });
  });

  it('puts the operator’s name, address and role in the account menu', async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.click(await screen.findByRole('button', { name: 'Account' }));

    expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
    // An operator had no way to change their own password at all.
    expect(screen.getByRole('button', { name: /Change password/ })).toBeTruthy();
    expect(screen.getByText('Platform owner')).toBeTruthy();
  });
});
