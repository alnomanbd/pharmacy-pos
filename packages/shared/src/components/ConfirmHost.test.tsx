import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ConfirmHost from './ConfirmHost';
import { confirmAction, useConfirmStore } from '../lib/confirm';

/** The one "are you sure?" dialog, through what a person presses. */
afterEach(() => {
  act(() => useConfirmStore.setState({ current: null, queue: [] }));
});

describe('confirmAction', () => {
  it('resolves yes only when the yes button is pressed', async () => {
    render(<ConfirmHost />);
    let answer: Promise<boolean>;
    act(() => {
      answer = confirmAction({ title: 'Export the register?', confirmLabel: 'Export' });
    });
    expect(screen.getByRole('alertdialog', { name: 'Export the register?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await expect(answer!).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('is a no for Cancel, the cross, the backdrop and Escape', async () => {
    render(<ConfirmHost />);
    for (const dismiss of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
      () => fireEvent.keyDown(window, { key: 'Escape' }),
    ]) {
      let answer: Promise<boolean>;
      act(() => {
        answer = confirmAction({ title: 'Delete it?', confirmLabel: 'Delete', tone: 'danger' });
      });
      act(dismiss);
      await expect(answer!).resolves.toBe(false);
    }
  });

  it('puts the focus on Cancel when the act cannot be taken back', () => {
    render(<ConfirmHost />);
    act(() => {
      void confirmAction({ title: 'Delete it?', confirmLabel: 'Delete', tone: 'danger' });
    });
    expect(document.activeElement?.textContent).toBe('Cancel');
  });

  it('keeps Escape from reaching the page underneath — on the till it clears the bill', () => {
    let pageHeard = false;
    const page = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pageHeard = true;
    };
    window.addEventListener('keydown', page);
    try {
      render(<ConfirmHost />);
      act(() => {
        void confirmAction({ title: 'Send?', confirmLabel: 'Send' });
      });
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(pageHeard).toBe(false);
    } finally {
      window.removeEventListener('keydown', page);
    }
  });

  it('asks two questions in turn, never one on top of the other', async () => {
    render(<ConfirmHost />);
    let first: Promise<boolean>;
    let second: Promise<boolean>;
    act(() => {
      first = confirmAction({ title: 'First?', confirmLabel: 'Yes one' });
      second = confirmAction({ title: 'Second?', confirmLabel: 'Yes two' });
    });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes one' }));
    await expect(first!).resolves.toBe(true);
    expect(screen.getByRole('alertdialog', { name: 'Second?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(second!).resolves.toBe(false);
  });
});
