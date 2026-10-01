import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Asking for a medicine the catalogue does not have.
 *
 * The form starts from what the shop typed into the search, sends only the
 * boxes somebody filled in — an empty one means "don't know", and the server
 * should not be told it is blank — and says what happens next.
 */

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), withdraw: vi.fn(), toast: vi.fn() }));

vi.mock('../api', () => ({
  medicineRequestsApi: { create: mocks.create, list: mocks.list, withdraw: mocks.withdraw },
}));

vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const { AskForMedicine } = await import('./MedicineRequests');

beforeEach(() => {
  mocks.create.mockReset();
  mocks.toast.mockReset();
});

describe('AskForMedicine', () => {
  it('starts with what was typed in the search as the brand', () => {
    render(<AskForMedicine initialBrand="  Fexo 120 " onClose={() => {}} />);
    expect(screen.getByLabelText('Brand name')).toHaveValue('Fexo 120');
  });

  it('sends the filled-in fields, trimmed, and leaves the empty ones out', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSent = vi.fn();
    const made = { _id: 'r1', brandName: 'Fexo', status: 'pending', createdAt: new Date().toISOString() };
    mocks.create.mockResolvedValue(made);

    render(<AskForMedicine initialBrand="Fexo" onClose={onClose} onSent={onSent} />);
    await user.type(screen.getByLabelText('Generic name'), ' Fexofenadine ');
    await user.type(screen.getByLabelText('Company'), 'Square');
    await user.type(screen.getByLabelText('Strength'), '120 mg');
    await user.type(screen.getByLabelText('Form'), 'Tablet');
    await user.type(screen.getByLabelText('Note'), 'New this month');
    await user.click(screen.getByRole('button', { name: /Send the request/ }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      brandName: 'Fexo',
      genericName: 'Fexofenadine',
      companyName: 'Square',
      strength: '120 mg',
      dosageForm: 'Tablet',
      note: 'New this month',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSent).toHaveBeenCalledWith(made);
    expect(mocks.toast).toHaveBeenCalledWith('We’ll add it, usually within a day.');
  });

  it('will not send without a brand name', async () => {
    const user = userEvent.setup();
    render(<AskForMedicine onClose={() => {}} />);
    const send = screen.getByRole('button', { name: /Send the request/ });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Brand name'), 'Napa');
    expect(send).toBeEnabled();
  });

  it('shows the server’s refusal and stays open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.create.mockRejectedValue({ response: { data: { message: 'You have already asked for this one' } } });

    render(<AskForMedicine initialBrand="Fexo" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Send the request/ }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith('You have already asked for this one', 'error'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
