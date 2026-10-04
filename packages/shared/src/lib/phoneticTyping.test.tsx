import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { installPhoneticTyping, uninstallPhoneticTyping, useTypingMode, convertsToBangla } from './phoneticTyping';

/**
 * Bangla from the ordinary keyboard in every text box — tested through what
 * lands in a React-controlled field, because that is where it has to work: a
 * value written behind React's back is put straight back by the next render.
 */
function Field(props: { label: string; type?: string; latin?: boolean; inputMode?: 'numeric' }) {
  const [value, setValue] = useState('');
  return (
    <input
      aria-label={props.label}
      type={props.type ?? 'text'}
      inputMode={props.inputMode}
      data-latin={props.latin ? '' : undefined}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

/** One key, as a browser handles it: offered to the page first, typed if it is not taken. */
function press(el: HTMLInputElement, key: string) {
  act(() => {
    const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    if (!el.dispatchEvent(down) || key.length !== 1) return;
    const at = el.selectionStart ?? el.value.length;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, el.value.slice(0, at) + key + el.value.slice(el.selectionEnd ?? at));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(at + 1, at + 1);
  });
}

describe('phonetic typing', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => useTypingMode.getState().set(false));
    installPhoneticTyping();
  });
  afterEach(() => uninstallPhoneticTyping());

  it('types English by default — nothing is intercepted', async () => {
    const user = userEvent.setup();
    render(<Field label="name" />);
    await user.type(field('name'), 'amar');
    expect(field('name').value).toBe('amar');
  });

  it('turns amar into আমার in an ordinary field once switched to Bangla', () => {
    render(<Field label="name" />);
    act(() => useTypingMode.getState().set(true));
    field('name').focus();
    // Pressed the way a browser presses them: the key goes to the page, and if
    // the page does not take it, the character lands at the caret. (The test
    // library keeps its own idea of the caret, which goes stale when a value is
    // rewritten under it — a browser has no such idea to lose.)
    for (const key of 'amar sOnar bangla') press(field('name'), key);
    // `O` is ও-কার and `o` the inherent vowel, as in Avro: sonar is সনার.
    expect(field('name').value).toBe('আমার সোনার বাংলা');
  });

  it('steps back through the word being typed with backspace', async () => {
    const user = userEvent.setup();
    render(<Field label="name" />);
    act(() => useTypingMode.getState().set(true));
    await user.type(field('name'), 'sokal');
    expect(field('name').value).toBe('সকাল');
    await user.type(field('name'), '{Backspace}{Backspace}');
    // Back to "sok": the Latin is what is rewound, not the Bangla letters.
    expect(field('name').value).toBe('সক');
  });

  it('leaves English-only fields alone: email, numbers, and medicine searches', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Field label="email" type="email" />
        <Field label="qty" inputMode="numeric" />
        <Field label="medicine" latin />
      </>,
    );
    act(() => useTypingMode.getState().set(true));
    await user.type(field('email'), 'amar');
    await user.type(field('qty'), 'amar');
    await user.type(field('medicine'), 'napa');
    expect(field('email').value).toBe('amar');
    expect(field('qty').value).toBe('amar');
    // The catalogue's brand names are English: napa must find Napa.
    expect(field('medicine').value).toBe('napa');
  });

  it('switches with Ctrl+Space, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<Field label="name" />);
    field('name').focus();
    await user.keyboard('{Control>} {/Control}');
    expect(useTypingMode.getState().bangla).toBe(true);
    expect(localStorage.getItem('dawai.typing.bangla')).toBe('1');
    await user.type(field('name'), 'ami');
    expect(field('name').value).toBe('আমি');
  });

  it('knows which fields take Bangla', () => {
    const text = document.createElement('input');
    const pass = Object.assign(document.createElement('input'), { type: 'password' });
    const area = document.createElement('textarea');
    const ro = Object.assign(document.createElement('input'), { readOnly: true });
    expect(convertsToBangla(text)).toBe(true);
    expect(convertsToBangla(area)).toBe(true);
    expect(convertsToBangla(pass)).toBe(false);
    expect(convertsToBangla(ro)).toBe(false);
  });
});
