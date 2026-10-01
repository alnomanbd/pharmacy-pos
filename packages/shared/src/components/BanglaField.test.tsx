import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BanglaField } from './BanglaField';

/**
 * The field is tested through the keyboard, not through its internals, because
 * the thing that can break is the buffering: whether typing a word letter by
 * letter produces the same Bangla as converting the whole word at once.
 */
function Harness({ bangla = true, initial = '' }: { bangla?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <BanglaField value={value} onChange={setValue} bangla={bangla} aria-label="advice" textarea />
  );
}

const field = () => screen.getByLabelText('advice') as HTMLTextAreaElement;

describe('BanglaField', () => {
  it('converts a word typed one letter at a time', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'sokal');
    expect(field().value).toBe('সকাল');
  });

  it('keeps words separate across a space', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'khabarer pore');
    expect(field().value).toBe('খাবারের পরে');
  });

  it('gets conjuncts right, which is what the buffer is for', async () => {
    /*
     * `sokal` and `skal` differ only in a letter that renders as nothing —
     * character-by-character conversion off the rendered text produces `স্কাল`
     * for both.
     */
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'skal');
    expect(field().value).toBe('স্কাল');
  });

  it('rewinds one Latin letter per backspace, not one Bangla character', async () => {
    // `া` is not a keystroke; backspacing after `sokal` must return the field
    // to the state `soka` would have produced.
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'sokal');
    // `sokal` minus the `l` is `soka`, one Latin letter shorter.
    await user.keyboard('{Backspace}');
    expect(field().value).toBe('সকা');
    // And again: `sok`, where the vowel sign disappears with the `a`.
    await user.keyboard('{Backspace}');
    expect(field().value).toBe('সক');
    await user.keyboard('al');
    expect(field().value).toBe('সকাল');
  });

  it('leaves digits and units alone', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'khaben 2 bar');
    expect(field().value).toBe('খাবেন 2 বার');
  });

  it('is an ordinary field when the switch is off', async () => {
    const user = userEvent.setup();
    render(<Harness bangla={false} />);
    await user.type(field(), 'sokal');
    expect(field().value).toBe('sokal');
  });

  it('appends to text that is already there', async () => {
    const user = userEvent.setup();
    render(<Harness initial="সকাল " />);
    const el = field();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    await user.keyboard('rat');
    expect(el.value).toBe('সকাল রাত');
  });

  it('reports every change to its owner', async () => {
    // The page keeps the value; a field that swallowed keystrokes would save an
    // empty advice line.
    const onChange = vi.fn();
    render(<BanglaField value="" onChange={onChange} bangla aria-label="advice" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('advice'), 'r');
    expect(onChange).toHaveBeenCalledWith('র');
  });
});
