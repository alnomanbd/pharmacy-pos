import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Medicines from './Medicines';

/**
 * The catalogue page: the list as the API returns it, and the one rule that
 * protects every shop — a medicine somebody stocks cannot be deleted, only
 * deactivated.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  catalogueStats: vi.fn(),
  catalogueMedicines: vi.fn(),
  dosageForms: vi.fn(),
  catalogueRefs: vi.fn(),
  deleteMedicine: vi.fn(),
  updateMedicine: vi.fn(),
  createMedicine: vi.fn(),
  renameRef: vi.fn(),
  deleteRef: vi.fn(),
  createRef: vi.fn(),
}));

vi.mock('../api', () => ({ platformApi: mocks }));
// One toast function for the whole run: a fresh one per render would change
// every `load` callback that depends on it and refetch forever.
const toast = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: toast.fn }) }));
// Deactivating asks first; the answer here is always yes.
vi.mock('@dawai/shared/lib/confirm', () => ({ confirmAction: vi.fn(async () => true) }));

const medicine = (over: Record<string, unknown> = {}) => ({
  _id: 'm1',
  brandName: 'Napa',
  genericName: 'Paracetamol',
  strength: '500 mg',
  dosageForm: 'Tablet',
  packSize: '10 x 10',
  price: 1.2,
  dar: '123-456-789',
  isActive: true,
  company: { _id: 'c1', name: 'Beximco' },
  generic: { _id: 'g1', name: 'Paracetamol' },
  group: null,
  usedByShops: 0,
  ...over,
});

const renderPage = (entry = '/medicines') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Medicines />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ role: 'platformStaff', permissions: ['catalogue.view', 'catalogue.manage'] });
  mocks.catalogueStats.mockResolvedValue({
    medicines: 2,
    active: 1,
    companies: 2,
    generics: 2,
    groups: 0,
    pendingRequests: 3,
  });
  mocks.dosageForms.mockResolvedValue(['Syrup', 'Tablet']);
  mocks.catalogueRefs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 8 });
  mocks.catalogueMedicines.mockResolvedValue({
    data: [
      medicine(),
      medicine({
        _id: 'm2',
        brandName: 'Seclo',
        genericName: 'Omeprazole',
        strength: '20 mg',
        dosageForm: 'Capsule',
        company: { _id: 'c2', name: 'Square' },
        usedByShops: 14,
        isActive: false,
      }),
    ],
    total: 2,
    page: 1,
    limit: 25,
  });
  mocks.deleteMedicine.mockResolvedValue({ id: 'm1', deleted: true });
});

describe('the Medicines page', () => {
  it('lists the catalogue with its company, price, shops and status', async () => {
    renderPage();
    const napa = (await screen.findByText('Napa')).closest('tr')!;
    expect(within(napa).getByText('500 mg · Tablet')).toBeTruthy();
    expect(within(napa).getByText('Beximco')).toBeTruthy();
    expect(within(napa).getByText('123-456-789')).toBeTruthy();
    expect(within(napa).getByText('Active')).toBeTruthy();

    const seclo = screen.getByText('Seclo').closest('tr')!;
    expect(within(seclo).getByText('14')).toBeTruthy();
    expect(within(seclo).getByText('Inactive')).toBeTruthy();

    expect(screen.getByText('2 medicines')).toBeTruthy();
    // The stats cards, from /catalogue/stats.
    await waitFor(() => expect(screen.getByText('Requests')).toBeTruthy());
    expect(mocks.catalogueMedicines).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 25 }));
  });

  it('only lets a medicine no shop stocks be deleted', async () => {
    renderPage();
    await screen.findByText('Napa');

    const stocked = await screen.findByRole('button', { name: 'Delete Seclo' });
    expect(stocked).toBeDisabled();
    expect(stocked.getAttribute('title')).toMatch(/14 shops stock this/);

    const unstocked = screen.getByRole('button', { name: 'Delete Napa' });
    expect(unstocked).toBeEnabled();
  });

  it('asks before deleting, then deletes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Napa' }));

    expect(screen.getByText('Delete this medicine?')).toBeTruthy();
    expect(mocks.deleteMedicine).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteMedicine).toHaveBeenCalledWith('m1'));
  });

  it('hides every write without catalogue.manage', async () => {
    mocks.access.mockResolvedValue({ role: 'platformStaff', permissions: ['catalogue.view'] });
    renderPage();
    await screen.findByText('Napa');
    await waitFor(() => expect(mocks.access).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Add medicine/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Napa' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Deactivate/ })).toBeNull();
  });

  it('deactivates rather than deletes', async () => {
    const user = userEvent.setup();
    mocks.updateMedicine.mockResolvedValue(medicine({ isActive: false }));
    renderPage();
    const row = (await screen.findByText('Napa')).closest('tr')!;
    await user.click(await within(row).findByRole('button', { name: /Deactivate/ }));
    expect(mocks.updateMedicine).toHaveBeenCalledWith('m1', { isActive: false });
  });

  it('disables deleting a company that medicines still use', async () => {
    mocks.catalogueRefs.mockResolvedValue({
      data: [
        { _id: 'c1', name: 'Beximco', count: 120 },
        { _id: 'c9', name: 'Unused Labs', count: 0 },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });
    renderPage('/medicines?tab=companies');
    expect(await screen.findByRole('button', { name: 'Delete Beximco' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Unused Labs' })).toBeEnabled();
    expect(mocks.catalogueRefs).toHaveBeenCalledWith('companies', expect.objectContaining({ page: 1 }));
  });
});
