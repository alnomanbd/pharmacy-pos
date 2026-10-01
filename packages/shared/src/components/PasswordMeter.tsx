import { passwordStrength } from '../lib/password';

/**
 * How good the password being typed is, and the one thing that would improve it.
 *
 * Three segments rather than a percentage bar: a number implies an arithmetic
 * nobody can audit, while "Fair — a longer password is stronger than a
 * complicated one" is a sentence somebody can act on. It says nothing at all
 * until something has been typed, because a red bar under an empty field reads
 * as an error before the user has done anything wrong.
 *
 * It is advice, not a gate. The refusal lives in `passwordProblem` (and, for
 * real, on the server) — this is what turns "use at least 8 characters" from a
 * rejection into a hint.
 */
export default function PasswordMeter({ value }: { value: string }) {
  const { score, label, advice } = passwordStrength(value);
  if (!value) return null;

  return (
    <div className="pwm" aria-live="polite">
      <div className="pwm-bars" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span key={step} className={step <= score ? `is-on is-s${score}` : ''} />
        ))}
      </div>
      <p className="pwm-text">
        <b className={`is-s${score}`}>{label}</b>
        {advice ? <span>{advice}</span> : null}
      </p>
    </div>
  );
}
