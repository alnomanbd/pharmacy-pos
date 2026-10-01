'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

/**
 * Light and dark.
 *
 * The two icons cross-fade and rotate against each other rather than swapping,
 * so the control itself is the animation — and the button keeps a fixed 36px
 * box so the header does not reflow when it is pressed. Nothing is rendered
 * until `ready`, because an icon that guesses wrong on the server and corrects
 * itself on the client is a flash of the wrong theme in the corner of the eye.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, ready } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className={cn(
        'relative grid size-9 place-items-center overflow-hidden rounded-full border border-border bg-card/60 text-foreground backdrop-blur transition-all duration-300 hover:border-primary/40 hover:bg-card hover:shadow-glass',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute size-4 transition-all duration-500 ease-spring',
          theme === 'dark' ? 'translate-y-6 rotate-90 opacity-0' : 'translate-y-0 rotate-0 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute size-4 transition-all duration-500 ease-spring',
          theme === 'dark' ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-6 -rotate-90 opacity-0',
        )}
      />
      {!ready && <span className="size-4 rounded-full bg-muted" />}
    </button>
  );
}
