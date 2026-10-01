import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Revenue from './Revenue';
import type { PlatformRevenue } from '@dawai/shared/types';

/**
 * The sales page.
 *
 * The point of it is a distinction that is easy to lose: verified money is
 * revenue, submitted claims are a queue, and the two must never be added
 * together. The other one is the standing tiles — "what did we sell today" has
 * to survive somebody leaving the range on last quarter, which means the tiles
 * come from `summary` and never from `period`.
 */

const mocks = vi.hoisted(() => ({ revenue: vi.fn() }));

vi.mock('../api', () => ({
  downloadBlob: vi.fn(),
  platformApi: { revenue: mocks.revenue },
}));

vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@dawai/shared/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggle: vi.fn() }) }));

// Recharts measures its container, and jsdom reports every box as 0×0 — so the
// chart renders nothing at all unless the width is forced.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const FIGURES: PlatformRevenue = {
  currency: 'BDT',
  range: { from: '2026-08-05', to: '2026-09-03', granularity: 'day' },
  summary: {
    today: { total: 6000, count: 2 },
    week: { total: 14000, count: 5 },
    month: { total: 42000, count: 14 },
    year: { total: 310000, count: 96 },
    allTime: { total: 480000, count: 151 },
    pending: { total: 9000, count: 3 },
  },
  period: { total: 42000, count: 14, average: 3000, newCustomers: 5, renewals: 9 },
  subscribers: { paying: 37, expiringIn30Days: 6, onTrial: 12 },
  series: [
    { period: '2026-09-02', label: '02 Sep', total: 3000, count: 1 },
    { period: '2026-09-03', label: '03 Sep', total: 6000, count: 2 },
  ],
  byPlan: [
    { plan: 'pharmacy-plus', name: 'Pharmacy Plus', total: 24000, count: 4, months: 8 },
    { plan: 'basic', name: 'Basic', total: 18000, count: 10, months: 10 },
  ],
  byMethod: [
    { method: 'bkash', total: 30000, count: 11 },
    { method: 'cash', total: 12000, count: 3 },
  ],
  topShops: [
    {
      id: 'org1',
      name: 'Shefa Pharmacy',
      plan: 'pharmacy-plus',
      total: 18000,
      count: 3,
      lastPaidAt: '2026-09-03T09:00:00.000Z',
    },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Revenue />
    </MemoryRouter>,
  );

describe('the platform sales page', () => {
  beforeEach(() => {
    mocks.revenue.mockReset();
    mocks.revenue.mockResolvedValue(FIGURES);
  });

  it('answers "how much did we sell today" without being asked for a range', async () => {
    renderPage();
    const tile = (await screen.findByText('Today')).closest('.stat')!;
    expect(within(tile as HTMLElement).getByText(/6,000/)).toBeTruthy();
    expect(within(tile as HTMLElement).getByText('2 sales')).toBeTruthy();
  });

  it('shows the week, month and year alongside it', async () => {
    renderPage();
    for (const [label, amount] of [
      ['This week', /14,000/],
      ['This month', /42,000/],
      ['This year', /310,000/],
    ] as const) {
      const tile = (await screen.findByText(label)).closest('.stat')!;
      expect(within(tile as HTMLElement).getByText(amount)).toBeTruthy();
    }
  });

  it('keeps unverified claims out of the revenue and offers a way to clear them', async () => {
    renderPage();
    const pending = (await screen.findByText(/Awaiting verification/)).closest('a')!;
    // Its own tile, its own wording, and a link to the queue — never folded
    // into a total.
    expect(within(pending).getByText(/9,000/)).toBeTruthy();
    expect(within(pending).getByText('3 claims to check')).toBeTruthy();
    expect(pending.getAttribute('href')).toBe('/payments?status=pending');
  });

  it('names both series in the new-versus-renewal split rather than relying on colour', async () => {
    renderPage();
    const card = (await screen.findByText('New vs renewals')).closest('.card')!;
    expect(within(card as HTMLElement).getByText('First-time customers')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('5')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('Renewals')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('9')).toBeTruthy();
  });

  it('breaks the period down by plan, by method and by shop', async () => {
    renderPage();
    expect(await screen.findByText('Pharmacy Plus')).toBeTruthy();
    // The wire carries the raw method key; the page prints the brand's name.
    expect(await screen.findByText('bKash')).toBeTruthy();
    const shop = await screen.findByText('Shefa Pharmacy');
    expect(shop.getAttribute('href')).toBe('/shops/org1');
  });

  it('asks the server to re-bucket rather than re-bucketing what it has', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(mocks.revenue).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Group by'), 'month');
    // Weeks and months cannot be summed correctly out of a series the server
    // already collapsed to whatever the last request asked for.
    await waitFor(() =>
      expect(mocks.revenue).toHaveBeenLastCalledWith(
        expect.objectContaining({ granularity: 'month' }),
      ),
    );
  });

  it('sends the preset range the operator picked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(mocks.revenue).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Year to date' }));
    await waitFor(() => {
      const sent = mocks.revenue.mock.calls.at(-1)![0];
      expect(sent.from.endsWith('-01-01')).toBe(true);
      expect(sent.granularity).toBe('month');
    });
  });
});
