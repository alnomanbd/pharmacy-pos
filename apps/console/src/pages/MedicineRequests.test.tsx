import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MedicineRequests from './MedicineRequests';

/**
 * The request queue. Approving is two different calls depending on what the
 * operator found: a link to a catalogue row that already exists, or a new row
 * built from the form the request filled in.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  medicineRequests: vi.fn(),
  approveMedicineRequest: vi.fn(),
  rejectMedicineRequest: vi.fn(),
  catalogueMedicines: vi.fn(),
  catalogueRefs: vi.fn(),
  dosageForms: vi.fn(),
  createRef: vi.fn(),
}));

vi.mock('../api', () => ({ platformApi: mocks }));
// One toast function for the whole run: a fresh one per render would change
// every `load` callback that depends on it and refetch forever.
const toast = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: toast.fn }) }));

const request = (over: Record<string, unknown> = {}) => ({
  _id: 'r1',
  organization: { _id: 'o1', name: 'Shefa Pharmacy' },
  requestedBy: { _id: 'u1', name: 'Rafiq Hasan' },
  brandName: 'Napa Extend',
  genericName: 'Paracetamol',
  companyName: 'Beximco',
  strength: '665 mg',
  dosageForm: 'Tablet',
  packSize: '10 x 15',
  note: 'Customers keep asking',
  status: 'pending',
  medicine: null,
  createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <MedicineRequests />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ role: 'platformStaff', permissions: ['catalogue.view', 'catalogue.manage'] });
  mocks.medicineRequests.mockResolvedValue({ data: [request()], total: 1, page: 1, limit: 25 });
  mocks.dosageForms.mockResolvedValue(['Tablet']);
  mocks.catalogueRefs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 8 });
  mocks.catalogueMedicines.mockResolvedValue({
    data: [
      {
        _id: 'm7',
        brandName: 'Napa Extend',
        genericName: 'Paracetamol',
        strength: '665 mg',
        dosageForm: 'Tablet',
        packSize: '10 x 15',
        price: 2,
        isActive: true,
        company: { _id: 'c1', name: 'Beximco' },
        generic: null,
        group: null,
        usedByShops: 4,
        dar: '',
      },
    ],
    total: 1,
    page: 1,
    limit: 5,
  });
  mocks.approveMedicineRequest.mockResolvedValue(request({ status: 'added' }));
  mocks.rejectMedicineRequest.mockResolvedValue(request({ status: 'rejected' }));
});

describe('the medicine requests page', () => {
  it('shows who asked, for what, and how long ago', async () => {
    renderPage();
    const card = (await screen.findByText('Napa Extend')).closest('[data-testid="request"]') as HTMLElement;
    expect(within(card).getByText('Shefa Pharmacy')).toBeTruthy();
    expect(within(card).getByText('Rafiq Hasan')).toBeTruthy();
    expect(within(card).getByText('665 mg')).toBeTruthy();
    expect(within(card).getByText('Customers keep asking')).toBeTruthy();
    expect(within(card).getByText('3 days ago')).toBeTruthy();
    expect(mocks.medicineRequests).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('links a request to a catalogue row it already matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Approve/ }));

    // The likely matches come from searching the catalogue by the brand asked for.
    await waitFor(() =>
      expect(mocks.catalogueMedicines).toHaveBeenCalledWith(expect.objectContaining({ q: 'Napa Extend' })),
    );
    await user.click(await screen.findByRole('button', { name: /Link to this/ }));

    await waitFor(() =>
      expect(mocks.approveMedicineRequest).toHaveBeenCalledWith('r1', { medicineId: 'm7' }),
    );
  });

  it('adds the medicine from the form the request filled in', async () => {
    const user = userEvent.setup();
    mocks.catalogueMedicines.mockResolvedValue({ data: [], total: 0, page: 1, limit: 5 });
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Approve/ }));

    const brand = screen.getByLabelText(/Brand name/) as HTMLInputElement;
    expect(brand.value).toBe('Napa Extend');
    expect((screen.getByLabelText('Strength') as HTMLInputElement).value).toBe('665 mg');

    await user.click(screen.getByRole('button', { name: /Add & approve/ }));
    await waitFor(() =>
      expect(mocks.approveMedicineRequest).toHaveBeenCalledWith('r1', {
        medicine: expect.objectContaining({
          brandName: 'Napa Extend',
          genericName: 'Paracetamol',
          strength: '665 mg',
          dosageForm: 'Tablet',
          packSize: '10 x 15',
        }),
      }),
    );
  });

  it('asks for a reason before rejecting', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Reject/ }));

    const dialog = screen.getByRole('dialog', { name: /Reject Napa Extend/ });
    const confirm = within(dialog).getByRole('button', { name: /^Reject$/ });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Reason/), 'Not registered');
    await user.click(confirm);
    await waitFor(() => expect(mocks.rejectMedicineRequest).toHaveBeenCalledWith('r1', 'Not registered'));
  });
});
