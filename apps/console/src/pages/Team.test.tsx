import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import Team from './Team';

/**
 * Every row has actions now — owners included, which used to show none, and
 * the signed-in operator edits their own details through `/platform/me`.
 */

const mocks = vi.hoisted(() => ({
  team: vi.fn(),
  teamPermissions: vi.fn(),
  teamRoles: vi.fn(),
  updateTeamMember: vi.fn(),
  updateMe: vi.fn(),
  setTeamMemberPassword: vi.fn(),
  removeTeamMember: vi.fn(),
  addTeamMember: vi.fn(),
}));

vi.mock('../api', () => ({ platformApi: mocks }));
// One toast function for the whole run: a fresh one per render would change
// every `load` callback that depends on it and refetch forever.
const toast = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@dawai/shared/components/Toast', () => ({ useToast: () => ({ toast: toast.fn }) }));

const member = (over: Record<string, unknown>) => ({
  role: 'platformStaff',
  permissions: [],
  isOwner: false,
  isActive: true,
  phone: '',
  ...over,
});

const row = (name: string) => screen.getByText(name).closest('.rounded-lg') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'me', name: 'Noman', email: 'noman@dawai.com.bd', role: 'platformAdmin' },
  });
  mocks.team.mockResolvedValue([
    member({ _id: 'me', name: 'Noman', email: 'noman@dawai.com.bd', role: 'platformAdmin', isOwner: true }),
    member({ _id: 'o2', name: 'Second Owner', email: 'two@dawai.com.bd', role: 'platformAdmin', isOwner: true }),
    member({ _id: 's1', name: 'Sadia', email: 'sadia@dawai.com.bd', permissions: ['shops.view'] }),
  ]);
  mocks.teamPermissions.mockResolvedValue({ permissions: ['shops.view', 'catalogue.view'], presets: [] });
  mocks.teamRoles.mockResolvedValue([]);
  mocks.updateTeamMember.mockResolvedValue({});
  mocks.updateMe.mockResolvedValue({});
  mocks.setTeamMemberPassword.mockResolvedValue({ id: 's1' });
});

const renderPage = async () => {
  render(
    <MemoryRouter>
      <Team />
    </MemoryRouter>,
  );
  await screen.findByText('Sadia');
};

describe('the Team page', () => {
  it('gives owner rows visible actions too', async () => {
    await renderPage();
    const owner = row('Second Owner');
    expect(within(owner).getByRole('button', { name: /Edit details/ })).toBeTruthy();
    expect(within(owner).getByRole('button', { name: /Set password/ })).toBeTruthy();
    // Staff keep the access controls.
    const staff = row('Sadia');
    for (const label of [/Change access/, /Disable/, /Remove/]) {
      expect(within(staff).getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('edits another member through the team endpoint', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(within(row('Sadia')).getByRole('button', { name: /Edit details/ }));
    const dialog = screen.getByRole('dialog');
    const phone = within(dialog).getByLabelText('Phone');
    await user.type(phone, '01711000000');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(mocks.updateTeamMember).toHaveBeenCalledWith('s1', {
        name: 'Sadia',
        email: 'sadia@dawai.com.bd',
        phone: '01711000000',
      }),
    );
  });

  it('edits your own details through /platform/me, with no password reset on yourself', async () => {
    const user = userEvent.setup();
    await renderPage();
    const mine = row('Noman');
    expect(within(mine).queryByRole('button', { name: /Set password/ })).toBeNull();
    await user.click(within(mine).getByRole('button', { name: /Edit my details/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit my details' });
    await user.type(within(dialog).getByLabelText('Phone'), '01800000000');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(mocks.updateMe).toHaveBeenCalledWith({ name: 'Noman', phone: '01800000000' }),
    );
    expect(mocks.updateTeamMember).not.toHaveBeenCalled();
  });

  it('sets another member’s password once it is strong enough', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(within(row('Sadia')).getByRole('button', { name: /Set password/ }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /Set password/ });
    await user.type(within(dialog).getByLabelText('New password'), 'short');
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('New password'));
    await user.type(within(dialog).getByLabelText('New password'), 'river-mango-71-lamp');
    await user.click(confirm);
    await waitFor(() =>
      expect(mocks.setTeamMemberPassword).toHaveBeenCalledWith('s1', 'river-mango-71-lamp'),
    );
  });
});
