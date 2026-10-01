import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BanglaField } from './BanglaField';
import { BanglaKeyboard } from './BanglaKeyboard';

/**
 * jsdom has no `PointerEvent`, so `fireEvent.pointerDown` there builds a plain
 * `Event` and drops `clientX`/`clientY` — a drag fired that way moves the panel
 * nowhere and the test passes or fails for the wrong reason. A `MouseEvent`
 * carries the coordinates and can be given any type name.
 */
const pointer = (type: string, x: number, y: number) =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });

/**
 * The on-screen keyboard, tested through the field it types into.
 *
 * The thing that breaks here is focus: a click blurs the field before it fires,
 * and a keyboard that types into nothing looks like a dead panel. So these
 * assert what landed in the field, not what the panel rendered.
 */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <BanglaField value={value} onChange={setValue} bangla aria-label="advice" textarea />
      <BanglaKeyboard />
    </>
  );
}

const field = () => screen.getByLabelText('advice') as HTMLTextAreaElement;
const key = (char: string) => screen.getByLabelText(`Insert ${char}`);

describe('BanglaKeyboard', () => {
  beforeEach(() => {
    // The panel remembers where it was dragged to; one test's drag must not
    // decide another test's starting point.
    localStorage.clear();
  });

  it('types the letter that was tapped into the focused field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    field().focus();

    await user.click(key('ক'));
    await user.click(key('া'));
    await user.click(key('ল'));
    expect(field().value).toBe('কাল');
  });

  it('reaches the marks that cannot be guessed', async () => {
    // `ঁ` and `ৎ` are the reason this panel exists at all: there is no obvious
    // keystroke for either.
    const user = userEvent.setup();
    render(<Harness />);
    field().focus();

    await user.click(key('চ'));
    await user.click(key('ঁ'));
    expect(field().value).toBe('চঁ');
    await user.click(key('ৎ'));
    expect(field().value).toBe('চঁৎ');
  });

  it('builds a conjunct from its own key', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    field().focus();

    // A tablist, not three loose buttons — see the segmented control in the CSS.
    await user.click(screen.getByRole('tab', { name: 'যুক্তাক্ষর' }));
    await user.click(key('ক্ষ'));
    expect(field().value).toBe('ক্ষ');
  });

  it('inserts at the cursor rather than at the end', async () => {
    const user = userEvent.setup();
    render(<Harness initial="কল" />);
    const el = field();
    el.focus();
    el.setSelectionRange(1, 1);

    await user.click(key('া'));
    expect(el.value).toBe('কাল');
  });

  it('deletes one character with backspace', async () => {
    const user = userEvent.setup();
    render(<Harness initial="কাল" />);
    const el = field();
    el.focus();
    el.setSelectionRange(3, 3);

    await user.click(screen.getByLabelText('Backspace'));
    expect(el.value).toBe('কা');
  });

  it('does not swallow the phonetic keyboard’s own word', async () => {
    /*
     * The two are meant to be used together. A tapped character ends the
     * phonetic word in progress — otherwise the Latin buffer would still be
     * holding `sok` and the next keystroke would rewrite over the tap.
     */
    const user = userEvent.setup();
    render(<Harness />);
    const el = field();
    el.focus();

    await user.type(el, 'sokal');
    await user.click(key('ে'));
    expect(el.value).toBe('সকালে');

    // And typing continues normally afterwards.
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    await user.keyboard(' rat');
    expect(el.value).toBe('সকালে রাত');
  });

  it('types into an ordinary input that is not a BanglaField', async () => {
    /*
     * The keyboard is opened from the top bar and used on any page, so it has to
     * work in fields this component knows nothing about — a customer's name, a
     * supplier's name, the shop's address.
     *
     * Those are React-controlled inputs, and assigning `.value` on one is
     * invisible to React: the next render restores the old value. The insert
     * goes through the DOM prototype's setter and dispatches an `input` event,
     * which is what React's `onChange` actually listens to. This test is here
     * because getting that wrong looks like the keyboard working and then the
     * character vanishing.
     */
    function PlainHarness() {
      const [value, setValue] = useState('');
      return (
        <>
          <input aria-label="customer name" value={value} onChange={(e) => setValue(e.target.value)} />
          <BanglaKeyboard />
        </>
      );
    }

    const user = userEvent.setup();
    render(<PlainHarness />);
    const input = screen.getByLabelText('customer name') as HTMLInputElement;
    input.focus();

    await user.click(key('র'));
    await user.click(key('া'));
    await user.click(key('ম'));
    expect(input.value).toBe('রাম');

    await user.click(screen.getByLabelText('Backspace'));
    expect(input.value).toBe('রা');
  });

  it('moves when its title bar is dragged, and stays where it was put', () => {
    // The reason it floats at all is that an inline panel covered the text; a
    // floating one that cannot be moved covers it just as thoroughly.
    render(<BanglaKeyboard />);
    const panel = screen.getByRole('group', { name: 'Bangla keyboard' });
    const handle = screen.getByLabelText('Move the Bangla keyboard');

    const before = { left: panel.style.left, top: panel.style.top };

    fireEvent(handle, pointer('pointerdown', 500, 400));
    fireEvent(window, pointer('pointermove', 420, 300));
    fireEvent(window, pointer('pointerup', 420, 300));

    expect(panel.style.left).not.toBe(before.left);
    expect(panel.style.top).not.toBe(before.top);

    // Remembered, so it is not repositioned for every customer.
    const saved = JSON.parse(localStorage.getItem('dawai.banglaKeyboard.position') || '{}');
    expect(saved.x).toBe(parseInt(panel.style.left, 10));
    expect(saved.y).toBe(parseInt(panel.style.top, 10));
  });

  it('can be moved from the keyboard as well as with a pointer', () => {
    render(<BanglaKeyboard />);
    const panel = screen.getByRole('group', { name: 'Bangla keyboard' });
    const handle = screen.getByLabelText('Move the Bangla keyboard');
    const before = parseInt(panel.style.left, 10);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(parseInt(panel.style.left, 10)).toBeLessThan(before);
  });

  it('never parks itself off screen', () => {
    // A window dragged past the edge is hard to get back, and the position is
    // remembered — so a bad drag would persist.
    render(<BanglaKeyboard />);
    const panel = screen.getByRole('group', { name: 'Bangla keyboard' });
    const handle = screen.getByLabelText('Move the Bangla keyboard');

    fireEvent(handle, pointer('pointerdown', 100, 100));
    fireEvent(window, pointer('pointermove', -9000, -9000));
    fireEvent(window, pointer('pointerup', -9000, -9000));
    expect(parseInt(panel.style.left, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(panel.style.top, 10)).toBeGreaterThanOrEqual(0);

    fireEvent(handle, pointer('pointerdown', 100, 100));
    fireEvent(window, pointer('pointermove', 9000, 9000));
    fireEvent(window, pointer('pointerup', 9000, 9000));
    expect(parseInt(panel.style.left, 10)).toBeLessThan(window.innerWidth);
    expect(parseInt(panel.style.top, 10)).toBeLessThan(window.innerHeight);
  });

  it('does nothing at all when no field has been focused', async () => {
    // A tap with nowhere to go must not throw: the panel can be opened before
    // any field is touched.
    const user = userEvent.setup();
    render(<BanglaKeyboard />);
    await expect(user.click(key('ক'))).resolves.toBeUndefined();
  });
});
