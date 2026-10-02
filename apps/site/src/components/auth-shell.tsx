import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { translate, tList, tItems } from '@/i18n/dictionary';
import { Orb } from '@/components/motion/primitives';

/**
 * The doorway. One scene for sign-in and sign-up, because the two pages are
 * the same conversation at two different moments — a returning owner and one
 * about to become an owner — and the design should not pretend they are
 * different products.
 *
 * The scene is the site's own: an aurora, a dot field and a single glass card
 * split in two. The left half goes dark so the trespassing into the counter's
 * glow happens *before* the door itself; the right half is the paper where the
 * form lives. On a phone the left half collapses to a compact header, because
 * a 360px wide card that tries to be two columns is not a door, it is a wall.
 *
 * All copy comes from the dictionary — the title, the lede, the three trust
 * lines and the single figure at the foot of the dark half, so the Bangla and
 * the English pages say the same thing with the same emphasis.
 */
export function AuthShell({
  lang,
  variant,
  children,
}: {
  lang: Lang;
  variant: 'login' | 'register';
  children: React.ReactNode;
}) {
  const t = (p: string) => translate(lang, p);
  const isRegister = variant === 'register';
  const title = t(`auth.${variant}.title`);
  const lede = t(`auth.${variant}.lede`);
  const proof = tList(lang, 'hero.proof');

  const orbit = tItems<{ label: string; note: string }>(lang, 'hero.orbit');
  const trial = tItems<{ suffix: string; label: string }>(lang, 'hero.stats')[1];
  const stat = isRegister
    ? { value: `14${trial.suffix}`, label: trial.label }
    : { value: lang === 'bn' ? '৳১,১২,৪০০' : '৳1,12,400', label: orbit[0].label };

  /* `overflow-clip`, not `-hidden`, on both wrappers: hidden makes a scroll
     container, and the sign-up's sticky Next bar would stick to that instead
     of to the phone's screen. */
  return (
    <div className="relative isolate overflow-clip pb-20 pt-32 sm:pb-28 sm:pt-40">
      {/* the room behind the card */}
      <div className="aurora-field">
        <Orb className="-end-40 -top-32" color="rgb(16 185 129 / 0.28)" size="44rem" duration={32} />
        <Orb className="-start-40 top-1/3" color="rgb(34 211 238 / 0.18)" size="38rem" duration={26} delay={4} />
      </div>
      <div
        aria-hidden
        className="dot-grid pointer-events-none absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(48rem_30rem_at_50%_0%,black,transparent)]"
      />

      <div className="shell">
        <div className="mx-auto grid max-w-5xl overflow-clip rounded-[2rem] border border-border/70 bg-card/85 shadow-lift backdrop-blur-xl md:grid-cols-[0.85fr_1.15fr]">
          {/* ------------------------------------------------ the dark half */}
          <aside className="ink-band grain relative hidden overflow-hidden bg-background text-foreground md:block">
            <div className="aurora-field">
              <Orb className="-end-24 -top-24" color="rgb(16 185 129 / 0.35)" size="28rem" duration={30} />
              <Orb className="-start-20 bottom-0" color="rgb(34 211 238 / 0.22)" size="26rem" duration={24} delay={5} />
            </div>
            <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-15" />

            <div className="relative flex h-full flex-col p-8 lg:p-10">
              <div className="mt-2">
                <h1 className="h-section text-balance">{title}</h1>
                <p className="mt-4 text-sm leading-relaxed text-white/60">{lede}</p>

                <ul className="mb-10 mt-8 flex flex-col gap-2.5">
                  {proof.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm text-white/75">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                        <Check className="size-3" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto flex items-end justify-between gap-4 border-t border-white/10 pt-6">
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-2xs uppercase tracking-[0.16em] text-white/45">{stat.label}</p>
                </div>
                <ShieldCheck className="size-8 text-primary/40" />
              </div>
            </div>
          </aside>

          {/* ----------------------------------------------- the paper half */}
          <div className="relative p-6 sm:p-8 lg:p-10">
            {/* The compact half for a phone: the mark, the door's own title and
                lede, drawn on the light background the form itself uses. */}
            <div className="mb-7 md:hidden">
              <h1 className="h-section">{title}</h1>
              <p className="lede mt-3 max-w-[52ch]">{lede}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}