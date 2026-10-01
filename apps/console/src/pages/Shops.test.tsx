import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Shops from './Shops';

/**
 * The plan picker on the Shops page: the catalogue's own plans, never a list
 * written into the page, and a shop sitting on a retired plan still shows it.
 */

const mocks = vi.hoisted(() => ({
  organizations: vi.fn(),
  stats: vi.fn(),
  plans: vi.fn(),
  updateOrganization: vi.fn(),
}));

vi.mock('../api', () => ({
  // The page also imports this; a module mock has to carry every named export
  // it uses, or the import itself throws.
  downloadBlob: vi.fn(),
  platformApi: {
    organizations: mocks.organizations,
    stats: mocks.stats,
    plans: mocks.plans,
    updateOrganization: mocks.updateOrganization,
    exportOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    usage: vi.fn(),
  },
}));

vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const CATALOGUE = [
  { id: '1', key: 'trial', name: 'Trial', price: 0, currency: 'BDT' },
  { id: '2', key: 'basic', name: 'Pharmacy Basic', price: 1500, currency: 'BDT' },
  { id: '3', key: 'plus', name: 'Pharmacy Plus', price: 3000, currency: 'BDT' },
];

/**
 * A row as the API returns it.
 *
 * `owner` and `counts` are not optional in the response and the row reads both
 * — a fixture without them renders nothing at all, which looks exactly like the
 * page being broken.
 */
const shop = (over: Record<string, unknown> = {}) => ({
  _id: 'o1',
  name: 'Demo Pharmacy',
  status: 'active',
  plan: 'plus',
  createdAt: '2026-01-01T00:00:00.000Z',
  trialEndsAt: null,
  owner: { name: 'Rafiq Hasan', email: 'owner@demo.com', phone: '01700000000', role: 'admin' },
  counts: { users: 3, bills: 640, products: 210 },
  lastActivityAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Shops />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plans.mockResolvedValue(CATALOGUE);
  mocks.stats.mockResolvedValue({ total: 1, signupsThisWeek: 0, pending: 0, byStatus: {}, byPlan: {} });
  mocks.organizations.mockResolvedValue({ data: [shop()], total: 1, page: 1, limit: 25 });
});

/**
 * Renders the page and waits until the shop's row is on it.
 *
 * The table is replaced by a loading block on *every* fetch, and the page
 * fetches more than once — so a synchronous read of the row can land in the
 * window where it is not there. Everything below reads the row through
 * `awaitRowOptions`, which waits, rather than assuming it is still mounted.
 */
const renderWithRows = async () => {
  renderPage();
  await screen.findByText('Demo Pharmacy');
};

/**
 * The options of the plan select on the shop's own row.
 *
 * Scoped to the row rather than picked out of the page's selects by position —
 * the filters above the table and the dialogs below it are `combobox`es too,
 * and "the last one" silently returned the plan *filter*.
 */
const rowOptions = () => {
  // Found from the shop's name upwards: a row's accessible name is the whole
  // of its cells' text, which is not something to write a matcher against.
  const row = screen.getByText('Demo Pharmacy').closest('tr');
  if (!row) throw new Error('the shop has no row');
  const select = within(row).getByRole('combobox');
  return [...select.querySelectorAll('option')].map((o) => ({
    value: o.getAttribute('value'),
    label: o.textContent,
  }));
};

/** The row's options, once the row is there and the catalogue has arrived. */
const awaitRowOptions = async () => {
  let options: { value: string | null; label: string | null }[] = [];
  await waitFor(() => {
    options = rowOptions();
    expect(options.length).toBeGreaterThan(0);
  });
  return options;
};

describe('the Shops page plan picker', () => {
  it('offers the catalogue plans in the filter', async () => {
    await renderWithRows();
    await waitFor(() => expect(mocks.plans).toHaveBeenCalled());
    const filter = screen.getByRole('combobox', { name: /filter by plan/i });
    const values = [...filter.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(values).toEqual(['', 'trial', 'basic', 'plus']);
  });

  it('offers every plan on a row, with its price', async () => {
    await renderWithRows();
    const options = await awaitRowOptions();
    expect(options.map((o) => o.value)).toEqual(['trial', 'basic', 'plus']);
    expect(options.map((o) => o.label).join(' ')).toContain('Pharmacy Plus · BDT 3000');
  });

  it('still shows a shop sitting on a plan the catalogue does not have', async () => {
    // A select whose value matches no option renders blank: the operator could
    // not tell what the shop is on, or that it needs moving.
    mocks.organizations.mockResolvedValue({ data: [shop({ plan: 'gold' })], total: 1, page: 1, limit: 25 });
    await renderWithRows();
    const options = await awaitRowOptions();
    expect(options[0].value).toBe('gold');
    expect(options[0].label).toMatch(/not in the catalogue/i);
    expect(options.map((o) => o.value)).toContain('plus');
  });

  it('does not fall over when the catalogue cannot be read', async () => {
    mocks.plans.mockRejectedValue(new Error('500'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Demo Pharmacy')).toBeTruthy());
  });
});
