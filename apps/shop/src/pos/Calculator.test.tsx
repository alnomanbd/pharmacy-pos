import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Calculator from './Calculator';

/** The counter calculator, through what a salesman presses and what the till receives. */
function setup(billTotal = 570) {
  const onUseAsCash = vi.fn();
  const onClose = vi.fn();
  render(<Calculator billTotal={billTotal} onUseAsCash={onUseAsCash} onClose={onClose} />);
  const panel = screen.getByRole('dialog');
  const type = (keys: string[]) => keys.forEach((key) => fireEvent.keyDown(panel, { key }));
  const answer = () => document.querySelector('.calc-result')?.textContent;
  return { panel, type, answer, onUseAsCash, onClose };
}

describe('the counter calculator', () => {
  it('works from the number pad: 120 × 3 + 45 = 405', () => {
    const { type, answer } = setup();
    type(['1', '2', '0', '*', '3', '+', '4', '5']);
    expect(answer()).toBe('405');
    type(['Enter']);
    expect(answer()).toBe('405');
  });

  it('puts the answer in the cash box', () => {
    const { type, onUseAsCash } = setup();
    type(['5', '0', '0', '-', '7', '0']);
    fireEvent.click(screen.getByRole('button', { name: /Use as cash/ }));
    expect(onUseAsCash).toHaveBeenCalledWith('430');
  });

  it('offers the bill total as a key — what is left after a part payment', () => {
    const { type, answer } = setup(570);
    fireEvent.click(screen.getByRole('button', { name: /Bill/ }));
    type(['-', '2', '0', '0']);
    expect(answer()).toBe('370');
  });

  it('keeps its keys from the till: Escape closes it and never reaches the bill', () => {
    const tillHeard = vi.fn();
    window.addEventListener('keydown', tillHeard);
    try {
      const { panel, onClose } = setup();
      fireEvent.keyDown(panel, { key: 'Escape' });
      fireEvent.keyDown(panel, { key: '+' });
      expect(onClose).toHaveBeenCalled();
      expect(tillHeard).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', tillHeard);
    }
  });

  it('clears with C and steps back with Backspace', () => {
    const { type, answer } = setup();
    type(['9', '8', 'Backspace']);
    expect(answer()).toBe('9');
    type(['c']);
    expect(answer()).toBe('0');
  });
});
