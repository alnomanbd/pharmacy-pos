'use client';

import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The button.
 *
 * Two things here are not in the shadcn default and both are deliberate:
 *
 * - **`shine`**, a light bar that runs across the primary on hover. On a
 *   gradient fill a plain colour change is invisible, and this is the site
 *   that has to feel like hardware.
 * - **`size` `lg` is genuinely 56px**, not 48. This is the primary conversion
 *   action on a page a shop owner opens on a phone at a counter, and 48 is
 *   below the comfortable thumb target for somebody doing this ten hours a day.
 */
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full font-semibold transition-all duration-300 ease-spring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-ramp text-white shadow-glow hover:shadow-lift hover:brightness-[1.06] active:scale-[0.985]',
        solid: 'bg-primary text-primary-foreground shadow-glow hover:brightness-110 active:scale-[0.985]',
        outline:
          'border border-border bg-card/60 text-foreground backdrop-blur hover:border-primary/40 hover:bg-card hover:shadow-glass active:scale-[0.985]',
        ghost: 'text-foreground hover:bg-muted',
        link: 'h-auto rounded-none p-0 text-primary underline-offset-4 hover:underline',
        glass:
          'border border-white/40 bg-white/60 text-foreground backdrop-blur-xl hover:bg-white/85 dark:border-white/12 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]',
        inverse: 'bg-foreground text-background hover:brightness-110 active:scale-[0.985]',
      },
      size: {
        sm: 'h-9 px-4 text-sm [&_svg]:size-4',
        md: 'h-11 px-5 text-sm [&_svg]:size-4',
        lg: 'h-14 px-7 text-base [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-4',
        'icon-lg': 'size-12 [&_svg]:size-5',
      },
      shine: {
        true: '',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', shine: true },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shine = true, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const shines = shine && (variant == null || variant === 'primary' || variant === 'solid');
    /*
     * With `asChild` the Slot merges its props into its one child, so the
     * sheen cannot sit beside `children` in a Fragment — the Slot would hand
     * the button's classes to the Fragment and the link would render bare.
     * `Slottable` marks which child is the real element and lets the sheen
     * ride along inside it.
     */
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), shines && 'group/btn', className)}
        {...props}
      >
        <Slottable>{children}</Slottable>
        {shines && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-white/30 opacity-0 blur-md group-hover/btn:animate-sheen group-hover/btn:opacity-100"
          />
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
