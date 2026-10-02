import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ShopDetail from './ShopDetail';

/**
 * A shop's own page: its details corrected on its behalf, and the danger zone —
 * suspend first, then delete by typing the name back.
 */

const mocks = vi.hoisted(() => ({
  organization: vi.fn(),
  usage: vi.fn(),
  access: vi.fn(),
  updateShopProfile: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  exportOrganization: vi.fn(),
  updateLimits: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../api', () => ({ downloadBlob: vi.fn(), platformApi: mocks }));
const toast = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: toast.fn }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const detail = (status: string) => ({
  organization: {
    _id: 'o1',
    name: 'Shefa Pharmacy',
    status,
    plan: 'basic',
    createdAt: '2026-01-01T00:00:00.000Z',
    contactPhone: '01700000000',
    contactEmail: 'shefa@example.com',
    address: { street: '12 Lake Road', city: 'Dhaka' },
  },
  users: [],
  counts: { bills: 10, products: 5, counters: 1, users: 1 },
  usage: { plan: 'basic', planName: 'Basic', terminals: { limit: 1, used: 1, full: true }, shopUsers: { limit: 3, used: 1, full: false } },
});

const renderPage = async () => {
  render(
    <MemoryRouter initialEntries={['/shops/o1']}>
      <Routes>
        <Route path="/shops/:id" element={<ShopDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Shefa Pharmacy' });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ role: 'platformAdmin', isOwner: true, permissions: [] });
  mocks.organization.mockResolvedValue(detail('active'));
  mocks.usage.mockResolvedValue([]);
  mocks.updateShopProfile.mockResolvedValue({});
  mocks.deleteOrganization.mockResolvedValue({ name: 'Shefa Pharmacy', deleted: {} });
});

describe('the shop detail page', () => {
  it('saves the shop’s details through the profile endpoint', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /Edit shop details/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit shop details' });
    const area = within(dialog).getByLabelText('Area');
    await user.type(area, 'Dhanmondi');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(mocks.updateShopProfile).toHaveBeenCalledWith('o1', {
        name: 'Shefa Pharmacy',
        contactPhone: '01700000000',
        contactEmail: 'shefa@example.com',
        address: { street: '12 Lake Road', area: 'Dhanmondi', city: 'Dhaka', district: '', postalCode: '' },
      }),
    );
  });

  it('will not delete an active shop', async () => {
    await renderPage();
    expect(await screen.findByText('Danger zone')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete permanently/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Suspend/ })).toBeEnabled();
  });

  it('deletes a suspended shop once its name is typed back, then goes to the list', async () => {
    const user = userEvent.setup();
    mocks.organization.mockResolvedValue(detail('suspended'));
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /Delete permanently/ }));

    const dialog = screen.getByRole('dialog', { name: /Delete Shefa Pharmacy/ });
    const confirm = within(dialog).getByRole('button', { name: /Delete permanently/ });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'Shefa Pharmacy');
    await user.click(confirm);

    await waitFor(() => expect(mocks.deleteOrganization).toHaveBeenCalledWith('o1', 'Shefa Pharmacy'));
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

/** A ten-counter shop on the trial, given its own ceilings at sign-up. */
const manyCounters = () => ({
  ...detail('pending'),
  organization: {
    ...detail('pending').organization,
    plan: 'trial',
    signup: { counters: 10, outlets: 2, licence: 'DL-12345' },
    limitOverrides: { terminals: 10, shopUsers: 11 },
  },
  usage: {
    plan: 'trial',
    planName: 'Trial',
    terminals: { limit: 10, used: 3, full: false, overridden: true, planLimit: 1 },
    shopUsers: { limit: 2, used: 1, full: false, overridden: false, planLimit: 2 },
  },
});

describe('the Limits card', () => {
  it('shows what the shop asked for at sign-up', async () => {
    mocks.organization.mockResolvedValue(manyCounters());
    await renderPage();
    expect(await screen.findByText('Asked for 10 counters · 2 branches · Licence DL-12345')).toBeTruthy();
  });

  it('shows no sign-up card when the shop gave nothing', async () => {
    await renderPage();
    expect(screen.queryByText('Sign-up details')).toBeNull();
  });

  it('shows used against limit, with a custom or plan badge per axis', async () => {
    mocks.organization.mockResolvedValue(manyCounters());
    await renderPage();
    const counters = await screen.findByTestId('limit-terminals');
    expect(within(counters).getByText('3 / 10')).toBeTruthy();
    expect(within(counters).getByText('custom')).toBeTruthy();
    expect(within(counters).getByText(/the plan allows 1/)).toBeTruthy();
    const logins = screen.getByTestId('limit-shopUsers');
    expect(within(logins).getByText('1 / 2')).toBeTruthy();
    expect(within(logins).getByText('plan')).toBeTruthy();
  });

  it('hides the edit control without shops.plan', async () => {
    mocks.access.mockResolvedValue({ role: 'platformStaff', isOwner: false, permissions: ['shops.view'] });
    mocks.organization.mockResolvedValue(manyCounters());
    await renderPage();
    await screen.findByTestId('limit-terminals');
    expect(screen.queryByRole('button', { name: /Edit limits/ })).toBeNull();
  });

  it('sets a custom staff limit and puts counters back on the plan', async () => {
    const user = userEvent.setup();
    mocks.access.mockResolvedValue({ role: 'platformStaff', isOwner: false, permissions: ['shops.view', 'shops.plan'] });
    mocks.organization.mockResolvedValue(manyCounters());
    mocks.updateLimits.mockResolvedValue({});
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /Edit limits/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit limits' });

    const [countersPlan, loginsPlan] = within(dialog).getAllByRole('checkbox');
    expect(countersPlan).not.toBeChecked();
    expect(within(dialog).getByLabelText('Counters for this shop')).toHaveValue(10);
    await user.click(countersPlan);
    await user.click(loginsPlan);
    const logins = within(dialog).getByLabelText('Staff logins for this shop');
    await user.clear(logins);
    await user.type(logins, '12');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));

    await waitFor(() =>
      expect(mocks.updateLimits).toHaveBeenCalledWith('o1', { terminals: null, shopUsers: 12 }),
    );
  });

  it('will not save a number out of range', async () => {
    const user = userEvent.setup();
    mocks.organization.mockResolvedValue(manyCounters());
    await renderPage();
    await user.click(await screen.findByRole('button', { name: /Edit limits/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit limits' });
    const counters = within(dialog).getByLabelText('Counters for this shop');
    await user.clear(counters);
    await user.type(counters, '501');
    expect(within(dialog).getByRole('button', { name: /Save/ })).toBeDisabled();
    expect(within(dialog).getByText('A whole number from 1 to 500.')).toBeTruthy();
  });
});
