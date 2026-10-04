import { useTypingMode } from '../lib/phoneticTyping';
import './TypingModeToggle.css';

/**
 * The switch between typing English and typing Bangla — `amar` → `আমার` — in
 * every text box. Two letters in one pill, the one in use filled: what it does
 * is visible without a tooltip, and so is the state it is in.
 *
 * Separate from the screen's language on purpose: a screen in English and a
 * customer's name typed in Bangla is the ordinary case at a counter, and so is
 * the reverse.
 */
export function TypingModeToggle({ className = '' }: { className?: string }) {
  const { bangla, set } = useTypingMode();
  return (
    <div
      className={`tmt ${className}`}
      role="radiogroup"
      aria-label="Typing language"
      title={bangla ? 'বাংলায় লিখছেন — amar লিখলে আমার (Ctrl+Space)' : 'Typing English (Ctrl+Space for Bangla)'}
    >
      {(
        [
          [false, 'A', 'English'],
          [true, 'অ', 'বাংলা'],
        ] as const
      ).map(([value, glyph, name]) => (
        <button
          key={glyph}
          type="button"
          role="radio"
          aria-checked={bangla === value}
          aria-label={value ? 'Type Bangla' : 'Type English'}
          className={`tmt-opt${bangla === value ? ' is-on' : ''}`}
          // The field being typed into keeps its focus.
          onMouseDown={(e) => e.preventDefault()}
          // On a phone only the mode in use is drawn (see the CSS), so tapping
          // it has to switch to the other one.
          onClick={() =>
            set(bangla === value && window.matchMedia?.('(max-width: 639px)').matches ? !value : value)
          }
          lang={value ? 'bn' : 'en'}
        >
          <span aria-hidden>{glyph}</span>
          <span className="sr-only">{name}</span>
        </button>
      ))}
    </div>
  );
}
