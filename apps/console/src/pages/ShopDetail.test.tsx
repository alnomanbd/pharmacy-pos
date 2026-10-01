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
